-- =====================================================================
-- Módulo SSMA — Tabela de Registros de Identificação de Desvio (RID)
-- =====================================================================

create table if not exists public.ssma_rid_desvios (
  id uuid primary key default gen_random_uuid(),
  numero_registro text not null,
  pessoa_id uuid references public.rh_pessoas(id) on delete set null,
  nome_informante text not null,
  matricula_informante text,
  origem_informante text not null default 'rh_pessoas' check (origem_informante in ('rh_pessoas', 'manual')),
  setor text not null,
  data_registro date not null default current_date,
  semana text not null,
  empresa text not null default 'TEN' check (empresa in ('TEN', 'CONTRATADA')),
  empresa_contratada_nome text,
  area_desvio text not null,
  area_desvio_outro text,
  descricao_desvio text not null,
  sanado_imediato boolean not null default false,
  acao_imediata text,
  acao_proposta text,
  comunicado_responsavel_area boolean not null default false,
  comunicado_seguranca boolean not null default false,
  responsavel_seguranca_informado text,
  comportamentos_inseguros text[] default '{}'::text[],
  condicoes_inseguras text[] default '{}'::text[],
  classificacao_outro text,
  fotos jsonb default '[]'::jsonb,
  status text not null default 'REGISTRADO' check (status in ('REGISTRADO', 'EM_TRATAMENTO', 'CONCLUIDO', 'CANCELADO')),
  parecer_ssma text,
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz default null,
  excluido_por text references public.core_perfis(id)
);

create index if not exists idx_ssma_rid_desvios_data_registro on public.ssma_rid_desvios (data_registro desc);
create index if not exists idx_ssma_rid_desvios_setor on public.ssma_rid_desvios (setor);
create index if not exists idx_ssma_rid_desvios_semana on public.ssma_rid_desvios (semana);
create index if not exists idx_ssma_rid_desvios_status on public.ssma_rid_desvios (status);
create index if not exists idx_ssma_rid_desvios_excluido_em on public.ssma_rid_desvios (excluido_em);
create index if not exists idx_ssma_rid_desvios_criado_por on public.ssma_rid_desvios (criado_por);

alter table public.ssma_rid_desvios enable row level security;

drop policy if exists ssma_rid_desvios_rw on public.ssma_rid_desvios;
create policy ssma_rid_desvios_rw on public.ssma_rid_desvios
  for all to authenticated
  using (true)
  with check (true);
