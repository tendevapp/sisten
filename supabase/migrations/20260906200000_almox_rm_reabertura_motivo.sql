-- =====================================================================
-- Almoxarifado > Abrir RM — motivo da reabertura
--
-- A reabertura manual já registrava quem e quando (ver a migration
-- `almox_rm_reabrir_exportacao`). Falta o "o quê": quando quem editou a
-- solicitação depois de exportada é o próprio motivo (edição automática —
-- ver `reabrirSolicitacaoPorRequestId` em `lib/almoxarifadoRmApi.ts`), o
-- texto aqui é o resumo do que mudou nela.
-- =====================================================================

alter table public.almox_rm_exportacao_solicitacoes
  add column if not exists reaberto_motivo text;
