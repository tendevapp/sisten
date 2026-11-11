-- =====================================================================
-- Requisição no Balcão: log da importação da planilha concluída e
-- conferência "exportado × importado" por lote.
--
-- Até aqui a importação só deixava rastro (`alm_req_balcao_alteracoes`,
-- ação 'importacao_sap') nas requisições em que um item mudava. Importação
-- em que nenhuma linha casava, linhas sem doc. SAP e "não encontrados" não
-- ficavam em lugar nenhum. Caso que motivou: o lote
-- requisicao_balcao_20261001_1411.xlsx (94 itens) nunca recebeu doc. SAP,
-- embora a MB51 tenha os docs 4904074971 (221) e 4904074972 (311) do dia, e
-- não dava para dizer se a planilha voltou sem a coluna ou se nunca foi
-- importada. A planilha concluída volta sempre como "BAIXA ESTOQUE.xlsm",
-- então o nome do arquivo não diz de que lote ela é: o lote de cada linha
-- passa a ser gravado pela exportação vigente da RQB.
--
-- 1) `alm_req_balcao_importacoes`: uma linha por importação, com o resumo
--    da leitura e o detalhe de cada linha (gravado / igual / não encontrado /
--    sem doc. SAP / fora da gravação), e os lotes que ela tocou.
-- 2) `alm_req_balcao_importar_sap` ganha `p_leitura` (o que a tela leu e
--    classificou) e grava a importação. Item repetido na mesma RQB: cada
--    linha vai para um item diferente, em vez de a 2ª sobrescrever a 1ª.
-- 3) Reconstrói as importações antigas a partir do log ('reconstruida').
-- 4) `alm_req_balcao_lotes_importacao`: por lote exportado, itens com e sem
--    doc. SAP, as importações que o tocaram e os docs da MB51 do dia que não
--    estão vinculados a nenhuma RQB.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------
create table if not exists public.alm_req_balcao_importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo text,
  coluna_sap text,
  importado_por_id uuid,
  importado_por_nome text,
  created_at timestamptz not null default now(),
  total_linhas int not null default 0,   -- linhas com conteúdo na planilha
  sem_codigo int not null default 0,     -- sem RQB na Observacao
  sem_doc_sap int not null default 0,    -- com RQB, sem doc. SAP nem status
  enviadas int not null default 0,       -- linhas que a prévia mandou gravar
  gravados int not null default 0,
  iguais int not null default 0,
  nao_encontrados int not null default 0,
  requisicoes int not null default 0,
  docs text[] not null default '{}',
  lotes text[] not null default '{}',
  detalhe jsonb not null default '[]'::jsonb,
  reconstruida boolean not null default false
);
create index if not exists idx_alm_req_balcao_importacoes_em
  on public.alm_req_balcao_importacoes (created_at desc);
create index if not exists idx_alm_req_balcao_importacoes_lotes
  on public.alm_req_balcao_importacoes using gin (lotes);

alter table public.alm_req_balcao_importacoes enable row level security;
drop policy if exists alm_req_balcao_importacoes_sel on public.alm_req_balcao_importacoes;
create policy alm_req_balcao_importacoes_sel on public.alm_req_balcao_importacoes
  for select to authenticated using (true);
revoke all on public.alm_req_balcao_importacoes from anon;
revoke insert, update, delete on public.alm_req_balcao_importacoes from authenticated;
grant select on public.alm_req_balcao_importacoes to authenticated;

create index if not exists idx_alm_req_balcao_itens_doc_sap
  on public.alm_req_balcao_itens (doc_sap) where doc_sap is not null;

