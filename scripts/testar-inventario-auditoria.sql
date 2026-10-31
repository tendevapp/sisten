-- Exclusivo supabase-sisten / fwezzgduywgyhxinjurn.
-- Simula nova versão da ZL0024 na transação; não realiza importação real.
-- Nenhum inventário, notificação, liberação ou alteração de dataset de teste persiste.
begin;
select set_config('request.jwt.claim.sub',(select id from public.profiles where status='ativo' and 'admin'=any(roles) limit 1),true);
do $teste$
declare
  v_inv public.alm_inventarios; v_itens jsonb; v_ids uuid[]; v_p uuid; v_ctx jsonb; v_r jsonb;
  v_corte timestamptz; v_inicio timestamptz; v_saldo numeric; v_version bigint; v_extra uuid;
begin
  select jsonb_agg(to_jsonb(x)) into v_itens from (
    select material,lpad(deposito,4,'0') deposito from public.sap_zl0024_stk s
    where not exists(select 1 from public.alm_inv_pendencias_corte(clock_timestamp()) p where p.material=regexp_replace(trim(s.material),'^0+','') and (p.deposito is null or lpad(p.deposito,4,'0')=lpad(s.deposito,4,'0')))
    and not exists(select 1 from public.alm_inv_reservas r where r.material=regexp_replace(trim(s.material),'^0+','') and r.deposito=lpad(s.deposito,4,'0') and (r.item_id is not null or r.expira_em>clock_timestamp()))
    group by material,lpad(deposito,4,'0') having sum(quantidade)>=0 order by material,lpad(deposito,4,'0') limit 3
  ) x;
  if jsonb_array_length(v_itens)<>3 then raise exception 'Faltam três materiais sem pendências para o teste.'; end if;
  v_inv := public.alm_inv_criar_auditado(jsonb_build_object('data',current_date,'criterio','QA ROLLBACK auditoria'),v_itens);
  if not v_inv.auditoria_ativa then raise exception 'Novo fluxo não ativou auditoria.'; end if;
  select array_agg(id order by ordem) into v_ids from public.alm_inventario_itens where inventario_id=v_inv.id;
  v_ctx := public.alm_inv_contexto_auditoria(v_inv.id);
  if (v_ctx->>'pronta')::boolean then raise exception 'Rodada liberada sem preparação.'; end if;
  begin
    perform public.alm_inv_registrar_contagem(v_ids[1],1,null,null,null,'QA');
    raise exception 'Endpoint antigo burlou preparação.';
  exception when raise_exception then if sqlerrm not like 'Atualize o aplicativo,%' then raise; end if; end;
  v_p := public.alm_inv_solicitar_atualizacao(v_inv.id,30);
  if public.alm_inv_solicitar_atualizacao(v_inv.id,30)<>v_p then raise exception 'Pedido repetido gerou nova notificação.'; end if;
  begin
    perform public.alm_inv_liberar_preparacao(v_p,clock_timestamp(),true,'Documentos conciliados no corte de teste.');
    raise exception 'Liberou sem nova carga.';
  exception when raise_exception then if sqlerrm not like 'Importe uma nova ZL0024%' then raise; end if; end;
  v_corte := clock_timestamp();
  update public.dataset_versions set version=version+1,row_count=(select count(*) from public.sap_zl0024_stk),updated_at=clock_timestamp() where dataset='estoque';
  begin
    perform public.alm_inv_liberar_preparacao(v_p,v_corte-interval '1 hour',true,'Tentativa de liberar fotografia antiga.');
    raise exception 'Aceitou extração anterior à solicitação.';
  exception when raise_exception then if sqlerrm not like 'Informe a hora real da extração%' then raise; end if; end;
  update public.dataset_versions set row_count=row_count+1 where dataset='estoque';
  begin
    perform public.alm_inv_liberar_preparacao(v_p,v_corte,true,'Tentativa de liberar carga incompleta.');
    raise exception 'Aceitou carga incompleta.';
  exception when raise_exception then if sqlerrm not like 'Carga da ZL0024 incompleta%' then raise; end if; end;
  update public.dataset_versions set row_count=row_count-1 where dataset='estoque';
  begin
    perform public.alm_inv_liberar_preparacao(v_p,v_corte,false,'Corte não confirmado.');
    raise exception 'Liberou sem confirmação de corte.';
  exception when raise_exception then if sqlerrm not like 'Confirme o controle%' then raise; end if; end;
  perform public.alm_inv_liberar_preparacao(v_p,v_corte,true,'Movimentações suspensas e documentos conciliados para o teste.');
  select versao_zl0024 into v_version from public.alm_inv_preparacoes where id=v_p;
  if not (public.alm_inv_contexto_auditoria(v_inv.id)->>'pronta')::boolean then raise exception 'Preparação válida não liberou.'; end if;
  select saldo into v_saldo from public.alm_inv_preparo_saldos where preparacao_id=v_p and item_id=v_ids[1];
  v_inicio := clock_timestamp();
  v_r := public.alm_inv_registrar_contagem_auditada(v_ids[1],v_saldo+1,null,null,null,'NOME CLIENTE IGNORADO',null,null,v_p,v_inicio,true);
  if v_r->>'status'<>'aguardando_decisao' or v_r->>'saldo_sistema' is not null then raise exception 'Primeira divergência revelou saldo.'; end if;
  begin
    perform public.alm_inv_registrar_contagem_auditada(v_ids[1],v_saldo+1,null,null,null,'QA',null,null,v_p,clock_timestamp(),true);
    raise exception 'Recontagem sem causa foi aceita.';
  exception when raise_exception then if sqlerrm not like 'Informe a causa provável%' then raise; end if; end;
  v_r := public.alm_inv_registrar_contagem_auditada(v_ids[1],v_saldo+1,null,null,null,'QA','em_apuracao','Verificando embalagem e localização.',v_p,clock_timestamp(),true);
  if (v_r->>'numero')::int<>2 then raise exception 'Segunda contagem não preservada.'; end if;
  v_r := public.alm_inv_registrar_contagem_auditada(v_ids[1],v_saldo,null,null,null,'QA','erro_contagem','Caixa localizada por conferente.',v_p,clock_timestamp(),true);
  if v_r->>'status'<>'conferido' or (select count(*) from public.alm_inventario_contagens where item_id=v_ids[1])<>3 then raise exception 'Falhou terceira contagem.'; end if;
  if exists(select 1 from public.alm_inventario_contagens where item_id=v_ids[1] and (saldo_ref<>v_saldo or preparacao_id<>v_p or contado_por_nome='NOME CLIENTE IGNORADO')) then raise exception 'Rastreabilidade da referência/autoria falhou.'; end if;

  select saldo into v_saldo from public.alm_inv_preparo_saldos where preparacao_id=v_p and item_id=v_ids[2];
  perform public.alm_inv_registrar_contagem_auditada(v_ids[2],v_saldo+1,null,null,null,'QA',null,null,v_p,clock_timestamp(),true);
  begin
    perform public.alm_inv_encerrar_auditado(v_ids[2],null,null); raise exception 'Encerramento sem causa aceito.';
  exception when raise_exception then if sqlerrm not like 'Informe a causa provável%' then raise; end if; end;
  perform public.alm_inv_encerrar_auditado(v_ids[2],'em_apuracao','Gestão deve investigar documentos e diferença física.');
  if not exists(select 1 from public.alm_inventario_itens where id=v_ids[2] and causa_encerramento='em_apuracao') then raise exception 'Causa do encerramento perdida.'; end if;

  update public.dataset_versions set version=version+1 where dataset='estoque';
  begin
    perform public.alm_inv_registrar_contagem_auditada(v_ids[3],0,null,null,null,'QA',null,null,v_p,clock_timestamp(),true);
    raise exception 'Aceitou referência de outra versão.';
  exception when raise_exception then if sqlerrm not like 'A ZL0024 mudou:%' then raise; end if; end;
  update public.dataset_versions set version=v_version where dataset='estoque';
  update public.alm_inv_preparacoes set valida_ate=clock_timestamp()-interval '1 second' where id=v_p;
  begin
    perform public.alm_inv_registrar_contagem_auditada(v_ids[3],0,null,null,null,'QA',null,null,v_p,clock_timestamp(),true);
    raise exception 'Aceitou janela expirada.';
  exception when raise_exception then if sqlerrm not like 'Janela de contagem encerrada:%' then raise; end if; end;
  update public.alm_inv_preparacoes set valida_ate=clock_timestamp()+interval '1 minute' where id=v_p;
  begin
    perform public.alm_inv_registrar_contagem_auditada(v_ids[3],0,null,null,null,'QA',null,null,v_p,clock_timestamp(),false);
    raise exception 'Aceitou movimentação não controlada.';
  exception when raise_exception then if sqlerrm not like 'Confirme que não houve%' then raise; end if; end;

  insert into public.alm_solicitacao_extra(data,projeto,motivo,motivo_detalhe,itens)
    select current_date,'QA ROLLBACK','OUTROS','Teste de regularização antes de inventário.',jsonb_build_array(jsonb_build_object('material',material,'descricao',descricao,'unidade',coalesce(unidade,'UN'),'quantidade',1)) from public.alm_inventario_itens where id=v_ids[3] returning id into v_extra;
  v_ctx := public.alm_inv_contexto_auditoria(v_inv.id);
  if not exists(select 1 from jsonb_array_elements(v_ctx->'pendencias') p where p->>'item_id'=v_ids[3]::text) then raise exception 'Extraordinária pendente não avisada.'; end if;
  begin
    perform public.alm_inv_registrar_contagem_auditada(v_ids[3],0,null,null,null,'QA',null,null,v_p,clock_timestamp(),true);
    raise exception 'Aceitou item com saída extraordinária pendente.';
  exception when raise_exception then if sqlerrm not like 'Regularize a saída extraordinária%' then raise; end if; end;
  perform public.alm_sol_extra_regularizar(array[v_extra],'QA-ROLLBACK','Regularização simulada no teste transacional.');
  -- A RPC usa now() (início da transação). Ajusta somente a marca temporal do registro
  -- descartável para simular regularização efetivamente posterior ao corte.
  perform set_config('sisten.alm_sol_extra_rpc','1',true);
  update public.alm_solicitacao_extra set regularizado_em=clock_timestamp() where id=v_extra;
  perform set_config('sisten.alm_sol_extra_rpc','',true);
  if not exists(select 1 from jsonb_array_elements(public.alm_inv_contexto_auditoria(v_inv.id)->'pendencias') p where p->>'item_id'=v_ids[3]::text) then raise exception 'Regularização após corte não exigiu nova ZL0024.'; end if;
end;
$teste$;
set local role authenticated;
do $permissoes$
begin
  perform public.alm_inv_contexto_auditoria(null);
  begin
    perform saldo from public.alm_inv_preparo_saldos limit 1;
    raise exception 'Saldo cego exposto por acesso direto.';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.alm_inv_registrar_contagem_legado(uuid,numeric,text,date,text,text)','execute')
    or has_function_privilege('authenticated','public.alm_inv_encerrar_item_interno(uuid,text)','execute')
    or has_function_privilege('anon','public.alm_inv_contexto_auditoria(uuid)','execute') then raise exception 'Permissão indevida nos endpoints.'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
  begin perform public.alm_inv_contexto_auditoria(null); raise exception 'Usuário sem acesso consultou o contexto.';
  exception when raise_exception then if sqlerrm<>'Sem acesso ao inventário.' then raise; end if; end;
end;
$permissoes$;
rollback;
select 'Preparação, nova versão, corte, saldo cego, três contagens, causas, encerramento, expiração, extraordinária e permissões: passaram. Tudo revertido.' resultado;
