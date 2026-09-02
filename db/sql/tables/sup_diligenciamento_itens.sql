-- =====================================================================
-- Diligenciamento de pedidos de compra — dado por item (RI), digitado pelo
-- comprador no painel de Diligenciamento (Suprimentos).
--
-- Contexto: a ZL0132 (sap_zl0132_po) já traz fornecedor, valor e data de
-- remessa por item de pedido, mas não sabe quem vai transportar a carga nem
-- quando a transportadora emitiu a nota fiscal — isso não existe em nenhuma
-- planilha SAP. Esta tabela guarda só o que é digitado no painel; tudo que a
-- ZL0132 já fornece continua sendo lido de lá (ver `sap_zl0132_po` e
-- `localDb.getEnrichedSAPRequisicoes()`), sem duplicação.
--
-- Granularidade por item (`ri`), não por PO: o envio pode ser separado
-- mesmo dentro de um único pedido, então cada item tem sua própria
-- transportadora, faturamento e (se o comprador quiser) previsão manual. A
-- tela de Diligenciamento agrupa por PO, mas a edição em massa no cabeçalho
-- do PO apenas grava a mesma linha em cada item aberto dele.
--
-- Colunas:
--   ri                              -> chave. Mesma RI usada em
--                                      almoxarifado_chegadas, sup_rastreio_prioridades
--                                      e sap_me5a_rc — é o identificador universal
--                                      do item de requisição/pedido no SISTEN.
--   doc_compra                      -> denormalizado, só para filtro/leitura
--                                      rápida sem precisar casar com a ZL0132
--                                      a cada consulta.
--   transportadora                  -> texto livre digitado pelo comprador.
--                                      A lista de sugestão (autocompletar) é
--                                      derivada dos valores já usados aqui —
--                                      não há tabela de cadastro própria.
--   data_faturamento_transportadora -> data em que a transportadora emitiu o
--                                      faturamento/CTe da carga. Editável à
--                                      mão; não vem de nenhuma planilha.
--   previsao_manual                 -> sobrepõe a previsão calculada
--                                      (remessa + prazo de sup_prazos_transporte)
--                                      quando o comprador tem uma informação
--                                      melhor que o cálculo. NULL = usa o
--                                      cálculo. Trocar a transportadora limpa
--                                      este campo (ver src/lib/diligenciamento.ts),
--                                      para não deixar uma previsão presa a um
--                                      transportador que não é mais o do envio.
-- =====================================================================

create table if not exists public.sup_diligenciamento_itens (
  ri text primary key,
  doc_compra text,
  transportadora text,
  data_faturamento_transportadora date,
  previsao_manual date,
  atualizado_por_id text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sup_diligenciamento_itens_doc_compra
  on public.sup_diligenciamento_itens (doc_compra);

grant select, insert, update, delete on public.sup_diligenciamento_itens to anon, authenticated;
