-- =====================================================================
-- Financeiro — Mercado Livre: adiantamento por compra e baixas parciais
-- =====================================================================
-- Uma compra do ML (nº "# 2000015748279995", gravado pelo comprador em
-- `sup_ml_itens.numero_compra`) gera UM boleto, pago como adiantamento. Os
-- itens chegam depois, em NFs de lojas diferentes, cada NF vira um PO no SAP,
-- e cada item tem a sua entrada no almoxarifado e a sua MIGO — em datas
-- diferentes. O Financeiro vai baixando o adiantamento por item, à medida que
-- cada um se comprova.
--
-- fin_ml_compras  uma linha por nº de compra: valor do boleto, vencimento,
--                 pagamento e documento SAP do adiantamento.
-- fin_ml_baixas   baixas parciais. `ri` aponta o item de RM; nulo para o
--                 que não é item (frete, diferença de arredondamento).
--                 Estorno não apaga: marca estornado_em/por, para o histórico
--                 do adiantamento continuar fechando.
-- vw_fin_ml_itens item do ML + PO/valor (ZL0132) + recebimento no almox
--                 (conferência da ficha cega e "chegou") + NF + MIGO + baixado.
--
-- Quem lança: admin, setores Financeiro/Contabilidade/Controladoria (6, 7, 18
-- — os mesmos de `SETORES_FINANCEIRO_IDS` em pages.ts) ou quem recebeu a
-- página `fin_mercado_livre` na Gestão de Acessos. Leitura: autenticados (o
-- comprador acompanha a mesma compra pela Central).

create or replace function public.fin_ml_pode_lancar()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.core_perfis p
     where p.id = (select auth.uid())::text
       and p.status = 'ativo'
       and (
         'admin' = any(p.roles)
         or p.sector_id in ('6', '7', '18')
         or coalesce((p.page_access->>'fin_mercado_livre')::boolean, false)
       )
  )
$$;
revoke all on function public.fin_ml_pode_lancar() from public, anon;
grant execute on function public.fin_ml_pode_lancar() to authenticated;

