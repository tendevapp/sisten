-- =====================================================================
-- Inventário Cíclico: contar não depende mais de rodada liberada pela gestão.
--
-- A preparação (pedir nova ZL0024, gestão importar, informar a hora da
-- extração e liberar) travava toda contagem — inclusive a avulsa do QR e do
-- Cadastro de Itens. Decisão do almoxarifado (31/10): contar sempre; só
-- quando divergir, a tela mostra a hora da última importação da ZL0024 e
-- pede para avisar a gestão.
--
-- - Rodada liberada e válida com o item na foto: segue valendo o saldo da
--   foto (nada muda para quem usa a preparação).
-- - Sem rodada: compara com a ZL0024 atual (alm_inv_saldo_zl0024, a mesma
--   regra da foto), preparacao_id fica nulo.
-- - "Não houve movimentação" e pendências de saída extraordinária deixam de
--   bloquear; a confirmação é gravada como veio (movimentacoes_controladas).
-- - Recontagem continua exigindo causa; limite de 3 contagens igual.
-- - O retorno ganha `zl0024_importada_em`.
-- =====================================================================

create or replace function public.alm_inv_registrar_contagem_auditada(
  p_item_id uuid, p_quantidade numeric, p_endereco text, p_validade date, p_observacao text, p_por text,
  p_causa text, p_causa_detalhe text, p_preparacao uuid, p_iniciada_em timestamptz, p_sem_movimentacao boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_i public.alm_inventario_itens; v_ctx jsonb; v_num int; v_saldo numeric; v_div boolean; v_nome text;
  v_prep uuid; v_inicio timestamptz; v_base timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('alm_inv_reservas'));
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  lock table public.sap_zl0024_stk in share mode;
  select updated_at into v_base from public.dataset_versions where dataset='estoque' for share;
  select * into v_i from public.alm_inventario_itens where id=p_item_id for update;
  if not found or exists(select 1 from public.alm_inventarios where id=v_i.inventario_id and excluido) then raise exception 'Item não encontrado ou inventário excluído.'; end if;
  if v_i.status not in ('pendente','aguardando_decisao') then raise exception 'Item já encerrado.'; end if;

  -- Rodada liberada e válida, com o item na foto da liberação: vale a foto.
  v_ctx := public.alm_inv_contexto_auditoria(v_i.inventario_id);
  if coalesce((v_ctx->>'pronta')::boolean, false) then
    select s.saldo, s.preparacao_id into v_saldo, v_prep
      from public.alm_inv_preparo_saldos s
     where s.preparacao_id=(v_ctx->'preparacao'->>'id')::uuid and s.item_id=p_item_id;
  end if;
  -- Sem rodada: a ZL0024 atual.
  if v_prep is null then
    v_saldo := public.alm_inv_saldo_zl0024(v_i.material, v_i.deposito);
  end if;

  select coalesce(max(numero),0)+1 into v_num from public.alm_inventario_contagens where item_id=p_item_id;
  if v_num>3 then raise exception 'Limite de três contagens atingido.'; end if;
  if p_quantidade is null or p_quantidade<0 or p_quantidade::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida.'; end if;
  if (v_num>=2 or p_causa is not null) and (not coalesce(public.alm_inv_causa_valida(p_causa),false) or length(trim(coalesce(p_causa_detalhe,'')))<5) then raise exception 'Informe a causa provável e o detalhe da recontagem (mínimo 5 caracteres).'; end if;

  select name into v_nome from public.profiles where id=auth.uid()::text;
  v_inicio := least(coalesce(p_iniciada_em, clock_timestamp()), clock_timestamp());
  v_div := round(p_quantidade,3)<>round(v_saldo,3);
  insert into public.alm_inventario_contagens(item_id,numero,quantidade,divergente,saldo_ref,endereco_encontrado,validade,observacao,contado_por_id,contado_por_nome,
    causa,causa_detalhe,preparacao_id,iniciada_em,duracao_segundos,movimentacoes_controladas)
  values(p_item_id,v_num,p_quantidade,v_div,v_saldo,nullif(upper(trim(p_endereco)),''),p_validade,nullif(trim(p_observacao),''),auth.uid(),v_nome,
    p_causa,nullif(trim(p_causa_detalhe),''),v_prep,v_inicio,greatest(0,extract(epoch from clock_timestamp()-v_inicio)::int),coalesce(p_sem_movimentacao,false));
  update public.alm_inventario_itens set status=case when not v_div then 'conferido' when v_num=3 then 'divergente' else 'aguardando_decisao' end,
    saldo_sistema=case when not v_div or v_num=3 then v_saldo else null end,qtd_final=case when not v_div or v_num=3 then p_quantidade else null end,
    diferenca=case when not v_div or v_num=3 then p_quantidade-v_saldo else null end,
    encerrado_em=case when not v_div or v_num=3 then clock_timestamp() end,encerrado_por=case when not v_div or v_num=3 then v_nome end,
    alerta=case when v_div and v_num=3 then 'Divergência após três contagens. Causa provável declarada; exige investigação e conciliação pela gestão.' end
  where id=p_item_id returning * into v_i;
  perform public.alm_inv_atualizar_status(v_i.inventario_id);
  return jsonb_build_object('numero',v_num,'divergente',v_div,'status',v_i.status,'pode_recontar',v_i.status='aguardando_decisao',
    'saldo_sistema',v_i.saldo_sistema,'diferenca',v_i.diferenca,'zl0024_importada_em',v_base);
end;
$function$;
