-- Planejamento / Acompanhamento Diario
-- Metas e apontamentos manuais nao alteram o snapshot importado da base BD.

create table if not exists public.planejamento_acomp_diario_metas (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('NAVE_1', 'SAW_03', 'INTERNOS', 'WHITE', 'FATURAMENTO', 'EXPEDICAO')),
  ano integer not null check (ano between 2020 and 2100),
  mes integer not null check (mes between 1 and 12),
  meta numeric(12,2) not null check (meta >= 0),
  dias_uteis integer not null check (dias_uteis >= 0 and dias_uteis <= 31),
  atualizado_por text not null default coalesce(auth.uid()::text, 'sistema'),
  atualizado_em timestamptz not null default now(),
  unique (area, ano, mes)
);

create table if not exists public.planejamento_acomp_diario_realizados (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('NAVE_1', 'SAW_03', 'INTERNOS', 'WHITE', 'FATURAMENTO', 'EXPEDICAO')),
  data date not null,
  realizado numeric(12,2) not null check (realizado >= 0),
  atualizado_por text not null default coalesce(auth.uid()::text, 'sistema'),
  atualizado_em timestamptz not null default now(),
  unique (area, data)
);

create table if not exists public.planejamento_acomp_diario_feriados (
  data date primary key,
  descricao text,
  atualizado_por text not null default coalesce(auth.uid()::text, 'sistema'),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.planejamento_acomp_diario_auditoria (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('metas', 'realizados', 'feriados')),
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  chave jsonb not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  alterado_por text,
  alterado_em timestamptz not null default now()
);

create index if not exists planejamento_acomp_diario_realizados_area_data_idx
  on public.planejamento_acomp_diario_realizados (area, data);
create index if not exists planejamento_acomp_diario_auditoria_alterado_em_idx
  on public.planejamento_acomp_diario_auditoria (alterado_em desc);

create or replace function public.planejamento_acomp_diario_preparar_alteracao()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.atualizado_por := coalesce(auth.uid()::text, 'sistema');
  new.atualizado_em := now();
  return new;
end;
$$;

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
      when 'planejamento_acomp_diario_realizados' then 'realizados'
      else 'feriados'
    end,
    tg_op,
    case tg_table_name
      when 'planejamento_acomp_diario_metas' then jsonb_build_object('area', v_registro->>'area', 'ano', v_registro->>'ano', 'mes', v_registro->>'mes')
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

drop trigger if exists planejamento_acomp_diario_metas_preparar on public.planejamento_acomp_diario_metas;
create trigger planejamento_acomp_diario_metas_preparar
  before insert or update on public.planejamento_acomp_diario_metas
  for each row execute function public.planejamento_acomp_diario_preparar_alteracao();
drop trigger if exists planejamento_acomp_diario_realizados_preparar on public.planejamento_acomp_diario_realizados;
create trigger planejamento_acomp_diario_realizados_preparar
  before insert or update on public.planejamento_acomp_diario_realizados
  for each row execute function public.planejamento_acomp_diario_preparar_alteracao();
drop trigger if exists planejamento_acomp_diario_feriados_preparar on public.planejamento_acomp_diario_feriados;
create trigger planejamento_acomp_diario_feriados_preparar
  before insert or update on public.planejamento_acomp_diario_feriados
  for each row execute function public.planejamento_acomp_diario_preparar_alteracao();

drop trigger if exists planejamento_acomp_diario_metas_auditar on public.planejamento_acomp_diario_metas;
create trigger planejamento_acomp_diario_metas_auditar
  after insert or update or delete on public.planejamento_acomp_diario_metas
  for each row execute function public.planejamento_acomp_diario_registrar_auditoria();
drop trigger if exists planejamento_acomp_diario_realizados_auditar on public.planejamento_acomp_diario_realizados;
create trigger planejamento_acomp_diario_realizados_auditar
  after insert or update or delete on public.planejamento_acomp_diario_realizados
  for each row execute function public.planejamento_acomp_diario_registrar_auditoria();
drop trigger if exists planejamento_acomp_diario_feriados_auditar on public.planejamento_acomp_diario_feriados;
create trigger planejamento_acomp_diario_feriados_auditar
  after insert or update or delete on public.planejamento_acomp_diario_feriados
  for each row execute function public.planejamento_acomp_diario_registrar_auditoria();

alter table public.planejamento_acomp_diario_metas enable row level security;
alter table public.planejamento_acomp_diario_realizados enable row level security;
alter table public.planejamento_acomp_diario_feriados enable row level security;
alter table public.planejamento_acomp_diario_auditoria enable row level security;

