-- =====================================================================
-- SSMA — Book de EPIs
-- Cada variante SAP/CA é um item próprio. A tela agrupa por `grupo_epi`,
-- mas nunca mistura tamanhos, códigos SAP ou certificados distintos.
-- =====================================================================

create table if not exists public.ssma_book_epis (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  grupo_epi text not null,
  descricao_epi text not null,
  indicacao text,
  ca text not null default '',
  validade text,
  fabricante text,
  tamanho text,
  codigo_sap text,
  descricao_sap text,
  chave_importacao text generated always as (
    coalesce(nullif(trim(codigo_sap), ''), 'SEM_SAP') || '|' || lower(trim(coalesce(ca, '')))
  ) stored,
  imagem_path text,
  imagem_nome text,
  imagem_mime text,
  imagem_tamanho integer,
  ativo boolean not null default true,
  -- Para alterações pela tela, armazena o auth.uid(); a carga inicial
  -- controlada é identificada explicitamente como IMPORTAÇÃO SISTEN.
  criado_por text not null default coalesce((auth.uid())::text, 'IMPORTAÇÃO SISTEN'),
  atualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chave_importacao)
);

create index if not exists ssma_book_epis_grupo_idx on public.ssma_book_epis (categoria, grupo_epi);
create index if not exists ssma_book_epis_codigo_sap_idx on public.ssma_book_epis (codigo_sap) where codigo_sap is not null;
create index if not exists ssma_book_epis_ativo_idx on public.ssma_book_epis (ativo) where ativo;

create table if not exists public.ssma_book_epis_historico (
  id bigint generated always as identity primary key,
  epi_id uuid not null references public.ssma_book_epis(id) on delete restrict,
  operacao text not null check (operacao in ('CRIACAO', 'ALTERACAO')),
  valores_anteriores jsonb,
  valores_novos jsonb not null,
  alterado_por text not null default coalesce((auth.uid())::text, 'IMPORTAÇÃO SISTEN'),
  alterado_em timestamptz not null default now()
);

create index if not exists ssma_book_epis_historico_epi_idx on public.ssma_book_epis_historico (epi_id, alterado_em desc);

-- A página SSMA usa as permissões de Formulários no perfil. Centralizar a
-- checagem aqui evita que um JWT autenticado, mas sem acesso ao módulo, leia
-- ou edite o Book diretamente pela Data API/Storage.
create or replace function public.ssma_book_epis_pode_acessar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.core_perfis perfil
     where perfil.id = auth.uid()::text
       and perfil.status = 'ativo'
       and coalesce((perfil.page_access ->> 'formularios')::boolean, true)
       and coalesce((perfil.page_access ->> 'form_ssma')::boolean, true)
  );
$$;

revoke all on function public.ssma_book_epis_pode_acessar() from public, anon;
grant execute on function public.ssma_book_epis_pode_acessar() to authenticated;

create or replace function public.ssma_book_epis_preparar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.criado_por := coalesce(new.criado_por, (auth.uid())::text, 'IMPORTAÇÃO SISTEN');
  new.atualizado_por := coalesce((auth.uid())::text, 'IMPORTAÇÃO SISTEN');
  new.updated_at := now();

  return new;
end;
$$;

create or replace function public.ssma_book_epis_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.ssma_book_epis_historico (
    epi_id, operacao, valores_anteriores, valores_novos, alterado_por
  ) values (
    new.id,
    case when tg_op = 'INSERT' then 'CRIACAO' else 'ALTERACAO' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    coalesce((auth.uid())::text, 'IMPORTAÇÃO SISTEN')
  );

  return new;
end;
$$;

revoke all on function public.ssma_book_epis_preparar() from public, anon, authenticated;
revoke all on function public.ssma_book_epis_auditar() from public, anon, authenticated;

drop trigger if exists ssma_book_epis_preparo on public.ssma_book_epis;
create trigger ssma_book_epis_preparo
before insert or update on public.ssma_book_epis
for each row execute function public.ssma_book_epis_preparar();

drop trigger if exists ssma_book_epis_auditoria on public.ssma_book_epis;
create trigger ssma_book_epis_auditoria
after insert or update on public.ssma_book_epis
for each row execute function public.ssma_book_epis_auditar();

revoke all on table public.ssma_book_epis from anon, authenticated;
grant select, insert, update on table public.ssma_book_epis to authenticated;
revoke all on table public.ssma_book_epis_historico from anon, authenticated;
grant select on table public.ssma_book_epis_historico to authenticated;

alter table public.ssma_book_epis enable row level security;
alter table public.ssma_book_epis_historico enable row level security;

drop policy if exists ssma_book_epis_select on public.ssma_book_epis;
create policy ssma_book_epis_select on public.ssma_book_epis
  for select to authenticated using ((select public.ssma_book_epis_pode_acessar()));

drop policy if exists ssma_book_epis_insert on public.ssma_book_epis;
create policy ssma_book_epis_insert on public.ssma_book_epis
  for insert to authenticated
  with check (
    (select public.ssma_book_epis_pode_acessar())
    and criado_por = (select auth.uid())::text
  );

-- O Book é uma tabela mestre compartilhada: qualquer usuário do SSMA pode
-- corrigir o cadastro. O trigger torna a alteração rastreável no banco.
drop policy if exists ssma_book_epis_update on public.ssma_book_epis;
create policy ssma_book_epis_update on public.ssma_book_epis
  for update to authenticated
  using ((select public.ssma_book_epis_pode_acessar()))
  with check ((select public.ssma_book_epis_pode_acessar()));

drop policy if exists ssma_book_epis_historico_select on public.ssma_book_epis_historico;
create policy ssma_book_epis_historico_select on public.ssma_book_epis_historico
  for select to authenticated using ((select public.ssma_book_epis_pode_acessar()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ssma-book-epis', 'ssma-book-epis', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

drop policy if exists "ssma_book_epis_objects_read" on storage.objects;
create policy "ssma_book_epis_objects_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'ssma-book-epis' and (select public.ssma_book_epis_pode_acessar()));

drop policy if exists "ssma_book_epis_objects_insert" on storage.objects;
create policy "ssma_book_epis_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ssma-book-epis' and (select public.ssma_book_epis_pode_acessar()));

drop policy if exists "ssma_book_epis_objects_update" on storage.objects;
create policy "ssma_book_epis_objects_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'ssma-book-epis' and (select public.ssma_book_epis_pode_acessar()))
  with check (bucket_id = 'ssma-book-epis' and (select public.ssma_book_epis_pode_acessar()));

drop policy if exists "ssma_book_epis_objects_delete" on storage.objects;
create policy "ssma_book_epis_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ssma-book-epis' and (select public.ssma_book_epis_pode_acessar()));

notify pgrst, 'reload schema';
