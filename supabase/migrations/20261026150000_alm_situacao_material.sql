-- =====================================================================
-- Almoxarifado — situação de um material (mini-relatório)
-- =====================================================================
-- O Ctrl+K e a leitura do QR da etiqueta mostram, para um material: saldo
-- por depósito na ZL0024, RM aberta (ME5A) e data, pedido (ZL0132) e data,
-- previsão de entrega, MIGO e as entradas da MB51.
--
-- A vw_almox_controle_estoque (Dossiê) tem tudo isso, mas monta os CTEs de
-- todos os materiais antes de filtrar: ~8 s para um item. Esta função lê só o
-- material pedido, pelos índices, com as MESMAS regras da view:
--   * RM aberta  = ME5A presente na última carga, não eliminada, concluida <> 'X';
--   * pedido     = ZL0132 distinto por (doc_compra, item do PEDIDO = itm_liberacao,
--                  senão item), a linha mais recente (modificado_em);
--   * pendente   = 0 se eflag_e = 'L' ou crf = 'X'; senão pedido − fornecido;
--   * recebido   = MB51 101/102 do pedido + item do pedido.
-- RM com pedido já sem pendência = "já atendida" (como no Dossiê).
--
-- Sem valores em R$: é informação operacional (quantidade e data), a mesma que
-- Catálogo SAP e Rastreio já mostram a qualquer usuário. Por isso abre para
-- qualquer usuário com login.

create index if not exists idx_sap_me5a_rc_material on public.sap_me5a_rc (material);

