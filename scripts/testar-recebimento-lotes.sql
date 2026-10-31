-- Executar apenas em supabase-sisten (fwezzgduywgyhxinjurn).
-- Toda a conferência de teste e seu histórico são revertidos ao final.
begin;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by id limit 1), true);
set local role authenticated;
do $$
declare
  v_id uuid; v_resultado jsonb; v_itens jsonb; v_lista jsonb;
  v_antes jsonb; v_falhou boolean; v_usuario jsonb;
begin
  assert auth.uid() is not null, 'Precisa de um perfil existente para o teste transacional';
  v_usuario := jsonb_build_object('id',auth.uid(),'nome','Teste transacional de lotes');
  v_resultado := public.alm_receb_registrar_conferencia(
    jsonb_build_object('data',current_date,'retorno_remessa',true,'tipo_item','consumo',
      'criado_por_id',auth.uid(),'criado_por_nome','Teste transacional de lotes'),
    '[{"material_code":"TESTE-LOTES-A","descricao":"Teste lotes A","unidade":"PC","qtd_recebida":5,
       "conferido":true,"divergencia":false,"item_manual":true,"observacao":"Preservar observação",
       "nota_fiscal":"NF-TESTE","evidencias":[],"lotes_validade":[
         {"lote":" A-01 ","validade":"2027-03-31"},{"lote":"B-02","validade":"2028-08-15"},
         {"lote":" ","validade":null}]},
      {"material_code":"TESTE-LOTES-B","qtd_recebida":2,"conferido":true,"divergencia":false,"item_manual":true}]', null);
  v_id := (v_resultado->>'id')::uuid;
  select lotes_validade into v_lista from public.alm_receb_conferencia_itens
    where conferencia_id=v_id and material_code='TESTE-LOTES-A';
  assert v_lista='[{"lote":"A-01","validade":"2027-03-31"},{"lote":"B-02","validade":"2028-08-15"}]'::jsonb,
    'Criação não preservou os dois pares ou não descartou a linha vazia';
  assert (select lotes_validade='[]'::jsonb from public.alm_receb_conferencia_itens
    where conferencia_id=v_id and material_code='TESTE-LOTES-B'), 'Item sem lote precisa continuar opcional';
  v_antes := v_lista;

  perform public.alm_receb_editar_conferencia(v_id,'{"observacao":"Edição do cabeçalho"}',null,v_usuario);
  assert (select lotes_validade=v_antes from public.alm_receb_conferencia_itens
    where conferencia_id=v_id and material_code='TESTE-LOTES-A'), 'Edição parcial apagou lotes';

  select jsonb_agg(case when material_code='TESTE-LOTES-A' then
      to_jsonb(i)||'{"lotes_validade":[{"lote":"A-01","validade":"2029-01-01"},{"lote":null,"validade":"2028-08-15"},{"lote":"C-03","validade":null}]}'::jsonb
      else to_jsonb(i) end order by material_code) into v_itens
    from public.alm_receb_conferencia_itens i where conferencia_id=v_id;
  perform public.alm_receb_editar_conferencia(v_id,'{}',v_itens,v_usuario);
  select lotes_validade into v_lista from public.alm_receb_conferencia_itens
    where conferencia_id=v_id and material_code='TESTE-LOTES-A';
  assert v_lista=v_itens->0->'lotes_validade', 'Edição perdeu lote ou validade opcional';
  assert exists(select 1 from public.alm_receb_alteracoes a, jsonb_array_elements(a.alteracoes) x
    where a.entidade_id=v_id and x->>'campo'='lotes_validade' and (x->>'de')::jsonb->0->'lotes'=v_antes),
    'Mudança só nos lotes precisa aparecer no histórico';
  assert (select observacao='Preservar observação' and nota_fiscal='NF-TESTE' and qtd_recebida=5
    from public.alm_receb_conferencia_itens where conferencia_id=v_id and material_code='TESTE-LOTES-A'),
    'Edição alterou dados não relacionados';

  v_falhou := false;
  begin
    perform public.alm_receb_editar_conferencia(v_id,'{}',
      jsonb_set(v_itens,'{0,lotes_validade}','[{"lote":"INVÁLIDO","validade":"2027-02-30"}]'),v_usuario);
  exception when datetime_field_overflow or invalid_datetime_format then v_falhou := true;
  end;
  assert v_falhou, 'Data inexistente foi aceita';
  assert (select lotes_validade=v_lista from public.alm_receb_conferencia_itens
    where conferencia_id=v_id and material_code='TESTE-LOTES-A'), 'Falha precisa reverter toda a edição';

  v_falhou := false;
  begin
    perform public.alm_receb_editar_conferencia(v_id,'{}',jsonb_set(v_itens,'{0}',(v_itens->0)-'lotes_validade'),v_usuario);
  exception when raise_exception then
    if sqlerrm not like 'Este recebimento possui lotes.%' then raise; end if;
    v_falhou := true;
  end;
  assert v_falhou, 'Cliente antigo não pode apagar lotes desconhecidos';

  v_itens := jsonb_set(v_itens,'{0,lotes_validade}','[]');
  perform public.alm_receb_editar_conferencia(v_id,'{}',v_itens,v_usuario);
  assert not exists(select 1 from public.alm_receb_conferencia_itens
    where conferencia_id=v_id and lotes_validade<>'[]'::jsonb), 'Remoção explícita não foi gravada';

  perform public.alm_receb_editar_conferencia(v_id,'{}',jsonb_set(v_itens,'{0}',(v_itens->0)-'lotes_validade'),v_usuario);
  assert not has_function_privilege('anon','public.alm_receb_registrar_conferencia(jsonb,jsonb,jsonb)','execute'),
    'RPC não deve estar disponível para anônimos';
end;
$$;
rollback;
select 'OK: criação, leitura, edição, pares opcionais, histórico, data inválida, rollback e cliente antigo' as resultado;
