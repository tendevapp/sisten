/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

-- Migration: Criação da tabela de Teste de Alcoolemia e Livro de Sorteados (FRM.SGP-0015)
create table if not exists public.port_alcoolemia_testes (
  id uuid primary key default gen_random_uuid(),
  codigo_formulario text not null,
  numero_protocolo text,
  data date not null default current_date,
  horario text not null,
  turno text not null default 'MANHA',
  tipo_vinculo text not null default 'TEN', -- 'TEN' (CLT) ou 'PJ' (Terceiro)
  pessoa_id uuid references public.rh_pessoas(id) on delete set null,
  matricula text,
  nome text not null,
  empresa text not null default 'TEN',
  cargo_funcao text,
  setor_area text,
  documento text,
  resultado text not null default 'NEGATIVO', -- 'NEGATIVO', 'POSITIVO', 'RECUSA', 'PENDENTE'
  valor_medido numeric(4,2) default 0.00,
  etilometro_codigo text,
  vigilante text,
  testemunha text,
  observacoes text,
  criado_por text,
  criado_por_nome text,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices para performance nas consultas do livro do dia e relatórios
create index if not exists idx_port_alcoolemia_data on public.port_alcoolemia_testes(data);
create index if not exists idx_port_alcoolemia_excluido on public.port_alcoolemia_testes(excluido_em);
create index if not exists idx_port_alcoolemia_resultado on public.port_alcoolemia_testes(resultado);
create index if not exists idx_port_alcoolemia_tipo on public.port_alcoolemia_testes(tipo_vinculo);
create index if not exists idx_port_alcoolemia_codigo on public.port_alcoolemia_testes(codigo_formulario);

-- Habilitar RLS
alter table public.port_alcoolemia_testes enable row level security;

-- Políticas de RLS
drop policy if exists port_alcoolemia_testes_sel on public.port_alcoolemia_testes;
create policy port_alcoolemia_testes_sel on public.port_alcoolemia_testes
  for select using (true);

drop policy if exists port_alcoolemia_testes_ins on public.port_alcoolemia_testes;
create policy port_alcoolemia_testes_ins on public.port_alcoolemia_testes
  for insert with check (auth.uid() is not null);

drop policy if exists port_alcoolemia_testes_upd on public.port_alcoolemia_testes;
create policy port_alcoolemia_testes_upd on public.port_alcoolemia_testes
  for update using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));

drop policy if exists port_alcoolemia_testes_del on public.port_alcoolemia_testes;
create policy port_alcoolemia_testes_del on public.port_alcoolemia_testes
  for delete using (public.form_pode_editar(criado_por));
