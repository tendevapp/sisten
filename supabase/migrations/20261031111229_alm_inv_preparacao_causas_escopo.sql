-- Preparação por rodada, referência imutável, causas prováveis e corte de movimentações.
-- Registros anteriores aderem ao controle ao solicitar preparação; históricos não são reescritos.
alter table public.alm_inventarios add column auditoria_ativa boolean not null default false;
create table public.alm_inv_preparacoes (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references public.alm_inventarios(id),
  solicitado_em timestamptz not null default clock_timestamp(),
  solicitado_por uuid not null,
  versao_solicitada bigint not null,
  liberado_em timestamptz,
  liberado_por uuid,
  extracao_em timestamptz,
  importacao_em timestamptz,
  versao_zl0024 bigint,
  janela_minutos int not null default 30 check (janela_minutos between 5 and 120),
  valida_ate timestamptz,
  corte_observacao text
);
create index on public.alm_inv_preparacoes(inventario_id,solicitado_em desc);
create table public.alm_inv_preparo_saldos (
  preparacao_id uuid not null references public.alm_inv_preparacoes(id),
  item_id uuid not null references public.alm_inventario_itens(id) on delete cascade,
  saldo numeric not null,
  primary key(preparacao_id,item_id)
);
alter table public.alm_inv_preparacoes enable row level security;
alter table public.alm_inv_preparo_saldos enable row level security;
revoke all on public.alm_inv_preparacoes, public.alm_inv_preparo_saldos from public,anon,authenticated;
-- A referência continua cega, inclusive para consultas diretas pela API.
create policy alm_inv_saldos_internos on public.alm_inv_preparo_saldos for all to authenticated using(false) with check(false);
grant select on public.alm_inv_preparacoes to authenticated;
create policy alm_inv_preparacoes_sel on public.alm_inv_preparacoes for select to authenticated using(true);

alter table public.alm_inventario_contagens
  add column causa text,
  add column causa_detalhe text,
  add column preparacao_id uuid references public.alm_inv_preparacoes(id),
  add column iniciada_em timestamptz,
  add column duracao_segundos int,
  add column movimentacoes_controladas boolean;
alter table public.alm_inventario_itens add column causa_encerramento text, add column causa_encerramento_detalhe text;
grant select(causa,causa_detalhe,preparacao_id,iniciada_em,duracao_segundos,movimentacoes_controladas) on public.alm_inventario_contagens to authenticated;

create function public.alm_inv_causa_valida(p_causa text) returns boolean language sql immutable set search_path=public,pg_temp as $$
  select p_causa = any(array['em_apuracao','erro_contagem','defasagem_zl0024','movimentacao_pendente','unidade_embalagem','endereco','divergencia_fisica','outros']);
$$;
create function public.alm_inv_pode_operar() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()::text and p.status='ativo'
    and ('admin'=any(p.roles) or (
      coalesce(p.page_access->>'form_almoxarifado_inventario','true') <> 'false'
      and (p.roles && array['comprador','coordenador_suprimentos'] or p.sector_id='2' or p.page_access->>'form_almoxarifado_inventario'='true')
    )));
$$;
create function public.alm_inv_pode_liberar() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()::text and p.status='ativo'
    and ('admin'=any(p.roles) or p.page_access->>'almox_importar_planilhas'='true'));
$$;
create function public.alm_inv_criar_auditado(p_inv jsonb,p_itens jsonb) returns public.alm_inventarios
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_inv public.alm_inventarios;
begin
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  v_inv := public.alm_inv_criar(p_inv,p_itens);
  update public.alm_inventarios set auditoria_ativa=true where id=v_inv.id returning * into v_inv;
  return v_inv;
end;
$$;

