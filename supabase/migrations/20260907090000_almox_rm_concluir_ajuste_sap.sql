-- =====================================================================
-- Almoxarifado > Abrir RM — concluir o ajuste manual no SAP
--
-- O grupo "Editar no SAP" (`reaberto_em` + `reaberto_motivo` preenchidos, sem
-- reexportação depois) sinaliza que a solicitação mudou depois de já ter
-- saído numa planilha e que o RM correspondente precisa de correção manual
-- no SAP. "Concluído" fecha esse sinalizador sem exigir uma nova exportação
-- — quem corrigiu direto no SAP só confirma que fez, e a marca sai da lista
-- ativa para o histórico, com registro de quem e quando.
-- =====================================================================

alter table public.almox_rm_exportacao_solicitacoes
  add column if not exists concluido_em timestamptz,
  add column if not exists concluido_por_id uuid,
  add column if not exists concluido_por_nome text;
