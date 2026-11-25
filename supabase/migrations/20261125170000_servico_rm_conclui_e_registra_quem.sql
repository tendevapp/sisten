-- Serviço: informar a RM aberta no SAP conclui a solicitação e grava quem
-- finalizou (atendente_id/atendente_name) e quando (resolved_at).
--
-- A RM de serviço sai do SAP como "RM 17..." na Central de Compras, mas nem
-- sempre com o código de item da solicitação, então o vínculo automático
-- (statusAutomaticoCompra) não alcança: o fim do atendimento é a própria RM.
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

  if pedido.status is distinct from 'concluida' then
    update public.core_solicitacoes
       set linked_rm_number = rm, status = 'concluida',
           atendente_id = operador.id, atendente_name = operador.name,
           resolved_at = now(), updated_at = now()
     where id = p_request_id;
    insert into public.core_solicitacoes_historico_status
      (id, request_id, from_status, to_status, user_id, user_name, comment)
    values ('h_' || gen_random_uuid()::text, p_request_id, pedido.status, 'concluida',
      operador.id, operador.name, 'Serviço finalizado: RM aberta no SAP ' || rm);
  elsif pedido.linked_rm_number is distinct from rm or pedido.atendente_id is null then
    -- Já concluída (ex.: reenvio do aviso): completa só o que falta.
    update public.core_solicitacoes
       set linked_rm_number = rm,
           atendente_id = coalesce(atendente_id, operador.id),
           atendente_name = coalesce(atendente_name, operador.name),
           resolved_at = coalesce(resolved_at, now()), updated_at = now()
     where id = p_request_id;
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

-- Retroativo: serviços que já têm a RM (no campo ou escrita na conversa,
-- "RM aberta no SAP: N" / "Requisição de compra criada sob nº N") passam a
-- concluídos, com quem escreveu a primeira dessas mensagens como finalizador.
do $$
declare
  r record;
begin
  for r in
    select s.id, s.status, s.atendente_id,
           coalesce(nullif(btrim(s.linked_rm_number), ''), c.rm) as rm,
           c.user_id, c.user_name, c.created_at
      from public.core_solicitacoes s
      left join lateral (
        select x.user_id, x.user_name, x.created_at,
               (regexp_match(x.content, '(?:RM aberta no SAP:|criada sob n\S*)\s*([0-9]{6,})'))[1] as rm
          from public.core_solicitacoes_comentarios x
         where x.request_id = s.id and not x.is_internal
           and x.content ~ '(?:RM aberta no SAP:|criada sob n\S*)\s*[0-9]{6,}'
         order by x.created_at
         limit 1
      ) c on true
     where s.type = 'compra'
       and translate(lower(btrim(coalesce(s.tipo_compra, ''))), 'ç', 'c') = 'servico'
       and s.status not in ('rascunho', 'cancelada', 'rejeitada')
       and coalesce(nullif(btrim(s.linked_rm_number), ''), c.rm) is not null
  loop
    update public.core_solicitacoes
       set linked_rm_number = r.rm,
           status = 'concluida',
           atendente_id = coalesce(atendente_id, r.user_id),
           atendente_name = coalesce(atendente_name, r.user_name),
           resolved_at = coalesce(resolved_at, r.created_at, now()),
           updated_at = now()
     where id = r.id;
    if r.status is distinct from 'concluida' then
      insert into public.core_solicitacoes_historico_status
        (id, request_id, from_status, to_status, user_id, user_name, comment)
      values ('h_' || gen_random_uuid()::text, r.id, r.status, 'concluida',
        coalesce(r.user_id, 'sistema'), coalesce(r.user_name, 'Sistema'),
        'Serviço finalizado: RM aberta no SAP ' || r.rm || ' (registro retroativo)');
    end if;
  end loop;
end $$;
