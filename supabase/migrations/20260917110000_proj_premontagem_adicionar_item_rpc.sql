-- Almoxarifado > Projetos > Pré-montagem — adicionar item ao romaneio de
-- uma ordem já aberta (esqueceu um item na abertura, ou precisa incluir um
-- avulso). Diferente de `proj_editar_item_premontagem` (corrige quantidade
-- de um item que já está no romaneio): esta insere uma linha nova.
--
-- Não debita nada sozinha — o item nasce com qtd_separada = 0, separado =
-- false, igual a qualquer item da abertura original:
--   - se a ordem ainda não confirmou separação, o item aparece na
--     separação física normal (ModalSeparacao), como os demais;
--   - se já confirmou, o usuário usa `proj_editar_item_premontagem` (a
--     mesma correção pós-confirmação) para dar a quantidade e debitar.

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

revoke execute on function public.proj_adicionar_item_premontagem(uuid, uuid, text, numeric, text, jsonb) from public, anon;
grant execute on function public.proj_adicionar_item_premontagem(uuid, uuid, text, numeric, text, jsonb) to authenticated, service_role;