-- Extraordinárias sem depósito são conservadoramente verificadas em todos os depósitos.
-- Documentos regularizados DEPOIS do corte também impedem comparar com uma fotografia antiga.
create function public.alm_inv_pendencias_corte(p_corte timestamptz)
returns table(material text,deposito text,codigo text,tipo text,motivo text)
language sql stable security definer set search_path=public,pg_temp as $$
  select distinct regexp_replace(trim(x->>'material'),'^0+',''), null::text, s.codigo, 'extraordinaria'::text,
    case when s.status='PENDENTE' then 'Saída extraordinária aguardando regularização no SAP.' else 'Saída extraordinária regularizada após o corte: atualizar ZL0024.' end
  from public.alm_solicitacao_extra s cross join lateral jsonb_array_elements(s.itens) x
  where s.excluido_em is null and (s.status='PENDENTE' or s.regularizado_em>p_corte)
  union
  select regexp_replace(trim(i.material),'^0+',''), coalesce(nullif(i.deposito,''),r.deposito_origem),r.codigo,'requisicao_balcao',
    case when coalesce(nullif(i.doc_sap,''),nullif(r.doc_sap,'')) is null then 'Requisição/transferência sem documento SAP: regularizar antes de contar.' else 'Documento SAP de movimentação posterior ao corte: atualizar ZL0024.' end
  from public.alm_req_balcao r join public.alm_req_balcao_itens i on i.requisicao_id=r.id
  where not r.excluido and (coalesce(nullif(i.doc_sap,''),nullif(r.doc_sap,'')) is null or coalesce(r.doc_sap_em,r.updated_at,r.created_at)>p_corte)
  union
  select regexp_replace(trim(i.material),'^0+',''),coalesce(nullif(i.deposito_destino,''),r.deposito_destino),r.codigo,'transferencia_destino',
    'Transferência para o depósito ainda sem conciliação no corte.'
  from public.alm_req_balcao r join public.alm_req_balcao_itens i on i.requisicao_id=r.id
  where not r.excluido and r.tipo_movimento='transferencia'
    and (coalesce(nullif(i.doc_sap,''),nullif(r.doc_sap,'')) is null or coalesce(r.doc_sap_em,r.updated_at,r.created_at)>p_corte);
$$;

