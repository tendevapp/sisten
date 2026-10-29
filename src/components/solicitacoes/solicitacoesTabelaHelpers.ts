/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Funcoes auxiliares puras para a visualizacao em tabela da Central de Solicitacoes.
 */

import { Request, RequestItem, RequestStatus, RequestType } from '../../types';
import { formatDateBR, toDate } from '../../lib/format';

/** Extrai ate duas letras iniciais para o avatar do solicitante. */
export function obterIniciaisNome(nome?: string | null): string {
  if (!nome || !nome.trim()) return '—';
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }
  const primeiro = partes[0][0] || '';
  const ultimo = partes[partes.length - 1][0] || '';
  return (primeiro + ultimo).toUpperCase();
}

/** Formata o tempo decorrido desde a data de abertura ("há 1 dia", "há 22 dias", "hoje"). */
export function formatarTempoRelativoAbertura(dataCriacao?: string | null, dataBase: Date = new Date()): string {
  const d = toDate(dataCriacao);
  if (!d) return '';

  const msPorDia = 24 * 60 * 60 * 1000;
  // Zera hora para comparar dias civis
  const dZero = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const baseZero = new Date(dataBase.getFullYear(), dataBase.getMonth(), dataBase.getDate()).getTime();

  const diffDias = Math.round((baseZero - dZero) / msPorDia);

  if (diffDias <= 0) return 'hoje';
  if (diffDias === 1) return 'há 1 dia';
  return `há ${diffDias} dias`;
}

/**
 * Calcula a data de prazo e a expressao relativa ("em 3 dias", "Vencido").
 * Se a solicitacao tiver prazo_conclusao ou data_necessidade, usa esse valor.
 * Caso contrario, calcula um SLA padrao conforme a criticidade:
 * - 5 (Impeditiva): +4 dias
 * - 4 (Critica): +5 dias
 * - 3 (Alta): +7 dias
 * - 2 (Media): +10 dias
 * - 1 (Baixa): +15 dias
 *
 * Encerrada não vence: o prazo passa a ser comparado com a data em que foi
 * resolvida ("No prazo" / "Com atraso"); cancelada ou rejeitada só mostra a
 * data, sem contagem.
 */
export interface PrazoSolicitacao {
  dataPrazo: Date | null;
  dataPrazoFormatada: string;
  textoRelativo: string;
  estaVencido: boolean;
  urgente: boolean;
  /** Já resolvida/fechada/concluída, cancelada ou rejeitada. */
  encerrada: boolean;
  /** Encerrada depois do prazo. */
  concluidaComAtraso: boolean;
}

const STATUS_CONCLUIDOS: RequestStatus[] = ['resolvido', 'fechado', 'concluida'];
const STATUS_INTERROMPIDOS: RequestStatus[] = ['cancelada', 'rejeitada'];

export function calcularPrazoSolicitacao(
  r: Request,
  dataBase: Date = new Date(),
): PrazoSolicitacao {
  let dtPrazo: Date | null = null;

  if (r.prazo_conclusao) {
    dtPrazo = toDate(r.prazo_conclusao);
  } else if (r.data_necessidade) {
    dtPrazo = toDate(r.data_necessidade);
  } else if (r.created_at) {
    const criacao = toDate(r.created_at);
    if (criacao) {
      const diasSlaPorCriticidade: Record<number, number> = {
        5: 4,
        4: 5,
        3: 7,
        2: 10,
        1: 15,
      };
      const dias = diasSlaPorCriticidade[r.criticality] || 7;
      dtPrazo = new Date(criacao.getTime() + dias * 24 * 60 * 60 * 1000);
    }
  }

  const base = { encerrada: false, concluidaComAtraso: false };

  if (!dtPrazo) {
    return {
      ...base,
      dataPrazo: null,
      dataPrazoFormatada: '—',
      textoRelativo: '',
      estaVencido: false,
      urgente: false,
    };
  }

  const msPorDia = 24 * 60 * 60 * 1000;
  const zerar = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const prazoZero = zerar(dtPrazo);
  const dataPrazoFormatada = formatDateBR(dtPrazo);
  const comum = { dataPrazo: dtPrazo, dataPrazoFormatada, estaVencido: false, urgente: false };

  if (STATUS_INTERROMPIDOS.includes(r.status)) {
    return { ...comum, textoRelativo: '', encerrada: true, concluidaComAtraso: false };
  }

  if (STATUS_CONCLUIDOS.includes(r.status)) {
    const conclusao = toDate(r.resolved_at) || toDate(r.updated_at);
    const atraso = !!conclusao && zerar(conclusao) > prazoZero;
    return {
      ...comum,
      textoRelativo: conclusao ? (atraso ? 'Concluída com atraso' : 'Concluída no prazo') : 'Concluída',
      encerrada: true,
      concluidaComAtraso: atraso,
    };
  }

  const diffDias = Math.round((prazoZero - zerar(dataBase)) / msPorDia);

  if (diffDias < 0) {
    return { ...base, ...comum, textoRelativo: 'Vencido', estaVencido: true, urgente: true };
  }

  if (diffDias === 0) {
    return { ...base, ...comum, textoRelativo: 'Vence hoje', urgente: true };
  }

  if (diffDias === 1) {
    return { ...base, ...comum, textoRelativo: 'em 1 dia', urgente: true };
  }

  return { ...base, ...comum, textoRelativo: `em ${diffDias} dias`, urgente: diffDias <= 3 };
}

