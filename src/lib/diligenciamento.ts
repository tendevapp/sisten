/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel de Diligenciamento (Suprimentos) — regras de negócio.
 *
 * Fonte dos pedidos: `localDb.getEnrichedSAPRequisicoes()`, o mesmo dado já
 * usado por Rastreio Compras e pela chegada no almoxarifado — junta
 * requisição (ME5A) e pedido (ZL0132/sap_zl0132_po) por RI, já resolvendo
 * eliminação de linha (eflag_e='L') e o PO mais recente por RI. Não
 * recompomos essa junção aqui: reaproveitar evita duplicar uma lógica cheia
 * de casos de borda (RM de serviço, PO vindo do ME5A, offline/semente).
 *
 * O que é digitado pelo comprador (transportadora, faturamento, previsão
 * manual) fica em `sup_diligenciamento_itens`, por item (`ri`) — o envio pode
 * ser separado mesmo dentro de um único pedido. O prazo de trânsito por
 * origem fica em `sup_prazos_transporte`, chaveado por (UF, transportadora),
 * com cascata para o padrão da UF e depois o padrão global.
 *
 * Decisão de produto: NÃO usamos `sup_fretes` (a tabela do Estimador de
 * Frete) como fonte deste prazo — o diligenciamento precisa de um prazo que
 * o comprador ajuste sozinho, sem depender do cadastro de frete. Ver
 * `src/data/diretrizes.ts`.
 *
 * A tela agrupa por PO; este arquivo faz a agregação e todos os cálculos —
 * a view só desenha e delega leitura/escrita a `diligenciamentoApi.ts`.
 */

import { AlmoxarifadoChegada, CidadeForn, DiligenciamentoItem, EnrichedSAPRecord, PrazoTransporte } from '../types';
import { isServicoItem } from './rastreio';

/* Normalização de transportadora -------------------------------------------- */

