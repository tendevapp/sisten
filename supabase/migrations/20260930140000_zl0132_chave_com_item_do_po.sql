-- ZL0132: um mesmo PO pode ter DUAS linhas para o mesmo item de RM.
--
-- Caso real: RM 1200093372 item 90 (50 un do material 1349056) foi atendida
-- pelo PO 4100462360 em dois itens do pedido — Itm 10 (36 un a 357,98) e
-- Itm 50 (14 un a 321,91) — porque o mesmo código de material foi comprado duas
-- vezes com preços unitários diferentes. As duas linhas têm o mesmo
-- (ri, doc_compra); a chave única antiga `(ri, doc_compra)` deixava passar só
-- uma e a outra se perdia na importação.
--
-- Correção, em três partes:
--   1. Chave única passa a incluir o item do pedido (`itm_liberacao`, "Itm" da
--      planilha). NULLS NOT DISTINCT: sem a coluna na planilha, a reimportação
--      continua sobrescrevendo em vez de duplicar.
--   2. mv_pedidos_por_ri continua com UMA linha por (ri, doc_compra), mas agora
--      consolidando os itens do pedido: soma quantidade/valor e usa preço médio
--      ponderado pela quantidade. Assim a view da RM (vw_sap_requisicoes_
--      enriquecidas) não duplica linha nem subconta quantidade.
--   3. As demais views/matviews que leem sap_zl0132_po já agrupam por
--      (material, fornecedor, doc_compra) com sum(valor)/sum(qtd) e não mudam.
--
-- Matview não aceita CREATE OR REPLACE: mesma dança da migration
-- 20260904090000 — cria a nova ao lado, repoint a view da RM, derruba a antiga
-- e renomeia (preserva refresh_historico_pedidos(), que refresca pelo nome).

-- 1. Chave única com o item do pedido ----------------------------------------
alter table public.sap_zl0132_po drop constraint pedidosforn_ri_doc_compra_unique;
alter table public.sap_zl0132_po
  add constraint pedidosforn_ri_doc_item_unique
  unique nulls not distinct (ri, doc_compra, itm_liberacao);

-- 2. Matview consolidada por (ri, doc_compra) ---------------------------------
-- Regras da consolidação:
--   * linha eliminada (E = 'L') só entra quando TODAS as linhas do grupo estão
--     eliminadas — a ativa sempre vence, como na importação;
--   * entregue (data_migo) só quando TODAS as linhas têm MIGO; entrega parcial
--     fica "Não Entregue" (qtd_fornecida somada mostra o quanto chegou);
--   * preço: linha única passa direto; várias linhas -> média ponderada pela
--     quantidade, calculada por unidade (preço / "por") para não misturar
--     linhas cotadas por 1, 100 ou 1000. Mantém o "por" quando é o mesmo em
--     todas as linhas; senão devolve preço por 1 e por = '1'.
create materialized view public.mv_pedidos_por_ri_novo as
with linhas as (
  select
    p.*,
    bool_or(coalesce(upper(btrim(p.eflag_e)), '') <> 'L')
      over (partition by p.ri, p.doc_compra) as grupo_tem_ativa,
    case
      when p.por ~ '^[0-9]+([.,][0-9]+)?$'
        then coalesce(nullif(replace(p.por, ',', '.')::numeric, 0), 1)
      else 1
    end as por_num
  from public.vw_sap_pedidos_enriquecidos p
  where p.doc_compra is not null and p.doc_compra <> ''
),
consideradas as (
  select * from linhas
  where coalesce(upper(btrim(eflag_e)), '') <> 'L' or not grupo_tem_ativa
)
select
  ri,
  doc_compra,
  min(item) as item,
  max(eflag_e) as eflag_e,
  max(fornecedor_codigo) as fornecedor_codigo,
  max(fornecedor_nome) as fornecedor_nome,
  max(data_doc) as data_doc,
  case when count(*) = count(data_migo) then max(data_migo) end as data_migo,
  max(dt_remessa) as dt_remessa,
  max(criado_por_pedido) as criado_por_pedido,
  case when count(*) = count(data_migo) then 'Entregue' else 'Não Entregue' end as status_entrega,
  max(dias_atrasado) as dias_atrasado,
  sum(qtd_pedido) as qtd_pedido,
  sum(qtd_fornecida) as qtd_fornecida,
  case when count(distinct por_num) = 1 then max(por) else '1' end as por,
  max(unidade_medida_pedido) as unidade_medida_pedido,
  case
    when count(*) = 1 then max(preco_liquido_unit)
    when coalesce(sum(qtd_pedido), 0) > 0 then
      round(
        sum(preco_liquido_unit / por_num * qtd_pedido) / sum(qtd_pedido)
          * case when count(distinct por_num) = 1 then max(por_num) else 1 end,
        6)
    else max(preco_liquido_unit)
  end as preco_liquido_unit,
  sum(valor_em_brl) as valor_em_brl,
  sum(valor_liquido) as valor_liquido,
  max(modificado_em) as modificado_em,
  max(contrato) as contrato,
  max(item_contrato) as item_contrato,
  max(tipo_doc_compra) as tipo_doc_compra
from consideradas
group by ri, doc_compra;

create unique index mv_pedidos_por_ri_novo_pk on public.mv_pedidos_por_ri_novo (ri, doc_compra);
create index mv_pedidos_por_ri_novo_ri_idx on public.mv_pedidos_por_ri_novo (ri);

-- Sem anon: a view da RM roda com os direitos do dono e ninguém lê a matview
-- direto sem login (ver 20260929150400_revogar_anon_grants_schema_public).
revoke all on public.mv_pedidos_por_ri_novo from anon, public;
grant select on public.mv_pedidos_por_ri_novo to authenticated, service_role;

-- 3. View da RM aponta para a nova -------------------------------------------
-- O texto da view (~300 linhas) não muda: só o nome da matview, que aparece
-- duas vezes (JOIN principal e o NOT EXISTS). O bloco aborta se mudar de forma.
do $$
declare
  d text;
  novo text;
  marca constant text := 'mv_pedidos_por_ri p';
begin
  select pg_get_viewdef('public.vw_sap_requisicoes_enriquecidas'::regclass, true) into d;

  if (length(d) - length(replace(d, marca, ''))) / length(marca) <> 2 then
    raise exception 'vw_sap_requisicoes_enriquecidas mudou de forma; revisar esta migration';
  end if;

  novo := replace(d, marca, 'mv_pedidos_por_ri_novo p');

  execute 'create or replace view public.vw_sap_requisicoes_enriquecidas as ' || novo;
end $$;

-- 4. Troca ---------------------------------------------------------------------
drop materialized view public.mv_pedidos_por_ri;
alter materialized view public.mv_pedidos_por_ri_novo rename to mv_pedidos_por_ri;
alter index public.mv_pedidos_por_ri_novo_pk rename to mv_pedidos_por_ri_pk;
alter index public.mv_pedidos_por_ri_novo_ri_idx rename to mv_pedidos_por_ri_ri_idx;
