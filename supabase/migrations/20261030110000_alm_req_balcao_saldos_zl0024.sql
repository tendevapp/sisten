-- Requisição no Balcão pendente de confirmação × ZL0024 importada.
--
-- A tag "Sem saldo ZL0024" da requisição vem de `alm_req_balcao_itens.sem_saldo`
-- / `saldo_zl0024`, gravados quando a requisição foi salva. Geral › Pendências
-- recalcula pela ZL0024 de hoje (prontidaoRegularizacao, retiradaSemSaldoBaixa.ts),
-- então a RSS aparecia "Já pode regularizar" enquanto a RQB dela seguia "Sem saldo".
--
-- alm_req_balcao_atualizar_saldos() regrava as requisições PENDENTES:
--   1. todo item: saldo_zl0024 e sem_saldo pelo depósito do item (como o salvar faz);
--   2. itens das RQBs de retirada sem saldo (origem sol_extra_sem_saldo): mesma
--      regra das Pendências — o saldo é repartido entre as solicitações
--      extraordinárias PENDENTES (Projeto e Sem Saldo) da mais antiga para a mais
--      nova, cada item inteiro num depósito só (o de maior saldo restante que
--      cobre), sem 0105 e sem depósito inativo. Item coberto vai para esse
--      depósito e perde a tag; item não coberto fica com a tag, mesmo que o
--      depósito tenha saldo — ele já está reservado para uma retirada mais antiga.
--      Em transferência o próprio destino não é escolhido como saída.
-- Mudança de depósito entra no log da requisição.
--
-- Roda sozinha a cada importação da ZL0024 (gatilho no ops_importacoes, que o
-- importador grava no fim) e pode ser chamada pela RPC.
--
-- Depósitos inativos: mesma lista de DEPOSITOS_INATIVOS (src/lib/almoxarifado.ts).

create or replace function public.alm_req_balcao_atualizar_saldos()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sem_saida constant text[] := array['0030','0070','0080','0100','0110','0120','0126','0201','0202','0203','0210','0105'];
  v_sol record;
  v_item jsonb;
  v_mat text;
  v_qtd numeric;
  v_rqb_id uuid;
  v_rqb_tipo text;
  v_rqb_dest text;
  v_dep text;
  v_saldo numeric;
  v_mudou int;
  v_n int := 0;