create or replace function public.alm_situacao_material(p_material text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mat text := nullif(ltrim(upper(trim(coalesce(p_material, ''))), '0'), '');
  v_centro text;
  v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if v_mat is null then
    return null;
  end if;

  -- Centro único da ZL0024 (a ZL0132 vem com cen_cen nulo — mesma regra da view).
  select case when count(distinct centro) = 1 then min(centro) end into v_centro
    from public.sap_zl0024_stk where centro is not null;

  with
  estoque as (
    select coalesce(deposito, '') as deposito,
           sum(quantidade) as saldo,
           max(posicao_estoque) filter (where nullif(trim(posicao_estoque), '') is not null) as posicao,
           max(txt_breve_material) as descricao,
           max(umb) as umb
      from public.sap_zl0024_stk
     where material = v_mat
     group by 1
  ),
  cat as (
    select descricao, umb, posicao_estoque, estoque_minimo
      from public.alm_catalogo_itens
     where codigo_sap = v_mat and ativo
     limit 1
  ),
  sap_cat as (
    select description, unit from public.sap_zl0169_162_catalogo where material_code = v_mat limit 1
  ),
  receb as (
    select pedido, ltrim(coalesce(item, ''), '0') as item_norm,
           sum(qtd_um_registro) as quantidade,
           max(data_lancamento) as ultima_data
      from public.sap_mb51_mov
     where material = v_mat and pedido is not null and tipo_movimento in ('101', '102')
     group by 1, 2
  ),
  pos as (
    select distinct on (doc_compra, coalesce(nullif(trim(itm_liberacao), ''), item, ''))
           doc_compra as pedido,
           coalesce(nullif(trim(itm_liberacao), ''), item) as item,
           ri, reqc, data_doc, dt_remessa, data_migo, fornecedor_nome, dep_dep as deposito,
           qtd_pedido, qtd_fornecida,
           case when coalesce(eflag_e, '') = 'L' or upper(coalesce(crf, '')) = 'X' then 0
                else greatest(coalesce(qtd_pedido, 0) - coalesce(qtd_fornecida, 0), 0) end as pendente
      from public.sap_zl0132_po
     where material = v_mat and doc_compra is not null
     order by doc_compra, coalesce(nullif(trim(itm_liberacao), ''), item, ''), modificado_em desc nulls last
  ),
  pos_receb as (
    select p.*, r.quantidade as recebido_mb51, r.ultima_data as ultima_entrada
      from pos p
      left join receb r on r.pedido = p.pedido and r.item_norm = ltrim(coalesce(p.item, ''), '0')
  ),
  pos_lista as (
    -- Todos os abertos e os 3 últimos já fechados.
    select * from (
      select pr.*, row_number() over (partition by (pr.pendente > 0) order by pr.data_doc desc nulls last, pr.pedido desc) as n
        from pos_receb pr
    ) x
     where pendente > 0 or n <= 3
  ),
  rms as (
    select rc.ri, rc.requisicao_de_compra, rc.item_reqc, rc.data_da_solicitacao, rc.requisitante,
           rc.qtd_solicitada, rc.deposito, rc.pedido, rc.item_do_pedido,
           coalesce(rc.data_entrega_confirmada, rc.data_entrega_prevista) as entrega_prevista,
           rc.data_entrega_confirmada is not null as entrega_confirmada,
           case
             when nullif(trim(rc.pedido), '') is null then 'sem_pedido'
             when exists (select 1 from pos p where p.pedido = rc.pedido and p.pendente > 0) then 'em_pedido'
             when exists (select 1 from pos p where p.pedido = rc.pedido) then 'atendida'
             else 'em_pedido'
           end as situacao
      from public.sap_me5a_rc rc
     where rc.material = v_mat
       and rc.presente_ultima_carga is true
       and not coalesce(rc.eliminado, false)
       and coalesce(rc.concluida, '') <> 'X'
  ),
  ultimo_mov as (
    select data_lancamento, tipo_movimento, txt_tipo_movimento, qtd_um_registro, deposito, pedido
      from public.sap_mb51_mov
     where material = v_mat
     order by data_lancamento desc nulls last, hora_registro desc nulls last
     limit 1
  )
  select jsonb_build_object(
    'material', v_mat,
    'centro', v_centro,
    'descricao', coalesce((select max(descricao) from estoque), (select descricao from cat), (select description from sap_cat)),
    'umb', coalesce((select max(umb) from estoque), (select umb from cat), (select unit from sap_cat)),
    'no_catalogo_sap', exists (select 1 from sap_cat),
    'saldo_total', coalesce((select sum(saldo) from estoque), 0),
    'depositos', coalesce((select jsonb_agg(jsonb_build_object('deposito', deposito, 'saldo', saldo, 'posicao', posicao) order by saldo desc, deposito) from estoque), '[]'::jsonb),
    'posicao_cadastro', (select posicao_estoque from cat),
    'estoque_minimo', (select estoque_minimo from cat),
    'estoque_importado_em', (select max(imported_at) from public.sap_zl0024_stk),
    'rms', coalesce((select jsonb_agg(jsonb_build_object(
        'ri', ri, 'requisicao', requisicao_de_compra, 'item', item_reqc, 'data', data_da_solicitacao,
        'requisitante', requisitante, 'quantidade', qtd_solicitada, 'deposito', deposito,
        'pedido', nullif(trim(pedido), ''), 'item_pedido', item_do_pedido,
        'entrega_prevista', entrega_prevista, 'entrega_confirmada', entrega_confirmada, 'situacao', situacao)
        order by data_da_solicitacao desc nulls last, requisicao_de_compra, item_reqc) from rms), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
        'pedido', pedido, 'item', item, 'ri', ri, 'requisicao', reqc, 'data', data_doc,
        'remessa_prevista', dt_remessa, 'data_migo', data_migo, 'fornecedor', fornecedor_nome, 'deposito', deposito,
        'quantidade_pedida', qtd_pedido, 'quantidade_fornecida', qtd_fornecida, 'quantidade_pendente', pendente,
        'recebido_mb51', recebido_mb51, 'ultima_entrada', ultima_entrada)
        order by (pendente > 0) desc, data_doc desc nulls last, pedido desc) from pos_lista), '[]'::jsonb),
    'ultimo_movimento', (select jsonb_build_object('data', data_lancamento, 'tipo', tipo_movimento, 'descricao', txt_tipo_movimento,
        'quantidade', qtd_um_registro, 'deposito', deposito, 'pedido', pedido) from ultimo_mov)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.alm_situacao_material(text) from public, anon;
grant execute on function public.alm_situacao_material(text) to authenticated;
