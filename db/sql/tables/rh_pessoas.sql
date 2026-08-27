-- Módulo RH — cadastro de colaboradores (importação de planilha: REGISTRO,
-- NOME DO EMPREGADO, DESCRIÇÃO DO CARGO). Fonte para o autocomplete de
-- colaborador no formulário ASE - Hora Extra.
-- Aplicado via Supabase MCP em 2026-08-26 (migration create_rh_module_tables).

create table public.rh_pessoas (
  id uuid primary key default gen_random_uuid(),
  registro text not null unique,
  nome text not null,
  cargo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rh_pessoas_nome_idx on public.rh_pessoas (lower(nome));

alter table public.rh_pessoas enable row level security;

create policy rh_pessoas_select on public.rh_pessoas
  for select to authenticated using (true);

create policy rh_pessoas_write on public.rh_pessoas
  for all to authenticated
  using (has_role('admin'))
  with check (has_role('admin'));
