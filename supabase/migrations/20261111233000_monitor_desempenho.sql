-- Monitor de Desempenho (Admin › Monitor de Desempenho).
--
-- O SISTEN fica lento ou trava e, quando alguem olha, a causa ja passou. Este
-- monitor guarda o que aconteceu, dos dois lados:
--
--   1. Banco: uma amostra por minuto (pg_cron) com conexoes, consultas em
--      execucao ha mais de 2 s, quem espera lock e, de pg_stat_statements, as
--      12 consultas que mais gastaram tempo de banco naquele minuto (delta, nao
--      o acumulado). Quando o banco trava, o buraco nas amostras tambem conta
--      a historia.
--   2. Aparelhos: cada navegador mede as proprias chamadas ao Supabase (tempo,
--      lentas, erros) e os travamentos da tela (long tasks) e manda um resumo a
--      cada 5 min pela RPC registrar_desempenho_cliente. Distingue "o servidor
--      demorou" de "o aparelho travou", e mostra qual tela dispara o que.
--
-- Leitura so admin, sempre por RPC security definer (pg_stat_activity e
-- pg_stat_statements so mostram o texto das consultas de outros usuarios a
-- quem tem pg_read_all_stats). O coletor nunca e chamado pelo app.
--
-- Retencao: amostras 14 dias (~1,3 KB cada, ~27 MB); aparelhos 7 dias (o detalhe
-- por endpoint pesa: ~50 aparelhos x 12 resumos/h). O que vale guardar por mais
-- tempo vai para o resumo diario (migration seguinte). O proprio coletor faz a faxina a
-- cada hora, inclusive do log do pg_cron.

-- O hook do Supabase ja concede ao postgres o acesso ao schema cron ao criar a
-- extensao; grants manuais aqui conflitam com ele. O hook dispara ate num
-- "create extension if not exists" sem efeito e falha na segunda vez, dai o if.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.ops_desempenho_amostras (
  em timestamptz primary key,
  intervalo_s numeric(8,1),
  conexoes integer not null,
  max_conexoes integer not null,
  ativas integer not null,
  ociosas_em_transacao integer not null,
  lentas_5s integer not null,
  lentas_30s integer not null,
  mais_longa_s numeric(10,1),
  esperando_lock integer not null,
  -- tamanho do banco, a cada 15 min (null nas outras amostras)
  banco_bytes bigint,
  -- deltas desde a amostra anterior (null na primeira, sem base)
  db_tempo_ms numeric(16,1),
  db_chamadas bigint,
  temp_bytes bigint,
  blks_read bigint,
  blks_hit bigint,
  -- consultas em execucao ha mais de 2 s no instante da amostra
  consultas jsonb not null default '[]'::jsonb,
  -- top 12 do minuto por tempo de banco: [{id, c, ms, t}]
  top jsonb not null default '[]'::jsonb
);

comment on table public.ops_desempenho_amostras is
  'Uma amostra por minuto da saude do banco (pg_cron -> ops_desempenho_coletar). Monitor de Desempenho, so admin.';

-- Estado anterior para calcular deltas. Unlogged: se o banco reiniciar, a
-- proxima amostra so vira a nova base (sem delta), o que e o certo.
create unlogged table if not exists public.ops_desempenho_base_stmt (
  queryid bigint primary key,
  calls bigint not null,
  total_ms double precision not null,
  temp_blks bigint not null
);

create unlogged table if not exists public.ops_desempenho_base_db (
  id integer primary key default 1 check (id = 1),
  em timestamptz not null,
  temp_bytes bigint not null,
  blks_read bigint not null,
  blks_hit bigint not null
);

-- Texto das consultas por queryid, guardado uma vez (o top de cada minuto so
-- leva o id). queryid fica como bigint aqui e como texto no JSON: no
-- navegador um bigint perderia precisao.
create table if not exists public.ops_desempenho_textos (
  queryid bigint primary key,
  texto text not null,
  visto_em timestamptz not null default now()
);

create table if not exists public.ops_desempenho_cliente (
  id bigint generated always as identity primary key,
  recebido_em timestamptz not null default now(),
  device_id text not null,
  user_id uuid not null,
  user_name text,
  plataforma text,
  conexao text,
  janela_inicio timestamptz not null,
  janela_fim timestamptz not null,
  requisicoes integer not null default 0,
  tempo_ms bigint not null default 0,
  lentas integer not null default 0,
  erros integer not null default 0,
  travamentos integer not null default 0,
  travamento_ms bigint not null default 0,
  travamento_max_ms integer not null default 0,
  memoria_mb integer,
  -- Volume baixado das chamadas ao Supabase (descompactado: teto do egress)
  bytes bigint not null default 0,
  -- Arquivos do Storage carregados pela tela (<img>, PDF) fora do cliente supabase
  storage_n integer not null default 0,
  storage_bytes bigint not null default 0,
  -- Batimento: onde o usuario estava e se a aba estava a vista
  pagina_atual text,
  visivel boolean not null default true,
  -- {"GET vw_x": {n, ms, mx, l, e, b, p: {"/rota": n}}}
  endpoints jsonb not null default '{}'::jsonb,
  -- {"/rota": {v, n, ms, l, e, b, tv, tms}}
  paginas jsonb not null default '{}'::jsonb
);

