-- =====================================================================
-- Almoxarifado > Projetos — as tabelas dos 5 formulários operacionais
--
--   F1 proj_notas_entrada        — recebimento de NF (explode a BOM)
--   F2 proj_ordens_premontagem   — separação/picking do kit de tramo
--   F3 proj_kits                 — kit consolidado no buffer
--   F4 proj_entregas_producao    — baixa do kit para a produção
--   F5 proj_sobressalentes       — reposição por quebra/refugo
--
-- Um kit é uma LINHA rastreável, não um contador: o saldo do buffer é
-- count(status='pronto'). Contador não responde "qual kit está na bancada",
-- que é a pergunta que a produção faz.
-- =====================================================================

-- F1 — Entrada de materiais (NF do fornecedor)
create table if not exists public.proj_notas_entrada (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  codigo text not null,
  data_entrada date not null,
  numero_nf text not null,
  fornecedor text not null,
  subprojeto_id text references public.proj_subprojetos (id),
  observacao text,
  total_itens integer not null default 0,
  total_quantidade numeric not null default 0,
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  unique (projeto, codigo)
);

-- O item COMO FATURADO. Guardado à parte dos créditos para a NF continuar
-- auditável contra o que a explosão gerou.
create table if not exists public.proj_notas_entrada_pais (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.proj_notas_entrada (id) on delete cascade,
  bom_linha_id bigint,
  part_number text,
  cod_sap text,
  descricao text,
  quantidade_recebida numeric not null,
  explodir boolean not null default true,
  torres_equivalentes numeric,
  divergencia boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_proj_nf_data on public.proj_notas_entrada (projeto, data_entrada desc) where not excluido;
create index if not exists idx_proj_nf_pais_nota on public.proj_notas_entrada_pais (nota_id);

-- F2 — Ordem de saida para pre-montagem (picking do kit)
create table if not exists public.proj_ordens_premontagem (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  codigo text not null,
  subprojeto_id text references public.proj_subprojetos (id),
  tramo text not null check (tramo in ('T1','T2','T3','T4','T5')),
  quantidade_kits integer not null check (quantidade_kits > 0),
  status text not null default 'em_processamento'
    check (status in ('em_processamento','concluida','cancelada')),
  observacao text,
  criado_por_id uuid,
  criado_por_nome text,
  concluida_em timestamptz,
  concluida_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  unique (projeto, codigo)
);

-- Romaneio congelado: o que a lista mandava separar NAQUELE momento.
-- Sem congelar, a lista mudaria debaixo de quem está separando.
create table if not exists public.proj_ordens_premontagem_itens (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.proj_ordens_premontagem (id) on delete cascade,
  item_id uuid not null references public.proj_itens (id),
  subconjunto text,
  qtd_por_kit numeric not null,
  qtd_total numeric not null,
  localizador text,
  saldo_no_momento numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.proj_ordens_premontagem_alvos (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.proj_ordens_premontagem (id) on delete cascade,
  tramo_unidade_id text not null references public.proj_tramos_gwjaco (id),
  created_at timestamptz not null default now(),
  unique (ordem_id, tramo_unidade_id)
);

create index if not exists idx_proj_ordens_status on public.proj_ordens_premontagem (projeto, status, created_at desc) where not excluido;
create index if not exists idx_proj_ordens_itens_ordem on public.proj_ordens_premontagem_itens (ordem_id);
create index if not exists idx_proj_ordens_alvos_ordem on public.proj_ordens_premontagem_alvos (ordem_id);

-- F3 — Kit consolidado no buffer de pre-montagem.
create table if not exists public.proj_kits (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  rastreio text not null,
  codigo text,
  tramo text not null check (tramo in ('T1','T2','T3','T4','T5')),
  tramo_unidade_id text not null references public.proj_tramos_gwjaco (id),
  ordem_id uuid references public.proj_ordens_premontagem (id),
  status text not null default 'em_premontagem'
    check (status in ('em_premontagem','pronto','entregue')),
  qualidade_ok boolean,
  nao_conformidade text,
  observacao text,
  concluido_em timestamptz,
  concluido_por_nome text,
  entrega_id uuid,
  entregue_em timestamptz,
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  unique (projeto, rastreio)
);

create index if not exists idx_proj_kits_status on public.proj_kits (projeto, tramo, status) where not excluido;
create index if not exists idx_proj_kits_unidade on public.proj_kits (tramo_unidade_id);

-- F4 — Baixa consolidada para a producao
create table if not exists public.proj_entregas_producao (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  codigo text not null,
  data date not null,
  turno text,
  subprojeto_id text references public.proj_subprojetos (id),
  kit_id uuid not null references public.proj_kits (id),
  tramo text not null,
  tramo_unidade_id text not null references public.proj_tramos_gwjaco (id),
  recebido_por_nome text not null,
  observacao text,
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  unique (projeto, codigo)
);

create index if not exists idx_proj_entregas_data on public.proj_entregas_producao (projeto, data desc) where not excluido;

-- F5 — Solicitacao extraordinaria de sobressalente / refugo
create table if not exists public.proj_sobressalentes (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  codigo text not null,
  data date not null,
  subprojeto_id text references public.proj_subprojetos (id),
  tramo text,
  tramo_unidade_id text references public.proj_tramos_gwjaco (id),
  motivo text not null check (motivo in ('quebra_montagem','deformacao_solda','nc_fornecedor','perda_extravio','outros')),
  motivo_detalhe text,
  aprovador_nome text not null,
  aprovador_id uuid,
  status text not null default 'aprovado' check (status in ('solicitado','aprovado','recusado','atendido')),
  -- [{path, nome, tipo}] no bucket proj-evidencias; a foto sobe comprimida
  -- (regra 1 do CLAUDE.md — comprimirImagemUpload / prepareAttachment).
  evidencias jsonb not null default '[]'::jsonb,
  observacao text,
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now(),
  unique (projeto, codigo)
);

create table if not exists public.proj_sobressalentes_itens (
  id uuid primary key default gen_random_uuid(),
  sobressalente_id uuid not null references public.proj_sobressalentes (id) on delete cascade,
  item_id uuid not null references public.proj_itens (id),
  quantidade numeric not null check (quantidade > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_proj_sobr_data on public.proj_sobressalentes (projeto, data desc) where not excluido;
create index if not exists idx_proj_sobr_itens on public.proj_sobressalentes_itens (sobressalente_id);

grant select, insert, update, delete on public.proj_notas_entrada to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_notas_entrada_pais to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_ordens_premontagem to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_ordens_premontagem_itens to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_ordens_premontagem_alvos to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_kits to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_entregas_producao to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_sobressalentes to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_sobressalentes_itens to anon, authenticated, service_role;

alter table public.proj_notas_entrada enable row level security;
alter table public.proj_notas_entrada_pais enable row level security;
alter table public.proj_ordens_premontagem enable row level security;
alter table public.proj_ordens_premontagem_itens enable row level security;
alter table public.proj_ordens_premontagem_alvos enable row level security;
alter table public.proj_kits enable row level security;
alter table public.proj_entregas_producao enable row level security;
alter table public.proj_sobressalentes enable row level security;
alter table public.proj_sobressalentes_itens enable row level security;

drop policy if exists "proj_notas_entrada_all" on public.proj_notas_entrada;
create policy "proj_notas_entrada_all" on public.proj_notas_entrada for all using (true) with check (true);
drop policy if exists "proj_notas_entrada_pais_all" on public.proj_notas_entrada_pais;
create policy "proj_notas_entrada_pais_all" on public.proj_notas_entrada_pais for all using (true) with check (true);
drop policy if exists "proj_ordens_premontagem_all" on public.proj_ordens_premontagem;
create policy "proj_ordens_premontagem_all" on public.proj_ordens_premontagem for all using (true) with check (true);
drop policy if exists "proj_ordens_premontagem_itens_all" on public.proj_ordens_premontagem_itens;
create policy "proj_ordens_premontagem_itens_all" on public.proj_ordens_premontagem_itens for all using (true) with check (true);
drop policy if exists "proj_ordens_premontagem_alvos_all" on public.proj_ordens_premontagem_alvos;
create policy "proj_ordens_premontagem_alvos_all" on public.proj_ordens_premontagem_alvos for all using (true) with check (true);
drop policy if exists "proj_kits_all" on public.proj_kits;
create policy "proj_kits_all" on public.proj_kits for all using (true) with check (true);
drop policy if exists "proj_entregas_producao_all" on public.proj_entregas_producao;
create policy "proj_entregas_producao_all" on public.proj_entregas_producao for all using (true) with check (true);
drop policy if exists "proj_sobressalentes_all" on public.proj_sobressalentes;
create policy "proj_sobressalentes_all" on public.proj_sobressalentes for all using (true) with check (true);
drop policy if exists "proj_sobressalentes_itens_all" on public.proj_sobressalentes_itens;
create policy "proj_sobressalentes_itens_all" on public.proj_sobressalentes_itens for all using (true) with check (true);
