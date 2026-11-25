-- A resposta pública e a RM são gravadas na mesma transação.
create or replace function public.finalizar_servico_rm_sap(p_request_id text, p_numero_rm text)
returns setof public.core_solicitacoes_comentarios
language plpgsql security definer set search_path = ''
as $$
declare
  operador public.core_perfis%rowtype;
  pedido public.core_solicitacoes%rowtype;
  resposta_id text := 'servico_rm_' || p_request_id;
  rm text := btrim(p_numero_rm);
begin
  select * into operador from public.core_perfis where id = auth.uid()::text and status = 'ativo';
  if not found or not (
    coalesce('admin' = any(operador.roles), false) or exists (
      select 1 from public.config_envio_emails c
      cross join lateral regexp_split_to_table(c.destinatarios, E'[,;\n\r]+') as d(email)
      where lower(c.chave) = 'compra_servico' and nullif(btrim(d.email), '') is not null
        and lower(btrim(d.email)) = lower(btrim(operador.email))
    )
  ) then
    raise exception 'Somente o responsável configurado ou um administrador pode finalizar o serviço.' using errcode = '42501';
  end if;
  if rm is null or rm !~ '^[0-9]+$' then
    raise exception 'Informe o número da RM aberta no SAP.';
  end if;
  select * into pedido from public.core_solicitacoes where id = p_request_id for update;
  if not found or pedido.type is distinct from 'compra'
     or translate(lower(btrim(coalesce(pedido.tipo_compra, ''))), 'ç', 'c') <> 'servico'
     or pedido.status in ('rascunho', 'cancelada', 'rejeitada') then
    raise exception 'Esta solicitação não permite finalizar um serviço.';
  end if;
  if nullif(btrim(pedido.linked_rm_number), '') is not null and btrim(pedido.linked_rm_number) <> rm then
    raise exception 'Esta solicitação já tem outra RM vinculada. Atualize os detalhes.';
  end if;
  if pedido.linked_rm_number is distinct from rm then
    update public.core_solicitacoes set linked_rm_number = rm, updated_at = now() where id = p_request_id;
  end if;
  insert into public.core_solicitacoes_comentarios
    (id, request_id, user_id, user_name, user_roles, content, is_internal)
  values (resposta_id, p_request_id, operador.id, operador.name, operador.roles,
    'Atendimento do serviço finalizado: RM aberta no SAP: ' || rm, false)
  on conflict (id) do nothing;
  return query select c.* from public.core_solicitacoes_comentarios c where c.id = resposta_id and c.request_id = p_request_id;
end;
$$;
revoke all on function public.finalizar_servico_rm_sap(text, text) from public, anon;
grant execute on function public.finalizar_servico_rm_sap(text, text) to authenticated;
