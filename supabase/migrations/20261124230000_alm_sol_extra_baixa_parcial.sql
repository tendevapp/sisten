-- Retirada sem saldo (RSS) com saldo parcial: libera os itens que a ZL0024 já
-- cobre e deixa pendente só o que ainda espera a NF.
--
-- Como: os itens com saldo saem da Requisição no Balcão pendente da RSS e vão
-- para uma requisição nova, já confirmada, com a MESMA origem
-- (`sol_extra_sem_saldo`) e o mesmo `origem_ref` (o código RSS). Assim a
-- isenção de EPI da ficha, a regularização do SSMA e a soma de itens da
-- contingência seguem valendo sem mudança. A RSS continua PENDENTE e vira
-- REGULARIZADA quando a requisição pendente (com o que sobrou) for confirmada.
--
-- Ajustes:
--  1. índice único: uma requisição PENDENTE por RSS (as confirmadas podem ser várias);
--  2. `alm_sol_extra_itens_pendentes`: itens da RSS menos o que já saiu em
--     requisição confirmada — usado na repartição do saldo e na sincronização;
--  3. contingência "requisição confirmada, retirada pendente" só acusa quando
--     não sobrou requisição pendente;
--  4. `alm_sol_extra_baixar_lote(..., p_parcial)`.

-- 1. Índices -----------------------------------------------------------------
drop index if exists public.alm_req_balcao_origem_ref_uk;
create unique index alm_req_balcao_origem_ref_uk on public.alm_req_balcao (origem, origem_ref)
  where origem is not null and origem_ref is not null and not excluido and origem <> 'sol_extra_sem_saldo';
create unique index if not exists alm_req_balcao_rss_pendente_uk on public.alm_req_balcao (origem_ref)
  where origem = 'sol_extra_sem_saldo' and pendente_confirmacao and not excluido;

