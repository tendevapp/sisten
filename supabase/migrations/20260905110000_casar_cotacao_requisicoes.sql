-- =====================================================================
-- Segunda fonte de evidência: as requisições de material (ME5A)
--
-- O casamento com pedidos só enxerga cotação que virou compra — sobraram 413
-- itens sem candidato. Mas as cotações de 2026 nasceram todas de itens de RM,
-- e a RM já traz o material SAP escolhido pelo requisitante
-- (`sap_me5a_rc.material`, preenchido em 2.419 das 2.652 linhas de 2026).
--
-- A diferença em relação ao casamento com pedidos: aqui não existe preço para
-- comparar, e o fornecedor não aparece na RM. Sobram o texto (peso 0,70), a
-- quantidade (0,20) e a proximidade da data (0,10). Sem o preço — o sinal mais
-- forte lá — a régua do automático sobe: só texto praticamente igual e
-- material sem concorrente fecha vínculo sozinho.
--
-- A RM é anterior à cotação (pede-se para depois cotar), por isso a janela
-- olha para trás: até 240 dias antes da proposta e 60 dias depois, que cobre a
-- proposta que chega antes da RM formal ser lançada.
--
-- Roda depois de `casar_cotacao_pedidos` e só mexe em quem ficou sem vínculo
-- válido — pedido casado, com preço batendo, continua sendo evidência melhor.
-- =====================================================================

-- Origem nova: o vínculo veio da requisição, não do pedido.
alter table public.sup_cotacao_item_vinculos
  drop constraint if exists sup_cotacao_item_vinculos_origem_check;

alter table public.sup_cotacao_item_vinculos
  add constraint sup_cotacao_item_vinculos_origem_check
  check (origem in ('pedido', 'requisicao', 'aprendido', 'ia', 'manual'));

-- Evidência do lado da RM, espelhando o que já existe para o pedido.
alter table public.sup_cotacao_item_vinculos add column if not exists rm_ri text;
alter table public.sup_cotacao_item_vinculos add column if not exists rm_requisicao text;
alter table public.sup_cotacao_item_vinculos add column if not exists rm_item text;
alter table public.sup_cotacao_item_vinculos add column if not exists rm_texto_breve text;
alter table public.sup_cotacao_item_vinculos add column if not exists rm_qtd numeric;
alter table public.sup_cotacao_item_vinculos add column if not exists rm_data date;
alter table public.sup_cotacao_item_vinculos add column if not exists rm_requisitante text;

