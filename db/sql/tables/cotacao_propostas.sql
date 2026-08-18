-- =====================================================================
-- Cabeçalho de uma proposta/orçamento recebido de um fornecedor.
-- Um paste de markdown pode conter várias (a IA sempre devolve array),
-- por isso 1 processo -> N propostas.
--
-- Convenções:
--  - dinheiro e percentual em numeric (nunca float, nunca texto);
--  - campo que a IA não conseguiu extrair fica NULL (nunca '' nem 0):
--    0 é preço legítimo e '' estragaria a métrica de completude;
--  - extraido_raw guarda as strings originais da IA, para auditar e
--    reprocessar um parse errado sem pagar o LLM de novo.
-- =====================================================================

create table if not exists public.cotacao_propostas (
  id                            uuid primary key default gen_random_uuid(),
  processo_id                   uuid not null references public.cotacao_processos(id) on delete cascade,

  -- Origem / identificação
  arquivo_origem                text,
  numero_proposta               text,
  data_emissao                  date,
  validade_data                 date,
  validade_texto                text,

  -- Fornecedor
  fornecedor_razao_social       text,
  fornecedor_cnpj               text,
  fornecedor_inscricao_estadual text,
  fornecedor_cidade             text,
  fornecedor_uf                 text,
  fornecedor_telefone           text,

  -- Vínculo com o cadastro (public.contatos). NULL = fornecedor desconhecido.
  cod_vendor                    text,
  contato_id                    uuid references public.contatos(id),
  fornecedor_match              text not null default 'nao_encontrado'
                                  check (fornecedor_match in ('cnpj', 'manual', 'nao_encontrado')),

  -- Vendedor
  vendedor_nome                 text,
  vendedor_email                text,
  vendedor_telefone             text,

  -- Cliente (nós)
  cliente_razao_social          text,
  cliente_cnpj                  text,
  cliente_inscricao_estadual    text,
  cliente_cidade                text,
  cliente_uf                    text,

  -- Comerciais
  condicao_pagamento            text,
  forma_pagamento               text,
  prazo_entrega_texto           text,
  prazo_entrega_dias            int,
  frete_modalidade              text
                                  check (frete_modalidade is null
                                         or frete_modalidade in ('CIF','FOB','OUTRO')),
  transportadora_indicada       text,
  faturamento_minimo            numeric(15,2),
  dados_bancarios_pix           text,
  valor_total_orcamento         numeric(15,2),
  observacoes_gerais            text,

  -- Qualidade da extração
  campos_faltantes              text[] not null default '{}',
  revisado                      boolean not null default false,
  extracao_id                   uuid references public.cotacao_extracoes(id),
  extraido_raw                  jsonb,

  criado_por                    text references public.profiles(id),
  criado_por_nome               text not null,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint cotacao_propostas_cnpj_digitos
    check (fornecedor_cnpj is null or fornecedor_cnpj ~ '^\d{14}$')
);

create index if not exists cotacao_propostas_processo_idx
  on public.cotacao_propostas (processo_id);
create index if not exists cotacao_propostas_cnpj_idx
  on public.cotacao_propostas (fornecedor_cnpj);
create index if not exists cotacao_propostas_cod_vendor_idx
  on public.cotacao_propostas (cod_vendor);
create index if not exists cotacao_propostas_emissao_idx
  on public.cotacao_propostas (data_emissao desc);

alter table public.cotacao_propostas enable row level security;
revoke all on public.cotacao_propostas from anon;

drop policy if exists cotacao_propostas_rw on public.cotacao_propostas;
create policy cotacao_propostas_rw on public.cotacao_propostas
  for all to authenticated
  using (public.pode_gerir_cotacoes())
  with check (public.pode_gerir_cotacoes());

grant select, insert, update, delete on public.cotacao_propostas to authenticated;
