-- Fecha o que sobrou do acesso sem login no schema public.
--
-- Depois de 20260929150200 e 150300 nenhuma policy do schema public é aberta a
-- anon/PUBLIC, então as tabelas já barram a chave anon pela RLS. O que ainda
-- vazava: views e materialized views que rodam com os direitos do dono (sem
-- security_invoker) e mantinham SELECT para anon — mv_historico_pedidos,
-- mv_pedidos_por_ri, compradores, vw_historico_fornecedores_sem_po,
-- vw_historico_pedidos, vw_sap_pedidos_enriquecidos. Elas ignoram a RLS das
-- tabelas de base, então pedidos e fornecedores saíam sem login.
--
-- O app inteiro exige sessão: nenhuma tela lê o banco como anon. Tirar os
-- grants de anon deixa a RLS como defesa em profundidade, em vez de única
-- barreira. `authenticated` e `service_role` não mudam.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
