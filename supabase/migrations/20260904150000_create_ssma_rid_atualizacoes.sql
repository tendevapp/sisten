-- =====================================================================
-- Módulo SSMA — Atualizações de tratamento de um RID
--
-- Contexto: quando o desvio é registrado como NÃO sanado de imediato, o RID
-- nasce com uma "ação proposta" e nada mais. O que aconteceu depois — a
-- correção feita, a evidência do "depois" — não tinha onde ser lançado: o
-- formulário só existe na abertura, e o campo de parecer é uma linha só,
-- sobrescrita a cada edição.
--
-- Cada linha aqui é um lançamento de acompanhamento, imutável, na ordem em
-- que aconteceu. As fotos continuam morando em `ssma_rid_desvios.fotos`
-- (fonte única, já com URL assinada na leitura); aqui guardamos só os ids
-- das fotos que entraram naquele lançamento, para a linha do tempo mostrar
-- o texto e as evidências juntos.
-- =====================================================================

create table if not exists public.ssma_rid_atualizacoes (
  id uuid primary key default gen_random_uuid(),
  desvio_id uuid not null references public.ssma_rid_desvios(id) on delete cascade,
  texto text not null,
  foto_ids text[] not null default '{}'::text[],
  criado_por text default (auth.uid())::text references public.core_perfis(id),
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ssma_rid_atualizacoes_desvio
  on public.ssma_rid_atualizacoes (desvio_id, created_at desc);

alter table public.ssma_rid_atualizacoes enable row level security;

-- Mesmo alcance de `ssma_rid_desvios`: quem enxerga o RID enxerga o
-- acompanhamento dele. A restrição de quem pode lançar é de tela
-- (canEditDesvioRid), como no resto do módulo.
drop policy if exists ssma_rid_atualizacoes_rw on public.ssma_rid_atualizacoes;
create policy ssma_rid_atualizacoes_rw on public.ssma_rid_atualizacoes
  for all to authenticated
  using (true)
  with check (true);
