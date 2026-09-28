-- Planejamento / Acompanhamento Geral
-- Snapshot atual + histórico de cargas. As views usam sempre a última carga concluída.

create table if not exists public.planejamento_importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo_bd text not null,
  arquivo_cronograma text,
  status text not null default 'processando' check (status in ('processando', 'sucesso', 'erro')),
  linhas_bd integer not null default 0,
  linhas_cronograma integer not null default 0,
  cabecalhos_bd jsonb not null default '[]'::jsonb,
  mensagem_erro text,
  importado_por text not null default auth.uid()::text,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create table if not exists public.bd_acompanhamento_geral (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.planejamento_importacoes(id) on delete cascade,
  linha_origem integer not null,
  bd text,
  sequencial integer,
  tramo text,
  projeto text,
  descricao text,
  posto_origem text,
  inicio date,
  turno_inicio integer,
  calandra date,
  termino_nav01 date,
  turno_termino_nav01 integer,
  total_nav01 numeric,
  data_inicio_internos date,
  turno_inicio_internos integer,
  data_termino_saw3 date,
  turno_termino_saw3 integer,
  total_turno_saw3 numeric,
  data_termino_internos date,
  turno_lib_jato integer,
  qtd_reparos numeric,
  metragem_reparos numeric,
  total_turno_internos numeric,
  termino_final date,
  turno_termino_final integer,
  total_turno_final numeric,
  marcador_x text,
  data_expedicao date,
  cort_x_expedicao text,
  marcador_x_expedicao text,
  numero_torre integer,
  lead_time_corte numeric,
  lead_time_calandra numeric,
  tempo_armazenagem numeric,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (importacao_id, linha_origem)
);

create table if not exists public.planejamento_cronograma (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.planejamento_importacoes(id) on delete cascade,
  linha_origem integer not null,
  sequencial integer not null,
  posto text,
  raw_data jsonb not null default '{}'::jsonb,
  unique (importacao_id, linha_origem),
  unique (importacao_id, sequencial)
);

create index if not exists bd_acompanhamento_geral_importacao_idx on public.bd_acompanhamento_geral(importacao_id);
create index if not exists bd_acompanhamento_geral_sequencial_idx on public.bd_acompanhamento_geral(sequencial);
create index if not exists bd_acompanhamento_geral_tramo_idx on public.bd_acompanhamento_geral(tramo);
create index if not exists bd_acompanhamento_geral_torre_idx on public.bd_acompanhamento_geral(numero_torre);
create index if not exists planejamento_cronograma_sequencial_idx on public.planejamento_cronograma(sequencial);

alter table public.planejamento_importacoes enable row level security;
alter table public.bd_acompanhamento_geral enable row level security;
alter table public.planejamento_cronograma enable row level security;

drop policy if exists planejamento_importacoes_select on public.planejamento_importacoes;
create policy planejamento_importacoes_select on public.planejamento_importacoes
  for select to authenticated
  using ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')));

drop policy if exists planejamento_importacoes_write on public.planejamento_importacoes;
create policy planejamento_importacoes_write on public.planejamento_importacoes
  for all to authenticated
  using ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')))
  with check ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')));

drop policy if exists bd_acompanhamento_geral_select on public.bd_acompanhamento_geral;
create policy bd_acompanhamento_geral_select on public.bd_acompanhamento_geral
  for select to authenticated
  using ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')));

drop policy if exists bd_acompanhamento_geral_write on public.bd_acompanhamento_geral;
create policy bd_acompanhamento_geral_write on public.bd_acompanhamento_geral
  for all to authenticated
  using ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')))
  with check ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')));

drop policy if exists planejamento_cronograma_select on public.planejamento_cronograma;
create policy planejamento_cronograma_select on public.planejamento_cronograma
  for select to authenticated
  using ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')));

drop policy if exists planejamento_cronograma_write on public.planejamento_cronograma;
create policy planejamento_cronograma_write on public.planejamento_cronograma
  for all to authenticated
  using ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')))
  with check ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos')));

grant select, insert, update, delete on public.planejamento_importacoes to authenticated;
grant select, insert, update, delete on public.bd_acompanhamento_geral to authenticated;
grant select, insert, update, delete on public.planejamento_cronograma to authenticated;
revoke all on public.planejamento_importacoes from anon;
revoke all on public.bd_acompanhamento_geral from anon;
revoke all on public.planejamento_cronograma from anon;

