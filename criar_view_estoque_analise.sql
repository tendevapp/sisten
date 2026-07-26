-- =====================================================================
-- Cruzamento de estoque com último preço pago, usado pelo painel de
-- divergência de PMM do módulo Almoxarifado (Tarefa 1 do plano
-- 2026-07-24-almoxarifado-dashboards). Para cada material em `estoque`,
-- traz o preço unitário, data e fornecedor da compra mais recente em
-- `pedidosforn` (coluna "por" tratada porque às vezes vem como texto
-- não numérico).
--
-- security_invoker = on: sem essa opção a view roda com privilégios do
-- dono e ignora as políticas de RLS de `estoque` e `pedidosforn` (que
-- restringem SELECT a authenticated), expondo preço, data de compra e
-- fornecedor por material sem login. Ver Security Advisor do Supabase
-- (security_definer_view).
-- =====================================================================

create or replace view public.vw_estoque_analise as
with ult as (
  select distinct on (p.material)
    p.material,
    p.preco_liquido_unit / case
      when p.por ~ '^[0-9]+([.,][0-9]+)?$'
        then coalesce(nullif(replace(p.por, ',', '.')::numeric, 0), 1)
      else 1
    end as ultimo_preco_unit,
    p.data_doc as data_ultima_compra,
    coalesce(p.fornecedor_nome, p.fornecedor) as ultimo_fornecedor
  from pedidosforn p
  where p.preco_liquido_unit is not null and p.preco_liquido_unit > 0
  order by p.material, p.data_doc desc nulls last
)
select distinct
  e.material,
  u.ultimo_preco_unit,
  u.data_ultima_compra,
  u.ultimo_fornecedor
from estoque e
left join ult u on u.material = e.material;

alter view public.vw_estoque_analise set (security_invoker = on);

grant select on public.vw_estoque_analise to authenticated;
revoke all on public.vw_estoque_analise from anon;
