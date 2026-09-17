-- =====================================================================
-- Módulo Qualidade — Gestão de RNC (Relatório de Não Conformidade)
--
-- Uma tabela só (`qua_rnc`), com o plano de ação e os anexos gravados em
-- jsonb na própria linha: o plano tem poucas atividades por RNC (o exemplo
-- de referência do usuário tem 1–5) e sempre é lido/escrito junto com a
-- RNC, então não paga o preço de uma tabela-filha à parte. Segue o mesmo
-- desenho de `ssma_rid_desvios.plano_acao` e `ssma_rid_desvios.fotos`, só
-- que aqui o plano é uma lista de atividades (O quê/Quem/Quando/Início
-- real/Término real), não uma demanda única — o formulário de referência
-- (Qualiex) numera cada atividade e mede atraso/adiantamento por linha.
--
-- Código de registro: RNC-DDMMYY-NN (regra 2 do CLAUDE.md), reiniciando por
-- mês — mesmo recorte do RID, volume baixo (dezenas por mês).
-- `numero_rnc_externo` é opcional: várias RNCs já nascem com número oficial
-- formalizado em outro sistema (ex.: "RNC-2447/2026" no Qualiex) e o usuário
-- quer poder referenciar esse número sem que ele vire o identificador interno.
-- =====================================================================

create table if not exists public.qua_rnc (
  id uuid primary key default gen_random_uuid(),

  numero_registro text not null,
  numero_rnc_externo text,

  emissor_id text,
  emissor_nome text not null,
  data_emissao date not null default current_date,
  data_ocorrencia date,

  origem_nc text not null default 'FORNECEDOR' check (origem_nc in ('PROCESSO', 'FORNECEDOR')),
  documento_origem text,
  area_geradora text,
  fornecedor text,
  numero_pedido_compra text,
  tipo_nc text,
  cliente text,
  projeto text,
  responsavel_id text,
  responsavel_nome text,
  tramo_sequencial text,

  descricao text not null,

  status text not null default 'ABERTA' check (status in ('ABERTA', 'EM_TRATAMENTO', 'CONCLUIDA', 'CANCELADA')),

  anexos jsonb not null default '[]'::jsonb,
  plano_acao jsonb not null default '[]'::jsonb,

  criado_por text default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text
);

create unique index if not exists qua_rnc_numero_registro_uk on public.qua_rnc (numero_registro);
create index if not exists idx_qua_rnc_status on public.qua_rnc (status);
create index if not exists idx_qua_rnc_data_emissao on public.qua_rnc (data_emissao);
create index if not exists idx_qua_rnc_criado_por on public.qua_rnc (criado_por);
create index if not exists idx_qua_rnc_fornecedor on public.qua_rnc (fornecedor);
create index if not exists idx_qua_rnc_plano_acao on public.qua_rnc using gin (plano_acao);
create index if not exists idx_qua_rnc_excluido_em on public.qua_rnc (excluido_em);

grant select, insert, update, delete on public.qua_rnc to authenticated, service_role;
alter table public.qua_rnc enable row level security;

-- RLS: mesma regra das demais respostas de formulário (autor ou admin edita,
-- todo autenticado lê) — reaproveita `public.form_pode_editar`, criado em
-- `20260902160000_formularios_rls_autor_ou_admin.sql`.
drop policy if exists qua_rnc_sel on public.qua_rnc;
create policy qua_rnc_sel on public.qua_rnc
  for select to authenticated using (true);

drop policy if exists qua_rnc_ins on public.qua_rnc;
create policy qua_rnc_ins on public.qua_rnc
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));

drop policy if exists qua_rnc_upd on public.qua_rnc;
create policy qua_rnc_upd on public.qua_rnc
  for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));

drop policy if exists qua_rnc_del on public.qua_rnc;
create policy qua_rnc_del on public.qua_rnc
  for delete to authenticated
  using (public.form_pode_editar(criado_por));
