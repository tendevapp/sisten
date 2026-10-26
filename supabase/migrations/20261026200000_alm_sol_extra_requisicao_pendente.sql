-- =====================================================================
-- Retirada sem saldo (RSS) → Requisição no Balcão pendente, na hora
-- =====================================================================
-- Mesmo mecanismo da Ficha de EPI: registrou a retirada sem saldo, nasce a
-- Requisição no Balcão (RQB) PENDENTE DE CONFIRMAÇÃO com quem retirou e os
-- itens (origem 'sol_extra_sem_saldo', origem_ref = código RSS). Por trigger,
-- para valer também quando o registro chega pela fila offline.
--
-- O PEP fica em aberto ('A definir na confirmação'): quem confirma no
-- almoxarifado escolhe. Por isso `alm_req_balcao_salvar` passa a aceitar saída
-- sem PEP enquanto a requisição continua pendente.
--
-- Confirmar a RQB de uma retirada sem saldo exige saldo na ZL0024 para cada
-- item, no depósito escolhido (é o que comprova que a NF entrou). Confirmada,
-- a RSS vira REGULARIZADA ("Baixada no balcão") com o código da RQB.
--
-- Enquanto a RQB está pendente: excluir a RSS exclui a RQB; editar os itens
-- da RSS refaz os itens da RQB (mantendo depósito e PEP já escolhidos).

-- ---------------------------------------------------------------------------
-- Criação/sincronização da RQB pendente (sem depender de sessão: a migration
-- e a fila offline também passam por aqui)
-- ---------------------------------------------------------------------------

create or replace function public.alm_sol_extra_itens_rqb(p_itens jsonb, p_rqb uuid, p_manter jsonb default '{}'::jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_ordem int := 0;
  v_mat text;
  v_dep text;
  v_saldo numeric;
  v_desc text;
  v_umb text;
begin
  delete from public.alm_req_balcao_itens where requisicao_id = p_rqb;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_mat := ltrim(upper(trim(v_item->>'material')), '0');
    -- Depósito: o que já tinha sido escolhido na RQB; senão o de maior saldo; senão o central (0004).
    v_dep := nullif(p_manter->v_mat->>'deposito', '');
    if v_dep is null then
      select s.deposito into v_dep from public.sap_zl0024_stk s
       where s.material = v_mat and s.quantidade > 0
       group by s.deposito order by sum(s.quantidade) desc limit 1;
    end if;
    v_dep := coalesce(v_dep, '0004');
    select coalesce(sum(quantidade), 0), max(txt_breve_material), max(umb) into v_saldo, v_desc, v_umb
      from public.sap_zl0024_stk where material = v_mat and lpad(deposito, 4, '0') = lpad(v_dep, 4, '0');
    insert into public.alm_req_balcao_itens
      (requisicao_id, ordem, material, descricao, unidade, quantidade, saldo_zl0024, aplicacao_pep, aplicacao, sem_saldo, deposito)
    values
      (p_rqb, v_ordem, v_mat,
       coalesce(v_desc, nullif(trim(v_item->>'descricao'), ''), v_mat),
       coalesce(v_umb, nullif(trim(v_item->>'unidade'), ''), 'UN'),
       (v_item->>'quantidade')::numeric, v_saldo,
       nullif(p_manter->v_mat->>'aplicacao_pep', ''), coalesce(nullif(p_manter->v_mat->>'aplicacao', ''), 'A definir na confirmação'),
       v_saldo < (v_item->>'quantidade')::numeric, v_dep);
  end loop;
  return v_ordem;
end;
$$;

revoke all on function public.alm_sol_extra_itens_rqb(jsonb, uuid, jsonb) from public, anon, authenticated;

create or replace function public.alm_sol_extra_criar_rqb(p_sol public.alm_solicitacao_extra)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_dep text;
begin
  if p_sol.tipo <> 'SEM_SALDO' or p_sol.codigo is null then
    return null;
  end if;
  select id into v_id from public.alm_req_balcao where origem = 'sol_extra_sem_saldo' and origem_ref = p_sol.codigo and not excluido limit 1;
  if v_id is not null then
    return v_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('alm_req_balcao_codigo'));
  insert into public.alm_req_balcao
    (codigo, data, tipo_movimento, deposito_origem, colaborador_id, colaborador_nome, colaborador_registro,
     aplicacao_pep, aplicacao, observacao, criado_por_id, criado_por_nome, pendente_confirmacao, origem, origem_ref)
  values
    (public.alm_receb_proximo_codigo('RQB', p_sol.data, 'alm_req_balcao'), p_sol.data, 'saida', '0004',
     p_sol.retirante_id, upper(trim(p_sol.retirante_nome)), p_sol.retirante_matricula,
     null, 'A definir na confirmação',
     format('Retirada sem saldo %s (%s%s). Confirme quando a NF for lançada e o item tiver saldo na ZL0024.',
            p_sol.codigo, to_char(p_sol.data, 'DD/MM/YYYY'),
            case when p_sol.setor_solicitante_nome is not null then ', setor ' || p_sol.setor_solicitante_nome else '' end),
     nullif(p_sol.criado_por, '')::uuid, p_sol.criado_por_nome, true, 'sol_extra_sem_saldo', p_sol.codigo)
  returning id into v_id;

  perform public.alm_sol_extra_itens_rqb(p_sol.itens, v_id);
  select deposito into v_dep from public.alm_req_balcao_itens where requisicao_id = v_id order by ordem limit 1;
  update public.alm_req_balcao set deposito_origem = coalesce(v_dep, '0004') where id = v_id;

  perform public.alm_req_balcao_log(v_id, 'criacao', '[]'::jsonb,
    format('Gerada pela retirada sem saldo %s com %s item(ns) — pendente de confirmação.', p_sol.codigo, jsonb_array_length(p_sol.itens)),
    p_sol.criado_por_nome);
  return v_id;
