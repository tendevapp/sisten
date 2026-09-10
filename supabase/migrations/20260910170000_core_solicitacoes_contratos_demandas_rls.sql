-- Migration: Permissão RLS para gestão de Contratos/Demandas Jurídicas e atendimento de chamados
-- Data: 2026-09-10
--
-- Permite que usuários com acesso ao módulo de Contratos (page_access->>'sup_contratos' = 'true')
-- ou pertencentes ao setor Jurídico / setor de destino do chamado possam visualizar, assumir
-- e mover chamados/demandas no quadro Kanban (Contratos > Demandas).

CREATE OR REPLACE FUNCTION public.pode_gerir_contratos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.core_perfis p
    LEFT JOIN public.core_setores s ON s.id = p.sector_id
    WHERE p.id = (SELECT auth.uid())::text
      AND p.status = 'ativo'
      AND (
        'admin' = ANY(p.roles)
        OR 'gestor' = ANY(p.roles)
        OR 'atendente' = ANY(p.roles)
        OR COALESCE((p.page_access->>'sup_contratos')::boolean, false) = true
        OR COALESCE((p.page_access->>'contratos')::boolean, false) = true
        OR s.name ILIKE '%juridic%'
        OR s.name ILIKE '%contrato%'
        OR p.sector_id = '17'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.requests_pode_editar(
  p_solicitante_id text,
  p_atendente_id text,
  p_comprador_id text,
  p_type text,
  p_target_sector_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (p_solicitante_id IS NOT NULL AND p_solicitante_id = (SELECT auth.uid())::text)
    OR (p_atendente_id IS NOT NULL AND p_atendente_id = (SELECT auth.uid())::text)
    OR (p_comprador_id IS NOT NULL AND p_comprador_id = (SELECT auth.uid())::text)
    OR public.has_role('admin')
    OR public.has_role('gestor')
    OR public.has_role('coordenador_suprimentos')
    OR public.has_role('comprador')
    OR public.has_role('atendente')
    OR (p_type = 'cadastro_sap' AND public.pode_gerir_cadastro_sap())
    OR (p_type = 'chamado' AND (
         public.pode_gerir_contratos()
         OR (p_target_sector_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.core_perfis
              WHERE id = (SELECT auth.uid())::text
                AND status = 'ativo'
                AND sector_id = p_target_sector_id
            ))
       ));
$$;

CREATE OR REPLACE FUNCTION public.requests_pode_editar(
  p_solicitante_id text,
  p_atendente_id text,
  p_comprador_id text,
  p_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.requests_pode_editar(p_solicitante_id, p_atendente_id, p_comprador_id, p_type, NULL);
$$;

DROP POLICY IF EXISTS "requests_update" ON "public"."core_solicitacoes";

CREATE POLICY "requests_update" ON "public"."core_solicitacoes"
FOR UPDATE TO "authenticated"
USING (public.requests_pode_editar(solicitante_id, atendente_id, comprador_id, type, target_sector_id))
WITH CHECK (public.requests_pode_editar(solicitante_id, atendente_id, comprador_id, type, target_sector_id));

DROP POLICY IF EXISTS "requests_read" ON "public"."core_solicitacoes";

CREATE POLICY "requests_read" ON "public"."core_solicitacoes"
FOR SELECT TO "authenticated"
USING (
  (solicitante_id = (SELECT auth.uid())::text)
  OR (atendente_id = (SELECT auth.uid())::text)
  OR (comprador_id = (SELECT auth.uid())::text)
  OR has_role('admin')
  OR has_role('coordenador_suprimentos')
  OR has_role('comprador')
  OR has_role('atendente')
  OR has_role('gestor')
  OR has_role('visualizador')
  OR has_role('requisitante')
  OR pode_gerir_cadastro_sap()
  OR pode_gerir_contratos()
);
