-- =====================================================================
-- Cadastro de transportadoras — lista mestre editável em
-- "Admin > Cadastros Gerais > Suprimentos — Transportadoras".
--
-- Contexto: até aqui o campo "transportadora" do Diligenciamento
-- (`sup_diligenciamento_itens.transportadora`) era texto livre e a lista de
-- sugestão nascia só do que já tinha sido digitado. Passa a existir um
-- cadastro de verdade: o comprador escolhe de uma lista curpadronizada
-- (Bahia Sul, Masflog, Velox, Correios, Coleta, CIF, ...), editável e
-- expansível, sem depender de alguém ter digitado o nome certo antes.
--
-- `Coleta` e `CIF` não são transportadoras no sentido literal — são a
-- modalidade de retirada/entrega —, mas entram na mesma lista porque é a
-- mesma escolha que o comprador faz na coluna do painel.
--
-- Mesmo padrão de acesso das tabelas irmãs do Diligenciamento
-- (`sup_prazos_transporte`, `sup_diligenciamento_itens`): grants diretos a
-- anon/authenticated, sem RLS.
-- =====================================================================

create table if not exists public.sup_transportadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nome)
);

grant select, insert, update, delete on public.sup_transportadoras to anon, authenticated;

insert into public.sup_transportadoras (nome) values
  ('Bahia Sul'), ('Masflog'), ('Velox'), ('Correios'), ('Coleta'), ('CIF')
on conflict (nome) do nothing;
