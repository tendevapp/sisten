-- =====================================================================
-- Relatório Requisição no Balcão × MB51: desempenho
-- =====================================================================
-- Medido em 11/11 (68.836 linhas na MB51, todas de 2026): ~4 s por chamada, e
-- a tela pede 3 páginas (PostgREST corta em 1.000), cada uma recalculando.
--   * O cruzamento com a MB51 usava `ltrim(trim(m.material), '0')`, que
--     impede o índice de material: 964 ms. Os códigos já chegam normalizados
--     nas duas pontas (0 divergentes na MB51 e nos itens) — comparação direta:
--     44 ms.
--   * O log de alterações era lido por ação sem índice (320 ms).
-- A lógica de conferência não muda.

create index if not exists idx_alm_req_balcao_alteracoes_acao_req
  on public.alm_req_balcao_alteracoes (acao, requisicao_id, created_at);
create index if not exists idx_mb51_mov_material_deposito_tipo
  on public.sap_mb51_mov (material, deposito, tipo_movimento);


create or replace function public.alm_rqb_auditoria_mb51(
  p_material text default null,
  p_de date default null,
  p_ate date default null,
  p_base text default 'exportacao'
)
returns table (
  requisicao_id uuid,
  codigo text,
  data_criacao date,
  criado_em timestamptz,
  status text,
  exportacao_id uuid,
  exportada_em timestamptz,
  data_exportacao date,
  arquivo text,
  doc_sap text,
  colaborador text,
  tipo_movimento text,
  item_id uuid,
  ordem integer,
  material text,
  descricao text,
  unidade text,
  quantidade numeric,
  deposito text,
  deposito_destino text,
  pep text,
  item_doc_sap text,
  mb51_status text,
  conferido_por text,
  mb51_coberto numeric,
  mb51_qtd_dia numeric,
  esperado_dia numeric,
  mb51_docs text,
  outra_data text,
  mb51_antes text,
  exportacoes_qtd integer,
  exportacoes text,
  reexportada_sem_reabrir boolean,
  mb51_ate date
)
language sql
stable
security invoker
set search_path = public
as $$
with mb_max as (
  select max(data_lancamento) as d from public.sap_mb51_mov
),
base as (
  select
    r.id as rid, r.codigo, r.data, r.created_at, r.exportacao_id, r.pendente_confirmacao, r.doc_sap,
    r.colaborador_nome, r.tipo_movimento,
    e.created_at as exp_em,
    (e.created_at at time zone 'America/Sao_Paulo')::date as dexp,
    e.arquivo,
    i.id as iid, i.ordem, ltrim(trim(i.material), '0') as material, i.descricao, i.unidade, i.quantidade,
    coalesce(nullif(trim(i.deposito), ''), r.deposito_origem) as dep,
    case when r.tipo_movimento = 'transferencia'
         then coalesce(nullif(trim(i.deposito_destino), ''), r.deposito_destino) end as dep_dest,
    case when r.tipo_movimento = 'transferencia' then null
         else coalesce(nullif(trim(i.aplicacao_pep), ''), r.aplicacao_pep) end as pep,
    nullif(trim(i.doc_sap), '') as item_doc,
    case when r.tipo_movimento = 'transferencia' then 'T' else 'S' end as kind
  from public.alm_req_balcao r
  join public.alm_req_balcao_itens i on i.requisicao_id = r.id
  left join public.alm_req_balcao_exportacoes e on e.id = r.exportacao_id
  where not coalesce(r.excluido, false)
    and (p_material is null or ltrim(trim(i.material), '0') = ltrim(trim(p_material), '0'))
),
expo as (
  select * from base where exportacao_id is not null
),
-- Histórico de exportações/reaberturas pelo log.
logexp as (
  select l.requisicao_id as rid, l.created_at, (l.created_at at time zone 'America/Sao_Paulo')::date as d, l.resumo
  from public.alm_req_balcao_alteracoes l
  where l.acao = 'exportacao' and l.requisicao_id in (select rid from base)
),
logreab as (
  select l.requisicao_id as rid, l.created_at
  from public.alm_req_balcao_alteracoes l
  where l.acao = 'reabertura' and l.requisicao_id in (select rid from base)
),
hist as (
  select rid, count(*)::int as n,
         string_agg(to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                    || coalesce(' — ' || substring(resumo from 'em (.*)\.$'), ''), '; ' order by created_at) as txt
  from logexp group by rid
),
dupla as (
  select distinct e.rid
  from logexp e
  join logexp e2 on e2.rid = e.rid and e2.created_at > e.created_at
  where not exists (
    select 1 from logreab r where r.rid = e.rid and r.created_at between e.created_at and e2.created_at
  )
),
-- Linhas da MB51 que interessam (material + depósito das requisições exportadas).
chaves as (
  select distinct material, dep, kind from expo
),
mbl as (
  select c.material, c.dep, c.kind, m.data_lancamento as d, m.doc_material,
         case
           when c.kind = 'S' and m.tipo_movimento in ('201', '221', '241') and m.qtd_um_registro < 0 then -m.qtd_um_registro
           when c.kind = 'S' and m.tipo_movimento in ('202', '222', '242') and m.qtd_um_registro > 0 then -m.qtd_um_registro
           when c.kind = 'T' and m.tipo_movimento = '311' and m.qtd_um_registro < 0 then -m.qtd_um_registro
           when c.kind = 'T' and m.tipo_movimento = '312' and m.qtd_um_registro > 0 then -m.qtd_um_registro
           else 0
         end as qtd
  from chaves c
  join public.sap_mb51_mov m
    on m.material = c.material
   and m.deposito = c.dep
   and ((c.kind = 'S' and m.tipo_movimento in ('201', '202', '221', '222', '241', '242'))
     or (c.kind = 'T' and m.tipo_movimento in ('311', '312')))
),
mbd as (
  select material, dep, kind, d, sum(qtd) as qtd, string_agg(distinct doc_material, ', ') as docs
  from mbl group by 1, 2, 3, 4
),
-- 1. Por documento.
pordoc as (
  select x.iid, min(m.d) as d, least(x.quantidade, sum(m.qtd)) as coberto, string_agg(distinct m.doc_material, ', ') as docs
  from expo x
  join mbl m on m.doc_material = x.item_doc and m.material = x.material and m.dep = x.dep and m.kind = x.kind
  where x.item_doc is not null
  group by x.iid, x.quantidade
  having sum(m.qtd) > 0
),
reservado as (
  select x.material, x.dep, x.kind, p.d, sum(p.coberto) as q
  from pordoc p join expo x on x.iid = p.iid
  group by 1, 2, 3, 4
),
pool as (
  select md.material, md.dep, md.kind, md.d, md.qtd - coalesce(rs.q, 0) as qtd, md.docs
  from mbd md
  left join reservado rs on rs.material = md.material and rs.dep = md.dep and rs.kind = md.kind and rs.d = md.d
),
-- 2. Pelo dia da exportação vigente (só quem não fechou por documento).
semdoc as (
  select x.* from expo x where not exists (select 1 from pordoc p where p.iid = x.iid and p.coberto >= x.quantidade)
),
esp as (
  select material, dep, kind, dexp, sum(quantidade) as tot from semdoc group by 1, 2, 3, 4
),
aloc as (
  select x.iid, x.quantidade as q, coalesce(pl.qtd, 0) as mbq, pl.docs, es.tot,
         sum(x.quantidade) over (
           partition by x.material, x.dep, x.kind, x.dexp
           order by x.codigo, x.ordem
           rows unbounded preceding
         ) as cum
  from semdoc x
  join esp es using (material, dep, kind, dexp)
  left join pool pl on pl.material = x.material and pl.dep = x.dep and pl.kind = x.kind and pl.d = x.dexp
),
cob as (
  select iid, mbq, docs, tot, greatest(0, least(q, mbq - (cum - q))) as coberto from aloc
),
sobra as (
  select pl.material, pl.dep, pl.kind, pl.d, pl.qtd - coalesce(es.tot, 0) as sobra, pl.docs
  from pool pl
  left join esp es on es.material = pl.material and es.dep = pl.dep and es.kind = pl.kind and es.dexp = pl.d
  where pl.qtd - coalesce(es.tot, 0) > 0
),
-- 3. Num dia de exportação anterior da mesma requisição.
anterior as (
  select x.iid, sum(s.sobra) as qtd,
         string_agg(to_char(s.d, 'DD/MM/YYYY') || ' (doc ' || s.docs || ')', '; ' order by s.d) as txt
  from semdoc x
  join (select distinct rid, d from logexp) le on le.rid = x.rid and le.d <> x.dexp
  join sobra s on s.material = x.material and s.dep = x.dep and s.kind = x.kind and s.d = le.d
  group by x.iid
),
outra as (
  select x.iid,
         string_agg(to_char(s.d, 'DD/MM/YYYY') || ': ' || trim_scale(s.sobra)::text || ' (doc ' || s.docs || ')', '; ' order by s.d) as txt
  from semdoc x
  join sobra s on s.material = x.material and s.dep = x.dep and s.kind = x.kind
   and s.d between x.dexp + 1 and x.dexp + 7
  group by x.iid
),
antes as (
  select x.iid,
         string_agg(to_char(s.d, 'DD/MM/YYYY') || ': ' || trim_scale(s.sobra)::text || ' (doc ' || s.docs || ')', '; ' order by s.d) as txt
  from semdoc x
  join sobra s on s.material = x.material and s.dep = x.dep and s.kind = x.kind
   and s.d between x.dexp - 7 and x.dexp - 1
  where not exists (select 1 from logexp le where le.rid = x.rid and le.d = s.d)
  group by x.iid
),
res as (
  select b.iid,
         coalesce(pd.coberto, 0) + coalesce(c.coberto, 0) as coberto_dia,
         pd.coberto as cob_doc, pd.docs as docs_doc, pd.d as d_doc,
         c.mbq, c.tot, c.docs,
         a.qtd as qtd_ant, a.txt as txt_ant
  from base b
  left join pordoc pd on pd.iid = b.iid
  left join cob c on c.iid = b.iid
  left join anterior a on a.iid = b.iid
)
select
  b.rid, b.codigo, b.data, b.created_at,
  case when b.exportacao_id is not null then 'exportada'
       when coalesce(b.pendente_confirmacao, false) then 'aguardando'
       else 'nao_exportada' end,
  b.exportacao_id, b.exp_em, b.dexp, b.arquivo, b.doc_sap, b.colaborador_nome, b.tipo_movimento,
  b.iid, b.ordem, b.material, b.descricao, b.unidade, b.quantidade, b.dep, b.dep_dest, b.pep, b.item_doc,
  case
    when b.exportacao_id is null then null
    when coalesce(rs.cob_doc, 0) >= b.quantidade then 'ok'
    when rs.coberto_dia >= b.quantidade then 'ok'
    when rs.coberto_dia + least(coalesce(rs.qtd_ant, 0), b.quantidade - rs.coberto_dia) >= b.quantidade then 'ok'
    when b.dexp > (select d from mb_max) then 'mb51_pendente'
    when rs.coberto_dia + coalesce(rs.qtd_ant, 0) > 0 then 'parcial'
    when o.txt is not null then 'outra_data'
    else 'faltando'
  end,
  case
    when b.exportacao_id is null then null
    when coalesce(rs.cob_doc, 0) >= b.quantidade then 'documento'
    when rs.coberto_dia >= b.quantidade then 'dia_exportacao'
    when coalesce(rs.qtd_ant, 0) > 0 then 'exportacao_anterior'
  end,
  case when b.exportacao_id is null then null
       else least(b.quantidade, rs.coberto_dia + coalesce(rs.qtd_ant, 0)) end,
  rs.mbq, rs.tot,
  coalesce(rs.docs_doc, rs.docs) || coalesce(case when rs.txt_ant is not null then ' · anterior: ' || rs.txt_ant end, ''),
  o.txt, a2.txt,
  coalesce(h.n, 0),
  h.txt,
  exists (select 1 from dupla d where d.rid = b.rid),
  (select d from mb_max)
from base b
left join res rs on rs.iid = b.iid
left join outra o on o.iid = b.iid
left join antes a2 on a2.iid = b.iid
left join hist h on h.rid = b.rid
where (p_de is null or (case when p_base = 'criacao' then b.data else b.dexp end) >= p_de)
  and (p_ate is null or (case when p_base = 'criacao' then b.data else b.dexp end) <= p_ate)
order by coalesce(b.dexp, b.data) desc, b.codigo desc, b.ordem;
$$;


-- O plano genérico (função com parâmetros) estimava poucas linhas nos CTEs e
-- escolhia nested loop entre `aloc` e `pool` (milhares de varreduras do CTE):
-- 3,3 s. Sem nested loop o planejador usa hash join: 0,7 s no relatório
-- inteiro, 0,2 s com 30 dias, 58 ms por material.
alter function public.alm_rqb_auditoria_mb51(text, date, date, text) set enable_nestloop = off;
