-- Módulo de Análise de Cotações — tabelas de lote, itens canônicos, propostas
-- de fornecedor, linhas extraídas, decisão de compra e histórico de preços.
--
-- Contexto: a Central de Compras (sup_central_compras) termina no envio da
-- carta convite; o que volta do fornecedor (PDF convertido para markdown pelo
-- comprador) não tinha para onde ir. Este módulo fecha o ciclo: o comprador
-- cola as propostas, a Edge Function `estruturar-cotacao` extrai e sugere
-- vínculo com os itens da RM, o comprador confirma/troca, e sai um mapa
-- item × fornecedor com decisão registrada.
--
-- Convenções seguidas (ver documentos/BD.md): snake_case, RLS ligada com
-- policy `for all to authenticated` (padrão de fbl1n_c_pagar/contratos_detalhes),
-- `create table if not exists`, comentário de cabeçalho explicando o porquê.

-- ============================================================================
-- cotacao_lote — a cotação como um todo (uma rodada de RFQ a N fornecedores)
-- ============================================================================
create table if not exists public.cotacao_lote (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  titulo text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'aguardando_propostas', 'em_analise', 'decidido', 'cancelado')),
  criado_por text,
  criado_por_nome text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cotacao_lote_status on public.cotacao_lote (status);

-- ============================================================================
-- cotacao_item — item canônico do lote: a chave que a IA tenta vincular.
-- Semeado a partir dos itens de RM selecionados na Central de Compras
-- (EnrichedSAPRecord); aceita item avulso sem RM (ri nulo).
-- ============================================================================
create table if not exists public.cotacao_item (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.cotacao_lote(id) on delete cascade,
  ordem int not null default 0,
  ri text,
  rm text,
  item_reqc text,
  material_code text,
  descricao_canonica text not null,
  texto_tecnico text,
  -- SKU/modelo/referência do item pedido, quando conhecido — chave de vínculo
  -- mais forte que a descrição (fornecedores descrevem o mesmo produto de
  -- formas irreconhecíveis entre si, mas a referência costuma bater).
  referencia text,
  unidade text,
  quantidade numeric
);

create index if not exists idx_cotacao_item_lote on public.cotacao_item (lote_id);
create index if not exists idx_cotacao_item_material_code on public.cotacao_item (material_code);

