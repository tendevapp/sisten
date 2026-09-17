-- Almoxarifado > Projetos > Pré-montagem — 4 RPCs de edição de ordem.
--
-- Uma por tipo de edição (não uma função genérica): cada uma tem uma
-- implicação de estoque diferente. Todas `security definer`, todas checam
-- `form_pode_editar` por dentro (a RLS de tabela sozinha não barra
-- security definer) e logam em `proj_ordens_premontagem_alteracoes`.
--
-- Um movimento de pré-montagem é gravado com `documento_tipo = 'ordem',
-- documento_id = <ordem.id>` e um `item_id` por linha (ver
-- `proj_confirmar_separacao_premontagem`, migration
-- `20260909130228_proj_separacao_em_duas_etapas.sql`) — dá para estornar
-- granular por item (`documento_id + item_id`) ou tudo de uma vez
-- (`documento_id` sozinho). O estorno soft-deleta (`proj_movimentos.excluido
-- = true`, o campo booleano que `vw_proj_saldo_almox` de fato filtra — não
-- basta preencher só `excluido_em`/`excluido_por`) em vez de apagar; o saldo
-- recalcula sozinho.

-- ---------------------------------------------------------------------------
-- 1. Cabeçalho — observação e quantidade de kits. Sem estoque envolvido.
-- Não cria nem apaga proj_kits: se o número real de tramos-alvo mudar,
-- continua exigindo abrir outra ordem.
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
-- 2. Item — só depois da separação confirmada (antes disso, o check físico
-- normal via proj_marcar_item_ordem_premontagem já resolve, sem trava de
-- autor — é tarefa compartilhada de bancada, não edição de registro próprio).
-- Estorna o movimento do item e relança com a quantidade corrigida.
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
     set excluido = true, excluido_em = now(), excluido_por = p_usuario->>'nome'
   where documento_id = v_item.ordem_id
     and item_id = v_item.item_id
     and tipo = 'saida_premontagem'
     and not excluido;

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
         separado = (p_nova_qtd_separada > 0)
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
-- 3. Zona (só T1) — a operação mais invasiva: recalcula qual fatia da BOM
-- compõe o romaneio. O romaneio novo (p_itens) chega pronto do cliente —
-- mesmo padrão de proj_abrir_ordem_premontagem, que também recebe o
-- romaneio já calculado (a lógica de BOM/zona é 100% client-side, em
-- src/lib/projetosZonas.ts). Estorna tudo que a ordem já tinha debitado, de
-- qualquer zona, e reabre a separação do zero.
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
     set excluido = true, excluido_em = now(), excluido_por = p_usuario->>'nome'
   where documento_id = p_ordem_id and tipo = 'saida_premontagem' and not excluido;

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
-- 4. Cancelamento — estorna tudo, status = 'cancelada'. Não mexe em
-- proj_kits nem em proj_tramos_gwjaco.status: um kit é compartilhado por
-- tramo_unidade_id entre zonas diferentes (on conflict do nothing na
-- abertura), e mais de uma zona pode estar em_premontagem no mesmo tramo ao
-- mesmo tempo — reverter o tramo aqui poderia reabri-lo com outra
-- ordem/zona ainda em andamento nele.
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
     set excluido = true, excluido_em = now(), excluido_por = p_usuario->>'nome'
   where documento_id = p_ordem_id and tipo = 'saida_premontagem' and not excluido;

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

revoke execute on function public.proj_editar_cabecalho_premontagem(uuid, text, integer, jsonb) from public, anon;
revoke execute on function public.proj_editar_item_premontagem(uuid, numeric, jsonb) from public, anon;
revoke execute on function public.proj_trocar_zona_premontagem(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.proj_cancelar_ordem_premontagem(uuid, text, jsonb) from public, anon;

grant execute on function public.proj_editar_cabecalho_premontagem(uuid, text, integer, jsonb) to authenticated, service_role;
grant execute on function public.proj_editar_item_premontagem(uuid, numeric, jsonb) to authenticated, service_role;
grant execute on function public.proj_trocar_zona_premontagem(uuid, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.proj_cancelar_ordem_premontagem(uuid, text, jsonb) to authenticated, service_role;
