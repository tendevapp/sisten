-- Assinaturas também durante o preenchimento: o autor pode coletar no
-- rascunho (grava ao salvar) ou fechar e coletar depois pela fila. Fechar um
-- rascunho que já tem as 4 assinaturas finaliza direto.

create or replace function public.qua_checklist_exp_pode_assinar(p_checklist_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.qua_checklist_expedicoes c
    where c.id::text = p_checklist_id
      and (
        public.has_role('admin')
        or (c.status = 'RASCUNHO' and c.criado_por = (select auth.uid())::text)
        or (
          c.status = 'AGUARDANDO_ASSINATURAS'
          and (c.criado_por = (select auth.uid())::text or public.usuario_do_setor('Qualidade'))
        )
      )
  )
$$;

create or replace function public.qua_checklist_exp_proteger_fechado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Fechar com as 4 assinaturas já coletadas no rascunho finaliza direto.
  if old.status = 'RASCUNHO' and new.status = 'AGUARDANDO_ASSINATURAS'
     and (select count(distinct a.papel) from public.qua_checklist_expedicao_assinaturas a where a.checklist_id = new.id) >= 4 then
    new.status := 'FINALIZADO';
    new.finalizado_em := now();
  end if;
  if old.status = 'RASCUNHO' or public.has_role('admin') then
    return new;
  end if;
  if old.status = 'FINALIZADO' then
    raise exception 'Checklist finalizado não pode ser alterado.';
  end if;
  if (new.codigo_registro, new.cliente, new.projeto, new.tramo_sequencial, new.numero_serie, new.data_expedicao,
      new.site, new.inspetor_qualidade, new.etiqueta_secao, new.respostas, new.observacoes)
     is distinct from
     (old.codigo_registro, old.cliente, old.projeto, old.tramo_sequencial, old.numero_serie, old.data_expedicao,
      old.site, old.inspetor_qualidade, old.etiqueta_secao, old.respostas, old.observacoes) then
    raise exception 'Checklist fechado: o conteúdo não pode ser alterado. Reabra antes de coletar assinaturas.';
  end if;
  if new.status = 'RASCUNHO' and exists (
    select 1 from public.qua_checklist_expedicao_assinaturas a where a.checklist_id = old.id
  ) then
    raise exception 'Checklist já tem assinaturas: remova-as antes de reabrir.';
  end if;
  return new;
end;
$$;
