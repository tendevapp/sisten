-- Produção › Apontamentos — etapas da planilha "Programado × Realizado".
--
-- A planilha oficial da fábrica (W17..W36) tem linhas que não estavam nos
-- relatórios de WhatsApp. Mapeamento confirmado com o usuário em 25/09/2026:
--   SAW1                        = lw (renomeada "SAW1 — LW (Solda)")
--   SAW2+SAW3                   = solda_virola_saw
--   Liberação de Tramos – SAW3  = saw03 (Nave 2)
--   UT Longitudinal             = nova, Nave 1, depois do SAW1
--   UT Circunferencial          = nova, Nave 2, depois do SAW 03
--   Internos Mecânicos          = nova, White, depois da Pintura

update public.prod_apt_etapas set nome = 'SAW1 — LW (Solda)' where id = 'lw';

insert into public.prod_apt_etapas (id, nave, nome, ordem) values
  ('ut_longitudinal',    'nave1', 'UT Longitudinal',    65),
  ('ut_circunferencial', 'nave2', 'UT Circunferencial', 15),
  ('internos_mecanicos', 'white', 'Internos Mecânicos', 35)
on conflict (id) do nothing;
