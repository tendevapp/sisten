-- =====================================================================
-- Histórico de envio de cotação por item + fornecedor.
--
-- Contexto: a tela "Central de Compras" (Sem PO) permite enviar cotação
-- por e-mail (Outlook) para fornecedores, individualmente ou em lote.
-- Esta tabela registra cada envio (clique em "Abrir no Outlook"), por
-- combinação item (ri) + fornecedor (cod_forn), para que a própria tela
-- possa avisar o comprador quando um item já foi cotado antes com aquele
-- fornecedor. É um log append-only, sem edição.
-- =====================================================================

create table if not exists public.cotacao_historico (
  id text primary key,
  ri text not null,
  rm text,
  cod_forn text not null,
  fornecedor_nome text,
  user_id text,
  user_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cotacao_historico_ri_cod_forn
  on public.cotacao_historico (ri, cod_forn);

grant select, insert on public.cotacao_historico to anon, authenticated;
