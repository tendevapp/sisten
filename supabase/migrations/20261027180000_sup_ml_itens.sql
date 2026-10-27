-- =====================================================================
-- Central de Compras — itens destinados à compra pelo Mercado Livre
-- =====================================================================
-- No ML uma compra só (um carrinho, um boleto) junta itens de várias RMs e
-- chega em várias NFs de lojas diferentes. Para não perder o fio, cada item
-- de RM (`ri`) destinado ao ML ganha uma linha aqui com o link do anúncio; ao
-- fechar o carrinho o comprador marca os itens e grava o número da compra do
-- ML (`numero_compra`, ex.: 2000015616071149) — é ele que amarra boleto,
-- itens e RMs. A subpágina "M Livre" da Central lista só estes itens.
--
-- Granularidade por `ri` (item de RM), não `ri_po`: o destino ML é decidido
-- antes de existir PO. Dados do item (RM, material, descrição, qtd) ficam
-- copiados para a linha continuar legível depois que a RM sair da ME5A.
--
-- Mesmo acesso das demais tabelas operacionais do comprador
-- (sup_diligenciamento_itens): a página já é restrita a compradores.

create table if not exists public.sup_ml_itens (
  ri text primary key,
  rm text,
  item_reqc text,
  material_code text,
  texto_breve text,
  qtd numeric,
  unidade text,
  link text not null,
  numero_compra text,
  compra_registrada_em timestamptz,
  compra_registrada_por_nome text,
  criado_por_id text,
  criado_por_nome text,
  atualizado_por_id text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sup_ml_itens_numero_compra
  on public.sup_ml_itens (numero_compra);

alter table public.sup_ml_itens enable row level security;
drop policy if exists sup_ml_itens_all on public.sup_ml_itens;
create policy sup_ml_itens_all on public.sup_ml_itens
  for all to authenticated using (true) with check (true);

revoke all on public.sup_ml_itens from anon;
grant select, insert, update, delete on public.sup_ml_itens to authenticated;
