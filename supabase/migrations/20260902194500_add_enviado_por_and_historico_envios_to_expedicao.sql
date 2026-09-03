-- Adiciona colunas de log de envio de e-mail na tabela expedicao_carregamentos
ALTER TABLE public.expedicao_carregamentos
ADD COLUMN IF NOT EXISTS enviado_por text,
ADD COLUMN IF NOT EXISTS enviado_por_nome text,
ADD COLUMN IF NOT EXISTS historico_envios jsonb DEFAULT '[]'::jsonb;