comment on table public.ops_desempenho_cliente is
  'Resumo de 5 min por aparelho: tempo das chamadas ao Supabase e travamentos da tela. Monitor de Desempenho, so admin.';

create index if not exists ops_desempenho_cliente_recebido_idx
  on public.ops_desempenho_cliente (recebido_em desc);
create index if not exists ops_desempenho_cliente_aparelho_idx
  on public.ops_desempenho_cliente (device_id, user_id, recebido_em desc);

create table if not exists public.ops_desempenho_acoes (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  user_id uuid,
  user_name text,
  acao text not null,
  pid integer,
  consulta text
);

comment on table public.ops_desempenho_acoes is
  'Quem cancelou consulta ou zerou estatisticas pelo Monitor de Desempenho.';

alter table public.ops_desempenho_amostras enable row level security;
alter table public.ops_desempenho_base_stmt enable row level security;
alter table public.ops_desempenho_base_db enable row level security;
alter table public.ops_desempenho_textos enable row level security;
alter table public.ops_desempenho_cliente enable row level security;
alter table public.ops_desempenho_acoes enable row level security;

revoke all on table public.ops_desempenho_amostras, public.ops_desempenho_base_stmt, public.ops_desempenho_base_db,
  public.ops_desempenho_textos, public.ops_desempenho_cliente, public.ops_desempenho_acoes from anon, authenticated;

-- So leitura direta pelo admin; escrita apenas pelas funcoes abaixo.
grant select on table public.ops_desempenho_amostras, public.ops_desempenho_cliente, public.ops_desempenho_acoes to authenticated;

drop policy if exists ops_desempenho_amostras_select on public.ops_desempenho_amostras;
create policy ops_desempenho_amostras_select on public.ops_desempenho_amostras
  for select to authenticated using ((select public.has_role('admin')));

drop policy if exists ops_desempenho_cliente_select on public.ops_desempenho_cliente;
create policy ops_desempenho_cliente_select on public.ops_desempenho_cliente
  for select to authenticated using ((select public.has_role('admin')));

