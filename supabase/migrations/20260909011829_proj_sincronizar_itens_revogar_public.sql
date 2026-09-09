-- =====================================================================
-- Almoxarifado > Projetos — `proj_sincronizar_itens` exige login
--
-- A função nasceu na migration do catálogo sem revoke de PUBLIC, então
-- continuava chamável sem login (lint 0028) mesmo depois do revoke de
-- `anon`: o EXECUTE vinha herdado de PUBLIC (`=X/postgres` no proacl), não
-- de uma concessão nominal. É função de manutenção de base.
-- =====================================================================

revoke execute on function public.proj_sincronizar_itens(text) from public;
grant execute on function public.proj_sincronizar_itens(text) to authenticated, service_role;
