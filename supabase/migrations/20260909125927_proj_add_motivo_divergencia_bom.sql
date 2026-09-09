alter table public.proj_sobressalentes drop constraint proj_sobressalentes_motivo_check;
alter table public.proj_sobressalentes add constraint proj_sobressalentes_motivo_check
  check (motivo = any (array['quebra_montagem','deformacao_solda','nc_fornecedor','perda_extravio','divergencia_bom','outros']));