-- ============================================================================
-- cotacao_proposta — uma proposta de fornecedor dentro do lote.
-- markdown_bruto é sempre guardado: sem ele não há re-extração quando o
-- prompt melhorar, nem auditoria do que a IA leu.
-- ============================================================================
create table if not exists public.cotacao_proposta (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.cotacao_lote(id) on delete cascade,
  cod_forn text,
  cnpj text,
  fornecedor_nome text,
  uf text,
  numero_proposta text,
  data_cotacao date,
  validade_texto text,
  validade_data date,
  condicao_pagamento_texto text,
  ddp_codigo text references public.ddp(ddp),
  ddp_confirmado boolean not null default false,
  -- "a combinar" não tem código DDP: fica pendente com alerta na tela até o
  -- comprador confirmar a condição com o fornecedor.
  ddp_pendente boolean not null default false,
  frete_texto text,
  frete_valor numeric,
  frete_modalidade text,
  faturamento_minimo numeric,
  prazo_entrega_texto text,
  notas_gerais text[] not null default '{}',
  -- Conferência aritmética (soma dos itens × total declarado no documento) —
  -- ver validacao.ts. Não bloqueia a extração, só sinaliza.
  total_declarado numeric,
  total_calculado numeric,
  itens_declarados int,
  validacao_status text not null default 'nao_declarado'
    check (validacao_status in ('ok', 'divergente', 'nao_declarado')),
  validacao_detalhe text,
  markdown_bruto text,
  extracao_json jsonb,
  extracao_modelo text,
  extracao_status text not null default 'pendente'
    check (extracao_status in ('pendente', 'processando', 'extraido', 'erro')),
  extracao_tentativas int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_cotacao_proposta_lote on public.cotacao_proposta (lote_id);

-- ============================================================================
-- cotacao_proposta_item — cada linha extraída de uma proposta.
-- numero_item_original preserva o rótulo literal do documento (lacunas são
-- esperadas — nunca renumerar). cotacao_item_id é o vínculo confirmado.
-- ============================================================================
create table if not exists public.cotacao_proposta_item (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.cotacao_proposta(id) on delete cascade,
  cotacao_item_id uuid references public.cotacao_item(id) on delete set null,
  numero_item_original text,
  linha_ordem int not null default 0,
  codigo_fornecedor text,
  descricao_bruta text not null,
  referencia text,
  referencia_normalizada text,
  marca text,
  unidade text,
  quantidade numeric,
  preco_unitario_bruto numeric,
  desconto_valor numeric,
  desconto_percentual numeric,
  subtotal numeric,
  -- Preço unitário efetivo = subtotal / quantidade quando houver subtotal;
  -- nunca o preço cheio. Calculado em TS (calculo.ts), não pela IA.
  preco_unitario_efetivo numeric,
  custo_total_unitario numeric,
  -- Fiscais
  ipi_percentual numeric,
  ipi_valor numeric,
  icms_percentual numeric,
  icms_reducao_percentual numeric,
  st_percentual numeric,
  st_valor numeric,
  fcp_valor numeric,
  pis_percentual numeric,
  cofins_percentual numeric,
  ncm text,
  cst text,
  cfop text,
  imposto_codigo text references public.impostos(incoterms),
  imposto_confirmado boolean not null default false,
  disponibilidade_texto text,
  prazo_entrega_texto text,
  observacoes text,
  confianca_extracao numeric,
  match_confianca numeric,
  vinculo_origem text not null default 'nenhum'
    check (vinculo_origem in ('referencia', 'ia', 'usuario', 'nenhum')),
  -- Fornecedor cotou produto parecido mas diferente (modelo/medida/potência):
  -- o item entra vinculado e marcado, mas não é sugerido vencedor automático.
  divergente boolean not null default false,
  divergencia_atributo text,
  divergencia_detalhe text,
  validacao_item_ok boolean not null default true
);

create index if not exists idx_cotacao_proposta_item_proposta on public.cotacao_proposta_item (proposta_id);
create index if not exists idx_cotacao_proposta_item_cotacao_item on public.cotacao_proposta_item (cotacao_item_id);
create index if not exists idx_cotacao_proposta_item_referencia_norm on public.cotacao_proposta_item (referencia_normalizada);

-- ============================================================================
-- cotacao_decisao — adjudicação. Sem unique em cotacao_item_id: permite
-- dividir um item entre fornecedores.
-- ============================================================================
create table if not exists public.cotacao_decisao (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.cotacao_lote(id) on delete cascade,
  cotacao_item_id uuid not null references public.cotacao_item(id) on delete cascade,
  proposta_item_id uuid not null references public.cotacao_proposta_item(id) on delete cascade,
  quantidade_adjudicada numeric,
  eh_menor_preco boolean not null default false,
  aceita_divergencia boolean not null default false,
  -- Obrigatória quando não é o menor preço ou é um item divergente — reforçado
  -- na UI, não no banco (o formulário bloqueia o confirmar sem justificativa).
  justificativa text,
  decidido_por text,
  decidido_por_nome text,
  decidido_em timestamptz not null default now()
);

create index if not exists idx_cotacao_decisao_lote on public.cotacao_decisao (lote_id);
create index if not exists idx_cotacao_decisao_item on public.cotacao_decisao (cotacao_item_id);

-- ============================================================================
-- cotacao_preco_historico — base de preços por material/data/fornecedor.
-- Populada por trigger quando o lote passa a 'decidido', para TODAS as
-- propostas (não só a vencedora) — a dispersão de preços é o dado mais útil
-- para negociar depois. Índice pensado para consulta "evolução deste
-- material ao longo do tempo".
-- ============================================================================
create table if not exists public.cotacao_preco_historico (
  id uuid primary key default gen_random_uuid(),
  material_code text,
  descricao text,
  referencia text,
  cod_forn text,
  fornecedor_nome text,
  data_cotacao date,
  unidade text,
  quantidade numeric,
  preco_unitario_efetivo numeric,
  custo_total_unitario numeric,
  lote_id uuid references public.cotacao_lote(id) on delete set null,
  proposta_item_id uuid references public.cotacao_proposta_item(id) on delete set null,
  foi_vencedor boolean not null default false,
  foi_divergente boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_cotacao_preco_historico_material_data
  on public.cotacao_preco_historico (material_code, data_cotacao desc);

-- ============================================================================
-- Trigger: ao fechar o lote (status -> 'decidido'), grava o histórico de
-- preços para todos os itens de proposta que têm vínculo confirmado com um
-- cotacao_item que carregue material_code.
-- ============================================================================
create or replace function public.gravar_historico_precos_cotacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'decidido' and (old.status is distinct from 'decidido') then
    insert into public.cotacao_preco_historico (
      material_code, descricao, referencia, cod_forn, fornecedor_nome,
      data_cotacao, unidade, quantidade, preco_unitario_efetivo,
      custo_total_unitario, lote_id, proposta_item_id, foi_vencedor, foi_divergente
    )
    select
      ci.material_code,
      ci.descricao_canonica,
      cpi.referencia,
      cp.cod_forn,
      cp.fornecedor_nome,
      coalesce(cp.data_cotacao, current_date),
      cpi.unidade,
      cpi.quantidade,
      cpi.preco_unitario_efetivo,
      cpi.custo_total_unitario,
      new.id,
      cpi.id,
      exists (
        select 1 from public.cotacao_decisao cd
        where cd.proposta_item_id = cpi.id and cd.cotacao_item_id = ci.id
      ),
      cpi.divergente
    from public.cotacao_proposta_item cpi
    join public.cotacao_proposta cp on cp.id = cpi.proposta_id
    join public.cotacao_item ci on ci.id = cpi.cotacao_item_id
    where cp.lote_id = new.id
      and ci.material_code is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gravar_historico_precos_cotacao on public.cotacao_lote;
create trigger trg_gravar_historico_precos_cotacao
  after update on public.cotacao_lote
  for each row
  execute function public.gravar_historico_precos_cotacao();

-- ============================================================================
-- Numeração automática do lote (COT-AAAA-NNNN), reaproveitando o padrão de
-- contador atômico já usado por `sequences` para solicitações.
-- ============================================================================
create or replace function public.proximo_numero_cotacao()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chave text := 'cotacao_' || to_char(now(), 'YYYY');
  proximo int;
begin
  insert into public.sequences (key, value)
  values (chave, 1)
  on conflict (key) do update set value = public.sequences.value + 1
  returning value into proximo;

  return 'COT-' || to_char(now(), 'YYYY') || '-' || lpad(proximo::text, 4, '0');
end;
$$;

-- ============================================================================
-- RLS — ligada em todas, policy permissiva para authenticated (padrão de
-- fbl1n_c_pagar/contratos_detalhes/contrato_anexos: o app inteiro roda sob a
-- anon key hoje, autorização real é feita em src/lib/pages.ts).
-- ============================================================================
alter table public.cotacao_lote enable row level security;
alter table public.cotacao_item enable row level security;
alter table public.cotacao_proposta enable row level security;
alter table public.cotacao_proposta_item enable row level security;
alter table public.cotacao_decisao enable row level security;
alter table public.cotacao_preco_historico enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cotacao_lote' and policyname = 'cotacao_lote_authenticated_all') then
    create policy cotacao_lote_authenticated_all on public.cotacao_lote for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cotacao_item' and policyname = 'cotacao_item_authenticated_all') then
    create policy cotacao_item_authenticated_all on public.cotacao_item for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cotacao_proposta' and policyname = 'cotacao_proposta_authenticated_all') then
    create policy cotacao_proposta_authenticated_all on public.cotacao_proposta for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cotacao_proposta_item' and policyname = 'cotacao_proposta_item_authenticated_all') then
    create policy cotacao_proposta_item_authenticated_all on public.cotacao_proposta_item for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cotacao_decisao' and policyname = 'cotacao_decisao_authenticated_all') then
    create policy cotacao_decisao_authenticated_all on public.cotacao_decisao for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cotacao_preco_historico' and policyname = 'cotacao_preco_historico_authenticated_all') then
    create policy cotacao_preco_historico_authenticated_all on public.cotacao_preco_historico for all to authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.cotacao_lote to authenticated;
grant select, insert, update, delete on public.cotacao_item to authenticated;
grant select, insert, update, delete on public.cotacao_proposta to authenticated;
grant select, insert, update, delete on public.cotacao_proposta_item to authenticated;
grant select, insert, update, delete on public.cotacao_decisao to authenticated;
grant select, insert, update, delete on public.cotacao_preco_historico to authenticated;
grant execute on function public.proximo_numero_cotacao() to authenticated;
