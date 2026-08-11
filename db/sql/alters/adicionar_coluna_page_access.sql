-- Adiciona a coluna "page_access" (override de acesso a páginas/feature flags
-- por usuário, editável pelo admin no painel "Módulos de acesso"). Só as
-- chaves desviadas do padrão do perfil entram no JSON; {} = segue o padrão.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS page_access jsonb NOT NULL DEFAULT '{}'::jsonb;
