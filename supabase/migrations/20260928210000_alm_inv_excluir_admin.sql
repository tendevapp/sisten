-- =====================================================================
-- Migration: Permitir que administradores excluam inventários cíclicos
-- criados, mesmo que já possuam contagens registradas ou estejam concluídos.
--
-- Usuários comuns (autor) continuam limitados a excluir apenas enquanto
-- nenhum item tiver contagem registrada.
-- =====================================================================

create or replace function public.alm_inv_excluir(p_id uuid, p_por text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dono uuid;
  v_is_admin boolean;
begin
  select criado_por_id into v_dono from public.alm_inventarios where id = p_id and not excluido;
  if not found then raise exception 'Inventário não encontrado.'; end if;

  v_is_admin := public.has_role('admin');

  if not (v_is_admin or (v_dono is not null and v_dono = (select auth.uid()))) then
    raise exception 'Só quem abriu o inventário (ou um admin) pode excluí-lo.';
  end if;

  -- Se não for admin, impede exclusão caso já tenha contagem registrada
  if not v_is_admin and exists (
    select 1 from public.alm_inventario_contagens c
      join public.alm_inventario_itens t on t.id = c.item_id
     where t.inventario_id = p_id
  ) then
    raise exception 'Inventário com contagem registrada só pode ser excluído por um administrador.';
  end if;

  update public.alm_inventarios set excluido = true, excluido_em = now(), excluido_por = p_por where id = p_id;
end;
$$;

grant execute on function public.alm_inv_excluir(uuid, text) to authenticated;
