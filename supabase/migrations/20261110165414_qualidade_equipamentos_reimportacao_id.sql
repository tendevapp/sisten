create or replace function public.qua_equipamentos_importar(p_linhas jsonb, p_arquivo text, p_data date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare linha jsonb; novos integer:=0; ignorados integer:=0; inserido uuid;
begin
  if not coalesce(public.qua_equipamentos_pode_acessar(),false) then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 5000 or jsonb_array_length(p_linhas)=0 then raise exception 'Importe de 1 a 5.000 registros por arquivo.'; end if;
  perform pg_advisory_xact_lock(hashtext('qua_equipamentos_importar'));
  perform set_config('sisten.qua_equipamento_evento', jsonb_build_object('tipo','Importação','descricao','Importação de '||p_arquivo,'data_evento',p_data)::text,true);
  for linha in select value from jsonb_array_elements(p_linhas) loop
    -- Exportações usam o UUID, inclusive para cadastros manuais sem origem de planilha.
    if exists(select 1 from public.qua_equipamentos where 'sisten:'||id::text = linha->>'origem_chave') then
      ignorados := ignorados + 1;
      continue;
    end if;
    if nullif(linha->>'origem_chave','') is null then raise exception 'Linha sem chave de origem.'; end if;
    insert into public.qua_equipamentos(codigo,data_registro,categoria,dados,origem_chave,origem_arquivo,origem_linha,origem_dados)
    values(linha->>'codigo',p_data,linha->>'categoria',linha->'dados',linha->>'origem_chave',p_arquivo,(linha->>'origem_linha')::integer,linha->'origem_dados')
    on conflict (origem_chave) do nothing returning id into inserido;
    if inserido is null then ignorados:=ignorados+1; else novos:=novos+1; end if;
  end loop;
  return jsonb_build_object('novos',novos,'ignorados',ignorados);
end;
$$;
