-- Módulo RH — tabela fixa de turnos (ADM / 2º Turno / 3º Turno), usada no
-- formulário ASE - Hora Extra. Sem importação de planilha: é semeada aqui.
-- Aplicado via Supabase MCP em 2026-08-26 (migration create_rh_module_tables).

create table public.rh_turnos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

insert into public.rh_turnos (nome) values ('ADM'), ('2º Turno'), ('3º Turno')
on conflict (nome) do nothing;

alter table public.rh_turnos enable row level security;

create policy rh_turnos_select on public.rh_turnos
  for select to authenticated using (true);

create policy rh_turnos_write on public.rh_turnos
  for all to authenticated
  using (has_role('admin'))
  with check (has_role('admin'));
