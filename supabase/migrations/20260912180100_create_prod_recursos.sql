-- =====================================================================
-- Produção > Recursos — máquinas do chão de fábrica (mesa de corte,
-- calandra, SAW). O NAV1 nunca registrava QUAL máquina executou; sem isso
-- não se correlaciona defeito recorrente a equipamento (achado A3 da análise
-- do sistema original). Cadastro simples por enquanto; tela de admin (com
-- inativação/edição) fica para o Bloco 6 — a fábrica pode ter mais de uma
-- calandra ou mesa de corte que a seed abaixo não conhece, e um INSERT nesta
-- tabela já resolve manualmente antes disso.
-- =====================================================================

create table if not exists public.prod_recursos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('corte','calandra','saw','outro')),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tipo, nome)
);

insert into public.prod_recursos (tipo, nome) values
  ('corte', 'Mesa de Corte 1'),
  ('calandra', 'Calandra 1'),
  ('saw', 'SAW 1'),
  ('saw', 'SAW 2'),
  ('saw', 'SAW 3')
on conflict (tipo, nome) do nothing;

grant select on public.prod_recursos to anon, authenticated, service_role;
alter table public.prod_recursos enable row level security;
drop policy if exists prod_recursos_sel on public.prod_recursos;
create policy prod_recursos_sel on public.prod_recursos for select using (true);
