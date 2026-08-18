-- =====================================================================
-- Memória de vínculos: "quando ESTE fornecedor escreve ESTA descrição,
-- é ESTE material". Alimentada toda vez que o comprador confirma um
-- vínculo na tela de revisão; consultada na próxima extração para
-- pré-sugerir o ri sem depender só de trigrama.
--
-- O par (cnpj, descrição normalizada) é a chave: o mesmo texto de dois
-- fornecedores diferentes pode ser material diferente.
-- =====================================================================

create table if not exists public.cotacao_descricao_map (
  id                    uuid primary key default gen_random_uuid(),
  fornecedor_cnpj       text not null,
  descricao_norm        text not null,
  descricao_original    text not null,
  codigo_produto        text,
  material_code         text,
  unidade_medida        text,
  vezes_confirmado      int not null default 1,
  ultima_confirmacao    timestamptz not null default now(),
  ultimo_usuario_nome   text,
  created_at            timestamptz not null default now()
);

create unique index if not exists cotacao_descricao_map_chave
  on public.cotacao_descricao_map (fornecedor_cnpj, descricao_norm);
create index if not exists cotacao_descricao_map_material_idx
  on public.cotacao_descricao_map (material_code);
create index if not exists cotacao_descricao_map_norm_trgm
  on public.cotacao_descricao_map using gin (descricao_norm gin_trgm_ops);
-- Código do fornecedor é o casamento mais forte que existe: exato e estável.
create index if not exists cotacao_descricao_map_codigo_idx
  on public.cotacao_descricao_map (fornecedor_cnpj, codigo_produto)
  where codigo_produto is not null;

alter table public.cotacao_descricao_map enable row level security;
revoke all on public.cotacao_descricao_map from anon;

drop policy if exists cotacao_descricao_map_rw on public.cotacao_descricao_map;
create policy cotacao_descricao_map_rw on public.cotacao_descricao_map
  for all to authenticated
  using (public.pode_gerir_cotacoes())
  with check (public.pode_gerir_cotacoes());

grant select, insert, update, delete on public.cotacao_descricao_map to authenticated;
