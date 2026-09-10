-- =====================================================================
-- `revoke ... from public` na migration anterior não basta: o Supabase
-- concede EXECUTE ao papel `anon` DIRETAMENTE (não só via PUBLIC). Estas
-- funções mexem em recebimento / leem dados SAP e exigem login — mesmo
-- fim do módulo Projetos (ver `proj_rpcs_revogar_anon`).
-- =====================================================================

revoke execute on function public.alm_receb_proximo_codigo(text, date, text) from anon;
revoke execute on function public.alm_receb_po_linhas(text) from anon;
revoke execute on function public.alm_receb_registrar_carga(jsonb) from anon;
revoke execute on function public.alm_receb_registrar_conferencia(jsonb, jsonb, jsonb) from anon;
