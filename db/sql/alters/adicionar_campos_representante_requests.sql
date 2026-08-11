-- Adiciona campos opcionais de representante à tabela de solicitações.
--
-- Permite armazenar dados específicos do representante em solicitações de
-- Cadastro SAP do tipo Fornecedor.

alter table public.requests
  add column if not exists representante_nome text,
  add column if not exists representante_cargo text,
  add column if not exists representante_telefone text,
  add column if not exists representante_email text;
