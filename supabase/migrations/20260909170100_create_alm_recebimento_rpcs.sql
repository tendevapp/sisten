-- =====================================================================
-- Almoxarifado > Recebimento — RPCs transacionais dos dois formulários.
--
-- Por que RPC e não insert direto: a conferência grava em três tabelas de
-- uma vez (conferência + itens + NC) e ainda mexe no status da carga. Meia
-- conferência gravada — itens sem cabeçalho, ou NC órfã — é pior que
-- nenhuma. Aqui ou entra tudo ou não entra nada.
--
-- E o código do registro é gerado AQUI, lendo os códigos do próprio dia e
-- ignorando o que o cliente mandou: dois aparelhos que ficaram offline e
-- voltam juntos não geram `RCM-090926-03` em duplicata. O `unique` da
-- tabela é a rede final; o retry fica com o app.
-- =====================================================================

-- Próximo código do dia no padrão `PREFIXO-DDMMYY-NN`. `p_prefixo` já vem
-- validado pela RPC chamadora (RCV / RCM / NCR).
create or replace function public.alm_receb_proximo_codigo(p_prefixo text, p_data date, p_tabela text)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_ddmmyy text := to_char(p_data, 'DDMMYY');
  v_prefixo text := upper(p_prefixo);
  v_max int;
begin
  execute format(
    'select coalesce(max((regexp_match(codigo, %L))[1]::int), 0) from public.%I where codigo like %L',
    '^' || v_prefixo || '-\d{6}-(\d+)$', p_tabela, v_prefixo || '-' || v_ddmmyy || '-%'
  ) into v_max;
  return v_prefixo || '-' || v_ddmmyy || '-' || lpad((coalesce(v_max, 0) + 1)::text, 2, '0');
end;
$$;

-- Linhas de um PO para a contingência do F2: quando o aparelho não tem o
-- dataset ZL0132 em cache, a tela busca a lista por aqui em vez de obrigar
-- a digitação manual. Lê `sap_zl0132_po` (o cache do app espelha essa mesma
-- tabela). Dedup por (material, item) pegando a linha mais recente.
create or replace function public.alm_receb_po_linhas(p_pedido text)
returns table (
  linha_ref text,
  material_code text,
  descricao text,
  unidade text,
  rm text,
  fornecedor text,
  qtd_pedido numeric,
  qtd_ja_fornecida numeric
)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct on (z.material, z.item)
    z.reqc || '-' || z.doc_compra                 as linha_ref,
    z.material                                     as material_code,
    z.txt_breve                                    as descricao,
    coalesce(z.unidade_medida_pedido, z.unidade_medida_basica) as unidade,
    z.reqc                                         as rm,
    coalesce(z.fornecedor_nome, z.fornecedor)      as fornecedor,
    z.qtd_pedido,
    z.qtd_fornecida                                as qtd_ja_fornecida
  from public.sap_zl0132_po z
  where regexp_replace(coalesce(z.doc_compra, ''), '^0+', '') = regexp_replace(coalesce(p_pedido, ''), '^0+', '')
    and coalesce(p_pedido, '') <> ''
  order by z.material, z.item, z.modificado_em desc nulls last, z.created_at desc nulls last;
$$;

-- F1 — Registrar a ficha cega da carga. Gera o código, calcula a divergência
-- (contada <> declarada OU avaria) e grava.
create or replace function public.alm_receb_registrar_carga(p_carga jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_data date := coalesce((p_carga->>'data')::date, current_date);
  v_codigo text;
  v_contada int := (p_carga->>'qtd_volumes_contada')::int;
  v_declarada int := nullif(p_carga->>'qtd_volumes_declarada','')::int;
  v_avaria boolean := coalesce((p_carga->>'avaria_aparente')::boolean, false);
  v_divergencia boolean;
begin
  if v_contada is null or v_contada < 0 then
    raise exception 'Informe a quantidade de volumes contada.';
  end if;
  if coalesce(jsonb_array_length(p_carga->'evidencias'), 0) = 0 then
    raise exception 'A ficha cega exige ao menos uma foto da carga.';
  end if;

  v_divergencia := v_avaria or (v_declarada is not null and v_declarada <> v_contada);
  v_codigo := public.alm_receb_proximo_codigo('RCV', v_data, 'alm_receb_cargas');

  insert into public.alm_receb_cargas
    (codigo, data, hora, transportadora, veiculo_placa, motorista, doc_transporte,
     nota_fiscal, nro_pedido, qtd_volumes_declarada, qtd_volumes_contada, tipo_embalagem,
     lacre_integro, avaria_aparente, avaria_descricao, peso_declarado, destino_previsto,
     evidencias, observacao, divergencia, status, criado_por_id, criado_por_nome)
  values
    (v_codigo, v_data, nullif(p_carga->>'hora','')::time, p_carga->>'transportadora',
     nullif(p_carga->>'veiculo_placa',''), nullif(p_carga->>'motorista',''), nullif(p_carga->>'doc_transporte',''),
     nullif(p_carga->>'nota_fiscal',''), nullif(p_carga->>'nro_pedido',''), v_declarada, v_contada,
     nullif(p_carga->>'tipo_embalagem',''), (p_carga->>'lacre_integro')::boolean, v_avaria,
     nullif(p_carga->>'avaria_descricao',''), nullif(p_carga->>'peso_declarado','')::numeric,
     coalesce(nullif(p_carga->>'destino_previsto',''), 'indefinido'),
     coalesce(p_carga->'evidencias', '[]'::jsonb), nullif(p_carga->>'observacao',''),
     v_divergencia, case when v_divergencia then 'divergente' else 'recebida' end,
     nullif(p_carga->>'criado_por_id','')::uuid, p_carga->>'criado_por_nome')
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'divergencia', v_divergencia);
end;
$$;

