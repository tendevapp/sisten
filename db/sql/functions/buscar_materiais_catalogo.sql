-- RPC para a tela Catálogo (Materials.tsx), que hoje monta a busca com
-- `.ilike()` encadeado direto no PostgREST sobre 172 mil linhas / 188 MB.
--
-- Dois problemas medidos em produção (pg_stat_statements): 168 chamadas,
-- média 3,1-4,0s, ~550s acumulados.
--
-- 1. O OR de 3 colunas (`material_code.ilike, description.ilike,
--    technical_text.ilike`) só tem índice GIN trigram em `description`
--    (materials_description_trgm) — sem cobertura nas outras duas pernas do
--    OR, o planner desiste do índice e faz Index Scan no PK filtrando linha
--    a linha: ~3000ms.
--
-- 2. Mesmo só com `busca_desc` (já indexada), `ORDER BY material_code LIMIT`
--    faz o planner preferir caminhar o índice do PK esperando achar 25 linhas
--    rápido, e abandonar o bitmap trigram — medido 2302ms contra 30ms da
--    mesma condição sem o ORDER BY. É o motivo do CTE `materialized` abaixo:
--    força o filtro a resolver e materializar antes do ORDER BY/LIMIT verem
--    o resultado, para o planner não colar a ordenação no índice do PK.
--
-- O `count(*) over()` substitui o segundo round-trip que `count: 'exact'`
-- do PostgREST fazia (o mesmo predicado, sem limit, para contar) — aqui sai
-- de graça, calculado sobre o CTE já materializado.

-- Índice trigram em material_code: falta hoje (só existe btree prefixo,
-- materials_code_prefix), e chips numéricos de código também entram no OR.
create index if not exists materials_code_trgm
  on materials using gin (material_code gin_trgm_ops);

create or replace function public.buscar_materiais_catalogo(
  termos         text[]   default null,
  categoria      text     default null,
  empresa        text     default null,
  apenas_codigos text[]   default null,
  limite         integer  default 50,
  deslocamento   integer  default 0
)
returns table(
  id text, material_code text, description text, technical_text text,
  category text, company text, unit text, total_count bigint
)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  teto  int := least(coalesce(limite, 50), 200);
  salto int := greatest(coalesce(deslocamento, 0), 0);
  toks  text[];
begin
  -- Cada chip normalizado (unaccent/upper) vira uma condição AND; dentro de
  -- cada chip, casa em código OU descrição+técnico — mesma semântica do OR
  -- por chip que a tela já tinha, só que preservando uso de índice.
  select array_agg(regexp_replace(trim(f_unaccent(upper(t))), '\s+', ' ', 'g'))
    into toks
  from unnest(coalesce(termos, '{}')) t
  where trim(t) <> '';

  return query
  with filtrado as materialized (
    select m.id, m.material_code, m.description, m.technical_text,
           m.category, m.company, m.unit
    from materials m
    where m.is_active
      and (categoria is null or categoria = 'Todas' or m.category = categoria)
      and (empresa is null or empresa = 'Todas' or m.company = empresa or m.company = 'AMBAS')
      and (apenas_codigos is null or m.material_code = any(apenas_codigos))
      and (
        toks is null
        or m.material_code ilike '%' || escapar_like(toks[1]) || '%'
        or m.busca_texto like '%' || escapar_like(toks[1]) || '%'
      )
      and (
        toks is null
        or (
          select bool_and(
            m.material_code ilike '%' || escapar_like(t) || '%'
            or m.busca_texto like '%' || escapar_like(t) || '%'
          )
          from unnest(toks) t
        )
      )
  )
  select f.id, f.material_code, f.description, f.technical_text,
         f.category, f.company, f.unit,
         count(*) over () as total_count
  from filtrado f
  order by f.material_code
  limit teto offset salto;
end;
$function$;
