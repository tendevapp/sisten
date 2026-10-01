-- =====================================================================
-- Recebimento (ficha cega RCV + conferência RCM): edição liberada a qualquer
-- usuário logado com acesso ao módulo. O log campo a campo em
-- `alm_receb_alteracoes` (quem, quando, de/para) continua sendo gravado
-- pelas RPCs `alm_receb_editar_*`.
--
-- Exclusão lógica (`excluido`) continua só autor/admin — não foi liberada.
-- =====================================================================

-- 1) RPCs de edição: tira a trava de autor (continua exigindo sessão).
do $$
declare
  v_def text;
  v_fn text;
begin
  foreach v_fn in array array[
    'public.alm_receb_editar_carga(uuid,jsonb,jsonb)',
    'public.alm_receb_editar_conferencia(uuid,jsonb,jsonb,jsonb)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position('public.form_pode_editar(v_old.criado_por_id::text)' in v_def) = 0 then
      raise exception 'Trava de autor nao encontrada em %', v_fn;
    end if;
    v_def := replace(v_def,
      'not public.form_pode_editar(v_old.criado_por_id::text)',
      'auth.uid() is null');
    v_def := replace(v_def,
      'So o autor do registro ou um admin pode editar.',
      'Sessao invalida.');
    execute v_def;
  end loop;
end $$;

-- 2) RLS: UPDATE e itens abertos a autenticados.
drop policy if exists alm_receb_cargas_upd on public.alm_receb_cargas;
create policy alm_receb_cargas_upd on public.alm_receb_cargas
  for update to authenticated using (true) with check (true);

drop policy if exists alm_receb_conferencias_upd on public.alm_receb_conferencias;
create policy alm_receb_conferencias_upd on public.alm_receb_conferencias
  for update to authenticated using (true) with check (true);

-- Itens: só UPDATE é aberto; inserir/apagar item continua só autor/admin da
-- conferência (sem log nem trigger, não vale abrir).
drop policy if exists alm_receb_conf_itens_wr on public.alm_receb_conferencia_itens;
create policy alm_receb_conf_itens_upd on public.alm_receb_conferencia_itens
  for update to authenticated using (true) with check (true);
create policy alm_receb_conf_itens_ins on public.alm_receb_conferencia_itens
  for insert to authenticated
  with check (exists (
    select 1 from public.alm_receb_conferencias c
    where c.id = conferencia_id and public.form_pode_editar(c.criado_por_id::text)));
create policy alm_receb_conf_itens_del on public.alm_receb_conferencia_itens
  for delete to authenticated
  using (exists (
    select 1 from public.alm_receb_conferencias c
    where c.id = conferencia_id and public.form_pode_editar(c.criado_por_id::text)));

-- 3) Como o UPDATE ficou aberto, a exclusão lógica (e a troca de autor) segue
--    restrita a autor/admin por trigger.
create or replace function public.alm_receb_guarda_exclusao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.excluido is distinct from old.excluido
     and not public.form_pode_editar(old.criado_por_id::text) then
    raise exception 'So o autor do registro ou um admin pode excluir.';
  end if;
  if new.criado_por_id is distinct from old.criado_por_id
     and not public.has_role('admin') then
    raise exception 'O autor do registro nao pode ser alterado.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_alm_receb_cargas_guarda on public.alm_receb_cargas;
create trigger trg_alm_receb_cargas_guarda
  before update on public.alm_receb_cargas
  for each row execute function public.alm_receb_guarda_exclusao();

drop trigger if exists trg_alm_receb_conferencias_guarda on public.alm_receb_conferencias;
create trigger trg_alm_receb_conferencias_guarda
  before update on public.alm_receb_conferencias
  for each row execute function public.alm_receb_guarda_exclusao();
