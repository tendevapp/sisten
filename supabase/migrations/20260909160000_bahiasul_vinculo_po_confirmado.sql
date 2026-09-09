-- =====================================================================
-- Bahia Sul: procedência do vínculo com o Pedido de Compras (PO).
--
-- `nro_pedido` já existia (vem da planilha da transportadora ou é digitado
-- à mão). Estas colunas registram COMO o número chegou ali, para o painel
-- distinguir "veio na planilha" de "sugerido pelo sistema e confirmado pelo
-- comprador" e para auditoria. Nenhuma sugestão é gravada sozinha — só a
-- confirmação no painel escreve aqui.
--
-- vinculo_origem: 'planilha' (importado) | 'sugestao' (PO sugerido e
-- confirmado) | 'manual' (digitado no painel). NULL nas linhas antigas.
-- =====================================================================

alter table public.sup_bahiasul_entregas
  add column if not exists vinculo_origem text,
  add column if not exists vinculo_confirmado_em timestamptz,
  add column if not exists vinculo_confirmado_por text;
