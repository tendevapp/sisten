-- Checklist de internos mecânicos em duas etapas: a Produção preenche e
-- conclui (AGUARDANDO_QUALIDADE); a Qualidade reabre, faz a dupla verificação
-- e finaliza (FINALIZADO). Quem é "Qualidade" é definido pelo setor do perfil
-- (sectors.name = 'Qualidade'), já que não existe role específica.

alter table public.qua_internos_mecanicos_checklists
  drop constraint if exists qua_internos_mecanicos_checklists_status_check;
alter table public.qua_internos_mecanicos_checklists
  add constraint qua_internos_mecanicos_checklists_status_check
  check (status in ('RASCUNHO', 'AGUARDANDO_QUALIDADE', 'FINALIZADO'));

alter table public.qua_internos_mecanicos_checklists
  add column if not exists producao_concluida_por text,
  add column if not exists producao_concluida_por_nome text,
  add column if not exists producao_concluida_em timestamptz,
  add column if not exists qualidade_por text,
  add column if not exists qualidade_por_nome text,
  add column if not exists qualidade_iniciada_em timestamptz,
  add column if not exists finalizado_em timestamptz;

create index if not exists idx_qua_internos_mecanicos_status
  on public.qua_internos_mecanicos_checklists (status, producao_concluida_em desc);

create or replace function public.qua_internos_eh_qualidade()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_role('admin') or exists (
    select 1
    from public.profiles p
    join public.sectors s on s.id = p.sector_id
    where p.id = (select auth.uid())::text
      and lower(s.name) = 'qualidade'
  )
$$;
revoke all on function public.qua_internos_eh_qualidade() from public, anon;
grant execute on function public.qua_internos_eh_qualidade() to authenticated, service_role;

-- Quem pode mexer no registro no estado atual: o autor enquanto rascunho, a
-- Qualidade enquanto aguarda a dupla verificação, e o admin sempre.
create or replace function public.qua_internos_pode_editar(p_checklist_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.qua_internos_mecanicos_checklists c
    where c.id::text = p_checklist_id
      and (
        public.has_role('admin')
        or (c.status = 'RASCUNHO' and c.criado_por = (select auth.uid())::text)
        or (c.status = 'AGUARDANDO_QUALIDADE' and public.qua_internos_eh_qualidade())
      )
  )
$$;
revoke all on function public.qua_internos_pode_editar(text) from public, anon;
grant execute on function public.qua_internos_pode_editar(text) to authenticated, service_role;

-- Checklists: leitura para quem tem acesso à tela (pendências e histórico
-- precisam aparecer para Produção e Qualidade).
drop policy if exists qua_internos_mecanicos_checklists_select on public.qua_internos_mecanicos_checklists;
drop policy if exists qua_internos_mecanicos_checklists_update on public.qua_internos_mecanicos_checklists;
drop policy if exists qua_internos_mecanicos_checklists_delete on public.qua_internos_mecanicos_checklists;

create policy qua_internos_mecanicos_checklists_select on public.qua_internos_mecanicos_checklists
  for select to authenticated using (true);
create policy qua_internos_mecanicos_checklists_update on public.qua_internos_mecanicos_checklists
  for update to authenticated
  using (
    public.has_role('admin')
    or (status = 'RASCUNHO' and criado_por = (select auth.uid())::text)
    or (status = 'AGUARDANDO_QUALIDADE' and public.qua_internos_eh_qualidade())
  )
  with check (
    public.has_role('admin')
    or (status in ('RASCUNHO', 'AGUARDANDO_QUALIDADE') and criado_por = (select auth.uid())::text)
    or (status in ('AGUARDANDO_QUALIDADE', 'FINALIZADO') and public.qua_internos_eh_qualidade())
  );
create policy qua_internos_mecanicos_checklists_delete on public.qua_internos_mecanicos_checklists
  for delete to authenticated
  using (public.has_role('admin') or (status = 'RASCUNHO' and criado_por = (select auth.uid())::text));

-- Fotos e assinaturas seguem o registro pai.
drop policy if exists qua_internos_mecanicos_fotos_select on public.qua_internos_mecanicos_fotos;
drop policy if exists qua_internos_mecanicos_fotos_insert on public.qua_internos_mecanicos_fotos;
drop policy if exists qua_internos_mecanicos_fotos_delete on public.qua_internos_mecanicos_fotos;
create policy qua_internos_mecanicos_fotos_select on public.qua_internos_mecanicos_fotos
  for select to authenticated using (true);
create policy qua_internos_mecanicos_fotos_insert on public.qua_internos_mecanicos_fotos
  for insert to authenticated with check (public.qua_internos_pode_editar(checklist_id::text));
create policy qua_internos_mecanicos_fotos_delete on public.qua_internos_mecanicos_fotos
  for delete to authenticated using (public.qua_internos_pode_editar(checklist_id::text));

drop policy if exists qua_internos_mecanicos_assinaturas_select on public.qua_internos_mecanicos_assinaturas;
drop policy if exists qua_internos_mecanicos_assinaturas_insert on public.qua_internos_mecanicos_assinaturas;
drop policy if exists qua_internos_mecanicos_assinaturas_delete on public.qua_internos_mecanicos_assinaturas;
create policy qua_internos_mecanicos_assinaturas_select on public.qua_internos_mecanicos_assinaturas
  for select to authenticated using (true);
create policy qua_internos_mecanicos_assinaturas_insert on public.qua_internos_mecanicos_assinaturas
  for insert to authenticated with check (public.qua_internos_pode_editar(checklist_id::text));
create policy qua_internos_mecanicos_assinaturas_delete on public.qua_internos_mecanicos_assinaturas
  for delete to authenticated using (public.qua_internos_pode_editar(checklist_id::text));

-- Storage: pasta <checklist_id>/...
drop policy if exists qua_internos_mecanicos_storage_read on storage.objects;
drop policy if exists qua_internos_mecanicos_storage_insert on storage.objects;
drop policy if exists qua_internos_mecanicos_storage_update on storage.objects;
drop policy if exists qua_internos_mecanicos_storage_delete on storage.objects;

create policy qua_internos_mecanicos_storage_read on storage.objects
  for select to authenticated
  using (bucket_id = 'qua-internos-mecanicos');
create policy qua_internos_mecanicos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'qua-internos-mecanicos'
    and (
      ((storage.foldername(name))[1] = 'ilustracoes' and public.has_role('admin'))
      or public.qua_internos_pode_editar((storage.foldername(name))[1])
    )
  );
create policy qua_internos_mecanicos_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'qua-internos-mecanicos' and public.qua_internos_pode_editar((storage.foldername(name))[1]))
  with check (bucket_id = 'qua-internos-mecanicos' and public.qua_internos_pode_editar((storage.foldername(name))[1]));
create policy qua_internos_mecanicos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'qua-internos-mecanicos'
    and (
      ((storage.foldername(name))[1] = 'ilustracoes' and public.has_role('admin'))
      or public.qua_internos_pode_editar((storage.foldername(name))[1])
    )
  );
