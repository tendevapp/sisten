import { excelSerialToISO, parseFbl1nNumber } from './fbl1n';

/** Mapeamento posicional do export SAP ZL0136 (notas fiscais).
 * O cabeçalho "Moeda do documento" aparece duas vezes; a posição diferencia
 * a moeda do faturamento da moeda da linha fiscal. */
export const ZL0136_COLUMNS: { header: string; field: string }[] = [
  { header: 'Tp. Parc.', field: 'tipo_parceiro' },
  { header: 'Descri\u00e7\u00e3o Tp. Parc.', field: 'descricao_tipo_parceiro' },
  { header: 'ID parceiro', field: 'id_parceiro' },
  { header: 'Descri\u00e7\u00e3o do Parceiro.', field: 'descricao_parceiro' },
  { header: 'CNPJ Do Parceiro', field: 'cnpj_parceiro' },
  { header: 'N\u00famero de documento de nove posi\u00e7\u00f5es', field: 'numero_documento_nove_posicoes' },
  { header: 'S\u00e9ries', field: 'series' },
  { header: 'Ctg.nota fiscal', field: 'categoria_nota_fiscal' },
  { header: 'Data de lan\u00e7amento', field: 'data_lancamento' },
  { header: 'Data documento', field: 'data_documento' },
  { header: 'Criado por', field: 'criado_por' },
  { header: 'Criad.manualmente', field: 'criado_manualmente' },
  { header: 'Modelo nota fiscal', field: 'modelo_nota_fiscal' },
  { header: 'Chave de Acesso', field: 'chave_acesso' },
  { header: 'Doc.faturamento', field: 'documento_faturamento' },
  { header: 'Tp.doc.faturamento', field: 'tipo_documento_faturamento' },
  { header: 'Denomina\u00e7\u00e3o', field: 'denominacao' },
  { header: 'Moeda do documento', field: 'moeda_documento_faturamento' },
  { header: 'C\u00e2mbio p/contabilid.', field: 'cambio_contabilidade' },
  { header: 'UF Origem', field: 'uf_origem' },
  { header: 'UF Destino', field: 'uf_destino' },
  { header: 'Simp.Nac (SAP)', field: 'simples_nacional_sap' },
  { header: 'Optante Simples', field: 'optante_simples' },
  { header: 'Data Op\u00e7\u00e3o', field: 'data_opcao_simples' },
  { header: 'Dt.Excl.Simples', field: 'data_exclusao_simples' },
  { header: 'Material', field: 'material' },
  { header: 'Texto breve material', field: 'texto_breve_material' },
  { header: 'N\u00ba de servi\u00e7o', field: 'numero_servico' },
  { header: 'Descri\u00e7\u00e3o do Servi\u00e7o', field: 'descricao_servico' },
  { header: 'Quantidade', field: 'quantidade' },
  { header: 'Unidade de medida', field: 'unidade_medida' },
  { header: 'Centro', field: 'centro' },
  { header: 'C\u00f3digo de controle', field: 'codigo_controle' },
  { header: 'CFOP', field: 'cfop' },
  { header: 'Documento de compras', field: 'documento_compras' },
  { header: 'C\u00f3digo de imposto', field: 'codigo_imposto' },
  { header: 'Moeda do documento', field: 'moeda_documento' },
  { header: 'Base ICMS', field: 'base_icms' },
  { header: 'Valor ICMS Total', field: 'valor_icms_total' },
  { header: 'Base IPI', field: 'base_ipi' },
  { header: 'Valor IPI', field: 'valor_ipi' },
  { header: 'Valor ISS', field: 'valor_iss' },
  { header: 'Valor INSS', field: 'valor_inss' },
  { header: 'Base PIS', field: 'base_pis' },
  { header: 'Al\u00edquota PIS', field: 'aliquota_pis' },
  { header: 'Valor PIS', field: 'valor_pis' },
  { header: 'Base COFINS', field: 'base_cofins' },
  { header: 'Al\u00edquota COFINS', field: 'aliquota_cofins' },
  { header: 'Valor COFINS', field: 'valor_cofins' },
  { header: 'Valor DIFAL', field: 'valor_difal' },
  { header: 'Vlr.ICMS Part.Dest.', field: 'valor_icms_part_dest' },
  { header: 'Vlr.ICMS ICM3', field: 'valor_icms_icm3' },
  { header: 'Base IBS', field: 'base_ibs' },
  { header: 'Al\u00edquota IBS', field: 'aliquota_ibs' },
  { header: 'Valor IBS', field: 'valor_ibs' },
  { header: 'Base CBS', field: 'base_cbs' },
  { header: 'Al\u00edquota CBS', field: 'aliquota_cbs' },
  { header: 'Valor CBS', field: 'valor_cbs' },
  { header: 'Total', field: 'total' },
  { header: 'Pre\u00e7o l\u00edquido', field: 'preco_liquido' },
  { header: 'Ref.doc.origem', field: 'referencia_documento_origem' },
  { header: 'Item ref.a doc.orig.', field: 'item_documento_origem' },
  { header: 'Documento de vendas', field: 'documento_vendas' },
  { header: 'Item', field: 'item_documento_vendas' },
  { header: 'N\u00ba do pedido', field: 'numero_pedido' },
  { header: 'Apelido do Ativo', field: 'apelido_ativo' },
  { header: 'Direito Fiscal ICMS', field: 'direito_fiscal_icms' },
  { header: 'Direito Fiscal IPI', field: 'direito_fiscal_ipi' },
  { header: 'Direito Fiscal ISS', field: 'direito_fiscal_iss' },
  { header: 'Direito Fiscal PIS', field: 'direito_fiscal_pis' },
  { header: 'Direito Fiscal COFINS', field: 'direito_fiscal_cofins' },
  { header: 'Sit.tribut\u00e1ria ICMS', field: 'situacao_tributaria_icms' },
  { header: 'D\u00e9bito posterior', field: 'debito_posterior' },
  { header: 'N\u00ba doc.original', field: 'numero_documento_original' },
  { header: 'Item refer\u00eancia NF', field: 'item_referencia_nf' },
  { header: 'Pedido', field: 'pedido' },
  { header: 'Item do pedido', field: 'item_pedido' },
  { header: 'Centro de lucro', field: 'centro_lucro' },
  { header: 'C\u00f3dCtaAnal\u00edtica cont.D/C', field: 'codigo_conta_analitica_dc' },
];

const DATE_FIELDS = new Set([
  'data_lancamento', 'data_documento', 'data_opcao_simples', 'data_exclusao_simples',
]);

const NUMERIC_FIELDS = new Set([
  'cambio_contabilidade', 'quantidade',
  'base_icms', 'valor_icms_total', 'base_ipi', 'valor_ipi', 'valor_iss', 'valor_inss',
  'base_pis', 'aliquota_pis', 'valor_pis', 'base_cofins', 'aliquota_cofins',
  'valor_cofins', 'valor_difal', 'valor_icms_part_dest', 'valor_icms_icm3',
  'base_ibs', 'aliquota_ibs', 'valor_ibs', 'base_cbs', 'aliquota_cbs', 'valor_cbs',
  'total', 'preco_liquido',
]);

export function parseZl0136Number(val: unknown): number | null {
  return parseFbl1nNumber(val);
}

export function mapZl0136Row(
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
    } else if (NUMERIC_FIELDS.has(field)) {
      record[field] = parseZl0136Number(value);
    } else {
      const text = value === null || value === undefined ? '' : String(value).trim();
      record[field] = text || null;
    }
  });

  return { record, camposExtras };
}
