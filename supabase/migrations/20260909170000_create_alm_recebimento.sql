-- =====================================================================
-- Almoxarifado > Recebimento de material — os dois formulários da doca.
--
--   F1  alm_receb_cargas        — FICHA CEGA por volumes + foto consolidada
--                                 da carga como chegou da transportadora.
--   F2  alm_receb_conferencias  — recebimento e contagem item a item contra
--                                 o Pedido de Compras (PO), foto e observação.
--       alm_receb_conferencia_itens
--       alm_receb_nc            — não conformidade consolidada (1 por
--                                 conferência) quando há divergência.
--
-- Um fluxo, dois momentos físicos e duas pessoas: F1 é a doca (conta caixa,
-- fotografa, assina o canhoto sem abrir volume); F2 é a bancada (abre o PO,
-- confere quantidade). O vínculo `carga_id` é OPCIONAL nos dois sentidos —
-- dá para conferir um PO sem ficha cega prévia e registrar uma carga que só
-- será conferida dias depois.
--
-- Serve item de PROJETO (material 100000…) e de CONSUMO no mesmo formulário:
-- a diferença mora só no encaminhamento pós-conferência (projeto pode seguir
-- para a entrada de NF com explosão de BOM, no módulo Projetos).
--
-- Código dos registros: `MODULO-DDMMYY-INDICE` (regra 2 do CLAUDE.md), com o
-- índice reiniciando POR DIA — a doca recebe várias cargas por dia e um
-- sequencial mensal chegaria a três dígitos sem dizer nada a quem procura
-- "a segunda carga de hoje". Prefixos: RCV (carga/volumes), RCM (contagem),
-- NCR (não conformidade). A geração fica na RPC (migration ..._rpcs), que
-- lê os códigos do próprio dia e ignora a sugestão do cliente — dois
-- celulares que ficaram offline e voltam juntos não colidem, e o `unique`
-- abaixo é a rede final.
-- =====================================================================

-- F1 — Ficha cega de volumes -------------------------------------------------
create table if not exists public.alm_receb_cargas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  data date not null,
  hora time,
  transportadora text not null,
  veiculo_placa text,
  motorista text,
  -- CT-e, romaneio da transportadora ou nº do canhoto assinado.
  doc_transporte text,
  nota_fiscal text,
  -- PO, quando já se sabe na doca. Só um facilitador para o F2 — nada trava.
  nro_pedido text,
  -- O que o documento/transportador DECLARA vs. o que o conferente CONTOU.
  -- A UI mostra a declarada só depois de digitar a contada (contagem cega).
  qtd_volumes_declarada integer,
  qtd_volumes_contada integer not null,
  tipo_embalagem text check (tipo_embalagem in ('caixa','pallet','fardo','amarrado','avulso','misto')),
  lacre_integro boolean,
  avaria_aparente boolean not null default false,
  avaria_descricao text,
  peso_declarado numeric,
  destino_previsto text not null default 'indefinido'
    check (destino_previsto in ('projeto','consumo','misto','indefinido')),
  -- [{path, nome, tipo}] no bucket alm-recebimento. Foto obrigatória (>=1),
  -- validada no app; sobe comprimida (regra 1 do CLAUDE.md).
  evidencias jsonb not null default '[]'::jsonb,
  observacao text,
  -- contada <> declarada  OU  avaria_aparente. Calculado na RPC.
  divergencia boolean not null default false,
  status text not null default 'recebida'
    check (status in ('recebida','em_conferencia','conferida','divergente')),
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now()
);

create index if not exists idx_alm_receb_cargas_data on public.alm_receb_cargas (data desc) where not excluido;
create index if not exists idx_alm_receb_cargas_status on public.alm_receb_cargas (status) where not excluido;
create index if not exists idx_alm_receb_cargas_pedido on public.alm_receb_cargas (nro_pedido) where nro_pedido is not null and not excluido;

-- F2 — Recebimento e contagem ---------------------------------------------------
create table if not exists public.alm_receb_conferencias (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  data date not null,
  carga_id uuid references public.alm_receb_cargas (id),
  -- PO conferido. Nulo quando o material chegou sem pedido rastreável.
  nro_pedido text,
  fornecedor text,
  rm text,
  tipo_item text not null default 'consumo' check (tipo_item in ('projeto','consumo','misto')),
  -- Destino físico: depósito, localizador ou zona de pré-montagem.
  deposito text,
  -- Contingência: de onde veio a lista do PO conferida.
  --   cache_sap  — dataset ZL0132 já sincronizado no aparelho (funciona offline)
  --   supabase   — consulta direta a sap_zl0132_po (aparelho sem cache)
  --   manual     — conferente digitou as linhas à mão
  --   sem_pedido — recebimento sem PO
  fonte_pedido text not null default 'cache_sap'
    check (fonte_pedido in ('cache_sap','supabase','manual','sem_pedido')),
  total_itens integer not null default 0,
  itens_ok integer not null default 0,
  itens_divergentes integer not null default 0,
  tem_nc boolean not null default false,
  -- Marcado quando as linhas de projeto foram encaminhadas ao módulo Projetos
  -- (entrada de NF / explosão de BOM). Evita perder o handoff de vista.
  encaminhado_projetos boolean not null default false,
  evidencias jsonb not null default '[]'::jsonb,
  observacao text,
  status text not null default 'concluida' check (status in ('rascunho','concluida')),
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now()
);

