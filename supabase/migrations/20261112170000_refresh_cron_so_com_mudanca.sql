-- pg_cron: recalcular as MVs só quando as tabelas de origem mudaram.
--
-- Medido em 12/11/2026 (pg_cron.job_run_details, 24 h):
--   sisten-controle-estoque  */30  27 rodadas, 6,5 s em média (máx. 12,9 s)
--   sisten-requisicoes-po    */15  31 rodadas, 2,8 s em média (máx. 6,4 s)
-- Os dois recalculavam a MV inteira (REFRESH CONCURRENTLY = consulta inteira
-- + diferença) mesmo sem carga nova, e caíam juntos no :00 e no :30. Na
-- instância Micro (2 vCPU, 1 GB) cada rodada é um pico de CPU de segundos.
--
-- Agora cada refresh guarda uma "assinatura" das tabelas de origem (soma de
-- linhas inseridas/alteradas/apagadas no pg_stat, < 1 ms) e o pg_cron só
-- recalcula quando ela mudou — ou uma vez por dia, para o que depende da data.
-- Quem chama o refresh direto (importação, Configurar, botão) continua
-- recalculando sempre e já registra a assinatura, então o pg_cron não repete.

create table if not exists private.mv_refresh_controle (
  chave          text primary key,
  assinatura     numeric not null,
  refrescado_em  timestamptz not null default now()
);
revoke all on private.mv_refresh_controle from public, anon, authenticated;

-- Soma dos contadores de linhas das tabelas por trás de uma MV, descendo por
-- views e MVs (pg_rewrite → pg_depend). Muda a cada INSERT/UPDATE/DELETE nas
-- origens; reinício do banco zera os contadores, o que também conta como
-- mudança (recalcula uma vez a mais — o lado seguro).
create or replace function private.assinatura_fontes(p_mv regclass)
returns numeric
language sql
stable
set search_path = pg_catalog
as $$
  with recursive dep(rel, nivel) as (
    select p_mv::oid, 0
    union
    select d.refobjid, dep.nivel + 1
      from dep
      join pg_rewrite r on r.ev_class = dep.rel
      join pg_depend d on d.objid = r.oid
                      and d.classid = 'pg_rewrite'::regclass
                      and d.refclassid = 'pg_class'::regclass
     where d.refobjid <> dep.rel and dep.nivel < 10
  )
  select coalesce(sum(pg_stat_get_tuples_inserted(c.oid)
                    + pg_stat_get_tuples_updated(c.oid)
                    + pg_stat_get_tuples_deleted(c.oid)), 0)::numeric
    from (select distinct rel from dep) x
    join pg_class c on c.oid = x.rel and c.relkind in ('r', 'p');
$$;
revoke all on function private.assinatura_fontes(regclass) from public, anon, authenticated;

create or replace function private.registrar_refresh(p_chave text, p_assinatura numeric)
returns void
language sql
set search_path = private, pg_catalog
as $$
  insert into private.mv_refresh_controle (chave, assinatura, refrescado_em)
  values (p_chave, p_assinatura, now())
  on conflict (chave) do update
    set assinatura = excluded.assinatura, refrescado_em = excluded.refrescado_em;
$$;
revoke all on function private.registrar_refresh(text, numeric) from public, anon, authenticated;

-- Nada mudou desde o último refresh e ele foi hoje (horário de Brasília)?
create or replace function private.refresh_desnecessario(p_chave text, p_mv regclass)
returns boolean
language sql
stable
set search_path = private, pg_catalog
as $$
  select exists (
    select 1 from private.mv_refresh_controle c
     where c.chave = p_chave
       and c.assinatura = private.assinatura_fontes(p_mv)
       and (c.refrescado_em at time zone 'America/Sao_Paulo')::date
           = (now() at time zone 'America/Sao_Paulo')::date
  );
$$;
revoke all on function private.refresh_desnecessario(text, regclass) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Controle de Estoque (mesmo corpo de 20261111250000 + assinatura)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_almox_controle_estoque()
returns timestamptz
language plpgsql
security definer
set search_path = public, private, pg_temp
set statement_timeout = '300s'
as $$
declare
  -- Lida antes: o que mudar durante o recálculo dispara a próxima rodada.
  v_assinatura numeric := private.assinatura_fontes('private.mv_almox_controle_estoque'::regclass);
begin
  -- Um recálculo por vez: importações seguidas e o pg_cron não se empilham.
  if not pg_try_advisory_xact_lock(hashtext('refresh_almox_controle_estoque')) then
    return null;
  end if;
  refresh materialized view concurrently private.mv_estoque_reposicao;
  refresh materialized view concurrently private.mv_almox_controle_estoque;
  perform private.registrar_refresh('almox_controle_estoque', v_assinatura);
  return now();
end;
$$;
revoke all on function public.refresh_almox_controle_estoque() from public, anon;
grant execute on function public.refresh_almox_controle_estoque() to authenticated;

create or replace function private.cron_refresh_almox_controle_estoque()
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if private.refresh_desnecessario('almox_controle_estoque', 'private.mv_almox_controle_estoque'::regclass) then
    return;
  end if;
  perform public.refresh_almox_controle_estoque();
end;
$$;
revoke all on function private.cron_refresh_almox_controle_estoque() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Parte SAP das requisições (mesmo corpo de 20261111260000 + assinatura)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_sap_requisicoes_po()
returns void
language plpgsql
security definer
set search_path = public, private
set work_mem = '64MB'
as $fn$
declare
  v_assinatura numeric;
begin
  perform pg_advisory_xact_lock(hashtext('refresh_sap_requisicoes_po'));
  v_assinatura := private.assinatura_fontes('private.mv_sap_requisicoes_po'::regclass);
  refresh materialized view concurrently private.mv_sap_requisicoes_po;
  perform private.registrar_refresh('sap_requisicoes_po', v_assinatura);
end
$fn$;
revoke all on function public.refresh_sap_requisicoes_po() from public, anon;
grant execute on function public.refresh_sap_requisicoes_po() to authenticated, service_role;

create or replace function private.cron_refresh_sap_requisicoes_po()
returns void
language plpgsql
security definer
set search_path = public, private
as $fn$
begin
  if private.refresh_desnecessario('sap_requisicoes_po', 'private.mv_sap_requisicoes_po'::regclass) then
    return;
  end if;
  perform public.refresh_sap_requisicoes_po();
end
$fn$;
revoke all on function private.cron_refresh_sap_requisicoes_po() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agenda: mesmas janelas (UTC), minutos desencontrados — antes os dois
-- caíam juntos no :00 e no :30.
-- ---------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'sisten-controle-estoque';
select cron.schedule('sisten-controle-estoque', '12,42 9-23 * * 1-6',
                     'select private.cron_refresh_almox_controle_estoque()');

select cron.unschedule(jobid) from cron.job where jobname = 'sisten-requisicoes-po';
select cron.schedule('sisten-requisicoes-po', '5,20,35,50 9-23 * * 1-6',
                     'select private.cron_refresh_sap_requisicoes_po()');
