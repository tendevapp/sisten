-- Fecha a escalada de privilégio em core_perfis.
--
-- A policy `profiles_update_self` deixa cada usuário atualizar a própria
-- linha sem olhar coluna. Como `has_role()` lê `roles` e `status` dessa mesma
-- tabela, qualquer conta autenticada podia se promover a admin com
--   PATCH /rest/v1/core_perfis?id=eq.<uid>  {"roles":["admin"],"status":"ativo"}
-- e, com isso, derrubar todas as regras "só autor ou admin" e as RPCs
-- SECURITY DEFINER que dependem de `has_role`.
--
-- Estratégia por lista de permissão: quem não é admin só altera as colunas
-- de perfil pessoal. Coluna nova nasce protegida por padrão.
--
-- Passam sem checagem:
--   * `auth.uid() is null` — service_role (Edge Functions admin-criar-usuario /
--     admin-reset-password), SQL Editor e migrations;
--   * admin ativo — é o caminho das telas de Administração > Usuários, que
--     gravam por `supabase` com o JWT do admin.

create or replace function public.core_perfis_proteger_autorizacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Colunas que o próprio usuário pode alterar no seu perfil.
  v_liberadas text[] := array[
    'name',
    'cargo',
    'notification_preferences',
    'tours_seen',
    'must_change_password'
  ];
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.has_role('admin') then
    return new;
  end if;

  if (to_jsonb(new) - v_liberadas) is distinct from (to_jsonb(old) - v_liberadas) then
    raise exception 'Sem permissão para alterar campos de autorização do perfil.'
      using errcode = '42501';
  end if;

  -- O usuário pode limpar a exigência de troca de senha (primeiro login),
  -- mas não pode ligá-la — isso é do admin (reset de senha).
  if coalesce(new.must_change_password, false) and not coalesce(old.must_change_password, false) then
    raise exception 'Sem permissão para exigir troca de senha.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.core_perfis_proteger_autorizacao() from public, anon, authenticated;

drop trigger if exists trg_core_perfis_proteger_autorizacao on public.core_perfis;
create trigger trg_core_perfis_proteger_autorizacao
  before update on public.core_perfis
  for each row
  execute function public.core_perfis_proteger_autorizacao();

-- INSERT: cada um só cria o próprio perfil e sempre como visualizador sem
-- privilégios. O `handle_new_user` (SECURITY DEFINER) já cria a linha no
-- cadastro; este caminho cobre só o fallback de login do app.
drop policy if exists "profiles_insert" on public.core_perfis;
create policy "profiles_insert"
  on public.core_perfis
  for insert to authenticated
  with check (
    public.has_role('admin')
    or (
      (select auth.uid())::text = id
      and roles = array['visualizador']::text[]
      and coalesce(status, 'pendente') in ('ativo', 'pendente')
      and page_access = '{}'::jsonb
      and aprovador_setores = '[]'::jsonb
      and demandas_setores = '[]'::jsonb
      and aprovador_cadastro_sap = false
      and grupo_compras is null
      and coalesce(must_change_password, false) = false
    )
  );
