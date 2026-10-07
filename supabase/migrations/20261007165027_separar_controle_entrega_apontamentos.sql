-- Controle de Entrega (prod_tramos_entrega) passa ao módulo Planejamento com
-- dados separados dos apontamentos da Produção: entradas e fontes diferentes.
-- Desfaz a ligação criada em 20261007154742:
--   * o trigger que copiava cada apontamento por tramo para o cilindro;
--   * a cópia "só avança" feita na carga histórica da planilha TRAMOS.
-- prod_apt_situacoes.categoria_entrega fica no banco, sem uso, para quando a
-- integração voltar a ser decidida.

drop trigger if exists prod_apt_tramo_eventos_sincronizar on public.prod_apt_tramo_eventos;
drop function if exists private.prod_apt_tramo_evento_sincronizar();

-- Carga histórica sem tocar no Controle de Entrega.
create or replace function public.prod_apt_importar_snapshot_tramos(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote uuid := (p->>'loteId')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_item jsonb;
  v_tramo text;
  v_marco text;
  v_data date;
  v_ultima date;
  v_sit public.prod_apt_situacoes%rowtype;
  v_reparos int;
  v_n int;
  v_inseridos int := 0;
begin
  perform public.prod_apt_exigir_cadastro_tramos();
  if exists (select 1 from public.prod_apt_importacoes_tramos where id = v_lote and status = 'historico_importado') then
    return jsonb_build_object('eventosInseridos', 0, 'jaImportado', true);
  end if;
  if not exists (select 1 from public.prod_apt_importacoes_tramos where id = v_lote and status = 'reconciliado') then
    raise exception 'Lote deve estar reconciliado antes da carga histórica.';
  end if;
  if jsonb_typeof(p->'snapshots') <> 'array' then raise exception 'Snapshots obrigatórios.'; end if;

  for v_item in select value from jsonb_array_elements(p->'snapshots') loop
    select id into v_tramo from public.proj_tramos_gwjaco where serie = (v_item->>'sequencial')::int and subprojeto_id = 'SP01';
    if v_tramo is null then raise exception 'Série % não localizada.', v_item->>'sequencial'; end if;

    foreach v_marco in array array['inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido'] loop
      v_data := nullif(v_item->'marcos'->>v_marco, '')::date;
      continue when v_data is null;
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, marco, data_operacional, origem, importacao_id, criado_por, created_at)
      values (public.prod_apt_proximo_codigo(v_data), v_tramo, 'marco', v_marco, v_data, 'importacao', v_lote, auth.uid(), clock_timestamp())
      on conflict (tramo_id, marco) where excluido_em is null and tipo = 'marco' do nothing;
      get diagnostics v_n = row_count;
      v_inseridos := v_inseridos + v_n;
    end loop;

    select max(value::date) into v_ultima from jsonb_each_text(coalesce(v_item->'marcos', '{}'::jsonb)) where value <> '';
    v_ultima := coalesce(v_ultima, v_hoje);

    if coalesce(v_item->>'setor', '') <> '' or coalesce(v_item->>'atividade', '') <> '' then
      select * into v_sit from public.prod_apt_situacoes
       where lower(setor) = lower(btrim(v_item->>'setor')) and lower(atividade) = lower(btrim(v_item->>'atividade'));
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, situacao_id, setor, atividade, data_operacional, origem, importacao_id, criado_por, created_at)
      values (public.prod_apt_proximo_codigo(v_ultima), v_tramo, 'situacao', v_sit.id,
              coalesce(v_sit.setor, nullif(btrim(v_item->>'setor'), '')), coalesce(v_sit.atividade, nullif(btrim(v_item->>'atividade'), '')),
              v_ultima, 'importacao', v_lote, auth.uid(), clock_timestamp())
      on conflict (importacao_id, tramo_id, tipo) where tipo = 'situacao' and importacao_id is not null and excluido_em is null do nothing;
      get diagnostics v_n = row_count;
      v_inseridos := v_inseridos + v_n;
    end if;

    -- O total de reparos da planilha vira um evento na liberação para o Jato
    -- (os reparos de solda acontecem antes dela).
    v_reparos := coalesce(nullif(v_item->>'reparosSolda', '')::int, 0);
    if v_reparos > 0 then
      v_data := coalesce(nullif(v_item->'marcos'->>'liberado_jato', '')::date, v_ultima);
      insert into public.prod_apt_tramo_eventos (codigo, tramo_id, tipo, reparos_solda, data_operacional, origem, importacao_id, criado_por, created_at)
      values (public.prod_apt_proximo_codigo(v_data), v_tramo, 'reparo', v_reparos, v_data, 'importacao', v_lote, auth.uid(), clock_timestamp())
      on conflict (importacao_id, tramo_id, tipo) where tipo = 'reparo' and importacao_id is not null and excluido_em is null do nothing;
      get diagnostics v_n = row_count;
      v_inseridos := v_inseridos + v_n;
    end if;
  end loop;

  update public.prod_apt_importacoes_tramos set status = 'historico_importado' where id = v_lote;
  return jsonb_build_object('eventosInseridos', v_inseridos);
end;
$$;

drop function if exists private.prod_apt_sincronizar_entrega(text, boolean);

revoke all on function public.prod_apt_importar_snapshot_tramos(jsonb) from public, anon;
grant execute on function public.prod_apt_importar_snapshot_tramos(jsonb) to authenticated;
