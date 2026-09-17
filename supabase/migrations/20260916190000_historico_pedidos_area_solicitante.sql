-- Área requisitante no Histórico de Pedidos (para a análise de Recorrência
-- de Compras).
--
-- `vw_historico_pedidos`/`mv_historico_pedidos` só leem `sap_zl0132_po`, que
-- não tem `area_solicitante` — esse campo só existe em `sap_me5a_rc` (a RC
-- de origem), ligável por `sap_zl0132_po.ri = sap_me5a_rc.ri` (as duas
-- tabelas já têm a coluna `ri` direto, sem precisar de view intermediária).
--
-- Mesma dança de `20260904100000_contrato_no_historico_pedidos.sql`:
-- matview nova ao lado, view apontada para ela, antiga derrubada, nova
-- renomeada de volta. As definições são lidas com `pg_get_viewdef` em vez de
-- reescritas, e cada marca de substituição precisa ocorrer exatamente uma
-- vez (o bloco aborta se deixar de ocorrer, caso a view já tenha mudado de
-- forma por outra migration).
--
-- `max(r.area_solicitante)` não entra no GROUP BY (que continua por
-- material/fornecedor/doc_compra/tipo_item): é a mesma aproximação já usada
-- para `fornecedor`/`contrato` — se um PO cobrir mais de uma RC de áreas
-- diferentes, o grupo fica com uma.

do $$
declare
  d text;
  novo text;
  marca constant text := 'AS tipo_doc_compra' || chr(10) || '   FROM sap_zl0132_po p';
begin
  select pg_get_viewdef('public.mv_historico_pedidos'::regclass, true) into d;
  if position(marca in d) = 0 then
    raise exception 'mv_historico_pedidos mudou de forma; revisar esta migration';
  end if;

  -- Subquery correlacionada (não JOIN): a view original referencia as
  -- colunas de sap_zl0132_po sem qualificar com "p." — um LEFT JOIN
  -- introduziria sap_me5a_rc.material/etc. no mesmo escopo e ambiguaria
  -- toda referência não qualificada (ex.: "material" no GROUP BY).
  -- A subquery correlacionada em p.ri só é válida dentro de um max() — sem
  -- ele, "p.ri" (não agrupada) violaria a regra do GROUP BY.
  novo := replace(d, marca,
    'AS tipo_doc_compra,' || chr(10) ||
    '    max((SELECT r.area_solicitante FROM sap_me5a_rc r WHERE r.ri = p.ri LIMIT 1)) AS area_solicitante' || chr(10) ||
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
  marca constant text := '    h.contrato,' || chr(10) || '    h.tipo_doc_compra' || chr(10) || '   FROM mv_historico_pedidos h';
begin
  select pg_get_viewdef('public.vw_historico_pedidos'::regclass, true) into d;
  if position(marca in d) = 0 then
    raise exception 'vw_historico_pedidos mudou de forma; revisar esta migration';
  end if;

  execute 'create or replace view public.vw_historico_pedidos as ' || replace(d, marca,
    '    h.contrato,' || chr(10) ||
    '    h.tipo_doc_compra,' || chr(10) ||
    '    h.area_solicitante' || chr(10) ||
    '   FROM mv_historico_pedidos_novo h');
end $$;

-- `vw_historico_fornecedores_sem_po` também lê a matview (não precisa da
-- coluna nova, só não pode segurar o DROP): repontada do mesmo jeito.
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
