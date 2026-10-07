-- Log de alterações do Controle de Entrega (Planejamento).
--
-- Toda inclusão, alteração ou exclusão em prod_tramos_entrega e no checklist
-- de expedição (prod_tramos_entrega_checklist) vira uma linha aqui, gravada
-- por trigger — vale para a tela, o "Editar Tramos", a permuta e scripts.
-- Cada linha guarda quem (auth.uid() + nome), quando, o que mudou campo a
-- campo (de → para) e as fotos antes/depois. Ninguém altera nem apaga o log
-- pela API: só leitura para quem acessa a página (prod_entrega).

create table if not exists public.prod_tramos_entrega_log (
  id bigint generated always as identity primary key,
  tabela text not null check (tabela in ('tramo', 'checklist')),
  tramo_id text not null,
  operacao text not null check (operacao in ('estado_inicial', 'inclusao', 'alteracao', 'exclusao')),
  -- [{ "campo": "etapa_categoria", "de": "internos", "para": "white" }, ...]
  alteracoes jsonb not null default '[]'::jsonb,
  antes jsonb,
  depois jsonb,
  alterado_por uuid,
  alterado_por_nome text,
  -- 'app' = usuário logado; 'sistema' = migration, script ou rotina sem usuário.
  origem text not null check (origem in ('app', 'sistema')),
  created_at timestamptz not null default now()
);

create index if not exists idx_prod_tramos_entrega_log_tramo on public.prod_tramos_entrega_log (tramo_id, created_at desc);
create index if not exists idx_prod_tramos_entrega_log_data on public.prod_tramos_entrega_log (created_at desc);

alter table public.prod_tramos_entrega_log enable row level security;
revoke all on public.prod_tramos_entrega_log from anon, authenticated;
grant select on public.prod_tramos_entrega_log to authenticated;

create policy prod_tramos_entrega_log_sel on public.prod_tramos_entrega_log
  for select to authenticated
  using ((select private.prod_apt_pode('prod_entrega')));

create or replace function private.prod_tramos_entrega_registrar_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_tabela text := case when tg_table_name = 'prod_tramos_entrega' then 'tramo' else 'checklist' end;
  -- Campos de controle não contam como alteração.
  v_ignorar text[] := array['updated_at', 'created_at'];
  v_alteracoes jsonb;
  v_uid uuid := auth.uid();
  v_nome text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('campo', k, 'de', v_antes -> k, 'para', v_depois -> k) order by k), '[]'::jsonb)
    into v_alteracoes
    from (
      select distinct k from (
        select jsonb_object_keys(coalesce(v_antes, '{}'::jsonb)) as k
        union
        select jsonb_object_keys(coalesce(v_depois, '{}'::jsonb))
      ) chaves
    ) c
   where not (k = any(v_ignorar))
     and (v_antes -> k) is distinct from (v_depois -> k);

  if tg_op = 'UPDATE' and jsonb_array_length(v_alteracoes) = 0 then
    return null;
  end if;

  if v_uid is not null then
    select perfil.name into v_nome from public.core_perfis perfil where perfil.id = v_uid::text;
  end if;

  insert into public.prod_tramos_entrega_log (tabela, tramo_id, operacao, alteracoes, antes, depois, alterado_por, alterado_por_nome, origem)
  values (
    v_tabela,
    case when v_tabela = 'tramo'
      then coalesce(v_depois ->> 'id', v_antes ->> 'id')
      else coalesce(v_depois ->> 'tramo_entrega_id', v_antes ->> 'tramo_entrega_id') end,
    case tg_op when 'INSERT' then 'inclusao' when 'UPDATE' then 'alteracao' else 'exclusao' end,
    v_alteracoes,
    v_antes,
    v_depois,
    v_uid,
    v_nome,
    case when v_uid is null then 'sistema' else 'app' end
  );
  return null;
end;
$$;

revoke all on function private.prod_tramos_entrega_registrar_log() from public, anon, authenticated;

drop trigger if exists prod_tramos_entrega_log on public.prod_tramos_entrega;
create trigger prod_tramos_entrega_log
  after insert or update or delete on public.prod_tramos_entrega
  for each row execute function private.prod_tramos_entrega_registrar_log();

drop trigger if exists prod_tramos_entrega_checklist_log on public.prod_tramos_entrega_checklist;
create trigger prod_tramos_entrega_checklist_log
  after insert or update or delete on public.prod_tramos_entrega_checklist
  for each row execute function private.prod_tramos_entrega_registrar_log();

-- Ponto de partida: o estado de cada tramo quando o log começou, para que a
-- primeira alteração registrada tenha com o que ser comparada.
insert into public.prod_tramos_entrega_log (tabela, tramo_id, operacao, alteracoes, antes, depois, origem, alterado_por_nome)
select 'tramo', e.id, 'estado_inicial', '[]'::jsonb, null, to_jsonb(e), 'sistema', 'Início do registro'
  from public.prod_tramos_entrega e;
