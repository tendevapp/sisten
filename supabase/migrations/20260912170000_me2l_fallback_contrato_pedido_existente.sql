-- Complemento ME2L (1/2): pedido existe na ZL0132, mas o número de contrato
-- (EKPO-KONNR, coluna "Contr.") vem vazio para aquele documento_compras — a
-- extração ZL0132 do SAP tem lacunas nesse campo especificamente para pedidos
-- de call-off de contrato. A ME2L ("Contrato básico") preenche isso na maioria
-- dos casos observados.
--
-- Recria vw_sap_pedidos_enriquecidos preservando EXATAMENTE a mesma lista de
-- colunas/ordem/tipos (CREATE OR REPLACE VIEW exige isso) — só a expressão da
-- coluna "contrato" muda, via COALESCE com sap_me2l_pedido agregada por
-- documento_compras (DISTINCT ON evita fan-out, já que a ME2L pode ter mais de
-- uma linha por PO — um item por linha, sem número de item próprio).

CREATE OR REPLACE VIEW public.vw_sap_pedidos_enriquecidos AS
WITH me2l_por_doc AS (
  SELECT DISTINCT ON (documento_compras)
    documento_compras,
    contrato_basico
  FROM public.sap_me2l_pedido
  WHERE documento_compras IS NOT NULL AND documento_compras <> ''
    AND contrato_basico IS NOT NULL AND contrato_basico <> ''
  ORDER BY documento_compras, imported_at DESC
)
SELECT
    z.ri,
    z.n_acomp,
    z.eflag_e,
    z.reqc,
    z.data_rc,
    z.tpdc,
    z.requisitante,
    z.criado_por_rc,
    z.item,
    z.material,
    z.txt_breve,
    z.tmatt,
    z.grp_mercads,
    z.empremp,
    z.cen_cen,
    z.dep_dep,
    z.tipo_doc_compra,
    z.doc_compra,
    z.criado_por_pedido,
    z.data_doc,
    z.dt_remessa,
    z.data_migo,
    z.est_liber,
    z.estr,
    z.codigo_liberacao_doc_compra,
    z.itm_liberacao,
    z.criado_por_liberacao,
    z.qtd_pedido,
    z.por,
    z.qtd_fornecida,
    z.crf,
    z.ump_1,
    z.unidade_medida_pedido,
    z.preco_liquido_unit,
    z.moeda_1,
    z.valor_em_brl,
    z.moeda_2,
    z.ump_2,
    z.valor_liquido,
    z.fornecedor_codigo,
    z.cnpj_fornecedor,
    z.fornecedor_nome,
    z.regiao_uf,
    z.req_cotacao,
    z.data_pc_sc,
    z.item_rc_cotacao,
    z.upp,
    z.valor_efetivo,
    z.moeda_3,
    z.doc_compra_ref,
    z.itm_ref,
    z.ftf,
    z.posicao,
    z.condicao_pagamento,
    z.criado_por_condicao,
    z.modificado_em,
    COALESCE(NULLIF(z.contrato, ''), m.contrato_basico) AS contrato,
    z.item_contrato,
    z.cn_lcr_parcs,
    z.categoria,
    z.grupo_mercadoria_curto,
    z.ci,
    z.unidade_medida_basica,
    z.ump_3,
    z.campos_extras,
    CASE
        WHEN z.data_migo IS NOT NULL THEN 'Entregue'::text
        ELSE 'Não Entregue'::text
    END AS status_entrega,
    CASE
        WHEN z.data_migo IS NULL AND z.dt_remessa < CURRENT_DATE THEN GREATEST(0, EXTRACT(day FROM CURRENT_TIMESTAMP - z.dt_remessa::timestamp without time zone::timestamp with time zone)::integer)
        ELSE 0
    END AS dias_atrasado
FROM public.sap_zl0132_po z
LEFT JOIN me2l_por_doc m ON m.documento_compras = z.doc_compra;

-- vw_sap_pedidos_enriquecidos é a base de mv_pedidos_por_ri (materialized view);
-- sem este refresh, a correção acima só apareceria na próxima importação ZL0132.
REFRESH MATERIALIZED VIEW public.mv_pedidos_por_ri;
