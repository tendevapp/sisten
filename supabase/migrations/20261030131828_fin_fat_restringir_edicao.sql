-- =====================================================================
-- Financeiro > Faturamento GW Jacobina — edição só para quem tem a página.
--
-- 20260911180000 liberou UPDATE/DELETE e a RPC `fin_fat_editar` a qualquer
-- usuário autenticado, contando que "a página é a barreira". Não era: o
-- painel também aparece em Geral › Relatórios (liberada a todos) com o botão
-- "Editar Lançamento", e um usuário do Planejamento lançou data de faturamento
-- por lá (30/10/2026, Torre 18 / T5).
--
-- Agora o banco confere o mesmo critério de `canAccessPage(user,
-- 'fin_faturamento_gwjaco')` em `src/lib/pages.ts`:
--   1. admin;
--   2. `page_access.fin_faturamento_gwjaco` explícito (true libera, false bloqueia);
--   3. setores Financeiro (6), Contabilidade (7) e Controladoria (18);
--   4. papéis comprador / coordenador_suprimentos (defaultRoles da página).
-- Se mudar a regra em pages.ts, mude aqui também.
-- =====================================================================

create or replace function private.fin_fat_pode_editar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.core_perfis perfil
     where perfil.id = (select auth.uid())::text
       and perfil.status = 'ativo'
       and (
         'admin' = any(perfil.roles)
         or coalesce(
              (perfil.page_access ->> 'fin_faturamento_gwjaco')::boolean,
              perfil.sector_id in ('6', '7', '18')
                or perfil.roles && array['comprador', 'coordenador_suprimentos']::text[]
            )
       )
  );
$$;

revoke all on function private.fin_fat_pode_editar() from public, anon;
grant execute on function private.fin_fat_pode_editar() to authenticated, service_role;

drop policy if exists fin_fat_gwjaco_ins on public.fin_fat_gwjaco;
create policy fin_fat_gwjaco_ins on public.fin_fat_gwjaco
  for insert to authenticated
  with check (
    (select private.fin_fat_pode_editar())
    and (
      criado_por_id is null
      or criado_por_id = (select auth.uid())
      or (select has_role('admin'::text))
    )
  );

drop policy if exists fin_fat_gwjaco_upd on public.fin_fat_gwjaco;
create policy fin_fat_gwjaco_upd on public.fin_fat_gwjaco
  for update to authenticated
  using ((select private.fin_fat_pode_editar()))
  with check ((select private.fin_fat_pode_editar()));

drop policy if exists fin_fat_gwjaco_del on public.fin_fat_gwjaco;
create policy fin_fat_gwjaco_del on public.fin_fat_gwjaco
  for delete to authenticated
  using ((select private.fin_fat_pode_editar()));

-- A RPC é SECURITY DEFINER (ignora RLS), então confere a permissão ela mesma.
create or replace function public.fin_fat_editar(
  p_id uuid, p_patch jsonb, p_user jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.fin_fat_gwjaco;
  v_alt jsonb := '[]'::jsonb;
  v_campos text[] := array['torre_numero','tramo','serie','codigo_cliente','projeto_codigo',
                           'part_number','nota_fiscal','data_faturado','semana_faturamento',
                           'data_expedido','data_tramos_previstos','restricao','observacao'];
  k text;
  v_de text;
  v_para text;
begin
  if not (select private.fin_fat_pode_editar()) then
    raise exception 'Sem permissão para editar o faturamento.' using errcode = '42501';
  end if;

  select * into v_old from public.fin_fat_gwjaco where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;

  foreach k in array v_campos loop
    if p_patch ? k then
      v_de := (to_jsonb(v_old) ->> k);
      v_para := (p_patch ->> k);
      if coalesce(v_de,'') is distinct from coalesce(v_para,'') then
        v_alt := v_alt || jsonb_build_object('campo', k, 'de', v_de, 'para', v_para);
      end if;
    end if;
  end loop;

  update public.fin_fat_gwjaco set
    torre_numero = coalesce((p_patch->>'torre_numero')::int, torre_numero),
    tramo = coalesce(nullif(p_patch->>'tramo',''), tramo),
    serie = case when p_patch ? 'serie' then nullif(p_patch->>'serie','')::int else serie end,
    codigo_cliente = case when p_patch ? 'codigo_cliente' then nullif(p_patch->>'codigo_cliente','') else codigo_cliente end,
    projeto_codigo = case when p_patch ? 'projeto_codigo' then nullif(p_patch->>'projeto_codigo','') else projeto_codigo end,
    part_number = case when p_patch ? 'part_number' then nullif(p_patch->>'part_number','') else part_number end,
    nota_fiscal = case when p_patch ? 'nota_fiscal' then nullif(p_patch->>'nota_fiscal','') else nota_fiscal end,
    data_faturado = case when p_patch ? 'data_faturado' then nullif(p_patch->>'data_faturado','')::date else data_faturado end,
    semana_faturamento = case when p_patch ? 'semana_faturamento' then nullif(p_patch->>'semana_faturamento','')::int else semana_faturamento end,
    data_expedido = case when p_patch ? 'data_expedido' then nullif(p_patch->>'data_expedido','')::date else data_expedido end,
    data_tramos_previstos = case when p_patch ? 'data_tramos_previstos' then nullif(p_patch->>'data_tramos_previstos','')::date else data_tramos_previstos end,
    restricao = case when p_patch ? 'restricao' then coalesce((p_patch->>'restricao')::boolean, false) else restricao end,
    observacao = case when p_patch ? 'observacao' then nullif(p_patch->>'observacao','') else observacao end,
    updated_at = now()
  where id = p_id;

  if jsonb_array_length(v_alt) > 0 then
    insert into public.fin_fat_alteracoes (fat_id, alteracoes, resumo, alterado_por_id, alterado_por_nome)
    values (p_id, v_alt, jsonb_array_length(v_alt) || ' campo(s) alterado(s)',
            nullif(p_user->>'id','')::uuid, p_user->>'nome');
  end if;

  return jsonb_build_object('id', p_id, 'alteracoes', jsonb_array_length(v_alt));
end;
$$;

revoke all on function public.fin_fat_editar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.fin_fat_editar(uuid, jsonb, jsonb) to authenticated, service_role;
