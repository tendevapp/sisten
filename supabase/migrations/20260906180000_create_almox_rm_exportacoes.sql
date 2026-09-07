-- =====================================================================
-- Almoxarifado > Abrir RM — log das exportações da planilha padrão de RM
--
-- Duas tabelas porque as duas perguntas são diferentes:
--   almox_rm_exportacoes             — "quem exportou o quê, quando"
--   almox_rm_exportacao_solicitacoes — "esta solicitação já saiu?"
--
-- A segunda é a que a tela usa como filtro (Exportadas / Não exportadas).
-- Ela aceita a mesma solicitação mais de uma vez de propósito: reexportar
-- acontece (planilha perdida, RM recusada no SAP) e apagar o registro
-- anterior jogaria fora o histórico que o log existe para guardar.
-- =====================================================================

create table if not exists public.almox_rm_exportacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  exportado_por_id uuid,
  exportado_por_nome text not null,
  total_solicitacoes integer not null default 0,
  total_itens integer not null default 0,
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists public.almox_rm_exportacao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  exportacao_id uuid not null references public.almox_rm_exportacoes (id) on delete cascade,
  request_id text not null,
  request_number text not null,
  total_itens integer not null default 0,
  created_at timestamptz not null default now()
);

-- O filtro da tela pergunta sempre "esta solicitação está aqui?"; o log
-- detalhado pergunta "o que saiu nesta exportação?".
create index if not exists idx_almox_rm_exp_sol_request on public.almox_rm_exportacao_solicitacoes (request_id);
create index if not exists idx_almox_rm_exp_sol_exportacao on public.almox_rm_exportacao_solicitacoes (exportacao_id);
create index if not exists idx_almox_rm_exportacoes_data on public.almox_rm_exportacoes (created_at desc);

grant select, insert, update, delete on public.almox_rm_exportacoes to anon, authenticated, service_role;
grant select, insert, update, delete on public.almox_rm_exportacao_solicitacoes to anon, authenticated, service_role;

alter table public.almox_rm_exportacoes enable row level security;
alter table public.almox_rm_exportacao_solicitacoes enable row level security;

drop policy if exists "almox_rm_exportacoes_all" on public.almox_rm_exportacoes;
create policy "almox_rm_exportacoes_all"
  on public.almox_rm_exportacoes
  for all
  using (true)
  with check (true);

drop policy if exists "almox_rm_exportacao_solicitacoes_all" on public.almox_rm_exportacao_solicitacoes;
create policy "almox_rm_exportacao_solicitacoes_all"
  on public.almox_rm_exportacao_solicitacoes
  for all
  using (true)
  with check (true);
