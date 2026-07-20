# Seleção em Lote de Cotação + Histórico de Envio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select checkboxes to the "Itens Sem PO" screen so buyers can send one consolidated quote e-mail for several items at once, and record who/when clicked "Abrir no Outlook" per item+supplier so a warning shows in the quote preview when a quote was already sent before.

**Architecture:** Everything lives in `src/views/SuppliersNoPO.tsx` (the existing single-file view, following the codebase's established pattern of hand-rolled, non-componentized screens). One new Supabase table (`cotacao_historico`) is queried directly from this view (same pattern already used for `pedidosforn`/`materials` lookups in `buildSuppliersData`) and written to via one new `localDb` method that follows the exact fire-and-forget async-write pattern already used by `localDb.updateBuyerFields`. The existing `quoteModal` preview (single modal, three entry points) is generalized to carry either one "To" supplier or a list of "BCC" suppliers, so history-writing and the warning banner are implemented once and apply to all three send flows.

**Tech Stack:** React 18 + TypeScript (Vite), Tailwind CSS utility classes, Supabase JS client (`@supabase/supabase-js`), `lucide-react` icons. No test runner exists in this project (`npm run lint` = `tsc --noEmit`); verification is done via type-checking plus manual exercise in the dev server (`npm run dev`).

## Global Constraints

- Follow existing code style in `SuppliersNoPO.tsx`: Portuguese UI copy/comments, Tailwind utility classes matching neighboring elements (`text-xs font-bold`, `rounded-xl`, `#0056c6` primary blue, `emerald-600` for send/success actions, `amber` for warnings), `cursor-pointer active:scale-95` on clickable buttons.
- Do not introduce a new state-management library, table component, or file split — this view is intentionally a single large file per existing convention.
- Any new Supabase write must follow the existing fire-and-forget pattern: update local/UI state synchronously, fire the Supabase call in an unawaited `(async () => { try {...} catch (e) { console.error(...) } })()` IIFE, never block the UI on network latency.
- New Supabase reads must batch `.in(...)` filters in chunks (200–500 items) exactly like `codeVariants`/`pedidosforn` lookups already do in `buildSuppliersData`, to avoid PostgREST URL-length limits.
- No automated test suite exists; every task's "verify" step is `npm run lint` (must exit 0) plus, where noted, a manual check in the running dev server.

---

## Task 1: Supabase table `cotacao_historico`

**Files:**
- Create: `criar_tabela_cotacao_historico.sql` (repo root, mirrors `criar_view_historico_sem_po.sql` convention — a standalone SQL script the user runs manually in the Supabase SQL editor; this repo has no tracked migrations folder).

**Interfaces:**
- Produces: a table `public.cotacao_historico(id text primary key, ri text, rm text, cod_forn text, fornecedor_nome text, user_id text, user_name text, created_at timestamptz)` with an index on `(ri, cod_forn)` and `select`/`insert` grants to `anon, authenticated` (this app has no RLS policies in the repo — all tables are accessed with plain grants, per the existing `criar_view_historico_sem_po.sql` pattern).

- [ ] **Step 1: Write the SQL file**

```sql
-- =====================================================================
-- Histórico de envio de cotação por item + fornecedor.
--
-- Contexto: a tela "Central de Compras" (Sem PO) permite enviar cotação
-- por e-mail (Outlook) para fornecedores, individualmente ou em lote.
-- Esta tabela registra cada envio (clique em "Abrir no Outlook"), por
-- combinação item (ri) + fornecedor (cod_forn), para que a própria tela
-- possa avisar o comprador quando um item já foi cotado antes com aquele
-- fornecedor. É um log append-only, sem edição.
-- =====================================================================

create table if not exists public.cotacao_historico (
  id text primary key,
  ri text not null,
  rm text,
  cod_forn text not null,
  fornecedor_nome text,
  user_id text,
  user_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cotacao_historico_ri_cod_forn
  on public.cotacao_historico (ri, cod_forn);

grant select, insert on public.cotacao_historico to anon, authenticated;
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: exits 0 (this step doesn't touch TypeScript, this just confirms the repo is still in a clean state before further edits).

Then run this SQL script manually against the project's Supabase database (SQL editor or `psql`) — no automated way to verify this from the repo. Confirm the table exists:
```sql
select count(*) from public.cotacao_historico;
```
Expected: returns `0` with no error.

- [ ] **Step 3: Commit**

```bash
git add criar_tabela_cotacao_historico.sql
git commit -m "feat(sap-import): cria tabela cotacao_historico para log de envio de cotação"
```

---

## Task 2: Shared type `CotacaoHistoricoEntry`

**Files:**
- Modify: `src/types.ts:287-295` (right after `SAPObsHistory`, which is the closest analogous type).

**Interfaces:**
- Produces: `export interface CotacaoHistoricoEntry { id: string; ri: string; rm: string; cod_forn: string; fornecedor_nome: string; user_name: string; created_at: string; }` — consumed by `localDb.logCotacaoEnviada` (Task 3) and by `SuppliersNoPO.tsx` (Tasks 4, 9).

- [ ] **Step 1: Add the type**

In `src/types.ts`, immediately after the closing brace of `SAPObsHistory` (currently ending at line 295), add:

```ts
export interface CotacaoHistoricoEntry {
  id: string;
  ri: string;
  rm: string;
  cod_forn: string;
  fornecedor_nome: string;
  user_name: string;
  created_at: string;
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: exits 0 (new unused export doesn't break `tsc --noEmit`).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): adiciona CotacaoHistoricoEntry"
```

---

## Task 3: `localDb.logCotacaoEnviada`

**Files:**
- Modify: `src/db/localDb.ts` — add import of `CotacaoHistoricoEntry` is NOT needed (the method takes plain input parameters, not the full entry type, to keep the caller simple). Insert the new public method right after `getObsHistory` (currently `src/db/localDb.ts:2698-2700`).

**Interfaces:**
- Consumes: `getCurrentUser(): Profile | null` (already exists on the class, used the same way in `updateBuyerFields` at `src/db/localDb.ts:2542`), `supabase` (imported at top of file).
- Produces: `public logCotacaoEnviada(entries: { ri: string; rm: string; codForn: string; fornecedorNome: string }[]): void` — consumed by `SuppliersNoPO.tsx` (Task 9).

- [ ] **Step 1: Add the method**

In `src/db/localDb.ts`, immediately after the `getObsHistory` method (ends at line 2700 with `}`), add:

```ts
  // Grava, de forma assíncrona (fire-and-forget, mesmo padrão de
  // updateBuyerFields), um registro de envio de cotação por item+fornecedor.
  // Log append-only: usado só para avisar o comprador "cotação já enviada
  // antes" na tela de texto da cotação, não bloqueia nem precisa de retorno.
  public logCotacaoEnviada(entries: { ri: string; rm: string; codForn: string; fornecedorNome: string }[]): void {
    if (entries.length === 0) return;

    const user = this.getCurrentUser();
    const userId = user?.id || 'sistema';
    const userName = user?.name || 'Sistema';
    const nowIso = new Date().toISOString();

    const rows = entries.map(e => ({
      id: 'ch_' + Math.random().toString(36).substr(2, 9),
      ri: e.ri,
      rm: e.rm,
      cod_forn: e.codForn,
      fornecedor_nome: e.fornecedorNome,
      user_id: userId,
      user_name: userName,
      created_at: nowIso
    }));

    (async () => {
      try {
        const { error } = await supabase.from('cotacao_historico').insert(rows);
        if (error) throw error;
      } catch (e) {
        console.error('Erro ao gravar histórico de cotação enviada no Supabase:', e);
      }
    })();
  }
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/db/localDb.ts
git commit -m "feat(sap-import): adiciona localDb.logCotacaoEnviada"
```

---

## Task 4: Load selection state + quote-history map in `SuppliersNoPO.tsx`

**Files:**
- Modify: `src/views/SuppliersNoPO.tsx`
  - Import: add `CotacaoHistoricoEntry` to the existing `import { ... } from '../types';` block (`src/views/SuppliersNoPO.tsx:16-19`).
  - State: add near the existing `quoteModal`/`quoteChoicePending` state declarations (`src/views/SuppliersNoPO.tsx:271-273`).
  - Data loading: extend `buildSuppliersData` (`src/views/SuppliersNoPO.tsx:401-588`), specifically right after the existing tech-text-by-code block (which ends around line 473) and before the `fornecedoresPorMaterial` block.

**Interfaces:**
- Produces:
  - `selectedRis: Set<string>` + `setSelectedRis` — consumed by Tasks 6, 7, 8, 9.
  - `toggleSelectRi(ri: string): void`, `clearSelection(): void` — consumed by Tasks 6, 7, 8, 9.
  - `cotacaoHistoricoByKey: Map<string, CotacaoHistoricoEntry[]>` (key = `` `${ri}|${cod_forn}` ``, value sorted newest-first) — consumed by Task 9.
  - `historicoKey(ri: string, codForn: string): string` — a small helper, consumed by Tasks 4 and 9.

- [ ] **Step 1: Import the new type**

In `src/views/SuppliersNoPO.tsx:16-19`, change:

```ts
import {
  Profile, EnrichedSAPRecord, HistoricoPedidoView, ContatoFornecedor,
  FornecedorMaterialRow, SAPObsHistory, ItemStatus, RastreioPrioridade
} from '../types';
```

to:

```ts
import {
  Profile, EnrichedSAPRecord, HistoricoPedidoView, ContatoFornecedor,
  FornecedorMaterialRow, SAPObsHistory, ItemStatus, RastreioPrioridade,
  CotacaoHistoricoEntry
} from '../types';
```

- [ ] **Step 2: Add the `historicoKey` helper**

Right after the module-level `normalizeCode` function (`src/views/SuppliersNoPO.tsx:137-141`), add:

```ts
// Chave de agrupamento do histórico de cotação enviada: um item (ri) pode já
// ter sido cotado para um fornecedor e não para outro.
const historicoKey = (ri: string, codForn: string): string => `${ri}|${codForn}`;
```

- [ ] **Step 3: Add selection + history state**

In `src/views/SuppliersNoPO.tsx`, right after the line declaring `quoteModal` (line 273), add:

```ts
  // Seleção múltipla de itens para envio de cotação em lote (checkbox na
  // tabela e nos cards, compartilhada entre os dois modos de visualização).
  const [selectedRis, setSelectedRis] = useState<Set<string>>(new Set());

  const toggleSelectRi = useCallback((ri: string) => {
    setSelectedRis(prev => {
      const next = new Set(prev);
      if (next.has(ri)) next.delete(ri); else next.add(ri);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedRis(new Set()), []);

  // Histórico de cotações já enviadas, por item+fornecedor (ri|cod_forn),
  // usado para avisar o comprador na tela de texto da cotação.
  const [cotacaoHistoricoByKey, setCotacaoHistoricoByKey] = useState<Map<string, CotacaoHistoricoEntry[]>>(new Map());
```

- [ ] **Step 4: Load quote-history from Supabase in `buildSuppliersData`**

In `src/views/SuppliersNoPO.tsx`, locate the end of the tech-text-by-code block inside `buildSuppliersData` — it currently ends with the `else { setTechTextByCode(new Map()); }` around line 471-473, immediately before the comment `const fornecedoresPorMaterial = new Map<...>();` (line 475). Insert the new block between them:

```ts
      } else {
        setTechTextByCode(new Map());
      }

      // Histórico de cotações já enviadas (item+fornecedor), para avisar o
      // comprador na tela de texto da cotação quando reabrir um envio.
      const risForHistory = Array.from(new Set(semPoRecords.map(r => r.ri).filter(Boolean)));
      if (risForHistory.length > 0 && supabase) {
        try {
          const historyMap = new Map<string, CotacaoHistoricoEntry[]>();
          for (let i = 0; i < risForHistory.length; i += 200) {
            const { data, error } = await supabase
              .from('cotacao_historico')
              .select('id, ri, rm, cod_forn, fornecedor_nome, user_name, created_at')
              .in('ri', risForHistory.slice(i, i + 200));
            if (error) throw error;
            (data || []).forEach((row: any) => {
              const key = historicoKey(row.ri, row.cod_forn);
              const list = historyMap.get(key) || [];
              list.push(row as CotacaoHistoricoEntry);
              historyMap.set(key, list);
            });
          }
          historyMap.forEach(list => list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
          setCotacaoHistoricoByKey(historyMap);
        } catch (err) {
          console.warn('Falha ao buscar histórico de cotações enviadas:', err);
          setCotacaoHistoricoByKey(new Map());
        }
      } else {
        setCotacaoHistoricoByKey(new Map());
      }

      const fornecedoresPorMaterial = new Map<string, FornecedorMaterialRow[]>();
```

(Note: this replaces the single existing line `const fornecedoresPorMaterial = new Map<string, FornecedorMaterialRow[]>();` — don't duplicate it.)

- [ ] **Step 5: Verify**

Run: `npm run lint`
Expected: exits 0.

Run: `npm run dev`, open the "Itens Sem PO" screen in the browser, open devtools console. Expected: no new console errors on load (a `console.warn` is acceptable only if the `cotacao_historico` table doesn't exist yet in the target environment — apply Task 1's SQL first).

- [ ] **Step 6: Commit**

```bash
git add src/views/SuppliersNoPO.tsx
git commit -m "feat(sap-import): carrega histórico de cotações enviadas e estado de seleção"
```

---

## Task 5: Generalize `quoteModal` to support one "To" supplier or many "BCC" suppliers

**Files:**
- Modify: `src/views/SuppliersNoPO.tsx`
  - Type: `quoteModal` state declaration (line 273).
  - `handleConfirmQuoteScope` (lines 342-363).
  - `handleSendItemQuoteToAllSuppliers` (lines 367-373).
  - New: `handleSendBulkQuote`.

**Interfaces:**
- Consumes: `QuoteItemEntry`, `buildQuoteText` (existing, unchanged), `FornecedorMaterialRow`, `rawRmGroups`, `techTextByCode`, `selectedRis` (from Task 4).
- Produces: new `quoteModal` shape `{ title: string; toSupplier?: FornecedorMaterialRow; bccSuppliers: FornecedorMaterialRow[]; text: string; rms: string[]; items: QuoteItemEntry[] } | null` — consumed by Task 9 (modal rendering) and Task 8 (bulk-send button).
- Produces: `handleSendBulkQuote(): void` — consumed by Task 8.

- [ ] **Step 1: Change the `quoteModal` state type**

Replace (line 273):

```ts
  const [quoteModal, setQuoteModal] = useState<{ supplier: FornecedorMaterialRow; text: string; rms: string[]; items: QuoteItemEntry[] } | null>(null);
```

with:

```ts
  // toSupplier: envio direto a um único fornecedor (campo "Para"). bccSuppliers:
  // lista de fornecedores em cópia oculta (fluxo "todos os fornecedores do
  // item" e fluxo em lote). Os dois fluxos são mutuamente exclusivos: quando
  // toSupplier está definido, bccSuppliers é ignorado no envio.
  const [quoteModal, setQuoteModal] = useState<{
    title: string;
    toSupplier?: FornecedorMaterialRow;
    bccSuppliers: FornecedorMaterialRow[];
    text: string;
    rms: string[];
    items: QuoteItemEntry[];
  } | null>(null);
```

- [ ] **Step 2: Update `handleConfirmQuoteScope`**

Replace the last two lines of `handleConfirmQuoteScope` (currently):

```ts
    const rms = Array.from(new Set(items.map(it => it.rm).filter(Boolean)));
    setQuoteModal({ supplier, text: buildQuoteText(items, techTextByCode), rms, items });
    setQuoteChoicePending(null);
```

with:

```ts
    const rms = Array.from(new Set(items.map(it => it.rm).filter(Boolean)));
    setQuoteModal({
      title: `Cotação — ${supplier.fornecedor}`,
      toSupplier: supplier,
      bccSuppliers: [],
      text: buildQuoteText(items, techTextByCode),
      rms,
      items
    });
    setQuoteChoicePending(null);
```

- [ ] **Step 3: Rewrite `handleSendItemQuoteToAllSuppliers` to open the preview modal instead of sending directly**

Replace the whole function (currently `src/views/SuppliersNoPO.tsx:365-373`):

```ts
  // Ação "Cotação" por item (visão por RM / cards): abre o Outlook com todos os e-mails
  // de fornecedores históricos do item em cópia oculta (BCC), sem escolher um fornecedor específico.
  const handleSendItemQuoteToAllSuppliers = (record: EnrichedSAPRecord, rm: string, fornecedores: FornecedorMaterialRow[]) => {
    const bccEmails = Array.from(new Set(fornecedores.map(f => f.email).filter(e => e && e !== '—')));
    const text = buildQuoteText([{ record, rm }], techTextByCode);
    const subject = `Cotação RM ${rm}`;
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccEmails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = mailtoUrl;
  };
```

with:

```ts
  // Ação "Cotação" por item (visão por RM / cards): abre a tela de prévia do
  // texto com todos os fornecedores históricos do item em cópia oculta (BCC),
  // sem escolher um fornecedor específico. Passa pelo mesmo modal de prévia
  // (quoteModal) para que o aviso de "cotação já enviada" e o registro de
  // histórico funcionem aqui também.
  const handleSendItemQuoteToAllSuppliers = (record: EnrichedSAPRecord, rm: string, fornecedores: FornecedorMaterialRow[]) => {
    const bccSuppliers = fornecedores.filter(f => f.email && f.email !== '—');
    const items: QuoteItemEntry[] = [{ record, rm }];
    setQuoteModal({
      title: `Cotação — RM ${rm} / Item ${record.item_reqc}`,
      toSupplier: undefined,
      bccSuppliers,
      text: buildQuoteText(items, techTextByCode),
      rms: [rm],
      items
    });
  };
```

- [ ] **Step 4: Add `handleSendBulkQuote`**

Right after the `handleSendItemQuoteToAllSuppliers` function, add:

```ts
  // Envio em lote: monta um único texto de cotação para todos os itens
  // marcados por checkbox (em qualquer modo de visualização), com BCC sendo
  // a união dos fornecedores históricos de todos esses itens. Varre
  // rawRmGroups (não os itens filtrados) para não perder itens selecionados
  // que tenham saído do filtro/busca ativos depois de marcados.
  const handleSendBulkQuote = () => {
    if (selectedRis.size === 0) return;

    const items: QuoteItemEntry[] = [];
    const supplierByCod = new Map<string, FornecedorMaterialRow>();
    rawRmGroups.forEach(g => {
      g.items.forEach(it => {
        if (!selectedRis.has(it.record.ri)) return;
        items.push({ record: it.record, rm: g.rm });
        it.fornecedores.forEach(f => {
          if (f.email && f.email !== '—' && f.cod_forn && f.cod_forn !== '—') {
            supplierByCod.set(f.cod_forn, f);
          }
        });
      });
    });

    const rms = Array.from(new Set(items.map(it => it.rm).filter(Boolean)));
    setQuoteModal({
      title: `Cotação — ${items.length} ${items.length === 1 ? 'item selecionado' : 'itens selecionados'}`,
      toSupplier: undefined,
      bccSuppliers: Array.from(supplierByCod.values()),
      text: buildQuoteText(items, techTextByCode),
      rms,
      items
    });
  };
```

- [ ] **Step 5: Verify**

Run: `npm run lint`
Expected: FAIL at this point — `src/views/SuppliersNoPO.tsx` JSX still references `quoteModal.supplier` (old shape) in three places (the header title and the "Abrir no Outlook"/WhatsApp handlers, around lines 2064, 2107-2110, 2119). This is expected; Task 9 fixes the JSX. Confirm the errors are exactly about `.supplier` not existing on the new `quoteModal` type (not some unrelated typo).

- [ ] **Step 6: Commit**

```bash
git add src/views/SuppliersNoPO.tsx
git commit -m "feat(sap-import): generaliza quoteModal para suportar envio em lote (WIP, JSX ainda quebrado)"
```

---

## Task 6: Checkbox column in the table view

**Files:**
- Modify: `src/views/SuppliersNoPO.tsx` — table header (`src/views/SuppliersNoPO.tsx:1603-1617`) and table row (`src/views/SuppliersNoPO.tsx:1619-1623` onward).

**Interfaces:**
- Consumes: `selectedRis`, `toggleSelectRi` (Task 4), `flatTableItems` (existing memo).
- Produces: `allTableRisSelected: boolean`, `someTableRisSelected: boolean`, `toggleSelectAllTable(): void` — local to this task, only used by the table header checkbox.

- [ ] **Step 1: Add "select all visible" computation for the table**

Immediately before the `{viewMode === 'table' && (` block (`src/views/SuppliersNoPO.tsx:1600`), add:

```ts
          {(() => {
            const visibleTableRis = Array.from(new Set(flatTableItems.map(x => x.item.record.ri)));
            const allTableRisSelected = visibleTableRis.length > 0 && visibleTableRis.every(ri => selectedRis.has(ri));
            const someTableRisSelected = visibleTableRis.some(ri => selectedRis.has(ri));
            const toggleSelectAllTable = () => {
              setSelectedRis(prev => {
                const next = new Set(prev);
                if (allTableRisSelected) {
                  visibleTableRis.forEach(ri => next.delete(ri));
                } else {
                  visibleTableRis.forEach(ri => next.add(ri));
                }
                return next;
              });
            };
            return (
```

This wraps the existing `viewMode === 'table' && (...)` JSX in an IIFE so the three `const`s are in scope for the header checkbox below. The block currently closes with (find this exact sequence, right after the table's closing `</table>`):

```tsx
              </table>
            </div>
          )}
```

Change that closing `)}` to `);})()`, so it reads:

```tsx
              </table>
            </div>
          );})()}
