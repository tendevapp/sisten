-- Reserva por material normalizado × depósito. Rascunho: lease de 120s; gravado: até encerrar/remover.
create table public.alm_inv_reservas (
  material text not null,
  deposito text not null,
  sessao uuid,
  usuario_id uuid,
  expira_em timestamptz,
  item_id uuid unique references public.alm_inventario_itens(id) on delete cascade,
  inventario_id uuid references public.alm_inventarios(id) on delete cascade,
  primary key(material,deposito),
  check ((item_id is null and sessao is not null and usuario_id is not null and expira_em is not null and inventario_id is null)
    or (item_id is not null and inventario_id is not null and sessao is null and expira_em is null))
);
alter table public.alm_inv_reservas enable row level security;
revoke all on public.alm_inv_reservas from public,anon,authenticated;
create policy alm_inv_reservas_internas on public.alm_inv_reservas for all to authenticated using(false) with check(false);
create index on public.alm_inv_reservas(sessao,usuario_id) where item_id is null;

do $$ begin
  if exists(select 1 from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id
    where not v.excluido and v.status='aberto' and i.status in ('pendente','aguardando_decisao')
    group by regexp_replace(trim(i.material),'^0+',''),lpad(trim(i.deposito),4,'0') having count(*)>1) then
    raise exception 'Há itens duplicados em inventários abertos. Revisar antes de ativar reservas, sem apagar histórico.';
  end if;
end $$;
insert into public.alm_inv_reservas(material,deposito,item_id,inventario_id,usuario_id)
select regexp_replace(trim(i.material),'^0+',''),lpad(trim(i.deposito),4,'0'),i.id,v.id,v.criado_por_id
from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id
where not v.excluido and v.status='aberto' and i.status in ('pendente','aguardando_decisao');

create function public.alm_inv_listar_reservas(p_sessao uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('material',r.material,'deposito',r.deposito,
    'minha',r.item_id is null and r.usuario_id=auth.uid() and r.sessao=p_sessao,
    'responsavel',coalesce(p.name,v.criado_por_nome,'Equipe do inventário'),'inventario',v.codigo,
    'item_id',r.item_id,'expira_em',r.expira_em))
    from public.alm_inv_reservas r left join public.profiles p on p.id=r.usuario_id::text
      left join public.alm_inventarios v on v.id=r.inventario_id
    where r.item_id is not null or r.expira_em>clock_timestamp()),'[]'::jsonb);
end;
$$;

create function public.alm_inv_definir_reserva(p_sessao uuid,p_itens jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_r record; v_atual public.alm_inv_reservas; v_nome text;
begin
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  if p_sessao is null or jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)>10000 then raise exception 'Seleção inválida.'; end if;
  if exists(select 1 from jsonb_array_elements(p_itens) x where nullif(trim(x->>'material'),'') is null or nullif(trim(x->>'deposito'),'') is null) then raise exception 'Item sem material ou depósito.'; end if;
  perform pg_advisory_xact_lock(hashtext('alm_inv_reservas'));
  delete from public.alm_inv_reservas where item_id is null and expira_em<=clock_timestamp();
  for v_r in select distinct regexp_replace(trim(x->>'material'),'^0+','') material,lpad(trim(x->>'deposito'),4,'0') deposito from jsonb_array_elements(p_itens) x order by 1,2 loop
    if v_r.material='' or v_r.deposito !~ '^[0-9]{4}$' then raise exception 'Material ou depósito inválido.'; end if;
    select * into v_atual from public.alm_inv_reservas where material=v_r.material and deposito=v_r.deposito;
    if found and (v_atual.item_id is not null or v_atual.usuario_id is distinct from auth.uid() or v_atual.sessao is distinct from p_sessao) then
      select coalesce(p.name,v.criado_por_nome,'outro inventário') into v_nome from public.alm_inv_reservas r
        left join public.profiles p on p.id=r.usuario_id::text left join public.alm_inventarios v on v.id=r.inventario_id
        where r.material=v_r.material and r.deposito=v_r.deposito;
      raise exception 'Item % / depósito % já reservado por %. Atualize a seleção.',v_r.material,v_r.deposito,v_nome;
    end if;
    insert into public.alm_inv_reservas(material,deposito,sessao,usuario_id,expira_em)
    values(v_r.material,v_r.deposito,p_sessao,auth.uid(),clock_timestamp()+interval '120 seconds')
    on conflict(material,deposito) do update set expira_em=excluded.expira_em;
  end loop;
  delete from public.alm_inv_reservas r where r.item_id is null and r.sessao=p_sessao and r.usuario_id=auth.uid()
    and not exists(select 1 from jsonb_array_elements(p_itens) x where regexp_replace(trim(x->>'material'),'^0+','')=r.material and lpad(trim(x->>'deposito'),4,'0')=r.deposito);
  return public.alm_inv_listar_reservas(p_sessao);
end;
$$;

