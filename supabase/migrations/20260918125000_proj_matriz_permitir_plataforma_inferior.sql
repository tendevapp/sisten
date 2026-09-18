-- =====================================================================
-- Almoxarifado > Projetos — Matriz de Autonomia: libera o subkit
-- `plataforma_inferior` na tabela de células.
--
-- A constraint original (`20260912220000_create_proj_matriz_autonomia.sql`)
-- só aceitava 'fixadores', 'plataforma', 'escada_avanti', 'escada_acesso' —
-- mas o TS (`SUBKITS_POR_TRAMO.T1`, ver `projetosKitsAutonomia.ts`) sempre
-- tratou `plataforma_inferior` como um sub-kit próprio de T1. Sem isso, uma
-- gravação manual em T1/plataforma_inferior falha com violação de check.
-- =====================================================================

alter table public.proj_matriz_autonomia_kits
  drop constraint if exists proj_matriz_autonomia_kits_subkit_check;

alter table public.proj_matriz_autonomia_kits
  add constraint proj_matriz_autonomia_kits_subkit_check
  check (subkit in ('fixadores', 'plataforma', 'plataforma_inferior', 'escada_avanti', 'escada_acesso'));
