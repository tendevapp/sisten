-- =====================================================================
-- Histórico de Pedidos agregado por FORNECEDOR + PEDIDO (Nº Pedido).
-- Considera apenas as linhas com 'x' na coluna CRF.
-- Soma quantidade e valor líquido; preço unitário derivado (valor / qtd).
--
-- Usa MATERIALIZED VIEW (pré-calculada) porque a agregação sobre a tabela
-- inteira, feita a cada consulta, estourava o statement_timeout do Supabase
-- (erro 57014). A view fina vw_historico_pedidos aponta para a materializada,
-- mantendo o nome que o app já consulta.
-- =====================================================================

-- Recria de forma idempotente.
drop view if exists public.vw_historico_pedidos;
drop materialized view if exists public.mv_historico_pedidos;

create materialized view public.mv_historico_pedidos as
select
  p.material,
  max(p.txt_breve)                                   as txt_breve,
  p.fornecedor_codigo                                as cod_forn,
  p.cnpj_fornecedor                                  as cnpj,
  max(p.fornecedor_nome)                             as fornecedor,
  max(p.regiao_uf)                                   as regiao_uf,
  p.doc_compra,
  max(p.reqc)                                        as reqc,
  max(p.data_doc)                                    as data_doc,
  sum(coalesce(p.qtd_pedido, 0))                     as qtd_pedido,
  sum(coalesce(p.valor_liquido, 0))                  as valor_liquido,
  case
    when sum(coalesce(p.qtd_pedido, 0)) > 0
    then sum(coalesce(p.valor_liquido, 0)) / sum(coalesce(p.qtd_pedido, 0))
    else null
  end                                                as preco_liquido_unit
from public.pedidosforn p
where lower(coalesce(p.crf, '')) = 'x'
group by
  p.material,
  p.fornecedor_codigo,
  p.cnpj_fornecedor,
  p.doc_compra;

-- Índice único (chave do GROUP BY) — necessário para REFRESH ... CONCURRENTLY.
create unique index if not exists mv_historico_pedidos_uidx
  on public.mv_historico_pedidos (
    material,
    coalesce(cod_forn, ''),
    coalesce(cnpj, ''),
    coalesce(doc_compra, '')
  );

-- Índice de busca por material.
create index if not exists mv_historico_pedidos_material_idx
  on public.mv_historico_pedidos (material);

-- View fina com o nome que o app consulta (leitura rápida, sem agregação).
create or replace view public.vw_historico_pedidos as
  select * from public.mv_historico_pedidos;

-- Permissões de leitura (Supabase anon/authenticated).
grant select on public.mv_historico_pedidos to anon, authenticated;
grant select on public.vw_historico_pedidos to anon, authenticated;

-- Função para recalcular a materialized view após importações (chamada via RPC).
create or replace function public.refresh_historico_pedidos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.mv_historico_pedidos;
end;
$$;

grant execute on function public.refresh_historico_pedidos() to anon, authenticated;
