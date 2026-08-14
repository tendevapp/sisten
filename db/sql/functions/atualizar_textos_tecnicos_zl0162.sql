-- Função RPC para atualização de textos técnicos dos materiais (transação SAP ZL0162).
-- Atualiza a coluna technical_text na tabela materials em lote vinculando por material_code.

CREATE OR REPLACE FUNCTION public.atualizar_textos_tecnicos_zl0162(
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
