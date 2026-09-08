-- =====================================================================
-- Módulo Demandas — quadro de tarefas (Planner/Trello) com escopo por setor
-- =====================================================================
-- Cada quadro pertence a um setor; as tarefas herdam esse setor. Um quadro
-- pode ainda ser compartilhado com usuários específicos (membros_extra) via
-- @usuário. A visibilidade (setor do usuário + setores liberados pelo admin
-- em core_perfis.demandas_setores + compartilhamento + autoria) é resolvida
-- na camada de tela (src/lib/demandasAcesso.ts) — mesmo modelo já usado para
-- solicitações. A RLS aqui é permissiva para authenticated.

-- Visibilidade extra por usuário: setores de Demandas que um gestor enxerga
-- além do próprio, definidos pelo admin no modal de Governança.
alter table public.core_perfis
  add column if not exists demandas_setores jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- Quadros (projetos)
-- ---------------------------------------------------------------------
create table if not exists public.dem_quadros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  setor_id text not null references public.core_setores(id),
  cor text,
  membros_extra text[] not null default '{}'::text[],
  arquivado boolean not null default false,
  ordem integer not null default 0,
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);
create index if not exists idx_dem_quadros_setor on public.dem_quadros (setor_id) where excluido_em is null;
create index if not exists idx_dem_quadros_criado_por on public.dem_quadros (criado_por);

-- ---------------------------------------------------------------------
-- Buckets (colunas) de um quadro
-- ---------------------------------------------------------------------
create table if not exists public.dem_buckets (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references public.dem_quadros(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz
);
create index if not exists idx_dem_buckets_quadro on public.dem_buckets (quadro_id, ordem) where excluido_em is null;

-- ---------------------------------------------------------------------
-- Tarefas (cartões)
-- ---------------------------------------------------------------------
create table if not exists public.dem_tarefas (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references public.dem_quadros(id) on delete cascade,
  bucket_id uuid references public.dem_buckets(id) on delete set null,
  titulo text not null,
  descricao text,
  responsaveis text[] not null default '{}'::text[],
  data_inicio date,
  data_vencimento date,
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado','em_andamento','concluida')),
  prioridade text not null default 'media' check (prioridade in ('baixa','media','importante','urgente')),
  checklist jsonb not null default '[]'::jsonb,
  anexos jsonb not null default '[]'::jsonb,
  ordem integer not null default 0,
  concluida_em timestamptz,
  codigo text,
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);
create index if not exists idx_dem_tarefas_quadro on public.dem_tarefas (quadro_id) where excluido_em is null;
create index if not exists idx_dem_tarefas_bucket on public.dem_tarefas (bucket_id);
create index if not exists idx_dem_tarefas_status on public.dem_tarefas (status);

-- ---------------------------------------------------------------------
-- Atividade / comentários de uma tarefa (tabela filha)
-- ---------------------------------------------------------------------
create table if not exists public.dem_tarefa_atividades (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.dem_tarefas(id) on delete cascade,
  tipo text not null default 'comentario' check (tipo in ('comentario','sistema')),
  texto text not null,
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  criado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_dem_tarefa_atividades_tarefa
  on public.dem_tarefa_atividades (tarefa_id, created_at desc);

-- ---------------------------------------------------------------------
-- Gatilhos de updated_at (public.tocar_updated_at já existe)
-- ---------------------------------------------------------------------
drop trigger if exists trg_dem_quadros_updated_at on public.dem_quadros;
create trigger trg_dem_quadros_updated_at before update on public.dem_quadros
  for each row execute function public.tocar_updated_at();

drop trigger if exists trg_dem_buckets_updated_at on public.dem_buckets;
create trigger trg_dem_buckets_updated_at before update on public.dem_buckets
  for each row execute function public.tocar_updated_at();

drop trigger if exists trg_dem_tarefas_updated_at on public.dem_tarefas;
create trigger trg_dem_tarefas_updated_at before update on public.dem_tarefas
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- RLS — permissiva para authenticated (filtragem fina é na tela)
-- ---------------------------------------------------------------------
alter table public.dem_quadros enable row level security;
alter table public.dem_buckets enable row level security;
alter table public.dem_tarefas enable row level security;
alter table public.dem_tarefa_atividades enable row level security;

drop policy if exists dem_quadros_rw on public.dem_quadros;
create policy dem_quadros_rw on public.dem_quadros for all to authenticated using (true) with check (true);

drop policy if exists dem_buckets_rw on public.dem_buckets;
create policy dem_buckets_rw on public.dem_buckets for all to authenticated using (true) with check (true);

drop policy if exists dem_tarefas_rw on public.dem_tarefas;
create policy dem_tarefas_rw on public.dem_tarefas for all to authenticated using (true) with check (true);

drop policy if exists dem_tarefa_atividades_rw on public.dem_tarefa_atividades;
create policy dem_tarefa_atividades_rw on public.dem_tarefa_atividades for all to authenticated using (true) with check (true);

revoke all on public.dem_quadros from anon;
revoke all on public.dem_buckets from anon;
revoke all on public.dem_tarefas from anon;
revoke all on public.dem_tarefa_atividades from anon;

grant select, insert, update, delete on public.dem_quadros to authenticated;
grant select, insert, update, delete on public.dem_buckets to authenticated;
grant select, insert, update, delete on public.dem_tarefas to authenticated;
grant select, insert, update, delete on public.dem_tarefa_atividades to authenticated;

-- ---------------------------------------------------------------------
-- Storage: anexos das tarefas (bucket privado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('dem-anexos', 'dem-anexos', false)
on conflict (id) do nothing;

drop policy if exists "dem_anexos_objects_insert" on storage.objects;
create policy "dem_anexos_objects_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'dem-anexos');

drop policy if exists "dem_anexos_objects_read" on storage.objects;
create policy "dem_anexos_objects_read" on storage.objects
  for select to authenticated using (bucket_id = 'dem-anexos');

drop policy if exists "dem_anexos_objects_update" on storage.objects;
create policy "dem_anexos_objects_update" on storage.objects
  for update to authenticated using (bucket_id = 'dem-anexos');

drop policy if exists "dem_anexos_objects_delete" on storage.objects;
create policy "dem_anexos_objects_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'dem-anexos');