create or replace function public.planejamento_importar_acompanhamento(
  p_arquivo_bd text,
  p_arquivo_cronograma text,
  p_cabecalhos_bd jsonb,
  p_bd_rows jsonb,
  p_cronograma_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_importacao_id uuid;
  v_bd_count integer := 0;
  v_cronograma_count integer := 0;
begin
  if not ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos'))) then
    raise exception 'Usuário sem permissão para importar o Acompanhamento Geral';
  end if;

  if jsonb_typeof(p_bd_rows) <> 'array' or jsonb_array_length(p_bd_rows) = 0 then
    raise exception 'A planilha BD_ACOMPANHAMENTO_GERAL não possui linhas de dados';
  end if;

  insert into public.planejamento_importacoes (arquivo_bd, arquivo_cronograma, cabecalhos_bd, linhas_bd, linhas_cronograma)
  values (p_arquivo_bd, nullif(p_arquivo_cronograma, ''), coalesce(p_cabecalhos_bd, '[]'::jsonb), jsonb_array_length(p_bd_rows), jsonb_array_length(coalesce(p_cronograma_rows, '[]'::jsonb)))
  returning id into v_importacao_id;

  delete from public.bd_acompanhamento_geral where id is not null;
  delete from public.planejamento_cronograma where id is not null;

  insert into public.bd_acompanhamento_geral (
    importacao_id, linha_origem, bd, sequencial, tramo, projeto, descricao, posto_origem,
    inicio, turno_inicio, calandra, termino_nav01, turno_termino_nav01, total_nav01,
    data_inicio_internos, turno_inicio_internos, data_termino_saw3, turno_termino_saw3,
    total_turno_saw3, data_termino_internos, turno_lib_jato, qtd_reparos, metragem_reparos,
    total_turno_internos, termino_final, turno_termino_final, total_turno_final, marcador_x,
    data_expedicao, cort_x_expedicao, marcador_x_expedicao, numero_torre, lead_time_corte,
    lead_time_calandra, tempo_armazenagem, raw_data
  )
  select
    v_importacao_id,
    nullif(row->>'linha_origem', '')::integer,
    nullif(row->>'bd', ''),
    nullif(row->>'sequencial', '')::integer,
    nullif(row->>'tramo', ''),
    nullif(row->>'projeto', ''),
    nullif(row->>'descricao', ''),
    nullif(row->>'posto_origem', ''),
    nullif(row->>'inicio', '')::date,
    nullif(row->>'turno_inicio', '')::integer,
    nullif(row->>'calandra', '')::date,
    nullif(row->>'termino_nav01', '')::date,
    nullif(row->>'turno_termino_nav01', '')::integer,
    nullif(row->>'total_nav01', '')::numeric,
    nullif(row->>'data_inicio_internos', '')::date,
    nullif(row->>'turno_inicio_internos', '')::integer,
    nullif(row->>'data_termino_saw3', '')::date,
    nullif(row->>'turno_termino_saw3', '')::integer,
    nullif(row->>'total_turno_saw3', '')::numeric,
    nullif(row->>'data_termino_internos', '')::date,
    nullif(row->>'turno_lib_jato', '')::integer,
    nullif(row->>'qtd_reparos', '')::numeric,
    nullif(row->>'metragem_reparos', '')::numeric,
    nullif(row->>'total_turno_internos', '')::numeric,
    nullif(row->>'termino_final', '')::date,
    nullif(row->>'turno_termino_final', '')::integer,
    nullif(row->>'total_turno_final', '')::numeric,
    nullif(row->>'marcador_x', ''),
    nullif(row->>'data_expedicao', '')::date,
    nullif(row->>'cort_x_expedicao', ''),
    nullif(row->>'marcador_x_expedicao', ''),
    nullif(row->>'numero_torre', '')::integer,
    nullif(row->>'lead_time_corte', '')::numeric,
    nullif(row->>'lead_time_calandra', '')::numeric,
    nullif(row->>'tempo_armazenagem', '')::numeric,
    coalesce(row->'raw_data', '{}'::jsonb)
  from jsonb_array_elements(p_bd_rows) as rows(row);

  insert into public.planejamento_cronograma (importacao_id, linha_origem, sequencial, posto, raw_data)
  select v_importacao_id,
         nullif(row->>'linha_origem', '')::integer,
         nullif(row->>'sequencial', '')::integer,
         nullif(row->>'posto', ''),
         coalesce(row->'raw_data', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_cronograma_rows, '[]'::jsonb)) as rows(row)
  where nullif(row->>'sequencial', '') is not null;

  get diagnostics v_bd_count = row_count;
  select count(*)::integer into v_cronograma_count from public.planejamento_cronograma where importacao_id = v_importacao_id;

  update public.planejamento_importacoes
  set status = 'sucesso', linhas_bd = v_bd_count, linhas_cronograma = v_cronograma_count, concluido_em = now()
  where id = v_importacao_id;

  return jsonb_build_object('importacao_id', v_importacao_id, 'linhas_bd', v_bd_count, 'linhas_cronograma', v_cronograma_count);
