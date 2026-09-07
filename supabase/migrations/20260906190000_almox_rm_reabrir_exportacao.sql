-- =====================================================================
-- Almoxarifado > Abrir RM — reabertura de solicitação já exportada
--
-- Reexportar acontece: planilha perdida, RM recusada no SAP, item corrigido
-- depois da exportação. Antes disso, a única saída seria apagar a marca de
-- exportação — e aí o histórico perderia justamente o que interessa, que é
-- ter saído uma vez.
--
-- Então a marca não sai: ela é carimbada como reaberta, com quem reabriu e
-- quando. A solicitação volta para a fila (a tela passa a considerar
-- "exportada" só quem tem marca NÃO reaberta) carregando a observação de que
-- já foi exportada antes, por quem e em que data.
-- =====================================================================

alter table public.almox_rm_exportacao_solicitacoes
  add column if not exists reaberto_em timestamptz,
  add column if not exists reaberto_por_id uuid,
  add column if not exists reaberto_por_nome text;

-- O filtro "não exportadas" e o status da fila só olham as marcas vigentes.
create index if not exists idx_almox_rm_exp_sol_vigente
  on public.almox_rm_exportacao_solicitacoes (request_id)
  where reaberto_em is null;
