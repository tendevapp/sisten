/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Classificação de giro, cobertura, idade e urgência de compra.
 *
 * CONTEXTO QUE DEFINE A LEITURA: a fábrica ficou parada de 2023 até reabrir em
 * 2026, e a MB51 só cobre o período pós-reabertura. Duas consequências que este
 * módulo trata explicitamente em vez de esconder:
 *
 * 1. O saldo sem entrada dentro da janela não tem "idade desconhecida" — ele
 *    atravessou a parada, então a idade real é de no mínimo ~3 anos. Ele recebe
 *    a faixa própria `legado`, nunca é diluído numa faixa de dias.
 * 2. "Sem consumo na janela" não significa baixo giro: significa que o item não
 *    foi tocado desde que a fábrica voltou a operar. É o sinal mais forte de
 *    obsolescência que esta base produz.
 *
 * Os limiares abaixo são o ponto de partida discutido, não política oficial da
 * empresa — estão reunidos aqui para serem ajustados num lugar só quando a
 * área definir lead time e estoque de segurança formais.
 */

import { EstoqueGiro, EstoqueCamadaFifo, ClassePermanencia } from '../types';

/** Cobertura acima disto imobiliza capital por mais de um ano de consumo. */
export const COBERTURA_EXCESSO_DIAS = 365;
/** Cobertura abaixo disto não cobre um ciclo típico de reposição. */
export const COBERTURA_RUPTURA_DIAS = 15;
/** Permanência até aqui caracteriza compra realmente urgente (cross-dock). */
export const PERMANENCIA_CROSS_DOCK_DIAS = 7;
/** Permanência acima disto indica compra antecipada além do necessário. */
export const PERMANENCIA_ANTECIPADA_DIAS = 90;

/* --------------------------------------------------------------------- */
/* Cobertura                                                              */
/* --------------------------------------------------------------------- */

export type SituacaoCobertura = 'ruptura' | 'saudavel' | 'excesso' | 'sem_consumo';

export interface FaixaCobertura {
  id: SituacaoCobertura;
  rotulo: string;
  descricao: string;
  cor: string;
}

export const FAIXAS_COBERTURA: Record<SituacaoCobertura, FaixaCobertura> = {
  ruptura: {
    id: 'ruptura',
    rotulo: 'Ruptura iminente',
    descricao: `Menos de ${COBERTURA_RUPTURA_DIAS} dias de cobertura no ritmo atual de consumo.`,
    cor: 'var(--status-critical)',
  },
  saudavel: {
    id: 'saudavel',
    rotulo: 'Saudável',
    descricao: `Entre ${COBERTURA_RUPTURA_DIAS} e ${COBERTURA_EXCESSO_DIAS} dias de cobertura.`,
    cor: 'var(--status-good)',
  },
  excesso: {
    id: 'excesso',
    rotulo: 'Excesso',
    descricao: `Mais de ${COBERTURA_EXCESSO_DIAS} dias de cobertura — capital imobilizado além de um ano de consumo.`,
    cor: 'var(--status-warning)',
  },
  sem_consumo: {
    id: 'sem_consumo',
    rotulo: 'Sem consumo desde a reabertura',
    descricao: 'Nenhum consumo registrado desde que a fábrica voltou a operar. Candidato a obsolescência.',
    cor: 'var(--status-serious)',
  },
};

/**
 * Situação de cobertura de um material.
 *
 * Sem consumo tem precedência sobre tudo: `cobertura_dias` é nulo nesse caso
 * (dividir por consumo zero não dá um número), então tratá-lo como "excesso"
 * misturaria "gira devagar" com "não gira".
 */
export function classificarCobertura(g: EstoqueGiro): SituacaoCobertura {
  if (g.sem_consumo_na_janela) return 'sem_consumo';
  const c = g.cobertura_dias;
  if (c === null || c === undefined) return 'sem_consumo';
  if (c < COBERTURA_RUPTURA_DIAS) return 'ruptura';
  if (c > COBERTURA_EXCESSO_DIAS) return 'excesso';
  return 'saudavel';
}