-- ---------------------------------------------------------------------
-- 2. RPC de importação
-- ---------------------------------------------------------------------
drop function if exists public.alm_req_balcao_importar_sap(jsonb, text, text);
create function public.alm_req_balcao_importar_sap(
  p_linhas jsonb, p_arquivo text, p_por text, p_leitura jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_l jsonb;
  v_req public.alm_req_balcao;
  v_item public.alm_req_balcao_itens;
  v_doc text;
  v_status text;
  v_mat text;
  v_cod text;
  v_lote text;
  v_itens int := 0;
  v_iguais int := 0;
  v_nao jsonb := '[]'::jsonb;
  v_tocadas uuid[] := '{}';
  v_usados uuid[] := '{}';
  v_diff jsonb;
  v_id uuid;
  v_docs text;
  v_detalhe jsonb := '[]'::jsonb;
  v_imp uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) loop
    v_doc := nullif(trim(v_l->>'doc_sap'), '');
    v_status := nullif(trim(v_l->>'status'), '');
    v_mat := trim(coalesce(v_l->>'material', ''));
    v_cod := upper(trim(coalesce(v_l->>'codigo', '')));
    select * into v_req from public.alm_req_balcao where codigo = v_cod and not excluido;
    if not found then
      v_nao := v_nao || to_jsonb(v_cod || ' / ' || v_mat);
      v_detalhe := v_detalhe || jsonb_build_object('codigo', v_cod, 'material', v_mat, 'doc_sap', v_doc,
        'status', v_status, 'resultado', 'nao_encontrado', 'motivo', 'RQB não encontrada (ou excluída)');
      continue;
    end if;
    select e.arquivo into v_lote from public.alm_req_balcao_exportacoes e where e.id = v_req.exportacao_id;

    -- Mesmo material duas vezes na RQB: cada linha da planilha num item.
    select * into v_item from public.alm_req_balcao_itens
     where requisicao_id = v_req.id and material = v_mat
     order by (id = any(v_usados)), (doc_sap is not distinct from coalesce(v_doc, doc_sap)) desc,
              (doc_sap is null) desc, ordem
     limit 1;
    if not found then
      v_nao := v_nao || to_jsonb(v_req.codigo || ' / ' || v_mat);
      v_detalhe := v_detalhe || jsonb_build_object('codigo', v_req.codigo, 'material', v_mat, 'doc_sap', v_doc,
        'status', v_status, 'resultado', 'nao_encontrado', 'motivo', 'Material não está na RQB', 'lote', v_lote);
      continue;
    end if;
    v_usados := v_usados || v_item.id;

    v_diff := public.alm_req_balcao_diff('Doc. SAP item ' || v_item.material, v_item.doc_sap, coalesce(v_doc, v_item.doc_sap))
      || public.alm_req_balcao_diff('Status item ' || v_item.material, v_item.status_processamento,
                                    coalesce(v_status, v_item.status_processamento));
    if jsonb_array_length(v_diff) = 0 then
      v_iguais := v_iguais + 1;
      v_detalhe := v_detalhe || jsonb_build_object('codigo', v_req.codigo, 'material', v_mat, 'doc_sap', v_doc,
        'status', v_status, 'resultado', 'igual', 'lote', v_lote, 'ordem', v_item.ordem);
      continue;
    end if;

    update public.alm_req_balcao_itens set
      doc_sap = coalesce(v_doc, doc_sap),
      status_processamento = coalesce(v_status, status_processamento)
    where id = v_item.id;
    v_itens := v_itens + 1;
    v_detalhe := v_detalhe || jsonb_build_object('codigo', v_req.codigo, 'material', v_mat, 'doc_sap', v_doc,
      'status', v_status, 'resultado', 'gravado', 'doc_anterior', v_item.doc_sap, 'lote', v_lote, 'ordem', v_item.ordem);
    perform public.alm_req_balcao_log(v_req.id, 'importacao_sap', v_diff,
      'Importado de ' || coalesce(p_arquivo, 'planilha') || '.', p_por);
    if not v_req.id = any(v_tocadas) then v_tocadas := v_tocadas || v_req.id; end if;
  end loop;

  -- Doc. da requisição = documentos distintos dos itens.
  foreach v_id in array v_tocadas loop
    select string_agg(distinct doc_sap, ' / ') into v_docs
      from public.alm_req_balcao_itens where requisicao_id = v_id and doc_sap is not null;
    update public.alm_req_balcao set
      doc_sap = v_docs,
      doc_sap_em = case when v_docs is null then doc_sap_em else now() end,
      doc_sap_por = case when v_docs is null then doc_sap_por else p_por end
    where id = v_id;
  end loop;

  -- Linhas que a prévia leu e não mandou gravar (já iguais, não encontradas
  -- na tela, sem doc. SAP): entram no log com o lote atual da RQB.
  v_detalhe := v_detalhe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'codigo', upper(x->>'codigo'), 'material', x->>'material',
             'doc_sap', nullif(x->>'doc_sap', ''), 'status', nullif(x->>'status', ''),
             'resultado', case when x->>'situacao' = 'sem_doc' then 'sem_doc' else 'fora_da_gravacao' end,
             'motivo', case x->>'situacao'
                         when 'sem_doc' then 'Linha sem doc. SAP nem status na planilha'
                         when 'igual' then 'Prévia: já gravado igual'
                         when 'nao_encontrado' then 'Prévia: RQB/item não encontrado na tela'
                         else x->>'situacao' end,
             'lote', e.arquivo))
      from jsonb_array_elements(coalesce(p_leitura->'nao_enviadas', '[]'::jsonb)) x
      left join public.alm_req_balcao r on r.codigo = upper(x->>'codigo') and not r.excluido
      left join public.alm_req_balcao_exportacoes e on e.id = r.exportacao_id), '[]'::jsonb);

  insert into public.alm_req_balcao_importacoes
    (arquivo, coluna_sap, importado_por_id, importado_por_nome, total_linhas, sem_codigo, sem_doc_sap,
     enviadas, gravados, iguais, nao_encontrados, requisicoes, docs, lotes, detalhe)
  values (
    p_arquivo, p_leitura->>'coluna_sap', auth.uid(),
    coalesce(nullif(p_por, ''), (select name from public.profiles where id::text = auth.uid()::text)),
    coalesce((p_leitura->>'total_linhas')::int, jsonb_array_length(coalesce(p_linhas, '[]'::jsonb))),
    coalesce((p_leitura->>'sem_codigo')::int, 0),
    coalesce((p_leitura->>'sem_doc_sap')::int, 0),
    jsonb_array_length(coalesce(p_linhas, '[]'::jsonb)),
    v_itens, v_iguais, jsonb_array_length(v_nao), coalesce(array_length(v_tocadas, 1), 0),
    coalesce((select array_agg(distinct d->>'doc_sap' order by d->>'doc_sap') from jsonb_array_elements(v_detalhe) d
               where d->>'resultado' in ('gravado', 'igual') and d->>'doc_sap' is not null), '{}'),
    coalesce((select array_agg(distinct d->>'lote' order by d->>'lote') from jsonb_array_elements(v_detalhe) d
               where d->>'lote' is not null), '{}'),
    v_detalhe)
  returning id into v_imp;

  return jsonb_build_object('requisicoes', coalesce(array_length(v_tocadas, 1), 0),
                            'itens', v_itens, 'iguais', v_iguais, 'nao_encontrados', v_nao,
                            'importacao_id', v_imp);
