-- =====================================================================
-- Central de Compras › M Livre — fornecedor cadastrado e NF por item
-- =====================================================================
-- Depois da compra no ML, a loja que vendeu é cadastrada como fornecedor no
-- SAP para o pedido (PO) ser emitido. O comprador cola o código do
-- fornecedor (LIFNR, ex.: 1000083593) no item; a Central passa o status do
-- comprador para "Aguardando PO" e o card "Aguardando PO" da aba M Livre
-- lista esses itens.
--
-- Cada item chega com a NF da loja (uma compra do ML vira várias NFs). A NF
-- (PDF ou imagem) fica no bucket privado cotacoes-arquivos, em
-- mercado-livre/<ri>/nf/, e o vínculo em `notas_fiscais`:
--   [{ nome, path, mime_type, tamanho_bytes, enviado_em, enviado_por_nome }]
--
-- Mesmo acesso das demais colunas da tabela (RLS já liberada a authenticated).

alter table public.sup_ml_itens
  add column if not exists fornecedor_codigo text,
  add column if not exists fornecedor_registrado_em timestamptz,
  add column if not exists fornecedor_registrado_por_nome text,
  add column if not exists notas_fiscais jsonb not null default '[]'::jsonb;

create index if not exists idx_sup_ml_itens_fornecedor_codigo
  on public.sup_ml_itens (fornecedor_codigo)
  where fornecedor_codigo is not null;

comment on column public.sup_ml_itens.fornecedor_codigo is
  'Código SAP (LIFNR) da loja do ML cadastrada como fornecedor. Gravado põe o item em "Aguardando PO".';
comment on column public.sup_ml_itens.notas_fiscais is
  'NFs do item (PDF/imagem) no bucket cotacoes-arquivos: [{nome,path,mime_type,tamanho_bytes,enviado_em,enviado_por_nome}].';