-- O painel continua visivel para o mesmo publico atual; editar exige liberacao explicita.
drop policy if exists planejamento_acomp_diario_metas_select on public.planejamento_acomp_diario_metas;
create policy planejamento_acomp_diario_metas_select on public.planejamento_acomp_diario_metas
  for select to authenticated
  using (public.has_role('admin') or public.has_role('coordenador_suprimentos') or public.has_page_access('planejamento_acompanhamento_diario_tv'));
drop policy if exists planejamento_acomp_diario_realizados_select on public.planejamento_acomp_diario_realizados;
create policy planejamento_acomp_diario_realizados_select on public.planejamento_acomp_diario_realizados
  for select to authenticated
  using (public.has_role('admin') or public.has_role('coordenador_suprimentos') or public.has_page_access('planejamento_acompanhamento_diario_tv'));
drop policy if exists planejamento_acomp_diario_feriados_select on public.planejamento_acomp_diario_feriados;
create policy planejamento_acomp_diario_feriados_select on public.planejamento_acomp_diario_feriados
  for select to authenticated
  using (public.has_role('admin') or public.has_role('coordenador_suprimentos') or public.has_page_access('planejamento_acompanhamento_diario_tv'));
drop policy if exists planejamento_acomp_diario_auditoria_select on public.planejamento_acomp_diario_auditoria;
create policy planejamento_acomp_diario_auditoria_select on public.planejamento_acomp_diario_auditoria
  for select to authenticated
  using (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'));

drop policy if exists planejamento_acomp_diario_metas_write on public.planejamento_acomp_diario_metas;
create policy planejamento_acomp_diario_metas_write on public.planejamento_acomp_diario_metas
  for all to authenticated
  using (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'))
  with check (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'));
drop policy if exists planejamento_acomp_diario_realizados_write on public.planejamento_acomp_diario_realizados;
create policy planejamento_acomp_diario_realizados_write on public.planejamento_acomp_diario_realizados
  for all to authenticated
  using (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'))
  with check (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'));
drop policy if exists planejamento_acomp_diario_feriados_write on public.planejamento_acomp_diario_feriados;
create policy planejamento_acomp_diario_feriados_write on public.planejamento_acomp_diario_feriados
  for all to authenticated
  using (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'))
  with check (public.has_role('admin') or public.has_page_access('planejamento_acompanhamento_diario_editar'));

grant select, insert, update, delete on public.planejamento_acomp_diario_metas to authenticated;
grant select, insert, update, delete on public.planejamento_acomp_diario_realizados to authenticated;
grant select, insert, update, delete on public.planejamento_acomp_diario_feriados to authenticated;
grant select on public.planejamento_acomp_diario_auditoria to authenticated;
revoke all on public.planejamento_acomp_diario_metas, public.planejamento_acomp_diario_realizados, public.planejamento_acomp_diario_feriados, public.planejamento_acomp_diario_auditoria from anon;

with configuracao(area, metas, dias_uteis) as (
  values
    ('NAVE_1'::text, array[0,0,0,0,0,0,0,21,33,34,25,2], array[0,0,0,6,20,21,22,21,21,21,19,2]),
    ('SAW_03'::text, array[0,0,0,0,0,0,0,21,33,34,25,2], array[0,0,0,6,20,21,22,21,21,21,19,2]),
    ('INTERNOS'::text, array[0,0,0,0,0,4,15,27,20,27,22,0], array[0,0,0,6,20,21,22,21,21,21,19,2]),
    ('WHITE'::text, array[0,0,0,0,0,0,0,21,33,34,25,2], array[0,0,0,6,20,21,22,21,21,21,19,2]),
    ('FATURAMENTO'::text, array[0,0,0,0,0,0,0,21,33,34,25,2], array[0,0,0,6,20,21,22,21,21,21,19,2]),
    ('EXPEDICAO'::text, array[0,0,0,0,0,0,0,21,33,34,25,2], array[0,0,0,6,20,21,22,21,21,21,19,2])
)
insert into public.planejamento_acomp_diario_metas (area, ano, mes, meta, dias_uteis)
select configuracao.area, 2026, mes, configuracao.metas[mes], configuracao.dias_uteis[mes]
from configuracao cross join generate_series(1, 12) as mes
on conflict (area, ano, mes) do nothing;

insert into public.planejamento_acomp_diario_feriados (data, descricao)
values
  ('2026-09-07', 'Independencia do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamacao da Republica'),
  ('2026-11-20', 'Consciencia Negra')
on conflict (data) do nothing;

notify pgrst, 'reload schema';
