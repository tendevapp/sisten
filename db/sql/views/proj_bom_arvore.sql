-- =====================================================================
-- ESPELHO DOCUMENTAL — não é executado pelo Supabase CLI.
-- A fonte aplicada são as migrations em supabase/migrations/:
--   20260909003754_create_proj_bom_views.sql
-- Mantido aqui pela convenção de db/README.md.
-- =====================================================================

-- =====================================================================
-- Almoxarifado > Projetos — a árvore da BOM e o consumo por tramo
--
-- `proj_bom_gwjaco` é uma BOM indentada: não existe parent_id, o pai de uma
-- linha é a linha anterior mais próxima com `level - 1`, na ordem do `id`.
-- Resolver isso em cada consulta (e de novo no TypeScript) é como a planilha
-- original quebrou — PROCV por deslocamento de linha. Aqui a hierarquia é
-- resolvida UMA vez, nesta view, e todo o resto consome dela.
--
-- Regra confirmada nos dados: `quantity` JÁ É a quantidade por torre, não por
-- unidade do pai. Prova na linha 478 ("Ladder horizontal support", qty 6):
-- os filhos vêm 12, 12, 6, 36, 24 e 12 — ou seja, 2x6, 2x6, 1x6, 6x6, 4x6 e
-- 2x6, já multiplicados. Logo o consumo de uma torre é a SOMA das folhas,
-- sem cascata; somar os pais junto contaria a mesma peça duas vezes.
-- =====================================================================

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
    lead(b.level) over (partition by b.projeto order by b.id) as prox_level,
    max(case when b.level = 1 then b.id end) over w as pai_nivel_1,
    max(case when b.level = 2 then b.id end) over w as pai_nivel_2,
    max(case when b.level = 3 then b.id end) over w as pai_nivel_3,
    max(case when b.level = 4 then b.id end) over w as pai_nivel_4,
    max(case when b.level = 5 then b.id end) over w as pai_nivel_5
  from public.proj_bom_gwjaco b
  window w as (partition by b.projeto order by b.id rows between unbounded preceding and 1 preceding)
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
    -- Folha = nada abaixo dela na indentação. É o que de fato se estoca;
    -- os pais são cabeçalhos de conjunto.
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
  coalesce(array_length(t.caminho, 1), c.level) as profundidade
from com_pai c
left join trilha t on t.id = c.id;

comment on view public.vw_proj_bom_arvore is
  'BOM indentada com a hierarquia resolvida (parent_id, folha, caminho). qtd_por_torre já é absoluta por torre.';

-- Consumo unitário de uma torre, por tramo. Só folhas: os pais são conjuntos.
create or replace view public.vw_proj_consumo_tramo
with (security_invoker = true) as
select
  a.projeto,
  a.tramo,
  a.secao,
  a.part_number_norm,
  min(a.part_number) as part_number,
  max(a.cod_sap) as cod_sap,
  sum(a.qtd_por_torre) as qtd_por_torre,
  count(*) as linhas_bom,
  -- Um part number pode entrar num tramo por mais de um subconjunto Atlanta;
  -- a lista serve para agrupar o romaneio no chão de fábrica.
  array_remove(array_agg(distinct a.subconjunto), null) as subconjuntos
from public.vw_proj_bom_arvore a
where a.folha
  and a.tramo is not null
  and a.part_number_norm is not null
  and a.qtd_por_torre is not null
group by a.projeto, a.tramo, a.secao, a.part_number_norm;

comment on view public.vw_proj_consumo_tramo is
  'Consumo de UMA torre por tramo. Multiplicar pelas torres do subprojeto para a meta do pedido.';

-- Folhas descendentes de uma linha da BOM. Base da explosão no recebimento:
-- a NF vem pelo item pai, o almoxarifado credita os filhos.
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
  order by d.id;
$$;

-- Prévia da explosão: quantas torres a quantidade recebida representa e
-- quanto isso credita em cada folha. O conferente confere contra o físico
-- antes de confirmar (conferência cega), então isto é só a sugestão.
create or replace function public.proj_previa_explosao(
  p_bom_linha_id bigint,
  p_quantidade numeric
)
returns table (
  bom_linha_id bigint,
  part_number text,
  part_number_norm text,
  cod_sap text,
  descricao text,
  secao text,
  tramo text,
  subconjunto text,
  qtd_por_torre numeric,
  torres_equivalentes numeric,
  qtd_creditada numeric
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_qtd_pai numeric;
  v_torres numeric;
  v_pn text;
begin
  select a.qtd_por_torre, a.part_number into v_qtd_pai, v_pn
  from public.vw_proj_bom_arvore a where a.id = p_bom_linha_id;

  if not found then
    raise exception 'Linha % não existe na BOM.', p_bom_linha_id;
  end if;

  -- Duas linhas da BOM vieram sem quantidade. Sem ela não dá para saber
  -- quantas torres a NF representa; a tela cai para lançamento manual.
  if v_qtd_pai is null or v_qtd_pai = 0 then
    raise exception 'O item % não tem quantidade por torre na BOM; lance os filhos manualmente.', coalesce(v_pn, p_bom_linha_id::text);
  end if;

  v_torres := p_quantidade / v_qtd_pai;

  return query
  select
    f.bom_linha_id,
    f.part_number,
    f.part_number_norm,
    f.cod_sap,
    f.descricao,
    f.secao,
    f.tramo,
    f.subconjunto,
    f.qtd_por_torre,
    v_torres,
    round(f.qtd_por_torre * v_torres, 3)
  from public.proj_folhas_de(p_bom_linha_id) f;
end;
$$;

grant select on public.vw_proj_bom_arvore to anon, authenticated, service_role;
grant select on public.vw_proj_consumo_tramo to anon, authenticated, service_role;
grant execute on function public.proj_folhas_de(bigint) to anon, authenticated, service_role;
grant execute on function public.proj_previa_explosao(bigint, numeric) to anon, authenticated, service_role;
