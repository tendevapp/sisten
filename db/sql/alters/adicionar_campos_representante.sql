-- Adiciona campos opcionais de representante à tabela de contatos.
--
-- Permite separar os dados gerais do fornecedor (telefone/email da empresa)
-- dos dados específicos do representante (nome, cargo, telefone, email pessoal).

alter table public.contatos
  add column if not exists representante_nome text,
  add column if not exists representante_cargo text,
  add column if not exists representante_telefone text,
  add column if not exists representante_email text;

-- O campo nome_contato fica mantido por compatibilidade, mas novos cadastros
-- devem usar representante_nome.