/** Classe do texto relativo do prazo: vermelho vencendo, verde/âmbar encerrada. */
export function classePrazo(p: PrazoSolicitacao): string {
  if (p.encerrada) {
    return p.concluidaComAtraso
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';
  }
  return p.urgente || p.estaVencido
    ? 'text-red-500 dark:text-red-400'
    : 'text-slate-400 dark:text-slate-500';
}

/* Ordenação da tabela ----------------------------------------------------- */

export type ColunaOrdenacao =
  | 'numero' | 'tipo' | 'titulo' | 'solicitante' | 'setor'
  | 'abertura' | 'prazo' | 'criticidade' | 'status';

export interface Ordenacao {
  coluna: ColunaOrdenacao;
  direcao: 'asc' | 'desc';
}

/**
 * Próximo estado ao clicar num cabeçalho: crescente → decrescente → volta à
 * ordem da fila (null). Coluna nova começa crescente.
 */
export function proximaOrdenacao(atual: Ordenacao | null, coluna: ColunaOrdenacao): Ordenacao | null {
  if (!atual || atual.coluna !== coluna) return { coluna, direcao: 'asc' };
  return atual.direcao === 'asc' ? { coluna, direcao: 'desc' } : null;
}

/**
 * Ordena pela coluna. `chave` devolve o valor comparável de cada linha para as
 * colunas de texto que dependem da tela (título, setor, status). Vazios vão
 * para o fim nos dois sentidos; empate mantém a ordem de entrada.
 */
export function ordenarSolicitacoes<T>(
  lista: T[],
  ordem: Ordenacao,
  chave: (x: T, coluna: ColunaOrdenacao) => string | number | null,
): T[] {
  const sinal = ordem.direcao === 'asc' ? 1 : -1;
  const valores = lista.map((x, i) => ({ x, i, v: chave(x, ordem.coluna) }));
  valores.sort((a, b) => {
    const va = a.v, vb = b.v;
    const vazioA = va === null || va === '', vazioB = vb === null || vb === '';
    if (vazioA || vazioB) return vazioA === vazioB ? a.i - b.i : vazioA ? 1 : -1;
    const c = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return c !== 0 ? c * sinal : a.i - b.i;
  });
  return valores.map(v => v.x);
}

/** Valor comparável das colunas que só dependem da solicitação. */
export function chaveOrdenacaoBasica(r: Request, coluna: ColunaOrdenacao): string | number | null {
  switch (coluna) {
    case 'numero': return r.number || null;
    case 'tipo': return r.type;
    case 'solicitante': return r.solicitante_name || null;
    case 'abertura': return toDate(r.created_at)?.getTime() ?? null;
    case 'prazo': return calcularPrazoSolicitacao(r).dataPrazo?.getTime() ?? null;
    case 'criticidade': return r.criticality ?? null;
    default: return null;
  }
}

/**
 * Obtem o titulo em destaque e o subtitulo para a linha da tabela.
 * Espelha a hierarquia visual mostrada no design:
 * - Titulo em negrito
 * - Subtitulo descritivo em tom atenuado
 */
