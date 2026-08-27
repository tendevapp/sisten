-- Módulo Portaria — "Registro de Chegada de Transportes" (FRM.SGP-0009).
-- Registra a chegada e saída de transportes (vans, carros, caminhões, ônibus) por turno.

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
