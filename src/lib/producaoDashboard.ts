/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório Diário de Produção — acompanhamento das atividades por setor.
 *
 * O relatório hoje é montado à mão (planilha/arte) e circula como imagem. Aqui
 * ele vira dado: cada setor declara suas linhas, cada linha declara o status de
 * cada atividade, e o resumo do dia (contagens e percentuais) é *calculado* a
 * partir disso — nunca digitado — para o donut nunca divergir das tabelas.
 *
 * Os dados abaixo são mockados: espelham o relatório de 19/09/26 usado como
 * referência. Quando o apontamento existir em tabela, trocar
 * `RELATORIO_DIARIO_MOCK` por uma consulta em `producaoApi.ts` mantendo os
 * tipos — a view não muda.
 */

/** Status de uma atividade. Posto sem peça não tem status: vira `LinhaVazia`. */
export type StatusAtividade = 'concluido' | 'andamento' | 'nao_iniciado';

/** Linha de setor cuja peça ainda não chegou ao posto: não há o que contar. */
export interface LinhaVazia {
  local: string;
  vazia: true;
}

/** Linha com peça no posto e uma atividade por coluna do setor. */
export interface LinhaAtividades {
  local: string;
  /** Série da peça (T4-3211). Ausente quando o posto se identifica sozinho. */
  peca?: string;
  vazia?: false;
  /** Uma entrada por coluna declarada em `SetorMatriz.colunas`, na mesma ordem. */
  status: StatusAtividade[];
}

export type LinhaSetor = LinhaVazia | LinhaAtividades;

/** Guarda explícita: o projeto roda sem `strictNullChecks`, e aí o discriminante
 *  opcional `vazia` não estreita a união sozinho. */
export function postoVazio(linha: LinhaSetor): linha is LinhaVazia {
  return linha.vazia === true;
}

/** Setor em matriz: linhas de posto × colunas fixas de atividade (Reparo). */
export interface SetorMatriz {
  id: string;
  titulo: string;
  colunas: string[];
  linhas: LinhaSetor[];
}

/** Peça/cabine de um setor em lista, com seus processos em sequência. */
export interface BlocoLista {
  /** Rótulo da esquerda: "Cabine A", "T4-3176". */
  titulo: string;
  /** Segunda linha do rótulo: a peça que está na cabine. */
  subtitulo?: string;
  /** Faixa acima dos processos, quando o posto está travado ("Aguardando peça"). */
  aviso?: string;
  processos: { nome: string; status: StatusAtividade }[];
}

/** Setor em lista: um bloco por peça/cabine (Jato, Metalização, Pintura). */
export interface SetorLista {
  id: string;
  titulo: string;
  /** Cabeçalho das duas primeiras colunas — a terceira é sempre "Status". */
  colunas: [string, string];
  blocos: BlocoLista[];
}

export interface RelatorioDiarioProducao {
  /** ISO (YYYY-MM-DD); a view formata para DD/MM/AA sem passar por `new Date`. */
  data: string;
  jato: SetorLista;
  metalizacao: SetorLista;
  pintura: SetorLista;
  reparo: SetorMatriz;
  observacoes: string[];
}

export interface ResumoDia {
  concluidas: number;
  andamento: number;
  naoIniciadas: number;
  total: number;
  pctConcluidas: number;
  pctAndamento: number;
  pctNaoIniciadas: number;
}

/* --------------------------------------------------------------------- */
/* Agregação                                                              */
/* --------------------------------------------------------------------- */

/**
 * Conta as atividades de todos os setores e devolve o resumo do dia.
 *
 * Linhas `vazia` (posto sem peça) ficam fora do denominador: contar posto vazio
 * como "não iniciado" encheria o vermelho do donut de trabalho que sequer foi
 * planejado para o dia.
 *
 * Os percentuais são arredondados e a sobra cai na maior fatia, para a soma
 * fechar em 100% e o donut não deixar fresta.
 */
export function calcularResumoDia(relatorio: RelatorioDiarioProducao): ResumoDia {
  const contagem: Record<StatusAtividade, number> = { concluido: 0, andamento: 0, nao_iniciado: 0 };

  for (const setor of [relatorio.jato, relatorio.metalizacao, relatorio.pintura]) {
    for (const bloco of setor.blocos) {
      for (const processo of bloco.processos) contagem[processo.status] += 1;
    }
  }
  for (const linha of relatorio.reparo.linhas) {
    if (postoVazio(linha)) continue;
    for (const status of linha.status) contagem[status] += 1;
  }

  const total = contagem.concluido + contagem.andamento + contagem.nao_iniciado;
  const [pctConcluidas, pctAndamento, pctNaoIniciadas] = distribuirPercentuais(
    [contagem.concluido, contagem.andamento, contagem.nao_iniciado],
    total,
  );

  return {
    concluidas: contagem.concluido,
    andamento: contagem.andamento,
    naoIniciadas: contagem.nao_iniciado,
    total,
    pctConcluidas,
    pctAndamento,
    pctNaoIniciadas,
  };
}

