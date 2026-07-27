# Análise de Compras — dashboards do histórico

Data: 2026-07-27

## Contexto

A tela `/suprimentos/historico` consulta o histórico linha a linha: bom para achar quem já forneceu
determinado material, inútil para responder onde está concentrado o gasto. Faltava a camada agregada.

O escopo é o recorte que o app já sincroniza: `vw_historico_pedidos` com `data_doc >= 2026-01-01`.

## Perfil do dado (medido, não presumido)

Levantado direto no banco antes de decidir as análises.

| | Base completa | Recorte 2026 (16/02 a 20/07) |
|---|---|---|
| Linhas / pedidos | 66.047 / 25.330 | 677 / 280 |
| Fornecedores | 1.781 | 118 |
| Materiais / grupos de mercadoria | 15.314 / 579 | 524 / 105 |
| UFs / cidades / países | — | 7 / 48 / 3 |
| Gasto | — | R$ 3,45 mi |

Cobertura no recorte: localização 100%, `data_migo` 100%, `grp_mercads` 100%, `regiao_uf` 98,5%,
`condicao_pagamento` 77%, `contrato` 2,2% (descartado).

**Implicação de método.** Com 118 fornecedores e 280 pedidos em cinco meses, série temporal mensal produz
barras magras que não sustentam leitura de tendência. Distribuição, concentração e risco de fonte, sim.
Por isso a página não tem gráfico de evolução.

## Defeitos corrigidos na origem

### 1. Soma de valor em moedas misturadas

`pedidosforn.valor_liquido` está na **moeda original** do pedido — BRL, USD, EUR e ZUSD convivem na tabela.
A `vw_historico_pedidos` somava esse campo direto, adicionando dólar e euro como se fossem reais.

- Base completa: subestimava o gasto em ~R$ 135 milhões (USD 11,3M + EUR 18,6M entravam como R$ 29,9M
  quando valem R$ 165M).
- Recorte de 2026: R$ 2,42 mi somados contra R$ 3,45 mi reais — 30% de distorção.

A view passa a somar `valor_em_brl`. O nome da coluna de saída continua `valor_liquido` porque é o que o app
consome; `preco_liquido_unit`, derivado dela, também passa a ser comparável entre moedas. Isso corrige a
página Histórico existente junto com a nova.

### 2. Grupo de mercadoria ausente

A view não expunha `grp_mercads`, e sem ele nenhuma análise por categoria era possível. Entrou via `max()`
— seguro porque o agrupamento já inclui o material, e um material pertence a um só grupo.

### 3. Item ativo duplicado no menu

`Sidebar` marcava como ativo todo item cujo caminho fosse prefixo do atual, acendendo dois ao mesmo tempo
quando um era sub-rota do outro (`/suprimentos/importar` com `/suprimentos/importar/log`, e agora
`/suprimentos/historico` com `.../dashboards`). Passou a vencer o prefixo mais longo, com limite de segmento.

## Classificação Projeto × Consumo

Regra de negócio: material cujo código começa em `100000000` (faixa de 18 dígitos) é item de **Projeto**;
os demais (códigos de 5 a 7 dígitos) são **Consumo**. Materializada na view como `tipo_item`.

A separação não é cosmética. No recorte de 2026:

| Natureza | Linhas | Pedidos | Fornecedores | Gasto | % |
|---|---|---|---|---|---|
| Consumo | 629 | 275 | 114 | R$ 2,09 mi | 60,6% |
| Projeto | 23 | 5 | 4 | R$ 1,36 mi | 39,4% |

Cinco pedidos de quatro fornecedores carregam 39% do gasto. Analisados junto com consumo, dominam a
concentração, o ticket médio e a curva ABC, e fazem um projeto pontual parecer dependência estrutural de
fornecedor. Daí o filtro ser botão em destaque, não mais um `select`, e a página exibir a composição das duas
naturezas acima dos gráficos.

O código da aplicação mantém a mesma regra como fallback local (`porTipoItem`), para linhas de cache
gravadas antes da coluna existir não caírem em "Não informado".

## Página

A Análise de Compras é a quinta **aba** de `/suprimentos/dashboards` (Gestão de Suprimentos), não uma
página própria: todas as leituras de suprimentos passam a viver no mesmo lugar. A rota antiga
`/suprimentos/historico/dashboards` continua válida e abre a página já nessa aba, e a tela Histórico tem
link direto para ela.

A aba tem **filtros próprios** e o filtro global do shell some quando ela está ativa. As bases são
diferentes: o shell recorta requisições em andamento por criticidade, área e comprador; o histórico recorta
pedidos fechados por natureza do item, região, cidade e grupo de mercadoria. Aplicar um ao outro não teria
sentido, e uma barra só com a união dos campos confundiria as duas leituras.

Dentro da aba, três sub-lentes:

