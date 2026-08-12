-- =============================================================================
-- Migration: Adicionar colunas 'cidade' e 'estado_uf' na tabela contatos
-- Data: 2026-08-12
-- Descrição: Permite salvar os dados de Cidade e Estado (UF) do fornecedor na tabela contatos.
-- =============================================================================

ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado_uf text;

-- Recarrega o cache de esquema do PostgREST
NOTIFY pgrst, 'reload schema';
