-- =====================================================================
-- Requisição no Balcão: a aplicação passa a ser o Elemento PEP (fin_pep),
-- não o setor do RH. É o PEP que o SAP pede na baixa para consumo, e é por
-- ele que a análise de saídas (MB51) agrupa o custo.
--
-- `aplicacao_pep` guarda o WBS; `aplicacao` continua com o texto exibido
-- (a descrição do PEP), copiado de `fin_pep` na gravação para o registro
-- não mudar se o cadastro for reimportado. `aplicacao_setor_id` fica sem
-- uso (mantida por não haver dado a migrar).
-- =====================================================================

alter table public.alm_req_balcao add column if not exists aplicacao_pep text;
create index if not exists idx_alm_req_balcao_pep on public.alm_req_balcao (aplicacao_pep) where not excluido;

create or replace function public.alm_req_balcao_salvar(p_id uuid, p_req jsonb, p_itens jsonb)
returns public.alm_req_balcao
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.alm_req_balcao;
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
    raise exception 'Informe a aplicação (elemento PEP).';
  end if;
  select coalesce(nome, wbs_element) into v_pep_nome from public.fin_pep where wbs_element = v_pep;
  if not found then
    raise exception 'Elemento PEP % não está no cadastro.', v_pep;
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
       nullif(p_req->>'colaborador_registro',''), v_pep, upper(v_pep_nome),
       nullif(trim(p_req->>'observacao'),''), auth.uid(), nullif(p_req->>'criado_por_nome',''))
    returning * into v_row;
  else
    select * into v_row from public.alm_req_balcao where id = p_id and not excluido for update;
    if not found then
      raise exception 'Requisição não encontrada.';
    end if;
    if not public.form_pode_editar(v_row.criado_por_id::text) then
      raise exception 'Só quem registrou a requisição (ou um admin) pode editá-la.';
    end if;
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
      aplicacao = upper(v_pep_nome),
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
  end loop;

  return v_row;
end;
$$;

revoke all on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.alm_req_balcao_salvar(uuid, jsonb, jsonb) to authenticated;
