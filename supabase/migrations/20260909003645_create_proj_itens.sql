-- =====================================================================
-- Almoxarifado > Projetos — catálogo operacional de itens
--
-- A BOM (`proj_bom_gwjaco`) é engenharia: 1.257 linhas, imutável, com o mesmo
-- part number repetido em várias seções e níveis. O almoxarifado precisa do
-- oposto — uma linha por peça, com prateleira e estoque mínimo. Por isso a
-- tabela separada, semeada da BOM.
--
-- A chave de negócio é o part number NORMALIZADO (sem pontos, maiúsculo)
-- porque a planilha de origem escreve o mesmo item de formas diferentes
-- ('403.000.458' e '4.0300.0458'; '10.474.065' e '10474065'). O cod_sap não
-- serve de chave: 412 das 1.257 linhas não têm nenhum.
-- =====================================================================

create table if not exists public.proj_itens (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  part_number_norm text not null,
  part_number text not null,
  cod_sap text,
  descricao text,
  description text,
  fornecedor text,
  uom text default 'each',
  peso_unitario_kg numeric,
  -- Preenchidos pelo almoxarifado, nunca pela BOM. Uma re-sincronização da
  -- BOM não pode apagá-los (ver proj_sincronizar_itens abaixo).
  localizador text,
  estoque_minimo numeric not null default 0,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (projeto, part_number_norm)
);

create index if not exists idx_proj_itens_sap on public.proj_itens (cod_sap);
create index if not exists idx_proj_itens_pn on public.proj_itens (part_number);
create index if not exists idx_proj_itens_fornecedor on public.proj_itens (projeto, fornecedor);

-- Normalização única do part number. Usada aqui, na view da árvore e no TS
-- (`normalizarPartNumber` em src/lib/projetos.ts) — as três precisam concordar.
create or replace function public.proj_normalizar_pn(p_pn text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(upper(regexp_replace(coalesce(p_pn, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- Insere só os part numbers que ainda não existem. `localizador` e
-- `estoque_minimo` de quem já está lá ficam intactos: eles são do almoxarifado,
-- não da engenharia.
create or replace function public.proj_sincronizar_itens(p_projeto text default 'GW_JACOBINA')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inseridos integer;
begin
  with base as (
    select
      public.proj_normalizar_pn(b.part_number) as pn_norm,
      -- Entre as grafias do mesmo item, fica a mais frequente; empate resolve
      -- pela mais curta, que costuma ser a canônica do SAP.
      (array_agg(b.part_number order by cnt desc, length(b.part_number) asc))[1] as pn,
      max(b.cod_sap) as cod_sap,
      (array_agg(b.descricao order by (b.descricao is null), b.id))[1] as descricao,
      (array_agg(b.description order by (b.description is null), b.id))[1] as description,
      (array_agg(initcap(btrim(b.source)) order by (b.source is null), b.id))[1] as fornecedor,
      (array_agg(b.uom order by (b.uom is null), b.id))[1] as uom,
      max(b.each_weight_kg) as peso
    from (
      select bb.*, count(*) over (partition by public.proj_normalizar_pn(bb.part_number), bb.part_number) as cnt
      from public.proj_bom_gwjaco bb
      where bb.projeto = p_projeto
    ) b
    where public.proj_normalizar_pn(b.part_number) is not null
    group by 1
  ),
  ins as (
    insert into public.proj_itens
      (projeto, part_number_norm, part_number, cod_sap, descricao, description, fornecedor, uom, peso_unitario_kg)
    select p_projeto, pn_norm, pn, nullif(btrim(cod_sap), ''), descricao, description, fornecedor, coalesce(uom, 'each'), peso
    from base
    on conflict (projeto, part_number_norm) do nothing
    returning 1
  )
  select count(*) into v_inseridos from ins;

  return v_inseridos;
end;
$$;

select public.proj_sincronizar_itens('GW_JACOBINA');

grant select, insert, update, delete on public.proj_itens to anon, authenticated, service_role;
grant execute on function public.proj_normalizar_pn(text) to anon, authenticated, service_role;
grant execute on function public.proj_sincronizar_itens(text) to authenticated, service_role;

alter table public.proj_itens enable row level security;

drop policy if exists "proj_itens_all" on public.proj_itens;
create policy "proj_itens_all" on public.proj_itens for all using (true) with check (true);
