-- =====================================================================
-- Almoxarifado > Projetos — itens desconsiderados na liberação de OS
--
-- Alguns itens da BOM (chapa de aço, placa de aço, flange, cerca quadrada)
-- não são geridos pelo almoxarifado desta forma — vêm de suprimento externo
-- por peso/lote, não por peça — e nunca deveriam travar nem aparecer no
-- romaneio de uma ordem de pré-montagem. Cadastro editável pelo usuário
-- (não hardcoded na tela), com estes 4 já semeados como ponto de partida.
-- =====================================================================

alter table public.proj_itens add column if not exists ignorar_premontagem boolean not null default false;

comment on column public.proj_itens.ignorar_premontagem is
  'Item fica de fora do romaneio de ordens de pré-montagem (não valida saldo, não debita) — gerido fora deste fluxo.';

update public.proj_itens
   set ignorar_premontagem = true
 where projeto = 'GW_JACOBINA'
   and (
     lower(coalesce(descricao,'')) ~ 'chapa.*a[cç]o|a[cç]o.*chapa'
     or lower(coalesce(description,'')) ~ 'steel.*plate|plate.*steel'
     or lower(coalesce(descricao,'')) ~ 'placa.*a[cç]o'
     or lower(coalesce(descricao,'')) ~ 'flange' or lower(coalesce(description,'')) ~ 'flange'
     or lower(coalesce(descricao,'')) ~ 'cerca quadrada' or lower(coalesce(description,'')) ~ 'square fence'
   );
