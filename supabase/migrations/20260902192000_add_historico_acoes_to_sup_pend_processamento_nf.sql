-- Adiciona a coluna historico_acoes na tabela sup_pend_processamento_nf para log de auditoria
ALTER TABLE public.sup_pend_processamento_nf
ADD COLUMN IF NOT EXISTS historico_acoes jsonb DEFAULT '[]'::jsonb;