end;
$$;

revoke all on function public.alm_sol_extra_criar_rqb(public.alm_solicitacao_extra) from public, anon, authenticated;

create or replace function public.alm_sol_extra_sincronizar_rqb()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rqb public.alm_req_balcao;
  v_manter jsonb;
begin
  if new.tipo <> 'SEM_SALDO' then
    return new;
  end if;
  begin
    if tg_op = 'INSERT' then
      perform public.alm_sol_extra_criar_rqb(new);
      return new;
    end if;

    select * into v_rqb from public.alm_req_balcao
     where origem = 'sol_extra_sem_saldo' and origem_ref = new.codigo and not excluido and pendente_confirmacao
     limit 1;
    if not found then
      return new;
    end if;

    if new.excluido_em is not null and old.excluido_em is null then
      update public.alm_req_balcao set excluido = true, excluido_em = now(), excluido_por = new.excluido_por, updated_at = now() where id = v_rqb.id;
      perform public.alm_req_balcao_log(v_rqb.id, 'exclusao', '[]'::jsonb, format('Excluída junto com a retirada sem saldo %s.', new.codigo), null);
    elsif new.itens is distinct from old.itens
       or new.retirante_nome is distinct from old.retirante_nome
       or new.retirante_id is distinct from old.retirante_id then
      select coalesce(jsonb_object_agg(material, jsonb_build_object('deposito', deposito, 'aplicacao_pep', aplicacao_pep, 'aplicacao', aplicacao)), '{}'::jsonb)
        into v_manter from public.alm_req_balcao_itens where requisicao_id = v_rqb.id;
      perform public.alm_sol_extra_itens_rqb(new.itens, v_rqb.id, v_manter);
      update public.alm_req_balcao set
        colaborador_id = new.retirante_id, colaborador_nome = upper(trim(new.retirante_nome)),
        colaborador_registro = new.retirante_matricula, updated_at = now()
       where id = v_rqb.id;
      perform public.alm_req_balcao_log(v_rqb.id, 'edicao', '[]'::jsonb, format('Itens/colaborador atualizados a partir da retirada %s.', new.codigo), null);
    end if;
  exception when others then
    -- A requisição é consequência: falhar nela não pode travar o registro da retirada.
    raise warning 'alm_sol_extra: falha ao sincronizar a requisição no balcão de %: %', new.codigo, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_alm_sol_extra_rqb on public.alm_solicitacao_extra;
