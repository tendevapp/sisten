/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação detalhada do relatório de Realizado por Rubrica (Financeiro),
 * para auditoria: uma aba com o resumo por rubrica (mesma árvore da tela) e
 * duas abas linha-a-linha (`vw_fin_pedidos_detalhe_rubrica` e
 * `vw_fin_pagamentos_detalhe_rubrica`) mostrando, para cada pedido/pagamento,
 * qual rubrica foi atribuída e por qual regra (fornecedor ou grupo de
 * mercadoria) — para conferir se a classificação está correta.
 */

import * as XLSX from 'xlsx-js-style';
import { supabase } from '../db/supabaseClient';
import type { FinRealizadoRubricaLinha } from '../types';
import { obterRelatorioRealizadoPorRubrica } from './rubricasFinanceiroApi';

const ESTILO_CABECALHO = {
  fill: { fgColor: { rgb: '0F2952' } },
  font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  },
} as const;

const ESTILO_PADRAO = {
  font: { sz: 9 },
  alignment: { vertical: 'top' },
  border: { left: { style: 'thin', color: { rgb: 'E5E7EB' } }, right: { style: 'thin', color: { rgb: 'E5E7EB' } }, bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } },
} as const;

function montarPlanilha(cabecalho: string[], linhas: (string | number | null)[][], largura: number[]): XLSX.WorkSheet {
  const dados = [cabecalho, ...linhas];
  const ws = XLSX.utils.aoa_to_sheet(dados);

  cabecalho.forEach((_, colIdx) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws[ref]) ws[ref].s = ESTILO_CABECALHO;
  });

  for (let r = 1; r <= linhas.length; r++) {
    cabecalho.forEach((_, colIdx) => {
      const ref = XLSX.utils.encode_cell({ r, c: colIdx });
      if (!ws[ref]) return;
      ws[ref].s = ESTILO_PADRAO;
    });
  }

  ws['!cols'] = largura.map(wch => ({ wch }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: cabecalho.length - 1 } }) };

  return ws;
}

/** Achata a árvore de rollup em linhas planas, com o nome indentado por nível — mesma leitura da tela. */
function achatarResumo(linhas: FinRealizadoRubricaLinha[]): (string | number | null)[][] {
  const resultado: (string | number | null)[][] = [];
  const visitar = (linha: FinRealizadoRubricaLinha) => {
    const nome = linha.rubrica ? `${'— '.repeat(linha.nivel)}${linha.rubrica.nome}` : 'Sem rubrica (sem mapeamento cadastrado)';
    resultado.push([nome, linha.valorPedidos, linha.qtdPedidos, linha.valorPagamentos]);
    linha.filhos.forEach(visitar);
  };
  linhas.forEach(visitar);
  return resultado;
}

interface PedidoDetalheRow {
  doc_compra: string | null;
  item: string | null;
  data_doc: string | null;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  grupo_mercadoria_codigo: string | null;
  grupo_mercadoria_nome: string | null;
  material_descricao: string | null;
  contrato: string | null;
  valor: number | null;
  rubrica_nome: string | null;
  origem_mapeamento: string | null;
}

interface PagamentoDetalheRow {
  numero_documento: string | null;
  documento_compras: string | null;
  data_pagamento: string | null;
  data_lancamento: string | null;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  grupo_mercadoria_codigo: string | null;
  grupo_mercadoria_nome: string | null;
  tipo_documento: string | null;
  valor: number | null;
  rubrica_nome: string | null;
  origem_mapeamento: string | null;
}

const rotuloOrigem = (o: string | null) => {
  if (o === 'fornecedor') return 'Fornecedor';
  if (o === 'grupo_mercadoria') return 'Grupo de Mercadoria';
  return 'Sem mapeamento';
};

/**
 * Busca o resumo + o detalhe linha-a-linha de pedidos e pagamentos e gera o
 * Excel de auditoria (3 abas: Resumo, Pedidos, Pagamentos). Mesmo recorte de
 * data das views (>= 2026-01-01).
 */
export async function exportarRealizadoPorRubricaXlsx(): Promise<void> {
  const [relatorio, pedidosRes, pagamentosRes] = await Promise.all([
    obterRelatorioRealizadoPorRubrica(),
    (supabase as any)
      .from('vw_fin_pedidos_detalhe_rubrica')
      .select('*')
      .order('rubrica_nome', { nullsFirst: true })
      .order('valor', { ascending: false }),
    (supabase as any)
      .from('vw_fin_pagamentos_detalhe_rubrica')
      .select('*')
      .order('rubrica_nome', { nullsFirst: true })
      .order('valor', { ascending: false }),
  ]);

  if (pedidosRes.error) throw new Error(`Erro ao consultar detalhe de pedidos: ${pedidosRes.error.message}`);
  if (pagamentosRes.error) throw new Error(`Erro ao consultar detalhe de pagamentos: ${pagamentosRes.error.message}`);

  const pedidos = (pedidosRes.data || []) as PedidoDetalheRow[];
  const pagamentos = (pagamentosRes.data || []) as PagamentoDetalheRow[];

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    montarPlanilha(
      ['Rubrica', 'Pedidos Colocados (R$)', 'Qtd. Pedidos', 'Pagamentos Realizados (R$)'],
      achatarResumo(relatorio.linhas),
      [55, 20, 14, 24],
    ),
    'Resumo',
  );

  XLSX.utils.book_append_sheet(
    wb,
    montarPlanilha(
      ['Rubrica', 'Origem do Mapeamento', 'Doc. Compra', 'Item', 'Data', 'Fornecedor (Código)', 'Fornecedor (Nome)', 'Grupo Mercadoria (Código)', 'Grupo Mercadoria (Nome)', 'Material (Descrição)', 'Contrato', 'Valor (R$)'],
      pedidos.map(p => [
        p.rubrica_nome || 'Sem rubrica',
        rotuloOrigem(p.origem_mapeamento),
        p.doc_compra,
        p.item,
        p.data_doc,
        p.fornecedor_codigo,
        p.fornecedor_nome,
        p.grupo_mercadoria_codigo,
        p.grupo_mercadoria_nome,
        p.material_descricao,
        p.contrato,
        p.valor ?? 0,
      ]),
      [30, 18, 14, 8, 12, 16, 32, 16, 26, 34, 14, 16],
    ),
    'Pedidos',
  );

  XLSX.utils.book_append_sheet(
    wb,
    montarPlanilha(
      ['Rubrica', 'Origem do Mapeamento', 'Nº Documento', 'Doc. Compras (PO)', 'Data Pagamento', 'Data Lançamento', 'Fornecedor (Código)', 'Fornecedor (Nome)', 'Grupo Mercadoria (Código)', 'Grupo Mercadoria (Nome)', 'Tipo Documento', 'Valor (R$)'],
      pagamentos.map(p => [
        p.rubrica_nome || 'Sem rubrica',
        rotuloOrigem(p.origem_mapeamento),
        p.numero_documento,
        p.documento_compras,
        p.data_pagamento,
        p.data_lancamento,
        p.fornecedor_codigo,
        p.fornecedor_nome,
        p.grupo_mercadoria_codigo,
        p.grupo_mercadoria_nome,
        p.tipo_documento,
        p.valor ?? 0,
      ]),
      [30, 18, 16, 16, 14, 14, 16, 32, 16, 26, 16, 16],
    ),
    'Pagamentos',
  );

  XLSX.writeFile(wb, `realizado-por-rubrica-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
