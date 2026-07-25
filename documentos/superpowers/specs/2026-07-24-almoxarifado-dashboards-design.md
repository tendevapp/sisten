# Dashboards do Almoxarifado — design

Data: 2026-07-24
Módulo: Almoxarifado
Página nova: `/almoxarifado/dashboards`

## Objetivo

Dar ao gestor de almoxarifado uma página única para responder, sobre a posição de
estoque vigente: onde está o dinheiro imobilizado, quais itens merecem controle
físico e negociação, e que decisões de compra estão sendo tomadas contra o saldo
que já existe.

A página é a segunda do módulo Almoxarifado, criado em
[2026-07-24-almoxarifado-estoque-design.md](2026-07-24-almoxarifado-estoque-design.md).
A tabela `estoque` vem da importação ZL0024, especificada em
[2026-07-24-importacao-zl0024-estoque-design.md](2026-07-24-importacao-zl0024-estoque-design.md).

## O que a página deliberadamente não mede

Não há indicador de giro, cobertura ou obsolescência.

A base de entradas físicas (`pedidosforn.data_migo`) tem lacuna nos anos
2024 e 2025 — 4.643 entradas em 2023, 120 em 2024, 59 em 2025, 885 em 2026. Um KPI
de "material sem movimento há 24 meses" calculado sobre essa série apontaria 1.729
materiais e R$ 8,48 M como parados, sendo que boa parte é ausência de dado, não
ausência de movimento. Em almoxarifado esse é justamente o número que motiva baixa
ou descarte, então publicá-lo errado é pior que não publicá-lo.

Giro, cobertura e aging entram quando o histórico de movimentos (MB51/MB5B) for
importado. Até lá, a página exibe nota fixa no rodapé declarando a ausência, para
que ninguém infira giro a partir de valor imobilizado.

## Números da base na data do design

Servem de referência para validar a implementação.

| Medida | Valor |
| --- | --- |
| Linhas em `estoque` | 2.292 |
| Materiais distintos | 2.052 |
| Valor imobilizado | R$ 17.889.351,14 |
| Depósitos | 12 |
| Tipos de material | 4 |
| Classes de item | 3 (82 itens sem classe) |
| Grupos de mercadoria | 113 |
| Aplicações | 62 |
| Curva ABC | A = 254 itens (80% do valor) · B = 529 · C = 1.269 |
| Materiais com RM aberta e saldo | 50 |
| Materiais com último preço > PMM + 20% | 135 |
| Materiais com último preço < PMM − 20% | 522 |

Concentração por depósito, que justifica o painel correspondente: o depósito 0004
guarda R$ 7,70 M em 1.488 itens, enquanto o 0090 guarda R$ 2,86 M em apenas 30 —
perfis de controle opostos sob o mesmo teto.

## Arquitetura

Segue o padrão de `src/views/DemandDashboard.tsx`: view fina orquestradora,
componentes de painel isolados, lógica pura em lib.

```
src/lib/almoxarifado.ts                    matemática pura, sem React
src/views/AlmoxarifadoDashboards.tsx       orquestradora: carrega, filtra, distribui
src/components/almoxarifado/
  EstoqueKpis.tsx
  CurvaAbcChart.tsx
  ValorPorDepositoChart.tsx
  ComposicaoChart.tsx
  ConcentracaoChart.tsx
  TopMateriaisChart.tsx
  CompraEvitavelPanel.tsx
  DivergenciaPmmPanel.tsx
  QualidadeCadastroPanel.tsx
```

Cada painel recebe dados já filtrados por props e ignora sua procedência: dá para
entender ou alterar um sem ler os outros. A lib pura é o que permite a página
Estoque reusar a classificação ABC sem duplicar a regra.

### `src/lib/almoxarifado.ts`

Funções puras, sem dependência de React ou do `localDb`:

