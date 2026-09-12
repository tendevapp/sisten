-- Índice para o JOIN de fallback usado em vw_sap_requisicoes_enriquecidas
-- (migration me2l_fallback_sem_po_contrato), que casa requisicao_compra da
-- ME2L com requisicao_de_compra da sap_me5a_rc.
CREATE INDEX IF NOT EXISTS idx_sap_me2l_pedido_requisicao ON public.sap_me2l_pedido(requisicao_compra);
