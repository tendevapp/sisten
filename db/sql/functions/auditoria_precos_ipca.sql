-- =====================================================================
-- AUDITORIA DE PREÇOS — compras de 2026 contra o histórico corrigido pelo IPCA.
--
-- Responde: o preço unitário pago em 2026 é bom, comparado ao que o mesmo
-- material custou no passado trazido a valor de hoje?
--
-- Inclui pedidos com crf='x' (SAP marca entrega 100% concluída) OU com
-- qtd_fornecida > 0 (alguma entrega já registrada) — ver nota em
-- criar_view_historico_pedidos.sql. `pedido_parcial` marca as linhas cuja
-- entrega ainda não fechou, para a interface avisar que o valor pode mudar.
--
-- Três objetos:
--   1. ipca_indice           — série mensal do número-índice do IBGE.
--   2. mv_benchmark_material — referência por material (mediana/P25/P75 já corrigidas).
--   3. vw_auditoria_compras  — uma linha por compra de 2026, com veredito.
--   4. vw_auditoria_historico_material — drill-down: as compras passadas que
--      formaram a mediana, para a referência ser conferível em vez de mágica.
--
-- Ver docs/superpowers/specs/2026-08-08-auditoria-precos-ipca-design.md.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Série do IPCA
-- ---------------------------------------------------------------------
-- Número-índice (base dez/1993 = 100), agregada 1737 / variável 2266 do IBGE.
-- Guardamos o número-índice, não a variação percentual: corrigir de um mês a
-- outro vira uma divisão, sem acumular erro de arredondamento de 140 fatores.
create table if not exists public.ipca_indice (
  mes            date primary key,
  numero_indice  numeric not null check (numero_indice > 0),
  atualizado_em  timestamptz not null default now()
);

comment on table public.ipca_indice is
  'IPCA número-índice mensal (IBGE, agregada 1737, variável 2266, base dez/1993=100). Mantida pela Edge Function atualizar-ipca.';

