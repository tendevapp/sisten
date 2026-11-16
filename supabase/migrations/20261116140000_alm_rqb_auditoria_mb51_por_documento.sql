-- =====================================================================
-- Requisição no Balcão × MB51: conferência pelo documento SAP
-- =====================================================================
-- Checagem de 16/11: a planilha concluída (BAIXA ESTOQUE.xlsm) volta com doc.
-- e "Concluído" também em linhas que o SAP não lançou. Ex.: 4904102226 está na
-- MB51, mas sem o arame 1047385 das RQB-301026-38/-48. Foram 86 pares
-- documento × material fora do documento e 87 com quantidade menor (~R$ 63 mil).
--
-- O relatório não mostrava os parciais: `pordoc` conferia cada item contra o
-- documento inteiro (least(qtd, soma do doc)). Quinze RQBs de 1 luva no mesmo
-- doc com 13 luvas davam 15 × "ok". Agora:
--   * O doc. de referência é o do item ou, sem ele, o da requisição.
--   * A quantidade do material no documento é distribuída entre os itens que
--     apontam para ele, em ordem de código (soma acumulada), como já era feito
--     no dia da exportação.
--   * Documento que já está na MB51 decide sozinho: não cai mais no "dia da
--     exportação", onde um lançamento avulso do mesmo material escondia a
--     falta. Documento ainda não importado segue pelo dia, como antes.
--   * Conta qualquer saída do material no documento (201/221/241/311 e
--     estornos), em qualquer depósito: 23 pares lançados com outro tipo de
--     movimento e 11 de outro depósito foram lançados, só de outra forma —
--     a lista por documento mostra como.
--
-- Nova `alm_rqb_divergencias_doc`: uma linha por documento × material com o
-- que as RQBs pediram, o que o documento tem, a falta, o valor estimado (preço
-- médio da MB51) e lançamentos avulsos próximos sem RQB.

drop function if exists public.alm_rqb_auditoria_mb51(text, date, date, text);

