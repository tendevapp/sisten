-- Migration: Adicionar suporte a Novo Cadastro vs Atualização e código SAP gerado
ALTER TABLE core_solicitacoes
  ADD COLUMN IF NOT EXISTS fornecedor_operacao text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS codigo_fornecedor_sap text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS codigo_sap_gerado text DEFAULT NULL;
