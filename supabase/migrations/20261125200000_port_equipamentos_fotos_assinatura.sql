-- Controle de Entrada de Equipamentos e Ferramentas de Terceiros (FRM.SGP-0011):
-- fotos comprimidas dos materiais no Storage (bucket privado `port-equipamentos`)
-- e assinatura digital do responsavel na entrada (PNG em data URL).

alter table public.port_controle_equipamentos
  add column if not exists fotos jsonb not null default '[]'::jsonb,
  add column if not exists assinatura_responsavel text,
  add column if not exists assinatura_responsavel_em timestamptz;

comment on column public.port_controle_equipamentos.fotos is
  'Fotos dos materiais/ferramentas na entrada no bucket port-equipamentos: [{id,path,name,size,mime_type,created_at}]';
comment on column public.port_controle_equipamentos.assinatura_responsavel is
  'Assinatura digital do responsavel pela entrada (PNG em data URL). Opcional.';
comment on column public.port_controle_equipamentos.assinatura_responsavel_em is
  'Data/hora em que a assinatura do responsavel foi coletada.';

insert into storage.buckets (id, name, public)
values ('port-equipamentos', 'port-equipamentos', false)
on conflict (id) do nothing;

drop policy if exists "port_equipamentos_objects_insert" on storage.objects;
create policy "port_equipamentos_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'port-equipamentos');

drop policy if exists "port_equipamentos_objects_read" on storage.objects;
create policy "port_equipamentos_objects_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'port-equipamentos');

-- So quem subiu apaga a propria foto (limpeza em falha ou remocao).
drop policy if exists "port_equipamentos_objects_delete" on storage.objects;
create policy "port_equipamentos_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'port-equipamentos' and owner_id = (auth.uid())::text);
