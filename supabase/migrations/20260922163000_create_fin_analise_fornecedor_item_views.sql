-- Analise financeira fiscal por fornecedor e item.
--
-- ZL0136 e a fonte de valor/quantidade/preco. O pagamento e rastreado no
-- FBL1N por fornecedor + referencia da NF, depois de remover duplicidades
-- exatas do snapshot. ZF0076 entra como evidencia complementar da NF/PO,
-- sem unir linhas brutas por pedido (o que multiplicaria os valores).

create or replace view public.vw_fin_fbl1n_deduplicado
with (security_invoker = true) as
select distinct on (
  f.fornecedor,
  f.numero_documento,
  coalesce(btrim(f.referencia), ''),
  coalesce(btrim(f.tipo_documento), ''),
  coalesce(f.montante_moeda_doc, 0),
  f.data_pagamento,
  f.data_compensacao,
  coalesce(btrim(f.doc_compensacao), ''),
  coalesce(btrim(f.texto), '')
)
  f.*
from public.sap_fbl1n_pagar f
order by
  f.fornecedor,
  f.numero_documento,
  coalesce(btrim(f.referencia), ''),
  coalesce(btrim(f.tipo_documento), ''),
  coalesce(f.montante_moeda_doc, 0),
  f.data_pagamento,
  f.data_compensacao,
  coalesce(btrim(f.doc_compensacao), ''),
  coalesce(btrim(f.texto), ''),
  f.id;

create or replace view public.vw_fin_faturas_fornecedor_item
with (security_invoker = true) as
with pagamentos_fbl1n as (
  select
    f.fornecedor as fornecedor_codigo,
    nullif(ltrim(btrim(f.referencia), '0'), '') as numero_nf_normalizado,
    max(f.data_pagamento) as data_ultimo_pagamento,
    sum(-f.montante_moeda_doc) as valor_pago_bruto,
    count(*) as qtd_lancamentos_pagamento
  from public.vw_fin_fbl1n_deduplicado f
  where f.montante_moeda_doc < 0
    and f.data_pagamento is not null
    and nullif(btrim(f.fornecedor), '') is not null
    and nullif(ltrim(btrim(f.referencia), '0'), '') is not null
  group by f.fornecedor, nullif(ltrim(btrim(f.referencia), '0'), '')
), faturas as (
  select
    z.id_parceiro as fornecedor_codigo,
    nullif(ltrim(btrim(z.numero_documento_nove_posicoes), '0'), '') as numero_nf_normalizado,
    max(z.descricao_parceiro) as fornecedor_nome,
    max(z.cnpj_parceiro) as cnpj_fornecedor,
    min(z.data_documento) as data_documento_nf,
    sum(coalesce(z.total, 0)) as valor_nf,
    count(*) as qtd_linhas_nf
  from public.sap_zl0136_nf z
  where z.tipo_parceiro = 'V'
    and nullif(btrim(z.id_parceiro), '') is not null
    and nullif(ltrim(btrim(z.numero_documento_nove_posicoes), '0'), '') is not null
  group by z.id_parceiro, nullif(ltrim(btrim(z.numero_documento_nove_posicoes), '0'), '')
), evidencia_zf0076 as (
  select
    z.fornecedor as fornecedor_codigo,
    nullif(ltrim(btrim(z.referencia_nf), '0'), '') as numero_nf_normalizado,
    count(*) as qtd_linhas_zf0076,
    count(distinct z.documento_compra) as qtd_pedidos_zf0076
  from public.sap_zf0076_nf_po z
  where nullif(btrim(z.fornecedor), '') is not null
    and nullif(ltrim(btrim(z.referencia_nf), '0'), '') is not null
  group by z.fornecedor, nullif(ltrim(btrim(z.referencia_nf), '0'), '')
), itens as (
  select
    z.id,
    z.id_parceiro as fornecedor_codigo,
    nullif(ltrim(btrim(z.numero_documento_nove_posicoes), '0'), '') as numero_nf_normalizado,
    z.pedido as numero_pedido,
    z.item_pedido,
    z.material,
    z.numero_servico,
    case
      when nullif(btrim(z.material), '') is not null then btrim(z.material)
      when nullif(btrim(z.numero_servico), '') is not null then 'SERVICO:' || btrim(z.numero_servico)
      else 'SEM_ITEM:' || z.id::text
    end as item_chave,
    case
      when nullif(btrim(z.material), '') is not null then 'MATERIAL'
      when nullif(btrim(z.numero_servico), '') is not null then 'SERVICO'
      else 'SEM_ITEM'
    end as tipo_item,
    coalesce(nullif(btrim(z.texto_breve_material), ''), nullif(btrim(z.descricao_servico), '')) as descricao_item,
    z.data_documento,
    z.quantidade,
    z.unidade_medida,
    coalesce(z.total, 0) as valor_item_nf,
    z.preco_liquido,
    case
      when coalesce(z.preco_liquido, 0) > 0 then z.preco_liquido
      when coalesce(z.quantidade, 0) > 0 then coalesce(z.total, 0) / z.quantidade
      else null
    end as preco_unitario
  from public.sap_zl0136_nf z
  where z.tipo_parceiro = 'V'
    and nullif(btrim(z.id_parceiro), '') is not null
    and nullif(ltrim(btrim(z.numero_documento_nove_posicoes), '0'), '') is not null
)
select
  i.id,
  i.fornecedor_codigo,
  f.fornecedor_nome,
  f.cnpj_fornecedor,
  i.numero_nf_normalizado,
  i.numero_pedido,
  i.item_pedido,
  i.material,
  i.numero_servico,
  i.item_chave,
  i.tipo_item,
  coalesce(i.descricao_item, i.item_chave) as descricao_item,
  i.data_documento,
  i.quantidade,
  i.unidade_medida,
  i.valor_item_nf,
  i.preco_liquido,
  i.preco_unitario,
  f.valor_nf,
  f.qtd_linhas_nf,
  p.valor_pago_bruto,
  least(greatest(coalesce(p.valor_pago_bruto, 0), 0), greatest(f.valor_nf, 0)) as valor_pago_considerado_nf,
  case
    when f.valor_nf > 0 then i.valor_item_nf / f.valor_nf * least(greatest(coalesce(p.valor_pago_bruto, 0), 0), f.valor_nf)
    else 0
  end as valor_pago_rateado,
  greatest(coalesce(p.valor_pago_bruto, 0) - greatest(f.valor_nf, 0), 0) as valor_pago_excedente_nf,
  p.data_ultimo_pagamento,
  coalesce(p.qtd_lancamentos_pagamento, 0) as qtd_lancamentos_pagamento,
  coalesce(zf.qtd_linhas_zf0076, 0) as qtd_linhas_zf0076,
  coalesce(zf.qtd_pedidos_zf0076, 0) as qtd_pedidos_zf0076,
  case
    when coalesce(p.valor_pago_bruto, 0) <= 0 then 'SEM_VINCULO_FBL1N'
    when p.valor_pago_bruto > f.valor_nf + 0.01 then 'PAGAMENTO_SUPERIOR_A_NF'
    when p.valor_pago_bruto >= f.valor_nf - 0.01 then 'PAGO_TOTAL'
    else 'PAGO_PARCIAL'
  end as status_pagamento
