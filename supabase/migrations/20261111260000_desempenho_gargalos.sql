-- Gargalos medidos pelo Monitor de Desempenho em 11/11/2026
-- ===========================================================================
-- Achados (pg_stat_statements, 24 h):
--   * vw_sap_requisicoes_enriquecidas — 71% do tempo do banco: 967 páginas,
--     média 7,1 s, máx. 152 s, 20 GB de disco temporário. Cada página de 1.000
--     linhas recalculava a view inteira (4 junções, agregação de 66 mil
--     pedidos, EXISTS sobre vw_sap_pedidos_enriquecidos), e cada importação
--     SAP fazia todos os aparelhos logados rebaixarem as 4 páginas juntos.
--     Medido sem carga: 1,2 s por página — 14 ms de junções e ~1,17 s de
--     core_dias_uteis (security definer, 2 chamadas por linha, consulta
--     core_feriados em cada uma).
--   * buscar_materiais_catalogo — média 9,7 s, 7 GB de temp/dia.
--   * buscar_materiais — fallback por semelhança varria o catálogo (3–5 s).
--   * obter_maiores_codigos_catalogo — max(created_at) sem índice (1,1 s).
--   * sap_requisicoes_observacoes — tabela inteira baixada a cada 15 min por
--     aparelho (7,7 mil chamadas/dia).
--
-- O que muda:
--   1) core_calendario_util: dias úteis acumulados por data (2015–2040),
--      refeito por gatilho quando core_feriados muda. A view junta o
--      calendário em vez de chamar core_dias_uteis por linha (a função só
--      entra para datas fora do calendário). Mesma regra: 401 pares de datas
--      conferidos contra core_dias_uteis.
--   2) private.mv_sap_requisicoes_po: a parte SAP da view (pedido ZL0132,
--      fallback ME2L, totais por RI, CRF). Só muda com importação — é
--      recalculada em refresh_historico_pedidos (ZL0132/ME2L), pela RPC
--      refresh_sap_requisicoes_po (ME5A) e pelo pg_cron a cada 15 min.
--      A view pública continua lendo sap_me5a_rc ao vivo, então o que o
--      comprador grava (status, observação, previsão) aparece na hora.
--      Mesmas colunas, mesma ordem: 3.621 linhas, 0 diferenças.
--      Página: 1,2 s → 75 ms. refresh_material_sinais: 17 s → 3,4 s (lê a
--      view duas vezes, via vw_demandas).
--   3) buscar_materiais_catalogo reescrita (resultados idênticos em 12
--      casos): sem termo 5–6 s → 0,3 s; "AB" 13 s → 1 s; "PARAFUSO" 1,7 s
--      → 0,15 s. Índice parcial dos códigos ativos (contagem e ordem por
--      código saem dele) e índice em created_at (obter_maiores_codigos:
--      1,9 s → 56 ms).
--   4) buscar_materiais: fallback por semelhança em busca_desc (já tem
--      índice trigram) em vez de description: 3–5 s → 10–320 ms, mesmos
--      primeiros resultados.
--   5) sap_requisicoes_observacoes.recebido_em (hora do servidor) para o
--      aparelho baixar só o que chegou desde a última vez. created_at não
--      serve: vem do aparelho e, na fila offline, chega com hora antiga.
--   6) statement_timeout de authenticated 5 min → 2 min. Tudo que passou de
--      60 s no dia era um dos gargalos acima; uma consulta presa não fica
--      mais 5 min segurando conexão enquanto as outras se empilham.

set statement_timeout = '600s';

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1) Calendário de dias úteis
-- ---------------------------------------------------------------------------
create table if not exists public.core_calendario_util (
  data      date primary key,
  -- dias úteis (seg–sex, fora de core_feriados) de 2015-01-01 até `data`,
  -- inclusive. core_dias_uteis(de, ate) = acumulado(ate) − acumulado(de).
  acumulado integer not null
);
alter table public.core_calendario_util enable row level security;
drop policy if exists core_calendario_util_select on public.core_calendario_util;
create policy core_calendario_util_select on public.core_calendario_util
  for select to authenticated using (true);