create function public.alm_inv_sincronizar_reserva_item() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_inv public.alm_inventarios; v_r public.alm_inv_reservas; v_mat text; v_dep text;
begin
  perform pg_advisory_xact_lock(hashtext('alm_inv_reservas'));
  select * into v_inv from public.alm_inventarios where id=new.inventario_id;
  if new.status not in ('pendente','aguardando_decisao') or v_inv.excluido or v_inv.status<>'aberto' then
    delete from public.alm_inv_reservas where item_id=new.id;
    return new;
  end if;
  v_mat := regexp_replace(trim(new.material),'^0+',''); v_dep := lpad(trim(new.deposito),4,'0');
  select * into v_r from public.alm_inv_reservas where material=v_mat and deposito=v_dep for update;
  if found and v_r.item_id is distinct from new.id
    and (v_r.item_id is not null or (v_r.expira_em>clock_timestamp() and (
      v_r.usuario_id is distinct from auth.uid() or v_r.sessao::text is distinct from nullif(current_setting('sisten.inv_reserva_sessao',true),'')))) then
    raise exception 'Item % / depósito % já está reservado em outra seleção ou inventário.',new.material,new.deposito;
  end if;
  -- Libera a chave anterior se um operador autorizado corrigiu material/depósito.
  delete from public.alm_inv_reservas where item_id=new.id and (material<>v_mat or deposito<>v_dep);
  insert into public.alm_inv_reservas(material,deposito,item_id,inventario_id,usuario_id)
  values(v_mat,v_dep,new.id,new.inventario_id,v_inv.criado_por_id)
  on conflict(material,deposito) do update set item_id=excluded.item_id,inventario_id=excluded.inventario_id,usuario_id=excluded.usuario_id,sessao=null,expira_em=null;
  return new;
end;
$$;
create trigger alm_inv_item_reserva after insert or update of status,material,deposito,inventario_id on public.alm_inventario_itens
  for each row execute function public.alm_inv_sincronizar_reserva_item();

create function public.alm_inv_sincronizar_reserva_inventario() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('alm_inv_reservas'));
  if new.excluido or new.status<>'aberto' then
    delete from public.alm_inv_reservas where inventario_id=new.id;
  else
    -- Também cobre reabertura por acréscimo de itens a um inventário concluído.
    update public.alm_inventario_itens set status=status where inventario_id=new.id and status in ('pendente','aguardando_decisao');
  end if;
  return new;
end;
$$;
create trigger alm_inv_cabecalho_reserva after update of status,excluido on public.alm_inventarios
  for each row when (old.status is distinct from new.status or old.excluido is distinct from new.excluido)
  execute function public.alm_inv_sincronizar_reserva_inventario();

create or replace function public.alm_inv_criar_auditado(p_inv jsonb,p_itens jsonb) returns public.alm_inventarios
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_inv public.alm_inventarios;
begin
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  perform pg_advisory_xact_lock(hashtext('alm_inv_reservas'));
  perform set_config('sisten.inv_reserva_sessao',coalesce(p_inv->>'reserva_sessao',''),true);
  v_inv := public.alm_inv_criar(p_inv,p_itens);
  update public.alm_inventarios set auditoria_ativa=true where id=v_inv.id returning * into v_inv;
  return v_inv;
end;
$$;
create function public.alm_inv_adicionar_reservados(p_id uuid,p_itens jsonb,p_sessao uuid) returns int
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.alm_inv_pode_operar() then raise exception 'Sem acesso ao inventário.'; end if;
  perform pg_advisory_xact_lock(hashtext('alm_inv_reservas'));
  perform set_config('sisten.inv_reserva_sessao',coalesce(p_sessao::text,''),true);
  return public.alm_inv_adicionar_itens(p_id,p_itens);
end;
$$;
revoke all on function public.alm_inv_sincronizar_reserva_item(),public.alm_inv_sincronizar_reserva_inventario() from public,anon,authenticated;
revoke all on function public.alm_inv_listar_reservas(uuid),public.alm_inv_definir_reserva(uuid,jsonb),public.alm_inv_adicionar_reservados(uuid,jsonb,uuid) from public,anon;
grant execute on function public.alm_inv_listar_reservas(uuid),public.alm_inv_definir_reserva(uuid,jsonb),public.alm_inv_adicionar_reservados(uuid,jsonb,uuid) to authenticated;

-- Ordem única de locks: antes de travar cabeçalho/item/saldo, obter o mutex das reservas.
-- Evita inversão entre contagem, acréscimo de itens, exclusão e transferência de rascunho.
do $locks$
declare v_def text; v_novo text;
begin
  for v_def in select pg_get_functiondef(oid) from pg_proc where pronamespace='public'::regnamespace and proname in (
    'alm_inv_criar','alm_inv_adicionar_itens','alm_inv_remover_item','alm_inv_excluir',
    'alm_inv_registrar_contagem_legado','alm_inv_registrar_contagem_auditada','alm_inv_encerrar_item_interno',
    'alm_inv_encerrar_auditado','alm_inv_importar_base','alm_inv_liberar_preparacao','alm_inv_solicitar_atualizacao','alm_inv_atualizar_status'
  ) loop
    v_novo := replace(v_def,E'\nbegin\n',E'\nbegin\n  perform pg_advisory_xact_lock(hashtext(''alm_inv_reservas''));\n');
    if v_novo=v_def then raise exception 'Não foi possível aplicar a ordem de locks a uma RPC do inventário.'; end if;
    execute v_novo;
  end loop;
end;
$locks$;
