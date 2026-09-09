-- =====================================================================
-- Almoxarifado > Projetos — subprojetos e unidades de tramo (GW Jacobina)
--
-- O projeto macro são 69 torres de 5 tramos cada. O que a fábrica rastreia
-- não é "torre 07": é a série física do tramo (T1-3143, T2-3144, ...), que
-- corre sequencial pelo projeto inteiro. Cada torre consome 5 séries
-- consecutivas, então torre e tramo são deriváveis da série:
--
--   torre = (serie - 3143) / 5 + 1      tramo = 'T' || ((serie - 3143) % 5 + 1)
--
-- As 345 linhas são semeadas aqui em vez de digitadas na tela porque a
-- numeração é contrato com a engenharia — quem lança no almoxarifado escolhe
-- de uma lista, não inventa o código.
--
-- Os subprojetos são os pedidos de compra: o consumo da BOM é por torre, e a
-- meta de cada pedido é BOM_unitária x torres do pedido.
-- =====================================================================

create table if not exists public.proj_subprojetos (
  id text primary key,
  projeto text not null default 'GW_JACOBINA',
  nome text not null,
  pedido_compra text,
  torres_previstas integer not null,
  torre_inicial integer not null,
  torre_final integer not null,
  ativo boolean not null default true,
  ordem integer not null default 1,
  observacao text,
  created_at timestamptz not null default now()
);

insert into public.proj_subprojetos (id, nome, torres_previstas, torre_inicial, torre_final, ativo, ordem, observacao)
values
  ('SP01', 'Subprojeto 01', 23,  1, 23, true,  1, 'Pedido em recebimento'),
  ('SP02', 'Subprojeto 02', 16, 24, 39, false, 2, 'Previsto'),
  ('SP03', 'Subprojeto 03', 30, 40, 69, false, 3, 'Previsto')
on conflict (id) do nothing;

create table if not exists public.proj_tramos_gwjaco (
  id text primary key,
  projeto text not null default 'GW_JACOBINA',
  torre_numero integer not null,
  tramo text not null check (tramo in ('T1','T2','T3','T4','T5')),
  secao text not null check (secao in ('S1','S2','S3','S4','S5')),
  serie integer not null,
  subprojeto_id text references public.proj_subprojetos (id),
  -- pendente -> em_premontagem -> kit_pronto -> entregue. "disponivel_separar"
  -- não é gravado: é calculado pela autonomia (tem saldo para o romaneio?).
  status text not null default 'pendente'
    check (status in ('pendente','em_premontagem','kit_pronto','entregue')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (projeto, serie),
  unique (projeto, torre_numero, tramo)
);

-- 345 unidades = 69 torres x 5 tramos, séries 3143..3487.
insert into public.proj_tramos_gwjaco (id, torre_numero, tramo, secao, serie, subprojeto_id)
select
  'T' || ((s - 3143) % 5 + 1) || '-' || s,
  (s - 3143) / 5 + 1,
  'T' || ((s - 3143) % 5 + 1),
  'S' || ((s - 3143) % 5 + 1),
  s,
  case
    when (s - 3143) / 5 + 1 <= 23 then 'SP01'
    when (s - 3143) / 5 + 1 <= 39 then 'SP02'
    else 'SP03'
  end
from generate_series(3143, 3487) as s
on conflict (id) do nothing;

create index if not exists idx_proj_tramos_torre on public.proj_tramos_gwjaco (projeto, torre_numero);
create index if not exists idx_proj_tramos_tramo on public.proj_tramos_gwjaco (projeto, tramo, status);
create index if not exists idx_proj_tramos_subprojeto on public.proj_tramos_gwjaco (subprojeto_id, status);

grant select, insert, update, delete on public.proj_subprojetos to anon, authenticated, service_role;
grant select, insert, update, delete on public.proj_tramos_gwjaco to anon, authenticated, service_role;

alter table public.proj_subprojetos enable row level security;
alter table public.proj_tramos_gwjaco enable row level security;

drop policy if exists "proj_subprojetos_all" on public.proj_subprojetos;
create policy "proj_subprojetos_all" on public.proj_subprojetos for all using (true) with check (true);

drop policy if exists "proj_tramos_gwjaco_all" on public.proj_tramos_gwjaco;
create policy "proj_tramos_gwjaco_all" on public.proj_tramos_gwjaco for all using (true) with check (true);
