-- Conciliação de pedidos enriquecida com evidência fiscal (ZL0136 + FBL1N).
-- Mantém os valores MIRO separados para que o rastreio fiscal não altere a
-- situação contábil já existente e inclui POs que ainda não chegaram ao MIRO.

create or replace view public.vw_fin_reconciliacao_pedidos_enriquecida
with (security_invoker = true)
as
with fiscal as (
  select
    f.numero_pedido,
    count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado) as qtd_nfs_fiscais,
    count(*) as qtd_itens_fiscais,
    coalesce(sum(f.valor_item_nf), 0) as valor_faturado_fiscal,
    coalesce(sum(f.valor_pago_rateado), 0) as valor_pago_rastreado,
    coalesce(sum(greatest(f.valor_item_nf - f.valor_pago_rateado, 0)), 0) as valor_a_conciliar,
    count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado)
      filter (where f.status_pagamento = 'PAGO_TOTAL') as qtd_nfs_pagas_total,
    count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado)
      filter (where f.status_pagamento = 'PAGO_PARCIAL') as qtd_nfs_pagas_parcial,
    count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado)
      filter (where f.status_pagamento = 'SEM_VINCULO_FBL1N') as qtd_nfs_sem_vinculo_fbl1n,
    count(distinct f.fornecedor_codigo || ':' || f.numero_nf_normalizado)
      filter (where coalesce(f.qtd_linhas_zf0076, 0) > 0) as qtd_nfs_com_evidencia_zf0076,
    count(distinct f.fornecedor_codigo) as qtd_fornecedores_fiscais,
    string_agg(
      distinct coalesce(nullif(trim(f.fornecedor_nome), ''), f.fornecedor_codigo),
      ' | ' order by coalesce(nullif(trim(f.fornecedor_nome), ''), f.fornecedor_codigo)
    ) as fornecedores_fiscais
  from public.vw_fin_faturas_fornecedor_item f
  where nullif(trim(f.numero_pedido), '') is not null
  group by f.numero_pedido
), miro as (
  select *
  from public.vw_pedidos_conciliacao_pagamentos
)
select
  coalesce(m.numero_pedido, f.numero_pedido) as numero_pedido,
  m.empresa,
  m.centro,
  m.fornecedor,
  coalesce(m.razao_social_fornecedor, f.fornecedores_fiscais, 'Sem fornecedor identificado') as razao_social_fornecedor,
  m.data_criacao_pedido,
  m.data_aprovacao_pedido,
  coalesce(m.qtd_nfs, 0) as qtd_nfs,
  coalesce(m.qtd_miros, 0) as qtd_miros,
  coalesce(m.qtd_itens, 0) as qtd_itens,
  coalesce(m.qtd_materiais, 0) as qtd_materiais,
  null::text as materiais_nomes,
  coalesce(m.valor_pedido, 0) as valor_pedido,
  coalesce(m.total_faturado_miro, 0) as total_faturado_miro,
  coalesce(m.total_pago, 0) as total_pago,
  coalesce(m.total_em_aberto, 0) as total_em_aberto,
  coalesce(m.qtd_nfs_pagas, 0) as qtd_nfs_pagas,
  coalesce(m.qtd_nfs_abertas, 0) as qtd_nfs_abertas,
  coalesce(m.status_pagamento, 'PENDENTE FATURAMENTO') as status_pagamento,
  coalesce(f.qtd_nfs_fiscais, 0) as qtd_nfs_fiscais,
  coalesce(f.qtd_itens_fiscais, 0) as qtd_itens_fiscais,
  coalesce(f.valor_faturado_fiscal, 0) as valor_faturado_fiscal,
  coalesce(f.valor_pago_rastreado, 0) as valor_pago_rastreado,
  coalesce(f.valor_a_conciliar, 0) as valor_a_conciliar,
  coalesce(f.qtd_nfs_pagas_total, 0) as qtd_nfs_pagas_total,
  coalesce(f.qtd_nfs_pagas_parcial, 0) as qtd_nfs_pagas_parcial,
  coalesce(f.qtd_nfs_sem_vinculo_fbl1n, 0) as qtd_nfs_sem_vinculo_fbl1n,
  coalesce(f.qtd_nfs_com_evidencia_zf0076, 0) as qtd_nfs_com_evidencia_zf0076,
  coalesce(f.qtd_fornecedores_fiscais, 0) as qtd_fornecedores_fiscais,
  f.fornecedores_fiscais,
  case
    when m.numero_pedido is null then 'SOMENTE_FISCAL'
    when f.numero_pedido is null then 'SOMENTE_MIRO'
    else 'MIRO_E_FISCAL'
  end as origem_conciliacao
from miro m
full outer join fiscal f on f.numero_pedido = m.numero_pedido;

revoke all on public.vw_fin_reconciliacao_pedidos_enriquecida from authenticated;
grant select on public.vw_fin_reconciliacao_pedidos_enriquecida to authenticated;
revoke all on public.vw_fin_reconciliacao_pedidos_enriquecida from anon;

notify pgrst, 'reload schema';