from itens i
join faturas f
  on f.fornecedor_codigo = i.fornecedor_codigo
 and f.numero_nf_normalizado = i.numero_nf_normalizado
left join pagamentos_fbl1n p
  on p.fornecedor_codigo = i.fornecedor_codigo
 and p.numero_nf_normalizado = i.numero_nf_normalizado
left join evidencia_zf0076 zf
  on zf.fornecedor_codigo = i.fornecedor_codigo
 and zf.numero_nf_normalizado = i.numero_nf_normalizado;

create or replace view public.vw_fin_preco_fornecedor_item
with (security_invoker = true) as
with historico as (
  select
    f.*,
    lag(f.preco_unitario) over (
      partition by f.fornecedor_codigo, f.item_chave
      order by f.data_documento, f.id
    ) as preco_unitario_anterior
  from public.vw_fin_faturas_fornecedor_item f
  where f.preco_unitario > 0
    and f.tipo_item <> 'SEM_ITEM'
)
select
  historico.*,
  case
    when preco_unitario_anterior > 0 then ((preco_unitario / preco_unitario_anterior) - 1) * 100
    else null
  end as variacao_preco_pct
from historico;

create or replace view public.vw_fin_reconciliacao_fiscal_por_pedido
with (security_invoker = true) as
select
  f.numero_pedido,
  count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado) as qtd_nfs_fiscais,
  count(*) as qtd_itens_fiscais,
  sum(f.valor_item_nf) as valor_faturado_fiscal,
  sum(f.valor_pago_rateado) as valor_pago_rastreado,
  sum(greatest(f.valor_item_nf - f.valor_pago_rateado, 0)) as valor_a_conciliar,
  count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado)
    filter (where f.status_pagamento = 'PAGO_TOTAL') as qtd_nfs_pagas_total,
  count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado)
    filter (where f.status_pagamento = 'PAGO_PARCIAL') as qtd_nfs_pagas_parcial,
  count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado)
    filter (where f.status_pagamento = 'SEM_VINCULO_FBL1N') as qtd_nfs_sem_vinculo_fbl1n,
  count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado)
    filter (where f.qtd_linhas_zf0076 > 0) as qtd_nfs_com_evidencia_zf0076
from public.vw_fin_faturas_fornecedor_item f
where nullif(btrim(f.numero_pedido), '') is not null
group by f.numero_pedido;

grant select on public.vw_fin_fbl1n_deduplicado to authenticated;
grant select on public.vw_fin_faturas_fornecedor_item to authenticated;
grant select on public.vw_fin_preco_fornecedor_item to authenticated;
grant select on public.vw_fin_reconciliacao_fiscal_por_pedido to authenticated;

revoke all on public.vw_fin_fbl1n_deduplicado from anon;
revoke all on public.vw_fin_faturas_fornecedor_item from anon;
revoke all on public.vw_fin_preco_fornecedor_item from anon;
revoke all on public.vw_fin_reconciliacao_fiscal_por_pedido from anon;

notify pgrst, 'reload schema';
