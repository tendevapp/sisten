-- =====================================================================
-- Cotacoes — renegociacao (rodadas sucessivas por fornecedor e saving).
-- =====================================================================
-- Permite lancar rodadas subsequentes (Rodada 2, 3, ...) a partir de uma
-- proposta ja salva/aceita do mesmo fornecedor:
--   - A proposta anterior permanece gravada como historico (ativa = false,
--     substituida_por_id = nova.id) para calculo de saving e auditoria;
--   - A nova proposta entra ativa (ativa = true, rodada = anterior.rodada + 1,
--     proposta_origem_id = anterior.id) e herda a selecao do mapa nos itens
--     correspondentes, desmarcando os itens da rodada anterior.

alter table public.sup_cotacao_propostas
  add column if not exists rodada integer not null default 1,
  add column if not exists ativa boolean not null default true,
  add column if not exists proposta_origem_id uuid references public.sup_cotacao_propostas(id) on delete set null,
  add column if not exists substituida_por_id uuid references public.sup_cotacao_propostas(id) on delete set null,
  add column if not exists renegociada_em timestamptz,
  add column if not exists renegociada_por text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'sup_cotacao_propostas_rodada_check'
       and conrelid = 'public.sup_cotacao_propostas'::regclass
  ) then
    alter table public.sup_cotacao_propostas
      add constraint sup_cotacao_propostas_rodada_check check (rodada >= 1);
  end if;
end $$;

comment on column public.sup_cotacao_propostas.rodada is
  'Numero da rodada de negociacao desta proposta para o fornecedor (1 = original, 2+ = renegociacao).';
comment on column public.sup_cotacao_propostas.ativa is
  'true na rodada vigente do fornecedor; false quando substituida por uma renegociacao posterior.';
comment on column public.sup_cotacao_propostas.proposta_origem_id is
  'Proposta da rodada imediatamente anterior que originou esta renegociacao.';
comment on column public.sup_cotacao_propostas.substituida_por_id is
  'Proposta da rodada seguinte que substituiu esta rodada.';
comment on column public.sup_cotacao_propostas.renegociada_em is
  'Data/hora em que a nova rodada de negociacao foi aceita.';
comment on column public.sup_cotacao_propostas.renegociada_por is
  'Usuario que aceitou esta rodada de renegociacao.';

create index if not exists idx_sup_cotacao_propostas_processo_ativa
  on public.sup_cotacao_propostas (processo_id, ativa);

create index if not exists idx_sup_cotacao_propostas_origem
  on public.sup_cotacao_propostas (proposta_origem_id)
  where proposta_origem_id is not null;

-- Atualiza a view de compatibilidade acrescentando as novas colunas ao final.
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
    arquivos_originais,
    rodada,
    ativa,
    proposta_origem_id,
    substituida_por_id,
    renegociada_em,
    renegociada_por
   FROM public.sup_cotacao_propostas;

