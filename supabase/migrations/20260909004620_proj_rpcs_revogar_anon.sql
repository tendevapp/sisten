-- =====================================================================
-- Almoxarifado > Projetos — revoga EXECUTE de `anon` nas RPCs de estoque
--
-- O Supabase concede EXECUTE a `anon` por DEFAULT PRIVILEGES no schema
-- `public`, então o `revoke ... from public` da migration anterior não
-- bastou — o linter (0028) apontou as seis funções como chamáveis sem
-- login via /rest/v1/rpc/. Elas mexem em estoque; exigem sessão.
-- =====================================================================

revoke execute on function public.proj_validar_saldo(jsonb) from anon;
revoke execute on function public.proj_registrar_entrada_nf(jsonb, jsonb, jsonb) from anon;
revoke execute on function public.proj_registrar_saida_premontagem(jsonb, jsonb, text[]) from anon;
revoke execute on function public.proj_concluir_premontagem(uuid, jsonb, jsonb) from anon;
revoke execute on function public.proj_entregar_producao(jsonb) from anon;
revoke execute on function public.proj_registrar_sobressalente(jsonb, jsonb) from anon;
revoke execute on function public.proj_sincronizar_itens(text) from anon;
