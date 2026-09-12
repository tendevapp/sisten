-- Cotações: peso estimado, frete teórico, item desconsiderado e preço líquido.
--
-- Quatro decisões novas passam a viver no item cotado:
--
-- 1. `desconsiderado` — item que o comprador tira do mapa de cotação (brinde,
--    linha de serviço, item que a IA quebrou em dois). Diferente de
--    `fora_escopo`, que é "cotado, mas não pedido nesta RM" e SEGUE no mapa:
--    o desconsiderado não vira linha, não vira célula e não vira pedido.
--
-- 2. `peso_unitario_kg` / `peso_origem` — a noção de peso que a IA estima a
--    partir da descrição do produto. É o insumo que falta para simular o
--    frete FOB pela tabela da Bahia Sul antes de o fornecedor cotar frete.
--
-- 3. `frete_teorico` — a parcela do frete simulado atribuída a este item
--    (rateio por peso). Entra na composição do custo: preço + impostos +
--    frete.
--
-- 4. `codigo_fiscal` / `preco_liquido_*` / `custo_total_item` — o resultado da
--    Calc Impostos congelado no momento em que o comprador salva o pedido.
--    Fica gravado (e não recalculado a cada leitura) porque é o número que
--    justificou a decisão de compra: alíquota que mude depois não pode
--    reescrever o histórico.
--
-- `vinculo_divergencias` guarda o que a IA (ou a conferência determinística)
-- achou diferente entre o item cotado e o item de RM sugerido — o chip de
-- alerta da grade lê daqui.

alter table public.sup_cotacao_proposta_itens
  add column if not exists desconsiderado boolean not null default false,
  add column if not exists peso_unitario_kg numeric(14,4),
  add column if not exists peso_origem text,
  add column if not exists vinculo_divergencias text[] not null default '{}',
  add column if not exists frete_teorico numeric(15,2),
  add column if not exists codigo_fiscal text,
  add column if not exists preco_liquido_unitario numeric(18,6),
  add column if not exists preco_liquido_total numeric(15,2),
  add column if not exists custo_total_item numeric(15,2);

comment on column public.sup_cotacao_proposta_itens.desconsiderado is
  'Comprador tirou este item do mapa de cotação — não vira linha, célula nem pedido.';
comment on column public.sup_cotacao_proposta_itens.peso_unitario_kg is
  'Peso estimado por unidade (kg), sugerido pela IA a partir da descrição e ajustável pelo comprador.';
comment on column public.sup_cotacao_proposta_itens.peso_origem is
  'De onde veio o peso: ia | manual.';
comment on column public.sup_cotacao_proposta_itens.frete_teorico is
  'Parcela do frete simulado pela tabela Bahia Sul atribuída a este item (rateio por peso). Só para item FOB.';
comment on column public.sup_cotacao_proposta_itens.codigo_fiscal is
  'Código fiscal (preset da Calc Impostos: C1..C5, A3, ISENTO) usado para apurar o preço líquido.';
comment on column public.sup_cotacao_proposta_itens.preco_liquido_total is
  'Preço líquido do item (Calc Impostos), congelado ao salvar o pedido.';
comment on column public.sup_cotacao_proposta_itens.custo_total_item is
  'Composição do custo da compra: preço líquido + frete teórico, congelado ao salvar o pedido.';

alter table public.sup_cotacao_proposta_itens
  drop constraint if exists cotacao_proposta_itens_peso_origem_check;
alter table public.sup_cotacao_proposta_itens
  add constraint cotacao_proposta_itens_peso_origem_check
  check (peso_origem is null or peso_origem in ('ia', 'manual'));

-- A IA passa a sugerir o vínculo com o item de RM já na extração; a origem
-- 'ia' separa essa sugestão da heurística de trigrama ('sugerido') e da
-- memória confirmada ('aprendido'), que têm confiabilidade diferente.
alter table public.sup_cotacao_proposta_itens
  drop constraint if exists cotacao_proposta_itens_vinculo_origem_check;
alter table public.sup_cotacao_proposta_itens
  add constraint cotacao_proposta_itens_vinculo_origem_check
  check (vinculo_origem in ('manual', 'sugerido', 'aprendido', 'ia'));

-- O item desconsiderado não entra em mapa nem em pedido: as duas decisões
-- são mutuamente exclusivas por construção.
create index if not exists idx_cotacao_proposta_itens_desconsiderado
  on public.sup_cotacao_proposta_itens (proposta_id)
  where desconsiderado;

-- A view é o que a RPC de salvamento escreve. `CREATE OR REPLACE VIEW` não
-- aceita inserir coluna no meio da lista (só no fim) — como `desconsiderado`
-- entra logo depois de `fora_escopo`, precisa dropar e recriar. Sem view
-- dependente (checado antes de aplicar); os grants são refeitos abaixo,
-- iguais aos que a view já tinha.
drop view if exists public.cotacao_proposta_itens;

create view public.cotacao_proposta_itens with (security_invoker = 'true') as
 select id, proposta_id, processo_item_id, fora_escopo, desconsiderado,
        vinculo_origem, vinculo_score, vinculo_divergencias,
        ri, material_code, item_numero, codigo_produto, descricao_produto,
        marca_fabricante, unidade_medida, ncm, cst, cfop,
        quantidade, preco_unitario, preco_total_item,
        aliquota_icms_pct, aliquota_pis_pct, aliquota_cofins_pct, aliquota_ipi_pct,
        peso_unitario_kg, peso_origem, frete_teorico,
        codigo_fiscal, preco_liquido_unitario, preco_liquido_total, custo_total_item,
        mapa_selecionado, mapa_selecionado_em, mapa_selecionado_por,
        campos_faltantes, extraido_raw, created_at
   from public.sup_cotacao_proposta_itens;

alter view public.cotacao_proposta_itens owner to postgres;
grant all on public.cotacao_proposta_itens to anon, authenticated, service_role;

-- Salvamento: mesma função de 20260827132829, acrescida das colunas novas do
-- item (desconsiderado, divergências do vínculo, peso, frete teórico e a
-- composição de custo). O resto do corpo é idêntico — inclusive o
-- aprendizado de cotacao_descricao_map ao fim de cada item.
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
