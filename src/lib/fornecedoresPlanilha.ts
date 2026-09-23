/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação "Fornecedores × ZL0136 mês a mês" (Admin → Exportar).
 *
 * Parte da lista de fornecedores do controle orçamentário do Financeiro
 * (`fin_fornecedores_planilha`, na ordem e nas seções da planilha deles),
 * já vinculada aos códigos SAP, e monta por linha: o que se compra do
 * fornecedor (principais itens) e o valor de NF da ZL0136 mês a mês desde
 * jan/26, pela data de lançamento.
 *
 * O valor mensal é o que entra no realizado (custo): remessa, retorno,
 * comodato e imobilizado ficam numa coluna à parte, para não inflar o mês
 * sem sumir da vista. Devolução ao fornecedor abate.
 */

import type { LinhaNfRealizado } from './realizadoRubricaNf';

export interface LinhaPlanilhaFornecedor {
  id: string;
  secao: string;
  ordem: number;
  nome_planilha: string;
  tipo: 'fornecedor' | 'lancamento_sem_nf';
  fornecedor_codigos: string[];
  filtro_tipo_item: 'MATERIAL' | 'SERVICO' | null;
  observacao: string | null;
}

export type SituacaoVinculo = 'com_nf' | 'sem_nf_2026' | 'sem_vinculo' | 'lancamento_sem_nf';

export interface LinhaExportFornecedor {
  secao: string;
  ordem: number;
  nomePlanilha: string;
  codigos: string[];
  nomesSap: string[];
  principaisItens: string;
  rubricas: string[];
  /** YYYY-MM -> valor. */
  valoresMes: Record<string, number>;
  total: number;
  foraDoRealizado: number;
  situacao: SituacaoVinculo;
  observacao: string;
}

export interface ForaDaLista {
  codigo: string;
  nome: string;
  principaisItens: string;
  rubricas: string[];
  total: number;
}

export interface ResultadoExportFornecedores {
  meses: string[];
  linhas: LinhaExportFornecedor[];
  foraDaLista: ForaDaLista[];
  /** Total da lista sem contar duas vezes o mesmo fornecedor listado em linhas diferentes. */
  totalListaSemDuplicidade: number;
  totalRealizadoGeral: number;
}

