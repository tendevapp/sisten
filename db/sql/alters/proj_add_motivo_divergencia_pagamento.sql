-- =====================================================================
-- ESPELHO DOCUMENTAL — não é executado pelo Supabase CLI.
-- A fonte aplicada é a migration em supabase/migrations/:
--   20260909150535_proj_add_motivo_divergencia_pagamento.sql
-- Mantido aqui pela convenção de db/README.md.
-- =====================================================================

alter table public.proj_sobressalentes drop constraint proj_sobressalentes_motivo_check;
alter table public.proj_sobressalentes add constraint proj_sobressalentes_motivo_check
  check (motivo = any (array['quebra_montagem','deformacao_solda','nc_fornecedor','perda_extravio','divergencia_bom','divergencia_pagamento','outros']));
