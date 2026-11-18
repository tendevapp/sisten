-- Pendências › Processamento de NF: status do comprador por nota + evidências.
--
-- O status do comprador é independente da baixa (status pendente/concluido):
-- diz onde a nota está enquanto não é baixada — Em andamento, Com Central
-- Fiscal, Com AG, Devolvido Contab ou Outro (com descrição).
--
-- Evidências (e-mail colado, texto, print, PDF, arquivo .eml/.msg) ficam numa
-- tabela própria, uma linha por evidência, para que dois compradores anexando
-- ao mesmo tempo não se sobrescrevam. Arquivos vão para o bucket privado
-- request-attachments em <request_id>/pendencia-evidencias/<pendencia_id>/...

alter table public.sup_pend_processamento_nf
  add column if not exists status_comprador text,
  add column if not exists status_comprador_obs text,
  add column if not exists status_comprador_por text,
  add column if not exists status_comprador_em timestamptz;

alter table public.sup_pend_processamento_nf
  drop constraint if exists sup_pend_proc_nf_status_comprador_chk;
alter table public.sup_pend_processamento_nf
  add constraint sup_pend_proc_nf_status_comprador_chk
  check (status_comprador is null or status_comprador in
    ('em_andamento', 'central_fiscal', 'com_ag', 'devolvido_contab', 'outro'));

create table if not exists public.sup_pend_evidencias (
  id uuid primary key default gen_random_uuid(),
  pendencia_id uuid not null references public.sup_pend_processamento_nf(id) on delete cascade,
  request_id text not null,
  tipo text not null check (tipo in ('texto', 'arquivo')),
  texto text,
  path text,
  nome_arquivo text,
  mime_type text,
  tamanho integer,
  autor_id text not null default (auth.uid()::text),
  autor_nome text,
  created_at timestamptz not null default now(),
  constraint sup_pend_evidencias_conteudo_chk check (
    (tipo = 'texto' and coalesce(btrim(texto), '') <> '')
    or (tipo = 'arquivo' and path is not null)
  )
);

create index if not exists sup_pend_evidencias_pendencia_idx
  on public.sup_pend_evidencias (pendencia_id, created_at);

alter table public.sup_pend_evidencias enable row level security;

drop policy if exists sup_pend_evidencias_select on public.sup_pend_evidencias;
create policy sup_pend_evidencias_select on public.sup_pend_evidencias
  for select to authenticated using (true);

drop policy if exists sup_pend_evidencias_insert on public.sup_pend_evidencias;
create policy sup_pend_evidencias_insert on public.sup_pend_evidencias
  for insert to authenticated
  with check (autor_id = (select auth.uid())::text);

-- Só quem anexou (ou o admin) remove a evidência.
drop policy if exists sup_pend_evidencias_delete on public.sup_pend_evidencias;
create policy sup_pend_evidencias_delete on public.sup_pend_evidencias
  for delete to authenticated
  using (autor_id = (select auth.uid())::text or public.has_role('admin'));

grant select, insert, delete on public.sup_pend_evidencias to authenticated;

-- E-mail salvo do Outlook (.msg) ou exportado (.eml) e texto puro também são
-- evidência válida — o bucket só aceitava imagem e PDF.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct t) from unnest(
    coalesce(allowed_mime_types, '{}'::text[])
    || array['message/rfc822', 'application/vnd.ms-outlook', 'text/plain']
  ) as t
)
where id = 'request-attachments';