revoke all on public.core_calendario_util from anon;
grant select on public.core_calendario_util to authenticated;

create or replace function public.core_calendario_util_recalcular()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from public.core_calendario_util;
  insert into public.core_calendario_util (data, acumulado)
  select d::date,
         (sum(case when extract(isodow from d) < 6
                    and not exists (select 1 from public.core_feriados f where f.data = d::date)
                   then 1 else 0 end) over (order by d))::int
  from generate_series(date '2015-01-01', date '2040-12-31', interval '1 day') d;
end
$fn$;
revoke all on function public.core_calendario_util_recalcular() from public, anon, authenticated;

create or replace function public.tg_core_feriados_calendario()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.core_calendario_util_recalcular();
  return null;
end
$fn$;
revoke all on function public.tg_core_feriados_calendario() from public, anon, authenticated;

drop trigger if exists core_feriados_calendario on public.core_feriados;
create trigger core_feriados_calendario
  after insert or update or delete or truncate on public.core_feriados
  for each statement execute function public.tg_core_feriados_calendario();

select public.core_calendario_util_recalcular();

-- ---------------------------------------------------------------------------
-- 2) Parte SAP de vw_sap_requisicoes_enriquecidas materializada
-- ---------------------------------------------------------------------------
-- Uma linha por linha da view (RI × pedido). `seq` só existe para o índice
-- único que o REFRESH CONCURRENTLY exige; ri_po já é único hoje, mas um PO
-- com doc_compra vazio repetiria 'SEM-PO'.
create materialized view if not exists private.mv_sap_requisicoes_po as
WITH me2l_por_reqc AS (
         SELECT DISTINCT ON (sap_me2l_pedido.requisicao_compra, (COALESCE(sap_me2l_pedido.material, ''::text))) sap_me2l_pedido.requisicao_compra,
            sap_me2l_pedido.material,
            sap_me2l_pedido.documento_compras,
            sap_me2l_pedido.contrato_basico,
            sap_me2l_pedido.data_documento,
            sap_me2l_pedido.valor_liquido_pedido,
            sap_me2l_pedido.qtd_pedido,
            sap_me2l_pedido.um_pedido,
            sap_me2l_pedido.fornecedor
           FROM sap_me2l_pedido
          WHERE sap_me2l_pedido.requisicao_compra IS NOT NULL AND sap_me2l_pedido.requisicao_compra <> ''::text AND COALESCE(upper(btrim(sap_me2l_pedido.codigo_eliminacao)), ''::text) <> 'L'::text
          ORDER BY sap_me2l_pedido.requisicao_compra, (COALESCE(sap_me2l_pedido.material, ''::text)), sap_me2l_pedido.imported_at DESC
        ), j AS (
         SELECT r.ri,
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
             LEFT JOIN me2l_por_reqc m2 ON m2.requisicao_compra = r.requisicao_de_compra AND COALESCE(m2.material, ''::text) = COALESCE(r.material, ''::text) AND p.doc_compra IS NULL AND NOT (EXISTS ( SELECT 1
                   FROM mv_pedidos_por_ri pe
                  WHERE pe.ri = r.ri AND pe.doc_compra = m2.documento_compras AND COALESCE(upper(btrim(pe.eflag_e)), ''::text) = 'L'::text)) AND NOT ((EXISTS ( SELECT 1
                   FROM mv_pedidos_por_ri p0
                  WHERE p0.ri = r.ri)) AND (EXISTS ( SELECT 1
                   FROM mv_pedidos_por_ri pe2
                     JOIN sap_me5a_rc r2 ON r2.ri = pe2.ri
                  WHERE pe2.doc_compra = m2.documento_compras AND r2.requisicao_de_compra = r.requisicao_de_compra AND r2.ri <> r.ri AND COALESCE(upper(btrim(pe2.eflag_e)), ''::text) <> 'L'::text)))
        )
 SELECT j.*,
    (j.ri || '-'::text) || COALESCE(NULLIF(j.doc_compra, ''::text), NULLIF(j.m2_documento_compras, ''::text), 'SEM-PO'::text) AS ri_po,
    row_number() OVER (PARTITION BY j.ri ORDER BY j.doc_compra, j.p_item, j.m2_documento_compras) AS seq,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM vw_pedido_remessa_final_por_ri k
              WHERE k.ri = j.ri AND k.doc_compra = j.doc_compra)) THEN 'X'::text
            ELSE NULL::text
        END AS crf_po
   FROM j;

