-- =====================================================================
-- ADICIONA CAMPOS DE DATA PARA AS ETAPAS DE EXPEDIÇÃO (SISTEN)
-- =====================================================================
-- Permite registrar a data exata de cada uma das 3 etapas (portaria, pátio, expedição)
-- caso aconteçam em dias diferentes.

ALTER TABLE public.expedicao_tramos
  ADD COLUMN IF NOT EXISTS data_chegada_portaria date,
  ADD COLUMN IF NOT EXISTS data_entrada_patio date,
  ADD COLUMN IF NOT EXISTS data_expedicao date;
