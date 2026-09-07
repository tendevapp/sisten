-- =====================================================================
-- A sugestão de vínculo do mapa de cotação passa a enxergar a memória
--
-- `sugerir_vinculos_cotacao` (usada ao importar propostas em Análise de
-- Cotações) já consultava `sup_cotacao_descricao_map` no ramo "aprendido",
-- mas normalizava a descrição com `f_unaccent(upper(trim(...)))` — sem tirar
-- pontuação. A curadoria grava a chave da memória com `f_norm_cotacao`, que
-- também colapsa pontuação e espaços. Duas normalizações diferentes para a
-- mesma chave: a memória nunca seria encontrada, e cada confirmação de
-- vínculo morreria sem efeito na próxima cotação.
--
-- Aqui as duas passam a usar `f_norm_cotacao`, e o ramo aprendido deixa de
-- exigir que o material já esteja no escopo do processo: se a memória diz
-- qual é o material daquela descrição para aquele fornecedor, essa é a
-- resposta — o item de RM correspondente é procurado por material_code, e na
-- falta dele a sugestão ainda aparece com o código, para o comprador ver.
-- =====================================================================

create or replace function public.sugerir_vinculos_cotacao(
  p_processo_id uuid,
  p_fornecedor_cnpj text,
  p_descricoes jsonb
)
returns table(idx integer, processo_item_id uuid, ri text, texto_breve text, material_code text, score numeric, origem text)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with entrada as (
    select (d->>'idx')::int as idx,
           public.f_norm_cotacao(d->>'descricao') as desc_norm,
           nullif(trim(d->>'codigo_produto'), '') as cod
    from jsonb_array_elements(p_descricoes) d
  ),
  escopo as (
    select id, ri, texto_breve, material_code,
           public.f_norm_cotacao(texto_breve) as breve_norm
    from public.sup_cotacao_processo_itens
    where processo_id = p_processo_id
  ),
  -- Memória de vínculos confirmados: quanto mais vezes a mesma descrição foi
  -- confirmada naquele fornecedor, mais alto o score (teto em 0,99).
  aprendido as (
    select e.idx, s.id, s.ri, s.texto_breve, m.material_code,
           least(0.99, 0.90 + 0.01 * m.vezes_confirmado)::numeric as score,
           'aprendido'::text as origem
    from entrada e
    join public.sup_cotacao_descricao_map m
      on m.fornecedor_cnpj = regexp_replace(coalesce(p_fornecedor_cnpj, ''), '\D', '', 'g')
     and (m.descricao_norm = e.desc_norm
          or (e.cod is not null and m.codigo_produto = e.cod))
    left join escopo s on s.material_code = m.material_code
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
$function$;
