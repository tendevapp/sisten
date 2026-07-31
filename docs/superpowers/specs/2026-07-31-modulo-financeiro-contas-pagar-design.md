# Módulo Financeiro — Contas a Pagar + Análise

## Contexto

O SISTEN acabou de ganhar a importação FBL1N (contas a pagar) e a tela de
consulta `ContasPagar.tsx`, hoje dentro do grupo de menu SUPRIMENTOS
(`/suprimentos/contas-pagar`). Também existe a view `vw_fbl1n_c_pagar_analise`
no Supabase, que cruza os lançamentos com o cadastro de tipos de documento SAP
(`cadastro_tipodoc`), trazendo categoria/módulo e descrição de cada tipo.

Este design cria um módulo de menu próprio, "Financeiro", move a tela de
Contas a Pagar para lá, e adiciona uma segunda tela de análise/dashboard sobre
os mesmos dados.

## Escopo

1. Novo grupo de menu `FINANCEIRO` (Sidebar + `pages.ts`).
2. Página "Contas a Pagar" migra de Suprimentos para Financeiro — mesmo
   componente `ContasPagar.tsx`, novo `id`/`path`/`group`.
3. Nova página "Análise" (`/financeiro/contas-pagar/analise`) — dashboard com
   KPIs e gráficos sobre `vw_fbl1n_c_pagar_analise`.
4. Acesso: as duas páginas ficam com `defaultRoles: ['admin']` e **sem**
   `alwaysAdmin` — aparecem como checkbox editável em "Módulos de acesso" no
   painel admin, para que um admin possa liberar para outros perfis
   individualmente, mas por padrão só admin vê.

Fora de escopo: qualquer filtro além de empresa na tela de análise; edição de
dados; drill-down entre a análise e a lista (fica para uma iteração futura se
for pedido).

## Menu

`src/lib/pages.ts`:
- Entrada existente `sup_contas_pagar` renomeada para `fin_contas_pagar`,
  `group: 'FINANCEIRO'`, `path: '/financeiro/contas-pagar'`,
  `defaultRoles: ['admin']` (sem `alwaysAdmin`).
- Nova entrada `fin_contas_pagar_analise`, mesmo grupo, `path:
  '/financeiro/contas-pagar/analise'`, ícone `BarChart3` (já importado no
  arquivo), `defaultRoles: ['admin']` (sem `alwaysAdmin`).

`src/components/Sidebar.tsx`: `groupOrder` ganha `'FINANCEIRO'`, entre
`'ALMOXARIFADO'` e `'HELPDESK'`.

`src/App.tsx`: `case '/suprimentos/contas-pagar'` vira
`case '/financeiro/contas-pagar'` (guardado por `canAccessPage(user,
'fin_contas_pagar')`); `STATE_PRESERVING_PATHS` troca a entrada
correspondente; novo `case '/financeiro/contas-pagar/analise'` com lazy
import de `ContasPagarAnalise`.

## Tela de Análise (`src/views/ContasPagarAnalise.tsx`)

Arquivo único, seguindo o padrão de `ContasPagar.tsx` (paginação da consulta
em lotes de 1000 via `.range()`, sem cache em `localDb`) e o padrão visual de
`ChartCard`/`KpiCard`/Recharts já usado em `TabContratosLista.tsx`.

**Fonte de dados**: `supabase.from('vw_fbl1n_c_pagar_analise').select(...)`,
paginado. Colunas necessárias: `empresa`, `razao_social_fornecedor`,
`montante_moeda_doc`, `doc_compensacao`, `vencimento_liquido`,
`tipo_documento_categoria_modulo`.

**Filtro**: select de empresa (mesmo padrão do select em `ContasPagar.tsx`),
opção "Todas" por padrão.

**Status "Em aberto"**: `doc_compensacao` vazio/nulo — mesma regra de
`ContasPagar.tsx`.

**KPIs** (linha de 4 `KpiCard`, todos calculados só sobre linhas "Em
aberto" do filtro de empresa aplicado):
- Total em Aberto — soma de `montante_moeda_doc`.
- Total Vencido — soma onde `vencimento_liquido < hoje`.
- Maior Fornecedor em Aberto — `razao_social_fornecedor` com maior soma,
  exibido como `display` (nome) + `detail` (valor formatado).
- Lançamentos em Aberto — contagem de linhas.

**Gráfico 1 — "Em Aberto por Categoria/Módulo"**: barras horizontais,
`ChartCard` + Recharts `BarChart` (mesmo padrão do `StatusVigenciaChart` em
`TabContratosLista.tsx`), agrupando por `tipo_documento_categoria_modulo`
(linhas sem categoria caem em `"Sem categoria"`), somando `montante_moeda_doc`
das linhas "Em aberto", ordenado decrescente, cores via `seriesColor(tokens,
index)`.

**Gráfico 2 — "Maiores Fornecedores em Aberto"**: barras horizontais, top 10
`razao_social_fornecedor` por soma de `montante_moeda_doc` em aberto, cor
única (`tokens.brand`).

**Gráfico 3 — "Aging das Partidas em Aberto"**: barras horizontais em 5
buckets sobre `vencimento_liquido` das linhas em aberto — `Vencido` (<hoje),
`Vence em até 7 dias`, `Vence em até 30 dias`, `Vence em 30+ dias`, `Sem
vencimento informado` (null) — somando `montante_moeda_doc`, cores via
`tokens.atraso[0..4]` (escala de atraso já existente no design system).

Todos os três gráficos usam `ChartTooltip` para o tooltip e ficam vazios com
`ChartCard`'s `empty`/`emptyMessage` quando não há dado em aberto no filtro.

## Testes/verificação

- `npm run lint` limpo.
- Conferir visualmente (sem acesso a browser neste ambiente) que a estrutura
  JSX está bem formada e os cálculos batem com um conjunto de dados de
  exemplo verificado à mão.
- Confirmar que `fin_contas_pagar` e `fin_contas_pagar_analise` aparecem como
  checkboxes editáveis (não bloqueados) em "Módulos de acesso" no painel
  admin — isso já é automático dado que nenhuma das duas usa `alwaysAdmin`.
