-- A função de autorização é interna à RLS e não deve ser publicada como RPC.

create schema if not exists private;

create or replace function private.prod_plano_expedicao_pode_acessar()
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
           (perfil.page_access ->> 'prod_expedicao')::boolean,
           (perfil.page_access ->> 'producao_home')::boolean,
           false
         )
       )
  );
$$;

revoke all on function private.prod_plano_expedicao_pode_acessar() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.prod_plano_expedicao_pode_acessar() to authenticated, service_role;

drop policy if exists prod_plano_expedicao_select on public.prod_plano_expedicao;
drop policy if exists prod_plano_expedicao_update on public.prod_plano_expedicao;
drop policy if exists prod_plano_expedicao_historico_select on public.prod_plano_expedicao_historico;

create policy prod_plano_expedicao_select on public.prod_plano_expedicao
for select to authenticated using ((select private.prod_plano_expedicao_pode_acessar()));
create policy prod_plano_expedicao_update on public.prod_plano_expedicao
for update to authenticated
using ((select private.prod_plano_expedicao_pode_acessar()))
with check ((select private.prod_plano_expedicao_pode_acessar()));
create policy prod_plano_expedicao_historico_select on public.prod_plano_expedicao_historico
for select to authenticated using ((select private.prod_plano_expedicao_pode_acessar()));

drop function if exists public.prod_plano_expedicao_pode_acessar();
notify pgrst, 'reload schema';
