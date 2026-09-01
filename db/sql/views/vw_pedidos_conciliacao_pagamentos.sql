-- View de Conciliação de Pagamentos de Pedidos de Compras (PO x MIRO x FBL1N)
-- Agrupa por número de pedido de compras, calculando o valor total faturado,
-- o valor pago/compensado no Contas a Pagar e o status consolidado de liquidação,
-- com enriquecimento 1:1 de materiais e deduplicação de partidas financeiras.

DROP VIEW IF EXISTS public.vw_pedidos_conciliacao_detalhes CASCADE;
DROP VIEW IF EXISTS public.vw_pedidos_conciliacao_pagamentos CASCADE;

-- View detalhada linha a linha de cada item da ZL0170
CREATE VIEW public.vw_pedidos_conciliacao_detalhes WITH (security_invoker = true) AS
SELECT 
  z.id,
  z.numero_pedido,
  z.item,
  z.material,
  z.material AS material_codigo,
  COALESCE(
    (SELECT ped.txt_breve FROM public.sap_zl0132_po ped WHERE ped.doc_compra = z.numero_pedido AND ped.item = z.item LIMIT 1),
    (SELECT mat.description FROM public.materials mat WHERE mat.material_code = z.material LIMIT 1),
    (SELECT stk.txt_breve_material FROM public.sap_zl0024_stk stk WHERE stk.material = z.material LIMIT 1),
    (SELECT mb.texto_breve_material FROM public.sap_mb51_mov mb WHERE mb.material = z.material LIMIT 1),
    z.material
  ) AS material_descricao,
  z.empresa,
  z.centro,
  z.fornecedor,
  COALESCE(z.nome_1, f.razao_social_fornecedor, 'Sem Razão Social') AS razao_social_fornecedor,
  z.doc_migo,
  z.data_lancamento_migo,
  z.qtd_migo,
  z.montante_migo,
  z.doc_miro,
  z.ano_miro,
  z.data_lancamento_miro,
  z.data_documento AS data_documento_miro,
  z.referencia AS nf_referencia,
  z.qtd_miro,
  z.montante_miro,
  z.numero_doc_contabil,
  
  -- Dados Contas a Pagar (FBL1N agregados 1:1 por documento)
  f.numero_documento AS doc_fbl1n,
  f.tipo_documento,
  f.data_lancamento AS data_lancamento_fbl1n,
  f.vencimento_liquido,
  f.doc_compensacao,
  f.data_compensacao,
  COALESCE(f.data_pagamento, z.data_pagamento) AS data_pagamento,
  COALESCE(f.doc_compensacao, z.doc_pagamento) AS doc_pagamento,

  -- Status individual da NF
  CASE 
    WHEN z.doc_miro IS NULL OR z.doc_miro = '' THEN 'PENDENTE FATURAMENTO'
    WHEN (f.data_compensacao IS NOT NULL OR (f.doc_compensacao IS NOT NULL AND f.doc_compensacao NOT IN ('', '—')) OR z.data_pagamento IS NOT NULL) THEN 'PAGO'
    WHEN f.vencimento_liquido IS NOT NULL AND f.vencimento_liquido < CURRENT_DATE THEN 'VENCIDO'
    ELSE 'EM ABERTO'
  END AS status_nf

FROM public.sap_zl0170_miro z
LEFT JOIN (
  SELECT 
    numero_documento,
    MAX(razao_social_fornecedor) AS razao_social_fornecedor,
    MAX(tipo_documento) AS tipo_documento,
    MAX(data_lancamento) AS data_lancamento,
    MIN(vencimento_liquido) AS vencimento_liquido,
    MAX(doc_compensacao) AS doc_compensacao,
    MAX(data_compensacao) AS data_compensacao,
    MAX(data_pagamento) AS data_pagamento
  FROM public.sap_fbl1n_pagar
  GROUP BY numero_documento
) f ON (f.numero_documento = z.numero_doc_contabil);

GRANT SELECT ON public.vw_pedidos_conciliacao_detalhes TO anon, authenticated, service_role;

-- View agregada por Pedido (PO)
CREATE VIEW public.vw_pedidos_conciliacao_pagamentos WITH (security_invoker = true) AS
SELECT 
  d.numero_pedido,
  MAX(d.empresa) AS empresa,
  MAX(d.centro) AS centro,
  MAX(d.fornecedor) AS fornecedor,
  MAX(d.razao_social_fornecedor) AS razao_social_fornecedor,
  MIN(z.data_criacao_pedido) AS data_criacao_pedido,
  MIN(z.data_aprovacao_pedido) AS data_aprovacao_pedido,
  
  COUNT(DISTINCT d.nf_referencia) FILTER (WHERE d.nf_referencia IS NOT NULL AND d.nf_referencia <> '') AS qtd_nfs,
  COUNT(DISTINCT d.doc_miro) FILTER (WHERE d.doc_miro IS NOT NULL AND d.doc_miro <> '') AS qtd_miros,
  COUNT(DISTINCT d.item) AS qtd_itens,
  COUNT(DISTINCT d.material_codigo) FILTER (WHERE d.material_codigo IS NOT NULL AND d.material_codigo <> '') AS qtd_materiais,
  STRING_AGG(DISTINCT d.material_descricao, ' | ') AS materiais_nomes,
  
  COALESCE(SUM(DISTINCT z.valor_liquido), 0) AS valor_pedido,
  COALESCE(SUM(d.montante_miro), 0) AS total_faturado_miro,
  
  -- Total pago (compensado)
  COALESCE(SUM(CASE 
    WHEN d.status_nf = 'PAGO' THEN d.montante_miro 
    ELSE 0 
  END), 0) AS total_pago,

  -- Total em aberto
  COALESCE(SUM(CASE 
    WHEN d.status_nf <> 'PAGO' AND d.status_nf <> 'PENDENTE FATURAMENTO' THEN d.montante_miro 
    ELSE 0 
  END), 0) AS total_em_aberto,

  -- Qtd NFs pagas
  COUNT(DISTINCT CASE 
    WHEN d.status_nf = 'PAGO' THEN d.nf_referencia 
  END) AS qtd_nfs_pagas,

  -- Qtd NFs em aberto
  COUNT(DISTINCT CASE 
    WHEN d.status_nf <> 'PAGO' AND d.status_nf <> 'PENDENTE FATURAMENTO' THEN d.nf_referencia 
  END) AS qtd_nfs_abertas,

  -- Status consolidado do Pedido
  CASE 
    WHEN COUNT(DISTINCT d.doc_miro) = 0 THEN 'PENDENTE FATURAMENTO'
    WHEN COUNT(DISTINCT CASE WHEN d.status_nf <> 'PAGO' AND d.status_nf <> 'PENDENTE FATURAMENTO' THEN d.nf_referencia END) = 0 THEN 'TOTALMENTE PAGO'
    WHEN COUNT(DISTINCT CASE WHEN d.status_nf = 'PAGO' THEN d.nf_referencia END) = 0 THEN 'EM ABERTO'
    ELSE 'PARCIALMENTE PAGO'
  END AS status_pagamento

FROM public.vw_pedidos_conciliacao_detalhes d
JOIN public.sap_zl0170_miro z ON z.id = d.id
WHERE d.numero_pedido IS NOT NULL
GROUP BY d.numero_pedido;

GRANT SELECT ON public.vw_pedidos_conciliacao_pagamentos TO anon, authenticated, service_role;