```

- [ ] **Step 2: Add the header checkbox**

In the `<thead><tr>` (`src/views/SuppliersNoPO.tsx:1604-1617`), add a new first `<th>`:

```tsx
                  <tr>
                    <th className="py-3 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={allTableRisSelected}
                        ref={el => { if (el) el.indeterminate = someTableRisSelected && !allTableRisSelected; }}
                        onChange={toggleSelectAllTable}
                        className="cursor-pointer"
                        aria-label="Selecionar todos os itens visíveis"
                      />
                    </th>
                    {tableShowSupplierFirst && <th className="py-3 px-3">Fornecedor</th>}
```

(keep the rest of the header row unchanged).

- [ ] **Step 3: Add the row checkbox**

In the `<tbody>` row (`src/views/SuppliersNoPO.tsx:1622-1624`), add a new first `<td>` right after the opening `<tr ...>`:

```tsx
                      <tr key={`${r.ri}-${selectedSupplier ? selectedSupplier.cod_forn : 'none'}`} className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/20 align-top transition-colors ${isModified(r.ri, r) ? 'bg-amber-50/15 dark:bg-amber-955/5' : ''}`}>
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={selectedRis.has(r.ri)}
                            onChange={() => toggleSelectRi(r.ri)}
                            className="cursor-pointer"
                            aria-label={`Selecionar item ${r.item_reqc}`}
                          />
                        </td>
                        {/* Column 1: Fornecedor (when focused) */}
                        {tableShowSupplierFirst && (
```