begin
  create temp table if not exists _alm_saldo_restante (
    material text not null, deposito text not null, saldo numeric not null, primary key (material, deposito)
  ) on commit drop;
  truncate _alm_saldo_restante;
  insert into _alm_saldo_restante
  select ltrim(upper(trim(material)), '0'), lpad(trim(deposito), 4, '0'), greatest(sum(quantidade), 0)
    from public.sap_zl0024_stk
   where coalesce(trim(material), '') <> '' and coalesce(trim(deposito), '') <> ''
     and lpad(trim(deposito), 4, '0') <> all (v_sem_saida)
   group by 1, 2;

  -- 1. Saldo do depósito de cada item pendente.
  with novo as (
    select i.id, i.quantidade,
           coalesce((select sum(s.quantidade) from public.sap_zl0024_stk s
                      where s.material = i.material and lpad(s.deposito, 4, '0') = lpad(i.deposito, 4, '0')), 0) as saldo
      from public.alm_req_balcao_itens i
      join public.alm_req_balcao r on r.id = i.requisicao_id
     where r.pendente_confirmacao and not r.excluido
  )
  update public.alm_req_balcao_itens i
     set saldo_zl0024 = n.saldo, sem_saldo = (n.saldo <= 0 or n.quantidade > n.saldo)
    from novo n
   where i.id = n.id
     and (i.saldo_zl0024 is distinct from n.saldo or i.sem_saldo is distinct from (n.saldo <= 0 or n.quantidade > n.saldo));
  get diagnostics v_n = row_count;

  -- 2. Repartição das Pendências, da solicitação mais antiga para a mais nova.
  for v_sol in
    select s.codigo, s.tipo, s.itens
      from public.alm_solicitacao_extra s
     where s.status = 'PENDENTE' and s.excluido_em is null
     order by s.data, s.created_at
  loop
    v_rqb_id := null; v_rqb_tipo := null; v_rqb_dest := null;
    if v_sol.tipo = 'SEM_SALDO' and v_sol.codigo is not null then
      select r.id, r.tipo_movimento, r.deposito_destino into v_rqb_id, v_rqb_tipo, v_rqb_dest
        from public.alm_req_balcao r
       where r.origem = 'sol_extra_sem_saldo' and r.origem_ref = v_sol.codigo
         and r.pendente_confirmacao and not r.excluido
       limit 1;
    end if;
    v_mudou := 0;

    for v_item in select * from jsonb_array_elements(coalesce(v_sol.itens, '[]'::jsonb)) loop
      v_mat := ltrim(upper(trim(v_item->>'material')), '0');
      v_qtd := coalesce(nullif(v_item->>'quantidade', '')::numeric, 0);
      v_dep := null;
      select rs.deposito, rs.saldo into v_dep, v_saldo
        from _alm_saldo_restante rs
       where rs.material = v_mat and rs.saldo >= v_qtd
         and (v_rqb_id is null or v_rqb_tipo <> 'transferencia'
              or rs.deposito <> lpad(coalesce(v_rqb_dest, ''), 4, '0'))
       order by rs.saldo desc, rs.deposito
       limit 1;
      if v_dep is not null then
        update _alm_saldo_restante set saldo = saldo - v_qtd where material = v_mat and deposito = v_dep;
      end if;

      if v_rqb_id is not null then
        if v_dep is not null then
          update public.alm_req_balcao_itens i
             set deposito = v_dep,
                 saldo_zl0024 = coalesce((select sum(s.quantidade) from public.sap_zl0024_stk s
                                           where s.material = i.material and lpad(s.deposito, 4, '0') = v_dep), 0),
                 sem_saldo = false
           where i.requisicao_id = v_rqb_id and ltrim(upper(trim(i.material)), '0') = v_mat
             and (lpad(coalesce(i.deposito, ''), 4, '0') <> v_dep or i.sem_saldo);
          get diagnostics v_n = row_count;
          if v_n > 0 then v_mudou := v_mudou + v_n; end if;
        else
          update public.alm_req_balcao_itens i
             set sem_saldo = true
           where i.requisicao_id = v_rqb_id and ltrim(upper(trim(i.material)), '0') = v_mat and not i.sem_saldo;
          get diagnostics v_n = row_count;
          if v_n > 0 then v_mudou := v_mudou + v_n; end if;
        end if;
      end if;
    end loop;

    if v_rqb_id is not null and v_mudou > 0 then
      update public.alm_req_balcao r
         set deposito_origem = coalesce((select i.deposito from public.alm_req_balcao_itens i
                                          where i.requisicao_id = r.id order by i.ordem limit 1), r.deposito_origem),
             updated_at = now()
       where r.id = v_rqb_id;
      perform public.alm_req_balcao_log(v_rqb_id, 'edicao', '[]'::jsonb,
        format('Saldo/depósito dos itens atualizados pela ZL0024 importada (retirada %s).', v_sol.codigo), 'ZL0024');
    end if;
  end loop;

  return (select count(*) from public.alm_req_balcao_itens i join public.alm_req_balcao r on r.id = i.requisicao_id
           where r.pendente_confirmacao and not r.excluido and i.sem_saldo)::int;
end;
$function$;

revoke all on function public.alm_req_balcao_atualizar_saldos() from public, anon;
grant execute on function public.alm_req_balcao_atualizar_saldos() to authenticated;

-- Gatilho: o importador da ZL0024 grava o log em ops_importacoes depois de
-- substituir sap_zl0024_stk. Falha aqui não pode derrubar a importação.
create or replace function public.alm_req_balcao_saldos_apos_zl0024()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  begin
    perform public.alm_req_balcao_atualizar_saldos();
  exception when others then
    raise warning 'alm_req_balcao: falha ao atualizar saldos após a ZL0024: %', sqlerrm;
  end;
  return null;
end;
$function$;

drop trigger if exists trg_alm_req_balcao_saldos_zl0024 on public.ops_importacoes;
create trigger trg_alm_req_balcao_saldos_zl0024
  after insert on public.ops_importacoes
  for each row when (new.type = 'ZL0024')
  execute function public.alm_req_balcao_saldos_apos_zl0024();

-- "Dar baixa" (Pendências) reescolhia o depósito pelo maior saldo, sem repartir
-- entre as retiradas — podia divergir da tag. Agora usa a mesma rotina.
create or replace function public.alm_sol_extra_atualizar_depositos_rqb(p_codigo_rss text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_codigo text;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  select codigo into v_codigo from public.alm_req_balcao
   where origem = 'sol_extra_sem_saldo' and origem_ref = p_codigo_rss and not excluido and pendente_confirmacao limit 1;
  if v_codigo is null then
    return null;
  end if;
  perform public.alm_req_balcao_atualizar_saldos();
  return v_codigo;
end;
$function$;

-- Acerta as pendentes de hoje com a ZL0024 já importada.
select public.alm_req_balcao_atualizar_saldos();
