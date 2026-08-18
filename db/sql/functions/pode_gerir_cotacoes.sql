-- =====================================================================
-- Autorização do módulo de Análise de Cotações. Uma função STABLE
-- SECURITY DEFINER em vez de repetir o subselect em profiles em cada
-- policy: o Postgres cacheia o resultado por statement, e a Edge
-- Function extrair-cotacao reusa a MESMA função para autorizar a
-- chamada de IA — assim a RLS e a Edge Function não podem divergir.
-- =====================================================================

create or replace function public.pode_gerir_cotacoes()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())::text
      and p.roles && array['admin','comprador','coordenador_suprimentos']
  );
$$;

revoke all on function public.pode_gerir_cotacoes() from public, anon;
grant execute on function public.pode_gerir_cotacoes() to authenticated;
