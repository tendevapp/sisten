-- RPC para a tela Catálogo (Materials.tsx) com suporte a paginação rápida,
-- busca acumulativa por chips, inclusão opcional de texto técnico,
-- e filtros por Unidade, TMAT (Tipo de Material), NCM (Código de Controle Fiscal)
-- e Status SAP (Ativo / Obsoleto conforme Z1 em status_geral ou status_centro).

DROP FUNCTION IF EXISTS public.buscar_materiais_catalogo(text[], text, text, text[], integer, integer);
DROP FUNCTION IF EXISTS public.buscar_materiais_catalogo(text[], text, text, text[], integer, integer, boolean);
DROP FUNCTION IF EXISTS public.buscar_materiais_catalogo(text[], text, text, text[], integer, integer, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.buscar_materiais_catalogo(text[], text, text, text[], integer, integer, boolean, text, text, text, text);

CREATE OR REPLACE FUNCTION public.buscar_materiais_catalogo(
  termos          text[]   DEFAULT NULL::text[],
  categoria       text     DEFAULT NULL::text,
  empresa         text     DEFAULT NULL::text,
  apenas_codigos  text[]   DEFAULT NULL::text[],
  limite          integer  DEFAULT 50,
  deslocamento    integer  DEFAULT 0,
  incluir_tecnico boolean  DEFAULT false,
  unidade         text     DEFAULT NULL::text,
  tmat            text     DEFAULT NULL::text,
  ncm             text     DEFAULT NULL::text,
  status_filtro   text     DEFAULT NULL::text
)
RETURNS TABLE(
  id text, material_code text, description text, technical_text text,
  category text, company text, unit text, tipo_material text, codigo_controle text,
  status_geral text, status_centro text, status_sap text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
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
$function$;
