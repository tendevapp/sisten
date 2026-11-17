-- RM cujo pedido foi eliminado no SAP sai da Central de Compras
-- Data: 2026-11-17
--
-- Caso: o comprador elimina a linha do PO no SAP (lixeira, EKPO-LOEKZ = 'L').
-- A ZL0132 passa a trazer a linha com eflag_e = 'L' e a mv_sap_requisicoes_po
-- já a ignora — mas o item da RM continua aberto na ME5A (status B, coluna
-- "Pedido" apontando para o PO eliminado) e aparecia na Central como
-- "Sem PO", como se ainda faltasse comprar. Em 17/11 eram 28 itens.
--
-- Nova coluna `po_eliminado` (no fim da view, sem mexer nas demais):
-- verdadeira quando o item NÃO tem PO ativo e o PO que a ME5A indica (ou
-- qualquer PO do item, se a ME5A não indica nenhum) está eliminado
--   * na ZL0132 (mv_pedidos_por_ri.eflag_e = 'L', casado pelo RI), ou
--   * na ME2L (codigo_eliminacao = 'L', casado por RC + material + pedido da
--     ME5A — a ME2L não tem item de RC). Só vale quando o layout da ME2L
--     exportar a coluna "Código de eliminação".
-- Se o comprador refizer o pedido, o PO novo é ativo e o item volta a
-- aparecer normalmente com ele.
--
-- O `eflag_po` da view não serve para isso: a mv_sap_requisicoes_po só junta
-- linhas não eliminadas, então ele nunca vale 'L'.
--
-- A definição é lida do banco (pg_get_viewdef) e só ganha a coluna nova no
-- fim, para não reescrever à mão os CASE da view.

DO $$
DECLARE
  v_def text;
  v_fim constant text := E'    x_crf_po AS crf_po\n   FROM c;';
  v_novo text;
BEGIN
  v_def := pg_get_viewdef('public.vw_sap_requisicoes_enriquecidas'::regclass, true);

  IF position('po_eliminado' IN v_def) > 0 THEN
    RAISE NOTICE 'vw_sap_requisicoes_enriquecidas já tem po_eliminado';
    RETURN;
  END IF;

  IF right(v_def, length(v_fim)) <> v_fim THEN
    RAISE EXCEPTION 'Fim inesperado da definição de vw_sap_requisicoes_enriquecidas — revise a migration';
  END IF;

  v_novo := left(v_def, length(v_def) - length(v_fim)) || E'    x_crf_po AS crf_po,\n'
    || $col$
        CASE
            WHEN COALESCE(NULLIF(doc_compra, ''::text), m2_documento_compras) IS NOT NULL THEN false
            WHEN EXISTS ( SELECT 1
               FROM mv_pedidos_por_ri pe
              WHERE pe.ri = c.ri
                AND upper(btrim(pe.eflag_e)) = 'L'::text
                AND (NULLIF(btrim(c.pedido), ''::text) IS NULL OR pe.doc_compra = btrim(c.pedido))) THEN true
            WHEN NULLIF(btrim(c.pedido), ''::text) IS NOT NULL AND EXISTS ( SELECT 1
               FROM sap_me2l_pedido m
              WHERE m.documento_compras = btrim(c.pedido)
                AND m.requisicao_compra = c.requisicao_de_compra
                AND COALESCE(m.material, ''::text) = COALESCE(c.material, ''::text)
                AND upper(btrim(m.codigo_eliminacao)) = 'L'::text) THEN true
            ELSE false
        END AS po_eliminado
   FROM c;$col$;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_sap_requisicoes_enriquecidas AS ' || v_novo;
END
$$;
