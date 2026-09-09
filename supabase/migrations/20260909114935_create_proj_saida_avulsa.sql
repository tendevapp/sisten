-- =====================================================================
-- Almoxarifado > Projetos — saída avulsa importada de planilha
--
-- A mesma planilha legada que registra "Entrada" também registra "Saída":
-- peça que saiu do almoxarifado direto para um tramo (coluna TRAMO
-- preenchida, ex. 'T1-3143'), sem passar pelo fluxo formal de romaneio (F2).
-- É consumo histórico/retroativo a lançar, não uma nova ordem de
-- pré-montagem — por isso não cria proj_kits nem mexe no status do tramo.
--
-- Tipo novo `saida_avulsa` no razão, distinto de `saida_premontagem`
-- (que SEMPRE tem uma ordem/kit por trás) e de `saida_sobressalente`
-- (que exige motivo/aprovador de refugo). Esta é a saída "crua": só
-- item + quantidade + tramo opcional, com a mesma trava de saldo das outras.
-- =====================================================================

alter table public.proj_movimentos drop constraint proj_movimentos_tipo_check;
alter table public.proj_movimentos add constraint proj_movimentos_tipo_check
  check (tipo = any (array['entrada_nf','saida_premontagem','retorno_premontagem','saida_sobressalente','saida_avulsa','ajuste']));

create or replace function public.proj_registrar_saida_avulsa(
  p_lote jsonb,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_projeto text := coalesce(p_lote->>'projeto', 'GW_JACOBINA');
  v_codigo text := p_lote->>'codigo';
  v_total numeric;
  v_itens integer;
begin
  if coalesce(jsonb_array_length(p_itens), 0) = 0 then
    raise exception 'O lote de saída precisa debitar ao menos um item.';
  end if;

  if exists (select 1 from jsonb_array_elements(p_itens) x where (x->>'quantidade')::numeric <= 0) then
    raise exception 'Saída avulsa só aceita quantidade positiva (o quanto saiu).';
  end if;

  perform public.proj_validar_saldo(
    (select jsonb_agg(jsonb_build_object('item_id', x->>'item_id', 'quantidade', x->>'quantidade'))
     from jsonb_array_elements(p_itens) x)
  );

  select sum((x->>'quantidade')::numeric), count(*)
    into v_total, v_itens
  from jsonb_array_elements(p_itens) x;

  insert into public.proj_movimentos
    (projeto, tipo, item_id, quantidade, documento_tipo, documento_codigo,
     secao, tramo, tramo_unidade_id, observacao, criado_por_id, criado_por_nome)
  select
    v_projeto, 'saida_avulsa', (x->>'item_id')::uuid, -(x->>'quantidade')::numeric,
    'importacao_saida', v_codigo,
    nullif(x->>'secao',''), nullif(x->>'tramo',''), nullif(x->>'tramo_unidade_id',''),
    nullif(x->>'observacao',''),
    nullif(p_lote->>'criado_por_id','')::uuid, p_lote->>'criado_por_nome'
  from jsonb_array_elements(p_itens) x;

  return jsonb_build_object('codigo', v_codigo, 'total_itens', v_itens, 'total_quantidade', v_total);
end;
$$;

revoke execute on function public.proj_registrar_saida_avulsa(jsonb, jsonb) from public, anon;
grant execute on function public.proj_registrar_saida_avulsa(jsonb, jsonb) to authenticated, service_role;