-- Série de out/2014 (um mês antes da compra mais antiga da base) até o último
-- mês publicado na data desta migration. O upsert deixa a carga idempotente e
-- permite reexecutar a migration sobre uma tabela já atualizada sem perder
-- meses novos que a Edge Function tenha inserido.
insert into public.ipca_indice (mes, numero_indice) values
  ('2014-10-01', 4008), ('2014-11-01', 4028.44), ('2014-12-01', 4059.86), ('2015-01-01', 4110.2),
  ('2015-02-01', 4160.34), ('2015-03-01', 4215.26), ('2015-04-01', 4245.19), ('2015-05-01', 4276.6),
  ('2015-06-01', 4310.39), ('2015-07-01', 4337.11), ('2015-08-01', 4346.65), ('2015-09-01', 4370.12),
  ('2015-10-01', 4405.95), ('2015-11-01', 4450.45), ('2015-12-01', 4493.17), ('2016-01-01', 4550.23),
  ('2016-02-01', 4591.18), ('2016-03-01', 4610.92), ('2016-04-01', 4639.05), ('2016-05-01', 4675.23),
  ('2016-06-01', 4691.59), ('2016-07-01', 4715.99), ('2016-08-01', 4736.74), ('2016-09-01', 4740.53),
  ('2016-10-01', 4752.86), ('2016-11-01', 4761.42), ('2016-12-01', 4775.7), ('2017-01-01', 4793.85),
  ('2017-02-01', 4809.67), ('2017-03-01', 4821.69), ('2017-04-01', 4828.44), ('2017-05-01', 4843.41),
  ('2017-06-01', 4832.27), ('2017-07-01', 4843.87), ('2017-08-01', 4853.07), ('2017-09-01', 4860.83),
  ('2017-10-01', 4881.25), ('2017-11-01', 4894.92), ('2017-12-01', 4916.46), ('2018-01-01', 4930.72),
  ('2018-02-01', 4946.5), ('2018-03-01', 4950.95), ('2018-04-01', 4961.84), ('2018-05-01', 4981.69),
  ('2018-06-01', 5044.46), ('2018-07-01', 5061.11), ('2018-08-01', 5056.56), ('2018-09-01', 5080.83),
  ('2018-10-01', 5103.69), ('2018-11-01', 5092.97), ('2018-12-01', 5100.61), ('2019-01-01', 5116.93),
  ('2019-02-01', 5138.93), ('2019-03-01', 5177.47), ('2019-04-01', 5206.98), ('2019-05-01', 5213.75),
  ('2019-06-01', 5214.27), ('2019-07-01', 5224.18), ('2019-08-01', 5229.93), ('2019-09-01', 5227.84),
  ('2019-10-01', 5233.07), ('2019-11-01', 5259.76), ('2019-12-01', 5320.25), ('2020-01-01', 5331.42),
  ('2020-02-01', 5344.75), ('2020-03-01', 5348.49), ('2020-04-01', 5331.91), ('2020-05-01', 5311.65),
  ('2020-06-01', 5325.46), ('2020-07-01', 5344.63), ('2020-08-01', 5357.46), ('2020-09-01', 5391.75),
  ('2020-10-01', 5438.12), ('2020-11-01', 5486.52), ('2020-12-01', 5560.59), ('2021-01-01', 5574.49),
  ('2021-02-01', 5622.43), ('2021-03-01', 5674.72), ('2021-04-01', 5692.31), ('2021-05-01', 5739.56),
  ('2021-06-01', 5769.98), ('2021-07-01', 5825.37), ('2021-08-01', 5876.05), ('2021-09-01', 5944.21),
  ('2021-10-01', 6018.51), ('2021-11-01', 6075.69), ('2021-12-01', 6120.04), ('2022-01-01', 6153.09),
  ('2022-02-01', 6215.24), ('2022-03-01', 6315.93), ('2022-04-01', 6382.88), ('2022-05-01', 6412.88),
  ('2022-06-01', 6455.85), ('2022-07-01', 6411.95), ('2022-08-01', 6388.87), ('2022-09-01', 6370.34),
  ('2022-10-01', 6407.93), ('2022-11-01', 6434.2), ('2022-12-01', 6474.09), ('2023-01-01', 6508.4),
  ('2023-02-01', 6563.07), ('2023-03-01', 6609.67), ('2023-04-01', 6649.99), ('2023-05-01', 6665.28),
  ('2023-06-01', 6659.95), ('2023-07-01', 6667.94), ('2023-08-01', 6683.28), ('2023-09-01', 6700.66),
  ('2023-10-01', 6716.74), ('2023-11-01', 6735.55), ('2023-12-01', 6773.27), ('2024-01-01', 6801.72),
  ('2024-02-01', 6858.17), ('2024-03-01', 6869.14), ('2024-04-01', 6895.24), ('2024-05-01', 6926.96),
  ('2024-06-01', 6941.51), ('2024-07-01', 6967.89), ('2024-08-01', 6966.5), ('2024-09-01', 6997.15),
  ('2024-10-01', 7036.33), ('2024-11-01', 7063.77), ('2024-12-01', 7100.5), ('2025-01-01', 7111.86),
  ('2025-02-01', 7205.03), ('2025-03-01', 7245.38), ('2025-04-01', 7276.54), ('2025-05-01', 7295.46),
  ('2025-06-01', 7312.97), ('2025-07-01', 7331.98), ('2025-08-01', 7323.91), ('2025-09-01', 7359.06),
  ('2025-10-01', 7365.68), ('2025-11-01', 7378.94), ('2025-12-01', 7403.29), ('2026-01-01', 7427.72),
  ('2026-02-01', 7479.71), ('2026-03-01', 7545.53), ('2026-04-01', 7596.09), ('2026-05-01', 7640.15),
  ('2026-06-01', 7652.37)
on conflict (mes) do update set
  numero_indice = excluded.numero_indice,
  atualizado_em = now();


