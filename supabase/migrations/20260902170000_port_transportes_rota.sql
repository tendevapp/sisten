-- Módulo Portaria — "Registro de Chegada de Transportes" (FRM.SGP-0009):
-- adiciona a rota do transporte (R1 / R2 / R3 ou valor livre via "Outro"),
-- opcional. Sem CHECK: a UI oferece R1/R2/R3 + digitação livre.

alter table public.port_registro_transportes
  add column if not exists rota text;

-- Remove qualquer restrição de valores fixos que tenha sido aplicada antes.
alter table public.port_registro_transportes
  drop constraint if exists port_registro_transportes_rota_check;

create index if not exists port_registro_transportes_rota_idx
  on public.port_registro_transportes (rota);
