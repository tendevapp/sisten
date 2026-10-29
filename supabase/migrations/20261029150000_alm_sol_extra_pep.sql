-- Solicitação Extraordinária: PEP (aplicação) escolhido já no registro.
--
-- Na retirada sem saldo (RSS) o PEP vai direto para a Requisição no Balcão
-- pendente que nasce junto (cabeçalho e itens) — na baixa o almoxarifado só
-- confere. Sem PEP escolhido segue como antes: "A definir na confirmação".
-- Editar o PEP da RSS enquanto a requisição está pendente atualiza a
-- requisição. Na de Projeto o PEP fica registrado para a regularização no SAP.

alter table public.alm_solicitacao_extra
  add column if not exists aplicacao_pep text,
  add column if not exists aplicacao text;

comment on column public.alm_solicitacao_extra.aplicacao_pep is 'PEP (WBS) da saída — lista alm_balcao_aplicacoes.';
comment on column public.alm_solicitacao_extra.aplicacao is 'Nome da aplicação do PEP.';

CREATE OR REPLACE FUNCTION public.alm_sol_extra_criar_rqb(p_sol alm_solicitacao_extra)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_dep text;
  v_pep text := nullif(trim(p_sol.aplicacao_pep), '');
  v_aplicacao text := coalesce(nullif(trim(p_sol.aplicacao), ''), 'A definir na confirmação');
  v_manter jsonb := '{}'::jsonb;
begin
  if p_sol.tipo <> 'SEM_SALDO' or p_sol.codigo is null then
    return null;
  end if;
  select id into v_id from public.alm_req_balcao where origem = 'sol_extra_sem_saldo' and origem_ref = p_sol.codigo and not excluido limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- PEP da retirada vale para todos os itens (chave = material como alm_sol_extra_itens_rqb normaliza).
  if v_pep is not null then
    select coalesce(jsonb_object_agg(ltrim(upper(trim(x->>'material')), '0'),
                                     jsonb_build_object('aplicacao_pep', v_pep, 'aplicacao', v_aplicacao)), '{}'::jsonb)
      into v_manter
      from jsonb_array_elements(p_sol.itens) x;
  end if;

  perform pg_advisory_xact_lock(hashtext('alm_req_balcao_codigo'));
  insert into public.alm_req_balcao
    (codigo, data, tipo_movimento, deposito_origem, colaborador_id, colaborador_nome, colaborador_registro,
     aplicacao_pep, aplicacao, observacao, criado_por_id, criado_por_nome, pendente_confirmacao, origem, origem_ref)
  values
    (public.alm_receb_proximo_codigo('RQB', p_sol.data, 'alm_req_balcao'), p_sol.data, 'saida', '0004',
     p_sol.retirante_id, upper(trim(p_sol.retirante_nome)), p_sol.retirante_matricula,
     v_pep, v_aplicacao,
     format('Retirada sem saldo %s (%s%s). Confirme quando a NF for lançada e o item tiver saldo na ZL0024.',
            p_sol.codigo, to_char(p_sol.data, 'DD/MM/YYYY'),
            case when p_sol.setor_solicitante_nome is not null then ', setor ' || p_sol.setor_solicitante_nome else '' end),
     nullif(p_sol.criado_por, '')::uuid, p_sol.criado_por_nome, true, 'sol_extra_sem_saldo', p_sol.codigo)
  returning id into v_id;

  perform public.alm_sol_extra_itens_rqb(p_sol.itens, v_id, v_manter);
  select deposito into v_dep from public.alm_req_balcao_itens where requisicao_id = v_id order by ordem limit 1;
  update public.alm_req_balcao set deposito_origem = coalesce(v_dep, '0004') where id = v_id;

  perform public.alm_req_balcao_log(v_id, 'criacao', '[]'::jsonb,
    format('Gerada pela retirada sem saldo %s com %s item(ns) — pendente de confirmação.', p_sol.codigo, jsonb_array_length(p_sol.itens)),
    p_sol.criado_por_nome);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.alm_sol_extra_sincronizar_rqb()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      select coalesce(jsonb_object_agg(material, jsonb_build_object('deposito', deposito, 'aplicacao_pep', aplicacao_pep, 'aplicacao', aplicacao)), '{}'::jsonb)
        into v_manter from public.alm_req_balcao_itens where requisicao_id = v_rqb.id;
      perform public.alm_sol_extra_itens_rqb(new.itens, v_rqb.id, v_manter);
      update public.alm_req_balcao set
        colaborador_id = new.retirante_id, colaborador_nome = upper(trim(new.retirante_nome)),
        colaborador_registro = new.retirante_matricula, updated_at = now()
       where id = v_rqb.id;
      perform public.alm_req_balcao_log(v_rqb.id, 'edicao', '[]'::jsonb, format('Itens/colaborador atualizados a partir da retirada %s.', new.codigo), null);
    end if;

    -- PEP da retirada: trocado leva a requisição inteira; item novo herda o PEP.
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
  exception when others then
    raise warning 'alm_sol_extra: falha ao sincronizar a requisição no balcão de %: %', new.codigo, sqlerrm;
  end;
  return new;
end;
$function$;
