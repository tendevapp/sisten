-- =====================================================================
-- ADICIONA CAMPO DE CNH DO MOTORISTA EM EXPEDIÇÃO (SISTEN)
-- =====================================================================
-- Permite registrar o número da CNH do motorista nos tramos de expedição.

ALTER TABLE public.expedicao_tramos
  ADD COLUMN IF NOT EXISTS cnh text;