create trigger trg_alm_sol_extra_rqb
  after insert or update on public.alm_solicitacao_extra
  for each row execute function public.alm_sol_extra_sincronizar_rqb();

-- ---------------------------------------------------------------------------
-- Requisição no Balcão: PEP opcional enquanto pendente; saldo obrigatório para
-- confirmar a de retirada sem saldo; confirmada, baixa a RSS.
-- ---------------------------------------------------------------------------

create or replace function public.alm_req_balcao_salvar(p_id uuid, p_req jsonb, p_itens jsonb)
returns alm_req_balcao
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row public.alm_req_balcao;
  v_old public.alm_req_balcao;
  v_data date := coalesce(nullif(p_req->>'data','')::date, current_date);
  v_tipo text := p_req->>'tipo_movimento';
  v_dep text := nullif(trim(p_req->>'deposito_origem'),'');
  v_dest text := nullif(trim(p_req->>'deposito_destino'),'');
  v_pep text := nullif(upper(trim(p_req->>'aplicacao_pep')),'');
  v_pep_nome text;
  v_pendente boolean := coalesce((p_req->>'pendente_confirmacao')::boolean, false);
  v_confirmar boolean := coalesce((p_req->>'confirmar')::boolean, false);
  v_fica_pendente boolean;
  v_confirmando boolean := false;
  v_sem_saldo_lista text := null;
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

  if p_id is not null then
    select * into v_old from public.alm_req_balcao where id = p_id and not excluido for update;
    if not found then
      raise exception 'Requisição não encontrada.';
    end if;
    v_fica_pendente := v_old.pendente_confirmacao and not v_confirmar;
    v_confirmando := v_old.pendente_confirmacao and v_confirmar;
  else
    v_fica_pendente := v_pendente;
  end if;

  if v_tipo = 'saida' then
    if v_pep is null and jsonb_typeof(p_itens) = 'array' and jsonb_array_length(p_itens) > 0 then
      v_pep := nullif(upper(trim((p_itens->0)->>'aplicacao_pep')), '');
    end if;

    -- PEP só é exigido de quem vai para a exportação; a pendente pode esperar a confirmação.
    if v_pep is null and not v_fica_pendente then
      raise exception 'Informe a aplicação (centro de custo / PEP).';
    end if;

    if v_pep is null then
      v_pep_nome := 'A definir na confirmação';
    else
      select nome into v_pep_nome from public.alm_balcao_aplicacoes where wbs = v_pep and ativo;
      if v_pep_nome is null then
        v_pep_nome := coalesce(nullif(trim(p_req->>'aplicacao'), ''), v_pep);
      end if;
    end if;
  else
    v_pep := null;
    v_pep_nome := coalesce(nullif(trim(p_req->>'aplicacao'), ''), 'Transferência entre depósitos');
  end if;

  if p_id is null then
    insert into public.alm_req_balcao
      (codigo, data, turno, tipo_movimento, deposito_origem, deposito_destino,
       colaborador_id, colaborador_nome, colaborador_registro, aplicacao_pep, aplicacao,
       observacao, criado_por_id, criado_por_nome,
       pendente_confirmacao, origem, origem_ref)
    values
      (public.alm_receb_proximo_codigo('RQB', v_data, 'alm_req_balcao'), v_data,
       nullif(p_req->>'turno',''), v_tipo, v_dep, case when v_tipo = 'transferencia' then v_dest end,
       nullif(p_req->>'colaborador_id','')::uuid, upper(trim(p_req->>'colaborador_nome')),
       nullif(p_req->>'colaborador_registro',''), v_pep, v_pep_nome,
       nullif(trim(p_req->>'observacao'),''), auth.uid(), nullif(p_req->>'criado_por_nome',''),
       v_pendente, nullif(p_req->>'origem',''), nullif(p_req->>'origem_ref',''))
    returning * into v_row;
  else
    if not v_old.pendente_confirmacao and not public.form_pode_editar(v_old.criado_por_id::text) then
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
      pendente_confirmacao = case when v_confirmando then false else v_old.pendente_confirmacao end,
      confirmada_por = case when v_confirmando
                            then coalesce(nullif(p_req->>'criado_por_nome',''), v_old.confirmada_por) else v_old.confirmada_por end,
      confirmada_em = case when v_confirmando then now() else v_old.confirmada_em end,
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

    v_item_dep := coalesce(nullif(trim(v_item->>'deposito'), ''), v_dep);

    if v_tipo = 'saida' then
      v_item_pep := nullif(upper(trim(v_item->>'aplicacao_pep')), '');
      if v_item_pep is null then
        v_item_pep := v_pep;
      end if;

      v_item_pep_nome := nullif(trim(v_item->>'aplicacao'), '');
      if v_item_pep_nome is null or (v_item_pep is not null and v_item_pep_nome = 'A definir na confirmação') then
        select nome into v_item_pep_nome from public.alm_balcao_aplicacoes where wbs = v_item_pep and ativo;
        if v_item_pep_nome is null then
          v_item_pep_nome := case when v_item_pep = v_pep then v_pep_nome else coalesce(v_item_pep, v_pep_nome) end;
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

    v_item_dest := case when v_tipo = 'transferencia' then coalesce(nullif(trim(v_item->>'deposito_destino'), ''), v_dest) else null end;

    v_sem_saldo := (v_saldo <= 0 or v_qtd > v_saldo);
    if v_sem_saldo then
      v_sem_saldo_lista := concat_ws('; ', v_sem_saldo_lista, format('%s (precisa %s, saldo %s no depósito %s)', v_mat, v_qtd, v_saldo, v_item_dep));
    end if;

    insert into public.alm_req_balcao_itens
      (requisicao_id, ordem, material, descricao, unidade, quantidade, saldo_zl0024, aplicacao_pep, aplicacao, sem_saldo, deposito, deposito_destino)
    values
      (v_row.id, v_ordem, v_mat, v_desc, coalesce(v_umb, 'UN'), v_qtd, v_saldo, v_item_pep, v_item_pep_nome, v_sem_saldo, v_item_dep, v_item_dest);

    v_itens_depois := v_itens_depois || jsonb_build_object(v_mat, v_qtd);
  end loop;

  -- Retirada sem saldo só se confirma com o saldo da ZL0024 cobrindo cada item:
  -- é o que mostra que a NF entrou. (A exceção desfaz tudo o que foi gravado acima.)
  if v_confirmando and v_old.origem = 'sol_extra_sem_saldo' and v_sem_saldo_lista is not null then
    raise exception 'Ainda sem saldo na ZL0024 para confirmar: %. Aguarde a NF ser lançada (ou troque o depósito) e confirme depois.', v_sem_saldo_lista
      using errcode = 'P0001';
  end if;

  if p_id is null then
    perform public.alm_req_balcao_log(v_row.id, 'criacao', '[]'::jsonb,
      case when v_pendente
           then format('Gerada por %s com %s item(ns) — pendente de confirmação.',
                       coalesce(nullif(p_req->>'origem_ref',''), 'outro formulário'), v_ordem)
           else format('Criada com %s item(ns).', v_ordem) end,
      p_req->>'criado_por_nome');
  else
    v_diff := public.alm_req_balcao_diff('Data', v_old.data::text, v_row.data::text)
      || public.alm_req_balcao_diff('Turno', v_old.turno, v_row.turno)
      || public.alm_req_balcao_diff('Tipo', v_old.tipo_movimento, v_row.tipo_movimento)
      || public.alm_req_balcao_diff('Depósito de saída', v_old.deposito_origem, v_row.deposito_origem)
      || public.alm_req_balcao_diff('Depósito de destino', v_old.deposito_destino, v_row.deposito_destino)
      || public.alm_req_balcao_diff('Colaborador', v_old.colaborador_nome, v_row.colaborador_nome)
      || public.alm_req_balcao_diff('Aplicação', v_old.aplicacao, v_row.aplicacao)
      || public.alm_req_balcao_diff('Observação', v_old.observacao, v_row.observacao)
      || case when v_old.pendente_confirmacao and not v_row.pendente_confirmacao
              then public.alm_req_balcao_diff('Confirmação para exportação', 'pendente', 'confirmada')
              else '[]'::jsonb end;
    for v_chave in
      select k from jsonb_object_keys(v_itens_antes) k
      union select k from jsonb_object_keys(v_itens_depois) k
    loop
      v_diff := v_diff || public.alm_req_balcao_diff('Item ' || v_chave,
        v_itens_antes->>v_chave, v_itens_depois->>v_chave);
    end loop;
    perform public.alm_req_balcao_log(v_row.id, 'edicao', v_diff,
      case when v_old.pendente_confirmacao and not v_row.pendente_confirmacao
                then 'Confirmada e liberada para exportação.'
           when jsonb_array_length(v_diff) = 0 then 'Salva sem alterações.'
           else format('%s alteração(ões).', jsonb_array_length(v_diff)) end,
      p_req->>'criado_por_nome');
  end if;

  -- Confirmada a RQB da retirada sem saldo: a retirada fica baixada no balcão.
  if v_confirmando and v_old.origem = 'sol_extra_sem_saldo' and v_old.origem_ref is not null then
    perform set_config('sisten.alm_sol_extra_rpc', '1', true);
    update public.alm_solicitacao_extra set
      status = 'REGULARIZADA',
      requisicao_balcao_codigo = v_row.codigo,
      regularizado_por = (auth.uid())::text,
      regularizado_por_nome = coalesce(nullif(p_req->>'criado_por_nome',''), (select name from public.core_perfis where id = (auth.uid())::text)),
      regularizado_em = now(),
      regularizacao_obs = 'Requisição no balcão confirmada com saldo na ZL0024.'
    where codigo = v_old.origem_ref and tipo = 'SEM_SALDO' and status = 'PENDENTE' and excluido_em is null;
    perform set_config('sisten.alm_sol_extra_rpc', '', true);
  end if;

  return v_row;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Retiradas já registradas sem requisição (antes desta migration)
