-- =====================================================================
-- Produção › Apontamentos de Torres Eólicas — Fluxo Industrial por Naves
-- (Nave 1 [3 Fábricas] -> Nave 2 -> Nave White -> Almoxarifado/Expedição)
-- =====================================================================

create table if not exists public.prod_apt_tramos (
  id uuid primary key default gen_random_uuid(),
  codigo_tramo text not null unique,
  virola_origem text,
  op_origem text,
  estagio_atual text not null default 'nave2' check (estagio_atual in ('nave1_fabrica3', 'nave2', 'white', 'expedicao_almoxarifado')),
  percentual_conclusao numeric not null default 0 check (percentual_conclusao between 0 and 100),
  liberado_nave2_em timestamptz default now(),
  liberado_white_em timestamptz,
  liberado_almoxarifado_em timestamptz,
  criado_por text references public.core_perfis(id) default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prod_apt_tramos_estagio_idx on public.prod_apt_tramos(estagio_atual);
create index if not exists prod_apt_tramos_codigo_idx on public.prod_apt_tramos(codigo_tramo);

create table if not exists public.prod_apt_operacoes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nave text not null check (nave in ('nave1', 'nave2', 'white')),
  fabrica text check (fabrica is null or fabrica in ('fabrica1', 'fabrica2', 'fabrica3')),
  processo_id text not null,
  processo_nome text not null,
  virola_numero text,
  op_numero text,
  tramo_codigo text,
  tramo_id uuid references public.prod_apt_tramos(id) on delete set null,
  realizado boolean not null default true,
  data_apontamento timestamptz not null default now(),
  observacao text,
  fotos jsonb not null default '[]'::jsonb,
  criado_por text references public.core_perfis(id) default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists prod_apt_operacoes_nave_idx on public.prod_apt_operacoes(nave, processo_id);
create index if not exists prod_apt_operacoes_tramo_idx on public.prod_apt_operacoes(tramo_codigo);
create index if not exists prod_apt_operacoes_data_idx on public.prod_apt_operacoes(data_apontamento desc);

-- RLS
alter table public.prod_apt_tramos enable row level security;
alter table public.prod_apt_operacoes enable row level security;

-- Leitura: usuários autenticados
create policy prod_apt_tramos_sel on public.prod_apt_tramos for select to authenticated using (true);
create policy prod_apt_operacoes_sel on public.prod_apt_operacoes for select to authenticated using (true);

-- Escrita: usuários autenticados com acesso à produção
create policy prod_apt_tramos_ins on public.prod_apt_tramos for insert to authenticated with check (true);
create policy prod_apt_tramos_upd on public.prod_apt_tramos for update to authenticated using (true) with check (true);

create policy prod_apt_operacoes_ins on public.prod_apt_operacoes for insert to authenticated with check (true);
create policy prod_apt_operacoes_upd on public.prod_apt_operacoes for update to authenticated using (true) with check (true);

-- Conceder permissões para authenticated e service_role
grant all on public.prod_apt_tramos, public.prod_apt_operacoes to authenticated, service_role;

-- Revogar anon
revoke all on public.prod_apt_tramos, public.prod_apt_operacoes from anon;

notify pgrst, 'reload schema';