-- Mês de referência da correção: o ÚLTIMO mês publicado, não a data de hoje.
-- O IPCA de um mês sai por volta do dia 10 do mês seguinte; tratar o mês
-- corrente como se já tivesse índice inventa correção que o IBGE não divulgou.
create or replace function public.ipca_mes_referencia()
returns date
language sql
stable
as $$ select max(mes) from public.ipca_indice $$;

-- Fator que traz um valor da data informada até o mês de referência.
-- Compra anterior ao início da série usa o primeiro índice disponível: subestima
-- a correção (e portanto a economia), o que é o erro seguro numa auditoria.
create or replace function public.ipca_fator(p_data date)
returns numeric
language sql
stable
as $$
  select (select numero_indice from public.ipca_indice order by mes desc limit 1)
       / coalesce(
           (select numero_indice from public.ipca_indice
             where mes <= date_trunc('month', p_data)::date
             order by mes desc limit 1),
           (select numero_indice from public.ipca_indice order by mes asc limit 1)
         )
$$;

grant select on public.ipca_indice to anon, authenticated;
grant execute on function public.ipca_mes_referencia() to anon, authenticated;
grant execute on function public.ipca_fator(date) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Benchmark por material
-- ---------------------------------------------------------------------
drop view if exists public.vw_auditoria_historico_material;
drop view if exists public.vw_auditoria_compras;
drop materialized view if exists public.mv_benchmark_material;

-- Grão do histórico: material + fornecedor + pedido — o MESMO da
-- mv_historico_pedidos, para os dois números da aplicação nunca discordarem.
-- Somar valor e quantidade antes de dividir é o que torna o preço unitário
-- imune à base de preço `por` do SAP, que varia entre pedidos.
create materialized view public.mv_benchmark_material as
with compras as (
  select
    p.material,
    p.fornecedor_codigo,
    p.doc_compra,
    max(p.txt_breve)                             as txt_breve,
    max(p.data_doc)                              as data_doc,
    sum(p.qtd_pedido)                            as qtd,
    sum(p.valor_em_brl)                          as valor,
    sum(p.valor_em_brl) / sum(p.qtd_pedido)      as preco_unit
  from public.sap_zl0132_po p
  -- Inclui entrega parcial (qtd_fornecida > 0), não só crf='x' — ver nota em
  -- criar_view_historico_pedidos.sql. O mesmo critério do lado 2026
  -- (vw_auditoria_compras), senão referência e compra usariam régua diferente.
  where (lower(coalesce(p.crf, '')) = 'x' or coalesce(p.qtd_fornecida, 0) > 0)
    and p.material is not null
    and p.data_doc is not null
    and p.data_doc < date '2026-01-01'
    and coalesce(p.qtd_pedido, 0) > 0
    and coalesce(p.valor_em_brl, 0) > 0
  group by p.material, p.fornecedor_codigo, p.doc_compra
),
-- Índice do mês de referência resolvido UMA vez. Chamar ipca_fator() por linha
-- custaria dois subselects em 60 mil registros a cada refresh.
ref as (
  select numero_indice as idx_ref from public.ipca_indice order by mes desc limit 1
),
-- Piso da série: compra anterior a out/2014 cai neste índice. Subestima a
-- correção — e portanto a economia —, que é o erro seguro numa auditoria.
piso as (
  select numero_indice as idx_piso from public.ipca_indice order by mes asc limit 1
),
corrigidas as (
  select
    c.*,
    (select idx_ref from ref) / coalesce(i.numero_indice, (select idx_piso from piso))
      as fator_ipca,
    c.preco_unit
      * ((select idx_ref from ref) / coalesce(i.numero_indice, (select idx_piso from piso)))
      as preco_corrigido
  from compras c
  left join public.ipca_indice i on i.mes = date_trunc('month', c.data_doc)::date
)
select
  material,
  max(txt_breve)                                        as txt_breve,
  count(*)                                              as n_compras,
  min(data_doc)                                         as primeira_compra,
  max(data_doc)                                         as ultima_compra,
  (percentile_cont(0.5)  within group (order by qtd))::numeric              as qtd_mediana,
  (percentile_cont(0.25) within group (order by preco_corrigido))::numeric  as ref_p25,
  (percentile_cont(0.5)  within group (order by preco_corrigido))::numeric  as ref_p50,
  (percentile_cont(0.75) within group (order by preco_corrigido))::numeric  as ref_p75,
  -- Dispersão no LOG do preço, não no preço: é a medida que trata "dobrou" e
  -- "caiu pela metade" como o mesmo desvio, e é ela que denuncia o código
  -- genérico (TRANSPORTE RODOVIÁRIO varia de R$ 0,93 a R$ 61.669 a unidade).
  coalesce(stddev_pop(ln(preco_corrigido)), 0)::numeric  as sd_log,
  case
    when count(*) >= 5 and coalesce(stddev_pop(ln(preco_corrigido)), 0) < 0.35 then 'Alta'
    when count(*) >= 3 and coalesce(stddev_pop(ln(preco_corrigido)), 0) < 0.80 then 'Média'
    else 'Baixa'
  end                                                    as confianca
