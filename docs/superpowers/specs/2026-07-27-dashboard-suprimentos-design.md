# Dashboard de Suprimentos — página de análise e gestão do setor

Data: 2026-07-27

## Problema

`/suprimentos/dashboards` ([SapDashboards.tsx](../../../src/views/SapDashboards.tsx)) é hoje um contador de
status: taxa de conversão, atrasos críticos, tempo médio em aberto, níveis de alerta e top-5 grupos por
volume. Não tem filtro nenhum, não tem série temporal e não tem nenhuma métrica financeira — mesmo com
`valor_total`, `preco_unitario`, `fornecedor_name`, `data_migo` e `data_entrega_sap` já disponíveis em
`EnrichedSAPRecord`. Responde "quantos itens existem", não "como está o setor".

`/suprimentos/demandas` ([DemandDashboard.tsx](../../../src/views/DemandDashboard.tsx)) tem filtros ricos e
cinco gráficos bem construídos sobre o fluxo RM→PO, mas vive numa página separada, o que fragmenta a
análise: o gestor precisa alternar entre duas telas que falam do mesmo dado com filtros diferentes.

Faltam, no conjunto, as perguntas de gestão de suprimentos: para onde vai o dinheiro, quem entrega no
prazo, quem está sobrecarregado, e se o indicador melhorou ou piorou.

## Decisão

Consolidar as duas páginas em uma só, `/suprimentos/dashboards`, com quatro abas organizadas por
**pergunta de gestão** (não por fonte de dado) e uma barra de filtros global que vale para todas.

| Aba | Pergunta | Conteúdo |
|---|---|---|
| Visão Geral | Como está o setor, melhorou ou piorou? | KPIs com delta vs. período anterior, aging da carteira, funil, alertas |
| Demandas | O fluxo RM→PO está fluindo? | Requisitado×pedido no tempo, criticidade, área solicitante |
| Carteira & Compradores | Quem está sobrecarregado, quem entrega? | Tabela de carteira por comprador, performance, atraso, quantidades por período |
| Fornecedores & Spend | Para onde vai o dinheiro, quem cumpre prazo? | Spend, concentração (Pareto), OTD por fornecedor |

Decisões tomadas com o usuário:

- **Consolidação total** (não apenas convivência): `DemandDashboard.tsx` é removido, seu conteúdo vira a aba
  Demandas.
- **Permissão única**: toda a página, inclusive spend, segue gateada por `sap.dashboards`. Sem permissão nova.
- **OTD medido nas duas pontas, prazo seco (sem tolerância)**:
  - *OTD Fornecedor* = `data_migo` ≤ `data_entrega_sap` — o fornecedor cumpriu o que prometeu.
  - *OTD Cliente Interno* = `data_migo` ≤ `data_remessa` — suprimentos entregou quando a área precisava.
  - O headline da Visão Geral é o do cliente interno; o do fornecedor fica no ranking de fornecedores. A
    separação existe para distinguir falha de fornecedor de falha de processo.
- **Menu com um item só** ("Dashboards"). `/suprimentos/demandas` continua funcionando e abre a página já
  na aba Demandas — links salvos não quebram.
- **Período padrão: últimos 90 dias**, comparado com os 90 dias anteriores. Janela grande o bastante para o
  ciclo RM→PO fechar e pequena o bastante para a variação significar algo.

## Arquitetura

A consolidação é de UX, não de arquivo. Fundir os dois arquivos atuais (283 + 270 linhas) num só com quatro
abas produziria ~900 linhas impossíveis de manter.

```
src/views/SapDashboards.tsx          SHELL — header, abas, filtros globais, estado.
                                     Lê os dados uma vez, calcula `filtrados` e
                                     `filtradosAnterior`, passa para a aba ativa.

src/lib/suprimentos.ts               NOVO — cálculo puro, sem React. Agrega spend,
                                     OTD, aging, lead time, carteira por comprador,
                                     spend por fornecedor e deltas entre períodos.

src/components/suprimentos/
  FiltrosSuprimentos.tsx             Barra de filtro global (extraída do DemandDashboard)
  TabVisaoGeral.tsx
  TabDemandas.tsx                    monta os gráficos que já existem
  TabCarteira.tsx
  TabFornecedores.tsx
  AgingCarteiraChart.tsx             novo
  CarteiraCompradorTable.tsx         novo
  SpendConcentracaoChart.tsx         novo
  OtdFornecedorTable.tsx             novo
  DeltaBadge.tsx                     novo — selo de variação vs. período anterior
```

