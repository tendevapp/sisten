-- =====================================================================
-- mv_material_sinais — sinais exibidos ao lado de cada material na busca
-- do Catálogo SAP: saldo em estoque, demanda dos últimos 12 meses, RM em
-- aberto e pedido a caminho.
--
-- Consumida pela função `buscar_materiais` (STABLE) e recalculada pela RPC
-- `refresh_material_sinais`, chamada pelo cliente após toda importação SAP
-- (ver localDb.ts). O refresh é CONCURRENTLY, o que EXIGE o índice único
-- em material_code definido no fim deste arquivo — sem ele o refresh falha.
--
-- Histórico da CTE `comprado`: até 30/08/2026 ela lia a tabela `pedidos`,
-- que deixou de ser alimentada na reestruturação de nomenclatura do banco
-- (27/08/2026) e congelou em 14/07/2026 com 1.047 linhas. Medido antes da
-- correção: dos 326 sinais exibidos, 205 eram fantasmas (PO que já não
-- estava aberto), 40 apontavam outro PO, e 164 materiais com PO aberto de
-- verdade não mostravam sinal nenhum.
--
-- Os três filtros da CTE existem para não ressuscitar pedido zumbi: sem
-- eles a sap_zl0132_po devolve 2.333 linhas "em aberto" com remessa
-- chegando a 2015, porque o SAP não fecha formalmente essas linhas.
-- O corte `data_rc >= 2026-01-01` é o MESMO que o cliente aplica a este
-- dataset no sync (localDb.ts, tarefas 'vw_sap_pedidos_enriquecidos' e
-- 'sap_zl0132_po'); se aquele mudar, este deve mudar junto, senão o sinal
-- passa a prometer um PO que o cliente não tem em cache.
--
-- Matview não aceita CREATE OR REPLACE: alterar exige DROP + CREATE, e
-- recriar o índice único e os GRANTs junto, na mesma transação.
-- =====================================================================

drop materialized view if exists public.mv_material_sinais;

create materialized view public.mv_material_sinais as
with saldo as (
  select material,
         sum(quantidade) as qtd_estoque,
         array_agg(distinct deposito) as depositos
  from public.sap_zl0024_stk
  -- 0006/0090/0105 não são depósitos de giro da obra.
  where quantidade > 0
    and deposito <> all (array['0006'::text, '0090'::text, '0105'::text])
  group by material
),
demanda as (
  select material,
         count(*)::integer as rms_12m,
         max(data_da_solicitacao) as ultima_rm,
         array_agg(distinct area_solicitante) filter (where area_solicitante is not null) as areas,
         count(*) filter (where pedido is null)::integer as rms_sem_pedido
  from public.vw_demandas
  where data_da_solicitacao > current_date - '1 year'::interval
    and coalesce(eliminado, false) = false
  group by material
),
rm_aberta_detalhe as (
  select distinct on (material) material,
         requisicao_de_compra as rm_aberta,
         qtd_solicitada as qtd_rm_aberta
  from public.vw_demandas
  where pedido is null
    and data_da_solicitacao > current_date - '1 year'::interval
    and coalesce(eliminado, false) = false
  order by material, data_da_solicitacao
),
comprado as (
  -- Ordenação ascendente de propósito: havendo mais de um PO aberto para o
  -- mesmo material, o sinal mostra a PRÓXIMA chegada.
  select distinct on (p.material) p.material,
         p.doc_compra as pedido_aberto,
         (p.qtd_pedido - coalesce(p.qtd_fornecida, 0::numeric)) as qtd_pedido_aberto,
         p.dt_remessa as chega_em
  from public.sap_zl0132_po p
  where (p.qtd_fornecida is null or p.qtd_fornecida < p.qtd_pedido)
    and p.data_migo is null                        -- ainda não recebido
    and coalesce(p.eflag_e, '') <> 'L'             -- não eliminado
    and p.data_rc >= '2026-01-01'::date            -- mesmo horizonte do sync do cliente
  order by p.material, p.dt_remessa
)
select m.material_code,
       s.qtd_estoque, s.depositos,
       d.rms_12m, d.ultima_rm, d.areas, d.rms_sem_pedido,
       r.rm_aberta, r.qtd_rm_aberta,
       c.pedido_aberto, c.qtd_pedido_aberto, c.chega_em
from public.sap_zl0169_162_catalogo m
left join saldo s             on s.material = m.material_code
left join demanda d           on d.material = m.material_code
left join rm_aberta_detalhe r on r.material = m.material_code
left join comprado c          on c.material = m.material_code
where m.is_active;

-- Obrigatório para o REFRESH ... CONCURRENTLY de refresh_material_sinais.
create unique index mv_material_sinais_code
  on public.mv_material_sinais using btree (material_code);

-- Reproduz a ACL de produção: anon tem todos os privilégios MENOS SELECT.
grant all on table public.mv_material_sinais to postgres, anon, authenticated, service_role;
revoke select on table public.mv_material_sinais from anon;
