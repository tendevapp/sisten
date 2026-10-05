/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo de Produção — Apontamentos de Torres Eólicas
 *
 * Regras de negócio puras (sem React nem Supabase):
 * 1. Nave 1 com 3 Fábricas:
 *    - 1ª Fábrica (Preparo da Chapa): Corte, Pré-Jato, Chanfro.
 *    - 2ª Fábrica (Fabricação da Virola): Calandra, SAW 1, Recalandra/Respaldo, UT Longitudinal, Liberação de Virola.
 *    - 3ª Fábrica (Montagem Estrutural Inicial): Montagem Flange, Montagem Bi-partida, Passagem Virola, Marco-Porta.
 *      No Marco-Porta oficializa-se o Tramo TX-XXXX e o libera para a Nave 2.
 * 2. Nave 2 (Soldagem e Preparação Interna):
 *    - Solda Circunferencial SAW 2 (Dupla de chapas) e SAW 3.
 *    - Liberação do Tramo para Internos Soldáveis (com confirmação TX-XXXX).
 *    - UT Circunferencial.
 *    - Liberação do Tramo para área White / Jato (com confirmação TX-XXXX).
 * 3. Nave White (Tratamento de Superfície e Acabamento):
 *    - Jato, Metalização, Pintura / Reparo, Acabamento da Pintura, Montagem Final.
 *    - Montagem Final libera para Pátio / Expedição do Almoxarifado.
 * 4. Indicador de Progresso da Torre:
 *    - Percentual acumulado com base nas etapas concluídas das Naves 2 e White.
 */

export type NaveProducaoId = 'nave1' | 'nave2' | 'white';
export type FabricaNave1Id = 'fabrica1' | 'fabrica2' | 'fabrica3';
export type EstagioTramo = 'nave1_fabrica3' | 'nave2' | 'white' | 'expedicao_almoxarifado';

export interface ProcessoApontamento {
  id: string;
  nome: string;
  nave: NaveProducaoId;
  fabrica?: FabricaNave1Id;
  descricao: string;
  ordem: number;
  exigeConfirmacaoTramo?: boolean;
  oficializaTramo?: boolean;
  transicionaEstagioPara?: EstagioTramo;
}

// ---------------------------------------------------------------------------
// 1. Processos da Nave 1 divididos em 3 Fábricas
// ---------------------------------------------------------------------------

export const ETAPAS_NAVE_1_FABRICA_1: ProcessoApontamento[] = [
  {
    id: 'corte',
    nome: 'Corte',
    nave: 'nave1',
    fabrica: 'fabrica1',
    descricao: 'Corte térmico / plasma da chapa bruta conforme plano de corte.',
    ordem: 1,
  },
  {
    id: 'pre_jato',
    nome: 'Pré-Jato',
    nave: 'nave1',
    fabrica: 'fabrica1',
    descricao: 'Jateamento inicial de limpeza da chapa antes da conformação.',
    ordem: 2,
  },
  {
    id: 'chanfro',
    nave: 'nave1',
    fabrica: 'fabrica1',
    nome: 'Chanfro',
    descricao: 'Chanframento das bordas da chapa para preparação de solda.',
    ordem: 3,
  },
];

export const ETAPAS_NAVE_1_FABRICA_2: ProcessoApontamento[] = [
  {
    id: 'calandra',
    nome: 'Calandra',
    nave: 'nave1',
    fabrica: 'fabrica2',
    descricao: 'Calandragem mecânica da chapa para conformação cilíndrica.',
    ordem: 4,
  },
  {
    id: 'saw_1',
    nome: 'SAW 1 (Solda Longitudinal)',
    nave: 'nave1',
    fabrica: 'fabrica2',
    descricao: 'Soldagem a arco submerso longitudinal de fechamento da virola.',
    ordem: 5,
  },
  {
    id: 'recalandra_respaldo',
    nome: 'Recalandra / Respaldo',
    nave: 'nave1',
    fabrica: 'fabrica2',
    descricao: 'Ajuste dimensional de circularidade e desempeno do cordão.',
    ordem: 6,
  },
  {
    id: 'ut_longitudinal',
    nome: 'UT Longitudinal (Ultrassom)',
    nave: 'nave1',
    fabrica: 'fabrica2',
    descricao: 'Ensaio não destrutivo de ultrassom na junta longitudinal.',
    ordem: 7,
  },
  {
    id: 'liberacao_virola',
    nome: 'Liberação de Virola',
    nave: 'nave1',
    fabrica: 'fabrica2',
    descricao: 'Inspeção dimensional e liberação de qualidade da virola.',
    ordem: 8,
  },
];

