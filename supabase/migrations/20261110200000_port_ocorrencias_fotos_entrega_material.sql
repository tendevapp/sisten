-- Relatório de Ocorrências (FRM.SGP-0010): fotos no Storage e entrega de material.
--
-- Até aqui a foto do lançamento era gravada em base64 dentro de `foto_url`
-- (uma só, e a lista dos livros nem a trazia — por isso não aparecia). Agora:
--   fotos      jsonb  fotos do registro, em qualquer tipo de lançamento;
--   fotos_nf   jsonb  fotos das notas fiscais (entrada com entrega de material);
--   entrega_material / nf_verificada  marcação da portaria na entrada.
-- Cada foto: { id, path, name, size, mime_type, created_at } no bucket
-- privado `port-ocorrencias`, comprimida no cliente (comprimirImagemUpload).
--
-- `foto_url` antigo (4 lançamentos em 10/11/2026) continua lido como foto
-- legada; `tem_foto_legado` deixa a lista saber que existe sem baixar o base64.

alter table public.port_relatorio_ocorrencias
  add column if not exists fotos jsonb not null default '[]'::jsonb,
  add column if not exists fotos_nf jsonb not null default '[]'::jsonb,
  add column if not exists entrega_material boolean not null default false,
  add column if not exists nf_verificada boolean not null default false,
  add column if not exists tem_foto_legado boolean generated always as (foto_url is not null) stored;

comment on column public.port_relatorio_ocorrencias.fotos is 'Fotos do lançamento no bucket port-ocorrencias: [{id,path,name,size,mime_type,created_at}]';
comment on column public.port_relatorio_ocorrencias.fotos_nf is 'Fotos das notas fiscais (entrada com entrega de material), mesmo formato de fotos';
comment on column public.port_relatorio_ocorrencias.entrega_material is 'Entrada com entrega de material (exige NF verificada e foto da NF na tela)';
comment on column public.port_relatorio_ocorrencias.foto_url is 'LEGADO: foto em base64 (até 10/11/2026). Novas fotos vão em fotos/fotos_nf.';

insert into storage.buckets (id, name, public)
values ('port-ocorrencias', 'port-ocorrencias', false)
on conflict (id) do nothing;

drop policy if exists "port_ocorrencias_objects_insert" on storage.objects;
create policy "port_ocorrencias_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'port-ocorrencias');

drop policy if exists "port_ocorrencias_objects_read" on storage.objects;
create policy "port_ocorrencias_objects_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'port-ocorrencias');

-- Só quem subiu apaga a própria foto (ao removê-la na edição do lançamento).
drop policy if exists "port_ocorrencias_objects_delete" on storage.objects;
create policy "port_ocorrencias_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'port-ocorrencias' and owner_id = (auth.uid())::text);