exception when others then
  if v_importacao_id is not null then
    update public.planejamento_importacoes set status = 'erro', mensagem_erro = sqlerrm, concluido_em = now() where id = v_importacao_id;
  end if;
  raise;
end;
$$;

revoke all on function public.planejamento_importar_acompanhamento(text, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.planejamento_importar_acompanhamento(text, text, jsonb, jsonb, jsonb) to authenticated;

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

grant execute on function public.planejamento_dias_uteis(date, date) to authenticated;

create or replace view public.vw_planejamento_acompanhamento_base
with (security_invoker = true)
as
with atual as (
  select id from public.planejamento_importacoes where status = 'sucesso' order by concluido_em desc nulls last, iniciado_em desc limit 1
)
select b.id, b.importacao_id, b.linha_origem, b.bd, b.sequencial, b.tramo, b.projeto, b.descricao,
       case
         when nullif(b.marcador_x_expedicao, '') is not null then 'EXPEDIDO'
         when nullif(b.marcador_x, '') is not null then 'PÁTIO'
         else coalesce(c.posto, nullif(b.posto_origem, ''), 'ERRO')
       end as posto_atual,
       b.posto_origem, b.inicio, b.turno_inicio, b.calandra, b.termino_nav01, b.turno_termino_nav01,
       b.total_nav01, b.data_inicio_internos, b.turno_inicio_internos, b.data_termino_saw3,
       b.turno_termino_saw3, b.total_turno_saw3, b.data_termino_internos, b.turno_lib_jato,
       b.qtd_reparos, b.metragem_reparos, b.total_turno_internos, b.termino_final,
       b.turno_termino_final, b.total_turno_final, b.marcador_x, b.data_expedicao,
       b.cort_x_expedicao, b.marcador_x_expedicao, b.numero_torre, b.lead_time_corte,
       b.lead_time_calandra, b.tempo_armazenagem, b.raw_data
from public.bd_acompanhamento_geral b
join atual a on a.id = b.importacao_id
left join public.planejamento_cronograma c on c.importacao_id = b.importacao_id and c.sequencial = b.sequencial;

create or replace view public.vw_planejamento_acompanhamento_engine
with (security_invoker = true)
as
with base as (select * from public.vw_planejamento_acompanhamento_base), calc as (
  select b.*,
    (b.termino_final is not null)::integer as ok_white,
    (b.data_termino_internos is not null or b.termino_final is not null)::integer as ok_internos,
    (b.data_termino_saw3 is not null or b.data_termino_internos is not null or b.termino_final is not null)::integer as ok_saw3,
    (b.termino_nav01 is not null or b.data_termino_saw3 is not null or b.data_termino_internos is not null or b.termino_final is not null)::integer as ok_nav01,
    case b.tramo when 'T1' then 45 when 'T2' then 28 when 'T3' then 28 when 'T4' then 28 when 'T5' then 30 else null end::numeric as plano_du,
    public.planejamento_dias_uteis(b.inicio, coalesce(b.termino_final, current_date)) as du_decorridos,
    public.planejamento_dias_uteis(b.inicio, b.termino_nav01) as lt_nav01,
    public.planejamento_dias_uteis(b.termino_nav01, b.data_termino_saw3) as lt_saw3,
    public.planejamento_dias_uteis(b.data_termino_saw3, b.data_termino_internos) as lt_internos,
    public.planejamento_dias_uteis(b.data_termino_internos, b.termino_final) as lt_white,
    greatest(b.termino_nav01, b.data_termino_saw3, b.data_termino_internos, b.termino_final) as ultima_conclusao,
    case when b.termino_final is not null and b.data_termino_internos is null then 'SIM'
         when b.data_termino_internos is not null and b.data_termino_saw3 is null then 'SIM'
         when b.data_termino_saw3 is not null and b.termino_nav01 is null then 'SIM'
         when b.termino_nav01 is not null and b.data_termino_saw3 is not null and b.data_termino_saw3 < b.termino_nav01 then 'SIM'
         when b.data_termino_saw3 is not null and b.data_termino_internos is not null and b.data_termino_internos < b.data_termino_saw3 then 'SIM'
         when b.data_termino_internos is not null and b.termino_final is not null and b.termino_final < b.data_termino_internos then 'SIM'
         else '' end as divergencia
  from base b
), ranked as (
  select c.*,
    (c.ok_white + c.ok_internos + c.ok_saw3 + c.ok_nav01) as etapas_concl,
    case when c.ok_white = 1 then 'CONCLUIDO' when c.ok_internos = 1 then 'WHITE' when c.ok_saw3 = 1 then 'INTERNOS' when c.ok_nav01 = 1 then 'SAW3' else 'NAV01' end as prox_etapa,
    case when c.ok_white + c.ok_internos + c.ok_saw3 + c.ok_nav01 = 4 then 'CONCLUIDO' when c.ok_white + c.ok_internos + c.ok_saw3 + c.ok_nav01 = 0 then 'NAO INICIADO' else 'EM PRODUCAO' end as status,
    round((c.ok_white + c.ok_internos + c.ok_saw3 + c.ok_nav01)::numeric / 4, 6) as avanco_tramo,
    public.planejamento_dias_uteis(c.ultima_conclusao, current_date) as dias_sem_movto
  from calc c
)
select r.id, r.importacao_id, r.linha_origem, r.sequencial, r.tramo, lpad(coalesce(r.numero_torre, 0)::text, 2, '0') as torre_numero,
       case when r.numero_torre is null then null else 'TORRE ' || lpad(r.numero_torre::text, 2, '0') end as torre,
       r.posto_atual, r.inicio, r.termino_nav01 as fim_nav01, r.data_termino_saw3 as fim_saw3,
       r.data_termino_internos as fim_internos, r.termino_final as fim_white, r.ok_white,
       r.ok_internos, r.ok_saw3, r.ok_nav01, r.etapas_concl, r.avanco_tramo,
       r.etapas_concl / nullif(count(*) over (), 0)::numeric / 4 as peso_projeto,
       r.status, r.prox_etapa, r.divergencia, r.ultima_conclusao, r.dias_sem_movto,
       r.qtd_reparos as reparos, r.metragem_reparos, r.lt_nav01, r.lt_saw3, r.lt_internos, r.lt_white,
       coalesce(r.lt_nav01, 0) + coalesce(r.lt_saw3, 0) + coalesce(r.lt_internos, 0) + coalesce(r.lt_white, 0) as ciclo_total,
       r.plano_du, r.du_decorridos, r.plano_du - r.du_decorridos as saldo_prazo,
       case when r.plano_du > 0 then round(r.du_decorridos / r.plano_du, 4) else null end as consumo_prazo,
       row_number() over (partition by r.status order by r.dias_sem_movto desc nulls last) as rank_aging,
       row_number() over (order by r.qtd_reparos desc nulls last, r.sequencial) as rank_reparos,
       r.raw_data
from ranked r;

create or replace view public.vw_planejamento_acompanhamento_stage_lead_times
with (security_invoker = true)
as
select sequencial, torre, tramo, 'NAV01'::text as etapa, lt_nav01::numeric as lead_time from public.vw_planejamento_acompanhamento_engine where lt_nav01 is not null
union all select sequencial, torre, tramo, 'SAW3', lt_saw3::numeric from public.vw_planejamento_acompanhamento_engine where lt_saw3 is not null
union all select sequencial, torre, tramo, 'INTERNOS', lt_internos::numeric from public.vw_planejamento_acompanhamento_engine where lt_internos is not null
union all select sequencial, torre, tramo, 'WHITE', lt_white::numeric from public.vw_planejamento_acompanhamento_engine where lt_white is not null;

create or replace view public.vw_planejamento_acompanhamento_pcp
with (security_invoker = true)
as
select etapa, round(avg(lead_time), 2) as media, percentile_cont(0.5) within group (order by lead_time) as mediana,
       min(lead_time) as minimo, max(lead_time) as maximo, count(*)::integer as amostra
from public.vw_planejamento_acompanhamento_stage_lead_times
group by etapa;

create or replace view public.vw_planejamento_acompanhamento_weekly
with (security_invoker = true)
as
with limites as (
  select date_trunc('week', min(inicio))::date as inicio, date_trunc('week', greatest(max(fim_nav01), max(fim_saw3), max(fim_internos), max(fim_white), current_date))::date as fim
  from public.vw_planejamento_acompanhamento_engine
), semanas as (
  select generate_series(inicio, fim, interval '7 days')::date as semana_inicio from limites where inicio is not null
), concluidas as (
  select s.semana_inicio,
    count(e.fim_nav01) filter (where e.fim_nav01 between s.semana_inicio and s.semana_inicio + 6) as nav01_sem,
    count(e.fim_saw3) filter (where e.fim_saw3 between s.semana_inicio and s.semana_inicio + 6) as saw3_sem,
    count(e.fim_internos) filter (where e.fim_internos between s.semana_inicio and s.semana_inicio + 6) as internos_sem,
    count(e.fim_white) filter (where e.fim_white between s.semana_inicio and s.semana_inicio + 6) as white_sem
  from semanas s cross join public.vw_planejamento_acompanhamento_engine e group by s.semana_inicio
)
select semana_inicio, semana_inicio + 6 as semana_fim, nav01_sem, saw3_sem, internos_sem, white_sem,
  sum(nav01_sem) over (order by semana_inicio) as nav01_acum,
  sum(saw3_sem) over (order by semana_inicio) as saw3_acum,
  sum(internos_sem) over (order by semana_inicio) as internos_acum,
  sum(white_sem) over (order by semana_inicio) as white_acum
from concluidas;

create or replace view public.vw_planejamento_acompanhamento_torres
with (security_invoker = true)
as
select torre, round(avg(avanco_tramo), 4) as avanco_medio, sum(etapas_concl)::integer as etapas_concl,
       count(*) filter (where fim_white is not null)::integer as tramos_white, count(*)::integer as tramos
from public.vw_planejamento_acompanhamento_engine where torre is not null group by torre;

create or replace view public.vw_planejamento_acompanhamento_postos
with (security_invoker = true)
as
with postos as (
  select posto_atual as posto, count(*)::integer as tramos, round(avg(dias_sem_movto), 2) as aging_medio
  from public.vw_planejamento_acompanhamento_engine where status = 'EM PRODUCAO' group by posto_atual
)
select posto, tramos, aging_medio, round(tramos::numeric / nullif(sum(tramos) over (), 0), 4) as percentual_carteira from postos;

create or replace view public.vw_planejamento_acompanhamento_reparos
with (security_invoker = true)
as
select sequencial, torre, tramo, posto_atual, coalesce(reparos, 0) as reparos, metragem_reparos, rank_reparos
from public.vw_planejamento_acompanhamento_engine where coalesce(reparos, 0) > 0;

create or replace view public.vw_planejamento_acompanhamento_divergencias
with (security_invoker = true)
as
select sequencial, torre, tramo, fim_nav01, fim_saw3, fim_internos, fim_white, divergencia
from public.vw_planejamento_acompanhamento_engine where divergencia = 'SIM';

grant select on public.vw_planejamento_acompanhamento_base to authenticated;
grant select on public.vw_planejamento_acompanhamento_engine to authenticated;
grant select on public.vw_planejamento_acompanhamento_stage_lead_times to authenticated;
grant select on public.vw_planejamento_acompanhamento_pcp to authenticated;
grant select on public.vw_planejamento_acompanhamento_weekly to authenticated;
grant select on public.vw_planejamento_acompanhamento_torres to authenticated;
grant select on public.vw_planejamento_acompanhamento_postos to authenticated;
grant select on public.vw_planejamento_acompanhamento_reparos to authenticated;
grant select on public.vw_planejamento_acompanhamento_divergencias to authenticated;
revoke all on public.vw_planejamento_acompanhamento_base from anon;
revoke all on public.vw_planejamento_acompanhamento_engine from anon;
revoke all on public.vw_planejamento_acompanhamento_stage_lead_times from anon;
revoke all on public.vw_planejamento_acompanhamento_pcp from anon;
revoke all on public.vw_planejamento_acompanhamento_weekly from anon;
revoke all on public.vw_planejamento_acompanhamento_torres from anon;
revoke all on public.vw_planejamento_acompanhamento_postos from anon;
revoke all on public.vw_planejamento_acompanhamento_reparos from anon;
revoke all on public.vw_planejamento_acompanhamento_divergencias from anon;

notify pgrst, 'reload schema';
