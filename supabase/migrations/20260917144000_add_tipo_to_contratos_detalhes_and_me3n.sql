-- Adiciona coluna tipo (PJ, Serviço, Material) em contratos_detalhes e sap_me3n_contrato,
-- atualizando também a view me3n_contratos.

ALTER TABLE public.contratos_detalhes ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.sap_me3n_contrato ADD COLUMN IF NOT EXISTS tipo text;

CREATE OR REPLACE VIEW public.me3n_contratos WITH (security_invoker=true) AS
 SELECT id,
    documento_compras,
    data_documento,
    fornecedor,
    centro,
    item,
    material,
    texto_breve,
    qtd_solicit_anterior,
    unidade_preco,
    preco_liquido,
    valor_solicitado,
    valor_efetivo,
    qtd_prev_pendente,
    valor_pendente,
    a_fornecer_qtd,
    a_fornecer_valor,
    ainda_faturar_qtd,
    ainda_faturar_valor,
    fim_validade,
    inicio_validade,
    codigo_eliminacao,
    um_pedido,
    moeda,
    estado_liberacao,
    codigo_liberacao,
    valor_liquido_pedido,
    requisitante,
    historico_pedido,
    criado_por,
    imported_at,
    tipo
   FROM public.sap_me3n_contrato;