end;
$$;
revoke all on function public.alm_req_balcao_importar_sap(jsonb, text, text, jsonb) from public, anon;
grant execute on function public.alm_req_balcao_importar_sap(jsonb, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Reconstrução das importações antigas pelo log
-- ---------------------------------------------------------------------
-- Eventos do mesmo usuário e arquivo com menos de 2 min entre si = uma
-- importação. Só sabemos das linhas que gravaram algo.
insert into public.alm_req_balcao_importacoes
  (arquivo, importado_por_id, importado_por_nome, created_at, total_linhas, enviadas, gravados,
   requisicoes, docs, lotes, detalhe, reconstruida)
with ev as (
  select l.*, regexp_replace(l.resumo, '^Importado de (.*)\.$', '\1') as arq,
         lag(l.created_at) over (partition by l.alterado_por_nome, l.resumo order by l.created_at) as ant
    from public.alm_req_balcao_alteracoes l
   where l.acao = 'importacao_sap'
), grp as (
  select ev.*, sum(case when ant is null or created_at - ant > interval '2 minutes' then 1 else 0 end)
           over (partition by alterado_por_nome, resumo order by created_at) as g
    from ev
), linhas as (
  select grp.*, d->>'para' as doc, substring(d->>'campo' from '^Doc\. SAP item (.*)$') as material,
         e.arquivo as lote
    from grp
    cross join lateral jsonb_array_elements(grp.alteracoes) d
    left join public.alm_req_balcao r on r.id = grp.requisicao_id
    left join public.alm_req_balcao_exportacoes e on e.id = r.exportacao_id
   where d->>'campo' like 'Doc. SAP item %'
)
select min(arq), (array_agg(alterado_por_id order by created_at))[1], alterado_por_nome, min(created_at),
       count(*), count(*), count(*), count(distinct requisicao_id),
       coalesce(array_agg(distinct doc) filter (where doc is not null), '{}'),
       coalesce(array_agg(distinct lote) filter (where lote is not null), '{}'),
       jsonb_agg(jsonb_build_object('codigo', codigo, 'material', material, 'doc_sap', doc,
                                    'resultado', 'gravado', 'lote', lote) order by codigo, material),
       true
  from linhas
 where not exists (select 1 from public.alm_req_balcao_importacoes i where i.reconstruida)
 group by alterado_por_nome, resumo, g;

-- ---------------------------------------------------------------------
-- 4. Exportado × importado por lote
-- ---------------------------------------------------------------------
create or replace function public.alm_req_balcao_lotes_importacao(p_de date default null, p_ate date default null)
returns table (
  exportacao_id uuid,
  arquivo text,
  exportada_em timestamptz,
  data_exportacao date,
  exportado_por text,
  total_requisicoes int,
  total_itens int,
  requisicoes_vigentes int,
  itens_vigentes int,
  itens_com_doc int,
  itens_sem_doc int,
  docs_lote text,
  importacoes int,
  ultima_importacao_em timestamptz,
  pendentes jsonb,
  mb51_sem_vinculo jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with e as (
    select x.*, (x.created_at at time zone 'America/Sao_Paulo')::date as dexp
      from public.alm_req_balcao_exportacoes x
     where (p_de is null or (x.created_at at time zone 'America/Sao_Paulo')::date >= p_de)
       and (p_ate is null or (x.created_at at time zone 'America/Sao_Paulo')::date <= p_ate)
  ), it as materialized (
    select e.id as eid, r.id as rid, r.codigo, r.tipo_movimento as tipo, i.ordem, i.material, i.descricao,
           i.quantidade, i.unidade, i.deposito, i.doc_sap
      from e
      join public.alm_req_balcao r on r.exportacao_id = e.id and not r.excluido
      join public.alm_req_balcao_itens i on i.requisicao_id = r.id
  ), agg as (
    select it.eid,
           count(distinct it.rid)::int as reqs,
           count(*)::int as itens,
           count(it.doc_sap)::int as com_doc,
           string_agg(distinct it.doc_sap, ' / ') as docs,
           coalesce(jsonb_agg(jsonb_build_object(
             'requisicao_id', it.rid, 'codigo', it.codigo, 'tipo', it.tipo, 'ordem', it.ordem,
             'material', it.material, 'descricao', it.descricao, 'quantidade', it.quantidade,
             'unidade', it.unidade, 'deposito', it.deposito) order by it.codigo, it.ordem)
             filter (where it.doc_sap is null), '[]'::jsonb) as pendentes
      from it group by it.eid
  ), pend as (
    select distinct it.eid, it.material from it where it.doc_sap is null
  ), lig as (
    select i.doc_sap as d from public.alm_req_balcao_itens i where i.doc_sap is not null
    union
    select r.doc_sap from public.alm_req_balcao r where r.doc_sap is not null
  ), dias as (
    select dexp as d from e union select dexp + 1 from e
  ), mbd as materialized (
    -- MB51 do dia da exportação e do seguinte, nos movimentos do balcão,
    -- com doc. que nenhuma RQB tem como doc. SAP.
    select m.doc_material, m.tipo_movimento, m.data_lancamento, m.material
      from public.sap_mb51_mov m
     where m.data_lancamento in (select d from dias)
       and m.tipo_movimento in ('201', '221', '241', '311')
       and not exists (select 1 from lig where lig.d = m.doc_material)
  ), mbs as (
    select doc_material, tipo_movimento, data_lancamento, count(*) as linhas
      from mbd group by 1, 2, 3
  ), mb as (
    -- Só o doc. que tem material de item pendente do lote.
    select e.id as eid, s.doc_material, s.tipo_movimento, s.data_lancamento, s.linhas,
           count(distinct d.material) as materiais_pendentes
      from e
      join mbs s on s.data_lancamento between e.dexp and e.dexp + 1
      join mbd d on d.doc_material = s.doc_material and d.data_lancamento = s.data_lancamento
      join pend p on p.eid = e.id and p.material = d.material
     group by e.id, s.doc_material, s.tipo_movimento, s.data_lancamento, s.linhas
  ), mbj as (
    select eid, jsonb_agg(jsonb_build_object(
             'doc', doc_material, 'tipo', tipo_movimento, 'data', data_lancamento,
             'linhas', linhas, 'materiais_pendentes', materiais_pendentes)
             order by materiais_pendentes desc, doc_material) as docs
      from mb group by eid
  ), imp as (
    select l.lote, count(*)::int as n, max(i.created_at) as ultima
      from public.alm_req_balcao_importacoes i
      cross join lateral unnest(i.lotes) as l(lote)
     group by l.lote
  )
  select e.id, e.arquivo, e.created_at, e.dexp, e.exportado_por_nome,
         e.total_requisicoes, e.total_itens,
         coalesce(agg.reqs, 0), coalesce(agg.itens, 0), coalesce(agg.com_doc, 0),
         coalesce(agg.itens - agg.com_doc, 0), agg.docs,
         coalesce(imp.n, 0), imp.ultima,
         coalesce(agg.pendentes, '[]'::jsonb),
         coalesce(mbj.docs, '[]'::jsonb)
    from e
    left join agg on agg.eid = e.id
    left join mbj on mbj.eid = e.id
    left join imp on imp.lote = e.arquivo
   order by e.created_at desc;
$$;
revoke all on function public.alm_req_balcao_lotes_importacao(date, date) from public, anon;
grant execute on function public.alm_req_balcao_lotes_importacao(date, date) to authenticated;
