-- Executar exclusivamente no supabase-sisten (fwezzgduywgyhxinjurn).
-- Teste transacional: nenhuma inserção de teste persiste.
begin;
select set_config('request.jwt.claim.sub', (select id from public.profiles where status='ativo' and 'admin'=any(roles) limit 1), true);
set local role authenticated;
do $teste$
declare
  v_linhas jsonb;
  v_r jsonb;
  v_antigo jsonb;
  v_novo jsonb;
  v_qtd int;
begin
  select jsonb_agg(jsonb_build_object('linha',i.origem_linha,'data',v.data,'material',i.material,'deposito',i.deposito,'dados',i.dados_origem) order by i.origem_linha)
    into v_linhas from public.alm_inventario_itens i join public.alm_inventarios v on v.id=i.inventario_id where i.origem_chave is not null;
  select count(*) into v_qtd from public.alm_inventario_itens;
  v_r := public.alm_inv_importar_base(v_linhas,'teste-reimportacao.xlsm',true);
  if (v_r->>'novos')::int <> 0 or (v_r->>'alterados')::int <> 0 or (v_r->>'inseridos')::int <> 0
    or (v_r->>'iguais')::int <> jsonb_array_length(v_linhas) then raise exception 'Reimportação duplicou ou alterou dados: %',v_r; end if;

  v_antigo := v_linhas->0;
  v_linhas := jsonb_set(v_linhas,'{0,dados,Descrição}','"Descrição diferente apenas no arquivo de teste"');
  v_novo := jsonb_set(v_antigo,'{material}','"QA-IMPORTACAO-ROLLBACK"');
  v_novo := jsonb_set(v_novo,'{dados,Material}','"QA-IMPORTACAO-ROLLBACK"');
  v_novo := jsonb_set(v_novo,'{linha}','20001');
  v_linhas := v_linhas || jsonb_build_array(v_novo);
  v_r := public.alm_inv_importar_base(v_linhas,'teste-incremental.xlsm',true);
  if (v_r->>'novos')::int <> 1 or (v_r->>'inseridos')::int <> 1 or (v_r->>'alterados')::int <> 1
    or (select count(*) from public.alm_inventario_itens) <> v_qtd+1 then raise exception 'Falhou inserção incremental: %',v_r; end if;
  if not exists(select 1 from public.alm_inventario_itens where origem_chave is not null and dados_origem=v_antigo->'dados') then
    raise exception 'O registro antigo foi sobrescrito.';
  end if;
  v_r := public.alm_inv_importar_base(v_linhas,'teste-incremental-repetido.xlsm',true);
  if (v_r->>'inseridos')::int <> 0 or (v_r->>'alterados')::int <> 1 then raise exception 'Duplicação na segunda carga incremental.'; end if;

  v_r := public.alm_inv_importar_base(jsonb_build_array(v_antigo),'teste-arquivo-parcial.xlsm',false);
  if (v_r->>'ausentes')::int <> jsonb_array_length(v_linhas)-1 then raise exception 'Ausências não relatadas.'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
  begin
    perform public.alm_inv_importar_base(v_linhas,'sem-permissao.xlsm',true);
    raise exception 'Usuário sem permissão conseguiu importar.';
  exception when raise_exception then
    if sqlerrm <> 'Sem permissão para importar inventário.' then raise; end if;
  end;
end;
$teste$;
rollback;
select 'Reimportação, inserção incremental, preservação, ausências e autorização passaram; alterações de teste revertidas.' resultado;
