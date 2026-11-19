-- Portaria › Chegada de Transportes (FRM.SGP-0009) — janelas de chegada para o relatório
--
-- O "turno" do registro é o plantão do vigilante (a manhã vai até 16h38, a
-- noite começa às 18h14), não o turno dos colaboradores. O relatório agrupa as
-- chegadas por janela de horário — cada leva de ônibus/van — e mede o atraso
-- contra o horário limite da janela; sem limite cadastrado, contra o horário
-- habitual da rota naquela janela (mediana), sempre com a tolerância.
--
-- Janelas iniciais tiradas dos lançamentos de set–nov/2026; o horário oficial
-- de cada leva é do administrador (Relatório › Janelas).

create table if not exists public.port_transporte_janelas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  inicio time not null,
  fim time not null,              -- fim < início = atravessa a meia-noite
  limite time,                    -- horário oficial de chegada (nulo = habitual da rota)
  tolerancia_min int not null default 10 check (tolerancia_min between 0 and 180),
  ordem int not null default 0,
  ativo boolean not null default true,
  atualizado_por text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (inicio <> fim)
);

alter table public.port_transporte_janelas enable row level security;
drop policy if exists port_transporte_janelas_sel on public.port_transporte_janelas;
create policy port_transporte_janelas_sel on public.port_transporte_janelas
  for select to authenticated using (true);
drop policy if exists port_transporte_janelas_admin on public.port_transporte_janelas;
create policy port_transporte_janelas_admin on public.port_transporte_janelas
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.port_transporte_janelas from anon;
grant select, insert, update, delete on public.port_transporte_janelas to authenticated;

insert into public.port_transporte_janelas (nome, inicio, fim, ordem)
select * from (values
  ('Manhã', '05:00'::time, '09:00'::time, 1),
  ('Tarde — 1ª leva', '14:00'::time, '16:15'::time, 2),
  ('Tarde — 2ª leva', '16:15'::time, '18:00'::time, 3),
  ('Noite — 1ª leva', '18:00'::time, '21:00'::time, 4),
  ('Noite — 2ª leva', '21:00'::time, '00:30'::time, 5),
  ('Madrugada', '00:30'::time, '05:00'::time, 6)
) v(nome, inicio, fim, ordem)
where not exists (select 1 from public.port_transporte_janelas);

-- Primeira versão aplicada tinha uma janela só de 21h às 05h, que juntava a
-- leva das 22h–00h com a da madrugada (00h45–02h30): separa as duas.
update public.port_transporte_janelas
   set nome = 'Noite — 2ª leva', fim = '00:30', updated_at = now()
 where nome = 'Noite — madrugada' and inicio = '21:00' and fim = '05:00';
insert into public.port_transporte_janelas (nome, inicio, fim, ordem)
select 'Madrugada', '00:30', '05:00', 6
 where not exists (select 1 from public.port_transporte_janelas where inicio = '00:30');
