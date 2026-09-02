-- Adiciona 'Escada / Plataforma' na restrição de verificação de tramos
ALTER TABLE public.expedicao_tramos
  DROP CONSTRAINT IF EXISTS expedicao_tramos_tramo_check;

ALTER TABLE public.expedicao_tramos
  ADD CONSTRAINT expedicao_tramos_tramo_check
  CHECK (tramo = ANY (ARRAY['T1'::text, 'T2'::text, 'T3'::text, 'T4'::text, 'T5'::text, 'Escada / Plataforma'::text]));
