-- Equipamentos da Qualidade. Acesso exclusivo pelo módulo liberado na Gestão de Acessos.
create or replace function public.qua_equipamentos_pode_acessar()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid())::text
    and p.status = 'ativo' and ('admin' = any(p.roles) or coalesce((p.page_access->>'qualidade_equipamentos')::boolean,false)));
$$;
revoke all on function public.qua_equipamentos_pode_acessar() from public, anon;
grant execute on function public.qua_equipamentos_pode_acessar() to authenticated;

create table public.qua_equipamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^EQP-[0-9]{6}-[0-9]{2,}$'),
  data_registro date not null default (now() at time zone 'America/Sao_Paulo')::date,
  categoria text not null check (categoria in ('estoque','necessidade','segregados','compras')),
  dados jsonb not null check (jsonb_typeof(dados) = 'object' and coalesce(length(trim(dados->>'equipamento')),0) > 0),
  origem_chave text unique, origem_arquivo text, origem_linha integer, origem_dados jsonb,
  versao integer not null default 1,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table public.qua_equipamentos_eventos (
  id uuid primary key default gen_random_uuid(), equipamento_id uuid not null references public.qua_equipamentos(id),
  tipo text not null, descricao text not null, data_evento date not null,
  autor_id uuid, autor_nome text not null, criado_em timestamptz not null default now(),
  antes jsonb, depois jsonb, anexo_path text, anexo_nome text
);
create index qua_equipamentos_eventos_registro_idx on public.qua_equipamentos_eventos(equipamento_id, criado_em desc);
create index qua_equipamentos_categoria_idx on public.qua_equipamentos(categoria);
create index qua_equipamentos_data_idx on public.qua_equipamentos(data_registro);
alter table public.qua_equipamentos enable row level security;
alter table public.qua_equipamentos_eventos enable row level security;
revoke all on public.qua_equipamentos, public.qua_equipamentos_eventos from anon, authenticated;
grant select, insert, update on public.qua_equipamentos to authenticated;
grant select on public.qua_equipamentos_eventos to authenticated;
create policy qua_equipamentos_select on public.qua_equipamentos for select to authenticated using ((select public.qua_equipamentos_pode_acessar()));
create policy qua_equipamentos_insert on public.qua_equipamentos for insert to authenticated with check ((select public.qua_equipamentos_pode_acessar()));
create policy qua_equipamentos_update on public.qua_equipamentos for update to authenticated using ((select public.qua_equipamentos_pode_acessar())) with check ((select public.qua_equipamentos_pode_acessar()));
create policy qua_equipamentos_eventos_select on public.qua_equipamentos_eventos for select to authenticated using ((select public.qua_equipamentos_pode_acessar()));

create schema if not exists private;
-- Apenas a trigger grava a trilha: usuário/horário e snapshots nunca vêm do navegador.
create function private.qua_equipamentos_auditar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare contexto jsonb; nome text; campo text;
begin
  if TG_WHEN = 'BEFORE' then
    if exists(select 1 from jsonb_each(new.dados) where jsonb_typeof(value) <> 'string') then
      raise exception 'Os campos do equipamento devem ser textos.';
    end if;
    foreach campo in array array['data_segregacao','data_solicitacao','previsao_entrega','prazo_acao','proxima_calibracao'] loop
      if nullif(new.dados->>campo,'') is not null then
        if (new.dados->>campo) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data inválida: %',campo; end if;
        perform (new.dados->>campo)::date;
      end if;
    end loop;
    foreach campo in array array['qtd_estoque','qtd_necessaria','qtd_comprar','quantidade','qtd_solicitada'] loop
      if (new.dados->>campo) ~ '^\s*-\d' then raise exception 'Quantidade negativa: %',campo; end if;
    end loop;
    if TG_OP = 'UPDATE' then
      if new.id <> old.id or new.codigo <> old.codigo or new.categoria <> old.categoria
        or new.data_registro <> old.data_registro or new.criado_em <> old.criado_em
        or new.origem_chave is distinct from old.origem_chave or new.origem_arquivo is distinct from old.origem_arquivo
        or new.origem_linha is distinct from old.origem_linha or new.origem_dados is distinct from old.origem_dados then
        raise exception 'Identificação e origem são imutáveis.';
      end if;
      new.versao := old.versao + 1;
    else new.versao := 1;
    end if;
    new.atualizado_em := clock_timestamp();
    return new;
  end if;
  contexto := coalesce(nullif(current_setting('sisten.qua_equipamento_evento', true), '')::jsonb, '{}'::jsonb);
  select p.name into nome from public.profiles p where p.id = auth.uid()::text;
  insert into public.qua_equipamentos_eventos(equipamento_id,tipo,descricao,data_evento,autor_id,autor_nome,antes,depois,anexo_path,anexo_nome)
  values(new.id, coalesce(contexto->>'tipo', case when TG_OP='INSERT' then 'Cadastro' else 'Edição' end),
    coalesce(nullif(contexto->>'descricao',''),case when TG_OP='INSERT' then 'Cadastro de equipamento' else 'Atualização do cadastro' end),
    coalesce((contexto->>'data_evento')::date,(now() at time zone 'America/Sao_Paulo')::date), auth.uid(), coalesce(nome,'Carga administrativa'),
    case when TG_OP='UPDATE' then to_jsonb(old) else null end, to_jsonb(new),contexto->>'anexo_path',contexto->>'anexo_nome');
  return new;
