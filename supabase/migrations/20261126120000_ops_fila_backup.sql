-- Backup da fila offline dos aparelhos (Central de Sincronização, só admin).
--
-- Cada aparelho, com rede, manda uma cópia do que ainda está na fila
-- (formulários, checklists da Qualidade, outbox da Produção) — de todos os
-- usuários do aparelho. Fotos e assinaturas vão para o bucket privado
-- `ops-fila-backup`. Serve para o admin ver o conteúdo e recuperar o que
-- ficou preso (recusado, de outro usuário, celular perdido).
--
-- Só entra pela RPC `ops_fila_backup_registrar` (security definer); a leitura
-- é só do admin. Item que saiu da fila do aparelho fica marcado
-- (`saiu_da_fila_em`) e é apagado 30 dias depois.

create table if not exists public.ops_fila_backup (
  chave text primary key,
  device_id text not null,
  fila text not null check (fila in ('formularios', 'qualidade', 'producao')),
  item_id text not null,
  dono_id text,
  dono_nome text,
  reportado_por uuid not null,
  reportado_por_nome text,
  plataforma text,
  rotulo text,
  resumo text,
  estado text,
  erro text,
  criado_no_aparelho timestamptz,
  conteudo jsonb not null,
  arquivos jsonb not null default '[]'::jsonb,
  hash text not null,
  primeiro_backup_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  saiu_da_fila_em timestamptz
);

comment on table public.ops_fila_backup is
  'Copia do conteudo da fila offline de cada aparelho (Central de Sincronizacao, leitura so admin).';

create index if not exists ops_fila_backup_device_idx on public.ops_fila_backup (device_id, saiu_da_fila_em);
create index if not exists ops_fila_backup_saiu_idx on public.ops_fila_backup (saiu_da_fila_em) where saiu_da_fila_em is not null;

alter table public.ops_fila_backup enable row level security;

drop policy if exists ops_fila_backup_select on public.ops_fila_backup;
create policy ops_fila_backup_select on public.ops_fila_backup
  for select to authenticated
  using ((select public.has_role('admin')));

revoke all on table public.ops_fila_backup from anon;
revoke all on table public.ops_fila_backup from authenticated;
grant select on table public.ops_fila_backup to authenticated;

-- p_itens: [{ fila, item_id, dono_id, dono_nome, rotulo, resumo, estado, erro,
--             criado_em, conteudo, arquivos, hash }]
-- p_presentes: chaves de TODOS os itens ainda na fila do aparelho (com ou sem
--              backup) — o que não está na lista saiu da fila.
create or replace function public.ops_fila_backup_registrar(
  p_device_id text,
  p_plataforma text,
  p_itens jsonb,
  p_presentes text[]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_item jsonb;
  v_chave text;
  v_qtd integer := 0;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '28000';
  end if;
  if p_device_id is null or char_length(p_device_id) < 8 or char_length(p_device_id) > 80 then
    raise exception 'device_id invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) > 200 then
    raise exception 'lote de backup invalido' using errcode = '22023';
  end if;

  select name into v_nome from public.profiles where id = v_uid::text;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    if (v_item->>'fila') not in ('formularios', 'qualidade', 'producao') or coalesce(v_item->>'item_id', '') = '' then
      continue;
    end if;
    -- Conteúdo é texto de formulário; foto vai para o bucket. 1 MB por item é folga.
    if octet_length((v_item->'conteudo')::text) > 1048576 then
      continue;
    end if;
    v_chave := p_device_id || ':' || (v_item->>'fila') || ':' || (v_item->>'item_id');
    insert into public.ops_fila_backup as b (
      chave, device_id, fila, item_id, dono_id, dono_nome, reportado_por, reportado_por_nome, plataforma,
      rotulo, resumo, estado, erro, criado_no_aparelho, conteudo, arquivos, hash
    ) values (
      v_chave, p_device_id, v_item->>'fila', left(v_item->>'item_id', 200),
      left(v_item->>'dono_id', 80), left(v_item->>'dono_nome', 120), v_uid, left(v_nome, 120), left(p_plataforma, 80),
      left(v_item->>'rotulo', 200), left(v_item->>'resumo', 500), left(v_item->>'estado', 20), left(v_item->>'erro', 1000),
      (v_item->>'criado_em')::timestamptz, v_item->'conteudo', coalesce(v_item->'arquivos', '[]'::jsonb), left(v_item->>'hash', 40)
    )
    on conflict (chave) do update set
      dono_id = excluded.dono_id,
      dono_nome = coalesce(excluded.dono_nome, b.dono_nome),
      reportado_por = excluded.reportado_por,
      reportado_por_nome = excluded.reportado_por_nome,
      plataforma = excluded.plataforma,
      rotulo = excluded.rotulo,
      resumo = excluded.resumo,
      estado = excluded.estado,
      erro = excluded.erro,
      conteudo = excluded.conteudo,
      arquivos = excluded.arquivos,
      hash = excluded.hash,
      atualizado_em = now(),
      saiu_da_fila_em = null;
    v_qtd := v_qtd + 1;
  end loop;

  if p_presentes is not null then
    update public.ops_fila_backup
       set saiu_da_fila_em = now()
     where device_id = p_device_id
       and saiu_da_fila_em is null
       and not (chave = any(p_presentes));
  end if;

  delete from public.ops_fila_backup where saiu_da_fila_em < now() - interval '30 days';

  return v_qtd;
end;
$$;

revoke all on function public.ops_fila_backup_registrar(text, text, jsonb, text[]) from public, anon;
grant execute on function public.ops_fila_backup_registrar(text, text, jsonb, text[]) to authenticated;

-- Fotos e assinaturas do backup: qualquer usuário logado envia na própria
-- pasta (1º nível = auth.uid()); só admin lê.
insert into storage.buckets (id, name, public, file_size_limit)
values ('ops-fila-backup', 'ops-fila-backup', false, 15728640)
on conflict (id) do nothing;

drop policy if exists ops_fila_backup_envio on storage.objects;
create policy ops_fila_backup_envio on storage.objects for insert to authenticated
with check (bucket_id = 'ops-fila-backup' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists ops_fila_backup_leitura on storage.objects;
create policy ops_fila_backup_leitura on storage.objects for select to authenticated
using (bucket_id = 'ops-fila-backup' and (select public.has_role('admin')));
