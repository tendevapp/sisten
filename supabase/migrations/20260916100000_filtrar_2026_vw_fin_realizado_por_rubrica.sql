-- =====================================================================
-- Recorte por data: Realizado por Rubrica só a partir de 2026-01-01
--
-- sap_zl0132_po.data_pedido esta 100% vazia (nao serve como filtro); o campo
-- populado e data_doc (data do documento de compra), com dados desde 2015 -
-- sem o recorte, pedidos historicos de anos anteriores entrariam no relatorio.
-- Em sap_fbl1n_pagar o recorte usa data_pagamento (data em que o pagamento foi
-- efetivamente feito).
-- =====================================================================

drop view if exists public.vw_fin_pedidos_por_rubrica;
create view public.vw_fin_pedidos_por_rubrica with (security_invoker = true) as
select
  coalesce(mf.rubrica_id, mg.rubrica_id) as rubrica_id,
  count(*) as qtd_itens,
  count(distinct p.doc_compra) as qtd_pedidos,
  sum(coalesce(p.valor_em_brl, p.valor_liquido, 0)) as valor_pedidos
from public.sap_zl0132_po p
left join public.fin_rubrica_mapeamentos mf
  on mf.tipo_chave = 'fornecedor'
  and mf.ativo
  and mf.chave_valor = coalesce(nullif(p.fornecedor_codigo, ''), nullif(p.cod_forn, ''))
left join public.fin_rubrica_mapeamentos mg
  on mg.tipo_chave = 'grupo_mercadoria'
  and mg.ativo
  and mg.chave_valor = p.grp_mercads
where p.data_doc >= '2026-01-01'
group by coalesce(mf.rubrica_id, mg.rubrica_id);

grant select on public.vw_fin_pedidos_por_rubrica to anon, authenticated, service_role;

drop view if exists public.vw_fin_pagamentos_por_rubrica;
create view public.vw_fin_pagamentos_por_rubrica with (security_invoker = true) as
with pedido_grp as (
  select doc_compra, min(grp_mercads) as grp_mercads
  from public.sap_zl0132_po
  where doc_compra is not null and doc_compra <> ''
  group by doc_compra
)
select
  coalesce(mf.rubrica_id, mg.rubrica_id) as rubrica_id,
  count(*) as qtd_lancamentos,
  sum(f.montante_moeda_doc) as valor_pagamentos
from public.sap_fbl1n_pagar f
left join pedido_grp pg on pg.doc_compra = f.documento_compras
left join public.fin_rubrica_mapeamentos mf
  on mf.tipo_chave = 'fornecedor'
  and mf.ativo
  and mf.chave_valor = f.fornecedor
left join public.fin_rubrica_mapeamentos mg
  on mg.tipo_chave = 'grupo_mercadoria'
  and mg.ativo
  and mg.chave_valor = pg.grp_mercads
where f.data_pagamento >= '2026-01-01'
group by coalesce(mf.rubrica_id, mg.rubrica_id);

grant select on public.vw_fin_pagamentos_por_rubrica to anon, authenticated, service_role;