create function public.alm_inv_contexto_auditoria(p_inventario uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_p public.alm_inv_preparacoes; v_b public.dataset_versions; v_ok boolean; v_motivo text; v_pend jsonb;
begin
  if not public.alm_inv_pode_operar() and not public.alm_inv_pode_liberar() then raise exception 'Sem acesso ao inventário.'; end if;
  select * into v_b from public.dataset_versions where dataset='estoque';
  select * into v_p from public.alm_inv_preparacoes where inventario_id=p_inventario order by solicitado_em desc,id desc limit 1;
  select count(*)=v_b.row_count and count(*)>0 and max(imported_at)<=v_b.updated_at into v_ok from public.sap_zl0024_stk;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into v_pend from (
    select p.*,i.id item_id from public.alm_inv_pendencias_corte(coalesce(v_p.extracao_em,v_b.updated_at,'-infinity')) p
    left join public.alm_inventario_itens i on i.inventario_id=p_inventario and regexp_replace(trim(i.material),'^0+','')=p.material
      and (p.deposito is null or lpad(p.deposito,4,'0')=lpad(i.deposito,4,'0'))
    where p_inventario is null or (i.id is not null and i.status in ('pendente','aguardando_decisao'))
  ) q;
  v_motivo := case when not coalesce(v_ok,false) then 'Carga da ZL0024 incompleta ou ainda em atualização.'
    when v_p.id is null then 'Solicite atualização da ZL0024 à gestão antes de contar.'
    when v_p.liberado_em is null then 'Aguardando nova ZL0024 e liberação da gestão.'
    when v_p.versao_zl0024<>v_b.version then 'A ZL0024 mudou: solicite nova preparação da rodada.'
    when clock_timestamp()>v_p.valida_ate then 'Janela de contagem encerrada: solicite nova atualização.'
    else '' end;
  return jsonb_build_object('preparacao',case when v_p.id is not null then to_jsonb(v_p) else null end,
    'base',case when v_b.dataset is not null then jsonb_build_object('version',v_b.version,'updated_at',v_b.updated_at,'row_count',v_b.row_count) else null end,
    'base_integra',coalesce(v_ok,false),'pronta',v_motivo='','motivo',v_motivo,'pendencias',v_pend);
end;
$$;

create function public.alm_inv_solicitar_atualizacao(p_inventario uuid,p_janela_minutos int default 30) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_inv public.alm_inventarios;
begin
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  select * into v_inv from public.alm_inventarios where id=p_inventario and not excluido and status='aberto' for update;
  if not found then raise exception 'Inventário aberto não encontrado.'; end if;
  update public.alm_inventarios set auditoria_ativa=true where id=p_inventario;
  if p_janela_minutos is null or p_janela_minutos not between 5 and 120 then raise exception 'Informe uma janela entre 5 e 120 minutos.'; end if;
  -- Reutiliza pedido ainda aberto, evitando notificação repetida por duplo clique.
  select id into v_id from public.alm_inv_preparacoes where inventario_id=p_inventario and liberado_em is null order by solicitado_em desc limit 1;
  if v_id is not null then return v_id; end if;
  if not exists(select 1 from public.profiles p where p.status='ativo' and ('admin'=any(p.roles) or p.page_access->>'almox_importar_planilhas'='true')) then raise exception 'Nenhum responsável pela atualização cadastrado.'; end if;
  insert into public.alm_inv_preparacoes(inventario_id,solicitado_por,versao_solicitada,janela_minutos)
    values(p_inventario,auth.uid(),coalesce((select version from public.dataset_versions where dataset='estoque'),0),p_janela_minutos) returning id into v_id;
  insert into public.core_notificacoes(id,user_id,title,description,type,is_read,created_at,context_key)
    select gen_random_uuid()::text,p.id,'Inventário: atualizar ZL0024',
      format('%s aguarda nova extração/importação da ZL0024 e confirmação do corte antes da contagem.',v_inv.codigo),'warning',false,now(),
      '/formularios/almoxarifado-inventario?id='||p_inventario::text
    from public.profiles p where p.status='ativo' and ('admin'=any(p.roles) or p.page_access->>'almox_importar_planilhas'='true');
  return v_id;
end;
$$;

create function public.alm_inv_liberar_preparacao(p_preparacao uuid,p_extracao_em timestamptz,p_corte_confirmado boolean,p_observacao text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_p public.alm_inv_preparacoes; v_b public.dataset_versions;
begin
  if not public.alm_inv_pode_liberar() then raise exception 'Somente a gestão com permissão de importação pode liberar.'; end if;
  lock table public.sap_zl0024_stk in share mode;
  select * into v_b from public.dataset_versions where dataset='estoque' for share;
  select * into v_p from public.alm_inv_preparacoes where id=p_preparacao for update;
  if not found or v_p.liberado_em is not null then raise exception 'Pedido inexistente ou já liberado.'; end if;
  if not exists(select 1 from public.alm_inventarios where id=v_p.inventario_id and not excluido and status='aberto') then raise exception 'Inventário não está aberto.'; end if;
  if v_b.version is null or v_b.version<=v_p.versao_solicitada or v_b.updated_at<v_p.solicitado_em then raise exception 'Importe uma nova ZL0024 após a solicitação.'; end if;
  if p_extracao_em is null or p_extracao_em<v_p.solicitado_em or p_extracao_em>v_b.updated_at or p_extracao_em>clock_timestamp() then raise exception 'Informe a hora real da extração SAP, posterior à solicitação e anterior à importação.'; end if;
  if p_extracao_em+make_interval(mins=>v_p.janela_minutos)<=clock_timestamp() then raise exception 'Extração já fora da janela da rodada: extraia e importe novamente.'; end if;
  if p_corte_confirmado is distinct from true or length(trim(coalesce(p_observacao,'')))<10 then raise exception 'Confirme o controle das movimentações e documente o corte (mínimo 10 caracteres).'; end if;
  if not (select count(*)=v_b.row_count and count(*)>0 and max(imported_at)<=v_b.updated_at from public.sap_zl0024_stk) then raise exception 'Carga da ZL0024 incompleta ou em atualização.'; end if;
  if exists(select 1 from public.alm_inventario_itens i where i.inventario_id=v_p.inventario_id and i.status in ('pendente','aguardando_decisao')
    and not exists(select 1 from public.sap_zl0024_stk s where s.material=i.material and lpad(s.deposito,4,'0')=lpad(i.deposito,4,'0'))) then raise exception 'Item do escopo ausente na ZL0024 atual. Revise o escopo antes de liberar.'; end if;
  if exists(select 1 from public.alm_inventario_itens i join public.alm_inv_pendencias_corte(p_extracao_em) p
    on p.material=regexp_replace(trim(i.material),'^0+','') and (p.deposito is null or lpad(p.deposito,4,'0')=lpad(i.deposito,4,'0'))
    where i.inventario_id=v_p.inventario_id and i.status in ('pendente','aguardando_decisao')) then raise exception 'Regularize as movimentações pendentes do escopo e atualize a ZL0024 antes de liberar.'; end if;
  insert into public.alm_inv_preparo_saldos(preparacao_id,item_id,saldo)
    select v_p.id,i.id,public.alm_inv_saldo_zl0024(i.material,i.deposito) from public.alm_inventario_itens i
    where i.inventario_id=v_p.inventario_id and i.status in ('pendente','aguardando_decisao');
  update public.alm_inv_preparacoes set liberado_em=clock_timestamp(),liberado_por=auth.uid(),extracao_em=p_extracao_em,
    importacao_em=v_b.updated_at,versao_zl0024=v_b.version,valida_ate=p_extracao_em+make_interval(mins=>janela_minutos),corte_observacao=trim(p_observacao) where id=v_p.id;
end;
$$;

create function public.alm_inv_registrar_contagem_auditada(p_item_id uuid,p_quantidade numeric,p_endereco text,p_validade date,p_observacao text,p_por text,
  p_causa text,p_causa_detalhe text,p_preparacao uuid,p_iniciada_em timestamptz,p_sem_movimentacao boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_i public.alm_inventario_itens; v_p public.alm_inv_preparacoes; v_ctx jsonb; v_num int; v_saldo numeric; v_div boolean; v_nome text;
begin
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  if p_sem_movimentacao is distinct from true then raise exception 'Confirme que não houve movimentação durante a contagem.'; end if;
  lock table public.sap_zl0024_stk in share mode;
  perform 1 from public.dataset_versions where dataset='estoque' for share;
  select * into v_i from public.alm_inventario_itens where id=p_item_id for update;
  if not found or exists(select 1 from public.alm_inventarios where id=v_i.inventario_id and excluido) then raise exception 'Item não encontrado ou inventário excluído.'; end if;
  if v_i.status not in ('pendente','aguardando_decisao') then raise exception 'Item já encerrado.'; end if;
  v_ctx := public.alm_inv_contexto_auditoria(v_i.inventario_id);
  if not (v_ctx->>'pronta')::boolean then raise exception '%',v_ctx->>'motivo'; end if;
  select * into v_p from public.alm_inv_preparacoes where id=(v_ctx->'preparacao'->>'id')::uuid;
  if p_preparacao is distinct from v_p.id or p_iniciada_em is null or p_iniciada_em<v_p.liberado_em or p_iniciada_em>clock_timestamp()+interval '1 minute' then raise exception 'A preparação mudou: reabra a contagem e conte novamente.'; end if;
  if exists(select 1 from jsonb_array_elements(v_ctx->'pendencias') p where p->>'item_id'=v_i.id::text) then raise exception 'Regularize a saída extraordinária/requisição e atualize o saldo antes de contar este item.'; end if;
  select saldo into v_saldo from public.alm_inv_preparo_saldos where preparacao_id=v_p.id and item_id=p_item_id;
  if not found then raise exception 'Item acrescentado após a liberação: solicite nova atualização.'; end if;
  select coalesce(max(numero),0)+1 into v_num from public.alm_inventario_contagens where item_id=p_item_id;
  if v_num>3 then raise exception 'Limite de três contagens atingido.'; end if;
  if p_quantidade is null or p_quantidade<0 or p_quantidade::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida.'; end if;
  if (v_num>=2 or p_causa is not null) and (not coalesce(public.alm_inv_causa_valida(p_causa),false) or length(trim(coalesce(p_causa_detalhe,'')))<5) then raise exception 'Informe a causa provável e o detalhe da recontagem (mínimo 5 caracteres).'; end if;
  select name into v_nome from public.profiles where id=auth.uid()::text;
  v_div := round(p_quantidade,3)<>round(v_saldo,3);
  insert into public.alm_inventario_contagens(item_id,numero,quantidade,divergente,saldo_ref,endereco_encontrado,validade,observacao,contado_por_id,contado_por_nome,
    causa,causa_detalhe,preparacao_id,iniciada_em,duracao_segundos,movimentacoes_controladas)
  values(p_item_id,v_num,p_quantidade,v_div,v_saldo,nullif(upper(trim(p_endereco)),''),p_validade,nullif(trim(p_observacao),''),auth.uid(),v_nome,
    p_causa,nullif(trim(p_causa_detalhe),''),v_p.id,p_iniciada_em,greatest(0,extract(epoch from clock_timestamp()-p_iniciada_em)::int),true);
  update public.alm_inventario_itens set status=case when not v_div then 'conferido' when v_num=3 then 'divergente' else 'aguardando_decisao' end,
    saldo_sistema=case when not v_div or v_num=3 then v_saldo else null end,qtd_final=case when not v_div or v_num=3 then p_quantidade else null end,
    diferenca=case when not v_div or v_num=3 then p_quantidade-v_saldo else null end,
    encerrado_em=case when not v_div or v_num=3 then clock_timestamp() end,encerrado_por=case when not v_div or v_num=3 then v_nome end,
    alerta=case when v_div and v_num=3 then 'Divergência após três contagens. Causa provável declarada; exige investigação e conciliação pela gestão.' end
  where id=p_item_id returning * into v_i;
  perform public.alm_inv_atualizar_status(v_i.inventario_id);
  return jsonb_build_object('numero',v_num,'divergente',v_div,'status',v_i.status,'pode_recontar',v_i.status='aguardando_decisao','saldo_sistema',v_i.saldo_sistema,'diferenca',v_i.diferenca);
end;
$$;

CREATE OR REPLACE FUNCTION public.alm_inv_registrar_contagem_legado(p_item_id uuid, p_quantidade numeric, p_endereco text, p_validade date, p_observacao text, p_por text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item public.alm_inventario_itens; v_numero int; v_saldo numeric; v_div boolean;
  v_max int := public.alm_inv_max_contagens();
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Informe a quantidade contada (zero ou mais).';
  end if;
  select * into v_item from public.alm_inventario_itens where id = p_item_id for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if exists (select 1 from public.alm_inventarios where id = v_item.inventario_id and excluido) then
    raise exception 'Inventário excluído.';
  end if;
  if v_item.status not in ('pendente','aguardando_decisao') then
    raise exception 'O item % já foi encerrado — não cabe nova contagem.', v_item.material;
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.alm_inventario_contagens where item_id = p_item_id;
  if v_numero > v_max then
    raise exception 'O item % já tem % contagens.', v_item.material, v_max;
  end if;
  v_saldo := public.alm_inv_saldo_zl0024(v_item.material, v_item.deposito);
  v_div := round(p_quantidade, 3) <> round(v_saldo, 3);
  insert into public.alm_inventario_contagens
    (item_id, numero, quantidade, divergente, saldo_ref, endereco_encontrado, validade, observacao,
     contado_por_id, contado_por_nome)
  values
    (p_item_id, v_numero, p_quantidade, v_div, v_saldo, nullif(upper(trim(p_endereco)),''), p_validade,
     nullif(trim(p_observacao),''), auth.uid(), nullif(p_por,''));
  if not v_div then
    update public.alm_inventario_itens set
      status = 'conferido', saldo_sistema = v_saldo, qtd_final = p_quantidade, diferenca = 0,
      alerta = null, encerrado_em = now(), encerrado_por = nullif(p_por,'')
    where id = p_item_id returning * into v_item;
  elsif v_numero >= v_max then
    update public.alm_inventario_itens set
      status = 'divergente', saldo_sistema = v_saldo, qtd_final = p_quantidade,
      diferenca = p_quantidade - v_saldo,
      alerta = format('Divergente após %s contagens: contado %s, ZL0024 %s (diferença %s).',
                      v_numero, p_quantidade, v_saldo, p_quantidade - v_saldo),
      encerrado_em = now(), encerrado_por = nullif(p_por,'')
    where id = p_item_id returning * into v_item;
  else
    update public.alm_inventario_itens set status = 'aguardando_decisao'
    where id = p_item_id returning * into v_item;
  end if;
  perform public.alm_inv_atualizar_status(v_item.inventario_id);
  return jsonb_build_object(
    'numero', v_numero, 'divergente', v_div, 'status', v_item.status,
    'pode_recontar', v_item.status = 'aguardando_decisao',
    'saldo_sistema', v_item.saldo_sistema, 'diferenca', v_item.diferenca
  );
end;
$function$;

revoke all on function public.alm_inv_registrar_contagem_legado(uuid,numeric,text,date,text,text) from public,anon,authenticated;

-- Clientes/filas antigos não podem burlar a preparação de inventários auditados.
create or replace function public.alm_inv_registrar_contagem(p_item_id uuid,p_quantidade numeric,p_endereco text,p_validade date,p_observacao text,p_por text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id where i.id=p_item_id and v.auditoria_ativa) then
    raise exception 'Atualize o aplicativo, solicite preparação e reconte presencialmente. Contagens sem referência de saldo não são aceitas nesta rodada.';
  end if;
  return public.alm_inv_registrar_contagem_legado(p_item_id,p_quantidade,p_endereco,p_validade,p_observacao,p_por);
end;
$$;
alter function public.alm_inv_encerrar_item(uuid,text) rename to alm_inv_encerrar_item_interno;
revoke all on function public.alm_inv_encerrar_item_interno(uuid,text) from public,anon,authenticated;
create function public.alm_inv_encerrar_auditado(p_item_id uuid,p_causa text,p_detalhe text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_r jsonb; v_nome text;
begin
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  if not coalesce(public.alm_inv_causa_valida(p_causa),false) or length(trim(coalesce(p_detalhe,'')))<5 then raise exception 'Informe a causa provável e detalhe antes de encerrar.'; end if;
  select name into v_nome from public.profiles where id=auth.uid()::text;
  v_r := public.alm_inv_encerrar_item_interno(p_item_id,v_nome);
  update public.alm_inventario_itens set causa_encerramento=p_causa,causa_encerramento_detalhe=trim(p_detalhe) where id=p_item_id;
  return v_r;
end;
$$;
create function public.alm_inv_encerrar_item(p_item_id uuid,p_por text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id where i.id=p_item_id and v.auditoria_ativa) then
    raise exception 'Atualize o aplicativo e informe a causa provável ao encerrar.';
  end if;
  return public.alm_inv_encerrar_item_interno(p_item_id,p_por);
end;
$$;

revoke all on function public.alm_inv_causa_valida(text), public.alm_inv_pode_operar(), public.alm_inv_pode_liberar(),public.alm_inv_pendencias_corte(timestamptz) from public,anon,authenticated;
revoke all on function public.alm_inv_criar_auditado(jsonb,jsonb) from public,anon;
grant execute on function public.alm_inv_criar_auditado(jsonb,jsonb) to authenticated;
revoke all on function public.alm_inv_contexto_auditoria(uuid), public.alm_inv_solicitar_atualizacao(uuid,int),public.alm_inv_liberar_preparacao(uuid,timestamptz,boolean,text),
  public.alm_inv_registrar_contagem_auditada(uuid,numeric,text,date,text,text,text,text,uuid,timestamptz,boolean),public.alm_inv_encerrar_auditado(uuid,text,text),public.alm_inv_encerrar_item(uuid,text) from public,anon;
grant execute on function public.alm_inv_contexto_auditoria(uuid), public.alm_inv_solicitar_atualizacao(uuid,int),public.alm_inv_liberar_preparacao(uuid,timestamptz,boolean,text),
  public.alm_inv_registrar_contagem_auditada(uuid,numeric,text,date,text,text,text,text,uuid,timestamptz,boolean),public.alm_inv_encerrar_auditado(uuid,text,text),public.alm_inv_encerrar_item(uuid,text) to authenticated;
