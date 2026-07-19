# Rastreio Compras — Design (Fase 1)

**Data:** 2026-07-19
**Status:** Aprovado para implementação
**Escopo:** Fase 1 (sem mensagens/notificações — ver "Fora de escopo")

## 1. Objetivo

Nova página **Rastreio Compras**, acessível a todos os usuários da plataforma, que
rastreia o ciclo de vida das compras (da requisição à entrega). É uma tela de
**consulta (somente leitura)**: a edição de observações e status continua sendo
feita no Painel SAP, que permanece a fonte única de escrita.

A página tem duas visões integradas:
- **Tabela de acompanhamento** — busca avançada + tabela estruturada + exportação.
- **Cronograma** — programação de entregas para a equipe de almoxarifado, em modos
  diário / semanal / mensal, com diferenciação visual por status de prazo.

## 2. Fonte de dados

Usa `localDb.getEnrichedSAPRequisicoes(): EnrichedSAPRecord[]`, já sincronizado em
segundo plano a partir da view `view_enriched_requisicoes`, com cache local
versionado (idb-keyval) e o mesmo padrão live→fallback-cache já usado em
`SapPanel.tsx` e `DemandDashboard.tsx`. **Não** cria nova query, RPC ou tabela.

Cada `EnrichedSAPRecord` já contém todos os campos exigidos. Mapeamento:

| Campo na tela            | Origem no `EnrichedSAPRecord`                          |
|--------------------------|--------------------------------------------------------|
| RM                       | `requisicao_de_compra`                                 |
| PO (Nº pedido)           | `documento_compra` (fallback `pedido`)                 |
| Descrição do item        | `texto_breve`                                          |
| Material                 | `material_code`                                        |
| Fornecedor               | `fornecedor_name`                                      |
| Setor requisitante       | `area_solicitante` (fallback `requisitante_name`)      |
| Quantidade               | `qtd_requisicao`                                       |
| Data de criação          | `data_pedido` (fallback `data_solicitacao`)            |
| Data prevista de entrega | `data_entrega_prevista` (fallback `data_entrega_sap`)  |
| Data de entrega          | `data_migo`                                            |
| Status                   | `item_status`                                          |
| Observações              | `obs_comprador`                                        |

Observação: a tela **não exibe preços/valores**. É uma visão de rastreio não
financeira — o que torna o acesso universal seguro por padrão.

## 3. Estrutura da tela

Cabeçalho comum (padrão de `HistoricoPedidos.tsx`): título com ícone, rótulo
"Dados atualizados em: …" (`localDb.getDatasetUpdatedAt`), botão **Atualizar** e
botões de exportação. Abaixo, um toggle **Tabela | Cronograma**. Estilo visual
alinhado ao sistema: verde-esmeralda como acento, `rounded-xl`, suporte a dark
mode via classes `dark:`, tipografia Inter.

### 3.1 Aba Tabela de acompanhamento

- **Busca única** (texto), parcial e combinável, sobre: RM, PO, descrição,
  material, fornecedor, setor. Case-insensitive.
- **Filtros dropdown** combináveis com a busca: Status, Setor requisitante, Ano
  (derivado da data de criação). Opções derivadas dos dados carregados.
- **Colunas:** RM · PO · Material/Descrição · Fornecedor · Setor · Data criação ·
  Prev. entrega · Entrega (MIGO) · Status (badge colorido) · Observações
  (truncado com tooltip).
- Ordenação por coluna (componente `SortableTh`, padrão de HistoricoPedidos),
  "Personalizar Colunas" (persistido em localStorage), e **paginação incremental**
  ("Carregar mais 50") para performance com grande volume.
- **Exportação** dos dados filtrados:
  - **Excel** via `xlsx` (já instalado), no padrão `handleExportExcel` existente.
  - **PDF** via janela de impressão estilizada (`window.print()` + CSS
    `@media print`), sem nova dependência.

### 3.2 Aba Cronograma (almoxarifado)

- Alternância **Diário / Semanal / Mensal**, ancorada na *data prevista de
  entrega*. Navegação anterior/próximo período + "Hoje".
- Cada entrega no cronograma mostra: item comprado (descrição), quantidade
  programada, Nº do pedido (PO) e fornecedor.
- **Cor por status de prazo**, derivada em memória:
  - 🟢 **Entregue** — possui `data_migo`.
  - 🔵 **No prazo** — prevista ≥ hoje e sem MIGO.
  - 🔴 **Atrasado** — prevista < hoje e sem MIGO.
  - ⚪ **Sem data prevista** — sem data prevista de entrega.
