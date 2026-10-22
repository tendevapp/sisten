-- Apontamento por tramo: voltar para a etapa anterior.
--
-- Caso típico: tramo liberado para o Pátio por engano. Voltar desfaz o último
-- marco ativo do tramo e as situações da etapa desfeita (senão o quadro
-- mostraria uma situação do Pátio num tramo que está no Jato). Nada é
-- apagado: os eventos ficam riscados com quem voltou e o motivo, como na
-- correção. Reparos de solda continuam valendo.
--
-- Quem pode: quem pode apontar (prod_apt_pode_lancar), não só o autor do
-- marco — o erro costuma ser corrigido por outro turno ou pelo encarregado.
--
-- Idempotente para a fila offline: o aparelho manda o marco que quer desfazer
-- ({tramoId, marco}); se ele já não está ativo, o tramo é pulado.

create or replace function public.prod_apt_voltar_etapa_tramos(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_motivo text := nullif(btrim(p->>'motivo'), '');
  v_ordem text[] := array['inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido'];
  v_item jsonb;
  v_tramo text;
  v_marco text;
  v_ev public.prod_apt_tramo_eventos%rowtype;
  v_etapa text;
  v_serie int;
  v_desfeitos int := 0;
  v_pulados int := 0;
begin
  perform public.prod_apt_exigir_apontamento_tramos();
  if v_motivo is null or length(v_motivo) < 3 then raise exception 'Informe o motivo da volta.'; end if;
  if jsonb_typeof(p->'tramos') <> 'array' or jsonb_array_length(p->'tramos') = 0 then
    raise exception 'Nenhum tramo informado.';
  end if;

  for v_item in select value from jsonb_array_elements(p->'tramos') loop
    v_tramo := v_item->>'tramoId';
    v_marco := v_item->>'marco';
    if array_position(v_ordem, v_marco) is null then raise exception 'Marco inválido.'; end if;

    select * into v_ev from public.prod_apt_tramo_eventos
     where tramo_id = v_tramo and tipo = 'marco' and marco = v_marco and excluido_em is null
     for update;
    if not found then
      -- Reenvio da fila ou outro aparelho já voltou este tramo.
      v_pulados := v_pulados + 1;
      continue;
    end if;

    if exists (
      select 1 from public.prod_apt_tramo_eventos
       where tramo_id = v_tramo and tipo = 'marco' and excluido_em is null
         and array_position(v_ordem, marco) > array_position(v_ordem, v_marco)
    ) then
      select serie into v_serie from public.proj_tramos_gwjaco where id = v_tramo;
      raise exception 'Série %: o tramo já passou da etapa seguinte; volte uma etapa de cada vez.', coalesce(v_serie::text, v_tramo);
    end if;

    v_etapa := case v_marco
      when 'inicio' then 'nav01' when 'liberado_nav02' then 'nav02' when 'liberado_jato' then 'jato'
      when 'liberado_patio' then 'patio' else 'expedido' end;

    update public.prod_apt_tramo_eventos
       set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = 'Volta de etapa: ' || v_motivo
     where id = v_ev.id;

    update public.prod_apt_tramo_eventos e
       set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = 'Volta de etapa: ' || v_motivo
     where e.tramo_id = v_tramo and e.tipo = 'situacao' and e.excluido_em is null
       and (
         e.situacao_id in (select s.id from public.prod_apt_situacoes s where s.etapa = v_etapa)
         or (e.situacao_id is null and v_ev.lote_id is not null and e.lote_id = v_ev.lote_id)
       );

    v_desfeitos := v_desfeitos + 1;
  end loop;

  return jsonb_build_object('desfeitos', v_desfeitos, 'pulados', v_pulados);
end;
$$;

revoke all on function public.prod_apt_voltar_etapa_tramos(jsonb) from public, anon;
grant execute on function public.prod_apt_voltar_etapa_tramos(jsonb) to authenticated;
