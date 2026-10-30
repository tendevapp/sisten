-- Retirada sem saldo (RSS) baixada como TRANSFERÊNCIA.
--
-- A RQB pendente que nasce da RSS é uma saída, mas o almoxarife pode trocar o
-- tipo para transferência no formulário (o item foi para outro depósito, não
-- para um PEP). A RQB continua com origem/origem_ref = RSS e, confirmada, a RSS
-- é regularizada pelo alm_req_balcao_salvar como antes.
--
-- O que muda aqui: as rotinas que reescrevem os itens da RQB pendente
-- ("Dar baixa" reescolhe o depósito pelo saldo; editar a RSS ressincroniza os
-- itens e o PEP) respeitavam só a saída — apagavam o depósito de destino e
-- devolviam o PEP. Agora, se a RQB é transferência:
--   * o item mantém o destino (o do item, senão o do cabeçalho, senão 0105);
--   * PEP fica nulo e a aplicação 'Transferência';
--   * a escolha do depósito de saída pelo saldo não pega o próprio destino.
-- O 0105 (Transferência Produção) também deixa de ser escolhido como saída —
-- nunca há saída dele (DEPOSITOS_SEM_SAIDA no front).

create or replace function public.alm_sol_extra_itens_rqb(p_itens jsonb, p_rqb uuid, p_manter jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item jsonb;
  v_ordem int := 0;
  v_mat text;
  v_dep text;
  v_dest text;
  v_saldo numeric;
  v_desc text;
  v_umb text;
  v_tipo text;
  v_dest_cab text;
  v_transf boolean;
begin
  select tipo_movimento, deposito_destino into v_tipo, v_dest_cab from public.alm_req_balcao where id = p_rqb;
  v_transf := coalesce(v_tipo, 'saida') = 'transferencia';

  delete from public.alm_req_balcao_itens where requisicao_id = p_rqb;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_mat := ltrim(upper(trim(v_item->>'material')), '0');
    v_dest := case when v_transf
                   then coalesce(nullif(p_manter->v_mat->>'deposito_destino', ''), nullif(v_dest_cab, ''), '0105') end;
    v_dep := nullif(p_manter->v_mat->>'deposito', '');
    if v_dep is null then
      select s.deposito into v_dep from public.sap_zl0024_stk s
       where s.material = v_mat and s.quantidade > 0
         and lpad(s.deposito, 4, '0') <> '0105'
         and (v_dest is null or lpad(s.deposito, 4, '0') <> lpad(v_dest, 4, '0'))
       group by s.deposito order by sum(s.quantidade) desc limit 1;
    end if;
    v_dep := coalesce(v_dep, '0004');
    select coalesce(sum(quantidade), 0), max(txt_breve_material), max(umb) into v_saldo, v_desc, v_umb
      from public.sap_zl0024_stk where material = v_mat and lpad(deposito, 4, '0') = lpad(v_dep, 4, '0');
    insert into public.alm_req_balcao_itens
      (requisicao_id, ordem, material, descricao, unidade, quantidade, saldo_zl0024, aplicacao_pep, aplicacao, sem_saldo, deposito, deposito_destino)
    values
      (p_rqb, v_ordem, v_mat,
       coalesce(v_desc, nullif(trim(v_item->>'descricao'), ''), v_mat),
       coalesce(v_umb, nullif(trim(v_item->>'unidade'), ''), 'UN'),
       (v_item->>'quantidade')::numeric, v_saldo,
       case when v_transf then null else nullif(p_manter->v_mat->>'aplicacao_pep', '') end,
       case when v_transf then 'Transferência'
            else coalesce(nullif(p_manter->v_mat->>'aplicacao', ''), 'A definir na confirmação') end,
       v_saldo < (v_item->>'quantidade')::numeric, v_dep, v_dest);
  end loop;
  return v_ordem;
end;
$function$;

create or replace function public.alm_sol_extra_atualizar_depositos_rqb(p_codigo_rss text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
         coalesce(jsonb_object_agg(material, jsonb_build_object('aplicacao_pep', aplicacao_pep, 'aplicacao', aplicacao,
                                                                'deposito_destino', deposito_destino)), '{}'::jsonb)
    into v_itens, v_manter
    from public.alm_req_balcao_itens where requisicao_id = v_rqb.id;
  perform public.alm_sol_extra_itens_rqb(v_itens, v_rqb.id, v_manter);
  select deposito into v_dep from public.alm_req_balcao_itens where requisicao_id = v_rqb.id order by ordem limit 1;
  update public.alm_req_balcao set deposito_origem = coalesce(v_dep, deposito_origem), updated_at = now() where id = v_rqb.id;
  return v_rqb.codigo;
end;
$function$;

create or replace function public.alm_sol_extra_sincronizar_rqb()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rqb public.alm_req_balcao;
  v_manter jsonb;
  v_pep text;
  v_aplicacao text;
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
      return new;
    elsif new.itens is distinct from old.itens
       or new.retirante_nome is distinct from old.retirante_nome
       or new.retirante_id is distinct from old.retirante_id then
      select coalesce(jsonb_object_agg(material, jsonb_build_object('deposito', deposito, 'deposito_destino', deposito_destino,
                                                                    'aplicacao_pep', aplicacao_pep, 'aplicacao', aplicacao)), '{}'::jsonb)
        into v_manter from public.alm_req_balcao_itens where requisicao_id = v_rqb.id;
      perform public.alm_sol_extra_itens_rqb(new.itens, v_rqb.id, v_manter);
      update public.alm_req_balcao set
        colaborador_id = new.retirante_id, colaborador_nome = upper(trim(new.retirante_nome)),
        colaborador_registro = new.retirante_matricula, updated_at = now()
       where id = v_rqb.id;
      perform public.alm_req_balcao_log(v_rqb.id, 'edicao', '[]'::jsonb, format('Itens/colaborador atualizados a partir da retirada %s.', new.codigo), null);
    end if;

    -- Transferência não tem PEP: a troca de PEP na RSS só vale para a RQB de saída.
    if v_rqb.tipo_movimento = 'saida' then
      v_pep := nullif(trim(new.aplicacao_pep), '');
      v_aplicacao := coalesce(nullif(trim(new.aplicacao), ''), 'A definir na confirmação');
      if new.aplicacao_pep is distinct from old.aplicacao_pep or new.aplicacao is distinct from old.aplicacao then
        update public.alm_req_balcao set aplicacao_pep = v_pep, aplicacao = v_aplicacao, updated_at = now() where id = v_rqb.id;
        update public.alm_req_balcao_itens set aplicacao_pep = v_pep, aplicacao = v_aplicacao where requisicao_id = v_rqb.id;
        perform public.alm_req_balcao_log(v_rqb.id, 'edicao',
          jsonb_build_array(jsonb_build_object('campo', 'aplicacao_pep', 'de', old.aplicacao_pep, 'para', v_pep)),
          format('PEP atualizado a partir da retirada %s.', new.codigo), null);
      elsif v_pep is not null and new.itens is distinct from old.itens then
        update public.alm_req_balcao_itens set aplicacao_pep = v_pep, aplicacao = v_aplicacao
         where requisicao_id = v_rqb.id and aplicacao_pep is null;
      end if;
    end if;
  exception when others then
    raise warning 'alm_sol_extra: falha ao sincronizar a requisição no balcão de %: %', new.codigo, sqlerrm;
  end;
  return new;
end;
$function$;
