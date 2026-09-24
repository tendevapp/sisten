/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Produção — liberações de qualidade da fabricação de torres (corte a
 * plasma, chanfro, calandra, solda, EVS, flange e UT). Vocabulário e regras
 * puras, sem Supabase nem React (ver `producaoApi.ts` para o IO).
 *
 * Migrado do sistema NAV1 (PRD v36.6, TEN Nordeste). A numeração torre/tramo
 * já existe no SISTEN — `torreDaSerie`/`tramoDaSerie` em `lib/projetos.ts` são
 * a mesma fórmula do NAV1 (`3143 + (torre-1)*5 + índice(tramo)`), e as 3.243
 * virolas do projeto inteiro (69 torres × 5 tramos × virolas por tramo) vivem
 * semeadas em `prod_virolas`, uma linha por peça física, no mesmo espírito de
 * `proj_tramos_gwjaco`.
 *
 * As ETAPAS (corte, chanfro, calandra, solda, evs, flange, ut, ...) são DADO
 * — tabela `prod_etapas` com `etapa_anterior_id` — não código. Acrescentar uma
 * etapa nova (jato, pintura...) é inserir uma linha, não escrever um módulo.
 * `CAMPOS_POR_ETAPA` abaixo é a única exceção: são só os campos extras que o
 * FORMULÁRIO de cada etapa conhecida mostra — apresentação, não fluxo.
 */

export type Tramo = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

/**
 * Nomes das virolas de cada tramo, na ordem física (PRD NAV1 §5.2). Espelha o
 * `insert` de seed de `prod_virolas` — as duas listas precisam concordar.
 */
export const VIROLAS_POR_TRAMO: Record<Tramo, string[]> = {
  T1: ['V1A', 'V1B', 'V2A', 'V2B', 'V3A', 'V3B', 'V4', 'V5'],
  T2: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'],
  T3: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9'],
  T4: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11'],
  T5: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12'],
};

/** Virolas de um tramo, na ordem física. */
export function virolasDoTramo(tramo: string): string[] {
  return VIROLAS_POR_TRAMO[tramo as Tramo] ?? [];
}

/** Total de virolas de um tramo — base do progresso do Controle de Entrega. */
export function totalVirolasDoTramo(tramo: string): number {
  return virolasDoTramo(tramo).length;
}

/** Id estável de `prod_virolas`: `${tramo_unidade_id}-${virola}` (ex.: `T1-3143-V1A`). */
export function idVirola(tramoUnidadeId: string, virola: string): string {
  return `${tramoUnidadeId}-${virola}`;
}

export const TURNOS = ['A', 'B', 'C', 'Administrativo'] as const;
export type Turno = (typeof TURNOS)[number];

/** `''`/valor desconhecido vira `null` — turno é opcional em todo lançamento. */
export function normalizarTurno(v: string | null | undefined): Turno | null {
  return (TURNOS as readonly string[]).includes(String(v)) ? (v as Turno) : null;
}

export type StatusLancamento = 'aprovado' | 'reprovado' | 'pendente' | 'refugado';

/**
 * Campos extras que o formulário genérico de lançamento mostra por etapa —
 * puramente de apresentação; a cadeia em si (quem é a etapa anterior) vem do
 * banco (`prod_etapas.etapa_anterior_id`).
 */
export interface CamposEtapa {
  /** Corte usa mesa/máquina; calandra usa a calandra; solda usa a SAW. */
  exigeRecurso: boolean;
  /** Só o chanfro pergunta quem executou (TEN ou TECOI). */
  exigeExecucao: boolean;
  /** Só o corte digita a rastreabilidade da chapa — as etapas seguintes herdam. */
  exigeRastreabilidade: boolean;
}

const CAMPOS_PADRAO: CamposEtapa = { exigeRecurso: false, exigeExecucao: false, exigeRastreabilidade: false };

export const CAMPOS_POR_ETAPA: Record<string, CamposEtapa> = {
  corte: { exigeRecurso: true, exigeExecucao: false, exigeRastreabilidade: true },
  chanfro: { exigeRecurso: false, exigeExecucao: true, exigeRastreabilidade: false },
  calandra: { exigeRecurso: true, exigeExecucao: false, exigeRastreabilidade: false },
  solda: { exigeRecurso: true, exigeExecucao: false, exigeRastreabilidade: false },
};

