-- Adiciona a coluna "aprovador_setores" (lista de setores solicitantes que o
-- usuário pode aprovar solicitações de compra, editável pelo admin no painel
-- "Gestão de Usuários" > coluna "Aprovador"). [] = usuário não é aprovador
-- de nenhum setor.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aprovador_setores jsonb NOT NULL DEFAULT '[]'::jsonb;
