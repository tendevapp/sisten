-- =====================================================================
-- Remove as 4 views de compatibilidade deixadas pela reestruturação de
-- nomenclatura de 27/08/2026 (commit 9cb7102). Elas apenas reapontavam os
-- nomes antigos para as tabelas/views novas:
--
--   requisicoes               -> sap_me5a_rc
--   pedidosforn               -> sap_zl0132_po
--   view_enriched_requisicoes -> vw_sap_requisicoes_enriquecidas
--   view_enriched_pedidos     -> vw_sap_pedidos_enriquecidos
--
-- VERIFICADO em 30/08/2026, imediatamente antes de gerar este arquivo:
--   * pg_depend/pg_rewrite: 0 dependentes para cada uma das quatro
--   * nenhuma função em pg_proc as cita
--   * o código do app não as consulta (nenhum `from('<nome>')` em src/)
--   * nenhum .sql vivo do repo as referencia (fora de alters/ e
--     migrations/, que são registro histórico e não devem ser reescritos)
--
-- Sem CASCADE de propósito: o RESTRICT implícito faz o script FALHAR se
-- alguma dependência tiver surgido desde a verificação, em vez de derrubar
-- o dependente junto. Se falhar, leia a mensagem de erro — ela nomeia o
-- consumidor — e reavalie antes de insistir.
--
-- ROLLBACK: rode db/sql/views/ROLLBACK_views_compatibilidade.sql, que
-- recria as quatro com as definições literais e os GRANTs originais
-- (security_invoker=true, acesso total para postgres/anon/authenticated/
-- service_role).
--
-- RISCO RESIDUAL conhecido: a reestruturação tem poucos dias. Um usuário
-- com a aba aberta desde antes daquele deploy ainda roda o bundle antigo,
-- que lê estes nomes. O sintoma seria erro de sync no console e dados
-- parados até recarregar a página (o ErrorBoundary já recupera em
-- navegação). Se isso incomodar, adie e rode depois de um ciclo em que
-- todo mundo tenha recarregado o app.
-- =====================================================================

DROP VIEW public.view_enriched_requisicoes;
DROP VIEW public.view_enriched_pedidos;
DROP VIEW public.requisicoes;
DROP VIEW public.pedidosforn;
