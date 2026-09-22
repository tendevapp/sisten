import { excelSerialToISO } from './fbl1n';

export { excelSerialToISO };

/** Mapeamento posicional do export SAP ZF0076 (notas fiscais x pedidos).
 * Cabeçalhos repetidos representam campos diferentes e devem permanecer na
 * ordem da planilha para que reconcileSchema faça o casamento correto. */
export const ZF0076_COLUMNS: { header: string; field: string }[] = [
  { header: 'Doc.compra', field: 'documento_compra' },
  { header: 'Itm', field: 'item_pedido' },
  { header: 'Data da aprova\u00e7\u00e3o', field: 'data_aprovacao' },
  { header: 'Cen.', field: 'centro' },
  { header: 'AP', field: 'ap' },
  { header: 'Pr\u00e7', field: 'preco' },
  { header: 'Man', field: 'man' },
  { header: 'MBl', field: 'mbl' },
  { header: 'Dat', field: 'dat' },
  { header: 'Mt.', field: 'mt' },
  { header: 'Material', field: 'material' },
  { header: 'TxtBreve', field: 'texto_breve' },
  { header: 'Requisitante', field: 'requisitante' },
  { header: 'N\u00ba acomp.', field: 'numero_acompanhamento' },
  { header: 'Contr.', field: 'contrato' },
  { header: 'Item', field: 'item_contrato' },
  { header: 'Dt.cria\u00e7\u00e3o', field: 'data_criacao' },
  { header: 'Hora', field: 'hora' },
  { header: 'Criado por', field: 'criado_por' },
  { header: 'ReqC', field: 'requisicao_compra' },
  { header: 'Item', field: 'item_requisicao' },
  { header: 'C\u00f3dT', field: 'codigo_tipo' },
  { header: 'N\u00ba doc.', field: 'numero_documento' },
  { header: 'Ano', field: 'ano_documento' },
  { header: 'Empr', field: 'empresa' },
  { header: 'Moeda', field: 'moeda_documento' },
  { header: 'Data doc.', field: 'data_documento' },
  { header: 'Dt.l\u00e7to.', field: 'data_lancamento' },
  { header: 'Doc.ref.', field: 'documento_referencia' },
  { header: 'Refer\u00eancia', field: 'referencia_documento' },
  { header: 'Refer\u00eancia', field: 'referencia_nf' },
  { header: 'Dt.entr.', field: 'data_entrada' },
  { header: 'Nome do usu\u00e1rio', field: 'nome_usuario' },
  { header: 'ItemFat', field: 'item_faturamento' },
  { header: 'Quantidade', field: 'quantidade' },
  { header: 'UMP', field: 'unidade_medida' },
  { header: 'Qtd.UPP', field: 'quantidade_upp' },
  { header: 'UMP', field: 'unidade_medida_upp' },
  { header: 'D/C', field: 'debito_credito' },
  { header: 'Montante', field: 'montante' },
  { header: 'Moeda', field: 'moeda_montante' },
  { header: 'Taxa c\u00e2mbio', field: 'taxa_cambio' },
  { header: 'IN', field: 'indicador_in' },
  { header: 'Cust.compl.aq.n\u00e3o pln.', field: 'custo_complementar_aquisicao' },
  { header: 'CI', field: 'codigo_imposto' },
  { header: 'Im', field: 'imposto' },
  { header: 'Moeda', field: 'moeda_imposto' },
  { header: 'Mont.bruto', field: 'montante_bruto' },
  { header: 'Moeda', field: 'moeda_bruto' },
  { header: 'IVA WMWST', field: 'iva_wmwst' },
  { header: 'Moeda', field: 'moeda_iva' },
  { header: 'TpC.', field: 'tipo_condicao' },
  { header: 'Tp.doc.', field: 'tipo_documento' },
  { header: 'Tp.opera\u00e7\u00e3o', field: 'tipo_operacao' },
  { header: 'LNeg', field: 'local_negocios' },
  { header: 'N\u00baS', field: 'numero_serie' },
  { header: 'Domic\u00edlioFiscal', field: 'domicilio_fiscal_fornecedor' },
  { header: 'Fornecedor', field: 'fornecedor' },
  { header: 'Nome 1', field: 'nome_fornecedor' },
  { header: 'Fornecedor', field: 'fornecedor_alternativo' },
  { header: 'Nome 1', field: 'nome_fornecedor_alternativo' },
  { header: 'Nome 2', field: 'nome_fornecedor_2' },
  { header: 'Nome 3', field: 'nome_fornecedor_3' },
  { header: 'Nome 4', field: 'nome_fornecedor_4' },
  { header: 'Local', field: 'local_fornecedor' },
  { header: 'Rg', field: 'regiao_fornecedor' },
  { header: 'Ps.', field: 'pais_fornecedor' },
  { header: 'C\u00f3digoPost', field: 'codigo_postal_fornecedor' },
  { header: 'Domic\u00edlioFiscal', field: 'domicilio_fiscal' },
  { header: 'N\u00ba ID fiscal 1', field: 'id_fiscal_1' },
  { header: 'N\u00ba ID fiscal 2', field: 'id_fiscal_2' },
  { header: 'N\u00ba ID fiscal de IVA', field: 'id_fiscal_iva' },
  { header: 'Itm', field: 'item_nf' },
  { header: 'Material', field: 'material_nf' },
  { header: 'BlP', field: 'blp' },
  { header: 'Refer\u00eancia para Faturamento', field: 'referencia_faturamento' },
];

const DATE_FIELDS = new Set([
  'data_aprovacao', 'data_criacao', 'data_documento', 'data_lancamento', 'data_entrada',
]);

const NUMERIC_FIELDS = new Set([
  'quantidade', 'quantidade_upp', 'montante', 'taxa_cambio',
  'custo_complementar_aquisicao', 'montante_bruto', 'iva_wmwst',
]);

const THOUSANDS_ONLY_RE = /^\d{1,3}(\.\d{3})+$/;

export function parseZf0076Number(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isNaN(val) ? null : val;

  let value = String(val).trim();
  if (!value) return null;

  let negative = false;
  if (value.endsWith('-')) {
    negative = true;
    value = value.slice(0, -1).trim();
  } else if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1).trim();
  }

  const normalized = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : THOUSANDS_ONLY_RE.test(value) ? value.replace(/\./g, '') : value;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return negative ? -parsed : parsed;
}

export function parseZf0076Time(val: unknown): string | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val < 0) return null;
    const totalSeconds = Math.round((val % 1) * 24 * 60 * 60);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600) % 24;
    return [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':');
  }

  const text = String(val).trim();
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) {
    const parts = text.split(':').map(Number);
    return [parts[0], parts[1], parts[2] ?? 0].map(n => String(n).padStart(2, '0')).join(':');
  }
  return null;
}

export function mapZf0076Row(
  headers: string[],
  mappedFields: (string | null)[],
  row: any[],
): { record: Record<string, any>; camposExtras: Record<string, any> } {
  const record: Record<string, any> = {};
  const camposExtras: Record<string, any> = {};

  row.forEach((value, index) => {
    const field = mappedFields[index];
    const header = headers[index];
    if (!field) {
      if (header) camposExtras[header] = value;
      return;
    }

    if (DATE_FIELDS.has(field)) {
      record[field] = excelSerialToISO(value);
    } else if (field === 'hora') {
      record[field] = parseZf0076Time(value);
    } else if (NUMERIC_FIELDS.has(field)) {
      record[field] = parseZf0076Number(value);
    } else {
      const text = value === null || value === undefined ? '' : String(value).trim();
      record[field] = text || null;
    }
  });

  return { record, camposExtras };
}
