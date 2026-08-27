


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_usage_require_admin"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()::text AND 'admin' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores.';
  END IF;
END;
$$;


ALTER FUNCTION "public"."_usage_require_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apagar_catalogo_materiais"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (has_role('admin') or has_role('coordenador_suprimentos')) then
    raise exception 'Sem permissão para apagar o catálogo de materiais.';
  end if;

  truncate table materials;
end;
$$;


ALTER FUNCTION "public"."apagar_catalogo_materiais"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_texto_tecnico_materiais"("p_itens" "jsonb") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_updated integer := 0;
  v_total integer := 0;
begin
  v_total := jsonb_array_length(p_itens);
  
  with input_data as (
    select distinct on (trim(item->>'material_code'))
      trim(item->>'material_code') as m_code,
      trim(item->>'technical_text') as t_text
    from jsonb_array_elements(p_itens) as item
    where trim(item->>'material_code') <> ''
  ),
  updated_rows as (
    update materials m
    set technical_text = i.t_text
    from input_data i
    where m.material_code = i.m_code
    returning m.material_code
  )
  select count(*) into v_updated from updated_rows;

  return json_build_object(
    'updated', v_updated,
    'total_enviados', v_total
  );
end;
$$;


ALTER FUNCTION "public"."atualizar_texto_tecnico_materiais"("p_itens" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_textos_tecnicos_zl0162"("p_itens" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total int := 0;
  v_atualizados int := 0;
  v_nao_encontrados int := 0;
BEGIN
  WITH dados AS (
    SELECT 
      trim(item->>'material_code') AS material_code,
      trim(item->>'technical_text') AS technical_text
    FROM jsonb_array_elements(p_itens) AS item
    WHERE trim(item->>'material_code') <> ''
  ),
  atualizados AS (
    UPDATE public.materials m
    SET technical_text = d.technical_text
    FROM dados d
    WHERE m.material_code = d.material_code
    RETURNING m.material_code
  )
  SELECT 
    (SELECT count(*)::int FROM dados),
    (SELECT count(*)::int FROM atualizados)
  INTO v_total, v_atualizados;

  v_nao_encontrados := v_total - v_atualizados;

  RETURN jsonb_build_object(
    'total', v_total,
    'atualizados', v_atualizados,
    'nao_encontrados', v_nao_encontrados
  );
END;
$$;


ALTER FUNCTION "public"."atualizar_textos_tecnicos_zl0162"("p_itens" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_dataset_version"("p_dataset" "text", "p_rows" bigint DEFAULT NULL::bigint, "p_user" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_new bigint;
begin
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
$$;


ALTER FUNCTION "public"."bump_dataset_version"("p_dataset" "text", "p_rows" bigint, "p_user" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buscar_materiais"("termo" "text", "area_usuario" "text" DEFAULT NULL::"text", "limite" integer DEFAULT 20, "deslocamento" integer DEFAULT 0, "incluir_tecnico" boolean DEFAULT false) RETURNS TABLE("material_code" "text", "description" "text", "technical_text" "text", "unit" "text", "qtd_estoque" numeric, "depositos" "text"[], "rms_12m" integer, "ultima_rm" "date", "rms_sem_pedido" integer, "rm_aberta" "text", "qtd_rm_aberta" numeric, "pedido_aberto" "text", "qtd_pedido_aberto" numeric, "chega_em" "date", "pedido_pela_area" boolean)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $_$
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
  select m.material_code, m.description, m.technical_text, m.unit,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.qtd_rm_aberta,
         s.pedido_aberto, s.qtd_pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active
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

  -- A queda para similaridade só vale para a primeira página. Numa página
  -- seguinte, "nenhuma linha" significa "acabou a lista", não "não achei" —
  -- devolver aproximações ali plantaria resultados alheios no fim do scroll.
  if found or salto > 0 then return; end if;

  return query
  select m.material_code, m.description, m.technical_text, m.unit,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.qtd_rm_aberta,
         s.pedido_aberto, s.qtd_pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active and m.description % norm
  order by similarity(m.description, norm) desc, m.material_code
  limit teto;
end;
$_$;


ALTER FUNCTION "public"."buscar_materiais"("termo" "text", "area_usuario" "text", "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buscar_materiais_catalogo"("termos" "text"[] DEFAULT NULL::"text"[], "categoria" "text" DEFAULT NULL::"text", "empresa" "text" DEFAULT NULL::"text", "apenas_codigos" "text"[] DEFAULT NULL::"text"[], "limite" integer DEFAULT 50, "deslocamento" integer DEFAULT 0, "incluir_tecnico" boolean DEFAULT false, "unidade" "text" DEFAULT NULL::"text", "tmat" "text" DEFAULT NULL::"text", "ncm" "text" DEFAULT NULL::"text", "status_filtro" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "text", "material_code" "text", "description" "text", "technical_text" "text", "category" "text", "company" "text", "unit" "text", "tipo_material" "text", "codigo_controle" "text", "status_geral" "text", "status_centro" "text", "status_sap" "text", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  teto        int := least(coalesce(limite, 50), 200);
  salto       int := greatest(coalesce(deslocamento, 0), 0);
  toks        text[];
  tecnico     boolean := coalesce(incluir_tecnico, false);
  norm_ncm    text;
  norm_status text := upper(trim(coalesce(status_filtro, 'Todos')));
begin
  -- Normaliza cada chip para busca sem acentos e em maiúsculas
  select array_agg(regexp_replace(trim(f_unaccent(upper(t))), '\s+', ' ', 'g'))
    into toks
  from unnest(coalesce(termos, '{}')) t
  where trim(t) <> '';

  -- Normaliza o NCM removendo pontuação para comparação flexível
  norm_ncm := regexp_replace(trim(coalesce(ncm, '')), '[^0-9a-zA-Z]', '', 'g');

  return query
  with filtrado as materialized (
    select m.id, m.material_code, m.description, m.technical_text,
           m.category, m.company, m.unit, m.tipo_material, m.codigo_controle,
           m.status_geral, m.status_centro,
           case 
             when coalesce(trim(m.status_geral), '') = 'Z1' or coalesce(trim(m.status_centro), '') = 'Z1' then 'Obsoleto'
             else 'Ativo'
           end as calc_status_sap,
           (toks is null or (
             select bool_and(m.busca_desc like '%' || escapar_like(t) || '%')
             from unnest(toks) t
           )) as casa_na_descricao,
           nullif(strpos(m.busca_desc, coalesce(toks[1], '')), 0) as posicao_desc
    from materials m
    where m.is_active
      and (categoria is null or categoria = 'Todas' or m.category = categoria)
      and (empresa is null or empresa = 'Todas' or m.company = empresa or m.company = 'AMBAS')
      and (unidade is null or unidade = 'Todas' or m.unit = unidade)
      and (tmat is null or tmat = 'Todos' or m.tipo_material = tmat)
      and (
        norm_ncm = '' or norm_ncm is null or
        regexp_replace(coalesce(m.codigo_controle, ''), '[^0-9a-zA-Z]', '', 'g') like norm_ncm || '%'
      )
      and (
        norm_status = 'TODOS' or norm_status = '' or norm_status is null
        or (norm_status = 'OBSOLETO' and (coalesce(trim(m.status_geral), '') = 'Z1' or coalesce(trim(m.status_centro), '') = 'Z1'))
        or (norm_status = 'ATIVO' and (coalesce(trim(m.status_geral), '') <> 'Z1' and coalesce(trim(m.status_centro), '') <> 'Z1'))
      )
      and (apenas_codigos is null or m.material_code = any(apenas_codigos))
      and (
        toks is null
        or m.material_code ilike '%' || escapar_like(toks[1]) || '%'
        or (case when tecnico then m.busca_texto else m.busca_desc end)
             like '%' || escapar_like(toks[1]) || '%'
      )
      and (
        toks is null
        or (
          select bool_and(
            m.material_code ilike '%' || escapar_like(t) || '%'
            or (case when tecnico then m.busca_texto else m.busca_desc end)
                 like '%' || escapar_like(t) || '%'
          )
          from unnest(toks) t
        )
      )
  )
  select f.id, f.material_code, f.description, f.technical_text,
         f.category, f.company, f.unit, f.tipo_material, f.codigo_controle,
         f.status_geral, f.status_centro, f.calc_status_sap as status_sap,
         count(*) over () as total_count
  from filtrado f
  order by f.casa_na_descricao desc, f.posicao_desc asc nulls last, f.material_code
  limit teto offset salto;
end;
$$;


ALTER FUNCTION "public"."buscar_materiais_catalogo"("termos" "text"[], "categoria" "text", "empresa" "text", "apenas_codigos" "text"[], "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean, "unidade" "text", "tmat" "text", "ncm" "text", "status_filtro" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escapar_like"("t" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_')
$$;


ALTER FUNCTION "public"."escapar_like"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_unaccent"("text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT PARALLEL SAFE
    SET "search_path" TO 'public'
    AS $_$ select public.unaccent('public.unaccent', $1) $_$;


ALTER FUNCTION "public"."f_unaccent"("text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, cargo, sector_id, roles, status, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Novo Usuário'),
    NEW.raw_user_meta_data->>'cargo',
    NEW.raw_user_meta_data->>'sector_id',
    ARRAY['visualizador']::TEXT[],
    'ativo',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("required_role" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()::text
    AND required_role = ANY(roles)
    AND status = 'ativo'
  );
$$;


ALTER FUNCTION "public"."has_role"("required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ipca_fator"("p_data" "date") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select (select numero_indice from public.ipca_indice order by mes desc limit 1)
       / coalesce(
           (select numero_indice from public.ipca_indice
             where mes <= date_trunc('month', p_data)::date
             order by mes desc limit 1),
           (select numero_indice from public.ipca_indice order by mes asc limit 1)
         )
$$;


ALTER FUNCTION "public"."ipca_fator"("p_data" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ipca_mes_referencia"() RETURNS "date"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$ select max(mes) from public.ipca_indice $$;


ALTER FUNCTION "public"."ipca_mes_referencia"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listar_categorias_materiais"() RETURNS TABLE("category" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select distinct m.category
  from materials m
  where m.is_active
    and m.category is not null
    and m.category <> ''
  order by m.category;
$$;


ALTER FUNCTION "public"."listar_categorias_materiais"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obter_maiores_codigos_catalogo"() RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select json_build_object(
    'max_padrao_7d', (
      select material_code 
      from materials 
      where length(material_code) = 7 and material_code >= '1000000' and material_code < '2000000'
      order by material_code desc 
      limit 1
    ),
    'max_longo_18d', (
      select material_code 
      from materials 
      where length(material_code) = 18 and material_code like '100000%'
      order by material_code desc 
      limit 1
    ),
    'total_materiais', (
      select count(*) 
      from materials
    ),
    'ultimo_cadastro', (
      select max(created_at)
      from materials
    )
  );
$$;


ALTER FUNCTION "public"."obter_maiores_codigos_catalogo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pode_gerir_cotacoes"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())::text
      and p.roles && array['admin','comprador','coordenador_suprimentos']
  );
$$;


ALTER FUNCTION "public"."pode_gerir_cotacoes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."proximo_numero_solicitacao"("p_criticidade" integer) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  chave text := p_criticidade::text;
  proximo int;
begin
  insert into public.sequences (key, value)
  values (chave, 1001)
  on conflict (key) do update set value = public.sequences.value + 1
  returning value into proximo;

  -- Mesmo formato que o cliente já usava: criticidade + sequência com 6 dígitos.
  return p_criticidade::text || lpad(proximo::text, 6, '0');
end;
$$;


ALTER FUNCTION "public"."proximo_numero_solicitacao"("p_criticidade" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_benchmark_material"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  begin
    refresh materialized view concurrently public.mv_benchmark_material;
  exception when others then
    refresh materialized view public.mv_benchmark_material;
  end;
end;
$$;


ALTER FUNCTION "public"."refresh_benchmark_material"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_historico_pedidos"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  refresh materialized view public.mv_historico_pedidos;
  refresh materialized view concurrently public.mv_pedido_atual_por_ri;
end;
$$;


ALTER FUNCTION "public"."refresh_historico_pedidos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_material_sinais"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  refresh materialized view concurrently mv_material_sinais;
end;
$$;


ALTER FUNCTION "public"."refresh_material_sinais"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."refresh_material_sinais"() IS 'Atualiza mv_material_sinais apos importacao de estoque/requisicoes/pedidos. Chamado por localDb.ts nos importadores relevantes. security invoker (nao security definer, por decisao deliberada) — so authenticated tem EXECUTE.';



CREATE OR REPLACE FUNCTION "public"."salvar_processo_cotacao"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_proposta_id uuid;
  v_prop jsonb;
  v_item jsonb;
  v_propostas int := 0;
  v_itens int := 0;
  v_aprendidos int := 0;
  v_usuario_nome text := p_payload->>'usuario_nome';
begin
  for v_prop in select * from jsonb_array_elements(p_payload->'propostas') loop
    insert into public.cotacao_propostas (
      processo_id, arquivo_origem, numero_proposta, data_emissao,
      validade_data, validade_texto,
      fornecedor_razao_social, fornecedor_cnpj, fornecedor_inscricao_estadual,
      fornecedor_cidade, fornecedor_uf, fornecedor_telefone,
      cod_vendor, contato_id, fornecedor_match,
      vendedor_nome, vendedor_email, vendedor_telefone,
      cliente_razao_social, cliente_cnpj, cliente_inscricao_estadual,
      cliente_cidade, cliente_uf,
      condicao_pagamento, forma_pagamento, prazo_entrega_texto, prazo_entrega_dias,
      frete_modalidade, transportadora_indicada, faturamento_minimo,
      dados_bancarios_pix, valor_total_orcamento, observacoes_gerais,
      campos_faltantes, revisado, extracao_id, extraido_raw,
      criado_por, criado_por_nome
    )
    values (
      (v_prop->>'processo_id')::uuid,
      v_prop->>'arquivo_origem', v_prop->>'numero_proposta', (v_prop->>'data_emissao')::date,
      (v_prop->>'validade_data')::date, v_prop->>'validade_texto',
      v_prop->>'fornecedor_razao_social', v_prop->>'fornecedor_cnpj', v_prop->>'fornecedor_inscricao_estadual',
      v_prop->>'fornecedor_cidade', v_prop->>'fornecedor_uf', v_prop->>'fornecedor_telefone',
      v_prop->>'cod_vendor', (v_prop->>'contato_id')::uuid, coalesce(v_prop->>'fornecedor_match', 'nao_encontrado'),
      v_prop->>'vendedor_nome', v_prop->>'vendedor_email', v_prop->>'vendedor_telefone',
      v_prop->>'cliente_razao_social', v_prop->>'cliente_cnpj', v_prop->>'cliente_inscricao_estadual',
      v_prop->>'cliente_cidade', v_prop->>'cliente_uf',
      v_prop->>'condicao_pagamento', v_prop->>'forma_pagamento', v_prop->>'prazo_entrega_texto', (v_prop->>'prazo_entrega_dias')::int,
      v_prop->>'frete_modalidade', v_prop->>'transportadora_indicada', (v_prop->>'faturamento_minimo')::numeric,
      v_prop->>'dados_bancarios_pix', (v_prop->>'valor_total_orcamento')::numeric, v_prop->>'observacoes_gerais',
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_prop->'campos_faltantes', '[]'::jsonb)) x), '{}'),
      coalesce((v_prop->>'revisado')::boolean, false),
      (v_prop->>'extracao_id')::uuid, v_prop->'extraido_raw',
      p_payload->>'usuario_id', v_usuario_nome
    )
    returning id into v_proposta_id;
    v_propostas := v_propostas + 1;

    for v_item in select * from jsonb_array_elements(coalesce(v_prop->'itens', '[]'::jsonb)) loop
      insert into public.cotacao_proposta_itens (
        proposta_id, processo_item_id, fora_escopo, vinculo_origem, vinculo_score,
        ri, material_code,
        item_numero, codigo_produto, descricao_produto, marca_fabricante, unidade_medida,
        ncm, cst, cfop, quantidade, preco_unitario, preco_total_item,
        aliquota_icms_pct, aliquota_pis_pct, aliquota_cofins_pct, aliquota_ipi_pct,
        campos_faltantes, extraido_raw
      )
      values (
        v_proposta_id, (v_item->>'processo_item_id')::uuid,
        coalesce((v_item->>'fora_escopo')::boolean, false),
        coalesce(v_item->>'vinculo_origem', 'manual'), (v_item->>'vinculo_score')::numeric,
        v_item->>'ri', v_item->>'material_code',
        (v_item->>'item_numero')::int, v_item->>'codigo_produto', v_item->>'descricao_produto',
        v_item->>'marca_fabricante', v_item->>'unidade_medida',
        v_item->>'ncm', v_item->>'cst', v_item->>'cfop',
        (v_item->>'quantidade')::numeric, (v_item->>'preco_unitario')::numeric, (v_item->>'preco_total_item')::numeric,
        (v_item->>'aliquota_icms_pct')::numeric, (v_item->>'aliquota_pis_pct')::numeric,
        (v_item->>'aliquota_cofins_pct')::numeric, (v_item->>'aliquota_ipi_pct')::numeric,
        coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_item->'campos_faltantes', '[]'::jsonb)) x), '{}'),
        v_item->'extraido_raw'
      );
      v_itens := v_itens + 1;

      if (v_item->>'processo_item_id') is not null and (v_item->>'material_code') is not null
         and (v_item->>'descricao_norm') is not null then
        insert into public.cotacao_descricao_map
          (fornecedor_cnpj, descricao_norm, descricao_original, codigo_produto,
           material_code, unidade_medida, ultimo_usuario_nome)
        values
          (coalesce(v_prop->>'fornecedor_cnpj', ''),
           v_item->>'descricao_norm', v_item->>'descricao_produto',
           v_item->>'codigo_produto', v_item->>'material_code',
           v_item->>'unidade_medida', v_usuario_nome)
        on conflict (fornecedor_cnpj, descricao_norm) do update
          set material_code      = coalesce(excluded.material_code, public.cotacao_descricao_map.material_code),
              codigo_produto     = coalesce(excluded.codigo_produto, public.cotacao_descricao_map.codigo_produto),
              vezes_confirmado   = public.cotacao_descricao_map.vezes_confirmado + 1,
              ultima_confirmacao = now(),
              ultimo_usuario_nome = excluded.ultimo_usuario_nome;
        v_aprendidos := v_aprendidos + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('propostas', v_propostas, 'itens', v_itens, 'aprendidos', v_aprendidos);
end;
$$;


ALTER FUNCTION "public"."salvar_processo_cotacao"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sugerir_vinculos_cotacao"("p_processo_id" "uuid", "p_fornecedor_cnpj" "text", "p_descricoes" "jsonb") RETURNS TABLE("idx" integer, "processo_item_id" "uuid", "ri" "text", "texto_breve" "text", "material_code" "text", "score" numeric, "origem" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with entrada as (
    select (d->>'idx')::int as idx,
           public.f_unaccent(upper(trim(d->>'descricao'))) as desc_norm,
           nullif(trim(d->>'codigo_produto'), '') as cod
    from jsonb_array_elements(p_descricoes) d
  ),
  escopo as (
    select id, ri, texto_breve, material_code,
           public.f_unaccent(upper(coalesce(texto_breve, ''))) as breve_norm
    from public.cotacao_processo_itens
    where processo_id = p_processo_id
  ),
  aprendido as (
    select e.idx, s.id, s.ri, s.texto_breve, s.material_code,
           least(0.99, 0.90 + 0.01 * m.vezes_confirmado)::numeric as score,
           'aprendido'::text as origem
    from entrada e
    join public.cotacao_descricao_map m
      on m.fornecedor_cnpj = coalesce(p_fornecedor_cnpj, '')
     and (m.descricao_norm = e.desc_norm
          or (e.cod is not null and m.codigo_produto = e.cod))
    join escopo s on s.material_code = m.material_code
  ),
  trigrama as (
    select e.idx, s.id, s.ri, s.texto_breve, s.material_code,
           similarity(e.desc_norm, s.breve_norm)::numeric as score,
           'trigrama'::text as origem
    from entrada e
    cross join escopo s
    where similarity(e.desc_norm, s.breve_norm) > 0.15
  ),
  tudo as (select * from aprendido union all select * from trigrama)
  select idx, id, ri, texto_breve, material_code, score, origem
  from (
    select *, row_number() over (partition by idx order by score desc) as rn
    from tudo
  ) t
  where rn <= 5
  order by idx, score desc;
$$;


