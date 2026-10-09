/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Produção > Controle de Entrega > Visão WIP (chão de fábrica)
 *
 * Distribui os tramos em processo pelas zonas físicas da planta (Montagem,
 * Acabamento/Pintura/Jato, Internos, SAW2/SAW3/Marco Porta, Corte,
 * Calandra/SAW1). Regras puras, sem React nem Supabase.
 *
 * Fontes, em ordem de precedência:
 * 1. Controle de Entrega: tramo `expedido` ou `patio` já saiu do WIP.
 * 2. Apontamentos (`prod_apt_operacoes`): o processo mais avançado já
 *    apontado para o código do tramo diz onde ele está agora.
 * 3. Controle de Entrega (categoria da etapa): usado quando o tramo ainda
 *    não tem apontamento, ou quando a entrada na etapa (`data_entrada_etapa`,
 *    gravada ao mover o tramo no mapa) é mais recente que o último apontamento.
 */

import { avaliarCriticidadeEspera, type NivelCriticidadeEspera, type TramoEntrega } from './producaoEntrega';
import { TODOS_PROCESSOS } from './producaoTorres';

export type ZonaWipId =
  | 'montagem'
  | 'acabamento'
  | 'internos'
  | 'saw'
  | 'corte'
  | 'calandra_saw1';

export interface ConfiguracaoZonaWip {
  id: ZonaWipId;
  rotulo: string;
  descricao: string;
}

export const ZONAS_WIP: Record<ZonaWipId, ConfiguracaoZonaWip> = {
  montagem: { id: 'montagem', rotulo: 'Montagem', descricao: 'Montagem mecânica final do tramo' },
  acabamento: { id: 'acabamento', rotulo: 'Acabamento | Pintura | Jato', descricao: 'Tratamento de superfície' },
  internos: { id: 'internos', rotulo: 'Internos', descricao: 'Internos soldáveis e UT circunferencial' },
  saw: { id: 'saw', rotulo: 'SAW2 | SAW3 | Marco Porta', descricao: 'Solda circunferencial e marco da porta' },
  corte: { id: 'corte', rotulo: 'Corte', descricao: 'Corte plasma de chapas' },
  calandra_saw1: { id: 'calandra_saw1', rotulo: 'Calandra | SAW1', descricao: 'Conformação e solda longitudinal da virola' },
};

export const ORDEM_ZONAS_WIP: ZonaWipId[] = ['montagem', 'acabamento', 'internos', 'saw', 'corte', 'calandra_saw1'];

/**
 * Onde o tramo está depois de concluído o processo apontado.
 * `null` = o processo tira o tramo do WIP (Montagem Final libera para o pátio).
 */
const ZONA_APOS_PROCESSO: Record<string, ZonaWipId | null> = {
  corte: 'corte',
  pre_jato: 'corte',
  chanfro: 'corte',
  calandra: 'calandra_saw1',
  saw_1: 'calandra_saw1',
  recalandra_respaldo: 'calandra_saw1',
  ut_longitudinal: 'calandra_saw1',
  liberacao_virola: 'calandra_saw1',
  montagem_flange: 'saw',
  montagem_bipartida: 'saw',
  passagem_virola: 'saw',
  marco_porta: 'saw',
  saw_2_3: 'saw',
  liberacao_internos_soldaveis: 'internos',
  ut_circunferencial: 'internos',
  liberacao_white_jato: 'acabamento',
  jato: 'acabamento',
  metalizacao: 'acabamento',
  pintura_reparo: 'acabamento',
  acabamento_pintura: 'montagem',
  montagem_final: null,
};

const ORDEM_PROCESSO = new Map(TODOS_PROCESSOS.map(p => [p.id, p.ordem]));

export interface OperacaoTramo {
  tramo_codigo: string;
  processo_id: string;
  data_apontamento: string;
}