from corrigidas
group by material;

create unique index if not exists mv_benchmark_material_uidx
  on public.mv_benchmark_material (material);

comment on materialized view public.mv_benchmark_material is
  'Referência de preço por material (mediana e P25/P75 do histórico anterior a 2026, corrigido pelo IPCA até o mês de referência), com grau de confiança derivado da dispersão.';


-- ---------------------------------------------------------------------
-- 3. Auditoria das compras de 2026
-- ---------------------------------------------------------------------
create or replace view public.vw_auditoria_compras as
with compras as (
  select
    p.material,
    max(p.txt_breve)                             as txt_breve,
    p.fornecedor_codigo                          as cod_forn,
    max(p.fornecedor_nome)                       as fornecedor,
    p.doc_compra,
    max(p.reqc)                                  as rm,
    max(p.grp_mercads)                           as grp_mercads,
    max(p.data_doc)                              as data_doc,
    max(coalesce(p.unidade_medida_pedido, p.ump_1)) as unidade,
    sum(p.qtd_pedido)                            as qtd,
    sum(coalesce(p.qtd_fornecida, 0))            as qtd_fornecida,
    sum(p.valor_em_brl)                          as valor,
    sum(p.valor_em_brl) / sum(p.qtd_pedido)      as preco_unit
  from public.sap_zl0132_po p
  where (lower(coalesce(p.crf, '')) = 'x' or coalesce(p.qtd_fornecida, 0) > 0)
    and p.material is not null
    and p.data_doc >= date '2026-01-01'
    and coalesce(p.qtd_pedido, 0) > 0
    and coalesce(p.valor_em_brl, 0) > 0
  group by p.material, p.fornecedor_codigo, p.doc_compra
)
select
  c.material,
  c.txt_breve,
  c.cod_forn,
  c.fornecedor,
  c.doc_compra,
  c.rm,
  c.grp_mercads,
  coalesce(nullif(trim(gm.denominacao2), ''), nullif(trim(gm.denominacao), '')) as grp_mercads_desc,
  case when c.material like '100000000%' then 'Projeto' else 'Consumo' end     as tipo_item,
  c.data_doc,
  c.unidade,
  c.qtd,
  c.valor,
  c.preco_unit,
  -- Entrega ainda não fechou: valor/quantidade da linha podem mudar até o
  -- pedido concluir. Marcado, não descontado — ver nota de topo do arquivo.
  (c.qtd_fornecida > 0 and c.qtd_fornecida < c.qtd)                            as pedido_parcial,
  b.n_compras,
  b.primeira_compra,
  b.ultima_compra,
  b.qtd_mediana,
  b.ref_p25,
  b.ref_p50,
  b.ref_p75,
  b.sd_log,
  -- Sem histórico do material, a confiança não é "Baixa" — é inexistente. São
  -- 45% do valor de 2026 e precisam de rótulo próprio, não podem ser
  -- confundidos com referência ruim.
  coalesce(b.confianca, 'Sem referência')                                      as confianca,
  case when b.ref_p50 is not null and b.ref_p50 > 0
       then c.preco_unit / b.ref_p50 - 1 end                                   as delta_pct,
  case when b.ref_p50 is not null
       then (c.preco_unit - b.ref_p50) * c.qtd end                             as delta_valor,
  case
    when b.material is null       then 'Sem referência'
    when c.preco_unit < b.ref_p25 then 'Bom'
    when c.preco_unit > b.ref_p75 then 'Atenção'
    else 'Na faixa'
  end                                                                          as veredito,
  -- Lote fora de [mediana/3, mediana*3]: preço unitário de lote grande cai por
  -- escala, não por negociação. Marcado, nunca descontado — normalizar exigiria
  -- uma curva de elasticidade que o dado não sustenta.
  case
    when b.qtd_mediana is null or b.qtd_mediana <= 0 then false
    else c.qtd > b.qtd_mediana * 3 or c.qtd < b.qtd_mediana / 3
  end                                                                          as lote_atipico,
  public.ipca_mes_referencia()                                                 as ipca_mes_referencia
