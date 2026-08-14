-- Função RPC para importação de catálogo de materiais (transação SAP ZL0169).
-- Executa upsert em lote ultra-rápido sobre a tabela materials via jsonb.
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
      COALESCE((item->>'is_active')::boolean, true) AS is_active,
      COALESCE((item->>'created_at')::timestamptz, now()) AS created_at
    FROM jsonb_array_elements(p_materiais) AS item
    WHERE trim(item->>'material_code') <> '' AND trim(item->>'description') <> ''
  ),
  upserted AS (
    INSERT INTO public.materials (
      id, material_code, description, technical_text, category, company, unit, is_active, created_at
    )
    SELECT 
      id, material_code, description, technical_text, category, company, unit, is_active, created_at
    FROM dados
    ON CONFLICT (material_code) DO UPDATE
    SET 
      description = EXCLUDED.description,
      technical_text = COALESCE(EXCLUDED.technical_text, public.materials.technical_text),
      category = EXCLUDED.category,
      company = EXCLUDED.company,
      unit = EXCLUDED.unit,
      is_active = EXCLUDED.is_active
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
