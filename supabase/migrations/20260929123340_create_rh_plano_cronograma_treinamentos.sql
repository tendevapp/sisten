create table if not exists public.rh_plano_treinamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  treinamento_id uuid references public.rh_treinamentos_catalogo(id),
  titulo text not null,
  responsavel text,
  data_inicio date not null,
  data_termino date,
  horario text,
  carga_horaria numeric(8,2),
  participantes_planejados integer check (participantes_planejados is null or participantes_planejados >= 0),
  local text,
  tipo_informacao text not null default 'nao_informado' check (tipo_informacao in ('interno', 'externo', 'nao_informado')),
  modalidade text,
  objetivo text,
  custo_total numeric(14,2) not null default 0 check (custo_total >= 0),
  data_realizada date,
  status text not null default 'programado' check (status in ('programado', 'realizado', 'atrasado', 'reagendado', 'cancelado')),
  comentarios text,
  categoria text,
  origem text not null default 'manual' check (origem in ('manual', 'importacao_indicadores_2026')),
  criado_por text references public.core_perfis(id),
  atualizado_por text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create table if not exists public.rh_plano_treinamentos_participantes (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.rh_plano_treinamentos(id) on delete cascade,
  pessoa_id uuid references public.rh_pessoas(id),
  registro text not null,
  nome text,
  area text,
  data_realizada date,
  status text not null default 'realizado' check (status in ('programado', 'realizado', 'atrasado', 'reagendado', 'cancelado')),
  criado_por text references public.core_perfis(id),
  atualizado_por text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id),
  unique (plano_id, registro)
);

create table if not exists public.rh_cronogramas_treinamentos (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  treinamento_id uuid references public.rh_treinamentos_catalogo(id),
  descricao text not null,
  cotacao numeric(14,2) not null default 0 check (cotacao >= 0),
  unidade_mes numeric(10,2) not null default 0 check (unidade_mes >= 0),
  quantidade_total numeric(10,2) not null default 0 check (quantidade_total >= 0),
  origem text not null default 'manual' check (origem in ('manual', 'importacao_indicadores_2026')),
  criado_por text references public.core_perfis(id),
  atualizado_por text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create table if not exists public.rh_cronogramas_treinamentos_meses (
  id uuid primary key default gen_random_uuid(),
  cronograma_id uuid not null references public.rh_cronogramas_treinamentos(id) on delete cascade,
  competencia date not null,
  quantidade numeric(10,2) not null default 0 check (quantidade >= 0),
  unique (cronograma_id, competencia)
);

create index if not exists rh_plano_treinamentos_data_idx on public.rh_plano_treinamentos (data_inicio desc) where excluido_em is null;
create index if not exists rh_plano_treinamentos_catalogo_idx on public.rh_plano_treinamentos (treinamento_id) where excluido_em is null;
create index if not exists rh_plano_treinamentos_participantes_pessoa_idx on public.rh_plano_treinamentos_participantes (pessoa_id) where excluido_em is null;
create index if not exists rh_cronogramas_treinamentos_catalogo_idx on public.rh_cronogramas_treinamentos (treinamento_id) where excluido_em is null;
create index if not exists rh_cronogramas_treinamentos_meses_competencia_idx on public.rh_cronogramas_treinamentos_meses (competencia);

alter table public.rh_plano_treinamentos enable row level security;
alter table public.rh_plano_treinamentos_participantes enable row level security;
alter table public.rh_cronogramas_treinamentos enable row level security;
alter table public.rh_cronogramas_treinamentos_meses enable row level security;

create policy rh_plano_treinamentos_select on public.rh_plano_treinamentos for select to authenticated
  using (public.pode_gerir_rh('rh_plano_treinamentos') or public.pode_gerir_rh('rh_relatorios_treinamentos'));
create policy rh_plano_treinamentos_write on public.rh_plano_treinamentos for all to authenticated
  using (public.pode_gerir_rh('rh_plano_treinamentos')) with check (public.pode_gerir_rh('rh_plano_treinamentos'));
create policy rh_plano_treinamentos_participantes_select on public.rh_plano_treinamentos_participantes for select to authenticated
  using (public.pode_gerir_rh('rh_plano_treinamentos') or public.pode_gerir_rh('rh_relatorios_treinamentos'));
create policy rh_plano_treinamentos_participantes_write on public.rh_plano_treinamentos_participantes for all to authenticated
  using (public.pode_gerir_rh('rh_plano_treinamentos')) with check (public.pode_gerir_rh('rh_plano_treinamentos'));
create policy rh_cronogramas_treinamentos_select on public.rh_cronogramas_treinamentos for select to authenticated
  using (public.pode_gerir_rh('rh_cronograma_treinamentos') or public.pode_gerir_rh('rh_relatorios_treinamentos'));
create policy rh_cronogramas_treinamentos_write on public.rh_cronogramas_treinamentos for all to authenticated
  using (public.pode_gerir_rh('rh_cronograma_treinamentos')) with check (public.pode_gerir_rh('rh_cronograma_treinamentos'));
create policy rh_cronogramas_treinamentos_meses_select on public.rh_cronogramas_treinamentos_meses for select to authenticated
  using (public.pode_gerir_rh('rh_cronograma_treinamentos') or public.pode_gerir_rh('rh_relatorios_treinamentos'));
create policy rh_cronogramas_treinamentos_meses_write on public.rh_cronogramas_treinamentos_meses for all to authenticated
  using (public.pode_gerir_rh('rh_cronograma_treinamentos')) with check (public.pode_gerir_rh('rh_cronograma_treinamentos'));

grant select, insert, update, delete on public.rh_plano_treinamentos, public.rh_plano_treinamentos_participantes, public.rh_cronogramas_treinamentos, public.rh_cronogramas_treinamentos_meses to authenticated;
grant all on public.rh_plano_treinamentos, public.rh_plano_treinamentos_participantes, public.rh_cronogramas_treinamentos, public.rh_cronogramas_treinamentos_meses to service_role;