-- 2. Itens ainda pendentes da RSS ---------------------------------------------
create or replace function public.alm_sol_extra_itens_pendentes(p_codigo text, p_itens jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_baixado jsonb;
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_mat text;
  v_qtd numeric;
  v_tirar numeric;
begin
  select coalesce(jsonb_object_agg(mat, q), '{}'::jsonb) into v_baixado
    from (select ltrim(upper(trim(i.material)), '0') mat, sum(i.quantidade) q
            from public.alm_req_balcao r
            join public.alm_req_balcao_itens i on i.requisicao_id = r.id
           where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = p_codigo
             and not r.excluido and not r.pendente_confirmacao
           group by 1) b;
  if v_baixado = '{}'::jsonb then
    return coalesce(p_itens, '[]'::jsonb);
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_mat := ltrim(upper(trim(v_item->>'material')), '0');
    v_qtd := coalesce(nullif(v_item->>'quantidade', '')::numeric, 0);
    v_tirar := least(v_qtd, coalesce((v_baixado->>v_mat)::numeric, 0));
    if v_tirar > 0 then
      v_baixado := jsonb_set(v_baixado, array[v_mat], to_jsonb((v_baixado->>v_mat)::numeric - v_tirar));
    end if;
    if v_qtd - v_tirar > 0 then
      v_out := v_out || jsonb_build_array(jsonb_set(v_item, '{quantidade}', to_jsonb(v_qtd - v_tirar)));
    end if;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.alm_sol_extra_itens_pendentes(text, jsonb) from public, anon;
grant execute on function public.alm_sol_extra_itens_pendentes(text, jsonb) to authenticated;

-- 3. Repartição, sincronização e contingência usam só o que falta -------------
do $$
declare
  v_def text;
  v_ant text;
begin
  v_def := pg_get_functiondef('public.alm_req_balcao_atualizar_saldos()'::regprocedure);
  v_ant := v_def;
  v_def := replace(v_def,
    'jsonb_array_elements(coalesce(v_sol.itens, ''[]''::jsonb))',
    'jsonb_array_elements(case when v_sol.tipo = ''SEM_SALDO'' and v_sol.codigo is not null then public.alm_sol_extra_itens_pendentes(v_sol.codigo, v_sol.itens) else coalesce(v_sol.itens, ''[]''::jsonb) end)');
  if v_def = v_ant then raise exception 'atualizar_saldos: trecho não encontrado'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.alm_sol_extra_sincronizar_rqb()'::regprocedure);
  v_ant := v_def;
  v_def := replace(v_def,
    'perform public.alm_sol_extra_itens_rqb(new.itens, v_rqb.id, v_manter);',
    'perform public.alm_sol_extra_itens_rqb(public.alm_sol_extra_itens_pendentes(new.codigo, new.itens), v_rqb.id, v_manter);');
  if v_def = v_ant then raise exception 'sincronizar_rqb: trecho não encontrado'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.alm_contingencias_achados()'::regprocedure);
  v_ant := v_def;
  v_def := replace(v_def,
    'where r.origem = ''sol_extra_sem_saldo'' and not r.pendente_confirmacao and s.status = ''PENDENTE''',
    'where r.origem = ''sol_extra_sem_saldo'' and not r.pendente_confirmacao and s.status = ''PENDENTE''
       and not exists (select 1 from rqb_viva p where p.origem = ''sol_extra_sem_saldo'' and p.origem_ref = s.codigo and p.pendente_confirmacao)');
  if v_def = v_ant then raise exception 'contingencias_achados: trecho não encontrado'; end if;
  execute v_def;
end $$;

-- 4. Baixa em lote com parcial -------------------------------------------------
drop function if exists public.alm_sol_extra_baixar_lote(text[], text, text);

create or replace function public.alm_sol_extra_baixar_lote(
  p_rss text[],
  p_pep text default null,
  p_por text default null,
  p_parcial boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
as $$
declare
  v_uid text := (auth.uid())::text;
  v_pep text := nullif(upper(btrim(p_pep)), '');
  v_pep_nome text;
  v_por text;
  v_r public.alm_req_balcao;
  v_nova public.alm_req_balcao;
  v_res jsonb := '[]'::jsonb;
  v_req jsonb;
  v_itens jsonb;
  v_falta text;
  v_n_ok int;
  v_n_falta int;
  v_parcial boolean;
  v_sem_pep boolean;
  v_pep_req text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if not exists (select 1 from public.core_perfis
                  where id = v_uid and ('admin' = any(roles) or sector_id = '2')) then
    raise exception 'Só o Almoxarifado (ou um admin) dá baixa nas retiradas sem saldo.';
  end if;
  if coalesce(array_length(p_rss, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;
  if coalesce(array_length(p_rss, 1), 0) > 300 then
    raise exception 'Lote grande demais (máximo 300 retiradas por vez).';
  end if;
  if v_pep is not null then
    select nome into v_pep_nome from public.alm_balcao_aplicacoes where wbs = v_pep and ativo;
    if v_pep_nome is null then
      raise exception 'O PEP % não está na lista de aplicações do balcão.', v_pep;
    end if;
  end if;
  v_por := coalesce(nullif(btrim(p_por), ''), (select name from public.core_perfis where id = v_uid));

  perform pg_advisory_xact_lock(hashtext('alm_sol_extra_baixar_lote'));
  perform public.alm_req_balcao_atualizar_saldos();

  select v_res || coalesce(jsonb_agg(jsonb_build_object('rss', c, 'ok', false,
           'erro', 'Nenhuma Requisição no Balcão pendente para esta retirada — use o "Dar baixa" individual.')), '[]'::jsonb)
    into v_res
    from unnest(p_rss) c
   where not exists (select 1 from public.alm_req_balcao r
                      where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = c and not r.excluido and r.pendente_confirmacao);

  for v_r in
    select r.* from public.alm_req_balcao r
     where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = any(p_rss)
       and not r.excluido and r.pendente_confirmacao
     order by r.data, r.created_at
  loop
    begin
      select count(*) filter (where coalesce(i.sem_saldo, false)),
             count(*) filter (where not coalesce(i.sem_saldo, false)),
             string_agg(format('%s (precisa %s, saldo %s no %s)', i.material, i.quantidade,
                               coalesce(i.saldo_zl0024, 0), i.deposito), '; ') filter (where coalesce(i.sem_saldo, false))
        into v_n_falta, v_n_ok, v_falta
        from public.alm_req_balcao_itens i
       where i.requisicao_id = v_r.id;

      v_parcial := v_n_falta > 0;
      if v_parcial and (not p_parcial or v_n_ok = 0) then
        v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'ok', false,
          'erro', 'Sem saldo na ZL0024 de hoje: ' || v_falta);
        continue;
      end if;

      v_pep_req := nullif(upper(btrim(v_r.aplicacao_pep)), '');
      v_sem_pep := v_r.tipo_movimento = 'saida' and v_pep_req is null and exists (
        select 1 from public.alm_req_balcao_itens i
         where i.requisicao_id = v_r.id and nullif(btrim(i.aplicacao_pep), '') is null
           and (not v_parcial or not coalesce(i.sem_saldo, false)));
      if v_sem_pep and v_pep is null then
        v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'ok', false,
          'erro', 'Sem PEP — escolha o PEP do lote.');
        continue;
      end if;

      -- Itens que saem agora: todos, ou só os com saldo (parcial).
      select jsonb_agg(jsonb_build_object(
               'material', i.material,
               'quantidade', i.quantidade,
               'descricao', i.descricao,
               'unidade', i.unidade,
               'deposito', i.deposito,
               'deposito_destino', i.deposito_destino,
               'aplicacao_pep', coalesce(nullif(upper(btrim(i.aplicacao_pep)), ''), v_pep_req, v_pep),
               'aplicacao', case when nullif(btrim(i.aplicacao_pep), '') is not null then i.aplicacao end)
             order by i.ordem)
        into v_itens
        from public.alm_req_balcao_itens i
       where i.requisicao_id = v_r.id and (not v_parcial or not coalesce(i.sem_saldo, false));

      v_req := jsonb_build_object(
        'data', v_r.data,
        'turno', v_r.turno,
        'tipo_movimento', v_r.tipo_movimento,
        'deposito_origem', v_itens->0->>'deposito',
        'deposito_destino', v_r.deposito_destino,
        'colaborador_id', v_r.colaborador_id,
        'colaborador_nome', v_r.colaborador_nome,
        'colaborador_registro', v_r.colaborador_registro,
        'aplicacao_pep', coalesce(v_pep_req, v_pep),
        'aplicacao', case when v_pep_req is not null then v_r.aplicacao else v_pep_nome end,
        'criado_por_nome', v_por);

      if not v_parcial then
        perform public.alm_req_balcao_salvar(v_r.id,
          v_req || jsonb_build_object('observacao', v_r.observacao, 'confirmar', true), v_itens);
        perform public.alm_req_balcao_log(v_r.id, 'edicao', '[]'::jsonb,
          format('Confirmada na baixa em lote (Pendências) por %s.', v_por), v_por);
        v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'id', v_r.id, 'ok', true);
      else
        -- Nova requisição já confirmada com os itens que têm saldo.
        v_nova := public.alm_req_balcao_salvar(null, v_req || jsonb_build_object(
          'pendente_confirmacao', false,
          'origem', 'sol_extra_sem_saldo',
          'origem_ref', v_r.origem_ref,
          'observacao', format('Baixa parcial da retirada sem saldo %s: itens que já têm saldo na ZL0024. O restante segue na %s.',
                               v_r.origem_ref, v_r.codigo)), v_itens);
        update public.alm_req_balcao
           set confirmada_por = v_por, confirmada_em = now()
         where id = v_nova.id;

        delete from public.alm_req_balcao_itens
         where requisicao_id = v_r.id and not coalesce(sem_saldo, false);
        update public.alm_req_balcao r
           set deposito_origem = coalesce((select i.deposito from public.alm_req_balcao_itens i
                                            where i.requisicao_id = r.id order by i.ordem limit 1), r.deposito_origem),
               updated_at = now()
         where r.id = v_r.id;

        perform public.alm_req_balcao_log(v_r.id, 'edicao', '[]'::jsonb,
          format('Baixa parcial por %s: %s item(ns) com saldo foram para a %s (confirmada). Fica(m) %s aguardando saldo.',
                 v_por, v_n_ok, v_nova.codigo, v_n_falta), v_por);
        perform public.alm_req_balcao_log(v_nova.id, 'edicao', '[]'::jsonb,
          format('Gerada e confirmada na baixa parcial da retirada %s (o restante segue na %s).', v_r.origem_ref, v_r.codigo), v_por);

        v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_nova.codigo, 'id', v_nova.id, 'ok', true,
          'parcial', true, 'itens_baixados', v_n_ok, 'itens_restantes', v_n_falta, 'rqb_pendente', v_r.codigo);
      end if;
    exception when others then
      v_res := v_res || jsonb_build_object('rss', v_r.origem_ref, 'rqb', v_r.codigo, 'ok', false, 'erro', sqlerrm);
    end;
  end loop;

  return v_res;
end;
$$;

revoke all on function public.alm_sol_extra_baixar_lote(text[], text, text, boolean) from public, anon;
grant execute on function public.alm_sol_extra_baixar_lote(text[], text, text, boolean) to authenticated;
