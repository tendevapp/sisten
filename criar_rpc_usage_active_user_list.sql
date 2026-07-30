-- Quem esteve ativo no período, e quando foi a última vez.
--
-- Os indicadores existentes respondem "quantos" (usage_kpis) e "onde"
-- (usage_page_ranking). Este responde "quem". Ordena pelo último evento, não
-- por volume: para saber se alguém parou de usar o app, a informação que
-- decide é a data, não a contagem.
--
-- SECURITY DEFINER com _usage_require_admin(), igual às demais usage_*: a
-- tabela usage_events não é legível diretamente pelo usuário comum.

create or replace function public.usage_active_user_list(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  user_id text, user_name text, email text,
  sessions integer, page_views integer,
  first_event timestamptz, last_event timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._usage_require_admin();

  return query
  select e.user_id,
         max(e.user_name) as user_name,
         max(e.email) as email,
         count(distinct e.session_id)::int as sessions,
         count(*) filter (where e.event_type = 'page_view')::int as page_views,
         min(e.created_at) as first_event,
         max(e.created_at) as last_event
  from public.usage_events e
  where e.created_at between p_from and p_to
  group by e.user_id
  order by max(e.created_at) desc;
end;
$function$;
