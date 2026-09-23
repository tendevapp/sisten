/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carrega e gera o Excel "Fornecedores × ZL0136 mês a mês" (Admin → Exportar).
 * A regra de montagem fica em `fornecedoresPlanilha.ts`.
 */

import * as XLSX from 'xlsx-js-style';
import { supabase } from '../db/supabaseClient';
import { carregarLinhasRealizadoNf } from './rubricasFinanceiroApi';
import {
  LinhaPlanilhaFornecedor, montarExportFornecedores, ResultadoExportFornecedores, rotuloMes,
} from './fornecedoresPlanilha';

export async function listarPlanilhaFornecedores(): Promise<LinhaPlanilhaFornecedor[]> {
  const { data, error } = await (supabase as any)
    .from('fin_fornecedores_planilha')
    .select('*')
    .order('ordem');
  if (error) {
    console.warn('[exportFornecedoresPlanilha] Erro ao consultar fin_fornecedores_planilha:', error);
    throw error;
  }
  return (data || []).map((l: any) => ({ ...l, fornecedor_codigos: l.fornecedor_codigos || [] }));
}

/** Busca a lista e as NFs e monta o resultado até o último mês com NF lançada. */
export async function carregarExportFornecedores(): Promise<ResultadoExportFornecedores> {
  const [planilha, linhasNf] = await Promise.all([listarPlanilhaFornecedores(), carregarLinhasRealizadoNf()]);
  const mesFinal = linhasNf.reduce((max, l) => {
    const m = (l.data_lancamento || '').slice(0, 7);
    return m > max ? m : max;
  }, '2026-01');
  return montarExportFornecedores(planilha, linhasNf, mesFinal);
}

const BORDA = { style: 'thin', color: { rgb: 'E5E7EB' } } as const;
const E_CABECALHO = {
  fill: { fgColor: { rgb: '0F2952' } },
  font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA },
};
const E_TEXTO = { font: { sz: 9 }, alignment: { vertical: 'top', wrapText: true }, border: { left: BORDA, right: BORDA, bottom: BORDA } };
const E_NUMERO = { ...E_TEXTO, numFmt: '#,##0.00;[Red]-#,##0.00;"-"', alignment: { vertical: 'top', horizontal: 'right' } };
const E_SECAO = { font: { bold: true, sz: 10, color: { rgb: '0F2952' } }, fill: { fgColor: { rgb: 'DBEAFE' } } };
const E_SUBTOTAL = { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'F1F5F9' } }, border: { top: BORDA, bottom: BORDA } };
const E_SUBTOTAL_NUM = { ...E_SUBTOTAL, numFmt: '#,##0.00;[Red]-#,##0.00;"-"', alignment: { horizontal: 'right' } };
const E_SEM_VINCULO = { ...E_TEXTO, font: { sz: 9, italic: true, color: { rgb: '9A3412' } } };

type Celula = { v: string | number | null; s: object; t?: 's' | 'n' };

function aplicar(ws: XLSX.WorkSheet, r: number, celulas: Celula[]) {
  celulas.forEach((c, i) => {
    const ref = XLSX.utils.encode_cell({ r, c: i });
    if (c.v === null || c.v === '') {
      ws[ref] = { t: 's', v: '', s: c.s };
    } else {
      ws[ref] = { t: typeof c.v === 'number' ? 'n' : 's', v: c.v, s: c.s };
    }
  });
}

