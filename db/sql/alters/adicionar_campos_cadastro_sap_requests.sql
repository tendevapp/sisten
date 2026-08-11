-- Adiciona campos do formulário de Cadastro SAP que eram preenchidos na tela
-- mas descartados antes de chegar ao banco (submitRequest só persistia um
-- subconjunto fixo de campos na criação). Sem isso, Fabricante e os dados de
-- representante do fornecedor eram digitados e perdidos silenciosamente.
--
-- representante_* já tinha migração própria (adicionar_campos_representante_requests.sql),
-- mas nunca havia sido aplicada neste projeto — reincluída aqui por segurança
-- (add column if not exists é idempotente).

alter table public.requests
  add column if not exists brand text,
  add column if not exists suggested_supplier text,
  add column if not exists representante_nome text,
  add column if not exists representante_cargo text,
  add column if not exists representante_telefone text,
  add column if not exists representante_email text;
