-- Migration: Permissão RLS para gestão de Cadastro SAP e atendentes em core_solicitacoes
-- Data: 2026-09-09

CREATE OR REPLACE FUNCTION public.pode_gerir_cadastro_sap()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.core_perfis
    WHERE id = (SELECT auth.uid())::text
      AND status = 'ativo'
      AND (
        'admin' = ANY(roles)
        OR 'gestor' = ANY(roles)
        OR 'coordenador_suprimentos' = ANY(roles)
        OR 'comprador' = ANY(roles)
        OR 'atendente' = ANY(roles)
        OR COALESCE(aprovador_cadastro_sap, false) = true
        OR page_access->>'sup_cadastros_sap' = 'true'
        OR page_access->>'cadastros_sap' = 'true'
      )
  );
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
  SELECT
    (p_solicitante_id IS NOT NULL AND p_solicitante_id = (SELECT auth.uid())::text)
    OR (p_atendente_id IS NOT NULL AND p_atendente_id = (SELECT auth.uid())::text)
    OR (p_comprador_id IS NOT NULL AND p_comprador_id = (SELECT auth.uid())::text)
    OR public.has_role('admin')
    OR public.has_role('gestor')
    OR public.has_role('coordenador_suprimentos')
    OR public.has_role('comprador')
    OR public.has_role('atendente')
    OR (p_type = 'cadastro_sap' AND public.pode_gerir_cadastro_sap());
$$;

DROP POLICY IF EXISTS "requests_update" ON "public"."core_solicitacoes";

CREATE POLICY "requests_update" ON "public"."core_solicitacoes"
FOR UPDATE TO "authenticated"
USING (public.requests_pode_editar(solicitante_id, atendente_id, comprador_id, type))
WITH CHECK (public.requests_pode_editar(solicitante_id, atendente_id, comprador_id, type));

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
);
