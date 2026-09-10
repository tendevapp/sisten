-- =====================================================================
-- Almoxarifado > Recebimento — bucket das fotos (ficha cega e conferência).
--
-- Privado, teto de 10 MB. A foto já sobe comprimida pelo app
-- (`comprimirImagemUpload`, 1600px / JPEG 0,82 — regra 1 do CLAUDE.md);
-- o limite do bucket só barra o acidente. Espelha `proj-evidencias`.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alm-recebimento', 'alm-recebimento', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "alm_recebimento_objects_read" on storage.objects;
create policy "alm_recebimento_objects_read" on storage.objects
  for select to authenticated using (bucket_id = 'alm-recebimento');

drop policy if exists "alm_recebimento_objects_insert" on storage.objects;
create policy "alm_recebimento_objects_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'alm-recebimento');

drop policy if exists "alm_recebimento_objects_update" on storage.objects;
create policy "alm_recebimento_objects_update" on storage.objects
  for update to authenticated using (bucket_id = 'alm-recebimento');

drop policy if exists "alm_recebimento_objects_delete" on storage.objects;
create policy "alm_recebimento_objects_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'alm-recebimento');
