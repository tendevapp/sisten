-- Adiciona a coluna data_entrega_confirmada na tabela sap_me5a_rc
ALTER TABLE public.sap_me5a_rc
ADD COLUMN IF NOT EXISTS data_entrega_confirmada date;

-- Atualiza a view requisicoes para incluir data_entrega_confirmada
CREATE OR REPLACE VIEW public.requisicoes AS
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
    item_status,
    item_status_updated_at,
    item_status_updated_by,
    data_entrega_confirmada
FROM sap_me5a_rc;

-- Atualiza a view vw_sap_requisicoes_enriquecidas adicionando data_entrega_confirmada ao final
CREATE OR REPLACE VIEW public.vw_sap_requisicoes_enriquecidas AS
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
    p.doc_compra AS documento_compra,
    p.item AS item_pedido,
    p.fornecedor_codigo AS fornecedor_code,
    p.fornecedor_nome AS fornecedor_name,
    p.data_doc AS data_pedido,
    p.data_migo,
    p.dt_remessa AS data_entrega_sap,
    p.status_entrega,
    p.dias_atrasado,
        CASE
            WHEN r.tipo_de_documento = 'ZR01'::text THEN 'Normal'::text
            WHEN r.tipo_de_documento = 'ZR02'::text THEN 'Urgente'::text
            WHEN r.tipo_de_documento = 'ZR03'::text THEN 'Máquina Parada'::text
            WHEN r.tipo_de_documento = 'ZR04'::text THEN 'Equipamento pesado'::text
            WHEN r.tipo_de_documento = 'ZR05'::text THEN 'Exportação normal'::text
            WHEN r.tipo_de_documento = 'ZR06'::text THEN 'Exportação urgente'::text
            WHEN r.tipo_de_documento = 'ZR07'::text THEN 'Exportação máquina parada'::text
            WHEN r.tipo_de_documento = 'ZR08'::text THEN 'Exportação equipamento pesado'::text
            WHEN r.tipo_de_documento = 'ZR09'::text THEN 'Orçamento'::text
            WHEN r.tipo_de_documento = 'ZR10'::text THEN 'Subempreitada'::text
            WHEN r.tipo_de_documento = 'ZR11'::text THEN 'Serviço - Normal'::text
            WHEN r.tipo_de_documento = 'ZR16'::text THEN 'Serviço - Urgente'::text
            WHEN r.tipo_de_documento = 'ZR17'::text THEN 'Serviço - MP'::text
            ELSE COALESCE(r.tipo_de_documento, 'Normal'::text)
        END AS natureza,
        CASE
            WHEN p.doc_compra IS NULL OR p.doc_compra = ''::text THEN 'Sem PO'::text
            ELSE 'Processado'::text
        END AS status_requisicao,
        CASE
            WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
            WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
            WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
            ELSE 30
        END AS lead_time_compras_meta,
        CASE
            WHEN p.data_migo IS NOT NULL THEN p.data_migo
            ELSE CURRENT_DATE
        END AS data_referencia_prazo,
    GREATEST(0, EXTRACT(day FROM
        CASE
            WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
            ELSE CURRENT_TIMESTAMP
        END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
        CASE
            WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
            WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
            WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
            ELSE 30
        END) AS atraso_comprador,
        CASE
            WHEN
            CASE
                WHEN p.doc_compra IS NULL OR p.doc_compra = ''::text THEN 'Sem PO'::text
                ELSE 'Processado'::text
            END = 'Processado'::text AND p.data_migo IS NOT NULL THEN 'Concluído'::text
            WHEN r.status_processamento = 'A'::text THEN 'Em Cotação'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) > 30 THEN 'Crítico - Ação Urgente'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) > 15 THEN 'Atrasado'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) > 0 THEN 'Em Andamento'::text
            ELSE 'No Prazo'::text
        END AS status_atualizado,
        CASE
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) <= 0 THEN 'Sem Atraso'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) >= 1 AND GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) <= 7 THEN '1-7 dias'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) >= 8 AND GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) <= 15 THEN '8-15 dias'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) >= 16 AND GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) <= 30 THEN '16-30 dias'::text
            ELSE 'Acima 30 dias'::text
        END AS faixa_atraso,
        CASE
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) > 15 AND (r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text])) THEN '⚠️ ESCALAR IMEDIATAMENTE'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) > 30 THEN '⚠️ AÇÃO URGENTE'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) > 15 THEN '⚡ ACOMPANHAR'::text
            WHEN GREATEST(0, EXTRACT(day FROM
            CASE
                WHEN p.data_migo IS NOT NULL THEN p.data_migo::timestamp without time zone::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer -
            CASE
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                WHEN r.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                ELSE 30
            END) > 7 THEN '📋 MONITORAR'::text
            ELSE '✅ OK'::text
        END AS alerta,
    EXTRACT(day FROM CURRENT_TIMESTAMP - r.data_da_solicitacao::timestamp without time zone::timestamp with time zone)::integer AS dias_em_aberto,
    r.item_status,
    r.item_status_updated_at,
    r.item_status_updated_by,
    p.criado_por_pedido,
    r.data_entrega_confirmada
   FROM sap_me5a_rc r
     LEFT JOIN mv_pedido_atual_por_ri p ON r.ri = p.ri;

NOTIFY pgrst, 'reload schema';