export const ETAPAS_NAVE_1_FABRICA_3: ProcessoApontamento[] = [
  {
    id: 'montagem_flange',
    nome: 'Montagem de Flange',
    nave: 'nave1',
    fabrica: 'fabrica3',
    descricao: 'Acoplamento e alinhamento do anel de flange.',
    ordem: 9,
  },
  {
    id: 'montagem_bipartida',
    nome: 'Montagem de Bi-partida',
    nave: 'nave1',
    fabrica: 'fabrica3',
    descricao: 'Montagem das seções bi-partidas do tramo.',
    ordem: 10,
  },
  {
    id: 'passagem_virola',
    nome: 'Passagem de Virola',
    nave: 'nave1',
    fabrica: 'fabrica3',
    descricao: 'Ajuste e passagem sequencial das virolas montadas.',
    ordem: 11,
  },
  {
    id: 'marco_porta',
    nome: 'Marco-Porta',
    nave: 'nave1',
    fabrica: 'fabrica3',
    descricao: 'Montagem e fixação do marco da porta de acesso à torre. Oficializa a criação do Tramo TX-XXXX.',
    ordem: 12,
    oficializaTramo: true,
    transicionaEstagioPara: 'nave2',
  },
];

export const PROCESSOS_NAVE_1: ProcessoApontamento[] = [
  ...ETAPAS_NAVE_1_FABRICA_1,
  ...ETAPAS_NAVE_1_FABRICA_2,
  ...ETAPAS_NAVE_1_FABRICA_3,
];

// ---------------------------------------------------------------------------
// 2. Processos da Nave 2: Soldagem e Preparação Interna
// ---------------------------------------------------------------------------

export const PROCESSOS_NAVE_2: ProcessoApontamento[] = [
  {
    id: 'saw_2_3',
    nome: 'Solda Circunferencial SAW 2 e SAW 3',
    nave: 'nave2',
    descricao: 'Soldagem a arco submerso circunferencial de união de virolas/duplas.',
    ordem: 13,
  },
  {
    id: 'liberacao_internos_soldaveis',
    nome: 'Liberação do Tramo para Internos Soldáveis',
    nave: 'nave2',
    descricao: 'Liberação formal com confirmação da numeração do tramo TX-XXXX para montagem de suportes internos.',
    ordem: 14,
    exigeConfirmacaoTramo: true,
  },
  {
    id: 'ut_circunferencial',
    nome: 'UT Circunferencial (Ultrassom)',
    nave: 'nave2',
    descricao: 'Ensaio não destrutivo de ultrassom nas soldas circunferenciais.',
    ordem: 15,
  },
  {
    id: 'liberacao_white_jato',
    nome: 'Liberação do Tramo para White / Jato',
    nave: 'nave2',
    descricao: 'Liberação estrutural e dimensional com confirmação TX-XXXX para entrada no tratamento de superfície.',
    ordem: 16,
    exigeConfirmacaoTramo: true,
    transicionaEstagioPara: 'white',
  },
];

// ---------------------------------------------------------------------------
// 3. Processos da Nave White: Tratamento de Superfície e Acabamento
// ---------------------------------------------------------------------------

export const PROCESSOS_NAVE_WHITE: ProcessoApontamento[] = [
  {
    id: 'jato',
    nome: 'Jato',
    nave: 'white',
    descricao: 'Jateamento abrasivo padrão Sa 2.5 / Sa 3 de preparação da superfície interna e externa.',
    ordem: 17,
  },
  {
    id: 'metalizacao',
    nome: 'Metalização',
    nave: 'white',
    descricao: 'Aspersão térmica de zinco/alumínio nos flanges e zonas críticas contra corrosão.',
    ordem: 18,
  },
  {
    id: 'pintura_reparo',
    nome: 'Pintura / Reparo',
    nave: 'white',
    descricao: 'Aplicação do esquema de pintura anticorrosiva de acabamento e correção pontual.',
    ordem: 19,
  },
  {
    id: 'acabamento_pintura',
    nome: 'Acabamento da Pintura',
    nave: 'white',
    descricao: 'Inspeção de espessura de película seca (EPS), aderência e cura do revestimento.',
    ordem: 20,
  },
  {
    id: 'montagem_final',
    nome: 'Montagem Final',
    nave: 'white',
    descricao: 'Instalação de internos não soldáveis, escadas, cabos e liberação para o Pátio / Expedição.',
    ordem: 21,
    transicionaEstagioPara: 'expedicao_almoxarifado',
  },
];

