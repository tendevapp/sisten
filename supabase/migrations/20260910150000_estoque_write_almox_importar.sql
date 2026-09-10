-- Migration: estoque_write — liberar escrita para almox_importar_planilhas
--
-- Problema: a política estoque_write só permitia admin / coordenador_suprimentos
-- / comprador. Usuários do almoxarifado com a permissão individual
-- `almox_importar_planilhas` (habilitada pelo admin em Módulos de Acesso)
-- recebiam "violates row-level security policy" ao tentar importar o ZL0024.
--
-- Solução:
--   1. Cria a função auxiliar `has_page_access(text)` que lê o campo JSONB
--      `page_access` em `public.profiles` — o mesmo campo que `canAccessPage`
--      usa no frontend.
--   2. Atualiza a política estoque_write para aceitar também quem tem
--      `almox_importar_planilhas = true` nesse JSONB.

-- 1. Função auxiliar (SECURITY DEFINER, igual a has_role)
CREATE OR REPLACE FUNCTION public.has_page_access(required_page text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()::text
      AND status = 'ativo'
      AND (page_access ->> required_page)::boolean = true
  );
$$;

ALTER FUNCTION public.has_page_access(text) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.has_page_access(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_page_access(text) FROM anon;

-- 2. Substituir a política estoque_write incluindo almox_importar_planilhas
DROP POLICY IF EXISTS "estoque_write" ON public.sap_zl0024_stk;

CREATE POLICY "estoque_write" ON public.sap_zl0024_stk
  TO authenticated
  USING (
    public.has_role('admin'::text)
    OR public.has_role('coordenador_suprimentos'::text)
    OR public.has_role('comprador'::text)
    OR public.has_page_access('almox_importar_planilhas'::text)
  )
  WITH CHECK (
    public.has_role('admin'::text)
    OR public.has_role('coordenador_suprimentos'::text)
    OR public.has_role('comprador'::text)
    OR public.has_page_access('almox_importar_planilhas'::text)
  );