ALTER FUNCTION "public"."sugerir_vinculos_cotacao"("p_processo_id" "uuid", "p_fornecedor_cnpj" "text", "p_descricoes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_cnpj_forn_from_pedidosforn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cod_forn text;
  v_fornecedor text;
  v_cnpj text;
BEGIN
  v_cod_forn := COALESCE(NEW.fornecedor_codigo, NEW.cod_forn);
  v_fornecedor := COALESCE(NEW.fornecedor_nome, NEW.fornecedor);
  v_cnpj := COALESCE(NEW.cnpj_fornecedor, NEW.cnpj);

  IF v_cod_forn IS NOT NULL AND TRIM(v_cod_forn) <> '' AND v_cnpj IS NOT NULL AND TRIM(v_cnpj) <> '' THEN
    INSERT INTO public.cnpj_forn (cod_forn, fornecedor, cnpj, updated_at)
    VALUES (TRIM(v_cod_forn), NULLIF(TRIM(v_fornecedor), ''), TRIM(v_cnpj), NOW())
    ON CONFLICT (cod_forn) DO UPDATE SET
      fornecedor = COALESCE(EXCLUDED.fornecedor, public.cnpj_forn.fornecedor),
      cnpj = EXCLUDED.cnpj,
      updated_at = NOW();

    UPDATE public.contatos
    SET cnpj = TRIM(v_cnpj), updated_at = NOW()
    WHERE cod_vendor = TRIM(v_cod_forn) AND (cnpj IS NULL OR cnpj <> TRIM(v_cnpj));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_cnpj_forn_from_pedidosforn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_lote_materiais"("rows" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (has_role('admin') or has_role('coordenador_suprimentos')) then
    raise exception 'Sem permissão para importar o catálogo de materiais.';
  end if;

  insert into materials (
    material_code, description, unit, centro, eliminacao, elim_nivel_centro,
    status_geral, status_centro, modificado_por, tipo_material, codigo_controle,
    categoria_item, indicador_s, grupo_mercadoria_codigo, criado_em,
    ultima_modificacao, idioma, pais, classe_fiscal, unidade_medida_alt,
    classe_avaliacao, numero_pf, grupo_mercadoria_desc, tipo_material_desc,
    denominacao, material_basico, technical_text, category, company,
    is_active, id, imported_at
  )
  select
    material_code, description, unit, centro, eliminacao, elim_nivel_centro,
    status_geral, status_centro, modificado_por, tipo_material, codigo_controle,
    categoria_item, indicador_s, grupo_mercadoria_codigo, criado_em,
    ultima_modificacao, idioma, pais, classe_fiscal, unidade_medida_alt,
    classe_avaliacao, numero_pf, grupo_mercadoria_desc, tipo_material_desc,
    denominacao, material_basico, technical_text, category, company,
    is_active, id, imported_at
  from jsonb_populate_recordset(null::materials, rows)
  on conflict (material_code) do update set
    description             = excluded.description,
    unit                     = excluded.unit,
    centro                   = excluded.centro,
    eliminacao               = excluded.eliminacao,
    elim_nivel_centro        = excluded.elim_nivel_centro,
    status_geral             = excluded.status_geral,
    status_centro            = excluded.status_centro,
    modificado_por           = excluded.modificado_por,
    tipo_material            = excluded.tipo_material,
    codigo_controle          = excluded.codigo_controle,
    categoria_item           = excluded.categoria_item,
    indicador_s              = excluded.indicador_s,
    grupo_mercadoria_codigo  = excluded.grupo_mercadoria_codigo,
    criado_em                = excluded.criado_em,
    ultima_modificacao       = excluded.ultima_modificacao,
    idioma                   = excluded.idioma,
    pais                     = excluded.pais,
    classe_fiscal            = excluded.classe_fiscal,
    unidade_medida_alt       = excluded.unidade_medida_alt,
    classe_avaliacao         = excluded.classe_avaliacao,
    numero_pf                = excluded.numero_pf,
    grupo_mercadoria_desc    = excluded.grupo_mercadoria_desc,
    tipo_material_desc       = excluded.tipo_material_desc,
    denominacao              = excluded.denominacao,
    material_basico          = excluded.material_basico,
    technical_text           = excluded.technical_text,
    category                 = excluded.category,
    company                  = excluded.company,
    is_active                = excluded.is_active,
    imported_at              = excluded.imported_at;
end;
$$;


ALTER FUNCTION "public"."upsert_lote_materiais"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_active_user_list"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("user_id" "text", "user_name" "text", "email" "text", "sessions" integer, "page_views" integer, "first_event" timestamp with time zone, "last_event" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public._usage_require_admin();

  return query
  select e.user_id,
         max(e.user_name) as user_name,
         max(e.email) as email,
         count(distinct e.session_id)::int as sessions,
         count(*) filter (where e.event_type = 'page_view')::int as page_views,
         min(e.created_at) as first_event,
         max(e.created_at) as last_event
  from public.usage_events e
  where e.created_at between p_from and p_to
  group by e.user_id
  order by max(e.created_at) desc;
end;
$$;


ALTER FUNCTION "public"."usage_active_user_list"("p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_active_users"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_granularity" "text" DEFAULT 'day'::"text") RETURNS TABLE("bucket" "date", "active_users" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._usage_require_admin();
  IF p_granularity NOT IN ('day', 'week', 'month') THEN
    p_granularity := 'day';
  END IF;

  RETURN QUERY
  SELECT date_trunc(p_granularity, created_at AT TIME ZONE 'America/Sao_Paulo')::date AS bucket,
         count(DISTINCT user_id)::int AS active_users
  FROM public.usage_events
  WHERE created_at BETWEEN p_from AND p_to AND user_id IS NOT NULL
  GROUP BY 1
  ORDER BY 1;
END;
$$;


ALTER FUNCTION "public"."usage_active_users"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_granularity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_by_hour"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text" DEFAULT NULL::"text") RETURNS TABLE("dow" integer, "hour" integer, "cnt" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._usage_require_admin();

  RETURN QUERY
  SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
         EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
         count(*)::int AS cnt
  FROM public.usage_events
  WHERE created_at BETWEEN p_from AND p_to
    AND (p_user_id IS NULL OR user_id = p_user_id)
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;


ALTER FUNCTION "public"."usage_by_hour"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_kpis"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  PERFORM public._usage_require_admin();

  WITH sess AS (
    SELECT session_id,
           EXTRACT(EPOCH FROM (max(created_at) - min(created_at))) / 60.0 AS mins
    FROM public.usage_events
    WHERE created_at BETWEEN p_from AND p_to AND session_id IS NOT NULL
    GROUP BY session_id
  )
  SELECT json_build_object(
    'active_today', (
      SELECT count(DISTINCT user_id) FROM public.usage_events
      WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')
            >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    ),
    'sessions', (SELECT count(*) FROM sess),
    'page_views', (
      SELECT count(*) FROM public.usage_events
      WHERE event_type = 'page_view' AND created_at BETWEEN p_from AND p_to
    ),
    'avg_session_minutes', COALESCE((SELECT round(avg(mins)::numeric, 1) FROM sess), 0)
  ) INTO result;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."usage_kpis"("p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_page_ranking"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text" DEFAULT NULL::"text") RETURNS TABLE("path" "text", "page_label" "text", "visits" integer, "avg_dwell_seconds" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._usage_require_admin();

  RETURN QUERY
  WITH evts AS (
    SELECT e.session_id, e.path, e.page_label, e.event_type, e.created_at,
           lead(e.created_at) OVER (PARTITION BY e.session_id ORDER BY e.created_at) AS next_at
    FROM public.usage_events e
    WHERE e.created_at BETWEEN p_from AND p_to
      AND (p_user_id IS NULL OR e.user_id = p_user_id)
  )
  SELECT evts.path,
         max(evts.page_label) AS page_label,
         count(*)::int AS visits,
         round(avg(
           CASE WHEN evts.next_at IS NOT NULL
                 AND EXTRACT(EPOCH FROM (evts.next_at - evts.created_at)) BETWEEN 0 AND 1800
                THEN EXTRACT(EPOCH FROM (evts.next_at - evts.created_at)) END
         )::numeric, 0) AS avg_dwell_seconds
  FROM evts
  WHERE evts.event_type = 'page_view' AND evts.path IS NOT NULL
  GROUP BY evts.path
  ORDER BY visits DESC;
END;
$$;


ALTER FUNCTION "public"."usage_page_ranking"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_page_users"("p_path" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("user_id" "text", "user_name" "text", "email" "text", "visits" integer, "last_visit" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._usage_require_admin();

  RETURN QUERY
  SELECT e.user_id,
         max(e.user_name) AS user_name,
         max(e.email) AS email,
         count(*)::int AS visits,
         max(e.created_at) AS last_visit
  FROM public.usage_events e
  WHERE e.event_type = 'page_view'
    AND e.path = p_path
    AND e.created_at BETWEEN p_from AND p_to
  GROUP BY e.user_id
  ORDER BY visits DESC;
END;
$$;


ALTER FUNCTION "public"."usage_page_users"("p_path" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_user_summary"("p_user_id" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  PERFORM public._usage_require_admin();

  SELECT json_build_object(
    'last_login', (
      SELECT max(created_at) FROM public.usage_events
      WHERE user_id = p_user_id AND event_type = 'login'
    ),
    'sessions', (
      SELECT count(DISTINCT session_id) FROM public.usage_events
      WHERE user_id = p_user_id AND session_id IS NOT NULL
    ),
    'total_events', (
      SELECT count(*) FROM public.usage_events WHERE user_id = p_user_id
    ),
    'favorite_pages', (
      SELECT COALESCE(json_agg(fp), '[]'::json) FROM (
        SELECT path, max(page_label) AS page_label, count(*)::int AS visits
        FROM public.usage_events
        WHERE user_id = p_user_id AND event_type = 'page_view' AND path IS NOT NULL
        GROUP BY path
        ORDER BY visits DESC
        LIMIT 5
      ) fp
    )
  ) INTO result;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."usage_user_summary"("p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_user_timeline"("p_user_id" "text", "p_limit" integer DEFAULT 50) RETURNS TABLE("event_type" "text", "path" "text", "page_label" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._usage_require_admin();

  RETURN QUERY
  SELECT e.event_type, e.path, e.page_label, e.created_at
  FROM public.usage_events e
  WHERE e.user_id = p_user_id
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."usage_user_timeline"("p_user_id" "text", "p_limit" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."core_logs_atividade" (
    "id" "text" NOT NULL,
    "user_id" "text",
    "user_name" "text",
    "email" "text",
    "module" "text",
    "action" "text",
    "details" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."core_logs_atividade" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."activity_logs" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "user_name",
    "email",
    "module",
    "action",
    "details",
    "created_at"
   FROM "public"."core_logs_atividade";


ALTER VIEW "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."almoxarifado_chegadas" (
    "ri" "text" NOT NULL,
    "rm" "text",
    "data_chegada" "date" NOT NULL,
    "registrado_por_id" "text",
    "registrado_por_nome" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."almoxarifado_chegadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ops_api_uso" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "api_id" "text" NOT NULL,
    "modelo" "text",
    "user_id" "text",
    "user_name" "text",
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "custo_usd" numeric,
    "duracao_ms" integer,
    "sucesso" boolean NOT NULL,
    "erro_mensagem" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ops_api_uso" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."api_uso_logs" WITH ("security_invoker"='true') AS
 SELECT "id",
    "api_id",
    "modelo",
    "user_id",
    "user_name",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "custo_usd",
    "duracao_ms",
    "sucesso",
    "erro_mensagem",
    "created_at"
   FROM "public"."ops_api_uso";


ALTER VIEW "public"."api_uso_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_grupos_compradores" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "group_code" "text" NOT NULL,
    "is_primary" boolean DEFAULT false
);


ALTER TABLE "public"."core_grupos_compradores" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."buyer_groups" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "group_code",
    "is_primary"
   FROM "public"."core_grupos_compradores";


ALTER VIEW "public"."buyer_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cadastro_grupo_mercadoria" (
    "codigo" "text" NOT NULL,
    "denominacao" "text" NOT NULL,
    "denominacao2" "text",
    "classificacao_nivel1" "text",
    "codigo_pai" "text"
);


ALTER TABLE "public"."cadastro_grupo_mercadoria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cadastro_tipodoc" (
    "codigo" "text" NOT NULL,
    "tipo_documento" "text" NOT NULL,
    "categoria_modulo" "text",
    "descricao_operacional" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cadastro_tipodoc" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_fornecedores_cidades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forn_codigo" "text" NOT NULL,
    "forn_nome" "text",
    "rua" "text",
    "pais" "text",
    "codigo_postal" "text",
    "localidade" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "estado_uf" "text"
);


ALTER TABLE "public"."sup_fornecedores_cidades" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cidadeforn" WITH ("security_invoker"='true') AS
 SELECT "id",
    "forn_codigo",
    "forn_nome",
    "rua",
    "pais",
    "codigo_postal",
    "localidade",
    "created_at",
    "updated_at",
    "estado_uf"
   FROM "public"."sup_fornecedores_cidades";


ALTER VIEW "public"."cidadeforn" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_fornecedores_cnpj" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cod_forn" "text" NOT NULL,
    "fornecedor" "text",
    "cnpj" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sup_fornecedores_cnpj" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cnpj_forn" WITH ("security_invoker"='true') AS
 SELECT "id",
    "cod_forn",
    "fornecedor",
    "cnpj",
    "created_at",
    "updated_at"
   FROM "public"."sup_fornecedores_cnpj";


ALTER VIEW "public"."cnpj_forn" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_compradores" (
    "grupo_compras" "text" NOT NULL,
    "nome_comprador" "text" NOT NULL,
    "usuario_sistema" "text",
    "email" "text"
);


ALTER TABLE "public"."sup_compradores" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."compradores" WITH ("security_invoker"='true') AS
 SELECT "grupo_compras",
    "nome_comprador",
    "usuario_sistema",
    "email"
   FROM "public"."sup_compradores";


ALTER VIEW "public"."compradores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_fornecedores_contatos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cod_vendor" "text",
    "fornecedor" "text",
    "telefone" "text",
    "email" "text",
    "classificacao" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nome_fantasia" "text",
    "nome_contato" "text",
    "cnpj" "text",
    "representante_nome" "text",
    "representante_cargo" "text",
    "representante_telefone" "text",
    "representante_email" "text",
    "status" "text" DEFAULT 'Atualizado'::"text",
    "cidade" "text",
    "estado_uf" "text"
);


ALTER TABLE "public"."sup_fornecedores_contatos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."contatos" WITH ("security_invoker"='true') AS
 SELECT "id",
    "cod_vendor",
    "fornecedor",
    "telefone",
    "email",
    "classificacao",
    "created_at",
    "updated_at",
    "nome_fantasia",
    "nome_contato",
    "cnpj",
    "representante_nome",
    "representante_cargo",
    "representante_telefone",
    "representante_email",
    "status",
    "cidade",
    "estado_uf"
   FROM "public"."sup_fornecedores_contatos";


ALTER VIEW "public"."contatos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contrato_anexos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "documento_compras" "text" NOT NULL,
    "name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "size" bigint,
    "uploaded_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contrato_anexos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contratos_detalhes" (
    "documento_compras" "text" NOT NULL,
    "gestor" "text",
    "escopo_servico" "text",
    "po_pedido_compra" "text",
    "codigo_fornecedor" "text",
    "valor_parcela" numeric,
    "modalidade" "text",
    "vigencia_label" "text",
    "status" "text",
    "updated_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contratos_detalhes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ops_conversoes_markdown" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text",
    "user_name" "text",
    "nome_arquivo" "text" NOT NULL,
    "formato" "text" NOT NULL,
    "tamanho_bytes" integer,
    "via" "text" NOT NULL,
    "modelo" "text",
    "caracteres" integer,
    "tokens" integer,
    "tokens_reais" boolean DEFAULT false NOT NULL,
    "custo_usd" numeric,
    "duracao_ms" integer,
    "sucesso" boolean NOT NULL,
    "erro_mensagem" "text",
    "markdown" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversoes_markdown_via_check" CHECK (("via" = ANY (ARRAY['local'::"text", 'ia'::"text"])))
);


ALTER TABLE "public"."ops_conversoes_markdown" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."conversoes_markdown" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "user_name",
    "nome_arquivo",
    "formato",
    "tamanho_bytes",
    "via",
    "modelo",
    "caracteres",
    "tokens",
    "tokens_reais",
    "custo_usd",
    "duracao_ms",
    "sucesso",
    "erro_mensagem",
    "markdown",
    "created_at"
   FROM "public"."ops_conversoes_markdown";


ALTER VIEW "public"."conversoes_markdown" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_notificacoes" (
    "id" "text" NOT NULL,
    "user_id" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "type" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "request_id" "text",
    "request_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "context_key" "text"
);


ALTER TABLE "public"."core_notificacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_perfis" (
    "id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cargo" "text",
    "sector_id" "text",
    "roles" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'pendente'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notification_preferences" "text" DEFAULT 'in-app'::"text",
    "grupo_compras" "text",
    "page_access" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "aprovador_setores" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "aprovador_cadastro_sap" boolean DEFAULT false NOT NULL,
    "tours_seen" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."core_perfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_setores" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_support" boolean DEFAULT false,
    "helpdesk_enabled" boolean DEFAULT false,
    "sap_area_code" "text"
);


ALTER TABLE "public"."core_setores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_solicitacoes" (
    "id" "text" NOT NULL,
    "number" "text" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "criticality" integer NOT NULL,
    "solicitante_id" "text",
    "solicitante_name" "text",
    "solicitante_sector_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "data_necessidade" "date",
    "comprador_id" "text",
    "tipo_compra" "text",
    "justificativa" "text",
    "local" "text",
    "category_id" "text",
    "target_sector_id" "text",
    "registration_type" "text",
    "linked_rm_number" "text",
    "rating" integer,
    "rating_comment" "text",
    "atendente_id" "text",
    "atendente_name" "text",
    "first_response_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "paused_minutes" integer DEFAULT 0,
    "last_paused_at" timestamp with time zone,
    "contrato_tipo" "text",
    "fornecedor_terceiro" "text",
    "prazo_conclusao" "date",
    "titulo" "text",
    "brand" "text",
    "suggested_supplier" "text",
    "representante_nome" "text",
    "representante_cargo" "text",
    "representante_telefone" "text",
    "representante_email" "text"
);


ALTER TABLE "public"."core_solicitacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_solicitacoes_anexos" (
    "id" "text" NOT NULL,
    "request_id" "text",
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "size" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "request_item_id" "text",
    "storage_path" "text",
    "mime_type" "text",
    "uploaded_by" "text",
    "size_original" integer,
    "material_code" "text"
);


ALTER TABLE "public"."core_solicitacoes_anexos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_solicitacoes_comentarios" (
    "id" "text" NOT NULL,
    "request_id" "text",
    "user_id" "text",
    "user_name" "text",
    "user_roles" "text"[] DEFAULT '{}'::"text"[],
    "content" "text" NOT NULL,
    "is_internal" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."core_solicitacoes_comentarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_solicitacoes_historico_status" (
    "id" "text" NOT NULL,
    "request_id" "text",
    "from_status" "text" NOT NULL,
    "to_status" "text" NOT NULL,
    "user_id" "text",
    "user_name" "text",
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."core_solicitacoes_historico_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_solicitacoes_itens" (
    "id" "text" NOT NULL,
    "request_id" "text",
    "description" "text" NOT NULL,
    "sap_code" "text",
    "has_no_sap_code" boolean DEFAULT false,
    "quantity" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "brand" "text",
    "is_similar_allowed" boolean DEFAULT false,
    "suggested_supplier" "text",
    "estimated_value" numeric DEFAULT 0,
    "is_generic" boolean DEFAULT false,
    "observation" "text",
    "reference_link" "text"
);


ALTER TABLE "public"."core_solicitacoes_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_cotacao_descricao_map" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fornecedor_cnpj" "text" NOT NULL,
    "descricao_norm" "text" NOT NULL,
    "descricao_original" "text" NOT NULL,
    "codigo_produto" "text",
    "material_code" "text",
    "unidade_medida" "text",
    "vezes_confirmado" integer DEFAULT 1 NOT NULL,
    "ultima_confirmacao" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ultimo_usuario_nome" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sup_cotacao_descricao_map" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cotacao_descricao_map" WITH ("security_invoker"='true') AS
 SELECT "id",
    "fornecedor_cnpj",
    "descricao_norm",
    "descricao_original",
    "codigo_produto",
    "material_code",
    "unidade_medida",
    "vezes_confirmado",
    "ultima_confirmacao",
    "ultimo_usuario_nome",
    "created_at"
   FROM "public"."sup_cotacao_descricao_map";


ALTER VIEW "public"."cotacao_descricao_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_cotacao_extracoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" "uuid",
    "user_id" "text",
    "user_name" "text",
    "modelo" "text" NOT NULL,
    "chars_entrada" integer NOT NULL,
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "custo_usd" numeric(12,6),
    "duracao_ms" integer,
    "truncado" boolean DEFAULT false NOT NULL,
    "sucesso" boolean DEFAULT true NOT NULL,
    "erro_codigo" "text",
    "erro_mensagem" "text",
    "propostas_extraidas" integer,
    "itens_extraidos" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sup_cotacao_extracoes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cotacao_extracoes" WITH ("security_invoker"='true') AS
 SELECT "id",
    "processo_id",
    "user_id",
    "user_name",
    "modelo",
    "chars_entrada",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "custo_usd",
    "duracao_ms",
    "truncado",
    "sucesso",
    "erro_codigo",
    "erro_mensagem",
    "propostas_extraidas",
    "itens_extraidos",
    "created_at"
   FROM "public"."sup_cotacao_extracoes";


ALTER VIEW "public"."cotacao_extracoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_cotacao_historico" (
    "id" "text" NOT NULL,
    "ri" "text" NOT NULL,
    "rm" "text",
    "cod_forn" "text" NOT NULL,
    "fornecedor_nome" "text",
    "user_id" "text",
    "user_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sup_cotacao_historico" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cotacao_historico" WITH ("security_invoker"='true') AS
 SELECT "id",
    "ri",
    "rm",
    "cod_forn",
    "fornecedor_nome",
    "user_id",
    "user_name",
    "created_at"
   FROM "public"."sup_cotacao_historico";


ALTER VIEW "public"."cotacao_historico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_cotacao_processo_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" "uuid" NOT NULL,
    "ri" "text" NOT NULL,
    "rm" "text",
    "item_reqc" "text",
    "material_code" "text",
    "texto_breve" "text",
    "qtd_solicitada" numeric(18,4),
    "unidade_medida" "text",
    "centro" "text",
    "deposito" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sup_cotacao_processo_itens" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cotacao_processo_itens" WITH ("security_invoker"='true') AS
 SELECT "id",
    "processo_id",
    "ri",
    "rm",
    "item_reqc",
    "material_code",
    "texto_breve",
    "qtd_solicitada",
    "unidade_medida",
    "centro",
    "deposito",
    "created_at"
   FROM "public"."sup_cotacao_processo_itens";


ALTER VIEW "public"."cotacao_processo_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_cotacao_processos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero" "text" NOT NULL,
    "titulo" "text",
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "observacoes" "text",
    "criado_por" "text",
    "criado_por_nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cotacao_processos_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'em_analise'::"text", 'concluido'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."sup_cotacao_processos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cotacao_processos" WITH ("security_invoker"='true') AS
 SELECT "id",
    "numero",
    "titulo",
    "status",
    "observacoes",
    "criado_por",
    "criado_por_nome",
    "created_at",
    "updated_at"
   FROM "public"."sup_cotacao_processos";


ALTER VIEW "public"."cotacao_processos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_cotacao_proposta_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposta_id" "uuid" NOT NULL,
    "processo_item_id" "uuid",
    "fora_escopo" boolean DEFAULT false NOT NULL,
    "vinculo_origem" "text" DEFAULT 'manual'::"text" NOT NULL,
    "vinculo_score" numeric(5,4),
    "ri" "text",
    "material_code" "text",
    "item_numero" integer,
    "codigo_produto" "text",
    "descricao_produto" "text" NOT NULL,
    "marca_fabricante" "text",
    "unidade_medida" "text",
    "ncm" "text",
    "cst" "text",
    "cfop" "text",
    "quantidade" numeric(18,4),
    "preco_unitario" numeric(18,6),
    "preco_total_item" numeric(15,2),
    "aliquota_icms_pct" numeric(7,4),
    "aliquota_pis_pct" numeric(7,4),
    "aliquota_cofins_pct" numeric(7,4),
    "aliquota_ipi_pct" numeric(7,4),
    "campos_faltantes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "extraido_raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cotacao_proposta_itens_preco_nao_negativo" CHECK ((("preco_unitario" IS NULL) OR ("preco_unitario" >= (0)::numeric))),
    CONSTRAINT "cotacao_proposta_itens_qtd_nao_negativa" CHECK ((("quantidade" IS NULL) OR ("quantidade" >= (0)::numeric))),
    CONSTRAINT "cotacao_proposta_itens_vinculo_origem_check" CHECK (("vinculo_origem" = ANY (ARRAY['manual'::"text", 'sugerido'::"text", 'aprendido'::"text"])))
);


ALTER TABLE "public"."sup_cotacao_proposta_itens" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cotacao_proposta_itens" WITH ("security_invoker"='true') AS
 SELECT "id",
    "proposta_id",
    "processo_item_id",
    "fora_escopo",
    "vinculo_origem",
    "vinculo_score",
    "ri",
    "material_code",
    "item_numero",
    "codigo_produto",
    "descricao_produto",
    "marca_fabricante",
    "unidade_medida",
    "ncm",
    "cst",
    "cfop",
    "quantidade",
    "preco_unitario",
    "preco_total_item",
    "aliquota_icms_pct",
    "aliquota_pis_pct",
    "aliquota_cofins_pct",
    "aliquota_ipi_pct",
    "campos_faltantes",
    "extraido_raw",
    "created_at"
   FROM "public"."sup_cotacao_proposta_itens";


ALTER VIEW "public"."cotacao_proposta_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_cotacao_propostas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" "uuid" NOT NULL,
    "arquivo_origem" "text",
    "numero_proposta" "text",
    "data_emissao" "date",
    "validade_data" "date",
    "validade_texto" "text",
    "fornecedor_razao_social" "text",
    "fornecedor_cnpj" "text",
    "fornecedor_inscricao_estadual" "text",
    "fornecedor_cidade" "text",
    "fornecedor_uf" "text",
    "fornecedor_telefone" "text",
    "cod_vendor" "text",
    "contato_id" "uuid",
    "fornecedor_match" "text" DEFAULT 'nao_encontrado'::"text" NOT NULL,
    "vendedor_nome" "text",
    "vendedor_email" "text",
    "vendedor_telefone" "text",
    "cliente_razao_social" "text",
    "cliente_cnpj" "text",
    "cliente_inscricao_estadual" "text",
    "cliente_cidade" "text",
    "cliente_uf" "text",
    "condicao_pagamento" "text",
    "forma_pagamento" "text",
    "prazo_entrega_texto" "text",
    "prazo_entrega_dias" integer,
    "frete_modalidade" "text",
    "transportadora_indicada" "text",
    "faturamento_minimo" numeric(15,2),
    "dados_bancarios_pix" "text",
    "valor_total_orcamento" numeric(15,2),
    "observacoes_gerais" "text",
    "campos_faltantes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "revisado" boolean DEFAULT false NOT NULL,
    "extracao_id" "uuid",
    "extraido_raw" "jsonb",
    "criado_por" "text",
    "criado_por_nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cotacao_propostas_cnpj_digitos" CHECK ((("fornecedor_cnpj" IS NULL) OR ("fornecedor_cnpj" ~ '^\d{14}$'::"text"))),
    CONSTRAINT "cotacao_propostas_fornecedor_match_check" CHECK (("fornecedor_match" = ANY (ARRAY['cnpj'::"text", 'manual'::"text", 'nao_encontrado'::"text"]))),
    CONSTRAINT "cotacao_propostas_frete_modalidade_check" CHECK ((("frete_modalidade" IS NULL) OR ("frete_modalidade" = ANY (ARRAY['CIF'::"text", 'FOB'::"text", 'OUTRO'::"text"]))))
);


ALTER TABLE "public"."sup_cotacao_propostas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cotacao_propostas" WITH ("security_invoker"='true') AS
 SELECT "id",
    "processo_id",
    "arquivo_origem",
    "numero_proposta",
    "data_emissao",
    "validade_data",
    "validade_texto",
    "fornecedor_razao_social",
    "fornecedor_cnpj",
    "fornecedor_inscricao_estadual",
    "fornecedor_cidade",
    "fornecedor_uf",
    "fornecedor_telefone",
    "cod_vendor",
    "contato_id",
    "fornecedor_match",
    "vendedor_nome",
    "vendedor_email",
    "vendedor_telefone",
    "cliente_razao_social",
    "cliente_cnpj",
    "cliente_inscricao_estadual",
    "cliente_cidade",
    "cliente_uf",
    "condicao_pagamento",
    "forma_pagamento",
    "prazo_entrega_texto",
    "prazo_entrega_dias",
    "frete_modalidade",
    "transportadora_indicada",
    "faturamento_minimo",
    "dados_bancarios_pix",
    "valor_total_orcamento",
    "observacoes_gerais",
    "campos_faltantes",
    "revisado",
    "extracao_id",
    "extraido_raw",
    "criado_por",
    "criado_por_nome",
    "created_at",
    "updated_at"
   FROM "public"."sup_cotacao_propostas";


ALTER VIEW "public"."cotacao_propostas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ops_dataset_versoes" (
    "dataset" "text" NOT NULL,
    "version" bigint DEFAULT 1 NOT NULL,
    "row_count" bigint,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text"
);


ALTER TABLE "public"."ops_dataset_versoes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."dataset_versions" WITH ("security_invoker"='true') AS
 SELECT "dataset",
    "version",
    "row_count",
    "updated_at",
    "updated_by"
   FROM "public"."ops_dataset_versoes";


ALTER VIEW "public"."dataset_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_ddp" (
    "ddp" "text" NOT NULL,
    "descricao" "text" NOT NULL
);


ALTER TABLE "public"."sup_ddp" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ddp" WITH ("security_invoker"='true') AS
 SELECT "ddp",
    "descricao"
   FROM "public"."sup_ddp";


ALTER VIEW "public"."ddp" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sap_zl0024_stk" (
    "id" bigint NOT NULL,
    "centro" "text",
    "deposito" "text",
    "tipo_material" "text",
    "material" "text",
    "referencia_fabricante" "text",
    "txt_breve_material" "text",
    "quantidade" numeric,
    "umb" "text",
    "preco_medio" numeric,
    "valor_total" numeric,
    "grp_mercad" "text",
    "class_item" "text",
    "grupo_mercadorias" "text",
    "aplicacao" "text",
    "texto_pedido_compra" "text",
    "empresa" "text",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sap_zl0024_stk" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."estoque" WITH ("security_invoker"='true') AS
 SELECT "id",
    "centro",
    "deposito",
    "tipo_material",
    "material",
    "referencia_fabricante",
    "txt_breve_material",
    "quantidade",
    "umb",
    "preco_medio",
    "valor_total",
    "grp_mercad",
    "class_item",
    "grupo_mercadorias",
    "aplicacao",
    "texto_pedido_compra",
    "empresa",
    "imported_at"
   FROM "public"."sap_zl0024_stk";


ALTER VIEW "public"."estoque" OWNER TO "postgres";


ALTER TABLE "public"."sap_zl0024_stk" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."estoque_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."expedicao_carregamentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero" "text" NOT NULL,
    "empresa" "text" DEFAULT ''::"text" NOT NULL,
    "observacoes" "text",
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "enviado_em" timestamp with time zone,
    "criado_por" "text" NOT NULL,
    "criado_por_nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expedicao_carregamentos_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'enviado'::"text"])))
);


ALTER TABLE "public"."expedicao_carregamentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expedicao_fotos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "carregamento_id" "uuid" NOT NULL,
    "tramo_id" "uuid" NOT NULL,
    "etapa" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "nome_arquivo" "text",
    "criado_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expedicao_fotos_etapa_check" CHECK (("etapa" = ANY (ARRAY['chegada_portaria'::"text", 'entrada_patio'::"text", 'expedicao'::"text"])))
);


ALTER TABLE "public"."expedicao_fotos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expedicao_tramos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "carregamento_id" "uuid" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "tramo" "text" NOT NULL,
    "motorista" "text" DEFAULT ''::"text" NOT NULL,
    "cavalo_placa" "text" DEFAULT ''::"text" NOT NULL,
    "cavalo_uf" "text",
    "carreta_placa" "text" DEFAULT ''::"text" NOT NULL,
    "carreta_uf" "text",
    "data" "date",
    "hora_chegada_portaria" "text",
    "hora_entrada_patio" "text",
    "hora_expedicao" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dolly_placa" "text" DEFAULT ''::"text" NOT NULL,
    "dolly_uf" "text",
    "obs_chegada_portaria" "text",
    "obs_entrada_patio" "text",
    "obs_expedicao" "text",
    CONSTRAINT "expedicao_tramos_tramo_check" CHECK (("tramo" = ANY (ARRAY['T1'::"text", 'T2'::"text", 'T3'::"text", 'T4'::"text", 'T5'::"text"])))
);


ALTER TABLE "public"."expedicao_tramos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sap_fbl1n_pagar" (
    "id" bigint NOT NULL,
    "simbolo_partida" "text",
    "codigo_imposto" "text",
    "empresa" "text" NOT NULL,
    "chave_referencia_1" "text",
    "conta" "text",
    "numero_documento" "text" NOT NULL,
    "razao_social_fornecedor" "text",
    "ano_mes" "text",
    "referencia" "text",
    "data_documento" "date",
    "data_lancamento" "date",
    "tipo_documento" "text",
    "estorno_com" "text",
    "conta_lancamento_contrapartida" "text",
    "data_pagamento" "date",
    "montante_moeda_doc" numeric,
    "montante_base_desconto" numeric,
    "montante_base_irf" numeric,
    "montante_irf" numeric,
    "moeda_documento" "text",
    "data_compensacao" "date",
    "doc_compensacao" "text",
    "centro" "text",
    "documento_compras" "text",
    "elemento_pep" "text",
    "imobilizado" "text",
    "loc_negocios" "text",
    "id_fiscal_1" "text",
    "id_fiscal_iva" "text",
    "texto" "text",
    "atribuicao" "text",
    "centro_lucro" "text",
    "parcelamento_tributario" "text",
    "texto_cabecalho_documento" "text",
    "bloqueio_pagamento" "text",
    "montante_mi2" numeric,
    "montante_mi3" numeric,
    "condicoes_pagamento" "text",
    "data_entrada" "date",
    "doc_faturamento" "text",
    "fornecedor" "text",
    "motivo_estorno" "text",
    "vencimento_liquido" "date",
    "vencimento_original" "date",
    "parcela" "text",
    "campos_extras" "jsonb",
    "imported_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sap_fbl1n_pagar" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."fbl1n_c_pagar" WITH ("security_invoker"='true') AS
 SELECT "id",
    "simbolo_partida",
    "codigo_imposto",
    "empresa",
    "chave_referencia_1",
    "conta",
    "numero_documento",
    "razao_social_fornecedor",
    "ano_mes",
    "referencia",
    "data_documento",
    "data_lancamento",
    "tipo_documento",
    "estorno_com",
    "conta_lancamento_contrapartida",
    "data_pagamento",
    "montante_moeda_doc",
    "montante_base_desconto",
    "montante_base_irf",
    "montante_irf",
    "moeda_documento",
    "data_compensacao",
    "doc_compensacao",
    "centro",
    "documento_compras",
    "elemento_pep",
    "imobilizado",
    "loc_negocios",
    "id_fiscal_1",
    "id_fiscal_iva",
    "texto",
    "atribuicao",
    "centro_lucro",
    "parcelamento_tributario",
    "texto_cabecalho_documento",
    "bloqueio_pagamento",
    "montante_mi2",
    "montante_mi3",
    "condicoes_pagamento",
    "data_entrada",
    "doc_faturamento",
    "fornecedor",
    "motivo_estorno",
    "vencimento_liquido",
    "vencimento_original",
    "parcela",
    "campos_extras",
    "imported_at"
   FROM "public"."sap_fbl1n_pagar";


ALTER VIEW "public"."fbl1n_c_pagar" OWNER TO "postgres";


ALTER TABLE "public"."sap_fbl1n_pagar" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."fbl1n_c_pagar_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ops_feedback" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'novo'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "page_path" "text" NOT NULL,
    "user_id" "text",
    "user_name" "text" NOT NULL,
    "user_email" "text",
    "screenshot_path" "text",
    "console_logs" "jsonb",
    "error_stack" "text",
    "user_agent" "text",
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feedback_reports_status_check" CHECK (("status" = ANY (ARRAY['novo'::"text", 'em_analise'::"text", 'resolvido'::"text", 'arquivado'::"text"]))),
    CONSTRAINT "feedback_reports_type_check" CHECK (("type" = ANY (ARRAY['bug'::"text", 'sugestao'::"text"])))
);


ALTER TABLE "public"."ops_feedback" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."feedback_reports" WITH ("security_invoker"='true') AS
 SELECT "id",
    "type",
    "status",
    "description",
    "page_path",
    "user_id",
    "user_name",
    "user_email",
    "screenshot_path",
    "console_logs",
    "error_stack",
    "user_agent",
    "admin_notes",
    "created_at",
    "updated_at"
   FROM "public"."ops_feedback";


ALTER VIEW "public"."feedback_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ops_importacoes" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "user_name" "text",
    "filename" "text",
    "records_read" integer DEFAULT 0,
    "records_inserted" integer DEFAULT 0,
    "records_updated" integer DEFAULT 0,
    "records_unchanged" integer DEFAULT 0,
    "records_eliminated" integer DEFAULT 0,
    "columns_missing" "jsonb" DEFAULT '[]'::"jsonb",
    "columns_new" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "quantity_changes" "jsonb" DEFAULT '[]'::"jsonb",
    "missing_ris" "jsonb" DEFAULT '[]'::"jsonb",
    "ignored_rows" "jsonb",
    "ignored_rows_count" integer GENERATED ALWAYS AS (COALESCE("jsonb_array_length"("ignored_rows"), 0)) STORED,
    "missing_ris_count" integer GENERATED ALWAYS AS (COALESCE("jsonb_array_length"("missing_ris"), 0)) STORED,
    "new_ris" "jsonb"
);


ALTER TABLE "public"."ops_importacoes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."import_logs" WITH ("security_invoker"='true') AS
 SELECT "id",
    "type",
    "user_name",
    "filename",
    "records_read",
    "records_inserted",
    "records_updated",
    "records_unchanged",
    "records_eliminated",
    "columns_missing",
    "columns_new",
    "created_at",
    "quantity_changes",
    "missing_ris",
    "ignored_rows",
    "ignored_rows_count",
    "missing_ris_count",
    "new_ris"
   FROM "public"."ops_importacoes";


ALTER VIEW "public"."import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_impostos" (
    "incoterms" "text" NOT NULL,
    "descricao" "text" NOT NULL
);


ALTER TABLE "public"."sup_impostos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."impostos" WITH ("security_invoker"='true') AS
 SELECT "incoterms",
    "descricao"
   FROM "public"."sup_impostos";


ALTER VIEW "public"."impostos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ipca_indice" (
    "mes" "date" NOT NULL,
    "numero_indice" numeric NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ipca_indice_numero_indice_check" CHECK (("numero_indice" > (0)::numeric))
);


ALTER TABLE "public"."ipca_indice" OWNER TO "postgres";


COMMENT ON TABLE "public"."ipca_indice" IS 'IPCA numero-indice mensal (IBGE, agregada 1737, variavel 2266, base dez/1993=100). Mantida pela Edge Function atualizar-ipca.';



CREATE TABLE IF NOT EXISTS "public"."sap_zl0169_162_catalogo" (
    "id" "text" NOT NULL,
    "material_code" "text" NOT NULL,
    "description" "text" NOT NULL,
    "technical_text" "text",
    "category" "text",
    "company" "text" DEFAULT 'TEN2'::"text",
    "unit" "text" DEFAULT 'UN'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "busca_texto" "text" GENERATED ALWAYS AS ("public"."f_unaccent"("upper"(((COALESCE("description", ''::"text") || ' '::"text") || COALESCE("technical_text", ''::"text"))))) STORED,
    "busca_desc" "text" GENERATED ALWAYS AS ("public"."f_unaccent"("upper"(COALESCE("description", ''::"text")))) STORED,
    "centro" "text",
    "eliminacao" "text",
    "elim_nivel_centro" "text",
    "status_geral" "text",
    "status_centro" "text",
    "modificado_por" "text",
    "tipo_material" "text",
    "tipo_material_desc" "text",
    "codigo_controle" "text",
    "categoria_item" "text",
    "indicador_s" "text",
    "grupo_mercadoria_codigo" "text",
    "grupo_mercadoria_desc" "text",
    "denominacao" "text",
    "material_basico" "text",
    "classe_fiscal" "text",
    "unidade_medida_alt" "text",
    "classe_avaliacao" "text",
    "numero_pf" "text",
    "idioma" "text",
    "pais" "text",
    "criado_em" "date",
    "ultima_modificacao" "date",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sap_zl0169_162_catalogo" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sap_zl0169_162_catalogo"."busca_texto" IS 'Texto de busca normalizado (description + technical_text, sem acento, maiusculo) para o indice GIN trigram materials_busca_trgm, usado por buscar_materiais(). Ver tambem materials_description_trgm (indice separado em description, usado pelo fallback de similaridade/digitacao errada da mesma RPC).';



CREATE OR REPLACE VIEW "public"."materials" WITH ("security_invoker"='true') AS
 SELECT "id",
    "material_code",
    "description",
    "technical_text",
    "category",
    "company",
    "unit",
    "is_active",
    "created_at",
    "busca_texto",
    "busca_desc",
    "centro",
    "eliminacao",
    "elim_nivel_centro",
    "status_geral",
    "status_centro",
    "modificado_por",
    "tipo_material",
    "tipo_material_desc",
    "codigo_controle",
    "categoria_item",
    "indicador_s",
    "grupo_mercadoria_codigo",
    "grupo_mercadoria_desc",
    "denominacao",
    "material_basico",
    "classe_fiscal",
    "unidade_medida_alt",
    "classe_avaliacao",
    "numero_pf",
    "idioma",
    "pais",
    "criado_em",
    "ultima_modificacao",
    "imported_at"
   FROM "public"."sap_zl0169_162_catalogo";


ALTER VIEW "public"."materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sap_mb51_mov" (
    "id" bigint NOT NULL,
    "centro" "text",
    "deposito" "text",
    "referencia" "text",
    "doc_material" "text" NOT NULL,
    "pedido" "text",
    "item" "text",
    "material" "text",
    "texto_breve_material" "text",
    "qtd_um_registro" numeric,
    "unid_medida_basica" "text",
    "montante_mi" numeric,
    "moeda" "text",
    "texto_cabecalho_doc" "text",
    "data_lancamento" "date",
    "tipo_movimento" "text",
    "hora_registro" "text",
    "um_registro" "text",
    "data_documento" "date",
    "data_entrada" "date",
    "fornecedor" "text",
    "razao_social_fornecedor" "text",
    "txt_tipo_movimento" "text",
    "nome_usuario" "text",
    "posicao_deposito" "text",
    "elemento_pep" "text",
    "imobilizado" "text",
    "chave_unica" "text",
    "campos_extras" "jsonb",
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sap_mb51_mov" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."mb51_mov_estoque" WITH ("security_invoker"='true') AS
 SELECT "id",
    "centro",
    "deposito",
    "referencia",
    "doc_material",
    "pedido",
    "item",
    "material",
    "texto_breve_material",
    "qtd_um_registro",
    "unid_medida_basica",
    "montante_mi",
    "moeda",
    "texto_cabecalho_doc",
    "data_lancamento",
    "tipo_movimento",
    "hora_registro",
    "um_registro",
    "data_documento",
    "data_entrada",
    "fornecedor",
    "razao_social_fornecedor",
    "txt_tipo_movimento",
    "nome_usuario",
    "posicao_deposito",
    "elemento_pep",
    "imobilizado",
    "chave_unica",
    "campos_extras",
    "imported_at",
    "created_at"
   FROM "public"."sap_mb51_mov";


ALTER VIEW "public"."mb51_mov_estoque" OWNER TO "postgres";


ALTER TABLE "public"."sap_mb51_mov" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."mb51_mov_estoque_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sap_me3n_contrato" (
    "id" bigint NOT NULL,
    "documento_compras" "text",
    "data_documento" "text",
    "fornecedor" "text",
    "centro" "text",
    "item" "text",
    "material" "text",
    "texto_breve" "text",
    "qtd_solicit_anterior" numeric,
    "unidade_preco" "text",
    "preco_liquido" numeric,
    "valor_solicitado" numeric,
    "valor_efetivo" numeric,
    "qtd_prev_pendente" numeric,
    "valor_pendente" numeric,
    "a_fornecer_qtd" numeric,
    "a_fornecer_valor" numeric,
    "ainda_faturar_qtd" numeric,
    "ainda_faturar_valor" numeric,
    "fim_validade" "text",
    "inicio_validade" "text",
    "codigo_eliminacao" "text",
    "um_pedido" "text",
    "moeda" "text",
    "estado_liberacao" "text",
    "codigo_liberacao" "text",
    "valor_liquido_pedido" numeric,
    "requisitante" "text",
    "historico_pedido" "text",
    "criado_por" "text",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sap_me3n_contrato" OWNER TO "postgres";


ALTER TABLE "public"."sap_me3n_contrato" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."me3m_contratos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."me3n_contratos" WITH ("security_invoker"='true') AS
 SELECT "id",
    "documento_compras",
    "data_documento",
    "fornecedor",
    "centro",
    "item",
    "material",
    "texto_breve",
    "qtd_solicit_anterior",
    "unidade_preco",
    "preco_liquido",
    "valor_solicitado",
    "valor_efetivo",
    "qtd_prev_pendente",
    "valor_pendente",
    "a_fornecer_qtd",
    "a_fornecer_valor",
    "ainda_faturar_qtd",
    "ainda_faturar_valor",
    "fim_validade",
    "inicio_validade",
    "codigo_eliminacao",
    "um_pedido",
    "moeda",
    "estado_liberacao",
    "codigo_liberacao",
    "valor_liquido_pedido",
    "requisitante",
    "historico_pedido",
    "criado_por",
    "imported_at"
   FROM "public"."sap_me3n_contrato";


ALTER VIEW "public"."me3n_contratos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sap_zl0132_po" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material" "text",
    "txt_breve" "text",
    "cod_forn" "text",
    "cnpj" "text",
    "fornecedor" "text",
    "regiao_uf" "text",
    "data_pedido" "date",
    "campos_extras" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "preco_liquido" numeric,
    "ri" "text",
    "n_acomp" "text",
    "eflag_e" "text",
    "reqc" "text",
    "data_rc" "date",
    "tpdc" "text",
    "requisitante" "text",
    "criado_por_rc" "text",
    "item" "text",
    "tmatt" "text",
    "grp_mercads" "text",
    "empremp" "text",
    "cen_cen" "text",
    "dep_dep" "text",
    "tipo_doc_compra" "text",
    "doc_compra" "text",
    "criado_por_pedido" "text",
    "data_doc" "date",
    "dt_remessa" "date",
    "data_migo" "date",
    "est_liber" "text",
    "estr" "text",
    "codigo_liberacao_doc_compra" "text",
    "itm_liberacao" "text",
    "criado_por_liberacao" "text",
    "qtd_pedido" numeric,
    "por" "text",
    "qtd_fornecida" numeric,
    "crf" "text",
    "ump_1" "text",
    "unidade_medida_pedido" "text",
    "preco_liquido_unit" numeric,
    "moeda_1" "text",
    "valor_em_brl" numeric,
    "moeda_2" "text",
    "ump_2" "text",
    "valor_liquido" numeric,
    "fornecedor_codigo" "text",
    "cnpj_fornecedor" "text",
    "fornecedor_nome" "text",
    "req_cotacao" "text",
    "data_pc_sc" "date",
    "item_rc_cotacao" "text",
    "upp" "text",
    "valor_efetivo" numeric,
    "moeda_3" "text",
    "doc_compra_ref" "text",
    "itm_ref" "text",
    "ftf" "text",
    "posicao" "text",
    "condicao_pagamento" "text",
    "criado_por_condicao" "text",
    "contrato" "text",
    "item_contrato" "text",
    "cn_lcr_parcs" "text",
    "categoria" "text",
    "grupo_mercadoria_curto" "text",
    "ci" "text",
    "unidade_medida_basica" "text",
    "ump_3" "text",
    "modificado_em" timestamp with time zone
);


ALTER TABLE "public"."sap_zl0132_po" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_benchmark_material" AS
 WITH "compras" AS (
         SELECT "p"."material",
            "p"."fornecedor_codigo",
            "p"."doc_compra",
            "max"("p"."txt_breve") AS "txt_breve",
            "max"("p"."data_doc") AS "data_doc",
            "sum"("p"."qtd_pedido") AS "qtd",
            "sum"("p"."valor_em_brl") AS "valor",
            ("sum"("p"."valor_em_brl") / "sum"("p"."qtd_pedido")) AS "preco_unit"
           FROM "public"."sap_zl0132_po" "p"
          WHERE ((("lower"(COALESCE("p"."crf", ''::"text")) = 'x'::"text") OR (COALESCE("p"."qtd_fornecida", (0)::numeric) > (0)::numeric)) AND ("p"."material" IS NOT NULL) AND ("p"."data_doc" IS NOT NULL) AND ("p"."data_doc" < '2026-01-01'::"date") AND (COALESCE("p"."qtd_pedido", (0)::numeric) > (0)::numeric) AND (COALESCE("p"."valor_em_brl", (0)::numeric) > (0)::numeric))
          GROUP BY "p"."material", "p"."fornecedor_codigo", "p"."doc_compra"
        ), "ref" AS (
         SELECT "ipca_indice"."numero_indice" AS "idx_ref"
           FROM "public"."ipca_indice"
          ORDER BY "ipca_indice"."mes" DESC
         LIMIT 1
        ), "piso" AS (
         SELECT "ipca_indice"."numero_indice" AS "idx_piso"
           FROM "public"."ipca_indice"
          ORDER BY "ipca_indice"."mes"
         LIMIT 1
        ), "corrigidas" AS (
         SELECT "c"."material",
            "c"."fornecedor_codigo",
            "c"."doc_compra",
            "c"."txt_breve",
            "c"."data_doc",
            "c"."qtd",
            "c"."valor",
            "c"."preco_unit",
            (( SELECT "ref"."idx_ref"
                   FROM "ref") / COALESCE("i"."numero_indice", ( SELECT "piso"."idx_piso"
                   FROM "piso"))) AS "fator_ipca",
            ("c"."preco_unit" * (( SELECT "ref"."idx_ref"
                   FROM "ref") / COALESCE("i"."numero_indice", ( SELECT "piso"."idx_piso"
                   FROM "piso")))) AS "preco_corrigido"
           FROM ("compras" "c"
             LEFT JOIN "public"."ipca_indice" "i" ON (("i"."mes" = ("date_trunc"('month'::"text", ("c"."data_doc")::timestamp with time zone))::"date")))
        )
 SELECT "material",
    "max"("txt_breve") AS "txt_breve",
    "count"(*) AS "n_compras",
    "min"("data_doc") AS "primeira_compra",
    "max"("data_doc") AS "ultima_compra",
    ("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("qtd")::double precision)))::numeric AS "qtd_mediana",
    ("percentile_cont"((0.25)::double precision) WITHIN GROUP (ORDER BY (("preco_corrigido")::double precision)))::numeric AS "ref_p25",
    ("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("preco_corrigido")::double precision)))::numeric AS "ref_p50",
    ("percentile_cont"((0.75)::double precision) WITHIN GROUP (ORDER BY (("preco_corrigido")::double precision)))::numeric AS "ref_p75",
    COALESCE("stddev_pop"("ln"("preco_corrigido")), (0)::numeric) AS "sd_log",
        CASE
            WHEN (("count"(*) >= 5) AND (COALESCE("stddev_pop"("ln"("preco_corrigido")), (0)::numeric) < 0.35)) THEN 'Alta'::"text"
            WHEN (("count"(*) >= 3) AND (COALESCE("stddev_pop"("ln"("preco_corrigido")), (0)::numeric) < 0.80)) THEN 'Média'::"text"
            ELSE 'Baixa'::"text"
        END AS "confianca"
   FROM "corrigidas"
  GROUP BY "material"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."mv_benchmark_material" OWNER TO "postgres";


COMMENT ON MATERIALIZED VIEW "public"."mv_benchmark_material" IS 'Referencia de preco por material (mediana e P25/P75 do historico anterior a 2026 com alguma entrega registrada, corrigido pelo IPCA ate o mes de referencia), com grau de confianca derivado da dispersao.';



CREATE MATERIALIZED VIEW "public"."mv_historico_pedidos" AS
 SELECT "material",
    "max"("txt_breve") AS "txt_breve",
    "fornecedor_codigo" AS "cod_forn",
    "cnpj_fornecedor" AS "cnpj",
    "max"("fornecedor_nome") AS "fornecedor",
    "max"("regiao_uf") AS "regiao_uf",
    "max"("grp_mercads") AS "grp_mercads",
        CASE
            WHEN ("material" ~~ '100000000%'::"text") THEN 'Projeto'::"text"
            ELSE 'Consumo'::"text"
        END AS "tipo_item",
    "doc_compra",
    "max"("reqc") AS "reqc",
    "max"("data_doc") AS "data_doc",
    "sum"(COALESCE("qtd_pedido", (0)::numeric)) AS "qtd_pedido",
    "sum"(COALESCE("qtd_fornecida", (0)::numeric)) AS "qtd_fornecida",
    "sum"(COALESCE("valor_em_brl", (0)::numeric)) AS "valor_liquido",
        CASE
            WHEN ("sum"(COALESCE("qtd_pedido", (0)::numeric)) > (0)::numeric) THEN ("sum"(COALESCE("valor_em_brl", (0)::numeric)) / "sum"(COALESCE("qtd_pedido", (0)::numeric)))
            ELSE NULL::numeric
        END AS "preco_liquido_unit",
    (("sum"(COALESCE("qtd_fornecida", (0)::numeric)) > (0)::numeric) AND ("sum"(COALESCE("qtd_fornecida", (0)::numeric)) < "sum"(COALESCE("qtd_pedido", (0)::numeric)))) AS "pedido_parcial"
   FROM "public"."sap_zl0132_po" "p"
  WHERE (("lower"(COALESCE("crf", ''::"text")) = 'x'::"text") OR (COALESCE("qtd_fornecida", (0)::numeric) > (0)::numeric))
  GROUP BY "material", "fornecedor_codigo", "cnpj_fornecedor", "doc_compra",
        CASE
            WHEN ("material" ~~ '100000000%'::"text") THEN 'Projeto'::"text"
            ELSE 'Consumo'::"text"
        END
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."mv_historico_pedidos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_sap_pedidos_enriquecidos" AS
 SELECT "ri",
    "n_acomp",
    "eflag_e",
    "reqc",
    "data_rc",
    "tpdc",
    "requisitante",
    "criado_por_rc",
    "item",
    "material",
    "txt_breve",
    "tmatt",
    "grp_mercads",
    "empremp",
    "cen_cen",
    "dep_dep",
    "tipo_doc_compra",
    "doc_compra",
    "criado_por_pedido",
    "data_doc",
    "dt_remessa",
    "data_migo",
    "est_liber",
    "estr",
    "codigo_liberacao_doc_compra",
    "itm_liberacao",
    "criado_por_liberacao",
    "qtd_pedido",
    "por",
    "qtd_fornecida",
    "crf",
    "ump_1",
    "unidade_medida_pedido",
    "preco_liquido_unit",
    "moeda_1",
    "valor_em_brl",
    "moeda_2",
    "ump_2",
    "valor_liquido",
    "fornecedor_codigo",
    "cnpj_fornecedor",
    "fornecedor_nome",
    "regiao_uf",
    "req_cotacao",
    "data_pc_sc",
    "item_rc_cotacao",
    "upp",
    "valor_efetivo",
    "moeda_3",
    "doc_compra_ref",
    "itm_ref",
    "ftf",
    "posicao",
    "condicao_pagamento",
    "criado_por_condicao",
    "modificado_em",
    "contrato",
    "item_contrato",
    "cn_lcr_parcs",
    "categoria",
    "grupo_mercadoria_curto",
    "ci",
    "unidade_medida_basica",
    "ump_3",
    "campos_extras",
        CASE
            WHEN ("data_migo" IS NOT NULL) THEN 'Entregue'::"text"
            ELSE 'Não Entregue'::"text"
        END AS "status_entrega",
        CASE
            WHEN (("data_migo" IS NULL) AND ("dt_remessa" < CURRENT_DATE)) THEN GREATEST(0, (EXTRACT(day FROM (CURRENT_TIMESTAMP - (("dt_remessa")::timestamp without time zone)::timestamp with time zone)))::integer)
            ELSE 0
        END AS "dias_atrasado"
   FROM "public"."sap_zl0132_po";


ALTER VIEW "public"."vw_sap_pedidos_enriquecidos" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_pedido_atual_por_ri" AS
 SELECT DISTINCT ON ("ri") "ri",
    "doc_compra",
    "item",
    "fornecedor_codigo",
    "fornecedor_nome",
    "data_doc",
    "data_migo",
    "dt_remessa",
    "criado_por_pedido",
    "status_entrega",
    "dias_atrasado"
   FROM "public"."vw_sap_pedidos_enriquecidos"
  ORDER BY "ri",
        CASE
            WHEN (COALESCE("eflag_e", ''::"text") = 'L'::"text") THEN 1
            ELSE 0
        END, "data_doc" DESC NULLS LAST, "modificado_em" DESC NULLS LAST
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."mv_pedido_atual_por_ri" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "ri" "text" NOT NULL,
    "n_acomp" "text",
    "eflag_e" "text",
    "reqc" "text",
    "data_rc" "date",
    "tpdc" "text",
    "requisitante" "text",
    "criado_por_rc" "text",
    "item" "text",
    "material" "text",
    "txt_breve" "text",
    "tmatt" "text",
    "grp_mercads" "text",
    "empremp" "text",
    "cen_cen" "text",
    "dep_dep" "text",
    "tipo_doc_compra" "text",
    "doc_compra" "text",
    "criado_por_pedido" "text",
    "data_doc" "date",
    "dt_remessa" "date",
    "data_migo" "date",
    "est_liber" "text",
    "estr" "text",
    "codigo_liberacao_doc_compra" "text",
    "itm_liberacao" "text",
    "criado_por_liberacao" "text",
    "qtd_pedido" numeric,
    "por" "text",
    "qtd_fornecida" numeric,
    "crf" "text",
    "ump_1" "text",
    "unidade_medida_pedido" "text",
    "preco_liquido_unit" numeric,
    "moeda_1" "text",
    "valor_em_brl" numeric,
    "moeda_2" "text",
    "ump_2" "text",
    "valor_liquido" numeric,
    "fornecedor_codigo" "text",
    "cnpj_fornecedor" "text",
    "fornecedor_nome" "text",
    "regiao_uf" "text",
    "req_cotacao" "text",
    "data_pc_sc" "date",
    "item_rc_cotacao" "text",
    "upp" "text",
    "valor_efetivo" numeric,
    "moeda_3" "text",
    "doc_compra_ref" "text",
    "itm_ref" "text",
    "ftf" "text",
    "posicao" "text",
    "condicao_pagamento" "text",
    "criado_por_condicao" "text",
    "modificado_em" timestamp with time zone,
    "contrato" "text",
    "item_contrato" "text",
    "cn_lcr_parcs" "text",
    "categoria" "text",
    "grupo_mercadoria_curto" "text",
    "ci" "text",
    "unidade_medida_basica" "text",
    "ump_3" "text",
    "campos_extras" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sap_me5a_rc" (
    "ri" "text" NOT NULL,
    "tipo_de_documento" "text",
    "requisicao_de_compra" "text",
    "item_reqc" "text",
    "data_da_solicitacao" "date",
    "requisitante" "text",
    "area_solicitante" "text",
    "material" "text",
    "texto_breve" "text",
    "qtd_solicitada" numeric,
    "unidade_de_medida" "text",
    "status_processamento" "text",
    "codigo_de_eliminacao" boolean DEFAULT false,
    "categoria_do_item" "text",
    "ctg_class_cont" "text",
    "tipo_data_de_remessa" "text",
    "remessas_de_ate" "date",
    "grupo_de_mercadorias" "text",
    "centro" "text",
    "deposito" "text",
    "grupo_de_compradores" "text",
    "n_acompanhamento" "text",
    "fornecedor_fixo" "text",
    "centro_fornecedor" "text",
    "organiz_compras" "text",
    "contrato_basico" "text",
    "it_contrato_superior" "text",
    "n_de_reqsc" numeric,
    "criado_por" "text",
    "data_do_pedido" "date",
    "moeda" "text",
    "pedido" "text",
    "item_do_pedido" "text",
    "apelido" "text",
    "aplicacao" "text",
    "data_de_remessa" "date",
    "codigo_de_bloqueio" "text",
    "codigo_de_liberacao" "text",
    "concluida" "text",
    "data_da_liberacao" "date",
    "data_pedido_origem" "date",
    "descricao_do_grupo_de_compradores" "text",
    "marca_da_peca" "text",
    "modelo" "text",
    "n_material_fornecedor" "text",
    "n_peca_fabricante" "text",
    "nome_do_fornecedor" "text",
    "peca_original" "text",
    "quantidade_pedida" numeric,
    "sugestao_local_compra" "text",
    "tempo_procmto_em" numeric,
    "tipo_de_transporte" "text",
    "requisicao_externa" "text",
    "obs_comprador" "text",
    "data_entrega_prevista" "date",
    "presente_ultima_carga" boolean DEFAULT true,
    "eliminado" boolean DEFAULT false,
    "campos_extras" "jsonb" DEFAULT '{}'::"jsonb",
    "obs_updated_at" timestamp with time zone,
    "obs_updated_by" "text",
    "item_status" "text" DEFAULT 'buscar_fornecedores'::"text",
    "item_status_updated_at" timestamp with time zone,
    "item_status_updated_by" "text"
);


ALTER TABLE "public"."sap_me5a_rc" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_sap_requisicoes_enriquecidas" AS
 SELECT "r"."ri",
    "r"."tipo_de_documento",
    "r"."requisicao_de_compra",
    "r"."item_reqc",
    "r"."data_da_solicitacao",
    "r"."requisitante",
    "r"."area_solicitante",
    "r"."material",
    "r"."texto_breve",
    "r"."qtd_solicitada",
    "r"."unidade_de_medida",
    "r"."status_processamento",
    "r"."codigo_de_eliminacao",
    "r"."categoria_do_item",
    "r"."ctg_class_cont",
    "r"."tipo_data_de_remessa",
    "r"."remessas_de_ate",
    "r"."grupo_de_mercadorias",
    "r"."centro",
    "r"."deposito",
    "r"."grupo_de_compradores",
    "r"."n_acompanhamento",
    "r"."fornecedor_fixo",
    "r"."centro_fornecedor",
    "r"."organiz_compras",
    "r"."contrato_basico",
    "r"."it_contrato_superior",
    "r"."n_de_reqsc",
    "r"."criado_por",
    "r"."data_do_pedido",
    "r"."moeda",
    "r"."pedido",
    "r"."item_do_pedido",
    "r"."apelido",
    "r"."aplicacao",
    "r"."data_de_remessa",
    "r"."codigo_de_bloqueio",
    "r"."codigo_de_liberacao",
    "r"."concluida",
    "r"."data_da_liberacao",
    "r"."data_pedido_origem",
    "r"."descricao_do_grupo_de_compradores",
    "r"."marca_da_peca",
    "r"."modelo",
    "r"."n_material_fornecedor",
    "r"."n_peca_fabricante",
    "r"."nome_do_fornecedor",
    "r"."peca_original",
    "r"."quantidade_pedida",
    "r"."sugestao_local_compra",
    "r"."tempo_procmto_em",
    "r"."tipo_de_transporte",
    "r"."requisicao_externa",
    "r"."obs_comprador",
    "r"."data_entrega_prevista",
    "r"."presente_ultima_carga",
    "r"."eliminado",
    "r"."campos_extras",
    "r"."obs_updated_at",
    "r"."obs_updated_by",
    "p"."doc_compra" AS "documento_compra",
    "p"."item" AS "item_pedido",
    "p"."fornecedor_codigo" AS "fornecedor_code",
    "p"."fornecedor_nome" AS "fornecedor_name",
    "p"."data_doc" AS "data_pedido",
    "p"."data_migo",
    "p"."dt_remessa" AS "data_entrega_sap",
    "p"."status_entrega",
    "p"."dias_atrasado",
        CASE
            WHEN ("r"."tipo_de_documento" = 'ZR01'::"text") THEN 'Normal'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR02'::"text") THEN 'Urgente'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR03'::"text") THEN 'Máquina Parada'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR04'::"text") THEN 'Equipamento pesado'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR05'::"text") THEN 'Exportação normal'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR06'::"text") THEN 'Exportação urgente'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR07'::"text") THEN 'Exportação máquina parada'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR08'::"text") THEN 'Exportação equipamento pesado'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR09'::"text") THEN 'Orçamento'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR10'::"text") THEN 'Subempreitada'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR11'::"text") THEN 'Serviço - Normal'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR16'::"text") THEN 'Serviço - Urgente'::"text"
            WHEN ("r"."tipo_de_documento" = 'ZR17'::"text") THEN 'Serviço - MP'::"text"
            ELSE COALESCE("r"."tipo_de_documento", 'Normal'::"text")
        END AS "natureza",
        CASE
            WHEN (("p"."doc_compra" IS NULL) OR ("p"."doc_compra" = ''::"text")) THEN 'Sem PO'::"text"
            ELSE 'Processado'::"text"
        END AS "status_requisicao",
        CASE
            WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
            WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
            WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
            ELSE 30
        END AS "lead_time_compras_meta",
        CASE
            WHEN ("p"."data_migo" IS NOT NULL) THEN "p"."data_migo"
            ELSE CURRENT_DATE
        END AS "data_referencia_prazo",
    GREATEST(0, ((EXTRACT(day FROM (
        CASE
            WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
            ELSE CURRENT_TIMESTAMP
        END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
        CASE
            WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
            WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
            WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
            ELSE 30
        END)) AS "atraso_comprador",
        CASE
            WHEN ((
            CASE
                WHEN (("p"."doc_compra" IS NULL) OR ("p"."doc_compra" = ''::"text")) THEN 'Sem PO'::"text"
                ELSE 'Processado'::"text"
            END = 'Processado'::"text") AND ("p"."data_migo" IS NOT NULL)) THEN 'Concluído'::"text"
            WHEN ("r"."status_processamento" = 'A'::"text") THEN 'Em Cotação'::"text"
            WHEN (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) > 30) THEN 'Crítico - Ação Urgente'::"text"
            WHEN (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) > 15) THEN 'Atrasado'::"text"
            WHEN (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) > 0) THEN 'Em Andamento'::"text"
            ELSE 'No Prazo'::"text"
        END AS "status_atualizado",
        CASE
            WHEN (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) <= 0) THEN 'Sem Atraso'::"text"
            WHEN ((GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) >= 1) AND (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) <= 7)) THEN '1-7 dias'::"text"
            WHEN ((GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) >= 8) AND (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) <= 15)) THEN '8-15 dias'::"text"
            WHEN ((GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) >= 16) AND (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) <= 30)) THEN '16-30 dias'::"text"
            ELSE 'Acima 30 dias'::"text"
        END AS "faixa_atraso",
        CASE
            WHEN ((GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) > 15) AND ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"]))) THEN '⚠️ ESCALAR IMEDIATAMENTE'::"text"
            WHEN (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) > 30) THEN '⚠️ AÇÃO URGENTE'::"text"
            WHEN (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) > 15) THEN '⚡ ACOMPANHAR'::"text"
            WHEN (GREATEST(0, ((EXTRACT(day FROM (
            CASE
                WHEN ("p"."data_migo" IS NOT NULL) THEN (("p"."data_migo")::timestamp without time zone)::timestamp with time zone
                ELSE CURRENT_TIMESTAMP
            END - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer -
            CASE
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR02'::"text", 'ZR06'::"text", 'ZR16'::"text"])) THEN 6
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR03'::"text", 'ZR07'::"text", 'ZR17'::"text"])) THEN 2
                WHEN ("r"."tipo_de_documento" = ANY (ARRAY['ZR01'::"text", 'ZR05'::"text", 'ZR11'::"text"])) THEN 15
                ELSE 30
            END)) > 7) THEN '📋 MONITORAR'::"text"
            ELSE '✅ OK'::"text"
        END AS "alerta",
    (EXTRACT(day FROM (CURRENT_TIMESTAMP - (("r"."data_da_solicitacao")::timestamp without time zone)::timestamp with time zone)))::integer AS "dias_em_aberto",
    "r"."item_status",
    "r"."item_status_updated_at",
    "r"."item_status_updated_by",
    "p"."criado_por_pedido"
   FROM ("public"."sap_me5a_rc" "r"
     LEFT JOIN "public"."mv_pedido_atual_por_ri" "p" ON (("r"."ri" = "p"."ri")));


ALTER VIEW "public"."vw_sap_requisicoes_enriquecidas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_demandas" AS
 SELECT "ri",
    "tipo_de_documento",
    "requisicao_de_compra",
    "item_reqc",
    "data_da_solicitacao",
    "requisitante",
    "area_solicitante",
    "material",
    "texto_breve",
    "qtd_solicitada",
    "unidade_de_medida",
    "status_processamento",
    "codigo_de_eliminacao",
    "categoria_do_item",
    "ctg_class_cont",
    "tipo_data_de_remessa",
    "remessas_de_ate",
    "grupo_de_mercadorias",
    "centro",
    "deposito",
    "grupo_de_compradores",
    "n_acompanhamento",
    "fornecedor_fixo",
    "centro_fornecedor",
    "organiz_compras",
    "contrato_basico",
    "it_contrato_superior",
    "n_de_reqsc",
    "criado_por",
    "data_do_pedido",
    "moeda",
    "pedido",
    "item_do_pedido",
    "apelido",
    "aplicacao",
    "data_de_remessa",
    "codigo_de_bloqueio",
    "codigo_de_liberacao",
    "concluida",
    "data_da_liberacao",
    "data_pedido_origem",
    "descricao_do_grupo_de_compradores",
    "marca_da_peca",
    "modelo",
    "n_material_fornecedor",
    "n_peca_fabricante",
    "nome_do_fornecedor",
    "peca_original",
    "quantidade_pedida",
    "sugestao_local_compra",
    "tempo_procmto_em",
    "tipo_de_transporte",
    "requisicao_externa",
    "obs_comprador",
    "data_entrega_prevista",
    "presente_ultima_carga",
    "eliminado",
    "campos_extras",
    "obs_updated_at",
    "obs_updated_by",
    "documento_compra",
    "item_pedido",
    "fornecedor_code",
    "fornecedor_name",
    "data_pedido",
    "data_migo",
    "data_entrega_sap",
    "status_entrega",
    "dias_atrasado",
    "natureza",
    "status_requisicao",
    "lead_time_compras_meta",
    "data_referencia_prazo",
    "atraso_comprador",
    "status_atualizado",
    "faixa_atraso",
    "alerta",
    "dias_em_aberto",
    "item_status",
    "item_status_updated_at",
    "item_status_updated_by",
        CASE
            WHEN ("left"(COALESCE("requisicao_de_compra", ''::"text"), 2) = ANY (ARRAY['11'::"text", '12'::"text", '13'::"text"])) THEN 'material'::"text"
            WHEN ("left"(COALESCE("requisicao_de_compra", ''::"text"), 2) = '17'::"text") THEN 'servico'::"text"
            ELSE 'outro'::"text"
        END AS "tipo_demanda",
        CASE
            WHEN ("left"(COALESCE("requisicao_de_compra", ''::"text"), 2) = '11'::"text") THEN 'normal'::"text"
            WHEN ("left"(COALESCE("requisicao_de_compra", ''::"text"), 2) = '12'::"text") THEN 'urgente'::"text"
            WHEN ("left"(COALESCE("requisicao_de_compra", ''::"text"), 2) = '13'::"text") THEN 'maquina_parada'::"text"
            ELSE NULL::"text"
        END AS "criticidade"
   FROM "public"."vw_sap_requisicoes_enriquecidas" "v";


ALTER VIEW "public"."vw_demandas" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_material_sinais" AS
 WITH "saldo" AS (
         SELECT "sap_zl0024_stk"."material",
            "sum"("sap_zl0024_stk"."quantidade") AS "qtd_estoque",
            "array_agg"(DISTINCT "sap_zl0024_stk"."deposito") AS "depositos"
           FROM "public"."sap_zl0024_stk"
          WHERE (("sap_zl0024_stk"."quantidade" > (0)::numeric) AND ("sap_zl0024_stk"."deposito" <> ALL (ARRAY['0006'::"text", '0090'::"text", '0105'::"text"])))
          GROUP BY "sap_zl0024_stk"."material"
        ), "demanda" AS (
         SELECT "vw_demandas"."material",
            ("count"(*))::integer AS "rms_12m",
            "max"("vw_demandas"."data_da_solicitacao") AS "ultima_rm",
            "array_agg"(DISTINCT "vw_demandas"."area_solicitante") FILTER (WHERE ("vw_demandas"."area_solicitante" IS NOT NULL)) AS "areas",
            ("count"(*) FILTER (WHERE ("vw_demandas"."pedido" IS NULL)))::integer AS "rms_sem_pedido"
           FROM "public"."vw_demandas"
          WHERE (("vw_demandas"."data_da_solicitacao" > (CURRENT_DATE - '1 year'::interval)) AND (COALESCE("vw_demandas"."eliminado", false) = false))
          GROUP BY "vw_demandas"."material"
        ), "rm_aberta_detalhe" AS (
         SELECT DISTINCT ON ("vw_demandas"."material") "vw_demandas"."material",
            "vw_demandas"."requisicao_de_compra" AS "rm_aberta",
            "vw_demandas"."qtd_solicitada" AS "qtd_rm_aberta"
           FROM "public"."vw_demandas"
          WHERE (("vw_demandas"."pedido" IS NULL) AND ("vw_demandas"."data_da_solicitacao" > (CURRENT_DATE - '1 year'::interval)) AND (COALESCE("vw_demandas"."eliminado", false) = false))
          ORDER BY "vw_demandas"."material", "vw_demandas"."data_da_solicitacao"
        ), "comprado" AS (
         SELECT DISTINCT ON ("pedidos"."material") "pedidos"."material",
            "pedidos"."doc_compra" AS "pedido_aberto",
            ("pedidos"."qtd_pedido" - COALESCE("pedidos"."qtd_fornecida", (0)::numeric)) AS "qtd_pedido_aberto",
            "pedidos"."dt_remessa" AS "chega_em"
           FROM "public"."pedidos"
          WHERE (("pedidos"."qtd_fornecida" IS NULL) OR ("pedidos"."qtd_fornecida" < "pedidos"."qtd_pedido"))
          ORDER BY "pedidos"."material", "pedidos"."dt_remessa"
        )
 SELECT "m"."material_code",
    "s"."qtd_estoque",
    "s"."depositos",
    "d"."rms_12m",
    "d"."ultima_rm",
    "d"."areas",
    "d"."rms_sem_pedido",
    "r"."rm_aberta",
    "r"."qtd_rm_aberta",
    "c"."pedido_aberto",
    "c"."qtd_pedido_aberto",
    "c"."chega_em"
   FROM (((("public"."sap_zl0169_162_catalogo" "m"
     LEFT JOIN "saldo" "s" ON (("s"."material" = "m"."material_code")))
     LEFT JOIN "demanda" "d" ON (("d"."material" = "m"."material_code")))
     LEFT JOIN "rm_aberta_detalhe" "r" ON (("r"."material" = "m"."material_code")))
     LEFT JOIN "comprado" "c" ON (("c"."material" = "m"."material_code")))
  WHERE "m"."is_active"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."mv_material_sinais" OWNER TO "postgres";


COMMENT ON MATERIALIZED VIEW "public"."mv_material_sinais" IS 'Sinais de estoque/demanda/pedido para a busca de material. Saldo exclui os depositos 0006, 0090 e 0105. qtd_rm_aberta e qtd_pedido_aberto amarram quantidade ao mesmo registro que rm_aberta/pedido_aberto/chega_em (distinct on por data). Cobertura de estoque ~62% (estoque.material mistura formatos de codigo) — ver documentos/superpowers/specs/2026-07-28-redesenho-modulo-solicitacoes-design.md.';



CREATE OR REPLACE VIEW "public"."notifications" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "title",
    "description",
    "type",
    "is_read",
    "request_id",
    "request_number",
    "created_at",
    "context_key"
   FROM "public"."core_notificacoes";


ALTER VIEW "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sap_requisicoes_observacoes" (
    "id" "text" NOT NULL,
    "ri" "text" NOT NULL,
    "campo_alterado" "text" NOT NULL,
    "valor_anterior" "text",
    "valor_novo" "text",
    "user_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sap_requisicoes_observacoes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."obs_historico" WITH ("security_invoker"='true') AS
 SELECT "id",
    "ri",
    "campo_alterado",
    "valor_anterior",
    "valor_novo",
    "user_name",
    "created_at"
   FROM "public"."sap_requisicoes_observacoes";


ALTER VIEW "public"."obs_historico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ops_eventos_uso" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text",
    "user_name" "text",
    "email" "text",
    "session_id" "text",
    "event_type" "text" NOT NULL,
    "path" "text",
    "page_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['login'::"text", 'page_view'::"text"])))
);


ALTER TABLE "public"."ops_eventos_uso" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."pedidosforn" WITH ("security_invoker"='true') AS
 SELECT "id",
    "material",
    "txt_breve",
    "cod_forn",
    "cnpj",
    "fornecedor",
    "regiao_uf",
    "data_pedido",
    "campos_extras",
    "created_at",
    "updated_at",
    "preco_liquido",
    "ri",
    "n_acomp",
    "eflag_e",
    "reqc",
    "data_rc",
    "tpdc",
    "requisitante",
    "criado_por_rc",
    "item",
    "tmatt",
    "grp_mercads",
    "empremp",
    "cen_cen",
    "dep_dep",
    "tipo_doc_compra",
    "doc_compra",
    "criado_por_pedido",
    "data_doc",
    "dt_remessa",
    "data_migo",
    "est_liber",
    "estr",
    "codigo_liberacao_doc_compra",
    "itm_liberacao",
    "criado_por_liberacao",
    "qtd_pedido",
    "por",
    "qtd_fornecida",
    "crf",
    "ump_1",
    "unidade_medida_pedido",
    "preco_liquido_unit",
    "moeda_1",
    "valor_em_brl",
    "moeda_2",
    "ump_2",
    "valor_liquido",
    "fornecedor_codigo",
    "cnpj_fornecedor",
    "fornecedor_nome",
    "req_cotacao",
    "data_pc_sc",
    "item_rc_cotacao",
    "upp",
    "valor_efetivo",
    "moeda_3",
    "doc_compra_ref",
    "itm_ref",
    "ftf",
    "posicao",
    "condicao_pagamento",
    "criado_por_condicao",
    "contrato",
    "item_contrato",
    "cn_lcr_parcs",
    "categoria",
    "grupo_mercadoria_curto",
    "ci",
    "unidade_medida_basica",
    "ump_3",
    "modificado_em"
   FROM "public"."sap_zl0132_po";


ALTER VIEW "public"."pedidosforn" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."port_briefing_participantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sessao_id" "uuid" NOT NULL,
    "data" "date" DEFAULT CURRENT_DATE NOT NULL,
    "empresa" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "cpf" "text" NOT NULL,
    "funcao" "text" NOT NULL,
    "assinatura_digital" "text",
    "validade_dias" integer DEFAULT 90 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."port_briefing_participantes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."port_briefing_sessoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_formulario" "text" DEFAULT 'FRM.SGP-0013'::"text" NOT NULL,
    "numero_protocolo" "text" NOT NULL,
    "tema_treinamento" "text" DEFAULT 'BRIEFING DE SEGURANÇA'::"text" NOT NULL,
    "tipo" "text" DEFAULT 'INTERNO'::"text" NOT NULL,
    "data" "date" DEFAULT CURRENT_DATE NOT NULL,
    "instrutor_responsavel" "text" NOT NULL,
    "conteudo_programatico" "text" DEFAULT '1. Apresentação do Layout da Fábrica TEN - Vídeo institucional e vídeo de segurança;
2. Apresentação dos procedimentos e rotinas de segurança;
3. Protocolo de proibição do uso do celular nas áreas produtivas da TEN.'::"text" NOT NULL,
    "termo_responsabilidade" "text" DEFAULT 'Declaro ter recebido as orientações de segurança aplicáveis à minha visita ou atividade, estar ciente das regras gerais de conduta da fábrica e portar as documentações e EPIs exigidos para a minha atuação. Assumo a responsabilidade por qualquer irregularidade constatada em minhas documentações e/ou desvios de conduta durante minha permanência.'::"text" NOT NULL,
    "status" "text" DEFAULT 'ABERTA'::"text" NOT NULL,
    "observacoes" "text",
    "criado_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "port_briefing_sessoes_status_check" CHECK (("status" = ANY (ARRAY['ABERTA'::"text", 'CONCLUIDA'::"text", 'CANCELADA'::"text"]))),
    CONSTRAINT "port_briefing_sessoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['INTERNO'::"text", 'EXTERNO'::"text"])))
);


ALTER TABLE "public"."port_briefing_sessoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."port_controle_carretas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_formulario" "text" DEFAULT 'FRM.SGP-0020'::"text" NOT NULL,
    "numero_protocolo" "text" NOT NULL,
    "empresa" "text" NOT NULL,
    "placa_cavalo" "text" NOT NULL,
    "placa_carreta" "text" NOT NULL,
    "data_entrada" "date" DEFAULT CURRENT_DATE NOT NULL,
    "hora_entrada" time without time zone NOT NULL,
    "nome_motorista" "text" NOT NULL,
    "cpf_motorista" "text",
    "data_saida" "date",
    "hora_saida" time without time zone,
    "ass_motorista" "text",
    "vigilante_entrada" "text" NOT NULL,
    "vigilante_saida" "text",
    "numero_nf" "text",
    "peso_bruto" numeric,
    "status" "text" DEFAULT 'NO_PATIO'::"text" NOT NULL,
    "observacoes" "text",
    "criado_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "port_controle_carretas_status_check" CHECK (("status" = ANY (ARRAY['NO_PATIO'::"text", 'DESCARREGANDO'::"text", 'LIBERADO'::"text", 'FINALIZADO'::"text", 'CANCELADO'::"text"])))
);


ALTER TABLE "public"."port_controle_carretas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."port_controle_equipamentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_formulario" "text" DEFAULT 'FRM.SGP-0011'::"text" NOT NULL,
    "numero_protocolo" "text" NOT NULL,
    "data_entrada" "date" DEFAULT CURRENT_DATE NOT NULL,
    "data_saida" "date",
    "hora_entrada" time without time zone,
    "hora_saida" time without time zone,
    "nome_empresa" "text" NOT NULL,
    "funcionario" "text" NOT NULL,
    "descricao_materiais" "text" NOT NULL,
    "responsavel" "text",
    "vigilante_entrada" "text" NOT NULL,
    "vigilante_saida" "text",
    "status" "text" DEFAULT 'NO_PATIO'::"text" NOT NULL,
    "observacoes" "text",
    "criado_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "port_controle_equipamentos_status_check" CHECK (("status" = ANY (ARRAY['NO_PATIO'::"text", 'DEVOLVIDO'::"text", 'RETIDO'::"text", 'CANCELADO'::"text"])))
);


