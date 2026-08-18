-- =====================================================================
-- Sugere, para cada descrição de item de uma proposta, os melhores
-- candidatos de vínculo dentro do escopo do processo (cotacao_processo_itens).
-- Duas fases: memória de vínculos já confirmados (cotacao_descricao_map)
-- e similaridade trigrama contra o texto breve da RM. Roda no Postgres
-- porque é lá que o pg_trgm está — mandar os textos para o browser
-- seria mais lento e usaria uma função de similaridade diferente da que
-- o resto do sistema usa (buscar_materiais, buscar_materiais_catalogo).
--
-- p_descricoes: [{"idx":0,"descricao":"...","codigo_produto":"..."}]
-- =====================================================================

create or replace function public.sugerir_vinculos_cotacao(
  p_processo_id uuid,
  p_fornecedor_cnpj text,
  p_descricoes jsonb
)
returns table (
  idx int,
  processo_item_id uuid,
  ri text,
  texto_breve text,
  material_code text,
  score numeric,
  origem text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with entrada as (
    select (d->>'idx')::int as idx,
           public.f_unaccent(upper(trim(d->>'descricao'))) as desc_norm,
           nullif(trim(d->>'codigo_produto'), '') as cod
    from jsonb_array_elements(p_descricoes) d
  ),
  escopo as (
    select id, ri, texto_breve, material_code,
           public.f_unaccent(upper(coalesce(texto_breve, ''))) as breve_norm
    from public.cotacao_processo_itens
    where processo_id = p_processo_id
  ),
  aprendido as (
    select e.idx, s.id, s.ri, s.texto_breve, s.material_code,
           least(0.99, 0.90 + 0.01 * m.vezes_confirmado)::numeric as score,
           'aprendido'::text as origem
    from entrada e
    join public.cotacao_descricao_map m
      on m.fornecedor_cnpj = coalesce(p_fornecedor_cnpj, '')
     and (m.descricao_norm = e.desc_norm
          or (e.cod is not null and m.codigo_produto = e.cod))
    join escopo s on s.material_code = m.material_code
  ),
  trigrama as (
    select e.idx, s.id, s.ri, s.texto_breve, s.material_code,
           similarity(e.desc_norm, s.breve_norm)::numeric as score,
           'trigrama'::text as origem
    from entrada e
    cross join escopo s
    where similarity(e.desc_norm, s.breve_norm) > 0.15
  ),
  tudo as (select * from aprendido union all select * from trigrama)
  select idx, id, ri, texto_breve, material_code, score, origem
  from (
    select *, row_number() over (partition by idx order by score desc) as rn
    from tudo
  ) t
  where rn <= 5
  order by idx, score desc;
$$;

revoke all on function public.sugerir_vinculos_cotacao(uuid, text, jsonb) from public, anon;
grant execute on function public.sugerir_vinculos_cotacao(uuid, text, jsonb) to authenticated;
