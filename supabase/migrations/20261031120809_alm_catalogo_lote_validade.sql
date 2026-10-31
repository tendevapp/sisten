-- Metadados opcionais do cadastro. Não integram o conteúdo da etiqueta.
alter table public.alm_catalogo_itens
  add column lote text,
  add column validade date;
comment on column public.alm_catalogo_itens.lote is 'Lote informado opcionalmente no cadastro do item; não impresso na etiqueta.';
comment on column public.alm_catalogo_itens.validade is 'Data de validade opcional do cadastro do item; não impressa na etiqueta.';
