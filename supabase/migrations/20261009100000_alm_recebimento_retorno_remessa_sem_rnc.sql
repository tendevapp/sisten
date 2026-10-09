-- =====================================================================
-- Almoxarifado > Recebimento e contagem — Retorno de remessa sem RNC / pendências
--
-- Retorno de remessa não tem PO relacionado. Itens inseridos manualmente
-- sem PO não são divergência ("sem_pedido"), e não deve abrir RNC (NCR)
-- nem pendência para Suprimentos (sup_pend_recebimento).
-- =====================================================================

-- 1. alm_receb_registrar_conferencia
CREATE OR REPLACE FUNCTION public.alm_receb_registrar_conferencia(p_cab jsonb, p_itens jsonb, p_nc jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_data date := coalesce((p_cab->>'data')::date, current_date);
  v_codigo text; v_nc_codigo text;
  v_total int; v_ok int; v_div int; v_tem_nc boolean;
  v_carga_id uuid := nullif(p_cab->>'carga_id','')::uuid;
  v_pedidos text[] := public.alm_receb_pedidos_ordenados(p_cab->'pedidos');
  v_retorno_remessa boolean := coalesce((p_cab->>'retorno_remessa')::boolean, false);
begin
  if coalesce(jsonb_array_length(p_itens), 0) = 0 then
    raise exception 'A conferencia precisa de ao menos um item.';
  end if;

  if v_retorno_remessa then
    -- Retorno de remessa não tem PO: itens sem PO não são divergência e nunca abrem NC
    select count(*),
           count(*) filter (where coalesce((x->>'conferido')::boolean, false) and not (coalesce((x->>'divergencia')::boolean, false) and coalesce(x->>'tipo_divergencia','') <> 'sem_pedido')),
           count(*) filter (where coalesce((x->>'divergencia')::boolean, false) and coalesce(x->>'tipo_divergencia','') <> 'sem_pedido')
      into v_total, v_ok, v_div
    from jsonb_array_elements(p_itens) x;
    v_tem_nc := false;
  else
    select count(*),
           count(*) filter (where coalesce((x->>'conferido')::boolean, false) and not coalesce((x->>'divergencia')::boolean, false)),
           count(*) filter (where coalesce((x->>'divergencia')::boolean, false))
      into v_total, v_ok, v_div
    from jsonb_array_elements(p_itens) x;
    v_tem_nc := v_div > 0;
  end if;

  v_codigo := public.alm_receb_proximo_codigo('RCM', v_data, 'alm_receb_conferencias');
  insert into public.alm_receb_conferencias
    (codigo, data, carga_id, nro_pedido, pedidos, fornecedor, rm, tipo_item, deposito, fonte_pedido,
     total_itens, itens_ok, itens_divergentes, tem_nc, encaminhado_projetos,
     evidencias, observacao, status, criado_por_id, criado_por_nome, retorno_remessa)
  values
    (v_codigo, v_data, v_carga_id,
     coalesce(nullif(p_cab->>'nro_pedido',''), v_pedidos[1]), v_pedidos,
     nullif(p_cab->>'fornecedor',''), nullif(p_cab->>'rm',''),
     coalesce(nullif(p_cab->>'tipo_item',''), 'consumo'),
     nullif(p_cab->>'deposito',''), coalesce(nullif(p_cab->>'fonte_pedido',''), 'sem_pedido'),
     v_total, v_ok, v_div, v_tem_nc, false,
     coalesce(p_cab->'evidencias', '[]'::jsonb), nullif(p_cab->>'observacao',''),
     coalesce(nullif(p_cab->>'status',''), 'concluida'),
     nullif(p_cab->>'criado_por_id','')::uuid, p_cab->>'criado_por_nome',
     v_retorno_remessa)
  returning id into v_id;

  insert into public.alm_receb_conferencia_itens
    (conferencia_id, linha_ref, nro_pedido, material_code, descricao, unidade, qtd_pedido, qtd_ja_fornecida,
     qtd_recebida, conferido, divergencia, tipo_divergencia, item_manual, parcial, parcial_conforme_nf, observacao, evidencias)
  select
    v_id, nullif(x->>'linha_ref',''), nullif(x->>'nro_pedido',''), nullif(x->>'material_code',''),
    nullif(x->>'descricao',''), nullif(x->>'unidade',''), nullif(x->>'qtd_pedido','')::numeric,
    nullif(x->>'qtd_ja_fornecida','')::numeric,
    coalesce((x->>'qtd_recebida')::numeric, 0),
    coalesce((x->>'conferido')::boolean, false),
    case when v_retorno_remessa and coalesce(x->>'tipo_divergencia','') = 'sem_pedido' then false
         else coalesce((x->>'divergencia')::boolean, false) end,
    case when v_retorno_remessa and coalesce(x->>'tipo_divergencia','') = 'sem_pedido' then null
         else nullif(x->>'tipo_divergencia','') end,
    coalesce((x->>'item_manual')::boolean, false),
    coalesce((x->>'parcial')::boolean, false),
    coalesce((x->>'parcial_conforme_nf')::boolean, false),
    nullif(x->>'observacao',''),
    coalesce(x->'evidencias', '[]'::jsonb)
  from jsonb_array_elements(p_itens) x;

  if not v_retorno_remessa and p_nc is not null and p_nc <> 'null'::jsonb and v_tem_nc then
    v_nc_codigo := public.alm_receb_proximo_codigo('NCR', v_data, 'alm_receb_nc');
    insert into public.alm_receb_nc
      (codigo, conferencia_id, carga_id, nro_pedido, fornecedor, tipo, severidade,
       descricao, itens_resumo, evidencias, status, responsavel, criado_por_id, criado_por_nome)
    values
      (v_nc_codigo, v_id, v_carga_id, coalesce(nullif(p_cab->>'nro_pedido',''), v_pedidos[1]),
       nullif(p_cab->>'fornecedor',''),
       coalesce(nullif(p_nc->>'tipo',''), 'outros'), coalesce(nullif(p_nc->>'severidade',''), 'media'),
       coalesce(nullif(p_nc->>'descricao',''), 'Divergencia de recebimento'),
       coalesce(p_nc->'itens_resumo', '[]'::jsonb), coalesce(p_cab->'evidencias', '[]'::jsonb),
       'aberta', nullif(p_nc->>'responsavel',''),
       nullif(p_cab->>'criado_por_id','')::uuid, p_cab->>'criado_por_nome');
  end if;

  if v_carga_id is not null then
    update public.alm_receb_cargas
       set status = case when v_tem_nc then 'divergente' else 'conferida' end
     where id = v_carga_id and status in ('recebida','em_conferencia','divergente');
  end if;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'nc_codigo', v_nc_codigo,
                            'itens_divergentes', v_div, 'tem_nc', v_tem_nc);
