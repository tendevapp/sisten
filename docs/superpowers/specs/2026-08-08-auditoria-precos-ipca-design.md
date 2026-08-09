# Auditoria de Preços — compras de 2026 contra o histórico corrigido pelo IPCA

Data: 2026-08-08

## Pergunta que a tela responde

As compras de 2026 foram boas compras? O critério: o preço unitário pago em 2026 contra o que o
mesmo material custou no passado, cada compra passada trazida a valor de hoje pelo IPCA acumulado
da sua própria data de compra até o último mês publicado.

## Perfil do dado (medido, não presumido)

`pedidosforn` com `crf = 'x'`, quantidade e valor positivos:

| Ano | Linhas | Pedidos | Valor (BRL) |
|---|---|---|---|
| 2015 | 8.620 | 3.210 | R$ 185,9 mi |
| 2016 | 3.906 | 1.591 | R$ 28,5 mi |
| 2017 | 6.760 | 2.305 | R$ 160,3 mi |
| 2018 | 9.170 | 3.404 | R$ 130,0 mi |
| 2019 | 6.971 | 2.301 | R$ 145,3 mi |
| 2020 | 8.452 | 3.156 | R$ 197,9 mi |
| 2021 | 8.516 | 3.507 | R$ 180,8 mi |
| 2022 | 8.428 | 3.507 | R$ 138,1 mi |
| 2023 | 3.804 | 1.637 | R$ 68,8 mi |
| 2024 | 72 | 38 | R$ 0,75 mi |
| 2025 | 5 | 5 | R$ 0,04 mi |
| **2026** | **770** | **323** | **R$ 3,90 mi** |

O histórico é efetivamente 2015–2023; 2024 e 2025 são resíduo (77 linhas). Auditar 2024/2025
separadamente não se sustenta, então o recorte de comparação é "tudo antes de 2026-01-01".

Cobertura do casamento por código de material:

- 517 das 770 linhas de 2026 (67%) têm compra histórica do mesmo material.
- Em valor: **R$ 2,14 mi de R$ 3,90 mi — 55%**. Os 45% restantes são material novo, sem referência.
- Todas as linhas de 2026 têm código de material preenchido (nenhuma nula).

### Dois fatos que sustentam o método

**Unidade de medida é estável por material.** Zero de 15.168 materiais têm mais de uma unidade de
medida entre compras. Comparar `valor_em_brl / qtd_pedido` entre anos é seguro nesse eixo — a
ressalva sobre `por` (base de preço do SAP) da spec de 2026-07-27 não se aplica aqui, porque o
preço unitário é derivado de valor total ÷ quantidade total, não do campo `preco_liquido_unit`.

**O item genérico é mensurável, não precisa de curadoria manual.** Materiais com 5 ou mais compras
históricas e um 2026, classificados pelo desvio-padrão do log do preço unitário:

| Dispersão | Materiais | Leitura |
|---|---|---|
| σ log < 0,2 (≈ ±20%) | 95 | referência confiável |
| 0,2 – 0,5 | 99 | referência utilizável |
| 0,5 – 1,0 | 46 | frouxa |
| **> 1,0** | **35** | **item genérico** |

O caso exemplar: material `20339` "TRANSPORTE RODOVIÁRIO", 1.274 compras entre R$ 0,93 e
R$ 61.669 a unidade. É um código guarda-chuva onde cada linha é um frete diferente. Idem `20037`
"Energia Elétrica", `20348` "Serviço de Comunicação". A própria dispersão histórica os denuncia.

## Decisões de método

### Referência = mediana de todo o histórico, corrigida item a item

Cada compra passada é inflacionada pelo fator `índice_IPCA(mês de referência) /
índice_IPCA(mês da compra)`. A referência do material é a **mediana** dessas compras corrigidas, e
a faixa esperada é o intervalo **P25–P75**.

Mediana e não última compra: uma única compra ruim viraria baliza, e para material comprado uma
só vez em 2016 a referência seria velha demais. Mediana e não mínimo histórico: o mínimo costuma
ser lote grande ou erro de cadastro, e acusaria quase toda compra como ruim.

Percentis e não média porque a distribuição é log-assimétrica — a média é arrastada pelo lote
grande ocasional exatamente nos materiais que mais importam.