Reaproveitado sem alteração: os cinco componentes de `src/components/demandas/`, `ChartCard`, `KpiCard`,
`useChartTokens`, `lib/demandas.ts`, `lib/format.ts`.

Removido: `src/views/DemandDashboard.tsx`.

**Fluxo de dados.** O shell lê `localDb.getEnrichedSAPRequisicoes()` e a tabela `compradores` uma vez,
aplica os filtros em `useMemo` e entrega os registros já filtrados às abas. Nenhuma aba busca dado próprio.
Os agregados pesados ficam em `lib/suprimentos.ts`, em um único passe por registro.

**Roteamento.** A aba ativa vai para a query da hash (`#/suprimentos/dashboards?tab=fornecedores`), para o
link ser compartilhável. `App.tsx` roteia `/suprimentos/demandas` para o mesmo componente com aba inicial
`demandas`. O item "Demandas" sai do `Sidebar`.

## Métricas

### Visão Geral

KPIs, todos com delta vs. os 90 dias anteriores:

- **Carteira Aberta** — itens com `status_requisicao !== 'Processado'`.
- **Conversão RM→PO** — `processados / total`, delta em pontos percentuais.
- **Lead Time RM→PO** — média de `data_pedido − data_solicitacao`, **somente sobre itens processados**.
  Substitui o atual "Tempo Médio em Aberto", que promedia `dias_em_aberto` sobre a base inteira,
  misturando itens fechados e abertos e por isso não mede nem uma coisa nem outra.
- **Spend no período** — soma de `valor_total` dos itens cujo `data_pedido` cai no período.
- **OTD Cliente Interno** — `data_migo ≤ data_remessa` sobre os itens recebidos.

Abaixo dos KPIs: aging da carteira aberta em faixas (0-7 / 8-15 / 16-30 / 31-60 / >60 dias, sobre
`dias_em_aberto`), o funil de conversão e os níveis de alerta — os dois últimos já existem hoje e mantêm o
drill-down para `/suprimentos/painel`.

### Carteira & Compradores

Tabela ordenável, uma linha por comprador (via `resolveComprador`): abertos, processados, % conversão,
aging médio da carteira aberta, itens críticos (>30 dias), spend colocado, OTD fornecedor. Cada linha faz
drill-down para o painel filtrado. Somam-se os componentes já existentes `CompradorPerformanceChart`,
`AtrasoChart` e `QuantidadesPeriodoTable`.

### Fornecedores & Spend

KPIs: spend total, número de fornecedores ativos, ticket médio por item pedido, % do spend concentrado nos
10 maiores. Gráfico de Pareto (barras de spend + curva de % acumulado) e tabela de OTD por fornecedor
(itens, spend, OTD %, atraso médio em dias).

## Honestidade do dado

O que separa um painel de gestão de um enfeite é declarar a cobertura do próprio número.

- **Spend** só existe em item com PO, e nem todo PO traz `valor_brl`. O card de spend exibe a cobertura
  ("calculado sobre 87% dos pedidos do período"). Sem isso, o gestor decide sobre um número truncado sem
  saber que está truncado.
- **OTD** só entra no denominador quando existe `data_migo`. Itens ainda não recebidos são reportados à
  parte ("n itens pendentes de recebimento"), nunca contados como no prazo.
- **Delta** com período anterior vazio ou zerado exibe `—`, nunca `∞`, `NaN` ou `+100%`.
- Divisão por zero tratada em todo percentual; base vazia usa o estado `empty` do `ChartCard`.

## Fora de escopo (deliberado)

- **Variação de preço unitário / saving**: exige comparar o mesmo material entre períodos, é ruidoso com
  unidades divergentes e merece desenho próprio. Fica para depois.
- **Metas configuráveis por indicador**: o `lead_time_compras_meta` já existente é suficiente por ora.
- Nova permissão para spend (decidido: mesma permissão das demais abas).

## Verificação

O projeto não tem framework de teste (`package.json` expõe `dev`, `build`, `preview`, `lint`). A
verificação é:

1. `npm run lint` (`tsc --noEmit`) sem erro.
2. `npm run build` conclui.
3. Conferência manual: as quatro abas renderizam com a base real; `/suprimentos/demandas` abre na aba
   Demandas; filtros afetam todas as abas; base vazia e filtro sem resultado mostram estado vazio em vez
   de quebrar.

As funções de `lib/suprimentos.ts` são puras e sem dependência de React, o que deixa a porta aberta para
teste unitário quando o projeto adotar um runner.
