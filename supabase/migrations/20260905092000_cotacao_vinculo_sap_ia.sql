-- =====================================================================
-- Vínculo item cotado → material SAP: o caminho da IA
--
-- O casamento com pedidos só enxerga item que virou pedido. Na carga inicial
-- sobraram 413 dos 601 itens sem nenhum pedido plausível — cotação que não
-- virou compra, fornecedor novo, item comprado antes de 2026. Para esses, a
-- pergunta deixa de ser "que pedido é esse?" e passa a ser "que material do
-- catálogo essa descrição descreve?".
--
-- O catálogo tem 452 mil materiais: mandar tudo para a IA é impossível e
-- caro. `candidatos_ia_vinculo` faz a peneira no banco (trigrama sobre
-- `busca_desc`, que já tem índice GIN) e entrega à Edge Function só o item e
-- seus melhores candidatos. A IA escolhe entre eles — ou diz que nenhum
-- serve. Ela nunca inventa código: o que não estiver na lista é descartado
-- por `registrar_vinculos_ia`.
--
-- Resultado da IA entra como `sugerido`/origem `ia`: continua passando pela
-- curadoria, igual ao que veio de pedido.
-- =====================================================================

-- Itens à espera de análise + candidatos do catálogo para cada um.
create or replace function public.candidatos_ia_vinculo(
  p_limite integer default 25,
  p_top integer default 12,
  p_vinculo_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_resultado jsonb;
begin
  if (select auth.uid()) is not null and not public.pode_gerir_cotacoes() then
    raise exception 'Sem permissão para consultar candidatos de vínculo.' using errcode = '42501';
  end if;

  -- Abaixo do padrão (0,3): a descrição do fornecedor e o texto do catálogo
  -- costumam compartilhar pouco além do substantivo principal.
  perform set_config('pg_trgm.similarity_threshold', '0.15', true);

  with pendentes as (
    select v.id as vinculo_id, it.id as proposta_item_id,
           it.descricao_produto, it.codigo_produto, it.marca_fabricante,
           it.unidade_medida, it.preco_unitario,
           p.fornecedor_razao_social, p.fornecedor_cnpj,
           public.f_norm_cotacao(it.descricao_produto) as desc_norm
      from public.sup_cotacao_item_vinculos v
      join public.sup_cotacao_proposta_itens it on it.id = v.proposta_item_id
      join public.sup_cotacao_propostas p on p.id = it.proposta_id
     where ((p_vinculo_ids is null and v.status = 'sem_candidato')
            or (p_vinculo_ids is not null and v.id = any(p_vinculo_ids)))
       and public.f_norm_cotacao(it.descricao_produto) is not null
     order by it.created_at
     limit greatest(p_limite, 1)
  ),
  com_candidatos as (
    select pe.*,
           coalesce((
             select jsonb_agg(s.c order by s.sim desc)
               from (
                 select similarity(m.busca_desc, pe.desc_norm) as sim,
                        jsonb_build_object(
                          'material_code', m.material_code,
                          'descricao', m.description,
                          'texto_tecnico', left(coalesce(m.technical_text, ''), 200),
                          'unidade', m.unit,
                          'grupo', m.grupo_mercadoria_desc,
                          'score', round(similarity(m.busca_desc, pe.desc_norm)::numeric, 3)
                        ) as c
                   from public.sap_zl0169_162_catalogo m
                  where m.busca_desc % pe.desc_norm
                  order by similarity(m.busca_desc, pe.desc_norm) desc
                  limit greatest(p_top, 1)
               ) s
           ), '[]'::jsonb) as candidatos
      from pendentes pe
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'vinculo_id', vinculo_id,
           'proposta_item_id', proposta_item_id,
           'descricao', descricao_produto,
           'codigo_fornecedor', codigo_produto,
           'marca', marca_fabricante,
           'unidade', unidade_medida,
           'preco_unitario', preco_unitario,
           'fornecedor', fornecedor_razao_social,
           'fornecedor_cnpj', fornecedor_cnpj,
           'candidatos', candidatos
         )), '[]'::jsonb)
    into v_resultado
    from com_candidatos;

  return v_resultado;
end;
$$;

revoke all on function public.candidatos_ia_vinculo(integer, integer, uuid[]) from public;
grant execute on function public.candidatos_ia_vinculo(integer, integer, uuid[]) to authenticated;

