-- =====================================================================
-- Situação do material: chegada física no almoxarifado (antes da MIGO)
-- =====================================================================
-- O material pode ter chegado e sido conferido no almoxarifado sem que a
-- MIGO tenha sido lançada — então não está na ZL0024, mas está na prateleira.
-- `alm_situacao_material` passa a devolver `chegadas` (últimos 120 dias):
--   * conferências do Recebimento (RCM, `alm_receb_conferencia_itens`) com
--     quantidade recebida > 0;
--   * marcações "chegou no almox" do Rastreio (`almoxarifado_chegadas`, por
--     RI-PO) que não passaram por conferência.
-- Para cada uma, `migo_em` = primeira MIGO (MB51 101) do pedido + material a
-- partir da data da chegada (ou a `data_migo` da linha da ZL0132, a mesma
-- regra). Sem MIGO = "chegou, aguardando MIGO".
-- Cada pedido ganha também `chegada_almox` (data da chegada mais recente).

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
  chegadas_rcm as (
    select c.codigo, c.data, coalesce(nullif(trim(i.nro_pedido), ''), nullif(trim(c.nro_pedido), '')) as pedido,
           nullif(trim(i.linha_ref), '') as ri_po, i.qtd_recebida as quantidade, i.unidade,
           coalesce(i.parcial, false) as parcial, coalesce(i.divergencia, false) as divergencia, i.tipo_divergencia,
           c.criado_por_nome as registrado_por, 'conferencia'::text as origem
      from public.alm_receb_conferencia_itens i
      join public.alm_receb_conferencias c on c.id = i.conferencia_id
     where not coalesce(c.excluido, false)
       and ltrim(upper(trim(i.material_code)), '0') = v_mat
       and coalesce(i.qtd_recebida, 0) > 0
       and c.data >= current_date - 120
  ),
  chegadas_marcadas as (
    select null::text as codigo, ch.data_chegada as data, ch.doc_compra as pedido, ch.ri_po,
           null::numeric as quantidade, null::text as unidade, false as parcial, false as divergencia, null::text as tipo_divergencia,
           ch.registrado_por_nome as registrado_por, 'rastreio'::text as origem
      from public.almoxarifado_chegadas ch
     where ch.data_chegada >= current_date - 120
       and ch.ri_po in (select p.ri || '-' || p.doc_compra from public.sap_zl0132_po p where p.material = v_mat and p.ri is not null and p.doc_compra is not null)
       and ch.ri_po not in (select r.ri_po from chegadas_rcm r where r.ri_po is not null)
  ),
  chegadas as (
    select x.*,
           nullif(greatest(
             coalesce((select min(m.data_lancamento) from public.sap_mb51_mov m
                        where m.material = v_mat and m.pedido = x.pedido and m.tipo_movimento = '101'
                          and m.data_lancamento >= x.data), '-infinity'::date),
             coalesce((select max(p.data_migo) from public.sap_zl0132_po p
                        where p.material = v_mat and x.ri_po is not null and p.ri || '-' || p.doc_compra = x.ri_po
                          and p.data_migo >= x.data), '-infinity'::date)
           ), '-infinity'::date) as migo_em
      from (select * from chegadas_rcm union all select * from chegadas_marcadas) x
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
    'movimentos_importados_em', (select max(imported_at) from public.sap_mb51_mov),
    'rms', coalesce((select jsonb_agg(jsonb_build_object(
        'ri', ri, 'requisicao', requisicao_de_compra, 'item', item_reqc, 'data', data_da_solicitacao,
        'requisitante', requisitante, 'quantidade', qtd_solicitada, 'deposito', deposito,
        'pedido', nullif(trim(pedido), ''), 'item_pedido', item_do_pedido,
        'entrega_prevista', entrega_prevista, 'entrega_confirmada', entrega_confirmada, 'situacao', situacao)
        order by data_da_solicitacao desc nulls last, requisicao_de_compra, item_reqc) from rms), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
        'pedido', pl.pedido, 'item', pl.item, 'ri', pl.ri, 'requisicao', pl.reqc, 'data', pl.data_doc,
        'remessa_prevista', pl.dt_remessa, 'data_migo', pl.data_migo, 'fornecedor', pl.fornecedor_nome, 'deposito', pl.deposito,
        'quantidade_pedida', pl.qtd_pedido, 'quantidade_fornecida', pl.qtd_fornecida, 'quantidade_pendente', pl.pendente,
        'recebido_mb51', pl.recebido_mb51, 'ultima_entrada', pl.ultima_entrada,
        'chegada_almox', (select max(ch.data) from chegadas ch
                           where ch.ri_po = pl.ri || '-' || pl.pedido or (ch.ri_po is null and ch.pedido = pl.pedido)))
        order by (pl.pendente > 0) desc, pl.data_doc desc nulls last, pl.pedido desc) from pos_lista pl), '[]'::jsonb),
    'chegadas', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', codigo, 'data', data, 'pedido', pedido, 'ri_po', ri_po, 'quantidade', quantidade, 'unidade', unidade,
        'parcial', parcial, 'divergencia', divergencia, 'tipo_divergencia', tipo_divergencia,
        'registrado_por', registrado_por, 'origem', origem, 'migo_em', migo_em)
        order by (migo_em is null) desc, data desc) from chegadas), '[]'::jsonb),
    'ultimo_movimento', (select jsonb_build_object('data', data_lancamento, 'tipo', tipo_movimento, 'descricao', txt_tipo_movimento,
        'quantidade', qtd_um_registro, 'deposito', deposito, 'pedido', pedido) from ultimo_mov)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.alm_situacao_material(text) from public, anon;
grant execute on function public.alm_situacao_material(text) to authenticated;
