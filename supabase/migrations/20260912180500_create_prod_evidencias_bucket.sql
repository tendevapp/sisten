-- =====================================================================
-- Produção — bucket das fotos dos lançamentos (corte, chanfro, calandra,
-- solda e as etapas seguintes).
--
-- Privado, teto de 10 MB. A foto já sobe comprimida E carimbada com data/hora
-- pelo app (`prepararFotoCarimbada`, 1600px / JPEG 0,82 — regra 1 do
-- CLAUDE.md); o limite do bucket só barra o acidente. Espelha `alm-recebimento`.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prod-evidencias', 'prod-evidencias', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

drop policy if exists "prod_evidencias_objects_read" on storage.objects;
create policy "prod_evidencias_objects_read" on storage.objects
  for select to authenticated using (bucket_id = 'prod-evidencias');

drop policy if exists "prod_evidencias_objects_insert" on storage.objects;
create policy "prod_evidencias_objects_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'prod-evidencias');

drop policy if exists "prod_evidencias_objects_update" on storage.objects;
create policy "prod_evidencias_objects_update" on storage.objects
  for update to authenticated using (bucket_id = 'prod-evidencias');

drop policy if exists "prod_evidencias_objects_delete" on storage.objects;
create policy "prod_evidencias_objects_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'prod-evidencias');
