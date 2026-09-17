-- Análise de Cotações: a extração por IA passa a reconhecer, no texto da
-- proposta, um valor de frete já destacado (em vez de só o frete teórico
-- simulado pela tabela Bahia Sul) e um desconto declarado sobre o total.
--
-- `valor_frete` já existia (preenchido manualmente pelo comprador no mapa
-- comparativo); esta migração só permite que ele já chegue preenchido no
-- insert, quando a IA achar o valor no documento. `valor_desconto` é campo
-- novo.

-- =====================================================================
-- 1. Coluna nova em sup_cotacao_propostas
-- =====================================================================

alter table public.sup_cotacao_propostas
  add column if not exists valor_desconto numeric;

comment on column public.sup_cotacao_propostas.valor_desconto is
  'Desconto em reais que a proposta declara sobre o total — extraído por IA quando o documento o menciona (percentual já convertido). Abatido de totalComFrete no mapa comparativo.';

-- =====================================================================
-- 2. View de escrita da RPC: acrescenta a coluna nova no fim (mesma razão
--    de sempre — CREATE OR REPLACE VIEW não insere coluna no meio).
-- =====================================================================

create or replace view public.cotacao_propostas with (security_invoker = 'true') as
 select id, processo_id, arquivo_origem, numero_proposta, data_emissao,
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
        criado_por, criado_por_nome, created_at, updated_at,
        valor_frete,
        arquivo_storage_path, arquivo_mime_type, arquivo_tamanho_bytes,
        arquivo_markdown, arquivo_markdown_editado_em, arquivo_markdown_editado_por,
        valor_desconto
   from public.sup_cotacao_propostas;

alter view public.cotacao_propostas owner to postgres;
grant all on public.cotacao_propostas to anon, authenticated, service_role;

-- =====================================================================
-- 3. Salvamento: mesma função de 20260913010000, gravando também
--    valor_frete e valor_desconto — antes só entravam depois de a
--    proposta já estar salva, pela tela do mapa comparativo
--    (`salvarFreteProposta`); agora a extração pode trazê-los desde o
--    início e o insert precisa aceitá-los.
-- =====================================================================

create or replace function public.salvar_processo_cotacao(p_payload jsonb) returns jsonb
    language plpgsql
    set search_path to 'public', 'pg_temp'
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
      criado_por, criado_por_nome,
      arquivo_storage_path, arquivo_mime_type, arquivo_tamanho_bytes, arquivo_markdown,
      valor_frete, valor_desconto
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
      p_payload->>'usuario_id', v_usuario_nome,
      v_prop->>'arquivo_storage_path', v_prop->>'arquivo_mime_type',
      (v_prop->>'arquivo_tamanho_bytes')::int, v_prop->>'arquivo_markdown',
      (v_prop->>'valor_frete')::numeric, (v_prop->>'valor_desconto')::numeric
    )
    returning id into v_proposta_id;
    v_propostas := v_propostas + 1;

    for v_item in select * from jsonb_array_elements(coalesce(v_prop->'itens', '[]'::jsonb)) loop
      insert into public.cotacao_proposta_itens (
        proposta_id, processo_item_id, fora_escopo, desconsiderado,
        vinculo_origem, vinculo_score, vinculo_divergencias,
        ri, material_code,
        item_numero, codigo_produto, descricao_produto, marca_fabricante, unidade_medida,
        ncm, cst, cfop, quantidade, preco_unitario, preco_total_item,
        aliquota_icms_pct, aliquota_pis_pct, aliquota_cofins_pct, aliquota_ipi_pct,
        peso_unitario_kg, peso_origem, frete_teorico,
        codigo_fiscal, preco_liquido_unitario, preco_liquido_total, custo_total_item,
        campos_faltantes, extraido_raw
      )
      values (
        v_proposta_id, (v_item->>'processo_item_id')::uuid,
        coalesce((v_item->>'fora_escopo')::boolean, false),
        coalesce((v_item->>'desconsiderado')::boolean, false),
        coalesce(v_item->>'vinculo_origem', 'manual'), (v_item->>'vinculo_score')::numeric,
        coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_item->'vinculo_divergencias', '[]'::jsonb)) x), '{}'),
        v_item->>'ri', v_item->>'material_code',
        (v_item->>'item_numero')::int, v_item->>'codigo_produto', v_item->>'descricao_produto',
        v_item->>'marca_fabricante', v_item->>'unidade_medida',
        v_item->>'ncm', v_item->>'cst', v_item->>'cfop',
        (v_item->>'quantidade')::numeric, (v_item->>'preco_unitario')::numeric, (v_item->>'preco_total_item')::numeric,
        (v_item->>'aliquota_icms_pct')::numeric, (v_item->>'aliquota_pis_pct')::numeric,
        (v_item->>'aliquota_cofins_pct')::numeric, (v_item->>'aliquota_ipi_pct')::numeric,
        (v_item->>'peso_unitario_kg')::numeric, v_item->>'peso_origem', (v_item->>'frete_teorico')::numeric,
        v_item->>'codigo_fiscal', (v_item->>'preco_liquido_unitario')::numeric,
        (v_item->>'preco_liquido_total')::numeric, (v_item->>'custo_total_item')::numeric,
        coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_item->'campos_faltantes', '[]'::jsonb)) x), '{}'),
        v_item->'extraido_raw'
      );
      v_itens := v_itens + 1;

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

-- =====================================================================
-- 4. Prompt editável (ops_ia_prompts): declara os dois campos novos no
--    cabeçalho, para o admin que abre Gestão de APIs & IA ver o formato
--    completo — a Edge Function já anexa a instrução de extração
--    independente disto (ver blocoInstrucoesExtras em
--    supabase/functions/extrair-cotacao/index.ts), então a extração
--    funciona mesmo com o prompt antigo.
-- =====================================================================

update public.ops_ia_prompts
   set prompt = replace(
         prompt,
         '"Valor_Total_Orcamento":null,"Observacoes_Gerais":null',
         '"Valor_Total_Orcamento":null,"Valor_Frete_Destacado":null,"Valor_Desconto":null,"Observacoes_Gerais":null'
       ),
       versao = versao + 1
 where chave = 'extrair-cotacao'
   and prompt like '%"Valor_Total_Orcamento":null,"Observacoes_Gerais":null%'
   and prompt not like '%Valor_Frete_Destacado%';
