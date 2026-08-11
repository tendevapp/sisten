-- Adiciona a coluna "aprovador_cadastro_sap" (marca se o usuário deve ser
-- notificado quando uma nova solicitação de Cadastro SAP é criada/reaberta,
-- editável pelo admin no painel "Gestão de Usuários" > coluna "Aprovador").
-- Aditiva: soma com a notificação por role (coordenador_suprimentos/comprador),
-- não a substitui.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aprovador_cadastro_sap boolean NOT NULL DEFAULT false;
