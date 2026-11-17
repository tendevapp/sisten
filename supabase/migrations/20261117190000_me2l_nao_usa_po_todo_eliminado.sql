-- PO eliminado por inteiro na ZL0132 não volta pelo fallback da ME2L
-- Data: 2026-11-17
--
-- Caso: RM 1100342731 — o PO 4100476582 foi eliminado inteiro no SAP. A ZL0132
-- traz as 23 linhas dele com eflag_e = 'L', mas não traz a linha da PENICILINA
-- (item 30 / item 20 do PO). A ME2L traz as 24 linhas (todas com "a ser
-- fornecida" = 0), e o layout exportado não tem "Código de eliminação". Sem
-- linha na ZL0132, o fallback da ME2L preenchia o PO e a Central mostrava
-- "PO 4100476582 · Sem MIGO" para um pedido que não existe mais.
--
-- Regra: PO que aparece na ZL0132 e tem TODAS as linhas eliminadas está
-- eliminado por inteiro. Então
--   1. o fallback da ME2L não usa esse PO (as colunas m2_* ficam nulas e o
--      ri_po volta a "<ri>-SEM-PO");
--   2. `po_eliminado` também fica verdadeiro quando o pedido da ME5A é um PO
--      eliminado por inteiro, mesmo sem linha do próprio RI na ZL0132.
-- Em 17/11 eram 3 itens (1100342731/30, 1100322954/120, 1100327498/10).
--
-- Como na migration anterior, a definição é lida do banco e editada por
-- trechos exatos; cada trecho precisa casar uma única vez.

CREATE INDEX IF NOT EXISTS mv_pedidos_por_ri_doc_compra_idx ON public.mv_pedidos_por_ri (doc_compra);

DO $$
DECLARE
  v_def text;
  v_trechos text[][] := ARRAY[
    ARRAY[E'             LEFT JOIN private.mv_sap_requisicoes_po x ON x.ri = r.ri\n',
          E'             LEFT JOIN private.mv_sap_requisicoes_po x ON x.ri = r.ri\n'
       || E'             LEFT JOIN LATERAL ( SELECT x.m2_documento_compras IS NOT NULL\n'
       || E'                  AND (EXISTS ( SELECT 1 FROM mv_pedidos_por_ri e WHERE e.doc_compra = x.m2_documento_compras))\n'
       || E'                  AND NOT (EXISTS ( SELECT 1 FROM mv_pedidos_por_ri a WHERE a.doc_compra = x.m2_documento_compras AND COALESCE(upper(btrim(a.eflag_e)), ''''::text) <> ''L''::text)) AS eliminado) m2el ON true\n'],
    ARRAY[E'            x.m2_documento_compras,\n',    E'            CASE WHEN m2el.eliminado THEN NULL::text ELSE x.m2_documento_compras END AS m2_documento_compras,\n'],
    ARRAY[E'            x.m2_contrato_basico,\n',      E'            CASE WHEN m2el.eliminado THEN NULL::text ELSE x.m2_contrato_basico END AS m2_contrato_basico,\n'],
    ARRAY[E'            x.m2_data_documento,\n',       E'            CASE WHEN m2el.eliminado THEN NULL::date ELSE x.m2_data_documento END AS m2_data_documento,\n'],
    ARRAY[E'            x.m2_valor_liquido_pedido,\n', E'            CASE WHEN m2el.eliminado THEN NULL::numeric ELSE x.m2_valor_liquido_pedido END AS m2_valor_liquido_pedido,\n'],
    ARRAY[E'            x.m2_qtd_pedido,\n',           E'            CASE WHEN m2el.eliminado THEN NULL::numeric ELSE x.m2_qtd_pedido END AS m2_qtd_pedido,\n'],
    ARRAY[E'            x.m2_um_pedido,\n',            E'            CASE WHEN m2el.eliminado THEN NULL::text ELSE x.m2_um_pedido END AS m2_um_pedido,\n'],
    ARRAY[E'            x.m2_fornecedor,\n',           E'            CASE WHEN m2el.eliminado THEN NULL::text ELSE x.m2_fornecedor END AS m2_fornecedor,\n'],
    ARRAY[E'            x.ri_po AS x_ri_po,\n',        E'            CASE WHEN m2el.eliminado THEN r.ri || ''-SEM-PO''::text ELSE x.ri_po END AS x_ri_po,\n'],
    ARRAY[E'            ELSE false\n        END AS po_eliminado',
          E'            WHEN NULLIF(btrim(pedido), ''''::text) IS NOT NULL\n'
       || E'              AND (EXISTS ( SELECT 1 FROM mv_pedidos_por_ri e WHERE e.doc_compra = btrim(c.pedido)))\n'
       || E'              AND NOT (EXISTS ( SELECT 1 FROM mv_pedidos_por_ri a WHERE a.doc_compra = btrim(c.pedido) AND COALESCE(upper(btrim(a.eflag_e)), ''''::text) <> ''L''::text)) THEN true\n'
       || E'            ELSE false\n        END AS po_eliminado']
  ];
  i int;
  v_n int;
BEGIN
  v_def := pg_get_viewdef('public.vw_sap_requisicoes_enriquecidas'::regclass, true);

  IF position('m2el' IN v_def) > 0 THEN
    RAISE NOTICE 'vw_sap_requisicoes_enriquecidas já filtra PO eliminado por inteiro';
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(v_trechos, 1) LOOP
    v_n := (length(v_def) - length(replace(v_def, v_trechos[i][1], ''))) / length(v_trechos[i][1]);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Trecho % casou % vez(es) em vw_sap_requisicoes_enriquecidas — revise a migration', i, v_n;
    END IF;
    v_def := replace(v_def, v_trechos[i][1], v_trechos[i][2]);
  END LOOP;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_sap_requisicoes_enriquecidas AS ' || v_def;
END
$$;
