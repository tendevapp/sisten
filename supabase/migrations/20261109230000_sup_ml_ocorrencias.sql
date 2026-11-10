-- =====================================================================
-- Central de Compras › M Livre — devolução e reembolso por item
-- =====================================================================
-- Depois da compra no ML, um item pode ser reembolsado em parte (a estante
-- chegou com defeito e o vendedor devolveu 30%) ou devolvido (a pilha chegou
-- avariada, volta ao vendedor e precisa ser comprada de novo). O comprador
-- lança isso no item; o Financeiro vê no cartão da compra.
--
-- Um item pode ter mais de uma ocorrência (reembolso parcial e depois
-- devolução), por isso tabela própria em vez de colunas em sup_ml_itens.
-- `numero_compra` é a compra do item no momento do lançamento — se ele for
-- recomprado em outra compra, o lançamento continua na compra original.
--
-- Exclusão é lógica (excluido_em) para o Financeiro não perder o histórico.

create table if not exists public.sup_ml_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  ri text not null,
  numero_compra text,
  tipo text not null check (tipo in ('reembolso', 'devolucao')),
  percentual numeric check (percentual is null or (percentual > 0 and percentual <= 100)),
  valor numeric check (valor is null or valor > 0),
  motivo text,
  recomprar boolean not null default false,
  recompra_feita_em timestamptz,
  recompra_feita_por_nome text,
  recompra_numero_compra text,
  criado_por_id text not null default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por_nome text,
  constraint sup_ml_ocorrencias_reembolso_com_valor
    check (tipo <> 'reembolso' or percentual is not null or valor is not null)
);

create index if not exists idx_sup_ml_ocorrencias_ri on public.sup_ml_ocorrencias (ri) where excluido_em is null;
create index if not exists idx_sup_ml_ocorrencias_compra on public.sup_ml_ocorrencias (numero_compra) where excluido_em is null;

comment on table public.sup_ml_ocorrencias is
  'Devolução/reembolso de item comprado no ML (Central de Compras › M Livre); aparece no Financeiro › Mercado Livre.';
comment on column public.sup_ml_ocorrencias.recomprar is
  'Devolução que exige comprar o item de novo (chegou avariado). Fica pendente até recompra_feita_em.';

alter table public.sup_ml_ocorrencias enable row level security;

drop policy if exists sup_ml_ocorrencias_select on public.sup_ml_ocorrencias;
create policy sup_ml_ocorrencias_select on public.sup_ml_ocorrencias
  for select to authenticated using (true);

drop policy if exists sup_ml_ocorrencias_insert on public.sup_ml_ocorrencias;
create policy sup_ml_ocorrencias_insert on public.sup_ml_ocorrencias
  for insert to authenticated
  with check (criado_por_id = (select auth.uid())::text);

-- Mesmo acesso de sup_ml_itens (qualquer comprador mexe no item do ML):
-- marcar recompra feita e excluir (lógico).
drop policy if exists sup_ml_ocorrencias_update on public.sup_ml_ocorrencias;
create policy sup_ml_ocorrencias_update on public.sup_ml_ocorrencias
  for update to authenticated using (true) with check (true);

revoke all on public.sup_ml_ocorrencias from anon, public;
grant select, insert, update on public.sup_ml_ocorrencias to authenticated;
