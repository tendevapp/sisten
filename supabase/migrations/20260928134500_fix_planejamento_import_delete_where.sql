create or replace function public.planejamento_importar_acompanhamento(
  p_arquivo_bd text,
  p_arquivo_cronograma text,
  p_cabecalhos_bd jsonb,
  p_bd_rows jsonb,
  p_cronograma_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_importacao_id uuid;
  v_bd_count integer := 0;
  v_cronograma_count integer := 0;
begin
  if not ((select public.has_role('admin')) or (select public.has_role('coordenador_suprimentos'))) then
    raise exception 'Usuário sem permissão para importar o Acompanhamento Geral';
  end if;

  if jsonb_typeof(p_bd_rows) <> 'array' or jsonb_array_length(p_bd_rows) = 0 then
    raise exception 'A planilha BD_ACOMPANHAMENTO_GERAL não possui linhas de dados';
  end if;

  insert into public.planejamento_importacoes (arquivo_bd, arquivo_cronograma, cabecalhos_bd, linhas_bd, linhas_cronograma)
  values (p_arquivo_bd, nullif(p_arquivo_cronograma, ''), coalesce(p_cabecalhos_bd, '[]'::jsonb), jsonb_array_length(p_bd_rows), jsonb_array_length(coalesce(p_cronograma_rows, '[]'::jsonb)))
  returning id into v_importacao_id;

  delete from public.bd_acompanhamento_geral where id is not null;
  delete from public.planejamento_cronograma where id is not null;

  insert into public.bd_acompanhamento_geral (
    importacao_id, linha_origem, bd, sequencial, tramo, projeto, descricao, posto_origem,
    inicio, turno_inicio, calandra, termino_nav01, turno_termino_nav01, total_nav01,
    data_inicio_internos, turno_inicio_internos, data_termino_saw3, turno_termino_saw3,
    total_turno_saw3, data_termino_internos, turno_lib_jato, qtd_reparos, metragem_reparos,
    total_turno_internos, termino_final, turno_termino_final, total_turno_final, marcador_x,
    data_expedicao, cort_x_expedicao, marcador_x_expedicao, numero_torre, lead_time_corte,
    lead_time_calandra, tempo_armazenagem, raw_data
  )
  select
    v_importacao_id,
    nullif(row->>'linha_origem', '')::integer,
    nullif(row->>'bd', ''),
    nullif(row->>'sequencial', '')::integer,
    nullif(row->>'tramo', ''),
    nullif(row->>'projeto', ''),
    nullif(row->>'descricao', ''),
    nullif(row->>'posto_origem', ''),
    nullif(row->>'inicio', '')::date,
    nullif(row->>'turno_inicio', '')::integer,
    nullif(row->>'calandra', '')::date,
    nullif(row->>'termino_nav01', '')::date,
    nullif(row->>'turno_termino_nav01', '')::integer,
    nullif(row->>'total_nav01', '')::numeric,
    nullif(row->>'data_inicio_internos', '')::date,
    nullif(row->>'turno_inicio_internos', '')::integer,
    nullif(row->>'data_termino_saw3', '')::date,
    nullif(row->>'turno_termino_saw3', '')::integer,
    nullif(row->>'total_turno_saw3', '')::numeric,
    nullif(row->>'data_termino_internos', '')::date,
    nullif(row->>'turno_lib_jato', '')::integer,
    nullif(row->>'qtd_reparos', '')::numeric,
    nullif(row->>'metragem_reparos', '')::numeric,
    nullif(row->>'total_turno_internos', '')::numeric,
    nullif(row->>'termino_final', '')::date,
    nullif(row->>'turno_termino_final', '')::integer,
    nullif(row->>'total_turno_final', '')::numeric,
    nullif(row->>'marcador_x', ''),
    nullif(row->>'data_expedicao', '')::date,
    nullif(row->>'cort_x_expedicao', ''),
    nullif(row->>'marcador_x_expedicao', ''),
    nullif(row->>'numero_torre', '')::integer,
    nullif(row->>'lead_time_corte', '')::numeric,
    nullif(row->>'lead_time_calandra', '')::numeric,
    nullif(row->>'tempo_armazenagem', '')::numeric,
    coalesce(row->'raw_data', '{}'::jsonb)
  from jsonb_array_elements(p_bd_rows) as rows(row);

  insert into public.planejamento_cronograma (importacao_id, linha_origem, sequencial, posto, raw_data)
  select v_importacao_id,
         nullif(row->>'linha_origem', '')::integer,
         nullif(row->>'sequencial', '')::integer,
         nullif(row->>'posto', ''),
         coalesce(row->'raw_data', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_cronograma_rows, '[]'::jsonb)) as rows(row)
  where nullif(row->>'sequencial', '') is not null;

  get diagnostics v_bd_count = row_count;
  select count(*)::integer into v_cronograma_count from public.planejamento_cronograma where importacao_id = v_importacao_id;

  update public.planejamento_importacoes
  set status = 'sucesso', linhas_bd = v_bd_count, linhas_cronograma = v_cronograma_count, concluido_em = now()
  where id = v_importacao_id;

  return jsonb_build_object('importacao_id', v_importacao_id, 'linhas_bd', v_bd_count, 'linhas_cronograma', v_cronograma_count);
exception when others then
  if v_importacao_id is not null then
    update public.planejamento_importacoes set status = 'erro', mensagem_erro = sqlerrm, concluido_em = now() where id = v_importacao_id;
  end if;
  raise;
end;
$$;

revoke all on function public.planejamento_importar_acompanhamento(text, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.planejamento_importar_acompanhamento(text, text, jsonb, jsonb, jsonb) to authenticated;