create or replace function public.casar_cotacao_requisicoes(
  p_desde date default '2026-01-01',
  p_janela_antes integer default 240,
  p_janela_depois integer default 60,
  p_score_auto numeric default 0.78,
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
begin
  if (select auth.uid()) is not null and not public.pode_gerir_cotacoes() then
    raise exception 'Sem permissão para casar cotações com requisições.' using errcode = '42501';
  end if;

  -- Normalizar o texto das 2,6 mil RMs a cada comparação estoura o tempo da
  -- consulta; normaliza-se uma vez, com índice trigrama próprio.
  create temporary table tmp_rm on commit drop as
  select ri, requisicao_de_compra, item_reqc, material, texto_breve,
         public.f_norm_cotacao(texto_breve) as texto_norm,
         qtd_solicitada, unidade_de_medida, data_da_solicitacao, requisitante,
         coalesce(eliminado, false) as eliminado
    from public.sap_me5a_rc
   where material is not null
     and data_da_solicitacao >= p_desde
     -- RM eliminada não deixou de dizer qual material era; o que ela não
     -- serve é como prova de compra. Como aqui a evidência é o material
     -- escolhido, ela entra — mas nunca fecha vínculo sozinha.
     and texto_breve is not null;

  create index on tmp_rm using gin (texto_norm gin_trgm_ops);
  analyze tmp_rm;

  perform set_config('pg_trgm.similarity_threshold', '0.30', true);

  create temporary table tmp_rm_result on commit drop as
  with itens as (
    select v.id as vinculo_id, it.id as item_id, it.quantidade,
           public.f_norm_cotacao(it.descricao_produto) as desc_norm,
           coalesce(p.data_emissao, p.created_at::date) as data_base
      from public.sup_cotacao_item_vinculos v
      join public.sup_cotacao_proposta_itens it on it.id = v.proposta_item_id
      join public.sup_cotacao_propostas p on p.id = it.proposta_id
     -- Só quem ficou sem vínculo válido: 'auto' e 'confirmado' já têm resposta.
     where v.status in ('sem_candidato', 'sugerido')
       and public.f_norm_cotacao(it.descricao_produto) is not null
  ),
  candidatos as (
    select i.vinculo_id,
           r.material, r.texto_breve, r.ri, r.requisicao_de_compra, r.item_reqc,
           r.qtd_solicitada, r.data_da_solicitacao, r.requisitante, r.eliminado,
           similarity(i.desc_norm, r.texto_norm)::numeric as s_texto,
           case
             when i.quantidade is null or i.quantidade = 0 or r.qtd_solicitada is null then 0.5
             else greatest(0, 1 - abs(r.qtd_solicitada - i.quantidade) / i.quantidade)
           end as s_qtd,
           greatest(0, 1 - abs(r.data_da_solicitacao - i.data_base)::numeric
                        / nullif(p_janela_antes, 0)) as s_data
      from itens i
      join tmp_rm r on i.desc_norm % r.texto_norm
     where r.data_da_solicitacao between i.data_base - p_janela_antes
                                    and i.data_base + p_janela_depois
  ),
  pontuado as (
    select *, least(1, 0.70 * s_texto + 0.20 * s_qtd + 0.10 * s_data) as score
      from candidatos
  ),
  melhor_por_material as (
    select *, row_number() over (
             partition by vinculo_id, material order by score desc, data_da_solicitacao desc
           ) as rn_mat
      from pontuado
  ),
  ranqueado as (
    select *, row_number() over (partition by vinculo_id order by score desc) as rn
      from melhor_por_material
     where rn_mat = 1
  )
  select r.vinculo_id,
         r.material,
         m.description as material_descricao,
         round(r.score, 4) as score,
         jsonb_build_object('texto', round(r.s_texto, 4), 'qtd', round(r.s_qtd, 4),
                            'data', round(r.s_data, 4), 'fonte', 'requisicao') as sinais,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'material_code', o.material,
                    'descricao', o.texto_breve,
                    'score', round(o.score, 4),
                    'ri', o.ri,
                    'data_doc', o.data_da_solicitacao
                  ) order by o.score desc)
             from ranqueado o
            where o.vinculo_id = r.vinculo_id and o.rn between 2 and 5
         ), '[]'::jsonb) as candidatos,
         r.ri, r.requisicao_de_compra, r.item_reqc, r.texto_breve,
         r.qtd_solicitada, r.data_da_solicitacao, r.requisitante,
         -- Sem preço para confirmar, o automático exige texto praticamente
         -- igual E nenhum outro material perto: a RM diz o que se pediu, não
         -- o que se comprou.
         (r.score >= p_score_auto
          and r.s_texto >= 0.75
          and not r.eliminado
          and coalesce(r.score - (
                select max(o.score) from ranqueado o
                 where o.vinculo_id = r.vinculo_id and o.rn = 2
              ), 1) >= 0.08) as auto
    from ranqueado r
    left join public.sap_zl0169_162_catalogo m on m.material_code = r.material
   where r.rn = 1;

  select count(*) filter (where auto), count(*) filter (where not auto)
    into v_auto, v_sugeridos
    from tmp_rm_result;

  v_analisados := v_auto + v_sugeridos;

  if p_simular then
    return jsonb_build_object('simulado', true, 'itens_analisados', v_analisados,
                              'vinculos_auto', v_auto, 'sugestoes', v_sugeridos);
  end if;

  insert into public.sup_cotacao_vinculo_rodadas
    (tipo, parametros, itens_analisados, vinculos_auto, sugestoes, sem_candidato,
     executado_por, executado_por_nome)
  values
    ('requisicao',
     jsonb_build_object('desde', p_desde, 'janela_antes', p_janela_antes,
                        'janela_depois', p_janela_depois, 'score_auto', p_score_auto),
     v_analisados, v_auto, v_sugeridos, 0, p_executado_por, p_executado_por_nome)
  returning id into v_rodada;

  update public.sup_cotacao_item_vinculos v
     set status = case when t.auto then 'auto' else 'sugerido' end,
         origem = 'requisicao',
         material_code = t.material,
         material_descricao = t.material_descricao,
         score = t.score,
         sinais = t.sinais,
         candidatos = t.candidatos,
         rm_ri = t.ri,
         rm_requisicao = t.requisicao_de_compra,
         rm_item = t.item_reqc,
         rm_texto_breve = t.texto_breve,
         rm_qtd = t.qtd_solicitada,
         rm_data = t.data_da_solicitacao,
         rm_requisitante = t.requisitante,
         rodada_id = v_rodada,
         updated_at = now()
    from tmp_rm_result t
   where v.id = t.vinculo_id
     -- Quem não tinha nada aceita qualquer evidência; quem já tinha sugestão
     -- (normalmente vinda de pedido, com preço batendo) só troca por uma RM
     -- que pontue mais. Sem isso, rodar a RM depois do pedido rebaixaria
     -- sugestões boas.
     and (v.status = 'sem_candidato'
          or (v.status = 'sugerido' and coalesce(v.score, 0) < t.score));

  update public.sup_cotacao_proposta_itens it
     set material_code = v.material_code
    from public.sup_cotacao_item_vinculos v
   where v.proposta_item_id = it.id
     and v.status in ('auto', 'confirmado')
     and it.material_code is distinct from v.material_code;

  return jsonb_build_object('rodada_id', v_rodada, 'itens_analisados', v_analisados,
                            'vinculos_auto', v_auto, 'sugestoes', v_sugeridos);
end;
$$;

revoke all on function public.casar_cotacao_requisicoes(date, integer, integer, numeric, text, text, boolean) from public;
revoke execute on function public.casar_cotacao_requisicoes(date, integer, integer, numeric, text, text, boolean) from anon;
grant execute on function public.casar_cotacao_requisicoes(date, integer, integer, numeric, text, text, boolean) to authenticated;

-- A rodada agora tem um terceiro tipo.
alter table public.sup_cotacao_vinculo_rodadas
  drop constraint if exists sup_cotacao_vinculo_rodadas_tipo_check;

alter table public.sup_cotacao_vinculo_rodadas
  add constraint sup_cotacao_vinculo_rodadas_tipo_check
  check (tipo in ('deterministico', 'requisicao', 'ia'));
