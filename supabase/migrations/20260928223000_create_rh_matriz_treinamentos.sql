-- Matriz de treinamentos: catálogo, requisitos por função e situação por colaborador.
-- O calendário de turmas existente (rh_treinamentos) permanece independente.

create table if not exists public.rh_treinamentos_catalogo (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chave text not null unique,
  conteudo text,
  analise_eficacia boolean not null default false,
  carga_horaria numeric(8,2),
  validade_meses integer check (validade_meses is null or validade_meses > 0),
  ativo boolean not null default true,
  criado_por text references public.core_perfis(id),
  atualizado_por text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id)
);

create table if not exists public.rh_treinamentos_por_funcao (
  id uuid primary key default gen_random_uuid(),
  cargo text not null,
  cargo_chave text not null,
  treinamento_id uuid not null references public.rh_treinamentos_catalogo(id),
  obrigatorio boolean not null default true,
  criado_por text references public.core_perfis(id),
  atualizado_por text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id),
  unique (cargo_chave, treinamento_id)
);

create table if not exists public.rh_pessoas_treinamentos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.rh_pessoas(id),
  treinamento_id uuid not null references public.rh_treinamentos_catalogo(id),
  status text not null default 'pendente'
    check (status in ('pendente', 'apto', 'vencido', 'nao_aplicavel')),
  data_capacitacao date,
  validade_em date,
  atestado_em timestamptz,
  atestado_por text references public.core_perfis(id),
  observacao text,
  origem text not null default 'manual'
    check (origem in ('manual', 'importacao_matriz')),
  criado_por text references public.core_perfis(id),
  atualizado_por text references public.core_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id),
  unique (pessoa_id, treinamento_id)
);

create table if not exists public.rh_pessoas_treinamentos_auditoria (
  id bigint generated always as identity primary key,
  pessoa_treinamento_id uuid not null,
  acao text not null check (acao in ('inserido', 'atualizado', 'excluido', 'restaurado')),
  dados_anteriores jsonb,
  dados_novos jsonb not null,
  alterado_por text references public.core_perfis(id),
  created_at timestamptz not null default now()
);

create index if not exists rh_treinamentos_catalogo_ativo_idx
  on public.rh_treinamentos_catalogo (ativo, nome)
  where excluido_em is null;
create index if not exists rh_treinamentos_por_funcao_cargo_idx
  on public.rh_treinamentos_por_funcao (cargo_chave)
  where excluido_em is null;
create index if not exists rh_pessoas_treinamentos_pessoa_idx
  on public.rh_pessoas_treinamentos (pessoa_id)
  where excluido_em is null;
create index if not exists rh_pessoas_treinamentos_validade_idx
  on public.rh_pessoas_treinamentos (validade_em)
  where excluido_em is null and validade_em is not null;

alter table public.rh_treinamentos_catalogo enable row level security;
alter table public.rh_treinamentos_por_funcao enable row level security;
alter table public.rh_pessoas_treinamentos enable row level security;
alter table public.rh_pessoas_treinamentos_auditoria enable row level security;

drop policy if exists rh_treinamentos_catalogo_select on public.rh_treinamentos_catalogo;
create policy rh_treinamentos_catalogo_select on public.rh_treinamentos_catalogo
  for select to authenticated using (public.pode_gerir_rh('rh_matriz_treinamentos'));
drop policy if exists rh_treinamentos_catalogo_write on public.rh_treinamentos_catalogo;
create policy rh_treinamentos_catalogo_write on public.rh_treinamentos_catalogo
  for all to authenticated
  using (public.pode_gerir_rh('rh_matriz_treinamentos'))
  with check (public.pode_gerir_rh('rh_matriz_treinamentos'));

drop policy if exists rh_treinamentos_por_funcao_select on public.rh_treinamentos_por_funcao;
create policy rh_treinamentos_por_funcao_select on public.rh_treinamentos_por_funcao
  for select to authenticated using (public.pode_gerir_rh('rh_matriz_treinamentos'));
