-- Central de Compras: promessa de entrega CONFIRMADA pelo comprador.
--
-- `data_entrega_prevista` continua sendo o valor de trabalho: é auto-preenchido
-- com a remessa do PO + lead time de rota, e o comprador pode ajustá-lo.
-- Enquanto ele não clica em "Confirmar data", essa data NÃO deve chegar ao
-- Rastreio Compras.
--
-- `data_entrega_confirmada` guarda a data no momento em que o comprador confirma.
-- É a única que o Rastreio Compras lê (ver src/lib/rastreio.ts -> buildRastreioRows).
-- Se o comprador editar a previsão depois, a confirmada fica "defasada" até ele
-- confirmar de novo (a UI mostra o botão outra vez); o Rastreio segue exibindo
-- o último valor confirmado, que é estável.

ALTER TABLE sap_me5a_rc
  ADD COLUMN IF NOT EXISTS data_entrega_confirmada date;

COMMENT ON COLUMN sap_me5a_rc.data_entrega_confirmada IS
  'Promessa de entrega confirmada pelo comprador na Central de Compras. Única data que o Rastreio Compras exibe. NULL = ainda não confirmada.';

-- IMPORTANTE: expor a coluna na view enriquecida para que uma recarga completa
-- (pós-importação de ME5A) não zere o valor no cache local. Adicionar à lista de
-- colunas de `vw_sap_requisicoes_enriquecidas`:
--
--   ..., me5a.data_entrega_prevista, me5a.data_entrega_confirmada, ...
--
-- Até a view ser atualizada, o valor ainda se mantém: refreshBuyerFieldsFromSupabase()
-- relê `data_entrega_confirmada` direto de sap_me5a_rc a cada carga da tela.