ALTER TABLE "public"."port_controle_equipamentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."port_registro_transportes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_formulario" "text" DEFAULT 'FRM.SGP-0009'::"text" NOT NULL,
    "numero_protocolo" "text" NOT NULL,
    "data" "date" DEFAULT CURRENT_DATE NOT NULL,
    "turno" "text" DEFAULT 'MANHA'::"text" NOT NULL,
    "vigilante" "text" NOT NULL,
    "veiculo" "text" NOT NULL,
    "placa" "text" NOT NULL,
    "empresa" "text" NOT NULL,
    "hora_chegada" time without time zone NOT NULL,
    "hora_saida" time without time zone,
    "motorista" "text" NOT NULL,
    "ocupacao" "text",
    "observacoes" "text",
    "status" "text" DEFAULT 'NO_PATIO'::"text" NOT NULL,
    "criado_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "port_registro_transportes_status_check" CHECK (("status" = ANY (ARRAY['NO_PATIO'::"text", 'FINALIZADO'::"text", 'CANCELADO'::"text"]))),
    CONSTRAINT "port_registro_transportes_turno_check" CHECK (("turno" = ANY (ARRAY['MANHA'::"text", 'TARDE'::"text", 'NOITE'::"text", 'TURNO_A'::"text", 'TURNO_B'::"text", 'TURNO_C'::"text"])))
);


