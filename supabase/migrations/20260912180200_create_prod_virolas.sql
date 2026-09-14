-- =====================================================================
-- Produção > Virolas — a peça física que atravessa todas as etapas.
--
-- Achado que muda o desenho do módulo: o SISTEN já tem a numeração do NAV1.
-- `proj_tramos_gwjaco` (20260909003615_create_proj_subprojetos_tramos.sql)
-- já semeou as 345 unidades de tramo do projeto inteiro (69 torres × 5
-- tramos) com a MESMA fórmula do PRD NAV1 (torre = (série-3143)/5 + 1). O
-- "sequencial" do NAV1 é a "série" do SISTEN — não se reescreve a fórmula,
-- só se semeia a virola como o nível abaixo do tramo.
--
-- Semeia-se o PROJETO INTEIRO (3.243 = 69 torres × 47 virolas/torre), não só
-- o subprojeto em fabricação — custa o mesmo que semear 1/3 e evita uma
-- migration nova quando SP02/SP03 começarem. As telas filtram por
-- `subprojeto_id` para a visão do dia a dia continuar restrita ao que está
-- em produção agora.
-- =====================================================================

create table if not exists public.prod_virolas (
  -- `${tramo_unidade_id}-${virola}`, ex.: `T1-3143-V1A` — espelha
  -- `idVirola()` em src/lib/producao.ts.
  id text primary key,
  projeto text not null default 'GW_JACOBINA',
  tramo_unidade_id text not null references public.proj_tramos_gwjaco (id),
  subprojeto_id text references public.proj_subprojetos (id),
  torre_numero integer not null,
  tramo text not null,
  virola text not null,
  -- Posição física da virola dentro do tramo (V1A=1, V1B=2, ...) — ordena a
  -- tela sem depender do nome (V10 não vem antes de V2 em ordenação de texto).
  ordem integer not null,
  etapa_atual_id text references public.prod_etapas (id),
  status_atual text not null default 'pendente'
    check (status_atual in ('pendente','em_andamento','aprovado','reprovado','refugado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tramo_unidade_id, virola)
);

create index if not exists idx_prod_virolas_tramo_unidade on public.prod_virolas (tramo_unidade_id);
create index if not exists idx_prod_virolas_torre on public.prod_virolas (projeto, torre_numero, tramo);
create index if not exists idx_prod_virolas_subprojeto on public.prod_virolas (subprojeto_id, status_atual);
create index if not exists idx_prod_virolas_status on public.prod_virolas (status_atual);

-- Seed: 1 linha por virola física de cada uma das 345 unidades de tramo já
-- semeadas em `proj_tramos_gwjaco`. As listas de virola por tramo espelham
-- `VIROLAS_POR_TRAMO` em src/lib/producao.ts (PRD NAV1 §5.2) — as duas
-- precisam concordar.
insert into public.prod_virolas (id, tramo_unidade_id, subprojeto_id, torre_numero, tramo, virola, ordem)
select
  t.id || '-' || v.virola,
  t.id,
  t.subprojeto_id,
  t.torre_numero,
  t.tramo,
  v.virola,
  v.ordem::integer
from public.proj_tramos_gwjaco t
cross join lateral (
  select virola, ordem
  from unnest(
    case t.tramo
      when 'T1' then array['V1A','V1B','V2A','V2B','V3A','V3B','V4','V5']
      when 'T2' then array['V1','V2','V3','V4','V5','V6','V7']
      when 'T3' then array['V1','V2','V3','V4','V5','V6','V7','V8','V9']
      when 'T4' then array['V1','V2','V3','V4','V5','V6','V7','V8','V9','V10','V11']
      when 'T5' then array['V1','V2','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12']
    end
  ) with ordinality as u(virola, ordem)
) v
on conflict (tramo_unidade_id, virola) do nothing;

grant select on public.prod_virolas to anon, authenticated, service_role;
alter table public.prod_virolas enable row level security;
drop policy if exists prod_virolas_sel on public.prod_virolas;
create policy prod_virolas_sel on public.prod_virolas for select using (true);
-- Sem policy de escrita: só `prod_registrar_lancamento`/`prod_editar_lancamento`
-- (security definer, dono postgres — BYPASSRLS) atualizam status_atual/etapa_atual_id.
