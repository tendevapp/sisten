-- =====================================================================
-- Análise de Movimentações de Estoque (SAP MB51)
--
-- Três views que sustentam as abas da página /almoxarifado/movimentacoes:
--   1. vw_mb51_classificado    — MB51 + descrição e categoria funcional do TMV
--   2. vw_estoque_camadas_fifo — camadas de entrada casadas por FIFO
--   3. vw_estoque_giro         — giro, cobertura e estoque morto por material
--
-- CONTEXTO OPERACIONAL (define a leitura de tudo abaixo): a fábrica ficou
-- parada de 2023 até a reabertura em 2026. A MB51 só cobre o período pós
-- reabertura. Portanto o saldo que existe sem entrada dentro da janela não
-- é "idade desconhecida" — é estoque que atravessou a parada, com idade real
-- de no mínimo ~3 anos. As views marcam esse saldo com `legado = true` em vez
-- de jogá-lo numa faixa etária qualquer, e o material sem nenhum consumo
-- desde a reabertura é sinalizado como candidato a obsolescência.
--
-- Por que a classificação funcional do TMV é obrigatória: o TMV 311
-- (transferência interna) responde por ~46% das linhas e soma exatamente
-- zero — cada transferência gera um par negativo/positivo. Somar movimento
-- "pelo sinal da quantidade" contava esse par como entrada E saída reais,
-- inflando ambos os lados em milhões sem que nada tivesse entrado ou saído
-- do almoxarifado. Toda agregação de fluxo usa `movimenta_estoque`.
--
-- security_invoker = on em todas: sem isso a view roda com privilégio do
-- dono e ignora o RLS de `mb51_mov_estoque` e `estoque`, expondo custo e
-- consumo por material sem login (ver Security Advisor, security_definer_view).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. vw_mb51_classificado
--    Left join com tipo_mov_estoque + categoria funcional do movimento.
--    A descrição cai para o texto do próprio extrato quando o TMV ainda
--    não existe na tabela de referência (extrato mais novo que o cadastro).
-- ---------------------------------------------------------------------
create or replace view public.vw_mb51_classificado as
select
  m.id,
  m.centro,
  m.deposito,
  m.doc_material,
  m.item,
  m.pedido,
  m.referencia,
  m.material,
  m.texto_breve_material,
  m.qtd_um_registro,
  m.unid_medida_basica,
  m.montante_mi,
  m.moeda,
  m.data_lancamento,
  m.data_documento,
  m.data_entrada,
  m.tipo_movimento,
  m.fornecedor,
  m.razao_social_fornecedor,
  m.nome_usuario,
  m.elemento_pep,
  m.chave_unica,
  coalesce(nullif(btrim(t.descricao), ''), nullif(btrim(m.txt_tipo_movimento), ''), 'Não classificado')
    as descricao_tipo_movimento,

  -- Categoria funcional. Segue a convenção SAP de que o TMV par é o estorno
  -- do ímpar imediatamente anterior (101/102, 221/222, 261/262...).
  case
    when m.tipo_movimento in ('301','302','303','304','305','306','309','310','311','312',
                              '313','314','315','316','321','322','323','324','325','326',
                              '341','342','343','344','349','350','351','352')
      then 'transferencia'
    when m.tipo_movimento in ('101','131')                    then 'entrada_compra'
    when m.tipo_movimento in ('102','132')                    then 'estorno_entrada'
    when m.tipo_movimento in ('501','503','505','511','521','531','571')
                                                              then 'entrada_sem_pedido'
    when m.tipo_movimento in ('502','504','506','512','522','532','572')
                                                              then 'estorno_entrada'
    when m.tipo_movimento in ('201','221','231','241','251','261','281','291')
                                                              then 'consumo'
    when m.tipo_movimento in ('202','222','232','242','252','262','282','292')
                                                              then 'estorno_consumo'
    when m.tipo_movimento in ('122','124','161')              then 'devolucao_fornecedor'
    when m.tipo_movimento in ('123','125','162')              then 'estorno_devolucao'
    when m.tipo_movimento in ('601','621','631','641','643','645','647')
                                                              then 'saida_remessa'
    when m.tipo_movimento in ('602','622','632','642','644','646','648')
                                                              then 'estorno_remessa'
    when m.tipo_movimento in ('551','553','555')              then 'baixa_sucata'
    when m.tipo_movimento in ('552','554','556')              then 'estorno_sucata'
    when m.tipo_movimento in ('701','703','707','711','713','715','717')
                                                              then 'ajuste_inventario'
    when m.tipo_movimento in ('702','704','708','712','714','716','718')
                                                              then 'ajuste_inventario'
    else 'outros'
  end as categoria,

  -- Falso apenas para transferência interna, que troca o material de lugar
  -- sem alterar o saldo total do almoxarifado.
  (m.tipo_movimento not in ('301','302','303','304','305','306','309','310','311','312',
                            '313','314','315','316','321','322','323','324','325','326',
                            '341','342','343','344','349','350','351','352'))
    as movimenta_estoque,

  case
    when m.qtd_um_registro > 0 then 'entrada'
    when m.qtd_um_registro < 0 then 'saida'
    else 'neutro'
  end as sinal,

  -- Compra direta para projeto: o material vai do fornecedor para a obra sem
  -- passar pelo almoxarifado, então não tem depósito. Auditoria de 2026-08-15
  -- contra o ZL0024: são 810 entradas + 122 estornos, 16 materiais, 97% com
  -- elemento PEP, R$ 7,6 mi — e NENHUM desses materiais aparece no ZL0024, as
  -- duas populações são disjuntas.
  --
  -- Continuam contando como entrada no fluxo (é compra real), mas não podem
  -- gerar camada de estoque: sem esta exclusão o FIFO inventava 530 mil
  -- unidades e R$ 851 mil de "valor parado" que não existem em lugar nenhum.
  (m.deposito is not null) as entra_almoxarifado
