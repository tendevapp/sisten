-- Checklist de Expedição: o inspetor preenche e FECHA o checklist
-- (AGUARDANDO_ASSINATURAS) — o conteúdo trava — e depois percorre a fila
-- coletando as 4 assinaturas. Com a 4ª assinatura o registro finaliza sozinho.
-- Coletam assinaturas: quem criou, o setor Qualidade e o admin.

alter table public.qua_checklist_expedicoes
  drop constraint if exists qua_checklist_expedicoes_status_check;
alter table public.qua_checklist_expedicoes
  add constraint qua_checklist_expedicoes_status_check
  check (status in ('RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'FINALIZADO'));

alter table public.qua_checklist_expedicoes
  add column if not exists fechado_por text,
  add column if not exists fechado_por_nome text,
  add column if not exists fechado_em timestamptz,
  add column if not exists finalizado_em timestamptz;

alter table public.qua_checklist_expedicao_assinaturas
  add column if not exists coletado_por_nome text;

create or replace function public.usuario_do_setor(p_setor text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.sectors s on s.id = p.sector_id
    where p.id = (select auth.uid())::text
      and lower(s.name) = lower(p_setor)
  )
$$;
revoke all on function public.usuario_do_setor(text) from public, anon;
grant execute on function public.usuario_do_setor(text) to authenticated, service_role;

-- Conteúdo (itens, observações, fotos): só o autor, enquanto rascunho.
create or replace function public.qua_checklist_exp_pode_editar(p_checklist_id text)
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
      )
  )
$$;
revoke all on function public.qua_checklist_exp_pode_editar(text) from public, anon;
grant execute on function public.qua_checklist_exp_pode_editar(text) to authenticated, service_role;

-- Assinaturas: checklist fechado; autor, setor Qualidade ou admin.
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
        or (
          c.status = 'AGUARDANDO_ASSINATURAS'
          and (c.criado_por = (select auth.uid())::text or public.usuario_do_setor('Qualidade'))
        )
      )
  )
$$;
revoke all on function public.qua_checklist_exp_pode_assinar(text) from public, anon;
grant execute on function public.qua_checklist_exp_pode_assinar(text) to authenticated, service_role;

drop policy if exists qua_checklist_expedicoes_upd on public.qua_checklist_expedicoes;
create policy qua_checklist_expedicoes_upd on public.qua_checklist_expedicoes
  for update to authenticated
  using (
    public.has_role('admin')
    or (status = 'RASCUNHO' and criado_por = (select auth.uid())::text)
    or (status = 'AGUARDANDO_ASSINATURAS' and (criado_por = (select auth.uid())::text or public.usuario_do_setor('Qualidade')))
  )
  with check (
    public.has_role('admin')
    or (status in ('RASCUNHO', 'AGUARDANDO_ASSINATURAS') and criado_por = (select auth.uid())::text)
    or (status = 'AGUARDANDO_ASSINATURAS' and public.usuario_do_setor('Qualidade'))
  );
drop policy if exists qua_checklist_expedicoes_del on public.qua_checklist_expedicoes;
create policy qua_checklist_expedicoes_del on public.qua_checklist_expedicoes
  for delete to authenticated
  using (public.has_role('admin') or (status = 'RASCUNHO' and criado_por = (select auth.uid())::text));

drop policy if exists qua_checklist_expedicao_fotos_ins on public.qua_checklist_expedicao_fotos;
create policy qua_checklist_expedicao_fotos_ins on public.qua_checklist_expedicao_fotos
  for insert to authenticated with check (public.qua_checklist_exp_pode_editar(checklist_id::text));
drop policy if exists qua_checklist_expedicao_fotos_del on public.qua_checklist_expedicao_fotos;
create policy qua_checklist_expedicao_fotos_del on public.qua_checklist_expedicao_fotos
  for delete to authenticated using (public.qua_checklist_exp_pode_editar(checklist_id::text));

drop policy if exists qua_checklist_expedicao_assinaturas_ins on public.qua_checklist_expedicao_assinaturas;
create policy qua_checklist_expedicao_assinaturas_ins on public.qua_checklist_expedicao_assinaturas
  for insert to authenticated with check (public.qua_checklist_exp_pode_assinar(checklist_id::text));
drop policy if exists qua_checklist_expedicao_assinaturas_del on public.qua_checklist_expedicao_assinaturas;
create policy qua_checklist_expedicao_assinaturas_del on public.qua_checklist_expedicao_assinaturas
  for delete to authenticated using (public.qua_checklist_exp_pode_assinar(checklist_id::text));

-- Storage: <checklist_id>/<item>/... (conteúdo) e <checklist_id>/assinaturas/...
drop policy if exists qua_checklist_expedicao_storage_insert on storage.objects;
create policy qua_checklist_expedicao_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'qua-checklist-expedicao'
    and case when (storage.foldername(name))[2] = 'assinaturas'
      then public.qua_checklist_exp_pode_assinar((storage.foldername(name))[1])
      else public.qua_checklist_exp_pode_editar((storage.foldername(name))[1])
    end
  );
drop policy if exists qua_checklist_expedicao_storage_delete on storage.objects;
create policy qua_checklist_expedicao_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'qua-checklist-expedicao'
    and case when (storage.foldername(name))[2] = 'assinaturas'
      then public.qua_checklist_exp_pode_assinar((storage.foldername(name))[1])
      else public.qua_checklist_exp_pode_editar((storage.foldername(name))[1])
    end
  );

-- Depois de fechado, o que foi verificado não muda (as assinaturas valem sobre
-- esse conteúdo). Reabrir para rascunho só enquanto ninguém assinou.
create or replace function public.qua_checklist_exp_proteger_fechado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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

drop trigger if exists trg_qua_checklist_exp_proteger_fechado on public.qua_checklist_expedicoes;
create trigger trg_qua_checklist_exp_proteger_fechado
  before update on public.qua_checklist_expedicoes
  for each row execute function public.qua_checklist_exp_proteger_fechado();

-- A 4ª assinatura finaliza o checklist.
create or replace function public.qua_checklist_exp_finalizar_assinado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.qua_checklist_expedicoes c
     set status = 'FINALIZADO', finalizado_em = now(), updated_at = now()
   where c.id = new.checklist_id
     and c.status = 'AGUARDANDO_ASSINATURAS'
     and (select count(distinct a.papel) from public.qua_checklist_expedicao_assinaturas a where a.checklist_id = c.id) >= 4;
  return new;
end;
$$;

drop trigger if exists trg_qua_checklist_exp_finalizar_assinado on public.qua_checklist_expedicao_assinaturas;
create trigger trg_qua_checklist_exp_finalizar_assinado
  after insert on public.qua_checklist_expedicao_assinaturas
  for each row execute function public.qua_checklist_exp_finalizar_assinado();
