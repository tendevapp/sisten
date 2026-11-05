-- Teste de Alcoolemia (Portaria/SSMA): fotos do teste (visor do etilômetro, termo etc.).
-- Lista em jsonb como no Kaizen: { id, path, name, size, mime_type, created_at }.
-- As fotos são comprimidas no cliente (comprimirImagemUpload) antes de subir.

alter table public.port_alcoolemia_testes
  add column if not exists fotos jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('port-alcoolemia', 'port-alcoolemia', false)
on conflict (id) do nothing;

drop policy if exists "port_alcoolemia_objects_insert" on storage.objects;
create policy "port_alcoolemia_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'port-alcoolemia');

drop policy if exists "port_alcoolemia_objects_read" on storage.objects;
create policy "port_alcoolemia_objects_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'port-alcoolemia');

-- Só quem subiu apaga a própria foto (ao removê-la na edição do teste).
drop policy if exists "port_alcoolemia_objects_delete" on storage.objects;
create policy "port_alcoolemia_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'port-alcoolemia' and owner_id = (auth.uid())::text);