export interface ResumoCobertura {
  situacao: SituacaoCobertura;
  materiais: number;
  valor: number;
}

export function resumirCobertura(itens: EstoqueGiro[]): ResumoCobertura[] {
  const mapa = new Map<SituacaoCobertura, ResumoCobertura>();
  (['ruptura', 'saudavel', 'excesso', 'sem_consumo'] as SituacaoCobertura[]).forEach(s => {
    mapa.set(s, { situacao: s, materiais: 0, valor: 0 });
  });
  itens.forEach(g => {
    const r = mapa.get(classificarCobertura(g))!;
    r.materiais += 1;
    r.valor += g.valor_estoque || 0;
  });
  return Array.from(mapa.values());
}

/* --------------------------------------------------------------------- */
/* Idade do estoque                                                       */
/* --------------------------------------------------------------------- */

export type FaixaIdade = '0-30' | '31-60' | '61-90' | '91-180' | '180+' | 'legado';

export const ROTULO_FAIXA_IDADE: Record<FaixaIdade, string> = {
  '0-30': '0 a 30 dias',
  '31-60': '31 a 60 dias',
  '61-90': '61 a 90 dias',
  '91-180': '91 a 180 dias',
  '180+': 'Mais de 180 dias',
  legado: 'Anterior à reabertura',
};

/**
 * Nota exibida junto da faixa `legado`. A idade exata desse saldo não é
 * conhecida — a MB51 não alcança antes da reabertura — mas o piso é conhecido
 * e é alto. Dizer "mais de 180 dias" seria verdade mas subestimaria muito;
 * dizer "223 dias" seria inventar precisão que o dado não tem.
 */
export const NOTA_LEGADO =
  'Saldo sem entrada registrada na janela da MB51: atravessou a parada da fábrica (2023–2026). '
  + 'A idade exata não é conhecida, mas é de no mínimo ~3 anos.';

export function faixaIdadeDe(camada: EstoqueCamadaFifo): FaixaIdade {
  if (camada.legado) return 'legado';
  const d = camada.dias_em_estoque;
  if (d === null || d === undefined) return 'legado';
  if (d <= 30) return '0-30';
  if (d <= 60) return '31-60';
  if (d <= 90) return '61-90';
  if (d <= 180) return '91-180';
  return '180+';
}

export interface ResumoIdade {
  faixa: FaixaIdade;
  rotulo: string;
  camadas: number;
  materiais: number;
  quantidade: number;
  valor: number;
  legado: boolean;
}

/** Ordem de exibição: do mais novo ao mais antigo, com o legado por último. */
const ORDEM_FAIXAS: FaixaIdade[] = ['0-30', '31-60', '61-90', '91-180', '180+', 'legado'];

/** Agrupa as camadas que ainda têm saldo por faixa de idade. */
export function resumirIdade(camadas: EstoqueCamadaFifo[]): ResumoIdade[] {
  const mapa = new Map<FaixaIdade, ResumoIdade & { mats: Set<string> }>();
  ORDEM_FAIXAS.forEach(f => {
    mapa.set(f, {
      faixa: f, rotulo: ROTULO_FAIXA_IDADE[f], camadas: 0, materiais: 0,
      quantidade: 0, valor: 0, legado: f === 'legado', mats: new Set<string>(),
    });
  });

  camadas.forEach(c => {
    const rem = c.qtd_remanescente ?? 0;
    if (rem <= 0.001) return;
    const r = mapa.get(faixaIdadeDe(c))!;
    r.camadas += 1;
    r.quantidade += rem;
    r.valor += c.valor_remanescente || 0;
    if (c.material) r.mats.add(c.material);
  });

  return ORDEM_FAIXAS.map(f => {
    const r = mapa.get(f)!;
    return {
      faixa: r.faixa, rotulo: r.rotulo, camadas: r.camadas,
      materiais: r.mats.size, quantidade: r.quantidade, valor: r.valor, legado: r.legado,
    };
  });
}

