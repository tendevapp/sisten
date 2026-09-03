-- 1) Views SECURITY DEFINER -> security_invoker (padrao ja usado nas demais views do projeto).
--    Todas as tabelas base possuem policy permissiva para authenticated, entao o acesso
--    do app (que loga via signInWithPassword) permanece inalterado.
alter view public.requisicoes                      set (security_invoker = on);
alter view public.vw_demandas                      set (security_invoker = on);
alter view public.vw_sap_pedidos_enriquecidos      set (security_invoker = on);
alter view public.vw_sap_requisicoes_enriquecidas  set (security_invoker = on);
alter view public.vw_sap_materiais_estatisticas    set (security_invoker = on);
alter view public.vw_historico_pedidos             set (security_invoker = on);
alter view public.vw_historico_fornecedores_sem_po set (security_invoker = on);
alter view public.vw_rh_ase_itens                  set (security_invoker = on);
alter view public.vw_auditoria_compras             set (security_invoker = on);
alter view public.vw_auditoria_historico_material  set (security_invoker = on);
alter view public.vw_rh_rotas_colaboradores        set (security_invoker = on);

-- 2) search_path fixo na funcao de trigger (evita resolucao de nomes por search_path do chamador).
alter function public.trg_core_perfis_upper_name() set search_path = public, pg_temp;

-- 3) Materialized views nao suportam RLS. Continuam legiveis por authenticated porque
--    as views security_invoker acima dependem desse GRANT, mas deixam de ser expostas
--    a chave anon (que fica publica no bundle do frontend).
revoke select on public.mv_pedido_atual_por_ri from anon;
revoke select on public.mv_benchmark_material  from anon;
revoke select on public.mv_historico_pedidos   from anon;
revoke select on public.mv_material_sinais     from anon;

-- 4) has_role() estava com EXECUTE para PUBLIC, o que fazia anon herdar o acesso ao
--    endpoint /rest/v1/rpc/has_role. Somente authenticated precisa executa-la
--    (todas as policies que a usam sao restritas a role authenticated).
revoke execute on function public.has_role(text) from public, anon;
grant  execute on function public.has_role(text) to authenticated, service_role;
