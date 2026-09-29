alter table public.rh_treinamentos_catalogo
  add column if not exists tipo_informacao text not null default 'nao_informado';

alter table public.rh_treinamentos_catalogo
  drop constraint if exists rh_treinamentos_catalogo_tipo_informacao_check;

alter table public.rh_treinamentos_catalogo
  add constraint rh_treinamentos_catalogo_tipo_informacao_check
  check (tipo_informacao in ('interno', 'externo', 'nao_informado'));

alter table public.rh_treinamentos_catalogo
  alter column tipo_informacao set default 'nao_informado';

update public.rh_treinamentos_catalogo
set tipo_informacao = 'nao_informado'
where tipo_informacao not in ('interno', 'externo', 'nao_informado');
