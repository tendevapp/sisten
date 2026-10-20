-- =====================================================================
-- Cotações — todos os arquivos originais de cada proposta no Storage.
-- =====================================================================
-- 27 propostas salvas desde set/26 ficaram sem o arquivo original
-- ("Ver original" sem nada para mostrar). Causas:
--   1. Proposta extraída de vários arquivos ("4 arquivos") — o nome gravado
--      não era de arquivo nenhum, então nada subia;
--   2. Planilha (.xlsx/.csv) — o bucket só aceitava PDF e imagem;
--   3. Arquivo fora da memória do navegador na hora de salvar (F5 entre a
--      extração e o "Salvar proposta").
-- Agora o cliente sobe os originais logo na extração e grava a lista
-- inteira em `arquivos_originais` ([{ nome, path, mime_type, tamanho_bytes }]);
-- `arquivo_storage_path` continua sendo o primeiro (compatibilidade).

alter table public.sup_cotacao_propostas
  add column if not exists arquivos_originais jsonb not null default '[]'::jsonb;

comment on column public.sup_cotacao_propostas.arquivos_originais is
  'Todos os arquivos originais da proposta no bucket cotacoes-arquivos: [{ nome, path, mime_type, tamanho_bytes }].';

-- Propostas antigas com um arquivo: a lista nasce com ele.
update public.sup_cotacao_propostas
   set arquivos_originais = jsonb_build_array(jsonb_build_object(
         'nome', arquivo_origem, 'path', arquivo_storage_path,
         'mime_type', arquivo_mime_type, 'tamanho_bytes', arquivo_tamanho_bytes))
 where arquivo_storage_path is not null
   and arquivos_originais = '[]'::jsonb;

-- A visão de compatibilidade ganha a coluna no fim (CREATE OR REPLACE só acrescenta).
create or replace view public.cotacao_propostas with (security_invoker = true) as
 SELECT id,
    processo_id,
    arquivo_origem,
    numero_proposta,
    data_emissao,
    validade_data,
    validade_texto,
    fornecedor_razao_social,
    fornecedor_cnpj,
    fornecedor_inscricao_estadual,
    fornecedor_cidade,
    fornecedor_uf,
    fornecedor_telefone,
    cod_vendor,
    contato_id,
    fornecedor_match,
    vendedor_nome,
    vendedor_email,
    vendedor_telefone,
    cliente_razao_social,
    cliente_cnpj,
    cliente_inscricao_estadual,
    cliente_cidade,
    cliente_uf,
    condicao_pagamento,
    forma_pagamento,
    prazo_entrega_texto,
    prazo_entrega_dias,
    frete_modalidade,
    transportadora_indicada,
    faturamento_minimo,
    dados_bancarios_pix,
    valor_total_orcamento,
    observacoes_gerais,
    campos_faltantes,
    revisado,
    extracao_id,
    extraido_raw,
    criado_por,
    criado_por_nome,
    created_at,
    updated_at,
    valor_frete,
    arquivo_storage_path,
    arquivo_mime_type,
    arquivo_tamanho_bytes,
    arquivo_markdown,
    arquivo_markdown_editado_em,
    arquivo_markdown_editado_por,
    valor_desconto,
    arquivos_originais
   FROM public.sup_cotacao_propostas;

-- Salvar proposta grava também a lista de arquivos originais (resto igual).
create or replace function public.salvar_processo_cotacao(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      valor_frete, valor_desconto, arquivos_originais
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
      (v_prop->>'valor_frete')::numeric, (v_prop->>'valor_desconto')::numeric,
      case when jsonb_typeof(v_prop->'arquivos_originais') = 'array' then v_prop->'arquivos_originais' else '[]'::jsonb end
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
$function$;

-- Planilhas e CSV também são cotação original (o conversor aceita).
update storage.buckets
   set allowed_mime_types = array[
     'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-excel',
     'application/vnd.ms-excel.sheet.macroEnabled.12',
     'application/vnd.oasis.opendocument.spreadsheet',
     'text/csv'
   ]
 where id = 'cotacoes-arquivos';
