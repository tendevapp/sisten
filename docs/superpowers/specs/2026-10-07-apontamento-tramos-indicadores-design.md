# Apontamento por tramo e indicadores de avanço — design

Data: 07/10/2026 · Escopo: `/producao/apontamentos` (e o que ele alimenta em `/producao/entrega`)

A planilha "PROD — Avanço de Produção" sai de uso e o SISTEN assume tanto o
lançamento quanto as análises. A carga do histórico já foi feita
(`prod_apt_tramo_eventos` + `prod_apt_tramos_atual`). Este documento cobre o
que vem depois: como a produção aponta no dia a dia e como as análises da
planilha aparecem — melhores — no sistema.

## 1. O que a planilha faz hoje

### Aba TRAMOS (lançamento)

Uma linha por tramo. A produção digita só 9 colunas e o resto é fórmula.

| Entrada | Calculado a partir dela |
|---|---|
| Setor, Atividade (texto livre) | — |
| Reparo de Solda (total) | — |
| Início | Mês NAV01 |
| Liberado p/ NAV02 | Semana, Mês |
| Liberado p/ Jato ("BLACK") | Semana, Mês, **Dias** = NAV02→Jato |
| Liberado p/ Pátio ("Greentag"/"Montado") | Semana, Mês, **Dias** = Jato→Pátio, **Dias em Processo** = NAV02→Pátio |
| Expedido | Semana, Mês, **Dias** = Pátio→Expedido, **Início × Fim** = Início→Expedido |

Conferido na linha 3147: 28/05→10/07 = 43, 10/07→18/08 = 39, 28/05→18/08 = 82,
04/05→28/08 = 116.

### Resumo mensal (2ª imagem)

- Plan × Real por mês para três marcos: NAV01, Jato e Greentag. O Real fica
  verde quando bate a meta e vermelho quando não bate.
- Linha de saldo (115 − realizado = 27 / 53 / 79). Embaixo dela vem o
  **ritmo necessário**: saldo ÷ dias úteis restantes (1,04 / 1,04 / 1,55
  tramo/dia).
- As colunas "Jato" e "Greentag" são tramos por dia útil. A planilha mistura
  as bases: Jato usa o *plano* e Greentag usa o *real*.
- Um gráfico de barras por marco, com a barra TOTAL.

### Acompanhamento do Jato (3ª imagem)

- Meta **semanal** do Jato (W32–W48, 4 a 6 por semana). Os outros marcos só
  têm meta mensal.
- Barras semanais Plan × Real e curva S acumulada (75 planejados × 61
  realizados em W40).

### O que a planilha não mostra

- Quanto tempo o tramo **está parado agora**. Os "Dias" só existem depois
  que o marco seguinte acontece.
- Quando o saldo termina se o ritmo atual continuar.
- Reparos de solda como indicador. Hoje é só um número por linha (o 3152 tem
  71).
- Torres completas: os 5 tramos da mesma torre prontos para expedir.

## 2. Problemas no SISTEN hoje

1. **A tela nova não está no ar.** A aba "Lançar" ainda renderiza o POC
   `ApontamentosTorresFluxo` (que grava em `prod_apt_tramos`/`prod_apt_operacoes`).
   `ApontamentoTramos.tsx` existe, mas nenhuma tela o importa. Ele também usa
   `toISOString()` para "hoje", então passa a gravar o dia seguinte depois das
   21h.
2. **O tramo tem quatro estados paralelos.**
   - `prod_tramos_entrega.etapa_categoria`: cilindros, WIP e Visão Expedição,
     editado à mão.
   - `prod_apt_operacoes`: o POC.
   - `prod_apt_tramo_eventos`: o razão novo.
   - `prod_apt_lancamentos`: o agregado por etapa.

   Se o mesmo tramo for liberado para o Jato em um deles, os outros não ficam
   sabendo.