-- ------------------------------------------------------- gravação da rodada
-- Recebe o lote inteiro que a IA devolveu, numa chamada só. Cada resultado é
-- `{vinculo_id, material_code, confianca, justificativa, candidatos}`;
-- `material_code` nulo significa "nenhum candidato serve" e o item continua
-- na fila, agora com a justificativa registrada.
create or replace function public.registrar_vinculos_ia(
  p_resultados jsonb,
  p_modelo text default null,
  p_executado_por text default null,
  p_executado_por_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rodada uuid;
  v_sugeridos integer := 0;
  v_sem integer := 0;
begin
  if (select auth.uid()) is not null and not public.pode_gerir_cotacoes() then
    raise exception 'Sem permissão para gravar vínculos por IA.' using errcode = '42501';
  end if;

  insert into public.sup_cotacao_vinculo_rodadas
    (tipo, parametros, executado_por, executado_por_nome)
  values
    ('ia', jsonb_build_object('modelo', p_modelo), p_executado_por, p_executado_por_nome)
  returning id into v_rodada;

  with entrada as (
    select (r->>'vinculo_id')::uuid as vinculo_id,
           nullif(trim(r->>'material_code'), '') as material_code,
           nullif(r->>'confianca', '')::numeric as confianca,
           nullif(trim(r->>'justificativa'), '') as justificativa,
           coalesce(r->'candidatos', '[]'::jsonb) as candidatos
      from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) r
  ),
  -- Só aceita código que existe no catálogo: se a IA devolver material
  -- inventado ou fora da lista, vira "nenhum candidato serve".
  validado as (
    select e.*, m.description as material_descricao,
           (m.material_code is not null) as valido
      from entrada e
      left join public.sap_zl0169_162_catalogo m on m.material_code = e.material_code
  ),
  gravado as (
    update public.sup_cotacao_item_vinculos v
       set status = case when d.valido then 'sugerido' else 'sem_candidato' end,
           origem = 'ia',
           material_code = case when d.valido then d.material_code else null end,
           material_descricao = case when d.valido then d.material_descricao else null end,
           score = case when d.valido then d.confianca else null end,
           sinais = jsonb_build_object(
                      'ia_confianca', d.confianca,
                      'ia_justificativa', d.justificativa,
                      'ia_modelo', p_modelo,
                      'ia_material_bruto', d.material_code
                    ),
           candidatos = d.candidatos,
           rodada_id = v_rodada,
           updated_at = now()
      from validado d
     where v.id = d.vinculo_id
       and v.status not in ('confirmado', 'rejeitado')
    returning d.valido
  )
  select count(*) filter (where valido), count(*) filter (where not valido)
    into v_sugeridos, v_sem
    from gravado;

  update public.sup_cotacao_vinculo_rodadas
     set itens_analisados = v_sugeridos + v_sem,
         sugestoes = v_sugeridos,
         sem_candidato = v_sem
   where id = v_rodada;

  return jsonb_build_object('rodada_id', v_rodada, 'sugestoes', v_sugeridos, 'sem_candidato', v_sem);
end;
$$;

revoke all on function public.registrar_vinculos_ia(jsonb, text, text, text) from public;
grant execute on function public.registrar_vinculos_ia(jsonb, text, text, text) to authenticated;

-- ------------------------------------------------------------ prompt padrão
-- O texto vive no banco justamente para ser corrigido pelo comprador que
-- percebe a IA errando um tipo de item — sem redeploy da Edge Function.
insert into public.ops_ia_prompts (chave, titulo, descricao, modelo, prompt, parametros)
values (
  'vincular-cotacao-sap',
  'Vínculo de item cotado ao material SAP',
  'Escolhe, entre os candidatos do catálogo pré-filtrados por similaridade, qual material SAP corresponde à descrição do item cotado pelo fornecedor. Usado na página Suprimentos > Vínculos & Auditoria de Cotações.',
  'gemini-3.6-flash',
  'Você faz a ponte entre a descrição comercial de um fornecedor e o catálogo de materiais SAP de uma indústria.

Para cada ITEM recebido você escolhe, ENTRE OS CANDIDATOS LISTADOS, o material que descreve o mesmo produto físico. Regras:

1. Só pode responder com um `material_code` que apareça na lista de candidatos daquele item. Nunca invente código.
2. Se nenhum candidato for o mesmo produto, responda `material_code: null`. Errar o vínculo é pior do que não vincular: o vínculo errado contamina o histórico de preço e a auditoria de pedidos.
3. Compare o que identifica o produto: tipo do item, dimensões, capacidade, tensão, bitola, norma, material construtivo e fabricante. Marca diferente do mesmo produto é aceitável; especificação diferente não é.
4. Descrição de fornecedor costuma ser mais longa e comercial; a do SAP é abreviada e sem acento ("VALVULA ESF INOX 1.1/2" = "Válvula esfera em aço inox de 1 1/2 polegada"). Trate abreviação como equivalente.
5. `confianca` é de 0 a 1: use acima de 0,8 só quando todas as especificações conferem; entre 0,5 e 0,8 quando o produto é o mesmo mas falta confirmar detalhe; abaixo de 0,5 prefira responder null.
6. `justificativa` em uma frase curta, em português, dizendo o que fez você aceitar ou recusar.

Responda EXCLUSIVAMENTE com um JSON no formato:
{"resultados":[{"vinculo_id":"<id recebido>","material_code":"<código ou null>","confianca":<número>,"justificativa":"<frase>"}]}

Um objeto por item recebido, na mesma ordem.',
  jsonb_build_object('temperatura', 0, 'max_tokens', 8000, 'itens_por_lote', 25, 'candidatos_por_item', 12)
)
on conflict (chave) do nothing;
