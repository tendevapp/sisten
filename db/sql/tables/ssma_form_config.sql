-- =====================================================================
-- Módulo SSMA — Tabela de Configuração Dinâmica do Formulário RID
-- =====================================================================

create table if not exists public.ssma_form_config (
  id text primary key,
  titulo text not null default 'Registro de Identificação de Desvio (RID)',
  descricao text,
  perguntas jsonb not null default '[]'::jsonb,
  opcoes jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Índices
create index if not exists idx_ssma_form_config_atualizado_em on public.ssma_form_config (atualizado_em desc);

-- Habilitar RLS
alter table public.ssma_form_config enable row level security;

-- Políticas de RLS
drop policy if exists ssma_form_config_read on public.ssma_form_config;
create policy ssma_form_config_read on public.ssma_form_config
  for select to authenticated
  using (true);

drop policy if exists ssma_form_config_write on public.ssma_form_config;
create policy ssma_form_config_write on public.ssma_form_config
  for all to authenticated
  using (true)
  with check (true);
