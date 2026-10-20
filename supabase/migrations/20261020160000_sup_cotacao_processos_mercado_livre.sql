-- Suprimentos › Cotações — processo com item comprado pelo Mercado Livre.
--
-- Marcado na criação do processo ("Tem item do Mercado Livre?") ou quando o
-- comprador adiciona uma proposta por print do ML. A Central de Compras usa
-- a marca para pôr a tag amarela "ML" nos itens do processo.

alter table public.sup_cotacao_processos
  add column if not exists mercado_livre boolean not null default false;

comment on column public.sup_cotacao_processos.mercado_livre is
  'Processo tem item comprado pelo Mercado Livre — tag ML na Central de Compras.';
