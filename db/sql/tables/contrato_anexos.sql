-- Documentos anexados a um contrato (ME3N), na tela de Contratos.
--
-- Reaproveita o bucket "request-attachments" já existente (mesmas policies de
-- storage.objects já cobrem qualquer caminho dentro dele — não precisa criar
-- bucket novo). Os arquivos ficam em "contratos/<documento_compras>/<uuid>.<ext>".

create table if not exists public.contrato_anexos (
  id uuid primary key default gen_random_uuid(),
  documento_compras text not null,
  name text not null,
  storage_path text not null,
  mime_type text,
  size bigint,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contrato_anexos_documento on public.contrato_anexos(documento_compras);

alter table public.contrato_anexos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contrato_anexos' and policyname = 'contrato_anexos_all'
  ) then
    create policy contrato_anexos_all on public.contrato_anexos
      for all to authenticated using (true) with check (true);
  end if;
end $$;
