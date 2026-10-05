-- Recebimento e contagem — parcial "de acordo com a NF".
--
-- Ao marcar um item como parcial (chegou menos que o pendente), o conferente
-- confirma se a quantidade está de acordo com a NF. Se está, o parcial é só o
-- que o fornecedor faturou: NÃO abre pendência com Suprimentos
-- (`parcial_conforme_nf = true`). Se não está, segue como antes — pendência
-- para o comprador do PO decidir.
--
-- Linhas antigas ficam em false (continuam gerando pendência, como hoje).
-- Edição que passa o item para "conforme NF" cancela a pendência aberta pela
-- rotina de sincronização (a divergência saiu da conferência).

alter table public.alm_receb_conferencia_itens
  add column if not exists parcial_conforme_nf boolean not null default false;

-- As duas RPCs de gravação passam a persistir o campo. Patch sobre a definição
-- viva (a de edição já foi alterada por migration posterior).
do $$
declare
  v_def text;
  v_fn text;
begin
  foreach v_fn in array array[
    'public.alm_receb_registrar_conferencia(jsonb,jsonb,jsonb)',
    'public.alm_receb_editar_conferencia(uuid,jsonb,jsonb,jsonb)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position('parcial, observacao, evidencias)' in v_def) = 0
       or position('coalesce((x->>''parcial'')::boolean, false),' in v_def) = 0 then
      raise exception 'Insert de itens nao encontrado em %', v_fn;
    end if;
    v_def := replace(v_def, 'parcial, observacao, evidencias)', 'parcial, parcial_conforme_nf, observacao, evidencias)');
    v_def := replace(v_def,
      'coalesce((x->>''parcial'')::boolean, false),',
      'coalesce((x->>''parcial'')::boolean, false), coalesce((x->>''parcial_conforme_nf'')::boolean, false),');
    execute v_def;
  end loop;

  -- Sincronização das pendências: parcial conforme a NF não é pendência.
  v_def := pg_get_functiondef('public.sup_receb_pend_sincronizar_conferencia(uuid)'::regprocedure);
  if position('when i.parcial and i.qtd_pedido is not null' in v_def) = 0 then
    raise exception 'Condicao de parcial nao encontrada na sincronizacao de pendencias';
  end if;
  v_def := replace(v_def,
    'when i.parcial and i.qtd_pedido is not null',
    'when i.parcial and not coalesce(i.parcial_conforme_nf, false) and i.qtd_pedido is not null');
  execute v_def;
end $$;

notify pgrst, 'reload schema';
