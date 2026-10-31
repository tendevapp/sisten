-- Exclusivo supabase-sisten / fwezzgduywgyhxinjurn. Todas as alterações são revertidas.
begin;
do $teste$
declare
  v_u1 uuid; v_u2 uuid; v_a uuid:=gen_random_uuid(); v_b uuid:=gen_random_uuid();
  v_itens jsonb; v_1 jsonb; v_2 jsonb; v_3 jsonb; v_r jsonb; v_inv public.alm_inventarios; v_item uuid;
begin
  select id::uuid into v_u1 from public.profiles where status='ativo' and 'admin'=any(roles) limit 1;
  select id::uuid into v_u2 from public.profiles where status='ativo' and 'admin'=any(roles) and id<>v_u1::text limit 1;
  if v_u1 is null or v_u2 is null then raise exception 'Teste requer dois usuários administrativos ativos.'; end if;
  perform set_config('request.jwt.claim.sub',v_u1::text,true);
  select jsonb_agg(to_jsonb(x)) into v_itens from (
    select distinct s.material,lpad(s.deposito,4,'0') deposito from public.sap_zl0024_stk s
    where not exists(select 1 from public.alm_inv_reservas r where r.material=regexp_replace(trim(s.material),'^0+','') and r.deposito=lpad(s.deposito,4,'0') and (r.item_id is not null or r.expira_em>clock_timestamp()))
    order by s.material,lpad(s.deposito,4,'0') limit 3
  ) x;
  if jsonb_array_length(v_itens)<>3 then raise exception 'Faltam três itens livres para o teste.'; end if;
  v_1:=v_itens->0; v_2:=v_itens->1; v_3:=v_itens->2;
  perform public.alm_inv_definir_reserva(v_a,jsonb_build_array(v_1));
  begin
    perform public.alm_inv_definir_reserva(v_b,jsonb_build_array(v_1)); raise exception 'Duas abas do mesmo usuário reservaram o mesmo item.';
  exception when raise_exception then if sqlerrm not like 'Item % já reservado por %' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',v_u2::text,true);
  begin
    perform public.alm_inv_definir_reserva(v_b,jsonb_build_array(v_1)); raise exception 'Outro usuário reservou item ocupado.';
  exception when raise_exception then if sqlerrm not like 'Item % já reservado por %' then raise; end if; end;
  perform public.alm_inv_definir_reserva(v_a,'[]');
  if not exists(select 1 from public.alm_inv_reservas where sessao=v_a and usuario_id=v_u1) then raise exception 'Outro usuário liberou reserva alheia.'; end if;
  perform public.alm_inv_definir_reserva(v_b,jsonb_build_array(v_2));
  perform set_config('request.jwt.claim.sub',v_u1::text,true);
  begin
    perform public.alm_inv_definir_reserva(v_a,jsonb_build_array(v_3,v_2)); raise exception 'Lote com conflito foi aceito.';
  exception when raise_exception then if sqlerrm not like 'Item % já reservado por %' then raise; end if; end;
  if not exists(select 1 from public.alm_inv_reservas where sessao=v_a and material=regexp_replace(v_1->>'material','^0+',''))
    or exists(select 1 from public.alm_inv_reservas where sessao=v_a and material=regexp_replace(v_3->>'material','^0+','') and deposito=v_3->>'deposito') then raise exception 'Falha de atomicidade no lote.'; end if;
  -- Mesmo material em depósitos diferentes pode pertencer a rodadas distintas.
  perform public.alm_inv_definir_reserva(v_a,jsonb_build_array(v_1,jsonb_set(v_1,'{deposito}','"9999"')));
  if (select count(*) from public.alm_inv_reservas where sessao=v_a)<>2 then raise exception 'Bloqueou outro depósito.'; end if;
  perform public.alm_inv_definir_reserva(v_a,jsonb_build_array(v_1));
  update public.alm_inv_reservas set expira_em=clock_timestamp()-interval '1 second' where sessao=v_a;
  perform set_config('request.jwt.claim.sub',v_u2::text,true);
  perform public.alm_inv_definir_reserva(v_b,jsonb_build_array(v_1,v_2));
  perform public.alm_inv_definir_reserva(v_b,'[]');
  perform set_config('request.jwt.claim.sub',v_u1::text,true);
  perform public.alm_inv_definir_reserva(v_a,jsonb_build_array(v_1));
  v_inv:=public.alm_inv_criar_auditado(jsonb_build_object('data',current_date,'criterio','QA RESERVA ROLLBACK','reserva_sessao',v_a),jsonb_build_array(v_1));
  select id into v_item from public.alm_inventario_itens where inventario_id=v_inv.id;
  if not exists(select 1 from public.alm_inv_reservas where item_id=v_item and expira_em is null and sessao is null) then raise exception 'Não transferiu reserva ao inventário.'; end if;
  perform public.alm_inv_definir_reserva(v_a,'[]');
  if not exists(select 1 from public.alm_inv_reservas where item_id=v_item) then raise exception 'Fechar modal liberou item já salvo.'; end if;
  begin
    perform public.alm_inv_criar(jsonb_build_object('data',current_date+1,'criterio','QA DUPLICADO ROLLBACK'),jsonb_build_array(v_1));
    raise exception 'Fluxo antigo burlou a reserva.';
  exception when raise_exception then if sqlerrm not like 'Item % já está reservado em outra%' then raise; end if; end;
  perform public.alm_inv_remover_item(v_item);
  if exists(select 1 from public.alm_inv_reservas where item_id=v_item) then raise exception 'Remover item não liberou reserva.'; end if;
  v_inv:=public.alm_inv_criar_auditado(jsonb_build_object('data',current_date+2,'criterio','QA LIBERACAO ROLLBACK'),jsonb_build_array(v_1));
  update public.alm_inventario_itens set status='conferido' where inventario_id=v_inv.id;
  if exists(select 1 from public.alm_inv_reservas where inventario_id=v_inv.id) then raise exception 'Encerrar item não liberou reserva.'; end if;
  v_inv:=public.alm_inv_criar_auditado(jsonb_build_object('data',current_date+3,'criterio','QA EXCLUSAO ROLLBACK'),jsonb_build_array(v_1));
  perform public.alm_inv_excluir(v_inv.id,'QA ROLLBACK');
  if exists(select 1 from public.alm_inv_reservas where inventario_id=v_inv.id) then raise exception 'Excluir inventário não liberou reserva.'; end if;
  if has_function_privilege('anon','public.alm_inv_definir_reserva(uuid,jsonb)','execute') then raise exception 'Reserva exposta a anon.'; end if;
end;
$teste$;
rollback;
select 'Reservas entre usuários/abas, atomicidade de lote, depósitos distintos, expiração, transferência ao salvar, proteção legada e liberações passaram. Tudo revertido.' resultado;
