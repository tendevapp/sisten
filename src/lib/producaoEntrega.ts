/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Produção > Controle de Entrega
 *
 * Modelagem de prontidão e avanço dos tramos (T1 a T5) por torre,
 * mapeamento cromático do chão de fábrica (TEN Nordeste) e cálculos
 * de tempo de espera (aging) e priorização para tomada de decisão.
 */

export type TramoId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export const ORDEM_TRAMOS_VISUAL: TramoId[] = ['T5', 'T4', 'T3', 'T2', 'T1'];

export type CategoriaEtapa =
  | 'expedido'
  | 'patio'
  | 'white'
  | 'internos'
  | 'saw03'
  | 'saw02'
  | 'nav01';

export interface TramoEntrega {
  id: string;
  projeto: string;
  torre_numero: number;
  tramo: TramoId;
  serie: number;
  subprojeto_id: string | null;
  etapa_categoria: CategoriaEtapa;
  etapa_nome: string;
  status_aguardando: string | null;
  data_entrada_etapa: string;
  dias_espera: number;
  observacao: string | null;
  updated_at: string;
}

export type StatusConjuntoTorre =
  | 'completa_expedida' // 5/5 expedidos
  | 'completa_patio'    // 5/5 prontos (expedidos ou no pátio)
  | 'quase_pronta'      // 4/5 prontos (Falta 1 tramo - Desbloqueio imediato!)
  | 'em_fabricacao';    // <= 3 prontos

export interface TorreEntregaAgrupada {
  torre_numero: number;
  modelo: string;
  subprojeto_id: string | null;
  tramos: Record<TramoId, TramoEntrega | null>;
  total_tramos: number;
  tramos_prontos: number; // expedido ou pátio
  tramos_expedidos: number;
  percentual_prontidao: number;
  status_conjunto: StatusConjuntoTorre;
  maior_tempo_espera: number;
  tramo_gargalo: TramoEntrega | null;
}

export interface ConfiguracaoCategoria {
  id: CategoriaEtapa;
  rotulo: string;
  bgClasse: string;
  borderClasse: string;
  textoClasse: string;
  gradienteCilindro: string;
  hexPrimario: string;
  descricao: string;
}

export const CONFIG_CATEGORIAS: Record<CategoriaEtapa, ConfiguracaoCategoria> = {
  expedido: {
    id: 'expedido',
    rotulo: 'Expedido',
    bgClasse: 'bg-zinc-950 dark:bg-black',
    borderClasse: 'border-zinc-800',
    textoClasse: 'text-white',
    gradienteCilindro: 'linear-gradient(90deg, #18181b 0%, #27272a 45%, #09090b 100%)',
    hexPrimario: '#18181b',
    descricao: 'Carregado e expedido para o parque eólico',
  },
  patio: {
    id: 'patio',
    rotulo: 'Pátio',
    bgClasse: 'bg-[#86efac] text-[#14532d]',
    borderClasse: 'border-emerald-500',
    textoClasse: 'text-emerald-950 font-bold',
    gradienteCilindro: 'linear-gradient(90deg, #4ade80 0%, #86efac 45%, #22c55e 100%)',
    hexPrimario: '#4ade80',
    descricao: 'Concluído e liberado no pátio de estocagem',
  },
  white: {
    id: 'white',
    rotulo: 'White',
    bgClasse: 'bg-[#facc15] text-[#713f12]',
    borderClasse: 'border-amber-500',
    textoClasse: 'text-amber-950 font-bold',
    gradienteCilindro: 'linear-gradient(90deg, #facc15 0%, #fef08a 45%, #eab308 100%)',
    hexPrimario: '#facc15',
    descricao: 'Tratamento de superfície (Jato, Pintura, Montagem)',
  },
  internos: {
    id: 'internos',
    rotulo: 'Internos',
    bgClasse: 'bg-[#f97316] text-white',
    borderClasse: 'border-orange-600',
    textoClasse: 'text-white font-bold',
    gradienteCilindro: 'linear-gradient(90deg, #ea580c 0%, #fb923c 45%, #c2410c 100%)',
    hexPrimario: '#f97316',
    descricao: 'Última fase de fabricação antes do tratamento de superfície (jato e pintura)',
  },
  saw03: {
    id: 'saw03',
    rotulo: 'Saw03',
    bgClasse: 'bg-[#38bdf8] text-[#082f49]',
    borderClasse: 'border-sky-500',
    textoClasse: 'text-sky-950 font-bold',
    gradienteCilindro: 'linear-gradient(90deg, #0284c7 0%, #7dd3fc 45%, #0369a1 100%)',
    hexPrimario: '#38bdf8',
    descricao: 'Solda SAW no posto 03',
  },
  saw02: {
    id: 'saw02',
    rotulo: 'Saw02',
    bgClasse: 'bg-[#b9c6e2] text-[#1e293b]',
    borderClasse: 'border-slate-400',
    textoClasse: 'text-slate-900 font-bold',
    gradienteCilindro: 'linear-gradient(90deg, #94a3b8 0%, #cbd5e1 45%, #64748b 100%)',
    hexPrimario: '#b9c6e2',
    descricao: 'Marco Porta e solda SAW no posto 02',
  },
  nav01: {
    id: 'nav01',
    rotulo: 'Nav01',
    bgClasse: 'bg-[#fdba74] text-[#7c2d12]',
    borderClasse: 'border-orange-400',
    textoClasse: 'text-orange-950 font-bold',
    gradienteCilindro: 'linear-gradient(90deg, #fb923c 0%, #fed7aa 45%, #ea580c 100%)',
    hexPrimario: '#fdba74',
    descricao: 'Processamento inicial NAV1',
  },
};