/** Fica com o processo mais avançado de cada tramo (o fluxo é linear). */
export function ultimaOperacaoPorTramo(operacoes: OperacaoTramo[]): Map<string, OperacaoTramo> {
  const mapa = new Map<string, OperacaoTramo>();
  for (const op of operacoes) {
    const ordem = ORDEM_PROCESSO.get(op.processo_id);
    if (ordem === undefined || !op.tramo_codigo) continue;
    const atual = mapa.get(op.tramo_codigo);
    const ordemAtual = atual ? ORDEM_PROCESSO.get(atual.processo_id)! : -1;
    if (ordem > ordemAtual || (ordem === ordemAtual && op.data_apontamento > atual!.data_apontamento)) {
      mapa.set(op.tramo_codigo, op);
    }
  }
  return mapa;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

/** Zona do tramo segundo o Controle de Entrega; `null` = fora do WIP. */
export function zonaPorControleEntrega(tramo: Pick<TramoEntrega, 'etapa_categoria' | 'etapa_nome'>): ZonaWipId | null {
  switch (tramo.etapa_categoria) {
    case 'nav01':
      return 'calandra_saw1';
    case 'saw02':
    case 'saw03':
      return 'saw';
    case 'internos':
      return 'internos';
    case 'white':
      // White cobre Jato, Pintura e Montagem: o nome da etapa separa as duas zonas.
      return normalizar(tramo.etapa_nome).includes('MONTAGEM') ? 'montagem' : 'acabamento';
    case 'pendencias': {
      // Pendência é uma marca sobre o tramo, que continua parado na etapa de antes:
      // o nome da etapa diz em que zona ele está.
      const etapa = normalizar(tramo.etapa_nome);
      if (etapa.includes('NAV01')) return 'calandra_saw1';
      if (etapa.includes('SAW') || etapa.includes('MARCO PORTA')) return 'saw';
      if (etapa.includes('INTERNOS')) return 'internos';
      if (etapa.includes('MONTAGEM')) return 'montagem';
      if (etapa.includes('JATO') || etapa.includes('PINTURA')) return 'acabamento';
      return null;
    }
    default:
      return null;
  }
}

export type MotivoForaWip = 'pendente' | 'patio' | 'expedido';

export interface ItemWip {
  tramo: TramoEntrega;
  zona: ZonaWipId;
  dias: number;
  nivel: NivelCriticidadeEspera;
  origem: 'apontamento' | 'controle';
  /** Processo apontado que posicionou o tramo (só quando a origem é apontamento). */
  processoId: string | null;
}

export interface DistribuicaoWip {
  porZona: Record<ZonaWipId, ItemWip[]>;
  total: number;
  criticos: number;
  fora: Record<MotivoForaWip, number>;
}

const MS_DIA = 24 * 60 * 60 * 1000;

export function distribuirWip(
  tramos: TramoEntrega[],
  operacoes: Map<string, OperacaoTramo>,
  agora: Date = new Date(),
): DistribuicaoWip {
  const porZona = Object.fromEntries(ORDEM_ZONAS_WIP.map(z => [z, [] as ItemWip[]])) as Record<ZonaWipId, ItemWip[]>;
  const fora: Record<MotivoForaWip, number> = { pendente: 0, patio: 0, expedido: 0 };
  let total = 0;
  let criticos = 0;

  for (const tramo of tramos) {
    if (tramo.etapa_categoria === 'expedido' || tramo.etapa_categoria === 'patio') {
      fora[tramo.etapa_categoria]++;
      continue;
    }

    const opApontada = operacoes.get(tramo.id);
    // Vale a informação mais recente: um movimento manual posterior ao apontamento o substitui.
    const op =
      opApontada && new Date(tramo.data_entrada_etapa).getTime() > new Date(opApontada.data_apontamento).getTime()
        ? undefined
        : opApontada;
    let zona: ZonaWipId | null;
    let dias: number;
    let origem: ItemWip['origem'];
    if (op) {
      zona = ZONA_APOS_PROCESSO[op.processo_id] ?? null;
      dias = Math.max(0, Math.floor((agora.getTime() - new Date(op.data_apontamento).getTime()) / MS_DIA));
      origem = 'apontamento';
    } else {
      zona = zonaPorControleEntrega(tramo);
      dias = tramo.dias_espera;
      origem = 'controle';
    }

    if (!zona) {
      // Montagem Final apontada = liberado para o pátio; sem apontamento, categoria pendente.
      fora[op ? 'patio' : 'pendente']++;
      continue;
    }

    const nivel = avaliarCriticidadeEspera(dias).nivel;
    porZona[zona].push({ tramo, zona, dias, nivel, origem, processoId: op?.processo_id ?? null });
    total++;
    if (nivel === 'critico') criticos++;
  }

  // Mais antigos primeiro: o que está parado há mais tempo aparece à frente.
  for (const zona of ORDEM_ZONAS_WIP) {
    porZona[zona].sort((a, b) => b.dias - a.dias || a.tramo.torre_numero - b.tramo.torre_numero);
  }

  return { porZona, total, criticos, fora };
}

/** Zonas que recebem tramo ao arrastar no mapa (Corte guarda chapa, que ainda não tem código de tramo). */
export const ZONAS_DESTINO_WIP: ZonaWipId[] = ['montagem', 'acabamento', 'internos', 'saw', 'calandra_saw1'];

const ETAPA_PADRAO_ZONA: Record<string, Pick<TramoEntrega, 'etapa_categoria' | 'etapa_nome'>> = {
  montagem: { etapa_categoria: 'white', etapa_nome: 'MONTAGEM' },
  acabamento: { etapa_categoria: 'white', etapa_nome: 'LIB.JATO' },
  internos: { etapa_categoria: 'internos', etapa_nome: 'INTERNOS' },
  saw: { etapa_categoria: 'saw02', etapa_nome: 'SAW02' },
  calandra_saw1: { etapa_categoria: 'nav01', etapa_nome: 'NAV01' },
};

/**
 * Campos do Controle de Entrega que mudam quando o tramo é arrastado para uma zona.
 * Se o controle já classifica o tramo naquela zona, mantém categoria e nome da etapa.
 * Zera a espera e o "o que está aguardando", que descreviam a etapa anterior.
 */
export function camposAoMoverParaZona(
  tramo: Pick<TramoEntrega, 'etapa_categoria' | 'etapa_nome'>,
  zona: ZonaWipId,
  agora: Date = new Date(),
): Pick<TramoEntrega, 'etapa_categoria' | 'etapa_nome' | 'status_aguardando' | 'dias_espera' | 'data_entrada_etapa'> | null {
  const padrao = ETAPA_PADRAO_ZONA[zona];
  if (!padrao) return null;
  const jaNaZona = zonaPorControleEntrega(tramo) === zona;
  return {
    etapa_categoria: jaNaZona ? tramo.etapa_categoria : padrao.etapa_categoria,
    etapa_nome: jaNaZona ? tramo.etapa_nome : padrao.etapa_nome,
    status_aguardando: null,
    dias_espera: 0,
    data_entrada_etapa: agora.toISOString(),
  };
}