create index if not exists idx_alm_receb_conf_data on public.alm_receb_conferencias (data desc) where not excluido;
create index if not exists idx_alm_receb_conf_pedido on public.alm_receb_conferencias (nro_pedido) where nro_pedido is not null and not excluido;
create index if not exists idx_alm_receb_conf_carga on public.alm_receb_conferencias (carga_id) where carga_id is not null;

-- Romaneio congelado: o que a linha do PO dizia NO MOMENTO da conferência,
-- ao lado do que o conferente contou. Guardado à parte para a conferência
-- continuar auditável mesmo que a ZL0132 mude depois.
create table if not exists public.alm_receb_conferencia_itens (
  id uuid primary key default gen_random_uuid(),
  conferencia_id uuid not null references public.alm_receb_conferencias (id) on delete cascade,
  -- ri_po da linha do EnrichedSAP quando veio de lista; nulo em item manual.
  linha_ref text,
  material_code text,
  descricao text,
  unidade text,
  qtd_pedido numeric,
  qtd_ja_fornecida numeric,
  qtd_recebida numeric not null default 0,
  conferido boolean not null default false,
  divergencia boolean not null default false,
  tipo_divergencia text
    check (tipo_divergencia in ('falta','excedente','avaria','material_errado','sem_pedido')),
  item_manual boolean not null default false,
  observacao text,
  evidencias jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_alm_receb_conf_itens_conf on public.alm_receb_conferencia_itens (conferencia_id);

-- Não conformidade consolidada — uma por conferência, com o resumo dos itens
-- divergentes e as fotos. É o que se cobra do fornecedor / da transportadora.
create table if not exists public.alm_receb_nc (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  conferencia_id uuid references public.alm_receb_conferencias (id) on delete set null,
  carga_id uuid references public.alm_receb_cargas (id) on delete set null,
  nro_pedido text,
  fornecedor text,
  tipo text not null
    check (tipo in ('falta','excedente','avaria','material_errado','sem_pedido','volume','outros')),
  severidade text not null default 'media' check (severidade in ('baixa','media','alta')),
  descricao text not null,
  -- [{material_code, descricao, qtd_pedido, qtd_recebida, tipo_divergencia}]
  itens_resumo jsonb not null default '[]'::jsonb,
  evidencias jsonb not null default '[]'::jsonb,
  status text not null default 'aberta' check (status in ('aberta','em_tratativa','resolvida')),
  responsavel text,
  resolucao text,
  resolvida_em timestamptz,
  criado_por_id uuid,
  criado_por_nome text,
  excluido boolean not null default false,
  excluido_em timestamptz,
  excluido_por text,
  created_at timestamptz not null default now()
);

create index if not exists idx_alm_receb_nc_status on public.alm_receb_nc (status) where not excluido;
create index if not exists idx_alm_receb_nc_conf on public.alm_receb_nc (conferencia_id) where conferencia_id is not null;

-- Grants + RLS — mesmo padrão do módulo Projetos: acesso pela chave anon do
-- bundle, política aberta, exclusão é lógica.
grant select, insert, update, delete on public.alm_receb_cargas to anon, authenticated, service_role;
grant select, insert, update, delete on public.alm_receb_conferencias to anon, authenticated, service_role;
grant select, insert, update, delete on public.alm_receb_conferencia_itens to anon, authenticated, service_role;
grant select, insert, update, delete on public.alm_receb_nc to anon, authenticated, service_role;

alter table public.alm_receb_cargas enable row level security;
alter table public.alm_receb_conferencias enable row level security;
alter table public.alm_receb_conferencia_itens enable row level security;
alter table public.alm_receb_nc enable row level security;

drop policy if exists "alm_receb_cargas_all" on public.alm_receb_cargas;
create policy "alm_receb_cargas_all" on public.alm_receb_cargas for all using (true) with check (true);
drop policy if exists "alm_receb_conferencias_all" on public.alm_receb_conferencias;
create policy "alm_receb_conferencias_all" on public.alm_receb_conferencias for all using (true) with check (true);
drop policy if exists "alm_receb_conferencia_itens_all" on public.alm_receb_conferencia_itens;
create policy "alm_receb_conferencia_itens_all" on public.alm_receb_conferencia_itens for all using (true) with check (true);
drop policy if exists "alm_receb_nc_all" on public.alm_receb_nc;
create policy "alm_receb_nc_all" on public.alm_receb_nc for all using (true) with check (true);