/** Chave de comparação: sem espaços duplicados, sem diferença de caixa, "" para vazio. */
export function normalizarChaveTransportadora(nome: string | null | undefined): string {
  return (nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Lista de transportadoras já usadas, para o autocompletar do campo — sem
 * tela de cadastro, a lista nasce do que foi digitado. Dedup por chave
 * normalizada; mantém a grafia mais recente entre as digitadas.
 */
export function transportadorasConhecidas(itens: DiligenciamentoItem[]): string[] {
  const porChave = new Map<string, { nome: string; em: string }>();
  for (const it of itens) {
    const nome = (it.transportadora || '').trim();
    if (!nome) continue;
    const chave = normalizarChaveTransportadora(nome);
    const em = it.updated_at || it.created_at || '';
    const atual = porChave.get(chave);
    if (!atual || em > atual.em) porChave.set(chave, { nome, em });
  }
  return Array.from(porChave.values())
    .map(v => v.nome)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/* UF do fornecedor ----------------------------------------------------------- */

const UF_VALIDA = /^[A-Za-z]{2}$/;

export function indexarCidadesPorCodigo(cidades: CidadeForn[]): Map<string, CidadeForn> {
  return new Map(cidades.filter(c => c.forn_codigo).map(c => [c.forn_codigo, c]));
}

/**
 * UF do fornecedor: prioriza o cadastro validado (`cidadeforn.estado_uf`,
 * populado pela própria importação da ZL0132); cai para a UF bruta do
 * próprio pedido (`regiao_uf`) quando o fornecedor ainda não tem linha em
 * `cidadeforn` — mesma prioridade já usada em `lib/historicoAnalytics.ts`.
 */
export function ufDoFornecedor(
  fornecedorCode: string | undefined,
  regiaoUfBruta: string | undefined,
  cidadesPorCodigo: Map<string, CidadeForn>,
): string {
  const doCadastro = fornecedorCode ? cidadesPorCodigo.get(fornecedorCode)?.estado_uf : undefined;
  if (doCadastro && UF_VALIDA.test(doCadastro)) return doCadastro.toUpperCase();
  if (regiaoUfBruta && UF_VALIDA.test(regiaoUfBruta)) return regiaoUfBruta.toUpperCase();
  return '';
}

/* Prazo de trânsito (cascata) ------------------------------------------------ */

/**
 * Dias corridos de trânsito para (UF, transportadora), em cascata do mais
 * específico ao mais genérico:
 *   1) UF + transportadora exatos;
 *   2) UF com o padrão da UF (transportadora "");
 *   3) padrão global ("", "").
 * `null` quando nada casa — nem o padrão global está cadastrado.
 */
export function resolverPrazoDias(
  uf: string,
  transportadora: string,
  prazos: PrazoTransporte[],
): number | null {
  const ufN = (uf || '').toUpperCase();
  const transpN = normalizarChaveTransportadora(transportadora);

  const porChave = new Map(
    prazos.map(p => [`${p.uf.toUpperCase()}|${normalizarChaveTransportadora(p.transportadora)}`, p.dias_corridos]),
  );

  const exato = porChave.get(`${ufN}|${transpN}`);
  if (exato !== undefined) return exato;

  const padraoDaUf = porChave.get(`${ufN}|`);
  if (padraoDaUf !== undefined) return padraoDaUf;

  const global = porChave.get('|');
  return global !== undefined ? global : null;
}

/* Datas ----------------------------------------------------------------------- */

const DATA_ISO = /^\d{4}-\d{2}-\d{2}/;

export const dataValida = (v?: string | null): v is string => !!v && DATA_ISO.test(v);

/**
 * Soma dias corridos a uma data `YYYY-MM-DD` usando só os campos locais do
 * `Date` (getFullYear/getMonth/getDate) — nunca passa por `toISOString()` ao
 * formatar nem por `new Date("AAAA-MM-DD")` direto ao ler, os dois jeitos de
 * um dia recuar/avançar por fuso horário que `lib/format.ts` (`toDate`)
 * documenta.
 */
export function somarDiasCorridos(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.slice(0, 10).split('-').map(Number);
  const d = new Date(ano, mes - 1, dia + dias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Compara duas datas `YYYY-MM-DD` — comparação de string basta no formato ISO. */
export const antesDeHoje = (dataISO: string, hojeISO: string): boolean => dataISO < hojeISO;

/* Item e pedido agregados ------------------------------------------------------ */

export type EstadoChegada = 'pendente' | 'parcial' | 'chegou';

export interface ItemDiligenciamento {
  /** Identidade da linha: item de RM + pedido. Um item comprado em dois POs
   *  aparece duas vezes na fila, uma por pedido. */
  riPo: string;
  ri: string;
  docCompra: string;
  material: string;
  descricao: string;
  quantidade?: number;
  unidade: string;
  valor?: number;
  transportadora: string;
  faturamentoTransportadora?: string;
  previsaoManual?: string;
  /** `data de remessa + prazo`; null quando falta remessa ou prazo cadastrado. */
  previsaoCalculada: string | null;
  /** `previsaoManual`, senão `previsaoCalculada` — o valor que a tela mostra. */
  previsaoEfetiva: string | null;
  /** Por que não há `previsaoCalculada` — a tela mostra o motivo, nunca inventa uma data. */
  motivoSemPrevisao?: 'sem_remessa' | 'sem_prazo';
  dataRemessa?: string;
  chegou: boolean;
  dataChegada?: string;
}

export interface PedidoDiligenciamento {
  docCompra: string;
  fornecedorNome: string;
  fornecedorCode: string;
  uf: string;
  dataPedido?: string;
  valorTotal: number;
  /** Menor remessa entre os itens em aberto do PO — a próxima a chegar. */
  dataRemessa?: string;
  /** Menor previsão efetiva entre os itens — usada para ordenar a fila. */
  previsaoMaisProxima: string | null;
  estadoChegada: EstadoChegada;
  itens: ItemDiligenciamento[];
}

/** Campos de cabeçalho de PO carregados junto no item, para `agruparPorPo` não reabrir o registro original. */
interface ItemComPo extends ItemDiligenciamento {
  __fornecedorNome: string;
  __fornecedorCode: string;
  __uf: string;
  __dataPedido?: string;
}

/**
 * Monta os itens abertos de diligenciamento a partir do dado já enriquecido
 * do SAP (requisição + PO). Entram só os que têm PO emitida, ainda sem MIGO
 * (não chegou pelo SAP) e não são RM de serviço (chamado, não carga física —
 * transportadora não se aplica).
 */
export function montarItens(
  registros: EnrichedSAPRecord[],
  // Diligenciamento e chegada são do PEDIDO: indexados por `ri_po`, não por `ri`.
  diligenciamentoPorRi: Map<string, DiligenciamentoItem>,
  chegadasPorRi: Map<string, AlmoxarifadoChegada>,
  cidadesPorCodigo: Map<string, CidadeForn>,
  regiaoUfBrutaPorRi: Map<string, string>,
  prazos: PrazoTransporte[],
): ItemDiligenciamento[] {
  return registros
    .filter(r => !!r.documento_compra && !dataValida(r.data_migo))
    .filter(r => !isServicoItem(r.requisicao_de_compra || r.ri))
    .map(r => {
      const dilig = diligenciamentoPorRi.get(r.ri_po);
      const transportadora = dilig?.transportadora || '';
      const uf = ufDoFornecedor(r.fornecedor_code, regiaoUfBrutaPorRi.get(r.ri), cidadesPorCodigo);
      const prazoDias = resolverPrazoDias(uf, transportadora, prazos);
      const remessa = dataValida(r.data_entrega_sap) ? r.data_entrega_sap : undefined;

      let previsaoCalculada: string | null = null;
      let motivoSemPrevisao: 'sem_remessa' | 'sem_prazo' | undefined;
      if (!remessa) motivoSemPrevisao = 'sem_remessa';
      else if (prazoDias === null) motivoSemPrevisao = 'sem_prazo';
      else previsaoCalculada = somarDiasCorridos(remessa, prazoDias);

      const previsaoManual = dataValida(dilig?.previsao_manual) ? (dilig!.previsao_manual as string) : undefined;
      const chegada = chegadasPorRi.get(r.ri_po);

      const item: ItemComPo = {
        riPo: r.ri_po,
        ri: r.ri,
        docCompra: r.documento_compra as string,
        material: r.material_code,
        descricao: r.texto_breve,
        // Quantidade DESTE pedido: a RM pode ter sido dividida em vários.
        quantidade: r.qtd_po ?? r.qtd_requisicao,
        unidade: r.unidade_medida,
        valor: r.valor_total,
        transportadora,
        faturamentoTransportadora: dataValida(dilig?.data_faturamento_transportadora)
          ? (dilig!.data_faturamento_transportadora as string)
          : undefined,
        previsaoManual,
        previsaoCalculada,
        previsaoEfetiva: previsaoManual || previsaoCalculada,
        motivoSemPrevisao: previsaoManual ? undefined : motivoSemPrevisao,
        dataRemessa: remessa,
        chegou: !!chegada,
        dataChegada: chegada?.data_chegada,
        __fornecedorNome: r.fornecedor_name || '',
        __fornecedorCode: r.fornecedor_code || '',
        __uf: uf,
        __dataPedido: dataValida(r.data_pedido) ? r.data_pedido : undefined,
      };

      return item;
    });
}

/** Agrupa os itens por PO e agrega os campos de cabeçalho — remessa e previsão usam a mais próxima. */
export function agruparPorPo(itens: ItemDiligenciamento[]): PedidoDiligenciamento[] {
  const porDoc = new Map<string, ItemComPo[]>();
  for (const it of itens as ItemComPo[]) {
    const lista = porDoc.get(it.docCompra) || [];
    lista.push(it);
    porDoc.set(it.docCompra, lista);
  }

  return Array.from(porDoc.entries()).map(([docCompra, itensDoPo]) => {
    const primeiro = itensDoPo[0];
    const valorTotal = itensDoPo.reduce((soma, it) => soma + (it.valor || 0), 0);

    const remessas = itensDoPo.map(it => it.dataRemessa).filter(dataValida);
    const dataRemessa = remessas.length > 0 ? [...remessas].sort()[0] : undefined;

    const previsoes = itensDoPo.map(it => it.previsaoEfetiva).filter(dataValida);
    const previsaoMaisProxima = previsoes.length > 0 ? [...previsoes].sort()[0] : null;

    const chegados = itensDoPo.filter(it => it.chegou).length;
    const estadoChegada: EstadoChegada =
      chegados === 0 ? 'pendente' : chegados === itensDoPo.length ? 'chegou' : 'parcial';

    return {
      docCompra,
      fornecedorNome: primeiro.__fornecedorNome,
      fornecedorCode: primeiro.__fornecedorCode,
      uf: primeiro.__uf,
      dataPedido: primeiro.__dataPedido,
      valorTotal,
      dataRemessa,
      previsaoMaisProxima,
      estadoChegada,
      itens: itensDoPo,
    };
  });
}

/* Filtros e ordenação ---------------------------------------------------------- */

export interface FiltrosDiligenciamento {
  busca: string;
  status: 'todos' | EstadoChegada;
  transportadora: string; // '' = todas
  uf: string; // '' = todas
  remessaDe?: string;
  remessaAte?: string;
}

export function filtrarPedidos(pedidos: PedidoDiligenciamento[], f: FiltrosDiligenciamento): PedidoDiligenciamento[] {
  const q = f.busca.trim().toLowerCase();

  return pedidos.filter(p => {
    if (f.status !== 'todos' && p.estadoChegada !== f.status) return false;
    if (f.uf && p.uf !== f.uf) return false;

    if (f.transportadora) {
      const chave = normalizarChaveTransportadora(f.transportadora);
      if (!p.itens.some(it => normalizarChaveTransportadora(it.transportadora) === chave)) return false;
    }

    if (f.remessaDe && (!p.dataRemessa || p.dataRemessa < f.remessaDe)) return false;
    if (f.remessaAte && (!p.dataRemessa || p.dataRemessa > f.remessaAte)) return false;

    if (q) {
      const casaCabecalho = p.docCompra.toLowerCase().includes(q) || p.fornecedorNome.toLowerCase().includes(q);
      const casaItem = p.itens.some(
        it => it.material.toLowerCase().includes(q) || it.descricao.toLowerCase().includes(q),
      );
      if (!casaCabecalho && !casaItem) return false;
    }

    return true;
  });
}

/** Quem chega primeiro aparece primeiro; sem previsão vai para o fim. */
export function ordenarPedidos(pedidos: PedidoDiligenciamento[]): PedidoDiligenciamento[] {
  return [...pedidos].sort((a, b) => {
    if (a.previsaoMaisProxima && b.previsaoMaisProxima) return a.previsaoMaisProxima < b.previsaoMaisProxima ? -1 : 1;
    if (a.previsaoMaisProxima) return -1;
    if (b.previsaoMaisProxima) return 1;
    return a.docCompra.localeCompare(b.docCompra);
  });
}

/** Pedido com previsão vencida e ainda sem chegada — para destacar na lista. */
export const pedidoVencido = (p: PedidoDiligenciamento, hojeISO: string): boolean =>
  p.estadoChegada !== 'chegou' && !!p.previsaoMaisProxima && antesDeHoje(p.previsaoMaisProxima, hojeISO);

export const ufsDisponiveis = (pedidos: PedidoDiligenciamento[]): string[] =>
  Array.from(new Set(pedidos.map(p => p.uf).filter(Boolean))).sort();
