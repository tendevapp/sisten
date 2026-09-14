-- =====================================================================
-- Produção > Lançamentos — cabeçalho ÚNICO para qualquer etapa (corte,
-- chanfro, calandra, solda, e as que vierem depois nos próximos blocos).
--
-- Onde o NAV1 tem seis coleções quase idênticas (plasma/chanfro/calandra/
-- virolas/flanges/ut) e seis motores de pendência, aqui é uma tabela + a
-- etapa como FK — fila, pendências, ficha da peça e painéis leem o mesmo
-- lugar. Satélites de medição (EVS, UT, Flange) chegam nos blocos 3-5.
--
-- Idempotência do outbox: `client_id` é gerado no aparelho (offline-first,
-- ver src/lib/outbox.ts) e é UNIQUE — um reenvio duplicado (rede caiu depois
-- do INSERT mas antes da resposta) bate no `on conflict` da RPC
-- `prod_registrar_lancamento` e não duplica o lançamento.
--
-- RLS REAL (não só de tela, diferente do Recebimento que usa RLS permissiva
-- + checagem no front): liberação de qualidade é dado sensível a auditoria.
--   SELECT — livre a autenticados.
--   INSERT — só em nome do próprio usuário (ou admin) — mesmo padrão de
--            20260902160000_formularios_rls_autor_ou_admin.sql.
--   UPDATE — só autor ou admin, via `public.form_pode_editar` (já existe).
--   Sem DELETE — exclusão é sempre lógica (excluido_em), via UPDATE.
-- =====================================================================

-- O banco remoto pode não ter recebido a migration genérica de formulários
-- que introduziu esta função. Produção depende dela para autor/admin nas RLS;
-- recriá-la aqui é idempotente e evita deixar o módulo sem autorização real.
create or replace function public.form_pode_editar(p_dono text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_dono = (select auth.uid())::text or public.has_role('admin')
$$;
revoke all on function public.form_pode_editar(text) from public, anon;
grant execute on function public.form_pode_editar(text) to authenticated, service_role;

create table if not exists public.prod_lancamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  client_id uuid not null unique,
  etapa_id text not null references public.prod_etapas (id),
  virola_id text not null references public.prod_virolas (id),
  -- Denormalizado para filtro/consulta sem join — torre/tramo/virola não
  -- mudam depois de semeados, e a consulta é o caminho quente da tela.
  projeto text not null default 'GW_JACOBINA',
  torre_numero integer not null,
  tramo text not null,
  virola text not null,
  data_digitacao date not null default current_date,
  data_liberacao date not null,
  hora time,
  turno text check (turno in ('A','B','C','Administrativo')),
  status text not null check (status in ('aprovado','reprovado','pendente')),
  -- Só o Corte digita; as etapas seguintes herdam (ver prod_fila_etapa).
  rastreabilidade text,
  recurso_id uuid references public.prod_recursos (id),
  execucao_empresa text check (execucao_empresa in ('TEN','TECOI')),
  executante_pessoa_id uuid references public.rh_pessoas (id),
  executante_nome text,
  inspetor_pessoa_id uuid references public.rh_pessoas (id),
  inspetor_nome text,
  observacao text,
  -- [{path, nome, tipo}] no bucket prod-evidencias. Comprimida (regra 1 do
  -- CLAUDE.md) e carimbada com data/hora (lib/carimboFoto.ts) antes de subir.
  evidencias jsonb not null default '[]'::jsonb,
  -- Rastreabilidade encadeada (equivalente a sourcePlasmaId/sourceChanfroId
  -- do NAV1): aponta para o lançamento aprovado da etapa anterior que
  -- liberou esta peça para cá.
  anterior_id uuid references public.prod_lancamentos (id),
  -- Nº de vezes que esta virola passou por esta etapa — uma reprovação
  -- seguida de nova liberação é a 2ª tentativa. Base do alerta de
  -- reincidência (Bloco 4).
  tentativa integer not null default 1,
  criado_por text references public.core_perfis (id) default (auth.uid())::text,
  criado_por_nome text,
  excluido_em timestamptz,
  excluido_por text references public.core_perfis (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prod_lancamentos_virola on public.prod_lancamentos (virola_id, etapa_id, created_at desc);
create index if not exists idx_prod_lancamentos_etapa_status on public.prod_lancamentos (etapa_id, status) where excluido_em is null;
create index if not exists idx_prod_lancamentos_data on public.prod_lancamentos (data_liberacao desc) where excluido_em is null;
create index if not exists idx_prod_lancamentos_torre on public.prod_lancamentos (projeto, torre_numero, tramo) where excluido_em is null;

grant select, insert, update on public.prod_lancamentos to authenticated;
grant all on public.prod_lancamentos to service_role;
alter table public.prod_lancamentos enable row level security;

drop policy if exists prod_lancamentos_sel on public.prod_lancamentos;
create policy prod_lancamentos_sel on public.prod_lancamentos for select to authenticated using (true);

drop policy if exists prod_lancamentos_ins on public.prod_lancamentos;
create policy prod_lancamentos_ins on public.prod_lancamentos for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));

drop policy if exists prod_lancamentos_upd on public.prod_lancamentos;
create policy prod_lancamentos_upd on public.prod_lancamentos for update to authenticated
  using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));

-- Log de alteração — uma linha por edição, com o diff campo a campo. Só as
-- RPCs `prod_editar_lancamento` (security definer) escrevem aqui; o botão
-- "Histórico" não existe — o log mora no detalhe do lançamento.
create table if not exists public.prod_alteracoes (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.prod_lancamentos (id) on delete cascade,
  codigo text,
  alteracoes jsonb not null default '[]'::jsonb,
  resumo text,
  alterado_por_id text,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_prod_alteracoes_lancamento on public.prod_alteracoes (lancamento_id, created_at desc);

grant select on public.prod_alteracoes to authenticated;
grant all on public.prod_alteracoes to service_role;
alter table public.prod_alteracoes enable row level security;
drop policy if exists prod_alteracoes_sel on public.prod_alteracoes;
create policy prod_alteracoes_sel on public.prod_alteracoes for select to authenticated using (true);
-- Sem policy de INSERT: só a RPC security definer grava.
