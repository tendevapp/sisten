-- Cotações: guarda o PDF/imagem original da proposta no Storage, para
-- consulta a qualquer momento (não só enquanto o navegador tiver o `File`
-- na memória), e persiste o Markdown extraído como cópia editável — para
-- quando o comprador identificar um erro de conversão (OCR/leitura de PDF)
-- sem precisar re-subir o arquivo nem gastar IA de novo.
--
-- O Markdown "como foi extraído de fato" continua intocado em
-- `ops_conversoes_markdown` (auditoria). `sup_cotacao_propostas.arquivo_markdown`
-- é a cópia de trabalho: começa igual à extração e pode ser corrigida —
-- `arquivo_markdown_editado_em/_por` registram quem mexeu e quando.

-- =====================================================================
-- 1. Bucket privado para o arquivo original
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotacoes-arquivos', 'cotacoes-arquivos', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

-- Mesma autorização das tabelas de cotação (`pode_gerir_cotacoes()`), não
-- "qualquer autenticado" — o arquivo original de uma proposta de fornecedor
-- é dado comercial sensível, mesma régua do resto do módulo.
drop policy if exists "cotacoes_arquivos_objects_read" on storage.objects;
create policy "cotacoes_arquivos_objects_read" on storage.objects
  for select to authenticated using (bucket_id = 'cotacoes-arquivos' and public.pode_gerir_cotacoes());

drop policy if exists "cotacoes_arquivos_objects_insert" on storage.objects;
create policy "cotacoes_arquivos_objects_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'cotacoes-arquivos' and public.pode_gerir_cotacoes());

drop policy if exists "cotacoes_arquivos_objects_update" on storage.objects;
create policy "cotacoes_arquivos_objects_update" on storage.objects
  for update to authenticated using (bucket_id = 'cotacoes-arquivos' and public.pode_gerir_cotacoes());

drop policy if exists "cotacoes_arquivos_objects_delete" on storage.objects;
create policy "cotacoes_arquivos_objects_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cotacoes-arquivos' and public.pode_gerir_cotacoes());

-- =====================================================================
-- 2. Colunas novas em sup_cotacao_propostas
-- =====================================================================

alter table public.sup_cotacao_propostas
  add column if not exists arquivo_storage_path text,
  add column if not exists arquivo_mime_type text,
  add column if not exists arquivo_tamanho_bytes integer,
  add column if not exists arquivo_markdown text,
  add column if not exists arquivo_markdown_editado_em timestamptz,
  add column if not exists arquivo_markdown_editado_por text;

comment on column public.sup_cotacao_propostas.arquivo_storage_path is
  'Caminho do PDF/imagem original no bucket cotacoes-arquivos. Nulo em propostas salvas antes desta migração ou coladas manualmente (sem arquivo).';
comment on column public.sup_cotacao_propostas.arquivo_markdown is
  'Markdown extraído do documento, cópia editável para consulta e correção de erro de conversão. O original "como veio" fica intocado em ops_conversoes_markdown.';
comment on column public.sup_cotacao_propostas.arquivo_markdown_editado_em is
  'Quando um comprador corrigiu manualmente o Markdown — nulo enquanto for a extração original, sem edição.';

-- =====================================================================
-- 3. View de escrita da RPC: acrescenta as colunas novas no fim (a mesma
--    razão de sempre para CREATE OR REPLACE VIEW não poder inserir coluna
--    no meio — só anexar).
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
        arquivo_markdown, arquivo_markdown_editado_em, arquivo_markdown_editado_por
   from public.sup_cotacao_propostas;

alter view public.cotacao_propostas owner to postgres;
grant all on public.cotacao_propostas to anon, authenticated, service_role;

-- =====================================================================
-- 4. Salvamento: mesma função de 20260912012321, gravando também o
--    arquivo (caminho/mime/tamanho, já enviado ao Storage antes de chamar
--    esta RPC) e o Markdown de origem.
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
      arquivo_storage_path, arquivo_mime_type, arquivo_tamanho_bytes, arquivo_markdown
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
      (v_prop->>'arquivo_tamanho_bytes')::int, v_prop->>'arquivo_markdown'
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