/** Arredonda cada parte e joga a sobra dos 100% na maior delas. */
function distribuirPercentuais(partes: number[], total: number): number[] {
  if (total <= 0) return partes.map(() => 0);
  const pcts = partes.map(parte => Math.round((parte / total) * 100));
  const sobra = 100 - pcts.reduce((soma, p) => soma + p, 0);
  if (sobra !== 0) {
    let maior = 0;
    for (let i = 1; i < partes.length; i += 1) if (partes[i] > partes[maior]) maior = i;
    pcts[maior] += sobra;
  }
  return pcts;
}

/** ISO → DD/MM/AA fatiando a string: `new Date('2026-09-19')` volta 18/09 em UTC-3. */
export function formatarDataDDMMAA(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano.slice(2)}`;
}

/* --------------------------------------------------------------------- */
/* Mock                                                                   */
/* --------------------------------------------------------------------- */

const C: StatusAtividade = 'concluido';
const A: StatusAtividade = 'andamento';
const N: StatusAtividade = 'nao_iniciado';

const PROCESSOS_REPARO = [
  'Bordas',
  'Soldar buchas',
  'Suportes',
  'Reparos interno',
  'Reparos externo',
  'Montagem',
  'Inspeção final',
];

const PROCESSOS_PINTURA = [
  'Zinco externo',
  'Epóxi 2° demão externo',
  'PU externo',
  'Epóxi 1° demão interno',
  'Epóxi 2° demão interno',
  'Inspeção de pintura',
];

const processos = (nomes: string[], status: StatusAtividade[]) =>
  nomes.map((nome, i) => ({ nome, status: status[i] }));

export const RELATORIO_DIARIO_MOCK: RelatorioDiarioProducao = {
  data: '2026-09-19',
  jato: {
    id: 'jato',
    titulo: 'Jato',
    colunas: ['Peça', 'Atividade'],
    blocos: [{ titulo: 'T4-3211', processos: [{ nome: 'Iniciar', status: N }] }],
  },
  metalizacao: {
    id: 'metalizacao',
    titulo: 'Metalização',
    colunas: ['Peça', 'Atividade'],
    blocos: [
      {
        titulo: 'T4-3176',
        aviso: 'Aguardando peça',
        processos: processos(PROCESSOS_REPARO, [N, N, N, N, N, N, N]),
      },
    ],
  },
  pintura: {
    id: 'pintura',
    titulo: 'Pintura',
    colunas: ['Cabine / Peça', 'Processo'],
    blocos: [
      { titulo: 'Cabine A', subtitulo: 'T4-3206', processos: processos(PROCESSOS_PINTURA, [C, C, C, C, C, C]) },
      { titulo: 'Cabine B', subtitulo: 'T3-3205', processos: processos(PROCESSOS_PINTURA, [C, C, N, C, N, N]) },
      { titulo: 'Cabine C', subtitulo: 'T3-3165', processos: processos(PROCESSOS_PINTURA, [C, C, N, C, C, N]) },
    ],
  },
  reparo: {
    id: 'reparo',
    titulo: 'Reparo',
    colunas: ['Bordas', 'Soldar buchas', 'Suportes', 'Rep. interno', 'Rep. externo', 'Montagem', 'Inspeção final'],
    linhas: [
      { local: 'MF-A', peca: 'T5-3152', status: [A, C, A, A, A, N, N] },
      { local: 'MF-B', peca: 'T1-3168', status: [A, C, N, N, N, N, N] },
      { local: 'MF-C', peca: 'T1-3163', status: [C, C, C, C, C, N, N] },
      { local: 'MF-D', vazia: true },
      { local: 'Corredor', peca: 'T1-3173', status: [N, N, N, N, N, N, N] },
      { local: 'Corredor', peca: 'T1-3148', status: [C, C, C, C, C, C, N] },
      { local: 'MF-A externo', vazia: true },
      { local: 'MF-D externo', peca: 'T2-3199', status: [A, C, N, N, N, N, N] },
      { local: 'MF-C externa', vazia: true },
      { local: 'MF-D externa', vazia: true },
    ],
  },
  observacoes: [
    'Setor de Metalização aguardando peça.',
    'Diversas atividades em reparo seguem em andamento ou não iniciadas.',
    'Acompanhar conclusão das pendências na Pintura (Cabines B e C).',
    'Manter foco na finalização das inspeções.',
  ],
};
