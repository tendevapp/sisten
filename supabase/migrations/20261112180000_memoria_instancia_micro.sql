-- Memória da instância Micro (2 vCPU, ~950 MB): menos picos de RAM por
-- consulta e menos leitura do catálogo inteiro.
--
-- Medido em 12/11/2026: ~590 MB de swap em uso e ~34 GB lidos do swap em 51 h,
-- com a CPU média em 4%. O que empurra para o swap são os picos de memória das
-- consultas pesadas e a leitura de tabelas grandes que expulsam o cache.

-- ---------------------------------------------------------------------------
-- 1) work_mem por função: 64/32 MB → 16 MB
-- ---------------------------------------------------------------------------
-- Com hash_mem_multiplier = 2, cada nó de hash podia usar o dobro do work_mem:
-- uma única consulta chegava a 128–256 MB. EXPLAIN ANALYZE a 64 MB mostrou que
-- só mv_historico_pedidos passa de 16 MB (hash de 93 MB); as demais usam até
-- 14 MB. Acima do teto a consulta usa arquivo temporário em disco — o saldo
-- de IO do disco está em 99%, a RAM é que falta.
alter function public.refresh_sap_requisicoes_po() set work_mem = '16MB';
alter function public.refresh_historico_pedidos() set work_mem = '16MB';
alter function public.refresh_material_sinais() set work_mem = '16MB';
alter function public.buscar_materiais(text, text, integer, integer, boolean) set work_mem = '16MB';
alter function public.buscar_materiais_catalogo(text[], text, text, text[], integer, integer, boolean, text, text, text, text) set work_mem = '16MB';
alter function public.obter_maiores_codigos_catalogo set work_mem = '16MB';

-- ---------------------------------------------------------------------------
-- 2) mv_material_sinais só com material que tem sinal
-- ---------------------------------------------------------------------------
-- Partia do catálogo inteiro (454 mil linhas, leitura sequencial de 354 MB a
-- cada recálculo) com LEFT JOIN nos sinais — e 451 mil linhas saíam com tudo
-- nulo. Agora parte dos códigos que têm saldo, demanda, RM aberta ou pedido
-- (~3 mil) e confere o catálogo pelo índice do código. Para buscar_materiais,
-- que faz LEFT JOIN nesta MV, material sem linha e material com linha toda
-- nula dão o mesmo resultado.
drop materialized view if exists public.mv_material_sinais;

create materialized view public.mv_material_sinais as
with saldo as (
  select sap_zl0024_stk.material,
         sum(sap_zl0024_stk.quantidade) as qtd_estoque,
         array_agg(distinct sap_zl0024_stk.deposito) as depositos
    from sap_zl0024_stk
   where sap_zl0024_stk.quantidade > 0::numeric
     and sap_zl0024_stk.deposito <> all (array['0006'::text, '0090'::text, '0105'::text])
   group by sap_zl0024_stk.material
), demanda as (
  select vw_demandas.material,
         count(*)::integer as rms_12m,
         max(vw_demandas.data_da_solicitacao) as ultima_rm,
         array_agg(distinct vw_demandas.area_solicitante) filter (where vw_demandas.area_solicitante is not null) as areas,
         (count(*) filter (where vw_demandas.pedido is null))::integer as rms_sem_pedido
    from vw_demandas
   where vw_demandas.data_da_solicitacao > (current_date - '1 year'::interval)
     and coalesce(vw_demandas.eliminado, false) = false
   group by vw_demandas.material
), rm_aberta_detalhe as (
  select distinct on (vw_demandas.material) vw_demandas.material,
         vw_demandas.requisicao_de_compra as rm_aberta,
         vw_demandas.qtd_solicitada as qtd_rm_aberta
    from vw_demandas
   where vw_demandas.pedido is null
     and vw_demandas.data_da_solicitacao > (current_date - '1 year'::interval)
     and coalesce(vw_demandas.eliminado, false) = false
   order by vw_demandas.material, vw_demandas.data_da_solicitacao
), comprado as (
  select distinct on (p.material) p.material,
         p.doc_compra as pedido_aberto,
         p.qtd_pedido - coalesce(p.qtd_fornecida, 0::numeric) as qtd_pedido_aberto,
         p.dt_remessa as chega_em
    from sap_zl0132_po p
   where (p.qtd_fornecida is null or p.qtd_fornecida < p.qtd_pedido)
     and p.data_migo is null
     and coalesce(p.eflag_e, ''::text) <> 'L'::text
     and p.data_rc >= '2026-01-01'::date
   order by p.material, p.dt_remessa
), codigos as (
  select material from saldo
  union select material from demanda
  union select material from rm_aberta_detalhe
  union select material from comprado
)
select m.material_code,
       s.qtd_estoque,
       s.depositos,
       d.rms_12m,
       d.ultima_rm,
       d.areas,
       d.rms_sem_pedido,
       r.rm_aberta,
       r.qtd_rm_aberta,
       c.pedido_aberto,
       c.qtd_pedido_aberto,
       c.chega_em
  from codigos k
  join sap_zl0169_162_catalogo m on m.material_code = k.material
  left join saldo s on s.material = m.material_code
  left join demanda d on d.material = m.material_code
  left join rm_aberta_detalhe r on r.material = m.material_code
  left join comprado c on c.material = m.material_code
 where m.is_active;

create unique index mv_material_sinais_code on public.mv_material_sinais using btree (material_code);

-- Mesmos privilégios de antes para authenticated/service_role (MAINTAIN é o
-- que deixa refresh_material_sinais, que roda como o usuário, recalcular);
-- anon fica sem nada.
revoke all on public.mv_material_sinais from anon;
grant select, insert, update, delete, truncate, references, trigger, maintain
  on public.mv_material_sinais to authenticated, service_role;

analyze public.mv_material_sinais;

-- ---------------------------------------------------------------------------
-- 3) Estatísticas que nunca foram coletadas
-- ---------------------------------------------------------------------------
analyze public.sup_fornecedores_cidades;
analyze public.ops_eventos_uso;
analyze public.sap_zl0132_po;
