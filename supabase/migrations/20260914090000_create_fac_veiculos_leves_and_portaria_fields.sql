-- Facilities: carros alugados e integração com o Livro de Ocorrências.
-- O executável do Supabase CLI não está disponível neste ambiente; o arquivo
-- segue o mesmo padrão/timestamp das migrations existentes.

create table if not exists public.fac_veiculos_leves (
  id uuid primary key default gen_random_uuid(),
  modelo text not null check (btrim(modelo) <> ''),
  placa text not null check (btrim(placa) <> ''),
  data_licenciamento date,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text references public.core_perfis(id),
  unique (placa)
);

create index if not exists idx_fac_veiculos_leves_ativos
  on public.fac_veiculos_leves (ativo, modelo)
  where excluido_em is null;

alter table public.fac_veiculos_leves enable row level security;

drop policy if exists fac_veiculos_leves_select on public.fac_veiculos_leves;
create policy fac_veiculos_leves_select on public.fac_veiculos_leves
  for select to authenticated using (true);

drop policy if exists fac_veiculos_leves_write on public.fac_veiculos_leves;
create policy fac_veiculos_leves_write on public.fac_veiculos_leves
  for all to authenticated
  using (
    public.has_role('admin')
    or exists (
      select 1
      from public.core_perfis p
      where p.id = (select auth.uid())::text
        and (
          lower(p.email) like 'adriano.oliveira%'
          or lower(p.email) = 'adriano@ten.ind.br'
          or lower(p.name) like '%adriano%'
             and p.sector_id = '3'
        )
    )
  )
  with check (
    public.has_role('admin')
    or exists (
      select 1
      from public.core_perfis p
      where p.id = (select auth.uid())::text
        and (
          lower(p.email) like 'adriano.oliveira%'
          or lower(p.email) = 'adriano@ten.ind.br'
          or lower(p.name) like '%adriano%'
             and p.sector_id = '3'
        )
    )
  );

grant select, insert, update, delete on public.fac_veiculos_leves to authenticated;

alter table public.port_relatorio_ocorrencias
  add column if not exists tipo_registro text not null default 'OUTRO_REGISTRO',
  add column if not exists hora_saida time,
  add column if not exists vigilante_saida text,
  add column if not exists status_permanencia text default 'NAO_APLICA',
  add column if not exists foto_url text,
  add column if not exists empresa text,
  add column if not exists nome_pessoa text,
  add column if not exists documento_cpf text,
  add column if not exists documento_cnh text,
  add column if not exists placa text,
  add column if not exists autorizado_por text,
  add column if not exists fara_briefing boolean not null default false,
  add column if not exists motivo_observacao text,
  add column if not exists pessoas jsonb not null default '[]'::jsonb,
  add column if not exists veiculo_leve_id uuid,
  add column if not exists veiculo_leve_modelo text,
  add column if not exists condutor_pessoa_id uuid,
  add column if not exists condutor_origem text;

alter table public.port_relatorio_ocorrencias
  drop constraint if exists port_relatorio_ocorrencias_tipo_registro_check;
alter table public.port_relatorio_ocorrencias
  add constraint port_relatorio_ocorrencias_tipo_registro_check
  check (tipo_registro in (
    'ENTRADA_VEICULO', 'VEICULO_LEVE', 'ENTRADA_VISITANTE',
    'SAIDA_COLABORADOR', 'RONDA_PATRIMONIAL', 'OCORRENCIA_GERAL', 'OUTRO_REGISTRO'
  ));

alter table public.port_relatorio_ocorrencias
  drop constraint if exists port_relatorio_ocorrencias_status_permanencia_check;
alter table public.port_relatorio_ocorrencias
  add constraint port_relatorio_ocorrencias_status_permanencia_check
  check (status_permanencia in ('NO_PATIO', 'FINALIZADO', 'AGUARDANDO_RETORNO', 'NAO_APLICA'));

alter table public.port_relatorio_ocorrencias
  add constraint port_relatorio_ocorrencias_veiculo_leve_id_fkey
  foreign key (veiculo_leve_id) references public.fac_veiculos_leves(id) on delete set null;

alter table public.port_relatorio_ocorrencias
  add constraint port_relatorio_ocorrencias_condutor_pessoa_id_fkey
  foreign key (condutor_pessoa_id) references public.rh_pessoas(id) on delete set null;

alter table public.port_relatorio_ocorrencias
  drop constraint if exists port_relatorio_ocorrencias_condutor_origem_check;
alter table public.port_relatorio_ocorrencias
  add constraint port_relatorio_ocorrencias_condutor_origem_check
  check (condutor_origem is null or condutor_origem in ('rh_pessoas', 'manual'));

create index if not exists idx_port_relatorio_ocorrencias_veiculo_leve
  on public.port_relatorio_ocorrencias (veiculo_leve_id)
  where veiculo_leve_id is not null;
