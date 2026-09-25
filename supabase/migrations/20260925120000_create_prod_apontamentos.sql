-- =====================================================================
-- Produção › Apontamentos — acompanhamento diário por nave (Nave 1, Nave 2,
-- White), substituindo os três relatórios de WhatsApp.
--
-- Cada etapa tem Início → Pausa (motivo) → Retomada → Finalizado; finalizar
-- libera a peça para a próxima etapa. A cadeia física é chapa → virola →
-- tramo, com um Green Tag em cada passagem de nave (N1→N2 e N2→White).
--
-- Separado de `prod_etapas`/`prod_lancamentos` de propósito: aqueles são o
-- fluxo de INSPEÇÃO de qualidade (aprovado/reprovado, medições). As etapas
-- operacionais (Pré-Jato, LW, Marco Porta, SAW 03 com posições, cabines,
-- MF) são outras — misturar quebraria a qualidade.
--
-- Identidade do tramo: `proj_tramos_gwjaco.id` ('T3-3205') = tipo + SÉRIE
-- FÍSICA. A série define o tipo em 100% dos casos; a torre é só alocação e
-- diverge entre fontes (prod_tramos_entrega × plano de expedição), por isso
-- nada aqui é chaveado por torre.
--
-- Escrita:
--   * execuções, eventos, checklist e green tags → só por RPC (migration
--     seguinte), porque validam cadeia, posição e checklist;
--   * cadastros, programação e diário → RLS com flag de acesso
--     (`private.prod_apt_pode`), são tabelas simples de manutenção.
-- =====================================================================

create schema if not exists private;

-- Admin ou flag ligada em core_perfis.page_access — mesmo critério de
-- `canAccessPage` no cliente para FEATURE_FLAGS sem defaultRoles.
create or replace function private.prod_apt_pode(p_flag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.core_perfis perfil
     where perfil.id = (select auth.uid())::text
       and perfil.status = 'ativo'
       and (
         'admin' = any(perfil.roles)
         or coalesce((perfil.page_access ->> p_flag)::boolean, false)
       )
  );
$$;

