-- =====================================================================
-- Vínculo item cotado → material SAP: o motor
--
-- `casar_cotacao_pedidos` é o processo repetível. Roda quantas vezes for
-- preciso, sobre a base que houver no momento: a cada nova carga de propostas
-- ou de pedidos, rodar de novo recalcula só o que ainda não tem decisão
-- humana. Vínculo `confirmado` ou `rejeitado` por gente nunca é tocado — é
-- isso que faz a base crescer em vez de se reescrever.
--
-- Como um item cotado acha seu material: entre os itens de pedido do MESMO
-- fornecedor (CNPJ), colocados na janela de tempo depois da proposta, mede-se
--   * preço unitário  (peso 0,45) — o sinal mais forte: PO fechado no preço
--                      cotado é quase sempre aquele item;
--   * descrição       (peso 0,35) — trigrama entre a descrição do fornecedor
--                      e o texto breve do material no pedido;
--   * quantidade      (peso 0,10) — desempata quando o fornecedor cotou o
--                      mesmo preço para itens diferentes;
--   * proximidade da data (peso 0,10) — pedido logo após a proposta vale mais;
--   * RI igual        (bônus 0,25) — quando os dois lados têm RI, é vínculo
--                      direto, não estatística.
--
-- Score alto E preço praticamente igual E material vencedor destacado do
-- segundo colocado ⇒ grava sozinho (`status = 'auto'`). Todo o resto vira
-- `sugerido` para a curadoria, e o que não achou nenhum pedido plausível vira
-- `sem_candidato` — a fila que a análise por IA recebe.
-- =====================================================================

-- Normalização única das descrições comparadas. Tira acento, caixa e
-- pontuação: "Válvula 1/2\" NPT" e "VALVULA 1 2 NPT" precisam colidir no
-- trigrama, senão o mesmo item de dois fornecedores nunca se encontra.
create or replace function public.f_norm_cotacao(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path to 'public', 'pg_temp'
as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(public.f_unaccent(upper(coalesce(p_texto, ''))), '[^A-Z0-9]+', ' ', 'g'),
      '\s+', ' ', 'g')),
    '')
$$;

