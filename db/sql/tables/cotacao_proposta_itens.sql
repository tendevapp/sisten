-- =====================================================================
-- Itens de uma proposta. O vínculo com o item de RM é uma COLUNA, não
-- uma tabela de ligação: um item cotado atende 0..1 item da RM. Duas
-- marcas para o mesmo ri = duas linhas apontando para o mesmo
-- processo_item_id. ri sem oferta = nenhuma linha apontando (LEFT JOIN
-- na cobertura). Item fora do escopo (frete, bonificação) =
-- processo_item_id NULL + fora_escopo = true.
-- =====================================================================

create table if not exists public.cotacao_proposta_itens (
  id                  uuid primary key default gen_random_uuid(),
  proposta_id         uuid not null references public.cotacao_propostas(id) on delete cascade,

  processo_item_id    uuid references public.cotacao_processo_itens(id) on delete set null,
  fora_escopo         boolean not null default false,
  vinculo_origem       text not null default 'manual'
                        check (vinculo_origem in ('manual','sugerido','aprendido')),
  vinculo_score       numeric(5,4),

  -- Desnormalizados no salvamento, para a busca histórica da fase 2 não
  -- precisar de dois JOINs em toda consulta.
  ri                  text,
  material_code       text,

  item_numero         int,
  codigo_produto      text,
  descricao_produto   text not null,
  marca_fabricante    text,
  unidade_medida      text,
  ncm                 text,
  cst                 text,
  cfop                text,
  quantidade          numeric(18,4),
  preco_unitario      numeric(18,6),
  preco_total_item    numeric(15,2),
  aliquota_icms_pct   numeric(7,4),
  aliquota_pis_pct    numeric(7,4),
  aliquota_cofins_pct numeric(7,4),
  aliquota_ipi_pct    numeric(7,4),

  campos_faltantes    text[] not null default '{}',
  extraido_raw        jsonb,
  created_at          timestamptz not null default now(),

  constraint cotacao_proposta_itens_qtd_nao_negativa
    check (quantidade is null or quantidade >= 0),
  constraint cotacao_proposta_itens_preco_nao_negativo
    check (preco_unitario is null or preco_unitario >= 0)
);

create index if not exists cotacao_proposta_itens_proposta_idx
  on public.cotacao_proposta_itens (proposta_id);
create index if not exists cotacao_proposta_itens_processo_item_idx
  on public.cotacao_proposta_itens (processo_item_id);
create index if not exists cotacao_proposta_itens_ri_idx
  on public.cotacao_proposta_itens (ri);
create index if not exists cotacao_proposta_itens_material_idx
  on public.cotacao_proposta_itens (material_code)
  where material_code is not null;

-- Busca histórica por descrição livre (fase 2).
create index if not exists cotacao_proposta_itens_desc_trgm
  on public.cotacao_proposta_itens
  using gin (public.f_unaccent(upper(descricao_produto)) gin_trgm_ops);

alter table public.cotacao_proposta_itens enable row level security;
revoke all on public.cotacao_proposta_itens from anon;

drop policy if exists cotacao_proposta_itens_rw on public.cotacao_proposta_itens;
create policy cotacao_proposta_itens_rw on public.cotacao_proposta_itens
  for all to authenticated
  using (public.pode_gerir_cotacoes())
  with check (public.pode_gerir_cotacoes());

grant select, insert, update, delete on public.cotacao_proposta_itens to authenticated;
