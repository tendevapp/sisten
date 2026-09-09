-- =====================================================================
-- ESPELHO DOCUMENTAL — não é executado pelo Supabase CLI.
-- A fonte aplicada são as migrations em supabase/migrations/:
--   20260909004716_create_proj_evidencias_bucket.sql
-- Mantido aqui pela convenção de db/README.md.
-- =====================================================================

-- =====================================================================
-- Almoxarifado > Projetos — bucket das fotos de avaria (formulário F5)
--
-- Privado e limitado a 10 MB. A foto já sobe comprimida pelo app
-- (`comprimirImagemUpload`, 1600px / JPEG 0,82 — regra 1 do CLAUDE.md);
-- o limite do bucket só barra o acidente.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proj-evidencias', 'proj-evidencias', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "proj_evidencias_objects_read" on storage.objects;
create policy "proj_evidencias_objects_read" on storage.objects
  for select to authenticated using (bucket_id = 'proj-evidencias');

drop policy if exists "proj_evidencias_objects_insert" on storage.objects;
create policy "proj_evidencias_objects_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'proj-evidencias');

drop policy if exists "proj_evidencias_objects_update" on storage.objects;
create policy "proj_evidencias_objects_update" on storage.objects
  for update to authenticated using (bucket_id = 'proj-evidencias');

drop policy if exists "proj_evidencias_objects_delete" on storage.objects;
create policy "proj_evidencias_objects_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'proj-evidencias');
