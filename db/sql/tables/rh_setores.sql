-- Módulo RH — cadastro de setores (importação de planilha de coluna única
-- "SETOR"). Aplicado via Supabase MCP em 2026-08-26 (migration
-- create_rh_module_tables, junto com rh_turnos/rh_pessoas/rh_hora_extra/
-- rh_ase_solicitacoes/rh_ase_itens).

create table public.rh_setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.rh_setores enable row level security;

create policy rh_setores_select on public.rh_setores
  for select to authenticated using (true);

create policy rh_setores_write on public.rh_setores
  for all to authenticated
  using (has_role('admin'))
  with check (has_role('admin'));
