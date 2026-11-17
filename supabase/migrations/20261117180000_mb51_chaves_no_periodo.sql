-- Importação da MB51 mais rápida: o app pergunta quais chaves já existem no
-- período da planilha (menor a maior data de lançamento) e manda só as novas.
-- Antes cada importação regravava todas as linhas (ex.: 22.127 lidas, 14 novas).
-- Devolve um array só (uma linha), então não esbarra no max_rows de 1.000 do PostgREST.

create or replace function public.mb51_chaves_no_periodo(p_de date, p_ate date)
returns text[]
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m.chave_unica), '{}')
  from public.sap_mb51_mov m
  where m.data_lancamento between p_de and p_ate;
$$;

revoke all on function public.mb51_chaves_no_periodo(date, date) from public, anon;
grant execute on function public.mb51_chaves_no_periodo(date, date) to authenticated;

comment on function public.mb51_chaves_no_periodo(date, date) is
  'Chaves (chave_unica) da MB51 já gravadas no período — a importação manda só as que faltam.';
