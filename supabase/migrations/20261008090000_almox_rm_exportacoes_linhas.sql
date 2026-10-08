-- =====================================================================
-- Almoxarifado > Abrir RM — cópia das linhas da planilha exportada
--
-- O log guardava só "quem, quando, quais solicitações". Para auditar o que
-- foi de fato para o SAP (ex.: por que a #3001068 foi para o comprador 358)
-- é preciso o conteúdo da planilha como saiu: o grupo de compras, o depósito
-- e o texto de cabeçalho dependem de cadastros que mudam depois.
--
-- jsonb com um objeto por linha, chaves = cabeçalho da planilha. Lotes
-- anteriores a esta migration ficam com null (a tela os reconstitui com os
-- dados atuais e avisa).
-- =====================================================================

alter table public.almox_rm_exportacoes
  add column if not exists linhas jsonb;
