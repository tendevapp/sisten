-- =====================================================================
-- `array(select distinct e ...)` não garante ordem — o "PO principal"
-- (`nro_pedido` = pedidos[1]) saía arbitrário. Helper que deduplica
-- preservando a ordem de 1ª ocorrência, usado nas duas RPCs de conferência.
-- =====================================================================

create or replace function public.alm_receb_pedidos_ordenados(p jsonb)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(array(
    select g.e from (
      select e, min(ord) as ord
      from jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) with ordinality as t(e, ord)
      where e is not null and e <> ''
      group by e
    ) g order by g.ord
  ), '{}');
$$;

create or replace function public.alm_receb_registrar_conferencia(
  p_cab jsonb,
  p_itens jsonb,
  p_nc jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_data date := coalesce((p_cab->>'data')::date, current_date);
  v_codigo text;
  v_nc_codigo text;
  v_total int;
  v_ok int;
  v_div int;
  v_tem_nc boolean;
  v_carga_id uuid := nullif(p_cab->>'carga_id','')::uuid;
  v_pedidos text[] := public.alm_receb_pedidos_ordenados(p_cab->'pedidos');
begin
  if coalesce(jsonb_array_length(p_itens), 0) = 0 then
    raise exception 'A conferencia precisa de ao menos um item.';
  end if;

  select count(*),
         count(*) filter (where coalesce((x->>'conferido')::boolean, false) and not coalesce((x->>'divergencia')::boolean, false)),
         count(*) filter (where coalesce((x->>'divergencia')::boolean, false))
    into v_total, v_ok, v_div
  from jsonb_array_elements(p_itens) x;

  v_tem_nc := v_div > 0;
  v_codigo := public.alm_receb_proximo_codigo('RCM', v_data, 'alm_receb_conferencias');

  insert into public.alm_receb_conferencias
    (codigo, data, carga_id, nro_pedido, pedidos, fornecedor, rm, tipo_item, deposito, fonte_pedido,
     total_itens, itens_ok, itens_divergentes, tem_nc, encaminhado_projetos,
     evidencias, observacao, status, criado_por_id, criado_por_nome)
  values
    (v_codigo, v_data, v_carga_id,
     coalesce(nullif(p_cab->>'nro_pedido',''), v_pedidos[1]), v_pedidos,
     nullif(p_cab->>'fornecedor',''), nullif(p_cab->>'rm',''),
     coalesce(nullif(p_cab->>'tipo_item',''), 'consumo'),
     nullif(p_cab->>'deposito',''), coalesce(nullif(p_cab->>'fonte_pedido',''), 'cache_sap'),
     v_total, v_ok, v_div, v_tem_nc, false,
     coalesce(p_cab->'evidencias', '[]'::jsonb), nullif(p_cab->>'observacao',''),
     coalesce(nullif(p_cab->>'status',''), 'concluida'),
     nullif(p_cab->>'criado_por_id','')::uuid, p_cab->>'criado_por_nome')
  returning id into v_id;

  insert into public.alm_receb_conferencia_itens
    (conferencia_id, linha_ref, nro_pedido, material_code, descricao, unidade, qtd_pedido, qtd_ja_fornecida,
     qtd_recebida, conferido, divergencia, tipo_divergencia, item_manual, observacao, evidencias)
  select
    v_id, nullif(x->>'linha_ref',''), nullif(x->>'nro_pedido',''), nullif(x->>'material_code',''),
    nullif(x->>'descricao',''), nullif(x->>'unidade',''), nullif(x->>'qtd_pedido','')::numeric,
    nullif(x->>'qtd_ja_fornecida','')::numeric,
    coalesce((x->>'qtd_recebida')::numeric, 0), coalesce((x->>'conferido')::boolean, false),
    coalesce((x->>'divergencia')::boolean, false), nullif(x->>'tipo_divergencia',''),
    coalesce((x->>'item_manual')::boolean, false), nullif(x->>'observacao',''),
    coalesce(x->'evidencias', '[]'::jsonb)
  from jsonb_array_elements(p_itens) x;

  if p_nc is not null and p_nc <> 'null'::jsonb and v_tem_nc then
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
$$;

create or replace function public.alm_receb_editar_conferencia(
  p_id uuid, p_cab jsonb, p_itens jsonb default null, p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.alm_receb_conferencias;
  v_alt jsonb := '[]'::jsonb;
  v_total int;
  v_ok int;
  v_div int;
  v_tem_nc boolean;
  v_campos text[] := array['nro_pedido','fornecedor','rm','deposito','observacao','tipo_item'];
  k text;
  v_nc_codigo text;
  v_nc_existe boolean;
  v_pedidos text[];
begin
  select * into v_old from public.alm_receb_conferencias where id = p_id and not excluido;
  if not found then raise exception 'Conferencia nao encontrada.'; end if;
  if not public.form_pode_editar(v_old.criado_por_id::text) then
    raise exception 'So o autor do registro ou um admin pode editar.';
  end if;

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
    select count(*),
           count(*) filter (where coalesce((x->>'conferido')::boolean,false) and not coalesce((x->>'divergencia')::boolean,false)),
           count(*) filter (where coalesce((x->>'divergencia')::boolean,false))
      into v_total, v_ok, v_div
    from jsonb_array_elements(p_itens) x;

    delete from public.alm_receb_conferencia_itens where conferencia_id = p_id;
    insert into public.alm_receb_conferencia_itens
      (conferencia_id, linha_ref, nro_pedido, material_code, descricao, unidade, qtd_pedido, qtd_ja_fornecida,
       qtd_recebida, conferido, divergencia, tipo_divergencia, item_manual, observacao, evidencias)
    select
      p_id, nullif(x->>'linha_ref',''), nullif(x->>'nro_pedido',''), nullif(x->>'material_code',''),
      nullif(x->>'descricao',''), nullif(x->>'unidade',''), nullif(x->>'qtd_pedido','')::numeric,
      nullif(x->>'qtd_ja_fornecida','')::numeric,
      coalesce((x->>'qtd_recebida')::numeric, 0), coalesce((x->>'conferido')::boolean, false),
      coalesce((x->>'divergencia')::boolean, false), nullif(x->>'tipo_divergencia',''),
      coalesce((x->>'item_manual')::boolean, false), nullif(x->>'observacao',''),
      coalesce(x->'evidencias', '[]'::jsonb)
    from jsonb_array_elements(p_itens) x;

    v_tem_nc := v_div > 0;
    if v_old.total_itens <> v_total or v_old.itens_divergentes <> v_div then
      v_alt := v_alt || jsonb_build_object(
        'campo','itens',
        'de', v_old.total_itens || ' itens / ' || v_old.itens_divergentes || ' diverg.',
        'para', v_total || ' itens / ' || v_div || ' diverg.');
    end if;
  else
    v_total := v_old.total_itens; v_ok := v_old.itens_ok;
    v_div := v_old.itens_divergentes; v_tem_nc := v_old.tem_nc;
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
    evidencias = coalesce(p_cab->'evidencias', evidencias),
    total_itens = v_total, itens_ok = v_ok, itens_divergentes = v_div, tem_nc = v_tem_nc
  where id = p_id;

  if v_tem_nc then
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
$$;
