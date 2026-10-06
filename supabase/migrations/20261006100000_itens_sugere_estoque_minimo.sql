-- Solicitante de compra Direta pode sugerir o item para cadastro de estoque mínimo.
ALTER TABLE public.core_solicitacoes_itens
  ADD COLUMN IF NOT EXISTS sugere_estoque_minimo boolean NOT NULL DEFAULT false;