from public.mb51_mov_estoque m
left join public.tipo_mov_estoque t on t.tmv = btrim(m.tipo_movimento);

alter view public.vw_mb51_classificado set (security_invoker = on);
grant select on public.vw_mb51_classificado to authenticated;
revoke all on public.vw_mb51_classificado from anon;


-- ---------------------------------------------------------------------
-- 2. vw_estoque_camadas_fifo
--    Casa cada camada de entrada contra as saídas do mesmo material por
--    ordem cronológica (FIFO), usando somas cumulativas em vez de laço:
--    a camada ocupa o intervalo [cum_antes, cum_ate) na "régua" de
--    quantidade do material, e a saída acumulada até um dado momento diz
--    quanto dessa régua já foi consumido.
--
--    Camada de abertura sintética: como a MB51 começa na reabertura, o
--    saldo anterior à parada não tem entrada registrada. Ele é reconstruído
--    como `saldo_atual − movimento_líquido_da_janela` e entra como primeira
--    camada, sem data e com legado = true. Sem ela o FIFO consumiria
--    camadas novas para pagar saídas de material antigo, e a idade do
--    estoque sairia muito menor do que é.
-- ---------------------------------------------------------------------
create or replace view public.vw_estoque_camadas_fifo as
with base as (
  select material, data_lancamento, id, qtd_um_registro as q, montante_mi
  from public.vw_mb51_classificado
  where material is not null
    and qtd_um_registro is not null
    and movimenta_estoque
    -- Compra direta para projeto nunca entrou no almoxarifado: incluí-la aqui
    -- criava camada de estoque para material que o ZL0024 corretamente não
    -- mostra. Ver comentário em vw_mb51_classificado.entra_almoxarifado.
    and entra_almoxarifado
),
saldo as (
  select material, sum(quantidade) as saldo_atual, avg(nullif(preco_medio, 0)) as preco_medio
  from public.estoque
  group by 1
),
liquido as (
  select material, sum(q) as mov_liq from base group by 1
),
-- Abertura negativa significa que a foto de estoque e a janela da MB51 não
-- conciliam (saída de material que a foto não mostra). Fica em zero aqui e é
-- reportada à parte pelo painel de conciliação, em vez de virar camada falsa.
abertura as (
  select
    coalesce(s.material, l.material) as material,
    greatest(coalesce(s.saldo_atual, 0) - coalesce(l.mov_liq, 0), 0) as q,
    s.preco_medio
  from saldo s
  full join liquido l on l.material = s.material
),
camadas as (
  select material, null::date as data_entrada, 0::bigint as ord, q,
         preco_medio as preco_unit, true as legado
  from abertura
  where q > 0.001
  union all
  select material, data_lancamento, id, q,
         case when q <> 0 then abs(montante_mi / q) else null end, false
  from base
  where q > 0
),
ent as (
  select *,
    coalesce(sum(q) over (partition by material order by legado desc, data_entrada, ord
      rows between unbounded preceding and 1 preceding), 0) as cum_antes,
    sum(q) over (partition by material order by legado desc, data_entrada, ord) as cum_ate
  from camadas
),
sai as (
  select material, data_lancamento as d_sai,
    coalesce(sum(-q) over (partition by material order by data_lancamento, id
      rows between unbounded preceding and 1 preceding), 0) as cum_antes,
    sum(-q) over (partition by material order by data_lancamento, id) as cum_ate
  from base
  where q < 0
),
total_saida as (
  select material, sum(-q) as ts from base where q < 0 group by 1
),
-- Data em que a camada terminou de ser consumida: a primeira saída cuja soma
-- acumulada alcança o fim do intervalo da camada.
consumo as (
  select e.material, e.data_entrada, e.ord,
         min(s.d_sai) filter (where s.cum_ate >= e.cum_ate) as data_consumo_total
  from ent e
  join sai s on s.material = e.material and s.cum_ate > e.cum_antes
  group by e.material, e.data_entrada, e.ord
)
select
  e.material,
  e.data_entrada,
  e.legado,
  e.q                                                    as qtd_entrada,
  e.preco_unit,
  greatest(least(e.q, e.cum_ate - coalesce(t.ts, 0)), 0) as qtd_remanescente,
  least(e.q, greatest(coalesce(t.ts, 0) - e.cum_antes, 0)) as qtd_consumida,
  round((greatest(least(e.q, e.cum_ate - coalesce(t.ts, 0)), 0) * coalesce(e.preco_unit, 0))::numeric, 2)
    as valor_remanescente,
  c.data_consumo_total,

  -- Permanência em estoque: da entrada até o consumo total da camada.
  -- Só existe para camada com data de entrada conhecida (não legado).
  case
    when e.legado or c.data_consumo_total is null or e.data_entrada is null then null
    else c.data_consumo_total - e.data_entrada
  end as dias_permanencia,

  -- Idade da parcela ainda em estoque. Null para legado: a MB51 não sabe
  -- quando aquilo entrou, e chutar uma idade seria inventar precisão.
  case
    when e.legado or e.data_entrada is null then null
    else CURRENT_DATE - e.data_entrada
  end as dias_em_estoque,

  case
    when e.legado                                    then 'legado_pre_reabertura'
    when c.data_consumo_total is null                then 'em_estoque'
    when e.data_entrada is null                      then 'indeterminado'
    when c.data_consumo_total - e.data_entrada < 0   then 'consumo_saldo_anterior'
    when c.data_consumo_total - e.data_entrada <= 7  then 'cross_dock'
    when c.data_consumo_total - e.data_entrada <= 90 then 'saudavel'
    else 'antecipada'
  end as classe_permanencia
