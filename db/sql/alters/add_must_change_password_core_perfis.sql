-- Flag de reset de senha forçado pelo admin.
-- Quando `true`, o usuário é obrigado a definir uma nova senha pessoal logo
-- após o próximo login (popup bloqueante em App.tsx). O admin ativa isso ao
-- usar "Resetar senha" em Painel de Administração > Usuários, onde ele mesmo
-- define a senha provisória. A flag é limpa automaticamente assim que o
-- usuário grava a nova senha (localDb.changePassword).
ALTER TABLE public.core_perfis
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