create unique index if not exists mv_sap_requisicoes_po_pk on private.mv_sap_requisicoes_po (ri, seq);
-- A view é do dono (sem security_invoker), como sempre foi: quem consulta
-- não precisa de acesso à MV.
revoke all on private.mv_sap_requisicoes_po from public, anon, authenticated;

-- Mesmas colunas, mesma ordem e mesmos tipos (as 3 views dependentes e
-- mv_material_sinais seguem intactas).
create or replace view public.vw_sap_requisicoes_enriquecidas as
 WITH j AS (

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
            x.doc_compra,
            x.p_item,
            x.fornecedor_codigo,
            x.fornecedor_nome,
            x.data_doc,
            x.p_data_migo,
            x.dt_remessa,
            x.p_criado_por_pedido,
            x.status_entrega,
            x.dias_atrasado,
            x.qtd_pedido,
            x.qtd_fornecida,
            x.por,
            x.unidade_medida_pedido,
            x.preco_liquido_unit,
            x.valor_em_brl,
            x.valor_liquido,
            x.contrato,
            x.item_contrato,
            x.tipo_doc_compra,
            x.eflag_e,
            COALESCE(x.total_pos, 0::bigint) AS total_pos,
            x.qtd_pedida_total,
            x.qtd_fornecida_total,
            x.m2_documento_compras,
            x.m2_contrato_basico,
            x.m2_data_documento,
            x.m2_valor_liquido_pedido,
            x.m2_qtd_pedido,
            x.m2_um_pedido,
            x.m2_fornecedor,
            x.ri_po AS x_ri_po,
            x.crf_po AS x_crf_po,
            cs.acumulado AS cal_sol,
            COALESCE(x.p_data_migo, hoje.d) AS cal_ate_data,
            ca.acumulado AS cal_ate,
            hoje.d AS cal_hoje_data,
            ch.acumulado AS cal_hoje
           FROM sap_me5a_rc r
             CROSS JOIN ( SELECT (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d) hoje
             LEFT JOIN private.mv_sap_requisicoes_po x ON x.ri = r.ri
             LEFT JOIN core_calendario_util cs ON cs.data = r.data_da_solicitacao
             LEFT JOIN core_calendario_util ca ON ca.data = COALESCE(x.p_data_migo, hoje.d)
             LEFT JOIN core_calendario_util ch ON ch.data = hoje.d
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
            j.x_ri_po,
            j.x_crf_po,
            j.cal_sol,
            j.cal_ate_data,
            j.cal_ate,
            j.cal_hoje_data,
            j.cal_hoje,
                CASE
                    WHEN j.tipo_de_documento = ANY (ARRAY['ZR02'::text, 'ZR06'::text, 'ZR16'::text]) THEN 6
                    WHEN j.tipo_de_documento = ANY (ARRAY['ZR03'::text, 'ZR07'::text, 'ZR17'::text]) THEN 2
                    WHEN j.tipo_de_documento = ANY (ARRAY['ZR01'::text, 'ZR05'::text, 'ZR11'::text]) THEN 15
                    ELSE 30
                END AS meta_lt,
            GREATEST(0, 
                CASE
                    WHEN j.data_da_solicitacao IS NULL OR j.cal_ate_data <= j.data_da_solicitacao THEN 0
                    ELSE COALESCE(j.cal_ate - j.cal_sol, core_dias_uteis(j.data_da_solicitacao, j.cal_ate_data))
                END -
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
    COALESCE(NULLIF(doc_compra, ''::text), m2_documento_compras) AS documento_compra,
    p_item AS item_pedido,
    fornecedor_codigo AS fornecedor_code,
    COALESCE(NULLIF(fornecedor_nome, ''::text), m2_fornecedor) AS fornecedor_name,
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
            WHEN COALESCE(NULLIF(doc_compra, ''::text), m2_documento_compras) IS NULL THEN 'Sem PO'::text
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
                WHEN COALESCE(NULLIF(doc_compra, ''::text), m2_documento_compras) IS NULL THEN 'Sem PO'::text
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
    
        CASE
            WHEN data_da_solicitacao IS NULL OR cal_hoje_data <= data_da_solicitacao THEN 0
            ELSE COALESCE(cal_hoje - cal_sol, core_dias_uteis(data_da_solicitacao, cal_hoje_data))
        END AS dias_em_aberto,
    item_status,
    item_status_updated_at,
    item_status_updated_by,
    p_criado_por_pedido AS criado_por_pedido,
    data_entrega_confirmada,
    COALESCE(x_ri_po, ri || '-SEM-PO'::text) AS ri_po,
    COALESCE(qtd_pedido, m2_qtd_pedido) AS qtd_po,
    COALESCE(unidade_medida_pedido, m2_um_pedido) AS unidade_po,
    preco_liquido_unit AS preco_unit_po,
    por AS por_po,
    COALESCE(valor_em_brl, valor_liquido, m2_valor_liquido_pedido) AS valor_po,
    eflag_e AS eflag_po,
        CASE
            WHEN total_pos = 0 AND m2_documento_compras IS NOT NULL THEN 1::bigint
            ELSE total_pos
        END::integer AS total_pos,
    qtd_fornecida AS qtd_fornecida_po,
    qtd_pedida_total,
    qtd_fornecida_total,
    COALESCE(NULLIF(contrato, ''::text), m2_contrato_basico) AS contrato_po,
    item_contrato AS item_contrato_po,
    tipo_doc_compra AS tipo_doc_po,
        CASE
            WHEN NULLIF(doc_compra, ''::text) IS NOT NULL THEN 'zl0132'::text
            WHEN m2_documento_compras IS NOT NULL THEN 'me2l'::text
            ELSE NULL::text
        END AS origem_po,
    x_crf_po AS crf_po
   FROM c;

-- Recalcula a parte SAP. Chamado no fim de toda importação que mexe em
-- ME5A/ZL0132/ME2L, ANTES de reler a view e de subir a versão do dataset —
-- senão os aparelhos baixariam a versão nova com os pedidos antigos.
-- Um recálculo por vez: o segundo espera o primeiro (não pula, porque pular
-- deixaria de fora o que a importação acabou de gravar).
create or replace function public.refresh_sap_requisicoes_po()
returns void
language plpgsql
security definer
set search_path = public, private
set work_mem = '64MB'
as $fn$
begin
  perform pg_advisory_xact_lock(hashtext('refresh_sap_requisicoes_po'));
  refresh materialized view concurrently private.mv_sap_requisicoes_po;
end
$fn$;
revoke all on function public.refresh_sap_requisicoes_po() from public, anon;
grant execute on function public.refresh_sap_requisicoes_po() to authenticated, service_role;

-- ZL0132 e ME2L passam por aqui: mv_pedidos_por_ri muda, a parte SAP das
-- requisições vem logo atrás.
create or replace function public.refresh_historico_pedidos()
returns void
language plpgsql
security definer
set search_path to 'public'
set work_mem to '32MB'
as $fn$
begin
  refresh materialized view concurrently public.mv_historico_pedidos;
  refresh materialized view concurrently public.mv_pedido_atual_por_ri;
  refresh materialized view concurrently public.mv_pedidos_por_ri;
  perform public.refresh_sap_requisicoes_po();
end
$fn$;

-- Subir a versão de 'requisicoes' manda todos os aparelhos rebaixarem a
-- view: recalcula a parte SAP antes, para ninguém baixar versão nova com
-- pedido velho — vale para qualquer carga, inclusive de cliente antigo que
-- ainda não chama refresh_sap_requisicoes_po. Sem mudança, o CONCURRENTLY
-- custa ~0,5 s.
create or replace function public.bump_dataset_version(p_dataset text, p_rows bigint default null::bigint, p_user text default null::text)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_new bigint;
begin
  if p_dataset = 'requisicoes' then
    perform public.refresh_sap_requisicoes_po();
  end if;

  insert into public.dataset_versions (dataset, version, row_count, updated_at, updated_by)
  values (p_dataset, 1, p_rows, now(), p_user)
  on conflict (dataset) do update
    set version    = dataset_versions.version + 1,
        row_count  = coalesce(excluded.row_count, dataset_versions.row_count),
        updated_at = now(),
        updated_by = excluded.updated_by
  returning version into v_new;

  return v_new;
end;
$fn$;

-- Rede de segurança: carga que não passe pelos caminhos acima (ou que falhe
-- no meio) fica no máximo 15 min fora da MV. ~0,5 s por rodada.
select cron.unschedule(jobid) from cron.job where jobname = 'sisten-requisicoes-po';
select cron.schedule('sisten-requisicoes-po', '*/15 9-23 * * 1-6',
                     'select public.refresh_sap_requisicoes_po()');

-- ---------------------------------------------------------------------------
-- 3) Catálogo: índices + buscar_materiais_catalogo
-- ---------------------------------------------------------------------------
-- Os códigos que as buscas mostram (ativos, fora das faixas 9/letra): a
-- contagem e a página sem termo saem só do índice.
create index if not exists materials_ativos_codigo
  on public.sap_zl0169_162_catalogo (material_code)
  where is_active and material_code !~ '^[9a-zA-Z]';
-- "Último cadastro" do Cadastro de Itens (obter_maiores_codigos_catalogo).
create index if not exists materials_created_at
  on public.sap_zl0169_162_catalogo (created_at);

-- Busca do Cadastro de Itens.
create or replace function public.buscar_materiais_catalogo(termos text[] default null::text[], categoria text default null::text, empresa text default null::text, apenas_codigos text[] default null::text[], limite integer default 50, deslocamento integer default 0, incluir_tecnico boolean default false, unidade text default null::text, tmat text default null::text, ncm text default null::text, status_filtro text default null::text)
 returns table(id text, material_code text, description text, technical_text text, category text, company text, unit text, tipo_material text, codigo_controle text, status_geral text, status_centro text, status_sap text, total_count bigint)
 language plpgsql
 stable
 set search_path to 'public'
 set work_mem to '32MB'
as $function$
-- Busca do Cadastro de Itens (chips = E). Reescrita em 11/11/2026: a versão
-- anterior materializava TODAS as linhas casadas com todas as colunas (texto
-- técnico incluso) só para contar e ordenar — 6 s sem termo, 19 s com termo
-- curto, 7 GB de disco temporário por dia. Agora:
--   * conta e ordena só (código, casa na descrição, posição) e busca as
--     colunas largas apenas das linhas da página;
--   * sem termo, a ordem é o próprio código: lê pelo índice e para no limite;
--   * SQL dinâmico para o plano ver os filtros de verdade (coluna da busca,
--     padrões LIKE) e usar o índice trigram em vez de varrer o catálogo.
declare
  teto        int := least(coalesce(limite, 50), 200);
  salto       int := greatest(coalesce(deslocamento, 0), 0);
  toks        text[];
  pats        text[];
  col         text := case when coalesce(incluir_tecnico, false) then 'busca_texto' else 'busca_desc' end;
  norm_ncm    text;
  norm_status text := upper(trim(coalesce(status_filtro, 'Todos')));
  filtros     text;
  colunas     text := 'm.id, m.material_code, m.description, m.technical_text, m.category, m.company, m.unit,
                       m.tipo_material, m.codigo_controle, m.status_geral, m.status_centro,
                       case when coalesce(trim(m.status_geral), '''') = ''Z1'' or coalesce(trim(m.status_centro), '''') = ''Z1''
                            then ''Obsoleto'' else ''Ativo'' end';
  total       bigint;
begin
  select array_agg(regexp_replace(trim(f_unaccent(upper(t))), '\s+', ' ', 'g') order by n)
    into toks
  from unnest(coalesce(termos, '{}')) with ordinality as u(t, n)
  where trim(t) <> '';

  if toks is not null then
    select array_agg('%' || escapar_like(t) || '%' order by n) into pats
    from unnest(toks) with ordinality as u(t, n);
  end if;

  norm_ncm := regexp_replace(trim(coalesce(ncm, '')), '[^0-9a-zA-Z]', '', 'g');

  -- $1 categoria, $2 empresa, $3 unidade, $4 tmat, $5 ncm, $6 status,
  -- $7 apenas_codigos, $8 padrões (todos), $9 primeiro padrão.
  -- Cada termo casa no código OU na descrição (no texto técnico, se marcado);
  -- chr(1) separa as duas partes para um termo não casar "atravessando" as duas.
  filtros := format(
    '     m.is_active
      and m.material_code !~ ''^[9a-zA-Z]''
      and ($1 is null or $1 = ''Todas'' or m.category = $1)
      and ($2 is null or $2 = ''Todas'' or m.company = $2 or m.company = ''AMBAS'')
      and ($3 is null or $3 = ''Todas'' or m.unit = $3)
      and ($4 is null or $4 = ''Todos'' or m.tipo_material = $4)
      and ($5 = '''' or regexp_replace(coalesce(m.codigo_controle, ''''), ''[^0-9a-zA-Z]'', '''', ''g'') like $5 || ''%%'')
      and (
        $6 in (''TODOS'', '''')
        or ($6 = ''OBSOLETO'' and (coalesce(trim(m.status_geral), '''') = ''Z1'' or coalesce(trim(m.status_centro), '''') = ''Z1''))
        or ($6 = ''ATIVO'' and coalesce(trim(m.status_geral), '''') <> ''Z1'' and coalesce(trim(m.status_centro), '''') <> ''Z1'')
      )
      and ($7 is null or m.material_code = any($7))
      and ($8 is null or (
            (m.material_code ilike $9 or m.%1$I like $9)
            and (upper(m.material_code) || chr(1) || m.%1$I) like all ($8)
          ))', col);

  if toks is null then
    execute 'select count(*) from materials m where ' || filtros
      into total
      using categoria, empresa, unidade, tmat, norm_ncm, norm_status, apenas_codigos, pats, null::text;

    return query execute
      'select ' || colunas || ', $10::bigint from materials m where ' || filtros ||
      ' order by m.material_code limit $11 offset $12'
      using categoria, empresa, unidade, tmat, norm_ncm, norm_status, apenas_codigos, pats, null::text,
            total, teto, salto;
    return;
  end if;

  return query execute
    'with f as (
       select m.material_code as cod,
              m.busca_desc like all ($8) as casa,
              nullif(strpos(m.busca_desc, $10), 0) as pos
         from materials m
        where ' || filtros || '
     ), pg as (
       select f.cod, f.casa, f.pos, count(*) over () as total
         from f
        order by f.casa desc, f.pos asc nulls last, f.cod
        limit $11 offset $12
     )
     select ' || colunas || ', pg.total
       from pg join materials m on m.material_code = pg.cod
      order by pg.casa desc, pg.pos asc nulls last, pg.cod'
    using categoria, empresa, unidade, tmat, norm_ncm, norm_status, apenas_codigos, pats, pats[1],
          toks[1], teto, salto;
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 4) buscar_materiais: semelhança em busca_desc (índice trigram)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_materiais(termo text, area_usuario text DEFAULT NULL::text, limite integer DEFAULT 20, deslocamento integer DEFAULT 0, incluir_tecnico boolean DEFAULT false)
 RETURNS TABLE(material_code text, description text, technical_text text, unit text, status_geral text, qtd_estoque numeric, depositos text[], rms_12m integer, ultima_rm date, rms_sem_pedido integer, rm_aberta text, qtd_rm_aberta numeric, pedido_aberto text, qtd_pedido_aberto numeric, chega_em date, pedido_pela_area boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET work_mem TO '32MB'
AS $function$
declare
  norm     text;
  toks     text[];
  maior    text;
  eh_cod   boolean;
  teto     int := least(coalesce(limite, 20), 50);
  salto    int := greatest(coalesce(deslocamento, 0), 0);
  tecnico  boolean := coalesce(incluir_tecnico, false);
begin
  norm := regexp_replace(trim(f_unaccent(upper(coalesce(termo, '')))), '\s+', ' ', 'g');
  if norm = '' then return; end if;

  eh_cod := norm ~ '^\d+$';
  toks   := array_remove(string_to_array(norm, ' '), '');

  select t into maior from unnest(toks) t order by length(t) desc limit 1;

  return query
  select m.material_code, m.description, m.technical_text, m.unit, m.status_geral,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.qtd_rm_aberta,
         s.pedido_aberto, s.qtd_pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active
    and m.material_code !~ '^[9a-zA-Z]'
    and case
          when eh_cod then m.material_code like norm || '%'
          when tecnico then
               m.busca_texto like '%' || escapar_like(maior) || '%'
               and m.busca_texto like all (
                 select '%' || escapar_like(t) || '%' from unnest(toks) t
               )
          else m.busca_desc like '%' || escapar_like(maior) || '%'
               and m.busca_desc like all (
                 select '%' || escapar_like(t) || '%' from unnest(toks) t
               )
        end
  order by
    (coalesce(s.qtd_estoque, 0) > 0) desc,
    coalesce(area_usuario is not null and s.areas @> array[area_usuario], false) desc,
    nullif(strpos(m.busca_desc, maior), 0) asc nulls last,
    coalesce(s.rms_12m, 0) desc,
    case when tecnico
         then greatest(similarity(m.description, norm), similarity(m.technical_text, norm))
         else similarity(m.description, norm)
    end desc,
    m.material_code
  limit teto offset salto;

  if found or salto > 0 then return; end if;

  return query
  select m.material_code, m.description, m.technical_text, m.unit, m.status_geral,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.qtd_rm_aberta,
         s.pedido_aberto, s.qtd_pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active
    and m.material_code !~ '^[9a-zA-Z]'
    and m.busca_desc % norm
  order by similarity(m.busca_desc, norm) desc, m.material_code
  limit teto;
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 5) Histórico de observações: hora do servidor para o download por delta
-- ---------------------------------------------------------------------------
alter table public.sap_requisicoes_observacoes
  add column if not exists recebido_em timestamptz not null default now();
create index if not exists sap_requisicoes_observacoes_recebido_em
  on public.sap_requisicoes_observacoes (recebido_em);

-- ---------------------------------------------------------------------------
-- 6) Teto de tempo por consulta do app
-- ---------------------------------------------------------------------------
alter role authenticated set statement_timeout = '120s';
notify pgrst, 'reload config';

analyze public.sap_zl0169_162_catalogo;
analyze private.mv_sap_requisicoes_po;
analyze public.core_calendario_util;
