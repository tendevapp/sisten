/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório "Prazo por etapa" — meta de ter os 115 tramos da 1ª fase prontos
 * na W49, com uma data final por etapa (Corte → Montagem Final).
 *
 * Os números vêm da RPC prod_relatorio_etapas_tramos, calculados a partir dos
 * apontamentos por tramo: a etapa está pronta quando o tramo chega ao ponto
 * seguinte do fluxo. Aqui ficam só as contas de prazo, testáveis:
 *   - dias restantes = seg–sáb de hoje até a data final (inclusive), sem os
 *     feriados do calendário do Planejamento — a mesma conta da planilha;
 *   - ritmo necessário × ritmo real (últimos dias úteis) e projeção.
 */

import { supabase } from '../db/supabaseClient';
import { adicionarDias, semanaISO } from './producaoApontamentos';

export interface EtapaRelatorioBruta {
  codigo: string;
  nome: string;
  ordem: number;
  escopo: 'todos' | 'T1';
  dataFinal: string | null;
  regraValida: boolean;
  total: number;
  /** Data (yyyy-MM-dd) em que cada tramo concluiu a etapa. */
  datas: string[];
}

export interface DadosRelatorioEtapas {
  hoje: string;
  etapas: EtapaRelatorioBruta[];
  feriados: string[];
}

export type StatusEtapa = 'concluida' | 'no_prazo' | 'risco' | 'atrasada';

export interface LinhaRelatorioEtapa {
  codigo: string;
  nome: string;
  escopo: 'todos' | 'T1';
  total: number;
  prontos: number;
  falta: number;
  percentual: number;
  dataFinal: string | null;
  /** Dias úteis (seg–sáb, sem feriados) de hoje até a data final, inclusive; negativo = dias de atraso. */
  diasRestantes: number | null;
  ritmoNecessario: number | null;
  ritmoReal: number;
  /** Data em que a etapa termina no ritmo real. */
  previsao: string | null;
  status: StatusEtapa;
  regraValida: boolean;
}

/** Janela do ritmo real: os últimos 12 dias úteis (~2 semanas de seg a sáb). */
export const JANELA_RITMO_DIAS_UTEIS = 12;

