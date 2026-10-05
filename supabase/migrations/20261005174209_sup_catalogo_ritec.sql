-- Catálogo de Ferramentas RITEC para consulta dos compradores.
-- A imagem não é duplicada: a tela a resolve no cadastro compartilhado do
-- Almoxarifado (`alm_catalogo_itens`) pelo mesmo código SAP.

create table if not exists public.sup_catalogo_ritec_itens (
  id uuid primary key default gen_random_uuid(),
  codigo_sap text not null,
  nivel_2_sap text,
  subcategoria text,
  aplicacao text,
  descricao_sap text not null,
  descricao_completa text,
  unidade text,
  ncm text,
  codigo_ritec text,
  codigo_ritec_opcao_preco text,
  referencia text,
  marca text,
  preco_cif_obra numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codigo_sap)
);

create index if not exists idx_sup_catalogo_ritec_nivel_2
  on public.sup_catalogo_ritec_itens (nivel_2_sap);
create index if not exists idx_sup_catalogo_ritec_subcategoria
  on public.sup_catalogo_ritec_itens (subcategoria);
create index if not exists idx_sup_catalogo_ritec_marca
  on public.sup_catalogo_ritec_itens (marca);
create index if not exists idx_sup_catalogo_ritec_codigo_ritec
  on public.sup_catalogo_ritec_itens (codigo_ritec);

create table if not exists public.sup_catalogo_ritec_importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo_nome text not null,
  quantidade_itens integer not null check (quantidade_itens > 0),
  importado_por text not null default (auth.uid())::text,
  imported_at timestamptz not null default now()
);

create or replace function public.sup_catalogo_ritec_atualizar_data()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sup_catalogo_ritec_atualizar_data on public.sup_catalogo_ritec_itens;
create trigger trg_sup_catalogo_ritec_atualizar_data
  before update on public.sup_catalogo_ritec_itens
  for each row execute function public.sup_catalogo_ritec_atualizar_data();

-- Substitui a fotografia integral da planilha em uma única transação. A API
-- não aceita escrever linha a linha, evitando catálogo parcial em caso de falha.
create or replace function public.importar_catalogo_ritec(
  p_arquivo_nome text,
  p_itens jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quantidade integer;
begin
  if not (public.has_role('admin') or public.has_role('coordenador_suprimentos')) then
    raise exception 'Sem permissão para importar o catálogo RITEC.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A planilha não possui itens válidos.' using errcode = '22023';
  end if;

  with origem as (
    select
      nullif(trim(x.codigo_sap), '') as codigo_sap,
      nullif(trim(x.nivel_2_sap), '') as nivel_2_sap,
      nullif(trim(x.subcategoria), '') as subcategoria,
      nullif(trim(x.aplicacao), '') as aplicacao,
      nullif(trim(x.descricao_sap), '') as descricao_sap,
      nullif(trim(x.descricao_completa), '') as descricao_completa,
      nullif(trim(x.unidade), '') as unidade,
      nullif(trim(x.ncm), '') as ncm,
      nullif(trim(x.codigo_ritec), '') as codigo_ritec,
      nullif(trim(x.codigo_ritec_opcao_preco), '') as codigo_ritec_opcao_preco,
      nullif(trim(x.referencia), '') as referencia,
      nullif(trim(x.marca), '') as marca,
      x.preco_cif_obra
    from jsonb_to_recordset(p_itens) as x(
      codigo_sap text, nivel_2_sap text, subcategoria text, aplicacao text,
      descricao_sap text, descricao_completa text, unidade text, ncm text,
      codigo_ritec text, codigo_ritec_opcao_preco text, referencia text,
      marca text, preco_cif_obra numeric
    )
  )
  select count(*) into v_quantidade from origem;

  if exists (
    with origem as (
      select nullif(trim(x.codigo_sap), '') as codigo_sap, nullif(trim(x.descricao_sap), '') as descricao_sap
      from jsonb_to_recordset(p_itens) as x(codigo_sap text, descricao_sap text)
    ) select 1 from origem where codigo_sap is null or descricao_sap is null
  ) then
    raise exception 'Todo item deve ter Código AG e Descrição SAP.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_itens) as x(codigo_sap text)
    group by trim(codigo_sap) having count(*) > 1
  ) then
    raise exception 'A planilha contém Código AG duplicado.' using errcode = '22023';
  end if;

  -- A tabela exige condição explícita para remoção em massa. `codigo_sap` é
  -- obrigatório, portanto preserva a semântica de substituição integral.
  delete from public.sup_catalogo_ritec_itens where codigo_sap is not null;

  insert into public.sup_catalogo_ritec_itens (
    codigo_sap, nivel_2_sap, subcategoria, aplicacao, descricao_sap,
    descricao_completa, unidade, ncm, codigo_ritec, codigo_ritec_opcao_preco,
    referencia, marca, preco_cif_obra
  )
  select
    nullif(trim(x.codigo_sap), ''), nullif(trim(x.nivel_2_sap), ''),
    nullif(trim(x.subcategoria), ''), nullif(trim(x.aplicacao), ''),
    nullif(trim(x.descricao_sap), ''), nullif(trim(x.descricao_completa), ''),
    nullif(trim(x.unidade), ''), nullif(trim(x.ncm), ''),
    nullif(trim(x.codigo_ritec), ''), nullif(trim(x.codigo_ritec_opcao_preco), ''),
    nullif(trim(x.referencia), ''), nullif(trim(x.marca), ''), x.preco_cif_obra
  from jsonb_to_recordset(p_itens) as x(
    codigo_sap text, nivel_2_sap text, subcategoria text, aplicacao text,
    descricao_sap text, descricao_completa text, unidade text, ncm text,
    codigo_ritec text, codigo_ritec_opcao_preco text, referencia text,
    marca text, preco_cif_obra numeric
  );

  insert into public.sup_catalogo_ritec_importacoes (arquivo_nome, quantidade_itens)
  values (coalesce(nullif(trim(p_arquivo_nome), ''), 'catálogo-ritec.xlsx'), v_quantidade);

  return v_quantidade;
end;
$$;

alter table public.sup_catalogo_ritec_itens enable row level security;
alter table public.sup_catalogo_ritec_importacoes enable row level security;

create policy sup_catalogo_ritec_itens_leitura on public.sup_catalogo_ritec_itens
  for select to authenticated
  using (public.has_role('admin') or public.has_role('comprador') or public.has_role('coordenador_suprimentos'));

create policy sup_catalogo_ritec_importacoes_leitura on public.sup_catalogo_ritec_importacoes
  for select to authenticated
  using (public.has_role('admin') or public.has_role('coordenador_suprimentos'));

revoke all on public.sup_catalogo_ritec_itens, public.sup_catalogo_ritec_importacoes from anon;
grant select on public.sup_catalogo_ritec_itens to authenticated;
grant select on public.sup_catalogo_ritec_importacoes to authenticated;
revoke all on function public.importar_catalogo_ritec(text, jsonb) from public, anon;
grant execute on function public.importar_catalogo_ritec(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
