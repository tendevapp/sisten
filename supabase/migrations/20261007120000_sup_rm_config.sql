-- Configuração da abertura de RM: comprador (EKGRP) fixo que sobrepõe o setor solicitante.
-- Uma linha só (id = 'rm'); leitura para qualquer logado (a tela de Abrir RM precisa),
-- escrita só admin.
create table if not exists public.sup_rm_config (
  id text primary key default 'rm' check (id = 'rm'),
  comprador_fixo_ativo boolean not null default true,
  comprador_fixo_codigo text not null default '358',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.sup_rm_config (id) values ('rm') on conflict (id) do nothing;

alter table public.sup_rm_config enable row level security;

create policy sup_rm_config_select
  on public.sup_rm_config
  for select to authenticated
  using (true);

create policy sup_rm_config_insert
  on public.sup_rm_config
  for insert to authenticated
  with check (public.has_role('admin'));

create policy sup_rm_config_update
  on public.sup_rm_config
  for update to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));
