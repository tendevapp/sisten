-- Ficha de EPI → Requisição no Balcão / Retirada sem Saldo: vínculo pelo ID.
--
-- Problema (07/11/2026): duas fichas feitas sem rede receberam o mesmo código
-- provisório (o aparelho calcula o próximo índice pela cópia local). No envio
-- a fila regerou o código da 2ª ficha (EPI-071126-166), mas a requisição dela,
-- que estava na fila logo atrás, subiu com o código antigo (EPI-071126-125, da
-- ficha de outra pessoa). Resultado: a 2ª ficha ficou "sem requisição" e a 1ª
-- com duas.
--
-- Solução:
--   1. `origem_id uuid` em alm_req_balcao e alm_solicitacao_extra. O app manda
--      o id da ficha — a fila já troca id provisório pelo real no envio.
--   2. Trigger BEFORE: para origem 'ficha_epi', o banco resolve o código real
--      da ficha pelo id (e corrige a observação), confere que a pessoa é a da
--      ficha e recusa requisição nova de ficha cancelada.
--   3. Índice único: uma requisição viva por ficha (e por retirada).
--   4. Corrige a RQB-071126-29 (era da ficha EPI-071126-166).
--   5. Contingências ganham duas verificações: ficha × saída (itens e
--      quantidades) e requisição ligada à ficha de outra pessoa.

-- 1. Colunas ----------------------------------------------------------------
alter table public.alm_req_balcao add column if not exists origem_id uuid;
alter table public.alm_solicitacao_extra add column if not exists origem_id uuid;
comment on column public.alm_req_balcao.origem_id is
  'Id do registro de origem (ficha de EPI). Para origem ficha_epi o trigger deriva origem_ref dele.';
comment on column public.alm_solicitacao_extra.origem_id is
  'Id do registro de origem (ficha de EPI). Para origem ficha_epi o trigger deriva origem_ref dele.';

-- 2. Correção do vínculo trocado (antes do backfill e do trigger) --------------
do $$
declare
  v_rqb public.alm_req_balcao;
  v_ficha public.ssma_fichas_epi;
begin
  select * into v_rqb from public.alm_req_balcao where codigo = 'RQB-071126-29';
  select * into v_ficha from public.ssma_fichas_epi where codigo = 'EPI-071126-166';
  if v_rqb.id is not null and v_ficha.id is not null and v_rqb.origem_ref = 'EPI-071126-125'
     and v_rqb.colaborador_registro = v_ficha.registro then
    update public.alm_req_balcao
       set origem_ref = v_ficha.codigo,
           origem_id = v_ficha.id,
           observacao = replace(observacao, 'EPI-071126-125', v_ficha.codigo)
     where id = v_rqb.id;
    perform public.alm_req_balcao_log(v_rqb.id, 'edicao',
      jsonb_build_array(jsonb_build_object('campo', 'Ficha de origem', 'de', 'EPI-071126-125', 'para', v_ficha.codigo)),
      'Vínculo corrigido: a requisição é da ficha ' || v_ficha.codigo || ' (' || v_ficha.nome
        || '). O código provisório da ficha feita sem rede tinha ficado na requisição.',
      'SISTEN (correção de vínculo)');
  end if;
end $$;

-- Backfill só da requisição (a retirada tem trigger que regenera requisição a cada UPDATE).
update public.alm_req_balcao r
   set origem_id = f.id
  from public.ssma_fichas_epi f
 where r.origem = 'ficha_epi' and r.origem_ref = f.codigo and r.origem_id is null;

-- 3. Uma requisição viva por origem -----------------------------------------
create unique index if not exists alm_req_balcao_origem_ref_uk
  on public.alm_req_balcao (origem, origem_ref)
  where origem is not null and origem_ref is not null and not excluido;

-- 4. Trigger: código, pessoa e situação da ficha -----------------------------
create or replace function public.alm_origem_ficha_epi_resolver()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_f record;
  v_pessoa text;
