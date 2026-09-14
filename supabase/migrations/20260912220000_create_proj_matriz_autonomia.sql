-- =====================================================================
-- Almoxarifado > Projetos — Matriz de Autonomia de Kits por Tramo
--
-- Armazena o estado de avanço e autonomia dos kits dos tramos torre a torre,
-- vinculando com estoque e diferenciando:
--   0: Não atende (Vermelho)
--   1: Estoque (Verde)
--   3: OK Pátio (Azul) - kits pagos da pré-montagem para a produção
--   4: Expedido (Laranja) - tramos expedidos com série física
-- =====================================================================

create table if not exists public.proj_matriz_autonomia_kits (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  subprojeto_id text not null default 'SP01' references public.proj_subprojetos(id) on delete cascade,
  torre_numero integer not null check (torre_numero >= 1),
  tramo text not null check (tramo in ('T1', 'T2', 'T3', 'T4', 'T5')),
  subkit text not null check (subkit in ('fixadores', 'plataforma', 'escada_avanti', 'escada_acesso')),
  status integer not null check (status in (0, 1, 3, 4)),
  serie text,
  observacao text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_proj_matriz_autonomia unique (subprojeto_id, torre_numero, tramo, subkit)
);

create index if not exists idx_proj_matriz_autonomia_subproj
  on public.proj_matriz_autonomia_kits (subprojeto_id, torre_numero);

create table if not exists public.proj_torres_planejamento (
  id uuid primary key default gen_random_uuid(),
  subprojeto_id text not null default 'SP01' references public.proj_subprojetos(id) on delete cascade,
  torre_numero integer not null check (torre_numero >= 1),
  semana text,
  data_alvo date,
  observacao text,
  updated_at timestamptz not null default now(),
  constraint uq_proj_torres_planejamento unique (subprojeto_id, torre_numero)
);

alter table public.proj_matriz_autonomia_kits enable row level security;
alter table public.proj_torres_planejamento enable row level security;

-- Políticas RLS: leitura pública/autenticada, escrita autenticada
create policy "proj_matriz_autonomia_kits_select"
  on public.proj_matriz_autonomia_kits
  for select
  to anon, authenticated, service_role
  using (true);

create policy "proj_matriz_autonomia_kits_insert"
  on public.proj_matriz_autonomia_kits
  for insert
  to authenticated, service_role
  with check (true);

create policy "proj_matriz_autonomia_kits_update"
  on public.proj_matriz_autonomia_kits
  for update
  to authenticated, service_role
  using (true)
  with check (true);

create policy "proj_torres_planejamento_select"
  on public.proj_torres_planejamento
  for select
  to anon, authenticated, service_role
  using (true);

create policy "proj_torres_planejamento_insert"
  on public.proj_torres_planejamento
  for insert
  to authenticated, service_role
  with check (true);

create policy "proj_torres_planejamento_update"
  on public.proj_torres_planejamento
  for update
  to authenticated, service_role
  using (true)
  with check (true);

grant select on public.proj_matriz_autonomia_kits to anon, authenticated, service_role;
grant insert, update, delete on public.proj_matriz_autonomia_kits to authenticated, service_role;

grant select on public.proj_torres_planejamento to anon, authenticated, service_role;
grant insert, update, delete on public.proj_torres_planejamento to authenticated, service_role;

-- Semanas de planejamento iniciais conforme o controle de fábrica
insert into public.proj_torres_planejamento (subprojeto_id, torre_numero, semana)
values 
  ('SP01', 1, 'W36'),
  ('SP01', 2, 'W37')
on conflict (subprojeto_id, torre_numero) do update
set semana = excluded.semana;

-- Sementes da planilha real (Torre 1 e Torre 2, além dos pontos de pátio já confirmados)
-- Torre 1: todas as peças expedidas
insert into public.proj_matriz_autonomia_kits (subprojeto_id, torre_numero, tramo, subkit, status, serie)
values
  ('SP01', 1, 'T5', 'fixadores', 4, '3147'),
  ('SP01', 1, 'T5', 'plataforma', 4, '3147'),
  ('SP01', 1, 'T5', 'escada_avanti', 4, '3147'),
  ('SP01', 1, 'T4', 'fixadores', 4, '3146'),
  ('SP01', 1, 'T4', 'plataforma', 4, '3146'),
  ('SP01', 1, 'T4', 'escada_avanti', 4, '3146'),
  ('SP01', 1, 'T3', 'fixadores', 4, '3145'),
  ('SP01', 1, 'T3', 'plataforma', 4, '3145'),
  ('SP01', 1, 'T3', 'escada_avanti', 4, '3145'),
  ('SP01', 1, 'T2', 'fixadores', 4, '3144'),
  ('SP01', 1, 'T2', 'plataforma', 4, '3144'),
  ('SP01', 1, 'T2', 'escada_avanti', 4, '3144'),
  ('SP01', 1, 'T1', 'fixadores', 4, '3143'),
  ('SP01', 1, 'T1', 'plataforma', 4, '3143'),
  ('SP01', 1, 'T1', 'escada_avanti', 4, '3143'),
  ('SP01', 1, 'T1', 'escada_acesso', 4, '3143'),

-- Torre 2: Plataforma expedida com séries, restantes OK Pátio
  ('SP01', 2, 'T5', 'fixadores', 3, null),
  ('SP01', 2, 'T5', 'plataforma', 4, '3182'),
  ('SP01', 2, 'T5', 'escada_avanti', 3, null),
  ('SP01', 2, 'T4', 'fixadores', 3, null),
  ('SP01', 2, 'T4', 'plataforma', 4, '3156'),
  ('SP01', 2, 'T4', 'escada_avanti', 3, null),
  ('SP01', 2, 'T3', 'fixadores', 3, null),
  ('SP01', 2, 'T3', 'plataforma', 4, '3160'),
  ('SP01', 2, 'T3', 'escada_avanti', 3, null),
  ('SP01', 2, 'T2', 'fixadores', 3, null),
  ('SP01', 2, 'T2', 'plataforma', 4, '3169'),
  ('SP01', 2, 'T2', 'escada_avanti', 3, null),
  ('SP01', 2, 'T1', 'fixadores', 3, null),
  ('SP01', 2, 'T1', 'plataforma', 4, '3148'),
  ('SP01', 2, 'T1', 'escada_avanti', 3, null),
  ('SP01', 2, 'T1', 'escada_acesso', 3, null),

-- Torre 3: Plataformas no Pátio (3151, 3150, 3149, 3153)
  ('SP01', 3, 'T4', 'plataforma', 3, '3151'),
  ('SP01', 3, 'T3', 'plataforma', 3, '3150'),
  ('SP01', 3, 'T2', 'plataforma', 3, '3149'),
  ('SP01', 3, 'T1', 'plataforma', 3, '3153'),

-- Torre 4: Plataforma T2 no Pátio (3159), Fixadores T2 no Pátio
  ('SP01', 4, 'T2', 'fixadores', 3, null),
  ('SP01', 4, 'T2', 'plataforma', 3, '3159')
on conflict (subprojeto_id, torre_numero, tramo, subkit) do update
set status = excluded.status,
    serie = excluded.serie,
    updated_at = now();