from ent e
left join total_saida t on t.material = e.material
left join consumo c on c.material = e.material
  and c.ord = e.ord
  and c.data_entrada is not distinct from e.data_entrada;

alter view public.vw_estoque_camadas_fifo set (security_invoker = on);
grant select on public.vw_estoque_camadas_fifo to authenticated;
revoke all on public.vw_estoque_camadas_fifo from anon;


-- ---------------------------------------------------------------------
-- 3. vw_estoque_giro
--    Um registro por material: consumo na janela, cobertura, giro e os
--    sinalizadores de estoque morto / legado.
--
--    A janela é medida pela própria MB51 (primeira à última data de
--    lançamento), não por uma constante — se um extrato mais antigo for
--    importado depois, as taxas se ajustam sozinhas.
-- ---------------------------------------------------------------------
create or replace view public.vw_estoque_giro as
with janela as (
  select
    min(data_lancamento) as inicio,
    max(data_lancamento) as fim,
    greatest(max(data_lancamento) - min(data_lancamento), 1) as dias
  from public.mb51_mov_estoque
),
consumo as (
  select
    material,
    sum(case when categoria = 'consumo' then -qtd_um_registro else 0 end)
      - sum(case when categoria = 'estorno_consumo' then qtd_um_registro else 0 end) as qtd_consumida,
    sum(case when categoria = 'consumo' then abs(montante_mi) else 0 end)
      - sum(case when categoria = 'estorno_consumo' then abs(montante_mi) else 0 end) as valor_consumido,
    count(*) filter (where categoria = 'consumo') as eventos_consumo
  from public.vw_mb51_classificado
  where material is not null
  group by 1
),
entrada as (
  select
    material,
    sum(case when categoria in ('entrada_compra','entrada_sem_pedido') then qtd_um_registro else 0 end)
      as qtd_recebida,
    max(data_lancamento) filter (where categoria = 'entrada_compra') as ultima_entrada
  from public.vw_mb51_classificado
  where material is not null
  group by 1
),
movimento as (
  select material, max(data_lancamento) as ultima_movimentacao
  from public.vw_mb51_classificado
  where material is not null and movimenta_estoque
  group by 1
),
posicao as (
  select
    material,
    max(txt_breve_material)  as descricao,
    max(grupo_mercadorias)   as grupo_mercadorias,
    max(tipo_material)       as tipo_material,
    max(umb)                 as umb,
    sum(quantidade)          as saldo_atual,
    sum(valor_total)         as valor_estoque
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
  j.inicio                                   as janela_inicio,
  j.fim                                      as janela_fim,
  j.dias                                     as janela_dias,
  coalesce(c.qtd_consumida, 0)               as qtd_consumida,
  coalesce(c.valor_consumido, 0)             as valor_consumido,
  coalesce(c.eventos_consumo, 0)             as eventos_consumo,
  coalesce(e.qtd_recebida, 0)                as qtd_recebida,
  e.ultima_entrada,
  mv.ultima_movimentacao,
  case when mv.ultima_movimentacao is null then null
       else CURRENT_DATE - mv.ultima_movimentacao end as dias_sem_movimento,

  -- Consumo médio diário na janela.
  round((coalesce(c.qtd_consumida, 0) / j.dias)::numeric, 4) as consumo_diario,

  -- Dias de cobertura: quanto o saldo atual dura no ritmo da janela.
  -- Null quando não houve consumo — cobertura infinita não é um número, e
  -- devolver um valor gigante faria a ordenação mentir.
  case
    when coalesce(c.qtd_consumida, 0) <= 0 or p.saldo_atual is null or p.saldo_atual <= 0 then null
    else round((p.saldo_atual / (c.qtd_consumida / j.dias))::numeric, 1)
  end as cobertura_dias,

  -- Giro anualizado: consumo projetado para 365 dias sobre o saldo atual.
  case
    when p.saldo_atual is null or p.saldo_atual <= 0 or coalesce(c.qtd_consumida, 0) <= 0 then null
    else round(((c.qtd_consumida * (365.0 / j.dias)) / p.saldo_atual)::numeric, 3)
  end as giro_anualizado,

  -- Nenhum consumo desde a reabertura da fábrica. Com a parada de 2023–2026
  -- no retrovisor, isto é candidato forte a obsolescência, não apenas
  -- "item de baixo giro".
  (coalesce(c.qtd_consumida, 0) <= 0 and coalesce(p.saldo_atual, 0) > 0) as sem_consumo_na_janela,

  -- Saldo em estoque sem nenhuma movimentação registrada desde a reabertura:
  -- o material atravessou a parada e não foi tocado desde então.
  (mv.ultima_movimentacao is null and coalesce(p.saldo_atual, 0) > 0) as legado_intocado
from posicao p
cross join janela j
left join consumo  c  on c.material  = p.material
left join entrada  e  on e.material  = p.material
left join movimento mv on mv.material = p.material;

alter view public.vw_estoque_giro set (security_invoker = on);
grant select on public.vw_estoque_giro to authenticated;
revoke all on public.vw_estoque_giro from anon;
