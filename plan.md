# Plano de Implementação — Redução de Egress (Supabase)

> Objetivo: reduzir o egress do Supabase (hoje ~1–1,5 GB/dia em pico, 2,86 GB no
> período contra o limite de 5 GB do Free Plan) adotando uma estratégia
> **local-first**: baixar cada base pesada **uma vez**, mantê-la no IndexedDB e só
> rebaixar quando ela realmente mudar (nova importação).

---

## Princípio central: "baixar uma vez, revalidar barato"

As bases pesadas do app (**Catálogo SAP**, **Histórico de Pedidos**, **Pedidos/Itens
sem PO**, **Contatos**) só mudam quando alguém faz uma **importação**. Entre importações,
os dados são estáticos. Hoje o app os rebaixa em todo boot e em toda navegação — puro
desperdício de egress.

A solução é tratar cada base como um "arquivo versionado":
1. Download completo **na primeira vez** (ou quando a versão muda) → salva no IndexedDB.
2. Nas próximas vezes, buscar apenas um **carimbo de versão** (1 linha, poucos bytes)
   e comparar com a versão local.
   - Igual → usa o cache local. **Egress da base pesada = 0.**
   - Diferente → rebaixa uma vez e atualiza o carimbo local.
3. A importação (única operação que muda os dados) **incrementa o carimbo**.

É o mesmo princípio de um `ETag`/cache condicional HTTP, feito na camada do app.

---

## Diagnóstico atual

