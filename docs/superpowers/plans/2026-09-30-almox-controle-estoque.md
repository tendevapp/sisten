# Almox Controle de Estoque Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a página `Almoxarifado > Controle de Estoque`, reproduzindo as funções operacionais da planilha `1. Controle de Stk V2.0.xlsm`, sem duplicar as bases SAP já existentes no Supabase e sem substituir o método atual de estoque mínimo do SISTEN.

**Architecture:** A página terá uma linha consolidada por material, com detalhamento por depósito, RM, pedido e recebimento. Uma view SQL entregará fatos agregados das bases ZL0024, MB51, ME5A e ZL0132; funções TypeScript puras calcularão a faixa da planilha e continuarão usando, em paralelo, a recomendação estatística existente em `reposicao.ts`. Parâmetros e exceções manuais ficarão em tabelas próprias, auditadas e protegidas por RLS.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, Recharts, Supabase/Postgres 17, Vitest e SheetJS para exportação.

## Global Constraints

- O arquivo XLSM é somente fonte de regra; não editar nem importar suas abas como nova base operacional.
- Reutilizar `sap_zl0024_stk`, `sap_mb51_mov`/`vw_mb51_classificado`, `sap_me5a_rc`/`vw_demandas`, `sap_zl0132_po`, `cadastro_grupo_mercadoria` e as views de BOM já existentes.
- Não substituir `vw_estoque_reposicao` nem `calcularSugestao`; a faixa da planilha e o mínimo recomendado do SISTEN devem aparecer com nomes distintos.
- O grão principal é um material por linha. Depósitos, RMs e POs múltiplos aparecem no detalhamento e nunca duplicam o KPI de materiais.
- Toda exceção manual exige justificativa, usuário e data. Registros são inativados, não apagados fisicamente.
- A nova página nasce restrita: `defaultRoles: ['admin']`; concessões adicionais passam pela Gestão de Acessos.
- Views expostas usam `security_invoker = true`; tabelas novas usam RLS com autorização por `profiles.page_access`/papel administrativo.
- Em mobile, usar cartões para a tabela ampla e abas horizontais não encolhíveis.
- Exportações devem usar exatamente o conjunto filtrado visível na página.
- Verificação obrigatória: testes focados, `npx tsc --noEmit`, `npx vitest run` e `npm run build`, separando erros preexistentes de regressões.

---

## Diagnóstico da planilha e do sistema atual

### Bases da planilha e origem no Supabase

| Planilha | Uso | Fonte recomendada no SISTEN |
|---|---|---|
| `CADASTRO` / `Aba_dados` | descrição, categoria, aplicação, tipo de gestão, depósito e consumo por torre | `sap_zl0169_162_catalogo`, `cadastro_grupo_mercadoria`, `alm_catalogo_itens`, `sap_zl0024_stk` e `vw_proj_bom_arvore`; apenas tipo de gestão e exceções precisam de persistência própria |
| `ZL0024-Stk` / `Stk_Base` | saldo, unidade, valor, preço unitário e curva ABC | `sap_zl0024_stk` |
| `MB51_BASE` | entradas, consumo, produção, valores e séries temporais | `sap_mb51_mov` e `vw_mb51_classificado` |
| `ME5A_RMs` | RM, data, requisitante, quantidade e pedido | `sap_me5a_rc`, `vw_demandas` e `vw_sap_requisicoes_enriquecidas` |
| `ME2N_Pedidos` | pedido, fornecedor, quantidades, valores e pendências | `sap_zl0132_po`; não criar uma segunda tabela ME2N |
| `CONTROLE MINIMO` | consolidação e decisão de reposição | nova `vw_almox_controle_estoque`, estendendo fatos já disponíveis em `vw_estoque_reposicao` |

O schema ativo foi conferido em 30/09/2026: 2.547 linhas na ZL0024, 41.028 na MB51, 2.889 na ME5A, 66.939 em pedidos e 2.210 materiais em `vw_estoque_reposicao`.

### Fórmulas da aba `CONTROLE MINIMO`

Parâmetros globais:

