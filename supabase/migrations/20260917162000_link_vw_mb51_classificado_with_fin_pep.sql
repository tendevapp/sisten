-- Migration: 20260917162000_link_vw_mb51_classificado_with_fin_pep.sql
-- Vincula a view de movimentações classificadas (vw_mb51_classificado) com a tabela fin_pep
-- para permitir analisar saídas e consumos de estoque pela descrição do Elemento PEP.

CREATE OR REPLACE VIEW public.vw_mb51_classificado AS
 SELECT m.id,
    m.centro,
    m.deposito,
    m.doc_material,
    m.item,
    m.pedido,
    m.referencia,
    m.material,
    m.texto_breve_material,
    m.qtd_um_registro,
    m.unid_medida_basica,
    m.montante_mi,
    m.moeda,
    m.data_lancamento,
    m.data_documento,
    m.data_entrada,
    m.tipo_movimento,
    m.fornecedor,
    m.razao_social_fornecedor,
    m.nome_usuario,
    m.elemento_pep,
    m.chave_unica,
    COALESCE(NULLIF(btrim(t.descricao), ''::text), NULLIF(btrim(m.txt_tipo_movimento), ''::text), 'Não classificado'::text) AS descricao_tipo_movimento,
    CASE
        WHEN (m.tipo_movimento = ANY (ARRAY['301'::text, '302'::text, '303'::text, '304'::text, '305'::text, '306'::text, '309'::text, '310'::text, '311'::text, '312'::text, '313'::text, '314'::text, '315'::text, '316'::text, '321'::text, '322'::text, '323'::text, '324'::text, '325'::text, '326'::text, '341'::text, '342'::text, '343'::text, '344'::text, '349'::text, '350'::text, '351'::text, '352'::text])) THEN 'transferencia'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['101'::text, '131'::text])) THEN 'entrada_compra'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['102'::text, '132'::text])) THEN 'estorno_entrada'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['501'::text, '503'::text, '505'::text, '511'::text, '521'::text, '531'::text, '571'::text])) THEN 'entrada_sem_pedido'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['502'::text, '504'::text, '506'::text, '512'::text, '522'::text, '532'::text, '572'::text])) THEN 'estorno_entrada'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['201'::text, '221'::text, '231'::text, '241'::text, '251'::text, '261'::text, '281'::text, '291'::text])) THEN 'consumo'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['202'::text, '222'::text, '232'::text, '242'::text, '252'::text, '262'::text, '282'::text, '292'::text])) THEN 'estorno_consumo'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['122'::text, '124'::text, '161'::text])) THEN 'devolucao_fornecedor'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['123'::text, '125'::text, '162'::text])) THEN 'estorno_devolucao'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['601'::text, '621'::text, '631'::text, '641'::text, '643'::text, '645'::text, '647'::text])) THEN 'saida_remessa'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['602'::text, '622'::text, '632'::text, '642'::text, '644'::text, '646'::text, '648'::text])) THEN 'estorno_remessa'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['551'::text, '553'::text, '555'::text])) THEN 'baixa_sucata'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['552'::text, '554'::text, '556'::text])) THEN 'estorno_sucata'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['701'::text, '703'::text, '707'::text, '711'::text, '713'::text, '715'::text, '717'::text])) THEN 'ajuste_inventario'::text
        WHEN (m.tipo_movimento = ANY (ARRAY['702'::text, '704'::text, '708'::text, '712'::text, '714'::text, '716'::text, '718'::text])) THEN 'ajuste_inventario'::text
        ELSE 'outros'::text
    END AS categoria,
    (m.tipo_movimento <> ALL (ARRAY['301'::text, '302'::text, '303'::text, '304'::text, '305'::text, '306'::text, '309'::text, '310'::text, '311'::text, '312'::text, '313'::text, '314'::text, '315'::text, '316'::text, '321'::text, '322'::text, '323'::text, '324'::text, '325'::text, '326'::text, '341'::text, '342'::text, '343'::text, '344'::text, '349'::text, '350'::text, '351'::text, '352'::text])) AS movimenta_estoque,
    CASE
        WHEN (m.qtd_um_registro > (0)::numeric) THEN 'entrada'::text
        WHEN (m.qtd_um_registro < (0)::numeric) THEN 'saida'::text
        ELSE 'neutro'::text
    END AS sinal,
    (m.deposito IS NOT NULL) AS entra_almoxarifado,
    p.nome AS pep_nome,
    p.definicao_projeto AS pep_projeto,
    p.nivel AS pep_nivel
   FROM sap_mb51_mov m
     LEFT JOIN tipo_mov_estoque t ON ((t.tmv)::text = btrim(m.tipo_movimento))
     LEFT JOIN fin_pep p ON p.wbs_element = btrim(m.elemento_pep);