export function camposDaEtapa(etapaId: string): CamposEtapa {
  return CAMPOS_POR_ETAPA[etapaId] ?? CAMPOS_PADRAO;
}

/** Tipo de `prod_recursos` que o seletor de máquina de cada etapa filtra. */
export const TIPO_RECURSO_POR_ETAPA: Record<string, 'corte' | 'calandra' | 'saw'> = {
  corte: 'corte',
  calandra: 'calandra',
  solda: 'saw',
};

export const EXECUCOES_CHANFRO = ['TEN', 'TECOI'] as const;
export type ExecucaoChanfro = (typeof EXECUCOES_CHANFRO)[number];

/** Payload mínimo validado antes de enfileirar/enviar um lançamento. */
export interface DadosLancamento {
  etapaId: string;
  status: StatusLancamento | '';
  dataLiberacao: string;
  turno?: string | null;
  recursoId?: string | null;
  execucaoEmpresa?: string | null;
  rastreabilidade?: string | null;
  executanteNome?: string | null;
}

/**
 * Valida os campos comuns + os extras da etapa (`camposDaEtapa`). Devolve as
 * mensagens de erro, na ordem em que devem ser mostradas — vazio = válido.
 * Pura e testável: a tela só decide o que fazer com a lista.
 */
export function validarCamposLancamento(dados: DadosLancamento): string[] {
  const erros: string[] = [];
  if (!dados.dataLiberacao) erros.push('Informe a data da liberação.');
  if (!dados.status) erros.push('Selecione a situação: Aprovado ou Reprovado.');

  const campos = camposDaEtapa(dados.etapaId);
  if (campos.exigeRastreabilidade && !dados.rastreabilidade?.trim()) {
    erros.push('Informe a rastreabilidade da chapa.');
  }
  if (campos.exigeRecurso && !dados.recursoId) {
    erros.push('Selecione a máquina/recurso utilizado.');
  }
  if (campos.exigeExecucao && !dados.execucaoEmpresa) {
    erros.push('Selecione a execução: TEN ou TECOI.');
  }
  return erros;
}

/**
 * Regra RN-02 do NAV1: uma etapa só libera a peça para a etapa seguinte
 * quando o lançamento é APROVADO. Pura para poder ser testada sem RPC — a
 * fonte de verdade continua sendo `prod_registrar_lancamento` no banco, que
 * repete esta checagem antes de aceitar o encadeamento.
 */
export function liberaProximaEtapa(status: StatusLancamento): boolean {
  return status === 'aprovado';
}

