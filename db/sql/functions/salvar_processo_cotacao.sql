-- =====================================================================
-- Salvamento atômico de uma proposta + seus itens + aprendizado de
-- vínculo, numa única transação. Sem isso, inserts sequenciais do
-- cliente (proposta -> itens -> descricao_map) podem falhar pela
-- metade e deixar uma proposta sem itens.
--
-- SECURITY INVOKER, não DEFINER: o chamador já É o comprador
-- autorizado (verificado por public.pode_gerir_cotacoes() nas policies
-- das tabelas), então DEFINER aqui seria escalação de privilégio
-- desnecessária.
--
-- Payload esperado:
-- {
--   "usuario_id": "...", "usuario_nome": "...",
--   "propostas": [{
--     "processo_id": "...", ...todas as colunas de cotacao_propostas...,
--     "itens": [{ ...todas as colunas de cotacao_proposta_itens... }]
--   }]
-- }
-- =====================================================================

create or replace function public.salvar_processo_cotacao(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_proposta_id uuid;
  v_prop jsonb;
  v_item jsonb;
  v_propostas int := 0;
  v_itens int := 0;
  v_aprendidos int := 0;
  v_usuario_nome text := p_payload->>'usuario_nome';
begin
  for v_prop in select * from jsonb_array_elements(p_payload->'propostas') loop
    insert into public.cotacao_propostas (
      processo_id, arquivo_origem, numero_proposta, data_emissao,
      validade_data, validade_texto,
      fornecedor_razao_social, fornecedor_cnpj, fornecedor_inscricao_estadual,
      fornecedor_cidade, fornecedor_uf, fornecedor_telefone,
      cod_vendor, contato_id, fornecedor_match,
      vendedor_nome, vendedor_email, vendedor_telefone,
      cliente_razao_social, cliente_cnpj, cliente_inscricao_estadual,
      cliente_cidade, cliente_uf,
      condicao_pagamento, forma_pagamento, prazo_entrega_texto, prazo_entrega_dias,
      frete_modalidade, transportadora_indicada, faturamento_minimo,
      dados_bancarios_pix, valor_total_orcamento, observacoes_gerais,
      campos_faltantes, revisado, extracao_id, extraido_raw,
      criado_por, criado_por_nome
    )
    values (
      (v_prop->>'processo_id')::uuid,
      v_prop->>'arquivo_origem', v_prop->>'numero_proposta', (v_prop->>'data_emissao')::date,
      (v_prop->>'validade_data')::date, v_prop->>'validade_texto',
      v_prop->>'fornecedor_razao_social', v_prop->>'fornecedor_cnpj', v_prop->>'fornecedor_inscricao_estadual',
      v_prop->>'fornecedor_cidade', v_prop->>'fornecedor_uf', v_prop->>'fornecedor_telefone',
      v_prop->>'cod_vendor', (v_prop->>'contato_id')::uuid, coalesce(v_prop->>'fornecedor_match', 'nao_encontrado'),
      v_prop->>'vendedor_nome', v_prop->>'vendedor_email', v_prop->>'vendedor_telefone',
      v_prop->>'cliente_razao_social', v_prop->>'cliente_cnpj', v_prop->>'cliente_inscricao_estadual',
      v_prop->>'cliente_cidade', v_prop->>'cliente_uf',
      v_prop->>'condicao_pagamento', v_prop->>'forma_pagamento', v_prop->>'prazo_entrega_texto', (v_prop->>'prazo_entrega_dias')::int,
      v_prop->>'frete_modalidade', v_prop->>'transportadora_indicada', (v_prop->>'faturamento_minimo')::numeric,
      v_prop->>'dados_bancarios_pix', (v_prop->>'valor_total_orcamento')::numeric, v_prop->>'observacoes_gerais',
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_prop->'campos_faltantes', '[]'::jsonb)) x), '{}'),
      coalesce((v_prop->>'revisado')::boolean, false),
      (v_prop->>'extracao_id')::uuid, v_prop->'extraido_raw',
      p_payload->>'usuario_id', v_usuario_nome
    )
    returning id into v_proposta_id;
    v_propostas := v_propostas + 1;

    for v_item in select * from jsonb_array_elements(coalesce(v_prop->'itens', '[]'::jsonb)) loop
      insert into public.cotacao_proposta_itens (
        proposta_id, processo_item_id, fora_escopo, vinculo_origem, vinculo_score,
        ri, material_code,
        item_numero, codigo_produto, descricao_produto, marca_fabricante, unidade_medida,
        ncm, cst, cfop, quantidade, preco_unitario, preco_total_item,
        aliquota_icms_pct, aliquota_pis_pct, aliquota_cofins_pct, aliquota_ipi_pct,
        campos_faltantes, extraido_raw
      )
      values (
        v_proposta_id, (v_item->>'processo_item_id')::uuid,
        coalesce((v_item->>'fora_escopo')::boolean, false),
        coalesce(v_item->>'vinculo_origem', 'manual'), (v_item->>'vinculo_score')::numeric,
        v_item->>'ri', v_item->>'material_code',
        (v_item->>'item_numero')::int, v_item->>'codigo_produto', v_item->>'descricao_produto',
        v_item->>'marca_fabricante', v_item->>'unidade_medida',
        v_item->>'ncm', v_item->>'cst', v_item->>'cfop',
        (v_item->>'quantidade')::numeric, (v_item->>'preco_unitario')::numeric, (v_item->>'preco_total_item')::numeric,
        (v_item->>'aliquota_icms_pct')::numeric, (v_item->>'aliquota_pis_pct')::numeric,
        (v_item->>'aliquota_cofins_pct')::numeric, (v_item->>'aliquota_ipi_pct')::numeric,
        coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_item->'campos_faltantes', '[]'::jsonb)) x), '{}'),
        v_item->'extraido_raw'
      );
      v_itens := v_itens + 1;

      -- Aprendizado: só vínculo confirmado (processo_item_id resolvido)
      -- entra na memória, e só quando dá para identificar o material.
      if (v_item->>'processo_item_id') is not null and (v_item->>'material_code') is not null
         and (v_item->>'descricao_norm') is not null then
        insert into public.cotacao_descricao_map
          (fornecedor_cnpj, descricao_norm, descricao_original, codigo_produto,
           material_code, unidade_medida, ultimo_usuario_nome)
        values
          (coalesce(v_prop->>'fornecedor_cnpj', ''),
           v_item->>'descricao_norm', v_item->>'descricao_produto',
           v_item->>'codigo_produto', v_item->>'material_code',
           v_item->>'unidade_medida', v_usuario_nome)
        on conflict (fornecedor_cnpj, descricao_norm) do update
          set material_code      = coalesce(excluded.material_code, public.cotacao_descricao_map.material_code),
              codigo_produto     = coalesce(excluded.codigo_produto, public.cotacao_descricao_map.codigo_produto),
              vezes_confirmado   = public.cotacao_descricao_map.vezes_confirmado + 1,
              ultima_confirmacao = now(),
              ultimo_usuario_nome = excluded.ultimo_usuario_nome;
        v_aprendidos := v_aprendidos + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('propostas', v_propostas, 'itens', v_itens, 'aprendidos', v_aprendidos);
end;
$$;

revoke all on function public.salvar_processo_cotacao(jsonb) from public, anon;
grant execute on function public.salvar_processo_cotacao(jsonb) to authenticated;
