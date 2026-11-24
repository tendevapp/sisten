-- Depois da queda de 24/11/2026 (ver memória "incidente-banco-travado-importacao"):
--
-- 1. Cópia pronta de `vw_sap_requisicoes_enriquecidas` para o download dos
--    aparelhos. A view custa ~170 ms, mas cada página de 1.000 do download
--    reordenava as ~3.700 linhas largas (~10 MB) por ri_po e transbordava para
--    disco (≈5 MB de temp por página; 10–24 s sob carga). A cópia tem PK em
--    ri_po: a página vira leitura de índice.
--
--    A view continua ao vivo para tudo o mais (telas, RPCs, releitura do
--    importador). A cópia é atualizada:
--      - por inteiro sempre que a parte SAP é recalculada
--        (`refresh_sap_requisicoes_po`: bump 'requisicoes', ZL0132/ME2L, cron);
--      - nos campos do comprador, por gatilho em sap_me5a_rc (qualquer caminho);
--      - 1×/dia às 06h05 (colunas que dependem de "hoje": dias em aberto, atraso).
--    Só grava o que mudou (sem reescrever a tabela a cada importação).
--
--    ATENÇÃO: coluna nova na view precisa entrar aqui também
--    (`alter table ... add column`), senão não chega aos aparelhos.
--
-- 2. statement_timeout do `authenticated` 120 s → 30 s: consulta presa é
--    cancelada em vez de empilhar até travar o banco. O PostgREST aplica o
--    statement_timeout declarado na função chamada por RPC (testado em
--    24/11: função com 10 s rodou 5 s sob o anon de 3 s), então as rotinas de
--    importação que passam de 30 s sob carga ganham limite próprio de 3 min.

-- ---------------------------------------------------------------------------
-- 1. Cópia de vw_sap_requisicoes_enriquecidas
-- ---------------------------------------------------------------------------

create table if not exists public.sap_requisicoes_enriquecidas_sync as
  select * from public.vw_sap_requisicoes_enriquecidas with no data;

alter table public.sap_requisicoes_enriquecidas_sync
  drop constraint if exists sap_requisicoes_enriquecidas_sync_pkey;
alter table public.sap_requisicoes_enriquecidas_sync
  add constraint sap_requisicoes_enriquecidas_sync_pkey primary key (ri_po);
create index if not exists sap_requisicoes_enriquecidas_sync_ri_idx
  on public.sap_requisicoes_enriquecidas_sync (ri);

comment on table public.sap_requisicoes_enriquecidas_sync is
  'Cópia de vw_sap_requisicoes_enriquecidas para o download dos aparelhos (localDb). Mantida por atualizar_sap_requisicoes_sync() e pelo gatilho dos campos do comprador em sap_me5a_rc. Coluna nova na view precisa ser acrescentada aqui.';

alter table public.sap_requisicoes_enriquecidas_sync enable row level security;
revoke all on public.sap_requisicoes_enriquecidas_sync from anon, authenticated;
grant select on public.sap_requisicoes_enriquecidas_sync to authenticated;
drop policy if exists sap_requisicoes_enriquecidas_sync_leitura on public.sap_requisicoes_enriquecidas_sync;
create policy sap_requisicoes_enriquecidas_sync_leitura on public.sap_requisicoes_enriquecidas_sync
  for select to authenticated using (true);

create or replace function public.atualizar_sap_requisicoes_sync()
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
set statement_timeout = '180s'
set work_mem = '16MB'
as $$
declare
  v_cols text;
  v_set text;
  v_s text;
  v_e text;
  v_faltando text;
begin
  perform pg_advisory_xact_lock(hashtext('atualizar_sap_requisicoes_sync'));

  select string_agg(format('%I', a.attname), ', ' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum) filter (where a.attname <> 'ri_po'),
         string_agg(format('s.%I', a.attname), ', ' order by a.attnum),
         string_agg(format('excluded.%I', a.attname), ', ' order by a.attnum)
    into v_cols, v_set, v_s, v_e
    from pg_attribute a
   where a.attrelid = 'public.sap_requisicoes_enriquecidas_sync'::regclass
     and a.attnum > 0 and not a.attisdropped;

  select string_agg(v.attname, ', ') into v_faltando
    from pg_attribute v
   where v.attrelid = 'public.vw_sap_requisicoes_enriquecidas'::regclass and v.attnum > 0
     and not exists (select 1 from pg_attribute t
                      where t.attrelid = 'public.sap_requisicoes_enriquecidas_sync'::regclass
                        and t.attname = v.attname and not t.attisdropped);
  if v_faltando is not null then
    raise warning 'sap_requisicoes_enriquecidas_sync sem as colunas da view: % (os aparelhos não recebem)', v_faltando;
  end if;

  execute format($f$
    with v as materialized (select %1$s from public.vw_sap_requisicoes_enriquecidas),
    apagadas as (
      delete from public.sap_requisicoes_enriquecidas_sync s
       where not exists (select 1 from v where v.ri_po = s.ri_po)
    )
    insert into public.sap_requisicoes_enriquecidas_sync as s (%1$s)
    select %1$s from v
    on conflict (ri_po) do update set %2$s
    where row(%3$s) is distinct from row(%4$s)
  $f$, v_cols, v_set, v_s, v_e);