-- ------------------------------------------------------------------ motor
create or replace function public.casar_cotacao_pedidos(
  p_desde date default '2026-01-01',
  p_janela_dias integer default 180,
  p_score_auto numeric default 0.80,
  p_executado_por text default null,
  p_executado_por_nome text default null,
  p_simular boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rodada uuid;
  v_analisados integer := 0;
  v_auto integer := 0;
  v_sugeridos integer := 0;
  v_sem integer := 0;
begin
  -- Sem usuário logado significa execução de servidor (Edge Function com
  -- service_role, console SQL, rotina agendada) — o EXECUTE já está revogado
  -- de `public`, então só chega aqui quem tem grant. Com usuário logado, vale
  -- o mesmo gate das tabelas de cotação.
  if (select auth.uid()) is not null and not public.pode_gerir_cotacoes() then
    raise exception 'Sem permissão para casar cotações com pedidos.' using errcode = '42501';
  end if;

  create temporary table tmp_vinc_result (
    proposta_item_id uuid primary key,
    material_code text,
    material_descricao text,
    score numeric,
    sinais jsonb,
    candidatos jsonb,
    po_doc_compra text,
    po_item text,
    po_data_doc date,
    po_material text,
    po_txt_breve text,
    po_preco_unit numeric,
    po_qtd numeric,
    po_ri text,
    po_cnpj text,
    auto boolean
  ) on commit drop;

  with itens as (
    -- Só o que ainda não tem decisão humana: confirmado/rejeitado é palavra
    -- final e sobrevive a todas as rodadas seguintes.
    select it.id,
           it.descricao_produto,
           it.preco_unitario,
           it.quantidade,
           it.ri,
           public.f_norm_cotacao(it.descricao_produto) as desc_norm,
           regexp_replace(coalesce(p.fornecedor_cnpj, ''), '\D', '', 'g') as cnpj,
           coalesce(p.data_emissao, p.created_at::date) as data_base
      from public.sup_cotacao_proposta_itens it
      join public.sup_cotacao_propostas p on p.id = it.proposta_id
      left join public.sup_cotacao_item_vinculos v on v.proposta_item_id = it.id
     where (v.id is null or v.status not in ('confirmado', 'rejeitado'))
  ),
  pedidos as (
    -- Recorte do universo de pedidos: só o período pedido e só fornecedores
    -- que aparecem em alguma proposta — evita normalizar 66 mil linhas.
    select po.material,
           po.txt_breve,
           public.f_norm_cotacao(po.txt_breve) as txt_norm,
           po.doc_compra,
           po.item,
           po.data_doc,
           po.preco_liquido_unit,
           po.qtd_pedido,
           po.ri,
           regexp_replace(coalesce(po.cnpj, po.cnpj_fornecedor, ''), '\D', '', 'g') as cnpj
      from public.sap_zl0132_po po
     where po.data_doc >= p_desde
       and po.material is not null
       and regexp_replace(coalesce(po.cnpj, po.cnpj_fornecedor, ''), '\D', '', 'g')
           in (select cnpj from itens where length(cnpj) = 14)
  ),
  candidatos as (
    select i.id as item_id,
           pe.*,
           -- Preço: 1,0 no preço idêntico, caindo a zero em 5% de diferença.
           case
             when i.preco_unitario is null or i.preco_unitario = 0 or pe.preco_liquido_unit is null then 0
             else greatest(0, 1 - (abs(pe.preco_liquido_unit - i.preco_unitario) / i.preco_unitario) / 0.05)
           end as s_preco,
           -- `similarity` devolve real; sem o cast o score inteiro vira double e
           -- `round(x, 4)` deixa de existir.
           coalesce(similarity(i.desc_norm, pe.txt_norm), 0)::numeric as s_texto,
           case
             when i.quantidade is null or i.quantidade = 0 or pe.qtd_pedido is null then 0.5
             else greatest(0, 1 - abs(pe.qtd_pedido - i.quantidade) / i.quantidade)
           end as s_qtd,
           greatest(0, 1 - greatest(pe.data_doc - i.data_base, 0)::numeric / nullif(p_janela_dias, 0)) as s_data,
           case when i.ri is not null and pe.ri = i.ri then 1 else 0 end as s_ri
      from itens i
      join pedidos pe on pe.cnpj = i.cnpj
     where length(i.cnpj) = 14
       -- Pedido anterior à proposta só entra se for de poucos dias antes
       -- (proposta datada depois da colocação acontece, atraso não).
       and pe.data_doc between i.data_base - 15 and i.data_base + p_janela_dias
  ),
  pontuado as (
    select *,
           least(1, 0.45 * s_preco + 0.35 * s_texto + 0.10 * s_qtd + 0.10 * s_data + 0.25 * s_ri) as score
      from candidatos
     where s_preco > 0 or s_texto >= 0.25
  ),
  -- Um material pode aparecer em vários pedidos do mesmo fornecedor; o que
  -- interessa é o melhor pedido de cada material, senão o "segundo colocado"
  -- seria o mesmo material e a regra de ambiguidade nunca dispararia.
  melhor_por_material as (
    select *, row_number() over (partition by item_id, material order by score desc, data_doc desc) as rn_mat
      from pontuado
  ),
  ranqueado as (
    select *, row_number() over (partition by item_id order by score desc) as rn
      from melhor_por_material
     where rn_mat = 1
  )
  insert into tmp_vinc_result
  select r.item_id,
         r.material,
         m.description,
         round(r.score, 4),
         jsonb_build_object(
           'preco', round(r.s_preco, 4), 'texto', round(r.s_texto::numeric, 4),
           'qtd', round(r.s_qtd, 4), 'data', round(r.s_data, 4), 'ri', r.s_ri
         ),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'material_code', o.material,
                    'descricao', o.txt_breve,
                    'score', round(o.score, 4),
                    'preco_unit', o.preco_liquido_unit,
                    'doc_compra', o.doc_compra,
                    'data_doc', o.data_doc
                  ) order by o.score desc)
             from ranqueado o
            where o.item_id = r.item_id and o.rn between 2 and 5
         ), '[]'::jsonb),
         r.doc_compra, r.item, r.data_doc, r.material, r.txt_breve,
         r.preco_liquido_unit, r.qtd_pedido, r.ri, r.cnpj,
         -- Grava sozinho só com preço praticamente igual, score alto e uma
         -- folga clara sobre o segundo material — três travas, não uma.
         -- Preço idêntico com descrição minimamente parecida já é vínculo:
         -- na amostra de 2026 todos os casos assim conferiram na inspeção.
         -- O score composto entra como segundo caminho para o item que erra
         -- centavos no preço mas acerta descrição, quantidade e data.
         ((r.score >= p_score_auto or (r.s_preco >= 0.98 and r.s_texto >= 0.30))
          and r.s_preco >= 0.90
          and coalesce(r.score - (
                select max(o.score) from ranqueado o
                 where o.item_id = r.item_id and o.rn = 2
              ), 1) >= 0.05)
    from ranqueado r
    left join public.sap_zl0169_162_catalogo m on m.material_code = r.material
   where r.rn = 1;

  select count(*) filter (where auto),
         count(*) filter (where not auto)
    into v_auto, v_sugeridos
    from tmp_vinc_result;

  select count(*) into v_analisados
    from public.sup_cotacao_proposta_itens it
    left join public.sup_cotacao_item_vinculos v on v.proposta_item_id = it.id
   where (v.id is null or v.status not in ('confirmado', 'rejeitado'));

  v_sem := v_analisados - v_auto - v_sugeridos;

  if p_simular then
    return jsonb_build_object(
      'simulado', true, 'itens_analisados', v_analisados, 'vinculos_auto', v_auto,
      'sugestoes', v_sugeridos, 'sem_candidato', v_sem
    );
  end if;

  insert into public.sup_cotacao_vinculo_rodadas
    (tipo, parametros, itens_analisados, vinculos_auto, sugestoes, sem_candidato,
     executado_por, executado_por_nome)
  values
    ('deterministico',
     jsonb_build_object('desde', p_desde, 'janela_dias', p_janela_dias, 'score_auto', p_score_auto),
     v_analisados, v_auto, v_sugeridos, v_sem, p_executado_por, p_executado_por_nome)
  returning id into v_rodada;

  insert into public.sup_cotacao_item_vinculos as v
    (proposta_item_id, material_code, material_descricao, status, origem, score, sinais,
     candidatos, po_doc_compra, po_item, po_data_doc, po_material, po_txt_breve,
     po_preco_unit, po_qtd, po_ri, po_cnpj, rodada_id)
  select proposta_item_id, material_code, material_descricao,
         case when auto then 'auto' else 'sugerido' end, 'pedido', score, sinais,
         candidatos, po_doc_compra, po_item, po_data_doc, po_material, po_txt_breve,
         po_preco_unit, po_qtd, po_ri, po_cnpj, v_rodada
    from tmp_vinc_result
  on conflict (proposta_item_id) do update set
    material_code = excluded.material_code,
    material_descricao = excluded.material_descricao,
    status = excluded.status,
    origem = excluded.origem,
    score = excluded.score,
    sinais = excluded.sinais,
    candidatos = excluded.candidatos,
    po_doc_compra = excluded.po_doc_compra,
    po_item = excluded.po_item,
    po_data_doc = excluded.po_data_doc,
    po_material = excluded.po_material,
    po_txt_breve = excluded.po_txt_breve,
    po_preco_unit = excluded.po_preco_unit,
    po_qtd = excluded.po_qtd,
    po_ri = excluded.po_ri,
    po_cnpj = excluded.po_cnpj,
    rodada_id = excluded.rodada_id,
    updated_at = now()
  where v.status not in ('confirmado', 'rejeitado');

  -- O que sobrou sem nenhum pedido plausível: fila da análise por IA.
  insert into public.sup_cotacao_item_vinculos as v
    (proposta_item_id, status, origem, rodada_id)
  select it.id, 'sem_candidato', 'pedido', v_rodada
    from public.sup_cotacao_proposta_itens it
    left join public.sup_cotacao_item_vinculos ex on ex.proposta_item_id = it.id
   where (ex.id is null or ex.status not in ('confirmado', 'rejeitado'))
     and not exists (select 1 from tmp_vinc_result t where t.proposta_item_id = it.id)
  on conflict (proposta_item_id) do update set
    status = 'sem_candidato',
    material_code = null,
    material_descricao = null,
    score = null,
    sinais = '{}'::jsonb,
    candidatos = '[]'::jsonb,
    rodada_id = excluded.rodada_id,
    updated_at = now()
  where v.status not in ('confirmado', 'rejeitado', 'ia');

  -- Espelha o vínculo válido na coluna que a tela de histórico já lê.
  update public.sup_cotacao_proposta_itens it
     set material_code = v.material_code
    from public.sup_cotacao_item_vinculos v
   where v.proposta_item_id = it.id
     and v.status in ('auto', 'confirmado')
     and it.material_code is distinct from v.material_code;

  return jsonb_build_object(
    'rodada_id', v_rodada, 'itens_analisados', v_analisados, 'vinculos_auto', v_auto,
    'sugestoes', v_sugeridos, 'sem_candidato', v_sem
  );