export function gerarXlsxFornecedores(res: ResultadoExportFornecedores): void {
  const wb = XLSX.utils.book_new();
  const rotulosMeses = res.meses.map(rotuloMes);

  // --- Aba principal ----------------------------------------------------------
  const cab = [
    'Seção', 'Fornecedor (planilha)', 'Código(s) SAP', 'Nome no SAP', 'Principais itens comprados (2026)', 'Rubrica(s)',
    ...rotulosMeses, 'Total 2026', 'Fora do realizado (remessa/retorno/ativo)', 'Observação',
  ];
  const ws: XLSX.WorkSheet = {};
  let r = 0;
  aplicar(ws, r++, cab.map(v => ({ v, s: E_CABECALHO })));

  const secoes: string[] = [];
  for (const l of res.linhas) if (!secoes.includes(l.secao)) secoes.push(l.secao);
  const linhasSecao: number[] = [];
  const merges: XLSX.Range[] = [];

  for (const secao of secoes) {
    aplicar(ws, r, cab.map((_, i) => ({ v: i === 0 ? secao : '', s: E_SECAO })));
    merges.push({ s: { r, c: 0 }, e: { r, c: cab.length - 1 } });
    r++;
    const doGrupo = res.linhas.filter(l => l.secao === secao);
    const somaMes: Record<string, number> = Object.fromEntries(res.meses.map(m => [m, 0]));
    let somaTotal = 0;
    let somaFora = 0;
    for (const l of doGrupo) {
      const estiloTexto = l.situacao === 'sem_vinculo' ? E_SEM_VINCULO : E_TEXTO;
      const semValor = l.situacao === 'sem_vinculo' || l.situacao === 'lancamento_sem_nf';
      aplicar(ws, r++, [
        { v: l.secao, s: estiloTexto },
        { v: l.nomePlanilha, s: estiloTexto },
        { v: l.codigos.join(', '), s: estiloTexto },
        { v: l.nomesSap.join(' / '), s: estiloTexto },
        { v: l.principaisItens || (l.situacao === 'sem_nf_2026' ? 'Sem NF em 2026' : ''), s: estiloTexto },
        { v: l.rubricas.join(', '), s: estiloTexto },
        ...res.meses.map(m => ({ v: semValor ? null : (l.valoresMes[m] || 0), s: E_NUMERO })),
        { v: semValor ? null : l.total, s: E_NUMERO },
        { v: semValor ? null : l.foraDoRealizado, s: E_NUMERO },
        { v: l.observacao, s: estiloTexto },
      ]);
      for (const m of res.meses) somaMes[m] += l.valoresMes[m] || 0;
      somaTotal += l.total;
      somaFora += l.foraDoRealizado;
    }
    linhasSecao.push(r);
    aplicar(ws, r++, [
      { v: `Subtotal — ${secao}`, s: E_SUBTOTAL }, { v: '', s: E_SUBTOTAL }, { v: '', s: E_SUBTOTAL },
      { v: '', s: E_SUBTOTAL }, { v: '', s: E_SUBTOTAL }, { v: '', s: E_SUBTOTAL },
      ...res.meses.map(m => ({ v: somaMes[m], s: E_SUBTOTAL_NUM })),
      { v: somaTotal, s: E_SUBTOTAL_NUM }, { v: somaFora, s: E_SUBTOTAL_NUM }, { v: '', s: E_SUBTOTAL },
    ]);
  }

  r++;
  const totalFora = res.foraDaLista.reduce((s, f) => s + f.total, 0);
  const resumo: [string, number][] = [
    ['Total da lista (fornecedor repetido contado uma vez)', res.totalListaSemDuplicidade],
    ['Fornecedores com NF em 2026 fora da lista (aba "Fora da lista")', totalFora],
    ['Total realizado ZL0136 no período (todos os fornecedores)', res.totalRealizadoGeral],
  ];
  const colTotal = 6 + res.meses.length;
  for (const [rotulo, valor] of resumo) {
    aplicar(ws, r, cab.map((_, i) => ({
      v: i === 1 ? rotulo : i === colTotal ? valor : '',
      s: i === colTotal ? E_SUBTOTAL_NUM : E_SUBTOTAL,
    })));
    r++;
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: cab.length - 1 } });
  ws['!cols'] = [
    { wch: 18 }, { wch: 34 }, { wch: 14 }, { wch: 30 }, { wch: 60 }, { wch: 24 },
    ...res.meses.map(() => ({ wch: 12 })), { wch: 14 }, { wch: 16 }, { wch: 40 },
  ];
  ws['!merges'] = merges;
  ws['!freeze'] = { xSplit: 2, ySplit: 1 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: cab.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores x ZL0136');

  // --- Fora da lista ----------------------------------------------------------
  const wsFora: XLSX.WorkSheet = {};
  const cabFora = ['Código SAP', 'Fornecedor', 'Principais itens comprados (2026)', 'Rubrica(s)', 'Total 2026'];
  aplicar(wsFora, 0, cabFora.map(v => ({ v, s: E_CABECALHO })));
  res.foraDaLista.forEach((f, i) => aplicar(wsFora, i + 1, [
    { v: f.codigo, s: E_TEXTO }, { v: f.nome, s: E_TEXTO }, { v: f.principaisItens, s: E_TEXTO },
    { v: f.rubricas.join(', '), s: E_TEXTO }, { v: f.total, s: E_NUMERO },
  ]));
  wsFora['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(res.foraDaLista.length, 1), c: 4 } });
  wsFora['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 70 }, { wch: 30 }, { wch: 16 }];
  wsFora['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsFora, 'Fora da lista');

  // --- Leia-me ------------------------------------------------------------------
  const notas = [
    ['Como ler esta planilha'],
    [''],
    ['Fonte: notas fiscais de entrada de fornecedor (SAP ZL0136), por data de lançamento, de jan/26 até o último mês com NF lançada.'],
    ['Valores mensais = só o que é custo (material de produção, uso e consumo, serviço, frete, energia, comunicação). Devolução ao fornecedor abate.'],
    ['"Fora do realizado" = remessa, retorno, comodato, outras entradas e imobilizado do mesmo fornecedor — mostrado à parte, não entra nos meses.'],
    ['Principais itens = os itens de maior valor do fornecedor em 2026, com a participação no total dele.'],
    ['Um fornecedor pode ter vários códigos SAP (matriz/filiais); a linha soma todos. Os códigos estão na 3ª coluna.'],
    ['Air Liquide aparece em duas linhas: locação (só serviços) e gás (só materiais).'],
    ['Linhas repetidas na lista original (ex.: AQUA LOAD, MEGAPLASMA, LACLAW) estão sinalizadas na coluna Observação; o total da lista conta cada uma uma vez.'],
    ['Linhas em itálico laranja: nome não encontrado no cadastro SAP. Informe o código para vincular.'],
    ['Linhas do FINANCEIRO (juros, empréstimos, tarifas) e caixinha não passam pela ZL0136.'],
  ];
  const wsNotas = XLSX.utils.aoa_to_sheet(notas);
  wsNotas['A1'].s = { font: { bold: true, sz: 12 } };
  wsNotas['!cols'] = [{ wch: 140 }];
  XLSX.utils.book_append_sheet(wb, wsNotas, 'Leia-me');

  XLSX.writeFile(wb, `fornecedores-zl0136-mensal-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
