create table public.qua_internos_mecanicos_checklists (
  id uuid primary key default gen_random_uuid(),
  codigo_registro text not null unique,
  modelo_id text not null,
  modelo_nome text not null,
  versao_formulario text not null default 'FRM.ENG-0240 Rev.02',
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'FINALIZADO')),
  projeto text not null,
  tramo text not null,
  sequencial text not null,
  responsavel_producao text,
  responsavel_qualidade text,
  instrumentos_utilizados text,
  respostas jsonb not null default '{}'::jsonb,
  validacoes jsonb not null default '{}'::jsonb,
  observacao_final text,
  aprovacao_final_qualidade boolean not null default false,
  criado_por text default (auth.uid())::text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text
);

create table public.qua_internos_mecanicos_fotos (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.qua_internos_mecanicos_checklists(id) on delete cascade,
  item_chave text not null,
  path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  criado_por text default (auth.uid())::text,
  created_at timestamptz not null default now()
);

create table public.qua_internos_mecanicos_assinaturas (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.qua_internos_mecanicos_checklists(id) on delete cascade,
  papel text not null check (papel in ('PRODUCAO', 'QUALIDADE')),
  nome text not null,
  setor text,
  data_assinatura date,
  tipo text not null check (tipo in ('DESENHO', 'SELFIE')),
  path text not null,
  mime_type text not null,
  criado_por text default (auth.uid())::text,
  created_at timestamptz not null default now(),
  unique (checklist_id, papel)
);

create table public.qua_internos_mecanicos_cabecalho_opcoes (
  id uuid primary key default gen_random_uuid(),
  campo text not null check (campo in ('projeto', 'tramo', 'sequencial', 'responsavel_producao', 'responsavel_qualidade', 'instrumentos_utilizados')),
  valor text not null,
  uso_count integer not null default 1,
  ultimo_uso_em timestamptz not null default now(),
  criado_por text default (auth.uid())::text,
  unique (campo, valor)
);

create table public.qua_internos_mecanicos_ilustracoes (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null unique,
  path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  sincronizado_em timestamptz not null default now(),
  criado_por text default (auth.uid())::text
);

create index idx_qua_internos_mecanicos_data on public.qua_internos_mecanicos_checklists (created_at desc);
create index idx_qua_internos_mecanicos_modelo on public.qua_internos_mecanicos_checklists (modelo_id, created_at desc);
create index idx_qua_internos_mecanicos_fotos_parent on public.qua_internos_mecanicos_fotos (checklist_id, item_chave);
create index idx_qua_internos_mecanicos_assinaturas_parent on public.qua_internos_mecanicos_assinaturas (checklist_id);
create index idx_qua_internos_mecanicos_opcoes_campo on public.qua_internos_mecanicos_cabecalho_opcoes (campo, ultimo_uso_em desc);

grant select, insert, update, delete on public.qua_internos_mecanicos_checklists to authenticated, service_role;
grant select, insert, update, delete on public.qua_internos_mecanicos_fotos to authenticated, service_role;
grant select, insert, update, delete on public.qua_internos_mecanicos_assinaturas to authenticated, service_role;
grant select, insert, update on public.qua_internos_mecanicos_cabecalho_opcoes to authenticated, service_role;
grant select, insert, update, delete on public.qua_internos_mecanicos_ilustracoes to authenticated, service_role;

alter table public.qua_internos_mecanicos_checklists enable row level security;
alter table public.qua_internos_mecanicos_fotos enable row level security;
alter table public.qua_internos_mecanicos_assinaturas enable row level security;
alter table public.qua_internos_mecanicos_cabecalho_opcoes enable row level security;
alter table public.qua_internos_mecanicos_ilustracoes enable row level security;

create policy qua_internos_mecanicos_checklists_select on public.qua_internos_mecanicos_checklists
  for select to authenticated using (public.form_pode_editar(criado_por));
create policy qua_internos_mecanicos_checklists_insert on public.qua_internos_mecanicos_checklists
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
create policy qua_internos_mecanicos_checklists_update on public.qua_internos_mecanicos_checklists
  for update to authenticated using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));
create policy qua_internos_mecanicos_checklists_delete on public.qua_internos_mecanicos_checklists
  for delete to authenticated using (public.form_pode_editar(criado_por));

