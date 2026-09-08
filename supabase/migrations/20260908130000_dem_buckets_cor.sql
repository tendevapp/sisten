-- Cor opcional por coluna (bucket) do módulo Demandas.
alter table public.dem_buckets
  add column if not exists cor text;
