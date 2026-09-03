-- =====================================================================
-- Diligenciamento de pedidos de compra — dado por item (RI), digitado pelo
-- comprador na aba "Sem MIGO" da Central de Compras (Suprimentos).
--
-- Cria (se ainda não existir) `sup_diligenciamento_itens` — a mesma tabela já
-- descrita em db/sql/tables/sup_diligenciamento_itens.sql. É a metade que
-- faltava do par do Diligenciamento: `sup_prazos_transporte` (prazo de
-- trânsito por UF/transportadora) já foi criada em
-- 20260902180000_sup_prazos_transporte_lead_time.sql.
--
-- Guarda só o que é digitado no painel (transportadora, faturamento da
-- transportadora, previsão manual). Fornecedor, valor e data de remessa
-- continuam sendo lidos da ZL0132 (`sap_zl0132_po`). Granularidade por item
-- (`ri`) porque o envio pode ser separado mesmo dentro de um único pedido.
-- Ver src/lib/diligenciamento.ts e src/lib/diligenciamentoApi.ts.
--
-- Mesmo padrão de acesso de `sup_prazos_transporte`: grants diretos a
-- anon/authenticated, sem RLS — não é "resposta de formulário", é o painel
-- operacional do comprador.
-- =====================================================================

create table if not exists public.sup_diligenciamento_itens (
  ri text primary key,
  doc_compra text,
  transportadora text,
  data_faturamento_transportadora date,
  previsao_manual date,
  atualizado_por_id text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sup_diligenciamento_itens_doc_compra
  on public.sup_diligenciamento_itens (doc_compra);

grant select, insert, update, delete on public.sup_diligenciamento_itens to anon, authenticated;