3. **Os códigos colidem.** `prod_apt_proximo_codigo_tramo` conta só
   `prod_apt_tramo_eventos` e não usa lock. Os lançamentos agregados também
   usam `APT-DDMMYY-NN` com contador próprio, então pode existir
   `APT-071026-01` duas vezes. Dois apontamentos simultâneos também podem
   gerar o mesmo índice. O índice `unique` evita o dado errado, mas o segundo
   apontamento falha.
4. **A cronologia só é validada em um caso, e não há correção.**
   - O servidor só checa Jato ≥ NAV02. Expedido antes do Pátio, por exemplo,
     passa.
   - `corrigirEventoTramo` está no plano, mas não foi feito. Um marco lançado
     errado fica preso pelo índice único.
5. **Não funciona sem rede.** `prod_apt_salvar_evento_tramo` não está em
   `configFormularios.ts` (regra 3 do CLAUDE.md).
6. **Setor e Atividade são texto livre.** Na planilha aparecem
   "Liberado p/ Pátio (Retrabalho Flange)", "Montagem em Andamento" e
   "Iniciar Montagem". Sem uma lista fechada, não dá para filtrar nem
   contar.
7. **A contagem do contador de importação está errada.** Ele soma +1 mesmo
   quando o `on conflict do nothing` descarta o evento, e reporta mais
   eventos do que gravou.

## 3. Forma de apontamento proposta

### Princípio: apontar é avançar um tramo, não preencher uma linha

O tramo segue uma trilha fixa:
**Início → Liberado NAV02 → Liberado Jato → [Montagem] → Liberado Pátio → Expedido**.

Quem aponta só precisa dizer *qual tramo* e *que dia*. O próximo marco é
óbvio pela posição atual.

### Tela "Apontar" — quadro por etapa (substitui o POC)

```
┌ Buscar série… [3152]   Filtro: T1 T2 T3 T4 T5   Torre: [todas] ┐
│ NAV01 (8)    │ NAV02 (18)   │ Jato/Montagem (26) │ Pátio (10) │ Expedido (26)
│ 3207 T5  4d  │ 3183 T1 29d🔴│ 3161 T4  85d 🔴    │ 3154 T2 …  │ (recolhido)
│ …            │ …            │ …                  │ …          │
│ [Selecionar vários]                                            │
└────────────────────────────────────────────────────────────────┘
```

- **Colunas = marco atual** (vem da view). Cada cartão mostra série, tramo,
  torre e **dias na etapa** (hoje − data do último marco): âmbar a partir de
  um limite, vermelho a partir de outro, configuráveis. O líder vê na hora
  quem está parado.
