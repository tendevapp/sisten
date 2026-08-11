-- =============================================================================
-- Migration: Adicionar coluna 'status' e permitir 'cod_vendor' nulo na tabela contatos
-- Data: 2026-08-11
-- Descrição: Permite definir o status cadastral dos fornecedores e cadastrar
--            fornecedores sem Código SAP.
-- =============================================================================

-- 1. Adiciona a coluna 'status' se não existir (valor padrão 'Atualizado')
ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Atualizado';

-- 2. Remove restrição de obrigatoriedade (NOT NULL) do Código SAP (cod_vendor)
ALTER TABLE public.contatos
  ALTER COLUMN cod_vendor DROP NOT NULL;

-- 3. Preenche registros legados onde status está nulo como 'Atualizado'
UPDATE public.contatos
  SET status = 'Atualizado'
  WHERE status IS NULL;
