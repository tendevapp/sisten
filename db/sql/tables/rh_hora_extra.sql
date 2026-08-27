-- Módulo RH — calendário de percentual de hora extra por dia (importação de
-- planilha: DIA, %HEX). Substitui uma regra fixa no código ("domingo/feriado
-- = 100%") por um calendário editável via planilha, usado para pré-preencher
-- o %HE de cada colaborador no formulário ASE - Hora Extra.
-- Aplicado via Supabase MCP em 2026-08-26 (migration create_rh_module_tables).

create table public.rh_hora_extra (
  id uuid primary key default gen_random_uuid(),
  dia date not null unique,
  percentual_he numeric(5, 2) not null,
  created_at timestamptz not null default now()
);

alter table public.rh_hora_extra enable row level security;

create policy rh_hora_extra_select on public.rh_hora_extra
  for select to authenticated using (true);

create policy rh_hora_extra_write on public.rh_hora_extra
  for all to authenticated
  using (has_role('admin'))
  with check (has_role('admin'));