- **Toque no cartão** abre uma bottom sheet com:
  - um botão grande com o próximo marco ("Liberar p/ Jato"). A data começa
    em hoje (`hojeLocal()`), com atalhos "ontem" e "escolher";
  - a situação em **chips** da etapa (lista fechada, ver abaixo) e a
    observação opcional;
  - reparos de solda com **+ / −**, registrados como evento ("+2 reparos em
    07/10"), não como total sobrescrito;
  - a linha do tempo do tramo: marcos, quem lançou e o código APT, além da
    origem "importado da planilha L42".
- **Selecionar vários.** Marque N cartões da mesma coluna e aplique o mesmo
  marco e a mesma data. A planilha mostra várias liberações no mesmo dia, e
  hoje isso vira N formulários. O RPC recebe um lote e grava tudo ou nada.
- **Corrigir.** O autor ou um admin corrige no menu do marco, com motivo
  obrigatório. O evento antigo é excluído por soft delete e o novo aponta para
  ele (`corrige_evento_id`). Não existe edição silenciosa.
- **Desktop:** o mesmo quadro, com um botão para alternar para a **tabela
  estilo planilha** (as colunas da aba TRAMOS, ordenável e com filtro), para
  quem prefere ver tudo. A tabela não aceita edição. Para editar, abre a
  mesma sheet.
- **Celular:** uma coluna por vez, em abas roláveis, com a contagem no
  título.

### Situação: lista fechada por etapa

A planilha usa "Setor + Atividade". Eles viram uma situação escolhida de
uma lista editável em Cadastros, por etapa. Exemplos tirados da planilha:

- **Montagem:** Iniciar Montagem, Montagem em Andamento.
- **Pátio:** Liberado, Retrabalho Flange.
- **Jato:** Em fila, Jateando.

O texto livre fica só na observação. O setor deixa de ser campo: ele decorre
do marco atual.

### Regras no banco (o RPC é a barreira, não a tela)

- A data de cada marco precisa ficar entre o marco anterior e o seguinte que
  já existirem. A regra vale para os 5 marcos, nos dois sentidos.
- A data não pode ser futura. Mais de 7 dias para trás exige observação (para
  pegar erro de digitação).
- O código vem de um contador **único** `APT` para as duas tabelas, com
  `pg_advisory_xact_lock` por data. Reaproveita `prod_apt_proximo_codigo`.
- O RPC de lote e o de correção entram em `configFormularios.ts`, com resposta
  provisória. Com resposta offline, a tela mostra "pendente de sincronizar" no
  cartão e não move o cartão de coluna como se estivesse confirmado.

### Uma fonte de verdade para a posição do tramo

O razão `prod_apt_tramo_eventos` passa a ser a fonte dos 5 marcos. O
`/producao/entrega` (cilindros, WIP, Visão Expedição) **lê** de lá a
categoria macro: NAV01, NAV02, Jato, Pátio e Expedido. A
`etapa_categoria` manual continua só para o detalhe *dentro* da etapa
(saw02/saw03/internos/white), que a planilha não tem. A regra de precedência
"o mais recente vence", que o WIP já usa, se estende ao razão. O POC sai da
aba Lançar e as tabelas dele ficam somente leitura até a sua decisão de
aposentá-lo.

## 4. Análises — o que a planilha faz, e melhor

Abas da página: **Apontar · Avanço · Prazos e gargalos · Qualidade · Etapas
por nave** (a tabela atual Programado × Realizado e os relatórios, sem
mudança) · **Programação** · **Cadastros**.

### 4.1 Avanço (substitui a 2ª e a 3ª imagem)

- **Cartões de topo, um por marco:** realizado/115, %, saldo, **ritmo
  necessário** (saldo ÷ dias úteis até o prazo do marco) × **ritmo real**
  (média das últimas 4 semanas) e **previsão de término** no ritmo real.
  O cartão fica vermelho quando a previsão passa do prazo. A planilha só tem
  o ritmo necessário, e com bases misturadas.
- **Tabela mensal Plan × Real** igual à da planilha, com os quatro marcos
  (Expedido entra), a linha TOTAL, a linha Saldo e o verde/vermelho. O mês
  corrente fica neutro até fechar (hoje Outubro aparece vermelho no dia 7).
- **Curva S semanal** com seletor de marco: barras semanais Plan × Real mais
  as linhas acumuladas, mais uma **linha tracejada de projeção** até a W52.
  O marco que só tem meta mensal mostra a curva mensal.
- **Grade de torres** 23 × T1–T5, colorida pelo marco atual: é o layout de
  cilindro que já existe em `TorresEntregaVisual`, reaproveitado. Mostra o
  contador de **torres completas no Pátio**, que é o que destrava a
  expedição.

### 4.2 Prazos e gargalos (as colunas "Dias", que viram indicador)

- **Lead time por trecho:** NAV02→Jato, Jato→Pátio, Pátio→Expedido e
  Início→Expedido. Mostra a mediana e o P80 por mês de conclusão, abertos por
  tipo de tramo (T1–T5). Responde "o Jato está ficando mais lento?".
- **Envelhecimento do WIP:** quanto tempo o tramo está parado *agora*,
  distribuído em faixas (0–15, 16–30, 31–60, >60 dias) por etapa, com a lista
  dos piores. Hoje a planilha esconde, por exemplo, o 3161 parado há 85 dias
  no Jato.
- **Funil atual:** quantos tramos há em cada etapa e quanto cada uma
  represa.

### 4.3 Qualidade

- Reparos de solda por mês e por tipo de tramo, média por tramo e Pareto dos
  tramos com mais reparos. Clicar abre a linha do tempo do tramo.
- Retrabalhos marcados pela situação, como "Retrabalho Flange".

### 4.4 Saídas

- **Exportar XLSX no layout da aba TRAMOS**, para cliente e diretoria que
  ainda leem a planilha.
- **Modo TV**, com Avanço e Envelhecimento, reaproveitando o padrão de
  `producao-dashboards-tv`.

## 5. Programação (metas) por marco

Tabela nova `prod_apt_meta_marco (marco, granularidade 'mes'|'semana',
ano, periodo, quantidade)`, lançada pelo Planejamento (flag
`prod_apt_programar`).

- A meta mensal é a da planilha e cobre os 3 marcos, mais Expedido se
  houver.
- A meta semanal é opcional. Hoje só o Jato tem.
- A previsão (§4.1) usa a semanal quando existe. Senão, usa a mensal.
- Nada é rateado automaticamente de mês para semana. Isso mantém a decisão
  do plano anterior.
- O **prazo final por marco** e o calendário de dias úteis (feriados) ficam
  nesse cadastro. O ritmo necessário depende deles.
- A carga inicial vem da própria planilha (Plan mensal e semanal do Jato).

## 6. Entregas, em ordem

| # | Entrega | Por quê nessa ordem |
|---|---|---|
| 1 | Corrigir a base: cronologia completa, RPC de correção, contador APT único com lock, contador de importação, `hojeLocal` | Sem isso, o apontamento novo grava dado errado |
| 2 | Tela Apontar (quadro + sheet + lote + linha do tempo), situação em lista, registro offline. Sai o POC da aba | A produção para de usar a planilha |
| 3 | `/producao/entrega` lê o marco macro do razão | Acaba com a divergência entre telas |
| 4 | Metas por marco + aba Avanço (cartões, tabela mensal, curva S, grade de torres) | Substitui as imagens 2 e 3 |
| 5 | Prazos e gargalos + Qualidade | O ganho além da planilha |
| 6 | Exportar XLSX + modo TV | Conveniência |

Cada entrega roda `npx tsc --noEmit` e `npx vitest run`. As regras de
cálculo (lead time, envelhecimento, ritmo, projeção, cronologia) ficam em
`src/lib/producaoTramos.ts`, com teste usando os números da planilha como
fixture: 43/39/82/116 na linha 3147 e 27/53/79 de saldo.

## 7. Decisões que dependem de você

1. **Montagem vira marco?** A planilha tem o setor "Montagem" entre o Jato e
   o Pátio, mas sem data. Com o marco "Início Montagem", o trecho Jato→Pátio
   se divide em fila e montagem. *Recomendo sim.*
2. **Real NAV01 = 80 ou 88?** A planilha mostra 88, mas só há 80 datas de
   "Liberado p/ NAV02". 88 é a contagem de *Início*. O SISTEN vai mostrar 80
   como NAV01 concluído. A produção precisa saber disso antes de comparar com
   a planilha.
3. **Quem pode lançar cada marco?** "Greentag" sugere liberação da Qualidade.
   *Recomendo:* Liberado p/ Pátio só pelo setor Qualidade (padrão dos
   checklists); os demais marcos por quem tem acesso à página.
4. **Prazo de cada marco** para o ritmo necessário. A planilha usa 26 dias
   úteis para NAV01 e 51 para Jato/Greentag. Quais são as datas?
5. **`/producao/entrega` passa a seguir o razão** (§3, última parte)?
   *Recomendo sim.* É o único jeito de as telas não se contradizerem.
6. **Aposentar o POC** (`prod_apt_tramos` / `prod_apt_operacoes`, 8 tramos
   e 28 operações de demonstração) depois de um ciclo usando a tela nova.
