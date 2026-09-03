-- Habilita RLS nas tabelas publicas que estavam sem protecao
-- Politicas seguem o padrao ja usado em sup_bahiasul_entregas / sup_fretes

alter table public.sup_transportadoras enable row level security;
alter table public.sup_prazos_transporte enable row level security;
alter table public.sup_diligenciamento_itens enable row level security;

-- sup_transportadoras
drop policy if exists sup_transportadoras_read on public.sup_transportadoras;
drop policy if exists sup_transportadoras_insert on public.sup_transportadoras;
drop policy if exists sup_transportadoras_update on public.sup_transportadoras;
drop policy if exists sup_transportadoras_delete on public.sup_transportadoras;

create policy sup_transportadoras_read on public.sup_transportadoras
  for select to anon, authenticated using (true);
create policy sup_transportadoras_insert on public.sup_transportadoras
  for insert to anon, authenticated with check (true);
create policy sup_transportadoras_update on public.sup_transportadoras
  for update to anon, authenticated using (true) with check (true);
create policy sup_transportadoras_delete on public.sup_transportadoras
  for delete to anon, authenticated using (true);

-- sup_prazos_transporte
drop policy if exists sup_prazos_transporte_read on public.sup_prazos_transporte;
drop policy if exists sup_prazos_transporte_insert on public.sup_prazos_transporte;
drop policy if exists sup_prazos_transporte_update on public.sup_prazos_transporte;
drop policy if exists sup_prazos_transporte_delete on public.sup_prazos_transporte;

create policy sup_prazos_transporte_read on public.sup_prazos_transporte
  for select to anon, authenticated using (true);
create policy sup_prazos_transporte_insert on public.sup_prazos_transporte
  for insert to anon, authenticated with check (true);
create policy sup_prazos_transporte_update on public.sup_prazos_transporte
  for update to anon, authenticated using (true) with check (true);
create policy sup_prazos_transporte_delete on public.sup_prazos_transporte
  for delete to anon, authenticated using (true);

-- sup_diligenciamento_itens
drop policy if exists sup_diligenciamento_itens_read on public.sup_diligenciamento_itens;
drop policy if exists sup_diligenciamento_itens_insert on public.sup_diligenciamento_itens;
drop policy if exists sup_diligenciamento_itens_update on public.sup_diligenciamento_itens;
drop policy if exists sup_diligenciamento_itens_delete on public.sup_diligenciamento_itens;

create policy sup_diligenciamento_itens_read on public.sup_diligenciamento_itens
  for select to anon, authenticated using (true);
create policy sup_diligenciamento_itens_insert on public.sup_diligenciamento_itens
  for insert to anon, authenticated with check (true);
create policy sup_diligenciamento_itens_update on public.sup_diligenciamento_itens
  for update to anon, authenticated using (true) with check (true);
create policy sup_diligenciamento_itens_delete on public.sup_diligenciamento_itens
  for delete to anon, authenticated using (true);
