-- =====================================================================
-- Qualidade — bucket dos anexos da RNC (evidência fotográfica + docs de
-- origem como boletim/RFI em PDF).
--
-- Privado, teto de 10 MB. A imagem já sobe comprimida pelo app
-- (`comprimirImagemUpload`/`prepareAttachment`, regra 1 do CLAUDE.md); o
-- limite do bucket só barra o acidente. Espelha `prod-evidencias`.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qua-rnc-evidencias', 'qua-rnc-evidencias', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "qua_rnc_evidencias_objects_read" on storage.objects;
create policy "qua_rnc_evidencias_objects_read" on storage.objects
  for select to authenticated using (bucket_id = 'qua-rnc-evidencias');

drop policy if exists "qua_rnc_evidencias_objects_insert" on storage.objects;
create policy "qua_rnc_evidencias_objects_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'qua-rnc-evidencias');

drop policy if exists "qua_rnc_evidencias_objects_update" on storage.objects;
create policy "qua_rnc_evidencias_objects_update" on storage.objects
  for update to authenticated using (bucket_id = 'qua-rnc-evidencias');

drop policy if exists "qua_rnc_evidencias_objects_delete" on storage.objects;
create policy "qua_rnc_evidencias_objects_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'qua-rnc-evidencias');
