-- Módulo Portaria — "Controle de Chegada e Saída de Carretas de Chapas" (FRM.SGP-0020).
-- Registra carretas de chapas de aço, cavalos, motoristas e horários de entrada e saída.

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
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists port_controle_carretas_data_idx on public.port_controle_carretas (data_entrada desc);
create index if not exists port_controle_carretas_placas_idx on public.port_controle_carretas (placa_cavalo, placa_carreta);
create index if not exists port_controle_carretas_status_idx on public.port_controle_carretas (status);

alter table public.port_controle_carretas enable row level security;

-- Leitura liberada a todo autenticado; INSERT/UPDATE/DELETE só do autor
-- (criado_por) ou de um admin. Policies granulares e public.form_pode_editar()
-- em supabase/migrations/20260902160000_formularios_rls_autor_ou_admin.sql.
