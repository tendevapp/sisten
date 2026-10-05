-- O fornecedor é um atributo do item, não da tela: o catálogo pode receber
-- bases futuras de outros parceiros sem perder a origem comercial de cada linha.
alter table public.sup_catalogo_ritec_itens
  add column if not exists fornecedor text;

update public.sup_catalogo_ritec_itens
   set fornecedor = 'RITEC'
 where fornecedor is null;

alter table public.sup_catalogo_ritec_itens
  alter column fornecedor set default 'RITEC',
  alter column fornecedor set not null;

create index if not exists idx_sup_catalogo_ritec_fornecedor
  on public.sup_catalogo_ritec_itens (fornecedor);

notify pgrst, 'reload schema';
