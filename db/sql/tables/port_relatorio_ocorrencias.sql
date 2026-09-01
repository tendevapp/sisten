-- Módulo Portaria — Ocorrências e Rondas do "Relatório de Portaria" (FRM.SGP-0010).
-- Registros individuais com horário, local/setor, descrição e severidade.

create table if not exists public.port_relatorio_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null references public.port_relatorio_portaria(id) on delete cascade,
  horario time not null,
  local_setor text not null check (local_setor in ('PORTARIA', 'RONDA_01', 'RONDA_02', 'PATIO_CHAPAS', 'PATIO_TRAMOS', 'FABRICA', 'OUTRO')),
  descricao text not null,
  severidade text not null default 'INFO' check (severidade in ('INFO', 'ALERTA', 'GRAVE')),
  vigilante text not null,
  created_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists port_relatorio_ocorrencias_relatorio_idx on public.port_relatorio_ocorrencias (relatorio_id);
create index if not exists port_relatorio_ocorrencias_horario_idx on public.port_relatorio_ocorrencias (horario);

alter table public.port_relatorio_ocorrencias enable row level security;

drop policy if exists port_relatorio_ocorrencias_rw on public.port_relatorio_ocorrencias;
create policy port_relatorio_ocorrencias_rw on public.port_relatorio_ocorrencias
  for all to authenticated using (true) with check (true);
