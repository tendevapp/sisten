-- =====================================================================
-- Almoxarifado > Projetos — razão único de movimento e posição de estoque
--
-- Uma tabela só, com a quantidade ASSINADA (+ entrada, - saída), em vez das
-- colunas ENTRADA e SAÍDA separadas da planilha. Foi essa separação que
-- obrigou o PROCV cruzado entre abas e produziu os `#VALOR!` e as descrições
-- deslocadas que se vê na planilha atual: saldo = sum(quantidade), ponto.
-- =====================================================================

create table if not exists public.proj_movimentos (
  id uuid primary key default gen_random_uuid(),
  projeto text not null default 'GW_JACOBINA',
  tipo text not null check (tipo in ('entrada_nf','saida_premontagem','retorno_premontagem','saida_sobressalente','ajuste')),
  item_id uuid not null references public.proj_itens (id),
  quantidade numeric not null check (quantidade <> 0),
  documento_tipo text,
  documento_id uuid,
  documento_codigo text,
  secao text,
  tramo text,
  tramo_unidade_id text references public.proj_tramos_gwjaco (id),
  -- Guarda qual linha da BOM gerou o crédito, para auditar a explosão da NF.
  bom_linha_id bigint,
  origem_pai_pn text,
  observacao text,
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now()
);

create index if not exists idx_proj_mov_item on public.proj_movimentos (projeto, item_id) where not excluido;
create index if not exists idx_proj_mov_documento on public.proj_movimentos (documento_id);
create index if not exists idx_proj_mov_data on public.proj_movimentos (created_at desc);
create index if not exists idx_proj_mov_tipo on public.proj_movimentos (projeto, tipo, created_at desc);

comment on table public.proj_movimentos is
  'Razao unico do almoxarifado de projetos. Quantidade com sinal: + entrada, - saida. Saldo = sum(quantidade).';

create or replace view public.vw_proj_saldo_almox
with (security_invoker = true) as
select
  i.projeto,
  i.id as item_id,
  i.part_number,
  i.part_number_norm,
  i.cod_sap,
  i.descricao,
  i.description,
  i.fornecedor,
  i.uom,
  i.localizador,
  i.estoque_minimo,
  coalesce(sum(m.quantidade) filter (where m.quantidade > 0), 0) as entradas,
  coalesce(-sum(m.quantidade) filter (where m.quantidade < 0), 0) as saidas,
  coalesce(sum(m.quantidade) filter (where m.tipo = 'saida_sobressalente'), 0) * -1 as refugo,
  coalesce(sum(m.quantidade), 0) as saldo
from public.proj_itens i
left join public.proj_movimentos m
  on m.item_id = i.id and not m.excluido
group by i.projeto, i.id, i.part_number, i.part_number_norm, i.cod_sap, i.descricao,
         i.description, i.fornecedor, i.uom, i.localizador, i.estoque_minimo;

comment on view public.vw_proj_saldo_almox is
  'Posicao do almoxarifado central por item. Substitui a aba consolidada da planilha (que aceitava saldo negativo).';

grant select, insert, update, delete on public.proj_movimentos to anon, authenticated, service_role;
grant select on public.vw_proj_saldo_almox to anon, authenticated, service_role;

alter table public.proj_movimentos enable row level security;

drop policy if exists "proj_movimentos_all" on public.proj_movimentos;
create policy "proj_movimentos_all" on public.proj_movimentos for all using (true) with check (true);
