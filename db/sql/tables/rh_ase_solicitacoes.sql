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

-- Acesso liberado a todo autenticado no banco — a restrição real de quem
-- vê/preenche é a gate de página (page_access), igual ao padrão já usado em
-- expedicao_carregamentos/expedicao_tramos.
create policy rh_ase_solicitacoes_rw on public.rh_ase_solicitacoes
  for all to authenticated using (true) with check (true);
