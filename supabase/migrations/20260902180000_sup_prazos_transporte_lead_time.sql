-- =====================================================================
-- Suprimentos — Lead time de entregas por UF de origem.
--
-- Cria (se ainda não existir) `sup_prazos_transporte` — a mesma tabela já
-- descrita em db/sql/tables/sup_prazos_transporte.sql, usada no
-- Diligenciamento — e a semeia com o prazo padrão por UF:
--   previsão de entrega = data de remessa + `dias_corridos` (dias corridos).
--
-- A linha (uf, transportadora='') é o padrão da UF, editável em
-- "Admin > Cadastros Gerais > Suprimentos". A linha ('', '') é o padrão
-- global (UF não cadastrada).
-- =====================================================================

create table if not exists public.sup_prazos_transporte (
  id uuid primary key default gen_random_uuid(),
  uf text not null default '',
  transportadora text not null default '',
  dias_corridos integer not null check (dias_corridos >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (uf, transportadora)
);

grant select, insert, update, delete on public.sup_prazos_transporte to anon, authenticated;

-- Semente: padrão global + prazo por UF de origem (transportadora vazia).
-- Cadastro inicial informado por Suprimentos: SP 8, MG 6, PE 4, BA 2;
-- Sudeste 8, Sul 10, Norte 10, Centro-Oeste 10; demais do Nordeste 4.
insert into public.sup_prazos_transporte (uf, transportadora, dias_corridos) values
  ('',   '', 8),
  -- Norte
  ('AC', '', 10), ('AP', '', 10), ('AM', '', 10), ('PA', '', 10),
  ('RO', '', 10), ('RR', '', 10), ('TO', '', 10),
  -- Nordeste
  ('AL', '', 4),  ('BA', '', 2),  ('CE', '', 4),  ('MA', '', 4),
  ('PB', '', 4),  ('PE', '', 4),  ('PI', '', 4),  ('RN', '', 4),  ('SE', '', 4),
  -- Centro-Oeste
  ('DF', '', 10), ('GO', '', 10), ('MT', '', 10), ('MS', '', 10),
  -- Sudeste
  ('ES', '', 8),  ('MG', '', 6),  ('RJ', '', 8),  ('SP', '', 8),
  -- Sul
  ('PR', '', 10), ('RS', '', 10), ('SC', '', 10)
on conflict (uf, transportadora) do nothing;
