-- Cache do regime tributário do fornecedor (Simples Nacional / MEI), por CNPJ.
--
-- A rota de consulta (Edge Function `consultar-cnpj`: BrasilAPI → ReceitaWS →
-- cnpj.ws) já existia no Cadastro SAP, mas o resultado se perdia a cada
-- chamada. O mapa comparativo precisa dele para cada fornecedor da cotação
-- (decide crédito de ICMS e o código de imposto do SAP); consultar de novo a
-- cada abertura estoura o rate limit das bases públicas. Aqui guarda a
-- resposta e quando foi consultada — o app reconsulta quando passa de 30 dias.
--
-- Leitura para qualquer usuário logado; escrita só quem gere cotações
-- (mesma regra de sup_cotacao_propostas).

create table if not exists public.sup_fornecedor_regime_fiscal (
  cnpj               text primary key check (cnpj ~ '^[0-9]{14}$'),
  simples            boolean not null,
  mei                boolean not null default false,
  situacao_cadastral text,
  razao_social       text,
  fonte              text,
  consultado_em      timestamptz not null default now(),
  consultado_por     text
);

comment on table public.sup_fornecedor_regime_fiscal is
  'Cache da consulta de CNPJ na Receita (via Edge Function consultar-cnpj): optante do Simples/MEI por fornecedor. O app reconsulta após 30 dias.';

alter table public.sup_fornecedor_regime_fiscal enable row level security;

drop policy if exists "regime_fiscal_read" on public.sup_fornecedor_regime_fiscal;
drop policy if exists "regime_fiscal_write" on public.sup_fornecedor_regime_fiscal;

create policy "regime_fiscal_read" on public.sup_fornecedor_regime_fiscal
  for select to authenticated using (true);
create policy "regime_fiscal_write" on public.sup_fornecedor_regime_fiscal
  for all to authenticated using (public.pode_gerir_cotacoes()) with check (public.pode_gerir_cotacoes());

revoke all on public.sup_fornecedor_regime_fiscal from anon, public;
grant select, insert, update on public.sup_fornecedor_regime_fiscal to authenticated;
grant all on public.sup_fornecedor_regime_fiscal to service_role;