revoke all on function private.prod_apt_pode(text) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.prod_apt_pode(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------

create table if not exists public.prod_apt_etapas (
  id text primary key,
  nave text not null check (nave in ('nave1','nave2','white')),
  nome text not null,
  ordem integer not null,
  -- chapa: apontada por quantidade, sem fila; virola/tramo: por peça.
  nivel text not null check (nivel in ('chapa','virola','tramo')),
  -- Etapa anterior (mesma nave). Se a anterior é por virola e esta é por
  -- tramo, o tramo só entra quando TODAS as suas virolas finalizaram a
  -- anterior — é assim que o tramo "se forma". Sem anterior na Nave 2 ou
  -- White, a entrada exige o Green Tag da nave anterior.
  etapa_anterior_id text references public.prod_apt_etapas(id),
  -- Tipos de tramo a que a etapa se aplica (null = todos). Ex.: Marco Porta só T1.
  tramos text[],
  exige_posicao boolean not null default false,
  permite_retrabalho boolean not null default false,
  rotulo_retrabalho text,
  -- Precisa estar finalizada para emitir o Green Tag de saída da nave.
  requisito_green_tag boolean not null default false,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prod_apt_posicoes (
  id uuid primary key default gen_random_uuid(),
  etapa_id text not null references public.prod_apt_etapas(id),
  nome text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (etapa_id, nome)
);

create table if not exists public.prod_apt_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  etapa_id text not null references public.prod_apt_etapas(id),
  codigo text not null,
  nome text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (etapa_id, codigo)
);

create table if not exists public.prod_apt_motivos_pausa (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  categoria text not null check (categoria in (
    'manutencao','material','movimentacao','qualidade','engenharia',
    'utilidades','efetivo','turno','ti','clima','outro'
  )),
  exige_observacao boolean not null default false,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Apontamento
-- ---------------------------------------------------------------------

create table if not exists public.prod_apt_execucoes (
  -- Gerado no aparelho: os eventos de pausa/fim feitos offline referenciam
  -- a execução antes de o início chegar ao servidor.
  id uuid primary key,
  -- APT-DDMMYY-NN, índice reinicia por dia (ver prod_apt_proximo_codigo).
  codigo text not null unique,
  etapa_id text not null references public.prod_apt_etapas(id),
  nave text not null check (nave in ('nave1','nave2','white')),
  virola_id text references public.prod_virolas(id),
  -- Preenchido também nas etapas por virola (tramo da virola), para agregar.
  tramo_id text references public.proj_tramos_gwjaco(id),
  -- Só etapas por chapa: quantidade informada ao finalizar.
  quantidade numeric check (quantidade is null or quantidade > 0),
  posicao_id uuid references public.prod_apt_posicoes(id),
  retrabalho boolean not null default false,
  status text not null default 'em_andamento'
    check (status in ('em_andamento','pausada','finalizada','cancelada')),
  -- Andamento livre mostrado no relatório: "CW10", "Em selagem".
  situacao text,
  observacao text,
  iniciada_em timestamptz not null,
  finalizada_em timestamptz,
  criado_por text references public.core_perfis(id) default (auth.uid())::text,
  criado_por_nome text,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma execução aberta por peça e etapa; uma peça por posição.
create unique index if not exists prod_apt_execucoes_aberta_peca_uk
  on public.prod_apt_execucoes (etapa_id, coalesce(virola_id, tramo_id))
  where status in ('em_andamento','pausada') and excluido_em is null
    and coalesce(virola_id, tramo_id) is not null;
create unique index if not exists prod_apt_execucoes_aberta_posicao_uk
  on public.prod_apt_execucoes (posicao_id)
  where status in ('em_andamento','pausada') and excluido_em is null and posicao_id is not null;
create index if not exists prod_apt_execucoes_nave_status_idx on public.prod_apt_execucoes (nave, status);
create index if not exists prod_apt_execucoes_finalizada_idx on public.prod_apt_execucoes (finalizada_em);
create index if not exists prod_apt_execucoes_virola_idx on public.prod_apt_execucoes (virola_id, etapa_id);
create index if not exists prod_apt_execucoes_tramo_idx on public.prod_apt_execucoes (tramo_id, etapa_id);

create table if not exists public.prod_apt_eventos (
  id uuid primary key default gen_random_uuid(),
  -- Idempotência do outbox: o reenvio do mesmo toque não duplica.
  client_id uuid not null unique,
  execucao_id uuid not null references public.prod_apt_execucoes(id) on delete cascade,
  tipo text not null check (tipo in ('inicio','pausa','retomada','fim','situacao','cancelamento')),
  -- Hora do toque no aparelho (vale mesmo se o envio foi atrasado pelo offline).
  ocorrido_em timestamptz not null,
  recebido_em timestamptz not null default now(),
  motivo_pausa_id uuid references public.prod_apt_motivos_pausa(id),
  quantidade numeric,
  observacao text,
  usuario text default (auth.uid())::text,
  usuario_nome text
);
create index if not exists prod_apt_eventos_execucao_idx on public.prod_apt_eventos (execucao_id, ocorrido_em);

create table if not exists public.prod_apt_checklist_marcas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.prod_apt_execucoes(id) on delete cascade,
  item_id uuid not null references public.prod_apt_checklist_itens(id),
  status text not null check (status in ('concluido','andamento','nao_iniciado')),
  marcado_em timestamptz not null default now(),
  por text default (auth.uid())::text,
  por_nome text,
  unique (execucao_id, item_id)
);

create table if not exists public.prod_apt_green_tags (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  -- GT-DDMMYY-NN, índice reinicia por dia.
  codigo text not null unique,
  tramo_id text not null references public.proj_tramos_gwjaco(id),
  passagem text not null check (passagem in ('n1_n2','n2_white')),
  liberado_em timestamptz not null default now(),
  liberado_por text default (auth.uid())::text,
  liberado_por_nome text,
  observacao text,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now()
);
create unique index if not exists prod_apt_green_tags_ativo_uk
  on public.prod_apt_green_tags (tramo_id, passagem) where excluido_em is null;

-- Plano semanal do PCP: quantidade programada por dia e etapa.
create table if not exists public.prod_apt_programacao (
  data date not null,
  etapa_id text not null references public.prod_apt_etapas(id),
  quantidade integer not null check (quantidade >= 0),
  atualizado_por text default (auth.uid())::text,
  updated_at timestamptz not null default now(),
  primary key (data, etapa_id)
);

-- Cabeçalho do relatório do dia, preenchido pelo líder da nave.
create table if not exists public.prod_apt_diario (
  data date not null,
  nave text not null check (nave in ('nave1','nave2','white')),
  efetivo_real integer check (efetivo_real is null or efetivo_real >= 0),
  faltas integer check (faltas is null or faltas >= 0),
  observacoes text,
  pendencias text,
  atualizado_por text default (auth.uid())::text,
  atualizado_por_nome text,
  updated_at timestamptz not null default now(),
  primary key (data, nave)
);

-- Log de correções/cancelamentos (mesmo formato de prod_alteracoes).
create table if not exists public.prod_apt_alteracoes (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid references public.prod_apt_execucoes(id) on delete cascade,
  green_tag_id uuid references public.prod_apt_green_tags(id) on delete cascade,
  codigo text,
  acao text not null check (acao in ('corrigir_evento','cancelar_execucao','cancelar_green_tag')),
  alteracoes jsonb not null default '[]'::jsonb,
  resumo text,
  alterado_por_id text,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.prod_apt_etapas enable row level security;
alter table public.prod_apt_posicoes enable row level security;
alter table public.prod_apt_checklist_itens enable row level security;
alter table public.prod_apt_motivos_pausa enable row level security;
alter table public.prod_apt_execucoes enable row level security;
alter table public.prod_apt_eventos enable row level security;
alter table public.prod_apt_checklist_marcas enable row level security;
alter table public.prod_apt_green_tags enable row level security;
alter table public.prod_apt_programacao enable row level security;
alter table public.prod_apt_diario enable row level security;
alter table public.prod_apt_alteracoes enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'prod_apt_etapas','prod_apt_posicoes','prod_apt_checklist_itens','prod_apt_motivos_pausa',
    'prod_apt_execucoes','prod_apt_eventos','prod_apt_checklist_marcas','prod_apt_green_tags',
    'prod_apt_programacao','prod_apt_diario','prod_apt_alteracoes'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_sel', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- Cadastros: quem tem a flag prod_apt_cadastros. Sem DELETE — desativa.
  foreach t in array array[
    'prod_apt_etapas','prod_apt_posicoes','prod_apt_checklist_itens','prod_apt_motivos_pausa'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check ((select private.prod_apt_pode('prod_apt_cadastros')))$p$, t || '_ins', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using ((select private.prod_apt_pode('prod_apt_cadastros')))
      with check ((select private.prod_apt_pode('prod_apt_cadastros')))$p$, t || '_upd', t);
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;

  -- Execução/eventos/checklist/green tag/log: escrita só por RPC.
  foreach t in array array[
    'prod_apt_execucoes','prod_apt_eventos','prod_apt_checklist_marcas','prod_apt_green_tags','prod_apt_alteracoes'
  ] loop
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;

drop policy if exists prod_apt_programacao_ins on public.prod_apt_programacao;
drop policy if exists prod_apt_programacao_upd on public.prod_apt_programacao;
drop policy if exists prod_apt_programacao_del on public.prod_apt_programacao;
create policy prod_apt_programacao_ins on public.prod_apt_programacao for insert to authenticated
  with check ((select private.prod_apt_pode('prod_apt_programar')));
create policy prod_apt_programacao_upd on public.prod_apt_programacao for update to authenticated
  using ((select private.prod_apt_pode('prod_apt_programar')))
  with check ((select private.prod_apt_pode('prod_apt_programar')));
create policy prod_apt_programacao_del on public.prod_apt_programacao for delete to authenticated
  using ((select private.prod_apt_pode('prod_apt_programar')));

drop policy if exists prod_apt_diario_ins on public.prod_apt_diario;
drop policy if exists prod_apt_diario_upd on public.prod_apt_diario;
create policy prod_apt_diario_ins on public.prod_apt_diario for insert to authenticated
  with check (private.prod_apt_pode('prod_apontar_' || nave) and atualizado_por = (select auth.uid())::text);
create policy prod_apt_diario_upd on public.prod_apt_diario for update to authenticated
  using (private.prod_apt_pode('prod_apontar_' || nave))
  with check (private.prod_apt_pode('prod_apontar_' || nave) and atualizado_por = (select auth.uid())::text);
revoke delete on public.prod_apt_diario from authenticated;

-- ---------------------------------------------------------------------
-- Seed — proposta inicial, ajustável em Produção › Apontamentos › Cadastros.
-- ---------------------------------------------------------------------

-- Um único INSERT: as FKs (etapa_anterior_id) são checadas no fim do comando.
insert into public.prod_apt_etapas
  (id, nave, nome, ordem, nivel, etapa_anterior_id, tramos, exige_posicao, permite_retrabalho, rotulo_retrabalho, requisito_green_tag)
values
  -- Nave 1 — chapa (quantidade, sem fila)
  ('corte',               'nave1', 'Corte',                        10, 'chapa',  null,                  null,   false, false, null,         false),
  ('pre_jato',            'nave1', 'Pré-Jato',                     20, 'chapa',  null,                  null,   false, false, null,         false),
  ('chanfro',             'nave1', 'Chanfro',                      30, 'chapa',  null,                  null,   false, false, null,         false),
  -- Nave 1 — virola
  ('calandra',            'nave1', 'Calandra',                     40, 'virola', null,                  null,   false, true,  'Recalandra', false),
  ('lw',                  'nave1', 'LW (Solda Longitudinal)',      50, 'virola', 'calandra',            null,   false, true,  'Retrabalho', false),
  ('liberacao_virola',    'nave1', 'Liberação de Virola',          60, 'virola', 'lw',                  null,   false, false, null,         false),
  ('passagem_virola',     'nave1', 'Passagem de Virola',           70, 'virola', 'liberacao_virola',    null,   false, false, null,         false),
  ('montagem_virola_saw', 'nave1', 'Montagem de Virola SAW 2 e 3', 80, 'virola', 'passagem_virola',     null,   false, false, null,         false),
  ('solda_virola_saw',    'nave1', 'Solda de Virola SAW 2 e 3',    90, 'virola', 'montagem_virola_saw', null,   false, true,  'Retrabalho', true),
  -- Nave 1 — tramo (paralelas, depois de todas as virolas liberadas)
  ('montagem_flange',     'nave1', 'Montagem de Flange',          100, 'tramo',  'liberacao_virola',    null,   false, false, null,         true),
  ('montagem_bipartida',  'nave1', 'Montagem da Bi-Partida',      110, 'tramo',  'liberacao_virola',    '{T1}', false, false, null,         true),
  ('marco_porta',         'nave1', 'Marco Porta',                 120, 'tramo',  'liberacao_virola',    '{T1}', false, false, null,         true),
  -- Nave 2 — tramo (entrada exige Green Tag N1→N2)
  ('saw03',               'nave2', 'SAW 03',                       10, 'tramo',  null,                  null,   true,  true,  'Retrabalho', true),
  ('internos_soldaveis',  'nave2', 'Internos Soldáveis',           20, 'tramo',  'saw03',               null,   false, true,  'Retrabalho', true),
  -- White — tramo (entrada exige Green Tag N2→White)
  ('jato',                'white', 'Jato',                         10, 'tramo',  null,                  null,   false, true,  'Rejato',     false),
  ('metalizacao',         'white', 'Metalização',                  20, 'tramo',  'jato',                null,   false, false, null,         false),
  ('pintura',             'white', 'Pintura',                      30, 'tramo',  'metalizacao',         null,   true,  true,  'Repintura',  false),
  ('reparo',              'white', 'Reparo / Montagem Final',      40, 'tramo',  'pintura',             null,   true,  false, null,         false)
on conflict (id) do nothing;

insert into public.prod_apt_posicoes (etapa_id, nome, ordem) values
  ('corte', 'Mesa de Corte 1', 1),
  ('calandra', 'Calandra 1', 1),
  ('montagem_virola_saw', 'SAW 2', 1), ('montagem_virola_saw', 'SAW 3', 2),
  ('solda_virola_saw', 'SAW 2', 1), ('solda_virola_saw', 'SAW 3', 2),
  ('saw03', 'A1', 1), ('saw03', 'A2', 2), ('saw03', 'B', 3), ('saw03', 'C', 4),
  ('jato', 'Cabine de Jato', 1),
  ('pintura', 'Cabine A', 1), ('pintura', 'Cabine B', 2), ('pintura', 'Cabine C', 3),
  ('reparo', 'MF-A', 1), ('reparo', 'MF-B', 2), ('reparo', 'MF-C', 3), ('reparo', 'MF-D', 4),
  ('reparo', 'Corredor 1', 5), ('reparo', 'Corredor 2', 6),
  ('reparo', 'MF-A externa', 7), ('reparo', 'MF-B externa', 8),
  ('reparo', 'MF-C externa', 9), ('reparo', 'MF-D externa', 10)
on conflict (etapa_id, nome) do nothing;

insert into public.prod_apt_checklist_itens (etapa_id, codigo, nome, ordem) values
  ('marco_porta', 'preparacao_corte', 'Preparação para corte', 1),
  ('marco_porta', 'selagem', 'Selagem', 2),
  ('marco_porta', 'solda_externa', 'Solda externa', 3),
  ('internos_soldaveis', 'sd', 'Solda dos internos (SD)', 1),
  ('internos_soldaveis', 'vs', 'Inspeção visual (VS)', 2),
  ('internos_soldaveis', 'ut', 'Ultrassom (UT)', 3),
  ('internos_soldaveis', 'laudo', 'Laudo', 4),
  ('internos_soldaveis', 'check_flange', 'Check flange', 5),
  ('internos_soldaveis', 'rebaixamento', 'Rebaixamento', 6),
  ('pintura', 'zinco_externo', 'Zinco externo', 1),
  ('pintura', 'epoxi2_externo', 'Epóxi 2° demão externo', 2),
  ('pintura', 'pu_externo', 'PU externo', 3),
  ('pintura', 'epoxi1_interno', 'Epóxi 1° demão interno', 4),
  ('pintura', 'epoxi2_interno', 'Epóxi 2° demão interno', 5),
  ('pintura', 'inspecao_pintura', 'Inspeção de pintura', 6),
  ('reparo', 'bordas', 'Bordas', 1),
  ('reparo', 'soldar_buchas', 'Soldar buchas', 2),
  ('reparo', 'suportes', 'Suportes', 3),
  ('reparo', 'reparos_interno', 'Reparos interno', 4),
  ('reparo', 'reparos_externo', 'Reparos externo', 5),
  ('reparo', 'montagem', 'Montagem', 6),
  ('reparo', 'inspecao_final', 'Inspeção final', 7)
on conflict (etapa_id, codigo) do nothing;

insert into public.prod_apt_motivos_pausa (nome, categoria, exige_observacao, ordem) values
  ('Manutenção de equipamento', 'manutencao', false, 1),
  ('Falta de material/consumível', 'material', false, 2),
  ('Aguardando ponte rolante', 'movimentacao', false, 3),
  ('Aguardando qualidade', 'qualidade', false, 4),
  ('Aguardando engenharia', 'engenharia', false, 5),
  ('Falta de energia/ar', 'utilidades', false, 6),
  ('Falta de efetivo', 'efetivo', false, 7),
  ('Refeição/troca de turno', 'turno', false, 8),
  ('Problema de TI', 'ti', false, 9),
  ('Chuva/clima', 'clima', false, 10),
  ('Outro', 'outro', true, 99)
on conflict (nome) do nothing;

notify pgrst, 'reload schema';
