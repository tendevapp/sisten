-- Previsao de chegada gravada pelo Diligenciamento (Sem MIGO).
--
-- sap_me5a_rc so aceita escrita de admin/coordenador/comprador (RLS), mas quem
-- tem acesso a pagina de Diligenciamento tambem precisa atualizar a previsao.
-- A RPC mexe SOMENTE em data_entrega_prevista e data_entrega_confirmada (nao
-- toca obs_comprador nem item_status) e registra o historico.

create or replace function public.gravar_previsao_rastreio(p_ri text, p_data date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_ant date;
  v_ant_conf date;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '28000';
  end if;
  if p_ri is null or p_data is null then
    raise exception 'ri e data sao obrigatorios' using errcode = '22023';
  end if;

  select name into v_nome from public.profiles where id = v_uid::text;

  select data_entrega_prevista, data_entrega_confirmada into v_ant, v_ant_conf
  from public.sap_me5a_rc where ri = p_ri;
  if not found then
    raise exception 'Requisicao % nao encontrada', p_ri using errcode = 'P0002';
  end if;

  update public.sap_me5a_rc
     set data_entrega_prevista = p_data,
         data_entrega_confirmada = p_data
   where ri = p_ri;

  insert into public.sap_requisicoes_observacoes (id, ri, campo_alterado, valor_anterior, valor_novo, user_name, created_at)
  values (
    'oh_' || substr(md5(random()::text || clock_timestamp()::text), 1, 9),
    p_ri,
    'data_entrega_confirmada',
    json_build_object('date', v_ant, 'data_entrega_confirmada', v_ant_conf)::text,
    json_build_object('date', p_data, 'data_entrega_confirmada', p_data)::text,
    coalesce(v_nome, 'Sistema'),
    now()
  );
end;
$$;

revoke all on function public.gravar_previsao_rastreio(text, date) from public, anon;
grant execute on function public.gravar_previsao_rastreio(text, date) to authenticated;

notify pgrst, 'reload schema';