export type NivelCriticidadeEspera = 'normal' | 'atencao' | 'critico';

export function avaliarCriticidadeEspera(dias: number): {
  nivel: NivelCriticidadeEspera;
  badgeClasse: string;
  texto: string;
} {
  if (dias >= 5) {
    return {
      nivel: 'critico',
      badgeClasse: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
      texto: `${dias}d (Crítico)`,
    };
  }
  if (dias >= 3) {
    return {
      nivel: 'atencao',
      badgeClasse: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
      texto: `${dias}d (Alerta)`,
    };
  }
  return {
    nivel: 'normal',
    badgeClasse: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    texto: `${dias}d`,
  };
}

/** Agrupa a lista de tramos por torre mantendo ordenação e cálculo de conjunto */
export function agruparTramosPorTorre(tramos: TramoEntrega[]): TorreEntregaAgrupada[] {
  const mapa = new Map<number, TorreEntregaAgrupada>();

  for (const t of tramos) {
    let torre = mapa.get(t.torre_numero);
    if (!torre) {
      torre = {
        torre_numero: t.torre_numero,
        modelo: 'GW55120M-001',
        subprojeto_id: t.subprojeto_id,
        tramos: { T1: null, T2: null, T3: null, T4: null, T5: null },
        total_tramos: 5,
        tramos_prontos: 0,
        tramos_expedidos: 0,
        percentual_prontidao: 0,
        status_conjunto: 'em_fabricacao',
        maior_tempo_espera: 0,
        tramo_gargalo: null,
      };
      mapa.set(t.torre_numero, torre);
    }
    torre.tramos[t.tramo] = t;
  }

  const resultado: TorreEntregaAgrupada[] = [];

  for (const torre of mapa.values()) {
    let prontos = 0;
    let expedidos = 0;
    let maxEspera = 0;
    let gargalo: TramoEntrega | null = null;

    const lista = (['T1', 'T2', 'T3', 'T4', 'T5'] as TramoId[])
      .map(tramoId => torre.tramos[tramoId])
      .filter((t): t is TramoEntrega => t !== null);

    for (const t of lista) {
      if (t.etapa_categoria === 'expedido') {
        expedidos++;
        prontos++;
      } else if (t.etapa_categoria === 'patio') {
        prontos++;
      }

      if (t.etapa_categoria !== 'expedido' && t.dias_espera > maxEspera) {
        maxEspera = t.dias_espera;
        gargalo = t;
      }
    }

    torre.tramos_prontos = prontos;
    torre.tramos_expedidos = expedidos;
    torre.percentual_prontidao = Math.round((prontos / 5) * 100);
    torre.maior_tempo_espera = maxEspera;
    torre.tramo_gargalo = gargalo;

    if (expedidos === 5) {
      torre.status_conjunto = 'completa_expedida';
    } else if (prontos === 5) {
      torre.status_conjunto = 'completa_patio';
    } else if (prontos === 4) {
      torre.status_conjunto = 'quase_pronta';
    } else {
      torre.status_conjunto = 'em_fabricacao';
    }

    resultado.push(torre);
  }

  return resultado.sort((a, b) => a.torre_numero - b.torre_numero);
}

export interface IndicadoresDecisaoEntrega {
  totalTorres: number;
  totalTramos: number;
  torresExpedidas: number;
  torresNoPatio: number;
  torresQuaseProntas: number; // 4/5 prontos - Quick Win!
  torresEmFabricacao: number;
  tramosCriticos: TramoEntrega[]; // > 4 dias de espera
  contagemCategorias: Record<CategoriaEtapa, number>;
  mediaDiasEsperaWip: number;
}

/** Calcula KPIs de tomada de decisão a partir dos tramos */
export function calcularIndicadoresDecisao(
  tramos: TramoEntrega[],
  torres: TorreEntregaAgrupada[],
): IndicadoresDecisaoEntrega {
  const contagem: Record<CategoriaEtapa, number> = {
    expedido: 0,
    patio: 0,
    white: 0,
    internos: 0,
    saw03: 0,
    saw02: 0,
    nav01: 0,
  };

  let somaEsperaWip = 0;
  let totalWip = 0;

  for (const t of tramos) {
    if (contagem[t.etapa_categoria] !== undefined) {
      contagem[t.etapa_categoria]++;
    }
    if (t.etapa_categoria !== 'expedido') {
      somaEsperaWip += t.dias_espera;
      totalWip++;
    }
  }

  const tramosCriticos = tramos
    .filter(t => t.etapa_categoria !== 'expedido' && t.dias_espera >= 4)
    .sort((a, b) => b.dias_espera - a.dias_espera);

  return {
    totalTorres: torres.length,
    totalTramos: tramos.length,
    torresExpedidas: torres.filter(t => t.status_conjunto === 'completa_expedida').length,
    torresNoPatio: torres.filter(t => t.status_conjunto === 'completa_patio').length,
    torresQuaseProntas: torres.filter(t => t.status_conjunto === 'quase_pronta').length,
    torresEmFabricacao: torres.filter(t => t.status_conjunto === 'em_fabricacao').length,
    tramosCriticos,
    contagemCategorias: contagem,
    mediaDiasEsperaWip: totalWip > 0 ? Number((somaEsperaWip / totalWip).toFixed(1)) : 0,
  };
}
