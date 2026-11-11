-- Contingências do estoque: cada achado traz os itens do registro (material,
-- descrição, quantidade, unidade e, na RQB, o doc. SAP de cada item) para o
-- almoxarifado tratar sem abrir o registro.
--
-- `alm_contingencias_verificar` ganha a coluna `itens jsonb`. Mudar o tipo de
-- retorno exige DROP + CREATE; as permissões são as mesmas de antes
-- (revoke de public/anon, execute para authenticated).

create or replace function public.alm_contingencia_itens(p_entidade text, p_ref_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(case p_entidade
    when 'req_balcao' then (
      select jsonb_agg(jsonb_build_object(
               'material', i.material, 'descricao', i.descricao, 'quantidade', i.quantidade,
               'unidade', i.unidade, 'doc_sap', i.doc_sap) order by i.ordem, i.created_at)
        from public.alm_req_balcao_itens i where i.requisicao_id = p_ref_id)
    when 'sol_extra' then (
      select jsonb_agg(jsonb_build_object(
               'material', x->>'material', 'descricao', x->>'descricao',
               'quantidade', nullif(x->>'quantidade', '')::numeric, 'unidade', x->>'unidade') order by o)
        from public.alm_solicitacao_extra s
        cross join lateral jsonb_array_elements(coalesce(s.itens, '[]'::jsonb)) with ordinality as e(x, o)
       where s.id = p_ref_id)
    when 'ficha_epi' then (
      select jsonb_agg(jsonb_build_object(
               'material', i.codigo_sap,
               'descricao', concat_ws(' · ', i.descricao,
                 case when nullif(i.tamanho, '') is not null and i.descricao !~* ('TAM\.?\s*' || i.tamanho) then 'TAM. ' || i.tamanho end,
                 case when i.ca is not null then 'CA ' || i.ca end),
               'quantidade', i.quantidade, 'unidade', 'UN') order by i.ordem, i.created_at)
        from public.ssma_fichas_epi_itens i where i.ficha_id = p_ref_id)
  end, '[]'::jsonb);
$$;
revoke all on function public.alm_contingencia_itens(text, uuid) from public, anon, authenticated;

drop function if exists public.alm_contingencias_verificar(boolean);
create function public.alm_contingencias_verificar(p_incluir_tratadas boolean default false)
returns table(verificacao text, severidade text, entidade text, referencia text, ref_id uuid, data date, dias int,
              titulo text, detalhe text, acao text, acao_ref text, tratativa jsonb, itens jsonb)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.alm_contingencia_pode() then
    raise exception 'Sem acesso às contingências do almoxarifado.' using errcode = '42501';
  end if;
  return query
    select a.verificacao, a.severidade, a.entidade, a.referencia, a.ref_id, a.data, a.dias, a.titulo, a.detalhe, a.acao, a.acao_ref,
           case when t.id is not null then jsonb_build_object('id', t.id, 'justificativa', t.justificativa,
                                                            'por', t.tratado_por_nome, 'em', t.created_at) end,
           public.alm_contingencia_itens(a.entidade, a.ref_id)
      from public.alm_contingencias_achados() a
      left join public.alm_contingencias_tratativas t
        on t.verificacao = a.verificacao and t.referencia = a.referencia and t.revogada_em is null
     where p_incluir_tratadas or t.id is null
     order by case a.severidade when 'critica' then 0 when 'alta' then 1 else 2 end, a.data nulls last, a.referencia;
end;
$$;
revoke all on function public.alm_contingencias_verificar(boolean) from public, anon;
grant execute on function public.alm_contingencias_verificar(boolean) to authenticated;
