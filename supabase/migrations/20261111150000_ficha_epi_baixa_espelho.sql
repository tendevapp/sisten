-- Ficha de EPI × baixa no SAP: a requisição espelha a ficha assinada.
--
-- Em 11/11/2026, 32 fichas ativas não batiam com o que saiu do estoque: o
-- almoxarifado editava os itens da RQB gerada pela ficha (33 RQBs) ou excluía
-- a RQB (18). A ficha é o documento assinado pelo colaborador; o estoque tem
-- que baixar exatamente o que ela diz.
--
-- A. RQB de ficha ativa: na edição, itens e quantidades têm de ser os da ficha
--    menos o que saiu pela Retirada sem Saldo ligada a ela. Depósito, PEP e
--    turno continuam livres. Entrega diferente → cancelar e refazer a ficha.
-- B. RQB de ficha ativa não pode ser excluída (qualquer caminho).
-- C. Cancelar a ficha exclui a RQB e a Retirada sem Saldo ainda não exportadas;
--    as exportadas ficam para estorno (verificação epi_cancelada_requisicao_viva).
-- D. Vincular à ficha uma Retirada sem Saldo aberta à mão (mesma pessoa, itens
--    da ficha), com lista de candidatas.

-- Ficha de origem da requisição/retirada: pelo id; registros antigos, pelo código.
create or replace function public.alm_ficha_epi_da_origem(p_origem_id uuid, p_origem_ref text)
returns public.ssma_fichas_epi
language sql stable security definer
set search_path = public, pg_temp
as $$
  select f.* from public.ssma_fichas_epi f
   where (p_origem_id is not null and f.id = p_origem_id)
      or (p_origem_id is null and f.codigo = p_origem_ref)
   limit 1;
$$;
revoke all on function public.alm_ficha_epi_da_origem(uuid, text) from public, anon, authenticated;

-- A. Conferência da requisição com a ficha ---------------------------------
create or replace function public.alm_req_balcao_conferir_ficha(p_requisicao uuid)
returns void
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_r public.alm_req_balcao;
  v_f public.ssma_fichas_epi;
  v_lista text;
begin
  select * into v_r from public.alm_req_balcao where id = p_requisicao;
  if not found or v_r.origem is distinct from 'ficha_epi' or v_r.excluido then
    return;
  end if;
  v_f := public.alm_ficha_epi_da_origem(v_r.origem_id, v_r.origem_ref);
  if v_f.id is null or v_f.status <> 'ATIVA' then
    return;
  end if;

  with ficha as (
    select ltrim(upper(trim(i.codigo_sap)), '0') mat, sum(i.quantidade) q
      from public.ssma_fichas_epi_itens i
     where i.ficha_id = v_f.id and nullif(trim(i.codigo_sap), '') is not null
     group by 1),
  rss as (
    select ltrim(upper(trim(x->>'material')), '0') mat, sum(nullif(x->>'quantidade', '')::numeric) q
      from public.alm_solicitacao_extra s
      cross join jsonb_array_elements(coalesce(s.itens, '[]'::jsonb)) x
     where s.origem = 'ficha_epi' and s.origem_ref = v_f.codigo and s.excluido_em is null
     group by 1),
  esperado as (
    select f.mat, greatest(f.q - coalesce(r.q, 0), 0) q from ficha f left join rss r on r.mat = f.mat),
  na_rqb as (
    select ltrim(upper(trim(i.material)), '0') mat, sum(i.quantidade) q
      from public.alm_req_balcao_itens i where i.requisicao_id = v_r.id group by 1)
  select string_agg(format('%s: ficha %s × requisição %s', coalesce(e.mat, n.mat),
                           trim_scale(coalesce(e.q, 0)), trim_scale(coalesce(n.q, 0))), '; '
                    order by coalesce(e.mat, n.mat))
    into v_lista
    from esperado e full join na_rqb n on n.mat = e.mat
   where round(coalesce(e.q, 0), 3) <> round(coalesce(n.q, 0), 3);

  if v_lista is not null then
    raise exception 'A % é a baixa da ficha de EPI % (assinada por %): os itens e quantidades têm de ser os da ficha. Diferença: %. Se a entrega foi outra (tamanho, quantidade), cancele e refaça a ficha no SSMA; item sem saldo sai pela Retirada sem Saldo vinculada à ficha.',
      v_r.codigo, v_f.codigo, v_f.nome, v_lista using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.alm_req_balcao_conferir_ficha(uuid) from public, anon, authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.alm_req_balcao_salvar(uuid,jsonb,jsonb)'::regprocedure);
  v_ancora text := E'  return v_row;\nend;';
