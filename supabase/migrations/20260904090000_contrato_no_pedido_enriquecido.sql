-- Numero do contrato (EKPO-KONNR, coluna "Contr." da ZL0132) na cadeia de
-- views que a aplicacao le.
--
-- Contexto: a ZL0132 ja traz, por linha de pedido, o contrato guarda-chuva que
-- originou o item quando o PO foi criado por referencia a um contrato. Esse e
-- o unico marcador confiavel de "pedido de contrato" -- nem o tipo de
-- documento serve (ZP06 e "Servico", e servico avulso tambem usa ZP06), nem
-- `doc_compra_ref` (faixas 31*/37*, documento de cotacao). Contrato no SAP
-- desta instalacao vive na faixa 5* (51..59), a mesma da ME3N.
--
-- O campo existia em `sap_zl0132_po` e em `vw_sap_pedidos_enriquecidos`, mas
-- morria em `mv_pedidos_por_ri`, que so seleciona um subconjunto de colunas --
-- por isso a tela nunca teve como distinguir compra spot de call-off de
-- contrato.
--
-- Matview nao aceita CREATE OR REPLACE: mesma dança da migration
-- 20260903140000 -- cria a nova ao lado, aponta a view para ela, derruba a
-- antiga e renomeia. O rename mantem a dependencia (Postgres liga view e
-- matview por OID) e preserva `refresh_historico_pedidos()`, que refresca a
-- matview pelo nome.

-- 1. Matview com as tres colunas novas ------------------------------------
create materialized view public.mv_pedidos_por_ri_novo as
select
  ri, doc_compra, item, eflag_e, fornecedor_codigo, fornecedor_nome,
  data_doc, data_migo, dt_remessa, criado_por_pedido, status_entrega,
  dias_atrasado, qtd_pedido, qtd_fornecida, por, unidade_medida_pedido,
  preco_liquido_unit, valor_em_brl, valor_liquido, modificado_em,
  contrato, item_contrato, tipo_doc_compra
from public.vw_sap_pedidos_enriquecidos p
where doc_compra is not null and doc_compra <> '';

create unique index mv_pedidos_por_ri_novo_pk on public.mv_pedidos_por_ri_novo (ri, doc_compra);
create index mv_pedidos_por_ri_novo_ri_idx on public.mv_pedidos_por_ri_novo (ri);

-- 2. View enriquecida ------------------------------------------------------
-- A definicao da view tem ~300 linhas e nada nela muda alem das colunas novas.
-- Em vez de reescrever (e arriscar divergir do que esta no ar), reaproveita-se
-- o proprio texto da view: cada padrao abaixo ocorre exatamente uma vez, e o
-- bloco aborta se algum deixar de ocorrer. As colunas novas entram no FIM do
-- SELECT final -- CREATE OR REPLACE VIEW exige que as colunas existentes
-- mantenham ordem e tipo.
do $$
declare
  d text;
  novo text;
  marca_join constant text := 'JOIN mv_pedidos_por_ri p';
  marca_p    constant text := '            p.eflag_e,';
  marca_j    constant text := '            j.eflag_e,';
  marca_fim  constant text := '    qtd_fornecida_total' || chr(10) || '   FROM c;';
begin
  select pg_get_viewdef('public.vw_sap_requisicoes_enriquecidas'::regclass, true) into d;

  if position(marca_join in d) = 0 or position(marca_p in d) = 0
     or position(marca_j in d) = 0 or position(marca_fim in d) = 0 then
    raise exception 'vw_sap_requisicoes_enriquecidas mudou de forma; revisar esta migration';
  end if;

  novo := replace(d, marca_join, 'JOIN mv_pedidos_por_ri_novo p');
  novo := replace(novo, marca_p,
    '            p.contrato,' || chr(10) ||
    '            p.item_contrato,' || chr(10) ||
    '            p.tipo_doc_compra,' || chr(10) || marca_p);
  novo := replace(novo, marca_j,
    '            j.contrato,' || chr(10) ||
    '            j.item_contrato,' || chr(10) ||
    '            j.tipo_doc_compra,' || chr(10) || marca_j);
  novo := replace(novo, marca_fim,
    '    qtd_fornecida_total,' || chr(10) ||
    '    contrato AS contrato_po,' || chr(10) ||
    '    item_contrato AS item_contrato_po,' || chr(10) ||
    '    tipo_doc_compra AS tipo_doc_po' || chr(10) || '   FROM c;');

  execute 'create or replace view public.vw_sap_requisicoes_enriquecidas as ' || novo;
end $$;

-- 3. Troca ------------------------------------------------------------------
drop materialized view public.mv_pedidos_por_ri;
alter materialized view public.mv_pedidos_por_ri_novo rename to mv_pedidos_por_ri;
alter index public.mv_pedidos_por_ri_novo_pk rename to mv_pedidos_por_ri_pk;
alter index public.mv_pedidos_por_ri_novo_ri_idx rename to mv_pedidos_por_ri_ri_idx;