end;
$$;

revoke all on function public.atualizar_sap_requisicoes_sync() from public, anon, authenticated;

-- Parte SAP recalculada → cópia atualizada logo em seguida.
create or replace function public.refresh_sap_requisicoes_po()
returns void
language plpgsql security definer
set search_path = public, private
set work_mem = '16MB'
set statement_timeout = '180s'
as $$
declare
  v_assinatura numeric;
begin
  perform pg_advisory_xact_lock(hashtext('refresh_sap_requisicoes_po'));
  v_assinatura := private.assinatura_fontes('private.mv_sap_requisicoes_po'::regclass);
  refresh materialized view concurrently private.mv_sap_requisicoes_po;
  perform private.registrar_refresh('sap_requisicoes_po', v_assinatura);
  perform public.atualizar_sap_requisicoes_sync();
end
$$;

-- Campos do comprador (obs, status do item, datas de entrega): qualquer
-- UPDATE em sap_me5a_rc (tela, RPC, importação) chega à cópia na hora.
create or replace function private.sap_me5a_rc_copiar_comprador()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.sap_requisicoes_enriquecidas_sync s
     set obs_comprador = n.obs_comprador,
         data_entrega_prevista = n.data_entrega_prevista,
         obs_updated_at = n.obs_updated_at,
         obs_updated_by = n.obs_updated_by,
         item_status = n.item_status,
         item_status_updated_at = n.item_status_updated_at,
         item_status_updated_by = n.item_status_updated_by,
         data_entrega_confirmada = n.data_entrega_confirmada
    from novas n
   where s.ri = n.ri
     and row(s.obs_comprador, s.data_entrega_prevista, s.obs_updated_at, s.obs_updated_by,
             s.item_status, s.item_status_updated_at, s.item_status_updated_by, s.data_entrega_confirmada)
         is distinct from
         row(n.obs_comprador, n.data_entrega_prevista, n.obs_updated_at, n.obs_updated_by,
             n.item_status, n.item_status_updated_at, n.item_status_updated_by, n.data_entrega_confirmada);
  return null;
exception when others then
  raise warning 'sap_me5a_rc_copiar_comprador: %', sqlerrm; -- não derruba a gravação do comprador
  return null;
end;
$$;

revoke all on function private.sap_me5a_rc_copiar_comprador() from public, anon, authenticated;

drop trigger if exists trg_sap_me5a_rc_copiar_comprador on public.sap_me5a_rc;
create trigger trg_sap_me5a_rc_copiar_comprador
  after update on public.sap_me5a_rc
  referencing new table as novas
  for each statement execute function private.sap_me5a_rc_copiar_comprador();

-- Colunas que dependem de "hoje": 1×/dia às 06h05 (09h05 UTC).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sisten-requisicoes-sync-diario') then
    perform cron.unschedule('sisten-requisicoes-sync-diario');
  end if;
  perform cron.schedule('sisten-requisicoes-sync-diario', '5 9 * * *', 'select public.atualizar_sap_requisicoes_sync()');
end $$;

-- Carga inicial (+ estatísticas: sem elas o plano ordena em disco em vez de usar a PK).
select public.atualizar_sap_requisicoes_sync();
analyze public.sap_requisicoes_enriquecidas_sync;

-- ---------------------------------------------------------------------------
-- 2. Limite de tempo: 30 s para todos; 3 min para as rotinas de importação
-- ---------------------------------------------------------------------------

alter function public.bump_dataset_version(text, bigint, text) set statement_timeout = '180s';
alter function public.refresh_historico_pedidos() set statement_timeout = '180s';
alter function public.refresh_material_sinais() set statement_timeout = '180s';
alter function public.obter_maiores_codigos_catalogo() set statement_timeout = '180s';

do $$
declare
  f regprocedure;
begin
  -- Importações chamadas por RPC (nomes do cliente); qualquer assinatura.
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('importar_catalogo_ritec', 'qua_equipamentos_importar', 'atualizar_textos_tecnicos_zl0162',
                         'alm_req_balcao_importar_sap', 'alm_inv_importar_base')
  loop
    execute format('alter function %s set statement_timeout = %L', f, '180s');
  end loop;
end $$;

alter role authenticated set statement_timeout = '30s';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
