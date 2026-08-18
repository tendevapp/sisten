-- =====================================================================
-- Processo de cotação: a "rodada". Nasce da seleção múltipla de itens
-- (ri) na Central de Compras e agrupa as propostas de vários
-- fornecedores para o mesmo conjunto de itens.
-- =====================================================================

create table if not exists public.cotacao_processos (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null,
  titulo          text,
  status          text not null default 'aberto'
                    check (status in ('aberto', 'em_analise', 'concluido', 'cancelado')),
  observacoes     text,
  criado_por      text references public.profiles(id),
  criado_por_nome text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists cotacao_processos_numero_key
  on public.cotacao_processos (numero);
create index if not exists cotacao_processos_status_idx
  on public.cotacao_processos (status, created_at desc);

alter table public.cotacao_processos enable row level security;
revoke all on public.cotacao_processos from anon;

drop policy if exists cotacao_processos_rw on public.cotacao_processos;
create policy cotacao_processos_rw on public.cotacao_processos
  for all to authenticated
  using (public.pode_gerir_cotacoes())
  with check (public.pode_gerir_cotacoes());

grant select, insert, update, delete on public.cotacao_processos to authenticated;
