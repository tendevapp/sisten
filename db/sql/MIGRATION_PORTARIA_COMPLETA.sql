-- =====================================================================
-- SISTEN — MÓDULO DE FORMULÁRIOS DA PORTARIA & SEGURANÇA PATRIMONIAL
-- Mapeamento dos 5 formulários físicos da Portaria TEN
-- Execute este script no SQL Editor do Supabase para criar as tabelas.
-- =====================================================================

-- 1. CONTROLE DE ENTRADA DE EQUIPAMENTOS E FERRAMENTAS DE TERCEIROS (FRM.SGP-0011)
create table if not exists public.port_controle_equipamentos (
  id uuid primary key default gen_random_uuid(),
  codigo_formulario text not null default 'FRM.SGP-0011',
  numero_protocolo text not null unique,
  data_entrada date not null default current_date,
  data_saida date,
  hora_entrada time,
  hora_saida time,
  nome_empresa text not null,
  funcionario text not null,
  descricao_materiais text not null,
  responsavel text,
  vigilante_entrada text not null,
  vigilante_saida text,
  status text not null default 'NO_PATIO' check (status in ('NO_PATIO', 'DEVOLVIDO', 'RETIDO', 'CANCELADO')),
  observacoes text,
  criado_por text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists port_controle_equipamentos_data_idx on public.port_controle_equipamentos (data_entrada desc);
create index if not exists port_controle_equipamentos_status_idx on public.port_controle_equipamentos (status);
create index if not exists port_controle_equipamentos_empresa_idx on public.port_controle_equipamentos (nome_empresa);

alter table public.port_controle_equipamentos enable row level security;

drop policy if exists port_controle_equipamentos_rw on public.port_controle_equipamentos;
create policy port_controle_equipamentos_rw on public.port_controle_equipamentos
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------

-- 2. REGISTRO DE CHEGADA DE TRANSPORTES (FRM.SGP-0009)
create table if not exists public.port_registro_transportes (
  id uuid primary key default gen_random_uuid(),
  codigo_formulario text not null default 'FRM.SGP-0009',
  numero_protocolo text not null unique,
  data date not null default current_date,
  turno text not null default 'MANHA' check (turno in ('MANHA', 'TARDE', 'NOITE', 'TURNO_A', 'TURNO_B', 'TURNO_C')),
  vigilante text not null,
  veiculo text not null,
  placa text not null,
  empresa text not null,
  hora_chegada time not null,
  hora_saida time,
  motorista text not null,
  ocupacao text,
  observacoes text,
  status text not null default 'NO_PATIO' check (status in ('NO_PATIO', 'FINALIZADO', 'CANCELADO')),
  criado_por text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists port_registro_transportes_data_idx on public.port_registro_transportes (data desc);
create index if not exists port_registro_transportes_placa_idx on public.port_registro_transportes (placa);
create index if not exists port_registro_transportes_status_idx on public.port_registro_transportes (status);

alter table public.port_registro_transportes enable row level security;

drop policy if exists port_registro_transportes_rw on public.port_registro_transportes;
create policy port_registro_transportes_rw on public.port_registro_transportes
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------

-- 3. CONTROLE DE CHEGADA E SAÍDA DE CARRETAS DE CHAPAS (FRM.SGP-0020)
create table if not exists public.port_controle_carretas (
  id uuid primary key default gen_random_uuid(),
  codigo_formulario text not null default 'FRM.SGP-0020',
  numero_protocolo text not null unique,
  empresa text not null,
  placa_cavalo text not null,
  placa_carreta text not null,
  data_entrada date not null default current_date,
  hora_entrada time not null,
  nome_motorista text not null,
  cpf_motorista text,
  data_saida date,
  hora_saida time,
  ass_motorista text,
  vigilante_entrada text not null,
  vigilante_saida text,
  numero_nf text,
  peso_bruto numeric,
  status text not null default 'NO_PATIO' check (status in ('NO_PATIO', 'DESCARREGANDO', 'LIBERADO', 'FINALIZADO', 'CANCELADO')),
  observacoes text,
  criado_por text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists port_controle_carretas_data_idx on public.port_controle_carretas (data_entrada desc);
create index if not exists port_controle_carretas_placas_idx on public.port_controle_carretas (placa_cavalo, placa_carreta);
create index if not exists port_controle_carretas_status_idx on public.port_controle_carretas (status);

alter table public.port_controle_carretas enable row level security;

drop policy if exists port_controle_carretas_rw on public.port_controle_carretas;
create policy port_controle_carretas_rw on public.port_controle_carretas
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------

-- 4. RELATÓRIO DE PORTARIA E OCORRÊNCIAS (FRM.SGP-0010)
create table if not exists public.port_relatorio_portaria (
  id uuid primary key default gen_random_uuid(),
  codigo_formulario text not null default 'FRM.SGP-0010',
  numero_protocolo text not null unique,
  data date not null default current_date,
  turno text not null default 'MANHA' check (turno in ('MANHA', 'TARDE', 'NOITE', 'TURNO_A', 'TURNO_B', 'TURNO_C')),
  horario_inicio time not null default '06:00',
  horario_fim time not null default '18:00',
  vigilante_principal text not null,
  vigilante_ronda01 text,
  vigilante_ronda02 text,
  status text not null default 'EM_ANDAMENTO' check (status in ('EM_ANDAMENTO', 'CONCLUIDO', 'PASSADO', 'CANCELADO')),
  observacoes_gerais text,
  criado_por text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists port_relatorio_portaria_data_idx on public.port_relatorio_portaria (data desc);
create index if not exists port_relatorio_portaria_status_idx on public.port_relatorio_portaria (status);

alter table public.port_relatorio_portaria enable row level security;

drop policy if exists port_relatorio_portaria_rw on public.port_relatorio_portaria;
create policy port_relatorio_portaria_rw on public.port_relatorio_portaria
  for all to authenticated using (true) with check (true);

create table if not exists public.port_relatorio_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null references public.port_relatorio_portaria(id) on delete cascade,
  horario time not null,
  local_setor text not null check (local_setor in ('PORTARIA', 'RONDA_01', 'RONDA_02', 'PATIO_CHAPAS', 'PATIO_TRAMOS', 'FABRICA', 'OUTRO')),
  descricao text not null,
  severidade text not null default 'INFO' check (severidade in ('INFO', 'ALERTA', 'GRAVE')),
  vigilante text not null,
  created_at timestamptz not null default now()
);

create index if not exists port_relatorio_ocorrencias_relatorio_idx on public.port_relatorio_ocorrencias (relatorio_id);
create index if not exists port_relatorio_ocorrencias_horario_idx on public.port_relatorio_ocorrencias (horario);

alter table public.port_relatorio_ocorrencias enable row level security;

drop policy if exists port_relatorio_ocorrencias_rw on public.port_relatorio_ocorrencias;
create policy port_relatorio_ocorrencias_rw on public.port_relatorio_ocorrencias
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------

-- 5. BRIEFING DE SEGURANÇA & LISTA DE PRESENÇA (FRM.SGP-0013)
create table if not exists public.port_briefing_sessoes (
  id uuid primary key default gen_random_uuid(),
  codigo_formulario text not null default 'FRM.SGP-0013',
  numero_protocolo text not null unique,
  tema_treinamento text not null default 'BRIEFING DE SEGURANÇA',
  tipo text not null default 'INTERNO' check (tipo in ('INTERNO', 'EXTERNO')),
  data date not null default current_date,
  instrutor_responsavel text not null,
  conteudo_programatico text not null default '1. Apresentação do Layout da Fábrica TEN - Vídeo institucional e vídeo de segurança;
2. Apresentação dos procedimentos e rotinas de segurança;
3. Protocolo de proibição do uso do celular nas áreas produtivas da TEN.',
  termo_responsabilidade text not null default 'Declaro ter recebido as orientações de segurança aplicáveis à minha visita ou atividade, estar ciente das regras gerais de conduta da fábrica e portar as documentações e EPIs exigidos para a minha atuação. Assumo a responsabilidade por qualquer irregularidade constatada em minhas documentações e/ou desvios de conduta durante minha permanência.',
  status text not null default 'ABERTA' check (status in ('ABERTA', 'CONCLUIDA', 'CANCELADA')),
  observacoes text,
  criado_por text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists port_briefing_sessoes_data_idx on public.port_briefing_sessoes (data desc);
create index if not exists port_briefing_sessoes_status_idx on public.port_briefing_sessoes (status);

alter table public.port_briefing_sessoes enable row level security;

drop policy if exists port_briefing_sessoes_rw on public.port_briefing_sessoes;
create policy port_briefing_sessoes_rw on public.port_briefing_sessoes
  for all to authenticated using (true) with check (true);

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
