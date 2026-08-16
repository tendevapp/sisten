-- Função RPC para importação de catálogo de materiais (transação SAP ZL0169).
-- Executa upsert em lote ultra-rápido sobre a tabela materials via jsonb com TODAS as colunas do SAP.
-- PRESERVA o texto técnico existente caso a nova planilha não contenha texto técnico.

CREATE OR REPLACE FUNCTION public.importar_materiais_zl0169(
  p_materiais jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_inseridos int := 0;
  v_atualizados int := 0;
BEGIN
  WITH dados AS (
    SELECT 
      COALESCE(NULLIF(trim(item->>'id'), ''), 'm_' || substr(md5(random()::text), 1, 9)) AS id,
      trim(item->>'material_code') AS material_code,
      trim(item->>'description') AS description,
      NULLIF(trim(item->>'technical_text'), '') AS technical_text,
      COALESCE(NULLIF(trim(item->>'category'), ''), 'Outros') AS category,
      COALESCE(NULLIF(trim(item->>'company'), ''), 'TEN2') AS company,
      COALESCE(NULLIF(trim(item->>'unit'), ''), 'UN') AS unit,
      NULLIF(trim(item->>'centro'), '') AS centro,
      NULLIF(trim(item->>'eliminacao'), '') AS eliminacao,
      NULLIF(trim(item->>'elim_nivel_centro'), '') AS elim_nivel_centro,
      NULLIF(trim(item->>'status_geral'), '') AS status_geral,
      NULLIF(trim(item->>'status_centro'), '') AS status_centro,
      NULLIF(trim(item->>'modificado_por'), '') AS modificado_por,
      NULLIF(trim(item->>'tipo_material'), '') AS tipo_material,
      NULLIF(trim(item->>'tipo_material_desc'), '') AS tipo_material_desc,
      NULLIF(trim(item->>'codigo_controle'), '') AS codigo_controle,
      NULLIF(trim(item->>'categoria_item'), '') AS categoria_item,
      NULLIF(trim(item->>'indicador_s'), '') AS indicador_s,
      NULLIF(trim(item->>'grupo_mercadoria_codigo'), '') AS grupo_mercadoria_codigo,
      NULLIF(trim(item->>'grupo_mercadoria_desc'), '') AS grupo_mercadoria_desc,
      NULLIF(trim(item->>'denominacao'), '') AS denominacao,
      NULLIF(trim(item->>'material_basico'), '') AS material_basico,
      NULLIF(trim(item->>'classe_fiscal'), '') AS classe_fiscal,
      NULLIF(trim(item->>'unidade_medida_alt'), '') AS unidade_medida_alt,
      NULLIF(trim(item->>'classe_avaliacao'), '') AS classe_avaliacao,
      NULLIF(trim(item->>'numero_pf'), '') AS numero_pf,
      NULLIF(trim(item->>'idioma'), '') AS idioma,
      NULLIF(trim(item->>'pais'), '') AS pais,
      CASE 
        WHEN NULLIF(trim(item->>'criado_em'), '') IS NOT NULL THEN (trim(item->>'criado_em'))::date 
        ELSE NULL 
      END AS criado_em,
      CASE 
        WHEN NULLIF(trim(item->>'ultima_modificacao'), '') IS NOT NULL THEN (trim(item->>'ultima_modificacao'))::date 
        ELSE NULL 
      END AS ultima_modificacao,
      COALESCE((item->>'is_active')::boolean, true) AS is_active,
      COALESCE((item->>'created_at')::timestamptz, now()) AS created_at,
      now() AS imported_at
    FROM jsonb_array_elements(p_materiais) AS item
    WHERE trim(item->>'material_code') <> '' AND trim(item->>'description') <> ''
  ),
  upserted AS (
    INSERT INTO public.materials (
      id, material_code, description, technical_text, category, company, unit,
      centro, eliminacao, elim_nivel_centro, status_geral, status_centro,
      modificado_por, tipo_material, tipo_material_desc, codigo_controle,
      categoria_item, indicador_s, grupo_mercadoria_codigo, grupo_mercadoria_desc,
      denominacao, material_basico, classe_fiscal, unidade_medida_alt,
      classe_avaliacao, numero_pf, idioma, pais, criado_em, ultima_modificacao,
      is_active, created_at, imported_at
    )
    SELECT 
      id, material_code, description, technical_text, category, company, unit,
      centro, eliminacao, elim_nivel_centro, status_geral, status_centro,
      modificado_por, tipo_material, tipo_material_desc, codigo_controle,
      categoria_item, indicador_s, grupo_mercadoria_codigo, grupo_mercadoria_desc,
      denominacao, material_basico, classe_fiscal, unidade_medida_alt,
      classe_avaliacao, numero_pf, idioma, pais, criado_em, ultima_modificacao,
      is_active, created_at, imported_at
    FROM dados
    ON CONFLICT (material_code) DO UPDATE
    SET 
      description = EXCLUDED.description,
      technical_text = COALESCE(EXCLUDED.technical_text, public.materials.technical_text),
      category = EXCLUDED.category,
      company = EXCLUDED.company,
      unit = EXCLUDED.unit,
      centro = COALESCE(EXCLUDED.centro, public.materials.centro),
      eliminacao = COALESCE(EXCLUDED.eliminacao, public.materials.eliminacao),
      elim_nivel_centro = COALESCE(EXCLUDED.elim_nivel_centro, public.materials.elim_nivel_centro),
      status_geral = COALESCE(EXCLUDED.status_geral, public.materials.status_geral),
      status_centro = COALESCE(EXCLUDED.status_centro, public.materials.status_centro),
      modificado_por = COALESCE(EXCLUDED.modificado_por, public.materials.modificado_por),
      tipo_material = COALESCE(EXCLUDED.tipo_material, public.materials.tipo_material),
      tipo_material_desc = COALESCE(EXCLUDED.tipo_material_desc, public.materials.tipo_material_desc),
      codigo_controle = COALESCE(EXCLUDED.codigo_controle, public.materials.codigo_controle),
      categoria_item = COALESCE(EXCLUDED.categoria_item, public.materials.categoria_item),
      indicador_s = COALESCE(EXCLUDED.indicador_s, public.materials.indicador_s),
      grupo_mercadoria_codigo = COALESCE(EXCLUDED.grupo_mercadoria_codigo, public.materials.grupo_mercadoria_codigo),
      grupo_mercadoria_desc = COALESCE(EXCLUDED.grupo_mercadoria_desc, public.materials.grupo_mercadoria_desc),
      denominacao = COALESCE(EXCLUDED.denominacao, public.materials.denominacao),
      material_basico = COALESCE(EXCLUDED.material_basico, public.materials.material_basico),
      classe_fiscal = COALESCE(EXCLUDED.classe_fiscal, public.materials.classe_fiscal),
      unidade_medida_alt = COALESCE(EXCLUDED.unidade_medida_alt, public.materials.unidade_medida_alt),
      classe_avaliacao = COALESCE(EXCLUDED.classe_avaliacao, public.materials.classe_avaliacao),
      numero_pf = COALESCE(EXCLUDED.numero_pf, public.materials.numero_pf),
      idioma = COALESCE(EXCLUDED.idioma, public.materials.idioma),
      pais = COALESCE(EXCLUDED.pais, public.materials.pais),
      criado_em = COALESCE(EXCLUDED.criado_em, public.materials.criado_em),
      ultima_modificacao = COALESCE(EXCLUDED.ultima_modificacao, public.materials.ultima_modificacao),
      is_active = EXCLUDED.is_active,
      imported_at = EXCLUDED.imported_at
    RETURNING (xmax = 0) AS inserido
  )
  SELECT 
    (SELECT count(*)::int FROM dados),
    (SELECT count(*)::int FROM upserted WHERE inserido = true),
    (SELECT count(*)::int FROM upserted WHERE inserido = false)
  INTO v_total, v_inseridos, v_atualizados;

  RETURN jsonb_build_object(
    'total', v_total,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados
  );
END;
$$;
