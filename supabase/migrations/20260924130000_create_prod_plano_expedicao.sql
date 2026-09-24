-- Produção > Plano de Expedição GW.
-- Fonte inicial: "Expedição GW.xlsx" (planilha recebida em 24/09/2026).
-- A grade é operacional: os marcos são dados tipados, editáveis e auditados.

create schema if not exists private;

create or replace function private.prod_plano_expedicao_pode_acessar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.core_perfis perfil
     where perfil.id = (select auth.uid())::text
       and perfil.status = 'ativo'
       and (
         'admin' = any(perfil.roles)
         or coalesce(
           (perfil.page_access ->> 'prod_expedicao')::boolean,
           (perfil.page_access ->> 'producao_home')::boolean,
           false
         )
       )
  );
$$;

revoke all on function private.prod_plano_expedicao_pode_acessar() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.prod_plano_expedicao_pode_acessar() to authenticated, service_role;

create table if not exists public.prod_plano_expedicao (
  id uuid primary key default gen_random_uuid(),
  semana integer not null check (semana between 1 and 53),
  torre_numero integer not null check (torre_numero > 0),
  tramo text not null check (tramo in ('T1', 'T2', 'T3', 'T4', 'T5')),
  identificador integer,
  nf_faturamento_emitida boolean not null default false,
  nf_gw_emitida boolean not null default false,
  nf_expedicao_emitida boolean not null default false,
  data_carregamento date,
  data_expedicao date,
  observacao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create index if not exists idx_prod_plano_expedicao_semana on public.prod_plano_expedicao (semana, torre_numero, tramo);

create table if not exists public.prod_plano_expedicao_historico (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.prod_plano_expedicao(id) on delete restrict,
  alterado_em timestamptz not null default now(),
  alterado_por text,
  antes jsonb not null,
  depois jsonb not null
);

create index if not exists idx_prod_plano_expedicao_historico_plano on public.prod_plano_expedicao_historico (plano_id, alterado_em desc);

create or replace function public.registrar_alteracao_prod_plano_expedicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := (select auth.uid())::text;

  if (to_jsonb(old) - array['atualizado_em', 'atualizado_por'])
     is distinct from (to_jsonb(new) - array['atualizado_em', 'atualizado_por']) then
    insert into public.prod_plano_expedicao_historico (plano_id, alterado_por, antes, depois)
    values (old.id, (select auth.uid())::text, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end;
$$;

revoke all on function public.registrar_alteracao_prod_plano_expedicao() from public, anon, authenticated;

drop trigger if exists trg_prod_plano_expedicao_auditar on public.prod_plano_expedicao;
create trigger trg_prod_plano_expedicao_auditar
before update on public.prod_plano_expedicao
for each row execute function public.registrar_alteracao_prod_plano_expedicao();

revoke all on public.prod_plano_expedicao, public.prod_plano_expedicao_historico from anon, authenticated;
grant select, update on public.prod_plano_expedicao to authenticated;
grant select on public.prod_plano_expedicao_historico to authenticated;
grant all on public.prod_plano_expedicao, public.prod_plano_expedicao_historico to service_role;

alter table public.prod_plano_expedicao enable row level security;
alter table public.prod_plano_expedicao_historico enable row level security;

create policy prod_plano_expedicao_select on public.prod_plano_expedicao
for select to authenticated using ((select private.prod_plano_expedicao_pode_acessar()));
create policy prod_plano_expedicao_update on public.prod_plano_expedicao
for update to authenticated
using ((select private.prod_plano_expedicao_pode_acessar()))
with check ((select private.prod_plano_expedicao_pode_acessar()));
create policy prod_plano_expedicao_historico_select on public.prod_plano_expedicao_historico
for select to authenticated using ((select private.prod_plano_expedicao_pode_acessar()));

insert into public.prod_plano_expedicao (
  semana, torre_numero, tramo, identificador,
  nf_faturamento_emitida, nf_gw_emitida, nf_expedicao_emitida,
  data_carregamento, data_expedicao
) values
  (35, 1, 'T4', 3146, true, true, true, '2026-08-26', '2026-08-27'),
  (35, 1, 'T5', 3147, true, true, true, '2026-08-27', '2026-08-28'),
  (36, 1, 'T3', 3145, true, true, true, '2026-08-31', '2026-09-01'),
  (36, 1, 'T2', 3144, true, true, true, '2026-08-31', '2026-09-01'),
  (36, 1, 'T1', 3143, true, true, true, '2026-09-01', '2026-09-02'),
  (37, 2, 'T5', 3182, true, true, true, '2026-09-07', '2026-09-08'),
  (37, 2, 'T4', 3156, true, true, true, '2026-09-07', '2026-09-08'),
  (37, 2, 'T3', 3160, true, true, true, '2026-09-08', '2026-09-09'),
  (37, 2, 'T2', 3169, true, true, true, '2026-09-08', '2026-09-09'),
  (37, 2, 'T1', 3153, true, true, true, '2026-09-19', '2026-09-21'),
  (38, 3, 'T5', 3192, true, true, true, '2026-09-11', '2026-09-14'),
  (38, 3, 'T4', 3151, true, true, true, '2026-09-11', '2026-09-14'),
  (38, 4, 'T3', 3195, true, true, true, '2026-09-22', '2026-09-23'),
  (38, 3, 'T2', 3149, true, true, true, '2026-09-17', '2026-09-18'),
  (38, 2, 'T1', 3158, true, true, true, '2026-09-18', '2026-09-21'),
  (39, 4, 'T5', 3187, true, true, true, '2026-09-18', '2026-09-22'),
  (39, 4, 'T4', 3186, true, true, true, '2026-09-18', '2026-09-22'),
  (39, 4, 'T3', 3150, true, true, true, '2026-09-22', '2026-09-23'),
  (39, 4, 'T2', 3194, true, true, true, '2026-09-22', '2026-09-23'),
  (39, 4, 'T1', 3163, true, true, false, '2026-09-24', '2026-09-25'),
  (39, 5, 'T5', 3152, true, false, false, '2026-09-24', '2026-09-25'),
  (39, 5, 'T4', 3176, true, false, false, '2026-09-24', '2026-09-25'),
  (39, 5, 'T3', 3200, true, true, false, '2026-09-25', '2026-09-28'),
  (39, 5, 'T2', 3159, true, true, false, '2026-09-25', '2026-09-28'),
  (39, 5, 'T1', 3168, true, false, false, '2026-09-28', '2026-09-29'),
  (40, 6, 'T5', 3162, false, false, false, '2026-09-28', '2026-09-28'),
  (40, 6, 'T4', 3206, false, false, false, '2026-09-28', '2026-09-28'),
  (40, 6, 'T3', 3165, false, false, false, '2026-09-29', '2026-09-30'),
  (40, 6, 'T2', 3154, false, false, false, '2026-09-29', '2026-09-30'),
  (40, 6, 'T1', 3173, true, false, false, '2026-10-01', '2026-10-02'),
  (40, 7, 'T5', 3207, false, false, false, '2026-09-30', '2026-10-01'),
  (40, 7, 'T4', 3211, false, false, false, '2026-09-30', '2026-10-01'),
  (40, 7, 'T3', 3205, false, false, false, '2026-10-02', '2026-10-03'),
  (40, 7, 'T2', 3199, false, false, false, '2026-10-02', '2026-10-03'),
  (40, 7, 'T1', 3183, true, false, false, '2026-10-03', '2026-10-05'),
  (41, 8, 'T5', null, false, false, false, '2026-10-05', '2026-10-05'),
  (41, 8, 'T4', null, false, false, false, '2026-10-05', '2026-10-05'),
  (41, 8, 'T3', null, false, false, false, '2026-10-06', '2026-10-07'),
  (41, 8, 'T2', null, false, false, false, '2026-10-07', '2026-10-08'),
  (41, 8, 'T1', null, false, false, false, '2026-10-08', '2026-10-09'),
  (42, 9, 'T5', null, false, false, false, '2026-10-09', '2026-10-12'),
  (42, 9, 'T4', null, false, false, false, '2026-10-09', '2026-10-12'),
  (42, 9, 'T3', null, false, false, false, '2026-10-12', '2026-10-13'),
  (42, 9, 'T2', null, false, false, false, '2026-10-12', '2026-10-13'),
  (42, 9, 'T1', null, false, false, false, '2026-10-13', '2026-10-14'),
  (43, 10, 'T5', null, false, false, false, '2026-10-16', '2026-10-19'),
  (43, 10, 'T4', null, false, false, false, '2026-10-16', '2026-10-19'),
  (43, 10, 'T3', null, false, false, false, '2026-10-19', '2026-10-20'),
  (43, 10, 'T2', null, false, false, false, '2026-10-19', '2026-10-20'),
  (43, 10, 'T1', null, false, false, false, '2026-10-20', '2026-10-21'),
  (43, 11, 'T5', null, false, false, false, '2026-10-20', '2026-10-21'),
  (43, 11, 'T4', null, false, false, false, '2026-10-21', '2026-10-22'),
  (43, 11, 'T3', null, false, false, false, '2026-10-21', '2026-10-22'),
  (43, 11, 'T2', null, false, false, false, '2026-10-22', '2026-10-23'),
  (43, 11, 'T1', null, false, false, false, '2026-10-22', '2026-10-23'),
  (44, 12, 'T5', null, false, false, false, '2026-10-23', '2026-10-26'),
  (44, 12, 'T4', null, false, false, false, '2026-10-23', '2026-10-26'),
  (44, 12, 'T3', null, false, false, false, '2026-10-26', '2026-10-27'),
  (44, 12, 'T2', null, false, false, false, '2026-10-26', '2026-10-27'),
  (44, 12, 'T1', null, false, false, false, '2026-10-27', '2026-10-28'),
  (45, 13, 'T5', null, false, false, false, '2026-10-30', '2026-11-02'),
  (45, 13, 'T4', null, false, false, false, '2026-10-30', '2026-11-02'),
  (45, 13, 'T3', null, false, false, false, '2026-11-02', '2026-11-03'),
  (45, 13, 'T2', null, false, false, false, '2026-11-02', '2026-11-03'),
  (45, 13, 'T1', null, false, false, false, '2026-11-03', '2026-11-04'),
  (45, 14, 'T5', null, false, false, false, '2026-11-03', '2026-11-04'),
  (45, 14, 'T4', null, false, false, false, '2026-11-04', '2026-11-05'),
  (45, 14, 'T3', null, false, false, false, '2026-11-04', '2026-11-05'),
  (45, 14, 'T2', null, false, false, false, '2026-11-05', '2026-11-06'),
  (45, 14, 'T1', null, false, false, false, '2026-11-05', '2026-11-06'),
  (46, 15, 'T5', null, false, false, false, '2026-11-06', '2026-11-09'),
  (46, 15, 'T4', null, false, false, false, '2026-11-06', '2026-11-09'),
  (46, 15, 'T3', null, false, false, false, '2026-11-09', '2026-11-10'),
  (46, 15, 'T2', null, false, false, false, '2026-11-09', '2026-11-10'),
  (46, 15, 'T1', null, false, false, false, '2026-11-10', '2026-11-11'),
  (47, 16, 'T5', null, false, false, false, '2026-11-13', '2026-11-16'),
  (47, 16, 'T4', null, false, false, false, '2026-11-13', '2026-11-16'),
  (47, 16, 'T3', null, false, false, false, '2026-11-16', '2026-11-17'),
  (47, 16, 'T2', null, false, false, false, '2026-11-16', '2026-11-17'),
  (47, 16, 'T1', null, false, false, false, '2026-11-17', '2026-11-18'),
  (48, 17, 'T5', null, false, false, false, '2026-11-20', '2026-11-23'),
  (48, 17, 'T4', null, false, false, false, '2026-11-20', '2026-11-23'),
  (48, 17, 'T3', null, false, false, false, '2026-11-23', '2026-11-24'),
  (48, 17, 'T2', null, false, false, false, '2026-11-23', '2026-11-24'),
  (48, 17, 'T1', null, false, false, false, '2026-11-24', '2026-11-25'),
  (48, 18, 'T5', null, false, false, false, '2026-11-24', '2026-11-25'),
  (48, 18, 'T4', null, false, false, false, '2026-11-25', '2026-11-26'),
  (48, 18, 'T3', null, false, false, false, '2026-11-25', '2026-11-26'),
  (48, 18, 'T2', null, false, false, false, '2026-11-26', '2026-11-27'),
  (48, 18, 'T1', null, false, false, false, '2026-11-26', '2026-11-27'),
  (49, 19, 'T5', null, false, false, false, '2026-11-27', '2026-11-30'),
  (49, 19, 'T4', null, false, false, false, '2026-11-27', '2026-11-30'),
  (49, 19, 'T3', null, false, false, false, '2026-11-30', '2026-12-01'),
  (49, 19, 'T2', null, false, false, false, '2026-11-30', '2026-12-01'),
  (49, 19, 'T1', null, false, false, false, '2026-12-01', '2026-12-02'),
  (49, 20, 'T5', null, false, false, false, '2026-12-01', '2026-12-02'),
  (49, 20, 'T4', null, false, false, false, '2026-12-02', '2026-12-03'),
  (49, 20, 'T3', null, false, false, false, '2026-12-02', '2026-12-03'),
  (49, 20, 'T2', null, false, false, false, '2026-12-03', '2026-12-04'),
  (49, 20, 'T1', null, false, false, false, '2026-12-03', '2026-12-04'),
  (50, 21, 'T5', null, false, false, false, '2026-12-04', '2026-12-07'),
  (50, 21, 'T4', null, false, false, false, '2026-12-04', '2026-12-07'),
  (50, 21, 'T3', null, false, false, false, '2026-12-07', '2026-12-08'),
  (50, 21, 'T2', null, false, false, false, '2026-12-07', '2026-12-08'),
  (50, 21, 'T1', null, false, false, false, '2026-12-08', '2026-12-09'),
  (51, 22, 'T5', null, false, false, false, '2026-12-11', '2026-12-14'),
  (51, 22, 'T4', null, false, false, false, '2026-12-11', '2026-12-14'),
  (51, 22, 'T3', null, false, false, false, '2026-12-14', '2026-12-15'),
  (51, 22, 'T2', null, false, false, false, '2026-12-14', '2026-12-15'),
  (51, 22, 'T1', null, false, false, false, '2026-12-15', '2026-12-16'),
  (51, 23, 'T5', null, false, false, false, '2026-12-15', '2026-12-16'),
  (51, 23, 'T4', null, false, false, false, '2026-12-16', '2026-12-17'),
  (51, 23, 'T3', null, false, false, false, '2026-12-16', '2026-12-17'),
  (51, 23, 'T2', null, false, false, false, '2026-12-17', '2026-12-18'),
  (51, 23, 'T1', null, false, false, false, '2026-12-17', '2026-12-18')
on conflict (torre_numero, tramo) do nothing;
