-- Retirada sem saldo (RSS): saída ou transferência escolhida no registro.
--
-- Antes a Requisição no Balcão da baixa nascia sempre como saída e quem
-- confirmava trocava para transferência na hora. Agora a RSS guarda o tipo
-- (e o depósito de destino, na transferência — padrão 0105, Transferência
-- Produção); a requisição pendente nasce e se mantém igual, com o PEP da RSS
-- na saída. Na baixa (individual ou em lote) tipo, destino e PEP já vêm prontos.

alter table public.alm_solicitacao_extra
  add column if not exists tipo_movimento text not null default 'saida',
  add column if not exists deposito_destino text;

alter table public.alm_solicitacao_extra drop constraint if exists alm_sol_extra_tipo_movimento_chk;
alter table public.alm_solicitacao_extra add constraint alm_sol_extra_tipo_movimento_chk
  check (tipo_movimento in ('saida', 'transferencia'));
alter table public.alm_solicitacao_extra drop constraint if exists alm_sol_extra_destino_chk;
alter table public.alm_solicitacao_extra add constraint alm_sol_extra_destino_chk
  check (tipo_movimento = 'saida' or nullif(btrim(deposito_destino), '') is not null);

comment on column public.alm_solicitacao_extra.tipo_movimento is
  'Baixa da retirada sem saldo: saida (com PEP) ou transferencia (para deposito_destino). Vai para a Requisição no Balcão.';

-- Requisição pendente nasce com o tipo da RSS.
create or replace function public.alm_sol_extra_criar_rqb(p_sol alm_solicitacao_extra)
returns uuid
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_dep text;
  v_transf boolean := coalesce(p_sol.tipo_movimento, 'saida') = 'transferencia';
  v_dest text := case when coalesce(p_sol.tipo_movimento, 'saida') = 'transferencia'
                      then coalesce(nullif(btrim(p_sol.deposito_destino), ''), '0105') end;
  v_pep text := case when coalesce(p_sol.tipo_movimento, 'saida') = 'transferencia' then null else nullif(trim(p_sol.aplicacao_pep), '') end;
  v_aplicacao text := case when coalesce(p_sol.tipo_movimento, 'saida') = 'transferencia' then 'Transferência entre depósitos'
                           else coalesce(nullif(trim(p_sol.aplicacao), ''), 'A definir na confirmação') end;
  v_manter jsonb := '{}'::jsonb;
begin
  if p_sol.tipo <> 'SEM_SALDO' or p_sol.codigo is null then
    return null;
  end if;
  select id into v_id from public.alm_req_balcao
   where origem = 'sol_extra_sem_saldo' and origem_ref = p_sol.codigo and not excluido limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if v_pep is not null then
    select coalesce(jsonb_object_agg(ltrim(upper(trim(x->>'material')), '0'),
                                     jsonb_build_object('aplicacao_pep', v_pep, 'aplicacao', v_aplicacao)), '{}'::jsonb)
      into v_manter
      from jsonb_array_elements(p_sol.itens) x;
  end if;

  perform pg_advisory_xact_lock(hashtext('alm_req_balcao_codigo'));
  insert into public.alm_req_balcao
    (codigo, data, tipo_movimento, deposito_origem, deposito_destino, colaborador_id, colaborador_nome, colaborador_registro,
     aplicacao_pep, aplicacao, observacao, criado_por_id, criado_por_nome, pendente_confirmacao, origem, origem_ref)
  values
    (public.alm_receb_proximo_codigo('RQB', p_sol.data, 'alm_req_balcao'), p_sol.data,
     case when v_transf then 'transferencia' else 'saida' end, '0004', v_dest,
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
    format('Gerada pela retirada sem saldo %s com %s item(ns) — %s, pendente de confirmação.', p_sol.codigo,
           jsonb_array_length(p_sol.itens), case when v_transf then 'transferência para ' || v_dest else 'saída' end),
    p_sol.criado_por_nome);
  return v_id;
end;
$function$;

-- Troca de tipo/destino na RSS pendente acompanha a requisição pendente;
-- tipo e destino travam depois da aprovação, como os itens.
do $$
declare
  v_def text;
  v_ant text;
begin
  v_def := pg_get_functiondef('public.alm_sol_extra_sincronizar_rqb()'::regprocedure);
  v_ant := v_def;
  v_def := replace(v_def,
    '    -- Transferência não tem PEP: a troca de PEP na RSS só vale para a RQB de saída.',
    '    if new.tipo_movimento is distinct from old.tipo_movimento
       or new.deposito_destino is distinct from old.deposito_destino then
      update public.alm_req_balcao set
        tipo_movimento = new.tipo_movimento,
        deposito_destino = case when new.tipo_movimento = ''transferencia''
                                then coalesce(nullif(btrim(new.deposito_destino), ''''), ''0105'') end,
        aplicacao_pep = case when new.tipo_movimento = ''transferencia'' then null else nullif(trim(new.aplicacao_pep), '''') end,
        aplicacao = case when new.tipo_movimento = ''transferencia'' then ''Transferência entre depósitos''
                         else coalesce(nullif(trim(new.aplicacao), ''''), ''A definir na confirmação'') end,
        updated_at = now()
       where id = v_rqb.id;
      select case when new.tipo_movimento = ''saida'' and nullif(trim(new.aplicacao_pep), '''') is not null
                  then coalesce(jsonb_object_agg(ltrim(upper(trim(x->>''material'')), ''0''),
                         jsonb_build_object(''aplicacao_pep'', nullif(trim(new.aplicacao_pep), ''''),
                                            ''aplicacao'', coalesce(nullif(trim(new.aplicacao), ''''), new.aplicacao_pep))), ''{}''::jsonb)
                  else ''{}''::jsonb end
        into v_manter
        from jsonb_array_elements(coalesce(new.itens, ''[]''::jsonb)) x;
      perform public.alm_sol_extra_itens_rqb(public.alm_sol_extra_itens_pendentes(new.codigo, new.itens), v_rqb.id, v_manter);
      update public.alm_req_balcao r
         set deposito_origem = coalesce((select i.deposito from public.alm_req_balcao_itens i
                                          where i.requisicao_id = r.id order by i.ordem limit 1), r.deposito_origem)
       where r.id = v_rqb.id;
      perform public.alm_req_balcao_log(v_rqb.id, ''edicao'',
        jsonb_build_array(jsonb_build_object(''campo'', ''tipo_movimento'', ''de'', old.tipo_movimento, ''para'', new.tipo_movimento)),
        format(''Tipo da baixa atualizado a partir da retirada %s.'', new.codigo), null);
      select * into v_rqb from public.alm_req_balcao where id = v_rqb.id;
    end if;

    -- Transferência não tem PEP: a troca de PEP na RSS só vale para a RQB de saída.');
  if v_def = v_ant then raise exception 'sincronizar_rqb: trecho não encontrado'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.alm_sol_extra_antes_gravar()'::regprocedure);
  v_ant := v_def;
  v_def := replace(v_def,
    'or new.setor_solicitante_id is distinct from old.setor_solicitante_id',
    'or new.setor_solicitante_id is distinct from old.setor_solicitante_id
         or new.tipo_movimento is distinct from old.tipo_movimento
         or new.deposito_destino is distinct from old.deposito_destino');
  if v_def = v_ant then raise exception 'antes_gravar: trecho não encontrado'; end if;
  execute v_def;
end $$;
