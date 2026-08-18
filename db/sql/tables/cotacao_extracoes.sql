-- =====================================================================
-- Log de cada chamada ao LLM feita pela Edge Function extrair-cotacao.
-- Gravado com service_role a partir da Edge Function — o usuário não
-- pode forjar contagem de token nem custo. Select-only para
-- authenticated: é um livro-caixa, não um dado operacional.
-- =====================================================================

create table if not exists public.cotacao_extracoes (
  id                  uuid primary key default gen_random_uuid(),
  processo_id         uuid,
  user_id             text,
  user_name           text,
  modelo              text not null,
  chars_entrada       int not null,
  prompt_tokens       int,
  completion_tokens   int,
  total_tokens        int,
  custo_usd           numeric(12,6),
  duracao_ms          int,
  truncado            boolean not null default false,
  sucesso             boolean not null default true,
  erro_codigo         text,
  erro_mensagem       text,
  propostas_extraidas int,
  itens_extraidos     int,
  created_at          timestamptz not null default now()
);

create index if not exists cotacao_extracoes_created_idx
  on public.cotacao_extracoes (created_at desc);
create index if not exists cotacao_extracoes_processo_idx
  on public.cotacao_extracoes (processo_id);

alter table public.cotacao_extracoes enable row level security;
revoke all on public.cotacao_extracoes from anon;

drop policy if exists cotacao_extracoes_select on public.cotacao_extracoes;
create policy cotacao_extracoes_select on public.cotacao_extracoes
  for select to authenticated
  using (public.pode_gerir_cotacoes());

grant select on public.cotacao_extracoes to authenticated;