drop policy if exists ops_desempenho_acoes_select on public.ops_desempenho_acoes;
create policy ops_desempenho_acoes_select on public.ops_desempenho_acoes
  for select to authenticated using ((select public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- Coletor (pg_cron, 1x por minuto)
-- ---------------------------------------------------------------------------

create or replace function public.ops_desempenho_coletar()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
set statement_timeout = '20s'
set lock_timeout = '2s'
as $$
declare
  v_agora timestamptz := clock_timestamp();
  v_dbid oid := (select oid from pg_database where datname = current_database());
  v_tem_base boolean;
  v_base record;
  v_db record;
  v_ativ record;
  v_top jsonb := '[]'::jsonb;
  v_tempo numeric;
  v_chamadas bigint;
  v_consultas jsonb;
begin
  -- Duas execucoes sobrepostas (banco lento) nao competem: a segunda desiste.
  if not pg_try_advisory_xact_lock(hashtext('ops_desempenho_coletar')) then
    return;
  end if;

  -- Atividade agora. Conexoes contam a instancia inteira (o limite e dela);
  -- "ativas/lentas" so clientes, sem o proprio coletor e sem os processos
  -- internos do Supabase (pg_cron, pg_net, exporter).
  select
    count(*) filter (where backend_type = 'client backend') as conexoes,
    count(*) filter (where backend_type = 'client backend' and state = 'active' and pid <> pg_backend_pid()
                     and coalesce(usename, '') <> 'supabase_admin') as ativas,
    count(*) filter (where state like 'idle in transaction%') as ociosas_tx,
    count(*) filter (where backend_type = 'client backend' and state = 'active' and pid <> pg_backend_pid()
                     and coalesce(usename, '') <> 'supabase_admin' and v_agora - query_start > interval '5 seconds') as lentas_5s,
    count(*) filter (where backend_type = 'client backend' and state = 'active' and pid <> pg_backend_pid()
                     and coalesce(usename, '') <> 'supabase_admin' and v_agora - query_start > interval '30 seconds') as lentas_30s,
    max(extract(epoch from v_agora - query_start)) filter (where backend_type = 'client backend' and state = 'active'
                     and pid <> pg_backend_pid() and coalesce(usename, '') <> 'supabase_admin') as mais_longa_s,
    count(*) filter (where wait_event_type = 'Lock') as esperando_lock
  into v_ativ
  from pg_stat_activity;

  select coalesce(jsonb_agg(x order by x.s desc), '[]'::jsonb) into v_consultas
  from (
    select a.pid,
           round(extract(epoch from v_agora - a.query_start)::numeric, 1) as s,
           a.usename as u,
           nullif(a.application_name, '') as app,
           case when a.wait_event_type is null then null else a.wait_event_type || ':' || a.wait_event end as w,
           cardinality(pg_blocking_pids(a.pid)) as b,
           left(regexp_replace(a.query, '\s+', ' ', 'g'), 400) as q
    from pg_stat_activity a
    where a.backend_type = 'client backend'
      and a.state = 'active'
      and a.pid <> pg_backend_pid()
      and coalesce(a.usename, '') <> 'supabase_admin'
      and v_agora - a.query_start > interval '2 seconds'
    order by a.query_start
    limit 15
  ) x;

  -- Contadores do banco: delta desde a amostra anterior.
  select temp_bytes, blks_read, blks_hit into v_db
  from pg_stat_database where datid = v_dbid;
  select * into v_base from public.ops_desempenho_base_db where id = 1;

  -- pg_stat_statements: delta por queryid. Sem texto (false) para nao ler o
  -- arquivo de textos a cada minuto.
  select exists (select 1 from public.ops_desempenho_base_stmt) into v_tem_base;

  if v_tem_base then
    with atual as (
      select s.queryid, sum(s.calls)::bigint as calls, sum(s.total_exec_time) as total_ms,
             sum(s.temp_blks_written)::bigint as temp_blks
      from extensions.pg_stat_statements(false) s
      where s.dbid = v_dbid and s.queryid is not null
      group by s.queryid
    ), delta as (
      select a.queryid,
             case when b.queryid is null or a.calls < b.calls then a.calls else a.calls - b.calls end as dc,
             case when b.queryid is null or a.calls < b.calls then a.total_ms else a.total_ms - b.total_ms end as dms,
             case when b.queryid is null or a.calls < b.calls then a.temp_blks else a.temp_blks - b.temp_blks end as dt
      from atual a
      left join public.ops_desempenho_base_stmt b using (queryid)
    )
    select
      coalesce(sum(dms), 0),
      coalesce(sum(dc), 0),
      coalesce((
        select jsonb_agg(jsonb_build_object('id', t.queryid::text, 'c', t.dc, 'ms', round(t.dms::numeric, 1), 't', t.dt) order by t.dms desc)
        from (select * from delta where dms > 0 order by dms desc limit 12) t
      ), '[]'::jsonb)
    into v_tempo, v_chamadas, v_top
    from delta;
  end if;

  insert into public.ops_desempenho_base_stmt as b (queryid, calls, total_ms, temp_blks)
  select s.queryid, sum(s.calls)::bigint, sum(s.total_exec_time), sum(s.temp_blks_written)::bigint
  from extensions.pg_stat_statements(false) s
  where s.dbid = v_dbid and s.queryid is not null
  group by s.queryid
  on conflict (queryid) do update
    set calls = excluded.calls, total_ms = excluded.total_ms, temp_blks = excluded.temp_blks
    where (b.calls, b.total_ms, b.temp_blks) is distinct from (excluded.calls, excluded.total_ms, excluded.temp_blks);

  -- Texto so das consultas novas no top (le o arquivo de textos so quando precisa).
  if exists (
    select 1 from jsonb_array_elements(v_top) e
    where not exists (select 1 from public.ops_desempenho_textos t where t.queryid = (e->>'id')::bigint)
  ) then
    insert into public.ops_desempenho_textos (queryid, texto)
    select distinct on (s.queryid) s.queryid, left(regexp_replace(s.query, '\s+', ' ', 'g'), 4000)
    from extensions.pg_stat_statements(true) s
    where s.dbid = v_dbid
      and s.queryid in (select (e->>'id')::bigint from jsonb_array_elements(v_top) e)
    on conflict (queryid) do nothing;
  end if;

  insert into public.ops_desempenho_amostras (
    em, intervalo_s, conexoes, max_conexoes, ativas, ociosas_em_transacao,
    lentas_5s, lentas_30s, mais_longa_s, esperando_lock, banco_bytes,
    db_tempo_ms, db_chamadas, temp_bytes, blks_read, blks_hit, consultas, top
  ) values (
    v_agora,
    case when v_base.em is null then null else round(extract(epoch from v_agora - v_base.em)::numeric, 1) end,
    v_ativ.conexoes,
    current_setting('max_connections')::integer,
    v_ativ.ativas,
    v_ativ.ociosas_tx,
    v_ativ.lentas_5s,
    v_ativ.lentas_30s,
    round(coalesce(v_ativ.mais_longa_s, 0)::numeric, 1),
    v_ativ.esperando_lock,
    case when extract(minute from v_agora)::integer % 15 = 0 then pg_database_size(current_database()) end,
    case when v_tem_base then round(v_tempo, 1) end,
    case when v_tem_base then v_chamadas end,
    case when v_base.em is not null and v_db.temp_bytes >= v_base.temp_bytes then v_db.temp_bytes - v_base.temp_bytes end,
    case when v_base.em is not null and v_db.blks_read >= v_base.blks_read then v_db.blks_read - v_base.blks_read end,
    case when v_base.em is not null and v_db.blks_hit >= v_base.blks_hit then v_db.blks_hit - v_base.blks_hit end,
    v_consultas,
    v_top
  )
  on conflict (em) do nothing;

  insert into public.ops_desempenho_base_db (id, em, temp_bytes, blks_read, blks_hit)
  values (1, v_agora, v_db.temp_bytes, v_db.blks_read, v_db.blks_hit)
  on conflict (id) do update
    set em = excluded.em, temp_bytes = excluded.temp_bytes, blks_read = excluded.blks_read, blks_hit = excluded.blks_hit;

  -- Faxina, uma vez por hora.
  if extract(minute from v_agora) = 0 then
    delete from public.ops_desempenho_amostras where em < v_agora - interval '14 days';
    delete from public.ops_desempenho_cliente where recebido_em < v_agora - interval '7 days';
    delete from public.ops_desempenho_acoes where em < v_agora - interval '180 days';
    delete from public.ops_desempenho_base_stmt b
    where not exists (
      select 1 from extensions.pg_stat_statements(false) s where s.queryid = b.queryid and s.dbid = v_dbid
    );
    begin
      delete from cron.job_run_details where end_time < v_agora - interval '3 days';
    exception when others then
      null; -- sem permissao no log do cron: nao derruba a amostra
    end;
  end if;
end;
$$;

revoke all on function public.ops_desempenho_coletar() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aparelhos: resumo de 5 min
-- ---------------------------------------------------------------------------

create or replace function public.registrar_desempenho_cliente(
  p_device_id text,
  p_plataforma text,
  p_conexao text,
  p_janela_inicio timestamptz,
  p_janela_fim timestamptz,
  p_resumo jsonb,
  p_endpoints jsonb,
  p_paginas jsonb
) returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '5s'
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '28000';
  end if;
  if p_device_id is null or char_length(p_device_id) < 8 or char_length(p_device_id) > 80 then
    raise exception 'device_id invalido' using errcode = '22023';
  end if;
  if octet_length(coalesce(p_endpoints::text, '')) + octet_length(coalesce(p_paginas::text, '')) > 65536 then
    raise exception 'resumo grande demais' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_endpoints, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_paginas, '{}'::jsonb)) <> 'object' then
    raise exception 'resumo invalido' using errcode = '22023';
  end if;

  -- No maximo um resumo por aparelho por minuto (aba duplicada, reenvio).
  if exists (
    select 1 from public.ops_desempenho_cliente
    where device_id = p_device_id and user_id = v_uid and recebido_em > now() - interval '60 seconds'
  ) then
    return;
  end if;

  select name into v_nome from public.profiles where id = v_uid::text;

  insert into public.ops_desempenho_cliente (
    device_id, user_id, user_name, plataforma, conexao, janela_inicio, janela_fim,
    requisicoes, tempo_ms, lentas, erros, travamentos, travamento_ms, travamento_max_ms, memoria_mb,
    bytes, storage_n, storage_bytes, pagina_atual, visivel,
    endpoints, paginas
  ) values (
    p_device_id,
    v_uid,
    left(v_nome, 120),
    left(p_plataforma, 80),
    left(p_conexao, 20),
    least(coalesce(p_janela_inicio, now()), now()),
    least(coalesce(p_janela_fim, now()), now()),
    greatest(coalesce((p_resumo->>'requisicoes')::integer, 0), 0),
    greatest(coalesce((p_resumo->>'tempo_ms')::bigint, 0), 0),
    greatest(coalesce((p_resumo->>'lentas')::integer, 0), 0),
    greatest(coalesce((p_resumo->>'erros')::integer, 0), 0),
    greatest(coalesce((p_resumo->>'travamentos')::integer, 0), 0),
    greatest(coalesce((p_resumo->>'travamento_ms')::bigint, 0), 0),
    greatest(coalesce((p_resumo->>'travamento_max_ms')::integer, 0), 0),
    nullif((p_resumo->>'memoria_mb')::integer, 0),
    greatest(coalesce((p_resumo->>'bytes')::bigint, 0), 0),
    greatest(coalesce((p_resumo->>'storage_n')::integer, 0), 0),
    greatest(coalesce((p_resumo->>'storage_bytes')::bigint, 0), 0),
    left(p_resumo->>'pagina_atual', 120),
    coalesce((p_resumo->>'visivel')::boolean, true),
    coalesce(p_endpoints, '{}'::jsonb),
    coalesce(p_paginas, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.registrar_desempenho_cliente(text, text, text, timestamptz, timestamptz, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_desempenho_cliente(text, text, text, timestamptz, timestamptz, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Leitura (admin)
-- ---------------------------------------------------------------------------

create or replace function public.admin_desempenho_agora()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
set statement_timeout = '15s'
as $$
declare
  v_dbid oid := (select oid from pg_database where datname = current_database());
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'em', clock_timestamp(),
    'max_conexoes', current_setting('max_connections')::integer,
    'statement_timeout', (select setting from pg_db_role_setting s, unnest(s.setconfig) setting
                          where s.setrole = (select oid from pg_roles where rolname = 'authenticated')
                            and setting like 'statement_timeout=%' limit 1),
    'conexoes', (
      select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
        select coalesce(usename, backend_type) as usuario, nullif(application_name, '') as app,
               coalesce(state, '-') as estado, count(*) as n
        from pg_stat_activity
        where backend_type = 'client backend'
        group by 1, 2, 3
      ) x
    ),
    'processos', (
      select coalesce(jsonb_agg(x order by x.dur_s desc nulls last), '[]'::jsonb) from (
        select a.pid, a.usename as usuario, nullif(a.application_name, '') as app, a.state as estado,
               a.wait_event_type as espera_tipo, a.wait_event as espera,
               round(extract(epoch from clock_timestamp() - a.query_start)::numeric, 1) as dur_s,
               round(extract(epoch from clock_timestamp() - a.xact_start)::numeric, 1) as tx_s,
               pg_blocking_pids(a.pid) as bloqueado_por,
               left(regexp_replace(a.query, '\s+', ' ', 'g'), 3000) as consulta
        from pg_stat_activity a
        where a.backend_type = 'client backend'
          and a.pid <> pg_backend_pid()
          and a.state is distinct from 'idle'
          and coalesce(a.usename, '') <> 'supabase_admin'
        limit 100
      ) x
    ),
    'banco', (
      select jsonb_build_object(
        'tamanho_bytes', pg_database_size(current_database()),
        'cache_hit', round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2),
        'temp_bytes', temp_bytes,
        'temp_arquivos', temp_files,
        'deadlocks', deadlocks,
        'commits', xact_commit,
        'rollbacks', xact_rollback,
        'desde', stats_reset
      ) from pg_stat_database where datid = v_dbid
    ),
    'ultima_amostra', (select max(em) from public.ops_desempenho_amostras),
    -- Online = aparelho que mandou batimento nos ultimos 7 min (o reporter
    -- bate a cada 5 min com a aba aberta, mesmo sem chamada nenhuma).
    'online', (
      select coalesce(jsonb_agg(x order by x.ultimo desc), '[]'::jsonb) from (
        select distinct on (c.user_id, c.device_id)
               c.user_id, c.user_name, c.device_id, c.plataforma, c.conexao,
               c.pagina_atual, c.visivel, c.recebido_em as ultimo
        from public.ops_desempenho_cliente c
        where c.recebido_em > now() - interval '7 minutes'
        order by c.user_id, c.device_id, c.recebido_em desc
      ) x
    ),
    'coletor', (
      select jsonb_build_object('status', d.status, 'fim', d.end_time, 'mensagem', left(d.return_message, 300))
      from cron.job j join cron.job_run_details d on d.jobid = j.jobid
      where j.jobname = 'sisten-desempenho-amostra'
      order by d.runid desc limit 1
    )
  );
end;
$$;

create or replace function public.admin_desempenho_estatisticas()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
set statement_timeout = '20s'
as $$
declare
  v_dbid oid := (select oid from pg_database where datname = current_database());
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'desde', (select stats_reset from extensions.pg_stat_statements_info),
    'consultas', (
      select coalesce(jsonb_agg(x order by x.total_ms desc), '[]'::jsonb) from (
        select s.queryid::text as id,
               sum(s.calls)::bigint as chamadas,
               round(sum(s.total_exec_time)::numeric, 1) as total_ms,
               round((sum(s.total_exec_time) / nullif(sum(s.calls), 0))::numeric, 1) as media_ms,
               round(max(s.max_exec_time)::numeric, 1) as max_ms,
               sum(s.rows)::bigint as linhas,
               sum(s.temp_blks_written)::bigint as temp_blks,
               sum(s.shared_blks_read)::bigint as lidos_disco,
               left(regexp_replace(min(s.query), '\s+', ' ', 'g'), 4000) as texto
        from extensions.pg_stat_statements(true) s
        where s.dbid = v_dbid
        group by s.queryid
        order by sum(s.total_exec_time) desc
        limit 60
      ) x
    ),
    'tabelas', (
      select coalesce(jsonb_agg(x order by x.bytes desc), '[]'::jsonb) from (
        select t.relname as nome, t.n_live_tup as vivas, t.n_dead_tup as mortas,
               t.seq_scan, t.seq_tup_read, t.idx_scan,
               greatest(t.last_vacuum, t.last_autovacuum) as ultimo_vacuum,
               greatest(t.last_analyze, t.last_autoanalyze) as ultimo_analyze,
               pg_total_relation_size(t.relid) as bytes
        from pg_stat_user_tables t
        where t.schemaname = 'public'
        order by pg_total_relation_size(t.relid) desc
        limit 40
      ) x
    ),
    'matviews', (
      select coalesce(jsonb_agg(x order by x.bytes desc), '[]'::jsonb) from (
        select m.matviewname as nome, m.ispopulated as populada,
               pg_total_relation_size(format('%I.%I', m.schemaname, m.matviewname)::regclass) as bytes
        from pg_matviews m
        where m.schemaname = 'public'
      ) x
    ),
    'acoes', (
      select coalesce(jsonb_agg(x order by x.em desc), '[]'::jsonb) from (
        select em, user_name, acao, pid, left(consulta, 300) as consulta
        from public.ops_desempenho_acoes order by em desc limit 20
      ) x
    )
  );
