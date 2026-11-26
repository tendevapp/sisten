-- Contas a Pagar: "Montante pago" / "Total compensado" passa a somar só PAGAMENTO.
--
-- Antes: toda partida compensada com valor positivo contava como pago. Isso
-- somava duas vezes o mesmo dinheiro (ex.: Atlanta R$ 9,27 mi, pago de fato
-- R$ 2,85 mi):
--   * AB (documento contábil): reorganização de partidas — a fatura RE é
--     compensada num AB que cria a partida nova (líquida do desconto do
--     adiantamento), e essa partida é que o ZP paga. O "saldo do adiantamento"
--     também rola de um AB para o seguinte, e cada rolagem entrava como pago.
--   * KS parcelado: a fatura de 237 mil vira duas parcelas pagas por ZP; o
--     lado positivo do parcelamento contava junto com os dois ZP.
--   * RE/KA/KM positivos: nota de crédito/estorno de fatura, não é pagamento.
--   * Pagamento estornado (estorno_com preenchido): o ZP/KZ original e o
--     documento de estorno se anulam, mas o original continuava somando.
--
-- Agora: cadastro_tipodoc.conta_como_pagamento marca os tipos que são saída de
-- dinheiro (editável no cadastro), e a view expõe `eh_pagamento` = tipo
-- marcado E documento sem estorno. O front soma só essas linhas.

alter table public.cadastro_tipodoc
  add column if not exists conta_como_pagamento boolean not null default false;

comment on column public.cadastro_tipodoc.conta_como_pagamento is
  'Partida compensada positiva deste tipo entra no "Montante pago" de Contas a Pagar.';

update public.cadastro_tipodoc
   set conta_como_pagamento = true, updated_at = now()
 where codigo in (
   'KZ', -- Pagamento fornecedor
   'ZP', -- Pagamento Automático
   'ZA', -- Pagamento ANTECIPA
   'ZS', -- Pagto.por cheque
   'FR', -- Pagamentos do RH
   'FP', -- Pagamento de PRV
   'PA', -- Pagamento Aluguel
   'PC', -- Pagamento Comissão
   'PD', -- Despesas Colaborador
   'PI', -- Pagamento Imposto
   'PJ', -- Pagamento de Juros
   'PO', -- Pagamento IR Corpor.
   'PT'  -- Pagamento Tributário
 );

create or replace view public.vw_fbl1n_c_pagar_analise
with (security_invoker = on) as
 select f.id,
    f.simbolo_partida,
    f.codigo_imposto,
    f.empresa,
    f.chave_referencia_1,
    f.conta,
    f.numero_documento,
    f.razao_social_fornecedor,
    f.ano_mes,
    f.referencia,
    f.data_documento,
    f.data_lancamento,
    f.tipo_documento,
    f.estorno_com,
    f.conta_lancamento_contrapartida,
    f.data_pagamento,
    f.montante_moeda_doc,
    f.montante_base_desconto,
    f.montante_base_irf,
    f.montante_irf,
    f.moeda_documento,
    f.data_compensacao,
    f.doc_compensacao,
    f.centro,
    f.documento_compras,
    f.elemento_pep,
    f.imobilizado,
    f.loc_negocios,
    f.id_fiscal_1,
    f.id_fiscal_iva,
    f.texto,
    f.atribuicao,
    f.centro_lucro,
    f.parcelamento_tributario,
    f.texto_cabecalho_documento,
    f.bloqueio_pagamento,
    f.montante_mi2,
    f.montante_mi3,
    f.condicoes_pagamento,
    f.data_entrada,
    f.doc_faturamento,
    f.fornecedor,
    f.motivo_estorno,
    f.vencimento_liquido,
    f.vencimento_original,
    f.parcela,
    f.campos_extras,
    f.imported_at,
    t.tipo_documento as tipo_documento_descricao,
    t.categoria_modulo as tipo_documento_categoria_modulo,
    t.descricao_operacional as tipo_documento_descricao_operacional,
    (coalesce(t.conta_como_pagamento, false)
      and nullif(btrim(f.estorno_com::text), '') is null) as eh_pagamento
   from sap_fbl1n_pagar f
     left join cadastro_tipodoc t on t.codigo = f.tipo_documento;