const diaSemana = (dataISO: string): number => {
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

export const ehDiaUtil = (dataISO: string, feriados: ReadonlySet<string>): boolean =>
  diaSemana(dataISO) !== 0 && !feriados.has(dataISO);

/** Dias úteis (seg–sáb, sem feriados) de `de` a `ate`, inclusive. */
export function contarDiasUteis(de: string, ate: string, feriados: ReadonlySet<string>): number {
  if (ate < de) return 0;
  let n = 0;
  for (let d = de; d <= ate; d = adicionarDias(d, 1)) if (ehDiaUtil(d, feriados)) n += 1;
  return n;
}

/** Dias úteis até a data final (inclusive hoje); se já passou, dias úteis de atraso (negativo). */
export function diasRestantes(hoje: string, dataFinal: string, feriados: ReadonlySet<string>): number {
  if (dataFinal >= hoje) return contarDiasUteis(hoje, dataFinal, feriados);
  return -contarDiasUteis(adicionarDias(dataFinal, 1), hoje, feriados);
}

/** Os `n` últimos dias úteis terminando ontem (o dia de hoje ainda está em andamento). */
export function janelaDiasUteis(hoje: string, n: number, feriados: ReadonlySet<string>): { de: string; ate: string } {
  const ate = adicionarDias(hoje, -1);
  let d = ate;
  let contados = 0;
  let de = ate;
  while (contados < n) {
    if (ehDiaUtil(d, feriados)) {
      contados += 1;
      de = d;
    }
    d = adicionarDias(d, -1);
  }
  return { de, ate };
}

/** Data em que `quantidade` dias úteis, contando a partir de hoje, terminam. */
export function somarDiasUteis(hoje: string, quantidade: number, feriados: ReadonlySet<string>): string {
  let d = hoje;
  let restantes = Math.max(1, Math.ceil(quantidade));
  for (;;) {
    if (ehDiaUtil(d, feriados)) {
      restantes -= 1;
      if (restantes === 0) return d;
    }
    d = adicionarDias(d, 1);
  }
}

export function montarLinhas(dados: DadosRelatorioEtapas): LinhaRelatorioEtapa[] {
  const feriados = new Set(dados.feriados);
  const { de, ate } = janelaDiasUteis(dados.hoje, JANELA_RITMO_DIAS_UTEIS, feriados);
  return [...dados.etapas]
    .sort((a, b) => a.ordem - b.ordem)
    .map(e => {
      const prontos = e.datas.length;
      const falta = Math.max(0, e.total - prontos);
      const recentes = e.datas.filter(d => d >= de && d <= ate).length;
      const ritmoReal = recentes / JANELA_RITMO_DIAS_UTEIS;
      const dias = e.dataFinal ? diasRestantes(dados.hoje, e.dataFinal, feriados) : null;
      const ritmoNecessario = falta === 0 || dias === null ? null : dias > 0 ? falta / dias : Infinity;
      const previsao = falta === 0 ? null : ritmoReal > 0 ? somarDiasUteis(dados.hoje, falta / ritmoReal, feriados) : null;
      let status: StatusEtapa;
      if (falta === 0) status = 'concluida';
      else if (dias !== null && dias <= 0) status = 'atrasada';
      else if (!e.dataFinal || (previsao !== null && previsao <= e.dataFinal)) status = 'no_prazo';
      else status = 'risco';
      return {
        codigo: e.codigo,
        nome: e.nome,
        escopo: e.escopo,
        total: e.total,
        prontos,
        falta,
        percentual: e.total ? prontos / e.total : 0,
        dataFinal: e.dataFinal,
        diasRestantes: dias,
        ritmoNecessario,
        ritmoReal,
        previsao,
        status,
        regraValida: e.regraValida,
      };
    });
}

/** "W49" da última data final — a semana da meta. */
export function semanaMeta(linhas: Pick<LinhaRelatorioEtapa, 'dataFinal'>[]): string | null {
  const datas = linhas.map(l => l.dataFinal).filter((d): d is string => Boolean(d)).sort();
  const ultima = datas[datas.length - 1];
  return ultima ? `W${String(semanaISO(ultima).semana).padStart(2, '0')}` : null;
}

export const dataDiaMes = (dataISO: string): string => {
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${dataISO.slice(8, 10)}/${meses[Number(dataISO.slice(5, 7)) - 1]}`;
};

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export async function buscarRelatorioEtapas(): Promise<DadosRelatorioEtapas> {
  const { data, error } = await (supabase.rpc as any)('prod_relatorio_etapas_tramos');
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Sem sessão para ler o relatório.');
  return {
    hoje: String(data.hoje),
    feriados: (data.feriados ?? []).map(String),
    etapas: (data.etapas ?? []).map((e: any) => ({
      codigo: e.codigo,
      nome: e.nome,
      ordem: Number(e.ordem),
      escopo: e.escopo,
      dataFinal: e.dataFinal ?? null,
      regraValida: Boolean(e.regraValida),
      total: Number(e.total),
      datas: (e.datas ?? []).map(String),
    })),
  };
}

export interface EtapaRelatorioCadastro {
  codigo: string;
  nome: string;
  ordem: number;
  regraTipo: 'marco' | 'setor';
  regraValor: string;
  escopo: 'todos' | 'T1';
  dataFinal: string | null;
}

export async function listarEtapasRelatorio(): Promise<EtapaRelatorioCadastro[]> {
  const { data, error } = await (supabase.from as any)('prod_apt_relatorio_etapas')
    .select('codigo,nome,ordem,regra_tipo,regra_valor,escopo,data_final')
    .eq('ativo', true)
    .order('ordem');
  if (error) throw new Error(error.message);
  return (data ?? []).map((l: any) => ({
    codigo: l.codigo,
    nome: l.nome,
    ordem: Number(l.ordem),
    regraTipo: l.regra_tipo,
    regraValor: l.regra_valor,
    escopo: l.escopo,
    dataFinal: l.data_final,
  }));
}

export async function salvarDatasFinais(alteracoes: Array<{ codigo: string; dataFinal: string | null }>): Promise<void> {
  for (const a of alteracoes) {
    const { error } = await (supabase.from as any)('prod_apt_relatorio_etapas')
      .update({ data_final: a.dataFinal || null, atualizado_em: new Date().toISOString() })
      .eq('codigo', a.codigo);
    if (error) throw new Error(error.message);
  }
}