ALTER TABLE "public"."port_registro_transportes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."port_relatorio_ocorrencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "relatorio_id" "uuid" NOT NULL,
    "horario" time without time zone NOT NULL,
    "local_setor" "text" NOT NULL,
    "descricao" "text" NOT NULL,
    "severidade" "text" DEFAULT 'INFO'::"text" NOT NULL,
    "vigilante" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "port_relatorio_ocorrencias_local_setor_check" CHECK (("local_setor" = ANY (ARRAY['PORTARIA'::"text", 'RONDA_01'::"text", 'RONDA_02'::"text", 'PATIO_CHAPAS'::"text", 'PATIO_TRAMOS'::"text", 'FABRICA'::"text", 'OUTRO'::"text"]))),
    CONSTRAINT "port_relatorio_ocorrencias_severidade_check" CHECK (("severidade" = ANY (ARRAY['INFO'::"text", 'ALERTA'::"text", 'GRAVE'::"text"])))
);


ALTER TABLE "public"."port_relatorio_ocorrencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."port_relatorio_portaria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_formulario" "text" DEFAULT 'FRM.SGP-0010'::"text" NOT NULL,
    "numero_protocolo" "text" NOT NULL,
    "data" "date" DEFAULT CURRENT_DATE NOT NULL,
    "turno" "text" DEFAULT 'MANHA'::"text" NOT NULL,
    "horario_inicio" time without time zone DEFAULT '06:00:00'::time without time zone NOT NULL,
    "horario_fim" time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    "vigilante_principal" "text" NOT NULL,
    "vigilante_ronda01" "text",
    "vigilante_ronda02" "text",
    "status" "text" DEFAULT 'EM_ANDAMENTO'::"text" NOT NULL,
    "observacoes_gerais" "text",
    "criado_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "port_relatorio_portaria_status_check" CHECK (("status" = ANY (ARRAY['EM_ANDAMENTO'::"text", 'CONCLUIDO'::"text", 'PASSADO'::"text", 'CANCELADO'::"text"]))),
    CONSTRAINT "port_relatorio_portaria_turno_check" CHECK (("turno" = ANY (ARRAY['MANHA'::"text", 'TARDE'::"text", 'NOITE'::"text", 'TURNO_A'::"text", 'TURNO_B'::"text", 'TURNO_C'::"text"])))
);


ALTER TABLE "public"."port_relatorio_portaria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."port_vigilantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "matricula" "text",
    "empresa" "text" DEFAULT 'PROSEG / PATRIMONIAL'::"text" NOT NULL,
    "funcao" "text" DEFAULT 'Vigilante'::"text" NOT NULL,
    "turno_preferencial" "text" DEFAULT 'REVEZAMENTO'::"text",
    "ativo" boolean DEFAULT true NOT NULL,
    "observacoes" "text",
    "criado_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."port_vigilantes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."profiles" WITH ("security_invoker"='true') AS
 SELECT "id",
    "email",
    "name",
    "cargo",
    "sector_id",
    "roles",
    "status",
    "created_at",
    "notification_preferences",
    "grupo_compras",
    "page_access",
    "aprovador_setores",
    "aprovador_cadastro_sap",
    "tours_seen"
   FROM "public"."core_perfis";


ALTER VIEW "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_rastreio_mensagens" (
    "id" "text" NOT NULL,
    "ri" "text" NOT NULL,
    "rm" "text",
    "autor_id" "text" NOT NULL,
    "autor_nome" "text" NOT NULL,
    "autor_role" "text",
    "mensagem" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sup_rastreio_mensagens" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rastreio_mensagens" WITH ("security_invoker"='true') AS
 SELECT "id",
    "ri",
    "rm",
    "autor_id",
    "autor_nome",
    "autor_role",
    "mensagem",
    "created_at"
   FROM "public"."sup_rastreio_mensagens";


ALTER VIEW "public"."rastreio_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_rastreio_prioridades" (
    "id" "text" NOT NULL,
    "ri" "text" NOT NULL,
    "rm" "text",
    "nivel" integer NOT NULL,
    "solicitante_id" "text" NOT NULL,
    "solicitante_nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rastreio_prioridades_nivel_check" CHECK ((("nivel" >= 1) AND ("nivel" <= 5)))
);


ALTER TABLE "public"."sup_rastreio_prioridades" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rastreio_prioridades" WITH ("security_invoker"='true') AS
 SELECT "id",
    "ri",
    "rm",
    "nivel",
    "solicitante_id",
    "solicitante_nome",
    "created_at"
   FROM "public"."sup_rastreio_prioridades";


ALTER VIEW "public"."rastreio_prioridades" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."request_attachments" WITH ("security_invoker"='true') AS
 SELECT "id",
    "request_id",
    "name",
    "url",
    "size",
    "created_at",
    "request_item_id",
    "storage_path",
    "mime_type",
    "uploaded_by",
    "size_original",
    "material_code"
   FROM "public"."core_solicitacoes_anexos";


ALTER VIEW "public"."request_attachments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."request_comments" WITH ("security_invoker"='true') AS
 SELECT "id",
    "request_id",
    "user_id",
    "user_name",
    "user_roles",
    "content",
    "is_internal",
    "created_at"
   FROM "public"."core_solicitacoes_comentarios";


ALTER VIEW "public"."request_comments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."request_items" WITH ("security_invoker"='true') AS
 SELECT "id",
    "request_id",
    "description",
    "sap_code",
    "has_no_sap_code",
    "quantity",
    "unit",
    "brand",
    "is_similar_allowed",
    "suggested_supplier",
    "estimated_value",
    "is_generic",
    "observation",
    "reference_link"
   FROM "public"."core_solicitacoes_itens";


ALTER VIEW "public"."request_items" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."request_status_history" WITH ("security_invoker"='true') AS
 SELECT "id",
    "request_id",
    "from_status",
    "to_status",
    "user_id",
    "user_name",
    "comment",
    "created_at"
   FROM "public"."core_solicitacoes_historico_status";


ALTER VIEW "public"."request_status_history" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."requests" WITH ("security_invoker"='true') AS
 SELECT "id",
    "number",
    "type",
    "status",
    "criticality",
    "solicitante_id",
    "solicitante_name",
    "solicitante_sector_id",
    "created_at",
    "updated_at",
    "data_necessidade",
    "comprador_id",
    "tipo_compra",
    "justificativa",
    "local",
    "category_id",
    "target_sector_id",
    "registration_type",
    "linked_rm_number",
    "rating",
    "rating_comment",
    "atendente_id",
    "atendente_name",
    "first_response_at",
    "resolved_at",
    "paused_minutes",
    "last_paused_at",
    "contrato_tipo",
    "fornecedor_terceiro",
    "prazo_conclusao",
    "titulo",
    "brand",
    "suggested_supplier",
    "representante_nome",
    "representante_cargo",
    "representante_telefone",
    "representante_email"
   FROM "public"."core_solicitacoes";


ALTER VIEW "public"."requests" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."requisicoes" WITH ("security_invoker"='true') AS
 SELECT "ri",
    "tipo_de_documento",
    "requisicao_de_compra",
    "item_reqc",
    "data_da_solicitacao",
    "requisitante",
    "area_solicitante",
    "material",
    "texto_breve",
    "qtd_solicitada",
    "unidade_de_medida",
    "status_processamento",
    "codigo_de_eliminacao",
    "categoria_do_item",
    "ctg_class_cont",
    "tipo_data_de_remessa",
    "remessas_de_ate",
    "grupo_de_mercadorias",
    "centro",
    "deposito",
    "grupo_de_compradores",
    "n_acompanhamento",
    "fornecedor_fixo",
    "centro_fornecedor",
    "organiz_compras",
    "contrato_basico",
    "it_contrato_superior",
    "n_de_reqsc",
    "criado_por",
    "data_do_pedido",
    "moeda",
    "pedido",
    "item_do_pedido",
    "apelido",
    "aplicacao",
    "data_de_remessa",
    "codigo_de_bloqueio",
    "codigo_de_liberacao",
    "concluida",
    "data_da_liberacao",
    "data_pedido_origem",
    "descricao_do_grupo_de_compradores",
    "marca_da_peca",
    "modelo",
    "n_material_fornecedor",
    "n_peca_fabricante",
    "nome_do_fornecedor",
    "peca_original",
    "quantidade_pedida",
    "sugestao_local_compra",
    "tempo_procmto_em",
    "tipo_de_transporte",
    "requisicao_externa",
    "obs_comprador",
    "data_entrega_prevista",
    "presente_ultima_carga",
    "eliminado",
    "campos_extras",
    "obs_updated_at",
    "obs_updated_by",
    "item_status",
    "item_status_updated_at",
    "item_status_updated_by"
   FROM "public"."sap_me5a_rc";


ALTER VIEW "public"."requisicoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rh_ase_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "solicitacao_id" "uuid" NOT NULL,
    "pessoa_id" "uuid",
    "registro" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "cargo" "text",
    "transporte" boolean DEFAULT false NOT NULL,
    "refeicao" boolean DEFAULT false NOT NULL,
    "hora_entrada" time without time zone NOT NULL,
    "hora_saida" time without time zone NOT NULL,
    "intervalo_minutos" integer DEFAULT 0 NOT NULL,
    "percentual_he" numeric(5,2),
    "total_horas" numeric(5,2),
    "observacao" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rh_ase_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rh_ase_solicitacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_formulario" "text" DEFAULT 'FRM.RHU-0007'::"text" NOT NULL,
    "numero_protocolo" "text" NOT NULL,
    "solicitante_id" "text",
    "setor_id" "uuid",
    "turno_id" "uuid",
    "data_execucao" "date" NOT NULL,
    "justificativa" "text",
    "status" "text" DEFAULT 'RASCUNHO'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rh_ase_solicitacoes_status_check" CHECK (("status" = ANY (ARRAY['RASCUNHO'::"text", 'ENVIADO'::"text", 'CANCELADO'::"text"])))
);