/** Todos os processos da cadeia de fabricação */
export const TODOS_PROCESSOS: ProcessoApontamento[] = [
  ...PROCESSOS_NAVE_1,
  ...PROCESSOS_NAVE_2,
  ...PROCESSOS_NAVE_WHITE,
];

/** Lista de processos cujo avanço compõe o progresso percentual da torre (Naves 2 e White) */
export const PROCESSOS_PROGRESSO_TORRE = [
  ...PROCESSOS_NAVE_2,
  ...PROCESSOS_NAVE_WHITE,
];

// ---------------------------------------------------------------------------
// 4. Validações e Normalizações de Tramo
// ---------------------------------------------------------------------------

/**
 * Valida o padrão do código do tramo: TX-XXXX (onde X é o nível do tramo T1..T5 e XXXX é o sufixo numérico/alfanumérico)
 * Aceita padrões como T1-3143, T2-0012, T5-4500, T3-ABC1, etc.
 */
export function validarFormatoTramo(codigo: string): boolean {
  if (!codigo || typeof codigo !== 'string') return false;
  const limpo = codigo.trim().toUpperCase();
  // Formato: T[1-5]- seguido de 3 a 8 caracteres alfanuméricos
  const regex = /^T[1-5]-[A-Z0-9]{3,8}$/;
  return regex.test(limpo);
}

/** Normaliza para caixa alta e sem espaços externos */
export function normalizarCodigoTramo(codigo: string): string {
  return (codigo || '').trim().toUpperCase();
}

/** Extrai a seção do tramo (T1..T5) a partir do código */
export function extrairSecaoTramo(codigo: string): 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | null {
  const normalizado = normalizarCodigoTramo(codigo);
  const match = normalizado.match(/^(T[1-5])-/);
  return match ? (match[1] as 'T1' | 'T2' | 'T3' | 'T4' | 'T5') : null;
}

// ---------------------------------------------------------------------------
// 5. Cálculo de Progresso (Naves 2 e White)
// ---------------------------------------------------------------------------

export interface ProgressoTramo {
  concluidos: number;
  total: number;
  percentual: number;
  processosConcluidos: string[];
}

/**
 * Calcula o percentual de conclusão acumulado com base nos processos das Naves 2 e White.
 * Ao todo são 9 processos (4 na Nave 2 + 5 na Nave White).
 */
export function calcularProgressoTramo(processosConcluidosIds: string[]): ProgressoTramo {
  const idsProgresso = new Set(PROCESSOS_PROGRESSO_TORRE.map(p => p.id));
  const concluidosValidos = (processosConcluidosIds || []).filter(id => idsProgresso.has(id));
  const total = PROCESSOS_PROGRESSO_TORRE.length; // 9
  const concluidos = concluidosValidos.length;
  const percentual = total > 0 ? Math.min(100, Math.round((concluidos / total) * 100)) : 0;

  return {
    concluidos,
    total,
    percentual,
    processosConcluidos: concluidosValidos,
  };
}

/**
 * Determina se a conclusão de um determinado processo aciona a mudança de estágio do tramo.
 */
export function determinarProximoEstagio(processoId: string): EstagioTramo | null {
  const processo = TODOS_PROCESSOS.find(p => p.id === processoId);
  return processo?.transicionaEstagioPara ?? null;
}

// ---------------------------------------------------------------------------
// 6. Configurações de Apresentação das Naves e Fábricas
// ---------------------------------------------------------------------------

export const FABRICAS_NAVE_1 = [
  {
    id: 'fabrica1' as const,
    nome: '1ª Fábrica',
    subtitulo: 'Preparo da Chapa',
    descricao: 'Corte a plasma, pré-jato de limpeza e chanframento.',
    processos: ETAPAS_NAVE_1_FABRICA_1,
  },
  {
    id: 'fabrica2' as const,
    nome: '2ª Fábrica',
    subtitulo: 'Fabricação da Virola',
    descricao: 'Calandra, solda longitudinal SAW 1, recalandra e UT longitudinal.',
    processos: ETAPAS_NAVE_1_FABRICA_2,
  },
  {
    id: 'fabrica3' as const,
    nome: '3ª Fábrica',
    subtitulo: 'Montagem Estrutural Inicial',
    descricao: 'Flanges, bi-partidas, passagem de virolas e marco-porta (criação TX-XXXX).',
    processos: ETAPAS_NAVE_1_FABRICA_3,
  },
];
