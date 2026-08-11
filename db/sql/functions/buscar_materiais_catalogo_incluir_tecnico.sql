-- Catálogo (Materials.tsx): por padrão a busca deve casar só na descrição,
-- não no texto técnico — igual ao modal de Nova Solicitação
-- (buscar_materiais/MaterialSearchModal.tsx), que já usa esse padrão e expõe
-- um checkbox "Incluir texto técnico" para o caso raro de precisar separar
-- itens de descrição idêntica.
--
-- `buscar_materiais_catalogo` (ver criar_rpc_buscar_materiais_catalogo.sql)
-- casava sempre em `busca_texto` (description + technical_text), trazendo
-- ruído no caso comum. Ganha o parâmetro `incluir_tecnico`, default false.
--
-- O `case when tecnico then ... else ... end` por fora do `like` (não o
-- `like` dentro do case) é o que faz o índice certo ser escolhido: com o
-- valor do parâmetro conhecido no plano (custom plan do plpgsql), o CASE
-- resolve em tempo de planejamento para uma referência direta de coluna —
-- testado com EXPLAIN: busca_desc_trgm quando false (16ms), busca_trgm
-- quando true (37ms). Um CASE dentro do padrão do LIKE não teria essa garantia.

create or replace function public.buscar_materiais_catalogo(
  termos         text[]   default null,
  categoria      text     default null,
  empresa        text     default null,
  apenas_codigos text[]   default null,
  limite         integer  default 50,
  deslocamento   integer  default 0,
  incluir_tecnico boolean default false
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
  teto    int := least(coalesce(limite, 50), 200);
  salto   int := greatest(coalesce(deslocamento, 0), 0);
  toks    text[];
  tecnico boolean := coalesce(incluir_tecnico, false);
begin
  select array_agg(regexp_replace(trim(f_unaccent(upper(t))), '\s+', ' ', 'g'))
    into toks
  from unnest(coalesce(termos, '{}')) t
  where trim(t) <> '';

  return query
  with filtrado as materialized (
    select m.id, m.material_code, m.description, m.technical_text,
           m.category, m.company, m.unit,
           -- Casa na descrição sozinha, independente de `tecnico` estar
           -- ligado — usado só para ordenar (ver order by abaixo), não para
           -- filtrar. Sem isso, com o técnico habilitado, um item que só
           -- bate no texto técnico (ex.: "ESFERA" na norma construtiva) pode
           -- cair antes de um item com "ESFERA" na própria descrição, só
           -- porque o material_code dele é alfabeticamente menor — o alvo do
           -- ordenamento é a busca, não o cadastro.
           (toks is null or (
             select bool_and(m.busca_desc like '%' || escapar_like(t) || '%')
             from unnest(toks) t
           )) as casa_na_descricao,
           -- Posição do primeiro chip na descrição. Antes disso, dois itens
           -- que casavam na descrição só desempatavam por material_code — e
           -- "FOTOCLAREADOR CANETA" (código menor) aparecia antes de "CANETA
           -- TEXTO..." (código maior), mesmo a palavra estando na 15ª posição
           -- de um e na 1ª do outro. `nullif(...,0)` + `nulls last`: quando o
           -- termo não está na descrição (casamento só por código ou só por
           -- técnico), strpos devolve 0 e sem isso essas linhas iriam para o
           -- topo — o oposto do que se quer.
           nullif(strpos(m.busca_desc, coalesce(toks[1], '')), 0) as posicao_desc
    from materials m
    where m.is_active
      and (categoria is null or categoria = 'Todas' or m.category = categoria)
      and (empresa is null or empresa = 'Todas' or m.company = empresa or m.company = 'AMBAS')
      and (apenas_codigos is null or m.material_code = any(apenas_codigos))
      and (
        toks is null
        or m.material_code ilike '%' || escapar_like(toks[1]) || '%'
        or (case when tecnico then m.busca_texto else m.busca_desc end)
             like '%' || escapar_like(toks[1]) || '%'
      )
      and (
        toks is null
        or (
          select bool_and(
            m.material_code ilike '%' || escapar_like(t) || '%'
            or (case when tecnico then m.busca_texto else m.busca_desc end)
                 like '%' || escapar_like(t) || '%'
          )
          from unnest(toks) t
        )
      )
  )
  select f.id, f.material_code, f.description, f.technical_text,
         f.category, f.company, f.unit,
         count(*) over () as total_count
  from filtrado f
  order by f.casa_na_descricao desc, f.posicao_desc asc nulls last, f.material_code
  limit teto offset salto;
end;
$function$;
