-- =====================================================================
-- Financeiro > Faturamento GW Jacobina — coluna Part Number.
--
-- A planilha de origem (a mesma que alimentava o BI antigo) traz o part
-- number do tramo junto com torre/tramo/seq/NF. Guardamos para a
-- importação não perder essa informação — não é exibida na matriz nem
-- usada em cálculo, só carregada e disponível na tela de Dados.
-- =====================================================================

alter table public.fin_fat_gwjaco
  add column if not exists part_number text;

comment on column public.fin_fat_gwjaco.part_number is
  'Part number do tramo, trazido da planilha de importação.';

-- A RPC de edição precisa enxergar o campo novo, senão a importação (que
-- edita via fin_fat_editar) não grava nem loga a mudança.
create or replace function public.fin_fat_editar(
  p_id uuid, p_patch jsonb, p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.fin_fat_gwjaco;
  v_alt jsonb := '[]'::jsonb;
  v_campos text[] := array['torre_numero','tramo','serie','codigo_cliente','projeto_codigo',
                           'part_number','nota_fiscal','data_faturado','semana_faturamento',
                           'data_expedido','data_tramos_previstos','restricao','observacao'];
  k text;
  v_de text;
  v_para text;
begin
  select * into v_old from public.fin_fat_gwjaco where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;

  foreach k in array v_campos loop
    if p_patch ? k then
      v_de := (to_jsonb(v_old) ->> k);
      v_para := (p_patch ->> k);
      if coalesce(v_de,'') is distinct from coalesce(v_para,'') then
        v_alt := v_alt || jsonb_build_object('campo', k, 'de', v_de, 'para', v_para);
      end if;
    end if;
  end loop;

  update public.fin_fat_gwjaco set
    torre_numero = coalesce((p_patch->>'torre_numero')::int, torre_numero),
    tramo = coalesce(nullif(p_patch->>'tramo',''), tramo),
    serie = case when p_patch ? 'serie' then nullif(p_patch->>'serie','')::int else serie end,
    codigo_cliente = case when p_patch ? 'codigo_cliente' then nullif(p_patch->>'codigo_cliente','') else codigo_cliente end,
    projeto_codigo = case when p_patch ? 'projeto_codigo' then nullif(p_patch->>'projeto_codigo','') else projeto_codigo end,
    part_number = case when p_patch ? 'part_number' then nullif(p_patch->>'part_number','') else part_number end,
    nota_fiscal = case when p_patch ? 'nota_fiscal' then nullif(p_patch->>'nota_fiscal','') else nota_fiscal end,
    data_faturado = case when p_patch ? 'data_faturado' then nullif(p_patch->>'data_faturado','')::date else data_faturado end,
    semana_faturamento = case when p_patch ? 'semana_faturamento' then nullif(p_patch->>'semana_faturamento','')::int else semana_faturamento end,
    data_expedido = case when p_patch ? 'data_expedido' then nullif(p_patch->>'data_expedido','')::date else data_expedido end,
    data_tramos_previstos = case when p_patch ? 'data_tramos_previstos' then nullif(p_patch->>'data_tramos_previstos','')::date else data_tramos_previstos end,
    restricao = case when p_patch ? 'restricao' then coalesce((p_patch->>'restricao')::boolean, false) else restricao end,
    observacao = case when p_patch ? 'observacao' then nullif(p_patch->>'observacao','') else observacao end,
    updated_at = now()
  where id = p_id;

  if jsonb_array_length(v_alt) > 0 then
    insert into public.fin_fat_alteracoes (fat_id, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values (p_id, v_alt, jsonb_array_length(v_alt) || ' campo(s) alterado(s)',
            nullif(p_user->>'id','')::uuid, p_user->>'nome');
  end if;

  return jsonb_build_object('id', p_id, 'alteracoes', jsonb_array_length(v_alt));
end;
$$;

revoke all on function public.fin_fat_editar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.fin_fat_editar(uuid, jsonb, jsonb) to authenticated, service_role;