- `classifyABC(itens: EstoqueItem[]): Map<string, 'A' | 'B' | 'C'>` — agrupa por
  material, soma valor, ordena decrescente, acumula e corta em 80% (A) e 95% (B).
  Retorna mapa material → classe. Consumida pela página de dashboards e pela
  página Estoque.

  A classificação é sempre calculada sobre a posição **inteira**, nunca sobre o
  subconjunto filtrado. Um material classe A permanece A ao filtrar por um depósito,
  senão a classe mudaria conforme o filtro e deixaria de significar algo.
- `agregarPor(itens, chave): { chave, itens, valor, quantidade }[]` — agregação
  genérica usada pelos painéis de depósito, tipo, classe e grupo.
- `topN(agregados, n)` — top N por valor, com linha "Outros" somando o resto.
- `calcularKpis(itens)` — valor total, materiais distintos, depósitos, data da posição.
- `acharCompraEvitavel(itens, requisicoes)` — materiais com saldo e RM aberta.
- `acharDivergenciaPmm(itens, analise, tolerancia)` — comparação PMM vs último preço.
- `acharLacunasCadastro(itens)` — contadores de campos ausentes.
- `formatBRL`, `formatQtd`, `formatDateBR` — formatadores compartilhados.

## Origem dos dados

`src/db/localDb.ts` sincroniza `requisicoes` e `pedidosforn` filtrados a partir de
`2026-01-01` (linhas 197–209 do arquivo): o projeto trata egress como custo real.
Isso determina de onde cada painel tira seus números.

| Painel | Fonte | Custo de rede |
| --- | --- | --- |
| KPIs, ABC, depósito, composição, concentração, top materiais, qualidade | `localDb.fetchEstoque()`, já cacheado | zero |
| Compra evitável | `localDb.getEnrichedSAPRequisicoes()`, cache de 2026 — e RM aberta é, por definição, recente | zero |
| Divergência de PMM | nova view `vw_estoque_analise` | ~2 mil linhas |

Só o último não fecha no cliente: o cache local tem pedidos de 2026 apenas (611
materiais), e a comparação precisa dos 2.009 materiais com histórico. Baixar 66 mil
pedidos ao navegador para calcular um `max(data_doc)` por material seria
desperdício, então a agregação acontece no Postgres.

### View `vw_estoque_analise`

Uma linha por material presente em `estoque`:

```sql
create view vw_estoque_analise as
with ult as (
  select distinct on (p.material)
    p.material,
    p.preco_liquido_unit / case
      when p.por ~ '^[0-9]+([.,][0-9]+)?$'
        then coalesce(nullif(replace(p.por, ',', '.')::numeric, 0), 1)
      else 1
    end as ultimo_preco_unit,
    p.data_doc as data_ultima_compra,
    coalesce(p.fornecedor_nome, p.fornecedor) as ultimo_fornecedor
  from pedidosforn p
  where p.preco_liquido_unit is not null and p.preco_liquido_unit > 0
  order by p.material, p.data_doc desc nulls last
)
select distinct
  e.material,
  u.ultimo_preco_unit,
  u.data_ultima_compra,
  u.ultimo_fornecedor
from estoque e
left join ult u on u.material = e.material;
```

O divisor por `por` reproduz a correção do commit `217d1e3`: no SAP, `preco_liquido_unit`
é o preço por `por` unidades, então o unitário real exige a divisão. A guarda por
regex evita erro de cast quando `por` vem vazio ou não numérico, e o `coalesce`
protege contra `por = '0'`.

Leitura liberada a `authenticated`, espelhando a política `estoque_read`.

Acesso pelo cliente via novo `localDb.fetchEstoqueAnalise()`, com cache em
`sisten_estoque_analise` e fallback ao cache local em caso de falha, igual a
`fetchEstoque()`. Fica **fora** de `syncFromSupabase` para não cobrar egress de
quem nunca abre o módulo.

## Painéis

### Linha de KPIs

Valor imobilizado, materiais distintos, depósitos e data da posição. A data vem do
`imported_at` mais recente: sem ela o gestor não sabe a idade do dado que está lendo.

