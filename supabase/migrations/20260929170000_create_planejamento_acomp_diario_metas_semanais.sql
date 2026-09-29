-- Ajustes semanais complementam a meta mensal do Acompanhamento Diario.

create table if not exists public.planejamento_acomp_diario_metas_semanais (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('NAVE_1', 'SAW_03', 'INTERNOS', 'WHITE', 'FATURAMENTO', 'EXPEDICAO')),
  semana_inicio date not null check (extract(dow from semana_inicio) = 0),
  meta numeric(12,2) not null check (meta >= 0),
  dias_uteis integer not null check (dias_uteis >= 0 and dias_uteis <= 7),
  atualizado_por text not null default coalesce(auth.uid()::text, 'sistema'),
  atualizado_em timestamptz not null default now(),
  unique (area, semana_inicio)
);

create index if not exists planejamento_acomp_diario_metas_semanais_semana_idx
  on public.planejamento_acomp_diario_metas_semanais (semana_inicio);

drop trigger if exists planejamento_acomp_diario_metas_semanais_preparar on public.planejamento_acomp_diario_metas_semanais;
create trigger planejamento_acomp_diario_metas_semanais_preparar
  before insert or update on public.planejamento_acomp_diario_metas_semanais
  for each row execute function public.planejamento_acomp_diario_preparar_alteracao();

alter table public.planejamento_acomp_diario_auditoria
  drop constraint if exists planejamento_acomp_diario_auditoria_entidade_check;
alter table public.planejamento_acomp_diario_auditoria
  add constraint planejamento_acomp_diario_auditoria_entidade_check
  check (entidade in ('metas', 'metas_semanais', 'realizados', 'feriados'));

create or replace function public.planejamento_acomp_diario_registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_novo jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_registro jsonb := coalesce(v_novo, v_anterior);
begin
  insert into public.planejamento_acomp_diario_auditoria (
    entidade, acao, chave, dados_anteriores, dados_novos, alterado_por
  ) values (
    case tg_table_name
      when 'planejamento_acomp_diario_metas' then 'metas'
      when 'planejamento_acomp_diario_metas_semanais' then 'metas_semanais'
      when 'planejamento_acomp_diario_realizados' then 'realizados'
      else 'feriados'
    end,
    tg_op,
    case tg_table_name
      when 'planejamento_acomp_diario_metas' then jsonb_build_object('area', v_registro->>'area', 'ano', v_registro->>'ano', 'mes', v_registro->>'mes')
      when 'planejamento_acomp_diario_metas_semanais' then jsonb_build_object('area', v_registro->>'area', 'semana_inicio', v_registro->>'semana_inicio')
      when 'planejamento_acomp_diario_realizados' then jsonb_build_object('area', v_registro->>'area', 'data', v_registro->>'data')
      else jsonb_build_object('data', v_registro->>'data')
    end,
    v_anterior,
    v_novo,
    auth.uid()::text
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.planejamento_acomp_diario_registrar_auditoria() from public;

drop trigger if exists planejamento_acomp_diario_metas_semanais_auditar on public.planejamento_acomp_diario_metas_semanais;
create trigger planejamento_acomp_diario_metas_semanais_auditar
  after insert or update or delete on public.planejamento_acomp_diario_metas_semanais
  for each row execute function public.planejamento_acomp_diario_registrar_auditoria();

alter table public.planejamento_acomp_diario_metas_semanais enable row level security;

create policy planejamento_acomp_diario_metas_semanais_select on public.planejamento_acomp_diario_metas_semanais
  for select to authenticated
  using (public.has_role('admin') or public.has_role('coordenador_suprimentos') or public.has_page_access('planejamento_acompanhamento_diario_tv'));

create policy planejamento_acomp_diario_metas_semanais_write on public.planejamento_acomp_diario_metas_semanais
  for all to authenticated
  using (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'))
  with check (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'));

grant select, insert, update, delete on public.planejamento_acomp_diario_metas_semanais to authenticated;
revoke all on public.planejamento_acomp_diario_metas_semanais from anon;

notify pgrst, 'reload schema';