create function public.alm_rqb_auditoria_mb51(
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
  mb51_ate date,
  doc_no_mb51 boolean,
  doc_qtd numeric,
  doc_qtd_rqbs numeric
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
    coalesce(nullif(trim(i.doc_sap), ''), nullif(trim(r.doc_sap), '')) as doc_ref,
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
-- Linhas da MB51 por material + depósito das requisições exportadas (conferência pelo dia).
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
-- 1. Pelo documento. Todas as linhas dos documentos citados pelas requisições.
docl as (
  select m.doc_material as doc, m.material, m.deposito as dep,
         case when m.tipo_movimento in ('311', '312') then 'T' else 'S' end as kind,
         m.data_lancamento as d,
         case
           when m.tipo_movimento in ('201', '221', '241', '311') and m.qtd_um_registro < 0 then -m.qtd_um_registro
           when m.tipo_movimento in ('202', '222', '242', '312') and m.qtd_um_registro > 0 then -m.qtd_um_registro
           else 0
         end as qtd
  from public.sap_mb51_mov m
  where m.doc_material in (select distinct doc_ref from expo where doc_ref is not null)
),
docs_mb51 as (
  select distinct doc from docl
),
docmat as (
  select doc, material, sum(qtd) as q, min(d) as d from docl group by 1, 2
),
-- Quantidade do material no documento distribuída entre os itens que apontam para ele.
docaloc as (
  select x.iid, x.doc_ref, x.material, x.quantidade as q,
         coalesce(dm.q, 0) as docq, dm.d,
         sum(x.quantidade) over (partition by x.doc_ref, x.material) as tot_rqbs,
         sum(x.quantidade) over (
           partition by x.doc_ref, x.material
           order by x.codigo, x.ordem, x.iid
           rows unbounded preceding
         ) as cum
  from expo x
  join docs_mb51 ds on ds.doc = x.doc_ref
  left join docmat dm on dm.doc = x.doc_ref and dm.material = x.material
),
pordoc as (
  select iid, doc_ref, material, d, docq, tot_rqbs,
         greatest(0, least(q, docq - (cum - q))) as coberto
  from docaloc
),
consumo as (
  select doc_ref as doc, material, sum(coberto) as q from pordoc group by 1, 2
),
-- O que os documentos já cobriram sai do saldo do dia (proporcional às linhas do documento).
reservado as (
  select l.material, l.dep, l.kind, l.d, sum(l.qtd * c.q / dm.q) as q
  from docl l
  join consumo c on c.doc = l.doc and c.material = l.material
  join docmat dm on dm.doc = l.doc and dm.material = l.material
  where dm.q > 0 and l.qtd <> 0
  group by 1, 2, 3, 4
),
pool as (
  select md.material, md.dep, md.kind, md.d, md.qtd - coalesce(rs.q, 0) as qtd, md.docs
  from mbd md
  left join reservado rs on rs.material = md.material and rs.dep = md.dep and rs.kind = md.kind and rs.d = md.d
),
-- 2. Pelo dia da exportação: só quem não tem documento na MB51.
semdoc as (
  select x.* from expo x where not exists (select 1 from docs_mb51 ds where ds.doc = x.doc_ref)
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
-- 3. Num dia de exportação anterior da mesma requisição (só sem documento na MB51).
anterior as (
  select x.iid, sum(s.sobra) as qtd,
         string_agg(to_char(s.d, 'DD/MM/YYYY') || ' (doc ' || s.docs || ')', '; ' order by s.d) as txt
  from semdoc x
  join (select distinct rid, d from logexp) le on le.rid = x.rid and le.d <> x.dexp
  join sobra s on s.material = x.material and s.dep = x.dep and s.kind = x.kind and s.d = le.d
  group by x.iid
),
-- Itens que não fecharam (sem documento, ou documento sem a quantidade): pistas de outra data.
pendente as (
  select x.* from expo x
  where not exists (select 1 from pordoc p where p.iid = x.iid and p.coberto >= x.quantidade)
),
outra as (
  select x.iid,
         string_agg(to_char(s.d, 'DD/MM/YYYY') || ': ' || trim_scale(s.sobra)::text || ' (doc ' || s.docs || ')', '; ' order by s.d) as txt
  from pendente x
  join sobra s on s.material = x.material and s.dep = x.dep and s.kind = x.kind
   and s.d between x.dexp + 1 and x.dexp + 7
  group by x.iid
),
antes as (
  select x.iid,
         string_agg(to_char(s.d, 'DD/MM/YYYY') || ': ' || trim_scale(s.sobra)::text || ' (doc ' || s.docs || ')', '; ' order by s.d) as txt
  from pendente x
  join sobra s on s.material = x.material and s.dep = x.dep and s.kind = x.kind
   and s.d between x.dexp - 7 and x.dexp - 1
  where not exists (select 1 from logexp le where le.rid = x.rid and le.d = s.d)
  group by x.iid
),
res as (
  select b.iid,
         coalesce(pd.coberto, 0) + coalesce(c.coberto, 0) as coberto_dia,
         pd.coberto as cob_doc, pd.doc_ref as docs_doc, pd.docq, pd.tot_rqbs,
         (pd.iid is not null) as doc_ok,
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
    when rs.doc_ok then
      case when rs.cob_doc > 0 then 'parcial'
           when o.txt is not null then 'outra_data'
           else 'faltando' end
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
    when rs.doc_ok then null
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
  (select d from mb_max),
  coalesce(rs.doc_ok, false),
  rs.docq,
  rs.tot_rqbs
from base b
left join res rs on rs.iid = b.iid
left join outra o on o.iid = b.iid
left join antes a2 on a2.iid = b.iid
left join hist h on h.rid = b.rid
where (p_de is null or (case when p_base = 'criacao' then b.data else b.dexp end) >= p_de)
  and (p_ate is null or (case when p_base = 'criacao' then b.data else b.dexp end) <= p_ate)
order by coalesce(b.dexp, b.data) desc, b.codigo desc, b.ordem;
$$;

alter function public.alm_rqb_auditoria_mb51(text, date, date, text) set enable_nestloop = off;
revoke all on function public.alm_rqb_auditoria_mb51(text, date, date, text) from public, anon;
grant execute on function public.alm_rqb_auditoria_mb51(text, date, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- Lista por documento × material
-- ---------------------------------------------------------------------
-- situacao:
--   fora_do_doc         documento na MB51, material não está nele
--   parcial             material no documento com quantidade menor
--   a_mais              documento tem mais do que as RQBs (outra baixa no mesmo doc.)
--   doc_nao_encontrado  número menor que o último doc. importado e ausente
--                       da MB51 — digitado errado ou estornado
-- Documento maior que o último importado é só MB51 atrasada e não entra.
-- O período filtra pelo item (criação ou exportação): entra o par com ao
-- menos um item no período, e as quantidades são sempre do par inteiro.

create or replace function public.alm_rqb_divergencias_doc(
  p_de date default null,
  p_ate date default null,
  p_base text default 'exportacao'
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
  from it where it.doc is not null
  group by it.doc, it.material
),
cls as (
  select p.*, di.d as doc_data, coalesce(dm.q, 0) as qtd_doc, dm.como,
         case
           when di.doc is null then
             case when p.doc !~ '^\d{10}$' then null
                  when p.doc::bigint < u.doc then 'doc_nao_encontrado' end
           when dm.material is null or coalesce(dm.q, 0) <= 0 then 'fora_do_doc'
           when dm.q < p.qtd_rqbs then 'parcial'
           when dm.q > p.qtd_rqbs then 'a_mais'
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

revoke all on function public.alm_rqb_divergencias_doc(date, date, text) from public, anon;
grant execute on function public.alm_rqb_divergencias_doc(date, date, text) to authenticated;
