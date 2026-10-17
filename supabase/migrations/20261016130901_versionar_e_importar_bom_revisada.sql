-- ============================================================================
-- BOM revisada — versionamento, ordem da planilha e importação transacional
--
-- O `id` da BOM era usado ao mesmo tempo como identidade e como ordem da
-- planilha. Como esse id também pode aparecer no histórico de recebimentos,
-- uma substituição por DELETE/TRUNCATE faria um registro antigo apontar para
-- outra peça. A partir desta migration:
--   * cada carga é uma revisão auditável em `proj_bom_importacoes`;
--   * `ordem` representa a indentação/ordem da planilha;
--   * revisões antigas permanecem imutáveis e somente a revisão ativa aparece
--     em `vw_proj_bom_arvore`;
--   * a troca inteira acontece em uma única função/transação.
-- ============================================================================

begin;

create table public.proj_bom_importacoes (
  id uuid primary key default gen_random_uuid(),
  projeto text not null,
  arquivo_nome text not null,
  arquivo_sha256 text,
  total_linhas integer not null check (total_linhas > 0),
  ativa boolean not null default false,
  resumo jsonb not null default '{}'::jsonb,
  importado_em timestamptz not null default now(),
  importado_por text not null default current_user,
  constraint proj_bom_importacoes_sha256_ck
    check (arquivo_sha256 is null or arquivo_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proj_bom_importacoes_projeto_sha256_uq unique (projeto, arquivo_sha256)
);

comment on table public.proj_bom_importacoes is
  'Revisões importadas da BOM. Uma única revisão ativa por projeto alimenta as views operacionais.';

alter table public.proj_bom_gwjaco
  add column importacao_id uuid,
  add column ordem integer,
  add column linha_origem integer;

-- Registra a BOM que já existia antes do versionamento como revisão legada.
insert into public.proj_bom_importacoes
  (projeto, arquivo_nome, arquivo_sha256, total_linhas, ativa, resumo, importado_por)
select
  b.projeto,
  'BOM legada anterior a 2026-10-16',
  null,
  count(*)::integer,
  true,
  jsonb_build_object('origem', 'base_preexistente', 'primeiro_id', min(b.id), 'ultimo_id', max(b.id)),
  'MIGRATION'
from public.proj_bom_gwjaco b
group by b.projeto;

update public.proj_bom_gwjaco b
set
  importacao_id = i.id,
  ordem = b.id::integer,
  linha_origem = b.id::integer + 1
from public.proj_bom_importacoes i
where i.projeto = b.projeto
  and i.arquivo_sha256 is null
  and i.ativa;

alter table public.proj_bom_gwjaco
  alter column importacao_id set not null,
  alter column ordem set not null,
  alter column linha_origem set not null,
  add constraint proj_bom_gwjaco_importacao_fk
    foreign key (importacao_id) references public.proj_bom_importacoes (id) on delete restrict,
  add constraint proj_bom_gwjaco_ordem_ck check (ordem > 0),
  add constraint proj_bom_gwjaco_linha_origem_ck check (linha_origem > 1),
  add constraint proj_bom_gwjaco_importacao_ordem_uq unique (importacao_id, ordem),
  add constraint proj_bom_gwjaco_importacao_linha_uq unique (importacao_id, linha_origem);

create unique index proj_bom_importacoes_uma_ativa_uq
  on public.proj_bom_importacoes (projeto)
  where ativa;

create index idx_proj_bom_gwjaco_importacao_ordem
  on public.proj_bom_gwjaco (importacao_id, ordem);

-- Novas revisões usam ids novos da identity existente, sem reaproveitar ids
-- históricos. Reposiciona a sequence porque a carga legada informou os ids.
select setval(
  pg_get_serial_sequence('public.proj_bom_gwjaco', 'id'),
  greatest(coalesce((select max(id) from public.proj_bom_gwjaco), 1), 1),
  exists (select 1 from public.proj_bom_gwjaco)
);

-- A hierarquia passa a usar a ordem explícita da revisão ativa. O id continua
-- sendo a identidade estável usada em registros operacionais.
create or replace view public.vw_proj_bom_arvore
with (security_invoker = true) as
with recursive marcado as (
  select
    b.id,
    b.projeto,
    b.level,
    b.section,
    b."group",
    b.find_number,
    b.part_number,
    b.codigo_equivalente_qingdao,
    b.revision,
    b.description,
    b.descricao,
    b.quantity,
    b.each_weight_kg,
    b.total_weight_kg,
    b.uom,
    b.source,
    b.delivery_at,
    b.kit_atlanta,
    b.cod_sap,
    b.ordem,
    lead(b.level) over (partition by b.projeto order by b.ordem) as prox_level,
    max(case when b.level = 1 then b.id end) over w as pai_nivel_1,
    max(case when b.level = 2 then b.id end) over w as pai_nivel_2,
    max(case when b.level = 3 then b.id end) over w as pai_nivel_3,
    max(case when b.level = 4 then b.id end) over w as pai_nivel_4,
    max(case when b.level = 5 then b.id end) over w as pai_nivel_5
  from public.proj_bom_gwjaco b
  join public.proj_bom_importacoes i on i.id = b.importacao_id and i.ativa
  window w as (partition by b.projeto order by b.ordem rows between unbounded preceding and 1 preceding)
),
com_pai as (
  select
    m.*,
    case m.level
      when 2 then m.pai_nivel_1
      when 3 then m.pai_nivel_2
      when 4 then m.pai_nivel_3
      when 5 then m.pai_nivel_4
      when 6 then m.pai_nivel_5
      else null
    end as parent_id,
    (m.prox_level is null or m.prox_level <= m.level) as folha
  from marcado m
),
trilha as (
  select
    c.id,
    c.parent_id,
    array[coalesce(nullif(btrim(c.part_number), ''), c.id::text)]::text[] as caminho
  from com_pai c
  where c.parent_id is null
  union all
  select
    c.id,
    c.parent_id,
    t.caminho || coalesce(nullif(btrim(c.part_number), ''), c.id::text)
  from com_pai c
  join trilha t on c.parent_id = t.id
)
select
  c.id,
  c.projeto,
  c.level,
  c.parent_id,
  c.folha,
  c.section as secao,
  case when c.section is null then null else 'T' || right(c.section, 1) end as tramo,
  c."group" as grupo,
  upper(btrim(coalesce(c."group", ''))) as grupo_norm,
  c.find_number,
  c.part_number,
  public.proj_normalizar_pn(c.part_number) as part_number_norm,
  c.codigo_equivalente_qingdao,
  c.revision,
  c.description,
  c.descricao,
  c.quantity as qtd_por_torre,
  c.each_weight_kg,
  c.total_weight_kg,
  c.uom,
  c.source as fornecedor,
  c.delivery_at,
  c.kit_atlanta as subconjunto,
  c.cod_sap,
  coalesce(t.caminho, array[]::text[]) as caminho,
  coalesce(array_length(t.caminho, 1), c.level) as profundidade,
  c.ordem
from com_pai c
left join trilha t on t.id = c.id;

comment on view public.vw_proj_bom_arvore is
  'Revisão ativa da BOM indentada, com parent_id, folha, caminho e ordem de origem. qtd_por_torre é absoluta por torre.';

create or replace function public.proj_folhas_de(p_bom_linha_id bigint)
returns table (
  bom_linha_id bigint,
  part_number text,
  part_number_norm text,
  cod_sap text,
  descricao text,
  secao text,
  tramo text,
  subconjunto text,
  qtd_por_torre numeric
)
language sql
stable
set search_path = public, pg_temp
as $$
  with recursive desc_arvore as (
    select a.* from public.vw_proj_bom_arvore a where a.id = p_bom_linha_id
    union all
    select f.* from public.vw_proj_bom_arvore f join desc_arvore d on f.parent_id = d.id
  )
  select
    d.id,
    d.part_number,
    d.part_number_norm,
    d.cod_sap,
    coalesce(d.descricao, d.description),
    d.secao,
    d.tramo,
    d.subconjunto,
    d.qtd_por_torre
  from desc_arvore d
  where d.folha
  order by d.ordem;
$$;

-- Sincroniza os campos de engenharia da revisão ativa, preservando os campos
-- operacionais do almoxarifado (localizador, estoque mínimo, ignorar e notas).
create or replace function public.proj_sincronizar_itens(p_projeto text default 'GW_JACOBINA')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes integer;
  v_depois integer;
begin
  select count(*) into v_antes
  from public.proj_itens
  where projeto = p_projeto;

  with base as (
    select
      public.proj_normalizar_pn(b.part_number) as pn_norm,
      (array_agg(b.part_number order by cnt desc, length(b.part_number) asc))[1] as pn,
      max(b.cod_sap) as cod_sap,
      (array_agg(b.descricao order by (b.descricao is null), b.ordem))[1] as descricao,
      (array_agg(b.description order by (b.description is null), b.ordem))[1] as description,
      (array_agg(initcap(btrim(b.source)) order by (b.source is null), b.ordem))[1] as fornecedor,
      (array_agg(b.uom order by (b.uom is null), b.ordem))[1] as uom,
      max(b.each_weight_kg) as peso
    from (
      select bb.*, count(*) over (
        partition by public.proj_normalizar_pn(bb.part_number), bb.part_number
      ) as cnt
      from public.proj_bom_gwjaco bb
      join public.proj_bom_importacoes bi on bi.id = bb.importacao_id and bi.ativa
      where bb.projeto = p_projeto
    ) b
    where public.proj_normalizar_pn(b.part_number) is not null
    group by 1
  )
  insert into public.proj_itens
    (projeto, part_number_norm, part_number, cod_sap, descricao, description, fornecedor, uom, peso_unitario_kg)
  select
    p_projeto,
    pn_norm,
    pn,
    nullif(btrim(cod_sap), ''),
    descricao,
    description,
    fornecedor,
    coalesce(uom, 'each'),
    peso
  from base
  on conflict (projeto, part_number_norm) do update
  set
    part_number = excluded.part_number,
    cod_sap = coalesce(excluded.cod_sap, proj_itens.cod_sap),
    descricao = coalesce(excluded.descricao, proj_itens.descricao),
    description = coalesce(excluded.description, proj_itens.description),
    fornecedor = coalesce(excluded.fornecedor, proj_itens.fornecedor),
    uom = coalesce(excluded.uom, proj_itens.uom),
    peso_unitario_kg = coalesce(excluded.peso_unitario_kg, proj_itens.peso_unitario_kg),
    updated_at = now();

  select count(*) into v_depois
  from public.proj_itens
  where projeto = p_projeto;

  return v_depois - v_antes;
end;
$$;

create or replace function public.proj_substituir_bom(
  p_projeto text,
  p_arquivo_nome text,
  p_arquivo_sha256 text,
  p_linhas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_importacao_id uuid;
  v_total integer;
  v_invalidas integer;
  v_itens_novos integer;
  v_codigos_sap integer;
  v_descricoes_pt integer;
  v_ajustes_estrutura integer;
begin
  p_projeto := nullif(btrim(p_projeto), '');
  p_arquivo_nome := nullif(btrim(p_arquivo_nome), '');
  p_arquivo_sha256 := lower(nullif(btrim(p_arquivo_sha256), ''));

  if p_projeto is null or p_arquivo_nome is null then
    raise exception 'Projeto e nome do arquivo são obrigatórios.';
  end if;
  if p_arquivo_sha256 is null or p_arquivo_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'SHA-256 inválido para a importação da BOM.';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'As linhas da BOM devem ser enviadas como array JSON.';
  end if;

  v_total := jsonb_array_length(p_linhas);
  if v_total = 0 then
    raise exception 'A BOM não pode ser substituída por uma lista vazia.';
  end if;

  -- Serializa importações do mesmo projeto dentro da transação.
  perform pg_advisory_xact_lock(hashtextextended('proj_bom:' || p_projeto, 0));

  if exists (
    select 1 from public.proj_bom_importacoes
    where projeto = p_projeto and arquivo_sha256 = p_arquivo_sha256
  ) then
    raise exception 'O arquivo % já foi importado para o projeto %.', p_arquivo_nome, p_projeto;
  end if;

  with niveis as (
    select
      ord::integer as ordem,
      nullif(linha->>'level', '')::integer as nivel,
      lag(nullif(linha->>'level', '')::integer) over (order by ord) as nivel_anterior
    from jsonb_array_elements(p_linhas) with ordinality as x(linha, ord)
  )
  select count(*) into v_invalidas
  from niveis
  where nivel is null
     or nivel not between 1 and 6
     or (ordem = 1 and nivel <> 1)
     or (ordem > 1 and nivel > nivel_anterior + 1);

  if v_invalidas > 0 then
    raise exception 'A BOM contém % transição(ões) de nível inválida(s).', v_invalidas;
  end if;

  select count(*) into v_invalidas
  from jsonb_array_elements(p_linhas) as x(linha)
  where nullif(btrim(x.linha->>'description'), '') is null;
  if v_invalidas > 0 then
    raise exception 'A BOM contém % linha(s) sem Description.', v_invalidas;
  end if;

  insert into public.proj_bom_importacoes
    (projeto, arquivo_nome, arquivo_sha256, total_linhas, ativa, importado_por)
  values
    (p_projeto, p_arquivo_nome, p_arquivo_sha256, v_total, false, 'IMPORTACAO_BOM')
  returning id into v_importacao_id;

  insert into public.proj_bom_gwjaco (
    importacao_id,
    ordem,
    linha_origem,
    projeto,
    level,
    section,
    "group",
    find_number,
    part_number,
    codigo_equivalente_qingdao,
    revision,
    description,
    descricao,
    quantity,
    each_weight_kg,
    total_weight_kg,
    uom,
    source,
    delivery_at,
    kit_atlanta,
    cod_sap
  )
  select
    v_importacao_id,
    x.ord::integer,
    coalesce(nullif(x.linha->>'linha_origem', '')::integer, x.ord::integer + 1),
    p_projeto,
    nullif(x.linha->>'level', '')::integer,
    nullif(btrim(x.linha->>'section'), ''),
    nullif(btrim(x.linha->>'group'), ''),
    nullif(btrim(x.linha->>'find_number'), ''),
    nullif(btrim(x.linha->>'part_number'), ''),
    nullif(btrim(x.linha->>'codigo_equivalente_qingdao'), ''),
    nullif(btrim(x.linha->>'revision'), ''),
    nullif(btrim(x.linha->>'description'), ''),
    coalesce(nullif(btrim(x.linha->>'descricao'), ''), anterior.descricao),
    nullif(x.linha->>'quantity', '')::numeric,
    nullif(x.linha->>'each_weight_kg', '')::numeric,
    nullif(x.linha->>'total_weight_kg', '')::numeric,
    nullif(btrim(x.linha->>'uom'), ''),
    nullif(btrim(x.linha->>'source'), ''),
    nullif(btrim(x.linha->>'delivery_at'), ''),
    nullif(btrim(x.linha->>'kit_atlanta'), ''),
    coalesce(nullif(btrim(x.linha->>'cod_sap'), ''), anterior.cod_sap)
  from jsonb_array_elements(p_linhas) with ordinality as x(linha, ord)
  left join lateral (
    select b.descricao, b.cod_sap
    from public.proj_bom_gwjaco b
    join public.proj_bom_importacoes i on i.id = b.importacao_id and i.ativa
    where b.projeto = p_projeto
      and public.proj_normalizar_pn(b.part_number) = public.proj_normalizar_pn(x.linha->>'part_number')
    order by (b.cod_sap is not null) desc, (b.descricao is not null) desc, b.ordem
    limit 1
  ) anterior on true
  order by x.ord;

  update public.proj_bom_importacoes
  set ativa = false
  where projeto = p_projeto and ativa;

  update public.proj_bom_importacoes
  set ativa = true
  where id = v_importacao_id;

  v_itens_novos := public.proj_sincronizar_itens(p_projeto);

  select count(*) into v_ajustes_estrutura
  from jsonb_array_elements(p_linhas) as x(linha)
  where coalesce((x.linha->>'ajuste_colunas_deslocadas')::boolean, false);

  select
    count(*) filter (where nullif(btrim(cod_sap), '') is not null),
    count(*) filter (where nullif(btrim(descricao), '') is not null)
  into v_codigos_sap, v_descricoes_pt
  from public.proj_bom_gwjaco
  where importacao_id = v_importacao_id;

  update public.proj_bom_importacoes
  set resumo = jsonb_build_object(
    'linhas', v_total,
    'codigos_sap_preservados', v_codigos_sap,
    'descricoes_pt_preservadas', v_descricoes_pt,
    'itens_catalogo_inseridos', v_itens_novos,
    'linhas_com_colunas_reposicionadas', v_ajustes_estrutura
  )
  where id = v_importacao_id;

  return jsonb_build_object(
    'importacao_id', v_importacao_id,
    'projeto', p_projeto,
    'linhas', v_total,
    'codigos_sap_preservados', v_codigos_sap,
    'descricoes_pt_preservadas', v_descricoes_pt,
    'itens_catalogo_inseridos', v_itens_novos,
    'linhas_com_colunas_reposicionadas', v_ajustes_estrutura
  );
end;
$$;

-- A BOM é somente leitura para usuários do app. A carga revisada acontece
-- exclusivamente pela função acima, com service_role.
drop policy if exists proj_bom_gwjaco_insert on public.proj_bom_gwjaco;
drop policy if exists proj_bom_gwjaco_update on public.proj_bom_gwjaco;
drop policy if exists proj_bom_gwjaco_delete on public.proj_bom_gwjaco;
revoke all on public.proj_bom_gwjaco from anon, authenticated;
grant select on public.proj_bom_gwjaco to authenticated, service_role;
grant all on public.proj_bom_gwjaco to service_role;
grant usage, select on sequence public.proj_bom_gwjaco_id_seq to service_role;

alter table public.proj_bom_importacoes enable row level security;
create policy proj_bom_importacoes_read
  on public.proj_bom_importacoes
  for select
  to authenticated
  using (true);
revoke all on public.proj_bom_importacoes from anon, authenticated;
grant select on public.proj_bom_importacoes to authenticated, service_role;
grant all on public.proj_bom_importacoes to service_role;

revoke all on function public.proj_substituir_bom(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.proj_substituir_bom(text, text, text, jsonb) to service_role;
grant execute on function public.proj_sincronizar_itens(text) to service_role;

grant select on public.vw_proj_bom_arvore to authenticated, service_role;

commit;
