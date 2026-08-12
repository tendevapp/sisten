-- Tabela de reportes (bug/sugestão) enviados pelo botão flutuante "Reportar".
-- Bucket "feedback-screenshots" criado junto (ver docs/superpowers/specs/2026-08-12-reportar-erro-sugestao-design.md).
-- Aplicado via Supabase MCP em 2026-08-12 (migrations create_feedback_reports, create_feedback_screenshots_bucket).

create table public.feedback_reports (
  id text primary key,
  type text not null check (type in ('bug', 'sugestao')),
  status text not null default 'novo' check (status in ('novo', 'em_analise', 'resolvido', 'arquivado')),
  description text not null,
  page_path text not null,
  user_id text references public.profiles(id),
  user_name text not null,
  user_email text,
  screenshot_path text,
  console_logs jsonb,
  error_stack text,
  user_agent text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_reports_status_idx on public.feedback_reports (status);
create index feedback_reports_created_at_idx on public.feedback_reports (created_at desc);

alter table public.feedback_reports enable row level security;

create policy feedback_reports_all on public.feedback_reports
  for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-screenshots', 'feedback-screenshots', false, 5242880, array['image/webp', 'image/jpeg', 'image/png']);

create policy feedback_screenshots_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback-screenshots');

create policy feedback_screenshots_select on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback-screenshots');
