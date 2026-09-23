-- =====================================================================
-- Requisição no Balcão — log de alterações e importação do doc. SAP.
--
-- 1) `alm_req_balcao_alteracoes`: uma linha por evento (criação, edição,
--    exclusão, doc. SAP, exportação, reabertura, importação), com o diff
--    campo a campo `[{campo, de, para}]`. Só as RPCs (security definer)
--    gravam; quem fez vem de `auth.uid()` + `profiles.name`.
--
-- 2) Importação da planilha concluída: a mesma planilha exportada volta com
--    o nº do documento SAP na última coluna. Cada linha é casada pelo código
--    RQB (início da coluna Observacao) + material. O documento fica no item
--    (`doc_sap`, `status_processamento`) e a requisição recebe os documentos
--    distintos dos seus itens.
-- =====================================================================

alter table public.alm_req_balcao_itens
  add column if not exists doc_sap text,
  add column if not exists status_processamento text;

create table if not exists public.alm_req_balcao_alteracoes (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid not null references public.alm_req_balcao(id) on delete cascade,
  codigo text,
  acao text not null check (acao in
    ('criacao','edicao','exclusao','doc_sap','exportacao','reabertura','importacao_sap')),
  alteracoes jsonb not null default '[]'::jsonb,
  resumo text,
  alterado_por_id uuid,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_alm_req_balcao_alteracoes_req
  on public.alm_req_balcao_alteracoes (requisicao_id, created_at desc);

alter table public.alm_req_balcao_alteracoes enable row level security;
drop policy if exists alm_req_balcao_alteracoes_sel on public.alm_req_balcao_alteracoes;
create policy alm_req_balcao_alteracoes_sel on public.alm_req_balcao_alteracoes
  for select to authenticated using (true);
revoke insert, update, delete on public.alm_req_balcao_alteracoes from anon, authenticated;
revoke all on public.alm_req_balcao_alteracoes from anon;

-- Grava um evento no log. Interna: chamada só pelas RPCs abaixo.
create or replace function public.alm_req_balcao_log(
  p_requisicao uuid, p_acao text, p_alteracoes jsonb, p_resumo text, p_por text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.alm_req_balcao_alteracoes
    (requisicao_id, codigo, acao, alteracoes, resumo, alterado_por_id, alterado_por_nome)
  select p_requisicao, r.codigo, p_acao, coalesce(p_alteracoes, '[]'::jsonb), p_resumo, auth.uid(),
         coalesce(nullif(p_por, ''), (select name from public.profiles where id::text = auth.uid()::text))
    from public.alm_req_balcao r
   where r.id = p_requisicao;
end;
$$;
revoke all on function public.alm_req_balcao_log(uuid, text, jsonb, text, text) from public, anon, authenticated;

-- Diff de um campo: `[]` quando igual, `[{campo, de, para}]` quando mudou.
create or replace function public.alm_req_balcao_diff(p_campo text, p_de text, p_para text)
returns jsonb
language sql
immutable
as $$
  select case when p_de is not distinct from p_para then '[]'::jsonb
              else jsonb_build_array(jsonb_build_object('campo', p_campo, 'de', p_de, 'para', p_para)) end;
$$;

-- ---------------------------------------------------------------------
-- Salvar: mesma regra de antes + log (criação / edição com diff).
-- ---------------------------------------------------------------------
create or replace function public.alm_req_balcao_salvar(p_id uuid, p_req jsonb, p_itens jsonb)
returns public.alm_req_balcao
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.alm_req_balcao;
  v_old public.alm_req_balcao;
  v_data date := coalesce(nullif(p_req->>'data','')::date, current_date);
  v_tipo text := p_req->>'tipo_movimento';
  v_dep text := nullif(trim(p_req->>'deposito_origem'),'');
  v_dest text := nullif(trim(p_req->>'deposito_destino'),'');
  v_pep text := nullif(upper(trim(p_req->>'aplicacao_pep')),'');
  v_pep_nome text;
  v_item jsonb;
  v_ordem int := 0;
  v_mat text;
  v_qtd numeric;
  v_estoque record;
  v_itens_antes jsonb;
  v_itens_depois jsonb := '{}'::jsonb;
  v_diff jsonb := '[]'::jsonb;
  v_chave text;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if v_tipo not in ('saida','transferencia') then
    raise exception 'Escolha o tipo de movimento: saída ou transferência.';
  end if;
  if v_dep is null then
    raise exception 'Informe o depósito de saída.';
  end if;
  if v_tipo = 'transferencia' and v_dest is not null and v_dest = v_dep then
    raise exception 'O depósito de destino precisa ser diferente do de saída.';
  end if;
  if coalesce(trim(p_req->>'colaborador_nome'),'') = '' then
    raise exception 'Informe o colaborador que está retirando.';
  end if;
  if v_pep is null then
    raise exception 'Informe a aplicação (centro de custo / PEP).';
  end if;
  select nome into v_pep_nome from public.alm_balcao_aplicacoes where wbs = v_pep and ativo;
  if not found then
    raise exception 'PEP % não está na lista de aplicações do balcão.', v_pep;
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item.';
  end if;

  if p_id is null then
    insert into public.alm_req_balcao
      (codigo, data, turno, tipo_movimento, deposito_origem, deposito_destino,
       colaborador_id, colaborador_nome, colaborador_registro, aplicacao_pep, aplicacao,
       observacao, criado_por_id, criado_por_nome)
    values
      (public.alm_receb_proximo_codigo('RQB', v_data, 'alm_req_balcao'), v_data,
       nullif(p_req->>'turno',''), v_tipo, v_dep, case when v_tipo = 'transferencia' then v_dest end,
       nullif(p_req->>'colaborador_id','')::uuid, upper(trim(p_req->>'colaborador_nome')),
       nullif(p_req->>'colaborador_registro',''), v_pep, v_pep_nome,
       nullif(trim(p_req->>'observacao'),''), auth.uid(), nullif(p_req->>'criado_por_nome',''))
    returning * into v_row;
  else
    select * into v_old from public.alm_req_balcao where id = p_id and not excluido for update;
    if not found then
      raise exception 'Requisição não encontrada.';
    end if;
    if not public.form_pode_editar(v_old.criado_por_id::text) then
      raise exception 'Só quem registrou a requisição (ou um admin) pode editá-la.';
    end if;
    select coalesce(jsonb_object_agg(material, quantidade), '{}'::jsonb) into v_itens_antes
      from public.alm_req_balcao_itens where requisicao_id = p_id;

    update public.alm_req_balcao set
      data = v_data,
      turno = nullif(p_req->>'turno',''),
      tipo_movimento = v_tipo,
      deposito_origem = v_dep,
      deposito_destino = case when v_tipo = 'transferencia' then v_dest end,
      colaborador_id = nullif(p_req->>'colaborador_id','')::uuid,
      colaborador_nome = upper(trim(p_req->>'colaborador_nome')),
      colaborador_registro = nullif(p_req->>'colaborador_registro',''),
      aplicacao_setor_id = null,
      aplicacao_pep = v_pep,
      aplicacao = v_pep_nome,
      observacao = nullif(trim(p_req->>'observacao'),''),
      updated_at = now()
    where id = p_id
    returning * into v_row;
    delete from public.alm_req_balcao_itens where requisicao_id = p_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_mat := trim(v_item->>'material');
    v_qtd := nullif(v_item->>'quantidade','')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Item %: quantidade precisa ser maior que zero.', v_mat;
    end if;

    select max(txt_breve_material) as descricao, max(umb) as umb, sum(quantidade) as saldo
      into v_estoque
      from public.sap_zl0024_stk
     where material = v_mat
       and lpad(deposito, 4, '0') = lpad(v_dep, 4, '0');

    if v_estoque.saldo is null or v_estoque.saldo <= 0 then
      raise exception 'Material % não tem estoque no depósito % (ZL0024).', v_mat, v_dep;
    end if;
    if v_qtd > v_estoque.saldo then
      raise exception 'Material %: quantidade % maior que o saldo % no depósito %.', v_mat, v_qtd, v_estoque.saldo, v_dep;
    end if;

    insert into public.alm_req_balcao_itens
      (requisicao_id, ordem, material, descricao, unidade, quantidade, saldo_zl0024)
    values
      (v_row.id, v_ordem, v_mat, v_estoque.descricao, v_estoque.umb, v_qtd, v_estoque.saldo);
    v_itens_depois := v_itens_depois || jsonb_build_object(v_mat, v_qtd);
  end loop;

  if p_id is null then
    perform public.alm_req_balcao_log(v_row.id, 'criacao', '[]'::jsonb,
      format('Criada com %s item(ns).', v_ordem), p_req->>'criado_por_nome');
  else
    v_diff := public.alm_req_balcao_diff('Data', v_old.data::text, v_row.data::text)
      || public.alm_req_balcao_diff('Turno', v_old.turno, v_row.turno)
      || public.alm_req_balcao_diff('Tipo', v_old.tipo_movimento, v_row.tipo_movimento)
      || public.alm_req_balcao_diff('Depósito de saída', v_old.deposito_origem, v_row.deposito_origem)
      || public.alm_req_balcao_diff('Depósito de destino', v_old.deposito_destino, v_row.deposito_destino)
      || public.alm_req_balcao_diff('Colaborador', v_old.colaborador_nome, v_row.colaborador_nome)
      || public.alm_req_balcao_diff('Aplicação', v_old.aplicacao, v_row.aplicacao)
      || public.alm_req_balcao_diff('Observação', v_old.observacao, v_row.observacao);
    for v_chave in
      select k from jsonb_object_keys(v_itens_antes) k
      union select k from jsonb_object_keys(v_itens_depois) k
    loop
      v_diff := v_diff || public.alm_req_balcao_diff('Item ' || v_chave,
        v_itens_antes->>v_chave, v_itens_depois->>v_chave);
    end loop;
    perform public.alm_req_balcao_log(v_row.id, 'edicao', v_diff,
      case when jsonb_array_length(v_diff) = 0 then 'Salva sem alterações.'
           else format('%s alteração(ões).', jsonb_array_length(v_diff)) end,
      p_req->>'criado_por_nome');
  end if;

  return v_row;
end;
$$;

-- Doc. SAP manual — agora com log.
create or replace function public.alm_req_balcao_informar_doc_sap(p_ids uuid[], p_doc text, p_por text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc text := nullif(trim(p_doc),'');
  v_r record;
  v_n int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  for v_r in select id, doc_sap from public.alm_req_balcao where id = any(p_ids) and not excluido loop
    update public.alm_req_balcao set
      doc_sap = v_doc,
      doc_sap_em = case when v_doc is null then null else now() end,
      doc_sap_por = case when v_doc is null then null else p_por end
    where id = v_r.id;
    perform public.alm_req_balcao_log(v_r.id, 'doc_sap',
      public.alm_req_balcao_diff('Doc. SAP', v_r.doc_sap, v_doc),
      case when v_doc is null then 'Doc. SAP removido.' else 'Doc. SAP informado à mão.' end, p_por);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.alm_req_balcao_excluir(p_id uuid, p_por text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dono uuid;
begin
  select criado_por_id into v_dono from public.alm_req_balcao where id = p_id and not excluido;
  if not found then
    raise exception 'Requisição não encontrada.';
  end if;
  if not public.form_pode_editar(v_dono::text) then
    raise exception 'Só quem registrou a requisição (ou um admin) pode excluí-la.';
  end if;
  update public.alm_req_balcao
     set excluido = true, excluido_em = now(), excluido_por = p_por
   where id = p_id;
  perform public.alm_req_balcao_log(p_id, 'exclusao', '[]'::jsonb, 'Excluída (permanece no banco).', p_por);
end;
$$;

create or replace function public.alm_req_balcao_registrar_exportacao(p_ids uuid[], p_arquivo text, p_por text)
returns public.alm_req_balcao_exportacoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote public.alm_req_balcao_exportacoes;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Selecione ao menos uma requisição.';
  end if;

  insert into public.alm_req_balcao_exportacoes
    (arquivo, exportado_por_id, exportado_por_nome, total_requisicoes, total_itens, codigos)
  select p_arquivo, auth.uid(), p_por, count(*),
         (select count(*) from public.alm_req_balcao_itens i where i.requisicao_id = any(p_ids)),
         array_agg(r.codigo order by r.codigo)
    from public.alm_req_balcao r
   where r.id = any(p_ids) and not r.excluido
  returning * into v_lote;

  update public.alm_req_balcao set exportacao_id = v_lote.id
   where id = any(p_ids) and not excluido;

  for v_id in select id from public.alm_req_balcao where exportacao_id = v_lote.id loop
    perform public.alm_req_balcao_log(v_id, 'exportacao', '[]'::jsonb, 'Exportada em ' || p_arquivo || '.', p_por);
  end loop;

  return v_lote;
end;
$$;

create or replace function public.alm_req_balcao_reabrir_exportacao(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r record;
  v_n int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  for v_r in
    select r.id, e.arquivo from public.alm_req_balcao r
      left join public.alm_req_balcao_exportacoes e on e.id = r.exportacao_id
     where r.id = any(p_ids) and r.exportacao_id is not null
  loop
    update public.alm_req_balcao set exportacao_id = null where id = v_r.id;
    perform public.alm_req_balcao_log(v_r.id, 'reabertura', '[]'::jsonb,
      'Reaberta (saiu do lote ' || coalesce(v_r.arquivo, '—') || ').');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Importação da planilha concluída.
-- p_linhas: [{codigo, material, doc_sap, status}] — já casadas no cliente;
-- aqui confere de novo e grava. Devolve {requisicoes, itens, nao_encontrados}.
-- ---------------------------------------------------------------------
create or replace function public.alm_req_balcao_importar_sap(p_linhas jsonb, p_arquivo text, p_por text)
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
  v_itens int := 0;
  v_nao jsonb := '[]'::jsonb;
  v_tocadas uuid[] := '{}';
  v_diff jsonb;
  v_id uuid;
  v_docs text;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  for v_l in select * from jsonb_array_elements(p_linhas) loop
    v_doc := nullif(trim(v_l->>'doc_sap'), '');
    v_status := nullif(trim(v_l->>'status'), '');
    select * into v_req from public.alm_req_balcao
     where codigo = upper(trim(v_l->>'codigo')) and not excluido;
    if not found then
      v_nao := v_nao || to_jsonb(coalesce(v_l->>'codigo','') || ' / ' || coalesce(v_l->>'material',''));
      continue;
    end if;
    select * into v_item from public.alm_req_balcao_itens
     where requisicao_id = v_req.id and material = trim(v_l->>'material')
     order by ordem limit 1;
    if not found then
      v_nao := v_nao || to_jsonb(v_req.codigo || ' / ' || coalesce(v_l->>'material',''));
      continue;
    end if;

    v_diff := public.alm_req_balcao_diff('Doc. SAP item ' || v_item.material, v_item.doc_sap, coalesce(v_doc, v_item.doc_sap))
      || public.alm_req_balcao_diff('Status item ' || v_item.material, v_item.status_processamento,
                                    coalesce(v_status, v_item.status_processamento));
    if jsonb_array_length(v_diff) = 0 then continue; end if;

    update public.alm_req_balcao_itens set
      doc_sap = coalesce(v_doc, doc_sap),
      status_processamento = coalesce(v_status, status_processamento)
    where id = v_item.id;
    v_itens := v_itens + 1;
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

  return jsonb_build_object('requisicoes', coalesce(array_length(v_tocadas, 1), 0),
                            'itens', v_itens, 'nao_encontrados', v_nao);
end;
$$;

revoke all on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.alm_req_balcao_informar_doc_sap(uuid[], text, text) from public, anon;
revoke all on function public.alm_req_balcao_excluir(uuid, text) from public, anon;
revoke all on function public.alm_req_balcao_registrar_exportacao(uuid[], text, text) from public, anon;
revoke all on function public.alm_req_balcao_reabrir_exportacao(uuid[]) from public, anon;
revoke all on function public.alm_req_balcao_importar_sap(jsonb, text, text) from public, anon;
grant execute on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.alm_req_balcao_informar_doc_sap(uuid[], text, text) to authenticated;
grant execute on function public.alm_req_balcao_excluir(uuid, text) to authenticated;
grant execute on function public.alm_req_balcao_registrar_exportacao(uuid[], text, text) to authenticated;
grant execute on function public.alm_req_balcao_reabrir_exportacao(uuid[]) to authenticated;
grant execute on function public.alm_req_balcao_importar_sap(jsonb, text, text) to authenticated;
