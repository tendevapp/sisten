-- ISP: administradores ativos de qualquer setor e usuários ativos da Segurança.
create or replace function public.ssma_isp_pode_acessar() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.core_perfis p
    where p.id = (select auth.uid())::text and p.status = 'ativo'
      and (
        'admin' = any(p.roles)
        or (p.sector_id = '13'
          and coalesce(p.page_access->>'formularios','true') = 'true'
          and coalesce(p.page_access->>'form_ssma_isp', p.page_access->>'form_ssma','true') = 'true')
      )
  )
$$;
