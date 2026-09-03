-- Adiciona coluna cnh na tabela expedicao_tramos
ALTER TABLE public.expedicao_tramos
  ADD COLUMN IF NOT EXISTS cnh text;
