-- Requisição no Balcão — exportadas sem doc. SAP: dados para achar o documento
-- mais provável na MB51 (o casamento roda no app, em requisicaoBalcaoDocProvavel.ts).
--
-- A conferência antiga olhava material + depósito no dia da exportação e listava
-- todo documento do dia, inclusive os que já estão inteiros com outras RQBs
-- (19/11: RQB-171126-25 apontava 4904119447, que é das RQB-181126-83..88). Aqui
-- vão as linhas de cada documento candidato, o que já está ligado a ele e os
-- estornos — o app casa linha a linha nos dois sentidos: o item tem de estar no
-- documento e o documento não pode receber mais do que tem.
--
-- Itens: exportados, sem doc. no item (e sem doc. na requisição, ou a requisição
-- é importação parcial). Exportações do log (sem as reexportações sem reabrir),
-- para o "lançado logo depois da exportação". Linhas: saídas (201/221/241) e origem das transferências (311)
-- dos documentos que têm ao menos um material+depósito dos itens, desde a criação
-- da requisição mais antiga. Estornos (202/222/242/312) dos mesmos materiais.

create or replace function public.alm_rqb_sem_doc_candidatos()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with semdoc as (
  select r.id as rid, r.codigo, r.created_at,
         i.id as iid, i.ordem,
         ltrim(trim(i.material), '0') as material, i.quantidade as qtd,
         coalesce(nullif(trim(i.deposito), ''), r.deposito_origem) as dep,
         case when r.tipo_movimento = 'transferencia'
              then coalesce(nullif(trim(i.deposito_destino), ''), r.deposito_destino) end as dep_dest,
         case when r.tipo_movimento = 'transferencia' then null
              else coalesce(nullif(trim(i.aplicacao_pep), ''), r.aplicacao_pep) end as pep,
         case when r.tipo_movimento = 'transferencia' then 'T' else 'S' end as kind,
         e.created_at as exportada_em
  from public.alm_req_balcao r
  join public.alm_req_balcao_itens i on i.requisicao_id = r.id
  left join public.alm_req_balcao_exportacoes e on e.id = r.exportacao_id
  where not coalesce(r.excluido, false)
    and not coalesce(r.pendente_confirmacao, false)
    and r.exportacao_id is not null
    and nullif(trim(i.doc_sap), '') is null
    and (nullif(trim(r.doc_sap), '') is null
         or exists (select 1 from public.alm_req_balcao_itens i2
                    where i2.requisicao_id = r.id and nullif(trim(i2.doc_sap), '') is not null))
),
-- Só a exportação que pode virar lançamento: a primeira e a que vem depois de
-- uma reabertura. Reexportar sem reabrir (17/11 16:19 com 520 RQBs, 19/11 15:28
-- com 167, para conferência) não gera documento novo e puxaria para a RQB
-- antiga o documento de outra.
expo as (
  select x.rid, array_agg(x.created_at order by x.created_at) as quando
  from (
    select l.requisicao_id as rid, l.created_at, l.acao,
           lag(l.acao) over (partition by l.requisicao_id order by l.created_at) as anterior
    from public.alm_req_balcao_alteracoes l
    where l.acao in ('exportacao', 'reabertura') and l.requisicao_id in (select rid from semdoc)
  ) x
  where x.acao = 'exportacao' and x.anterior is distinct from 'exportacao'
  group by 1
),
inicio as (
  select (min(created_at) at time zone 'America/Sao_Paulo')::date as d from semdoc
),
mov as materialized (
  select m.doc_material as doc,
         ((m.data_lancamento + coalesce(nullif(trim(m.hora_registro::text), '')::numeric, 0) * interval '1 day')
           at time zone 'America/Sao_Paulo') as instante,
         m.tipo_movimento as tipo, ltrim(trim(m.material), '0') as material, m.deposito as dep,
         nullif(trim(m.elemento_pep), '') as pep, m.qtd_um_registro as qtd
  from public.sap_mb51_mov m, inicio
  where m.data_lancamento >= inicio.d
    and m.tipo_movimento in ('201', '202', '221', '222', '241', '242', '311', '312')
),
docs as (
  select distinct v.doc
  from mov v
  join (select distinct material, dep from semdoc) c on c.material = v.material and c.dep = v.dep
  where v.tipo in ('201', '221', '241', '311') and v.qtd < 0
),
linhas as (
  select v.doc, v.instante, case when v.tipo = '311' then 'T' else 'S' end as kind,
         v.material, v.dep, v.pep, -v.qtd as qtd
  from mov v
  join docs d on d.doc = v.doc
  where v.tipo in ('201', '221', '241', '311') and v.qtd < 0
),
destinos as (
  select v.doc, v.material, array_agg(distinct v.dep) as deps
  from mov v
  join docs d on d.doc = v.doc
  where v.tipo = '311' and v.qtd > 0
  group by 1, 2
),
vinc as (
  select array(select (regexp_matches(coalesce(nullif(trim(i.doc_sap), ''), r.doc_sap), '\d{10}', 'g'))[1]) as docs,
         case when r.tipo_movimento = 'transferencia' then 'T' else 'S' end as kind,
         ltrim(trim(i.material), '0') as material,
         coalesce(nullif(trim(i.deposito), ''), r.deposito_origem) as dep,
         case when r.tipo_movimento = 'transferencia' then null
              else coalesce(nullif(trim(i.aplicacao_pep), ''), r.aplicacao_pep) end as pep,
         i.quantidade as qtd
  from public.alm_req_balcao r
  join public.alm_req_balcao_itens i on i.requisicao_id = r.id
  where not coalesce(r.excluido, false)
    and coalesce(nullif(trim(i.doc_sap), ''), nullif(trim(r.doc_sap), '')) is not null
    and i.id not in (select iid from semdoc)
),
-- Documento × material × depósito que já está inteiro com RQBs ligadas não recebe
-- mais nada: fica de fora (de 228 documentos, ~85 têm sobra). Item ligado a mais
-- de um documento ("A / B") não entra na conta do banco; vai para o app decidir.
lk as (
  select doc, kind, material, dep, sum(qtd) as q from linhas group by 1, 2, 3, 4
),
vk as (
  select v.docs[1] as doc, v.kind, v.material, v.dep, sum(v.qtd) as q
  from vinc v where cardinality(v.docs) = 1 group by 1, 2, 3, 4
),
livres as (
  select lk.doc, lk.kind, lk.material, lk.dep
  from lk
  left join vk on vk.doc = lk.doc and vk.kind = lk.kind and vk.material = lk.material and vk.dep = lk.dep
  where lk.q > coalesce(vk.q, 0)
),
linhas_livres as (
  select l.* from linhas l
  join livres f on f.doc = l.doc and f.kind = l.kind and f.material = l.material and f.dep = l.dep
),
vinc_livres as (
  select v.* from vinc v
  where exists (select 1 from livres f
                where f.doc = any(v.docs) and f.kind = v.kind and f.material = v.material and f.dep = v.dep)
),
estornos as (
  -- Estorno devolve à origem: linha positiva no depósito que tinha saído.
  select v.doc, v.instante, case when v.tipo = '312' then 'T' else 'S' end as kind,
         v.material, v.dep, v.pep, v.qtd
  from mov v
  join (select distinct material, dep from linhas_livres) k on k.material = v.material and k.dep = v.dep
  where v.tipo in ('202', '222', '242', '312') and v.qtd > 0
),
mb51_fim as (
  select max(data_lancamento) as d from public.sap_mb51_mov
)
select jsonb_build_object(
  'mb51_ate', (select d from mb51_fim),
  'mb51_ultimo', (
    select max((m.data_lancamento + coalesce(nullif(trim(m.hora_registro::text), '')::numeric, 0) * interval '1 day')
                 at time zone 'America/Sao_Paulo')
    from public.sap_mb51_mov m, mb51_fim f where m.data_lancamento = f.d
  ),
  'itens', coalesce((
    select jsonb_agg(jsonb_build_object(
      'requisicao_id', s.rid, 'codigo', s.codigo, 'criado_em', s.created_at,
      'item_id', s.iid, 'ordem', s.ordem, 'kind', s.kind, 'material', s.material,
      'dep', s.dep, 'dep_dest', s.dep_dest, 'pep', s.pep, 'qtd', s.qtd,
      'exportacoes', coalesce(to_jsonb(x.quando), jsonb_build_array(s.exportada_em))
    ) order by s.codigo, s.ordem)
    from semdoc s left join expo x on x.rid = s.rid
  ), '[]'::jsonb),
  'linhas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'doc', l.doc, 'instante', l.instante, 'kind', l.kind, 'material', l.material,
      'dep', l.dep, 'pep', l.pep, 'qtd', l.qtd, 'destinos', d.deps
    ) order by l.instante, l.doc)
    from linhas_livres l left join destinos d on d.doc = l.doc and d.material = l.material
  ), '[]'::jsonb),
  'estornos', coalesce((
    select jsonb_agg(jsonb_build_object(
      'doc', e.doc, 'instante', e.instante, 'kind', e.kind, 'material', e.material,
      'dep', e.dep, 'pep', e.pep, 'qtd', e.qtd
    ) order by e.instante)
    from estornos e
  ), '[]'::jsonb),
  'vinculados', coalesce((
    select jsonb_agg(jsonb_build_object(
      'docs', to_jsonb(v.docs), 'kind', v.kind, 'material', v.material,
      'dep', v.dep, 'pep', v.pep, 'qtd', v.qtd
    ))
    from vinc_livres v
  ), '[]'::jsonb)
);
$$;

revoke all on function public.alm_rqb_sem_doc_candidatos() from public, anon;
grant execute on function public.alm_rqb_sem_doc_candidatos() to authenticated;

comment on function public.alm_rqb_sem_doc_candidatos() is
  'Exportadas sem doc. SAP: itens, linhas dos documentos candidatos da MB51, estornos e o que já está ligado a cada documento — o app acha o doc. mais provável (requisicaoBalcaoDocProvavel.ts).';