ALTER TABLE "public"."rh_ase_solicitacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rh_hora_extra" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dia" "date" NOT NULL,
    "percentual_he" numeric(5,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rh_hora_extra" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rh_pessoas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registro" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "cargo" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rh_pessoas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rh_setores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rh_setores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rh_turnos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rh_turnos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sap_zl0170_miro" (
    "id" bigint NOT NULL,
    "numero_pedido" "text" NOT NULL,
    "empresa" "text",
    "centro" "text",
    "data_criacao_pedido" "date",
    "data_aprovacao_pedido" "date",
    "data_remessa" "date",
    "item" "text" NOT NULL,
    "material" "text",
    "qtd_pedido" numeric,
    "unidade_pedido" "text",
    "preco_liquido" numeric,
    "moeda_preco" "text",
    "valor_liquido" numeric,
    "moeda_valor_liquido" "text",
    "requisicao_compra" "text",
    "data_solicitacao" "date",
    "doc_migo" "text",
    "ano_migo" "text",
    "folha_servico" "text",
    "data_criacao_migo" "date",
    "data_lancamento_migo" "date",
    "qtd_migo" numeric,
    "unidade_migo" "text",
    "montante_migo" numeric,
    "moeda_migo" "text",
    "doc_miro" "text",
    "ano_miro" "text",
    "data_criacao_miro" "date",
    "data_lancamento_miro" "date",
    "data_documento" "date",
    "hora" "text",
    "data_entrada" "date",
    "referencia" "text",
    "qtd_miro" numeric,
    "unidade_miro" "text",
    "montante_miro" numeric,
    "numero_doc_contabil" "text",
    "fornecedor" "text",
    "nome_1" "text",
    "nome_2" "text",
    "id_fiscal_1" "text",
    "id_fiscal_2" "text",
    "id_fiscal_iva" "text",
    "doc_pagamento" "text",
    "data_pagamento" "date",
    "campos_extras" "jsonb",
    "imported_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sap_zl0170_miro" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."sectors" WITH ("security_invoker"='true') AS
 SELECT "id",
    "name",
    "is_support",
    "helpdesk_enabled",
    "sap_area_code"
   FROM "public"."core_setores";


ALTER VIEW "public"."sectors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sequences" (
    "key" "text" NOT NULL,
    "value" integer DEFAULT 1000
);


ALTER TABLE "public"."sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sup_fretes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "origem" "text" DEFAULT ''::"text" NOT NULL,
    "uf" "text" DEFAULT ''::"text" NOT NULL,
    "destino" "text" DEFAULT ''::"text" NOT NULL,
    "rotas" "text" DEFAULT ''::"text",
    "kg_1_10" numeric(15,2) DEFAULT 0,
    "kg_11_20" numeric(15,2) DEFAULT 0,
    "kg_21_30" numeric(15,2) DEFAULT 0,
    "kg_31_50" numeric(15,2) DEFAULT 0,
    "kg_51_70" numeric(15,2) DEFAULT 0,
    "kg_71_100" numeric(15,2) DEFAULT 0,
    "kg_acima_100" numeric(15,2) DEFAULT 0,
    "lead_time_entrega" "text" DEFAULT ''::"text",
    "ad_valores" numeric(15,4) DEFAULT 0,
    "pedagio_fracao_100kg" numeric(15,2) DEFAULT 0,
    "cat" numeric(15,2) DEFAULT 0,
    "itr_tas" numeric(15,2) DEFAULT 0,
    "taxa_fixa_itr_redespacho" numeric(15,2) DEFAULT 0,
    "fiorino" numeric(15,2) DEFAULT 0,
    "veiculo_3_4_ate_2_5t" numeric(15,2) DEFAULT 0,
    "toco_ate_5_5t" numeric(15,2) DEFAULT 0,
    "truck_ate_14t" numeric(15,2) DEFAULT 0,
    "carreta_ate_25t" numeric(15,2) DEFAULT 0,
    "carreta_acima_27t" numeric(15,2) DEFAULT 0,
    "lead_time_entrega_2" "text" DEFAULT ''::"text",
    "icms_aplicado" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sup_fretes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."tabela_frete" WITH ("security_invoker"='true') AS
 SELECT "id",
    "origem",
    "uf",
    "destino",
    "rotas",
    "kg_1_10",
    "kg_11_20",
    "kg_21_30",
    "kg_31_50",
    "kg_51_70",
    "kg_71_100",
    "kg_acima_100",
    "lead_time_entrega",
    "ad_valores",
    "pedagio_fracao_100kg",
    "cat",
    "itr_tas",
    "taxa_fixa_itr_redespacho",
    "fiorino",
    "veiculo_3_4_ate_2_5t",
    "toco_ate_5_5t",
    "truck_ate_14t",
    "carreta_ate_25t",
    "carreta_acima_27t",
    "lead_time_entrega_2",
    "icms_aplicado",
    "created_at",
    "updated_at"
   FROM "public"."sup_fretes";


ALTER VIEW "public"."tabela_frete" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipo_mov_estoque" (
    "tmv" character varying(10) NOT NULL,
    "descricao" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tipo_mov_estoque" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."usage_events" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "user_name",
    "email",
    "session_id",
    "event_type",
    "path",
    "page_label",
    "created_at"
   FROM "public"."ops_eventos_uso";


ALTER VIEW "public"."usage_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_enriched_pedidos" WITH ("security_invoker"='true') AS
 SELECT "ri",
    "n_acomp",
    "eflag_e",
    "reqc",
    "data_rc",
    "tpdc",
    "requisitante",
    "criado_por_rc",
    "item",
    "material",
    "txt_breve",
    "tmatt",
    "grp_mercads",
    "empremp",
    "cen_cen",
    "dep_dep",
    "tipo_doc_compra",
    "doc_compra",
    "criado_por_pedido",
    "data_doc",
    "dt_remessa",
    "data_migo",
    "est_liber",
    "estr",
    "codigo_liberacao_doc_compra",
    "itm_liberacao",
    "criado_por_liberacao",
    "qtd_pedido",
    "por",
    "qtd_fornecida",
    "crf",
    "ump_1",
    "unidade_medida_pedido",
    "preco_liquido_unit",
    "moeda_1",
    "valor_em_brl",
    "moeda_2",
    "ump_2",
    "valor_liquido",
    "fornecedor_codigo",
    "cnpj_fornecedor",
    "fornecedor_nome",
    "regiao_uf",
    "req_cotacao",
    "data_pc_sc",
    "item_rc_cotacao",
    "upp",
    "valor_efetivo",
    "moeda_3",
    "doc_compra_ref",
    "itm_ref",
    "ftf",
    "posicao",
    "condicao_pagamento",
    "criado_por_condicao",
    "modificado_em",
    "contrato",
    "item_contrato",
    "cn_lcr_parcs",
    "categoria",
    "grupo_mercadoria_curto",
    "ci",
    "unidade_medida_basica",
    "ump_3",
    "campos_extras",
    "status_entrega",
    "dias_atrasado"
   FROM "public"."vw_sap_pedidos_enriquecidos";


ALTER VIEW "public"."view_enriched_pedidos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_enriched_requisicoes" WITH ("security_invoker"='true') AS
 SELECT "ri",
    "tipo_de_documento",
    "requisicao_de_compra",
    "item_reqc",
    "data_da_solicitacao",
    "requisitante",
    "area_solicitante",
    "material",
    "texto_breve",
    "qtd_solicitada",
    "unidade_de_medida",
    "status_processamento",
    "codigo_de_eliminacao",
    "categoria_do_item",
    "ctg_class_cont",
    "tipo_data_de_remessa",
    "remessas_de_ate",
    "grupo_de_mercadorias",
    "centro",
    "deposito",
    "grupo_de_compradores",
    "n_acompanhamento",
    "fornecedor_fixo",
    "centro_fornecedor",
    "organiz_compras",
    "contrato_basico",
    "it_contrato_superior",
    "n_de_reqsc",
    "criado_por",
    "data_do_pedido",
    "moeda",
    "pedido",
    "item_do_pedido",
    "apelido",
    "aplicacao",
    "data_de_remessa",
    "codigo_de_bloqueio",
    "codigo_de_liberacao",
    "concluida",
    "data_da_liberacao",
    "data_pedido_origem",
    "descricao_do_grupo_de_compradores",
    "marca_da_peca",
    "modelo",
    "n_material_fornecedor",
    "n_peca_fabricante",
    "nome_do_fornecedor",
    "peca_original",
    "quantidade_pedida",
    "sugestao_local_compra",
    "tempo_procmto_em",
    "tipo_de_transporte",
    "requisicao_externa",
    "obs_comprador",
    "data_entrega_prevista",
    "presente_ultima_carga",
    "eliminado",
    "campos_extras",
    "obs_updated_at",
    "obs_updated_by",
    "documento_compra",
    "item_pedido",
    "fornecedor_code",
    "fornecedor_name",
    "data_pedido",
    "data_migo",
    "data_entrega_sap",
    "status_entrega",
    "dias_atrasado",
    "natureza",
    "status_requisicao",
    "lead_time_compras_meta",
    "data_referencia_prazo",
    "atraso_comprador",
    "status_atualizado",
    "faixa_atraso",
    "alerta",
    "dias_em_aberto",
    "item_status",
    "item_status_updated_at",
    "item_status_updated_by",
    "criado_por_pedido"
   FROM "public"."vw_sap_requisicoes_enriquecidas";


ALTER VIEW "public"."view_enriched_requisicoes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_auditoria_compras" AS
 WITH "compras" AS (
         SELECT "p"."material",
            "max"("p"."txt_breve") AS "txt_breve",
            "p"."fornecedor_codigo" AS "cod_forn",
            "max"("p"."fornecedor_nome") AS "fornecedor",
            "p"."doc_compra",
            "max"("p"."reqc") AS "rm",
            "max"("p"."grp_mercads") AS "grp_mercads",
            "max"("p"."data_doc") AS "data_doc",
            "max"(COALESCE("p"."unidade_medida_pedido", "p"."ump_1")) AS "unidade",
            "sum"("p"."qtd_pedido") AS "qtd",
            "sum"(COALESCE("p"."qtd_fornecida", (0)::numeric)) AS "qtd_fornecida",
            "sum"("p"."valor_em_brl") AS "valor",
            ("sum"("p"."valor_em_brl") / "sum"("p"."qtd_pedido")) AS "preco_unit"
           FROM "public"."sap_zl0132_po" "p"
          WHERE ((("lower"(COALESCE("p"."crf", ''::"text")) = 'x'::"text") OR (COALESCE("p"."qtd_fornecida", (0)::numeric) > (0)::numeric)) AND ("p"."material" IS NOT NULL) AND ("p"."data_doc" >= '2026-01-01'::"date") AND (COALESCE("p"."qtd_pedido", (0)::numeric) > (0)::numeric) AND (COALESCE("p"."valor_em_brl", (0)::numeric) > (0)::numeric))
          GROUP BY "p"."material", "p"."fornecedor_codigo", "p"."doc_compra"
        )
 SELECT "c"."material",
    "c"."txt_breve",
    "c"."cod_forn",
    "c"."fornecedor",
    "c"."doc_compra",
    "c"."rm",
    "c"."grp_mercads",
    COALESCE(NULLIF(TRIM(BOTH FROM "gm"."denominacao2"), ''::"text"), NULLIF(TRIM(BOTH FROM "gm"."denominacao"), ''::"text")) AS "grp_mercads_desc",
        CASE
            WHEN ("c"."material" ~~ '100000000%'::"text") THEN 'Projeto'::"text"
            ELSE 'Consumo'::"text"
        END AS "tipo_item",
    "c"."data_doc",
    "c"."unidade",
    "c"."qtd",
    "c"."valor",
    "c"."preco_unit",
    (("c"."qtd_fornecida" > (0)::numeric) AND ("c"."qtd_fornecida" < "c"."qtd")) AS "pedido_parcial",
    "b"."n_compras",
    "b"."primeira_compra",
    "b"."ultima_compra",
    "b"."qtd_mediana",
    "b"."ref_p25",
    "b"."ref_p50",
    "b"."ref_p75",
    "b"."sd_log",
    COALESCE("b"."confianca", 'Sem referência'::"text") AS "confianca",
        CASE
            WHEN (("b"."ref_p50" IS NOT NULL) AND ("b"."ref_p50" > (0)::numeric)) THEN (("c"."preco_unit" / "b"."ref_p50") - (1)::numeric)
            ELSE NULL::numeric
        END AS "delta_pct",
        CASE
            WHEN ("b"."ref_p50" IS NOT NULL) THEN (("c"."preco_unit" - "b"."ref_p50") * "c"."qtd")
            ELSE NULL::numeric
        END AS "delta_valor",
        CASE
            WHEN ("b"."material" IS NULL) THEN 'Sem referência'::"text"
            WHEN ("c"."preco_unit" < "b"."ref_p25") THEN 'Bom'::"text"
            WHEN ("c"."preco_unit" > "b"."ref_p75") THEN 'Atenção'::"text"
            ELSE 'Na faixa'::"text"
        END AS "veredito",
        CASE
            WHEN (("b"."qtd_mediana" IS NULL) OR ("b"."qtd_mediana" <= (0)::numeric)) THEN false
            ELSE (("c"."qtd" > ("b"."qtd_mediana" * (3)::numeric)) OR ("c"."qtd" < ("b"."qtd_mediana" / (3)::numeric)))
        END AS "lote_atipico",
    "public"."ipca_mes_referencia"() AS "ipca_mes_referencia"
   FROM (("compras" "c"
     LEFT JOIN "public"."mv_benchmark_material" "b" ON (("b"."material" = "c"."material")))
     LEFT JOIN "public"."cadastro_grupo_mercadoria" "gm" ON (("gm"."codigo" = "c"."grp_mercads")));


ALTER VIEW "public"."vw_auditoria_compras" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_auditoria_historico_material" AS
 WITH "mats_2026" AS (
         SELECT DISTINCT "p"."material"
           FROM "public"."sap_zl0132_po" "p"
          WHERE ((("lower"(COALESCE("p"."crf", ''::"text")) = 'x'::"text") OR (COALESCE("p"."qtd_fornecida", (0)::numeric) > (0)::numeric)) AND ("p"."material" IS NOT NULL) AND ("p"."data_doc" >= '2026-01-01'::"date"))
        ), "h" AS (
         SELECT "p"."material",
            "p"."doc_compra",
            "p"."fornecedor_codigo",
            "max"("p"."fornecedor_nome") AS "fornecedor",
            "max"("p"."data_doc") AS "data_doc",
            "sum"("p"."qtd_pedido") AS "qtd",
            "sum"("p"."valor_em_brl") AS "valor",
            ("sum"("p"."valor_em_brl") / "sum"("p"."qtd_pedido")) AS "preco_unit"
           FROM ("public"."sap_zl0132_po" "p"
             JOIN "mats_2026" "m" ON (("m"."material" = "p"."material")))
          WHERE ((("lower"(COALESCE("p"."crf", ''::"text")) = 'x'::"text") OR (COALESCE("p"."qtd_fornecida", (0)::numeric) > (0)::numeric)) AND ("p"."data_doc" IS NOT NULL) AND ("p"."data_doc" < '2026-01-01'::"date") AND (COALESCE("p"."qtd_pedido", (0)::numeric) > (0)::numeric) AND (COALESCE("p"."valor_em_brl", (0)::numeric) > (0)::numeric))
          GROUP BY "p"."material", "p"."doc_compra", "p"."fornecedor_codigo"
        ), "ref" AS (
         SELECT "ipca_indice"."numero_indice" AS "idx_ref"
           FROM "public"."ipca_indice"
          ORDER BY "ipca_indice"."mes" DESC
         LIMIT 1
        ), "piso" AS (
         SELECT "ipca_indice"."numero_indice" AS "idx_piso"
           FROM "public"."ipca_indice"
          ORDER BY "ipca_indice"."mes"
         LIMIT 1
        )
 SELECT "h"."material",
    "h"."doc_compra",
    "h"."fornecedor_codigo" AS "cod_forn",
    "h"."fornecedor",
    "h"."data_doc",
    "h"."qtd",
    "h"."valor",
    "h"."preco_unit",
    (( SELECT "ref"."idx_ref"
           FROM "ref") / COALESCE("i"."numero_indice", ( SELECT "piso"."idx_piso"
           FROM "piso"))) AS "fator_ipca",
    ("h"."preco_unit" * (( SELECT "ref"."idx_ref"
           FROM "ref") / COALESCE("i"."numero_indice", ( SELECT "piso"."idx_piso"
           FROM "piso")))) AS "preco_corrigido"
   FROM ("h"
     LEFT JOIN "public"."ipca_indice" "i" ON (("i"."mes" = ("date_trunc"('month'::"text", ("h"."data_doc")::timestamp with time zone))::"date")));


ALTER VIEW "public"."vw_auditoria_historico_material" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_estoque_analise" WITH ("security_invoker"='on') AS
 WITH "ult" AS (
         SELECT DISTINCT ON ("p"."material") "p"."material",
            ("p"."preco_liquido_unit" /
                CASE
                    WHEN ("p"."por" ~ '^[0-9]+([.,][0-9]+)?$'::"text") THEN COALESCE(NULLIF(("replace"("p"."por", ','::"text", '.'::"text"))::numeric, (0)::numeric), (1)::numeric)
                    ELSE (1)::numeric
                END) AS "ultimo_preco_unit",
            "p"."data_doc" AS "data_ultima_compra",
            COALESCE("p"."fornecedor_nome", "p"."fornecedor") AS "ultimo_fornecedor"
           FROM "public"."sap_zl0132_po" "p"
          WHERE (("p"."preco_liquido_unit" IS NOT NULL) AND ("p"."preco_liquido_unit" > (0)::numeric))
          ORDER BY "p"."material", "p"."data_doc" DESC NULLS LAST
        )
 SELECT DISTINCT "e"."material",
    "u"."ultimo_preco_unit",
    "u"."data_ultima_compra",
    "u"."ultimo_fornecedor"
   FROM ("public"."sap_zl0024_stk" "e"
     LEFT JOIN "ult" "u" ON (("u"."material" = "e"."material")));


ALTER VIEW "public"."vw_estoque_analise" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_mb51_classificado" WITH ("security_invoker"='on') AS
 SELECT "m"."id",
    "m"."centro",
    "m"."deposito",
    "m"."doc_material",
    "m"."item",
    "m"."pedido",
    "m"."referencia",
    "m"."material",
    "m"."texto_breve_material",
    "m"."qtd_um_registro",
    "m"."unid_medida_basica",
    "m"."montante_mi",
    "m"."moeda",
    "m"."data_lancamento",
    "m"."data_documento",
    "m"."data_entrada",
    "m"."tipo_movimento",
    "m"."fornecedor",
    "m"."razao_social_fornecedor",
    "m"."nome_usuario",
    "m"."elemento_pep",
    "m"."chave_unica",
    COALESCE(NULLIF("btrim"("t"."descricao"), ''::"text"), NULLIF("btrim"("m"."txt_tipo_movimento"), ''::"text"), 'Não classificado'::"text") AS "descricao_tipo_movimento",
        CASE
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['301'::"text", '302'::"text", '303'::"text", '304'::"text", '305'::"text", '306'::"text", '309'::"text", '310'::"text", '311'::"text", '312'::"text", '313'::"text", '314'::"text", '315'::"text", '316'::"text", '321'::"text", '322'::"text", '323'::"text", '324'::"text", '325'::"text", '326'::"text", '341'::"text", '342'::"text", '343'::"text", '344'::"text", '349'::"text", '350'::"text", '351'::"text", '352'::"text"])) THEN 'transferencia'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['101'::"text", '131'::"text"])) THEN 'entrada_compra'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['102'::"text", '132'::"text"])) THEN 'estorno_entrada'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['501'::"text", '503'::"text", '505'::"text", '511'::"text", '521'::"text", '531'::"text", '571'::"text"])) THEN 'entrada_sem_pedido'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['502'::"text", '504'::"text", '506'::"text", '512'::"text", '522'::"text", '532'::"text", '572'::"text"])) THEN 'estorno_entrada'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['201'::"text", '221'::"text", '231'::"text", '241'::"text", '251'::"text", '261'::"text", '281'::"text", '291'::"text"])) THEN 'consumo'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['202'::"text", '222'::"text", '232'::"text", '242'::"text", '252'::"text", '262'::"text", '282'::"text", '292'::"text"])) THEN 'estorno_consumo'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['122'::"text", '124'::"text", '161'::"text"])) THEN 'devolucao_fornecedor'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['123'::"text", '125'::"text", '162'::"text"])) THEN 'estorno_devolucao'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['601'::"text", '621'::"text", '631'::"text", '641'::"text", '643'::"text", '645'::"text", '647'::"text"])) THEN 'saida_remessa'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['602'::"text", '622'::"text", '632'::"text", '642'::"text", '644'::"text", '646'::"text", '648'::"text"])) THEN 'estorno_remessa'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['551'::"text", '553'::"text", '555'::"text"])) THEN 'baixa_sucata'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['552'::"text", '554'::"text", '556'::"text"])) THEN 'estorno_sucata'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['701'::"text", '703'::"text", '707'::"text", '711'::"text", '713'::"text", '715'::"text", '717'::"text"])) THEN 'ajuste_inventario'::"text"
            WHEN ("m"."tipo_movimento" = ANY (ARRAY['702'::"text", '704'::"text", '708'::"text", '712'::"text", '714'::"text", '716'::"text", '718'::"text"])) THEN 'ajuste_inventario'::"text"
            ELSE 'outros'::"text"
        END AS "categoria",
    ("m"."tipo_movimento" <> ALL (ARRAY['301'::"text", '302'::"text", '303'::"text", '304'::"text", '305'::"text", '306'::"text", '309'::"text", '310'::"text", '311'::"text", '312'::"text", '313'::"text", '314'::"text", '315'::"text", '316'::"text", '321'::"text", '322'::"text", '323'::"text", '324'::"text", '325'::"text", '326'::"text", '341'::"text", '342'::"text", '343'::"text", '344'::"text", '349'::"text", '350'::"text", '351'::"text", '352'::"text"])) AS "movimenta_estoque",
        CASE
            WHEN ("m"."qtd_um_registro" > (0)::numeric) THEN 'entrada'::"text"
            WHEN ("m"."qtd_um_registro" < (0)::numeric) THEN 'saida'::"text"
            ELSE 'neutro'::"text"
        END AS "sinal",
    ("m"."deposito" IS NOT NULL) AS "entra_almoxarifado"
   FROM ("public"."sap_mb51_mov" "m"
     LEFT JOIN "public"."tipo_mov_estoque" "t" ON ((("t"."tmv")::"text" = "btrim"("m"."tipo_movimento"))));


ALTER VIEW "public"."vw_mb51_classificado" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_estoque_camadas_fifo" WITH ("security_invoker"='on') AS
 WITH "base" AS (
         SELECT "vw_mb51_classificado"."material",
            "vw_mb51_classificado"."data_lancamento",
            "vw_mb51_classificado"."id",
            "vw_mb51_classificado"."qtd_um_registro" AS "q",
            "vw_mb51_classificado"."montante_mi"
           FROM "public"."vw_mb51_classificado"
          WHERE (("vw_mb51_classificado"."material" IS NOT NULL) AND ("vw_mb51_classificado"."qtd_um_registro" IS NOT NULL) AND "vw_mb51_classificado"."movimenta_estoque" AND "vw_mb51_classificado"."entra_almoxarifado")
        ), "saldo" AS (
         SELECT "sap_zl0024_stk"."material",
            "sum"("sap_zl0024_stk"."quantidade") AS "saldo_atual",
            "avg"(NULLIF("sap_zl0024_stk"."preco_medio", (0)::numeric)) AS "preco_medio"
           FROM "public"."sap_zl0024_stk"
          GROUP BY "sap_zl0024_stk"."material"
        ), "liquido" AS (
         SELECT "base"."material",
            "sum"("base"."q") AS "mov_liq"
           FROM "base"
          GROUP BY "base"."material"
        ), "abertura" AS (
         SELECT COALESCE("s"."material", "l"."material") AS "material",
            GREATEST((COALESCE("s"."saldo_atual", (0)::numeric) - COALESCE("l"."mov_liq", (0)::numeric)), (0)::numeric) AS "q",
            "s"."preco_medio"
           FROM ("saldo" "s"
             FULL JOIN "liquido" "l" ON (("l"."material" = "s"."material")))
        ), "camadas" AS (
         SELECT "abertura"."material",
            NULL::"date" AS "data_entrada",
            (0)::bigint AS "ord",
            "abertura"."q",
            "abertura"."preco_medio" AS "preco_unit",
            true AS "legado"
           FROM "abertura"
          WHERE ("abertura"."q" > 0.001)
        UNION ALL
         SELECT "base"."material",
            "base"."data_lancamento",
            "base"."id",
            "base"."q",
                CASE
                    WHEN ("base"."q" <> (0)::numeric) THEN "abs"(("base"."montante_mi" / "base"."q"))
                    ELSE NULL::numeric
                END AS "case",
            false
           FROM "base"
          WHERE ("base"."q" > (0)::numeric)
        ), "ent" AS (
         SELECT "camadas"."material",
            "camadas"."data_entrada",
            "camadas"."ord",
            "camadas"."q",
            "camadas"."preco_unit",
            "camadas"."legado",
            COALESCE("sum"("camadas"."q") OVER (PARTITION BY "camadas"."material" ORDER BY "camadas"."legado" DESC, "camadas"."data_entrada", "camadas"."ord" ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), (0)::numeric) AS "cum_antes",
            "sum"("camadas"."q") OVER (PARTITION BY "camadas"."material" ORDER BY "camadas"."legado" DESC, "camadas"."data_entrada", "camadas"."ord") AS "cum_ate"
           FROM "camadas"
        ), "sai" AS (
         SELECT "base"."material",
            "base"."data_lancamento" AS "d_sai",
            COALESCE("sum"((- "base"."q")) OVER (PARTITION BY "base"."material" ORDER BY "base"."data_lancamento", "base"."id" ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), (0)::numeric) AS "cum_antes",
            "sum"((- "base"."q")) OVER (PARTITION BY "base"."material" ORDER BY "base"."data_lancamento", "base"."id") AS "cum_ate"
           FROM "base"
          WHERE ("base"."q" < (0)::numeric)
        ), "total_saida" AS (
         SELECT "base"."material",
            "sum"((- "base"."q")) AS "ts"
           FROM "base"
          WHERE ("base"."q" < (0)::numeric)
          GROUP BY "base"."material"
        ), "consumo" AS (
         SELECT "e_1"."material",
            "e_1"."data_entrada",
            "e_1"."ord",
            "min"("s"."d_sai") FILTER (WHERE ("s"."cum_ate" >= "e_1"."cum_ate")) AS "data_consumo_total"
           FROM ("ent" "e_1"
             JOIN "sai" "s" ON ((("s"."material" = "e_1"."material") AND ("s"."cum_ate" > "e_1"."cum_antes"))))
          GROUP BY "e_1"."material", "e_1"."data_entrada", "e_1"."ord"
        )
 SELECT "e"."material",
    "e"."data_entrada",
    "e"."legado",
    "e"."q" AS "qtd_entrada",
    "e"."preco_unit",
    GREATEST(LEAST("e"."q", ("e"."cum_ate" - COALESCE("t"."ts", (0)::numeric))), (0)::numeric) AS "qtd_remanescente",
    LEAST("e"."q", GREATEST((COALESCE("t"."ts", (0)::numeric) - "e"."cum_antes"), (0)::numeric)) AS "qtd_consumida",
    "round"((GREATEST(LEAST("e"."q", ("e"."cum_ate" - COALESCE("t"."ts", (0)::numeric))), (0)::numeric) * COALESCE("e"."preco_unit", (0)::numeric)), 2) AS "valor_remanescente",
    "c"."data_consumo_total",
        CASE
            WHEN ("e"."legado" OR ("c"."data_consumo_total" IS NULL) OR ("e"."data_entrada" IS NULL)) THEN NULL::integer
            ELSE ("c"."data_consumo_total" - "e"."data_entrada")
        END AS "dias_permanencia",
        CASE
            WHEN ("e"."legado" OR ("e"."data_entrada" IS NULL)) THEN NULL::integer
            ELSE (CURRENT_DATE - "e"."data_entrada")
        END AS "dias_em_estoque",
        CASE
            WHEN "e"."legado" THEN 'legado_pre_reabertura'::"text"
            WHEN ("c"."data_consumo_total" IS NULL) THEN 'em_estoque'::"text"
            WHEN ("e"."data_entrada" IS NULL) THEN 'indeterminado'::"text"
            WHEN (("c"."data_consumo_total" - "e"."data_entrada") < 0) THEN 'consumo_saldo_anterior'::"text"
            WHEN (("c"."data_consumo_total" - "e"."data_entrada") <= 7) THEN 'cross_dock'::"text"
            WHEN (("c"."data_consumo_total" - "e"."data_entrada") <= 90) THEN 'saudavel'::"text"
            ELSE 'antecipada'::"text"
        END AS "classe_permanencia"
   FROM (("ent" "e"
     LEFT JOIN "total_saida" "t" ON (("t"."material" = "e"."material")))
     LEFT JOIN "consumo" "c" ON ((("c"."material" = "e"."material") AND ("c"."ord" = "e"."ord") AND (NOT ("c"."data_entrada" IS DISTINCT FROM "e"."data_entrada")))));


ALTER VIEW "public"."vw_estoque_camadas_fifo" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_estoque_giro" WITH ("security_invoker"='on') AS
 WITH "janela" AS (
         SELECT '2026-05-01'::"date" AS "inicio",
            ( SELECT "max"("sap_mb51_mov"."data_lancamento") AS "max"
                   FROM "public"."sap_mb51_mov") AS "fim",
            GREATEST((( SELECT "max"("sap_mb51_mov"."data_lancamento") AS "max"
                   FROM "public"."sap_mb51_mov") - '2026-05-01'::"date"), 1) AS "dias"
        ), "consumo" AS (
         SELECT "m"."material",
            ("sum"(
                CASE
                    WHEN ("m"."categoria" = 'consumo'::"text") THEN (- "m"."qtd_um_registro")
                    ELSE (0)::numeric
                END) - "sum"(
                CASE
                    WHEN ("m"."categoria" = 'estorno_consumo'::"text") THEN "m"."qtd_um_registro"
                    ELSE (0)::numeric
                END)) AS "qtd_consumida",
            ("sum"(
                CASE
                    WHEN ("m"."categoria" = 'consumo'::"text") THEN "abs"("m"."montante_mi")
                    ELSE (0)::numeric
                END) - "sum"(
                CASE
                    WHEN ("m"."categoria" = 'estorno_consumo'::"text") THEN "abs"("m"."montante_mi")
                    ELSE (0)::numeric
                END)) AS "valor_consumido",
            "count"(*) FILTER (WHERE ("m"."categoria" = 'consumo'::"text")) AS "eventos_consumo"
           FROM "public"."vw_mb51_classificado" "m",
            "janela" "j_1"
          WHERE (("m"."material" IS NOT NULL) AND ("m"."data_lancamento" >= "j_1"."inicio"))
          GROUP BY "m"."material"
        ), "entrada" AS (
         SELECT "m"."material",
            "sum"(
                CASE
                    WHEN ("m"."categoria" = ANY (ARRAY['entrada_compra'::"text", 'entrada_sem_pedido'::"text"])) THEN "m"."qtd_um_registro"
                    ELSE (0)::numeric
                END) AS "qtd_recebida",
            "max"("m"."data_lancamento") FILTER (WHERE ("m"."categoria" = 'entrada_compra'::"text")) AS "ultima_entrada"
           FROM "public"."vw_mb51_classificado" "m"
          WHERE ("m"."material" IS NOT NULL)
          GROUP BY "m"."material"
        ), "movimento" AS (
         SELECT "vw_mb51_classificado"."material",
            "max"("vw_mb51_classificado"."data_lancamento") AS "ultima_movimentacao"
           FROM "public"."vw_mb51_classificado"
          WHERE (("vw_mb51_classificado"."material" IS NOT NULL) AND "vw_mb51_classificado"."movimenta_estoque")
          GROUP BY "vw_mb51_classificado"."material"
        ), "posicao" AS (
         SELECT "sap_zl0024_stk"."material",
            "max"("sap_zl0024_stk"."txt_breve_material") AS "descricao",
            "max"("sap_zl0024_stk"."grupo_mercadorias") AS "grupo_mercadorias",
            "max"("sap_zl0024_stk"."tipo_material") AS "tipo_material",
            "max"("sap_zl0024_stk"."umb") AS "umb",
            "sum"("sap_zl0024_stk"."quantidade") AS "saldo_atual",
            "sum"("sap_zl0024_stk"."valor_total") AS "valor_estoque"
           FROM "public"."sap_zl0024_stk"
          GROUP BY "sap_zl0024_stk"."material"
        )
 SELECT "p"."material",
    "p"."descricao",
    "p"."grupo_mercadorias",
    "p"."tipo_material",
    "p"."umb",
    "p"."saldo_atual",
    "p"."valor_estoque",
    "j"."inicio" AS "janela_inicio",
    "j"."fim" AS "janela_fim",
    "j"."dias" AS "janela_dias",
    COALESCE("c"."qtd_consumida", (0)::numeric) AS "qtd_consumida",
    COALESCE("c"."valor_consumido", (0)::numeric) AS "valor_consumido",
    COALESCE("c"."eventos_consumo", (0)::bigint) AS "eventos_consumo",
    COALESCE("e"."qtd_recebida", (0)::numeric) AS "qtd_recebida",
    "e"."ultima_entrada",
    "mv"."ultima_movimentacao",
        CASE
            WHEN ("mv"."ultima_movimentacao" IS NULL) THEN NULL::integer
            ELSE (CURRENT_DATE - "mv"."ultima_movimentacao")
        END AS "dias_sem_movimento",
    "round"((COALESCE("c"."qtd_consumida", (0)::numeric) / ("j"."dias")::numeric), 4) AS "consumo_diario",
        CASE
            WHEN ((COALESCE("c"."qtd_consumida", (0)::numeric) <= (0)::numeric) OR ("p"."saldo_atual" IS NULL) OR ("p"."saldo_atual" <= (0)::numeric)) THEN NULL::numeric
            ELSE "round"(("p"."saldo_atual" / ("c"."qtd_consumida" / ("j"."dias")::numeric)), 1)
        END AS "cobertura_dias",
        CASE
            WHEN (("p"."saldo_atual" IS NULL) OR ("p"."saldo_atual" <= (0)::numeric) OR (COALESCE("c"."qtd_consumida", (0)::numeric) <= (0)::numeric)) THEN NULL::numeric
            ELSE "round"((("c"."qtd_consumida" * (365.0 / ("j"."dias")::numeric)) / "p"."saldo_atual"), 3)
        END AS "giro_anualizado",
    ((COALESCE("c"."qtd_consumida", (0)::numeric) <= (0)::numeric) AND (COALESCE("p"."saldo_atual", (0)::numeric) > (0)::numeric)) AS "sem_consumo_na_janela",
    (("mv"."ultima_movimentacao" IS NULL) AND (COALESCE("p"."saldo_atual", (0)::numeric) > (0)::numeric)) AS "legado_intocado"
   FROM (((("posicao" "p"
     CROSS JOIN "janela" "j")
     LEFT JOIN "consumo" "c" ON (("c"."material" = "p"."material")))
     LEFT JOIN "entrada" "e" ON (("e"."material" = "p"."material")))
     LEFT JOIN "movimento" "mv" ON (("mv"."material" = "p"."material")));


