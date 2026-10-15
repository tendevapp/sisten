-- Controle de Estoque: a chegada (MB51) do pedido passa a casar pelo ITEM DO PEDIDO.
--
-- Na ZL0132 a coluna `item` é o item da RM e o item do pedido vem em
-- `itm_liberacao` ("Itm"). A MB51 lança a entrada pelo item do PEDIDO. A view
-- usava `item` (da RM) para ligar a chegada: só funcionava quando RM e pedido
-- tinham o mesmo número de item. Caso que levou à correção: RM 1200091131
-- item 60 → PO 4100450977 item 10, MIGO em 05/06/2026 e 50 un. na MB51 (item
-- 10), mas o Dossiê mostrava "Chegou? NÃO" e sem entregas.
--
-- Medido em 15/10/2026: das linhas de pedido da ZL0132 com entrada na MB51,
-- 1.508 casam pelo item do pedido e só 683 pelo item da RM.
--
-- Mudança: em `pos_distintas`, `item` passa a ser o item do pedido
-- (`itm_liberacao`, com a coluna `item` como reserva) — na chave de
-- deduplicação, na ligação com a MB51 e no `item` do JSON `pedidos`. Isso
-- também deixa de descartar uma das linhas quando a mesma RM é atendida por
-- dois itens do mesmo pedido (a chave antiga usava o item da RM).
-- Nenhum item de pedido é compartilhado por duas RMs na ZL0132, então a nova
-- chave não junta linhas que deveriam ficar separadas.
--
-- Corpo igual ao da view vigente (pg_get_viewdef); só `pos_distintas` muda.