/** Normaliza um campo decimal digitado com vírgula ou ponto; `''`/inválido → null. */
export function normalizarDecimal(v: string | null | undefined): number | null {
  if (v == null) return null;
  const limpo = v.trim().replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Faixa cadastrada de uma medida dimensional. Limite ausente significa que aquele lado é livre. */
export interface ToleranciaProducao {
  medida: string;
  minimo?: number | null;
  maximo?: number | null;
}

/** Uma medição que saiu da faixa — pronta para a UI destacar o campo. */
export interface MedicaoForaDaTolerancia {
  medida: string;
  valor: number;
  minimo: number | null;
  maximo: number | null;
}

/**
 * Compara apenas valores realmente informados contra as tolerâncias da peça.
 * Medidas sem tolerância e campos vazios não são tratadas como falha: a regra
 * de completude é decidida separadamente por `deveExigirMedicoesEvs`.
 */
export function avaliarTolerancias(
  medicoes: Record<string, number | null | undefined>,
  tolerancias: ToleranciaProducao[],
): MedicaoForaDaTolerancia[] {
  return tolerancias.flatMap(t => {
    const valor = medicoes[t.medida];
    if (valor == null || !Number.isFinite(valor)) return [];
    const abaixo = t.minimo != null && valor < t.minimo;
    const acima = t.maximo != null && valor > t.maximo;
    return abaixo || acima
      ? [{ medida: t.medida, valor, minimo: t.minimo ?? null, maximo: t.maximo ?? null }]
      : [];
  });
}

/** Regra B2: aprovação dentro da faixa pode seguir pelo caminho curto. */
export function deveExigirMedicoesEvs(status: StatusLancamento, haForaDaTolerancia: boolean): boolean {
  return status === 'pendente' || status === 'reprovado' || status === 'refugado' || haForaDaTolerancia;
}

export interface LancamentoIndicador {
  etapaId: string;
  status: StatusLancamento;
  tentativa: number;
}

/** Indicadores simples e estáveis para o painel: percentual sempre de 0 a 100. */
export function calcularIndicadoresQualidade(lancamentos: LancamentoIndicador[]): {
  total: number;
  fpy: number;
  retrabalho: number;
  wip: number;
} {
  const total = lancamentos.length;
  if (!total) return { total: 0, fpy: 0, retrabalho: 0, wip: 0 };
  const primeiraAprovacao = lancamentos.filter(l => l.status === 'aprovado' && l.tentativa === 1).length;
  const retrabalhos = lancamentos.filter(l => l.tentativa > 1).length;
  const wip = lancamentos.filter(l => l.status === 'pendente' || l.status === 'reprovado').length;
  return {
    total,
    fpy: Math.round((primeiraAprovacao / total) * 100),
    retrabalho: Math.round((retrabalhos / total) * 100),
    wip,
  };
}

export interface RelatorioDiarioLinha {
  data: string;
  total: number;
  aprovados: number;
  reprovados: number;
  refugados: number;
  pendentes: number;
}

/** Consolida o relatório diário a partir dos lançamentos; não há contadores manuais duplicados. */
export function calcularRelatorioDiario(
  lancamentos: Array<{ data_liberacao: string; status: StatusLancamento }>,
): RelatorioDiarioLinha[] {
  const porData = new Map<string, RelatorioDiarioLinha>();
  for (const lancamento of lancamentos) {
    const data = lancamento.data_liberacao.slice(0, 10);
    const linha = porData.get(data) ?? { data, total: 0, aprovados: 0, reprovados: 0, refugados: 0, pendentes: 0 };
    linha.total += 1;
    if (lancamento.status === 'aprovado') linha.aprovados += 1;
    if (lancamento.status === 'reprovado') linha.reprovados += 1;
    if (lancamento.status === 'refugado') linha.refugados += 1;
    if (lancamento.status === 'pendente') linha.pendentes += 1;
    porData.set(data, linha);
  }
  return [...porData.values()].sort((a, b) => b.data.localeCompare(a.data));
}

/** Ordem física do plano: o topo da torre (T5) antecede a base (T1). */
const ORDEM_TRAMOS_EXPEDICAO: Record<string, number> = { T5: 1, T4: 2, T3: 3, T2: 4, T1: 5 };

/** Situação operacional de cada tramo no plano de expedição. */
export type StatusPlanoExpedicao = 'a_faturar' | 'faturado' | 'expedido';

/** Totais que alimentam os cartões do relatório, sempre a partir das linhas filtradas. */
export function resumirPlanoExpedicao(
  linhas: Array<{ status: StatusPlanoExpedicao; data_expedicao?: string | null }>,
): { total: number; faturados: number; expedidos: number; aFaturar: number } {
  const expedidos = linhas.filter(linha => linha.status === 'expedido').length;
  const aFaturar = linhas.filter(linha => linha.status === 'a_faturar').length;
  return {
    total: linhas.length,
    faturados: linhas.length - aFaturar,
    expedidos,
    aFaturar,
  };
}

/** Mantém a programação de expedição estável mesmo quando a API retorna linhas fora da ordem. */
export function ordenarPlanoExpedicao<T extends { semana: number; torre_numero: number; tramo: string }>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) =>
    a.semana - b.semana
    || a.torre_numero - b.torre_numero
    || (ORDEM_TRAMOS_EXPEDICAO[a.tramo] ?? Number.MAX_SAFE_INTEGER) - (ORDEM_TRAMOS_EXPEDICAO[b.tramo] ?? Number.MAX_SAFE_INTEGER)
    || a.tramo.localeCompare(b.tramo),
  );
}
