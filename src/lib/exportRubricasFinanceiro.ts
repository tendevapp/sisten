/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação do relatório de Realizado por Rubrica (Financeiro) para
 * auditoria. O realizado é medido pela nota fiscal (ZL0136): cada item traz a
 * natureza fiscal (CFOP), a rubrica atribuída e por qual regra (CFOP,
 * fornecedor, código de serviço ou grupo de mercadoria), o grupo de mercadoria
 * e de onde ele veio, e o pagamento rastreado no FBL1N — para conferir a
 * classificação sem voltar ao banco.
 */

import * as XLSX from 'xlsx-js-style';
import {
  consolidarPorFornecedor, LinhaArvoreRubrica, LinhaNfRealizado, NATUREZAS, RelatorioRealizadoNf,
  resumirPorNatureza, rotuloOrigemRubrica,
} from './realizadoRubricaNf';

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
function achatarResumo(relatorio: RelatorioRealizadoNf): (string | number | null)[][] {
  const resultado: (string | number | null)[][] = [];
  const participacao = (v: number) => (relatorio.realizado.valor ? v / relatorio.realizado.valor : 0);
  const visitar = (linha: LinhaArvoreRubrica) => {
    resultado.push([
      `${'— '.repeat(linha.nivel)}${linha.rubrica.nome}`,
      linha.valor, linha.valorPago, linha.qtdNfs, linha.qtdFornecedores, participacao(linha.valor),
    ]);
    linha.filhos.forEach(visitar);
  };
  relatorio.arvore.forEach(visitar);
  const m = relatorio.materialProducao;
  const s = relatorio.semRubrica;
  const r = relatorio.realizado;
  resultado.push(['Material de produção (fora das rubricas)', m.valor, m.valorPago, m.qtdNfs, m.qtdFornecedores, participacao(m.valor)]);
  resultado.push(['Sem rubrica (a classificar)', s.valor, s.valorPago, s.qtdNfs, s.qtdFornecedores, participacao(s.valor)]);
  resultado.push(['TOTAL REALIZADO', r.valor, r.valorPago, r.qtdNfs, r.qtdFornecedores, 1]);
  return resultado;
}

const CABECALHO_LINHAS = [
  'Rubrica', 'Origem da Rubrica', 'Natureza Fiscal', 'Entra no Realizado',
  'NF', 'Série', 'Categoria NF', 'CFOP', 'Data Documento', 'Data Lançamento',
  'Fornecedor (Código)', 'Fornecedor (Nome)', 'CNPJ',
  'Pedido', 'Item Pedido', 'Tipo Item', 'Material', 'Código Serviço', 'Descrição',
  'Grupo Mercadoria (Código)', 'Grupo Mercadoria (Nome)', 'Classificação Nível 1', 'Classificação Nível 2', 'Origem do Grupo',
  'Quantidade', 'Unidade', 'Centro', 'Valor NF (R$)',
  'Pago Rastreado (R$)', 'Status Pagamento', 'Último Pagamento',
];

const LARGURA_LINHAS = [
  30, 18, 22, 10,
  12, 6, 10, 10, 12, 12,
  14, 32, 18,
  14, 8, 10, 18, 12, 36,
  14, 24, 18, 24, 16,
  10, 8, 8, 14,
  14, 20, 12,
];

function linhaNf(l: LinhaNfRealizado): (string | number | null)[] {
  return [
    l.rubrica_nome || (l.natureza === 'MATERIAL_PRODUCAO' ? 'Material de produção (sem rubrica)' : 'Sem rubrica'),
    rotuloOrigemRubrica(l.origem_rubrica, l.excluido_por_material),
    NATUREZAS[l.natureza]?.rotulo ?? l.natureza,
    l.entra_realizado ? 'Sim' : 'Não',
    l.numero_nf, l.serie_nf, l.categoria_nota_fiscal, l.cfop, l.data_documento, l.data_lancamento,
    l.fornecedor_codigo, l.fornecedor_nome, l.cnpj_fornecedor,
    l.numero_pedido, l.item_pedido, l.tipo_item, l.material, l.numero_servico, l.descricao_item,
    l.grupo_mercadoria_codigo, l.grupo_mercadoria_nome, l.classificacao_nivel1, l.classificacao_nivel2, l.origem_grupo,
    l.quantidade, l.unidade_medida, l.centro, l.valor,
    l.valor_pago_rateado, l.status_pagamento, l.data_ultimo_pagamento,
  ];
}

/**
 * Gera o Excel de auditoria a partir do que a tela já carregou (mesmo recorte
 * de período): Resumo por rubrica, Ponte por natureza fiscal, consolidado por
 * fornecedor e todos os itens de NF — inclusive os que não entram no
 * realizado, para a conferência da ponte.
 */
export function exportarRealizadoPorRubricaXlsx(
  relatorio: RelatorioRealizadoNf,
  linhas: LinhaNfRealizado[],
  sufixoArquivo = '',
): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    montarPlanilha(
      ['Rubrica', 'Realizado NF (R$)', 'Pago Rastreado (R$)', 'NFs', 'Fornecedores', '% do Realizado'],
      achatarResumo(relatorio),
      [55, 18, 18, 8, 12, 12],
    ),
    'Resumo',
  );

  XLSX.utils.book_append_sheet(
    wb,
    montarPlanilha(
      ['Natureza Fiscal', 'Regra (CFOP / categoria)', 'Entra no Realizado', 'Valor NF (R$)', 'Pago Rastreado (R$)', 'NFs', 'Itens'],
      resumirPorNatureza(linhas).map(n => [
        n.rotulo, n.descricao, n.entraRealizado ? 'Sim' : 'Não', n.valor, n.valorPago, n.qtdNfs, n.qtdItens,
      ]),
      [26, 50, 12, 16, 18, 8, 8],
    ),
    'Ponte por natureza',
  );

  XLSX.utils.book_append_sheet(
    wb,
    montarPlanilha(
      ['Fornecedor (Código)', 'Fornecedor (Nome)', 'Rubricas', 'Realizado NF (R$)', 'Pago Rastreado (R$)', 'NFs', 'Itens'],
      consolidarPorFornecedor(linhas.filter(l => l.entra_realizado)).map(f => [
        f.fornecedorCodigo, f.fornecedorNome, f.rubricas.join(', '), f.valor, f.valorPago, f.qtdNfs, f.qtdItens,
      ]),
      [14, 36, 40, 16, 18, 8, 8],
    ),
    'Por fornecedor',
  );

  XLSX.utils.book_append_sheet(
    wb,
    montarPlanilha(CABECALHO_LINHAS, linhas.map(linhaNf), LARGURA_LINHAS),
    'Itens de NF',
  );

  XLSX.writeFile(wb, `realizado-por-rubrica-nf${sufixoArquivo}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
