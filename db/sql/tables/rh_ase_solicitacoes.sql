-- Módulo RH — cabeçalho do formulário "ASE - Autorização para Serviços
-- Extraordinários" (FRM.RHU-0007). Sem workflow de aprovação por decisão de
-- produto: o formulário só fica visível para usuários que o admin conceder
-- acesso via page_access['rh_ase_hora_extra'] (tipicamente os próprios
-- gestores de turno), então o preenchimento já é a autorização.
-- Aplicado via Supabase MCP em 2026-08-26 (migration create_rh_module_tables).

create table public.rh_ase_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  codigo_formulario text not null default 'FRM.RHU-0007',
  numero_protocolo text not null unique,
  solicitante_id text references public.profiles(id),
  setor_id uuid references public.rh_setores(id),
  turno_id uuid references public.rh_turnos(id),
  data_execucao date not null,
  justificativa text,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'ENVIADO', 'CANCELADO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index rh_ase_solicitacoes_data_idx on public.rh_ase_solicitacoes (data_execucao desc);

alter table public.rh_ase_solicitacoes enable row level security;

-- SELECT liberado a todo autenticado (a gate de página controla quem vê o
-- módulo); INSERT/UPDATE/DELETE só do solicitante que criou a ASE
-- (solicitante_id, com default auth.uid()) ou de um admin. Policies
-- granulares e public.form_pode_editar() em
-- supabase/migrations/20260902160000_formularios_rls_autor_ou_admin.sql.