end;
$$;
revoke all on function private.qua_equipamentos_auditar() from public, anon, authenticated;
create trigger qua_equipamentos_antes before insert or update on public.qua_equipamentos for each row execute function private.qua_equipamentos_auditar();
create trigger qua_equipamentos_depois after insert or update on public.qua_equipamentos for each row execute function private.qua_equipamentos_auditar();

create function public.qua_equipamento_salvar(p_id uuid, p_versao integer, p_registro jsonb, p_evento jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare registro_id uuid; tipo text := p_evento->>'tipo';
begin
  if not coalesce(public.qua_equipamentos_pode_acessar(),false) then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
  if length(trim(coalesce(p_evento->>'descricao',''))) = 0 then raise exception 'Descreva o lançamento ou o motivo da alteração.'; end if;
  if tipo is null or tipo not in ('Cadastro','Edição','Arquivamento','Restauração','Acompanhamento','Manutenção','Calibração / verificação','Segregação','Transferência','Recebimento','Devolução','Baixa','Correção / estorno') then raise exception 'Tipo de lançamento inválido.'; end if;
  if p_evento->>'anexo_path' is not null and split_part(p_evento->>'anexo_path','/',1) <> auth.uid()::text then raise exception 'Caminho de anexo inválido.'; end if;
  perform set_config('sisten.qua_equipamento_evento',p_evento::text,true);
  if p_id is null then
    insert into public.qua_equipamentos(codigo,data_registro,categoria,dados)
    values(p_registro->>'codigo',(p_registro->>'data_registro')::date,p_registro->>'categoria',p_registro->'dados') returning id into registro_id;
  else
    update public.qua_equipamentos set dados=p_registro->'dados', arquivado=coalesce((p_registro->>'arquivado')::boolean,false)
    where id=p_id and versao=p_versao returning id into registro_id;
    if registro_id is null then raise exception 'Registro alterado por outro usuário. Atualize a lista e tente novamente.' using errcode='40001'; end if;
  end if;
  return registro_id;
end;
$$;
revoke all on function public.qua_equipamento_salvar(uuid,integer,jsonb,jsonb) from public, anon;
grant execute on function public.qua_equipamento_salvar(uuid,integer,jsonb,jsonb) to authenticated;

-- Carga atômica, incremental e sem sobrescrever dados editados. Nº identifica a linha dentro da aba.
create function public.qua_equipamentos_importar(p_linhas jsonb, p_arquivo text, p_data date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare linha jsonb; novos integer:=0; ignorados integer:=0; inserido uuid;
begin
  if not coalesce(public.qua_equipamentos_pode_acessar(),false) then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 5000 or jsonb_array_length(p_linhas)=0 then raise exception 'Importe de 1 a 5.000 registros por arquivo.'; end if;
  perform pg_advisory_xact_lock(hashtext('qua_equipamentos_importar'));
  perform set_config('sisten.qua_equipamento_evento', jsonb_build_object('tipo','Importação','descricao','Importação de '||p_arquivo,'data_evento',p_data)::text,true);
  for linha in select value from jsonb_array_elements(p_linhas) loop
    if nullif(linha->>'origem_chave','') is null then raise exception 'Linha sem chave de origem.'; end if;
    insert into public.qua_equipamentos(codigo,data_registro,categoria,dados,origem_chave,origem_arquivo,origem_linha,origem_dados)
    values(linha->>'codigo',p_data,linha->>'categoria',linha->'dados',linha->>'origem_chave',p_arquivo,(linha->>'origem_linha')::integer,linha->'origem_dados')
    on conflict (origem_chave) do nothing returning id into inserido;
    if inserido is null then ignorados:=ignorados+1; else novos:=novos+1; end if;
  end loop;
  return jsonb_build_object('novos',novos,'ignorados',ignorados);
end;
$$;
revoke all on function public.qua_equipamentos_importar(jsonb,text,date) from public, anon;
grant execute on function public.qua_equipamentos_importar(jsonb,text,date) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qua-equipamentos','qua-equipamentos',false,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']) on conflict(id) do nothing;
create policy qua_equipamentos_anexo_select on storage.objects for select to authenticated
using (bucket_id='qua-equipamentos' and (select public.qua_equipamentos_pode_acessar()));
create policy qua_equipamentos_anexo_insert on storage.objects for insert to authenticated
with check (bucket_id='qua-equipamentos' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.qua_equipamentos_pode_acessar()));
-- Remover apenas uploads órfãos do próprio usuário; anexos já auditados são preservados.
create policy qua_equipamentos_anexo_delete on storage.objects for delete to authenticated
using (bucket_id='qua-equipamentos' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.qua_equipamentos_pode_acessar())
and not exists(select 1 from public.qua_equipamentos_eventos e where e.anexo_path=name));
