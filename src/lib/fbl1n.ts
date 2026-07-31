/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mapeamento puro das colunas do relatório SAP FBL1N (Contas a Pagar) para os
 * campos da tabela `fbl1n_c_pagar`. Separado de `localDb.ts` porque o
 * relatório tem 45 colunas — testar o mapeamento isoladamente, sem tocar
 * Supabase, é mais barato que testar via importFBL1NRaw.
 */

export const FBL1N_COLUMNS: { header: string; field: string }[] = [
  { header: 'Símb.prtds.em aberto/comp', field: 'simbolo_partida' },
  { header: 'Código de imposto', field: 'codigo_imposto' },
  { header: 'Empresa', field: 'empresa' },
  { header: 'Chave referência 1', field: 'chave_referencia_1' },
  { header: 'Conta', field: 'conta' },
  { header: 'Nº documento', field: 'numero_documento' },
  { header: 'Razão social do fornecedor', field: 'razao_social_fornecedor' },
  { header: 'Ano/Mês', field: 'ano_mes' },
  { header: 'Referência', field: 'referencia' },
  { header: 'Data do documento', field: 'data_documento' },
  { header: 'Data de lançamento', field: 'data_lancamento' },
  { header: 'Tipo de documento', field: 'tipo_documento' },
  { header: 'Estorno com', field: 'estorno_com' },
  { header: 'Conta lnçto.contrap.', field: 'conta_lancamento_contrapartida' },
  { header: 'Data de pagamento', field: 'data_pagamento' },
  { header: 'Mont.moeda doc.', field: 'montante_moeda_doc' },
  { header: 'Mont.base desconto', field: 'montante_base_desconto' },
  { header: 'Montante base de IRF', field: 'montante_base_irf' },
  { header: 'Montante IRF', field: 'montante_irf' },
  { header: 'Moeda do documento', field: 'moeda_documento' },
  { header: 'Data de compensação', field: 'data_compensacao' },
  { header: 'Doc.compensação', field: 'doc_compensacao' },
  { header: 'Centro', field: 'centro' },
  { header: 'Documento de compras', field: 'documento_compras' },
  { header: 'Elemento PEP', field: 'elemento_pep' },
  { header: 'Imobilizado', field: 'imobilizado' },
  { header: 'Loc.negócios', field: 'loc_negocios' },
  { header: 'Nº ID fiscal 1', field: 'id_fiscal_1' },
  { header: 'Nº ID fiscal de IVA', field: 'id_fiscal_iva' },
  { header: 'Texto', field: 'texto' },
  { header: 'Atribuição', field: 'atribuicao' },
  { header: 'Centro de lucro', field: 'centro_lucro' },
  { header: 'Parcelamento Tributário', field: 'parcelamento_tributario' },
  { header: 'Texto cabeçalho documento', field: 'texto_cabecalho_documento' },
  { header: 'Bloqueio pgto.', field: 'bloqueio_pagamento' },
  { header: 'Montante em MI2', field: 'montante_mi2' },
  { header: 'Montante em MI3', field: 'montante_mi3' },
  { header: 'Condições pgto.', field: 'condicoes_pagamento' },
  { header: 'Data de entrada', field: 'data_entrada' },
  { header: 'Doc.faturamento', field: 'doc_faturamento' },
  { header: 'Fornecedor', field: 'fornecedor' },
  { header: 'Mot.estorno', field: 'motivo_estorno' },
  { header: 'Vencimento líquido', field: 'vencimento_liquido' },
  { header: 'Vencimento Original', field: 'vencimento_original' },
  { header: 'Parcela', field: 'parcela' },
];

const DATE_FIELDS = new Set([
  'data_documento', 'data_lancamento', 'data_pagamento', 'data_compensacao',
  'data_entrada', 'vencimento_liquido', 'vencimento_original',
]);

const NUMERIC_FIELDS = new Set([
  'montante_moeda_doc', 'montante_base_desconto', 'montante_base_irf',
  'montante_irf', 'montante_mi2', 'montante_mi3',
]);

/** Serial do Excel (dias desde 1899-12-30) para ISO `YYYY-MM-DD`. Aceita
 *  também string já formatada, só cortando a parte de hora. */
export function excelSerialToISO(val: unknown): string | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') {
    const dateObj = new Date((val - 25569) * 86400 * 1000);
    return dateObj.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  return s ? s.split('T')[0] : null;
}

/** Número já numérico (célula Excel) ou string em formato brasileiro
 *  ("1.234,56"). Remove separador de milhar antes de trocar a vírgula. */
export function parseFbl1nNumber(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

/** Aplica o mapeamento de colunas a uma linha crua da planilha. Colunas sem
 *  campo conhecido (mappedFields[i] === null) vão para camposExtras, nunca
 *  são descartadas. */
export function mapFbl1nRow(
  headers: string[],
  mappedFields: (string | null)[],
  row: any[],
): { record: Record<string, any>; camposExtras: Record<string, any> } {
  const record: Record<string, any> = {};
  const camposExtras: Record<string, any> = {};

  row.forEach((val, colIdx) => {
    const field = mappedFields[colIdx];
    const header = headers[colIdx];
    if (field) {
      if (DATE_FIELDS.has(field)) {
        record[field] = excelSerialToISO(val);
      } else if (NUMERIC_FIELDS.has(field)) {
        record[field] = parseFbl1nNumber(val);
      } else {
        const s = val === null || val === undefined ? '' : String(val).trim();
        record[field] = s || null;
      }
    } else if (header) {
      camposExtras[header] = val;
    }
  });

  return { record, camposExtras };
}
