-- =====================================================================
-- Prazo de trânsito por UF de origem e transportadora, mantido pelo
-- comprador na tela de Diligenciamento (Suprimentos).
--
-- Contexto: a previsão de chegada de um pedido é `data de remessa + dias
-- corridos de trânsito`, mas esse prazo varia MUITO por origem — um
-- fornecedor de São Paulo leva bem mais dias que um de Salvador. Existe uma
-- tabela de fretes (`sup_fretes`, usada no Estimador de Frete) com prazo por
-- rota, mas foi decisão de produto NÃO usá-la aqui: o prazo do
-- diligenciamento é ajustado pelo próprio comprador, sem depender do
-- cadastro de frete. Ver `src/data/diretrizes.ts`, seção Diligenciamento.
--
-- Resolução em cascata (do mais específico ao mais genérico), implementada
-- em `src/lib/diligenciamento.ts` (`resolverPrazoDias`):
--   1. linha com (uf, transportadora) exatos;
--   2. linha com (uf, '') — o padrão daquela UF, sem transportadora específica;
--   3. linha com ('', '') — o padrão global, para UF ainda não cadastrada.
--
-- Colunas:
--   uf              -> UF do fornecedor (2 letras). '' = qualquer UF
--                       (padrão global, nível 3 da cascata).
--   transportadora  -> mesmo texto normalizado usado em
--                       sup_diligenciamento_itens.transportadora
--                       (ver `normalizarChaveTransportadora`). '' = padrão da
--                       UF, sem transportadora específica (nível 2).
--   dias_corridos   -> dias corridos (não úteis) somados à data de remessa.
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
