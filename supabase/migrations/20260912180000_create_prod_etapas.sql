-- =====================================================================
-- Produção > Etapas — cadastro-espinha do módulo de liberação de qualidade
-- da fabricação de torres, migrado do sistema NAV1 (TEN Nordeste, PRD v36.6).
--
-- Corte a Plasma -> Chanfro -> Calandra -> Solda SAW -> EVS -> UT, com Flange
-- em paralelo (não depende de etapa anterior) e as etapas pós-UT (montagem,
-- jato, pintura...) já semeadas INATIVAS — acrescentar uma etapa nova no
-- chão de fábrica vira um INSERT nesta tabela, não um módulo novo.
--
-- `etapa_anterior_id` é o encadeamento: `prod_fila_etapa` só mostra uma peça
-- na fila de uma etapa quando a etapa anterior está aprovada (RN-02 do PRD
-- NAV1) — a regra mora no dado, não espalhada em seis motores de fila iguais
-- como no sistema original.
--
-- Blocos 1-2 (corte/chanfro/calandra/solda) ativam as quatro primeiras
-- etapas; EVS/UT/Flange e as pós-UT chegam nos blocos seguintes.
-- =====================================================================

create table if not exists public.prod_etapas (
  id text primary key,
  nome text not null,
  -- Prefixo do código do lançamento (regra 2 do CLAUDE.md): COR-DDMMYY-NN.
  prefixo_codigo text not null unique,
  ordem integer not null,
  etapa_anterior_id text references public.prod_etapas (id),
  exige_medicao boolean not null default false,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.prod_etapas (id, nome, prefixo_codigo, ordem, etapa_anterior_id, exige_medicao, ativa) values
  ('corte',               'Corte a Plasma',        'COR', 10,  null,                  false, true),
  ('chanfro',             'Chanfro',               'CHF', 20,  'corte',               false, true),
  ('calandra',            'Calandra',              'CAL', 30,  'chanfro',             false, true),
  ('solda',               'Solda SAW',             'SLD', 40,  'calandra',            false, true),
  ('flange',              'Flange',                'FLG', 45,  null,                  true,  false),
  ('evs',                 'EVS (Ensaio Visual)',   'EVS', 50,  'solda',               true,  false),
  ('ut',                  'UT (Ultrassom)',        'UT',  60,  'evs',                 false, false),
  ('montagem_tramo',      'Montagem do Tramo',     'MTR', 70,  'ut',                  false, false),
  ('internos_soldaveis',  'Internos Soldáveis',    'ISO', 80,  'montagem_tramo',      false, false),
  ('jato',                'Jateamento',            'JAT', 90,  'internos_soldaveis',  false, false),
  ('metalizacao',         'Metalização',           'MET', 100, 'jato',                false, false),
  ('pintura',             'Pintura',               'PIN', 110, 'metalizacao',         false, false),
  ('montagem_final',      'Montagem Final',        'MFN', 120, 'pintura',             false, false)
on conflict (id) do nothing;

grant select on public.prod_etapas to anon, authenticated, service_role;
alter table public.prod_etapas enable row level security;
drop policy if exists prod_etapas_sel on public.prod_etapas;
create policy prod_etapas_sel on public.prod_etapas for select using (true);
-- Sem policy de escrita: cadastro evolui por migration (Bloco 1-2) e depois
-- por tela de admin (Bloco 6). anon/authenticated só leem.
