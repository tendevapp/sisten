/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Lógica de negócio pura (sem React) da página Rastreio Compras.
// Mantida isolada da UI para facilitar leitura, reuso e testes futuros.

import { isSameDay, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { EnrichedSAPRecord, GrupoMercadoria, RastreioPrioridade } from '../types';
import { toDate, formatDateBR, formatDateTimeBR, formatBRL, yearOf } from './format';

// Re-exportadas para quem já importa daqui (RastreioCompras, RastreioTable,
// RastreioDetailModal): a formatação em si vive em `lib/format.ts`, fonte
// única — aqui só ficam a lógica de negócio própria de rastreio (linhas,
// filtros, status de entrega).
export { formatDateBR, formatDateTimeBR, formatBRL, yearOf };

// Escala de criticidade/prioridade (1-5), mesma usada em Nova Solicitação
// (canal de compra), reaproveitada aqui para o pedido de priorização feito
// pelo usuário direto no item, na página Rastreio Compras.
export interface PriorityLevelMeta {
  level: number;
  label: string;
  dot: string;
  badge: string;
  /** Cor hexadecimal correspondente, para uso em contextos sem Tailwind (ex.: <option> de <select>). */
  hex: string;
}

export const PRIORITY_LEVELS: PriorityLevelMeta[] = [
  { level: 1, label: 'Posso aguardar. Demanda planejada, sem pressão de prazo.', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600', hex: '#94a3b8' },
  { level: 2, label: 'Tem prazo, mas há fôlego. Preciso em 2–4 semanas.', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', hex: '#10b981' },
  { level: 3, label: 'Começa a apertar. Preciso em 1–2 semanas.', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30', hex: '#f59e0b' },
  { level: 4, label: 'Situação crítica. Preciso em menos de 7 dias.', dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30', hex: '#f97316' },
  { level: 5, label: 'Produção parada ou risco de segurança. Preciso imediatamente.', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30', hex: '#ef4444' },
];

export const priorityMeta = (level: number): PriorityLevelMeta =>
  PRIORITY_LEVELS.find(p => p.level === level) || PRIORITY_LEVELS[0];

// Nível de prioridade atual por `ri`: o pedido mais recente (histórico
// preservado — o comprador pode ver reforços/escaladas ao longo do tempo).
/**
 * Índice código do grupo de mercadoria → denominação 2, para exibir a descrição
 * legível ao lado do item.
 *
 * Descarta a linha de cabeçalho que a tabela guarda como dado
 * (`codigo = 'Grp.merc.'`) e os códigos sem denominação 2 — assim quem consome
 * o mapa só precisa testar presença, sem repetir esse saneamento.
 */
export function grupoMercadoriaDesc(grupos: GrupoMercadoria[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const g of grupos) {
    const desc = (g.denominacao2 || '').trim();
    if (!g.codigo || !desc || g.codigo === 'Grp.merc.') continue;
    mapa.set(g.codigo, desc);
  }
  return mapa;
}

export function latestPriorityByRi(prioridades: RastreioPrioridade[]): Map<string, RastreioPrioridade> {
  const map = new Map<string, RastreioPrioridade>();
  prioridades.forEach(p => {
    const atual = map.get(p.ri);
    if (!atual || new Date(p.created_at).getTime() > new Date(atual.created_at).getTime()) {
      map.set(p.ri, p);
    }
  });
  return map;
}

// Uma linha de rastreio = uma requisição/item enriquecido, já mapeado para os
// campos que a tela exibe. Inclui preço do pedido (só em itens já com PO).
export interface RastreioRow {
  ri: string;
  rm: string;          // requisicao_de_compra
  item: string;        // item_reqc
  po: string;          // documento_compra / pedido
  material: string;    // material_code
  descricao: string;   // texto_breve
  fornecedor: string;  // fornecedor_name
  setor: string;       // area_solicitante / requisitante_name
  qtd?: number;        // qtd_requisicao
  unidade: string;     // unidade_medida
  precoUnitario?: number; // preço líquido unitário do pedido (só itens com PO)
  valorTotal?: number;    // valor líquido da linha do pedido em BRL (só itens com PO)
  dataCriacao: string;   // data_solicitacao
  dataPo: string;        // data_pedido
  dataPrevista: string;  // data_entrega_confirmada (promessa confirmada na Central de Compras)
  dataEntrega: string;   // data_migo
  status: string;        // status exibido (Entregue quando há MIGO; senão item_status)
  statusReq: string;     // status_requisicao ('Sem PO' | 'Processado')
  observacoes: string;   // obs_comprador
  grupoComprador: string; // grupo_comprador (roteamento de notificações)
}

export type DeliveryStatus = 'entregue' | 'no_prazo' | 'atrasado' | 'sem_data';

export type DeliveryScope = 'todos' | 'aberto'; // 'aberto' = ainda sem entrega (MIGO)

export type TipoItemFilter = 'todos' | 'consumo' | 'projeto';

/**
 * Verifica se uma RM (Requisição de Compra) pertence a um serviço
 * (RMs que começam com 17, ignorando zeros à esquerda).
 */
export function isServicoItem(rmCode: string): boolean {
  if (!rmCode || rmCode === '—') return false;
  const clean = rmCode.trim().replace(/^0+/, '');
  return clean.startsWith('17') || rmCode.trim().startsWith('17');
}

/**
 * Verifica se um código de material pertence a item de projeto
 * (códigos que começam com 100000, ignorando zeros à esquerda).
 */
export function isProjetoItem(materialCode: string): boolean {
  if (!materialCode || materialCode === '—') return false;
  const clean = materialCode.trim().replace(/^0+/, '');
  return clean.startsWith('100000') || materialCode.trim().startsWith('100000');
}

export type RastreioDateField = 'rm' | 'po' | 'prev' | 'entrega';

// Campo de data da linha correspondente a cada filtro de intervalo.
const DATE_FIELD_MAP: Record<RastreioDateField, keyof RastreioRow> = {
  rm: 'dataCriacao',
  po: 'dataPo',
  prev: 'dataPrevista',
  entrega: 'dataEntrega',
};

export interface RastreioFilters {
  query: string;
  status: string; // 'Todos' ou um item_status
  setor: string;  // 'Todos' ou um setor
  ano: string;    // 'Todos' ou um ano (YYYY)
  scope: DeliveryScope;
  tipo?: TipoItemFilter;
  // Intervalos de data (ISO YYYY-MM-DD) por campo. `from`/`to` vazios são
  // ignorados; com um intervalo ativo, linhas sem data naquele campo saem.
  dateRanges?: Partial<Record<RastreioDateField, { from?: string; to?: string }>>;
}

const EMPTY = '—';

// Normaliza um valor textual para exibição, tratando nulos/vazios/placeholders.
const txt = (v: any): string => {
  const s = String(v ?? '').trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s === '0') return EMPTY;
  return s;
};

export const hasValue = (v?: string): boolean => !!v && v !== EMPTY;

// Converte uma string de data em Date, ou null se inválida/ausente. Usa o
// parser compartilhado de `lib/format.ts` (evita o bug de fuso horário que
// `new Date('AAAA-MM-DD')` sozinho teria — ver comentário lá).
export const parseDate = (d?: string): Date | null => {
  if (!hasValue(d)) return null;
  return toDate(d);
};

// Mapeia os registros enriquecidos do SAP para linhas da tela de rastreio,
// ignorando RMs de serviços (que começam com 17).
export function buildRastreioRows(records: EnrichedSAPRecord[]): RastreioRow[] {
  return records
    .filter(r => {
      const rm = txt(r.requisicao_de_compra) !== EMPTY ? txt(r.requisicao_de_compra) : txt(r.ri);
      return !isServicoItem(rm);
    })
    .map(r => {
      const raw = r as any;
      return {
        ri: txt(r.ri) === EMPTY ? `${r.requisicao_de_compra}-${r.item_reqc}` : r.ri,
        rm: txt(r.requisicao_de_compra),
        item: txt(r.item_reqc),
        po: txt(r.documento_compra),
        material: txt(r.material_code),
        descricao: txt(r.texto_breve),
        fornecedor: txt(r.fornecedor_name),
        setor: txt(r.area_solicitante) !== EMPTY ? txt(r.area_solicitante) : txt(r.requisitante_name),
        qtd: typeof r.qtd_requisicao === 'number' ? r.qtd_requisicao : undefined,
        unidade: txt(r.unidade_medida),
        precoUnitario: typeof r.preco_unitario === 'number' ? r.preco_unitario : undefined,
        valorTotal: typeof r.valor_total === 'number' ? r.valor_total : undefined,
        dataCriacao: txt(r.data_solicitacao) !== EMPTY ? txt(r.data_solicitacao) : txt(raw.data_solicitacao),
        dataPo: txt(r.data_pedido),
        // Data prevista = a promessa de entrega CONFIRMADA pelo comprador na
        // Central de Compras (data_entrega_confirmada). Enquanto ele não clica em
        // "Confirmar data", o valor de trabalho (data_entrega_prevista, muitas
        // vezes só a estimativa da remessa do PO) NÃO aparece aqui. Também não
        // usa data_entrega_sap como fallback: é a remessa do SAP, não a promessa.
        dataPrevista: txt(r.data_entrega_confirmada),
        dataEntrega: txt(r.data_migo),
        // Regra de negócio: se há data de entrega (MIGO), o status é "Entregue",
        // independentemente do item_status registrado.
        status: hasValue(txt(r.data_migo))
          ? 'Entregue'
          : (txt(r.item_status) === EMPTY ? 'Sem status' : txt(r.item_status)),
        statusReq: txt(r.status_requisicao),
        observacoes: txt(r.obs_comprador),
        grupoComprador: txt(r.grupo_comprador) === EMPTY ? '' : txt(r.grupo_comprador),
      };
    });
}

// Deriva o status de prazo de entrega de uma linha, para colorir o cronograma.
// `hoje` é injetado para manter a função pura e testável.
export function deriveDeliveryStatus(row: RastreioRow, hoje: Date): DeliveryStatus {
  if (hasValue(row.dataEntrega)) return 'entregue';
  const prevista = parseDate(row.dataPrevista);
  if (!prevista) return 'sem_data';
  // Compara por dia (ignora horas): atrasado só se a data prevista já passou.
  const hojeDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const prevDia = new Date(prevista.getFullYear(), prevista.getMonth(), prevista.getDate());
  return prevDia < hojeDia ? 'atrasado' : 'no_prazo';
}

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; dot: string; badge: string }> = {
  entregue:  { label: 'Entregue',        dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30' },
  no_prazo:  { label: 'No prazo',        dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30' },
  atrasado:  { label: 'Atrasado',        dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30' },
  sem_data:  { label: 'Sem data',        dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600' },
};

// Filtra as linhas por busca textual parcial + filtros combináveis.
export function filterRegistros(rows: RastreioRow[], f: RastreioFilters): RastreioRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(r => {
    if (f.scope === 'aberto' && hasValue(r.dataEntrega)) return false;
    if (f.status !== 'Todos' && r.status !== f.status) return false;
    if (f.setor !== 'Todos' && r.setor !== f.setor) return false;
    if (f.ano !== 'Todos' && yearOf(r.dataCriacao) !== f.ano) return false;
    if (f.tipo && f.tipo !== 'todos') {
      const eProjeto = isProjetoItem(r.material);
      if (f.tipo === 'projeto' && !eProjeto) return false;
      if (f.tipo === 'consumo' && eProjeto) return false;
    }
    if (f.dateRanges) {
      for (const key of Object.keys(f.dateRanges) as RastreioDateField[]) {
        const range = f.dateRanges[key];
        if (!range || (!range.from && !range.to)) continue;
        const d = parseDate(r[DATE_FIELD_MAP[key]] as string);
        if (!d) return false; // filtro de data ativo exclui linhas sem essa data
        if (range.from) {
          const from = parseDate(range.from);
          if (from && d.getTime() < from.getTime()) return false;
        }
        if (range.to) {
          const to = parseDate(range.to);
          if (to) {
            to.setHours(23, 59, 59, 999); // inclui o dia inteiro do "até"
            if (d.getTime() > to.getTime()) return false;
          }
        }
      }
    }
    if (q) {
      const hit =
        r.rm.toLowerCase().includes(q) ||
        r.po.toLowerCase().includes(q) ||
        r.descricao.toLowerCase().includes(q) ||
        r.material.toLowerCase().includes(q) ||
        r.fornecedor.toLowerCase().includes(q) ||
        r.setor.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

// Compara dois números de PO (ordem numérica, tolerando prefixos/zeros à
// esquerda). Item ainda sem PO vai sempre para o fim — a conferência física
// gira em torno do pedido, então quem não tem pedido não disputa a ordem.
export function comparePo(a: string, b: string): number {
  const va = hasValue(a) ? a.trim() : '';
  const vb = hasValue(b) ? b.trim() : '';
  if (!va && !vb) return 0;
  if (!va) return 1;
  if (!vb) return -1;
  return va.localeCompare(vb, 'pt-BR', { numeric: true });
}

// Ordenação padrão: registros sem entrega (sem MIGO) primeiro — são os que
// precisam de acompanhamento —, seguidos dos já entregues; em cada grupo,
// ordena por PO (itens do mesmo pedido ficam juntos, que é como a chegada
// física é conferida) e, dentro do PO, por RM/item.
export function defaultSort(rows: RastreioRow[]): RastreioRow[] {
  return [...rows].sort((a, b) => {
    const aEntregue = hasValue(a.dataEntrega);
    const bEntregue = hasValue(b.dataEntrega);
    if (aEntregue !== bEntregue) return aEntregue ? 1 : -1;
    const porPo = comparePo(a.po, b.po);
    if (porPo !== 0) return porPo;
    return `${a.rm} ${a.item}`.localeCompare(`${b.rm} ${b.item}`, 'pt-BR', { numeric: true });
  });
}

// Bloco de itens de um mesmo pedido, usado no cronograma para desenhar o
// grupo e oferecer a confirmação de chegada do PO inteiro de uma vez.
export interface PoGroup {
  po: string;           // EMPTY ('—') quando o item ainda não tem pedido
  fornecedor: string;   // fornecedor do pedido (primeiro item que o informa)
  rows: RastreioRow[];
}

// Agrupa linhas por PO, na ordem do número do pedido; itens sem PO caem em um
// último grupo com `po === EMPTY`. Dentro do grupo, ordena por RM/item.
export function groupRowsByPo(rows: RastreioRow[]): PoGroup[] {
  const mapa = new Map<string, RastreioRow[]>();
  rows.forEach(r => {
    const chave = hasValue(r.po) ? r.po.trim() : EMPTY;
    const lista = mapa.get(chave);
    if (lista) lista.push(r); else mapa.set(chave, [r]);
  });
  return Array.from(mapa.entries())
    .map(([po, lista]) => ({
      po,
      fornecedor: lista.find(r => hasValue(r.fornecedor))?.fornecedor || EMPTY,
      rows: [...lista].sort((a, b) =>
        `${a.rm} ${a.item}`.localeCompare(`${b.rm} ${b.item}`, 'pt-BR', { numeric: true })
      ),
    }))
    .sort((a, b) => comparePo(a.po, b.po));
}

// Item elegível para marcar chegada física no almoxarifado: PO emitida,
// ainda sem MIGO (fluxo: chega no almoxarifado -> dá entrada -> envia NF
// para lançamento -> MIGO aparece no SAP). Mesma regra usada no filtro
// "Sem MIGO" da Central de Compras, reaproveitada na Tabela e no Cronograma
// de Rastreio Compras.
export function isAlmoxarifadoCandidate(r: RastreioRow): boolean {
  return hasValue(r.po) && !hasValue(r.dataEntrega);
}

// Itens com PO emitida mas ainda sem MIGO — candidatos a chegada física no
// almoxarifado.
export function itensSemMigo(rows: RastreioRow[]): RastreioRow[] {
  return rows.filter(isAlmoxarifadoCandidate);
}

// Opções de filtro derivadas dos dados carregados.
export function statusOptions(rows: RastreioRow[]): string[] {
  return Array.from(new Set(rows.map(r => r.status).filter(s => hasValue(s)))).sort();
}
export function setorOptions(rows: RastreioRow[]): string[] {
  return Array.from(new Set(rows.map(r => r.setor).filter(s => hasValue(s)))).sort();
}
export function anoOptions(rows: RastreioRow[]): string[] {
  return Array.from(new Set(rows.map(r => yearOf(r.dataCriacao)).filter(Boolean)))
    .sort((a, b) => Number(b) - Number(a));
}

// --- Cronograma: agrupamento por data prevista de entrega -------------------

// Só entram no cronograma linhas com data prevista válida e que ainda não
// foram entregues (sem MIGO) — o cronograma é uma agenda do que falta
// receber, não um histórico do que já chegou.
export function schedulableRows(rows: RastreioRow[]): RastreioRow[] {
  return rows.filter(r => parseDate(r.dataPrevista) !== null && !hasValue(r.dataEntrega));
}

// Entregas previstas para um dia específico.
export function entriesForDay(rows: RastreioRow[], day: Date): RastreioRow[] {
  return rows.filter(r => {
    const p = parseDate(r.dataPrevista);
    return p !== null && isSameDay(p, day);
  });
}

// Dias (segunda→domingo) da semana que contém `refDate`.
export function weekDays(refDate: Date): Date[] {
  const start = startOfWeek(refDate, { weekStartsOn: 1 });
  const end = endOfWeek(refDate, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

// Matriz de semanas (cada uma com 7 dias) cobrindo o mês de `refDate`,
// completando com dias das semanas vizinhas para formar uma grade retangular.
export function monthMatrix(refDate: Date): Date[][] {
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const last = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(last, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}