(keep everything else in the row unchanged; this only adds one `<td>` before the existing `{tableShowSupplierFirst && (...)}` block).

- [ ] **Step 4: Verify**

Run: `npm run lint`
Expected: still fails only on the `quoteModal.supplier` references from Task 5 (no new errors introduced by this task — if there are new errors, they're almost certainly a mismatched paren/brace from the IIFE wrap in Step 1).

Run: `npm run dev`, open "Itens Sem PO" → switch to "Tabela" view. Expected: a checkbox column appears as the first column; clicking a row checkbox toggles it independently; the header checkbox selects/deselects all currently loaded rows and shows an indeterminate dash state when only some are selected.

- [ ] **Step 5: Commit**

```bash
git add src/views/SuppliersNoPO.tsx
git commit -m "feat(sap-import): checkbox de seleção na visão em tabela"
```

---

## Task 7: Checkbox in the cards view

**Files:**
- Modify: `src/views/SuppliersNoPO.tsx` — cards block (`src/views/SuppliersNoPO.tsx:1344-1360` onward, the `viewMode === 'cards'` map).

**Interfaces:**
- Consumes: `selectedRis`, `toggleSelectRi` (Task 4).

- [ ] **Step 1: Add the checkbox to the card header**

Locate the card's meta header (`src/views/SuppliersNoPO.tsx:1356-1359`):

```tsx
                      <div className="flex items-center justify-between flex-wrap gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-500">RM {rm}</span>
                          <span className="text-[10px] text-slate-350">•</span>
```

Change the inner `<div className="flex items-center gap-1.5">` to prepend a checkbox:

```tsx
                      <div className="flex items-center justify-between flex-wrap gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={selectedRis.has(r.ri)}
                            onChange={() => toggleSelectRi(r.ri)}
                            className="cursor-pointer"
                            aria-label={`Selecionar item ${r.item_reqc}`}
                          />
                          <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-500">RM {rm}</span>
                          <span className="text-[10px] text-slate-350">•</span>
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: same state as after Task 6 (still failing only on `quoteModal.supplier`).

Run: `npm run dev`, open "Itens Sem PO" → "Cards" view. Expected: a checkbox appears next to "RM {rm}" on every card; toggling it updates selection independently of the table view (switch to "Tabela" and confirm the same items show checked).

- [ ] **Step 3: Commit**

```bash
git add src/views/SuppliersNoPO.tsx
git commit -m "feat(sap-import): checkbox de seleção na visão em cards"
```

---

## Task 8: Selection bar + "Enviar Cotação" button (outside the table/cards)

**Files:**
- Modify: `src/views/SuppliersNoPO.tsx` — insert right after the "Summary / Expand Toggles" block (`src/views/SuppliersNoPO.tsx:1333-1336`) and before the `{/* VIEW: CARDS (Default) */}` comment (line 1344).

**Interfaces:**
- Consumes: `selectedRis`, `clearSelection` (Task 4), `handleSendBulkQuote` (Task 5).

- [ ] **Step 1: Add the selection bar**

Right after the closing `</div>` of the "Summary / Expand Toggles" block (`src/views/SuppliersNoPO.tsx:1336`, the `<span>Localizados ...</span>` line's parent `</div>`), and before the `{filteredGroups.length === 0 && (...)}` empty-state block, add:

```tsx
          {selectedRis.size > 0 && (
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-emerald-250 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                {selectedRis.size} {selectedRis.size === 1 ? 'item selecionado' : 'itens selecionados'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer"
                >
                  Limpar seleção
                </button>
                <button
                  onClick={handleSendBulkQuote}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar Cotação</span>
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: same state as after Task 7 (still failing only on `quoteModal.supplier`; `handleSendBulkQuote` and `clearSelection` are already defined from Task 4/5, so no new errors from this task).

Run: `npm run dev`. Expected: selecting any item (table or cards) makes the green selection bar appear above the list, showing the count; "Limpar seleção" clears all checkboxes; clicking "Enviar Cotação" currently throws or shows a broken modal (`quoteModal.supplier` doesn't exist yet) — that's expected until Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/views/SuppliersNoPO.tsx
git commit -m "feat(sap-import): barra de seleção e botão Enviar Cotação"
```

---

## Task 9: Quote-preview modal — title, BCC/To send logic, history write, warning banner

**Files:**
- Modify: `src/views/SuppliersNoPO.tsx` — the `quoteModal` JSX block (`src/views/SuppliersNoPO.tsx:2057-2143`).

**Interfaces:**
- Consumes: `quoteModal` (new shape, Task 5), `cotacaoHistoricoByKey`, `historicoKey` (Task 4), `localDb.logCotacaoEnviada` (Task 3), `clearSelection` (Task 4).

- [ ] **Step 1: Compute the "already sent" warnings for the currently open modal**

Immediately before the `{quoteModal && (` block (`src/views/SuppliersNoPO.tsx:2057`), add:

```ts
      {(() => {
        if (!quoteModal) return null;
        const suppliersInvolved = quoteModal.toSupplier ? [quoteModal.toSupplier] : quoteModal.bccSuppliers;
        const warnings: { rm: string; itemLabel: string; fornecedor: string; userName: string; createdAt: string }[] = [];
        quoteModal.items.forEach(({ record, rm }) => {
          suppliersInvolved.forEach(f => {
            const hist = cotacaoHistoricoByKey.get(historicoKey(record.ri, f.cod_forn));
            if (hist && hist.length > 0) {
              warnings.push({
                rm,
                itemLabel: `Item ${record.item_reqc}`,
                fornecedor: f.fornecedor,
                userName: hist[0].user_name,
                createdAt: hist[0].created_at
              });
            }
          });
        });
        return (
```

This wraps the existing `{quoteModal && (...)}` block in an IIFE so `warnings` is available inside it. Find this exact closing sequence (the end of the quote-preview modal, right before the `{/* Modal Universal de Detalhes SAP */}` comment):

```tsx
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal de Detalhes SAP */}
```

Change the `)}` on the line right before the blank line/comment to `);})()`, so it reads:

```tsx
            </div>
          </div>
        </div>
      );})()}

      {/* Modal Universal de Detalhes SAP */}
```

- [ ] **Step 2: Update the modal header title**

Replace (currently around line 2060-2065):

```tsx
              <div className="flex items-center gap-2 min-w-0">
                <Send className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                <h3 className="font-bold text-slate-850 dark:text-slate-50 text-sm truncate">
                  Cotação — {quoteModal.supplier.fornecedor}
                </h3>
              </div>
```

with:

```tsx
              <div className="flex items-center gap-2 min-w-0">
                <Send className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                <h3 className="font-bold text-slate-850 dark:text-slate-50 text-sm truncate">
                  {quoteModal.title}
                </h3>
              </div>
```

- [ ] **Step 3: Add the warning banner above the textarea**

Right after the header `<div className="px-5 py-4 border-b ...">...</div>` block (currently ending around line 2074) and before `<div className="p-5 overflow-y-auto flex-1">` (line 2076), add:

```tsx
            {warnings.length > 0 && (
              <div className="mx-5 mt-4 p-3 rounded-xl border border-amber-250 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Cotação já enviada anteriormente para {warnings.length === 1 ? 'este item/fornecedor' : 'estes itens/fornecedores'}:</span>
                </div>
                <ul className="pl-5 list-disc space-y-0.5">
                  {warnings.slice(0, 5).map((w, idx) => (
                    <li key={idx}>
                      RM {w.rm} / {w.itemLabel} → {w.fornecedor} — enviado por {w.userName} em {new Date(w.createdAt).toLocaleString('pt-BR')}
                    </li>
                  ))}
                </ul>
                {warnings.length > 5 && (
                  <p className="pl-5 italic">+ {warnings.length - 5} outras</p>
                )}
              </div>
            )}
```

- [ ] **Step 4: Update the "Abrir no Outlook" button to handle To/BCC and write history**

Replace (currently `src/views/SuppliersNoPO.tsx:2105-2117`):

```tsx
              <button
                onClick={() => {
                  const supplierEmail = quoteModal.supplier.email !== '—' ? quoteModal.supplier.email : '';
                  const subject = `Cotação RM ${quoteModal.rms.join(', ')}`;
                  const mailtoUrl = `mailto:${encodeURIComponent(supplierEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(quoteModal.text)}`;
                  window.location.href = mailtoUrl;
                }}
                title="Abre o cliente de e-mail padrão (ex: Outlook) com o texto preenchido. Cotações muito longas podem ser truncadas pelo limite de tamanho do mailto."
                className="px-4 py-2 bg-[#0056c6] hover:bg-[#004bb0] text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Abrir no Outlook</span>
              </button>
```

with:

```tsx
              <button
                onClick={() => {
                  const subject = `Cotação RM ${quoteModal.rms.join(', ')}`;
                  let mailtoUrl: string;
                  const suppliersSent = quoteModal.toSupplier ? [quoteModal.toSupplier] : quoteModal.bccSuppliers;
                  if (quoteModal.toSupplier) {
                    const supplierEmail = quoteModal.toSupplier.email !== '—' ? quoteModal.toSupplier.email : '';
                    mailtoUrl = `mailto:${encodeURIComponent(supplierEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(quoteModal.text)}`;
                  } else {
                    const bccEmails = quoteModal.bccSuppliers.map(f => f.email).filter(e => e && e !== '—');
                    mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccEmails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(quoteModal.text)}`;
                  }
                  window.location.href = mailtoUrl;

                  const historyEntries = quoteModal.items.flatMap(({ record, rm }) =>
                    suppliersSent
                      .filter(f => f.cod_forn && f.cod_forn !== '—')
                      .map(f => ({ ri: record.ri, rm, codForn: f.cod_forn, fornecedorNome: f.fornecedor }))
                  );
                  if (historyEntries.length > 0) {
                    localDb.logCotacaoEnviada(historyEntries);
                    setCotacaoHistoricoByKey(prev => {
                      const next = new Map(prev);
                      const nowIso = new Date().toISOString();
                      const userName = user?.name || 'Sistema';
                      historyEntries.forEach(e => {
                        const key = historicoKey(e.ri, e.codForn);
                        const list = next.get(key) ? [...next.get(key)!] : [];
                        list.unshift({ id: 'local', ri: e.ri, rm: e.rm, cod_forn: e.codForn, fornecedor_nome: e.fornecedorNome, user_name: userName, created_at: nowIso });
                        next.set(key, list);
                      });
                      return next;
                    });
                  }

                  setQuoteModal(null);
                  clearSelection();
                }}
                title="Abre o cliente de e-mail padrão (ex: Outlook) com o texto preenchido. Cotações muito longas podem ser truncadas pelo limite de tamanho do mailto."
                className="px-4 py-2 bg-[#0056c6] hover:bg-[#004bb0] text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Abrir no Outlook</span>
              </button>
```

- [ ] **Step 5: Gate the WhatsApp button on `toSupplier`**

Replace (currently `src/views/SuppliersNoPO.tsx:2118-2139`):

```tsx
              {(() => {
                const waNumber = extractWhatsAppNumber(quoteModal.supplier.telefone);
                return (
```

with:

```tsx
              {(() => {
                const waNumber = quoteModal.toSupplier ? extractWhatsAppNumber(quoteModal.toSupplier.telefone) : null;
                return (
```

(the rest of that block already disables the button and shows a title when `waNumber` is falsy, via `disabled={!waNumber}` — no further change needed there, but double-check the `title` copy still reads correctly for the "no supplier at all" case; if it says "Fornecedor sem telefone cadastrado" that's still accurate enough for the bulk/BCC case, no change required).

- [ ] **Step 6: Verify**

Run: `npm run lint`
Expected: exits 0 — this was the last remaining source of the `quoteModal.supplier` errors from Task 5.

Run: `npm run dev` and manually exercise all three flows:
1. Table view → "Ver por Fornecedor" → click "Cotação" on one row → choose "Apenas este item" → modal opens titled "Cotação — {fornecedor}" → click "Abrir no Outlook" → default mail client opens with a `mailto:` addressed `to` that one supplier; reopen the same item/fornecedor's quote a second time → the amber warning banner now shows the prior send.
2. Table view (not supplier-first) → click "Cotação" on a row with fornecedores → modal opens titled with the RM/Item → "Abrir no Outlook" → mail client opens with BCC to that item's suppliers.
3. Select 2+ items via checkboxes (mix of table and cards to confirm shared state) → "Enviar Cotação" in the selection bar → modal opens titled "Cotação — N itens selecionados", text contains all selected items → "Abrir no Outlook" → BCC is the union of their suppliers' emails → selection bar disappears (selection cleared) after send.

Expected: no console errors in any of the three flows; the warning banner only appears for combinations previously sent (verify by sending the same item twice and reopening its quote a third time).

- [ ] **Step 7: Commit**

```bash
git add src/views/SuppliersNoPO.tsx
git commit -m "feat(sap-import): grava histórico de envio e mostra aviso de cotação já enviada"
```

---

## Task 10: Final full-project check

**Files:** none (verification only).

- [ ] **Step 1: Full lint pass**

Run: `npm run lint`
Expected: exits 0 with no errors.

- [ ] **Step 2: Production build sanity check**

Run: `npm run build`
Expected: exits 0 (catches any issue `tsc --noEmit` alone might miss in the Vite bundling step, e.g. unused-import warnings treated as errors by some configs).

- [ ] **Step 3: Manual regression check on unrelated flows**

Run: `npm run dev`, open "Itens Sem PO":
- Confirm `handleExportExcel` ("Exportar") still works unaffected (unrelated to this feature, but shares the same `filteredGroups` data — regression check only).
- Confirm the existing per-row "Salvar" (buyer fields: observação/status/data) still works and its "Histórico" (clock icon) modal is unaffected — this is the pre-existing `obs_historico` feature, distinct from the new `cotacao_historico` warning.

Expected: both flows behave exactly as before this change.

- [ ] **Step 4: Final commit (only if Steps 1-3 required fixes)**

If any fix was needed:
```bash
git add -A
git commit -m "fix(sap-import): ajustes finais da seleção em lote de cotação"
```
If no fixes were needed, skip this step — there is nothing to commit.
