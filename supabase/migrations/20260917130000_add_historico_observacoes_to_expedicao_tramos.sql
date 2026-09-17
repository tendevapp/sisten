-- Adiciona colunas de observações e histórico de ocorrências/justificativas na tabela expedicao_tramos
ALTER TABLE public.expedicao_tramos
ADD COLUMN IF NOT EXISTS observacoes text,
ADD COLUMN IF NOT EXISTS historico_observacoes jsonb DEFAULT '[]'::jsonb;

-- Atualiza a constraint de etapa de fotos para permitir 'evidencia' e 'observacao'
ALTER TABLE public.expedicao_fotos DROP CONSTRAINT IF EXISTS expedicao_fotos_etapa_check;
ALTER TABLE public.expedicao_fotos ADD CONSTRAINT expedicao_fotos_etapa_check
  CHECK (etapa = ANY (ARRAY['chegada_portaria'::text, 'entrada_patio'::text, 'expedicao'::text, 'evidencia'::text, 'observacao'::text]));
