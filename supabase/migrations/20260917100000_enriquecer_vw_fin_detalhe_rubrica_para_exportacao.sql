-- =====================================================================
-- Enriquece as views de detalhe com mais campos do SAP, para a exportacao em
-- Excel trazer o maximo de detalhe possivel para auditoria (quantidade,
-- preco unitario, requisitante, centro, deposito, regiao, moeda, elemento
-- PEP, vencimento, compensacao etc.). Os modais de tela continuam usando so
-- o subconjunto que ja exibiam - estes campos extras nao quebram nada
-- existente.
-- =====================================================================

drop view if exists public.vw_fin_pedidos_detalhe_rubrica;
create view public.vw_fin_pedidos_detalhe_rubrica with (security_invoker = true) as
select
  p.id,
  p.doc_compra,
  p.item,
  p.data_doc,
  coalesce(nullif(p.fornecedor_codigo, ''), nullif(p.cod_forn, '')) as fornecedor_codigo,
  coalesce(p.fornecedor_nome, p.fornecedor) as fornecedor_nome,
  p.cnpj_fornecedor,
  p.grp_mercads as grupo_mercadoria_codigo,
  gm.denominacao as grupo_mercadoria_nome,
  gm.classificacao_nivel1,
  gm.classificacao_nivel2,
  p.material as material_codigo,
  p.txt_breve as material_descricao,
  p.qtd_pedido,
  p.unidade_medida_pedido,
  p.preco_liquido_unit,
  p.contrato,
  p.item_contrato,
  p.tipo_doc_compra,
  p.requisitante,
  p.criado_por_pedido,
  p.cen_cen as centro,
  p.dep_dep as deposito,
  p.regiao_uf,
  p.moeda_1 as moeda,
  p.data_rc,
  p.reqc as requisicao_compra,
  coalesce(p.valor_em_brl, p.valor_liquido, 0) as valor,
  coalesce(mf.rubrica_id, mg.rubrica_id) as rubrica_id,
  r.nome as rubrica_nome,
  case
    when mf.rubrica_id is not null then 'fornecedor'
    when mg.rubrica_id is not null then 'grupo_mercadoria'
    else null
  end as origem_mapeamento
from public.sap_zl0132_po p
left join public.cadastro_grupo_mercadoria gm on gm.codigo = p.grp_mercads
left join public.fin_rubrica_mapeamentos mf
  on mf.tipo_chave = 'fornecedor'
  and mf.ativo
  and mf.chave_valor = coalesce(nullif(p.fornecedor_codigo, ''), nullif(p.cod_forn, ''))
left join public.fin_rubrica_mapeamentos mg
  on mg.tipo_chave = 'grupo_mercadoria'
  and mg.ativo
  and mg.chave_valor = p.grp_mercads
left join public.fin_rubricas r on r.id = coalesce(mf.rubrica_id, mg.rubrica_id)
where p.data_doc >= '2026-01-01';

grant select on public.vw_fin_pedidos_detalhe_rubrica to anon, authenticated, service_role;

drop view if exists public.vw_fin_pagamentos_detalhe_rubrica;
create view public.vw_fin_pagamentos_detalhe_rubrica with (security_invoker = true) as
with pedido_grp as (
  select doc_compra, min(grp_mercads) as grp_mercads
  from public.sap_zl0132_po
  where doc_compra is not null and doc_compra <> ''
  group by doc_compra
)
select
  f.id,
  f.numero_documento,
  f.documento_compras,
  f.empresa,
  f.data_pagamento,
  f.data_lancamento,
  f.data_documento,
  f.vencimento_original,
  f.vencimento_liquido,
  f.doc_compensacao,
  f.data_compensacao,
  f.fornecedor as fornecedor_codigo,
  f.razao_social_fornecedor as fornecedor_nome,
  pg.grp_mercads as grupo_mercadoria_codigo,
  gm.denominacao as grupo_mercadoria_nome,
  gm.classificacao_nivel1,
  gm.classificacao_nivel2,
  f.tipo_documento,
  f.centro,
  f.centro_lucro,
  f.elemento_pep,
  f.conta,
  f.condicoes_pagamento,
  f.moeda_documento,
  f.referencia as nf_referencia,
  f.texto,
  f.montante_moeda_doc as valor,
  coalesce(mf.rubrica_id, mg.rubrica_id) as rubrica_id,
  r.nome as rubrica_nome,
  case
    when mf.rubrica_id is not null then 'fornecedor'
    when mg.rubrica_id is not null then 'grupo_mercadoria'
    else null
  end as origem_mapeamento
from public.sap_fbl1n_pagar f
left join pedido_grp pg on pg.doc_compra = f.documento_compras
left join public.cadastro_grupo_mercadoria gm on gm.codigo = pg.grp_mercads
left join public.fin_rubrica_mapeamentos mf
  on mf.tipo_chave = 'fornecedor'
  and mf.ativo
  and mf.chave_valor = f.fornecedor
left join public.fin_rubrica_mapeamentos mg
  on mg.tipo_chave = 'grupo_mercadoria'
  and mg.ativo
  and mg.chave_valor = pg.grp_mercads
left join public.fin_rubricas r on r.id = coalesce(mf.rubrica_id, mg.rubrica_id)
where f.data_pagamento >= '2026-01-01';

grant select on public.vw_fin_pagamentos_detalhe_rubrica to anon, authenticated, service_role;
