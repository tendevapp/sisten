-- Registros SEDEX anteriores continuam disponíveis para o comprador informar o código real.
alter table public.sup_diligenciamento_itens
  add column codigo_rastreio text,
  add constraint sup_diligenciamento_sedex_exige_rastreio check (
    transportadora !~* '^\s*sedex\s*-\s*coleta\s*$'
    or coalesce(codigo_rastreio, '') ~ '\S'
  ) not valid;
