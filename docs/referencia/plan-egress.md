# Plano de Redução de Egress (Supabase) — v2

> **v1** (cache versionado por importação) está **implementado**. Esta revisão parte
> do código atual, mede o que ainda sai pelo fio e reordena o trabalho pelo que
> realmente pesa hoje.
>
> Medições feitas em 28/07/2026 direto no projeto `fwezzgduywgyhxinjurn`
> (`octet_length(to_jsonb(linha))` = tamanho aproximado do JSON que o PostgREST devolve).

---

## O que já está pronto (v1) — não refazer

Verificado em código, não presumido:

| Item | Onde | Estado |
|------|------|--------|
| Tabela `dataset_versions` + `bump_dataset_version` | [otimizacao_egress.sql](otimizacao_egress.sql) | ✅ |
| Gate de versão no sync geral | [localDb.ts:184](src/db/localDb.ts#L184) (`gated`) | ✅ |
| Carimbo local por dataset | [localDb.ts:398-450](src/db/localDb.ts#L398-L450) | ✅ |
| Catálogo SAP fora do sync (consulta direta paginada) | [localDb.ts:196-199](src/db/localDb.ts#L196-L199) | ✅ |
| `importMaterials` sem re-download de `*` (só `material_code`) | [localDb.ts:1589](src/db/localDb.ts#L1589) | ✅ |
| Corte por data nas bases SAP (`>= 2026-01-01`) | tasks do sync | ✅ |
| Histórico e "Sem PO" com gate próprio | [localDb.ts:2396](src/db/localDb.ts#L2396), [:2470](src/db/localDb.ts#L2470) | ✅ |
| `force=true` nos botões "Atualizar" | Rastreio / SuppliersNoPO / SapDashboards | ✅ |

Consequência: **as bases pesadas já não são o problema.** O problema migrou para o
que ficou *fora* do gate e para a **frequência** com que o sync roda.

---

## Diagnóstico medido (estado atual)

### 🔴 P0 — `import_logs`: 12 MB baixados em **todo** sync

`import_logs` tem 79 linhas e **12 MB de JSON**, quase tudo na coluna `ignored_rows`
(jsonb; 12 MB só nos 26 logs de `PEDIDOSFORN`). O sync a baixa com `select('*')`, **sem gate**:

```
['import_logs', () => this.syncSimpleTable('import_logs', this.importLogsKey)]
```
— [localDb.ts:209](src/db/localDb.ts#L209)

E o sync dispara com muita frequência ([App.tsx](src/App.tsx)):

| Gatilho | Linha | Frequência |
|---------|-------|-----------|
| Boot / login | [App.tsx:163](src/App.tsx#L163), [:198](src/App.tsx#L198) | 1× |
| Polling periódico | [App.tsx:257](src/App.tsx#L257) | a cada **2 min** |
| `focus` + `visibilitychange` | [App.tsx:266](src/App.tsx#L266) | cada volta à aba |
| **Troca de rota** | [App.tsx:288](src/App.tsx#L288) | **cada navegação** |

**Conta:** 12 MB × 30 syncs/hora × 8 h = **~2,9 GB por usuário por dia**, só de logs de
importação — que apenas o AdminPanel lê, e cujo `ignored_rows` só aparece dentro de um
acordeão expandido ([AdminPanel.tsx:1493](src/views/AdminPanel.tsx#L1493)).

Isto sozinho explica o consumo de 1–1,5 GB/dia. **É o item mais barato de corrigir e o de maior ganho.**

### 🟠 P1 — Cadência do sync: nenhum debounce, nenhum TTL

Mesmo com `import_logs` corrigido, cada sync ainda dispara ~14 requests
(`sectors`, `profiles`, `buyer_groups`, `compradores`, `rastreio_prioridades`,
`requests`, `request_items`, `request_comments`, `request_status_history`,
`notifications`, `obs_historico`, `activity_logs`, `sequences` + `dataset_versions`).
São tabelas pequenas hoje, mas:

- `focus` **e** `visibilitychange` disparam juntos no mesmo evento;
- trocar de rota 20× numa sessão = 20 syncs completos;
- o guard `syncPromise` ([localDb.ts:161](src/db/localDb.ts#L161)) só deduplica syncs
  **simultâneos**, não syncs em sequência rápida.

Falta um **TTL mínimo** entre syncs não-forçados.

### 🟠 P2 — `force=true` recarrega **tudo**, não a tela

Os três botões "Atualizar" chamam `syncFromSupabase(true)`
([RastreioCompras.tsx:91](src/views/RastreioCompras.tsx#L91),
[SuppliersNoPO.tsx:569](src/views/SuppliersNoPO.tsx#L569),
[SapDashboards.tsx:97](src/views/SapDashboards.tsx#L97)), que ignora o gate de **todos**
os datasets: `pedidosforn` (2,1 MB), `requisicoes` (3,7 MB), `historico` (364 kB),
`contatos`, **e `cidadeforn` (26 MB)**. Um clique em "Atualizar" no Rastreio custa
**~32 MB** para atualizar dados que cabem em 3,7 MB.

### 🟡 P3 — `cidadeforn`: 26 MB por navegador

78.652 linhas / 26 MB, baixadas inteiras para o cliente
([localDb.ts:216](src/db/localDb.ts#L216)) só para enriquecer a **UF do fornecedor**
([historicoAnalytics.ts:93](src/lib/historicoAnalytics.ts#L93)). Está gated (baixa 1×
por navegador), mas 26 MB × cada dispositivo novo, cada limpeza de cache e cada
`force=true` (P2) é caro demais para uma coluna.

Além disso, **`cidadeforn` não está no seed de `dataset_versions`**
([otimizacao_egress.sql:24-31](otimizacao_egress.sql#L24-L31)) — funciona por acidente
(o `needsSync` sem marcador retorna `false` depois do primeiro download), mas o dataset
fica sem carimbo até a primeira importação. `historico_sem_po` também não está lá.

### 🟡 P4 — `refreshBuyerFieldsFromSupabase` sem delta

Roda a **cada** load de Rastreio e Central de Compras
([localDb.ts:2838](src/db/localDb.ts#L2838)) e baixa as 1.682 requisições de 2026
inteiras (8 colunas) só para descobrir o punhado que mudou. Ordem de 300–500 kB por
abertura de tela. Já usa colunas explícitas (bom), falta filtro incremental.

### ⚪ P5 — `fetchAllFromTable` pagina sem `ORDER BY`

[localDb.ts:1555-1575](src/db/localDb.ts#L1555-L1575) usa `.range(from, from+999)` sem
`.order()`. Em tabelas acima de 1000 linhas (`cidadeforn` 78k, `pedidosforn` 66k,
`materials` 172k) o Postgres **não garante ordem estável entre páginas** — pode repetir
e pular linhas. É um bug de correção que *também* desperdiça egress com linhas duplicadas.

---

## Orçamento: antes × depois

Custo de **um sync leve** (nada mudou no servidor):

| | Hoje | Depois de F1+F2 |
|---|---|---|
| `import_logs` | **12 MB** | ~25 kB |
| demais tabelas pequenas | ~60 kB | ~60 kB |
| `dataset_versions` | <1 kB | <1 kB |
| **Total por sync** | **~12,1 MB** | **~85 kB** (−99,3%) |
| **Por usuário / dia (8 h)** | **~2,9 GB** | **~20 MB** → **~5 MB** com TTL |

---

## Fases

### FASE 1 — `import_logs` fora do caminho quente 🔴 (1 h, risco baixo, −99% do egress atual) ✅ IMPLEMENTADO

- [x] **1.1** `import_logs` sai do `syncSimpleTable` genérico e ganha `syncImportLogs`
      dedicado ([localDb.ts](src/db/localDb.ts)), com colunas explícitas — **sem**
      `ignored_rows`/`missing_ris`.
- [x] **1.2** Colunas geradas `ignored_rows_count`/`missing_ris_count` no banco
      (migração `import_logs_row_counts_and_retention`); [types.ts](src/types.ts) e
      [AdminPanel.tsx](src/views/AdminPanel.tsx) usam essas contagens nos badges.
- [x] **1.3** `fetchImportLogDetail(id)` implementado; AdminPanel busca sob demanda
      ao expandir um log (`handleToggleLog`) e mescla no `fullLog` renderizado.
- [x] **1.4** `syncImportLogs` já faz `.order('created_at', {ascending:false}).limit(50)`.
- [x] **1.5** Retenção aplicada via migração (zera `ignored_rows`/`missing_ris` de logs
      com mais de 90 dias); nenhuma linha afetada ainda (todos os logs são recentes).
      **Falta**: agendar isso como rotina periódica (cron pg) — hoje é só o UPDATE inicial.

### FASE 2 — Cadência do sync 🟠 (2 h, risco baixo) ✅ IMPLEMENTADO

- [x] **2.1** TTL de 60s em `syncFromSupabase` ([localDb.ts](src/db/localDb.ts), campo
      `lastSyncAt`/`syncTTLMs`).
- [x] **2.2** Sync por troca de rota removido de [App.tsx](src/App.tsx); `trackPageView`
      mantido.
- [x] **2.3** `focus`/`visibilitychange` continuam como dois listeners (já eram uma função
      só); o TTL de 2.1 absorve a sobreposição.
- [x] **2.4** Polling pula quando `document.hidden`.
- [x] **2.5** Intervalo subiu de 2 min para 5 min.

### FASE 3 — Escopo do "Atualizar" 🟠 (2 h, risco médio) ✅ IMPLEMENTADO

- [x] **3.1** `syncFromSupabase(force, datasets?)` — segundo parâmetro posicional em vez
      de objeto (mais simples, compatível com todas as chamadas booleanas existentes).
- [x] **3.2** Rastreio e Central de Compras forçam só `['requisicoes','pedidos']`;
      SapDashboards força `['requisicoes','pedidos','pedidosforn']`.
- [x] **3.3** `cidadeforn` nunca entra nos forces acima; só é rebaixada por reimportação
      (bump) ou pelo botão "Sincronizar com o Supabase" do AdminPanel (force total,
      intencional).

### FASE 4 — `cidadeforn` no servidor 🟡 (4 h, risco médio)

- [ ] **4.1** Levar a UF para dentro da view: o `estado_uf` já é escrito em `cidadeforn`
      na importação da ZL0132 ([localDb.ts:3730-3756](src/db/localDb.ts#L3730-L3756)).
      Fazer `vw_historico_pedidos` / `view_enriched_pedidos` entregarem `estado_uf`
      via `join cidadeforn`, e o cliente para de precisar da tabela.
- [ ] **4.2** Remover `cidadeforn` do `syncFromSupabase`; manter `getCidadeForn()` só
      se alguma tela realmente listar endereços (hoje nenhuma lista).
- [ ] **4.3** Se ainda for preciso no cliente: baixar só `forn_codigo,estado_uf`
      (~2 MB em vez de 26 MB).

### FASE 5 — Sync incremental 🟡 (4 h, risco médio)

- [ ] **5.1** `refreshBuyerFieldsFromSupabase`: guardar o maior
      `greatest(item_status_updated_at, obs_updated_at)` local e filtrar `.gt(...)` na
      próxima chamada. Fallback para full quando não houver marca local.
- [ ] **5.2** Mesmo padrão para as tabelas append-only que hoje vêm inteiras
      (`activity_logs`, `obs_historico`, `request_status_history`, `request_comments`):
      filtrar por `created_at > último visto`, mesclando no cache local em vez de substituir.
      Hoje são pequenas — fazer **antes** que cresçam.

### FASE 6 — Correção e governança ⚪

- [x] **6.1** `fetchAllFromTable` ganhou parâmetro `orderCol`, aplicado em todos os
      call sites com PK conhecida: `materials`/`pedidosforn`/`cidadeforn`/`contatos`/
      `estoque` → `id`; `requisicoes`/`view_enriched_requisicoes`/`pedidos`/
      `view_enriched_pedidos` → `ri`; `sequences` → `key`; `compradores` →
      `grupo_compras`. **Exceção documentada**: `vw_historico_pedidos` e
      `vw_historico_fornecedores_sem_po` não têm coluna única — ficaram sem order
      forçado (risco de erro por coluna inexistente > benefício parcial).
- [x] **6.2** Seed de `dataset_versions` migrado (`cidadeforn`, `historico_sem_po`) e
      [otimizacao_egress.sql](otimizacao_egress.sql) atualizado para reproduzir o
      ambiente do zero.
- [x] **6.3** `fetchRemoteMarkers` cacheado por 30s (`markersCache`); `bumpDatasetVersion`
      usa `forceRefresh=true` para nunca ler o carimbo antigo logo após o próprio bump.
- [ ] **6.4** Instrumentar: logar bytes por tabela em cada sync (dev) e comparar com o
      painel de egress do Supabase semanalmente.
- [ ] **6.5** Revisar os `select('*')` restantes — ex.:
      [Fornecedores.tsx:759](src/views/Fornecedores.tsx#L759) (`contatos` com `count:'exact'`).

---

## Ordem de execução

| # | Fase | Esforço | Risco | Ganho medido |
|---|------|---------|-------|--------------|
| 1 | F1 — `import_logs` | 1 h | Baixo | **−99%** do egress corrente |
| 2 | F2 — cadência | 2 h | Baixo | −75% do que sobrar |
| 3 | F3 — escopo do force | 2 h | Médio | −32 MB por clique em "Atualizar" |
| 4 | F6.1/6.2/6.3 — correções | 1 h | Baixo | Correção + ruído |
| 5 | F4 — `cidadeforn` | 4 h | Médio | −26 MB por dispositivo novo |
| 6 | F5 — incremental | 4 h | Médio | Contínuo (evita regressão) |

**F1 + F2 = 3 horas e resolvem o problema.** F3–F6 são consolidação.

---

## Checklist de verificação

- [ ] DevTools → Network, filtrar por `import_logs`: resposta < 50 kB.
- [ ] Um sync leve (nada mudou) transfere **< 100 kB** somados.
- [ ] Navegar por 10 rotas não dispara 10 syncs (TTL de 60 s ativo).
- [ ] Aba em segundo plano por 30 min não gera tráfego.
- [ ] "Atualizar" no Rastreio não baixa `cidadeforn` nem `pedidosforn`.
- [ ] "Atualizar" continua trazendo correções feitas direto no banco.
- [ ] Importação incrementa o carimbo; a próxima abertura reflete os dados novos.
- [ ] Acordeão de log de importação ainda mostra as linhas ignoradas (agora sob demanda).
- [ ] Egress diário no painel do Supabase confirma a queda de GB para dezenas de MB.

---

## Comportamento esperado por cenário

| Cenário | Hoje | Depois |
|---------|------|--------|
| Sync leve (nada mudou) | ~12,1 MB | ~85 kB |
| Usuário 8 h com a aba aberta | ~2,9 GB | ~5 MB |
| Trocar de rota | Sync completo | Nada (cache local) |
| Clicar "Atualizar" no Rastreio | ~32 MB | ~3,7 MB |
| Dispositivo novo (1º acesso) | ~32 MB | ~6 MB |
| Após importação PEDIDOSFORN | Rebaixa a base 1× | Igual (já otimizado) |
