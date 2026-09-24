-- Situação operacional explícita do Plano de Expedição.
-- Faturado é acionado pela NF de faturamento; Expedido é uma decisão posterior
-- do usuário e recebe apresentação verde no relatório e na grade.

alter table public.prod_plano_expedicao
  add column if not exists status text not null default 'a_faturar';

alter table public.prod_plano_expedicao
  drop constraint if exists prod_plano_expedicao_status_check;

alter table public.prod_plano_expedicao
  add constraint prod_plano_expedicao_status_check
  check (status in ('a_faturar', 'faturado', 'expedido'));

update public.prod_plano_expedicao
set status = case
  when nf_expedicao_emitida then 'expedido'
  when nf_faturamento_emitida then 'faturado'
  else 'a_faturar'
end
where status = 'a_faturar';

create index if not exists idx_prod_plano_expedicao_semana_status
  on public.prod_plano_expedicao (semana, status, torre_numero);

notify pgrst, 'reload schema';