### Curva ABC

`ComposedChart` com barras de valor por classe e linha de percentual acumulado.
Responde onde vale a pena contar estoque e negociar preço — 12% dos materiais
concentram 80% do valor.

### Valor por Depósito

Barras horizontais ordenadas por valor, com contagem de itens no rótulo.

### Composição e Concentração

Composição por tipo de material e classe de item. Concentração por grupo de
mercadoria e aplicação, limitada ao top 10 mais "Outros" — 113 categorias num
gráfico viram ruído.

### Top 15 Materiais

Barras horizontais por valor imobilizado, com código e descrição.

### Compra Evitável

Materiais com RM aberta e saldo em estoque. Lista compacta clicável mais export
Excel da lista completa. É o painel de maior valor operacional: cada linha é uma
compra que talvez não precise acontecer.

### Divergência de PMM

Último preço pago contra PMM, fora da faixa de ±20%. Acima da faixa indica PMM
subavaliado, com estoque contabilizado abaixo do custo de reposição. Abaixo indica
PMM inflado por compra antiga cara. Mesma estrutura de lista clicável mais export.

### Qualidade de Cadastro

Contadores de itens sem classe de item, sem grupo de mercadoria e sem PMM.

## Interação

Barra de filtros compartilhada — depósito, tipo de material, classe de item, classe
ABC e grupo de mercadoria — alimenta todos os painéis por um único `useMemo`, como
em DemandDashboard.

O drill-down leva à tabela existente: clicar num depósito, classe ABC, grupo ou
material navega para `/almoxarifado/estoque` com query na hash —
`?deposito=0004`, `?abc=A`, `?grupo=...`, `?material=1433206`.

Isso pede duas alterações pequenas em `src/views/Estoque.tsx`:

1. Ler a query da hash no mount e pré-aplicar os filtros correspondentes. Quando a
   query traz `material`, o valor entra em `searchInput` e `searchQuery` para que a
   busca já apareça aplicada.
2. Aceitar filtro por classe ABC, reusando `classifyABC()` da lib. Ganho colateral:
   a tabela passa a ter coluna e filtro ABC.

Os dois painéis de alerta cruzam dados que a página Estoque não conhece, então cada
linha navega para o material específico e o painel oferece export Excel da lista
completa — sem reconstruir tabela.

## Integração na aplicação

- Rota `/almoxarifado/dashboards` em `src/App.tsx`, com `lazy()` e guarda
  `localDb.hasPermission(user, 'almoxarifado', 'visualizar')`, seguindo a rota de Estoque.
- Rota incluída em `STATE_PRESERVING_PATHS` para os filtros sobreviverem ao sync
  em background.
- Item na sidebar sob o grupo ALMOXARIFADO, rótulo "Dashboards", ícone
  `LayoutDashboard`, permissão `almoxarifado.visualizar` — já concedida a `admin`,
  `coordenador_suprimentos` e `comprador`.

## Estado vazio e falha

Cada painel renderiza seu próprio estado vazio ("Nenhum item no filtro"), como
`CriticidadeChart` faz hoje. Falha ao buscar `vw_estoque_analise` degrada apenas o
painel de divergência de PMM, com aviso local; os outros oito seguem funcionando a
partir do cache de estoque.

Dark mode com variantes `dark:` em todos os componentes novos, seguindo
`src/views/Estoque.tsx`. A `SapDashboards.tsx`, mais antiga, não tem dark mode e não
serve de referência visual.

## Fora de escopo

- Giro, cobertura e obsolescência, pelo motivo já exposto.
- Ponto de reposição e estoque mínimo: exigem consumo médio, que depende do mesmo
  histórico de movimentos ausente.
- Inventário cíclico e contagem física.
- Histórico de evolução do valor imobilizado: `estoque` é substituída por completo a
  cada importação, então não existe série temporal. Precisaria de tabela de
  snapshots, decisão para outro momento.
