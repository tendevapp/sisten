-- =====================================================================
-- Escopo do processo de cotação: um SNAPSHOT da RM no momento da
-- criação. Sem FK para public.sap_me5a_rc de propósito — reimportar o
-- ME5A pode remover uma linha, e isso não pode apagar um histórico de
-- preço já recebido.
-- =====================================================================

create table if not exists public.cotacao_processo_itens (
  id              uuid primary key default gen_random_uuid(),
  processo_id     uuid not null references public.cotacao_processos(id) on delete cascade,

  ri              text not null,
  rm              text,
  item_reqc       text,

  material_code   text,
  texto_breve     text,
  qtd_solicitada  numeric(18,4),
  unidade_medida  text,
  centro          text,
  deposito        text,

  created_at      timestamptz not null default now()
);

create unique index if not exists cotacao_processo_itens_proc_ri_key
  on public.cotacao_processo_itens (processo_id, ri);
create index if not exists cotacao_processo_itens_ri_idx
  on public.cotacao_processo_itens (ri);
create index if not exists cotacao_processo_itens_material_idx
  on public.cotacao_processo_itens (material_code);

-- Sugestão de vínculo por similaridade contra o texto breve da RM.
create index if not exists cotacao_processo_itens_texto_trgm
  on public.cotacao_processo_itens
  using gin (public.f_unaccent(upper(texto_breve)) gin_trgm_ops);

alter table public.cotacao_processo_itens enable row level security;
revoke all on public.cotacao_processo_itens from anon;

drop policy if exists cotacao_processo_itens_rw on public.cotacao_processo_itens;
create policy cotacao_processo_itens_rw on public.cotacao_processo_itens
  for all to authenticated
  using (public.pode_gerir_cotacoes())
  with check (public.pode_gerir_cotacoes());

grant select, insert, update, delete on public.cotacao_processo_itens to authenticated;
