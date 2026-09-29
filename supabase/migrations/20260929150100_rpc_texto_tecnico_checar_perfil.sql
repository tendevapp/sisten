-- As duas RPCs abaixo são SECURITY DEFINER (owner postgres) e ignoram a RLS de
-- `materials`, que só deixa admin e coordenador de Suprimentos gravar. Sem
-- checagem interna, qualquer usuário autenticado sobrescrevia o texto técnico
-- do catálogo inteiro. Mesma checagem das funções irmãs
-- (`upsert_lote_materiais`, `apagar_catalogo_materiais`).

create or replace function public.atualizar_texto_tecnico_materiais(p_itens jsonb)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_updated integer := 0;
  v_total integer := 0;
begin
  if not (public.has_role('admin') or public.has_role('coordenador_suprimentos')) then
    raise exception 'Sem permissão para atualizar o texto técnico do catálogo.'
      using errcode = '42501';
  end if;

  v_total := jsonb_array_length(p_itens);

  with input_data as (
    select distinct on (trim(item->>'material_code'))
      trim(item->>'material_code') as m_code,
      trim(item->>'technical_text') as t_text
    from jsonb_array_elements(p_itens) as item
    where trim(item->>'material_code') <> ''
  ),
  updated_rows as (
    update materials m
    set technical_text = i.t_text
    from input_data i
    where m.material_code = i.m_code
    returning m.material_code
  )
  select count(*) into v_updated from updated_rows;

  return json_build_object(
    'updated', v_updated,
    'total_enviados', v_total
  );
end;
$$;

create or replace function public.atualizar_textos_tecnicos_zl0162(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total int := 0;
  v_atualizados int := 0;
  v_nao_encontrados int := 0;
begin
  if not (public.has_role('admin') or public.has_role('coordenador_suprimentos')) then
    raise exception 'Sem permissão para atualizar o texto técnico do catálogo.'
      using errcode = '42501';
  end if;

  with dados as (
    select
      trim(item->>'material_code') as material_code,
      trim(item->>'technical_text') as technical_text
    from jsonb_array_elements(p_itens) as item
    where trim(item->>'material_code') <> ''
  ),
  atualizados as (
    update public.materials m
    set technical_text = d.technical_text
    from dados d
    where m.material_code = d.material_code
    returning m.material_code
  )
  select
    (select count(*)::int from dados),
    (select count(*)::int from atualizados)
  into v_total, v_atualizados;

  v_nao_encontrados := v_total - v_atualizados;

  return jsonb_build_object(
    'total', v_total,
    'atualizados', v_atualizados,
    'nao_encontrados', v_nao_encontrados
  );
end;
$$;

revoke all on function public.atualizar_texto_tecnico_materiais(jsonb) from public, anon;
revoke all on function public.atualizar_textos_tecnicos_zl0162(jsonb) from public, anon;
grant execute on function public.atualizar_texto_tecnico_materiais(jsonb) to authenticated, service_role;
grant execute on function public.atualizar_textos_tecnicos_zl0162(jsonb) to authenticated, service_role;
