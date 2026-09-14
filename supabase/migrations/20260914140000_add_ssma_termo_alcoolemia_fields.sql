/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

-- Migration: Campos para Termo de Execução de Alcoolemia SSMA (FRM.SOC-0042)
alter table public.port_alcoolemia_testes add column if not exists razao_teste text default 'ALEATORIO';
alter table public.port_alcoolemia_testes add column if not exists local_teste text default 'Ambulatório TEN';
alter table public.port_alcoolemia_testes add column if not exists examinador_nome text;
alter table public.port_alcoolemia_testes add column if not exists examinador_cargo text;
alter table public.port_alcoolemia_testes add column if not exists termo_assinado_fisicamente boolean default false;
alter table public.port_alcoolemia_testes add column if not exists termo_impresso_em timestamptz;

-- Permitir que operadores autenticados de SSMA e Portaria atualizem o teste de alcoolemia:
drop policy if exists port_alcoolemia_testes_upd on public.port_alcoolemia_testes;
create policy port_alcoolemia_testes_upd on public.port_alcoolemia_testes
  for update using (auth.uid() is not null)
  with check (auth.uid() is not null);
