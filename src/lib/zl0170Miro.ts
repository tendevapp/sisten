/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mapeamento puro das colunas do relatório SAP ZL0170 (reconciliação Pedido x
 * MIGO x MIRO) para os campos da tabela `zl0170_miro`. Separado de
 * `localDb.ts` pelo mesmo motivo do FBL1N: testar o mapeamento isoladamente,
 * sem tocar Supabase, é mais barato que testar via importZL0170MiroRaw.
 *
 * A planilha repete os cabeçalhos "Moeda" (3x), "UMP" (2x) e "Ano" (2x) —
 * `reconcileSchema` (em localDb.ts) casa cada ocorrência repetida com a
 * ocorrência correspondente aqui, na ordem declarada. Por isso a ordem deste
 * array precisa espelhar exatamente a ordem das colunas no export SAP.
 */

export const ZL0170_COLUMNS: { header: string; field: string }[] = [
  { header: 'Nº Pedido', field: 'numero_pedido' },
  { header: 'Empr', field: 'empresa' },
  { header: 'Cen.', field: 'centro' },
  { header: 'Dt.criação', field: 'data_criacao_pedido' },
  { header: 'Dt. Aprovação', field: 'data_aprovacao_pedido' },
  { header: 'Dt.remessa', field: 'data_remessa' },
  { header: 'Itm', field: 'item' },
  { header: 'Material', field: 'material' },
  { header: 'Qtd.pedido', field: 'qtd_pedido' },
  { header: 'UMP', field: 'unidade_pedido' },
  { header: 'Preço líq.', field: 'preco_liquido' },
  { header: 'Moeda', field: 'moeda_preco' },
  { header: 'Valor líquido', field: 'valor_liquido' },
  { header: 'Moeda', field: 'moeda_valor_liquido' },
  { header: 'Req. Comp.', field: 'requisicao_compra' },
  { header: 'Dta Solic.', field: 'data_solicitacao' },
  { header: 'Doc. MIGO', field: 'doc_migo' },
  { header: 'Ano', field: 'ano_migo' },
  { header: 'Folha Serviço', field: 'folha_servico' },
  { header: 'Data Criação MIGO', field: 'data_criacao_migo' },
  { header: 'Data Lançamento MIGO', field: 'data_lancamento_migo' },
  { header: 'Qtd. MIGO', field: 'qtd_migo' },
  { header: 'UMR', field: 'unidade_migo' },
  { header: 'Mont. MIGO', field: 'montante_migo' },
  { header: 'Moeda', field: 'moeda_migo' },
  { header: 'Doc. MIRO', field: 'doc_miro' },
  { header: 'Ano', field: 'ano_miro' },
  { header: 'Data Criação MIRO', field: 'data_criacao_miro' },
  { header: 'Data Lançamento MIRO', field: 'data_lancamento_miro' },
  { header: 'Data doc.', field: 'data_documento' },
  { header: 'Hora', field: 'hora' },
  { header: 'Dt.entr.', field: 'data_entrada' },
  { header: 'Referência', field: 'referencia' },
  { header: 'Qtd. MIRO', field: 'qtd_miro' },
  { header: 'UMP', field: 'unidade_miro' },
  { header: 'Mont. MIRO', field: 'montante_miro' },
  { header: 'Nº doc. Contabil', field: 'numero_doc_contabil' },
  { header: 'Fornecedor', field: 'fornecedor' },
  { header: 'Nome 1', field: 'nome_1' },
  { header: 'Nome 2', field: 'nome_2' },
  { header: 'Nº ID fiscal 1', field: 'id_fiscal_1' },
  { header: 'Nº ID fiscal 2', field: 'id_fiscal_2' },
  { header: 'Nº ID fiscal de IVA', field: 'id_fiscal_iva' },
  { header: 'Doc Pagamento', field: 'doc_pagamento' },
  { header: 'Data Pagamento', field: 'data_pagamento' },
];

const DATE_FIELDS = new Set([
  'data_criacao_pedido', 'data_aprovacao_pedido', 'data_remessa', 'data_solicitacao',
  'data_criacao_migo', 'data_lancamento_migo', 'data_criacao_miro', 'data_lancamento_miro',
  'data_documento', 'data_entrada', 'data_pagamento',
]);

const NUMERIC_FIELDS = new Set([
  'qtd_pedido', 'preco_liquido', 'valor_liquido', 'qtd_migo', 'montante_migo',
  'qtd_miro', 'montante_miro',
]);

// dd.mm.yyyy, dd/mm/yyyy ou dd-mm-yyyy (convenção pt-BR usada por exports SAP)
const BR_DATE_RE = /^(\d{2})[./-](\d{2})[./-](\d{4})$/;

/** Serial do Excel (dias desde 1899-12-30) para ISO `YYYY-MM-DD`. Aceita
 *  também string já em ISO (cortando a parte de hora) ou no formato pt-BR
 *  (dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy). Qualquer outra string não
 *  reconhecida retorna null em vez de ser repassada sem validação para uma
 *  coluna `date` do Postgres. */
export function excelSerialToISO(val: unknown): string | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return null;
    const dateObj = new Date((val - 25569) * 86400 * 1000);
    return isNaN(dateObj.getTime()) ? null : dateObj.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return null;

  const brMatch = s.match(BR_DATE_RE);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  const isoPart = s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) return isoPart;

  return null;
}

// Milhar agrupado sem parte decimal, ex.: "1.234" ou "12.345.678"
const THOUSANDS_ONLY_RE = /^\d{1,3}(\.\d{3})+$/;

/** Número já numérico (célula Excel) ou string em formato brasileiro
 *  ("1.234,56"). Remove separador de milhar antes de trocar a vírgula.
 *  Também trata o sinal de negativo do SAP, que pode vir antes ("-1.234,56")
 *  ou depois ("1.234,56-") do número. */
export function parseZl0170Number(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  let s = String(val).trim();
  if (!s) return null;

  let negative = false;
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  } else if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }
  if (!s) return null;

  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (THOUSANDS_ONLY_RE.test(s)) {
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

/** Aplica o mapeamento de colunas a uma linha crua da planilha. Colunas sem
 *  campo conhecido (mappedFields[i] === null) vão para camposExtras, nunca
 *  são descartadas. */
export function mapZl0170Row(
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
        record[field] = parseZl0170Number(val);
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
