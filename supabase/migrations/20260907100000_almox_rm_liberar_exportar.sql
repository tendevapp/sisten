-- =====================================================================
-- Almoxarifado > Abrir RM — liberar para exportar de novo
--
-- Nem toda edição que reabre uma solicitação exige ajuste manual no SAP: às
-- vezes a planilha saiu, mas a RM nunca chegou a ser criada lá. Para esse
-- caso, "Habilitar Exportar" tira a solicitação do grupo "Editar no SAP" e
-- devolve para a fila normal de exportação — como um "Reabrir" comum, só que
-- disparado de dentro do próprio grupo em destaque, sem perder o registro do
-- que motivou a reabertura.
-- =====================================================================

alter table public.almox_rm_exportacao_solicitacoes
  add column if not exists liberado_exportar_em timestamptz,
  add column if not exists liberado_exportar_por_id uuid,
  add column if not exists liberado_exportar_por_nome text;
