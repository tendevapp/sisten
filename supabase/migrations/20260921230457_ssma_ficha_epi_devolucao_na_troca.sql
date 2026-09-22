-- =====================================================================
-- Ficha de EPI — devolução do EPI anterior na troca.
--
-- Cada item da nova ficha pode trazer `devolver_item_ids`: itens de fichas
-- anteriores do MESMO colaborador que voltam na troca. A devolução é gravada
-- na mesma transação da criação, com a data da nova entrega — se algo falhar,
-- nem a ficha nem as devoluções ficam pela metade.
-- =====================================================================

create or replace function public.ssma_ficha_epi_criar(p_ficha jsonb, p_itens jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_nome_autor text;
  v_pessoa uuid := (p_ficha ->> 'pessoa_id')::uuid;
  v_data date := coalesce(nullif(p_ficha ->> 'data_entrega', '')::date, current_date);
  v_devolver uuid;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A ficha precisa de ao menos um EPI.' using errcode = '22023';
  end if;

  select name into v_nome_autor from public.core_perfis where id = (auth.uid())::text;

  insert into public.ssma_fichas_epi (
    codigo, pessoa_id, registro, nome, cargo_rh, setor, funcao_id, funcao_nome,
    data_admissao, data_demissao, data_entrega, assinatura_colaborador,
    observacoes, criado_por, criado_por_nome
  ) values (
    p_ficha ->> 'codigo',
    v_pessoa,
    p_ficha ->> 'registro',
    p_ficha ->> 'nome',
    nullif(p_ficha ->> 'cargo_rh', ''),
    nullif(p_ficha ->> 'setor', ''),
    (p_ficha ->> 'funcao_id')::uuid,
    p_ficha ->> 'funcao_nome',
    nullif(p_ficha ->> 'data_admissao', '')::date,
    nullif(p_ficha ->> 'data_demissao', '')::date,
    v_data,
    p_ficha ->> 'assinatura_colaborador',
    nullif(p_ficha ->> 'observacoes', ''),
    (auth.uid())::text,
    v_nome_autor
  )
  returning id into v_id;

  insert into public.ssma_fichas_epi_itens (
    ficha_id, ordem, epi_book_id, requisito_id, grupo_epi, categoria, descricao,
    ca, codigo_sap, tamanho, quantidade, motivo, fora_da_matriz
  )
  select
    v_id,
    (item.ordinality - 1)::smallint,
    nullif(item.value ->> 'epi_book_id', '')::uuid,
    nullif(item.value ->> 'requisito_id', '')::uuid,
    item.value ->> 'grupo_epi',
    nullif(item.value ->> 'categoria', ''),
    item.value ->> 'descricao',
    nullif(item.value ->> 'ca', ''),
    nullif(item.value ->> 'codigo_sap', ''),
    nullif(item.value ->> 'tamanho', ''),
    (item.value ->> 'quantidade')::numeric,
    (item.value ->> 'motivo')::smallint,
    coalesce((item.value ->> 'fora_da_matriz')::boolean, false)
  from jsonb_array_elements(p_itens) with ordinality as item(value, ordinality);

  -- Devolução na troca: só itens ainda não devolvidos, de fichas ativas do
  -- mesmo colaborador. A RPC de devolução valida acesso e datas.
  for v_devolver in
    select distinct (ids.value)::uuid
      from jsonb_array_elements(p_itens) as item(value),
           jsonb_array_elements_text(coalesce(item.value -> 'devolver_item_ids', '[]'::jsonb)) as ids(value)
  loop
    if not exists (
      select 1
        from public.ssma_fichas_epi_itens i
        join public.ssma_fichas_epi f on f.id = i.ficha_id
       where i.id = v_devolver
         and f.pessoa_id = v_pessoa
         and f.id <> v_id
         and f.status = 'ATIVA'
         and i.data_devolucao is null
    ) then
      raise exception 'O EPI a devolver na troca não pertence a uma ficha ativa deste colaborador ou já foi devolvido.' using errcode = '22023';
    end if;
    perform public.ssma_ficha_epi_registrar_devolucao(
      v_devolver, v_data, 'Devolvido na troca — ficha ' || (p_ficha ->> 'codigo')
    );
  end loop;

  return v_id;
end;
$$;

revoke all on function public.ssma_ficha_epi_criar(jsonb, jsonb) from public, anon;
grant execute on function public.ssma_ficha_epi_criar(jsonb, jsonb) to authenticated;
