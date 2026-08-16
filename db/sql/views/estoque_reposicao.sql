-- =====================================================================
-- Base de reposição de estoque (sugestão de estoque mínimo)
--
-- JANELA DE PRODUÇÃO — a decisão mais importante deste arquivo:
--
-- A fábrica reabriu em jan/2026, mas só começou a PRODUZIR em maio. O
-- histórico de jan a abr é comissionamento e ramp-up, não demanda de
-- produção:
--
--   2026-01    0 eventos de consumo
--   2026-02    7 eventos           R$    15.255
--   2026-03  1.003 eventos         R$   369.331   <- ramp-up
--   2026-04    945 eventos         R$   317.139   <- ramp-up
--   2026-05  1.233 eventos         R$   997.719   <- produção começa (3x o valor)
--   2026-06  2.074 eventos         R$   986.191
--   2026-07  2.581 eventos         R$ 1.502.627
--
-- Calcular consumo diário sobre a janela inteira (222 dias) em vez da
-- janela de produção (106 dias) subestima a taxa em 1,86x. Num estoque
-- mínimo isso vira ruptura: o número sai pela metade do que a produção
-- realmente puxa. Por isso tudo aqui parte de DATA_INICIO_PRODUCAO.
--
-- MÉTODO — por que não é a fórmula clássica de estoque de segurança:
--
-- A fórmula usual (média + Z × desvio-padrão) pressupõe demanda com
-- distribuição aproximadamente normal. A classificação ADI × CV² da
-- carteira mostra ZERO material com demanda suave ou errática: 100% é
-- intermitente ou irregular, com ADI médio 6,58 (demanda em 1 de cada
-- ~6,6 meses). Aplicar a normal a demanda intermitente produz número
-- com aparência estatística e sem lastro.
--
-- Esta view entrega apenas FATOS (contagens, somas, extremos, lead time
-- medido). A política — que material merece mínimo, com que folga, e o
-- texto que explica a conta — vive em src/lib/reposicao.ts, onde é
-- testável e ajustável sem migração.
-- =====================================================================

drop view if exists public.vw_estoque_reposicao;

create view public.vw_estoque_reposicao as
with parametros as (
  -- Início da produção efetiva. Conhecimento de negócio: não é derivável
  -- do dado sozinho (jan-abr também têm movimento). Mudou a operação?
  -- É aqui que se ajusta, num lugar só.
  select
    date '2026-05-01' as inicio_producao,
    (select max(data_lancamento) from public.mb51_mov_estoque) as fim
),
janela as (
  select inicio_producao, fim,
         greatest(fim - inicio_producao, 1) as dias,
         -- Meses-calendário tocados pela janela, base do ADI.
         (extract(year from fim)::int * 12 + extract(month from fim)::int)
       - (extract(year from inicio_producao)::int * 12 + extract(month from inicio_producao)::int) + 1
           as periodos
  from parametros
),

-- Consumo dentro da janela de produção, por material.
consumo as (
  select
    m.material,
    count(*)                              as eventos,
    sum(-m.qtd_um_registro)               as total,
    max(-m.qtd_um_registro)               as maior_lote,
    avg(-m.qtd_um_registro)               as media_lote,
    coalesce(stddev_samp(-m.qtd_um_registro), 0) as dp_lote,
    percentile_cont(0.75) within group (order by -m.qtd_um_registro) as lote_p75,
    percentile_cont(0.90) within group (order by -m.qtd_um_registro) as lote_p90,
    min(m.data_lancamento)                as primeiro,
    max(m.data_lancamento)                as ultimo
  from public.vw_mb51_classificado m, janela j
  where m.categoria = 'consumo'
    and m.material is not null
    and m.data_lancamento >= j.inicio_producao
    and m.qtd_um_registro < 0
  group by 1
),

-- Meses distintos com consumo: numerador do intervalo médio entre demandas.
meses_ativos as (
  select m.material, count(distinct date_trunc('month', m.data_lancamento)) as meses
  from public.vw_mb51_classificado m, janela j
  where m.categoria = 'consumo' and m.material is not null
    and m.data_lancamento >= j.inicio_producao
  group by 1
),