end;
$function$;

-- 2. alm_receb_editar_conferencia
CREATE OR REPLACE FUNCTION public.alm_receb_editar_conferencia(p_id uuid, p_cab jsonb, p_itens jsonb DEFAULT NULL::jsonb, p_user jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old public.alm_receb_conferencias;
  v_alt jsonb := '[]'::jsonb;
  v_total int; v_ok int; v_div int; v_tem_nc boolean;
  v_campos text[] := array['nro_pedido','fornecedor','rm','deposito','observacao','tipo_item','retorno_remessa'];
  k text; v_nc_codigo text; v_nc_existe boolean; v_pedidos text[];
  v_retorno_remessa boolean;
begin
  select * into v_old from public.alm_receb_conferencias where id = p_id and not excluido;
  if not found then raise exception 'Conferencia nao encontrada.'; end if;
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;

  v_retorno_remessa := case when p_cab ? 'retorno_remessa'
    then coalesce((p_cab->>'retorno_remessa')::boolean, false)
    else v_old.retorno_remessa end;

  v_pedidos := case when p_cab ? 'pedidos'
    then public.alm_receb_pedidos_ordenados(p_cab->'pedidos')
    else v_old.pedidos end;

  foreach k in array v_campos loop
    if p_cab ? k then
      if coalesce((to_jsonb(v_old) ->> k),'') is distinct from coalesce((p_cab ->> k),'') then
        v_alt := v_alt || jsonb_build_object('campo', k, 'de', to_jsonb(v_old) ->> k, 'para', p_cab ->> k);
      end if;
    end if;
  end loop;

  if p_itens is not null then
    if v_retorno_remessa then
      select count(*),
             count(*) filter (where coalesce((x->>'conferido')::boolean,false) and not (coalesce((x->>'divergencia')::boolean,false) and coalesce(x->>'tipo_divergencia','') <> 'sem_pedido')),
             count(*) filter (where coalesce((x->>'divergencia')::boolean,false) and coalesce(x->>'tipo_divergencia','') <> 'sem_pedido')
        into v_total, v_ok, v_div
      from jsonb_array_elements(p_itens) x;
      v_tem_nc := false;
    else
      select count(*),
             count(*) filter (where coalesce((x->>'conferido')::boolean,false) and not coalesce((x->>'divergencia')::boolean,false)),
             count(*) filter (where coalesce((x->>'divergencia')::boolean,false))
        into v_total, v_ok, v_div
      from jsonb_array_elements(p_itens) x;
      v_tem_nc := v_div > 0;
    end if;

    delete from public.alm_receb_conferencia_itens where conferencia_id = p_id;
    insert into public.alm_receb_conferencia_itens
      (conferencia_id, linha_ref, nro_pedido, material_code, descricao, unidade, qtd_pedido, qtd_ja_fornecida,
       qtd_recebida, conferido, divergencia, tipo_divergencia, item_manual, parcial, parcial_conforme_nf, observacao, evidencias)
    select
      p_id, nullif(x->>'linha_ref',''), nullif(x->>'nro_pedido',''), nullif(x->>'material_code',''),
      nullif(x->>'descricao',''), nullif(x->>'unidade',''), nullif(x->>'qtd_pedido','')::numeric,
      nullif(x->>'qtd_ja_fornecida','')::numeric,
      coalesce((x->>'qtd_recebida')::numeric, 0),
      coalesce((x->>'conferido')::boolean, false),
      case when v_retorno_remessa and coalesce(x->>'tipo_divergencia','') = 'sem_pedido' then false
           else coalesce((x->>'divergencia')::boolean, false) end,
      case when v_retorno_remessa and coalesce(x->>'tipo_divergencia','') = 'sem_pedido' then null
           else nullif(x->>'tipo_divergencia','') end,
      coalesce((x->>'item_manual')::boolean, false),
      coalesce((x->>'parcial')::boolean, false),
      coalesce((x->>'parcial_conforme_nf')::boolean, false),
      nullif(x->>'observacao',''),
      coalesce(x->'evidencias', '[]'::jsonb)
    from jsonb_array_elements(p_itens) x;

    if v_old.total_itens <> v_total or v_old.itens_divergentes <> v_div then
      v_alt := v_alt || jsonb_build_object('campo','itens',
        'de', v_old.total_itens || ' itens / ' || v_old.itens_divergentes || ' diverg.',
        'para', v_total || ' itens / ' || v_div || ' diverg.');
    end if;
  else
    v_total := v_old.total_itens; v_ok := v_old.itens_ok;
    v_div := v_old.itens_divergentes; v_tem_nc := case when v_retorno_remessa then false else v_old.tem_nc end;
  end if;

  update public.alm_receb_conferencias set
    nro_pedido = case when p_cab ? 'nro_pedido' then nullif(p_cab->>'nro_pedido','')
                      when v_pedidos is distinct from v_old.pedidos then v_pedidos[1]
                      else nro_pedido end,
    pedidos = v_pedidos,
    fornecedor = case when p_cab ? 'fornecedor' then nullif(p_cab->>'fornecedor','') else fornecedor end,
    rm = case when p_cab ? 'rm' then nullif(p_cab->>'rm','') else rm end,
    deposito = case when p_cab ? 'deposito' then nullif(p_cab->>'deposito','') else deposito end,
    observacao = case when p_cab ? 'observacao' then nullif(p_cab->>'observacao','') else observacao end,
    carga_id = case when p_cab ? 'carga_id' then nullif(p_cab->>'carga_id','')::uuid else carga_id end,
    tipo_item = coalesce(nullif(p_cab->>'tipo_item',''), tipo_item),
    retorno_remessa = v_retorno_remessa,
    evidencias = coalesce(p_cab->'evidencias', evidencias),
    total_itens = v_total, itens_ok = v_ok, itens_divergentes = v_div, tem_nc = v_tem_nc
  where id = p_id;

  if v_tem_nc and not v_retorno_remessa then
    select exists(select 1 from public.alm_receb_nc where conferencia_id = p_id and not excluido) into v_nc_existe;
    if not v_nc_existe then
      v_nc_codigo := public.alm_receb_proximo_codigo('NCR', coalesce(v_old.data, current_date), 'alm_receb_nc');
      insert into public.alm_receb_nc
        (codigo, conferencia_id, carga_id, nro_pedido, fornecedor, tipo, severidade,
         descricao, itens_resumo, status, criado_por_id, criado_por_nome)
      values
        (v_nc_codigo, p_id, v_old.carga_id,
         coalesce(nullif(p_cab->>'nro_pedido',''), v_pedidos[1], v_old.nro_pedido),
         coalesce(nullif(p_cab->>'fornecedor',''), v_old.fornecedor),
         'outros', 'media', 'Divergencia detectada na edicao da conferencia.',
         coalesce((select jsonb_agg(jsonb_build_object(
             'material_code', x->>'material_code', 'descricao', x->>'descricao',
             'qtd_pedido', x->>'qtd_pedido', 'qtd_recebida', x->>'qtd_recebida',
             'tipo_divergencia', x->>'tipo_divergencia'))
           from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) x
           where coalesce((x->>'divergencia')::boolean, false)), '[]'::jsonb),
         'aberta', nullif(p_user->>'id','')::uuid, p_user->>'nome');
    end if;
  end if;

  if jsonb_array_length(v_alt) > 0 then
    insert into public.alm_receb_alteracoes
      (entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values ('conferencia', p_id, v_old.codigo, v_alt,
            jsonb_array_length(v_alt) || ' alteracao(oes)',
            nullif(p_user->>'id','')::uuid, p_user->>'nome');
  end if;

  return jsonb_build_object('id', p_id, 'codigo', v_old.codigo,
                            'nc_codigo', v_nc_codigo, 'tem_nc', v_tem_nc,
                            'alteracoes', jsonb_array_length(v_alt));
end;
$function$;

-- 3. sup_receb_pend_sincronizar_conferencia
create or replace function public.sup_receb_pend_sincronizar_conferencia(p_conf uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_flag text := 'sup_pend.c_' || replace(p_conf::text, '-', '');
  v_conf public.alm_receb_conferencias;
  v_nc public.alm_receb_nc;
  v_pend public.sup_pend_recebimento;
  v_grupo text;
  v_cid uuid;
  v_cnome text;
  r record;
  v_chave text;
  v_chaves text[] := '{}';
  v_codigo text;
  v_id uuid;
  v_novas jsonb := '[]'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if current_setting(v_flag, true) = txid_current()::text then return; end if;
  perform set_config(v_flag, txid_current()::text, true);

  select * into v_conf from public.alm_receb_conferencias where id = p_conf;
  if not found then return; end if;

  -- Retorno de remessa não possui PO nem comprador de Suprimentos: não abre pendência
  if coalesce(v_conf.retorno_remessa, false) then
    delete from public.sup_pend_recebimento where conferencia_id = p_conf;
    return;
  end if;

  select * into v_nc from public.alm_receb_nc
   where conferencia_id = p_conf and not excluido order by created_at limit 1;

  if not coalesce(v_conf.excluido, false) then
    for r in
      select i.*,
             coalesce(nullif(i.nro_pedido, ''), v_conf.nro_pedido) as po,
             case
               when i.divergencia then
                 case when i.tipo_divergencia in ('falta', 'excedente', 'avaria', 'material_errado', 'sem_pedido')
                      then i.tipo_divergencia else 'outros' end
               when i.parcial and i.qtd_pedido is not null
                    and i.qtd_recebida < i.qtd_pedido - coalesce(i.qtd_ja_fornecida, 0) - 0.001 then 'parcial'
             end as motivo
        from public.alm_receb_conferencia_itens i
       where i.conferencia_id = p_conf
       order by i.created_at
    loop
      continue when r.motivo is null;
      v_chave := 'c:' || p_conf || '|' || coalesce(r.po, '') || '|'
                 || coalesce(r.linha_ref, r.material_code, upper(r.descricao), '') || '|' || r.motivo;
      continue when v_chave = any(v_chaves);
      v_chaves := v_chaves || v_chave;

      select * into v_pend from public.sup_pend_recebimento where chave = v_chave;

      if not found then
        perform pg_advisory_xact_lock(hashtext('sup_pend_recebimento_codigo'));
        v_codigo := public.alm_receb_proximo_codigo('PRE', v_hoje, 'sup_pend_recebimento');
        select * into v_grupo, v_cid, v_cnome from public.sup_receb_comprador_do_po(r.po);
        insert into public.sup_pend_recebimento (
          codigo, origem, chave, conferencia_id, conferencia_codigo, nc_id, nc_codigo, carga_id,
          nro_pedido, linha_ref, material_code, descricao, unidade, fornecedor, motivo,
          qtd_pedido, qtd_ja_fornecida, qtd_recebida, observacao_almox, evidencias,
          grupo_compras, comprador_id, comprador_nome, aberto_por_id, aberto_por_nome, historico)
        values (
          v_codigo, 'conferencia', v_chave, p_conf, v_conf.codigo, v_nc.id, v_nc.codigo, v_conf.carga_id,
          r.po, r.linha_ref, r.material_code, r.descricao, r.unidade, v_conf.fornecedor, r.motivo,
          r.qtd_pedido, r.qtd_ja_fornecida, r.qtd_recebida, r.observacao, coalesce(r.evidencias, '[]'::jsonb),
          v_grupo, v_cid, v_cnome, v_conf.criado_por_id, v_conf.criado_por_nome,
          public.sup_receb_evento('aberta',
            public.sup_receb_rotulo_motivo(r.motivo) || ' na conferência ' || v_conf.codigo
              || coalesce(' — comprador: ' || v_cnome, ' — comprador do PO não identificado'),
            v_conf.criado_por_id, v_conf.criado_por_nome))
        returning id into v_id;
        v_novas := v_novas || jsonb_build_object('id', v_id, 'comprador_id', v_cid, 'po', r.po, 'motivo', r.motivo);

      elsif v_pend.status = 'cancelada' and v_pend.cancelamento = 'auto' then
        update public.sup_pend_recebimento set
          status = 'aguardando_comprador', cancelamento = null,
          decisao = null, decisao_obs = null, pedido_vinculado = null,
          decidido_por_id = null, decidido_por_nome = null, decidido_em = null,
          qtd_pedido = r.qtd_pedido, qtd_ja_fornecida = r.qtd_ja_fornecida, qtd_recebida = r.qtd_recebida,
          observacao_almox = r.observacao, evidencias = coalesce(r.evidencias, '[]'::jsonb),
          nc_id = v_nc.id, nc_codigo = v_nc.codigo,
          historico = historico || public.sup_receb_evento('reaberta',
            'A divergência voltou na edição da conferência.', v_conf.criado_por_id, v_conf.criado_por_nome),
          updated_at = now()
         where id = v_pend.id;
        v_novas := v_novas || jsonb_build_object('id', v_pend.id, 'comprador_id', v_pend.comprador_id, 'po', r.po, 'motivo', r.motivo);

      elsif v_pend.status = 'aguardando_almox' and v_pend.qtd_recebida is distinct from r.qtd_recebida then
        update public.sup_pend_recebimento set
          status = 'aguardando_comprador',
          qtd_pedido = r.qtd_pedido, qtd_ja_fornecida = r.qtd_ja_fornecida, qtd_recebida = r.qtd_recebida,
          observacao_almox = r.observacao, evidencias = coalesce(r.evidencias, '[]'::jsonb),
          historico = historico || public.sup_receb_evento('reaberta',
            'Conferência editada depois da decisão: recebido de ' || coalesce(v_pend.qtd_recebida::text, '—')
              || ' para ' || r.qtd_recebida || '. Confirme a decisão.',
            v_conf.criado_por_id, v_conf.criado_por_nome),
          updated_at = now()
         where id = v_pend.id;
        v_novas := v_novas || jsonb_build_object('id', v_pend.id, 'comprador_id', coalesce(v_pend.decidido_por_id, v_pend.comprador_id), 'po', r.po, 'motivo', r.motivo);

      elsif v_pend.status = 'concluida' then
        if v_pend.qtd_recebida is distinct from r.qtd_recebida then
          update public.sup_pend_recebimento set
            qtd_recebida = r.qtd_recebida,
            historico = historico || public.sup_receb_evento('editada',
              'Conferência editada depois da conclusão: recebido de ' || coalesce(v_pend.qtd_recebida::text, '—')
                || ' para ' || r.qtd_recebida || '.',
              v_conf.criado_por_id, v_conf.criado_por_nome),
            updated_at = now()
           where id = v_pend.id;
        end if;
      end if;
    end loop;
  end if;

  update public.sup_pend_recebimento set
    status = 'cancelada', cancelamento = 'auto',
    historico = historico || public.sup_receb_evento('cancelada',
      case when coalesce(v_conf.excluido, false) then 'Conferência excluída.'
           else 'A divergência saiu da conferência na edição.' end,
      null, 'Sistema'),
    updated_at = now()
   where conferencia_id = p_conf
     and status in ('aguardando_comprador', 'aguardando_almox')
     and not (chave = any(v_chaves));

  if jsonb_array_length(v_novas) > 0 then
    perform public.sup_receb_pend_notificar_novas(v_novas, v_conf.codigo, 'conf=' || p_conf);
  end if;
end;
$$;

-- 4. Saneamento dos registros existentes
-- Limpa status indevido de itens em conferências de retorno de remessa
update public.alm_receb_conferencia_itens
   set divergencia = false,
       tipo_divergencia = null,
       conferido = true
 where conferencia_id in (select id from public.alm_receb_conferencias where retorno_remessa = true)
   and tipo_divergencia = 'sem_pedido';

-- Atualiza contadores nas conferências de retorno de remessa
update public.alm_receb_conferencias
   set itens_ok = total_itens,
       itens_divergentes = 0,
       tem_nc = false
 where retorno_remessa = true;

-- Exclui pendências de compras indevidas de retorno de remessa primeiro (respeita FK nc_id)
delete from public.sup_pend_recebimento
 where conferencia_id in (select id from public.alm_receb_conferencias where retorno_remessa = true);

-- Exclui NCRs indevidas de retorno de remessa
delete from public.alm_receb_nc
 where conferencia_id in (select id from public.alm_receb_conferencias where retorno_remessa = true);

-- Restaura status das cargas vinculadas para conferida
update public.alm_receb_cargas
   set status = 'conferida'
 where id in (
   select carga_id
     from public.alm_receb_conferencias
    where retorno_remessa = true
      and carga_id is not null
 )
 and status = 'divergente';
