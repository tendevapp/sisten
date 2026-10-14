-- Estoque mínimo digitado no cadastro do item (Catálogo de Itens do Almox).
-- Sai impresso na etiqueta de prateleira; vazio, a célula MÍNIMO fica em
-- branco para preencher à mão. Não é o mínimo calculado do Controle de Estoque
-- (vw_almox_controle_estoque) — os dois não se alimentam.
alter table public.alm_catalogo_itens
  add column if not exists estoque_minimo numeric
    check (estoque_minimo is null or estoque_minimo >= 0);
