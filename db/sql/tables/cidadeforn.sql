-- =====================================================================
-- Tabela: cidadeforn
-- Descrição: Registro de endereço / localização dos fornecedores
-- Colunas:
--   Fornecedor          -> forn_codigo (Código/Identificador)
--   Nome do fornecedor  -> forn_nome
--   Rua                 -> rua
--   País                -> pais
--   Código postal       -> codigo_postal
--   Local               -> localidade
--   Estado/UF           -> estado_uf (UF brasileira, 2 letras; populado pela ZL0132)
-- =====================================================================

create table if not exists public.cidadeforn (
  id uuid primary key default gen_random_uuid(),
  forn_codigo text not null unique,
  forn_nome text,
  rua text,
  pais text,
  codigo_postal text,
  localidade text,
  -- UF do fornecedor brasileiro (ex: 'SP', 'BA').
  -- Populado automaticamente na importacao da ZL0132, coluna 'Rg'.
  -- So armazena valores de 2 letras (UF valida); codigos numericos de
  -- regioes estrangeiras sao ignorados.
  estado_uf text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adiciona a coluna em tabelas ja existentes (idempotente — nao falha se ja existir).
alter table public.cidadeforn add column if not exists estado_uf text;

-- Índices para buscas performáticas por fornecedor
create index if not exists idx_cidadeforn_codigo on public.cidadeforn (forn_codigo);
create index if not exists idx_cidadeforn_nome on public.cidadeforn (forn_nome);

-- Desativa RLS para permitir inserções/consultas diretas via cliente Supabase (anon/authenticated)
alter table public.cidadeforn disable row level security;

-- Permissões de permissão de acesso à tabela
grant select, insert, update, delete on public.cidadeforn to anon, authenticated, service_role;

-- Insert dos dados de fornecedores (exemplo)
insert into public.cidadeforn (forn_codigo, forn_nome, rua, pais, codigo_postal, localidade)
values
  ('1000000084', 'Agcomex Comercial Exportadora, Lda', 'R. Dr. Geraldo Campos Moreira, 375', 'BR', '04571-020', 'SAO PAULO'),
  ('1000000106', 'Aguiar & Silva, Lda', 'Rua Juvenal F. Pestana, 10', 'PT', '9350-219', 'Ribeira Brava'),
  ('1000000113', 'Air Liquide Soldadura, Lda', 'Rua Dr. Loureiro Borges 4-2', 'PT', '1495-131', 'Alges')
on conflict (forn_codigo) do update set
  forn_nome = excluded.forn_nome,
  rua = excluded.rua,
  pais = excluded.pais,
  codigo_postal = excluded.codigo_postal,
  localidade = excluded.localidade,
  updated_at = now();