/* --------------------------------------------------------------------- */
/* Urgência / qualidade da compra                                         */
/* --------------------------------------------------------------------- */

export interface FaixaPermanencia {
  id: ClassePermanencia;
  rotulo: string;
  descricao: string;
  cor: string;
}

export const FAIXAS_PERMANENCIA: Record<ClassePermanencia, FaixaPermanencia> = {
  cross_dock: {
    id: 'cross_dock',
    rotulo: 'Cross-dock',
    descricao: `Consumido em até ${PERMANENCIA_CROSS_DOCK_DIAS} dias da entrada — a urgência era real, o material nem parou no almoxarifado.`,
    cor: 'var(--status-good)',
  },
  saudavel: {
    id: 'saudavel',
    rotulo: 'Saudável',
    descricao: `Consumido entre ${PERMANENCIA_CROSS_DOCK_DIAS + 1} e ${PERMANENCIA_ANTECIPADA_DIAS} dias da entrada.`,
    cor: 'var(--series-1)',
  },
  antecipada: {
    id: 'antecipada',
    rotulo: 'Antecipada demais',
    descricao: `Ficou mais de ${PERMANENCIA_ANTECIPADA_DIAS} dias parado antes de ser consumido — a compra podia ter esperado.`,
    cor: 'var(--status-warning)',
  },
  em_estoque: {
    id: 'em_estoque',
    rotulo: 'Ainda em estoque',
    descricao: 'Recebido na janela e ainda não consumido.',
    cor: 'var(--series-3)',
  },
  legado_pre_reabertura: {
    id: 'legado_pre_reabertura',
    rotulo: 'Anterior à reabertura',
    descricao: NOTA_LEGADO,
    cor: 'var(--ink-muted)',
  },
  consumo_saldo_anterior: {
    id: 'consumo_saldo_anterior',
    rotulo: 'Consumo de saldo anterior',
    descricao: 'Saída anterior à entrada da camada — consumiu saldo que já existia.',
    cor: 'var(--ink-muted)',
  },
  indeterminado: {
    id: 'indeterminado',
    rotulo: 'Indeterminado',
    descricao: 'Sem data de entrada para medir a permanência.',
    cor: 'var(--ink-muted)',
  },
};

export interface ResumoPermanencia {
  classe: ClassePermanencia;
  rotulo: string;
  camadas: number;
  materiais: number;
  valor: number;
  medianaDias: number | null;
}

/** Ordem por acionabilidade: o que o comprador precisa rever primeiro. */
const ORDEM_PERMANENCIA: ClassePermanencia[] = [
  'antecipada', 'em_estoque', 'saudavel', 'cross_dock',
  'legado_pre_reabertura', 'consumo_saldo_anterior', 'indeterminado',
];

export function resumirPermanencia(camadas: EstoqueCamadaFifo[]): ResumoPermanencia[] {
  const mapa = new Map<ClassePermanencia, { mats: Set<string>; dias: number[]; camadas: number; valor: number }>();

  camadas.forEach(c => {
    let atual = mapa.get(c.classe_permanencia);
    if (!atual) {
      atual = { mats: new Set<string>(), dias: [], camadas: 0, valor: 0 };
      mapa.set(c.classe_permanencia, atual);
    }
    atual.camadas += 1;
    atual.valor += c.valor_remanescente || 0;
    if (c.material) atual.mats.add(c.material);
    if (c.dias_permanencia !== null && c.dias_permanencia !== undefined) {
      atual.dias.push(c.dias_permanencia);
    }
  });

  return ORDEM_PERMANENCIA
    .filter(cl => mapa.has(cl))
    .map(cl => {
      const a = mapa.get(cl)!;
      return {
        classe: cl,
        rotulo: FAIXAS_PERMANENCIA[cl].rotulo,
        camadas: a.camadas,
        materiais: a.mats.size,
        valor: a.valor,
        medianaDias: mediana(a.dias),
      };
    });
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? (ord[meio - 1] + ord[meio]) / 2 : ord[meio];
}