### Grau de confiança por material, em vez de filtro duro

| Grau | Regra | Uso |
|---|---|---|
| Alta | `n ≥ 5` e `σ log < 0,35` | entra no número de manchete |
| Média | `n ≥ 3` e `σ log < 0,80` | entra no número de manchete |
| Baixa | resto | listada, marcada, **fora** da manchete |

Nada é apagado da tela. Auditoria exige poder ver o que foi excluído e por quê — um filtro duro
some com ~13% dos materiais sem deixar rastro conferível.

### Lote atípico é marcado e filtrável — e é o achado principal

Confounder descoberto na validação, ausente do pedido original, e que acabou sendo o resultado mais
importante da análise. Sobre as compras de confiança Alta e Média, com o IPCA oficial:

| Tamanho do lote de 2026 vs mediana histórica | Linhas | Razão de preço | Δ |
|---|---|---|---|
| menor que 1/3 | 72 | 1,39 | +R$ 12 mil |
| comparável | 223 | **1,08** | **+R$ 130 mil** |
| maior que 3× | 21 | 0,75 | −R$ 157 mil |

No total, a auditoria fecha em −R$ 3,6 mil (−0,3%) e parece dizer que 2026 comprou exatamente no
preço histórico corrigido. **Não é o que aconteceu.** Vinte e um pedidos de lote grande, com ganho
de escala esperado, cancelam um sobrepreço de 8% espalhado por 223 compras de lote normal. O
número agregado é verdadeiro e enganoso ao mesmo tempo.

Por isso a marca não basta: `lote_atipico` (quantidade fora de `[qtd_mediana/3, qtd_mediana×3]`) é
**filtro de primeira classe** na tela, o KPI de lotes atípicos é clicável e aplica o recorte "lote
comparável", e o KPI de desvio responde ao filtro ativo — é assim que o usuário reproduz a tabela
acima em dois cliques.

Marcar e filtrar, nunca descontar: qualquer normalização por quantidade exigiria uma curva de
elasticidade que o dado não sustenta, e um número ajustado por modelo invisível é pior para
auditoria que um número cru com a ressalva ao lado.

### Veredito por linha

| Veredito | Regra |
|---|---|
| Bom | preço unitário < P25 |
| Na faixa | entre P25 e P75 |
| Atenção | > P75 |
| Sem referência | material sem compra anterior a 2026 |

### O IPCA corrige inflação geral, não preço de commodity

Vergalhão, cobre e frete não seguem IPCA. A correção responde "o preço acompanhou a inflação
geral do país?", não "o preço acompanhou o mercado deste insumo". Índices setoriais (IPA, INCC)
ficam fora de escopo: escolher o índice certo por material exige um de-para que não existe, e
aplicar o errado é pior que aplicar o genérico declarado.

## Arquitetura

Os 66 mil registros históricos não podem ir para o navegador — hoje o `localDb` só sincroniza
`data_doc >= 2026-01-01`. O benchmark é pré-agregado no Postgres; o cliente baixa ~800 linhas.

### `ipca_indice`

`mes date primary key, numero_indice numeric not null`. Semeada por migration com a série 1737
do IBGE (variável 2266, número-índice base dez/1993 = 100), out/2014 até jun/2026 — 141 meses.
Mantida pela Edge Function `atualizar-ipca`, que busca a mesma agregada e faz upsert idempotente.

O **mês de referência** é o maior `mes` da tabela, não a data de hoje: o IPCA de um mês sai por
volta do dia 10 do mês seguinte, e fingir que o mês corrente já tem índice inventaria correção.
A tela exibe qual mês está em uso.

### `mv_benchmark_material`

Uma linha por material com compra anterior a 2026, no mesmo grão da `mv_historico_pedidos`
(material + fornecedor + pedido) para que os dois números da aplicação nunca discordem. Colunas:
`n_compras`, `primeira_compra`, `ultima_compra`, `qtd_mediana`, `ref_p50`, `ref_p25`, `ref_p75`
(já corrigidos), `sd_log`, `confianca`.

### `vw_auditoria_compras`

