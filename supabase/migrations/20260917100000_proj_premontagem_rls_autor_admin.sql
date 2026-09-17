-- Almoxarifado > Projetos > Pré-montagem — RLS autor-ou-admin.
--
-- As 3 tabelas nasceram com "for all using (true)" (create_proj_formularios).
-- Isso permitia UPDATE/DELETE de qualquer ordem por qualquer usuário
-- autenticado direto do navegador, sem passar pelas RPCs. Alinha com o
-- padrão já usado em 13 formulários e em Recebimento de Material
-- (`public.form_pode_editar`, de `20260902160000_formularios_rls_autor_ou_admin.sql`):
-- SELECT livre, INSERT livre (as gravações reais são todas por RPC
-- `security definer`, que já não passa pela RLS do chamador), UPDATE/DELETE
-- só autor ou admin. Tabelas-filhas herdam o dono pela ordem-pai.

drop policy if exists "proj_ordens_premontagem_all" on public.proj_ordens_premontagem;
create policy "proj_ordens_premontagem_sel" on public.proj_ordens_premontagem
  for select using (true);
create policy "proj_ordens_premontagem_ins" on public.proj_ordens_premontagem
  for insert with check (true);
create policy "proj_ordens_premontagem_upd" on public.proj_ordens_premontagem
  for update using (public.form_pode_editar(criado_por_id::text));
create policy "proj_ordens_premontagem_del" on public.proj_ordens_premontagem
  for delete using (public.form_pode_editar(criado_por_id::text));

drop policy if exists "proj_ordens_premontagem_itens_all" on public.proj_ordens_premontagem_itens;
create policy "proj_ordens_premontagem_itens_sel" on public.proj_ordens_premontagem_itens
  for select using (true);
create policy "proj_ordens_premontagem_itens_ins" on public.proj_ordens_premontagem_itens
  for insert with check (true);
create policy "proj_ordens_premontagem_itens_upd" on public.proj_ordens_premontagem_itens
  for update using (
    exists (
      select 1 from public.proj_ordens_premontagem o
      where o.id = ordem_id and public.form_pode_editar(o.criado_por_id::text)
    )
  );
create policy "proj_ordens_premontagem_itens_del" on public.proj_ordens_premontagem_itens
  for delete using (
    exists (
      select 1 from public.proj_ordens_premontagem o
      where o.id = ordem_id and public.form_pode_editar(o.criado_por_id::text)
    )
  );

drop policy if exists "proj_ordens_premontagem_alvos_all" on public.proj_ordens_premontagem_alvos;
create policy "proj_ordens_premontagem_alvos_sel" on public.proj_ordens_premontagem_alvos
  for select using (true);
create policy "proj_ordens_premontagem_alvos_ins" on public.proj_ordens_premontagem_alvos
  for insert with check (true);
create policy "proj_ordens_premontagem_alvos_upd" on public.proj_ordens_premontagem_alvos
  for update using (
    exists (
      select 1 from public.proj_ordens_premontagem o
      where o.id = ordem_id and public.form_pode_editar(o.criado_por_id::text)
    )
  );
create policy "proj_ordens_premontagem_alvos_del" on public.proj_ordens_premontagem_alvos
  for delete using (
    exists (
      select 1 from public.proj_ordens_premontagem o
      where o.id = ordem_id and public.form_pode_editar(o.criado_por_id::text)
    )
  );

-- Log de alterações — mesmo formato de alm_receb_alteracoes.
create table if not exists public.proj_ordens_premontagem_alteracoes (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.proj_ordens_premontagem (id) on delete cascade,
  tipo text not null check (tipo in ('cabecalho', 'item', 'zona', 'cancelamento')),
  alteracoes jsonb not null,
  criado_por_id uuid,
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_proj_ordens_premontagem_alteracoes_ordem
  on public.proj_ordens_premontagem_alteracoes (ordem_id, created_at desc);

grant select, insert on public.proj_ordens_premontagem_alteracoes to anon, authenticated, service_role;
alter table public.proj_ordens_premontagem_alteracoes enable row level security;
drop policy if exists "proj_ordens_premontagem_alteracoes_sel" on public.proj_ordens_premontagem_alteracoes;
create policy "proj_ordens_premontagem_alteracoes_sel" on public.proj_ordens_premontagem_alteracoes
  for select using (true);
-- Sem policy de insert para authenticated: só as RPCs security definer gravam.
