-- =====================================================================
-- Almoxarifado > Projetos — Suporte a status 5 (Saída Portaria / Preto)
-- =====================================================================

alter table public.proj_matriz_autonomia_kits
  drop constraint if exists proj_matriz_autonomia_kits_status_check;

alter table public.proj_matriz_autonomia_kits
  add constraint proj_matriz_autonomia_kits_status_check
  check (status in (0, 1, 3, 4, 5));
