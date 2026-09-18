-- Migration: filtrar_codigos_inativos_sap_e_status_geral
-- Oculta materiais inativos (códigos iniciados por 9 ou letras) nas RPCs de catálogo e compras
-- e adiciona a coluna status_geral no retorno da função buscar_materiais.

-- 1. Atualizar buscar_materiais_catalogo para expurgar códigos inativos
CREATE OR REPLACE FUNCTION "public"."buscar_materiais_catalogo"(
  "termos" "text"[] DEFAULT NULL::"text"[],
  "categoria" "text" DEFAULT NULL::"text",
  "empresa" "text" DEFAULT NULL::"text",
  "apenas_codigos" "text"[] DEFAULT NULL::"text"[],
  "limite" integer DEFAULT 50,
  "deslocamento" integer DEFAULT 0,
  "incluir_tecnico" boolean DEFAULT false,
  "unidade" "text" DEFAULT NULL::"text",
  "tmat" "text" DEFAULT NULL::"text",
  "ncm" "text" DEFAULT NULL::"text",
  "status_filtro" "text" DEFAULT NULL::"text"
) RETURNS TABLE(
  "id" "text",
  "material_code" "text",
  "description" "text",
  "technical_text" "text",
  "category" "text",
  "company" "text",
  "unit" "text",
  "tipo_material" "text",
  "codigo_controle" "text",
  "status_geral" "text",
  "status_centro" "text",
  "status_sap" "text",
  "total_count" bigint
)
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
      and m.material_code !~ '^[9a-zA-Z]'
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

-- 2. Recriar buscar_materiais para adicionar status_geral e filtrar códigos inativos
DROP FUNCTION IF EXISTS "public"."buscar_materiais"("termo" "text", "area_usuario" "text", "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean);

CREATE OR REPLACE FUNCTION "public"."buscar_materiais"(
  "termo" "text",
  "area_usuario" "text" DEFAULT NULL::"text",
  "limite" integer DEFAULT 20,
  "deslocamento" integer DEFAULT 0,
  "incluir_tecnico" boolean DEFAULT false
) RETURNS TABLE(
  "material_code" "text",
  "description" "text",
  "technical_text" "text",
  "unit" "text",
  "status_geral" "text",
  "qtd_estoque" numeric,
  "depositos" "text"[],
  "rms_12m" integer,
  "ultima_rm" "date",
  "rms_sem_pedido" integer,
  "rm_aberta" "text",
  "qtd_rm_aberta" numeric,
  "pedido_aberto" "text",
  "qtd_pedido_aberto" numeric,
  "chega_em" "date",
  "pedido_pela_area" boolean
)
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

  -- Fallback de similaridade para primeira página
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
    and m.description % norm
  order by similarity(m.description, norm) desc, m.material_code
  limit teto;
end;
$_$;

-- Conceder permissões para as funções
GRANT ALL ON FUNCTION "public"."buscar_materiais"("termo" "text", "area_usuario" "text", "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_materiais"("termo" "text", "area_usuario" "text", "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_materiais"("termo" "text", "area_usuario" "text", "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."buscar_materiais_catalogo"("termos" "text"[], "categoria" "text", "empresa" "text", "apenas_codigos" "text"[], "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean, "unidade" "text", "tmat" "text", "ncm" "text", "status_filtro" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_materiais_catalogo"("termos" "text"[], "categoria" "text", "empresa" "text", "apenas_codigos" "text"[], "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean, "unidade" "text", "tmat" "text", "ncm" "text", "status_filtro" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_materiais_catalogo"("termos" "text"[], "categoria" "text", "empresa" "text", "apenas_codigos" "text"[], "limite" integer, "deslocamento" integer, "incluir_tecnico" boolean, "unidade" "text", "tmat" "text", "ncm" "text", "status_filtro" "text") TO "service_role";
