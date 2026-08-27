-- Módulo Portaria — Participantes do "Briefing de Segurança & Lista de Presença" (FRM.SGP-0013).
-- Lista nominal de presenças com CPF, empresa, função e assinatura/termo.

create table if not exists public.port_briefing_participantes (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.port_briefing_sessoes(id) on delete cascade,
  data date not null default current_date,
  empresa text not null,
  nome text not null,
  cpf text not null,
  funcao text not null,
  assinatura_digital text,
  validade_dias integer not null default 90,
  created_at timestamptz not null default now()
);

create index if not exists port_briefing_participantes_sessao_idx on public.port_briefing_participantes (sessao_id);
create index if not exists port_briefing_participantes_cpf_idx on public.port_briefing_participantes (cpf);
create index if not exists port_briefing_participantes_data_idx on public.port_briefing_participantes (data desc);

alter table public.port_briefing_participantes enable row level security;

drop policy if exists port_briefing_participantes_rw on public.port_briefing_participantes;
create policy port_briefing_participantes_rw on public.port_briefing_participantes
  for all to authenticated using (true) with check (true);