const MES_INICIAL = '2026-01';
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-03" -> "mar/26". Fatia a string — nunca `new Date(iso)` (fuso). */
export function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  return `${MESES_ABREV[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
}

/** Meses de jan/26 até o mês informado (inclusive). */
export function mesesAte(mesFinal: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = MES_INICIAL.split('-').map(Number);
  const [anoFim, mesFim] = mesFinal.split('-').map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return meses;
}

const chaveVinculo = (codigos: string[], filtro: string | null) => `${[...codigos].sort().join(',')}|${filtro ?? ''}`;

/**
 * Resumo curto do que se compra: os itens de maior valor com a participação,
 * p.ex. "ARAME SOLDA E71T-1 (62%); FLUXO SOLDA (21%); +8 itens".
 */
export function resumirItens(linhas: LinhaNfRealizado[], max = 4): string {
  const porItem = new Map<string, number>();
  let total = 0;
  for (const l of linhas) {
    const desc = (l.descricao_item || 'Sem descrição').trim();
    const v = Math.abs(Number(l.valor) || 0);
    porItem.set(desc, (porItem.get(desc) || 0) + v);
    total += v;
  }
  const ordenados = Array.from(porItem.entries()).sort((a, b) => b[1] - a[1]);
  const partes = ordenados.slice(0, max).map(([desc, v]) => (total > 0 ? `${desc} (${Math.round((v / total) * 100)}%)` : desc));
  const resto = ordenados.length - max;
  if (resto > 0) partes.push(`+${resto} ${resto === 1 ? 'item' : 'itens'}`);
  return partes.join('; ');
}

const pertenceAoFiltro = (l: LinhaNfRealizado, filtro: LinhaPlanilhaFornecedor['filtro_tipo_item']) =>
  !filtro || l.tipo_item === filtro;

export function montarExportFornecedores(
  planilha: LinhaPlanilhaFornecedor[],
  linhasNf: LinhaNfRealizado[],
  mesFinal: string,
): ResultadoExportFornecedores {
  const meses = mesesAte(mesFinal);
  const noPeriodo = linhasNf.filter(l => {
    const mes = (l.data_lancamento || '').slice(0, 7);
    return mes >= MES_INICIAL && mes <= mesFinal;
  });

  const porCodigo = new Map<string, LinhaNfRealizado[]>();
  for (const l of noPeriodo) {
    const lista = porCodigo.get(l.fornecedor_codigo) ?? [];
    lista.push(l);
    porCodigo.set(l.fornecedor_codigo, lista);
  }

  // Mesmo vínculo (códigos + filtro) em mais de uma linha da planilha.
  const linhasPorVinculo = new Map<string, LinhaPlanilhaFornecedor[]>();
  for (const p of planilha) {
    if (p.tipo !== 'fornecedor' || p.fornecedor_codigos.length === 0) continue;
    const k = chaveVinculo(p.fornecedor_codigos, p.filtro_tipo_item);
    linhasPorVinculo.set(k, [...(linhasPorVinculo.get(k) ?? []), p]);
  }

  const codigosDaLista = new Set<string>();
  const vinculosSomados = new Set<string>();
  let totalListaSemDuplicidade = 0;

  const linhas = [...planilha].sort((a, b) => a.ordem - b.ordem).map((p): LinhaExportFornecedor => {
    const base = {
      secao: p.secao,
      ordem: p.ordem,
      nomePlanilha: p.nome_planilha,
      codigos: p.fornecedor_codigos,
      valoresMes: {} as Record<string, number>,
    };

    if (p.tipo === 'lancamento_sem_nf') {
      return {
        ...base, nomesSap: [], principaisItens: '', rubricas: [], total: 0, foraDoRealizado: 0,
        situacao: 'lancamento_sem_nf',
        observacao: p.observacao || 'Lançamento financeiro — não passa pela ZL0136.',
      };
    }
    if (p.fornecedor_codigos.length === 0) {
      return {
        ...base, nomesSap: [], principaisItens: '', rubricas: [], total: 0, foraDoRealizado: 0,
        situacao: 'sem_vinculo',
        observacao: p.observacao || 'Nome não encontrado no cadastro SAP — informe o código do fornecedor.',
      };
    }

    p.fornecedor_codigos.forEach(c => codigosDaLista.add(c));
    const itens = p.fornecedor_codigos.flatMap(c => porCodigo.get(c) ?? []).filter(l => pertenceAoFiltro(l, p.filtro_tipo_item));
    const custo = itens.filter(l => l.entra_realizado);
    const fora = itens.filter(l => !l.entra_realizado);

    const valoresMes: Record<string, number> = {};
    for (const m of meses) valoresMes[m] = 0;
    for (const l of custo) {
      const m = (l.data_lancamento || '').slice(0, 7);
      if (m in valoresMes) valoresMes[m] += Number(l.valor) || 0;
    }
    const total = custo.reduce((s, l) => s + (Number(l.valor) || 0), 0);

    const k = chaveVinculo(p.fornecedor_codigos, p.filtro_tipo_item);
    const repetidas = (linhasPorVinculo.get(k) ?? []).filter(o => o.ordem !== p.ordem);
    if (!vinculosSomados.has(k)) {
      vinculosSomados.add(k);
      totalListaSemDuplicidade += total;
    }

    const obs: string[] = [];
    if (p.observacao) obs.push(p.observacao);
    if (repetidas.length > 0) {
      obs.push(`Mesmo fornecedor também em: ${repetidas.map(o => `${o.nome_planilha} (${o.secao})`).join('; ')} — não somar duas vezes.`);
    }
    if (p.filtro_tipo_item) obs.push(`Só itens de ${p.filtro_tipo_item === 'SERVICO' ? 'serviço' : 'material'} deste fornecedor.`);

    return {
      ...base,
      valoresMes,
      nomesSap: Array.from(new Set(itens.map(l => l.fornecedor_nome).filter(Boolean) as string[])),
      principaisItens: resumirItens(custo),
      rubricas: Array.from(new Set(custo.map(l => l.rubrica_nome || (l.natureza === 'MATERIAL_PRODUCAO' ? 'Material de produção' : 'Sem rubrica')))),
      total,
      foraDoRealizado: fora.reduce((s, l) => s + (Number(l.valor) || 0), 0),
      situacao: itens.length > 0 ? 'com_nf' : 'sem_nf_2026',
      observacao: obs.join(' '),
    };
  });

  const foraDaLista: ForaDaLista[] = [];
  for (const [codigo, itens] of porCodigo) {
    if (codigosDaLista.has(codigo)) continue;
    const custo = itens.filter(l => l.entra_realizado);
    if (custo.length === 0) continue;
    foraDaLista.push({
      codigo,
      nome: custo.find(l => l.fornecedor_nome)?.fornecedor_nome || codigo,
      principaisItens: resumirItens(custo),
      rubricas: Array.from(new Set(custo.map(l => l.rubrica_nome || (l.natureza === 'MATERIAL_PRODUCAO' ? 'Material de produção' : 'Sem rubrica')))),
      total: custo.reduce((s, l) => s + (Number(l.valor) || 0), 0),
    });
  }
  foraDaLista.sort((a, b) => b.total - a.total);

  const totalRealizadoGeral = noPeriodo.filter(l => l.entra_realizado).reduce((s, l) => s + (Number(l.valor) || 0), 0);

  return { meses, linhas, foraDaLista, totalListaSemDuplicidade, totalRealizadoGeral };
}
