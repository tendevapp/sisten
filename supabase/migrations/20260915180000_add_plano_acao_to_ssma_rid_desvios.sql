-- =====================================================================
-- Módulo SSMA — Plano de Ação para Fechamento do RID
-- =====================================================================

alter table public.ssma_rid_desvios
add column if not exists plano_acao jsonb default null;

-- Índices para otimização de consultas por área destino e status do plano
create index if not exists idx_ssma_rid_desvios_plano_acao on public.ssma_rid_desvios using gin (plano_acao);
create index if not exists idx_ssma_rid_desvios_plano_acao_status on public.ssma_rid_desvios ((plano_acao->>'status'));
create index if not exists idx_ssma_rid_desvios_plano_acao_area on public.ssma_rid_desvios ((plano_acao->>'area_destino'));
