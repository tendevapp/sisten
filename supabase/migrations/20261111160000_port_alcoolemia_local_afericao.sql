-- Teste de alcoolemia: onde a aferição foi feita.
--
-- A Portaria afere com o ETIL-02 e o SSMA (ambulatório) com o ETIL-01. O
-- local fica gravado na aferição (nulo enquanto o teste está pendente) e
-- aparece na tabela das duas telas. `local_teste` continua sendo o texto
-- livre do termo FRM.SOC-0042 ("Ambulatório TEN").
--
-- Histórico: mesma regra que a tela já usava no selo "Aferido na portaria" —
-- teste aferido com vigilante preenchido = Portaria; sem vigilante = SSMA.
-- O etilômetro gravado no histórico não é reescrito. O log de auditoria fica
-- desligado só durante o preenchimento, para não gerar 132 "alterações".

alter table public.port_alcoolemia_testes
  add column if not exists local_afericao text;

alter table public.port_alcoolemia_testes
  drop constraint if exists port_alcoolemia_testes_local_afericao_check;
alter table public.port_alcoolemia_testes
  add constraint port_alcoolemia_testes_local_afericao_check
  check (local_afericao is null or local_afericao in ('PORTARIA', 'SSMA'));

comment on column public.port_alcoolemia_testes.local_afericao is
  'Onde a aferição foi feita: PORTARIA (ETIL-02) ou SSMA (ETIL-01). Nulo enquanto pendente.';

alter table public.port_alcoolemia_testes disable trigger trg_port_alcoolemia_log;

update public.port_alcoolemia_testes
   set local_afericao = case when coalesce(btrim(vigilante), '') <> '' then 'PORTARIA' else 'SSMA' end
 where resultado <> 'PENDENTE'
   and local_afericao is null;

alter table public.port_alcoolemia_testes enable trigger trg_port_alcoolemia_log;
