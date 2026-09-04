-- Contrato guarda-chuva tambem na base do Historico de Pedidos.
--
-- Irma da 20260904090000, que levou `contrato_po` ate a Central de Compras.
-- O Historico le outra cadeia -- `sap_zl0132_po` -> `mv_historico_pedidos`
-- (agregada por material + fornecedor + pedido) -> `vw_historico_pedidos` --
-- e essa cadeia tambem descartava a coluna `contrato`.
--
-- A agregacao e por `doc_compra`, e o contrato e um atributo do pedido, entao
-- `max()` sobre o grupo devolve o contrato do proprio PO. `NULLIF(...,'0')`
-- porque a ZL0132 escreve '0' -- nunca nulo -- na linha sem contrato; sem isso
-- toda compra spot viraria "contrato 0".
--
-- Mesma dança da migration anterior: matview nova ao lado, view apontada para
-- ela, antiga derrubada, nova renomeada. Aqui as definicoes tambem sao lidas
-- com `pg_get_viewdef` em vez de reescritas, e cada marca de substituicao
-- ocorre exatamente uma vez (o bloco aborta se deixar de ocorrer).
-- `refresh_historico_pedidos()` refresca a matview pelo nome e segue valendo.

do $$
declare
  d text;
  novo text;
  marca constant text := 'AS pedido_parcial' || chr(10) || '   FROM sap_zl0132_po p';
begin
  select pg_get_viewdef('public.mv_historico_pedidos'::regclass, true) into d;
  if position(marca in d) = 0 then
    raise exception 'mv_historico_pedidos mudou de forma; revisar esta migration';
  end if;

  novo := replace(d, marca,
    'AS pedido_parcial,' || chr(10) ||
    '    max(NULLIF(btrim(contrato), ''0''::text)) AS contrato,' || chr(10) ||
    '    max(tipo_doc_compra) AS tipo_doc_compra' || chr(10) ||
    '   FROM sap_zl0132_po p');

  execute 'create materialized view public.mv_historico_pedidos_novo as ' || novo;
end $$;

create unique index mv_historico_pedidos_novo_uidx
  on public.mv_historico_pedidos_novo
  (material, coalesce(cod_forn, ''::text), coalesce(cnpj, ''::text), coalesce(doc_compra, ''::text));
create index mv_historico_pedidos_novo_material_idx on public.mv_historico_pedidos_novo (material);

do $$
declare
  d text;
  novo text;
  marca constant text := 'AS grp_mercads_desc' || chr(10) || '   FROM mv_historico_pedidos h';
begin
  select pg_get_viewdef('public.vw_historico_pedidos'::regclass, true) into d;
  if position(marca in d) = 0 then
    raise exception 'vw_historico_pedidos mudou de forma; revisar esta migration';
  end if;

  -- Colunas novas no FIM do SELECT: CREATE OR REPLACE VIEW exige que as
  -- existentes mantenham ordem e tipo.
  novo := replace(d, marca,
    'AS grp_mercads_desc,' || chr(10) ||
    '    h.contrato,' || chr(10) ||
    '    h.tipo_doc_compra' || chr(10) ||
    '   FROM mv_historico_pedidos_novo h');

  execute 'create or replace view public.vw_historico_pedidos as ' || novo;
end $$;

-- `vw_historico_fornecedores_sem_po` tambem le a matview (nao precisa das
-- colunas novas, so nao pode segurar o DROP): repontada do mesmo jeito.
do $$
declare
  d text;
  marca constant text := '   FROM mv_historico_pedidos h';
begin
  select pg_get_viewdef('public.vw_historico_fornecedores_sem_po'::regclass, true) into d;
  if position(marca in d) = 0 then
    raise exception 'vw_historico_fornecedores_sem_po mudou de forma; revisar esta migration';
  end if;
  execute 'create or replace view public.vw_historico_fornecedores_sem_po as '
    || replace(d, marca, '   FROM mv_historico_pedidos_novo h');
end $$;

drop materialized view public.mv_historico_pedidos;
alter materialized view public.mv_historico_pedidos_novo rename to mv_historico_pedidos;
alter index public.mv_historico_pedidos_novo_uidx rename to mv_historico_pedidos_uidx;
alter index public.mv_historico_pedidos_novo_material_idx rename to mv_historico_pedidos_material_idx;