ALTER VIEW "public"."vw_estoque_giro" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_estoque_reposicao" WITH ("security_invoker"='on') AS
 WITH "parametros" AS (
         SELECT '2026-05-01'::"date" AS "inicio_producao",
            ( SELECT "max"("sap_mb51_mov"."data_lancamento") AS "max"
                   FROM "public"."sap_mb51_mov") AS "fim"
        ), "janela" AS (
         SELECT "parametros"."inicio_producao",
            "parametros"."fim",
            GREATEST(("parametros"."fim" - "parametros"."inicio_producao"), 1) AS "dias",
            (((((EXTRACT(year FROM "parametros"."fim"))::integer * 12) + (EXTRACT(month FROM "parametros"."fim"))::integer) - (((EXTRACT(year FROM "parametros"."inicio_producao"))::integer * 12) + (EXTRACT(month FROM "parametros"."inicio_producao"))::integer)) + 1) AS "periodos"
           FROM "parametros"
        ), "consumo" AS (
         SELECT "m"."material",
            "count"(*) AS "eventos",
            "sum"((- "m"."qtd_um_registro")) AS "total",
            "max"((- "m"."qtd_um_registro")) AS "maior_lote",
            "avg"((- "m"."qtd_um_registro")) AS "media_lote",
            COALESCE("stddev_samp"((- "m"."qtd_um_registro")), (0)::numeric) AS "dp_lote",
            "percentile_cont"((0.75)::double precision) WITHIN GROUP (ORDER BY (((- "m"."qtd_um_registro"))::double precision)) AS "lote_p75",
            "percentile_cont"((0.90)::double precision) WITHIN GROUP (ORDER BY (((- "m"."qtd_um_registro"))::double precision)) AS "lote_p90",
            "min"("m"."data_lancamento") AS "primeiro",
            "max"("m"."data_lancamento") AS "ultimo"
           FROM "public"."vw_mb51_classificado" "m",
            "janela" "j_1"
          WHERE (("m"."categoria" = 'consumo'::"text") AND ("m"."material" IS NOT NULL) AND ("m"."data_lancamento" >= "j_1"."inicio_producao") AND ("m"."qtd_um_registro" < (0)::numeric))
          GROUP BY "m"."material"
        ), "meses_ativos" AS (
         SELECT "m"."material",
            "count"(DISTINCT "date_trunc"('month'::"text", ("m"."data_lancamento")::timestamp with time zone)) AS "meses"
           FROM "public"."vw_mb51_classificado" "m",
            "janela" "j_1"
          WHERE (("m"."categoria" = 'consumo'::"text") AND ("m"."material" IS NOT NULL) AND ("m"."data_lancamento" >= "j_1"."inicio_producao"))
          GROUP BY "m"."material"
        ), "entradas_pedido" AS (
         SELECT DISTINCT ON ("m"."pedido", "m"."material") "m"."pedido",
            "m"."material",
            "m"."data_lancamento" AS "d_entrada"
           FROM "public"."vw_mb51_classificado" "m"
          WHERE (("m"."categoria" = 'entrada_compra'::"text") AND ("m"."pedido" IS NOT NULL) AND ("m"."material" IS NOT NULL))
          ORDER BY "m"."pedido", "m"."material", "m"."data_lancamento"
        ), "pedidos" AS (
         SELECT DISTINCT ON ("sap_zl0132_po"."doc_compra", "sap_zl0132_po"."material") "sap_zl0132_po"."doc_compra",
            "sap_zl0132_po"."material",
            "sap_zl0132_po"."data_doc"
           FROM "public"."sap_zl0132_po"
          WHERE (("sap_zl0132_po"."doc_compra" IS NOT NULL) AND ("sap_zl0132_po"."data_doc" IS NOT NULL))
          ORDER BY "sap_zl0132_po"."doc_compra", "sap_zl0132_po"."material", "sap_zl0132_po"."data_doc"
        ), "lead_material" AS (
         SELECT "e"."material",
            "avg"(("e"."d_entrada" - "p_1"."data_doc")) AS "lead_medio",
            "max"(("e"."d_entrada" - "p_1"."data_doc")) AS "lead_max",
            "count"(*) AS "amostras"
           FROM ("entradas_pedido" "e"
             JOIN "pedidos" "p_1" ON ((("p_1"."doc_compra" = "e"."pedido") AND ("p_1"."material" = "e"."material"))))
          WHERE ("e"."d_entrada" >= "p_1"."data_doc")
          GROUP BY "e"."material"
        ), "lead_global" AS (
         SELECT "percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY ((("e"."d_entrada" - "p_1"."data_doc"))::double precision)) AS "lead_mediano"
           FROM ("entradas_pedido" "e"
             JOIN "pedidos" "p_1" ON ((("p_1"."doc_compra" = "e"."pedido") AND ("p_1"."material" = "e"."material"))))
          WHERE ("e"."d_entrada" >= "p_1"."data_doc")
        ), "posicao" AS (
         SELECT "sap_zl0024_stk"."material",
            "max"("sap_zl0024_stk"."txt_breve_material") AS "descricao",
            "max"("sap_zl0024_stk"."grupo_mercadorias") AS "grupo_mercadorias",
            "max"("sap_zl0024_stk"."tipo_material") AS "tipo_material",
            "max"("sap_zl0024_stk"."umb") AS "umb",
            "sum"("sap_zl0024_stk"."quantidade") AS "saldo_atual",
            "sum"("sap_zl0024_stk"."valor_total") AS "valor_estoque",
            "avg"(NULLIF("sap_zl0024_stk"."preco_medio", (0)::numeric)) AS "preco_medio"
           FROM "public"."sap_zl0024_stk"
          GROUP BY "sap_zl0024_stk"."material"
        )
 SELECT "p"."material",
    "p"."descricao",
    "p"."grupo_mercadorias",
    "p"."tipo_material",
    "p"."umb",
    "p"."saldo_atual",
    "p"."valor_estoque",
    "p"."preco_medio",
    "j"."inicio_producao" AS "janela_inicio",
    "j"."fim" AS "janela_fim",
    "j"."dias" AS "janela_dias",
    "j"."periodos" AS "janela_periodos",
    COALESCE("c"."eventos", (0)::bigint) AS "eventos_consumo",
    COALESCE("ma"."meses", (0)::bigint) AS "meses_com_consumo",
    COALESCE("c"."total", (0)::numeric) AS "consumo_total",
    COALESCE("c"."maior_lote", (0)::numeric) AS "maior_lote",
    COALESCE("c"."media_lote", (0)::numeric) AS "media_lote",
    COALESCE("c"."dp_lote", (0)::numeric) AS "dp_lote",
    "round"(("c"."lote_p75")::numeric, 4) AS "lote_p75",
    "round"(("c"."lote_p90")::numeric, 4) AS "lote_p90",
        CASE
            WHEN (COALESCE("c"."total", (0)::numeric) > (0)::numeric) THEN "round"(("c"."maior_lote" / "c"."total"), 4)
            ELSE NULL::numeric
        END AS "concentracao_maior_lote",
    "c"."primeiro" AS "primeiro_consumo",
    "c"."ultimo" AS "ultimo_consumo",
    "round"((COALESCE("c"."total", (0)::numeric) / ("j"."dias")::numeric), 4) AS "consumo_diario",
        CASE
            WHEN (COALESCE("ma"."meses", (0)::bigint) > 0) THEN "round"((("j"."periodos")::numeric / ("ma"."meses")::numeric), 3)
            ELSE NULL::numeric
        END AS "adi",
        CASE
            WHEN (COALESCE("c"."media_lote", (0)::numeric) > (0)::numeric) THEN "round"("power"(("c"."dp_lote" / "c"."media_lote"), (2)::numeric), 3)
            ELSE NULL::numeric
        END AS "cv2",
    "round"((COALESCE(("lm"."lead_medio")::double precision, "lg"."lead_mediano", (19)::double precision))::numeric, 1) AS "lead_dias",
    "round"(("lm"."lead_max")::numeric, 0) AS "lead_dias_max",
    COALESCE("lm"."amostras", (0)::bigint) AS "lead_amostras",
    ("lm"."material" IS NOT NULL) AS "lead_proprio"
   FROM ((((("posicao" "p"
     CROSS JOIN "janela" "j")
     CROSS JOIN "lead_global" "lg")
     LEFT JOIN "consumo" "c" ON (("c"."material" = "p"."material")))
     LEFT JOIN "meses_ativos" "ma" ON (("ma"."material" = "p"."material")))
     LEFT JOIN "lead_material" "lm" ON (("lm"."material" = "p"."material")));


ALTER VIEW "public"."vw_estoque_reposicao" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_fbl1n_c_pagar_analise" WITH ("security_invoker"='on') AS
 SELECT "f"."id",
    "f"."simbolo_partida",
    "f"."codigo_imposto",
    "f"."empresa",
    "f"."chave_referencia_1",
    "f"."conta",
    "f"."numero_documento",
    "f"."razao_social_fornecedor",
    "f"."ano_mes",
    "f"."referencia",
    "f"."data_documento",
    "f"."data_lancamento",
    "f"."tipo_documento",
    "f"."estorno_com",
    "f"."conta_lancamento_contrapartida",
    "f"."data_pagamento",
    "f"."montante_moeda_doc",
    "f"."montante_base_desconto",
    "f"."montante_base_irf",
    "f"."montante_irf",
    "f"."moeda_documento",
    "f"."data_compensacao",
    "f"."doc_compensacao",
    "f"."centro",
    "f"."documento_compras",
    "f"."elemento_pep",
    "f"."imobilizado",
    "f"."loc_negocios",
    "f"."id_fiscal_1",
    "f"."id_fiscal_iva",
    "f"."texto",
    "f"."atribuicao",
    "f"."centro_lucro",
    "f"."parcelamento_tributario",
    "f"."texto_cabecalho_documento",
    "f"."bloqueio_pagamento",
    "f"."montante_mi2",
    "f"."montante_mi3",
    "f"."condicoes_pagamento",
    "f"."data_entrada",
    "f"."doc_faturamento",
    "f"."fornecedor",
    "f"."motivo_estorno",
    "f"."vencimento_liquido",
    "f"."vencimento_original",
    "f"."parcela",
    "f"."campos_extras",
    "f"."imported_at",
    "t"."tipo_documento" AS "tipo_documento_descricao",
    "t"."categoria_modulo" AS "tipo_documento_categoria_modulo",
    "t"."descricao_operacional" AS "tipo_documento_descricao_operacional"
   FROM ("public"."sap_fbl1n_pagar" "f"
     LEFT JOIN "public"."cadastro_tipodoc" "t" ON (("t"."codigo" = "f"."tipo_documento")));


ALTER VIEW "public"."vw_fbl1n_c_pagar_analise" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_historico_fornecedores_sem_po" AS
 SELECT "h"."material",
    "h"."txt_breve",
    "h"."cod_forn",
    "h"."cnpj",
    "h"."fornecedor",
    "h"."regiao_uf",
    "h"."grp_mercads",
    "h"."tipo_item",
    "h"."doc_compra",
    "h"."reqc",
    "h"."data_doc",
    "h"."qtd_pedido",
    "h"."qtd_fornecida",
    "h"."valor_liquido",
    "h"."preco_liquido_unit",
    "h"."pedido_parcial",
    "c"."telefone",
    "c"."email",
    "c"."classificacao",
    "c"."nome_fantasia",
    "cf"."pais",
    "cf"."localidade" AS "cidade",
    "cf"."rua",
    "cf"."codigo_postal",
    "m"."data_migo"
   FROM ((("public"."mv_historico_pedidos" "h"
     LEFT JOIN "public"."sup_fornecedores_contatos" "c" ON (("c"."cod_vendor" = "h"."cod_forn")))
     LEFT JOIN "public"."sup_fornecedores_cidades" "cf" ON (("cf"."forn_codigo" = "h"."cod_forn")))
     LEFT JOIN LATERAL ( SELECT "max"("p"."data_migo") AS "data_migo"
           FROM "public"."sap_zl0132_po" "p"
          WHERE (("p"."material" = "h"."material") AND ("p"."fornecedor_codigo" = "h"."cod_forn") AND ("p"."doc_compra" = "h"."doc_compra") AND (("lower"(COALESCE("p"."crf", ''::"text")) = 'x'::"text") OR (COALESCE("p"."qtd_fornecida", (0)::numeric) > (0)::numeric)))) "m" ON (true))
  WHERE ("h"."material" IN ( SELECT DISTINCT "v"."material"
           FROM "public"."vw_sap_requisicoes_enriquecidas" "v"
          WHERE (("v"."status_requisicao" = 'Sem PO'::"text") AND (COALESCE("v"."codigo_de_eliminacao", "v"."eliminado", false) = false) AND (COALESCE("v"."status_processamento", ''::"text") <> 'B'::"text"))));


ALTER VIEW "public"."vw_historico_fornecedores_sem_po" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_historico_pedidos" AS
 SELECT "h"."material",
    "h"."txt_breve",
    "h"."cod_forn",
    "h"."cnpj",
    "h"."fornecedor",
    "h"."regiao_uf",
    "h"."grp_mercads",
    "h"."tipo_item",
    "h"."doc_compra",
    "h"."reqc",
    "h"."data_doc",
    "h"."qtd_pedido",
    "h"."qtd_fornecida",
    "h"."valor_liquido",
    "h"."preco_liquido_unit",
    "h"."pedido_parcial",
    "cf"."pais",
    "cf"."localidade" AS "cidade",
    "cf"."rua",
    "cf"."codigo_postal",
    COALESCE(NULLIF(TRIM(BOTH FROM "cf"."estado_uf"), ''::"text"),
        CASE
            WHEN ("h"."regiao_uf" ~ '^[A-Za-z]{2}$'::"text") THEN "upper"("h"."regiao_uf")
            ELSE NULL::"text"
        END) AS "estado_uf",
    COALESCE(NULLIF(TRIM(BOTH FROM "gm"."denominacao2"), ''::"text"), NULLIF(TRIM(BOTH FROM "gm"."denominacao"), ''::"text")) AS "grp_mercads_desc"
   FROM (("public"."mv_historico_pedidos" "h"
     LEFT JOIN "public"."sup_fornecedores_cidades" "cf" ON (("cf"."forn_codigo" = "h"."cod_forn")))
     LEFT JOIN "public"."cadastro_grupo_mercadoria" "gm" ON (("gm"."codigo" = "h"."grp_mercads")));


ALTER VIEW "public"."vw_historico_pedidos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_sap_materiais_estatisticas" AS
 SELECT "company",
    "category",
    ("count"(*))::integer AS "total"
   FROM "public"."sap_zl0169_162_catalogo"
  WHERE ("is_active" = true)
  GROUP BY "company", "category";


ALTER VIEW "public"."vw_sap_materiais_estatisticas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_materials_stats" WITH ("security_invoker"='true') AS
 SELECT "company",
    "category",
    "total"
   FROM "public"."vw_sap_materiais_estatisticas";


ALTER VIEW "public"."vw_materials_stats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."zl0170_miro" WITH ("security_invoker"='true') AS
 SELECT "id",
    "numero_pedido",
    "empresa",
    "centro",
    "data_criacao_pedido",
    "data_aprovacao_pedido",
    "data_remessa",
    "item",
    "material",
    "qtd_pedido",
    "unidade_pedido",
    "preco_liquido",
    "moeda_preco",
    "valor_liquido",
    "moeda_valor_liquido",
    "requisicao_compra",
    "data_solicitacao",
    "doc_migo",
    "ano_migo",
    "folha_servico",
    "data_criacao_migo",
    "data_lancamento_migo",
    "qtd_migo",
    "unidade_migo",
    "montante_migo",
    "moeda_migo",
    "doc_miro",
    "ano_miro",
    "data_criacao_miro",
    "data_lancamento_miro",
    "data_documento",
    "hora",
    "data_entrada",
    "referencia",
    "qtd_miro",
    "unidade_miro",
    "montante_miro",
    "numero_doc_contabil",
    "fornecedor",
    "nome_1",
    "nome_2",
    "id_fiscal_1",
    "id_fiscal_2",
    "id_fiscal_iva",
    "doc_pagamento",
    "data_pagamento",
    "campos_extras",
    "imported_at"
   FROM "public"."sap_zl0170_miro";


ALTER VIEW "public"."zl0170_miro" OWNER TO "postgres";


ALTER TABLE "public"."sap_zl0170_miro" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."zl0170_miro_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."core_logs_atividade"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."almoxarifado_chegadas"
    ADD CONSTRAINT "almoxarifado_chegadas_pkey" PRIMARY KEY ("ri");



ALTER TABLE ONLY "public"."ops_api_uso"
    ADD CONSTRAINT "api_uso_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_grupos_compradores"
    ADD CONSTRAINT "buyer_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cadastro_grupo_mercadoria"
    ADD CONSTRAINT "cadastro_grupo_mercadoria_pkey" PRIMARY KEY ("codigo");



ALTER TABLE ONLY "public"."cadastro_tipodoc"
    ADD CONSTRAINT "cadastro_tipodoc_pkey1" PRIMARY KEY ("codigo");



ALTER TABLE ONLY "public"."sup_fornecedores_cidades"
    ADD CONSTRAINT "cidadeforn_forn_codigo_key" UNIQUE ("forn_codigo");



ALTER TABLE ONLY "public"."sup_fornecedores_cidades"
    ADD CONSTRAINT "cidadeforn_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_fornecedores_cnpj"
    ADD CONSTRAINT "cnpj_forn_cod_forn_key" UNIQUE ("cod_forn");



ALTER TABLE ONLY "public"."sup_fornecedores_cnpj"
    ADD CONSTRAINT "cnpj_forn_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_compradores"
    ADD CONSTRAINT "compradores_pkey" PRIMARY KEY ("grupo_compras");



ALTER TABLE ONLY "public"."sup_fornecedores_contatos"
    ADD CONSTRAINT "contatos_cod_vendor_key" UNIQUE ("cod_vendor");



ALTER TABLE ONLY "public"."sup_fornecedores_contatos"
    ADD CONSTRAINT "contatos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contrato_anexos"
    ADD CONSTRAINT "contrato_anexos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contratos_detalhes"
    ADD CONSTRAINT "contratos_detalhes_pkey" PRIMARY KEY ("documento_compras");



ALTER TABLE ONLY "public"."ops_conversoes_markdown"
    ADD CONSTRAINT "conversoes_markdown_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_cotacao_descricao_map"
    ADD CONSTRAINT "cotacao_descricao_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_cotacao_extracoes"
    ADD CONSTRAINT "cotacao_extracoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_cotacao_historico"
    ADD CONSTRAINT "cotacao_historico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_cotacao_processo_itens"
    ADD CONSTRAINT "cotacao_processo_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_cotacao_processos"
    ADD CONSTRAINT "cotacao_processos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_cotacao_proposta_itens"
    ADD CONSTRAINT "cotacao_proposta_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_cotacao_propostas"
    ADD CONSTRAINT "cotacao_propostas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ops_dataset_versoes"
    ADD CONSTRAINT "dataset_versions_pkey" PRIMARY KEY ("dataset");



ALTER TABLE ONLY "public"."sup_ddp"
    ADD CONSTRAINT "ddp_pkey" PRIMARY KEY ("ddp");



ALTER TABLE ONLY "public"."sap_zl0024_stk"
    ADD CONSTRAINT "estoque_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expedicao_carregamentos"
    ADD CONSTRAINT "expedicao_carregamentos_numero_key" UNIQUE ("numero");



ALTER TABLE ONLY "public"."expedicao_carregamentos"
    ADD CONSTRAINT "expedicao_carregamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expedicao_fotos"
    ADD CONSTRAINT "expedicao_fotos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expedicao_tramos"
    ADD CONSTRAINT "expedicao_tramos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sap_fbl1n_pagar"
    ADD CONSTRAINT "fbl1n_c_pagar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ops_feedback"
    ADD CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ops_importacoes"
    ADD CONSTRAINT "import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_impostos"
    ADD CONSTRAINT "impostos_pkey" PRIMARY KEY ("incoterms");



ALTER TABLE ONLY "public"."ipca_indice"
    ADD CONSTRAINT "ipca_indice_pkey" PRIMARY KEY ("mes");



ALTER TABLE ONLY "public"."sap_zl0169_162_catalogo"
    ADD CONSTRAINT "materials_material_code_key" UNIQUE ("material_code");



ALTER TABLE ONLY "public"."sap_zl0169_162_catalogo"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sap_mb51_mov"
    ADD CONSTRAINT "mb51_mov_estoque_chave_unica_key" UNIQUE ("chave_unica");



ALTER TABLE ONLY "public"."sap_mb51_mov"
    ADD CONSTRAINT "mb51_mov_estoque_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sap_me3n_contrato"
    ADD CONSTRAINT "me3m_contratos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sap_me3n_contrato"
    ADD CONSTRAINT "me3n_contratos_documento_item_key" UNIQUE ("documento_compras", "item");



ALTER TABLE ONLY "public"."core_notificacoes"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sap_requisicoes_observacoes"
    ADD CONSTRAINT "obs_historico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("ri");



ALTER TABLE ONLY "public"."sap_zl0132_po"
    ADD CONSTRAINT "pedidosforn_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sap_zl0132_po"
    ADD CONSTRAINT "pedidosforn_ri_doc_compra_unique" UNIQUE ("ri", "doc_compra");



ALTER TABLE ONLY "public"."port_briefing_participantes"
    ADD CONSTRAINT "port_briefing_participantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."port_briefing_sessoes"
    ADD CONSTRAINT "port_briefing_sessoes_numero_protocolo_key" UNIQUE ("numero_protocolo");



ALTER TABLE ONLY "public"."port_briefing_sessoes"
    ADD CONSTRAINT "port_briefing_sessoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."port_controle_carretas"
    ADD CONSTRAINT "port_controle_carretas_numero_protocolo_key" UNIQUE ("numero_protocolo");



ALTER TABLE ONLY "public"."port_controle_carretas"
    ADD CONSTRAINT "port_controle_carretas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."port_controle_equipamentos"
    ADD CONSTRAINT "port_controle_equipamentos_numero_protocolo_key" UNIQUE ("numero_protocolo");



ALTER TABLE ONLY "public"."port_controle_equipamentos"
    ADD CONSTRAINT "port_controle_equipamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."port_registro_transportes"
    ADD CONSTRAINT "port_registro_transportes_numero_protocolo_key" UNIQUE ("numero_protocolo");



ALTER TABLE ONLY "public"."port_registro_transportes"
    ADD CONSTRAINT "port_registro_transportes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."port_relatorio_ocorrencias"
    ADD CONSTRAINT "port_relatorio_ocorrencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."port_relatorio_portaria"
    ADD CONSTRAINT "port_relatorio_portaria_numero_protocolo_key" UNIQUE ("numero_protocolo");



ALTER TABLE ONLY "public"."port_relatorio_portaria"
    ADD CONSTRAINT "port_relatorio_portaria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."port_vigilantes"
    ADD CONSTRAINT "port_vigilantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_perfis"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."core_perfis"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_rastreio_mensagens"
    ADD CONSTRAINT "rastreio_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sup_rastreio_prioridades"
    ADD CONSTRAINT "rastreio_prioridades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_solicitacoes_anexos"
    ADD CONSTRAINT "request_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_solicitacoes_comentarios"
    ADD CONSTRAINT "request_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_solicitacoes_itens"
    ADD CONSTRAINT "request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_solicitacoes_historico_status"
    ADD CONSTRAINT "request_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_solicitacoes"
    ADD CONSTRAINT "requests_number_key" UNIQUE ("number");



ALTER TABLE ONLY "public"."core_solicitacoes"
    ADD CONSTRAINT "requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sap_me5a_rc"
    ADD CONSTRAINT "requisicoes_pkey" PRIMARY KEY ("ri");



ALTER TABLE ONLY "public"."rh_ase_itens"
    ADD CONSTRAINT "rh_ase_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rh_ase_solicitacoes"
    ADD CONSTRAINT "rh_ase_solicitacoes_numero_protocolo_key" UNIQUE ("numero_protocolo");



ALTER TABLE ONLY "public"."rh_ase_solicitacoes"
    ADD CONSTRAINT "rh_ase_solicitacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rh_hora_extra"
    ADD CONSTRAINT "rh_hora_extra_dia_key" UNIQUE ("dia");



ALTER TABLE ONLY "public"."rh_hora_extra"
    ADD CONSTRAINT "rh_hora_extra_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rh_pessoas"
    ADD CONSTRAINT "rh_pessoas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rh_pessoas"
    ADD CONSTRAINT "rh_pessoas_registro_key" UNIQUE ("registro");



ALTER TABLE ONLY "public"."rh_setores"
    ADD CONSTRAINT "rh_setores_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."rh_setores"
    ADD CONSTRAINT "rh_setores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rh_turnos"
    ADD CONSTRAINT "rh_turnos_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."rh_turnos"
    ADD CONSTRAINT "rh_turnos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_setores"
    ADD CONSTRAINT "sectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sequences"
    ADD CONSTRAINT "sequences_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."sup_fretes"
    ADD CONSTRAINT "tabela_frete_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipo_mov_estoque"
    ADD CONSTRAINT "tipo_mov_estoque_pkey" PRIMARY KEY ("tmv");



ALTER TABLE ONLY "public"."ops_eventos_uso"
    ADD CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sap_zl0170_miro"
    ADD CONSTRAINT "zl0170_miro_pkey" PRIMARY KEY ("id");



CREATE INDEX "api_uso_logs_api_id_idx" ON "public"."ops_api_uso" USING "btree" ("api_id");



CREATE INDEX "api_uso_logs_created_at_idx" ON "public"."ops_api_uso" USING "btree" ("created_at" DESC);



CREATE INDEX "conversoes_markdown_created_at_idx" ON "public"."ops_conversoes_markdown" USING "btree" ("created_at" DESC);



CREATE INDEX "conversoes_markdown_user_id_idx" ON "public"."ops_conversoes_markdown" USING "btree" ("user_id");



CREATE UNIQUE INDEX "cotacao_descricao_map_chave" ON "public"."sup_cotacao_descricao_map" USING "btree" ("fornecedor_cnpj", "descricao_norm");



CREATE INDEX "cotacao_descricao_map_codigo_idx" ON "public"."sup_cotacao_descricao_map" USING "btree" ("fornecedor_cnpj", "codigo_produto") WHERE ("codigo_produto" IS NOT NULL);



CREATE INDEX "cotacao_descricao_map_material_idx" ON "public"."sup_cotacao_descricao_map" USING "btree" ("material_code");



CREATE INDEX "cotacao_descricao_map_norm_trgm" ON "public"."sup_cotacao_descricao_map" USING "gin" ("descricao_norm" "public"."gin_trgm_ops");



CREATE INDEX "cotacao_extracoes_created_idx" ON "public"."sup_cotacao_extracoes" USING "btree" ("created_at" DESC);



CREATE INDEX "cotacao_extracoes_processo_idx" ON "public"."sup_cotacao_extracoes" USING "btree" ("processo_id");



CREATE INDEX "cotacao_processo_itens_material_idx" ON "public"."sup_cotacao_processo_itens" USING "btree" ("material_code");



CREATE UNIQUE INDEX "cotacao_processo_itens_proc_ri_key" ON "public"."sup_cotacao_processo_itens" USING "btree" ("processo_id", "ri");



CREATE INDEX "cotacao_processo_itens_ri_idx" ON "public"."sup_cotacao_processo_itens" USING "btree" ("ri");



CREATE INDEX "cotacao_processo_itens_texto_trgm" ON "public"."sup_cotacao_processo_itens" USING "gin" ("public"."f_unaccent"("upper"("texto_breve")) "public"."gin_trgm_ops");



CREATE UNIQUE INDEX "cotacao_processos_numero_key" ON "public"."sup_cotacao_processos" USING "btree" ("numero");



CREATE INDEX "cotacao_processos_status_idx" ON "public"."sup_cotacao_processos" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "cotacao_proposta_itens_desc_trgm" ON "public"."sup_cotacao_proposta_itens" USING "gin" ("public"."f_unaccent"("upper"("descricao_produto")) "public"."gin_trgm_ops");



CREATE INDEX "cotacao_proposta_itens_material_idx" ON "public"."sup_cotacao_proposta_itens" USING "btree" ("material_code") WHERE ("material_code" IS NOT NULL);



CREATE INDEX "cotacao_proposta_itens_processo_item_idx" ON "public"."sup_cotacao_proposta_itens" USING "btree" ("processo_item_id");



CREATE INDEX "cotacao_proposta_itens_proposta_idx" ON "public"."sup_cotacao_proposta_itens" USING "btree" ("proposta_id");



CREATE INDEX "cotacao_proposta_itens_ri_idx" ON "public"."sup_cotacao_proposta_itens" USING "btree" ("ri");



CREATE INDEX "cotacao_propostas_cnpj_idx" ON "public"."sup_cotacao_propostas" USING "btree" ("fornecedor_cnpj");



CREATE INDEX "cotacao_propostas_cod_vendor_idx" ON "public"."sup_cotacao_propostas" USING "btree" ("cod_vendor");



CREATE INDEX "cotacao_propostas_emissao_idx" ON "public"."sup_cotacao_propostas" USING "btree" ("data_emissao" DESC);



