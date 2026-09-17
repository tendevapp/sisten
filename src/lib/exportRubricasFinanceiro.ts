/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação detalhada do relatório de Realizado por Rubrica (Financeiro),
 * para auditoria: uma aba com o resumo por rubrica (mesma árvore da tela) e
 * duas abas linha-a-linha (`vw_fin_pedidos_detalhe_rubrica` e
 * `vw_fin_pagamentos_detalhe_rubrica`) com o máximo de campos do SAP
 * disponíveis — quantidade, preço unitário, requisitante, centro, depósito,
 * região, moeda, elemento PEP, vencimento, compensação etc. — além de qual
 * rubrica foi atribuída e por qual regra (fornecedor ou grupo de
 * mercadoria), para conferir a classificação sem precisar voltar ao banco.
 */

import * as XLSX from 'xlsx-js-style';
import { supabase } from '../db/supabaseClient';
import type { FinRealizadoRubricaLinha } from '../types';
import { obterRelatorioRealizadoPorRubrica, DetalhePedidoLinha, DetalhePagamentoLinha } from './rubricasFinanceiroApi';

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

const rotuloOrigem = (o: string | null) => {
  if (o === 'fornecedor') return 'Fornecedor';
  if (o === 'grupo_mercadoria') return 'Grupo de Mercadoria';
  return 'Sem mapeamento';
};

const CABECALHO_PEDIDOS = [
  'Rubrica', 'Origem do Mapeamento', 'Classificação Nível 1', 'Classificação Nível 2',
  'Doc. Compra', 'Item', 'Data Documento', 'Data RC', 'Requisição de Compra', 'Tipo Doc. Compra',
  'Contrato', 'Item Contrato',
  'Material (Código)', 'Material (Descrição)', 'Grupo Mercadoria (Código)', 'Grupo Mercadoria (Nome)',
  'Quantidade', 'Unidade', 'Preço Unitário (R$)', 'Valor (R$)',
  'Fornecedor (Código)', 'Fornecedor (Nome)', 'CNPJ Fornecedor',
  'Requisitante', 'Criado Por', 'Centro', 'Depósito', 'Região/UF', 'Moeda',
];

const LARGURA_PEDIDOS = [
  30, 18, 16, 26,
  14, 8, 12, 12, 16, 14,
  14, 12,
  14, 34, 16, 26,
  12, 10, 16, 16,
  16, 32, 18,
  14, 14, 10, 10, 10, 8,
];

function linhaPedido(p: DetalhePedidoLinha): (string | number | null)[] {
  return [
    p.rubrica_nome || 'Sem rubrica',
    rotuloOrigem(p.origem_mapeamento),
    p.classificacao_nivel1,
    p.classificacao_nivel2,
    p.doc_compra,
    p.item,
    p.data_doc,
    p.data_rc,
    p.requisicao_compra,
    p.tipo_doc_compra,
    p.contrato,
    p.item_contrato,
    p.material_codigo,
    p.material_descricao,
    p.grupo_mercadoria_codigo,
    p.grupo_mercadoria_nome,
    p.qtd_pedido,
    p.unidade_medida_pedido,
    p.preco_liquido_unit,
    p.valor ?? 0,
    p.fornecedor_codigo,
    p.fornecedor_nome,
    p.cnpj_fornecedor,
    p.requisitante,
    p.criado_por_pedido,
    p.centro,
    p.deposito,
    p.regiao_uf,
    p.moeda,
  ];
}

const CABECALHO_PAGAMENTOS = [
  'Rubrica', 'Origem do Mapeamento', 'Classificação Nível 1', 'Classificação Nível 2',
  'Nº Documento', 'Doc. Compras (PO)', 'Empresa', 'Tipo Documento',
  'Data Documento', 'Data Lançamento', 'Data Pagamento',
  'Vencimento Original', 'Vencimento Líquido', 'Doc. Compensação', 'Data Compensação',
  'Fornecedor (Código)', 'Fornecedor (Nome)', 'Grupo Mercadoria (Código)', 'Grupo Mercadoria (Nome)',
  'Centro', 'Centro de Lucro', 'Elemento PEP', 'Conta', 'Condições Pagamento', 'Moeda',
  'NF (Referência)', 'Texto', 'Valor (R$)',
];

const LARGURA_PAGAMENTOS = [
  30, 18, 16, 26,
  16, 16, 10, 22,
  12, 12, 12,
  14, 14, 14, 14,
  16, 32, 16, 26,
  10, 14, 14, 12, 16, 8,
  14, 28, 16,
];

function linhaPagamento(p: DetalhePagamentoLinha): (string | number | null)[] {
  return [
    p.rubrica_nome || 'Sem rubrica',
    rotuloOrigem(p.origem_mapeamento),
    p.classificacao_nivel1,
    p.classificacao_nivel2,
    p.numero_documento,
    p.documento_compras,
    p.empresa,
    p.tipo_documento,
    p.data_documento,
    p.data_lancamento,
    p.data_pagamento,
    p.vencimento_original,
    p.vencimento_liquido,
    p.doc_compensacao,
    p.data_compensacao,
    p.fornecedor_codigo,
    p.fornecedor_nome,
    p.grupo_mercadoria_codigo,
    p.grupo_mercadoria_nome,
    p.centro,
    p.centro_lucro,
    p.elemento_pep,
    p.conta,
    p.condicoes_pagamento,
    p.moeda_documento,
    p.nf_referencia,
    p.texto,
    p.valor ?? 0,
  ];
}

/**
 * Busca o resumo + o detalhe linha-a-linha de pedidos e pagamentos, com o
 * máximo de campos do SAP disponíveis, e gera o Excel de auditoria (3 abas:
 * Resumo, Pedidos, Pagamentos). Mesmo recorte de data das views (>= 2026-01-01).
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

  const pedidos = (pedidosRes.data || []) as DetalhePedidoLinha[];
  const pagamentos = (pagamentosRes.data || []) as DetalhePagamentoLinha[];

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
    montarPlanilha(CABECALHO_PEDIDOS, pedidos.map(linhaPedido), LARGURA_PEDIDOS),
    'Pedidos',
  );

  XLSX.utils.book_append_sheet(
    wb,
    montarPlanilha(CABECALHO_PAGAMENTOS, pagamentos.map(linhaPagamento), LARGURA_PAGAMENTOS),
    'Pagamentos',
  );

  XLSX.writeFile(wb, `realizado-por-rubrica-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
