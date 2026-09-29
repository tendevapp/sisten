-- =====================================================================
-- ALMOXARIFADO — Catálogo e Cadastro de Itens com Fotos
-- Formulário operacional: FRM.ALM-0016
-- Permite registrar fotos e especificações técnicas de materiais
-- consumíveis da ZL0024 para exibição na Solicitação de Compras.
-- =====================================================================

create table if not exists public.alm_catalogo_itens (
  id uuid primary key default gen_random_uuid(),
  codigo_registro text not null,
  codigo_sap text not null,
  descricao text not null,
  texto_tecnico text,
  grp_mercad text,
  grupo_mercadorias text,
  classificacao_nivel1 text default 'CONSUMÍVEL',
  classificacao_nivel2 text,
  umb text,
  saldo_zl0024 numeric default 0,
  imagem_path text,
  imagem_nome text,
  imagem_mime text,
  imagem_tamanho integer,
  observacao text,
  ativo boolean not null default true,
  criado_por text not null default coalesce((auth.uid())::text, 'SISTEN'),
  criado_por_nome text,
  atualizado_por text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alm_catalogo_itens_codigo_sap_key unique (codigo_sap)
);

create index if not exists alm_catalogo_itens_sap_idx on public.alm_catalogo_itens (codigo_sap);
create index if not exists alm_catalogo_itens_grp_idx on public.alm_catalogo_itens (grp_mercad);
create index if not exists alm_catalogo_itens_nivel1_idx on public.alm_catalogo_itens (classificacao_nivel1);
create index if not exists alm_catalogo_itens_nivel2_idx on public.alm_catalogo_itens (classificacao_nivel2);
create index if not exists alm_catalogo_itens_ativo_idx on public.alm_catalogo_itens (ativo) where ativo;

-- Permissões na tabela
revoke all on table public.alm_catalogo_itens from anon;
grant select, insert, update, delete on table public.alm_catalogo_itens to authenticated;

alter table public.alm_catalogo_itens enable row level security;

-- Política de leitura: qualquer usuário autenticado pode consultar o catálogo (inclusive Compras)
drop policy if exists alm_catalogo_itens_select on public.alm_catalogo_itens;
create policy alm_catalogo_itens_select on public.alm_catalogo_itens
  for select to authenticated using (true);

-- Política de inserção: autenticado
drop policy if exists alm_catalogo_itens_insert on public.alm_catalogo_itens;
create policy alm_catalogo_itens_insert on public.alm_catalogo_itens
  for insert to authenticated with check (true);

-- Política de atualização: autenticado
drop policy if exists alm_catalogo_itens_update on public.alm_catalogo_itens;
create policy alm_catalogo_itens_update on public.alm_catalogo_itens
  for update to authenticated using (true) with check (true);

-- Política de exclusão: autenticado
drop policy if exists alm_catalogo_itens_delete on public.alm_catalogo_itens;
create policy alm_catalogo_itens_delete on public.alm_catalogo_itens
  for delete to authenticated using (true);

-- Bucket de fotos do catálogo caso deseje usar bucket dedicado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alm-catalogo', 'alm-catalogo', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

drop policy if exists "alm_catalogo_objects_read" on storage.objects;
create policy "alm_catalogo_objects_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'alm-catalogo');

drop policy if exists "alm_catalogo_objects_insert" on storage.objects;
create policy "alm_catalogo_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'alm-catalogo');

drop policy if exists "alm_catalogo_objects_update" on storage.objects;
create policy "alm_catalogo_objects_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'alm-catalogo')
  with check (bucket_id = 'alm-catalogo');

drop policy if exists "alm_catalogo_objects_delete" on storage.objects;
create policy "alm_catalogo_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'alm-catalogo');

notify pgrst, 'reload schema';
