-- Migration: Correção do Fallback ME2L em vw_sap_requisicoes_enriquecidas
-- Data: 2026-09-14
--
-- Contexto do Bug:
-- A migration 20260912171500_me2l_fallback_sem_po_contrato introduziu um fallback
-- via sap_me2l_pedido quando p.doc_compra IS NULL (não há PO na ZL0132).
-- No entanto, o CTE me2l_por_reqc agrupava SOMENTE por requisicao_compra (DISTINCT ON),
-- pegando 1 único pedido da RM inteira e associando-o a TODOS os itens da RM onde
-- p.doc_compra era nulo.
-- Exemplo real (RM 1100334325): dos 12 itens, apenas 3 tinham PO (itens 10, 120 e 130).
-- Os outros 9 itens em aberto herdavam o pedido do item 10 da ME2L e apareciam
-- incorretamente como "Processado" / com pedido na Central de Compras.
--
-- Solução:
-- 1. me2l_por_reqc agora agrupa por (requisicao_compra, COALESCE(material, ''))
-- 2. O JOIN casa tanto por requisicao_compra quanto por COALESCE(material, '')
--    - Para itens com material (RMs 11... e 12...), o fallback só casa se o material for idêntico.
--    - Para itens de serviço (RMs 17...), onde material é NULL em ambos os lados, o match continua funcionando por RM.
-- 3. Adiciona índice composto em sap_me2l_pedido(requisicao_compra, material) para performance.

CREATE INDEX IF NOT EXISTS idx_sap_me2l_pedido_reqc_mat 
  ON public.sap_me2l_pedido(requisicao_compra, material);