begin
  if new.origem is distinct from 'ficha_epi' then
    return new;
  end if;

  if new.origem_id is not null then
    select id, codigo, registro, nome, status into v_f from public.ssma_fichas_epi where id = new.origem_id;
    if not found then
      raise exception 'Ficha de EPI de origem não encontrada (id %). Sincronize a ficha antes da requisição.', new.origem_id
        using errcode = '23503';
    end if;
  elsif nullif(trim(new.origem_ref), '') is not null then
    select id, codigo, registro, nome, status into v_f from public.ssma_fichas_epi where codigo = new.origem_ref;
    if not found then
      raise exception 'Ficha de EPI % não encontrada.', new.origem_ref using errcode = '23503';
    end if;
    new.origem_id := v_f.id;
  else
    return new;
  end if;

  if new.origem_ref is distinct from v_f.codigo then
    if new.observacao is not null and nullif(trim(new.origem_ref), '') is not null then
      new.observacao := replace(new.observacao, new.origem_ref, v_f.codigo);
    end if;
    new.origem_ref := v_f.codigo;
  end if;

  if tg_table_name = 'alm_req_balcao' then
    v_pessoa := nullif(trim(new.colaborador_registro), '');
  else
    v_pessoa := nullif(trim(new.retirante_matricula), '');
  end if;
  if v_pessoa is not null and nullif(trim(v_f.registro), '') is not null and v_pessoa <> trim(v_f.registro) then
    raise exception 'A ficha % é de % (registro %), mas a % está em nome do registro %. Confira a ficha de origem.',
      v_f.codigo, v_f.nome, v_f.registro,
      case when tg_table_name = 'alm_req_balcao' then 'requisição' else 'retirada' end, v_pessoa
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and v_f.status <> 'ATIVA' then
    raise exception 'A ficha % está %: não gera requisição nem retirada.', v_f.codigo, lower(v_f.status)
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.alm_origem_ficha_epi_resolver() from public, anon, authenticated;

drop trigger if exists trg_alm_req_balcao_origem_ficha on public.alm_req_balcao;
create trigger trg_alm_req_balcao_origem_ficha
  before insert or update of origem, origem_ref, origem_id, colaborador_registro on public.alm_req_balcao
  for each row execute function public.alm_origem_ficha_epi_resolver();

drop trigger if exists trg_alm_sol_extra_origem_ficha on public.alm_solicitacao_extra;
create trigger trg_alm_sol_extra_origem_ficha
  before insert or update of origem, origem_ref, origem_id, retirante_matricula on public.alm_solicitacao_extra
  for each row execute function public.alm_origem_ficha_epi_resolver();

-- 5. alm_req_balcao_salvar grava origem_id e o log usa o código resolvido -----
do $$
declare
  v_def text := pg_get_functiondef('public.alm_req_balcao_salvar(uuid,jsonb,jsonb)'::regprocedure);
  v_a1 text := E'       pendente_confirmacao, origem, origem_ref)\n    values';
  v_a2 text := E'nullif(p_req->>''origem'',''''), nullif(p_req->>''origem_ref'',''''))\n    returning * into v_row;';
  v_a3 text := E'coalesce(nullif(p_req->>''origem_ref'',''''), ''outro formulário'')';
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 or position(v_a3 in v_def) = 0 then
    raise exception 'alm_req_balcao_salvar mudou: ajuste a migration de origem_id.';
  end if;
  v_def := replace(v_def, v_a1, E'       pendente_confirmacao, origem, origem_ref, origem_id)\n    values');
  v_def := replace(v_def, v_a2, E'nullif(p_req->>''origem'',''''), nullif(p_req->>''origem_ref'',''''), nullif(p_req->>''origem_id'','''')::uuid)\n    returning * into v_row;');
  v_def := replace(v_def, v_a3, E'coalesce(v_row.origem_ref, ''outro formulário'')');
  execute v_def;
end $$;

