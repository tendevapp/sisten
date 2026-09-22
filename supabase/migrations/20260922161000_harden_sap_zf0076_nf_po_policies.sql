-- Endurece os grants da tabela financeira ZF0076.

drop policy if exists "zf0076_nf_po_write" on public.sap_zf0076_nf_po;
drop policy if exists "zf0076_nf_po_insert" on public.sap_zf0076_nf_po;
drop policy if exists "zf0076_nf_po_delete" on public.sap_zf0076_nf_po;

create policy "zf0076_nf_po_insert"
  on public.sap_zf0076_nf_po
  for insert to authenticated
  with check (
    public.has_role('admin')
    or exists (
      select 1
      from public.core_perfis p
      where p.id = (select auth.uid())::text
        and p.status = 'ativo'
        and p.sector_id in ('6', '7', '18')
    )
  );

create policy "zf0076_nf_po_delete"
  on public.sap_zf0076_nf_po
  for delete to authenticated
  using (
    public.has_role('admin')
    or exists (
      select 1
      from public.core_perfis p
      where p.id = (select auth.uid())::text
        and p.status = 'ativo'
        and p.sector_id in ('6', '7', '18')
    )
  );

revoke all on table public.sap_zf0076_nf_po from anon;
revoke update, truncate, references, trigger on table public.sap_zf0076_nf_po from authenticated;
grant select, insert, delete on table public.sap_zf0076_nf_po to authenticated;
revoke all on sequence public.sap_zf0076_nf_po_id_seq from anon;
grant usage, select on sequence public.sap_zf0076_nf_po_id_seq to authenticated, service_role;
