# Plano de Implementação — Redução de Egress (Supabase)

> Objetivo: reduzir o consumo de egress do Supabase (hoje ~1–1,5 GB/dia em pico,
> 2,86 GB no período contra o limite de 5 GB do Free Plan) sem alterar o
> comportamento funcional percebido pelo usuário.

## Diagnóstico

### 1. Sincronização full em cada boot (maior ofensor)
[`App.tsx:184`](src/App.tsx#L184) chama `localDb.syncFromSupabase()` em **toda** inicialização do app.
[`syncFromSupabase`](src/db/localDb.ts#L108-L144) baixa **17 tabelas/views inteiras** via
[`fetchAllFromTable`](src/db/localDb.ts#L1219-L1231), com `select('*')` e paginação completa.

- Views `view_enriched_pedidos`, `view_enriched_requisicoes`, `pedidosforn`, `contatos`
  usam `alwaysSet: true` → **sempre rebaixam tudo, sem guard de cache**.
- Sem sync incremental: nunca filtra por `updated_at > último_sync`.
- `select('*')` traz colunas pesadas (`campos_extras` JSON, textos técnicos, colunas
  derivadas das views: `dias_em_aberto`, `faixa_atraso`, `alerta`, `status_atualizado`).

### 2. Catálogo SAP (Materials)
- **Primeiro load em cada navegador/dispositivo**: [`syncMaterials`](src/db/localDb.ts#L174-L191)
  baixa ~180k linhas com `select('*')`. Tem guard (pula se cache local existe), mas o
  primeiro download é pesado e inclui `technical_text`.
- **Toda importação** ([`importMaterials`](src/db/localDb.ts#L1233-L1246)) re-baixa o
  catálogo **inteiro** com `fetchAllFromTable('materials', '*')` para deduplicar antes do
  upsert. Egress massivo e recorrente a cada importação.
- **Busca/listagem** ([`Materials.tsx:115`](src/views/Materials.tsx#L115)): paginada (50/pág,
  bom), mas `select('*')` traz `technical_text` de todas as linhas exibidas sem necessidade.
- **Export CSV** ([`Materials.tsx:200`](src/views/Materials.tsx#L200)): até 20k linhas com
  `select('*')` — sob demanda, aceitável, mas otimizável.

### 3. Syncs duplicados em telas
- [`Fornecedores.tsx:144,458`](src/views/Fornecedores.tsx#L144) disparam
  `syncFromSupabase()` **completo** após cada cadastro/edição de contato.

---

## Fases de implementação

### FASE 1 — Ganhos rápidos no sync (impacto: −60 a −80% egress)

**1.1 — Cache-guard + TTL nas fontes pesadas**
- [ ] Criar helper `shouldSync(key, ttlMinutes)` usando `sisten_last_sync_<tabela>` no IndexedDB.
- [ ] Em [`syncFromSupabase`](src/db/localDb.ts#L108), pular tabelas cujo último sync foi
      há menos que o TTL (sugestão: 15 min para views SAP, 5 min para requests/notifications).
- [ ] Substituir `alwaysSet: true` por lógica de guard nas 4 fontes pesadas.
- [ ] Manter botão "Atualizar" em [`AdminPanel.tsx:390`](src/views/AdminPanel.tsx#L390) forçando sync completo (bypass do TTL).

**1.2 — Sync incremental por `updated_at`**
- [ ] Guardar `max(updated_at)` recebido por tabela após cada sync.
- [ ] Em [`syncSimpleTable`](src/db/localDb.ts#L193), aplicar `.gt('updated_at', lastSync)`
      e fazer **merge** no cache (upsert por id) em vez de substituir o array inteiro.
- [ ] Pré-requisito: garantir coluna `updated_at` nas tabelas base e expô-la nas views
      (ver seção Migrations SQL). Já existe em `pedidosforn` e `contatos`.

**1.3 — Colunas explícitas no lugar de `select('*')`**
- [ ] Nos syncs de listagem, selecionar apenas as colunas usadas na UI. Prioridade:
      `pedidosforn` (excluir `campos_extras`), views enriquecidas, `contatos`.

### FASE 2 — Catálogo SAP (impacto: −10 a −20% adicional + corta picos de importação)

**2.1 — Importação sem re-download total**
- [ ] Em [`importMaterials`](src/db/localDb.ts#L1233), substituir o
      `fetchAllFromTable('materials', '*')` por uma das opções:
      (a) upsert com `onConflict: 'material_code'` deixando o Postgres resolver duplicatas
      (elimina a necessidade de baixar o catálogo para deduplicar), ou
      (b) baixar apenas `material_code` (uma coluna) para o diff, não `*`.
- [ ] Recalcular soft-delete (`is_active=false` dos ausentes) via query server-side
      (`NOT IN` / `EXCEPT`) em vez de comparar arrays em memória.

**2.2 — Busca com colunas mínimas**
- [ ] [`Materials.tsx:115`](src/views/Materials.tsx#L115): trocar `select('*', {count})` por
      `select('id,material_code,description,technical_text,category,company,unit', {count})`.
      (Já é o conjunto exibido; só remove colunas extras eventuais.)
- [ ] Avaliar `count: 'estimated'` ou `'planned'` no lugar de `'exact'` para reduzir custo
      quando a contagem exata não é crítica.

**2.3 — Export CSV enxuto**
- [ ] [`Materials.tsx:200`](src/views/Materials.tsx#L200): `select` apenas das 6 colunas
      exportadas no CSV, não `*`.

### FASE 3 — Sync sob demanda por rota (impacto: menos egress por usuário)

- [ ] Não sincronizar dados SAP (`pedidosforn`, `contatos`, views) no boot para todos.
      Disparar sync dessas fontes apenas ao entrar nas rotas `/suprimentos/*`.
      Solicitantes/atendentes deixam de baixar dados que nunca visualizam.
- [ ] [`Fornecedores.tsx:144,458`](src/views/Fornecedores.tsx#L144): trocar
      `syncFromSupabase()` completo por sync incremental só de `contatos`.

### FASE 4 — Governança e medição

- [ ] Logar tamanho/contagem de cada sync (dev) para medir antes/depois.
- [ ] Mover colunas derivadas das views enriquecidas ([`types.ts:228-232`](src/types.ts#L228-L232))
      para cálculo no cliente; trafegar só campos-base.
- [ ] (Se aplicável) RLS + filtros por grupo de comprador/setor para não trafegar linhas
      que o usuário não pode ver.

---

## Migrations SQL necessárias (pré-requisito da Fase 1.2)

```sql
-- Garantir updated_at nas tabelas base (exemplo para requests; repetir p/ demais)
ALTER TABLE requests ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Expor updated_at nas views enriquecidas (recriar a view incluindo a coluna base)
-- view_enriched_pedidos / view_enriched_requisicoes: adicionar b.updated_at no SELECT.
```

Tabelas que precisam de verificação/coluna `updated_at`: `requests`, `request_items`,
`request_comments`, `request_status_history`, `notifications`, `import_logs`,
`obs_historico`, `activity_logs`. (`pedidosforn`, `contatos` já possuem.)

---

## Ordem de execução recomendada

| Ordem | Item | Risco | Ganho |
|-------|------|-------|-------|
| 1 | Fase 1.1 (cache-guard + TTL) | Baixo | Alto |
| 2 | Fase 2.1 (importação sem re-download) | Médio | Alto (corta picos) |
| 3 | Fase 1.3 + 2.2 + 2.3 (colunas explícitas) | Baixo | Médio |
| 4 | Migrations + Fase 1.2 (incremental) | Médio | Alto |
| 5 | Fase 3 (sync por rota) | Médio | Médio |
| 6 | Fase 4 (governança) | Baixo | Contínuo |

**Meta:** sair de ~GB/dia para dezenas de MB/dia em regime permanente, mantendo o app
utilizável offline via cache IndexedDB.

## Checklist de verificação

- [ ] Boot do app não dispara download full das views SAP quando cache é fresco (TTL válido).
- [ ] Importação de materiais não re-baixa o catálogo inteiro.
- [ ] Buscas e exports selecionam apenas colunas necessárias.
- [ ] Sync incremental traz apenas linhas com `updated_at` novo.
- [ ] Egress diário medido antes/depois no dashboard do Supabase confirma a redução.
