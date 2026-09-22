-- Cadastro SSMA: EPI requerido por função.
-- A referência aponta para uma variante do Book; a futura ficha pode oferecer
-- todas as variantes do mesmo grupo (por exemplo, os tamanhos de uma botina).

create table public.ssma_epi_funcoes (
  id uuid primary key default gen_random_uuid(),
  codigo_origem text not null unique,
  nome text not null,
  ativo boolean not null default true,
  criado_por text not null default coalesce((auth.uid())::text, 'IMPORTACAO SISTEN'),
  atualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ssma_epi_por_funcao (
  id uuid primary key default gen_random_uuid(),
  funcao_id uuid not null references public.ssma_epi_funcoes(id) on delete restrict,
  -- Pode permanecer nulo somente quando a planilha trouxer um EPI ainda não
  -- cadastrado no Book; a tela destaca o vínculo pendente para correção.
  epi_book_id uuid references public.ssma_book_epis(id) on delete restrict,
  codigo_vinculo_origem text,
  codigo_epi_origem text not null,
  descricao_epi_origem text not null,
  ca_origem text,
  classificacao text not null check (classificacao in (
    'BASICO_OBRIGATORIO', 'ESPECIFICO_OBRIGATORIO', 'CONDICIONAL_POR_EXPOSICAO'
  )),
  condicao_uso text,
  ativo boolean not null default true,
  criado_por text not null default coalesce((auth.uid())::text, 'IMPORTACAO SISTEN'),
  atualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funcao_id, codigo_epi_origem),
  unique (codigo_vinculo_origem)
);

create index ssma_epi_por_funcao_funcao_idx on public.ssma_epi_por_funcao(funcao_id) where ativo;
create index ssma_epi_por_funcao_book_idx on public.ssma_epi_por_funcao(epi_book_id) where epi_book_id is not null;

create table public.ssma_epi_funcoes_historico (
  id bigint generated always as identity primary key,
  funcao_id uuid not null references public.ssma_epi_funcoes(id) on delete restrict,
  operacao text not null check (operacao in ('CRIACAO', 'ALTERACAO')),
  valores_anteriores jsonb,
  valores_novos jsonb not null,
  alterado_por text not null default coalesce((auth.uid())::text, 'IMPORTACAO SISTEN'),
  alterado_em timestamptz not null default now()
);

create table public.ssma_epi_por_funcao_historico (
  id bigint generated always as identity primary key,
  requisito_id uuid not null references public.ssma_epi_por_funcao(id) on delete restrict,
  operacao text not null check (operacao in ('CRIACAO', 'ALTERACAO')),
  valores_anteriores jsonb,
  valores_novos jsonb not null,
  alterado_por text not null default coalesce((auth.uid())::text, 'IMPORTACAO SISTEN'),
  alterado_em timestamptz not null default now()
);

create index ssma_epi_funcoes_historico_funcao_idx on public.ssma_epi_funcoes_historico(funcao_id, alterado_em desc);
create index ssma_epi_por_funcao_historico_requisito_idx on public.ssma_epi_por_funcao_historico(requisito_id, alterado_em desc);

create or replace function public.ssma_epi_por_funcao_preparar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.criado_por := coalesce(new.criado_por, (auth.uid())::text, 'IMPORTACAO SISTEN');
  new.atualizado_por := coalesce((auth.uid())::text, 'IMPORTACAO SISTEN');
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ssma_epi_funcoes_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ssma_epi_funcoes_historico (
    funcao_id, operacao, valores_anteriores, valores_novos, alterado_por
  ) values (
    new.id,
    case when tg_op = 'INSERT' then 'CRIACAO' else 'ALTERACAO' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    coalesce((auth.uid())::text, 'IMPORTACAO SISTEN')
  );
  return new;
end;
$$;

create or replace function public.ssma_epi_por_funcao_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ssma_epi_por_funcao_historico (
    requisito_id, operacao, valores_anteriores, valores_novos, alterado_por
  ) values (
    new.id,
    case when tg_op = 'INSERT' then 'CRIACAO' else 'ALTERACAO' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    coalesce((auth.uid())::text, 'IMPORTACAO SISTEN')
  );
  return new;
end;
$$;

revoke all on function public.ssma_epi_por_funcao_preparar() from public, anon, authenticated;
revoke all on function public.ssma_epi_funcoes_auditar() from public, anon, authenticated;
revoke all on function public.ssma_epi_por_funcao_auditar() from public, anon, authenticated;

create trigger ssma_epi_funcoes_preparo before insert or update on public.ssma_epi_funcoes
for each row execute function public.ssma_epi_por_funcao_preparar();
create trigger ssma_epi_funcoes_auditoria after insert or update on public.ssma_epi_funcoes
for each row execute function public.ssma_epi_funcoes_auditar();
create trigger ssma_epi_por_funcao_preparo before insert or update on public.ssma_epi_por_funcao
for each row execute function public.ssma_epi_por_funcao_preparar();
create trigger ssma_epi_por_funcao_auditoria after insert or update on public.ssma_epi_por_funcao
for each row execute function public.ssma_epi_por_funcao_auditar();

revoke all on table public.ssma_epi_funcoes, public.ssma_epi_por_funcao from anon, authenticated;
grant select, insert, update on table public.ssma_epi_funcoes, public.ssma_epi_por_funcao to authenticated;
revoke all on table public.ssma_epi_funcoes_historico, public.ssma_epi_por_funcao_historico from anon, authenticated;
grant select on table public.ssma_epi_funcoes_historico, public.ssma_epi_por_funcao_historico to authenticated;

alter table public.ssma_epi_funcoes enable row level security;
alter table public.ssma_epi_por_funcao enable row level security;
alter table public.ssma_epi_funcoes_historico enable row level security;
alter table public.ssma_epi_por_funcao_historico enable row level security;

create policy ssma_epi_funcoes_select on public.ssma_epi_funcoes for select to authenticated
using ((select public.ssma_book_epis_pode_acessar()));
create policy ssma_epi_funcoes_insert on public.ssma_epi_funcoes for insert to authenticated
with check ((select public.ssma_book_epis_pode_acessar()) and criado_por = (select auth.uid())::text);
create policy ssma_epi_funcoes_update on public.ssma_epi_funcoes for update to authenticated
using ((select public.ssma_book_epis_pode_acessar())) with check ((select public.ssma_book_epis_pode_acessar()));

create policy ssma_epi_por_funcao_select on public.ssma_epi_por_funcao for select to authenticated
using ((select public.ssma_book_epis_pode_acessar()));
create policy ssma_epi_por_funcao_insert on public.ssma_epi_por_funcao for insert to authenticated
with check ((select public.ssma_book_epis_pode_acessar()) and criado_por = (select auth.uid())::text);
create policy ssma_epi_por_funcao_update on public.ssma_epi_por_funcao for update to authenticated
using ((select public.ssma_book_epis_pode_acessar())) with check ((select public.ssma_book_epis_pode_acessar()));

create policy ssma_epi_funcoes_historico_select on public.ssma_epi_funcoes_historico for select to authenticated
using ((select public.ssma_book_epis_pode_acessar()));
create policy ssma_epi_por_funcao_historico_select on public.ssma_epi_por_funcao_historico for select to authenticated
using ((select public.ssma_book_epis_pode_acessar()));

notify pgrst, 'reload schema';