create table if not exists public.fin_ml_compras (
  numero_compra text primary key,
  valor_boleto numeric(14,2) check (valor_boleto is null or valor_boleto >= 0),
  vencimento date,
  pago_em date,
  doc_adiantamento text,
  observacao text,
  atualizado_por_id text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fin_ml_compras enable row level security;
drop policy if exists fin_ml_compras_select on public.fin_ml_compras;
create policy fin_ml_compras_select on public.fin_ml_compras
  for select to authenticated using (true);
drop policy if exists fin_ml_compras_write on public.fin_ml_compras;
create policy fin_ml_compras_write on public.fin_ml_compras
  for all to authenticated
  using (public.fin_ml_pode_lancar()) with check (public.fin_ml_pode_lancar());
revoke all on public.fin_ml_compras from anon;
grant select, insert, update on public.fin_ml_compras to authenticated;

create table if not exists public.fin_ml_baixas (
  id uuid primary key default gen_random_uuid(),
  numero_compra text not null,
  ri text,
  valor numeric(14,2) not null check (valor > 0),
  data_baixa date not null,
  nota_fiscal text,
  doc_compensacao text,
  observacao text,
  criado_por_id text not null default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  estornado_em timestamptz,
  estornado_por_nome text,
  motivo_estorno text
);

create index if not exists idx_fin_ml_baixas_compra on public.fin_ml_baixas (numero_compra);
create index if not exists idx_fin_ml_baixas_ri on public.fin_ml_baixas (ri) where ri is not null;

alter table public.fin_ml_baixas enable row level security;
drop policy if exists fin_ml_baixas_select on public.fin_ml_baixas;
create policy fin_ml_baixas_select on public.fin_ml_baixas
  for select to authenticated using (true);
drop policy if exists fin_ml_baixas_insert on public.fin_ml_baixas;
create policy fin_ml_baixas_insert on public.fin_ml_baixas
  for insert to authenticated
  with check (public.fin_ml_pode_lancar() and criado_por_id = (select auth.uid())::text);
-- Só o estorno altera uma baixa, e só quem lançou ou um admin.
drop policy if exists fin_ml_baixas_estorno on public.fin_ml_baixas;
create policy fin_ml_baixas_estorno on public.fin_ml_baixas
  for update to authenticated
  using (public.fin_ml_pode_lancar() and (criado_por_id = (select auth.uid())::text or public.has_role('admin')))
  with check (public.fin_ml_pode_lancar());
revoke all on public.fin_ml_baixas from anon;
grant select, insert on public.fin_ml_baixas to authenticated;
grant update (estornado_em, estornado_por_nome, motivo_estorno) on public.fin_ml_baixas to authenticated;

-- Item da conferência guarda a linha como "RI-PO" (ex.: 110032374400020-4100449216).
create index if not exists idx_alm_receb_conf_itens_linha_ref
  on public.alm_receb_conferencia_itens (linha_ref) where linha_ref is not null;

create or replace view public.vw_fin_ml_itens with (security_invoker = true) as
select
  m.ri, m.rm, m.item_reqc, m.material_code, m.texto_breve, m.qtd, m.unidade, m.link,
  m.numero_compra, m.compra_registrada_em, m.compra_registrada_por_nome,
  po.pedidos, po.fornecedores, po.valor_pedido, po.qtd_pedido, po.qtd_fornecida,
  po.data_pedido, po.data_migo,
  rec.qtd_recebida, rec.data_recebimento, rec.notas_fiscais,
  ch.data_chegada,
  coalesce(bx.valor_baixado, 0)::numeric(14,2) as valor_baixado,
  bx.ultima_baixa
from public.sup_ml_itens m
left join lateral (
  select array_agg(distinct p.doc_compra) as pedidos,
         array_agg(distinct p.fornecedor_nome) filter (where p.fornecedor_nome is not null) as fornecedores,
         sum(p.valor_liquido) as valor_pedido,
         sum(p.qtd_pedido) as qtd_pedido,
         sum(p.qtd_fornecida) as qtd_fornecida,
         min(p.data_doc) as data_pedido,
         max(p.data_migo) as data_migo
    from public.mv_pedidos_por_ri p
   where p.ri = m.ri and coalesce(p.eflag_e, '') <> 'L'
  having count(*) > 0
) po on true
left join lateral (
  select sum(ci.qtd_recebida) as qtd_recebida,
         max(c.data) as data_recebimento,
         array_agg(distinct g.nota_fiscal) filter (where nullif(trim(g.nota_fiscal), '') is not null) as notas_fiscais
    from public.alm_receb_conferencia_itens ci
    join public.alm_receb_conferencias c on c.id = ci.conferencia_id and not c.excluido
    left join public.alm_receb_cargas g on g.id = c.carga_id and not g.excluido
   where ci.linha_ref = any (array(select m.ri || '-' || x from unnest(po.pedidos) x))
  having count(*) > 0
) rec on true
left join lateral (
  select min(a.data_chegada) as data_chegada
    from public.almoxarifado_chegadas a where a.ri = m.ri
) ch on true
left join lateral (
  select sum(b.valor) as valor_baixado, max(b.data_baixa) as ultima_baixa
    from public.fin_ml_baixas b
   where b.ri = m.ri and b.numero_compra = m.numero_compra and b.estornado_em is null
) bx on true
where m.numero_compra is not null;

revoke all on public.vw_fin_ml_itens from anon;
grant select on public.vw_fin_ml_itens to authenticated;

comment on table public.fin_ml_compras is
  'Financeiro — adiantamento (boleto) de cada compra do Mercado Livre, por nº de compra de sup_ml_itens.';
comment on table public.fin_ml_baixas is
  'Financeiro — baixas parciais do adiantamento do ML, por item de RM (ri) ou avulsas (ri nulo: frete/diferença). Estorno marca estornado_em.';
