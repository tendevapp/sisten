-- =====================================================================
-- Projetos › Pré-montagem — edição de ordem (de fato no banco) e
-- remoção de itens que faltam separar.
-- =====================================================================
-- As migrations 20260917100000 / 100100 / 110000 (histórico + RPCs de editar
-- cabeçalho, item, zona, cancelar e adicionar item) estão no repositório mas
-- NUNCA chegaram ao banco: o modal "Editar ordem" chamava funções que não
-- existem. Além disso elas estornavam com `proj_movimentos.excluido = true`,
-- coluna que não existe — o saldo (`vw_proj_saldo_almox`) filtra por
-- `excluido_em is null`. Esta migration recria tudo já com o estorno certo.
--
-- Fica DE FORA a troca de RLS das tabelas (20260917100000): ela derruba as
-- policies "for all" atuais e dava grant ao anon no histórico — mudança de
-- permissão que precisa de decisão à parte (ver seguranca-anon-service-role).
--
-- Novo: `proj_remover_itens_premontagem` — tira do romaneio itens que ainda
-- não foram separados (nada debitado), um ou vários, para encerrar a ordem
-- sem o kit completo.

-- ---------------------------------------------------------------------------
-- Histórico de alterações (mesmo formato de alm_receb_alteracoes)
-- ---------------------------------------------------------------------------
create table if not exists public.proj_ordens_premontagem_alteracoes (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.proj_ordens_premontagem (id) on delete cascade,
  tipo text not null check (tipo in ('cabecalho', 'item', 'zona', 'cancelamento', 'remocao')),
  alteracoes jsonb not null,
  criado_por_id uuid,
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_proj_ordens_premontagem_alteracoes_ordem
  on public.proj_ordens_premontagem_alteracoes (ordem_id, created_at desc);

alter table public.proj_ordens_premontagem_alteracoes enable row level security;
drop policy if exists "proj_ordens_premontagem_alteracoes_sel" on public.proj_ordens_premontagem_alteracoes;
create policy "proj_ordens_premontagem_alteracoes_sel" on public.proj_ordens_premontagem_alteracoes
  for select to authenticated using (true);
-- Sem policy de insert: só as RPCs security definer gravam.
grant select on public.proj_ordens_premontagem_alteracoes to authenticated;
grant all on public.proj_ordens_premontagem_alteracoes to service_role;

-- ---------------------------------------------------------------------------
-- 1. Cabeçalho — observação e quantidade de kits. Sem estoque envolvido.
-- ---------------------------------------------------------------------------
create or replace function public.proj_editar_cabecalho_premontagem(
  p_ordem_id uuid,
  p_observacao text,
  p_quantidade_kits integer,
  p_usuario jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem record;
  v_alteracoes jsonb := '[]'::jsonb;
  v_obs_nova text := nullif(p_observacao, '');
begin
  select * into v_ordem from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pré-montagem não encontrada.';
  end if;
  if not public.form_pode_editar(v_ordem.criado_por_id::text) then
    raise exception 'Você não tem permissão para editar esta ordem.';
  end if;
  if v_ordem.status = 'cancelada' then
    raise exception 'Ordem cancelada não pode ser editada.';
  end if;
  if p_quantidade_kits is not null and p_quantidade_kits <= 0 then
    raise exception 'Quantidade de kits deve ser maior que zero.';
  end if;

  if v_ordem.observacao is distinct from v_obs_nova then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'observacao', 'de', v_ordem.observacao, 'para', v_obs_nova);
  end if;
  if p_quantidade_kits is not null and v_ordem.quantidade_kits is distinct from p_quantidade_kits then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'quantidade_kits', 'de', v_ordem.quantidade_kits, 'para', p_quantidade_kits);
  end if;

  update public.proj_ordens_premontagem
     set observacao = v_obs_nova,
         quantidade_kits = coalesce(p_quantidade_kits, quantidade_kits)
   where id = p_ordem_id;

  if jsonb_array_length(v_alteracoes) > 0 then
    insert into public.proj_ordens_premontagem_alteracoes (ordem_id, tipo, alteracoes, criado_por_id, criado_por_nome)
    values (p_ordem_id, 'cabecalho', v_alteracoes, nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Item — só depois da separação confirmada. Estorna o movimento do item e
-- relança com a quantidade corrigida (também serve para separar depois um
-- item que ficou sem check na confirmação).
-- ---------------------------------------------------------------------------
create or replace function public.proj_editar_item_premontagem(
  p_ordem_item_id uuid,
  p_nova_qtd_separada numeric,
  p_usuario jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_qtd_antiga numeric;
begin
  select oi.id, oi.ordem_id, oi.item_id, oi.qtd_separada,
         o.criado_por_id, o.separacao_confirmada_em, o.codigo, o.projeto, o.tramo, o.status
    into v_item
  from public.proj_ordens_premontagem_itens oi
  join public.proj_ordens_premontagem o on o.id = oi.ordem_id
  where oi.id = p_ordem_item_id;

  if not found then
    raise exception 'Item da ordem de pré-montagem não encontrado.';
  end if;
  if not public.form_pode_editar(v_item.criado_por_id::text) then
    raise exception 'Você não tem permissão para editar esta ordem.';
  end if;
  if v_item.status = 'cancelada' then
    raise exception 'Ordem cancelada não pode ser editada.';
  end if;
  if v_item.separacao_confirmada_em is null then
    raise exception 'A separação desta ordem ainda não foi confirmada — use o check físico normal, não esta correção.';
  end if;
  if p_nova_qtd_separada < 0 then
    raise exception 'Quantidade separada não pode ser negativa.';
  end if;

  v_qtd_antiga := v_item.qtd_separada;
  if v_qtd_antiga = p_nova_qtd_separada then
    return;
  end if;

  update public.proj_movimentos
     set excluido_em = now(), excluido_por = p_usuario->>'nome'
   where documento_id = v_item.ordem_id
     and item_id = v_item.item_id
     and tipo = 'saida_premontagem'
     and excluido_em is null;

  if p_nova_qtd_separada > 0 then
    perform public.proj_validar_saldo(
      jsonb_build_array(jsonb_build_object('item_id', v_item.item_id, 'quantidade', p_nova_qtd_separada))
    );

    insert into public.proj_movimentos
      (projeto, tipo, item_id, quantidade, documento_tipo, documento_id, documento_codigo,
       tramo, criado_por_id, criado_por_nome)
    values
      (v_item.projeto, 'saida_premontagem', v_item.item_id, -p_nova_qtd_separada,
       'ordem', v_item.ordem_id, v_item.codigo, v_item.tramo,
       nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome');
  end if;

  update public.proj_ordens_premontagem_itens
     set qtd_separada = p_nova_qtd_separada,
         separado = (p_nova_qtd_separada > 0),
         separado_em = case when p_nova_qtd_separada > 0 then now() else null end,
         separado_por_nome = case when p_nova_qtd_separada > 0 then p_usuario->>'nome' else null end
   where id = p_ordem_item_id;

  insert into public.proj_ordens_premontagem_alteracoes (ordem_id, tipo, alteracoes, criado_por_id, criado_por_nome)
  values (
    v_item.ordem_id, 'item',
    jsonb_build_array(jsonb_build_object('campo', 'qtd_separada:' || v_item.item_id::text, 'de', v_qtd_antiga, 'para', p_nova_qtd_separada)),
    nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Zona (só T1) — estorna tudo, troca o romaneio e reabre a separação.
-- ---------------------------------------------------------------------------
create or replace function public.proj_trocar_zona_premontagem(
  p_ordem_id uuid,
  p_nova_zona text,
  p_itens jsonb,
  p_usuario jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem record;
  v_zona_antiga text;
begin
  select * into v_ordem from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pré-montagem não encontrada.';
  end if;
  if not public.form_pode_editar(v_ordem.criado_por_id::text) then
    raise exception 'Você não tem permissão para editar esta ordem.';
  end if;
  if v_ordem.status <> 'em_processamento' then
    raise exception 'Só é possível trocar a zona de uma ordem em processamento.';
  end if;
  if v_ordem.tramo <> 'T1' then
    raise exception 'Só o tramo T1 tem zonas de pré-montagem.';
  end if;

  v_zona_antiga := v_ordem.zona;

  update public.proj_movimentos
     set excluido_em = now(), excluido_por = p_usuario->>'nome'
   where documento_id = p_ordem_id and tipo = 'saida_premontagem' and excluido_em is null;

  delete from public.proj_ordens_premontagem_itens where ordem_id = p_ordem_id;

  insert into public.proj_ordens_premontagem_itens
    (ordem_id, item_id, subconjunto, qtd_por_kit, qtd_total, localizador, saldo_no_momento)
  select
    p_ordem_id, (x->>'item_id')::uuid, nullif(x->>'subconjunto', ''),
    (x->>'qtd_por_kit')::numeric, (x->>'qtd_total')::numeric,
    nullif(x->>'localizador', ''),
    (select s.saldo from public.vw_proj_saldo_almox s where s.item_id = (x->>'item_id')::uuid)
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x;

  update public.proj_ordens_premontagem
     set zona = p_nova_zona, separacao_confirmada_em = null, separacao_confirmada_por_nome = null
   where id = p_ordem_id;

  insert into public.proj_ordens_premontagem_alteracoes (ordem_id, tipo, alteracoes, criado_por_id, criado_por_nome)
  values (
    p_ordem_id, 'zona',
    jsonb_build_array(jsonb_build_object('campo', 'zona', 'de', v_zona_antiga, 'para', p_nova_zona)),
    nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Cancelamento — estorna tudo, status = 'cancelada'.
-- ---------------------------------------------------------------------------
create or replace function public.proj_cancelar_ordem_premontagem(
  p_ordem_id uuid,
  p_motivo text,
  p_usuario jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem record;
begin
  select * into v_ordem from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pré-montagem não encontrada.';
  end if;
  if not public.form_pode_editar(v_ordem.criado_por_id::text) then
    raise exception 'Você não tem permissão para cancelar esta ordem.';
  end if;
  if v_ordem.status = 'cancelada' then
    raise exception 'Esta ordem já está cancelada.';
  end if;
  if v_ordem.status = 'concluida' then
    raise exception 'Ordem já concluída não pode ser cancelada.';
  end if;

  update public.proj_movimentos
     set excluido_em = now(), excluido_por = p_usuario->>'nome'
   where documento_id = p_ordem_id and tipo = 'saida_premontagem' and excluido_em is null;

  update public.proj_ordens_premontagem
     set status = 'cancelada',
         observacao = coalesce(nullif(p_motivo, ''), observacao)
   where id = p_ordem_id;

  insert into public.proj_ordens_premontagem_alteracoes (ordem_id, tipo, alteracoes, criado_por_id, criado_por_nome)
  values (
    p_ordem_id, 'cancelamento',
    jsonb_build_array(jsonb_build_object('campo', 'status', 'de', v_ordem.status, 'para', 'cancelada', 'motivo', p_motivo)),
    nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Adicionar item ao romaneio (item esquecido na abertura). Não debita.
-- ---------------------------------------------------------------------------
create or replace function public.proj_adicionar_item_premontagem(
  p_ordem_id uuid,
  p_item_id uuid,
  p_subconjunto text,
  p_qtd_total numeric,
  p_localizador text,
  p_usuario jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem record;
  v_novo_id uuid;
  v_qtd_por_kit numeric;
begin
  select * into v_ordem from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pré-montagem não encontrada.';
  end if;
  if not public.form_pode_editar(v_ordem.criado_por_id::text) then
    raise exception 'Você não tem permissão para editar esta ordem.';
  end if;
  if v_ordem.status = 'cancelada' then
    raise exception 'Ordem cancelada não pode ser editada.';
  end if;
  if p_qtd_total is null or p_qtd_total <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.proj_itens where id = p_item_id) then
    raise exception 'Item não encontrado no catálogo do projeto.';
  end if;
  if exists (select 1 from public.proj_ordens_premontagem_itens where ordem_id = p_ordem_id and item_id = p_item_id) then
    raise exception 'Este item já está no romaneio desta ordem — corrija a quantidade em vez de adicionar de novo.';
  end if;

  v_qtd_por_kit := case when coalesce(v_ordem.quantidade_kits, 0) > 0 then p_qtd_total / v_ordem.quantidade_kits else p_qtd_total end;

  insert into public.proj_ordens_premontagem_itens
    (ordem_id, item_id, subconjunto, qtd_por_kit, qtd_total, localizador, saldo_no_momento)
  values
    (p_ordem_id, p_item_id, nullif(p_subconjunto, ''), v_qtd_por_kit, p_qtd_total, nullif(p_localizador, ''),
     (select s.saldo from public.vw_proj_saldo_almox s where s.item_id = p_item_id))
  returning id into v_novo_id;

  insert into public.proj_ordens_premontagem_alteracoes (ordem_id, tipo, alteracoes, criado_por_id, criado_por_nome)
  values (
    p_ordem_id, 'item',
    jsonb_build_array(jsonb_build_object('campo', 'item_adicionado:' || p_item_id::text, 'de', null, 'para', p_qtd_total)),
    nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome'
  );

  return v_novo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Remover itens que faltam separar — encerrar a ordem sem o kit completo.
-- Só apaga linha sem nada separado (separado = false e qtd_separada = 0),
-- então não há débito a estornar. Libera o autor/admin (edição da ordem) e
-- quem separa na bancada (page_access proj_lancar_premontagem), porque a
-- separação física é tarefa compartilhada — o mesmo critério do check.
-- Devolve quantas linhas saíram; linhas já separadas são ignoradas.
-- ---------------------------------------------------------------------------
create or replace function public.proj_remover_itens_premontagem(
  p_ordem_id uuid,
  p_ordem_item_ids uuid[],
  p_usuario jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem record;
  v_removidos jsonb;
  v_qtd integer;
begin
  select * into v_ordem from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pré-montagem não encontrada.';
  end if;
  if not (public.form_pode_editar(v_ordem.criado_por_id::text) or public.has_page_access('proj_lancar_premontagem')) then
    raise exception 'Você não tem permissão para alterar o romaneio desta ordem.';
  end if;
  if v_ordem.status <> 'em_processamento' then
    raise exception 'Só é possível tirar itens de uma ordem em processamento.';
  end if;

  with apagados as (
    delete from public.proj_ordens_premontagem_itens oi
     where oi.ordem_id = p_ordem_id
       and oi.id = any(coalesce(p_ordem_item_ids, '{}'::uuid[]))
       and not oi.separado
       and coalesce(oi.qtd_separada, 0) = 0
    returning oi.item_id, oi.qtd_total
  )
  select count(*)::int,
         coalesce(jsonb_agg(jsonb_build_object('campo', 'item_removido:' || item_id::text, 'de', qtd_total, 'para', null)), '[]'::jsonb)
    into v_qtd, v_removidos
    from apagados;

  if v_qtd > 0 then
    insert into public.proj_ordens_premontagem_alteracoes (ordem_id, tipo, alteracoes, criado_por_id, criado_por_nome)
    values (p_ordem_id, 'remocao', v_removidos, nullif(p_usuario->>'id', '')::uuid, p_usuario->>'nome');
  end if;

  return v_qtd;
end;
$$;

revoke execute on function public.proj_editar_cabecalho_premontagem(uuid, text, integer, jsonb) from public, anon;
revoke execute on function public.proj_editar_item_premontagem(uuid, numeric, jsonb) from public, anon;
revoke execute on function public.proj_trocar_zona_premontagem(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.proj_cancelar_ordem_premontagem(uuid, text, jsonb) from public, anon;
revoke execute on function public.proj_adicionar_item_premontagem(uuid, uuid, text, numeric, text, jsonb) from public, anon;
revoke execute on function public.proj_remover_itens_premontagem(uuid, uuid[], jsonb) from public, anon;

grant execute on function public.proj_editar_cabecalho_premontagem(uuid, text, integer, jsonb) to authenticated, service_role;
grant execute on function public.proj_editar_item_premontagem(uuid, numeric, jsonb) to authenticated, service_role;
grant execute on function public.proj_trocar_zona_premontagem(uuid, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.proj_cancelar_ordem_premontagem(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.proj_adicionar_item_premontagem(uuid, uuid, text, numeric, text, jsonb) to authenticated, service_role;
grant execute on function public.proj_remover_itens_premontagem(uuid, uuid[], jsonb) to authenticated, service_role;
