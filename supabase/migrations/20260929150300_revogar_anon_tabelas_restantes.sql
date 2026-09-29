-- Continuação de 20260929150200: tira o acesso sem login (anon / PUBLIC) das
-- demais tabelas que ainda o tinham. A chave anon vai no bundle do site, então
-- qualquer pessoa na internet lia — e, na maioria, gravava e apagava — estas
-- tabelas via /rest/v1/<tabela>. O app inteiro exige sessão.
--
-- Em vez de recriar cada policy, `alter policy ... to` troca só os papéis
-- (anon / public → authenticated) e preserva o using / with check de cada uma,
-- inclusive as que já checam autor (port_alcoolemia_testes). Restringir a
-- escrita por perfil segue sendo a fase 2.

do $$
declare
  v_tabelas text[] := array[
    'almox_rm_exportacao_solicitacoes',
    'almox_rm_exportacoes',
    'cadastro_tipodoc',
    'config_envio_emails',
    'deposito_estoque',
    'fin_rubrica_exclusoes_material',
    'fin_rubrica_mapeamentos',
    'fin_rubricas',
    'port_alcoolemia_testes',
    'prod_etapas',
    'prod_recursos',
    'prod_tramos_entrega',
    'prod_tramos_entrega_checklist',
    'prod_virolas',
    'proj_bom_gwjaco',
    'proj_entregas_producao',
    'proj_itens',
    'proj_kits',
    'proj_matriz_autonomia_kits',
    'proj_movimentos',
    'proj_notas_entrada',
    'proj_notas_entrada_pais',
    'proj_ordens_premontagem',
    'proj_ordens_premontagem_alvos',
    'proj_ordens_premontagem_itens',
    'proj_sobressalentes',
    'proj_sobressalentes_itens',
    'proj_subprojetos',
    'proj_torres_planejamento',
    'proj_tramos_gwjaco',
    'sup_grupo_comprador_mercadorias',
    'sup_setor_compradores',
    'tipo_mov_estoque'
  ];
  r record;
  v_papeis text;
  t text;
begin
  for r in
    select schemaname, tablename, policyname, roles
    from pg_policies
    where schemaname = 'public'
      and tablename = any(v_tabelas)
      and roles && array['anon', 'public']::name[]
  loop
    select string_agg(quote_ident(x), ', ' order by x)
      into v_papeis
      from (
        select distinct x
        from unnest(r.roles || array['authenticated']::name[]) as x
        where x not in ('anon', 'public')
      ) s;

    execute format('alter policy %I on %I.%I to %s', r.policyname, r.schemaname, r.tablename, v_papeis);
  end loop;

  foreach t in array v_tabelas loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;

  -- Trava de segurança: se sobrar policy aberta a anon/PUBLIC, aborta a migration.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = any(v_tabelas)
      and roles && array['anon', 'public']::name[]
  ) then
    raise exception 'Ainda há policies para anon/public nas tabelas revisadas.';
  end if;
end;
$$;