CREATE INDEX "cotacao_propostas_processo_idx" ON "public"."sup_cotacao_propostas" USING "btree" ("processo_id");



CREATE INDEX "expedicao_fotos_carregamento_idx" ON "public"."expedicao_fotos" USING "btree" ("carregamento_id");



CREATE INDEX "expedicao_fotos_tramo_idx" ON "public"."expedicao_fotos" USING "btree" ("tramo_id");



CREATE INDEX "expedicao_tramos_carregamento_idx" ON "public"."expedicao_tramos" USING "btree" ("carregamento_id");



CREATE INDEX "feedback_reports_created_at_idx" ON "public"."ops_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "feedback_reports_status_idx" ON "public"."ops_feedback" USING "btree" ("status");



CREATE INDEX "idx_contrato_anexos_documento" ON "public"."contrato_anexos" USING "btree" ("documento_compras");



CREATE INDEX "idx_cotacao_historico_ri_cod_forn" ON "public"."sup_cotacao_historico" USING "btree" ("ri", "cod_forn");



CREATE INDEX "idx_estoque_material" ON "public"."sap_zl0024_stk" USING "btree" ("material");



CREATE INDEX "idx_fbl1n_c_pagar_doc_compensacao" ON "public"."sap_fbl1n_pagar" USING "btree" ("doc_compensacao");



CREATE INDEX "idx_fbl1n_c_pagar_empresa" ON "public"."sap_fbl1n_pagar" USING "btree" ("empresa");



CREATE INDEX "idx_fbl1n_c_pagar_fornecedor" ON "public"."sap_fbl1n_pagar" USING "btree" ("razao_social_fornecedor");



CREATE INDEX "idx_fbl1n_c_pagar_numero_documento" ON "public"."sap_fbl1n_pagar" USING "btree" ("numero_documento");



CREATE INDEX "idx_fbl1n_c_pagar_vencimento" ON "public"."sap_fbl1n_pagar" USING "btree" ("vencimento_liquido");



CREATE INDEX "idx_mb51_mov_data_lancamento" ON "public"."sap_mb51_mov" USING "btree" ("data_lancamento");



CREATE INDEX "idx_mb51_mov_deposito" ON "public"."sap_mb51_mov" USING "btree" ("deposito");



CREATE INDEX "idx_mb51_mov_doc_material" ON "public"."sap_mb51_mov" USING "btree" ("doc_material");



CREATE INDEX "idx_mb51_mov_elemento_pep" ON "public"."sap_mb51_mov" USING "btree" ("elemento_pep");



CREATE INDEX "idx_mb51_mov_material" ON "public"."sap_mb51_mov" USING "btree" ("material");



CREATE INDEX "idx_mb51_mov_tipo_movimento" ON "public"."sap_mb51_mov" USING "btree" ("tipo_movimento");



CREATE INDEX "idx_pedidosforn_cnpj" ON "public"."sap_zl0132_po" USING "btree" ("cnpj");



CREATE INDEX "idx_pedidosforn_data_doc" ON "public"."sap_zl0132_po" USING "btree" ("data_doc");



CREATE INDEX "idx_pedidosforn_data_rc" ON "public"."sap_zl0132_po" USING "btree" ("data_rc");



CREATE INDEX "idx_pedidosforn_material" ON "public"."sap_zl0132_po" USING "btree" ("material");



CREATE INDEX "idx_pedidosforn_material_fornecedor_codigo_doc_compra" ON "public"."sap_zl0132_po" USING "btree" ("material", "fornecedor_codigo", "doc_compra");



CREATE INDEX "idx_rastreio_mensagens_ri" ON "public"."sup_rastreio_mensagens" USING "btree" ("ri", "created_at");



CREATE INDEX "idx_rastreio_prioridades_ri" ON "public"."sup_rastreio_prioridades" USING "btree" ("ri", "created_at" DESC);



CREATE INDEX "idx_requisicoes_data_solicitacao" ON "public"."sap_me5a_rc" USING "btree" ("data_da_solicitacao");



CREATE INDEX "idx_usage_events_created_at" ON "public"."ops_eventos_uso" USING "btree" ("created_at");



CREATE INDEX "idx_usage_events_session" ON "public"."ops_eventos_uso" USING "btree" ("session_id");



CREATE INDEX "idx_usage_events_type_created" ON "public"."ops_eventos_uso" USING "btree" ("event_type", "created_at");



CREATE INDEX "idx_usage_events_user_id" ON "public"."ops_eventos_uso" USING "btree" ("user_id");



CREATE INDEX "idx_zl0170_miro_doc_miro" ON "public"."sap_zl0170_miro" USING "btree" ("doc_miro");



CREATE INDEX "idx_zl0170_miro_fornecedor" ON "public"."sap_zl0170_miro" USING "btree" ("fornecedor");



CREATE INDEX "idx_zl0170_miro_material" ON "public"."sap_zl0170_miro" USING "btree" ("material");



CREATE INDEX "idx_zl0170_miro_numero_doc_contabil" ON "public"."sap_zl0170_miro" USING "btree" ("numero_doc_contabil");



CREATE INDEX "idx_zl0170_miro_numero_pedido" ON "public"."sap_zl0170_miro" USING "btree" ("numero_pedido");



CREATE INDEX "materials_busca_desc_trgm" ON "public"."sap_zl0169_162_catalogo" USING "gin" ("busca_desc" "public"."gin_trgm_ops") WITH ("fastupdate"='off');



CREATE INDEX "materials_code_prefix" ON "public"."sap_zl0169_162_catalogo" USING "btree" ("material_code" "text_pattern_ops");



CREATE INDEX "materials_code_trgm" ON "public"."sap_zl0169_162_catalogo" USING "gin" ("material_code" "public"."gin_trgm_ops") WITH ("fastupdate"='off');



CREATE UNIQUE INDEX "mv_benchmark_material_uidx" ON "public"."mv_benchmark_material" USING "btree" ("material");



CREATE INDEX "mv_historico_pedidos_material_idx" ON "public"."mv_historico_pedidos" USING "btree" ("material");



CREATE UNIQUE INDEX "mv_historico_pedidos_uidx" ON "public"."mv_historico_pedidos" USING "btree" ("material", COALESCE("cod_forn", ''::"text"), COALESCE("cnpj", ''::"text"), COALESCE("doc_compra", ''::"text"));



CREATE UNIQUE INDEX "mv_material_sinais_code" ON "public"."mv_material_sinais" USING "btree" ("material_code");



CREATE UNIQUE INDEX "mv_pedido_atual_por_ri_ri_idx" ON "public"."mv_pedido_atual_por_ri" USING "btree" ("ri");



CREATE INDEX "port_briefing_participantes_cpf_idx" ON "public"."port_briefing_participantes" USING "btree" ("cpf");



CREATE INDEX "port_briefing_participantes_data_idx" ON "public"."port_briefing_participantes" USING "btree" ("data" DESC);



CREATE INDEX "port_briefing_participantes_sessao_idx" ON "public"."port_briefing_participantes" USING "btree" ("sessao_id");



CREATE INDEX "port_briefing_sessoes_data_idx" ON "public"."port_briefing_sessoes" USING "btree" ("data" DESC);



CREATE INDEX "port_briefing_sessoes_status_idx" ON "public"."port_briefing_sessoes" USING "btree" ("status");



CREATE INDEX "port_controle_carretas_data_idx" ON "public"."port_controle_carretas" USING "btree" ("data_entrada" DESC);



CREATE INDEX "port_controle_carretas_placas_idx" ON "public"."port_controle_carretas" USING "btree" ("placa_cavalo", "placa_carreta");



CREATE INDEX "port_controle_carretas_status_idx" ON "public"."port_controle_carretas" USING "btree" ("status");



CREATE INDEX "port_controle_equipamentos_data_idx" ON "public"."port_controle_equipamentos" USING "btree" ("data_entrada" DESC);



CREATE INDEX "port_controle_equipamentos_empresa_idx" ON "public"."port_controle_equipamentos" USING "btree" ("nome_empresa");



CREATE INDEX "port_controle_equipamentos_status_idx" ON "public"."port_controle_equipamentos" USING "btree" ("status");



CREATE INDEX "port_registro_transportes_data_idx" ON "public"."port_registro_transportes" USING "btree" ("data" DESC);



CREATE INDEX "port_registro_transportes_placa_idx" ON "public"."port_registro_transportes" USING "btree" ("placa");



CREATE INDEX "port_registro_transportes_status_idx" ON "public"."port_registro_transportes" USING "btree" ("status");



CREATE INDEX "port_relatorio_ocorrencias_horario_idx" ON "public"."port_relatorio_ocorrencias" USING "btree" ("horario");



CREATE INDEX "port_relatorio_ocorrencias_relatorio_idx" ON "public"."port_relatorio_ocorrencias" USING "btree" ("relatorio_id");



CREATE INDEX "port_relatorio_portaria_data_idx" ON "public"."port_relatorio_portaria" USING "btree" ("data" DESC);



CREATE INDEX "port_relatorio_portaria_status_idx" ON "public"."port_relatorio_portaria" USING "btree" ("status");



CREATE INDEX "port_vigilantes_ativo_idx" ON "public"."port_vigilantes" USING "btree" ("ativo");



CREATE INDEX "port_vigilantes_nome_idx" ON "public"."port_vigilantes" USING "btree" ("nome");



CREATE INDEX "request_attachments_material_code_idx" ON "public"."core_solicitacoes_anexos" USING "btree" ("material_code");



CREATE INDEX "request_attachments_request_id_idx" ON "public"."core_solicitacoes_anexos" USING "btree" ("request_id");



CREATE INDEX "request_attachments_request_item_id_idx" ON "public"."core_solicitacoes_anexos" USING "btree" ("request_item_id");



CREATE INDEX "rh_ase_itens_solicitacao_idx" ON "public"."rh_ase_itens" USING "btree" ("solicitacao_id");



CREATE INDEX "rh_ase_solicitacoes_data_idx" ON "public"."rh_ase_solicitacoes" USING "btree" ("data_execucao" DESC);



CREATE INDEX "rh_pessoas_nome_idx" ON "public"."rh_pessoas" USING "btree" ("lower"("nome"));



CREATE OR REPLACE TRIGGER "trg_sync_cnpj_forn" AFTER INSERT OR UPDATE ON "public"."sap_zl0132_po" FOR EACH ROW EXECUTE FUNCTION "public"."sync_cnpj_forn_from_pedidosforn"();



ALTER TABLE ONLY "public"."cadastro_grupo_mercadoria"
    ADD CONSTRAINT "cadastro_grupo_mercadoria_codigo_pai_fkey" FOREIGN KEY ("codigo_pai") REFERENCES "public"."cadastro_grupo_mercadoria"("codigo");



ALTER TABLE ONLY "public"."sup_cotacao_processo_itens"
    ADD CONSTRAINT "cotacao_processo_itens_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."sup_cotacao_processos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sup_cotacao_processos"
    ADD CONSTRAINT "cotacao_processos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."sup_cotacao_proposta_itens"
    ADD CONSTRAINT "cotacao_proposta_itens_processo_item_id_fkey" FOREIGN KEY ("processo_item_id") REFERENCES "public"."sup_cotacao_processo_itens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sup_cotacao_proposta_itens"
    ADD CONSTRAINT "cotacao_proposta_itens_proposta_id_fkey" FOREIGN KEY ("proposta_id") REFERENCES "public"."sup_cotacao_propostas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sup_cotacao_propostas"
    ADD CONSTRAINT "cotacao_propostas_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "public"."sup_fornecedores_contatos"("id");



ALTER TABLE ONLY "public"."sup_cotacao_propostas"
    ADD CONSTRAINT "cotacao_propostas_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."sup_cotacao_propostas"
    ADD CONSTRAINT "cotacao_propostas_extracao_id_fkey" FOREIGN KEY ("extracao_id") REFERENCES "public"."sup_cotacao_extracoes"("id");



ALTER TABLE ONLY "public"."sup_cotacao_propostas"
    ADD CONSTRAINT "cotacao_propostas_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."sup_cotacao_processos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expedicao_fotos"
    ADD CONSTRAINT "expedicao_fotos_carregamento_id_fkey" FOREIGN KEY ("carregamento_id") REFERENCES "public"."expedicao_carregamentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expedicao_fotos"
    ADD CONSTRAINT "expedicao_fotos_tramo_id_fkey" FOREIGN KEY ("tramo_id") REFERENCES "public"."expedicao_tramos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expedicao_tramos"
    ADD CONSTRAINT "expedicao_tramos_carregamento_id_fkey" FOREIGN KEY ("carregamento_id") REFERENCES "public"."expedicao_carregamentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ops_feedback"
    ADD CONSTRAINT "feedback_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."core_notificacoes"
    ADD CONSTRAINT "notifications_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."core_solicitacoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."port_briefing_participantes"
    ADD CONSTRAINT "port_briefing_participantes_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "public"."port_briefing_sessoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."port_briefing_sessoes"
    ADD CONSTRAINT "port_briefing_sessoes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."port_controle_carretas"
    ADD CONSTRAINT "port_controle_carretas_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."port_controle_equipamentos"
    ADD CONSTRAINT "port_controle_equipamentos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."port_registro_transportes"
    ADD CONSTRAINT "port_registro_transportes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."port_relatorio_ocorrencias"
    ADD CONSTRAINT "port_relatorio_ocorrencias_relatorio_id_fkey" FOREIGN KEY ("relatorio_id") REFERENCES "public"."port_relatorio_portaria"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."port_relatorio_portaria"
    ADD CONSTRAINT "port_relatorio_portaria_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."port_vigilantes"
    ADD CONSTRAINT "port_vigilantes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."core_perfis"
    ADD CONSTRAINT "profiles_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."core_setores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."core_solicitacoes_anexos"
    ADD CONSTRAINT "request_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."core_solicitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."core_solicitacoes_comentarios"
    ADD CONSTRAINT "request_comments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."core_solicitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."core_solicitacoes_itens"
    ADD CONSTRAINT "request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."core_solicitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."core_solicitacoes_historico_status"
    ADD CONSTRAINT "request_status_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."core_solicitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."core_solicitacoes"
    ADD CONSTRAINT "requests_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "public"."core_perfis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."core_solicitacoes"
    ADD CONSTRAINT "requests_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "public"."core_perfis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."core_solicitacoes"
    ADD CONSTRAINT "requests_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "public"."core_perfis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."core_solicitacoes"
    ADD CONSTRAINT "requests_solicitante_sector_id_fkey" FOREIGN KEY ("solicitante_sector_id") REFERENCES "public"."core_setores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."core_solicitacoes"
    ADD CONSTRAINT "requests_target_sector_id_fkey" FOREIGN KEY ("target_sector_id") REFERENCES "public"."core_setores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rh_ase_itens"
    ADD CONSTRAINT "rh_ase_itens_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."rh_pessoas"("id");



ALTER TABLE ONLY "public"."rh_ase_itens"
    ADD CONSTRAINT "rh_ase_itens_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."rh_ase_solicitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rh_ase_solicitacoes"
    ADD CONSTRAINT "rh_ase_solicitacoes_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."rh_setores"("id");



ALTER TABLE ONLY "public"."rh_ase_solicitacoes"
    ADD CONSTRAINT "rh_ase_solicitacoes_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "public"."core_perfis"("id");



ALTER TABLE ONLY "public"."rh_ase_solicitacoes"
    ADD CONSTRAINT "rh_ase_solicitacoes_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."rh_turnos"("id");



CREATE POLICY "Permitir atualização total para tabela_frete" ON "public"."sup_fretes" FOR UPDATE USING (true);



CREATE POLICY "Permitir exclusão total para tabela_frete" ON "public"."sup_fretes" FOR DELETE USING (true);



CREATE POLICY "Permitir inserção total para tabela_frete" ON "public"."sup_fretes" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir leitura total para tabela_frete" ON "public"."sup_fretes" FOR SELECT USING (true);



CREATE POLICY "activity_logs_insert" ON "public"."core_logs_atividade" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "activity_logs_read" ON "public"."core_logs_atividade" FOR SELECT TO "authenticated" USING (("public"."has_role"('admin'::"text") OR ("user_id" = (( SELECT "auth"."uid"() AS "uid"))::"text")));



ALTER TABLE "public"."almoxarifado_chegadas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "almoxarifado_chegadas_delete" ON "public"."almoxarifado_chegadas" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "almoxarifado_chegadas_read" ON "public"."almoxarifado_chegadas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "almoxarifado_chegadas_update" ON "public"."almoxarifado_chegadas" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "almoxarifado_chegadas_write" ON "public"."almoxarifado_chegadas" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "api_uso_logs_select_admin" ON "public"."ops_api_uso" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."core_perfis"
  WHERE (("core_perfis"."id" = (( SELECT "auth"."uid"() AS "uid"))::"text") AND ('admin'::"text" = ANY ("core_perfis"."roles"))))));



CREATE POLICY "buyer_groups_all" ON "public"."core_grupos_compradores" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."cadastro_grupo_mercadoria" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cadastro_grupo_mercadoria_read" ON "public"."cadastro_grupo_mercadoria" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."cadastro_tipodoc" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cadastro_tipodoc_read" ON "public"."cadastro_tipodoc" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "cidadeforn_read" ON "public"."sup_fornecedores_cidades" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cidadeforn_update" ON "public"."sup_fornecedores_cidades" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "cidadeforn_write" ON "public"."sup_fornecedores_cidades" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "cnpj_forn_read" ON "public"."sup_fornecedores_cnpj" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cnpj_forn_update" ON "public"."sup_fornecedores_cnpj" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "cnpj_forn_write" ON "public"."sup_fornecedores_cnpj" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "compradores_read" ON "public"."sup_compradores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "contatos_read" ON "public"."sup_fornecedores_contatos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "contatos_write" ON "public"."sup_fornecedores_contatos" TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text")));



ALTER TABLE "public"."contrato_anexos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contrato_anexos_all" ON "public"."contrato_anexos" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."contratos_detalhes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contratos_detalhes_all" ON "public"."contratos_detalhes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "conversoes_markdown_insert" ON "public"."ops_conversoes_markdown" FOR INSERT TO "authenticated" WITH CHECK (("public"."pode_gerir_cotacoes"() AND ("user_id" = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "conversoes_markdown_select" ON "public"."ops_conversoes_markdown" FOR SELECT TO "authenticated" USING ("public"."pode_gerir_cotacoes"());



ALTER TABLE "public"."core_grupos_compradores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_logs_atividade" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_notificacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_perfis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_setores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_solicitacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_solicitacoes_anexos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_solicitacoes_comentarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_solicitacoes_historico_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_solicitacoes_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cotacao_descricao_map_rw" ON "public"."sup_cotacao_descricao_map" TO "authenticated" USING ("public"."pode_gerir_cotacoes"()) WITH CHECK ("public"."pode_gerir_cotacoes"());



CREATE POLICY "cotacao_extracoes_select" ON "public"."sup_cotacao_extracoes" FOR SELECT TO "authenticated" USING ("public"."pode_gerir_cotacoes"());



CREATE POLICY "cotacao_historico_all" ON "public"."sup_cotacao_historico" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "cotacao_processo_itens_rw" ON "public"."sup_cotacao_processo_itens" TO "authenticated" USING ("public"."pode_gerir_cotacoes"()) WITH CHECK ("public"."pode_gerir_cotacoes"());



CREATE POLICY "cotacao_processos_rw" ON "public"."sup_cotacao_processos" TO "authenticated" USING ("public"."pode_gerir_cotacoes"()) WITH CHECK ("public"."pode_gerir_cotacoes"());



CREATE POLICY "cotacao_proposta_itens_rw" ON "public"."sup_cotacao_proposta_itens" TO "authenticated" USING ("public"."pode_gerir_cotacoes"()) WITH CHECK ("public"."pode_gerir_cotacoes"());



CREATE POLICY "cotacao_propostas_rw" ON "public"."sup_cotacao_propostas" TO "authenticated" USING ("public"."pode_gerir_cotacoes"()) WITH CHECK ("public"."pode_gerir_cotacoes"());



CREATE POLICY "dataset_versions_read" ON "public"."ops_dataset_versoes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ddp_all_policy" ON "public"."sup_ddp" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "ddp_read_policy" ON "public"."sup_ddp" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "estoque_read" ON "public"."sap_zl0024_stk" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "estoque_write" ON "public"."sap_zl0024_stk" TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text")));



ALTER TABLE "public"."expedicao_carregamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expedicao_carregamentos_rw" ON "public"."expedicao_carregamentos" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."expedicao_fotos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expedicao_fotos_rw" ON "public"."expedicao_fotos" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."expedicao_tramos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expedicao_tramos_rw" ON "public"."expedicao_tramos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "fbl1n_c_pagar_all" ON "public"."sap_fbl1n_pagar" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "feedback_reports_insert" ON "public"."ops_feedback" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "feedback_reports_select_admin" ON "public"."ops_feedback" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."core_perfis" "p"
  WHERE (("p"."id" = ("auth"."uid"())::"text") AND ('admin'::"text" = ANY ("p"."roles"))))));



CREATE POLICY "feedback_reports_update_admin" ON "public"."ops_feedback" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."core_perfis" "p"
  WHERE (("p"."id" = ("auth"."uid"())::"text") AND ('admin'::"text" = ANY ("p"."roles")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."core_perfis" "p"
  WHERE (("p"."id" = ("auth"."uid"())::"text") AND ('admin'::"text" = ANY ("p"."roles"))))));



CREATE POLICY "import_logs_all" ON "public"."ops_importacoes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "impostos_all_policy" ON "public"."sup_impostos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "impostos_read_policy" ON "public"."sup_impostos" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."ipca_indice" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ipca_indice_read" ON "public"."ipca_indice" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "materials_read" ON "public"."sap_zl0169_162_catalogo" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "materials_write" ON "public"."sap_zl0169_162_catalogo" TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text")));



CREATE POLICY "mb51_mov_estoque_delete" ON "public"."sap_mb51_mov" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "mb51_mov_estoque_insert" ON "public"."sap_mb51_mov" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "mb51_mov_estoque_read" ON "public"."sap_mb51_mov" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "mb51_mov_estoque_update" ON "public"."sap_mb51_mov" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "me3m_contratos_read" ON "public"."sap_me3n_contrato" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "me3m_contratos_write" ON "public"."sap_me3n_contrato" TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text")));



CREATE POLICY "notifications_insert" ON "public"."core_notificacoes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "notifications_read" ON "public"."core_notificacoes" FOR SELECT TO "authenticated" USING (("user_id" = (( SELECT "auth"."uid"() AS "uid"))::"text"));



CREATE POLICY "notifications_update" ON "public"."core_notificacoes" FOR UPDATE TO "authenticated" USING (("user_id" = (( SELECT "auth"."uid"() AS "uid"))::"text"));



CREATE POLICY "obs_historico_all" ON "public"."sap_requisicoes_observacoes" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ops_api_uso" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ops_conversoes_markdown" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ops_dataset_versoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ops_eventos_uso" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ops_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ops_importacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedidos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pedidos_read" ON "public"."pedidos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pedidos_write" ON "public"."pedidos" TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text")));



CREATE POLICY "pedidosforn_read" ON "public"."sap_zl0132_po" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pedidosforn_write" ON "public"."sap_zl0132_po" TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text")));



ALTER TABLE "public"."port_briefing_participantes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "port_briefing_participantes_rw" ON "public"."port_briefing_participantes" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."port_briefing_sessoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "port_briefing_sessoes_rw" ON "public"."port_briefing_sessoes" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."port_controle_carretas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "port_controle_carretas_rw" ON "public"."port_controle_carretas" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."port_controle_equipamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "port_controle_equipamentos_rw" ON "public"."port_controle_equipamentos" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."port_registro_transportes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "port_registro_transportes_rw" ON "public"."port_registro_transportes" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."port_relatorio_ocorrencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "port_relatorio_ocorrencias_rw" ON "public"."port_relatorio_ocorrencias" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."port_relatorio_portaria" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "port_relatorio_portaria_rw" ON "public"."port_relatorio_portaria" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."port_vigilantes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "port_vigilantes_rw" ON "public"."port_vigilantes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "profiles_insert" ON "public"."core_perfis" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "id"));



CREATE POLICY "profiles_read" ON "public"."core_perfis" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_update_self" ON "public"."core_perfis" FOR UPDATE TO "authenticated" USING ((((( SELECT "auth"."uid"() AS "uid"))::"text" = "id") OR "public"."has_role"('admin'::"text"))) WITH CHECK ((((( SELECT "auth"."uid"() AS "uid"))::"text" = "id") OR "public"."has_role"('admin'::"text")));



CREATE POLICY "rastreio_mensagens_insert" ON "public"."sup_rastreio_mensagens" FOR INSERT TO "authenticated" WITH CHECK (("autor_id" = (( SELECT "auth"."uid"() AS "uid"))::"text"));



CREATE POLICY "rastreio_mensagens_read" ON "public"."sup_rastreio_mensagens" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rastreio_prioridades_insert" ON "public"."sup_rastreio_prioridades" FOR INSERT TO "authenticated" WITH CHECK (("solicitante_id" = (( SELECT "auth"."uid"() AS "uid"))::"text"));



CREATE POLICY "rastreio_prioridades_read" ON "public"."sup_rastreio_prioridades" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "request_attachments_all" ON "public"."core_solicitacoes_anexos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "request_comments_all" ON "public"."core_solicitacoes_comentarios" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "request_items_all" ON "public"."core_solicitacoes_itens" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "request_status_history_all" ON "public"."core_solicitacoes_historico_status" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "requests_insert" ON "public"."core_solicitacoes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "requests_read" ON "public"."core_solicitacoes" FOR SELECT TO "authenticated" USING ((("solicitante_id" = (( SELECT "auth"."uid"() AS "uid"))::"text") OR ("atendente_id" = (( SELECT "auth"."uid"() AS "uid"))::"text") OR ("comprador_id" = (( SELECT "auth"."uid"() AS "uid"))::"text") OR "public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text") OR "public"."has_role"('atendente'::"text") OR "public"."has_role"('gestor'::"text") OR "public"."has_role"('visualizador'::"text") OR "public"."has_role"('requisitante'::"text")));



CREATE POLICY "requests_update" ON "public"."core_solicitacoes" FOR UPDATE TO "authenticated" USING ((("solicitante_id" = (( SELECT "auth"."uid"() AS "uid"))::"text") OR "public"."has_role"('admin'::"text") OR "public"."has_role"('gestor'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text") OR "public"."has_role"('atendente'::"text")));



CREATE POLICY "requisicoes_read" ON "public"."sap_me5a_rc" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "requisicoes_write" ON "public"."sap_me5a_rc" TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('coordenador_suprimentos'::"text") OR "public"."has_role"('comprador'::"text")));



ALTER TABLE "public"."rh_ase_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rh_ase_itens_rw" ON "public"."rh_ase_itens" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rh_ase_solicitacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rh_ase_solicitacoes_rw" ON "public"."rh_ase_solicitacoes" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."rh_hora_extra" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rh_hora_extra_select" ON "public"."rh_hora_extra" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rh_hora_extra_write" ON "public"."rh_hora_extra" TO "authenticated" USING ("public"."has_role"('admin'::"text")) WITH CHECK ("public"."has_role"('admin'::"text"));



ALTER TABLE "public"."rh_pessoas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rh_pessoas_select" ON "public"."rh_pessoas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rh_pessoas_write" ON "public"."rh_pessoas" TO "authenticated" USING ("public"."has_role"('admin'::"text")) WITH CHECK ("public"."has_role"('admin'::"text"));



ALTER TABLE "public"."rh_setores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rh_setores_select" ON "public"."rh_setores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rh_setores_write" ON "public"."rh_setores" TO "authenticated" USING ("public"."has_role"('admin'::"text")) WITH CHECK ("public"."has_role"('admin'::"text"));



ALTER TABLE "public"."rh_turnos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rh_turnos_select" ON "public"."rh_turnos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rh_turnos_write" ON "public"."rh_turnos" TO "authenticated" USING ("public"."has_role"('admin'::"text")) WITH CHECK ("public"."has_role"('admin'::"text"));



ALTER TABLE "public"."sap_fbl1n_pagar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sap_mb51_mov" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sap_me3n_contrato" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sap_me5a_rc" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sap_requisicoes_observacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sap_zl0024_stk" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sap_zl0132_po" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sap_zl0169_162_catalogo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sap_zl0170_miro" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sectors_read" ON "public"."core_setores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "sectors_write" ON "public"."core_setores" TO "authenticated" USING ("public"."has_role"('admin'::"text")) WITH CHECK ("public"."has_role"('admin'::"text"));



ALTER TABLE "public"."sequences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sequences_all" ON "public"."sequences" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."sup_compradores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_cotacao_descricao_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_cotacao_extracoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_cotacao_historico" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_cotacao_processo_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_cotacao_processos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_cotacao_proposta_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_cotacao_propostas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_ddp" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_fornecedores_cidades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_fornecedores_cnpj" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_fornecedores_contatos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_fretes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_impostos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_rastreio_mensagens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sup_rastreio_prioridades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipo_mov_estoque" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tipo_mov_estoque_read" ON "public"."tipo_mov_estoque" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "usage_events_insert_own" ON "public"."ops_eventos_uso" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "usage_events_select_admin" ON "public"."ops_eventos_uso" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."core_perfis"
  WHERE (("core_perfis"."id" = ("auth"."uid"())::"text") AND ('admin'::"text" = ANY ("core_perfis"."roles"))))));



