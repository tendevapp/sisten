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
  rota text, -- R1 / R2 / R3 na UI, ou valor livre via opção "Outro"
  ocupacao text,
  observacoes text,
  status text not null default 'NO_PATIO' check (status in ('NO_PATIO', 'FINALIZADO', 'CANCELADO')),
  criado_por text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists port_registro_transportes_data_idx on public.port_registro_transportes (data desc);
create index if not exists port_registro_transportes_placa_idx on public.port_registro_transportes (placa);
create index if not exists port_registro_transportes_status_idx on public.port_registro_transportes (status);
create index if not exists port_registro_transportes_rota_idx on public.port_registro_transportes (rota);

alter table public.port_registro_transportes enable row level security;

-- Leitura liberada a todo autenticado; INSERT/UPDATE/DELETE só do autor
-- (criado_por) ou de um admin. Policies granulares e public.form_pode_editar()
-- em supabase/migrations/20260902160000_formularios_rls_autor_ou_admin.sql.
