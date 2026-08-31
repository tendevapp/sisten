-- =====================================================================
-- Histórico de Pedidos agregado por FORNECEDOR + PEDIDO (Nº Pedido).
-- Considera linhas com 'x' na coluna CRF OU com alguma entrega registrada
-- (qtd_fornecida > 0). Soma quantidade e valor; preço unitário derivado
-- (valor / qtd).
--
-- CRF só amplia: o SAP marca 'x' quando a entrega fecha 100%, mas um pedido
-- em entrega parcial já tem preço e quantidade reais — não é "sem compra".
-- Investigação de 2026-08-09: buscar por "NUT" não trazia a compra de
-- parafusos/porcas de 05/03/2026 (pedido 4100441709, ~R$233 mil) porque a
-- entrega estava 69,6% concluída e o crf nunca chegou a 'x'. Historicamente
-- há também pedidos 100% entregues cujo crf nunca foi marcado — puro atraso
-- do flag no SAP, sem relação com o quanto foi entregue.
--
-- Ficam de fora só os pedidos com ZERO entrega (qtd_fornecida = 0): nada foi
-- recebido, não há preço realizado a auditar ainda.
--
-- `pedido_parcial` (true quando 0 < qtd_fornecida < qtd_pedido) avisa a
-- interface que a linha pode mudar de valor/quantidade até a entrega fechar.
--
-- MOEDA: o valor somado é `valor_em_brl`, não `valor_liquido`.
-- `pedidosforn.valor_liquido` está na moeda ORIGINAL do pedido (BRL, USD, EUR
-- e ZUSD convivem na tabela), então somá-lo direto adicionava dólar e euro
-- como se fossem reais. Na base completa isso subestimava o gasto em ~R$ 135
-- milhões; no recorte de 2026, em ~30%. A coluna de saída mantém o nome
-- `valor_liquido` porque é o que o app já consome, mas o conteúdo é BRL — e
-- `preco_liquido_unit`, derivado dela, passa a ser comparável entre pedidos
-- de moedas diferentes.
--
-- Usa MATERIALIZED VIEW (pré-calculada) porque a agregação sobre a tabela
-- inteira, feita a cada consulta, estourava o statement_timeout do Supabase
-- (erro 57014). A view fina vw_historico_pedidos aponta para a materializada,
-- mantendo o nome que o app já consulta.
-- =====================================================================

-- Recria de forma idempotente.
drop view if exists public.vw_historico_pedidos;
drop materialized view if exists public.mv_historico_pedidos;

create materialized view public.mv_historico_pedidos as
select
  p.material,
  max(p.txt_breve)                                   as txt_breve,
  p.fornecedor_codigo                                as cod_forn,
  p.cnpj_fornecedor                                  as cnpj,
  max(p.fornecedor_nome)                             as fornecedor,
  max(p.regiao_uf)                                   as regiao_uf,
  -- Grupo de mercadoria: um material pertence a um só grupo, então o max()
  -- sobre o agrupamento (que já inclui o material) devolve o valor, não uma
  -- escolha arbitrária entre valores diferentes.
  max(p.grp_mercads)                                 as grp_mercads,
  -- Natureza do item pelo padrão do código de material: os de projeto usam a
  -- faixa de 18 dígitos iniciada em 100000000; os de consumo, códigos curtos
  -- (5 a 7 dígitos). A separação importa porque as duas naturezas têm perfis
  -- de gasto opostos — no recorte de 2026, itens de projeto são 3,5% das
  -- linhas e 39% do valor, e analisá-los junto com consumo distorce
  -- concentração, ticket médio e curva ABC.
  case
    when p.material like '100000000%' then 'Projeto'
    else 'Consumo'
  end                                                as tipo_item,
  p.doc_compra,
  max(p.reqc)                                        as reqc,
  max(p.data_doc)                                    as data_doc,
  sum(coalesce(p.qtd_pedido, 0))                     as qtd_pedido,
  sum(coalesce(p.qtd_fornecida, 0))                  as qtd_fornecida,
  sum(coalesce(p.valor_em_brl, 0))                   as valor_liquido,
  case
    when sum(coalesce(p.qtd_pedido, 0)) > 0
    then sum(coalesce(p.valor_em_brl, 0)) / sum(coalesce(p.qtd_pedido, 0))
    else null
  end                                                as preco_liquido_unit,
  (sum(coalesce(p.qtd_fornecida, 0)) > 0
    and sum(coalesce(p.qtd_fornecida, 0)) < sum(coalesce(p.qtd_pedido, 0))) as pedido_parcial
from public.sap_zl0132_po p
where lower(coalesce(p.crf, '')) = 'x' or coalesce(p.qtd_fornecida, 0) > 0
group by
  p.material,
  p.fornecedor_codigo,
  p.cnpj_fornecedor,
  p.doc_compra,
  -- Determinado pelo próprio material, que já está no agrupamento; entra aqui
  -- só para satisfazer o GROUP BY, sem partir nenhuma linha em duas.
  case when p.material like '100000000%' then 'Projeto' else 'Consumo' end;

-- Índice único (chave do GROUP BY) — necessário para REFRESH ... CONCURRENTLY.
create unique index if not exists mv_historico_pedidos_uidx
  on public.mv_historico_pedidos (
    material,
    coalesce(cod_forn, ''),
    coalesce(cnpj, ''),
    coalesce(doc_compra, '')
  );

-- Índice de busca por material.
create index if not exists mv_historico_pedidos_material_idx
  on public.mv_historico_pedidos (material);

-- View fina com o nome que o app consulta (leitura rapida, com enrichment de contato e localizacao).
create or replace view public.vw_historico_pedidos as
  select
    h.*,
    cf.pais,
    cf.localidade as cidade,
    cf.rua,
    cf.codigo_postal,
    -- estado_uf: prioriza o valor da cidadeforn (coluna Rg da ZL0132, 2 letras);
    -- cai de volta para regiao_uf do pedido quando valida (2 letras).
    coalesce(
      nullif(trim(cf.estado_uf), ''),
      case when h.regiao_uf ~ '^[A-Za-z]{2}$' then upper(h.regiao_uf) else null end
    ) as estado_uf,
    -- Descrição amigável do grupo de mercadoria (tabela cadastro_grupo_mercadoria)
    coalesce(
      nullif(trim(gm.denominacao2), ''),
      nullif(trim(gm.denominacao), '')
    ) as grp_mercads_desc
  from public.mv_historico_pedidos h
  left join public.sup_fornecedores_cidades cf
    on cf.forn_codigo = h.cod_forn
  left join public.cadastro_grupo_mercadoria gm
    on gm.codigo = h.grp_mercads;

-- Permissões de leitura (Supabase anon/authenticated).
grant select on public.mv_historico_pedidos to anon, authenticated;
grant select on public.vw_historico_pedidos to anon, authenticated;


-- Função para recalcular a materialized view após importações (chamada via RPC).
create or replace function public.refresh_historico_pedidos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    refresh materialized view concurrently public.mv_historico_pedidos;
  exception when others then
    refresh materialized view public.mv_historico_pedidos;
  end;
end;
$$;

grant execute on function public.refresh_historico_pedidos() to anon, authenticated;
