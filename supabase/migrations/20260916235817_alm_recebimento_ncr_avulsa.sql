-- =====================================================================
-- Almoxarifado > Recebimento — abertura avulsa de não conformidade.
--
-- A NCR não precisa nascer de uma conferência: permite registrar desvio
-- encontrado no almoxarifado sem criar carga ou recebimento artificial.
-- Mantém os vínculos nulos e registra a abertura no histórico.
-- =====================================================================

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
        '[]'::jsonb, coalesce(p_nc->'evidencias', '[]'::jsonb), 'aberta',
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

revoke all on function public.alm_receb_registrar_nc(jsonb, jsonb) from public, anon;
grant execute on function public.alm_receb_registrar_nc(jsonb, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
