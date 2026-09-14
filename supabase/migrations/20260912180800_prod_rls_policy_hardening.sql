-- Evita política permissiva duplicada (SELECT + FOR ALL) nos cadastros de produção.
drop policy if exists prod_tolerancias_admin on public.prod_tolerancias;
create policy prod_tolerancias_ins on public.prod_tolerancias for insert to authenticated
  with check (public.has_role('admin'));
create policy prod_tolerancias_upd on public.prod_tolerancias for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy prod_tolerancias_del on public.prod_tolerancias for delete to authenticated
  using (public.has_role('admin'));

drop policy if exists prod_defeitos_admin on public.prod_defeitos;
create policy prod_defeitos_ins on public.prod_defeitos for insert to authenticated
  with check (public.has_role('admin'));
create policy prod_defeitos_upd on public.prod_defeitos for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy prod_defeitos_del on public.prod_defeitos for delete to authenticated
  using (public.has_role('admin'));
