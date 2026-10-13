-- Posição no depósito digitada no cadastro do item (Catálogo de Itens do Almox).
-- Vale mais que a posição que vem da ZL0024 (alm_posicao_material_atual);
-- vazia, a tela volta a mostrar a da ZL0024.
alter table public.alm_catalogo_itens
  add column if not exists posicao_estoque text;
