-- Módulo Portaria — "Controle de Entrada de Equipamento e Ferramentas de Terceiros" (FRM.SGP-0011).
-- Registra a entrada e saída de materiais/ferramentas trazidos por prestadores de serviço e terceirizados.

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
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create index if not exists port_controle_equipamentos_data_idx on public.port_controle_equipamentos (data_entrada desc);
create index if not exists port_controle_equipamentos_status_idx on public.port_controle_equipamentos (status);
create index if not exists port_controle_equipamentos_empresa_idx on public.port_controle_equipamentos (nome_empresa);

alter table public.port_controle_equipamentos enable row level security;

-- Leitura liberada a todo autenticado; INSERT/UPDATE/DELETE só do autor
-- (criado_por) ou de um admin. As policies granulares (sel/ins/upd/del) e a
-- função public.form_pode_editar() estão em
-- supabase/migrations/20260902160000_formularios_rls_autor_ou_admin.sql
-- (fonte da verdade). `criado_por` tem default auth.uid().
