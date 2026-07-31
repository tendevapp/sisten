-- A importação ME3N passa de "apagar tudo e reinserir" para upsert (atualiza o
-- que mudou, insere o que é novo, mantém o que já existia). Necessário porque
-- contratos_detalhes.sql guarda informação complementar por documento que
-- precisa sobreviver a uma nova importação.
--
-- Execute depois de criar_tabela_me3n_contratos.sql.

-- 1. Remove duplicidades de (documento_compras, item) que existam hoje,
--    mantendo a linha mais recente (maior id) de cada combinação — sem isso a
--    constraint UNIQUE abaixo falha. Nota: linhas com item nulo não são
--    deduplicadas por essa condição (NULL não compara igual a NULL no SAP),
--    então a constraint abaixo não previne duplicata nesse caso raro.
delete from public.me3n_contratos a
using public.me3n_contratos b
where a.documento_compras = b.documento_compras
  and a.item = b.item
  and a.item is not null
  and a.id < b.id;

-- 2. Constraint usada pelo upsert (onConflict = 'documento_compras,item').
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'me3n_contratos_documento_item_key'
  ) then
    alter table public.me3n_contratos
      add constraint me3n_contratos_documento_item_key unique (documento_compras, item);
  end if;
end $$;