CREATE OR REPLACE VIEW public.vw_sap_requisicoes_enriquecidas AS
WITH me2l_por_reqc AS (
  SELECT DISTINCT ON (requisicao_compra, COALESCE(material, ''))
    requisicao_compra,
    material,
    documento_compras,
    contrato_basico,
    data_documento,
    valor_liquido_pedido,
    qtd_pedido,
    um_pedido,
    fornecedor
  FROM public.sap_me2l_pedido
  WHERE requisicao_compra IS NOT NULL AND requisicao_compra <> ''
  ORDER BY requisicao_compra, COALESCE(material, ''), imported_at DESC
),
j AS (
     SELECT r.ri,
        r.tipo_de_documento,
        r.requisicao_de_compra,
        r.item_reqc,
        r.data_da_solicitacao,
        r.requisitante,
        r.area_solicitante,
        r.material,
        r.texto_breve,
        r.qtd_solicitada,
        r.unidade_de_medida,
        r.status_processamento,
        r.codigo_de_eliminacao,
        r.categoria_do_item,
        r.ctg_class_cont,
        r.tipo_data_de_remessa,
        r.remessas_de_ate,
        r.grupo_de_mercadorias,
        r.centro,
        r.deposito,
        r.grupo_de_compradores,
        r.n_acompanhamento,
        r.fornecedor_fixo,
        r.centro_fornecedor,
        r.organiz_compras,
        r.contrato_basico,
        r.it_contrato_superior,
        r.n_de_reqsc,
        r.criado_por,
        r.data_do_pedido,
        r.moeda,
        r.pedido,
        r.item_do_pedido,
        r.apelido,
        r.aplicacao,
        r.data_de_remessa,
        r.codigo_de_bloqueio,
        r.codigo_de_liberacao,
        r.concluida,
        r.data_da_liberacao,
        r.data_pedido_origem,
        r.descricao_do_grupo_de_compradores,
        r.marca_da_peca,
        r.modelo,
        r.n_material_fornecedor,
        r.n_peca_fabricante,
        r.nome_do_fornecedor,
        r.peca_original,
        r.quantidade_pedida,
        r.sugestao_local_compra,
        r.tempo_procmto_em,
        r.tipo_de_transporte,
        r.requisicao_externa,
        r.obs_comprador,
        r.data_entrega_prevista,
        r.presente_ultima_carga,
        r.eliminado,
        r.campos_extras,
        r.obs_updated_at,
        r.obs_updated_by,
        r.item_status,
        r.item_status_updated_at,
        r.item_status_updated_by,
        r.data_entrega_confirmada,
        p.doc_compra,
        p.item AS p_item,
        p.fornecedor_codigo,
        p.fornecedor_nome,
        p.data_doc,
        p.data_migo AS p_data_migo,
        p.dt_remessa,
        p.criado_por_pedido AS p_criado_por_pedido,
        p.status_entrega,
        p.dias_atrasado,
        p.qtd_pedido,
        p.qtd_fornecida,
        p.por,
        p.unidade_medida_pedido,
        p.preco_liquido_unit,
        p.valor_em_brl,
        p.valor_liquido,
        p.contrato,
        p.item_contrato,
        p.tipo_doc_compra,
        p.eflag_e,
        count(p.doc_compra) OVER (PARTITION BY r.ri) AS total_pos,
        sum(p.qtd_pedido) OVER (PARTITION BY r.ri) AS qtd_pedida_total,
        sum(p.qtd_fornecida) OVER (PARTITION BY r.ri) AS qtd_fornecida_total,
        m2.documento_compras AS m2_documento_compras,
        m2.contrato_basico AS m2_contrato_basico,
        m2.data_documento AS m2_data_documento,
        m2.valor_liquido_pedido AS m2_valor_liquido_pedido,
        m2.qtd_pedido AS m2_qtd_pedido,
        m2.um_pedido AS m2_um_pedido,
        m2.fornecedor AS m2_fornecedor
       FROM sap_me5a_rc r
         LEFT JOIN mv_pedidos_por_ri p ON p.ri = r.ri AND COALESCE(upper(btrim(p.eflag_e)), ''::text) <> 'L'::text
         LEFT JOIN me2l_por_reqc m2 ON m2.requisicao_compra = r.requisicao_de_compra 
                                   AND COALESCE(m2.material, '') = COALESCE(r.material, '')
                                   AND p.doc_compra IS NULL
    ), c AS (
     SELECT j.ri,
        j.tipo_de_documento,
        j.requisicao_de_compra,
        j.item_reqc,
        j.data_da_solicitacao,
        j.requisitante,
        j.area_solicitante,
        j.material,
        j.texto_breve,
        j.qtd_solicitada,
        j.unidade_de_medida,
        j.status_processamento,
        j.codigo_de_eliminacao,
        j.categoria_do_item,
        j.ctg_class_cont,
        j.tipo_data_de_remessa,
        j.remessas_de_ate,
        j.grupo_de_mercadorias,
        j.centro,
        j.deposito,
        j.grupo_de_compradores,
        j.n_acompanhamento,
        j.fornecedor_fixo,
        j.centro_fornecedor,
        j.organiz_compras,
        j.contrato_basico,
        j.it_contrato_superior,
        j.n_de_reqsc,
        j.criado_por,
        j.data_do_pedido,
        j.moeda,
        j.pedido,
        j.item_do_pedido,
        j.apelido,
        j.aplicacao,
        j.data_de_remessa,
        j.codigo_de_bloqueio,
        j.codigo_de_liberacao,
        j.concluida,
        j.data_da_liberacao,
        j.data_pedido_origem,
        j.descricao_do_grupo_de_compradores,
        j.marca_da_peca,
        j.modelo,
        j.n_material_fornecedor,
        j.n_peca_fabricante,
        j.nome_do_fornecedor,
        j.peca_original,
        j.quantidade_pedida,
        j.sugestao_local_compra,
        j.tempo_procmto_em,
        j.tipo_de_transporte,
        j.requisicao_externa,
        j.obs_comprador,
        j.data_entrega_prevista,
        j.presente_ultima_carga,
        j.eliminado,
        j.campos_extras,
        j.obs_updated_at,
        j.obs_updated_by,
        j.item_status,
        j.item_status_updated_at,
        j.item_status_updated_by,
        j.data_entrega_confirmada,
        j.doc_compra,
        j.p_item,
        j.fornecedor_codigo,
        j.fornecedor_nome,
        j.data_doc,
        j.p_data_migo,
        j.dt_remessa,
        j.p_criado_por_pedido,
        j.status_entrega,
        j.dias_atrasado,
        j.qtd_pedido,
        j.qtd_fornecida,
        j.por,
        j.unidade_medida_pedido,
        j.preco_liquido_unit,
        j.valor_em_brl,
        j.valor_liquido,
        j.contrato,
        j.item_contrato,
        j.tipo_doc_compra,
        j.eflag_e,
        j.total_pos,
        j.qtd_pedida_total,
        j.qtd_fornecida_total,
        j.m2_documento_compras,
        j.m2_contrato_basico,
        j.m2_data_documento,
        j.m2_valor_liquido_pedido,
        j.m2_qtd_pedido,
        j.m2_um_pedido,
        j.m2_fornecedor,
            CASE
                WHEN j.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN j.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN j.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END AS meta_lt,
        GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN j.p_data_migo IS NOT NULL THEN j.p_data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - j.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN j.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN j.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN j.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) AS atraso
       FROM j
    )
 SELECT ri,
    tipo_de_documento,
    requisicao_de_compra,
    item_reqc,
    data_da_solicitacao,
    requisitante,
    area_solicitante,
    material,
    texto_breve,
    qtd_solicitada,
    unidade_de_medida,
    status_processamento,
    codigo_de_eliminacao,
    categoria_do_item,
    ctg_class_cont,
    tipo_data_de_remessa,
    remessas_de_ate,
    grupo_de_mercadorias,
    centro,
    deposito,
    grupo_de_compradores,
    n_acompanhamento,
    fornecedor_fixo,
    centro_fornecedor,
    organiz_compras,
    contrato_basico,
    it_contrato_superior,
    n_de_reqsc,
    criado_por,
    data_do_pedido,
    moeda,
    pedido,
    item_do_pedido,
    apelido,
    aplicacao,
    data_de_remessa,
    codigo_de_bloqueio,
    codigo_de_liberacao,
    concluida,
    data_da_liberacao,
    data_pedido_origem,
    descricao_do_grupo_de_compradores,
    marca_da_peca,
    modelo,
    n_material_fornecedor,
    n_peca_fabricante,
    nome_do_fornecedor,
    peca_original,
    quantidade_pedida,
    sugestao_local_compra,
    tempo_procmto_em,
    tipo_de_transporte,
    requisicao_externa,
    obs_comprador,
    data_entrega_prevista,
    presente_ultima_carga,
    eliminado,
    campos_extras,
    obs_updated_at,
    obs_updated_by,
    COALESCE(NULLIF(doc_compra, ''), m2_documento_compras) AS documento_compra,
    p_item AS item_pedido,
    fornecedor_codigo AS fornecedor_code,
    COALESCE(NULLIF(fornecedor_nome, ''), m2_fornecedor) AS fornecedor_name,
    COALESCE(data_doc, m2_data_documento) AS data_pedido,
    p_data_migo AS data_migo,
    dt_remessa AS data_entrega_sap,
    status_entrega,
    dias_atrasado,
        CASE
            WHEN tipo_de_documento = 'ZR01'::text THEN 'Normal'::text
            WHEN tipo_de_documento = 'ZR02'::text THEN 'Urgente'::text
            WHEN tipo_de_documento = 'ZR03'::text THEN 'Máquina Parada'::text
            WHEN tipo_de_documento = 'ZR04'::text THEN 'Equipamento pesado'::text
            WHEN tipo_de_documento = 'ZR05'::text THEN 'Exportação normal'::text
            WHEN tipo_de_documento = 'ZR06'::text THEN 'Exportação urgente'::text
            WHEN tipo_de_documento = 'ZR07'::text THEN 'Exportação máquina parada'::text
            WHEN tipo_de_documento = 'ZR08'::text THEN 'Exportação equipamento pesado'::text
            WHEN tipo_de_documento = 'ZR09'::text THEN 'Orçamento'::text
            WHEN tipo_de_documento = 'ZR10'::text THEN 'Subempreitada'::text
            WHEN tipo_de_documento = 'ZR11'::text THEN 'Serviço - Normal'::text
            WHEN tipo_de_documento = 'ZR16'::text THEN 'Serviço - Urgente'::text
            WHEN tipo_de_documento = 'ZR17'::text THEN 'Serviço - MP'::text
            ELSE COALESCE(tipo_de_documento, 'Normal'::text)
        END AS natureza,
        CASE
            WHEN COALESCE(NULLIF(doc_compra, ''), m2_documento_compras) IS NULL THEN 'Sem PO'::text
            ELSE 'Processado'::text
        END AS status_requisicao,
    meta_lt AS lead_time_compras_meta,
        CASE
            WHEN p_data_migo IS NOT NULL THEN p_data_migo
            ELSE CURRENT_DATE
        END AS data_referencia_prazo,
    atraso AS atraso_comprador,
        CASE
            WHEN
            CASE
                WHEN COALESCE(NULLIF(doc_compra, ''), m2_documento_compras) IS NULL THEN 'Sem PO'::text
                ELSE 'Processado'::text
            END = 'Processado'::text AND p_data_migo IS NOT NULL THEN 'Concluído'::text
            WHEN status_processamento = 'A'::text THEN 'Em Cotação'::text
            WHEN atraso > 30 THEN 'Crítico - Ação Urgente'::text
            WHEN atraso > 15 THEN 'Atrasado'::text
            WHEN atraso > 0 THEN 'Em Andamento'::text
            ELSE 'No Prazo'::text
        END AS status_atualizado,
        CASE
            WHEN atraso <= 0 THEN 'Sem Atraso'::text
            WHEN atraso >= 1 AND atraso <= 7 THEN '1-7 dias'::text
            WHEN atraso >= 8 AND atraso <= 15 THEN '8-15 dias'::text
            WHEN atraso >= 16 AND atraso <= 30 THEN '16-30 dias'::text
            ELSE 'Acima 30 dias'::text
        END AS faixa_atraso,
        CASE
            WHEN atraso > 15 AND (tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text])) THEN '⚠️ ESCALAR IMEDIATAMENTE'::text
            WHEN atraso > 30 THEN '⚠️ AÇÃO URGENTE'::text
            WHEN atraso > 15 THEN '⚡ ACOMPANHAR'::text
            WHEN atraso > 7 THEN '📋 MONITORAR'::text
            ELSE '✅ OK'::text
        END AS alerta,
    EXTRACT(day FROM CURRENT_TIMESTAMP - data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer AS dias_em_aberto,
    item_status,
    item_status_updated_at,
    item_status_updated_by,
    p_criado_por_pedido AS criado_por_pedido,
    data_entrega_confirmada,
    (ri || '-'::text) || COALESCE(NULLIF(doc_compra, ''::text), NULLIF(m2_documento_compras, ''::text), 'SEM-PO'::text) AS ri_po,
    COALESCE(qtd_pedido, m2_qtd_pedido) AS qtd_po,
    COALESCE(unidade_medida_pedido, m2_um_pedido) AS unidade_po,
    preco_liquido_unit AS preco_unit_po,
    por AS por_po,
    COALESCE(valor_em_brl, valor_liquido, m2_valor_liquido_pedido) AS valor_po,
    eflag_e AS eflag_po,
        CASE
            WHEN total_pos = 0 AND m2_documento_compras IS NOT NULL THEN 1
            ELSE total_pos
        END::integer AS total_pos,
    qtd_fornecida AS qtd_fornecida_po,
    qtd_pedida_total,
    qtd_fornecida_total,
    COALESCE(NULLIF(contrato, ''), m2_contrato_basico) AS contrato_po,
    item_contrato AS item_contrato_po,
    tipo_doc_compra AS tipo_doc_po,
        CASE
            WHEN NULLIF(doc_compra, '') IS NOT NULL THEN 'zl0132'::text
            WHEN m2_documento_compras IS NOT NULL THEN 'me2l'::text
            ELSE NULL::text
        END AS origem_po
   FROM c;
