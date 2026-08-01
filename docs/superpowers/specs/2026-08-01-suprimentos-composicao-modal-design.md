# Modal de composição nos dashboards de Suprimentos

## Contexto

Os dashboards de Contas a Pagar (`ContasPagarAnalise.tsx`) e Almoxarifado
(`AlmoxarifadoDashboards.tsx`) já têm um padrão: clicar numa barra/segmento de
gráfico abre uma janela modal com a lista detalhada dos lançamentos/itens por
trás daquele ponto, agrupada (por fornecedor ou por grupo de mercadoria), com
busca, ordenação por valor, expandir/recolher grupo e % do total.

A página de Suprimentos (`SapDashboards.tsx`) tem 5 abas — Visão Geral,
Demandas, Carteira & Compradores, Fornecedores & Spend, Análise de Compras —
e nenhuma delas abre esse tipo de modal hoje. Parte dos gráficos já tem
`onSelecionar`/`onClick` que apenas aplica um filtro ou navega para
`/suprimentos/painel`; a maioria não tem clique nenhum.

## Objetivo

Replicar a mesma estrutura de modal de composição nas 5 abas de Suprimentos,
reaproveitando o máximo de UI possível via um componente genérico, em vez de
duplicar a implementação em cada aba.

## Escopo

Cobertas (clique abre modal de composição):

- **Visão Geral**: `AgingCarteiraChart` (por faixa de aging); passos do
  "Fluxo de Conversão"; níveis do painel "Níveis de Alerta". Esses dois
  últimos hoje só chamam `onDrilldown` (navega para `/suprimentos/painel`);
  passam a abrir o modal, mantendo um botão "Ir para o Painel" dentro dele
  para quem quiser a tela cheia.
- **Demandas**: `RequisitadoVsPedidoChart` (as duas instâncias — geral e
  serviços), `CriticidadeChart`, `AreaSolicitanteChart`.
- **Carteira & Compradores**: `CompradorPerformanceChart`, `AtrasoChart`.
- **Fornecedores & Spend**: `SpendConcentracaoChart`.
- **Análise de Compras**: `ParetoValorChart` (fornecedores), `CurvaAbcGrupos`,
  `RiscoFonteUnica`, `HierarquiaGeograficaTree`, `DistribuicaoBarras`
  (região/cidade) — esses já emitem `onSelecionar(chave)`, que hoje só
  aplica filtro; passa a também abrir o modal.

Fora de escopo:

- `MatrizCalor` (heatmap grupo × região) e `FragmentacaoChart` (scatter de
  fornecedores) continuam só visuais. Célula de heatmap e ponto de scatter
  não são alvos de clique confiáveis do mesmo jeito que uma barra — tratar
  isso é um problema de interação diferente do padrão de referência.
- `CarteiraCompradorTable`, `OtdFornecedorTable`, `QuantidadesPeriodoTable`:
  já são tabelas com uma linha por entidade; não precisam de modal de
  composição por cima.

## Design

### Componente genérico `ComposicaoModal`

Novo arquivo `src/components/charts/ComposicaoModal.tsx`, extraído do
padrão repetido em `AlmoxarifadoDashboards.tsx` /
`ContasPagarAnalise.tsx`. Genérico em `T`:

```ts
interface ComposicaoModalProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  badge: string;
  subtitle?: string;
  items: T[];
  groupBy: (item: T) => string;
  valueOf: (item: T) => number;
  groupLabelHeader: string;      // ex.: "Fornecedor", "Grupo de Mercadoria"
  detailColumns: {
    header: string;
    align?: 'left' | 'right' | 'center';
    render: (item: T) => React.ReactNode;
  }[];
  searchPredicate: (item: T, query: string) => boolean;
  itemKey: (item: T, idx: number) => string | number;
  footerAction?: { label: string; onClick: () => void };
}
```

Internamente reproduz a UI já validada: cabeçalho com badge e botão fechar,
KPIs resumidos (total, qtd. grupos, qtd. itens), busca + ordenação por valor,
tabela agrupada com linha-mãe (grupo) expansível e sub-tabela de itens,
% do total por grupo e por item. Sem lógica de negócio própria — quem chama
decide agrupamento, colunas e como filtrar os itens.

### Estado do modal por fonte de dados

Duas fontes de dados distintas alimentam as abas:

- `EnrichedSAPRecord[]` (Visão Geral, Demandas, Carteira, Fornecedores) —
  vem de `SapDashboards.tsx`, que já mantém `filtrados` e passa para as 4
  abas. O estado do modal (`selectedComposicao` + setter) fica no shell
  `SapDashboards.tsx` e desce via prop para as 4 abas, porque o dado bruto já
  está lá.
- `HistoricoPedidoView[]` (Análise de Compras) — vive só dentro de
  `TabAnaliseCompras.tsx`, que já busca e filtra sua própria base. O estado
  do modal fica local a esse componente.

Cada aba/gráfico, ao receber o clique, filtra a lista de registros brutos já
filtrada pelo filtro global (ex.: `filtrados.filter(r => resolveComprador(r,
compradores) === comprador)`) e chama `abrirComposicao({...})` com o
resultado — o mesmo filtro que os componentes já usam para montar os dados
agregados dos gráficos, só que sem a agregação final.

### Colunas de detalhe por contexto

- Para `EnrichedSAPRecord`: RI, material, texto breve, requisitante, área
  solicitante, status, valor (quando houver PO).
- Para `HistoricoPedidoView`: material, texto breve, fornecedor, doc. compra,
  data, quantidade, valor líquido em BRL.

### Gráficos sem clique hoje

`RequisitadoVsPedidoChart`, `CriticidadeChart`, `AreaSolicitanteChart`,
`CompradorPerformanceChart`, `AtrasoChart` e `SpendConcentracaoChart` ganham
uma prop de callback (`onSelecionarBucket`/`onSelecionarComprador`/
`onSelecionarFornecedor`, seguindo o nome já usado nos componentes vizinhos)
e `onClick` no `<Bar>` correspondente, no mesmo estilo já usado em
`ParetoValorChart`/`DistribuicaoBarras` (`onClick={(d) =>
onSelecionar?.(d?.chave)}`). A aba pai resolve a chave clicada (bucket de
tempo, comprador, área, criticidade, fornecedor) de volta para os registros
brutos correspondentes, reaproveitando a mesma função de agregação/`resolve*`
que já usa para montar os dados do gráfico.

### Testagem

Sem suíte de testes automatizados para estes componentes; verificação via
`npm run build` (compilação TS) e checagem manual no navegador (clicar em ao
menos um gráfico por aba, abrir modal, buscar, ordenar, expandir grupo,
fechar).
