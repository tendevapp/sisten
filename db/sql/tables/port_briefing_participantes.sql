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
  created_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists port_briefing_participantes_sessao_idx on public.port_briefing_participantes (sessao_id);
create index if not exists port_briefing_participantes_cpf_idx on public.port_briefing_participantes (cpf);
create index if not exists port_briefing_participantes_data_idx on public.port_briefing_participantes (data desc);

alter table public.port_briefing_participantes enable row level security;

-- Leitura liberada; edição/exclusão herda o dono da sessão-pai
-- (port_briefing_sessoes.criado_por) — só o autor ou um admin. Policies
-- granulares em
-- supabase/migrations/20260902160000_formularios_rls_autor_ou_admin.sql.