/* --------------------------------------------------------------------- */
/* Estoque morto                                                          */
/* --------------------------------------------------------------------- */

export interface ResumoEstoqueMorto {
  /** Sem nenhum consumo desde a reabertura. */
  materiaisSemConsumo: number;
  valorSemConsumo: number;
  /** Subconjunto pior: nem consumo nem qualquer outra movimentação. */
  materiaisIntocados: number;
  valorIntocado: number;
  /** Denominador, para a participação no capital total. */
  valorTotal: number;
  materiaisTotal: number;
}

export function resumirEstoqueMorto(itens: EstoqueGiro[]): ResumoEstoqueMorto {
  let materiaisSemConsumo = 0;
  let valorSemConsumo = 0;
  let materiaisIntocados = 0;
  let valorIntocado = 0;
  let valorTotal = 0;

  itens.forEach(g => {
    const v = g.valor_estoque || 0;
    valorTotal += v;
    if (g.sem_consumo_na_janela) {
      materiaisSemConsumo += 1;
      valorSemConsumo += v;
    }
    if (g.legado_intocado) {
      materiaisIntocados += 1;
      valorIntocado += v;
    }
  });

  return {
    materiaisSemConsumo, valorSemConsumo,
    materiaisIntocados, valorIntocado,
    valorTotal, materiaisTotal: itens.length,
  };
}

/* --------------------------------------------------------------------- */
/* Conciliação com o ZL0024                                               */
/* --------------------------------------------------------------------- */

export interface Conciliacao {
  /** Saldo do ZL0024 explicado por camadas FIFO. */
  materiaisConciliados: number;
  qtdConciliada: number;
  /** Camadas com saldo cujo material não aparece no ZL0024. */
  materiaisSemSaldo: number;
  qtdSemSaldo: number;
  valorSemSaldo: number;
  /** Verdadeiro quando tudo do ZL0024 está explicado e nada sobra. */
  fecha: boolean;
}

/**
 * Confronta as camadas FIFO com a posição do ZL0024.
 *
 * Serve de alarme permanente: se uma importação futura reintroduzir movimento
 * que não corresponde a saldo — foi assim que a compra direta para projeto
 * inflou o FIFO em R$ 851 mil antes da auditoria de 2026-08-15 — o painel
 * mostra na hora, em vez de o número errado circular como se fosse bom.
 */
export function conciliarComZl0024(
  camadas: EstoqueCamadaFifo[],
  giro: EstoqueGiro[]
): Conciliacao {
  const saldoZl = new Map<string, number>();
  giro.forEach(g => {
    if (g.material) saldoZl.set(g.material, g.saldo_atual || 0);
  });

  const conciliados = new Set<string>();
  const semSaldo = new Set<string>();
  let qtdConciliada = 0;
  let qtdSemSaldo = 0;
  let valorSemSaldo = 0;

  camadas.forEach(c => {
    const rem = c.qtd_remanescente ?? 0;
    if (rem <= 0.001) return;
    if (saldoZl.has(c.material)) {
      conciliados.add(c.material);
      qtdConciliada += rem;
    } else {
      semSaldo.add(c.material);
      qtdSemSaldo += rem;
      valorSemSaldo += c.valor_remanescente || 0;
    }
  });

  return {
    materiaisConciliados: conciliados.size,
    qtdConciliada,
    materiaisSemSaldo: semSaldo.size,
    qtdSemSaldo,
    valorSemSaldo,
    fecha: semSaldo.size === 0,
  };
}

/** Formata cobertura em dias; nulo vira o símbolo de "não aplicável". */
export function formatCobertura(dias?: number | null): string {
  if (dias === null || dias === undefined) return '—';
  if (dias >= 3650) return '10+ anos';
  if (dias >= 365) return `${(dias / 365).toFixed(1)} anos`;
  return `${Math.round(dias)} dias`;
}