-- Lead time REAL medido: da data do pedido (pedidosforn.data_doc) até a
-- entrada no estoque (lançamento do 101 na MB51). Não usa dt_remessa, que
-- é a data prometida pelo fornecedor — o que interessa para não faltar é
-- quanto o ressuprimento leva de fato, não quanto prometeram.
entradas_pedido as (
  select distinct on (m.pedido, m.material)
         m.pedido, m.material, m.data_lancamento as d_entrada
  from public.vw_mb51_classificado m
  where m.categoria = 'entrada_compra'
    and m.pedido is not null and m.material is not null
  order by m.pedido, m.material, m.data_lancamento
),
pedidos as (
  select distinct on (doc_compra, material) doc_compra, material, data_doc
  from public.pedidosforn
  where doc_compra is not null and data_doc is not null
  order by doc_compra, material, data_doc
),
lead_material as (
  select e.material,
         avg(e.d_entrada - p.data_doc)  as lead_medio,
         max(e.d_entrada - p.data_doc)  as lead_max,
         count(*)                        as amostras
  from entradas_pedido e
  join pedidos p on p.doc_compra = e.pedido and p.material = e.material
  where e.d_entrada >= p.data_doc
  group by 1
),
-- Mediana global, usada quando o material nunca foi comprado por pedido
-- rastreável. Mediana e não média: a cauda de pedidos muito longos puxa a
-- média para cima e inflaria o mínimo de quem não tem histórico próprio.
lead_global as (
  select percentile_cont(0.5) within group (order by e.d_entrada - p.data_doc) as lead_mediano
  from entradas_pedido e
  join pedidos p on p.doc_compra = e.pedido and p.material = e.material
  where e.d_entrada >= p.data_doc
),

posicao as (
  select material,
         max(txt_breve_material) as descricao,
         max(grupo_mercadorias)  as grupo_mercadorias,
         max(tipo_material)      as tipo_material,
         max(umb)                as umb,
         sum(quantidade)         as saldo_atual,
         sum(valor_total)        as valor_estoque,
         avg(nullif(preco_medio, 0)) as preco_medio
  from public.estoque
  group by 1
)
select
  p.material,
  p.descricao,
  p.grupo_mercadorias,
  p.tipo_material,
  p.umb,
  p.saldo_atual,
  p.valor_estoque,
  p.preco_medio,

  j.inicio_producao                       as janela_inicio,
  j.fim                                   as janela_fim,
  j.dias                                  as janela_dias,
  j.periodos                              as janela_periodos,

  coalesce(c.eventos, 0)                  as eventos_consumo,
  coalesce(ma.meses, 0)                   as meses_com_consumo,
  coalesce(c.total, 0)                    as consumo_total,
  coalesce(c.maior_lote, 0)               as maior_lote,
  coalesce(c.media_lote, 0)               as media_lote,
  coalesce(c.dp_lote, 0)                  as dp_lote,
  round(c.lote_p75::numeric, 4)           as lote_p75,
  -- Proteção usa o p90, não o máximo: cobrir a maior saída já observada
  -- inflava o mínimo de item caro por um evento isolado (ver reposicao.ts).
  round(c.lote_p90::numeric, 4)           as lote_p90,
  -- Fração do consumo concentrada na maior retirada. Acima de 40% a demanda
  -- é dirigida por evento de projeto e ponto de reposição não se aplica.
  case when coalesce(c.total, 0) > 0
       then round((c.maior_lote / c.total)::numeric, 4) end as concentracao_maior_lote,
  c.primeiro                              as primeiro_consumo,
  c.ultimo                                as ultimo_consumo,
  round((coalesce(c.total, 0) / j.dias)::numeric, 4) as consumo_diario,

  -- Intervalo médio entre demandas (ADI) e variabilidade relativa do lote
  -- (CV²) — os dois eixos da classificação Syntetos-Boylan que decide se o
  -- material admite tratamento estatístico ou é caso de compra sob demanda.
  case when coalesce(ma.meses, 0) > 0
       then round((j.periodos::numeric / ma.meses), 3) end as adi,
  case when coalesce(c.media_lote, 0) > 0
       then round((power(c.dp_lote / c.media_lote, 2))::numeric, 3) end as cv2,

  round(coalesce(lm.lead_medio, lg.lead_mediano, 19)::numeric, 1) as lead_dias,
  round(lm.lead_max::numeric, 0)          as lead_dias_max,
  coalesce(lm.amostras, 0)                as lead_amostras,
  -- Verdadeiro quando o lead time é do próprio material; falso quando caiu
  -- na mediana global. A UI precisa distinguir para não vender estimativa
  -- emprestada como medição.
  (lm.material is not null)               as lead_proprio
from posicao p
cross join janela j
cross join lead_global lg
left join consumo c       on c.material  = p.material
left join meses_ativos ma on ma.material = p.material
left join lead_material lm on lm.material = p.material;

alter view public.vw_estoque_reposicao set (security_invoker = on);
grant select on public.vw_estoque_reposicao to authenticated;
revoke all on public.vw_estoque_reposicao from anon;
