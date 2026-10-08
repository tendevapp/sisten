-- Adiciona a coluna posicao_estoque à tabela sap_zl0024_stk e atualiza a view estoque
ALTER TABLE public.sap_zl0024_stk
  ADD COLUMN IF NOT EXISTS posicao_estoque text;

CREATE OR REPLACE VIEW public.estoque WITH (security_invoker = true) AS
SELECT
  id,
  centro,
  deposito,
  tipo_material,
  material,
  referencia_fabricante,
  txt_breve_material,
  quantidade,
  umb,
  preco_medio,
  valor_total,
  grp_mercad,
  class_item,
  grupo_mercadorias,
  aplicacao,
  texto_pedido_compra,
  empresa,
  imported_at,
  posicao_estoque
FROM public.sap_zl0024_stk;