from compras c
left join public.mv_benchmark_material b on b.material = c.material
left join public.cadastro_grupo_mercadoria gm on gm.codigo = c.grp_mercads;


-- Drill-down: as compras passadas que formaram a mediana. Restrita aos
-- materiais comprados em 2026 para não virar dump da base inteira.
create or replace view public.vw_auditoria_historico_material as
with mats_2026 as (
  select distinct p.material
  from public.sap_zl0132_po p
  where (lower(coalesce(p.crf, '')) = 'x' or coalesce(p.qtd_fornecida, 0) > 0)
    and p.material is not null
    and p.data_doc >= date '2026-01-01'
),
h as (
  select
    p.material,
    p.doc_compra,
    p.fornecedor_codigo,
    max(p.fornecedor_nome)                        as fornecedor,
    max(p.data_doc)                               as data_doc,
    sum(p.qtd_pedido)                             as qtd,
    sum(p.valor_em_brl)                           as valor,
    sum(p.valor_em_brl) / sum(p.qtd_pedido)       as preco_unit
  from public.sap_zl0132_po p
  join mats_2026 m on m.material = p.material
  where (lower(coalesce(p.crf, '')) = 'x' or coalesce(p.qtd_fornecida, 0) > 0)
    and p.data_doc is not null
    and p.data_doc < date '2026-01-01'
    and coalesce(p.qtd_pedido, 0) > 0
    and coalesce(p.valor_em_brl, 0) > 0
  group by p.material, p.doc_compra, p.fornecedor_codigo
),
ref as (select numero_indice as idx_ref from public.ipca_indice order by mes desc limit 1),
piso as (select numero_indice as idx_piso from public.ipca_indice order by mes asc limit 1)
select
  h.material,
  h.doc_compra,
  h.fornecedor_codigo as cod_forn,
  h.fornecedor,
  h.data_doc,
  h.qtd,
  h.valor,
  h.preco_unit,
  (select idx_ref from ref) / coalesce(i.numero_indice, (select idx_piso from piso))
    as fator_ipca,
  h.preco_unit
    * ((select idx_ref from ref) / coalesce(i.numero_indice, (select idx_piso from piso)))
    as preco_corrigido
from h
left join public.ipca_indice i on i.mes = date_trunc('month', h.data_doc)::date;


grant select on public.mv_benchmark_material to anon, authenticated;
grant select on public.vw_auditoria_compras to anon, authenticated;
grant select on public.vw_auditoria_historico_material to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Recálculo após importação de pedidos ou atualização do IPCA
-- ---------------------------------------------------------------------
create or replace function public.refresh_benchmark_material()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    refresh materialized view concurrently public.mv_benchmark_material;
  exception when others then
    refresh materialized view public.mv_benchmark_material;
  end;
end;
$$;

grant execute on function public.refresh_benchmark_material() to anon, authenticated;

refresh materialized view public.mv_benchmark_material;
