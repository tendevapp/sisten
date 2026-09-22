-- =====================================================================
-- RH > Colaboradores (`rh_pessoas`) — campo CLT/PJ e padronização de turnos
--
-- 1. Adiciona coluna `tipo_vinculo` ('CLT' ou 'PJ'), padrão 'CLT'.
-- 2. Define todos os colaboradores existentes como 'CLT'.
-- 3. Padroniza todos os registros de turnos para MAIÚSCULO em `rh_pessoas` e `rh_turnos`.
-- =====================================================================

alter table public.rh_pessoas
  add column if not exists tipo_vinculo text not null default 'CLT' check (tipo_vinculo in ('CLT', 'PJ'));

-- Atualiza colaboradores existentes
update public.rh_pessoas
  set tipo_vinculo = 'CLT'
  where tipo_vinculo is null;

-- Padronização de turnos em rh_pessoas
update public.rh_pessoas
  set turno = '1º TURNO'
  where turno ilike '1º turno%';

update public.rh_pessoas
  set turno = '2º TURNO'
  where turno ilike '2º turno%';

update public.rh_pessoas
  set turno = '3º TURNO'
  where turno ilike '3º turno%';

-- Padronização de turnos na tabela rh_turnos
update public.rh_turnos
  set nome = upper(nome)
  where nome ilike '%turno%';