drop policy if exists rh_treinamentos_por_funcao_write on public.rh_treinamentos_por_funcao;
create policy rh_treinamentos_por_funcao_write on public.rh_treinamentos_por_funcao
  for all to authenticated
  using (public.pode_gerir_rh('rh_matriz_treinamentos'))
  with check (public.pode_gerir_rh('rh_matriz_treinamentos'));

drop policy if exists rh_pessoas_treinamentos_select on public.rh_pessoas_treinamentos;
create policy rh_pessoas_treinamentos_select on public.rh_pessoas_treinamentos
  for select to authenticated using (public.pode_gerir_rh('rh_matriz_treinamentos'));
drop policy if exists rh_pessoas_treinamentos_write on public.rh_pessoas_treinamentos;
create policy rh_pessoas_treinamentos_write on public.rh_pessoas_treinamentos
  for all to authenticated
  using (public.pode_gerir_rh('rh_matriz_treinamentos'))
  with check (public.pode_gerir_rh('rh_matriz_treinamentos'));

drop policy if exists rh_pessoas_treinamentos_auditoria_select on public.rh_pessoas_treinamentos_auditoria;
create policy rh_pessoas_treinamentos_auditoria_select on public.rh_pessoas_treinamentos_auditoria
  for select to authenticated using (public.pode_gerir_rh('rh_matriz_treinamentos'));

grant select, insert, update, delete on public.rh_treinamentos_catalogo, public.rh_treinamentos_por_funcao, public.rh_pessoas_treinamentos to authenticated;
grant select on public.rh_pessoas_treinamentos_auditoria to authenticated;
grant all on public.rh_treinamentos_catalogo, public.rh_treinamentos_por_funcao, public.rh_pessoas_treinamentos, public.rh_pessoas_treinamentos_auditoria to service_role;

create or replace function public.auditar_rh_pessoas_treinamentos()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.rh_pessoas_treinamentos_auditoria (pessoa_treinamento_id, acao, dados_novos, alterado_por)
    values (new.id, 'inserido', to_jsonb(new), coalesce(new.atualizado_por, new.criado_por, (select auth.uid())::text));
  elsif tg_op = 'UPDATE' and old is distinct from new then
    insert into public.rh_pessoas_treinamentos_auditoria (pessoa_treinamento_id, acao, dados_anteriores, dados_novos, alterado_por)
    values (
      new.id,
      case when old.excluido_em is null and new.excluido_em is not null then 'excluido'
           when old.excluido_em is not null and new.excluido_em is null then 'restaurado'
           else 'atualizado' end,
      to_jsonb(old), to_jsonb(new), coalesce(new.atualizado_por, (select auth.uid())::text)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auditar_rh_pessoas_treinamentos on public.rh_pessoas_treinamentos;
create trigger trg_auditar_rh_pessoas_treinamentos
after insert or update on public.rh_pessoas_treinamentos
for each row execute function public.auditar_rh_pessoas_treinamentos();

create or replace view public.vw_rh_treinamentos_vencimentos
with (security_invoker = true)
as
select
  registro.id,
  pessoa.id as pessoa_id,
  pessoa.registro,
  pessoa.nome as colaborador,
  pessoa.cargo,
  pessoa.area,
  pessoa.lideranca,
  catalogo.id as treinamento_id,
  catalogo.nome as treinamento,
  registro.status,
  registro.data_capacitacao,
  registro.validade_em,
  case
    when registro.status = 'nao_aplicavel' then 'nao_aplicavel'
    when registro.status = 'vencido' or registro.validade_em < current_date then 'vencido'
    when registro.validade_em <= current_date + 30 then 'proximo_vencimento'
    else registro.status
  end as status_calculado,
  case when registro.validade_em is null then null else registro.validade_em - current_date end as dias_para_vencimento
from public.rh_pessoas_treinamentos registro
join public.rh_pessoas pessoa on pessoa.id = registro.pessoa_id and pessoa.ativo
join public.rh_treinamentos_catalogo catalogo on catalogo.id = registro.treinamento_id
where registro.excluido_em is null
  and catalogo.excluido_em is null
  and catalogo.ativo;

grant select on public.vw_rh_treinamentos_vencimentos to authenticated, service_role;
