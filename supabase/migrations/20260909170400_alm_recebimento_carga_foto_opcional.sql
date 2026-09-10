-- =====================================================================
-- Ficha cega — foto deixa de ser obrigatória.
--
-- Na doca nem sempre dá para fotografar na hora (chuva, aparelho sem
-- bateria, carga que já entrou). O registro da contagem não pode ficar
-- refém disso. `alm_receb_registrar_carga` para de exigir >=1 evidência;
-- o campo continua aceitando até 24 fotos.
-- =====================================================================

create or replace function public.alm_receb_registrar_carga(p_carga jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_data date := coalesce((p_carga->>'data')::date, current_date);
  v_codigo text;
  v_contada int := (p_carga->>'qtd_volumes_contada')::int;
  v_declarada int := nullif(p_carga->>'qtd_volumes_declarada','')::int;
  v_avaria boolean := coalesce((p_carga->>'avaria_aparente')::boolean, false);
  v_divergencia boolean;
begin
  if v_contada is null or v_contada < 0 then
    raise exception 'Informe a quantidade de volumes contada.';
  end if;

  v_divergencia := v_avaria or (v_declarada is not null and v_declarada <> v_contada);
  v_codigo := public.alm_receb_proximo_codigo('RCV', v_data, 'alm_receb_cargas');

  insert into public.alm_receb_cargas
    (codigo, data, hora, transportadora, veiculo_placa, motorista, doc_transporte,
     nota_fiscal, nro_pedido, qtd_volumes_declarada, qtd_volumes_contada, tipo_embalagem,
     lacre_integro, avaria_aparente, avaria_descricao, peso_declarado, destino_previsto,
     evidencias, observacao, divergencia, status, criado_por_id, criado_por_nome)
  values
    (v_codigo, v_data, nullif(p_carga->>'hora','')::time, p_carga->>'transportadora',
     nullif(p_carga->>'veiculo_placa',''), nullif(p_carga->>'motorista',''), nullif(p_carga->>'doc_transporte',''),
     nullif(p_carga->>'nota_fiscal',''), nullif(p_carga->>'nro_pedido',''), v_declarada, v_contada,
     nullif(p_carga->>'tipo_embalagem',''), (p_carga->>'lacre_integro')::boolean, v_avaria,
     nullif(p_carga->>'avaria_descricao',''), nullif(p_carga->>'peso_declarado','')::numeric,
     coalesce(nullif(p_carga->>'destino_previsto',''), 'indefinido'),
     coalesce(p_carga->'evidencias', '[]'::jsonb), nullif(p_carga->>'observacao',''),
     v_divergencia, case when v_divergencia then 'divergente' else 'recebida' end,
     nullif(p_carga->>'criado_por_id','')::uuid, p_carga->>'criado_por_nome')
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'divergencia', v_divergencia);
end;
$$;

revoke execute on function public.alm_receb_registrar_carga(jsonb) from anon;
