-- Monitor de Desempenho: resumo do dia.
--
-- Junta, para um dia (horario de Brasilia), tudo o que o monitor viu: carga e
-- disponibilidade do banco hora a hora, os piores momentos e o que rodava
-- neles, as consultas que mais pesaram, as paginas e usuarios que mais
-- esperaram e o consumo (banco, Storage, volume baixado). A analise em texto
-- (o que esta errado e o que fazer) e montada na tela, a partir deste JSON
-- (src/lib/desempenho/resumoDia.ts).
--
-- O resumo de cada dia fechado fica guardado em ops_desempenho_resumo_dia
-- (~20 KB por dia, 400 dias), gerado pelo pg_cron as 00:15 de Brasilia. Assim
-- o detalhe bruto dos aparelhos pode sair em 7 dias sem perder o historico.
-- O dia de hoje e montado na hora (parcial).

create table if not exists public.ops_desempenho_resumo_dia (
  dia date primary key,
  dados jsonb not null,
  gerado_em timestamptz not null default now()
);

comment on table public.ops_desempenho_resumo_dia is
  'Resumo consolidado de cada dia do Monitor de Desempenho (pg_cron 00:15 BRT). So admin, via RPC.';

alter table public.ops_desempenho_resumo_dia enable row level security;
revoke all on table public.ops_desempenho_resumo_dia from anon, authenticated;

