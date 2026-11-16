-- =====================================================================
-- Requisição no Balcão: conferência dos documentos de uma importação
-- =====================================================================
-- A importação da planilha concluída passa a avisar quando foi a última
-- importação da MB51 e, depois de gravar, confere os documentos daquela
-- planilha. `alm_rqb_divergencias_doc` ganha:
--   p_docs  — só esses documentos (null = todos, como antes);
--   p_todas — devolve também os pares que batem ('ok') e os de documento que
--             ainda não está na MB51 ('mb51_pendente'), para a tela dizer
--             "tudo lá" ou "importe a MB51 e confira de novo".
-- Sem os dois parâmetros, o retorno é o mesmo de antes.

drop function if exists public.alm_rqb_divergencias_doc(date, date, text);

create function public.alm_rqb_divergencias_doc(
  p_de date default null,
  p_ate date default null,
  p_base text default 'exportacao',
  p_docs text[] default null,
  p_todas boolean default false
)
returns table (
  doc text,
  doc_data date,
  material text,
  descricao text,
  unidade text,
  tipo_movimento text,
  deposito text,
  situacao text,
  qtd_rqbs numeric,
  qtd_doc numeric,
  falta numeric,
  preco_medio numeric,
  valor_falta numeric,
  lancado_como text,
  avulsos text,
  data_exportacao date,
  rqbs jsonb,
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
-- Último documento importado por série (4 primeiros dígitos): saída 4904…, entrada 5000…
ultimo as materialized (
  select left(doc_material, 4) as serie, max(doc_material::bigint) as doc
  from public.sap_mb51_mov
  where doc_material ~ '^\d{10}$'
  group by 1
),
it as (
  select r.id as rid, r.codigo, r.data, r.tipo_movimento,
         (e.created_at at time zone 'America/Sao_Paulo')::date as dexp,
         i.id as iid, i.ordem, ltrim(trim(i.material), '0') as material, i.descricao, i.unidade, i.quantidade,
         coalesce(nullif(trim(i.deposito), ''), r.deposito_origem) as dep,
         coalesce(nullif(trim(i.doc_sap), ''), nullif(trim(r.doc_sap), '')) as doc
  from public.alm_req_balcao r
  join public.alm_req_balcao_itens i on i.requisicao_id = r.id
  left join public.alm_req_balcao_exportacoes e on e.id = r.exportacao_id
  where not coalesce(r.excluido, false) and r.exportacao_id is not null
),
docs as materialized (
  select distinct doc from it where doc is not null
),
docl as (
  select m.doc_material as doc, m.material, m.deposito, m.tipo_movimento, m.data_lancamento as d, m.qtd_um_registro as q,
         case
           when m.tipo_movimento in ('201', '221', '241', '311') and m.qtd_um_registro < 0 then -m.qtd_um_registro
           when m.tipo_movimento in ('202', '222', '242', '312') and m.qtd_um_registro > 0 then -m.qtd_um_registro
           else 0
         end as saida
  from public.sap_mb51_mov m
  where m.doc_material in (select doc from docs)
    and (p_docs is null or m.doc_material = any(p_docs))
),
docinfo as (
  select doc, min(d) as d from docl group by doc
),
docmat as (
  select doc, material, sum(saida) as q,
         string_agg(distinct tipo_movimento || ' ' || deposito
                    || case when q < 0 then ' (−)' else ' (+)' end, ', ') as como
  from docl group by doc, material
),
par as (
  select it.doc, it.material,
         min(it.descricao) as descricao, min(it.unidade) as unidade, min(it.tipo_movimento) as tipo_movimento,
         min(it.dep) as deposito, sum(it.quantidade) as qtd_rqbs, min(it.dexp) as dexp,
         bool_or(
           (p_de is null or (case when p_base = 'criacao' then it.data else it.dexp end) >= p_de)
           and (p_ate is null or (case when p_base = 'criacao' then it.data else it.dexp end) <= p_ate)
         ) as no_periodo,
         jsonb_agg(jsonb_build_object(
           'requisicao_id', it.rid, 'item_id', it.iid, 'codigo', it.codigo, 'quantidade', it.quantidade,
           'data_criacao', it.data, 'data_exportacao', it.dexp
         ) order by it.codigo, it.ordem) as rqbs
  from it where it.doc is not null and (p_docs is null or it.doc = any(p_docs))
  group by it.doc, it.material
),
cls as (
  select p.*, di.d as doc_data, coalesce(dm.q, 0) as qtd_doc, dm.como,
         case
           when di.doc is null then
             -- CASE garante a ordem: o cast só roda em número de 10 dígitos.
             case when p.doc !~ '^\d{10}$' then case when p_todas then 'mb51_pendente' end
                  when p.doc::bigint < u.doc then 'doc_nao_encontrado'
                  when p_todas then 'mb51_pendente' end
           when dm.material is null or coalesce(dm.q, 0) <= 0 then 'fora_do_doc'
           when dm.q < p.qtd_rqbs then 'parcial'
           when dm.q > p.qtd_rqbs then 'a_mais'
           when p_todas then 'ok'
         end as situacao
  from par p
  left join docinfo di on di.doc = p.doc
  left join docmat dm on dm.doc = p.doc and dm.material = p.material
  left join ultimo u on u.serie = left(p.doc, 4)
  where p.no_periodo
),
div as materialized (
  select * from cls where situacao is not null
),
preco as (
  select m.material, sum(abs(m.montante_mi)) / nullif(sum(abs(m.qtd_um_registro)), 0) as pu
  from public.sap_mb51_mov m
  where m.material in (select material from div) and m.montante_mi <> 0 and m.qtd_um_registro <> 0
  group by m.material
),
avulso as (
  select d.doc, d.material,
         string_agg(distinct m.doc_material || ' ' || m.tipo_movimento || ' ' || to_char(m.data_lancamento, 'DD/MM')
                    || ' (' || trim_scale(-m.qtd_um_registro)::text || ')', ' · ') as txt
  from div d
  join public.sap_mb51_mov m
    on m.material = d.material
   and m.data_lancamento between coalesce(d.doc_data, d.dexp) - 2 and coalesce(d.doc_data, d.dexp) + 7
   and m.tipo_movimento in ('201', '221', '241', '311')
   and m.qtd_um_registro < 0
   and m.doc_material not in (select doc from docs)
  where d.situacao in ('fora_do_doc', 'parcial', 'doc_nao_encontrado')
  group by d.doc, d.material
)
select v.doc, v.doc_data, v.material, v.descricao, v.unidade, v.tipo_movimento, v.deposito, v.situacao,
       v.qtd_rqbs, v.qtd_doc, v.qtd_rqbs - v.qtd_doc,
       round(p.pu, 4),
       round(greatest(v.qtd_rqbs - v.qtd_doc, 0) * coalesce(p.pu, 0), 2),
       v.como, a.txt, v.dexp, v.rqbs,
       (select mm.d from mb_max mm)
from div v
left join preco p on p.material = v.material
left join avulso a on a.doc = v.doc and a.material = v.material
order by coalesce(v.doc_data, v.dexp) desc, v.doc desc, v.material;
$$;

revoke all on function public.alm_rqb_divergencias_doc(date, date, text, text[], boolean) from public, anon;
grant execute on function public.alm_rqb_divergencias_doc(date, date, text, text[], boolean) to authenticated;
