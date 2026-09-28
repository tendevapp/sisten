create or replace function public.planejamento_dias_uteis(p_inicio date, p_fim date)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when p_inicio is null or p_fim is null or p_fim < p_inicio then null
    else greatest(0, (select count(*)::integer from generate_series(p_inicio, p_fim, interval '1 day') d where extract(isodow from d) between 1 and 5) - 1)
  end;
$$;

revoke all on function public.planejamento_dias_uteis(date, date) from public;
grant execute on function public.planejamento_dias_uteis(date, date) to authenticated;
