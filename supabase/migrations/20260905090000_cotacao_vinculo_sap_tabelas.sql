-- =====================================================================
-- Vínculo item cotado → material SAP: tabelas
--
-- A base de cotações (`sup_cotacao_propostas` / `sup_cotacao_proposta_itens`)
-- nasce sem código SAP: o fornecedor manda a proposta com a descrição dele e
-- o código dele. Antes desta migration eram 601 itens com `material_code`
-- nulo em 100% das linhas. Sem esse vínculo, o histórico de preço não
-- conversa com o catálogo e não dá para auditar se o pedido saiu igual à
-- cotação.
--
-- A evidência que fecha essa conta já existe no banco: o pedido colocado
-- (`sap_zl0132_po`) tem, na mesma linha, o CNPJ do fornecedor, o preço
-- unitário, a quantidade e o material SAP. Quando o preço e a descrição de um
-- item cotado batem com um item de pedido do mesmo fornecedor na janela de
-- tempo seguinte, o material daquele pedido é o material do item cotado.
--
-- Três tabelas:
--   * `sup_cotacao_item_vinculos`   — um vínculo por item cotado, com a
--     evidência do pedido que o sustenta e os candidatos descartados;
--   * `sup_cotacao_vinculo_rodadas` — cada execução do casamento, para o
--     processo ser repetível e auditável (o que a rodada de ontem decidiu);
--   * `ops_ia_prompts`              — prompt/modelo das análises por IA,
--     editável em Gestão de APIs sem deploy de Edge Function.
-- =====================================================================

-- ---------------------------------------------------------------- rodadas
create table if not exists public.sup_cotacao_vinculo_rodadas (
  id uuid primary key default gen_random_uuid(),
  -- 'deterministico' = casamento por preço/texto/quantidade contra os pedidos;
  -- 'ia' = análise de conteúdo dos itens que sobraram sem candidato.
  tipo text not null check (tipo in ('deterministico', 'ia')),
  parametros jsonb not null default '{}'::jsonb,
  itens_analisados integer not null default 0,
  vinculos_auto integer not null default 0,
  sugestoes integer not null default 0,
  sem_candidato integer not null default 0,
  executado_por text references public.core_perfis(id),
  executado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cot_vinc_rodadas_created
  on public.sup_cotacao_vinculo_rodadas (created_at desc);

-- ---------------------------------------------------------------- vínculos
create table if not exists public.sup_cotacao_item_vinculos (
  id uuid primary key default gen_random_uuid(),
  proposta_item_id uuid not null unique
    references public.sup_cotacao_proposta_itens(id) on delete cascade,

  material_code text,
  -- Snapshot da descrição do catálogo no momento do vínculo: o catálogo SAP é
  -- reimportado e reescrito, e a auditoria precisa saber o que se via na hora.
  material_descricao text,

  -- auto          → o casamento gravou sozinho (score alto, preço batendo);
  -- sugerido      → esperando curadoria;
  -- confirmado    → alguém confirmou na tela;
  -- rejeitado     → alguém disse que não é esse material;
  -- sem_candidato → nenhum pedido plausível; é a fila da análise por IA.
  status text not null default 'sugerido'
    check (status in ('auto', 'sugerido', 'confirmado', 'rejeitado', 'sem_candidato')),
  -- De onde veio a proposta de vínculo: casamento com pedido, mapa aprendido,
  -- análise por IA ou escolha manual do comprador.
  origem text not null default 'pedido'
    check (origem in ('pedido', 'aprendido', 'ia', 'manual')),

  score numeric,
  -- Nota de cada sinal isolado ({preco, texto, qtd, data, ri}), para a tela
  -- explicar por que aquele material foi sugerido.
  sinais jsonb not null default '{}'::jsonb,
  -- Alternativas descartadas, em ordem de score: a curadoria troca por uma
  -- delas em um clique, sem refazer a busca.
  candidatos jsonb not null default '[]'::jsonb,

  -- Evidência: a linha de pedido que sustenta o vínculo.
  po_doc_compra text,
  po_item text,
  po_data_doc date,
  po_material text,
  po_txt_breve text,
  po_preco_unit numeric,
  po_qtd numeric,
  po_ri text,
  po_cnpj text,

  rodada_id uuid references public.sup_cotacao_vinculo_rodadas(id) on delete set null,
  confirmado_por text references public.core_perfis(id),
  confirmado_por_nome text,
  confirmado_em timestamptz,
  observacao text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cot_vinc_status on public.sup_cotacao_item_vinculos (status);
create index if not exists idx_cot_vinc_material on public.sup_cotacao_item_vinculos (material_code);
create index if not exists idx_cot_vinc_rodada on public.sup_cotacao_item_vinculos (rodada_id);

alter table public.sup_cotacao_vinculo_rodadas enable row level security;
alter table public.sup_cotacao_item_vinculos enable row level security;

-- Mesmo gate das demais tabelas de cotação: quem pode gerir cotação pode
-- gerir o vínculo (admin, comprador, coordenador de suprimentos).
drop policy if exists cot_vinc_rodadas_all on public.sup_cotacao_vinculo_rodadas;
create policy cot_vinc_rodadas_all on public.sup_cotacao_vinculo_rodadas
  for all to authenticated
  using (public.pode_gerir_cotacoes())
  with check (public.pode_gerir_cotacoes());

drop policy if exists cot_vinc_itens_all on public.sup_cotacao_item_vinculos;
create policy cot_vinc_itens_all on public.sup_cotacao_item_vinculos
  for all to authenticated
  using (public.pode_gerir_cotacoes())
  with check (public.pode_gerir_cotacoes());

grant select, insert, update, delete on public.sup_cotacao_vinculo_rodadas to authenticated;
grant select, insert, update, delete on public.sup_cotacao_item_vinculos to authenticated;

-- ------------------------------------------------------------ prompts de IA
-- Os prompts das Edge Functions existentes (`extrair-cotacao`,
-- `converter-markdown-ia`) são constantes no código: melhorar a instrução
-- exige redeploy. Esta tabela tira o prompt do deploy — a Edge Function lê a
-- linha ativa e cai no texto embutido se a tabela estiver vazia ou fora do ar.
create table if not exists public.ops_ia_prompts (
  chave text primary key,
  titulo text not null,
  descricao text,
  modelo text,
  prompt text not null,
  -- temperatura, max_tokens e afins; a Edge Function decide o que respeita.
  parametros jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  -- Incrementa a cada gravação: o log de uso guarda a versão que rodou.
  versao integer not null default 1,
  atualizado_por text references public.core_perfis(id),
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ops_ia_prompts enable row level security;

drop policy if exists ops_ia_prompts_leitura on public.ops_ia_prompts;
create policy ops_ia_prompts_leitura on public.ops_ia_prompts
  for select to authenticated using (true);

-- Escrita só para administrador: o prompt define o que a IA faz com dado de
-- compra, e a tela que o edita já vive dentro do Painel Administrativo.
drop policy if exists ops_ia_prompts_escrita on public.ops_ia_prompts;
create policy ops_ia_prompts_escrita on public.ops_ia_prompts
  for all to authenticated
  using (exists (
    select 1 from public.core_perfis p
    where p.id = (select auth.uid())::text and p.roles && array['admin']
  ))
  with check (exists (
    select 1 from public.core_perfis p
    where p.id = (select auth.uid())::text and p.roles && array['admin']
  ));

grant select, insert, update on public.ops_ia_prompts to authenticated;
