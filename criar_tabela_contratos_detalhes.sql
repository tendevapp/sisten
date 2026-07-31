-- Campos complementares de um contrato (ME3N), preenchidos manualmente pela
-- tela de Contratos — não vêm do SAP e não são tocados pela importação ME3N.
-- Uma linha por documento_compras.

create table if not exists public.contratos_detalhes (
  documento_compras text primary key,
  gestor text,
  escopo_servico text,
  po_pedido_compra text,
  codigo_fornecedor text,
  valor_parcela numeric,
  modalidade text,
  vigencia_label text,
  status text,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.contratos_detalhes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contratos_detalhes' and policyname = 'contratos_detalhes_all'
  ) then
    create policy contratos_detalhes_all on public.contratos_detalhes
      for all to authenticated using (true) with check (true);
  end if;
end $$;
