-- =====================================================================
-- mv_historico_pedidos: refresh sem travar leitura
-- =====================================================================
-- Incidente de 28/10/2026: `refresh_historico_pedidos` refazia
-- mv_historico_pedidos com REFRESH MATERIALIZED VIEW sem CONCURRENTLY, que
-- toma lock ACCESS EXCLUSIVE — toda leitura de vw_historico_pedidos espera o
-- refresh acabar. A importação SAP chama a RPC várias vezes e, logo depois,
-- todo aparelho logado relê o histórico (63 páginas): as leituras empilharam
-- atrás do lock, as páginas foram de ~0,2 s para ~10 s e o banco travou.
--
-- CONCURRENTLY exige um índice único só com colunas (sem expressão nem
-- WHERE). O índice existente usa COALESCE, por isso não servia. Este usa as
-- colunas puras com NULLS NOT DISTINCT — mesma unicidade do índice antigo
-- (62.222 linhas, 62.222 chaves distintas em 28/10/2026).

create unique index if not exists mv_historico_pedidos_chave_uidx
  on public.mv_historico_pedidos (material, cod_forn, cnpj, doc_compra) nulls not distinct;

create or replace function public.refresh_historico_pedidos()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  refresh materialized view concurrently public.mv_historico_pedidos;
  refresh materialized view concurrently public.mv_pedido_atual_por_ri;
  refresh materialized view concurrently public.mv_pedidos_por_ri;
end;
$function$;
