-- EPI só sai pela Ficha de EPI.
--
-- A baixa de EPI é a entrega assinada na ficha (FRM.SEG-0008): a ficha gera a
-- Requisição no Balcão (origem 'ficha_epi') e, para o item sem saldo, a
-- Retirada sem Saldo (alm_solicitacao_extra com origem 'ficha_epi'). Até aqui
-- nada impedia lançar o mesmo EPI numa requisição de balcão manual ou numa
-- retirada sem saldo aberta à mão — a entrega ficava sem ficha assinada
-- (84 RQBs manuais com EPI do Book nos 60 dias anteriores a 18/11/2026).
--
-- EPI = código SAP ativo no Book de EPIs (ssma_book_epis). O grupo de
-- mercadoria SAP não entra: tem item fora do Book (uniforme, consumível) que
-- continua saindo pelo balcão.
--
-- Transferência entre depósitos não é entrega a pessoa — continua livre.
-- Requisição/retirada antiga que já tem EPI segue editável: só o EPI que
-- ENTRA (novo registro ou material que não estava) é recusado.

-- 1. Quem é EPI --------------------------------------------------------------

create or replace function public.alm_chave_material(p text)
returns text
language sql
immutable
as $$ select nullif(ltrim(upper(trim(coalesce(p, ''))), '0'), '') $$;

create or replace function public.alm_eh_epi_book(p_material text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.ssma_book_epis b
     where b.ativo
       and public.alm_chave_material(b.codigo_sap) = public.alm_chave_material(p_material)
  )
$$;

-- Lista para a tela avisar antes de gravar (o almoxarifado pode não ter acesso
-- ao Book do SSMA pela RLS).
create or replace function public.alm_codigos_epi_book()
returns setof text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct public.alm_chave_material(codigo_sap)
    from public.ssma_book_epis
   where ativo and public.alm_chave_material(codigo_sap) is not null
$$;
revoke all on function public.alm_codigos_epi_book() from public, anon;
grant execute on function public.alm_codigos_epi_book() to authenticated;

-- 2. Requisição no Balcão ------------------------------------------------------

/**
 * Recusa EPI do Book em saída que não veio da ficha. `p_itens_antes` = mapa
 * material → quantidade antes da edição ('{}' na criação).
 */
create or replace function public.alm_req_balcao_conferir_epi(p_requisicao uuid, p_itens_antes jsonb)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_r public.alm_req_balcao;
  v_lista text;
begin
  select * into v_r from public.alm_req_balcao where id = p_requisicao;
  if not found or v_r.excluido or v_r.tipo_movimento <> 'saida' then
    return;
  end if;

  -- Gerada pela ficha (de verdade: a ficha existe).
  if v_r.origem = 'ficha_epi'
     and (public.alm_ficha_epi_da_origem(v_r.origem_id, v_r.origem_ref)).id is not null then
    return;
  end if;
  -- Gerada pela Retirada sem Saldo que a própria ficha abriu.
  if v_r.origem = 'sol_extra_sem_saldo' and exists (
       select 1 from public.alm_solicitacao_extra s
        where s.codigo = v_r.origem_ref and s.origem = 'ficha_epi') then
    return;
  end if;

  select string_agg(distinct format('%s %s', i.material, coalesce(i.descricao, '')), '; ')
    into v_lista
    from public.alm_req_balcao_itens i
   where i.requisicao_id = v_r.id
     and public.alm_eh_epi_book(i.material)
     and not exists (
       select 1 from jsonb_object_keys(coalesce(p_itens_antes, '{}'::jsonb)) k
        where public.alm_chave_material(k) = public.alm_chave_material(i.material));

  if v_lista is not null then
    raise exception 'EPI não sai pela Requisição no Balcão: % . A entrega de EPI é registrada na Ficha de EPI (SSMA ou Almoxarifado › Ficha de EPI), que gera a requisição sozinha — e, sem saldo, a retirada extraordinária.', v_lista
      using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.alm_req_balcao_conferir_epi(uuid, jsonb) from public, anon, authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.alm_req_balcao_salvar(uuid,jsonb,jsonb)'::regprocedure);
  v_ancora text := E'  return v_row;\nend;';
begin
  if position('alm_req_balcao_conferir_epi' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'alm_req_balcao_salvar mudou: ajuste a migration do bloqueio de EPI.';
  end if;
  v_def := replace(v_def, v_ancora,
    E'  -- EPI só sai pela Ficha de EPI (requisição manual recusa EPI do Book).\n'
    || E'  perform public.alm_req_balcao_conferir_epi(v_row.id, case when p_id is null then ''{}''::jsonb else v_itens_antes end);\n\n'
    || v_ancora);
  execute v_def;
end $$;

-- 3. Retirada sem Saldo / Solicitação Extraordinária aberta à mão --------------

create or replace function public.alm_sol_extra_bloqueia_epi()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lista text;
begin
  if new.origem = 'ficha_epi' or new.excluido_em is not null then
    return new;
  end if;

  select string_agg(distinct format('%s %s', x->>'material', coalesce(x->>'descricao', '')), '; ')
    into v_lista
    from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) x
   where public.alm_eh_epi_book(x->>'material')
     and not exists (
       select 1 from jsonb_array_elements(case when tg_op = 'UPDATE' then coalesce(old.itens, '[]'::jsonb) else '[]'::jsonb end) o
        where public.alm_chave_material(o->>'material') = public.alm_chave_material(x->>'material'));

  if v_lista is not null then
    raise exception 'EPI sem saldo não se retira por aqui: % . Registre a entrega na Ficha de EPI — ela abre a retirada sem saldo sozinha, vinculada à ficha assinada.', v_lista
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_alm_sol_extra_bloqueia_epi on public.alm_solicitacao_extra;
create trigger trg_alm_sol_extra_bloqueia_epi
  before insert or update of itens, origem on public.alm_solicitacao_extra
  for each row execute function public.alm_sol_extra_bloqueia_epi();