Compras com `data_doc >= 2026-01-01` no mesmo grão, com `left join` no benchmark — o `left` é o
que preserva as linhas sem referência, que são 45% do valor e precisam aparecer. Expõe
`preco_unit`, `ref_p50/p25/p75`, `delta_pct`, `delta_valor = (preco_unit − ref_p50) × qtd`,
`veredito`, `confianca`, `lote_atipico`.

### `vw_auditoria_historico_material`

Alimenta o drill-down: para cada material comprado em 2026, suas compras passadas com data, preço
nominal, fator IPCA aplicado e preço corrigido. É o que torna a mediana conferível em vez de
mágica. Restrita aos materiais presentes em 2026 para não virar dump da base.

## Página

Nova aba **Auditoria de Preços** em `/suprimentos/historico`, acessível também por
`?tab=auditoria`. A aba Consulta (tabela atual) fica intocada, e seus dados só são baixados quando
ela está à vista. A auditoria tem filtros próprios — confiança, veredito, grupo de mercadoria,
lote e busca — porque recorta uma pergunta diferente da consulta linha a linha.

- **KPIs**: cobertura da análise (% do valor com referência), Δ contra a referência corrigida (só
  Alta + Média), compras acima e abaixo da faixa, lotes atípicos, e o mês do IPCA em uso.
  Cobertura e lotes atípicos descrevem a base inteira; Δ e contagens de veredito respondem ao
  filtro ativo, para o recorte de lote comparável revelar o sobrepreço que o total esconde.
- **Um gráfico**: dispersão Δ% × valor da compra, com o quadrante "caro e grande" destacado. É
  onde está o achado. Série temporal mensal com 323 pedidos produziria barras magras sem leitura.
- **Tabela** com Δ%, Δ R$, faixa P25–P75 e badges de confiança e lote. Cada linha **expande** com
  o histórico do material.
- Export XLSX, como o resto da página.

As quatro ressalvas são elemento de interface, não nota de rodapé: 45% do valor sem referência,
confiança Baixa fora da manchete, lote atípico marcado, IPCA é índice geral.

## Resultado medido

`vw_auditoria_compras`, 746 linhas (grão material + fornecedor + pedido), IPCA até jun/2026:

| Confiança | Linhas | Comprado | Referência | Δ | Bom / Na faixa / Atenção |
|---|---|---|---|---|---|
| Alta | 189 | R$ 1.125 mil | R$ 1.129 mil | −R$ 3,6 mil | 82 / 32 / 75 |
| Média | 127 | R$ 431 mil | R$ 442 mil | −R$ 11,3 mil | 45 / 46 / 36 |
| Baixa | 191 | R$ 583 mil | — | fora da manchete | — |
| Sem referência | 239 | R$ 1.761 mil | — | 45% do valor | — |

A leitura correta não está no total (ver "lote atípico"), está na linha: 111 das 316 compras com
referência confiável ficaram acima do P75 histórico. As duas maiores por desvio são
`1397290` PLACA CABEZZA a +72% e `40277` NOTEBOOK a +159%.

## Verificação

- Lógica pura em `src/lib/auditoriaPrecos.ts` (fator IPCA, grau de confiança, veredito, lote
  atípico, agregação de KPI) coberta por **25 testes vitest**; a suíte inteira passa (79 testes).
- Total da view confere exatamente com a soma da tabela crua: **R$ 3.899.670** dos dois lados.
- Fator IPCA conferido linha a linha contra a série do IBGE: compra de jun/2022 recebe
  7652,37 / 6455,85 = **1,1853**, que é o valor devolvido pela view.
- As três views e a tabela `ipca_indice` lidas com sucesso pela chave anônima (grants corretos),
  incluindo o drill-down por material.
- `npm run lint` (tsc) e `npm run build` limpos.
- **Não verificado em navegador**: a aplicação exige login, e não havia credencial disponível na
  sessão. A renderização da aba não foi vista rodando.

## Fora de escopo (deliberado)

- **Comparação entre fornecedores do mesmo material.** Análise diferente (dispersão intra-período),
  merece tela própria.
- **Índices setoriais** (IPA/INCC) — ver acima.
- **Auditoria de 2024/2025** — 77 linhas, sem volume.
- **Normalização de preço por quantidade** — ver "lote atípico".
