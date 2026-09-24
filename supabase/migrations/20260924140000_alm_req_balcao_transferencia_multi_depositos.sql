-- =====================================================================
-- Requisição no Balcão: transferência sem PEP e com grupos de múltiplos depósitos.
--
-- 1) `alm_req_balcao_itens`:
--    - Adiciona coluna `deposito text` para saber o depósito de saída de cada item.
--
-- 2) `alm_req_balcao_salvar`:
--    - Para `tipo_movimento = 'transferencia'`, PEP deixa de ser obrigatório
--      (preenche com 'Transferência entre depósitos').
--    - Cada item consulta e grava o saldo no seu respectivo depósito (`deposito`).
-- =====================================================================

alter table public.alm_req_balcao_itens
  add column if not exists deposito text,
  add column if not exists deposito_destino text;

create index if not exists idx_alm_req_balcao_itens_deposito
  on public.alm_req_balcao_itens (deposito);

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
  v_item_dep text;
  v_item_dest text;
  v_item_pep text;
  v_item_pep_nome text;
  v_estoque record;
  v_estoque_geral record;
  v_desc text;
  v_umb text;
  v_saldo numeric;
  v_sem_saldo boolean;
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

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item.';
  end if;

  -- Se v_dep estiver vazio no cabeçalho, tenta obter do primeiro item
  if v_dep is null and jsonb_typeof(p_itens) = 'array' and jsonb_array_length(p_itens) > 0 then
    v_dep := nullif(trim((p_itens->0)->>'deposito'), '');
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

  if v_tipo = 'saida' then
    -- Em saída, PEP é obrigatório
    if v_pep is null and jsonb_typeof(p_itens) = 'array' and jsonb_array_length(p_itens) > 0 then
      v_pep := nullif(upper(trim((p_itens->0)->>'aplicacao_pep')), '');
    end if;

    if v_pep is null then
      raise exception 'Informe a aplicação (centro de custo / PEP).';
    end if;

    select nome into v_pep_nome from public.alm_balcao_aplicacoes where wbs = v_pep and ativo;
    if v_pep_nome is null then
      v_pep_nome := coalesce(nullif(trim(p_req->>'aplicacao'), ''), v_pep);
    end if;
  else
    -- Em transferência, PEP não se aplica
    v_pep := null;
    v_pep_nome := coalesce(nullif(trim(p_req->>'aplicacao'), ''), 'Transferência entre depósitos');
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

    -- Depósito do item
    v_item_dep := coalesce(nullif(trim(v_item->>'deposito'), ''), v_dep);

    if v_tipo = 'saida' then
      v_item_pep := nullif(upper(trim(v_item->>'aplicacao_pep')), '');
      if v_item_pep is null then
        v_item_pep := v_pep;
      end if;

      v_item_pep_nome := nullif(trim(v_item->>'aplicacao'), '');
      if v_item_pep_nome is null then
        select nome into v_item_pep_nome from public.alm_balcao_aplicacoes where wbs = v_item_pep and ativo;
        if v_item_pep_nome is null then
          v_item_pep_nome := case when v_item_pep = v_pep then v_pep_nome else v_item_pep end;
        end if;
      end if;
    else
      v_item_pep := null;
      v_item_pep_nome := 'Transferência';
    end if;

    select max(txt_breve_material) as descricao, max(umb) as umb, sum(quantidade) as saldo
      into v_estoque
      from public.sap_zl0024_stk
     where material = v_mat
       and lpad(deposito, 4, '0') = lpad(v_item_dep, 4, '0');

    v_saldo := coalesce(v_estoque.saldo, 0);
    v_desc := v_estoque.descricao;
    v_umb := v_estoque.umb;

    if v_desc is null then
      select max(txt_breve_material) as descricao, max(umb) as umb
        into v_estoque_geral
        from public.sap_zl0024_stk
       where material = v_mat;
      v_desc := coalesce(v_estoque_geral.descricao, nullif(trim(v_item->>'descricao'), ''), v_mat);
      v_umb := coalesce(v_estoque_geral.umb, nullif(trim(v_item->>'unidade'), ''), 'UN');
    end if;

    -- Depósito de destino do item (se transferência)
    v_item_dest := case when v_tipo = 'transferencia' then coalesce(nullif(trim(v_item->>'deposito_destino'), ''), v_dest) else null end;

    -- Sinaliza item sem saldo se o saldo for zero/nulo ou inferior à quantidade
    v_sem_saldo := (v_saldo <= 0 or v_qtd > v_saldo);

    insert into public.alm_req_balcao_itens
      (requisicao_id, ordem, material, descricao, unidade, quantidade, saldo_zl0024, aplicacao_pep, aplicacao, sem_saldo, deposito, deposito_destino)
    values
      (v_row.id, v_ordem, v_mat, v_desc, coalesce(v_umb, 'UN'), v_qtd, v_saldo, v_item_pep, v_item_pep_nome, v_sem_saldo, v_item_dep, v_item_dest);

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

revoke all on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) to authenticated;
