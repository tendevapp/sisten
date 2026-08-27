-- Módulo RH — cadastro de rotas e pontos de embarque de transporte dos colaboradores.
-- Aplicado via Supabase MCP em 2026-08-27 (migration create_rh_rotas_table).

create table if not exists public.rh_rotas (
  id uuid primary key default gen_random_uuid(),
  funcionario text not null,
  ponto_embarque text not null,
  horario text not null,
  contato text,
  rota text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rh_rotas_funcionario_idx on public.rh_rotas (lower(funcionario));
create index if not exists rh_rotas_rota_idx on public.rh_rotas (rota);

alter table public.rh_rotas enable row level security;

create policy rh_rotas_select on public.rh_rotas
  for select to authenticated using (true);

create policy rh_rotas_write on public.rh_rotas
  for all to authenticated
  using (true)
  with check (true);