end;
$$;

-- Linha do tempo em baldes de p_balde_min minutos. "carga" = tempo de banco
-- por segundo de relogio: em media, quantas consultas rodavam ao mesmo tempo.
create or replace function public.admin_desempenho_linha_tempo(
  p_desde timestamptz,
  p_ate timestamptz,
  p_balde_min integer default 5
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;
  if p_balde_min is null or p_balde_min < 1 or p_balde_min > 1440 then
    raise exception 'balde invalido' using errcode = '22023';
  end if;

  return (
    select coalesce(jsonb_agg(x order by x.balde), '[]'::jsonb) from (
      select date_bin(make_interval(mins => p_balde_min), em, timestamptz '2000-01-01') as balde,
             count(*) as amostras,
             max(conexoes) as conexoes,
             max(max_conexoes) as max_conexoes,
             max(ativas) as ativas_max,
             round(avg(ativas), 1) as ativas_media,
             max(lentas_5s) as lentas_5s,
             max(lentas_30s) as lentas_30s,
             max(mais_longa_s) as mais_longa_s,
             max(esperando_lock) as esperando_lock,
             max(ociosas_em_transacao) as ociosas_tx,
             round(sum(db_tempo_ms), 1) as db_tempo_ms,
             sum(db_chamadas) as chamadas,
             sum(temp_bytes) as temp_bytes,
             sum(blks_read) as blks_read,
             sum(blks_hit) as blks_hit,
             sum(intervalo_s) as segundos
      from public.ops_desempenho_amostras
      where em >= p_desde and em < p_ate
      group by 1
    ) x
  );
end;
$$;

-- Consultas que mais pesaram numa janela (soma do top de cada minuto) e o que
-- estava em execucao ha mais de 2 s naquelas amostras.
create or replace function public.admin_desempenho_janela(
  p_desde timestamptz,
  p_ate timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '20s'
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'amostras', (select count(*) from public.ops_desempenho_amostras where em >= p_desde and em < p_ate),
    'db_tempo_ms', (select round(sum(db_tempo_ms), 1) from public.ops_desempenho_amostras where em >= p_desde and em < p_ate),
    'segundos', (select sum(intervalo_s) from public.ops_desempenho_amostras where em >= p_desde and em < p_ate),
    'consultas', (
      select coalesce(jsonb_agg(to_jsonb(g) || jsonb_build_object('texto', t.texto) order by g.ms desc), '[]'::jsonb)
      from (
        select e->>'id' as id,
               sum((e->>'c')::bigint) as chamadas,
               round(sum((e->>'ms')::numeric), 1) as ms,
               sum((e->>'t')::bigint) as temp_blks,
               count(*) as minutos,
               max(a.em) as ultima
        from public.ops_desempenho_amostras a
        cross join lateral jsonb_array_elements(a.top) e
        where a.em >= p_desde and a.em < p_ate
        group by e->>'id'
        order by sum((e->>'ms')::numeric) desc
        limit 40
      ) g
      left join public.ops_desempenho_textos t on t.queryid = g.id::bigint
    ),
    'em_execucao', (
      select coalesce(jsonb_agg(x order by x.s desc), '[]'::jsonb) from (
        select (c->>'pid')::integer as pid,
               max((c->>'s')::numeric) as s,
               min(a.em) as visto_em,
               count(*) as amostras,
               max(c->>'w') as espera,
               max((c->>'b')::integer) as bloqueios,
               max(c->>'u') as usuario,
               c->>'q' as consulta
        from public.ops_desempenho_amostras a
        cross join lateral jsonb_array_elements(a.consultas) c
        where a.em >= p_desde and a.em < p_ate
        group by c->>'pid', c->>'q'
        order by max((c->>'s')::numeric) desc
        limit 50
      ) x
    )
  );
end;
$$;

create or replace function public.admin_desempenho_aparelhos(
  p_desde timestamptz,
  p_ate timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '20s'
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'usuarios', (
      select coalesce(jsonb_agg(x order by x.tempo_ms desc), '[]'::jsonb) from (
        select user_id, max(user_name) as user_name,
               count(distinct device_id) as aparelhos,
               string_agg(distinct plataforma, ', ') as plataformas,
               sum(requisicoes) as requisicoes, sum(tempo_ms) as tempo_ms,
               sum(lentas) as lentas, sum(erros) as erros,
               sum(travamentos) as travamentos, sum(travamento_ms) as travamento_ms,
               max(travamento_max_ms) as travamento_max_ms,
               max(memoria_mb) as memoria_mb,
               sum(bytes) as bytes, sum(storage_n) as storage_n, sum(storage_bytes) as storage_bytes,
               max(recebido_em) as ultimo
        from public.ops_desempenho_cliente
        where recebido_em >= p_desde and recebido_em < p_ate
        group by user_id
      ) x
    ),
    'endpoints', (
      select coalesce(jsonb_agg(x order by x.ms desc), '[]'::jsonb) from (
        select e.key as endpoint,
               sum((e.value->>'n')::bigint) as n,
               sum((e.value->>'ms')::bigint) as ms,
               max((e.value->>'mx')::bigint) as mx,
               sum((e.value->>'l')::bigint) as lentas,
               sum((e.value->>'e')::bigint) as erros,
               sum(coalesce((e.value->>'b')::bigint, 0)) as bytes,
               count(distinct c.user_id) as usuarios
        from public.ops_desempenho_cliente c
        cross join lateral jsonb_each(c.endpoints) e
        where c.recebido_em >= p_desde and c.recebido_em < p_ate
        group by e.key
        order by sum((e.value->>'ms')::bigint) desc
        limit 80
      ) x
    ),
    'endpoint_paginas', (
      select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
        select e.key as endpoint, p.key as pagina, sum((p.value)::text::bigint) as n
        from public.ops_desempenho_cliente c
        cross join lateral jsonb_each(c.endpoints) e
        cross join lateral jsonb_each(coalesce(e.value->'p', '{}'::jsonb)) p
        where c.recebido_em >= p_desde and c.recebido_em < p_ate
        group by e.key, p.key
        order by sum((p.value)::text::bigint) desc
        limit 300
      ) x
    ),
    'paginas', (
      select coalesce(jsonb_agg(x order by x.ms desc), '[]'::jsonb) from (
        select p.key as pagina,
               sum(coalesce((p.value->>'v')::bigint, 0)) as visitas,
               sum(coalesce((p.value->>'b')::bigint, 0)) as bytes,
               sum((p.value->>'n')::bigint) as n,
               sum((p.value->>'ms')::bigint) as ms,
               sum((p.value->>'l')::bigint) as lentas,
               sum((p.value->>'e')::bigint) as erros,
               sum((p.value->>'tv')::bigint) as travamentos,
               sum((p.value->>'tms')::bigint) as travamento_ms,
               count(distinct c.user_id) as usuarios
        from public.ops_desempenho_cliente c
        cross join lateral jsonb_each(c.paginas) p
        where c.recebido_em >= p_desde and c.recebido_em < p_ate
        group by p.key
        order by sum((p.value->>'ms')::bigint) desc
        limit 60
      ) x
    )
  );
