-- Contas a Pagar › Análise: a tela lê vw_fin_fbl1n_analise_deduplicada, que
-- ficou sem a coluna eh_pagamento quando 20261126100000 a criou só em
-- vw_fbl1n_c_pagar_analise (Contas a Pagar). Erro 42703 e a Análise sem dados.
-- Mesma regra: tipo de documento que conta como pagamento e não estornado.

create or replace view public.vw_fin_fbl1n_analise_deduplicada
with (security_invoker = true) as
select
  f.id, f.simbolo_partida, f.codigo_imposto, f.empresa, f.chave_referencia_1, f.conta,
  f.numero_documento, f.razao_social_fornecedor, f.ano_mes, f.referencia, f.data_documento,
  f.data_lancamento, f.tipo_documento, f.estorno_com, f.conta_lancamento_contrapartida,
  f.data_pagamento, f.montante_moeda_doc, f.montante_base_desconto, f.montante_base_irf,
  f.montante_irf, f.moeda_documento, f.data_compensacao, f.doc_compensacao, f.centro,
  f.documento_compras, f.elemento_pep, f.imobilizado, f.loc_negocios, f.id_fiscal_1,
  f.id_fiscal_iva, f.texto, f.atribuicao, f.centro_lucro, f.parcelamento_tributario,
  f.texto_cabecalho_documento, f.bloqueio_pagamento, f.montante_mi2, f.montante_mi3,
  f.condicoes_pagamento, f.data_entrada, f.doc_faturamento, f.fornecedor, f.motivo_estorno,
  f.vencimento_liquido, f.vencimento_original, f.parcela, f.campos_extras, f.imported_at,
  t.tipo_documento as tipo_documento_descricao,
  t.categoria_modulo as tipo_documento_categoria_modulo,
  t.descricao_operacional as tipo_documento_descricao_operacional,
  (coalesce(t.conta_como_pagamento, false) and nullif(btrim(f.estorno_com::text), '') is null) as eh_pagamento
from public.vw_fin_fbl1n_deduplicado f
left join public.cadastro_tipodoc t on t.codigo = f.tipo_documento;
