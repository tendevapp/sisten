-- Módulo Portaria — "Relatório de Portaria" (FRM.SGP-0010).
-- Cabeçalho do livro de plantão, turno, rondas e horário de atuação.

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
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists port_relatorio_portaria_data_idx on public.port_relatorio_portaria (data desc);
create index if not exists port_relatorio_portaria_status_idx on public.port_relatorio_portaria (status);

alter table public.port_relatorio_portaria enable row level security;

drop policy if exists port_relatorio_portaria_rw on public.port_relatorio_portaria;
create policy port_relatorio_portaria_rw on public.port_relatorio_portaria
  for all to authenticated using (true) with check (true);