| Sub-aba | Análises |
|---|---|
| **Fornecedores** | Pareto de concentração · fragmentação de compra (pedidos × ticket médio) |
| **Geografia** | Gasto por região de origem · por país · por cidade · matriz grupo × região |
| **Categorias** | Curva ABC dos grupos · risco de fonte única · gasto por família de grupo |

KPIs da aba: gasto, fornecedores (com quantos concentram 80%), ticket médio, percentual de compra
importada e percentual de gasto em fonte única.

### Geografia: dois defeitos de agrupamento

**`regiao_uf` não é UF em compra importada.** No fornecedor estrangeiro o campo carrega o código numérico
de região do país de origem (`120` para Qingdao, na China) ou vem nulo. Plotado cru, misturava estados
brasileiros com números ilegíveis — e escondia que a China responde por **R$ 1,26 mi em 14 linhas, 36% do
gasto do recorte**, a maior concentração geográfica da base. O eixo passou a ser `porRegiao`: UF quando o
país é BR e a sigla tem duas letras, `Exterior · <País>` caso contrário. Entraram também um gráfico por
país e um KPI de compra importada.

| País | Linhas | Gasto |
|---|---|---|
| BR | 634 | R$ 2,17 mi |
| CN | 14 | R$ 1,26 mi |
| IT | 4 | R$ 18 mil |

**Cidades duplicadas por grafia.** `Jacobina`/`JACOBINA` e `Juazeiro`/`JUAZEIRO` viravam duas linhas do
ranking com metade do valor cada — e Jacobina é a praça de maior volume do recorte (331 linhas).
`criarCanonicalizadorCidade` agrupa pela forma normalizada (NFD + remoção de diacríticos + caixa alta) e
exibe a variante mais frequente, para o rótulo continuar sendo um nome presente no dado. Empate resolve por
ordem alfabética, só para o resultado ser estável entre execuções.

O canonicalizador é construído sobre a base inteira, não sobre o recorte filtrado: resolvido dentro do
filtro, o rótulo canônico mudaria conforme o usuário filtra, e a mesma cidade apareceria com nomes
diferentes em recortes diferentes.

### Escolhas de análise que merecem justificativa

- **Risco de fonte única** ordena por valor, não por número de fornecedores: um grupo monofornecedor de
  R$ 2 mil não é problema; um de R$ 400 mil é. A coluna de **dominância** cobre o caso que a contagem
  esconde — três fornecedores no grupo com um deles detendo 97% é concentração disfarçada de pluralidade.
- **Fragmentação** é dispersão, não tabela: o achado está na combinação de muitos pedidos com ticket baixo,
  e nenhuma ordenação de coluna isola esse quadrante. O corte usa a **mediana** do ticket, não a média —
  um pedido de milhões desloca a média a ponto de quase todos virarem "ticket baixo".
- **Matriz grupo × UF** soma o que não cabe no corte em "Outros" em vez de descartar: margens que não fecham
  com o total da página destroem a confiança nos dois números.
- **ABC** classifica pelo acumulado inclusive — o item que cruza a linha dos 80% entra em A, senão a classe
  somaria menos que os 80% que promete cobrir.

## Fora de escopo (deliberado)

- **Dispersão de preço do mesmo material entre fornecedores.** Seria a análise de saving mais direta, mas o
  campo `por` (base de preço do SAP) varia entre pedidos e falsearia a comparação unitária. Mostrar um
  "saving" que é artefato de unidade é pior que não mostrar.
- **OTD histórico por fornecedor.** Viável (`data_migo` 100%), mas duplicaria o que a página Gestão de
  Suprimentos já responde.
- **Série temporal.** O volume do recorte não sustenta (ver perfil do dado).

## Verificação

- `npm run lint` (tsc) e `npm run build` limpos.
- Migrações aplicadas e conferidas por consulta: total BRL bate com a soma da tabela crua
  (R$ 3.447.785), `grp_mercads` e `cidade` a 100%, split Projeto/Consumo confere.
- Renderização validada em navegador com harness descartável de 652 linhas sintéticas na cardinalidade
  real: os sete painéis desenham com dados, os sete degradam para estado vazio sem quebrar, e as margens
  da matriz fecham com o total.
- Lógica de geografia coberta por 14 asserções sobre casos tirados do dado real (grafias de Jacobina,
  Juazeiro e São Paulo; China com `regiao_uf = '120'`; Itália com região nula). Verificam que as cidades
  fundem e somam corretamente, que nenhum código numérico sobrevive no eixo de região e que a maior região
  por valor é a China. Executadas com `tsx` num arquivo descartável — o projeto não tem runner de teste,
  então elas não ficaram no repositório; as funções são puras e prontas para virar teste quando houver um.
- `dataset_versions.historico_pedidos` incrementada (17 → 18) para que os clientes rebaixem a view com as
  colunas novas em vez de servir cache antigo sem `grp_mercads` e `tipo_item`.
