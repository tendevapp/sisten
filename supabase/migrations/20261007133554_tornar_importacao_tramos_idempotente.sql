create unique index if not exists prod_apt_tramo_eventos_situacao_importacao_unica
  on public.prod_apt_tramo_eventos(importacao_id, tramo_id, tipo)
  where tipo = 'situacao' and importacao_id is not null and excluido_em is null;

create or replace function public.prod_preparar_importacao_catalogo_tramos(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote uuid;
  v_arquivo text := nullif(trim(p->>'arquivo'), '');
  v_sha256 text := lower(nullif(trim(p->>'sha256'), ''));
begin
  perform public.prod_apt_exigir_cadastro_tramos();
  if v_arquivo is null or v_sha256 is null or v_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Arquivo e SHA-256 válido são obrigatórios.'; end if;
  select id into v_lote from public.prod_apt_importacoes_tramos where sha256 = v_sha256;
  if v_lote is not null then return v_lote; end if;
  if jsonb_typeof(p->'itens') <> 'array' then raise exception 'Itens da matriz são obrigatórios.'; end if;
  insert into public.prod_apt_importacoes_tramos (arquivo, sha256, criado_por) values (v_arquivo, v_sha256, auth.uid()) returning id into v_lote;
  insert into public.prod_apt_importacoes_tramos_itens (importacao_id, linha_origem, serie, torre_numero, tramo, antes_json)
  select v_lote, (item->>'linhaOrigem')::integer, (item->>'sequencial')::integer, (item->>'torreNumero')::integer, item->>'tramo', jsonb_build_object('torreNumero', catalogo.torre_numero, 'tramo', catalogo.tramo, 'serie', catalogo.serie)
    from jsonb_array_elements(p->'itens') item join public.proj_tramos_gwjaco catalogo on catalogo.serie = (item->>'sequencial')::integer where catalogo.subprojeto_id = 'SP01';
  if (select count(*) from public.prod_apt_importacoes_tramos_itens where importacao_id = v_lote) <> 115 then raise exception 'A matriz deve possuir exatamente 115 séries válidas do SP01.'; end if;
  return v_lote;
end;
$$;

create or replace function public.prod_reconciliar_catalogo_tramos(p_lote uuid, p_confirmacao_3202 boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  perform public.prod_apt_exigir_cadastro_tramos();
  select status into v_status from public.prod_apt_importacoes_tramos where id = p_lote for update;
  if not found then raise exception 'Lote de importação inexistente.'; end if;
  if v_status in ('reconciliado', 'historico_importado') then return; end if;
  if not p_confirmacao_3202 then raise exception 'A confirmação explícita da série 3202 é obrigatória.'; end if;
  if (select count(*) from public.prod_apt_importacoes_tramos_itens where importacao_id=p_lote) <> 115 then raise exception 'Lote incompleto.'; end if;
  update public.proj_tramos_gwjaco c set torre_numero=-c.serie,updated_at=now() from public.prod_apt_importacoes_tramos_itens i where i.importacao_id=p_lote and c.serie=i.serie;
  update public.proj_tramos_gwjaco c set torre_numero=i.torre_numero,tramo=i.tramo,secao='S'||substring(i.tramo from 2),updated_at=now() from public.prod_apt_importacoes_tramos_itens i where i.importacao_id=p_lote and c.serie=i.serie;
  update public.prod_virolas v set torre_numero=c.torre_numero,tramo=c.tramo from public.proj_tramos_gwjaco c where v.tramo_unidade_id=c.id and c.subprojeto_id='SP01';
  update public.prod_tramos_entrega e set torre_numero=-c.serie from public.proj_tramos_gwjaco c where e.id=c.id and c.subprojeto_id='SP01';
  update public.prod_tramos_entrega e set torre_numero=c.torre_numero,tramo=c.tramo,serie=c.serie from public.proj_tramos_gwjaco c where e.id=c.id and c.subprojeto_id='SP01';
  update public.fin_fat_gwjaco f set torre_numero=-c.serie from public.proj_tramos_gwjaco c where f.tramo_id=c.id and c.subprojeto_id='SP01';
  update public.fin_fat_gwjaco f set torre_numero=c.torre_numero,tramo=c.tramo,serie=c.serie from public.proj_tramos_gwjaco c where f.tramo_id=c.id and c.subprojeto_id='SP01';
  update public.prod_apt_importacoes_tramos set status='reconciliado',reconciliado_em=now() where id=p_lote;
end; $$;

create or replace function public.prod_apt_importar_snapshot_tramos(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lote uuid := (p->>'loteId')::uuid; v_item jsonb; v_marco text; v_data text; v_tramo text; v_inseridos integer:=0;
begin
  perform public.prod_apt_exigir_cadastro_tramos();
  if exists(select 1 from public.prod_apt_importacoes_tramos where id=v_lote and status='historico_importado') then return jsonb_build_object('eventosInseridos',0,'jaImportado',true); end if;
  if not exists(select 1 from public.prod_apt_importacoes_tramos where id=v_lote and status='reconciliado') then raise exception 'Lote deve estar reconciliado antes da carga histórica.'; end if;
  for v_item in select value from jsonb_array_elements(p->'snapshots') loop
    select id into v_tramo from public.proj_tramos_gwjaco where serie=(v_item->>'sequencial')::integer;
    for v_marco,v_data in select key,value from jsonb_each_text(coalesce(v_item->'marcos','{}'::jsonb)) loop
      if v_data <> '' then insert into public.prod_apt_tramo_eventos(codigo,tramo_id,tipo,marco,data_operacional,origem,importacao_id,criado_por) values(public.prod_apt_proximo_codigo_tramo(v_data::date),v_tramo,'marco',v_marco,v_data::date,'importacao',v_lote,auth.uid()) on conflict (tramo_id,marco) where excluido_em is null and tipo='marco' do nothing; v_inseridos:=v_inseridos+1; end if;
    end loop;
    v_data:=coalesce((select max(value) from jsonb_each_text(coalesce(v_item->'marcos','{}'::jsonb))),current_date::text);
    insert into public.prod_apt_tramo_eventos(codigo,tramo_id,tipo,data_operacional,setor,atividade,reparos_solda,origem,importacao_id,criado_por) values(public.prod_apt_proximo_codigo_tramo(v_data::date),v_tramo,'situacao',v_data::date,nullif(v_item->>'setor',''),nullif(v_item->>'atividade',''),nullif(v_item->>'reparosSolda','')::integer,'importacao',v_lote,auth.uid()) on conflict (importacao_id,tramo_id,tipo) where tipo='situacao' and importacao_id is not null and excluido_em is null do nothing;
  end loop;
  update public.prod_apt_importacoes_tramos set status='historico_importado' where id=v_lote;
  return jsonb_build_object('eventosInseridos',v_inseridos);
end; $$;
