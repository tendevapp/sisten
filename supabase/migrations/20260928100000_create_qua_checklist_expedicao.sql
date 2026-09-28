create table if not exists public.qua_checklist_expedicoes (
  id uuid primary key default gen_random_uuid(),
  codigo_registro text not null unique,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'FINALIZADO')),
  cliente text not null,
  projeto text not null,
  tramo_sequencial text not null,
  numero_serie text not null,
  data_expedicao date not null,
  site text not null,
  inspetor_qualidade text not null,
  etiqueta_secao text not null,
  respostas jsonb not null default '{}'::jsonb,
  observacoes jsonb not null default '{}'::jsonb,
  validacao_nomes jsonb not null default '{}'::jsonb,
  criado_por text default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text
);

create table if not exists public.qua_checklist_expedicao_fotos (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.qua_checklist_expedicoes(id) on delete cascade,
  item_chave text not null,
  path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  criado_por text default (auth.uid())::text,
  created_at timestamptz not null default now()
);

create table if not exists public.qua_checklist_expedicao_assinaturas (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.qua_checklist_expedicoes(id) on delete cascade,
  papel text not null check (papel in ('QUALIDADE', 'PRODUCAO', 'CLIENTE', 'TRANSPORTADOR')),
  nome text not null,
  tipo text not null check (tipo in ('DESENHO', 'SELFIE')),
  path text not null,
  mime_type text not null,
  criado_por text default (auth.uid())::text,
  created_at timestamptz not null default now(),
  unique (checklist_id, papel)
);

create table if not exists public.qua_checklist_cabecalho_opcoes (
  id uuid primary key default gen_random_uuid(),
  campo text not null check (campo in ('cliente', 'projeto', 'tramo_sequencial', 'numero_serie', 'site', 'inspetor_qualidade', 'etiqueta_secao')),
  valor text not null,
  uso_count integer not null default 1,
  ultimo_uso_em timestamptz not null default now(),
  criado_por text default (auth.uid())::text,
  unique (campo, valor)
);

create index if not exists idx_qua_checklist_expedicao_data on public.qua_checklist_expedicoes (data_expedicao desc);
create index if not exists idx_qua_checklist_expedicao_status on public.qua_checklist_expedicoes (status);
create index if not exists idx_qua_checklist_expedicao_fotos_parent on public.qua_checklist_expedicao_fotos (checklist_id, item_chave);
create index if not exists idx_qua_checklist_expedicao_assinaturas_parent on public.qua_checklist_expedicao_assinaturas (checklist_id);
create index if not exists idx_qua_checklist_cabecalho_opcoes_campo on public.qua_checklist_cabecalho_opcoes (campo, ultimo_uso_em desc);

grant select, insert, update, delete on public.qua_checklist_expedicoes to authenticated, service_role;
grant select, insert, update, delete on public.qua_checklist_expedicao_fotos to authenticated, service_role;
grant select, insert, update, delete on public.qua_checklist_expedicao_assinaturas to authenticated, service_role;
grant select, insert, update on public.qua_checklist_cabecalho_opcoes to authenticated, service_role;

alter table public.qua_checklist_expedicoes enable row level security;
alter table public.qua_checklist_expedicao_fotos enable row level security;
alter table public.qua_checklist_expedicao_assinaturas enable row level security;
alter table public.qua_checklist_cabecalho_opcoes enable row level security;

drop policy if exists qua_checklist_expedicoes_sel on public.qua_checklist_expedicoes;
create policy qua_checklist_expedicoes_sel on public.qua_checklist_expedicoes
  for select to authenticated using (true);
drop policy if exists qua_checklist_expedicoes_ins on public.qua_checklist_expedicoes;
create policy qua_checklist_expedicoes_ins on public.qua_checklist_expedicoes
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
drop policy if exists qua_checklist_expedicoes_upd on public.qua_checklist_expedicoes;
create policy qua_checklist_expedicoes_upd on public.qua_checklist_expedicoes
  for update to authenticated using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));
drop policy if exists qua_checklist_expedicoes_del on public.qua_checklist_expedicoes;
create policy qua_checklist_expedicoes_del on public.qua_checklist_expedicoes
  for delete to authenticated using (public.form_pode_editar(criado_por));

drop policy if exists qua_checklist_expedicao_fotos_sel on public.qua_checklist_expedicao_fotos;
create policy qua_checklist_expedicao_fotos_sel on public.qua_checklist_expedicao_fotos
  for select to authenticated using (true);
drop policy if exists qua_checklist_expedicao_fotos_ins on public.qua_checklist_expedicao_fotos;
create policy qua_checklist_expedicao_fotos_ins on public.qua_checklist_expedicao_fotos
  for insert to authenticated with check (public.form_pode_editar((select c.criado_por from public.qua_checklist_expedicoes c where c.id = checklist_id)));
drop policy if exists qua_checklist_expedicao_fotos_del on public.qua_checklist_expedicao_fotos;
create policy qua_checklist_expedicao_fotos_del on public.qua_checklist_expedicao_fotos
  for delete to authenticated using (public.form_pode_editar((select c.criado_por from public.qua_checklist_expedicoes c where c.id = checklist_id)));

drop policy if exists qua_checklist_expedicao_assinaturas_sel on public.qua_checklist_expedicao_assinaturas;
create policy qua_checklist_expedicao_assinaturas_sel on public.qua_checklist_expedicao_assinaturas
  for select to authenticated using (true);
drop policy if exists qua_checklist_expedicao_assinaturas_ins on public.qua_checklist_expedicao_assinaturas;
create policy qua_checklist_expedicao_assinaturas_ins on public.qua_checklist_expedicao_assinaturas
  for insert to authenticated with check (public.form_pode_editar((select c.criado_por from public.qua_checklist_expedicoes c where c.id = checklist_id)));
drop policy if exists qua_checklist_expedicao_assinaturas_del on public.qua_checklist_expedicao_assinaturas;
create policy qua_checklist_expedicao_assinaturas_del on public.qua_checklist_expedicao_assinaturas
  for delete to authenticated using (public.form_pode_editar((select c.criado_por from public.qua_checklist_expedicoes c where c.id = checklist_id)));

drop policy if exists qua_checklist_cabecalho_opcoes_sel on public.qua_checklist_cabecalho_opcoes;
create policy qua_checklist_cabecalho_opcoes_sel on public.qua_checklist_cabecalho_opcoes
  for select to authenticated using (true);
drop policy if exists qua_checklist_cabecalho_opcoes_ins on public.qua_checklist_cabecalho_opcoes;
create policy qua_checklist_cabecalho_opcoes_ins on public.qua_checklist_cabecalho_opcoes
  for insert to authenticated with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
drop policy if exists qua_checklist_cabecalho_opcoes_upd on public.qua_checklist_cabecalho_opcoes;
create policy qua_checklist_cabecalho_opcoes_upd on public.qua_checklist_cabecalho_opcoes
  for update to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qua-checklist-expedicao', 'qua-checklist-expedicao', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists qua_checklist_expedicao_storage_read on storage.objects;
create policy qua_checklist_expedicao_storage_read on storage.objects
  for select to authenticated using (bucket_id = 'qua-checklist-expedicao');
drop policy if exists qua_checklist_expedicao_storage_insert on storage.objects;
create policy qua_checklist_expedicao_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'qua-checklist-expedicao');
drop policy if exists qua_checklist_expedicao_storage_delete on storage.objects;
create policy qua_checklist_expedicao_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'qua-checklist-expedicao');