export function obterTituloEJustificativa(
  req: Request,
  itens: RequestItem[] = [],
  nomeSetorFn?: (id: string) => string,
): { titulo: string; subtitulo: string } {
  let titulo = req.titulo?.trim();
  let subtitulo = req.justificativa?.trim() || '';

  if (!titulo) {
    if (req.type === 'compra') {
      const itemGenerico = itens.find(it => it.is_generic);
      if (itemGenerico) {
        titulo = 'ITEM GENÉRICO';
        subtitulo = req.justificativa || itemGenerico.description || 'Material urgente para continuidade da...';
      } else if (itens.length > 0) {
        titulo = itens[0].description;
        subtitulo = req.justificativa || (itens.length > 1 ? `+ ${itens.length - 1} item(ns)` : (req.solicitante_name || ''));
      } else if (req.justificativa) {
        const partes = req.justificativa.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
        titulo = partes[0].slice(0, 48);
        subtitulo = partes.slice(1).join(' ') || req.justificativa;
      } else {
        titulo = 'Solicitação de Compra';
        const setorNome = nomeSetorFn ? nomeSetorFn(req.solicitante_sector_id) : '';
        subtitulo = setorNome ? `${req.solicitante_name} · ${setorNome}` : req.solicitante_name;
      }
    } else if (req.type === 'cadastro_sap') {
      if (req.registration_type === 'Fornecedor') {
        titulo = 'Cadastro de fornecedor';
        subtitulo = req.justificativa || 'Inclusão de novo fornecedor no SAP.';
      } else if (req.registration_type === 'Item') {
        titulo = 'Cadastro de material';
        subtitulo = req.justificativa || 'Inclusão de material no catálogo SAP.';
      } else if (req.justificativa?.toLowerCase().includes('centro de custo')) {
        titulo = 'Alteração de centro de custo';
        subtitulo = req.justificativa;
      } else {
        titulo = 'Cadastro SAP';
        subtitulo = req.justificativa || 'Solicitação de cadastro ou atualização SAP.';
      }
    } else {
      // chamado
      if (req.justificativa) {
        const partes = req.justificativa.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
        if (partes.length > 1) {
          titulo = partes[0].slice(0, 45);
          subtitulo = partes.slice(1).join(' ');
        } else if (req.justificativa.length > 40) {
          titulo = req.justificativa.slice(0, 36) + '...';
          subtitulo = req.justificativa;
        } else {
          titulo = req.justificativa;
          const setorNome = nomeSetorFn ? nomeSetorFn(req.solicitante_sector_id) : '';
          subtitulo = setorNome ? `${req.solicitante_name} · ${setorNome}` : req.solicitante_name;
        }
      } else {
        titulo = req.category_id || 'Chamado de Suporte';
        const setorNome = nomeSetorFn ? nomeSetorFn(req.solicitante_sector_id) : '';
        subtitulo = setorNome ? `${req.solicitante_name} · ${setorNome}` : req.solicitante_name;
      }
    }
  }

  return { titulo, subtitulo };
}

/** Mapeamento de estilos para o pill de criticidade */
export function obterEstilosCriticidade(criticidade: number): {
  classes: string;
  rotulo: string;
} {
  switch (criticidade) {
    case 5:
      return {
        rotulo: '5 - Impeditiva',
        classes: 'bg-rose-50 text-rose-600 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80',
      };
    case 4:
      return {
        rotulo: '4 - Crítica',
        classes: 'bg-orange-50 text-orange-600 border border-orange-200/80 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/80',
      };
    case 3:
      return {
        rotulo: '3 - Alta',
        classes: 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80',
      };
    case 2:
      return {
        rotulo: '2 - Média',
        classes: 'bg-sky-50 text-sky-600 border border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/80',
      };
    case 1:
    default:
      return {
        rotulo: '1 - Baixa',
        classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80',
      };
  }
}

/**
 * Mapeamento de estilos para o pill de status.
 *
 * `rmVinculada` só importa para compra aprovada: enquanto ela está na fila do
 * "Abrir RM" sem número de RM de volta do SAP, o pill mostra "Aguardando RM";
 * assim que o almoxarife vincula o número (`linked_rm_number`), vira "RM Aberta".
 */
export function obterEstilosStatus(
  status: RequestStatus,
  tipo: RequestType,
  rmVinculada = false,
  tipoCompra?: string | null,
): {
  classes: string;
  rotulo: string;
} {
  if (tipo === 'compra' && status === 'pendente') {
    return {
      rotulo: 'Aguardando aprovação',
      classes: 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80',
    };
  }

  if (tipo === 'compra' && status === 'aprovada') {
    const ehServico = (tipoCompra || '')
      .trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase() === 'servico';

    if (ehServico) {
      return {
        rotulo: 'Aprovada',
        classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80',
      };
    }

    return rmVinculada
      ? {
          rotulo: 'RM Aberta',
          classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80',
        }
      : {
          rotulo: 'Aguardando RM',
          classes: 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80',
        };
  }

  switch (status) {
    case 'em_cotacao':
      return {
        rotulo: 'Em cotação',
        classes: 'bg-sky-50 text-sky-600 border border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/80',
      };
    case 'pedido_emitido':
      return {
        rotulo: 'Pedido emitido',
        classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80',
      };
    case 'concluida':
      return {
        rotulo: 'Entregue',
        classes: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
    case 'aberto':
      return {
        rotulo: 'Aberta',
        classes: 'bg-sky-50 text-sky-600 border border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/80',
      };
    case 'em_atendimento':
    case 'em_revisao':
    case 'aguardando_solicitante':
      return {
        rotulo: 'Em análise',
        classes: 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80',
      };
    case 'aprovada':
    case 'resolvido':
      return {
        rotulo: 'Resolvida',
        classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80',
      };
    case 'fechado':
      return {
        rotulo: 'Fechada',
        classes: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
    case 'rejeitada':
    case 'cancelada':
      return {
        rotulo: status === 'cancelada' ? 'Cancelada' : 'Rejeitada',
        classes: 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80',
      };
    case 'pendente':
      return {
        rotulo: 'Aberta',
        classes: 'bg-sky-50 text-sky-600 border border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/80',
      };
    default:
      return {
        rotulo: status,
        classes: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
  }
}