CREATE POLICY "zl0170_miro_all" ON "public"."sap_zl0170_miro" TO "authenticated" USING (true) WITH CHECK (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."_usage_require_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_usage_require_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_usage_require_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."apagar_catalogo_materiais"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apagar_catalogo_materiais"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apagar_catalogo_materiais"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."atualizar_texto_tecnico_materiais"("p_itens" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."atualizar_texto_tecnico_materiais"("p_itens" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_texto_tecnico_materiais"("p_itens" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."atualizar_textos_tecnicos_zl0162"("p_itens" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."atualizar_textos_tecnicos_zl0162"("p_itens" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_textos_tecnicos_zl0162"("p_itens" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_dataset_version"("p_dataset" "text", "p_rows" bigint, "p_user" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_dataset_version"("p_dataset" "text", "p_rows" bigint, "p_user" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_dataset_version"("p_dataset" "text", "p_rows" bigint, "p_user" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."buscar_materiais"("termo" "text", "area_usuario" "text", "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_materiais"("termo" "text", "area_usuario" "text", "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_materiais"("termo" "text", "area_usuario" "text", "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."buscar_materiais_catalogo"("termos" "text"[], "categoria" "text", "empresa" "text", "apenas_codigos" "text"[], "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean, "unidade" "text", "tmat" "text", "ncm" "text", "status_filtro" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_materiais_catalogo"("termos" "text"[], "categoria" "text", "empresa" "text", "apenas_codigos" "text"[], "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean, "unidade" "text", "tmat" "text", "ncm" "text", "status_filtro" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_materiais_catalogo"("termos" "text"[], "categoria" "text", "empresa" "text", "apenas_codigos" "text"[], "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean, "unidade" "text", "tmat" "text", "ncm" "text", "status_filtro" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."escapar_like"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."escapar_like"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."escapar_like"("t" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."f_unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ipca_fator"("p_data" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."ipca_fator"("p_data" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ipca_fator"("p_data" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."ipca_mes_referencia"() TO "anon";
GRANT ALL ON FUNCTION "public"."ipca_mes_referencia"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ipca_mes_referencia"() TO "service_role";



GRANT ALL ON FUNCTION "public"."listar_categorias_materiais"() TO "anon";
GRANT ALL ON FUNCTION "public"."listar_categorias_materiais"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."listar_categorias_materiais"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."obter_maiores_codigos_catalogo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."obter_maiores_codigos_catalogo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obter_maiores_codigos_catalogo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pode_gerir_cotacoes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pode_gerir_cotacoes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pode_gerir_cotacoes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."proximo_numero_solicitacao"("p_criticidade" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."proximo_numero_solicitacao"("p_criticidade" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."proximo_numero_solicitacao"("p_criticidade" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_benchmark_material"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_benchmark_material"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_benchmark_material"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_historico_pedidos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_historico_pedidos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_historico_pedidos"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_material_sinais"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_material_sinais"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_material_sinais"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."salvar_processo_cotacao"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."salvar_processo_cotacao"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."salvar_processo_cotacao"("p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sugerir_vinculos_cotacao"("p_processo_id" "uuid", "p_fornecedor_cnpj" "text", "p_descricoes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sugerir_vinculos_cotacao"("p_processo_id" "uuid", "p_fornecedor_cnpj" "text", "p_descricoes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sugerir_vinculos_cotacao"("p_processo_id" "uuid", "p_fornecedor_cnpj" "text", "p_descricoes" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_cnpj_forn_from_pedidosforn"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_cnpj_forn_from_pedidosforn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_cnpj_forn_from_pedidosforn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_lote_materiais"("rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_lote_materiais"("rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_lote_materiais"("rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_active_user_list"("p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_active_user_list"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."usage_active_user_list"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_active_users"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_granularity" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_active_users"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."usage_active_users"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_granularity" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_by_hour"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_by_hour"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."usage_by_hour"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_kpis"("p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_kpis"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."usage_kpis"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_page_ranking"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_page_ranking"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."usage_page_ranking"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_page_users"("p_path" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_page_users"("p_path" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."usage_page_users"("p_path" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_user_summary"("p_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_user_summary"("p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."usage_user_summary"("p_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_user_timeline"("p_user_id" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_user_timeline"("p_user_id" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."usage_user_timeline"("p_user_id" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."core_logs_atividade" TO "anon";
GRANT ALL ON TABLE "public"."core_logs_atividade" TO "authenticated";
GRANT ALL ON TABLE "public"."core_logs_atividade" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."almoxarifado_chegadas" TO "anon";
GRANT ALL ON TABLE "public"."almoxarifado_chegadas" TO "authenticated";
GRANT ALL ON TABLE "public"."almoxarifado_chegadas" TO "service_role";



GRANT ALL ON TABLE "public"."ops_api_uso" TO "anon";
GRANT ALL ON TABLE "public"."ops_api_uso" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_api_uso" TO "service_role";



GRANT ALL ON TABLE "public"."api_uso_logs" TO "anon";
GRANT ALL ON TABLE "public"."api_uso_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."api_uso_logs" TO "service_role";



GRANT ALL ON TABLE "public"."core_grupos_compradores" TO "anon";
GRANT ALL ON TABLE "public"."core_grupos_compradores" TO "authenticated";
GRANT ALL ON TABLE "public"."core_grupos_compradores" TO "service_role";



GRANT ALL ON TABLE "public"."buyer_groups" TO "anon";
GRANT ALL ON TABLE "public"."buyer_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."buyer_groups" TO "service_role";



GRANT ALL ON TABLE "public"."cadastro_grupo_mercadoria" TO "anon";
GRANT ALL ON TABLE "public"."cadastro_grupo_mercadoria" TO "authenticated";
GRANT ALL ON TABLE "public"."cadastro_grupo_mercadoria" TO "service_role";



GRANT ALL ON TABLE "public"."cadastro_tipodoc" TO "anon";
GRANT ALL ON TABLE "public"."cadastro_tipodoc" TO "authenticated";
GRANT ALL ON TABLE "public"."cadastro_tipodoc" TO "service_role";



GRANT ALL ON TABLE "public"."sup_fornecedores_cidades" TO "anon";
GRANT ALL ON TABLE "public"."sup_fornecedores_cidades" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_fornecedores_cidades" TO "service_role";



GRANT ALL ON TABLE "public"."cidadeforn" TO "anon";
GRANT ALL ON TABLE "public"."cidadeforn" TO "authenticated";
GRANT ALL ON TABLE "public"."cidadeforn" TO "service_role";



GRANT ALL ON TABLE "public"."sup_fornecedores_cnpj" TO "anon";
GRANT ALL ON TABLE "public"."sup_fornecedores_cnpj" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_fornecedores_cnpj" TO "service_role";



GRANT ALL ON TABLE "public"."cnpj_forn" TO "anon";
GRANT ALL ON TABLE "public"."cnpj_forn" TO "authenticated";
GRANT ALL ON TABLE "public"."cnpj_forn" TO "service_role";



GRANT ALL ON TABLE "public"."sup_compradores" TO "anon";
GRANT ALL ON TABLE "public"."sup_compradores" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_compradores" TO "service_role";



GRANT ALL ON TABLE "public"."compradores" TO "anon";
GRANT ALL ON TABLE "public"."compradores" TO "authenticated";
GRANT ALL ON TABLE "public"."compradores" TO "service_role";



GRANT ALL ON TABLE "public"."sup_fornecedores_contatos" TO "anon";
GRANT ALL ON TABLE "public"."sup_fornecedores_contatos" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_fornecedores_contatos" TO "service_role";



GRANT ALL ON TABLE "public"."contatos" TO "anon";
GRANT ALL ON TABLE "public"."contatos" TO "authenticated";
GRANT ALL ON TABLE "public"."contatos" TO "service_role";



GRANT ALL ON TABLE "public"."contrato_anexos" TO "anon";
GRANT ALL ON TABLE "public"."contrato_anexos" TO "authenticated";
GRANT ALL ON TABLE "public"."contrato_anexos" TO "service_role";



GRANT ALL ON TABLE "public"."contratos_detalhes" TO "anon";
GRANT ALL ON TABLE "public"."contratos_detalhes" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos_detalhes" TO "service_role";



GRANT ALL ON TABLE "public"."ops_conversoes_markdown" TO "anon";
GRANT ALL ON TABLE "public"."ops_conversoes_markdown" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_conversoes_markdown" TO "service_role";



GRANT ALL ON TABLE "public"."conversoes_markdown" TO "anon";
GRANT ALL ON TABLE "public"."conversoes_markdown" TO "authenticated";
GRANT ALL ON TABLE "public"."conversoes_markdown" TO "service_role";



GRANT ALL ON TABLE "public"."core_notificacoes" TO "anon";
GRANT ALL ON TABLE "public"."core_notificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."core_notificacoes" TO "service_role";



GRANT ALL ON TABLE "public"."core_perfis" TO "anon";
GRANT ALL ON TABLE "public"."core_perfis" TO "authenticated";
GRANT ALL ON TABLE "public"."core_perfis" TO "service_role";



GRANT ALL ON TABLE "public"."core_setores" TO "anon";
GRANT ALL ON TABLE "public"."core_setores" TO "authenticated";
GRANT ALL ON TABLE "public"."core_setores" TO "service_role";



GRANT ALL ON TABLE "public"."core_solicitacoes" TO "anon";
GRANT ALL ON TABLE "public"."core_solicitacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."core_solicitacoes" TO "service_role";



GRANT ALL ON TABLE "public"."core_solicitacoes_anexos" TO "anon";
GRANT ALL ON TABLE "public"."core_solicitacoes_anexos" TO "authenticated";
GRANT ALL ON TABLE "public"."core_solicitacoes_anexos" TO "service_role";



GRANT ALL ON TABLE "public"."core_solicitacoes_comentarios" TO "anon";
GRANT ALL ON TABLE "public"."core_solicitacoes_comentarios" TO "authenticated";
GRANT ALL ON TABLE "public"."core_solicitacoes_comentarios" TO "service_role";



GRANT ALL ON TABLE "public"."core_solicitacoes_historico_status" TO "anon";
GRANT ALL ON TABLE "public"."core_solicitacoes_historico_status" TO "authenticated";
GRANT ALL ON TABLE "public"."core_solicitacoes_historico_status" TO "service_role";



GRANT ALL ON TABLE "public"."core_solicitacoes_itens" TO "anon";
GRANT ALL ON TABLE "public"."core_solicitacoes_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."core_solicitacoes_itens" TO "service_role";



GRANT ALL ON TABLE "public"."sup_cotacao_descricao_map" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_cotacao_descricao_map" TO "service_role";



GRANT ALL ON TABLE "public"."cotacao_descricao_map" TO "anon";
GRANT ALL ON TABLE "public"."cotacao_descricao_map" TO "authenticated";
GRANT ALL ON TABLE "public"."cotacao_descricao_map" TO "service_role";



GRANT ALL ON TABLE "public"."sup_cotacao_extracoes" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_cotacao_extracoes" TO "service_role";



GRANT ALL ON TABLE "public"."cotacao_extracoes" TO "anon";
GRANT ALL ON TABLE "public"."cotacao_extracoes" TO "authenticated";
GRANT ALL ON TABLE "public"."cotacao_extracoes" TO "service_role";



GRANT ALL ON TABLE "public"."sup_cotacao_historico" TO "anon";
GRANT ALL ON TABLE "public"."sup_cotacao_historico" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_cotacao_historico" TO "service_role";



GRANT ALL ON TABLE "public"."cotacao_historico" TO "anon";
GRANT ALL ON TABLE "public"."cotacao_historico" TO "authenticated";
GRANT ALL ON TABLE "public"."cotacao_historico" TO "service_role";



GRANT ALL ON TABLE "public"."sup_cotacao_processo_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_cotacao_processo_itens" TO "service_role";



GRANT ALL ON TABLE "public"."cotacao_processo_itens" TO "anon";
GRANT ALL ON TABLE "public"."cotacao_processo_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."cotacao_processo_itens" TO "service_role";



GRANT ALL ON TABLE "public"."sup_cotacao_processos" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_cotacao_processos" TO "service_role";



GRANT ALL ON TABLE "public"."cotacao_processos" TO "anon";
GRANT ALL ON TABLE "public"."cotacao_processos" TO "authenticated";
GRANT ALL ON TABLE "public"."cotacao_processos" TO "service_role";



GRANT ALL ON TABLE "public"."sup_cotacao_proposta_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_cotacao_proposta_itens" TO "service_role";



GRANT ALL ON TABLE "public"."cotacao_proposta_itens" TO "anon";
GRANT ALL ON TABLE "public"."cotacao_proposta_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."cotacao_proposta_itens" TO "service_role";



GRANT ALL ON TABLE "public"."sup_cotacao_propostas" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_cotacao_propostas" TO "service_role";



GRANT ALL ON TABLE "public"."cotacao_propostas" TO "anon";
GRANT ALL ON TABLE "public"."cotacao_propostas" TO "authenticated";
GRANT ALL ON TABLE "public"."cotacao_propostas" TO "service_role";



GRANT ALL ON TABLE "public"."ops_dataset_versoes" TO "anon";
GRANT ALL ON TABLE "public"."ops_dataset_versoes" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_dataset_versoes" TO "service_role";



GRANT ALL ON TABLE "public"."dataset_versions" TO "anon";
GRANT ALL ON TABLE "public"."dataset_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."dataset_versions" TO "service_role";



GRANT ALL ON TABLE "public"."sup_ddp" TO "anon";
GRANT ALL ON TABLE "public"."sup_ddp" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_ddp" TO "service_role";



GRANT ALL ON TABLE "public"."ddp" TO "anon";
GRANT ALL ON TABLE "public"."ddp" TO "authenticated";
GRANT ALL ON TABLE "public"."ddp" TO "service_role";



GRANT ALL ON TABLE "public"."sap_zl0024_stk" TO "anon";
GRANT ALL ON TABLE "public"."sap_zl0024_stk" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_zl0024_stk" TO "service_role";



GRANT ALL ON TABLE "public"."estoque" TO "anon";
GRANT ALL ON TABLE "public"."estoque" TO "authenticated";
GRANT ALL ON TABLE "public"."estoque" TO "service_role";



GRANT ALL ON SEQUENCE "public"."estoque_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."estoque_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."estoque_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."expedicao_carregamentos" TO "anon";
GRANT ALL ON TABLE "public"."expedicao_carregamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."expedicao_carregamentos" TO "service_role";



GRANT ALL ON TABLE "public"."expedicao_fotos" TO "anon";
GRANT ALL ON TABLE "public"."expedicao_fotos" TO "authenticated";
GRANT ALL ON TABLE "public"."expedicao_fotos" TO "service_role";



GRANT ALL ON TABLE "public"."expedicao_tramos" TO "anon";
GRANT ALL ON TABLE "public"."expedicao_tramos" TO "authenticated";
GRANT ALL ON TABLE "public"."expedicao_tramos" TO "service_role";



GRANT ALL ON TABLE "public"."sap_fbl1n_pagar" TO "anon";
GRANT ALL ON TABLE "public"."sap_fbl1n_pagar" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_fbl1n_pagar" TO "service_role";



GRANT ALL ON TABLE "public"."fbl1n_c_pagar" TO "anon";
GRANT ALL ON TABLE "public"."fbl1n_c_pagar" TO "authenticated";
GRANT ALL ON TABLE "public"."fbl1n_c_pagar" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fbl1n_c_pagar_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fbl1n_c_pagar_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fbl1n_c_pagar_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ops_feedback" TO "anon";
GRANT ALL ON TABLE "public"."ops_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_reports" TO "anon";
GRANT ALL ON TABLE "public"."feedback_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_reports" TO "service_role";



GRANT ALL ON TABLE "public"."ops_importacoes" TO "anon";
GRANT ALL ON TABLE "public"."ops_importacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_importacoes" TO "service_role";



GRANT ALL ON TABLE "public"."import_logs" TO "anon";
GRANT ALL ON TABLE "public"."import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."sup_impostos" TO "anon";
GRANT ALL ON TABLE "public"."sup_impostos" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_impostos" TO "service_role";



GRANT ALL ON TABLE "public"."impostos" TO "anon";
GRANT ALL ON TABLE "public"."impostos" TO "authenticated";
GRANT ALL ON TABLE "public"."impostos" TO "service_role";



GRANT ALL ON TABLE "public"."ipca_indice" TO "anon";
GRANT ALL ON TABLE "public"."ipca_indice" TO "authenticated";
GRANT ALL ON TABLE "public"."ipca_indice" TO "service_role";



GRANT ALL ON TABLE "public"."sap_zl0169_162_catalogo" TO "anon";
GRANT ALL ON TABLE "public"."sap_zl0169_162_catalogo" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_zl0169_162_catalogo" TO "service_role";



GRANT ALL ON TABLE "public"."materials" TO "anon";
GRANT ALL ON TABLE "public"."materials" TO "authenticated";
GRANT ALL ON TABLE "public"."materials" TO "service_role";



GRANT ALL ON TABLE "public"."sap_mb51_mov" TO "anon";
GRANT ALL ON TABLE "public"."sap_mb51_mov" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_mb51_mov" TO "service_role";



GRANT ALL ON TABLE "public"."mb51_mov_estoque" TO "anon";
GRANT ALL ON TABLE "public"."mb51_mov_estoque" TO "authenticated";
GRANT ALL ON TABLE "public"."mb51_mov_estoque" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mb51_mov_estoque_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mb51_mov_estoque_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mb51_mov_estoque_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sap_me3n_contrato" TO "anon";
GRANT ALL ON TABLE "public"."sap_me3n_contrato" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_me3n_contrato" TO "service_role";



GRANT ALL ON SEQUENCE "public"."me3m_contratos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."me3m_contratos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."me3m_contratos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."me3n_contratos" TO "anon";
GRANT ALL ON TABLE "public"."me3n_contratos" TO "authenticated";
GRANT ALL ON TABLE "public"."me3n_contratos" TO "service_role";



GRANT ALL ON TABLE "public"."sap_zl0132_po" TO "anon";
GRANT ALL ON TABLE "public"."sap_zl0132_po" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_zl0132_po" TO "service_role";



GRANT ALL ON TABLE "public"."mv_benchmark_material" TO "anon";
GRANT ALL ON TABLE "public"."mv_benchmark_material" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_benchmark_material" TO "service_role";



GRANT ALL ON TABLE "public"."mv_historico_pedidos" TO "anon";
GRANT ALL ON TABLE "public"."mv_historico_pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_historico_pedidos" TO "service_role";



GRANT ALL ON TABLE "public"."vw_sap_pedidos_enriquecidos" TO "anon";
GRANT ALL ON TABLE "public"."vw_sap_pedidos_enriquecidos" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_sap_pedidos_enriquecidos" TO "service_role";



GRANT ALL ON TABLE "public"."mv_pedido_atual_por_ri" TO "anon";
GRANT ALL ON TABLE "public"."mv_pedido_atual_por_ri" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_pedido_atual_por_ri" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos" TO "anon";
GRANT ALL ON TABLE "public"."pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos" TO "service_role";



GRANT ALL ON TABLE "public"."sap_me5a_rc" TO "anon";
GRANT ALL ON TABLE "public"."sap_me5a_rc" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_me5a_rc" TO "service_role";



GRANT ALL ON TABLE "public"."vw_sap_requisicoes_enriquecidas" TO "anon";
GRANT ALL ON TABLE "public"."vw_sap_requisicoes_enriquecidas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_sap_requisicoes_enriquecidas" TO "service_role";



GRANT ALL ON TABLE "public"."vw_demandas" TO "anon";
GRANT ALL ON TABLE "public"."vw_demandas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_demandas" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."mv_material_sinais" TO "anon";
GRANT ALL ON TABLE "public"."mv_material_sinais" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_material_sinais" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."sap_requisicoes_observacoes" TO "anon";
GRANT ALL ON TABLE "public"."sap_requisicoes_observacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_requisicoes_observacoes" TO "service_role";



GRANT ALL ON TABLE "public"."obs_historico" TO "anon";
GRANT ALL ON TABLE "public"."obs_historico" TO "authenticated";
GRANT ALL ON TABLE "public"."obs_historico" TO "service_role";



GRANT ALL ON TABLE "public"."ops_eventos_uso" TO "anon";
GRANT ALL ON TABLE "public"."ops_eventos_uso" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_eventos_uso" TO "service_role";



GRANT ALL ON TABLE "public"."pedidosforn" TO "anon";
GRANT ALL ON TABLE "public"."pedidosforn" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidosforn" TO "service_role";



GRANT ALL ON TABLE "public"."port_briefing_participantes" TO "anon";
GRANT ALL ON TABLE "public"."port_briefing_participantes" TO "authenticated";
GRANT ALL ON TABLE "public"."port_briefing_participantes" TO "service_role";



GRANT ALL ON TABLE "public"."port_briefing_sessoes" TO "anon";
GRANT ALL ON TABLE "public"."port_briefing_sessoes" TO "authenticated";
GRANT ALL ON TABLE "public"."port_briefing_sessoes" TO "service_role";



GRANT ALL ON TABLE "public"."port_controle_carretas" TO "anon";
GRANT ALL ON TABLE "public"."port_controle_carretas" TO "authenticated";
GRANT ALL ON TABLE "public"."port_controle_carretas" TO "service_role";



GRANT ALL ON TABLE "public"."port_controle_equipamentos" TO "anon";
GRANT ALL ON TABLE "public"."port_controle_equipamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."port_controle_equipamentos" TO "service_role";



GRANT ALL ON TABLE "public"."port_registro_transportes" TO "anon";
GRANT ALL ON TABLE "public"."port_registro_transportes" TO "authenticated";
GRANT ALL ON TABLE "public"."port_registro_transportes" TO "service_role";



GRANT ALL ON TABLE "public"."port_relatorio_ocorrencias" TO "anon";
GRANT ALL ON TABLE "public"."port_relatorio_ocorrencias" TO "authenticated";
GRANT ALL ON TABLE "public"."port_relatorio_ocorrencias" TO "service_role";



GRANT ALL ON TABLE "public"."port_relatorio_portaria" TO "anon";
GRANT ALL ON TABLE "public"."port_relatorio_portaria" TO "authenticated";
GRANT ALL ON TABLE "public"."port_relatorio_portaria" TO "service_role";



GRANT ALL ON TABLE "public"."port_vigilantes" TO "anon";
GRANT ALL ON TABLE "public"."port_vigilantes" TO "authenticated";
GRANT ALL ON TABLE "public"."port_vigilantes" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."sup_rastreio_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."sup_rastreio_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_rastreio_mensagens" TO "service_role";



GRANT ALL ON TABLE "public"."rastreio_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."rastreio_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."rastreio_mensagens" TO "service_role";



GRANT ALL ON TABLE "public"."sup_rastreio_prioridades" TO "anon";
GRANT ALL ON TABLE "public"."sup_rastreio_prioridades" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_rastreio_prioridades" TO "service_role";



GRANT ALL ON TABLE "public"."rastreio_prioridades" TO "anon";
GRANT ALL ON TABLE "public"."rastreio_prioridades" TO "authenticated";
GRANT ALL ON TABLE "public"."rastreio_prioridades" TO "service_role";



GRANT ALL ON TABLE "public"."request_attachments" TO "anon";
GRANT ALL ON TABLE "public"."request_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."request_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."request_comments" TO "anon";
GRANT ALL ON TABLE "public"."request_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."request_comments" TO "service_role";



GRANT ALL ON TABLE "public"."request_items" TO "anon";
GRANT ALL ON TABLE "public"."request_items" TO "authenticated";
GRANT ALL ON TABLE "public"."request_items" TO "service_role";



GRANT ALL ON TABLE "public"."request_status_history" TO "anon";
GRANT ALL ON TABLE "public"."request_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."request_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."requests" TO "anon";
GRANT ALL ON TABLE "public"."requests" TO "authenticated";
GRANT ALL ON TABLE "public"."requests" TO "service_role";



GRANT ALL ON TABLE "public"."requisicoes" TO "anon";
GRANT ALL ON TABLE "public"."requisicoes" TO "authenticated";
GRANT ALL ON TABLE "public"."requisicoes" TO "service_role";



GRANT ALL ON TABLE "public"."rh_ase_itens" TO "anon";
GRANT ALL ON TABLE "public"."rh_ase_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."rh_ase_itens" TO "service_role";



GRANT ALL ON TABLE "public"."rh_ase_solicitacoes" TO "anon";
GRANT ALL ON TABLE "public"."rh_ase_solicitacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."rh_ase_solicitacoes" TO "service_role";



GRANT ALL ON TABLE "public"."rh_hora_extra" TO "anon";
GRANT ALL ON TABLE "public"."rh_hora_extra" TO "authenticated";
GRANT ALL ON TABLE "public"."rh_hora_extra" TO "service_role";



GRANT ALL ON TABLE "public"."rh_pessoas" TO "anon";
GRANT ALL ON TABLE "public"."rh_pessoas" TO "authenticated";
GRANT ALL ON TABLE "public"."rh_pessoas" TO "service_role";



GRANT ALL ON TABLE "public"."rh_setores" TO "anon";
GRANT ALL ON TABLE "public"."rh_setores" TO "authenticated";
GRANT ALL ON TABLE "public"."rh_setores" TO "service_role";



GRANT ALL ON TABLE "public"."rh_turnos" TO "anon";
GRANT ALL ON TABLE "public"."rh_turnos" TO "authenticated";
GRANT ALL ON TABLE "public"."rh_turnos" TO "service_role";



GRANT ALL ON TABLE "public"."sap_zl0170_miro" TO "anon";
GRANT ALL ON TABLE "public"."sap_zl0170_miro" TO "authenticated";
GRANT ALL ON TABLE "public"."sap_zl0170_miro" TO "service_role";



GRANT ALL ON TABLE "public"."sectors" TO "anon";
GRANT ALL ON TABLE "public"."sectors" TO "authenticated";
GRANT ALL ON TABLE "public"."sectors" TO "service_role";



GRANT ALL ON TABLE "public"."sequences" TO "anon";
GRANT ALL ON TABLE "public"."sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."sequences" TO "service_role";



GRANT ALL ON TABLE "public"."sup_fretes" TO "anon";
GRANT ALL ON TABLE "public"."sup_fretes" TO "authenticated";
GRANT ALL ON TABLE "public"."sup_fretes" TO "service_role";



GRANT ALL ON TABLE "public"."tabela_frete" TO "anon";
GRANT ALL ON TABLE "public"."tabela_frete" TO "authenticated";
GRANT ALL ON TABLE "public"."tabela_frete" TO "service_role";



GRANT ALL ON TABLE "public"."tipo_mov_estoque" TO "anon";
GRANT ALL ON TABLE "public"."tipo_mov_estoque" TO "authenticated";
GRANT ALL ON TABLE "public"."tipo_mov_estoque" TO "service_role";



GRANT ALL ON TABLE "public"."usage_events" TO "anon";
GRANT ALL ON TABLE "public"."usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_events" TO "service_role";



GRANT ALL ON TABLE "public"."view_enriched_pedidos" TO "anon";
GRANT ALL ON TABLE "public"."view_enriched_pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."view_enriched_pedidos" TO "service_role";



GRANT ALL ON TABLE "public"."view_enriched_requisicoes" TO "anon";
GRANT ALL ON TABLE "public"."view_enriched_requisicoes" TO "authenticated";
GRANT ALL ON TABLE "public"."view_enriched_requisicoes" TO "service_role";



GRANT ALL ON TABLE "public"."vw_auditoria_compras" TO "anon";
GRANT ALL ON TABLE "public"."vw_auditoria_compras" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_auditoria_compras" TO "service_role";



GRANT ALL ON TABLE "public"."vw_auditoria_historico_material" TO "anon";
GRANT ALL ON TABLE "public"."vw_auditoria_historico_material" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_auditoria_historico_material" TO "service_role";



GRANT ALL ON TABLE "public"."vw_estoque_analise" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_estoque_analise" TO "service_role";



GRANT ALL ON TABLE "public"."vw_mb51_classificado" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_mb51_classificado" TO "service_role";



GRANT ALL ON TABLE "public"."vw_estoque_camadas_fifo" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_estoque_camadas_fifo" TO "service_role";



GRANT ALL ON TABLE "public"."vw_estoque_giro" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_estoque_giro" TO "service_role";



GRANT ALL ON TABLE "public"."vw_estoque_reposicao" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_estoque_reposicao" TO "service_role";



GRANT ALL ON TABLE "public"."vw_fbl1n_c_pagar_analise" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_fbl1n_c_pagar_analise" TO "service_role";



GRANT ALL ON TABLE "public"."vw_historico_fornecedores_sem_po" TO "anon";
GRANT ALL ON TABLE "public"."vw_historico_fornecedores_sem_po" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_historico_fornecedores_sem_po" TO "service_role";



GRANT ALL ON TABLE "public"."vw_historico_pedidos" TO "anon";
GRANT ALL ON TABLE "public"."vw_historico_pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_historico_pedidos" TO "service_role";



GRANT ALL ON TABLE "public"."vw_sap_materiais_estatisticas" TO "anon";
GRANT ALL ON TABLE "public"."vw_sap_materiais_estatisticas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_sap_materiais_estatisticas" TO "service_role";



GRANT ALL ON TABLE "public"."vw_materials_stats" TO "anon";
GRANT ALL ON TABLE "public"."vw_materials_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_materials_stats" TO "service_role";



GRANT ALL ON TABLE "public"."zl0170_miro" TO "anon";
GRANT ALL ON TABLE "public"."zl0170_miro" TO "authenticated";
GRANT ALL ON TABLE "public"."zl0170_miro" TO "service_role";



GRANT ALL ON SEQUENCE "public"."zl0170_miro_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."zl0170_miro_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."zl0170_miro_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

































-- Adicionado manualmente apos o pull inicial: o dump nao capturou o trigger
-- de auth.users nem as policies de storage.objects na primeira passada.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "expedicao_fotos_objects_delete" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((bucket_id = 'expedicao-fotos'::text));

CREATE POLICY "expedicao_fotos_objects_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'expedicao-fotos'::text));

CREATE POLICY "expedicao_fotos_objects_read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'expedicao-fotos'::text));

CREATE POLICY "feedback_screenshots_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'feedback-screenshots'::text));

CREATE POLICY "feedback_screenshots_select_admin" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'feedback-screenshots'::text) AND (EXISTS ( SELECT 1 FROM public.core_perfis p WHERE ((p.id = (auth.uid())::text) AND ('admin'::text = ANY (p.roles)))))));

CREATE POLICY "request_attachments_objects_delete" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((bucket_id = 'request-attachments'::text));

CREATE POLICY "request_attachments_objects_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'request-attachments'::text));

CREATE POLICY "request_attachments_objects_read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'request-attachments'::text));