```text
data_inicial = MIN(MB51.data_lancamento)
data_final = MAX(MB51.data_lancamento)
dias_uteis = NETWORKDAYS(data_inicial, data_final)
intervalo_compra_dias = 30
lead_time_padrao_dias = 15
```

Regra por material:

```text
entrada = soma das quantidades 101/102
baixa_direta = soma das quantidades 221/222
producao = soma das quantidades 311/312
consumo = baixa_direta + producao
consumo_dia = consumo / dias_uteis

estoque_minimo_planilha = ceil(consumo_dia * (lead_time + intervalo_compra))
estoque_maximo_planilha = floor(estoque_minimo_planilha + consumo_dia * (lead_time + intervalo_compra))
quantidade_comprar_planilha = max(estoque_maximo_planilha - saldo_atual, 0)
valor_compra_planilha = quantidade_comprar_planilha * preco_unitario

status_planilha =
  CRITICO, quando saldo_atual < estoque_minimo_planilha
  ALERTA, quando saldo_atual < estoque_maximo_planilha
  OK, nos demais casos

cobertura_dias = floor(saldo_atual / consumo_dia)
autonomia_torres = saldo_atual / quantidade_por_torre
```

Rastreio de compra:

```text
RM/data/requisitante/quantidade = procura do material na ME5A
pedido = pedido associado à RM
recebido = soma MB51 101/102 pelo par material + pedido
data_recebimento = maior data MB51 do par material + pedido
```

### Diferenças que a implementação deve tornar visíveis

- A planilha analisada cobre 03/03/2026 a 29/09/2026 e usa 151 dias úteis; o Supabase contém MB51 desde 05/01/2026 e a view atual do SISTEN inicia a produção efetiva em 01/05/2026.
- A planilha usa lead time fixo de 15 dias e intervalo de compra de 30 dias. O SISTEN mede lead time real e protege a demanda irregular pelo percentil 90.
- O XLSM tem 2.265 linhas, mas apenas 2.166 materiais únicos: 99 materiais aparecem duas vezes. O sistema deve consolidar o material e abrir depósitos em drill-down.
- `XLOOKUP` retorna apenas a primeira RM/PO/linha de estoque. A página deve agregar múltiplos registros e permitir inspecioná-los.
- Há exceções manuais ocultas em colunas calculadas: `L25`, `U1150:U1153` e `W1724`. A página deve modelar essas exceções como overrides auditados.
- `AK1` e `AL1` têm `#REF!`; esses totais quebrados não serão reproduzidos.

### Decisão funcional adotada

A página exibirá dois resultados independentes:

1. **Faixa operacional da planilha**: reprodução auditável das fórmulas acima, com janela, lead time e intervalo de compra visíveis.
2. **Mínimo recomendado SISTEN**: resultado atual de `calcularSugestao`, baseado em janela de produção, lead time medido, frequência, variabilidade e percentil 90.

O status principal da página será o da faixa operacional da planilha, porque esse é o processo solicitado. A recomendação SISTEN aparecerá ao lado como análise adicional e nunca sobrescreverá o valor operacional ou o PMM SAP.

---

## File Structure

