-- Mapa comparativo de cotações: o que faltava para decidir dentro da matriz.
--
-- 1. valor_frete na proposta — a modalidade (CIF/FOB) sozinha não permite
--    comparar desembolso: um frete de R$ 150 vira o vencedor de uma cotação
--    de R$ 300. A IA não extrai esse campo hoje, então ele é editável no mapa.
-- 2. mapa_selecionado no item — a decisão "compro este item deste fornecedor",
--    marcada célula a célula na matriz. Fica no item (e não numa tabela de
--    decisão à parte) porque a decisão é exatamente 1:1 com a linha cotada e
--    a proposta já é o registro auditável (quem/quando ficam junto).

alter table public.sup_cotacao_propostas
  add column if not exists valor_frete numeric;

comment on column public.sup_cotacao_propostas.valor_frete is
  'Valor do frete cotado pelo fornecedor, informado pelo comprador no mapa comparativo (a extração por IA não cobre este campo).';

alter table public.sup_cotacao_proposta_itens
  add column if not exists mapa_selecionado boolean not null default false,
  add column if not exists mapa_selecionado_em timestamptz,
  add column if not exists mapa_selecionado_por text;

comment on column public.sup_cotacao_proposta_itens.mapa_selecionado is
  'Comprador marcou este item deste fornecedor como o escolhido no mapa comparativo.';

-- A leitura do mapa filtra pelos selecionados de um processo inteiro.
create index if not exists idx_cotacao_proposta_itens_mapa_sel
  on public.sup_cotacao_proposta_itens (proposta_id)
  where mapa_selecionado;
