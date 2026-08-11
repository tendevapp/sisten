-- Adiciona a coluna "nome_contato" (pessoa de contato) na tabela contatos,
-- usada pela importação de cadastro de contatos (coluna "Contato" da planilha)
-- e pela tela de Fornecedores.
ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS nome_contato text;
