-- =====================================================================
-- Tira o `anon` das funções de vínculo
--
-- As quatro funções de vínculo são SECURITY DEFINER e liberam a execução
-- quando `auth.uid()` é nulo — assim a Edge Function (service_role) e uma
-- rotina agendada conseguem rodar o casamento sem se passar por um usuário.
--
-- Só que `anon` também tem `auth.uid()` nulo. Com o EXECUTE que o PostgREST
-- concede por padrão, uma chamada sem login em `/rest/v1/rpc/...` passaria
-- direto pelo guard e poderia recalcular, confirmar ou rejeitar vínculos.
-- O `revoke ... from public` das migrations anteriores não resolve isso: o
-- privilégio do `anon` é próprio, não herdado de PUBLIC.
--
-- Apontado pelo linter de segurança do Supabase
-- (`anon_security_definer_function_executable`) logo depois da carga inicial.
-- =====================================================================

revoke execute on function public.casar_cotacao_pedidos(date, integer, numeric, text, text, boolean) from anon;
revoke execute on function public.confirmar_vinculo_cotacao(uuid, boolean, text, text, text, text) from anon;
revoke execute on function public.candidatos_ia_vinculo(integer, integer, uuid[]) from anon;
revoke execute on function public.registrar_vinculos_ia(jsonb, text, text, text) from anon;