end;
$$;

-- Consumo: o que pesa na conta do Supabase e da pra ver de dentro do banco.
-- Egress real (faturado) so a API de gestao informa; aqui vai a estimativa
-- dos aparelhos (volume descompactado: teto do que saiu) por dia, alem do
-- tamanho do banco, do Storage por bucket e dos usuarios ativos.
create or replace function public.admin_desempenho_consumo(
  p_desde timestamptz,
  p_ate timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '25s'
as $$
declare
  v_storage jsonb;
  v_auth jsonb;
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;

  begin
    select coalesce(jsonb_agg(x order by x.bytes desc), '[]'::jsonb) into v_storage from (
      select o.bucket_id as bucket, count(*) as arquivos,
             coalesce(sum((o.metadata->>'size')::bigint), 0) as bytes,
             count(*) filter (where o.created_at >= p_desde and o.created_at < p_ate) as novos,
             coalesce(sum((o.metadata->>'size')::bigint) filter (where o.created_at >= p_desde and o.created_at < p_ate), 0) as novos_bytes
      from storage.objects o
      group by o.bucket_id
    ) x;
  exception when others then
    v_storage := null;
  end;

  begin
    select jsonb_build_object(
      'total', (select count(*) from auth.users where deleted_at is null),
      'login_24h', (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours'),
      'login_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'sessoes_ativas', (select count(*) from auth.sessions where coalesce(refreshed_at, updated_at, created_at) > now() - interval '24 hours')
    ) into v_auth;
  exception when others then
    v_auth := null;
  end;

  return jsonb_build_object(
    'banco_bytes', pg_database_size(current_database()),
    'storage', v_storage,
    'auth', v_auth,
    'usuarios_periodo', (
      select count(distinct user_id) from public.ops_desempenho_cliente
      where recebido_em >= p_desde and recebido_em < p_ate
    ),
    'crescimento_banco', (
      select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb) from (
        select (em at time zone 'America/Sao_Paulo')::date as dia, max(banco_bytes) as bytes
        from public.ops_desempenho_amostras
        where banco_bytes is not null and em >= p_desde - interval '1 day' and em < p_ate
        group by 1
      ) x
    ),
    'por_dia', (
      select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb) from (
        select (recebido_em at time zone 'America/Sao_Paulo')::date as dia,
               count(distinct user_id) as usuarios,
               sum(requisicoes) as requisicoes,
               sum(bytes) as bytes,
               sum(storage_n) as storage_n,
               sum(storage_bytes) as storage_bytes,
               sum(lentas) as lentas,
               sum(erros) as erros
        from public.ops_desempenho_cliente
        where recebido_em >= p_desde and recebido_em < p_ate
        group by 1
      ) x
    ),
    'por_hora', (
      select coalesce(jsonb_agg(x order by x.hora), '[]'::jsonb) from (
        select extract(hour from recebido_em at time zone 'America/Sao_Paulo')::integer as hora,
               count(distinct user_id) as usuarios,
               sum(requisicoes) as requisicoes,
               sum(bytes) as bytes
        from public.ops_desempenho_cliente
        where recebido_em >= p_desde and recebido_em < p_ate
        group by 1
      ) x
    ),
    'banco_por_dia', (
      select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb) from (
        select (em at time zone 'America/Sao_Paulo')::date as dia,
               sum(db_chamadas) as chamadas,
               round(sum(db_tempo_ms) / 1000.0, 1) as tempo_s,
               sum(temp_bytes) as temp_bytes,
               sum(blks_read) * 8192 as lido_disco_bytes
        from public.ops_desempenho_amostras
        where em >= p_desde and em < p_ate
        group by 1
      ) x
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Acoes (admin)
-- ---------------------------------------------------------------------------

-- Cancela (nao encerra a conexao) uma consulta do app. So backends do
-- PostgREST: nada de mexer no Storage, Auth ou processos internos.
create or replace function public.admin_desempenho_cancelar(p_pid integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_proc record;
  v_ok boolean;
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;

  select pid, usename, state, query into v_proc
  from pg_stat_activity
  where pid = p_pid and backend_type = 'client backend';
  if not found then
    return false;
  end if;
  if coalesce(v_proc.usename, '') <> 'authenticator' then
    raise exception 'So consultas do app (PostgREST) podem ser canceladas por aqui' using errcode = '42501';
  end if;

  v_ok := pg_cancel_backend(p_pid);

  insert into public.ops_desempenho_acoes (user_id, user_name, acao, pid, consulta)
  values (auth.uid(), (select name from public.profiles where id = auth.uid()::text),
          case when v_ok then 'cancelar' else 'cancelar (falhou)' end, p_pid,
          left(regexp_replace(v_proc.query, '\s+', ' ', 'g'), 1000));
  return v_ok;
end;
$$;

-- Zera pg_stat_statements para medir o antes/depois de uma correcao. As
-- amostras por minuto nao se perdem (o coletor trata o reset como delta).
create or replace function public.admin_desempenho_zerar_estatisticas()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;
  perform extensions.pg_stat_statements_reset();
  delete from public.ops_desempenho_base_stmt;
  insert into public.ops_desempenho_acoes (user_id, user_name, acao)
  values (auth.uid(), (select name from public.profiles where id = auth.uid()::text), 'zerar estatisticas');
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_desempenho_agora()',
    'admin_desempenho_estatisticas()',
    'admin_desempenho_linha_tempo(timestamptz, timestamptz, integer)',
    'admin_desempenho_janela(timestamptz, timestamptz)',
    'admin_desempenho_aparelhos(timestamptz, timestamptz)',
    'admin_desempenho_consumo(timestamptz, timestamptz)',
    'admin_desempenho_cancelar(integer)',
    'admin_desempenho_zerar_estatisticas()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Agendamento
-- ---------------------------------------------------------------------------

select cron.unschedule(jobid) from cron.job where jobname = 'sisten-desempenho-amostra';
select cron.schedule('sisten-desempenho-amostra', '* * * * *', 'select public.ops_desempenho_coletar()');

notify pgrst, 'reload schema';
