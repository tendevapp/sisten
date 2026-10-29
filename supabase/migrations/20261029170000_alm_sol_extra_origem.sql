-- Solicitação Extraordinária: de onde ela veio.
--
-- A Ficha de EPI abre sozinha uma Retirada sem Saldo (RSS) com os itens que o
-- depósito de EPI não cobre na ZL0024. `origem`/`origem_ref` = 'ficha_epi' +
-- código da ficha, como na Requisição no Balcão. O índice único impede a
-- segunda RSS da mesma ficha quando a geração é repetida ("Tentar de novo").

alter table public.alm_solicitacao_extra
  add column if not exists origem text,
  add column if not exists origem_ref text;

comment on column public.alm_solicitacao_extra.origem is 'Formulário que abriu a solicitação (ficha_epi); null = lançada à mão.';
comment on column public.alm_solicitacao_extra.origem_ref is 'Código do registro de origem (ex.: EPI-DDMMYY-NN).';

create unique index if not exists alm_sol_extra_origem_ref_uk
  on public.alm_solicitacao_extra (origem, origem_ref)
  where origem is not null and excluido_em is null;