create or replace view public.vw_almox_controle_estoque
with (security_invoker = true)
as
 WITH acesso AS (
         SELECT has_role('admin'::text) OR has_page_access('almox_controle_estoque'::text) OR has_page_access('almox_controle_estoque_editar'::text) OR has_role('comprador'::text) OR has_role('coordenador_suprimentos'::text) OR has_page_access('sup_central_compras'::text) AS permitido
        ), centros AS (
         SELECT DISTINCT sap_zl0024_stk.centro
           FROM sap_zl0024_stk
          WHERE sap_zl0024_stk.centro IS NOT NULL AND sap_zl0024_stk.material IS NOT NULL
        ), limites_movimento AS (
         SELECT sap_mb51_mov.centro,
            min(sap_mb51_mov.data_lancamento) AS inicio,
            max(sap_mb51_mov.data_lancamento) AS fim
           FROM sap_mb51_mov
          WHERE sap_mb51_mov.data_lancamento IS NOT NULL
          GROUP BY sap_mb51_mov.centro
        ), parametros AS (
         SELECT c.centro,
            COALESCE(cfg.janela_inicio, lm.inicio) AS janela_inicio,
            COALESCE(cfg.janela_fim, lm.fim) AS janela_fim,
            COALESCE(cfg.lead_time_padrao_dias, 15::numeric) AS lead_time_padrao_dias,
            COALESCE(cfg.intervalo_compra_dias, 30::numeric) AS intervalo_compra_dias,
            cfg.id AS config_id,
            cfg.updated_at AS config_updated_at
           FROM centros c
             LEFT JOIN limites_movimento lm ON lm.centro = c.centro
             LEFT JOIN almox_controle_estoque_config cfg ON cfg.centro = c.centro AND cfg.ativo
        ), parametros_dias AS (
         SELECT p.centro,
            p.janela_inicio,
            p.janela_fim,
            p.lead_time_padrao_dias,
            p.intervalo_compra_dias,
            p.config_id,
            p.config_updated_at,
                CASE
                    WHEN p.janela_inicio IS NULL OR p.janela_fim IS NULL OR p.janela_fim < p.janela_inicio THEN NULL::integer
                    ELSE ( SELECT count(*)::integer AS count
                       FROM generate_series(p.janela_inicio::timestamp with time zone, p.janela_fim::timestamp with time zone, '1 day'::interval) dia(dia)
                      WHERE EXTRACT(isodow FROM dia.dia) >= 1::numeric AND EXTRACT(isodow FROM dia.dia) <= 5::numeric)
                END AS dias_uteis
           FROM parametros p
        ), posicao_sap AS (
         SELECT s.material,
            s.centro,
            max(s.txt_breve_material) AS descricao,
            max(s.grupo_mercadorias) AS categoria,
            max(s.aplicacao) AS aplicacao,
            max(s.tipo_material) AS tipo_material,
            max(s.umb) AS umb,
            max(s.class_item) AS curva_abc,
            sum(COALESCE(s.quantidade, 0::numeric)) AS saldo_total,
            sum(COALESCE(s.quantidade, 0::numeric)) FILTER (WHERE COALESCE(s.deposito, ''::text) <> ALL (ARRAY['0030'::text, '0070'::text, '0080'::text, '0100'::text, '0110'::text, '0120'::text, '0126'::text, '0201'::text, '0202'::text, '0203'::text, '0210'::text])) AS saldo_reposicao,
            sum(COALESCE(s.valor_total, 0::numeric)) AS valor_estoque,
                CASE
                    WHEN sum(COALESCE(s.quantidade, 0::numeric)) <> 0::numeric THEN sum(COALESCE(s.valor_total, 0::numeric)) / NULLIF(sum(COALESCE(s.quantidade, 0::numeric)), 0::numeric)
                    ELSE avg(NULLIF(s.preco_medio, 0::numeric))
                END AS preco_medio_sap,
            count(DISTINCT s.deposito) AS quantidade_depositos,
            jsonb_agg(jsonb_build_object('deposito', s.deposito, 'saldo', COALESCE(s.quantidade, 0::numeric), 'valor', COALESCE(s.valor_total, 0::numeric), 'preco_medio_sap', s.preco_medio, 'inativo', COALESCE(s.deposito, ''::text) = ANY (ARRAY['0030'::text, '0070'::text, '0080'::text, '0100'::text, '0110'::text, '0120'::text, '0126'::text, '0201'::text, '0202'::text, '0203'::text, '0210'::text])) ORDER BY s.deposito) AS depositos,
            max(s.imported_at) AS estoque_importado_em
           FROM sap_zl0024_stk s
          WHERE s.material IS NOT NULL
          GROUP BY s.material, s.centro
        ), movimentos_base AS (
         SELECT m_1.id,
            m_1.centro,
            m_1.deposito,
            m_1.referencia,
            m_1.doc_material,
            m_1.pedido,
            m_1.item,
            m_1.material,
            m_1.texto_breve_material,
            m_1.qtd_um_registro,
            m_1.unid_medida_basica,
            m_1.montante_mi,
            m_1.moeda,
            m_1.texto_cabecalho_doc,
            m_1.data_lancamento,
            m_1.tipo_movimento,
            m_1.hora_registro,
            m_1.um_registro,
            m_1.data_documento,
            m_1.data_entrada,
            m_1.fornecedor,
            m_1.razao_social_fornecedor,
            m_1.txt_tipo_movimento,
            m_1.nome_usuario,
            m_1.posicao_deposito,
            m_1.elemento_pep,
            m_1.imobilizado,
            m_1.chave_unica,
            m_1.campos_extras,
            m_1.imported_at,
            m_1.created_at,
            p.janela_inicio,
            p.janela_fim
           FROM sap_mb51_mov m_1
             JOIN parametros_dias p ON p.centro = m_1.centro
          WHERE m_1.material IS NOT NULL AND m_1.data_lancamento >= p.janela_inicio AND m_1.data_lancamento <= p.janela_fim
        ), movimentos AS (
         SELECT movimentos_base.material,
            movimentos_base.centro,
            COALESCE(sum(movimentos_base.qtd_um_registro) FILTER (WHERE movimentos_base.tipo_movimento = ANY (ARRAY['101'::text, '102'::text])), 0::numeric) AS entrada_quantidade,
            COALESCE(sum(movimentos_base.montante_mi) FILTER (WHERE movimentos_base.tipo_movimento = ANY (ARRAY['101'::text, '102'::text])), 0::numeric) AS entrada_valor,
            GREATEST(0::numeric, - COALESCE(sum(movimentos_base.qtd_um_registro) FILTER (WHERE movimentos_base.tipo_movimento = ANY (ARRAY['221'::text, '222'::text])), 0::numeric)) AS baixa_direta_quantidade,
            GREATEST(0::numeric, - COALESCE(sum(movimentos_base.montante_mi) FILTER (WHERE movimentos_base.tipo_movimento = ANY (ARRAY['221'::text, '222'::text])), 0::numeric)) AS baixa_direta_valor,
            GREATEST(0::numeric, - (COALESCE(sum(movimentos_base.qtd_um_registro) FILTER (WHERE movimentos_base.tipo_movimento = '311'::text AND movimentos_base.qtd_um_registro < 0::numeric), 0::numeric) + COALESCE(sum(movimentos_base.qtd_um_registro) FILTER (WHERE movimentos_base.tipo_movimento = '312'::text AND movimentos_base.qtd_um_registro > 0::numeric), 0::numeric))) AS producao_quantidade,
            max(movimentos_base.data_lancamento) AS ultimo_movimento,
            max(movimentos_base.imported_at) AS movimentos_importados_em
           FROM movimentos_base
          GROUP BY movimentos_base.material, movimentos_base.centro
        ), movimentos_mes AS (
         SELECT mb.material,
            mb.centro,
            date_trunc('month'::text, mb.data_lancamento::timestamp with time zone)::date AS mes,
            COALESCE(sum(mb.qtd_um_registro) FILTER (WHERE mb.tipo_movimento = ANY (ARRAY['101'::text, '102'::text])), 0::numeric) AS entrada,
            GREATEST(0::numeric, - COALESCE(sum(mb.qtd_um_registro) FILTER (WHERE mb.tipo_movimento = ANY (ARRAY['221'::text, '222'::text])), 0::numeric)) + GREATEST(0::numeric, - (COALESCE(sum(mb.qtd_um_registro) FILTER (WHERE mb.tipo_movimento = '311'::text AND mb.qtd_um_registro < 0::numeric), 0::numeric) + COALESCE(sum(mb.qtd_um_registro) FILTER (WHERE mb.tipo_movimento = '312'::text AND mb.qtd_um_registro > 0::numeric), 0::numeric))) AS consumo,
            COALESCE(sum(mb.montante_mi) FILTER (WHERE mb.tipo_movimento = ANY (ARRAY['101'::text, '102'::text])), 0::numeric) AS valor_entrada,
            GREATEST(0::numeric, - COALESCE(sum(mb.montante_mi) FILTER (WHERE mb.tipo_movimento = ANY (ARRAY['221'::text, '222'::text])), 0::numeric)) + GREATEST(0::numeric, - (COALESCE(sum(mb.qtd_um_registro) FILTER (WHERE mb.tipo_movimento = '311'::text AND mb.qtd_um_registro < 0::numeric), 0::numeric) + COALESCE(sum(mb.qtd_um_registro) FILTER (WHERE mb.tipo_movimento = '312'::text AND mb.qtd_um_registro > 0::numeric), 0::numeric))) * COALESCE(max(pc.preco_medio_sap), 0::numeric) AS valor_consumo
           FROM movimentos_base mb
             LEFT JOIN posicao_sap pc ON pc.material = mb.material AND pc.centro = mb.centro
          GROUP BY mb.material, mb.centro, (date_trunc('month'::text, mb.data_lancamento::timestamp with time zone))
        ), series AS (
         SELECT movimentos_mes.material,
            movimentos_mes.centro,
            jsonb_agg(jsonb_build_object('mes', movimentos_mes.mes, 'entrada', movimentos_mes.entrada, 'consumo', movimentos_mes.consumo, 'valor_entrada', movimentos_mes.valor_entrada, 'valor_consumo', movimentos_mes.valor_consumo) ORDER BY movimentos_mes.mes) AS movimentos_mensais
           FROM movimentos_mes
          GROUP BY movimentos_mes.material, movimentos_mes.centro
        ), rms_validas AS (
         SELECT sap_me5a_rc.ri,
            sap_me5a_rc.tipo_de_documento,
            sap_me5a_rc.requisicao_de_compra,
            sap_me5a_rc.item_reqc,
            sap_me5a_rc.data_da_solicitacao,
            sap_me5a_rc.requisitante,
            sap_me5a_rc.area_solicitante,
            sap_me5a_rc.material,
            sap_me5a_rc.texto_breve,
            sap_me5a_rc.qtd_solicitada,
            sap_me5a_rc.unidade_de_medida,
            sap_me5a_rc.status_processamento,
            sap_me5a_rc.codigo_de_eliminacao,
            sap_me5a_rc.categoria_do_item,
            sap_me5a_rc.ctg_class_cont,
            sap_me5a_rc.tipo_data_de_remessa,
            sap_me5a_rc.remessas_de_ate,
            sap_me5a_rc.grupo_de_mercadorias,
            sap_me5a_rc.centro,
            sap_me5a_rc.deposito,
            sap_me5a_rc.grupo_de_compradores,
            sap_me5a_rc.n_acompanhamento,
            sap_me5a_rc.fornecedor_fixo,
            sap_me5a_rc.centro_fornecedor,
            sap_me5a_rc.organiz_compras,
            sap_me5a_rc.contrato_basico,
            sap_me5a_rc.it_contrato_superior,
            sap_me5a_rc.n_de_reqsc,
            sap_me5a_rc.criado_por,
            sap_me5a_rc.data_do_pedido,
            sap_me5a_rc.moeda,
            sap_me5a_rc.pedido,
            sap_me5a_rc.item_do_pedido,
            sap_me5a_rc.apelido,
            sap_me5a_rc.aplicacao,
            sap_me5a_rc.data_de_remessa,
            sap_me5a_rc.codigo_de_bloqueio,
            sap_me5a_rc.codigo_de_liberacao,
            sap_me5a_rc.concluida,
            sap_me5a_rc.data_da_liberacao,
            sap_me5a_rc.data_pedido_origem,
            sap_me5a_rc.descricao_do_grupo_de_compradores,
            sap_me5a_rc.marca_da_peca,
            sap_me5a_rc.modelo,
            sap_me5a_rc.n_material_fornecedor,
            sap_me5a_rc.n_peca_fabricante,
            sap_me5a_rc.nome_do_fornecedor,
            sap_me5a_rc.peca_original,
            sap_me5a_rc.quantidade_pedida,
            sap_me5a_rc.sugestao_local_compra,
            sap_me5a_rc.tempo_procmto_em,
            sap_me5a_rc.tipo_de_transporte,
            sap_me5a_rc.requisicao_externa,
            sap_me5a_rc.obs_comprador,
            sap_me5a_rc.data_entrega_prevista,
            sap_me5a_rc.presente_ultima_carga,
            sap_me5a_rc.eliminado,
            sap_me5a_rc.campos_extras,
            sap_me5a_rc.obs_updated_at,
            sap_me5a_rc.obs_updated_by,
            sap_me5a_rc.item_status,
            sap_me5a_rc.item_status_updated_at,
            sap_me5a_rc.item_status_updated_by,
            sap_me5a_rc.data_entrega_confirmada
           FROM sap_me5a_rc
          WHERE sap_me5a_rc.material IS NOT NULL AND sap_me5a_rc.presente_ultima_carga IS TRUE AND COALESCE(sap_me5a_rc.eliminado, false) = false AND COALESCE(sap_me5a_rc.concluida, ''::text) <> 'X'::text
        ), rms AS (
         SELECT rms_validas.material,
            rms_validas.centro,
            count(*) AS rms_abertas,
            sum(COALESCE(rms_validas.qtd_solicitada, 0::numeric)) AS rm_quantidade,
            jsonb_agg(jsonb_build_object('ri', rms_validas.ri, 'requisicao', rms_validas.requisicao_de_compra, 'item', rms_validas.item_reqc, 'data', rms_validas.data_da_solicitacao, 'requisitante', rms_validas.requisitante, 'quantidade', rms_validas.qtd_solicitada, 'pedido', rms_validas.pedido, 'item_pedido', rms_validas.item_do_pedido, 'deposito', rms_validas.deposito) ORDER BY rms_validas.data_da_solicitacao DESC NULLS LAST, rms_validas.requisicao_de_compra, rms_validas.item_reqc) AS rms
           FROM rms_validas
          GROUP BY rms_validas.material, rms_validas.centro
        ), recebimentos_pedido AS (
         SELECT sap_mb51_mov.material,
            sap_mb51_mov.centro,
            sap_mb51_mov.pedido,
            ltrim(COALESCE(sap_mb51_mov.item, ''::text), '0'::text) AS item_norm,
            sum(sap_mb51_mov.qtd_um_registro) AS quantidade_recebida,
            sum(sap_mb51_mov.montante_mi) AS valor_recebido,
            max(sap_mb51_mov.data_lancamento) AS ultima_data_recebimento,
            jsonb_agg(jsonb_build_object('data', sap_mb51_mov.data_lancamento, 'quantidade', sap_mb51_mov.qtd_um_registro, 'tipo_movimento', sap_mb51_mov.tipo_movimento, 'documento', sap_mb51_mov.doc_material) ORDER BY sap_mb51_mov.data_lancamento, sap_mb51_mov.doc_material) AS entregas
           FROM sap_mb51_mov
          WHERE sap_mb51_mov.material IS NOT NULL AND sap_mb51_mov.pedido IS NOT NULL AND (sap_mb51_mov.tipo_movimento = ANY (ARRAY['101'::text, '102'::text]))
          GROUP BY sap_mb51_mov.material, sap_mb51_mov.centro, sap_mb51_mov.pedido, (ltrim(COALESCE(sap_mb51_mov.item, ''::text), '0'::text))
        ), pos_distintas AS (
         SELECT DISTINCT ON (sap_zl0132_po.material, (COALESCE(sap_zl0132_po.doc_compra, ''::text)), (COALESCE(NULLIF(btrim(sap_zl0132_po.itm_liberacao), ''::text), sap_zl0132_po.item, ''::text))) sap_zl0132_po.material,
            COALESCE(sap_zl0132_po.cen_cen, ( SELECT min(centros.centro) AS min
                   FROM centros
                  WHERE (( SELECT count(*) AS count
                           FROM centros centros_1)) = 1)) AS centro,
            sap_zl0132_po.dep_dep AS deposito,
            sap_zl0132_po.ri,
            sap_zl0132_po.reqc,
            COALESCE(NULLIF(btrim(sap_zl0132_po.itm_liberacao), ''::text), sap_zl0132_po.item) AS item,
            sap_zl0132_po.doc_compra,
            sap_zl0132_po.data_doc,
            sap_zl0132_po.dt_remessa,
            sap_zl0132_po.data_migo,
            sap_zl0132_po.qtd_pedido,
            sap_zl0132_po.qtd_fornecida,
            sap_zl0132_po.eflag_e,
            sap_zl0132_po.crf,
            sap_zl0132_po.valor_em_brl,
            sap_zl0132_po.fornecedor_nome,
            sap_zl0132_po.modificado_em
           FROM sap_zl0132_po
          WHERE sap_zl0132_po.material IS NOT NULL AND sap_zl0132_po.doc_compra IS NOT NULL
          ORDER BY sap_zl0132_po.material, (COALESCE(sap_zl0132_po.doc_compra, ''::text)), (COALESCE(NULLIF(btrim(sap_zl0132_po.itm_liberacao), ''::text), sap_zl0132_po.item, ''::text)), sap_zl0132_po.modificado_em DESC NULLS LAST
        ), pos_enriquecidas AS (
         SELECT po_1.material,
            po_1.centro,
            po_1.deposito,
            po_1.ri,
            po_1.reqc,
            po_1.item,
            po_1.doc_compra,
            po_1.data_doc,
            po_1.dt_remessa,
            po_1.data_migo,
            po_1.qtd_pedido,
            po_1.qtd_fornecida,
            po_1.eflag_e,
            po_1.crf,
            po_1.valor_em_brl,
            po_1.fornecedor_nome,
            po_1.modificado_em,
                CASE
                    WHEN COALESCE(po_1.eflag_e, ''::text) = 'L'::text OR upper(COALESCE(po_1.crf, ''::text)) = 'X'::text THEN 0::numeric
                    ELSE GREATEST(COALESCE(po_1.qtd_pedido, 0::numeric) - COALESCE(po_1.qtd_fornecida, 0::numeric), 0::numeric)
                END AS quantidade_pendente,
            rec.quantidade_recebida,
            rec.valor_recebido,
            rec.ultima_data_recebimento,
            rec.entregas
           FROM pos_distintas po_1
             LEFT JOIN recebimentos_pedido rec ON rec.material = po_1.material AND NOT rec.centro IS DISTINCT FROM po_1.centro AND rec.pedido = po_1.doc_compra AND rec.item_norm = ltrim(COALESCE(po_1.item, ''::text), '0'::text)
        ), pos AS (
         SELECT pos_enriquecidas.material,
            pos_enriquecidas.centro,
            count(*) FILTER (WHERE pos_enriquecidas.quantidade_pendente > 0::numeric) AS pos_abertas,
            sum(pos_enriquecidas.quantidade_pendente) AS po_quantidade_pendente,
            sum(COALESCE(pos_enriquecidas.quantidade_recebida, 0::numeric)) AS quantidade_recebida,
            max(pos_enriquecidas.ultima_data_recebimento) AS ultima_data_recebimento,
            jsonb_agg(jsonb_build_object('ri', pos_enriquecidas.ri, 'requisicao', pos_enriquecidas.reqc, 'pedido', pos_enriquecidas.doc_compra, 'item', pos_enriquecidas.item, 'data', pos_enriquecidas.data_doc, 'remessa_prevista', pos_enriquecidas.dt_remessa, 'data_migo', pos_enriquecidas.data_migo, 'fornecedor', pos_enriquecidas.fornecedor_nome, 'deposito', pos_enriquecidas.deposito, 'quantidade_pedida', pos_enriquecidas.qtd_pedido, 'quantidade_fornecida', pos_enriquecidas.qtd_fornecida, 'quantidade_pendente', pos_enriquecidas.quantidade_pendente, 'valor_brl', pos_enriquecidas.valor_em_brl, 'quantidade_recebida_mb51', pos_enriquecidas.quantidade_recebida, 'ultima_data_recebimento', pos_enriquecidas.ultima_data_recebimento, 'entregas', COALESCE(pos_enriquecidas.entregas, '[]'::jsonb)) ORDER BY pos_enriquecidas.data_doc DESC NULLS LAST, pos_enriquecidas.doc_compra, pos_enriquecidas.item) AS pedidos
           FROM pos_enriquecidas
          GROUP BY pos_enriquecidas.material, pos_enriquecidas.centro
        ), bom_opcoes_distintas AS (
         SELECT DISTINCT vw_proj_bom_arvore.cod_sap AS material,
            vw_proj_bom_arvore.projeto,
            vw_proj_bom_arvore.qtd_por_torre
           FROM vw_proj_bom_arvore
          WHERE vw_proj_bom_arvore.cod_sap IS NOT NULL AND btrim(vw_proj_bom_arvore.cod_sap) <> ''::text AND vw_proj_bom_arvore.qtd_por_torre IS NOT NULL
        ), bom AS (
         SELECT bom_opcoes_distintas.material,
                CASE
                    WHEN count(DISTINCT bom_opcoes_distintas.projeto) = 1 AND count(DISTINCT bom_opcoes_distintas.qtd_por_torre) = 1 THEN max(bom_opcoes_distintas.qtd_por_torre)
                    ELSE NULL::numeric
                END AS quantidade_por_torre_automatica,
            count(DISTINCT bom_opcoes_distintas.projeto) AS quantidade_projetos,
            jsonb_agg(jsonb_build_object('projeto', bom_opcoes_distintas.projeto, 'quantidade_por_torre', bom_opcoes_distintas.qtd_por_torre) ORDER BY bom_opcoes_distintas.projeto, bom_opcoes_distintas.qtd_por_torre) AS opcoes_quantidade_por_torre
           FROM bom_opcoes_distintas
          GROUP BY bom_opcoes_distintas.material
        ), movimento_geral AS (
         SELECT sap_mb51_mov.material,
            sap_mb51_mov.centro,
            max(sap_mb51_mov.texto_breve_material) AS descricao,
            max(sap_mb51_mov.unid_medida_basica) AS umb,
            max(sap_mb51_mov.data_lancamento) AS ultimo_movimento_geral
           FROM sap_mb51_mov
          WHERE sap_mb51_mov.material IS NOT NULL AND sap_mb51_mov.centro IS NOT NULL
          GROUP BY sap_mb51_mov.material, sap_mb51_mov.centro
        ), materiais_sem_saldo AS (
         SELECT u.material,
            u.centro
           FROM ( SELECT movimento_geral.material,
                    movimento_geral.centro
                   FROM movimento_geral
                UNION
                 SELECT rms_validas.material,
                    rms_validas.centro
                   FROM rms_validas
                  WHERE rms_validas.centro IS NOT NULL
                UNION
                 SELECT pos_enriquecidas.material,
                    pos_enriquecidas.centro
                   FROM pos_enriquecidas
                  WHERE pos_enriquecidas.quantidade_pendente > 0::numeric AND pos_enriquecidas.centro IS NOT NULL) u
             JOIN centros c ON c.centro = u.centro
          WHERE NOT (EXISTS ( SELECT 1
                   FROM posicao_sap p
                  WHERE p.material = u.material AND p.centro = u.centro))
        ), posicao AS (
         SELECT posicao_sap.material,
            posicao_sap.centro,
            posicao_sap.descricao,
            posicao_sap.categoria,
            posicao_sap.aplicacao,
            posicao_sap.tipo_material,
            posicao_sap.umb,
            posicao_sap.curva_abc,
            posicao_sap.saldo_total,
            posicao_sap.saldo_reposicao,
            posicao_sap.valor_estoque,
            posicao_sap.preco_medio_sap,
            posicao_sap.quantidade_depositos,
            posicao_sap.depositos,
            posicao_sap.estoque_importado_em,
            false AS fora_zl0024
           FROM posicao_sap
        UNION ALL
         SELECT z.material,
            z.centro,
            COALESCE(cat.description, mg_1.descricao) AS "coalesce",
            cat.grupo_mercadoria_desc,
            NULL::text AS text,
            cat.tipo_material,
            COALESCE(mg_1.umb, cat.unit) AS "coalesce",
            NULL::text AS text,
            0::numeric AS "numeric",
            0::numeric AS "numeric",
            0::numeric AS "numeric",
            NULL::numeric AS "numeric",
            0::bigint AS int8,
            '[]'::jsonb AS jsonb,
            NULL::timestamp with time zone AS timestamptz,
            true
           FROM materiais_sem_saldo z
             LEFT JOIN sap_zl0169_162_catalogo cat ON cat.material_code = z.material
             LEFT JOIN movimento_geral mg_1 ON mg_1.material = z.material AND mg_1.centro = z.centro
        )
 SELECT posicao.material,
    posicao.centro,
    posicao.descricao,
    posicao.categoria,
    posicao.aplicacao,
    posicao.tipo_material,
    COALESCE(ov.tipo_gestao, 'NAO_DEFINIDO'::text) AS tipo_gestao,
    posicao.umb,
    posicao.curva_abc,
    posicao.saldo_total,
    COALESCE(posicao.saldo_reposicao, 0::numeric) AS saldo_reposicao,
    posicao.valor_estoque,
    posicao.preco_medio_sap,
    posicao.quantidade_depositos,
    posicao.depositos,
    pd.janela_inicio,
    pd.janela_fim,
    pd.dias_uteis,
    COALESCE(ov.lead_time_dias, pd.lead_time_padrao_dias) AS lead_time_dias,
    COALESCE(ov.intervalo_compra_dias, pd.intervalo_compra_dias) AS intervalo_compra_dias,
    COALESCE(m.entrada_quantidade, 0::numeric) AS entrada_quantidade,
    COALESCE(m.entrada_valor, 0::numeric) AS entrada_valor,
    COALESCE(m.baixa_direta_quantidade, 0::numeric) AS baixa_direta_quantidade,
    COALESCE(m.baixa_direta_valor, 0::numeric) AS baixa_direta_valor,
    COALESCE(m.producao_quantidade, 0::numeric) AS producao_quantidade,
    COALESCE(m.producao_quantidade, 0::numeric) * COALESCE(posicao.preco_medio_sap, 0::numeric) AS producao_valor,
    COALESCE(m.baixa_direta_quantidade, 0::numeric) + COALESCE(m.producao_quantidade, 0::numeric) AS consumo_total,
    COALESCE(m.baixa_direta_valor, 0::numeric) + COALESCE(m.producao_quantidade, 0::numeric) * COALESCE(posicao.preco_medio_sap, 0::numeric) AS consumo_valor,
    COALESCE(sr.movimentos_mensais, '[]'::jsonb) AS movimentos_mensais,
    COALESCE(r.rms_abertas, 0::bigint) AS rms_abertas,
    COALESCE(r.rm_quantidade, 0::numeric) AS rm_quantidade,
    COALESCE(r.rms, '[]'::jsonb) AS rms,
    COALESCE(po.pos_abertas, 0::bigint) AS pos_abertas,
    COALESCE(po.po_quantidade_pendente, 0::numeric) AS po_quantidade_pendente,
    COALESCE(po.quantidade_recebida, 0::numeric) AS quantidade_recebida,
    po.ultima_data_recebimento,
    COALESCE(po.pedidos, '[]'::jsonb) AS pedidos,
    COALESCE(ov.quantidade_por_torre, bom.quantidade_por_torre_automatica) AS quantidade_por_torre,
    COALESCE(bom.quantidade_projetos, 0::bigint) AS quantidade_projetos,
    COALESCE(bom.opcoes_quantidade_por_torre, '[]'::jsonb) AS opcoes_quantidade_por_torre,
    ov.estoque_minimo AS estoque_minimo_override,
    ov.estoque_maximo AS estoque_maximo_override,
    ov.id AS override_id,
    ov.justificativa AS override_justificativa,
    ov.updated_at AS override_updated_at,
    ov.updated_by AS override_updated_by,
    ov.id IS NOT NULL AS tem_override,
    rep.janela_inicio AS sisten_janela_inicio,
    rep.janela_fim AS sisten_janela_fim,
    rep.consumo_total AS sisten_consumo_total,
    rep.consumo_diario AS sisten_consumo_diario,
    rep.lote_p90 AS sisten_lote_p90,
    rep.adi AS sisten_adi,
    rep.cv2 AS sisten_cv2,
    rep.lead_dias AS sisten_lead_dias,
    rep.lead_proprio AS sisten_lead_proprio,
    posicao.estoque_importado_em,
    m.movimentos_importados_em,
    m.ultimo_movimento,
    pd.config_id,
    pd.config_updated_at,
    posicao.fora_zl0024,
    mg.ultimo_movimento_geral
   FROM posicao
     JOIN parametros_dias pd ON pd.centro = posicao.centro
     CROSS JOIN acesso a
     LEFT JOIN movimentos m ON m.material = posicao.material AND m.centro = posicao.centro
     LEFT JOIN series sr ON sr.material = posicao.material AND sr.centro = posicao.centro
     LEFT JOIN rms r ON r.material = posicao.material AND r.centro = posicao.centro
     LEFT JOIN pos po ON po.material = posicao.material AND po.centro = posicao.centro
     LEFT JOIN bom ON bom.material = posicao.material
     LEFT JOIN almox_controle_estoque_override ov ON ov.material = posicao.material AND ov.centro = posicao.centro AND ov.ativo
     LEFT JOIN vw_estoque_reposicao rep ON rep.material = posicao.material
     LEFT JOIN movimento_geral mg ON mg.material = posicao.material AND mg.centro = posicao.centro
  WHERE a.permitido;

notify pgrst, 'reload schema';
