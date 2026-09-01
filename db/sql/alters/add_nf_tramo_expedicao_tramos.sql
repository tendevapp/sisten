-- =====================================================================
-- ADICIONA CAMPOS DE NF E NÚMERO DO TRAMO EM EXPEDIÇÃO (SISTEN)
-- =====================================================================
-- Permite registrar o Número da Nota Fiscal (NF) e o Número do Tramo (4 dígitos)
-- para identificação precisa nos relatórios, histórico e e-mails de expedição.

ALTER TABLE public.expedicao_tramos
  ADD COLUMN IF NOT EXISTS numero_nf text,
  ADD COLUMN IF NOT EXISTS numero_tramo text;