- **Responsivo / mobile-first** (equipe usa no local do almoxarifado):
  - Mensal: grade de calendário no desktop; no mobile, lista agrupada por dia.
  - Semanal: colunas por dia (desktop) → lista rolável (mobile).
  - Diário: lista das entregas do dia.
- Registros sem data prevista não aparecem no cronograma (só na tabela); um
  contador indica quantos foram omitidos por falta de data.

## 4. Rota, sidebar e acesso

- Nova rota `/rastreio` em `App.tsx`, renderizando `<RastreioCompras />`
  **sem gate de permissão** (todos os perfis autenticados). Adicionada ao conjunto
  `STATE_PRESERVING_PATHS` para preservar filtros/busca/aba durante o sync em
  segundo plano.
- Novo item no grupo **GERAL** da `Sidebar.tsx` (ícone `PackageSearch` ou `Route`
  do lucide-react), exibido a todos os usuários — sem filtro de `hasPermission`
  (item marcado como universal).

## 5. Arquitetura de arquivos

Unidades pequenas, com responsabilidade única e testáveis isoladamente:

- `src/views/RastreioCompras.tsx` — orquestra carregamento de dados, estado de
  abas, filtros e paginação. Consome `localDb`.
- `src/lib/rastreio.ts` — **funções puras** (sem React), onde vive a lógica de
  negócio:
  - `buildRastreioRows(records)` — mapeia `EnrichedSAPRecord[]` → linhas da tela.
  - `filterRegistros(rows, { query, status, setor, ano })` — busca + filtros.
  - `deriveDeliveryStatus(row, hoje)` — retorna `'entregue' | 'no_prazo' |
    'atrasado' | 'sem_data'`.
  - `groupByDay / groupByWeek / groupByMonth(rows, refDate)` — agrupamento do
    cronograma.
- `src/components/rastreio/RastreioTable.tsx` — apresentação da tabela.
- `src/components/rastreio/RastreioCronograma.tsx` — apresentação do cronograma.

Manter a lógica em `rastreio.ts` isola o negócio da UI e deixa o código pronto
para testes unitários futuros (ver "Fora de escopo").

## 6. Carregamento, cache e erros

Reaproveita o padrão já existente:
- Dados vêm do cache local (`getEnrichedSAPRequisicoes`), preenchido pelo sync em
  segundo plano; a tela reage a `dataVersion` como as demais telas de leitura.
- Botão **Atualizar** força o sync via localDb.
- Estados de **loading / erro / vazio** idênticos aos de HistoricoPedidos
  (spinner, faixa de erro rosa, empty-state instrutivo).

## 7. Fora de escopo (Fase 2 / decisões)

- **Mensagens e conversas com notificações** (usuário ↔ comprador) — subsistema
  próprio (nova tabela Supabase, estado de não-lidas, sino no Header). Terá spec
  dedicada na Fase 2.
- **Edição de observações/status** na página — permanece somente no Painel SAP
  (fonte única de escrita), por decisão de design.
- **Testes automatizados** — o projeto não possui runner de testes e, por decisão
  do usuário, não será adicionado agora. A lógica fica isolada em `rastreio.ts`,
  testável no futuro sem refatoração.
- **Exportação PDF via lib** (jsPDF) — descartada em favor de impressão do
  navegador, para manter o bundle leve.

## 8. Critérios de aceite (Fase 1)

1. Item "Rastreio Compras" aparece no grupo GERAL da sidebar para qualquer
   usuário autenticado; `/rastreio` abre a página sem bloqueio de permissão.
2. Busca parcial e filtros (Status/Setor/Ano) funcionam combinados e refletem na
   tabela e nos KPIs/contadores.
3. Tabela exibe RM, PO, descrição, fornecedor, setor, data de criação, data
   prevista, data de entrega (MIGO), status e observações; ordena por coluna e
   pagina incrementalmente.
4. Exportações Excel e PDF refletem exatamente o conjunto filtrado.
5. Cronograma alterna Diário/Semanal/Mensal, vincula cada entrega à data prevista,
   mostra item/quantidade/PO/fornecedor e aplica a cor correta por status de prazo.
6. Layout responsivo e utilizável em telas móveis; dark mode consistente com o
   restante do sistema.