- Create via `supabase migration new almox_controle_estoque`: migration gerada pela CLI com tabelas de parâmetros/overrides, view, RLS, índices e grants.
- Create: `src/lib/controleEstoque.ts` — tipos de domínio e fórmulas puras da planilha.
- Create: `src/lib/controleEstoque.test.ts` — paridade das fórmulas, duplicidades e exceções.
- Create: `src/lib/controleEstoqueApi.ts` — leitura da view e CRUD auditado dos parâmetros.
- Create: `src/lib/controleEstoqueApi.test.ts` — contratos de payload e tratamento de erro.
- Create: `src/lib/controleEstoqueExport.ts` — exportação do dataset filtrado.
- Create: `src/lib/controleEstoqueExport.test.ts` — conteúdo e tipagem das colunas exportadas.
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueResumo.tsx` — KPIs e séries.
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueFiltros.tsx` — filtros compartilhados.
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueTabela.tsx` — tabela desktop e cartões mobile.
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueDetalhe.tsx` — depósitos, memória de cálculo, RMs, POs e recebimentos.
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueParametrosModal.tsx` — edição de configuração e overrides.
- Create: `src/components/almoxarifado/EstoqueMinimoPanel.tsx` — componente compartilhado extraído da aba atual.
- Create: `src/views/ControleEstoque.tsx` — orquestração da nova página.
- Modify: `src/views/Movimentacoes.tsx` — usar o componente compartilhado sem alterar comportamento.
- Modify: `src/types.ts` — contratos da view e das tabelas de parâmetros.
- Modify: `src/db/database.types.ts` — regenerar a partir do schema aplicado.
- Modify: `src/App.tsx` — lazy import, rota e gate.
- Modify: `src/lib/pages.ts` — página `almox_controle_estoque`, restrita por padrão.
- Modify: `src/data/diretrizes.ts` — registrar regra, fontes e diferença entre os dois métodos.

---

### Task 1: Fixar a paridade da planilha em testes

**Files:**
- Create: `src/lib/controleEstoque.ts`
- Create: `src/lib/controleEstoque.test.ts`

**Interfaces:**
- Produces: `calcularFaixaPlanilha(input: ControleEstoqueCalculoInput): FaixaPlanilha`.
- Produces: `deduplicarControleEstoque(rows): ControleEstoqueMaterial[]`.
- Consumes later: view rows from `controleEstoqueApi.ts`.

- [ ] **Step 1: Escrever testes falhando para as fórmulas**

Cobrir explicitamente: consumo 221/222 + 311/312, dias úteis, mínimo, máximo, compra nunca negativa, status nos limites, cobertura sem divisão por zero e autonomia sem quantidade por torre.

```ts
expect(calcularFaixaPlanilha({
  consumoTotal: 151,
  diasUteis: 151,
  leadTimeDias: 15,
  intervaloCompraDias: 30,
  saldoAtual: 60,
  precoUnitario: 10,
  quantidadePorTorre: 4,
})).toMatchObject({
  consumoDia: 1,
  estoqueMinimo: 45,
  estoqueMaximo: 90,
  quantidadeComprar: 30,
  valorComprar: 300,
  status: 'ALERTA',
  coberturaDias: 60,
  autonomiaTorres: 15,
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/lib/controleEstoque.test.ts`

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar funções puras e tipos discriminados**

Usar `null` para cálculo indisponível; não transformar falta de dado em zero plausível. Manter `statusPlanilha` separado de `recomendacaoSisten`.

- [ ] **Step 4: Testar limites e consolidação por material**

Adicionar cenário com duas linhas do mesmo material em depósitos distintos; o KPI deve contar um material e o detalhe deve manter os dois depósitos.

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run src/lib/controleEstoque.test.ts`

Expected: PASS.

---

### Task 2: Criar persistência auditada para parâmetros e exceções

**Files:**
- Create via CLI: `supabase migration new almox_controle_estoque`
- Modify: arquivo impresso pelo comando dentro de `supabase/migrations/`

**Interfaces:**
- Produces: `almox_controle_estoque_config` com uma configuração ativa por centro.
- Produces: `almox_controle_estoque_override` com chave `material + centro`, soft delete e autoria.

- [ ] **Step 1: Criar a migration pela CLI**

Run: `supabase migration new almox_controle_estoque`

Expected: a CLI imprime o caminho oficial; não criar nome de migration manualmente.

- [ ] **Step 2: Definir configuração global**

Campos mínimos: `centro`, `janela_inicio`, `janela_fim` anulável, `lead_time_padrao_dias` default 15, `intervalo_compra_dias` default 30, `ativo`, `created_at`, `updated_at`, `created_by`, `updated_by`.

- [ ] **Step 3: Definir overrides por material**

Campos mínimos: `material`, `centro`, `tipo_gestao`, `lead_time_dias`, `intervalo_compra_dias`, `estoque_minimo`, `estoque_maximo`, `quantidade_por_torre`, `justificativa`, `ativo`, autoria e timestamps.

- [ ] **Step 4: Adicionar constraints e índices**

Impedir valores negativos; exigir justificativa para mínimo/máximo manual; garantir no máximo um override ativo por `material + centro`; indexar `material`, `centro` e `ativo`.

- [ ] **Step 5: Adicionar RLS e auditoria**

Leitura apenas para usuários com acesso a `almox_controle_estoque`; escrita apenas para administradores ou subpermissão específica. Policies de UPDATE devem ter `USING` e `WITH CHECK`.

- [ ] **Step 6: Verificar em branch/local antes da produção**

Executar a migration, testar SELECT/INSERT/UPDATE com os papéis previstos e confirmar que usuário sem acesso não lê nem grava.

---

### Task 3: Criar a view consolidada de controle

**Files:**
- Modify: mesma migration criada na Task 2
- Reference only: `db/sql/views/estoque_reposicao.sql`
- Reference only: `db/sql/views/movimentacoes_analise.sql`

**Interfaces:**
- Produces: `vw_almox_controle_estoque`, uma linha por material.
- Consumes: ZL0024, MB51 classificada, ME5A/demandas, ZL0132, BOM e overrides.

- [ ] **Step 1: Escrever consultas de reconciliação antes da view**

Fixar resultados esperados para: contagem de materiais únicos, soma de saldo/valor da ZL0024, consumo por TMV, RMs abertas, POs pendentes e recebimentos 101/102.

- [ ] **Step 2: Agregar saldo sem duplicar materiais**

Entregar `saldo_total`, `valor_estoque`, `preco_medio_sap`, `depositos jsonb` e contagem de depósitos. Excluir depósitos inativos apenas da decisão de reposição; manter histórico no detalhamento.

- [ ] **Step 3: Agregar movimentos na janela configurada**

Calcular entrada 101/102, baixa direta 221/222, produção 311/312, quantidade/valor e dias úteis segunda–sexta. Também preservar as categorias atuais de `vw_mb51_classificado` para o método SISTEN.

- [ ] **Step 4: Agregar o ciclo RM → PO → recebimento**

Usar todas as RMs e POs válidos, excluir eliminados/concluídos, somar pendências e produzir arrays JSON para o drill-down. Recebimento deve casar `material + pedido`, considerar 101/102 e expor quantidade líquida e última data.

- [ ] **Step 5: Vincular cadastro e BOM sem escolher valor ambíguo**

Categoria/aplicação vêm dos cadastros existentes. Quantidade por torre só é automática quando projeto e código SAP identificam valor único; em múltiplos projetos, retornar as opções e exigir filtro/override para calcular autonomia.

- [ ] **Step 6: Aplicar view segura**

Usar `WITH (security_invoker = true)`, conceder SELECT a `authenticated` e revogar `anon`.

- [ ] **Step 7: Reconciliar**

Confirmar que a view retorna uma linha por material e que totais batem com as consultas da Step 1 dentro de tolerância monetária de R$ 0,01.

---

### Task 4: Criar API tipada e regenerar tipos Supabase

**Files:**
- Create: `src/lib/controleEstoqueApi.ts`
- Create: `src/lib/controleEstoqueApi.test.ts`
- Modify: `src/types.ts`
- Modify: `src/db/database.types.ts`

**Interfaces:**
- Produces: `listarControleEstoque(filtros)`.
- Produces: `salvarConfigControleEstoque(input, user)`.
- Produces: `salvarOverrideControleEstoque(input, user)` e `inativarOverrideControleEstoque(id, user)`.

- [ ] **Step 1: Regenerar os tipos do projeto**

Gerar `database.types.ts` pelo Supabase após aplicar a migration; não escrever contratos do banco à mão.

- [ ] **Step 2: Escrever testes de payload**

Validar filtros, paginação, autoria, soft delete e preservação de `null` em campos indisponíveis.

- [ ] **Step 3: Implementar leituras e mutações**

Falhas da view devem gerar erro visível; não usar cache silencioso para um dado de reposição potencialmente desatualizado.

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run src/lib/controleEstoqueApi.test.ts`

Expected: PASS.

---

### Task 5: Extrair e preservar o mínimo atual do SISTEN

**Files:**
- Create: `src/components/almoxarifado/EstoqueMinimoPanel.tsx`
- Modify: `src/views/Movimentacoes.tsx`
- Reuse: `src/lib/reposicao.ts`
- Reuse: `src/components/almoxarifado/MetodoMinimoPanel.tsx`

**Interfaces:**
- Produces: componente controlado por props, sem buscar dados por conta própria.
- Consumes: `SugestaoReposicao[]` e metadados da janela.

- [ ] **Step 1: Criar teste de caracterização do painel atual**

Fixar abas, KPIs, recomendações e colunas existentes antes da extração.

- [ ] **Step 2: Extrair JSX da aba `minimo`**

Mover apenas apresentação. Manter carregamento e filtros atuais em `Movimentacoes.tsx`.

- [ ] **Step 3: Usar o mesmo painel na nova página**

O painel deve ser a aba “Mínimo recomendado SISTEN”; a faixa da planilha ficará em aba separada.

- [ ] **Step 4: Rodar regressão focada**

Run: `npx vitest run src/lib/reposicao.test.ts`

Expected: PASS sem mudança de resultados.

---

### Task 6: Construir a nova página e seus filtros

**Files:**
- Create: `src/views/ControleEstoque.tsx`
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueResumo.tsx`
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueFiltros.tsx`
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueTabela.tsx`
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueDetalhe.tsx`

**Interfaces:**
- Consumes: API da Task 4 e cálculos da Task 1.
- Produces: página com abas `Visão geral`, `Faixa da planilha`, `Mínimo SISTEN` e `Entradas x saídas`.

- [ ] **Step 1: Implementar estado único de filtros**

Filtros: busca, centro, depósito, categoria, aplicação, tipo de gestão, status, existência de RM, existência de PO, recebimento, projeto e período.

- [ ] **Step 2: Implementar KPIs equivalentes aos dashboards**

Exibir: SKUs ativos, críticos, alertas, com RM, com PO, valor estimado de compra, valor de entradas, valor consumido, saldo financeiro e valor atual em estoque.

- [ ] **Step 3: Implementar tabela operacional**

Colunas mínimas: material/descrição, categoria/aplicação, saldo, consumo/dia, mínimo, máximo, comprar, valor, status, cobertura, autonomia, RM, PO e recebido. Mostrar selo quando houver override.

- [ ] **Step 4: Implementar detalhe auditável**

Mostrar memória completa da conta, origem de cada parâmetro, depósitos, todas as RMs, todos os POs e todos os recebimentos. Links devem navegar para as telas existentes quando houver rota.

- [ ] **Step 5: Implementar séries e rankings**

Reproduzir as análises úteis do XLSM: entradas x consumo por mês, top consumo, top entrada, curva ABC e distribuição por status/categoria.

- [ ] **Step 6: Implementar estados vazios e responsividade**

Desktop usa tabela; mobile usa cartões. Filtros sem resultado, bases desatualizadas e cálculo indisponível devem ter mensagens específicas.

---

### Task 7: Criar edição segura dos parâmetros

**Files:**
- Create: `src/components/almoxarifado/controleEstoque/ControleEstoqueParametrosModal.tsx`
- Modify: `src/views/ControleEstoque.tsx`

**Interfaces:**
- Consumes: mutações da Task 4.
- Produces: edição global e por material com confirmação e histórico visível.

- [ ] **Step 1: Restringir a UI pela permissão de escrita**

Usuário de leitura vê parâmetros e origem, mas não botões de edição.

- [ ] **Step 2: Validar formulário**

Lead/intervalo/mínimos não negativos; máximo não menor que mínimo; override exige justificativa; `quantidade_por_torre = 0` é inválida.

- [ ] **Step 3: Exibir impacto antes de salvar**

Preview deve comparar resultado atual e proposto: mínimo, máximo, compra, valor e status.

- [ ] **Step 4: Confirmar persistência e auditoria**

Após salvar, recarregar a linha e mostrar usuário/data/justificativa; não assumir sucesso apenas pela resposta HTTP.

---

### Task 8: Exportar o mesmo conjunto filtrado

**Files:**
- Create: `src/lib/controleEstoqueExport.ts`
- Create: `src/lib/controleEstoqueExport.test.ts`
- Modify: `src/views/ControleEstoque.tsx`

**Interfaces:**
- Produces: `exportarControleEstoqueExcel(dataset, filtros, parametros)`.

- [ ] **Step 1: Testar contrato da exportação**

Abas: `Resumo`, `Controle_Estoque`, `Movimentacoes`, `RMs_Pedidos` e `Parametros`. Códigos SAP devem sair como texto.

- [ ] **Step 2: Implementar exportação**

Usar o dataset já filtrado, incluir data/hora e versão/importação de cada base; não refazer consulta com filtros diferentes.

- [ ] **Step 3: Verificar arquivo gerado**

Abrir o XLSX, validar cabeçalhos, datas, números, códigos longos e reconciliação dos totais com a tela.

---

### Task 9: Registrar rota, menu e acesso

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/lib/pages.ts`

**Interfaces:**
- Produces: página `almox_controle_estoque` em `/almoxarifado/controle-estoque`.

- [ ] **Step 1: Registrar definição da página**

Usar label `Controle de Estoque`, grupo `ALMOXARIFADO` e `defaultRoles: ['admin']`.

- [ ] **Step 2: Adicionar lazy import e gate**

Usuário sem permissão retorna ao dashboard; usuário autorizado abre a nova página.

- [ ] **Step 3: Testar concessão granular**

Confirmar página desmarcada para usuário comum e disponível na Gestão de Acessos.

---

### Task 10: Documentar, validar e implantar com reconciliação

**Files:**
- Modify: `src/data/diretrizes.ts`
- Review: todos os arquivos das Tasks 1–9

- [ ] **Step 1: Documentar fontes e regras**

Registrar a diferença entre “Faixa da planilha” e “Mínimo recomendado SISTEN”, o grão por material, os overrides e a política de depósitos inativos.

- [ ] **Step 2: Rodar testes focados**

Run:

```powershell
npx vitest run src/lib/controleEstoque.test.ts src/lib/controleEstoqueApi.test.ts src/lib/controleEstoqueExport.test.ts src/lib/reposicao.test.ts
```

Expected: PASS.

- [ ] **Step 3: Rodar verificações globais**

Run:

```powershell
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: sem regressões nos arquivos tocados; documentar separadamente qualquer falha de baseline.

- [ ] **Step 4: Rodar advisors do Supabase**

Executar advisors de segurança e performance; corrigir RLS, grants, índices ou `security_invoker` antes de produção.

- [ ] **Step 5: Reconciliar amostra e totais**

Comparar pelo menos: um item CRÍTICO, um ALERTA, um OK, um com múltiplos depósitos, um com múltiplas RMs/POs, um com override e um item de projeto com quantidade por torre ambígua.

- [ ] **Step 6: Validar fluxo real**

Com dados recentes, conferir que uma nova importação ZL0024/MB51/ME5A/ZL0132 atualiza a página sem reimportar o XLSM.

- [ ] **Step 7: Validar visualmente desktop e mobile**

Confirmar legibilidade, tabela/cartões, drill-down, filtros, gráficos, exportação e mensagens de base desatualizada.

---

## Acceptance Criteria

- A página abre por rota e permissão própria, restrita por padrão.
- Cada material aparece uma vez; depósitos múltiplos não inflam KPIs.
- As fórmulas da planilha produzem os mesmos resultados para fixtures equivalentes.
- O método atual do SISTEN permanece disponível e inalterado.
- O ciclo RM → PO → recebimento suporta múltiplos registros e não depende do primeiro `XLOOKUP` encontrado.
- Toda exceção manual é explícita, justificada e auditada.
- KPIs, gráficos, tabela e exportação usam o mesmo dataset filtrado.
- RLS/grants/advisors passam, testes focados passam e a build conclui.
- A implantação só é declarada concluída após migration aplicada e reconciliação no ambiente real.