-- RPC transacional para aceitar uma nova rodada de renegociacao:
-- 1. Valida e bloqueia a proposta anterior (precisa estar ativa);
-- 2. Insere a nova proposta com rodada = anterior.rodada + 1 e proposta_origem_id = anterior.id;
-- 3. Insere os itens da nova rodada transferindo mapa_selecionado e mapa_observacao;
-- 4. Marca a anterior como ativa = false, substituida_por_id = nova.id e limpa mapa_selecionado nela.
create or replace function public.salvar_renegociacao_cotacao(p_payload jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_anterior_id uuid := (p_payload->>'proposta_anterior_id')::uuid;
  v_usuario_id text := p_payload->>'usuario_id';
  v_usuario_nome text := coalesce(nullif(trim(p_payload->>'usuario_nome'), ''), 'Usuario');
  v_prop jsonb := p_payload->'proposta';
  v_item jsonb;
  v_anterior record;
  v_nova_id uuid;
  v_nova_rodada int;
  v_itens int := 0;
  v_aprendidos int := 0;
  v_agora timestamptz := now();
begin
  if v_anterior_id is null or v_prop is null then
    raise exception 'Payload de renegociacao incompleto (proposta_anterior_id e proposta sao obrigatorios).';
  end if;

  select id, processo_id, rodada, ativa
    into v_anterior
    from public.sup_cotacao_propostas
   where id = v_anterior_id
   for update;

  if not found then
    raise exception 'Proposta anterior nao encontrada para renegociacao.';
  end if;

  if not v_anterior.ativa then
    raise exception 'Esta proposta ja foi substituida por uma rodada mais recente.';
  end if;

  if (v_prop->>'processo_id') is not null and (v_prop->>'processo_id')::uuid <> v_anterior.processo_id then
    raise exception 'A proposta renegociada deve pertencer ao mesmo processo da proposta anterior.';
  end if;

  v_nova_rodada := coalesce(v_anterior.rodada, 1) + 1;

  insert into public.sup_cotacao_propostas (
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
    valor_frete, valor_desconto, arquivos_originais,
    rodada, ativa, proposta_origem_id, renegociada_em, renegociada_por
  )
  values (
    v_anterior.processo_id,
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
    coalesce((v_prop->>'revisado')::boolean, true),
    (v_prop->>'extracao_id')::uuid, v_prop->'extraido_raw',
    v_usuario_id, v_usuario_nome,
    v_prop->>'arquivo_storage_path', v_prop->>'arquivo_mime_type',
    (v_prop->>'arquivo_tamanho_bytes')::int, v_prop->>'arquivo_markdown',
    (v_prop->>'valor_frete')::numeric, (v_prop->>'valor_desconto')::numeric,
    case when jsonb_typeof(v_prop->'arquivos_originais') = 'array' then v_prop->'arquivos_originais' else '[]'::jsonb end,
    v_nova_rodada, true, v_anterior.id, v_agora, v_usuario_nome
  )
  returning id into v_nova_id;

  for v_item in select * from jsonb_array_elements(coalesce(v_prop->'itens', '[]'::jsonb)) loop
    insert into public.sup_cotacao_proposta_itens (
      proposta_id, processo_item_id, fora_escopo, desconsiderado,
      vinculo_origem, vinculo_score, vinculo_divergencias,
      ri, material_code,
      item_numero, codigo_produto, descricao_produto, marca_fabricante, unidade_medida,
      ncm, cst, cfop, quantidade, preco_unitario, preco_total_item,
      aliquota_icms_pct, aliquota_pis_pct, aliquota_cofins_pct, aliquota_ipi_pct,
      peso_unitario_kg, peso_origem, frete_teorico,
      codigo_fiscal, preco_liquido_unitario, preco_liquido_total, custo_total_item,
      mapa_selecionado, mapa_selecionado_em, mapa_selecionado_por, mapa_observacao,
      campos_faltantes, extraido_raw
    )
    values (
      v_nova_id, (v_item->>'processo_item_id')::uuid,
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
      coalesce((v_item->>'mapa_selecionado')::boolean, false),
      case when coalesce((v_item->>'mapa_selecionado')::boolean, false) then v_agora else null end,
      case when coalesce((v_item->>'mapa_selecionado')::boolean, false) then v_usuario_nome else null end,
      case when coalesce((v_item->>'mapa_selecionado')::boolean, false) then nullif(v_item->>'mapa_observacao', '') else null end,
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
        set material_code       = coalesce(excluded.material_code, public.cotacao_descricao_map.material_code),
            codigo_produto      = coalesce(excluded.codigo_produto, public.cotacao_descricao_map.codigo_produto),
            vezes_confirmado    = public.cotacao_descricao_map.vezes_confirmado + 1,
            ultima_confirmacao  = now(),
            ultimo_usuario_nome = excluded.ultimo_usuario_nome;
      v_aprendidos := v_aprendidos + 1;
    end if;
  end loop;

  update public.sup_cotacao_propostas
     set ativa = false,
         substituida_por_id = v_nova_id,
         updated_at = v_agora
   where id = v_anterior.id;

  update public.sup_cotacao_proposta_itens
     set mapa_selecionado = false
   where proposta_id = v_anterior.id
     and mapa_selecionado = true;

  return jsonb_build_object(
    'proposta_id', v_nova_id,
    'rodada', v_nova_rodada,
    'itens', v_itens,
    'aprendidos', v_aprendidos
  );
end;
$function$;

grant execute on function public.salvar_renegociacao_cotacao(jsonb) to authenticated;
