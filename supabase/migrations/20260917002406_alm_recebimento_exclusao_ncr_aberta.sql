-- ============================================================================
-- Almoxarifado > Recebimento — exclusão lógica de NCR aberta.
-- Mantém o registro e grava a operação no histórico; autor ou admin podem excluir.
-- Também preserva os itens selecionados ao abrir uma NCR avulsa.
-- ============================================================================

create or replace function public.alm_receb_registrar_nc(
  p_nc jsonb,
  p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_codigo text;
  v_tipo text := coalesce(nullif(p_nc->>'tipo', ''), 'outros');
  v_descricao text := nullif(btrim(coalesce(p_nc->>'descricao', '')), '');
  v_usuario_id uuid := auth.uid();
  v_tentativa integer;
begin
  if v_usuario_id is null then
    raise exception 'É necessário estar autenticado para abrir uma não conformidade.';
  end if;
  if v_descricao is null then
    raise exception 'Informe a descrição da não conformidade.';
  end if;
  if v_tipo not in ('falta', 'excedente', 'avaria', 'material_errado', 'sem_pedido', 'volume', 'outros') then
    raise exception 'Tipo de não conformidade inválido.';
  end if;

  for v_tentativa in 1..5 loop
    v_codigo := public.alm_receb_proximo_codigo('NCR', current_date, 'alm_receb_nc');
    begin
      insert into public.alm_receb_nc (
        codigo, conferencia_id, carga_id, nro_pedido, fornecedor, tipo, severidade,
        descricao, itens_resumo, evidencias, status, responsavel, criado_por_id, criado_por_nome
      ) values (
        v_codigo, null, null, nullif(p_nc->>'nro_pedido', ''), nullif(p_nc->>'fornecedor', ''), v_tipo,
        coalesce(nullif(p_nc->>'severidade', ''), 'media'), v_descricao,
        coalesce(p_nc->'itens_resumo', '[]'::jsonb), coalesce(p_nc->'evidencias', '[]'::jsonb), 'aberta',
        nullif(p_nc->>'responsavel', ''), v_usuario_id, nullif(p_user->>'nome', '')
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      if v_tentativa = 5 then raise; end if;
    end;
  end loop;

  insert into public.alm_receb_alteracoes (
    entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome
  ) values (
    'nc', v_id, v_codigo,
    jsonb_build_array(jsonb_build_object('campo', 'criação', 'de', '', 'para', 'NCR avulsa aberta')),
    'NCR avulsa aberta', v_usuario_id, nullif(p_user->>'nome', '')
  );

  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end;
$$;

create or replace function public.alm_receb_excluir_nc_aberta(
  p_id uuid,
  p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.alm_receb_nc;
  v_usuario_id uuid := auth.uid();
begin
  if v_usuario_id is null then
    raise exception 'É necessário estar autenticado para excluir uma não conformidade.';
  end if;

  select * into v_old
  from public.alm_receb_nc
  where id = p_id and not excluido
  for update;

  if not found then
    raise exception 'Não conformidade não encontrada.';
  end if;
  if v_old.status <> 'aberta' then
    raise exception 'Somente uma não conformidade aberta pode ser excluída.';
  end if;
  if not public.form_pode_editar(v_old.criado_por_id::text) then
    raise exception 'Só o autor do registro ou um administrador pode excluir.';
  end if;

  update public.alm_receb_nc
     set excluido = true,
         excluido_em = now(),
         excluido_por = coalesce(nullif(p_user->>'nome', ''), v_usuario_id::text)
   where id = p_id;

  insert into public.alm_receb_alteracoes (
    entidade, entidade_id, codigo, alteracoes, resumo, alterado_por_id, alterado_por_nome
  ) values (
    'nc', p_id, v_old.codigo,
    jsonb_build_array(jsonb_build_object('campo', 'exclusão', 'de', 'aberta', 'para', 'excluída')),
    'NCR excluída', v_usuario_id, nullif(p_user->>'nome', '')
  );

  return jsonb_build_object('id', p_id, 'codigo', v_old.codigo);
end;
$$;

revoke all on function public.alm_receb_registrar_nc(jsonb, jsonb) from public, anon;
grant execute on function public.alm_receb_registrar_nc(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.alm_receb_excluir_nc_aberta(uuid, jsonb) from public, anon;
grant execute on function public.alm_receb_excluir_nc_aberta(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
