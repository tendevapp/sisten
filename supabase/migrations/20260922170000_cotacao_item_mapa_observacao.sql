-- Justificativa do comprador ao escolher, no mapa comparativo, um item que
-- não é a melhor oferta da linha. Opcional — o mapa pede confirmação e
-- oferece o campo; vazio continua valendo como decisão confirmada.
alter table public.sup_cotacao_proposta_itens
  add column if not exists mapa_observacao text;

comment on column public.sup_cotacao_proposta_itens.mapa_observacao is
  'Observação do comprador ao selecionar no mapa um item que não é a melhor oferta da linha.';