begin
  if position('alm_req_balcao_conferir_ficha' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'alm_req_balcao_salvar mudou: ajuste a migration do espelho da ficha.';
  end if;
  v_def := replace(v_def, v_ancora,
    E'  -- Requisição de ficha de EPI espelha a ficha assinada (menos a retirada sem saldo).\n'
    || E'  if p_id is not null and v_row.origem = ''ficha_epi'' then\n'
    || E'    perform public.alm_req_balcao_conferir_ficha(v_row.id);\n'
    || E'  end if;\n\n' || v_ancora);
  execute v_def;
end $$;

-- B. Não exclui RQB de ficha ativa --------------------------------------------
create or replace function public.alm_req_balcao_guarda_ficha()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_f public.ssma_fichas_epi;
begin
  if new.excluido and not old.excluido and old.origem = 'ficha_epi'
     and coalesce(current_setting('sisten.rqb_ficha_sync', true), '') <> '1' then
    v_f := public.alm_ficha_epi_da_origem(old.origem_id, old.origem_ref);
    if v_f.id is not null and v_f.status = 'ATIVA' then
      raise exception 'A % é a baixa do EPI entregue na ficha % (%) e não pode ser excluída. Se a entrega não aconteceu ou a ficha está errada, cancele a ficha no SSMA — a requisição sai junto.',
        old.codigo, v_f.codigo, v_f.nome using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.alm_req_balcao_guarda_ficha() from public, anon, authenticated;

drop trigger if exists trg_alm_req_balcao_guarda_ficha on public.alm_req_balcao;
create trigger trg_alm_req_balcao_guarda_ficha
  before update of excluido on public.alm_req_balcao
  for each row execute function public.alm_req_balcao_guarda_ficha();

-- A RPC de exclusão explica antes do trigger (e o motivo continua indo ao log).
create or replace function public.alm_req_balcao_excluir(p_id uuid, p_por text, p_motivo text default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_r public.alm_req_balcao;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_rss text;
  v_f public.ssma_fichas_epi;
begin
  select * into v_r from public.alm_req_balcao where id = p_id and not excluido;
  if not found then
    raise exception 'Requisição não encontrada.';
  end if;
  if not v_r.pendente_confirmacao and not public.form_pode_editar(v_r.criado_por_id::text) then
    raise exception 'Só quem registrou a requisição (ou um admin) pode excluí-la.';
  end if;

  if v_r.origem = 'sol_extra_sem_saldo' then
    select codigo into v_rss from public.alm_solicitacao_extra
     where codigo = v_r.origem_ref and tipo = 'SEM_SALDO' and excluido_em is null;
    if v_rss is not null then
      raise exception 'A % dá a baixa da retirada sem saldo % — o material já saiu do almoxarifado. Para cancelar, exclua a retirada % (a requisição sai junto).',
        v_r.codigo, v_rss, v_rss using errcode = '42501';
    end if;
  elsif v_r.origem = 'ficha_epi' then
    v_f := public.alm_ficha_epi_da_origem(v_r.origem_id, v_r.origem_ref);
    if v_f.id is not null and v_f.status = 'ATIVA' then
      raise exception 'A % é a baixa do EPI entregue na ficha % (%) e não pode ser excluída. Se a entrega não aconteceu ou a ficha está errada, cancele a ficha no SSMA — a requisição sai junto.',
        v_r.codigo, v_f.codigo, v_f.nome using errcode = '42501';
    end if;
  end if;

  update public.alm_req_balcao
     set excluido = true, excluido_em = now(), excluido_por = p_por
   where id = p_id;
  perform public.alm_req_balcao_log(p_id, 'exclusao',
    case when v_motivo is null then '[]'::jsonb
         else jsonb_build_array(jsonb_build_object('campo', 'motivo', 'de', null, 'para', v_motivo)) end,
    'Excluída (permanece no banco).' || coalesce(' Motivo: ' || v_motivo, ''), p_por);
end;
$$;
revoke all on function public.alm_req_balcao_excluir(uuid, text, text) from public, anon;
grant execute on function public.alm_req_balcao_excluir(uuid, text, text) to authenticated;

-- C. Ficha cancelada: tira a baixa que ainda não foi ao SAP --------------------
create or replace function public.ssma_ficha_epi_cancelada_baixas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r record;
  v_s record;
  v_por text := coalesce(new.cancelado_por_nome, 'SSMA');
  v_motivo text := 'Ficha ' || new.codigo || ' cancelada: ' || coalesce(new.cancelamento_motivo, '');
  v_excluidas text[] := '{}';
  v_estorno text[] := '{}';
begin
  perform set_config('sisten.rqb_ficha_sync', '1', true);
  for v_r in
    select * from public.alm_req_balcao
     where origem = 'ficha_epi' and not excluido
       and (origem_id = new.id or (origem_id is null and origem_ref = new.codigo))
  loop
    if v_r.exportacao_id is null then
      update public.alm_req_balcao set excluido = true, excluido_em = now(), excluido_por = v_por where id = v_r.id;
      perform public.alm_req_balcao_log(v_r.id, 'exclusao',
        jsonb_build_array(jsonb_build_object('campo', 'motivo', 'de', null, 'para', v_motivo)),
        'Excluída junto com o cancelamento da ficha ' || new.codigo || '.', v_por);
      v_excluidas := v_excluidas || v_r.codigo;
    else
      v_estorno := v_estorno || v_r.codigo;
    end if;
  end loop;
  perform set_config('sisten.rqb_ficha_sync', '', true);

  perform set_config('sisten.alm_sol_extra_rpc', '1', true);
  for v_s in
    select * from public.alm_solicitacao_extra
     where origem = 'ficha_epi' and excluido_em is null and status = 'PENDENTE'
       and (origem_id = new.id or (origem_id is null and origem_ref = new.codigo))
  loop
    if exists (select 1 from public.alm_req_balcao r
                where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = v_s.codigo and not r.excluido and r.exportacao_id is not null) then
      v_estorno := v_estorno || v_s.codigo;
      continue;
    end if;
    -- O trigger da retirada exclui junto a requisição pendente dela.
    update public.alm_solicitacao_extra set excluido_em = now(), excluido_por = v_por where id = v_s.id;
    update public.alm_req_balcao set excluido = true, excluido_em = now(), excluido_por = v_por
     where origem = 'sol_extra_sem_saldo' and origem_ref = v_s.codigo and not excluido and exportacao_id is null;
    v_excluidas := v_excluidas || v_s.codigo;
  end loop;
  perform set_config('sisten.alm_sol_extra_rpc', '', true);

  if cardinality(v_excluidas) + cardinality(v_estorno) > 0 then
    insert into public.alm_contingencias_eventos (acao, verificacao, referencia, resumo, detalhe, por_id, por_nome)
    values ('correcao', 'ficha_cancelada', new.codigo,
            'Ficha cancelada: ' || coalesce(nullif(array_to_string(v_excluidas, ', '), ''), 'nada') || ' excluída(s)'
              || case when cardinality(v_estorno) > 0 then '; já exportada(s), pedir estorno: ' || array_to_string(v_estorno, ', ') else '' end,
            jsonb_build_object('excluidas', to_jsonb(v_excluidas), 'estorno', to_jsonb(v_estorno), 'motivo', new.cancelamento_motivo),
            new.cancelado_por, v_por);
  end if;
  return new;
end;
$$;
revoke all on function public.ssma_ficha_epi_cancelada_baixas() from public, anon, authenticated;

drop trigger if exists trg_ssma_ficha_epi_cancelada_baixas on public.ssma_fichas_epi;
create trigger trg_ssma_ficha_epi_cancelada_baixas
  after update of status on public.ssma_fichas_epi
  for each row when (old.status = 'ATIVA' and new.status = 'CANCELADA')
  execute function public.ssma_ficha_epi_cancelada_baixas();

-- D. Vincular Retirada sem Saldo aberta à mão ---------------------------------
create or replace function public.alm_contingencia_rss_candidatas(p_ficha text)
returns table(codigo text, data date, status text, itens jsonb, itens_iguais int)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  -- Só as que têm algum item da ficha (as outras o vínculo recusaria).
  return query
    select c.codigo, c.data, c.status, c.itens, c.iguais
      from (
        select s.codigo, s.data, s.status, s.itens, f.data_entrega,
               (select count(*)::int from jsonb_array_elements(coalesce(s.itens, '[]'::jsonb)) x
                 where exists (select 1 from public.ssma_fichas_epi_itens i
                                where i.ficha_id = f.id
                                  and ltrim(upper(trim(i.codigo_sap)), '0') = ltrim(upper(trim(x->>'material')), '0'))) iguais
          from public.ssma_fichas_epi f
          join public.alm_solicitacao_extra s
            on s.tipo = 'SEM_SALDO' and s.excluido_em is null and s.origem is null
           and trim(coalesce(s.retirante_matricula, '')) = trim(coalesce(f.registro, ''))
           and s.data between f.data_entrega - 15 and f.data_entrega + 15
         where f.codigo = p_ficha) c
     where c.iguais > 0
     order by abs(c.data - c.data_entrega), c.codigo;
end;
$$;
revoke all on function public.alm_contingencia_rss_candidatas(text) from public, anon;
grant execute on function public.alm_contingencia_rss_candidatas(text) to authenticated;

create or replace function public.alm_contingencia_vincular_rss(p_rss text, p_ficha text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_f public.ssma_fichas_epi;
  v_s public.alm_solicitacao_extra;
  v_fora text;
  v_outra text;
  v_nome text;
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  select * into v_f from public.ssma_fichas_epi where codigo = trim(p_ficha);
  if not found then raise exception 'Ficha % não encontrada.', p_ficha; end if;
  if v_f.status <> 'ATIVA' then raise exception 'A ficha % está %.', v_f.codigo, lower(v_f.status); end if;

  select * into v_s from public.alm_solicitacao_extra where codigo = upper(trim(p_rss)) and excluido_em is null;
  if not found then raise exception 'Retirada % não encontrada.', p_rss; end if;
  if v_s.tipo <> 'SEM_SALDO' then raise exception '% não é uma Retirada sem Saldo.', v_s.codigo; end if;
  if v_s.origem is not null then
    if v_s.origem = 'ficha_epi' and v_s.origem_ref = v_f.codigo then
      return format('%s já está vinculada à ficha %s.', v_s.codigo, v_f.codigo);
    end if;
    raise exception 'A % já está ligada a % %.', v_s.codigo, v_s.origem, coalesce(v_s.origem_ref, '');
  end if;
  if trim(coalesce(v_s.retirante_matricula, '')) <> trim(coalesce(v_f.registro, '')) then
    raise exception 'A % é de % (registro %), a ficha % é de % (registro %).',
      v_s.codigo, v_s.retirante_nome, v_s.retirante_matricula, v_f.codigo, v_f.nome, v_f.registro;
  end if;
  select string_agg(x->>'material', ', ') into v_fora
    from jsonb_array_elements(coalesce(v_s.itens, '[]'::jsonb)) x
   where not exists (select 1 from public.ssma_fichas_epi_itens i
                      where i.ficha_id = v_f.id
                        and ltrim(upper(trim(i.codigo_sap)), '0') = ltrim(upper(trim(x->>'material')), '0'));
  if v_fora is not null then
    raise exception 'A % tem material que a ficha % não entregou: %.', v_s.codigo, v_f.codigo, v_fora;
  end if;
  select codigo into v_outra from public.alm_solicitacao_extra
   where origem = 'ficha_epi' and origem_ref = v_f.codigo and excluido_em is null and id <> v_s.id;
  if v_outra is not null then
    raise exception 'A ficha % já tem a retirada %. Uma retirada por ficha.', v_f.codigo, v_outra;
  end if;

  update public.alm_solicitacao_extra
     set origem = 'ficha_epi', origem_ref = v_f.codigo, origem_id = v_f.id
   where id = v_s.id;

  select name into v_nome from public.core_perfis where id = (auth.uid())::text;
  insert into public.alm_contingencias_eventos (acao, verificacao, referencia, resumo, detalhe, por_id, por_nome)
  values ('correcao', 'vincular_rss', v_f.codigo,
          format('%s vinculada à ficha %s (%s).', v_s.codigo, v_f.codigo, v_f.nome),
          jsonb_build_object('rss', v_s.codigo, 'ficha', v_f.codigo), (auth.uid())::text, v_nome);
  return format('%s vinculada à ficha %s.', v_s.codigo, v_f.codigo);
end;
$$;
revoke all on function public.alm_contingencia_vincular_rss(text, text) from public, anon;
grant execute on function public.alm_contingencia_vincular_rss(text, text) to authenticated;