end;
$$;

revoke all on function public.casar_cotacao_pedidos(date, integer, numeric, text, text, boolean) from public;
grant execute on function public.casar_cotacao_pedidos(date, integer, numeric, text, text, boolean) to authenticated;

-- ------------------------------------------------------------- curadoria
-- Confirmar não é só mudar um status: é o que alimenta
-- `sup_cotacao_descricao_map`, a memória que faz a próxima cotação do mesmo
-- fornecedor já chegar com o vínculo sugerido.
create or replace function public.confirmar_vinculo_cotacao(
  p_vinculo_id uuid,
  p_aceitar boolean,
  p_material_code text default null,
  p_usuario_id text default null,
  p_usuario_nome text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v public.sup_cotacao_item_vinculos%rowtype;
  v_material text;
  v_desc text;
  v_item record;
begin
  if (select auth.uid()) is not null and not public.pode_gerir_cotacoes() then
    raise exception 'Sem permissão para confirmar vínculos de cotação.' using errcode = '42501';
  end if;

  select * into v from public.sup_cotacao_item_vinculos where id = p_vinculo_id;
  if not found then
    raise exception 'Vínculo % não encontrado.', p_vinculo_id using errcode = 'P0002';
  end if;

  if not p_aceitar then
    update public.sup_cotacao_item_vinculos
       set status = 'rejeitado', material_code = null, material_descricao = null,
           confirmado_por = p_usuario_id, confirmado_por_nome = p_usuario_nome,
           confirmado_em = now(), observacao = p_observacao, updated_at = now()
     where id = p_vinculo_id;

    update public.sup_cotacao_proposta_itens
       set material_code = null
     where id = v.proposta_item_id;

    return jsonb_build_object('status', 'rejeitado');
  end if;

  v_material := coalesce(nullif(trim(p_material_code), ''), v.material_code);
  if v_material is null then
    raise exception 'Confirmação exige um código de material.' using errcode = '22023';
  end if;

  select description into v_desc
    from public.sap_zl0169_162_catalogo
   where material_code = v_material
   limit 1;

  update public.sup_cotacao_item_vinculos
     set status = 'confirmado',
         material_code = v_material,
         material_descricao = coalesce(v_desc, material_descricao),
         -- Trocar o material na tela é escolha de gente, não do casamento.
         origem = case when v_material is distinct from v.material_code then 'manual' else origem end,
         confirmado_por = p_usuario_id, confirmado_por_nome = p_usuario_nome,
         confirmado_em = now(), observacao = p_observacao, updated_at = now()
   where id = p_vinculo_id;

  update public.sup_cotacao_proposta_itens
     set material_code = v_material
   where id = v.proposta_item_id;

  select it.descricao_produto, it.codigo_produto, it.unidade_medida,
         regexp_replace(coalesce(p.fornecedor_cnpj, ''), '\D', '', 'g') as cnpj
    into v_item
    from public.sup_cotacao_proposta_itens it
    join public.sup_cotacao_propostas p on p.id = it.proposta_id
   where it.id = v.proposta_item_id;

  if v_item.cnpj is not null and public.f_norm_cotacao(v_item.descricao_produto) is not null then
    insert into public.sup_cotacao_descricao_map
      (fornecedor_cnpj, descricao_norm, descricao_original, codigo_produto, material_code,
       unidade_medida, vezes_confirmado, ultima_confirmacao, ultimo_usuario_nome)
    values
      (v_item.cnpj, public.f_norm_cotacao(v_item.descricao_produto), v_item.descricao_produto,
       v_item.codigo_produto, v_material, v_item.unidade_medida, 1, now(), p_usuario_nome)
    on conflict (fornecedor_cnpj, descricao_norm) do update set
      material_code = excluded.material_code,
      codigo_produto = coalesce(excluded.codigo_produto, public.sup_cotacao_descricao_map.codigo_produto),
      unidade_medida = coalesce(excluded.unidade_medida, public.sup_cotacao_descricao_map.unidade_medida),
      vezes_confirmado = public.sup_cotacao_descricao_map.vezes_confirmado + 1,
      ultima_confirmacao = now(),
      ultimo_usuario_nome = excluded.ultimo_usuario_nome;
  end if;

  return jsonb_build_object('status', 'confirmado', 'material_code', v_material, 'descricao', v_desc);
end;
$$;

revoke all on function public.confirmar_vinculo_cotacao(uuid, boolean, text, text, text, text) from public;
grant execute on function public.confirmar_vinculo_cotacao(uuid, boolean, text, text, text, text) to authenticated;

-- ------------------------------------------------------------- auditoria
-- Uma linha por item de pedido que tenha cotação vinculada para o mesmo
-- material. Compara o que foi comprado com o que havia sido cotado e vigia
-- exatamente as três divergências pedidas: preço acima do cotado, fornecedor
-- que não era o de menor preço e quantidade fora do cotado.
create or replace view public.vw_cotacao_pedido_auditoria
with (security_invoker = true) as
with cotado as (
  select v.material_code,
         regexp_replace(coalesce(p.fornecedor_cnpj, ''), '\D', '', 'g') as cnpj,
         p.fornecedor_razao_social,
         p.id as proposta_id,
         it.id as proposta_item_id,
         it.descricao_produto,
         it.preco_unitario,
         it.quantidade,
         coalesce(p.data_emissao, p.created_at::date) as data_proposta
    from public.sup_cotacao_item_vinculos v
    join public.sup_cotacao_proposta_itens it on it.id = v.proposta_item_id
    join public.sup_cotacao_propostas p on p.id = it.proposta_id
   where v.status in ('auto', 'confirmado')
     and v.material_code is not null
     and it.preco_unitario is not null
),
po as (
  select po.id as po_id, po.doc_compra, po.item, po.data_doc, po.material, po.txt_breve,
         po.preco_liquido_unit, po.qtd_pedido, po.ri, po.reqc,
         coalesce(po.fornecedor_nome, po.fornecedor) as fornecedor_pedido,
         regexp_replace(coalesce(po.cnpj, po.cnpj_fornecedor, ''), '\D', '', 'g') as cnpj
    from public.sap_zl0132_po po
   where po.material is not null
     and po.preco_liquido_unit is not null
),
-- Cotação vigente do material na data do pedido: a proposta mais recente de
-- cada fornecedor nos 180 dias anteriores. Cotação posterior não julga o
-- pedido — ninguém compra com informação que ainda não existia.
vigente as (
  select * from (
    select po.po_id, po.cnpj as cnpj_pedido, c.*,
           row_number() over (partition by po.po_id, c.cnpj order by c.data_proposta desc) as rn
      from po
      join cotado c
        on c.material_code = po.material
       and c.data_proposta between po.data_doc - 180 and po.data_doc
  ) t where rn = 1
),
resumo as (
  select po_id, min(preco_unitario) as menor_preco_cotado, count(distinct cnpj) as fornecedores_cotados
    from vigente group by po_id
),
menor as (
  select distinct on (po_id)
         po_id, cnpj as cnpj_menor_preco, fornecedor_razao_social as fornecedor_menor_preco
    from vigente
   order by po_id, preco_unitario, data_proposta desc
),
-- A cotação do próprio fornecedor que levou o pedido, quando ele cotou.
propria as (
  select po_id, proposta_id, proposta_item_id, descricao_produto, preco_unitario, quantidade, data_proposta
    from vigente where cnpj = cnpj_pedido
)
select po.po_id, po.doc_compra, po.item, po.data_doc, po.material, po.txt_breve, po.ri, po.reqc,
       po.fornecedor_pedido, po.cnpj as cnpj_pedido, po.preco_liquido_unit as preco_pedido, po.qtd_pedido,
       r.fornecedores_cotados, r.menor_preco_cotado,
       m.fornecedor_menor_preco, m.cnpj_menor_preco,
       pr.proposta_id, pr.proposta_item_id, pr.descricao_produto as descricao_cotada,
       pr.preco_unitario as preco_cotado_fornecedor, pr.quantidade as qtd_cotada, pr.data_proposta,
       (po.preco_liquido_unit - pr.preco_unitario) as delta_preco_unit,
       ((po.preco_liquido_unit - r.menor_preco_cotado) * coalesce(po.qtd_pedido, 0)) as custo_versus_menor,
       (pr.preco_unitario is not null and po.preco_liquido_unit > pr.preco_unitario + 0.01) as div_preco,
       (po.cnpj is distinct from m.cnpj_menor_preco) as div_fornecedor,
       (pr.quantidade is not null
        and abs(coalesce(po.qtd_pedido, 0) - pr.quantidade) > 0.001) as div_quantidade
  from po
  join resumo r on r.po_id = po.po_id
  join menor m on m.po_id = po.po_id
  left join propria pr on pr.po_id = po.po_id;

grant select on public.vw_cotacao_pedido_auditoria to authenticated;