create or replace function public.ops_desempenho_montar_resumo(p_dia date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '60s'
as $$
declare
  v_ini timestamptz := (p_dia::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_ate timestamptz := least(((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo'), now());
  v_banco jsonb;
  v_horas jsonb;
  v_piores jsonb;
  v_consultas jsonb;
  v_longas jsonb;
  v_buracos jsonb;
  v_totais jsonb;
  v_paginas jsonb;
  v_endpoints jsonb;
  v_usuarios jsonb;
  v_storage jsonb;
  v_logins integer;
begin
  -- Banco no dia
  select jsonb_build_object(
    'amostras', count(*),
    'minutos_periodo', round(extract(epoch from v_ate - v_ini) / 60),
    'primeira', min(em),
    'ultima', max(em),
    'tempo_ms', round(sum(db_tempo_ms), 1),
    'segundos', sum(intervalo_s),
    'chamadas', sum(db_chamadas),
    'temp_bytes', sum(temp_bytes),
    'lido_disco_bytes', sum(blks_read) * 8192,
    'minutos_com_lentas', count(*) filter (where lentas_5s > 0),
    'max_lentas', max(lentas_5s),
    'minutos_com_lock', count(*) filter (where esperando_lock > 0),
    'max_conexoes', max(conexoes),
    'limite_conexoes', max(max_conexoes),
    'hora_max_conexoes', (array_agg(em order by conexoes desc))[1],
    'mais_longa_s', max(mais_longa_s),
    'banco_inicio', (array_agg(banco_bytes order by em) filter (where banco_bytes is not null))[1],
    'banco_fim', (array_agg(banco_bytes order by em desc) filter (where banco_bytes is not null))[1]
  ) into v_banco
  from public.ops_desempenho_amostras
  where em >= v_ini and em < v_fim;

  -- Hora a hora
  select coalesce(jsonb_agg(x order by x.hora), '[]'::jsonb) into v_horas from (
    select extract(hour from em at time zone 'America/Sao_Paulo')::integer as hora,
           count(*) as amostras,
           round(sum(db_tempo_ms) / nullif(sum(intervalo_s) * 1000, 0), 2) as carga,
           max(lentas_5s) as lentas,
           max(conexoes) as conexoes,
           count(*) filter (where esperando_lock > 0) as minutos_lock
    from public.ops_desempenho_amostras
    where em >= v_ini and em < v_fim
    group by 1
  ) x;

  -- Os 5 piores blocos de 5 min e o que pesou em cada um
  with b as (
    select date_bin('5 minutes', em, timestamptz '2000-01-01') as balde,
           sum(db_tempo_ms) / nullif(sum(intervalo_s) * 1000, 0) as carga,
           max(lentas_5s) as lentas,
           max(conexoes) as conexoes
    from public.ops_desempenho_amostras
    where em >= v_ini and em < v_fim
    group by 1
  ), piores as (
    select * from b where carga is not null order by carga desc limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'balde', p.balde,
           'carga', round(p.carga::numeric, 2),
           'lentas', p.lentas,
           'conexoes', p.conexoes,
           'consultas', (
             select coalesce(jsonb_agg(q order by q.ms desc), '[]'::jsonb) from (
               select e->>'id' as id,
                      round(sum((e->>'ms')::numeric)) as ms,
                      sum((e->>'c')::bigint) as chamadas,
                      left(max(t.texto), 1500) as texto
               from public.ops_desempenho_amostras a
               cross join lateral jsonb_array_elements(a.top) e
               left join public.ops_desempenho_textos t on t.queryid = (e->>'id')::bigint
               where a.em >= p.balde and a.em < p.balde + interval '5 minutes'
               group by e->>'id'
               order by sum((e->>'ms')::numeric) desc
               limit 3
             ) q
           )
         ) order by p.carga desc), '[]'::jsonb)
  into v_piores
  from piores p;

  -- Consultas que mais pesaram no dia
  select coalesce(jsonb_agg(x order by x.ms desc), '[]'::jsonb) into v_consultas from (
    select e->>'id' as id,
           round(sum((e->>'ms')::numeric)) as ms,
           sum((e->>'c')::bigint) as chamadas,
           sum((e->>'t')::bigint) as temp_blks,
           count(*) as minutos,
           left(max(t.texto), 1500) as texto
    from public.ops_desempenho_amostras a
    cross join lateral jsonb_array_elements(a.top) e
    left join public.ops_desempenho_textos t on t.queryid = (e->>'id')::bigint
    where a.em >= v_ini and a.em < v_fim
    group by e->>'id'
    order by sum((e->>'ms')::numeric) desc
    limit 15
  ) x;

  -- Consultas mais longas flagradas em execucao
  select coalesce(jsonb_agg(x order by x.s desc), '[]'::jsonb) into v_longas from (
    select max((c->>'s')::numeric) as s,
           min(a.em) as visto_em,
           max((c->>'b')::integer) as bloqueios,
           left(c->>'q', 400) as consulta
    from public.ops_desempenho_amostras a
    cross join lateral jsonb_array_elements(a.consultas) c
    where a.em >= v_ini and a.em < v_fim
    group by c->>'pid', c->>'q'
    order by max((c->>'s')::numeric) desc
    limit 10
  ) x;

  -- Buracos: mais de 3 min sem amostra (banco sem responder ou coletor fora)
  select coalesce(jsonb_agg(x order by x.de), '[]'::jsonb) into v_buracos from (
    select anterior as de, em as ate, round(extract(epoch from em - anterior) / 60) as minutos
    from (
      select em, lag(em) over (order by em) as anterior
      from public.ops_desempenho_amostras
      where em >= v_ini and em < v_fim
    ) s
    where anterior is not null and em - anterior > interval '3 minutes'
    order by em - anterior desc
    limit 10
  ) x;

  -- Aparelhos
  select jsonb_build_object(
    'usuarios', count(distinct user_id),
    'aparelhos', count(distinct device_id),
    'requisicoes', coalesce(sum(requisicoes), 0),
    'tempo_ms', coalesce(sum(tempo_ms), 0),
    'lentas', coalesce(sum(lentas), 0),
    'erros', coalesce(sum(erros), 0),
    'bytes', coalesce(sum(bytes), 0),
    'storage_n', coalesce(sum(storage_n), 0),
    'storage_bytes', coalesce(sum(storage_bytes), 0),
    'travamentos', coalesce(sum(travamentos), 0),
    'travamento_ms', coalesce(sum(travamento_ms), 0),
    'memoria_max_mb', max(memoria_mb)
  ) into v_totais
  from public.ops_desempenho_cliente
  where recebido_em >= v_ini and recebido_em < v_fim;

  select coalesce(jsonb_agg(x order by x.ms desc), '[]'::jsonb) into v_paginas from (
    select p.key as pagina,
           sum(coalesce((p.value->>'v')::bigint, 0)) as visitas,
           sum((p.value->>'n')::bigint) as n,
           sum((p.value->>'ms')::bigint) as ms,
           sum(coalesce((p.value->>'b')::bigint, 0)) as bytes,
           sum((p.value->>'l')::bigint) as lentas,
           sum((p.value->>'e')::bigint) as erros,
           sum((p.value->>'tms')::bigint) as travamento_ms,
           count(distinct c.user_id) as usuarios
    from public.ops_desempenho_cliente c
    cross join lateral jsonb_each(c.paginas) p
    where c.recebido_em >= v_ini and c.recebido_em < v_fim
    group by p.key
    order by sum((p.value->>'ms')::bigint) desc
    limit 12
  ) x;

  select coalesce(jsonb_agg(x order by x.ms desc), '[]'::jsonb) into v_endpoints from (
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
    where c.recebido_em >= v_ini and c.recebido_em < v_fim
    group by e.key
    order by sum((e.value->>'ms')::bigint) desc
    limit 12
  ) x;

  select coalesce(jsonb_agg(x order by x.tempo_ms desc), '[]'::jsonb) into v_usuarios from (
    select max(user_name) as user_name,
           sum(requisicoes) as requisicoes,
           sum(tempo_ms) as tempo_ms,
           sum(lentas) as lentas,
           sum(erros) as erros,
           sum(travamento_ms) as travamento_ms,
           max(travamento_max_ms) as travamento_max_ms,
           max(memoria_mb) as memoria_mb,
           sum(bytes) + sum(storage_bytes) as bytes
    from public.ops_desempenho_cliente
    where recebido_em >= v_ini and recebido_em < v_fim
    group by user_id
    order by sum(tempo_ms) desc
    limit 10
  ) x;

  begin
    select coalesce(jsonb_agg(x order by x.bytes desc), '[]'::jsonb) into v_storage from (
      select bucket_id as bucket, count(*) as arquivos, coalesce(sum((metadata->>'size')::bigint), 0) as bytes
      from storage.objects
      where created_at >= v_ini and created_at < v_fim
      group by bucket_id
    ) x;
    select count(*) into v_logins from auth.users where last_sign_in_at >= v_ini and last_sign_in_at < v_fim;
  exception when others then
    v_storage := null;
    v_logins := null;
  end;

  return jsonb_build_object(
    'dia', p_dia,
    'gerado_em', now(),
    'parcial', v_fim > now(),
    'banco', v_banco,
    'horas', v_horas,
    'piores', v_piores,
    'consultas', v_consultas,
    'longas', v_longas,
    'buracos', v_buracos,
    'aparelhos', jsonb_build_object('totais', v_totais, 'paginas', v_paginas, 'endpoints', v_endpoints, 'usuarios', v_usuarios),
    'consumo', jsonb_build_object('storage_novos', v_storage, 'logins', v_logins)
  );
end;
$$;

revoke all on function public.ops_desempenho_montar_resumo(date) from public, anon, authenticated;

-- pg_cron, 00:15 de Brasilia: guarda o dia que acabou de fechar.
create or replace function public.ops_desempenho_fechar_dia()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
declare
  v_ontem date := (now() at time zone 'America/Sao_Paulo')::date - 1;
begin
  insert into public.ops_desempenho_resumo_dia (dia, dados, gerado_em)
  values (v_ontem, public.ops_desempenho_montar_resumo(v_ontem), now())
  on conflict (dia) do update set dados = excluded.dados, gerado_em = excluded.gerado_em;

  delete from public.ops_desempenho_resumo_dia where dia < v_ontem - 400;
end;
$$;

revoke all on function public.ops_desempenho_fechar_dia() from public, anon, authenticated;

-- Leitura (admin). Dia fechado: o guardado (gera e guarda se faltar).
-- Hoje: montado na hora. Junta os numeros do dia anterior para comparar.
create or replace function public.admin_desempenho_resumo_dia(p_dia date, p_recalcular boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dados jsonb;
  v_ant jsonb;
begin
  if not public.has_role('admin') then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;
  if p_dia is null or p_dia > v_hoje then
    raise exception 'Dia invalido' using errcode = '22023';
  end if;

  if p_dia < v_hoje then
    if not p_recalcular then
      select dados into v_dados from public.ops_desempenho_resumo_dia where dia = p_dia;
    end if;
    if v_dados is null then
      v_dados := public.ops_desempenho_montar_resumo(p_dia);
      if coalesce((v_dados->'banco'->>'amostras')::integer, 0) > 0
         or coalesce((v_dados->'aparelhos'->'totais'->>'requisicoes')::bigint, 0) > 0 then
        insert into public.ops_desempenho_resumo_dia (dia, dados, gerado_em)
        values (p_dia, v_dados, now())
        on conflict (dia) do update set dados = excluded.dados, gerado_em = excluded.gerado_em;
      end if;
    end if;
  else
    v_dados := public.ops_desempenho_montar_resumo(p_dia);
  end if;

  -- So os numeros-chave do dia anterior (se guardado); nao monta outro dia aqui.
  select jsonb_build_object('banco', dados->'banco', 'totais', dados->'aparelhos'->'totais')
  into v_ant
  from public.ops_desempenho_resumo_dia where dia = p_dia - 1;

  return v_dados || jsonb_build_object('anterior', v_ant);
end;
$$;

revoke all on function public.admin_desempenho_resumo_dia(date, boolean) from public, anon;
grant execute on function public.admin_desempenho_resumo_dia(date, boolean) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'sisten-desempenho-fechar-dia';
select cron.schedule('sisten-desempenho-fechar-dia', '15 3 * * *', 'select public.ops_desempenho_fechar_dia()');

notify pgrst, 'reload schema';
