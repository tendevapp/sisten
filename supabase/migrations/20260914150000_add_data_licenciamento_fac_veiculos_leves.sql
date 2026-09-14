-- Facilities: data de licenciamento dos veiculos leves.
alter table public.fac_veiculos_leves
  add column if not exists data_licenciamento date;