### 1. Histórico de Pedidos baixado 3× por sessão (pior caso)
`vw_historico_pedidos` (view/materialized view definida em
[`criar_view_historico_pedidos.sql`](criar_view_historico_pedidos.sql)) é baixada inteira em:
- **Boot** — [`syncFromSupabase`](src/db/localDb.ts#L133) com `alwaysSet: true`.
- **Central de Compras** — [`SuppliersNoPO.tsx:178`](src/views/SuppliersNoPO.tsx#L178) chama
  [`fetchHistoricoPedidos()`](src/db/localDb.ts#L1763) em todo mount.
- **Histórico de Pedidos** — [`HistoricoPedidos.tsx:227`](src/views/HistoricoPedidos.tsx#L227)
  idem, em todo mount.

Nenhuma confere validade do cache — [`fetchHistoricoPedidos`](src/db/localDb.ts#L1763-L1767)
sempre faz `fetchAllFromTable('vw_historico_pedidos')` (paginação completa).

### 2. Sync full de tudo em cada boot
[`App.tsx:184`](src/App.tsx#L184) → [`syncFromSupabase`](src/db/localDb.ts#L108) baixa 17
tabelas/views inteiras via [`fetchAllFromTable`](src/db/localDb.ts#L1219) com `select('*')`.
As bases pesadas (`pedidosforn`, `vw_historico_pedidos`, `contatos`, views enriquecidas)
usam `alwaysSet: true` → sempre rebaixam tudo, sem guard.

### 3. Catálogo SAP
- Primeiro load: [`syncMaterials`](src/db/localDb.ts#L174) baixa ~180k linhas (`select('*')`).
  Tem guard de cache (bom), mas o primeiro download é pesado.
- **Toda importação** re-baixa o catálogo inteiro ([`importMaterials`](src/db/localDb.ts#L1242))
  só para deduplicar.

### 4. Syncs redundantes em telas
- [`Fornecedores.tsx:144,458`](src/views/Fornecedores.tsx#L144) chamam `syncFromSupabase()`
  **completo** após cada cadastro/edição.

---

## Arquitetura proposta

### A) Tabela de versões (carimbo) no Supabase

```sql
create table if not exists public.dataset_versions (
  dataset      text primary key,   -- 'materials' | 'historico_pedidos' | 'pedidosforn' | 'contatos' | 'requisicoes' | 'pedidos'
  version      bigint not null default 1,
  row_count    bigint,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

grant select on public.dataset_versions to anon, authenticated;

-- Incrementa a versão de um dataset (chamado ao fim de cada importação).
create or replace function public.bump_dataset_version(p_dataset text, p_rows bigint, p_user text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.dataset_versions (dataset, version, row_count, updated_at, updated_by)
  values (p_dataset, 1, p_rows, now(), p_user)
  on conflict (dataset) do update
    set version = dataset_versions.version + 1,
        row_count = excluded.row_count,
        updated_at = now(),
        updated_by = excluded.updated_by;
end; $$;

grant execute on function public.bump_dataset_version(text, bigint, text) to anon, authenticated;
```

> Alternativa sem tabela nova: reutilizar `import_logs` pegando `max(created_at)` por
> `type`. Funciona, mas a tabela dedicada é mais barata (1 linha por dataset) e explícita.

### B) Camada de cache versionado no `localDb.ts`

```ts
// Carimbo local por dataset, guardado no IndexedDB junto do cache de dados.
private versionKey = (ds: string) => `sisten_ver_${ds}`;

// Baixa só se a versão remota for diferente da local. Retorna o cache (novo ou existente).
private async syncVersioned<T>(dataset: string, remoteTable: string, storageKey: string): Promise<T[]> {
  const { data: ver } = await supabase
    .from('dataset_versions').select('version').eq('dataset', dataset).maybeSingle();
  const remoteVersion = ver?.version ?? 0;
  const localVersion = this.getStorageItem<number>(this.versionKey(dataset), -1);

  if (remoteVersion === localVersion && this.cache.has(storageKey)) {
    return this.getStorageItem<T[]>(storageKey, []);   // cache válido → 0 egress da base
  }
  const rows = await this.fetchAllFromTable<T>(remoteTable);   // rebaixa uma vez
  this.setStorageItem(storageKey, rows);
  this.setStorageItem(this.versionKey(dataset), remoteVersion);
  return rows;
}
```

---

## Fases de implementação

### FASE 1 — Cache versionado das bases pesadas (impacto: −70 a −85% egress)

- [ ] **1.1** Criar tabela `dataset_versions` + função `bump_dataset_version` (SQL acima).
- [ ] **1.2** Implementar `syncVersioned` e `versionKey` no [`localDb.ts`](src/db/localDb.ts).
- [ ] **1.3** Migrar as bases pesadas para `syncVersioned` em
      [`syncFromSupabase`](src/db/localDb.ts#L108): `materials`, `vw_historico_pedidos`,
      `pedidosforn`, `contatos`, `view_enriched_requisicoes`, `view_enriched_pedidos`.
      Remover o `alwaysSet: true` dessas fontes.
- [ ] **1.4** Chamar `bump_dataset_version` ao fim de cada importação correspondente
      (materiais, ME5A, ZL0132, PEDIDOSFORN, contatos). O import já roda; só adicionar 1 RPC.

### FASE 2 — Eliminar re-downloads nas telas (impacto: corta os 2×/3× por sessão)

- [ ] **2.1** [`fetchHistoricoPedidos`](src/db/localDb.ts#L1763): trocar por
      `syncVersioned('historico_pedidos', 'vw_historico_pedidos', historicoPedidosKey)`.
      Assim, abrir Central de Compras + Histórico não rebaixa se a versão não mudou.
- [ ] **2.2** [`HistoricoPedidos.tsx:221`](src/views/HistoricoPedidos.tsx#L221) e
      [`SuppliersNoPO.tsx:133`](src/views/SuppliersNoPO.tsx#L133): no mount, ler do cache
      local (`getHistoricoPedidos`) e só disparar o `syncVersioned` uma vez. O botão
      **"Atualizar"** de cada tela força bypass (rebaixa mesmo com versão igual).
- [ ] **2.3** [`Fornecedores.tsx:144,458`](src/views/Fornecedores.tsx#L144): após
      cadastro/edição de contato, chamar `bump_dataset_version('contatos')` + sync só de
      `contatos`, em vez de `syncFromSupabase()` completo.

### FASE 3 — Catálogo SAP: importação sem re-download total (impacto: corta picos de importação)

- [ ] **3.1** [`importMaterials`](src/db/localDb.ts#L1233): eliminar o
      `fetchAllFromTable('materials', '*')`. Deixar o Postgres deduplicar via
      `upsert onConflict: 'material_code'`; se precisar do diff para soft-delete, baixar
      apenas a coluna `material_code` (não `*`).
- [ ] **3.2** [`Materials.tsx:115`](src/views/Materials.tsx#L115) e
      [`:200`](src/views/Materials.tsx#L200): trocar `select('*')` por colunas explícitas
      (`id,material_code,description,technical_text,category,company,unit`).
- [ ] **3.3** Avaliar `count: 'planned'` no lugar de `'exact'` na busca paginada.

### FASE 4 — Refinos e governança

- [ ] **4.1** Sync sob demanda por rota: bases SAP (`pedidosforn`, views, `contatos`) só
      sincronizam ao entrar em `/suprimentos/*`. Solicitantes/atendentes param de baixá-las.
- [ ] **4.2** Colunas explícitas nos syncs versionados (excluir `campos_extras` de
      `pedidosforn` quando não usado na listagem).
- [ ] **4.3** Log de tamanho/contagem por sync (dev) para medir antes/depois.
- [ ] **4.4** Mover colunas derivadas das views enriquecidas
      ([`types.ts:228-232`](src/types.ts#L228-L232)) para cálculo no cliente.

---

## Ordem de execução recomendada

| Ordem | Item | Risco | Ganho |
|-------|------|-------|-------|
| 1 | Fase 1 (cache versionado) | Médio | Muito alto |
| 2 | Fase 2 (cortar re-download das telas) | Baixo | Alto |
| 3 | Fase 3.1 (importação de materiais) | Médio | Alto (picos) |
| 4 | Fase 3.2/3.3 (colunas explícitas) | Baixo | Médio |
| 5 | Fase 4 (sob demanda + governança) | Médio | Médio/contínuo |

**Meta:** em regime permanente (sem importações), um boot + navegação completa deve
transferir apenas os carimbos de versão (KBs) + tabelas pequenas (requests, notifications),
não as bases pesadas. Sai-se de ~GB/dia para dezenas de MB/dia.

---

## Comportamento esperado por cenário

| Cenário | Hoje | Depois |
|---------|------|--------|
| Boot sem mudança de dados | Baixa 17 tabelas inteiras | Baixa carimbos + tabelas pequenas |
| Abrir Central de Compras | Rebaixa histórico inteiro | Lê cache local (0 egress) |
| Abrir Histórico | Rebaixa histórico inteiro | Lê cache local (0 egress) |
| Após importação PEDIDOSFORN | (igual) | Carimbo muda → rebaixa 1× e só essa base |
| Importar catálogo de materiais | Re-baixa 180k linhas | Não baixa; Postgres deduplica |

## Checklist de verificação

- [ ] Boot com dados inalterados não dispara download das bases pesadas (só carimbos).
- [ ] Central de Compras + Histórico não rebaixam a view quando a versão não mudou.
- [ ] Botão "Atualizar" continua forçando refresh real.
- [ ] Importação incrementa o carimbo e a próxima abertura reflete os dados novos.
- [ ] Importação de materiais não re-baixa o catálogo inteiro.
- [ ] Egress diário medido no dashboard do Supabase confirma a queda.