-- ---------------------------------------------------------------------------

select public.alm_sol_extra_criar_rqb(s)
  from public.alm_solicitacao_extra s
 where s.tipo = 'SEM_SALDO' and s.status = 'PENDENTE' and s.excluido_em is null
   and not exists (select 1 from public.alm_req_balcao r where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = s.codigo and not r.excluido);

-- Ao abrir a baixa: a RQB pendente nasceu no 0004 (sem saldo em lugar nenhum).
-- Quando a NF entra, o saldo pode estar em outro depósito — reescolhe o
-- depósito de cada item pelo saldo atual, mantendo o PEP já escolhido.
create or replace function public.alm_sol_extra_atualizar_depositos_rqb(p_codigo_rss text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rqb public.alm_req_balcao;
  v_itens jsonb;
  v_manter jsonb;
  v_dep text;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  select * into v_rqb from public.alm_req_balcao
   where origem = 'sol_extra_sem_saldo' and origem_ref = p_codigo_rss and not excluido and pendente_confirmacao limit 1;
  if not found then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('material', material, 'descricao', descricao, 'unidade', unidade, 'quantidade', quantidade) order by ordem), '[]'::jsonb),
         coalesce(jsonb_object_agg(material, jsonb_build_object('aplicacao_pep', aplicacao_pep, 'aplicacao', aplicacao)), '{}'::jsonb)
    into v_itens, v_manter
    from public.alm_req_balcao_itens where requisicao_id = v_rqb.id;
  perform public.alm_sol_extra_itens_rqb(v_itens, v_rqb.id, v_manter);
  select deposito into v_dep from public.alm_req_balcao_itens where requisicao_id = v_rqb.id order by ordem limit 1;
  update public.alm_req_balcao set deposito_origem = coalesce(v_dep, deposito_origem), updated_at = now() where id = v_rqb.id;
  return v_rqb.codigo;
end;
$$;

revoke all on function public.alm_sol_extra_atualizar_depositos_rqb(text) from public, anon;
grant execute on function public.alm_sol_extra_atualizar_depositos_rqb(text) to authenticated;
