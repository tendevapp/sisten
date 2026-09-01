-- Módulo RH — linhas de colaborador do formulário ASE - Hora Extra
-- (FRM.RHU-0007): matrícula/nome/cargo (snapshot de rh_pessoas no momento do
-- preenchimento), transporte/refeição, horário previsto, %HE e total de
-- horas calculado.
-- Aplicado via Supabase MCP em 2026-08-26 (migration create_rh_module_tables).

create table public.rh_ase_itens (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.rh_ase_solicitacoes(id) on delete cascade,
  pessoa_id uuid references public.rh_pessoas(id),
  registro text not null,
  nome text not null,
  cargo text,
  transporte boolean not null default false,
  refeicao boolean not null default false,
  hora_entrada time,
  hora_saida time,
  intervalo_minutos integer not null default 0,
  percentual_he numeric(5, 2),
  total_horas numeric(5, 2),
  observacao text,
  created_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index rh_ase_itens_solicitacao_idx on public.rh_ase_itens (solicitacao_id);

alter table public.rh_ase_itens enable row level security;

create policy rh_ase_itens_rw on public.rh_ase_itens
  for all to authenticated using (true) with check (true);
