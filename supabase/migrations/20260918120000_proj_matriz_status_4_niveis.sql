-- =====================================================================
-- Almoxarifado > Projetos — Matriz de Autonomia: volta a 4 níveis de status
--
-- A legenda operacional (planilha de fábrica) usa só 4 status agora:
--   0 Não atende (vermelho) · 1 Estoque (verde) · 3 Montagem final (azul,
--   antigo "OK Pátio") · 4 Expedido (preto, antigo "Saída Portaria" — o
--   antigo 4/laranja "Faturado" foi descontinuado nessa mesma limpeza,
--   ver 20260918110000_proj_matriz_manual_log.sql).
-- Dobra o antigo status 5 para 4 antes de fechar a constraint de novo.
-- =====================================================================

update public.proj_matriz_autonomia_kits set status = 4 where status = 5;

alter table public.proj_matriz_autonomia_kits
  drop constraint if exists proj_matriz_autonomia_kits_status_check;

alter table public.proj_matriz_autonomia_kits
  add constraint proj_matriz_autonomia_kits_status_check
  check (status in (0, 1, 3, 4));