-- F2 — Registrar a conferência. Cabeçalho + itens + (se houver divergência)
-- a NC consolidada, numa transação. Atualiza o status da carga vinculada.
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
begin
  if coalesce(jsonb_array_length(p_itens), 0) = 0 then
    raise exception 'A conferência precisa de ao menos um item.';
  end if;

  select count(*),
         count(*) filter (where coalesce((x->>'conferido')::boolean, false) and not coalesce((x->>'divergencia')::boolean, false)),
         count(*) filter (where coalesce((x->>'divergencia')::boolean, false))
    into v_total, v_ok, v_div
  from jsonb_array_elements(p_itens) x;

  v_tem_nc := v_div > 0;
  v_codigo := public.alm_receb_proximo_codigo('RCM', v_data, 'alm_receb_conferencias');

  insert into public.alm_receb_conferencias
    (codigo, data, carga_id, nro_pedido, fornecedor, rm, tipo_item, deposito, fonte_pedido,
     total_itens, itens_ok, itens_divergentes, tem_nc, encaminhado_projetos,
     evidencias, observacao, status, criado_por_id, criado_por_nome)
  values
    (v_codigo, v_data, v_carga_id, nullif(p_cab->>'nro_pedido',''), nullif(p_cab->>'fornecedor',''),
     nullif(p_cab->>'rm',''), coalesce(nullif(p_cab->>'tipo_item',''), 'consumo'),
     nullif(p_cab->>'deposito',''), coalesce(nullif(p_cab->>'fonte_pedido',''), 'cache_sap'),
     v_total, v_ok, v_div, v_tem_nc, false,
     coalesce(p_cab->'evidencias', '[]'::jsonb), nullif(p_cab->>'observacao',''),
     coalesce(nullif(p_cab->>'status',''), 'concluida'),
     nullif(p_cab->>'criado_por_id','')::uuid, p_cab->>'criado_por_nome')
  returning id into v_id;

  insert into public.alm_receb_conferencia_itens
    (conferencia_id, linha_ref, material_code, descricao, unidade, qtd_pedido, qtd_ja_fornecida,
     qtd_recebida, conferido, divergencia, tipo_divergencia, item_manual, observacao, evidencias)
  select
    v_id, nullif(x->>'linha_ref',''), nullif(x->>'material_code',''), nullif(x->>'descricao',''),
    nullif(x->>'unidade',''), nullif(x->>'qtd_pedido','')::numeric, nullif(x->>'qtd_ja_fornecida','')::numeric,
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
      (v_nc_codigo, v_id, v_carga_id, nullif(p_cab->>'nro_pedido',''), nullif(p_cab->>'fornecedor',''),
       coalesce(nullif(p_nc->>'tipo',''), 'outros'), coalesce(nullif(p_nc->>'severidade',''), 'media'),
       coalesce(nullif(p_nc->>'descricao',''), 'Divergência de recebimento'),
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

-- Chave anon está no bundle do app; estas funções mexem em recebimento e
-- exigem login (ver db/README.md).
revoke all on function public.alm_receb_proximo_codigo(text, date, text) from public;
revoke all on function public.alm_receb_po_linhas(text) from public;
revoke all on function public.alm_receb_registrar_carga(jsonb) from public;
revoke all on function public.alm_receb_registrar_conferencia(jsonb, jsonb, jsonb) from public;

grant execute on function public.alm_receb_proximo_codigo(text, date, text) to authenticated, service_role;
grant execute on function public.alm_receb_po_linhas(text) to authenticated, service_role;
grant execute on function public.alm_receb_registrar_carga(jsonb) to authenticated, service_role;
grant execute on function public.alm_receb_registrar_conferencia(jsonb, jsonb, jsonb) to authenticated, service_role;
