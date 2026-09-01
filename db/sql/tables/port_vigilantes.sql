-- =====================================================================
-- TABELA DE CADASTRO DE VIGILANTES DA PORTARIA (SISTEN)
-- =====================================================================

create table if not exists public.port_vigilantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text,
  empresa text not null default 'PROSEG / PATRIMONIAL',
  funcao text not null default 'Vigilante',
  turno_preferencial text default 'REVEZAMENTO',
  data_admissao date,
  data_nascimento date,
  ativo boolean not null default true,
  observacoes text,
  criado_por text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists port_vigilantes_nome_idx on public.port_vigilantes (nome);
create index if not exists port_vigilantes_ativo_idx on public.port_vigilantes (ativo);

alter table public.port_vigilantes enable row level security;

drop policy if exists port_vigilantes_rw on public.port_vigilantes;
create policy port_vigilantes_rw on public.port_vigilantes
  for all to authenticated using (true) with check (true);