create policy qua_internos_mecanicos_fotos_select on public.qua_internos_mecanicos_fotos
  for select to authenticated
  using (exists (
    select 1 from public.qua_internos_mecanicos_checklists checklist
    where checklist.id = checklist_id and public.form_pode_editar(checklist.criado_por)
  ));
create policy qua_internos_mecanicos_fotos_insert on public.qua_internos_mecanicos_fotos
  for insert to authenticated
  with check (public.form_pode_editar((select c.criado_por from public.qua_internos_mecanicos_checklists c where c.id = checklist_id)));
create policy qua_internos_mecanicos_fotos_delete on public.qua_internos_mecanicos_fotos
  for delete to authenticated
  using (public.form_pode_editar((select c.criado_por from public.qua_internos_mecanicos_checklists c where c.id = checklist_id)));

create policy qua_internos_mecanicos_assinaturas_select on public.qua_internos_mecanicos_assinaturas
  for select to authenticated
  using (exists (
    select 1 from public.qua_internos_mecanicos_checklists checklist
    where checklist.id = checklist_id and public.form_pode_editar(checklist.criado_por)
  ));
create policy qua_internos_mecanicos_assinaturas_insert on public.qua_internos_mecanicos_assinaturas
  for insert to authenticated
  with check (public.form_pode_editar((select c.criado_por from public.qua_internos_mecanicos_checklists c where c.id = checklist_id)));
create policy qua_internos_mecanicos_assinaturas_delete on public.qua_internos_mecanicos_assinaturas
  for delete to authenticated
  using (public.form_pode_editar((select c.criado_por from public.qua_internos_mecanicos_checklists c where c.id = checklist_id)));

create policy qua_internos_mecanicos_opcoes_select on public.qua_internos_mecanicos_cabecalho_opcoes
  for select to authenticated using (public.form_pode_editar(criado_por));
create policy qua_internos_mecanicos_opcoes_insert on public.qua_internos_mecanicos_cabecalho_opcoes
  for insert to authenticated
  with check (criado_por is null or criado_por = (select auth.uid())::text or public.has_role('admin'));
create policy qua_internos_mecanicos_opcoes_update on public.qua_internos_mecanicos_cabecalho_opcoes
  for update to authenticated using (public.form_pode_editar(criado_por))
  with check (public.form_pode_editar(criado_por));

create policy qua_internos_mecanicos_ilustracoes_select on public.qua_internos_mecanicos_ilustracoes
  for select to authenticated using (public.has_role('admin'));
create policy qua_internos_mecanicos_ilustracoes_write on public.qua_internos_mecanicos_ilustracoes
  for all to authenticated using (public.has_role('admin'))
  with check (public.has_role('admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qua-internos-mecanicos',
  'qua-internos-mecanicos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy qua_internos_mecanicos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'qua-internos-mecanicos'
    and (
      ((storage.foldername(name))[1] = 'ilustracoes' and public.has_role('admin'))
      or exists (
        select 1 from public.qua_internos_mecanicos_checklists checklist
        where checklist.id::text = (storage.foldername(name))[1]
          and public.form_pode_editar(checklist.criado_por)
      )
    )
  );
create policy qua_internos_mecanicos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'qua-internos-mecanicos'
    and (
      ((storage.foldername(name))[1] = 'ilustracoes' and public.has_role('admin'))
      or exists (
        select 1 from public.qua_internos_mecanicos_checklists checklist
        where checklist.id::text = (storage.foldername(name))[1]
          and public.form_pode_editar(checklist.criado_por)
      )
    )
  );
create policy qua_internos_mecanicos_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'qua-internos-mecanicos'
    and exists (
      select 1 from public.qua_internos_mecanicos_checklists checklist
      where checklist.id::text = (storage.foldername(name))[1]
        and public.form_pode_editar(checklist.criado_por)
    )
  )
  with check (
    bucket_id = 'qua-internos-mecanicos'
    and exists (
      select 1 from public.qua_internos_mecanicos_checklists checklist
      where checklist.id::text = (storage.foldername(name))[1]
        and public.form_pode_editar(checklist.criado_por)
    )
  );
create policy qua_internos_mecanicos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'qua-internos-mecanicos'
    and (
      ((storage.foldername(name))[1] = 'ilustracoes' and public.has_role('admin'))
      or exists (
        select 1 from public.qua_internos_mecanicos_checklists checklist
        where checklist.id::text = (storage.foldername(name))[1]
          and public.form_pode_editar(checklist.criado_por)
      )
    )
  );