-- 6. Contingências: ficha × saída e requisição de outra pessoa ----------------
do $$
declare
  v_def text := pg_get_functiondef('public.alm_contingencias_achados()'::regprocedure);
  v_ancora text := E'    union all\n    -- Ficha cancelada, requisição ainda valendo.';
  v_novo text := $blk$
    union all
    -- O que a ficha assinada entregou × o que saiu do estoque (requisições e
    -- retiradas vivas ligadas a ela). Falta = EPI entregue sem baixa (crítica);
    -- sobra ou troca de material = estoque baixado diferente do entregue.
    select 'epi_itens_divergentes',
           case when d.falta then 'critica' else 'alta' end,
           'ficha_epi', f.codigo, f.id, f.data_entrega,
           'Ficha de EPI diferente da saída',
           format('A ficha %s (%s) não bate com a saída (%s): %s. Ajuste a requisição ao que foi entregue, ou cancele e refaça a ficha se a entrega foi outra.',
                  f.codigo, f.nome, d.saidas, d.lista),
           null, d.rqb
      from fichas f
      join lateral (
        with p as (
          select ltrim(trim(i.codigo_sap), '0') mat, sum(i.quantidade) q
            from public.ssma_fichas_epi_itens i
           where i.ficha_id = f.id and nullif(trim(i.codigo_sap), '') is not null
           group by 1),
        s as (
          select u.mat, sum(u.q) q from (
            select ltrim(trim(i.material), '0') mat, i.quantidade q
              from rqb_viva r join public.alm_req_balcao_itens i on i.requisicao_id = r.id
             where r.origem = 'ficha_epi' and r.origem_ref = f.codigo
            union all
            select ltrim(upper(trim(x->>'material')), '0'), nullif(x->>'quantidade', '')::numeric
              from public.alm_solicitacao_extra so
              cross join jsonb_array_elements(coalesce(so.itens, '[]'::jsonb)) x
             where so.origem_ref = f.codigo and so.excluido_em is null) u
           group by 1)
        select string_agg(format('%s: ficha %s × saída %s', coalesce(p.mat, s.mat),
                                 trim_scale(coalesce(p.q, 0)), trim_scale(coalesce(s.q, 0))), '; '
                          order by coalesce(p.mat, s.mat)) lista,
               bool_or(coalesce(s.q, 0) < coalesce(p.q, 0)) falta,
               (select string_agg(z.codigo, ', ' order by z.codigo) from (
                  select r.codigo from rqb_viva r where r.origem = 'ficha_epi' and r.origem_ref = f.codigo
                  union all
                  select so.codigo from public.alm_solicitacao_extra so where so.origem_ref = f.codigo and so.excluido_em is null) z) saidas,
               (select min(r.codigo) from rqb_viva r where r.origem = 'ficha_epi' and r.origem_ref = f.codigo) rqb
          from p full join s on s.mat = p.mat
         where round(coalesce(p.q, 0), 3) <> round(coalesce(s.q, 0), 3)
      ) d on d.lista is not null
     where f.status = 'ATIVA'
       and (exists (select 1 from rqb_viva r where r.origem = 'ficha_epi' and r.origem_ref = f.codigo)
            or exists (select 1 from public.alm_solicitacao_extra so where so.origem_ref = f.codigo and so.excluido_em is null))

    union all
    -- Requisição ligada à ficha de outra pessoa (vínculo trocado).
    select 'epi_requisicao_outra_pessoa', 'critica', 'req_balcao', r.codigo, r.id, r.data,
           'Requisição ligada à ficha de outra pessoa',
           format('A %s está ligada à ficha %s (%s, registro %s), mas foi feita para %s (registro %s). Confira de qual ficha ela é.',
                  r.codigo, f.codigo, f.nome, f.registro, r.colaborador_nome, r.colaborador_registro),
           null, f.codigo
      from rqb_viva r
      join public.ssma_fichas_epi f on f.codigo = r.origem_ref
     where r.origem = 'ficha_epi'
       and trim(coalesce(r.colaborador_registro, '')) <> trim(coalesce(f.registro, ''))
$blk$;
begin
  if position(v_ancora in v_def) = 0 then
    raise exception 'alm_contingencias_achados mudou: ajuste a migration.';
  end if;
  if position('epi_itens_divergentes' in v_def) > 0 then
    return;  -- já aplicada
  end if;
  v_def := replace(v_def, v_ancora, v_novo || E'\n' || v_ancora);
  execute v_def;
end $$;
