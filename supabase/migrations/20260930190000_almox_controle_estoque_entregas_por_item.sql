-- Dossiê: a RM passa a expor o item do pedido e o recebimento (MB51 101/102)
-- é casado por material + pedido + ITEM, com a lista de entregas (data, documento,
-- quantidade, estorno). Antes o recebimento era por pedido inteiro e se repetia
-- em cada item de um mesmo pedido. Mesmas colunas da versão anterior.

create or replace view public.vw_almox_controle_estoque
with (security_invoker = true)
as
with acesso as (
  select (
    public.has_role('admin')
    or public.has_page_access('almox_controle_estoque')
    or public.has_page_access('almox_controle_estoque_editar')
  ) as permitido
),
centros as (
  select distinct centro
  from public.sap_zl0024_stk
  where centro is not null and material is not null
),
limites_movimento as (
  select centro, min(data_lancamento) as inicio, max(data_lancamento) as fim
  from public.sap_mb51_mov
  where data_lancamento is not null
  group by centro
),
parametros as (
  select
    c.centro,
    coalesce(cfg.janela_inicio, lm.inicio) as janela_inicio,
    coalesce(cfg.janela_fim, lm.fim) as janela_fim,
    coalesce(cfg.lead_time_padrao_dias, 15::numeric) as lead_time_padrao_dias,
    coalesce(cfg.intervalo_compra_dias, 30::numeric) as intervalo_compra_dias,
    cfg.id as config_id,
    cfg.updated_at as config_updated_at
  from centros c
  left join limites_movimento lm on lm.centro = c.centro
  left join public.almox_controle_estoque_config cfg
    on cfg.centro = c.centro and cfg.ativo
),
parametros_dias as (
  select
    p.*,
    case
      when p.janela_inicio is null or p.janela_fim is null or p.janela_fim < p.janela_inicio then null
      else (
        select count(*)::integer
        from generate_series(p.janela_inicio, p.janela_fim, interval '1 day') dia
        where extract(isodow from dia) between 1 and 5
      )
    end as dias_uteis
  from parametros p
),
posicao as (
  select
    s.material,
    s.centro,
    max(s.txt_breve_material) as descricao,
    max(s.grupo_mercadorias) as categoria,
    max(s.aplicacao) as aplicacao,
    max(s.tipo_material) as tipo_material,
    max(s.umb) as umb,
    max(s.class_item) as curva_abc,
    sum(coalesce(s.quantidade, 0)) as saldo_total,
    sum(coalesce(s.quantidade, 0)) filter (
      where coalesce(s.deposito, '') not in (
        '0030','0070','0080','0100','0110','0120','0126','0201','0202','0203','0210'
      )
    ) as saldo_reposicao,
    sum(coalesce(s.valor_total, 0)) as valor_estoque,
    case
      when sum(coalesce(s.quantidade, 0)) <> 0
        then sum(coalesce(s.valor_total, 0)) / nullif(sum(coalesce(s.quantidade, 0)), 0)
      else avg(nullif(s.preco_medio, 0))
    end as preco_medio_sap,
    count(distinct s.deposito) as quantidade_depositos,
    jsonb_agg(
      jsonb_build_object(
        'deposito', s.deposito,
        'saldo', coalesce(s.quantidade, 0),
        'valor', coalesce(s.valor_total, 0),
        'preco_medio_sap', s.preco_medio,
        'inativo', coalesce(s.deposito, '') in (
          '0030','0070','0080','0100','0110','0120','0126','0201','0202','0203','0210'
        )
      ) order by s.deposito
    ) as depositos,
    max(s.imported_at) as estoque_importado_em
  from public.sap_zl0024_stk s
  where s.material is not null
  group by s.material, s.centro
),
movimentos_base as (
  select m.*, p.janela_inicio, p.janela_fim
  from public.sap_mb51_mov m
  join parametros_dias p on p.centro = m.centro
  where m.material is not null
    and m.data_lancamento between p.janela_inicio and p.janela_fim
),
movimentos as (
  select
    material,
    centro,
    coalesce(sum(qtd_um_registro) filter (where tipo_movimento in ('101','102')), 0) as entrada_quantidade,
    coalesce(sum(montante_mi) filter (where tipo_movimento in ('101','102')), 0) as entrada_valor,
    greatest(0, -coalesce(sum(qtd_um_registro) filter (where tipo_movimento in ('221','222')), 0)) as baixa_direta_quantidade,
    greatest(0, -coalesce(sum(montante_mi) filter (where tipo_movimento in ('221','222')), 0)) as baixa_direta_valor,
    -- Produção: saída do depósito de origem nas transferências 311, líquida do
    -- estorno 312 (que devolve a quantidade à origem). A perna positiva do 311
    -- é só o destino da mesma transferência; somar as duas pernas dá sempre zero.
    greatest(0, -(
      coalesce(sum(qtd_um_registro) filter (where tipo_movimento = '311' and qtd_um_registro < 0), 0)
      + coalesce(sum(qtd_um_registro) filter (where tipo_movimento = '312' and qtd_um_registro > 0), 0)
    )) as producao_quantidade,
    max(data_lancamento) as ultimo_movimento,
    max(imported_at) as movimentos_importados_em
  from movimentos_base
  group by material, centro
),
movimentos_mes as (
  select
    mb.material,
    mb.centro,
    date_trunc('month', mb.data_lancamento)::date as mes,
    coalesce(sum(qtd_um_registro) filter (where tipo_movimento in ('101','102')), 0) as entrada,
    greatest(0, -coalesce(sum(qtd_um_registro) filter (where tipo_movimento in ('221','222')), 0))
      + greatest(0, -(
        coalesce(sum(qtd_um_registro) filter (where tipo_movimento = '311' and qtd_um_registro < 0), 0)
        + coalesce(sum(qtd_um_registro) filter (where tipo_movimento = '312' and qtd_um_registro > 0), 0)
      )) as consumo,
    coalesce(sum(montante_mi) filter (where tipo_movimento in ('101','102')), 0) as valor_entrada,
    greatest(0, -coalesce(sum(montante_mi) filter (where tipo_movimento in ('221','222')), 0))
      + greatest(0, -(
        coalesce(sum(qtd_um_registro) filter (where tipo_movimento = '311' and qtd_um_registro < 0), 0)
        + coalesce(sum(qtd_um_registro) filter (where tipo_movimento = '312' and qtd_um_registro > 0), 0)
      )) * coalesce(max(pc.preco_medio_sap), 0) as valor_consumo
  from movimentos_base mb
  left join posicao pc on pc.material = mb.material and pc.centro = mb.centro
  group by mb.material, mb.centro, date_trunc('month', mb.data_lancamento)
),
series as (
  select
    material,
    centro,
    jsonb_agg(
      jsonb_build_object(
        'mes', mes,
        'entrada', entrada,
        'consumo', consumo,
        'valor_entrada', valor_entrada,
        'valor_consumo', valor_consumo
      ) order by mes
    ) as movimentos_mensais
  from movimentos_mes
  group by material, centro
),
rms_validas as (
  select *
  from public.sap_me5a_rc
  where material is not null
    and presente_ultima_carga is true
    and coalesce(eliminado, false) = false
    and coalesce(concluida, '') <> 'X'
),
rms as (
  select
    material,
    centro,
    count(*) as rms_abertas,
    sum(coalesce(qtd_solicitada, 0)) as rm_quantidade,
    jsonb_agg(
      jsonb_build_object(
        'ri', ri,
        'requisicao', requisicao_de_compra,
        'item', item_reqc,
        'data', data_da_solicitacao,
        'requisitante', requisitante,
        'quantidade', qtd_solicitada,
        'pedido', pedido,
        'item_pedido', item_do_pedido,
        'deposito', deposito
      ) order by data_da_solicitacao desc nulls last, requisicao_de_compra, item_reqc
    ) as rms
  from rms_validas
  group by material, centro
),
recebimentos_pedido as (
  select
    material,
    centro,
    pedido,
    -- O item da MB51 é o item do pedido: recebimento e entregas parciais
    -- pertencem à linha do pedido, não ao pedido inteiro.
    ltrim(coalesce(item, ''), '0') as item_norm,
    sum(qtd_um_registro) as quantidade_recebida,
    sum(montante_mi) as valor_recebido,
    max(data_lancamento) as ultima_data_recebimento,
    jsonb_agg(
      jsonb_build_object(
        'data', data_lancamento,
        'quantidade', qtd_um_registro,
        'tipo_movimento', tipo_movimento,
        'documento', doc_material
      ) order by data_lancamento, doc_material
    ) as entregas
  from public.sap_mb51_mov
  where material is not null
    and pedido is not null
    and tipo_movimento in ('101','102')
  group by material, centro, pedido, ltrim(coalesce(item, ''), '0')
),
pos_distintas as (
  select distinct on (material, coalesce(doc_compra, ''), coalesce(item, ''))
    material,
    -- A ZL0132 não traz o centro (cen_cen vem nulo em todas as linhas). Com um
    -- único centro na ZL0024 o pedido pertence a ele; havendo mais de um, fica
    -- sem centro e não é atribuído a nenhum (melhor que contar em todos).
    coalesce(cen_cen, (select min(centro) from centros where (select count(*) from centros) = 1)) as centro,
    dep_dep as deposito,
    ri,
    reqc,
    item,
    doc_compra,
    data_doc,
    dt_remessa,
    data_migo,
    qtd_pedido,
    qtd_fornecida,
    eflag_e,
    crf,
    valor_em_brl,
    fornecedor_nome,
    modificado_em
  from public.sap_zl0132_po
  where material is not null and doc_compra is not null
  order by material, coalesce(doc_compra, ''), coalesce(item, ''), modificado_em desc nulls last
),
pos_enriquecidas as (
  select
    po.*,
    -- Pendente só para pedido vivo: eliminado (eflag_e = 'L') e encerrado pelo
    -- SAP (crf = 'X', inclusive entrega a menor) não esperam mais chegada.
    case
      when coalesce(po.eflag_e, '') = 'L' or upper(coalesce(po.crf, '')) = 'X' then 0
      else greatest(coalesce(po.qtd_pedido, 0) - coalesce(po.qtd_fornecida, 0), 0)
    end as quantidade_pendente,
    rec.quantidade_recebida,
    rec.valor_recebido,
    rec.ultima_data_recebimento,
    rec.entregas
  from pos_distintas po
  left join recebimentos_pedido rec
    on rec.material = po.material
   and rec.centro is not distinct from po.centro
   and rec.pedido = po.doc_compra
   and rec.item_norm = ltrim(coalesce(po.item, ''), '0')
),
pos as (
  select
    material,
    centro,
    count(*) filter (where quantidade_pendente > 0) as pos_abertas,
    sum(quantidade_pendente) as po_quantidade_pendente,
    sum(coalesce(quantidade_recebida, 0)) as quantidade_recebida,
    max(ultima_data_recebimento) as ultima_data_recebimento,
    jsonb_agg(
      jsonb_build_object(
        'ri', ri,
        'requisicao', reqc,
        'pedido', doc_compra,
        'item', item,
        'data', data_doc,
        'remessa_prevista', dt_remessa,
        'data_migo', data_migo,
        'fornecedor', fornecedor_nome,
        'deposito', deposito,
        'quantidade_pedida', qtd_pedido,
        'quantidade_fornecida', qtd_fornecida,
        'quantidade_pendente', quantidade_pendente,
        'valor_brl', valor_em_brl,
        'quantidade_recebida_mb51', quantidade_recebida,
        'ultima_data_recebimento', ultima_data_recebimento,
        'entregas', coalesce(entregas, '[]'::jsonb)
      ) order by data_doc desc nulls last, doc_compra, item
    ) as pedidos
  from pos_enriquecidas
  group by material, centro
),
bom_opcoes_distintas as (
  select distinct cod_sap as material, projeto, qtd_por_torre
  from public.vw_proj_bom_arvore
  where cod_sap is not null and btrim(cod_sap) <> '' and qtd_por_torre is not null
),
bom as (
  select
    material,
    case
      when count(distinct projeto) = 1 and count(distinct qtd_por_torre) = 1 then max(qtd_por_torre)
      else null
    end as quantidade_por_torre_automatica,
    count(distinct projeto) as quantidade_projetos,
    jsonb_agg(
      jsonb_build_object('projeto', projeto, 'quantidade_por_torre', qtd_por_torre)
      order by projeto, qtd_por_torre
    ) as opcoes_quantidade_por_torre
  from bom_opcoes_distintas
  group by material
)
select
  posicao.material,
  posicao.centro,
  posicao.descricao,
  posicao.categoria,
  posicao.aplicacao,
  posicao.tipo_material,
  coalesce(ov.tipo_gestao, 'NAO_DEFINIDO') as tipo_gestao,
  posicao.umb,
  posicao.curva_abc,
  posicao.saldo_total,
  coalesce(posicao.saldo_reposicao, 0) as saldo_reposicao,
  posicao.valor_estoque,
  posicao.preco_medio_sap,
  posicao.quantidade_depositos,
  posicao.depositos,
  pd.janela_inicio,
  pd.janela_fim,
  pd.dias_uteis,
  coalesce(ov.lead_time_dias, pd.lead_time_padrao_dias) as lead_time_dias,
  coalesce(ov.intervalo_compra_dias, pd.intervalo_compra_dias) as intervalo_compra_dias,
  coalesce(m.entrada_quantidade, 0) as entrada_quantidade,
  coalesce(m.entrada_valor, 0) as entrada_valor,
  coalesce(m.baixa_direta_quantidade, 0) as baixa_direta_quantidade,
  coalesce(m.baixa_direta_valor, 0) as baixa_direta_valor,
  coalesce(m.producao_quantidade, 0) as producao_quantidade,
  coalesce(m.producao_quantidade, 0) * coalesce(posicao.preco_medio_sap, 0) as producao_valor,
  coalesce(m.baixa_direta_quantidade, 0) + coalesce(m.producao_quantidade, 0) as consumo_total,
  coalesce(m.baixa_direta_valor, 0) + coalesce(m.producao_quantidade, 0) * coalesce(posicao.preco_medio_sap, 0) as consumo_valor,
  coalesce(sr.movimentos_mensais, '[]'::jsonb) as movimentos_mensais,
  coalesce(r.rms_abertas, 0) as rms_abertas,
  coalesce(r.rm_quantidade, 0) as rm_quantidade,
  coalesce(r.rms, '[]'::jsonb) as rms,
  coalesce(po.pos_abertas, 0) as pos_abertas,
  coalesce(po.po_quantidade_pendente, 0) as po_quantidade_pendente,
  coalesce(po.quantidade_recebida, 0) as quantidade_recebida,
  po.ultima_data_recebimento,
  coalesce(po.pedidos, '[]'::jsonb) as pedidos,
  coalesce(ov.quantidade_por_torre, bom.quantidade_por_torre_automatica) as quantidade_por_torre,
  coalesce(bom.quantidade_projetos, 0) as quantidade_projetos,
  coalesce(bom.opcoes_quantidade_por_torre, '[]'::jsonb) as opcoes_quantidade_por_torre,
  ov.estoque_minimo as estoque_minimo_override,
  ov.estoque_maximo as estoque_maximo_override,
  ov.id as override_id,
  ov.justificativa as override_justificativa,
  ov.updated_at as override_updated_at,
  ov.updated_by as override_updated_by,
  (ov.id is not null) as tem_override,
  rep.janela_inicio as sisten_janela_inicio,
  rep.janela_fim as sisten_janela_fim,
  rep.consumo_total as sisten_consumo_total,
  rep.consumo_diario as sisten_consumo_diario,
  rep.lote_p90 as sisten_lote_p90,
  rep.adi as sisten_adi,
  rep.cv2 as sisten_cv2,
  rep.lead_dias as sisten_lead_dias,
  rep.lead_proprio as sisten_lead_proprio,
  posicao.estoque_importado_em,
  m.movimentos_importados_em,
  m.ultimo_movimento,
  pd.config_id,
  pd.config_updated_at
from posicao
join parametros_dias pd on pd.centro = posicao.centro
cross join acesso a
left join movimentos m on m.material = posicao.material and m.centro = posicao.centro
left join series sr on sr.material = posicao.material and sr.centro = posicao.centro
left join rms r on r.material = posicao.material and r.centro = posicao.centro
left join pos po on po.material = posicao.material and po.centro = posicao.centro
left join bom on bom.material = posicao.material
left join public.almox_controle_estoque_override ov
  on ov.material = posicao.material and ov.centro = posicao.centro and ov.ativo
left join public.vw_estoque_reposicao rep on rep.material = posicao.material
where a.permitido;

comment on view public.vw_almox_controle_estoque is
  'Uma linha por material/centro com posição SAP, movimentos, RMs, POs, recebimentos, BOM e parâmetros auditados.';

revoke all on public.vw_almox_controle_estoque from anon;
grant select on public.vw_almox_controle_estoque to authenticated;
