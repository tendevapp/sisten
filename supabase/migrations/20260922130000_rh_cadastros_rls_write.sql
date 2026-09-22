-- Migration: Permissão RLS para cadastros do módulo de RH
-- Data: 2026-09-22
--
-- Permite que usuários com acesso ao módulo de RH (pertencentes ao setor de RH
-- [sector_id = '1'], usuários com papéis de RH, usuários com permissão explícita
-- em page_access, ou administradores) possam criar, atualizar e gerenciar colaboradores
-- (rh_pessoas), setores (rh_setores), turnos (rh_turnos) e percentual de hora extra (rh_hora_extra).

CREATE OR REPLACE FUNCTION public.pode_gerir_rh(p_page_id text DEFAULT NULL)
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
      AND (p.status IS NULL OR p.status = 'ativo')
      AND (
        'admin' = ANY(p.roles)
        OR 'rh' = ANY(p.roles)
        OR 'gestor_rh' = ANY(p.roles)
        OR (
          (p.sector_id = '1' OR s.name ILIKE '%recursos humanos%' OR s.name ILIKE '%rh%')
          AND (
            p_page_id IS NULL
            OR COALESCE((p.page_access->>p_page_id)::boolean, true) = true
          )
        )
        OR COALESCE((p.page_access->>'rh')::boolean, false) = true
        OR (
          p_page_id IS NOT NULL
          AND COALESCE((p.page_access->>p_page_id)::boolean, false) = true
        )
      )
  );
$$;

-- Permissões de execução da função
REVOKE EXECUTE ON FUNCTION public.pode_gerir_rh(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerir_rh(text) TO authenticated, service_role;

-- 1. rh_pessoas (Colaboradores)
ALTER TABLE public.rh_pessoas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rh_pessoas_write" ON public.rh_pessoas;

CREATE POLICY "rh_pessoas_write" ON public.rh_pessoas
FOR ALL TO authenticated
USING (public.pode_gerir_rh('rh_colaboradores'))
WITH CHECK (public.pode_gerir_rh('rh_colaboradores'));

-- 2. rh_setores (Setores do RH)
ALTER TABLE public.rh_setores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rh_setores_write" ON public.rh_setores;

CREATE POLICY "rh_setores_write" ON public.rh_setores
FOR ALL TO authenticated
USING (public.pode_gerir_rh('rh_setores_cad'))
WITH CHECK (public.pode_gerir_rh('rh_setores_cad'));

-- 3. rh_turnos (Turnos de trabalho)
ALTER TABLE public.rh_turnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rh_turnos_write" ON public.rh_turnos;

CREATE POLICY "rh_turnos_write" ON public.rh_turnos
FOR ALL TO authenticated
USING (public.pode_gerir_rh('rh_turnos_cad'))
WITH CHECK (public.pode_gerir_rh('rh_turnos_cad'));

-- 4. rh_hora_extra (Percentual de Hora Extra)
ALTER TABLE public.rh_hora_extra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rh_hora_extra_write" ON public.rh_hora_extra;

CREATE POLICY "rh_hora_extra_write" ON public.rh_hora_extra
FOR ALL TO authenticated
USING (public.pode_gerir_rh('rh_percentual_he'))
WITH CHECK (public.pode_gerir_rh('rh_percentual_he'));

-- Notifica o PostgREST para recarregar o cache de schema
NOTIFY pgrst, 'reload schema';
