# Botão "Reportar" (bug/sugestão) + painel admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global floating button (merged with the existing per-page Tour button) that lets any logged-in user report a bug (auto screenshot + console logs + stack trace) or send a suggestion, and give admins a screen inside `AdminPanel.tsx` to triage those reports.

**Architecture:** A `TourRegistryContext` lets the two pages that already have a guided tour register their controls; a single global `FeedbackButton` (mounted once in `App.tsx`) reads that registry to decide whether to offer "Tour" alongside "Reportar um erro" / "Enviar sugestão". Bug reports capture a screenshot (`html2canvas`, resized/compressed the same way existing attachments are) and the last console errors/warnings (a small ring buffer installed at boot). Everything is written directly to a new Supabase table/bucket at submit time — no offline queue, matching how `request-attachments` uploads already work in this local-first app. `ErrorBoundary` gets a "Reportar este erro" button that pre-fills the bug form via a tiny pub-sub module (it's a class component in a different subtree than the button).

**Tech Stack:** React 19 + TypeScript, Tailwind, `motion`, `lucide-react`, Supabase JS client, `html2canvas` (new dependency), Vitest (Node environment, logic-only tests — this codebase has no DOM/component test setup, see `vitest.config.ts`).

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-12-reportar-erro-sugestao-design.md` — read it before starting, it has the full rationale.
- All ids in this schema are `text` (client-generated via `gerarUUID()` from `src/lib/ids.ts`), **not** Postgres `uuid`. Verified via Supabase MCP `list_tables` on `profiles`, `request_attachments`, `request_comments`.
- Supabase project id for MCP tool calls: `fwezzgduywgyhxinjurn`.
- RLS policies in this project are permissive for `authenticated` (e.g. `request_attachments_all`) — the real access gate is client-side (`canAccessPage` in `src/lib/pages.ts`). Follow the same convention; do not invent stricter RLS for this feature alone.
- Screenshot/log capture must never block or crash the app if it fails — always fall back to submitting without it, never throw an unhandled error from the reporting path itself (that would be embarrassing).
- Comments in code: sparse, Portuguese, only for non-obvious rationale (matches existing files like `imageCompression.ts`, `useTour.ts`). Don't narrate what code obviously does.
- `npm run lint` (`tsc --noEmit`) and `npm test` must pass after every task that touches `.ts`/`.tsx` files.

---

## File Structure

New files:
- `src/lib/consoleLogBuffer.ts` — global ring buffer of recent console errors/warnings.
- `src/lib/consoleLogBuffer.test.ts`
- `src/lib/feedbackReportBus.ts` — pub-sub so `ErrorBoundary` can hand off a crash to the feedback UI.
- `src/lib/feedbackReportBus.test.ts`
- `src/lib/screenshotCapture.ts` — `html2canvas` wrapper, resize/compress to WebP.
- `src/lib/screenshotCapture.test.ts`
- `src/components/help/TourRegistryContext.tsx` — context + `usePageTour` hook.
- `src/components/feedback/FeedbackButton.tsx` — the global floating button + popup menu.
- `src/components/feedback/FeedbackModal.tsx` — bug/sugestão form.
- `db/sql/tables/feedback_reports.sql` — checked-in copy of the migration (documentation, matches `contrato_anexos.sql` convention).

Modified files:
- `src/types.ts` — `FeedbackReport`, `FeedbackLogEntry` types.
- `src/db/localDb.ts` — `submitFeedbackReport`, `getFeedbackReports`, `updateFeedbackReport`, `getFeedbackScreenshotUrl`.
- `src/components/ErrorBoundary.tsx` — "Reportar este erro" button.
- `src/views/NewRequest.tsx`, `src/views/RastreioCompras.tsx` — swap `useTour` + `HelpButton` for `usePageTour`.
- `src/App.tsx` — mount `TourRegistryProvider` + `FeedbackButton`.
- `src/main.tsx` — install the console log buffer at boot.
- `src/lib/pages.ts` — new `admin_feedback` page.
- `src/views/AdminPanel.tsx` — new "Reportes" tab.
- `package.json` — add `html2canvas`.

Deleted files:
- `src/components/help/HelpButton.tsx` (superseded by `FeedbackButton`).

---

### Task 1: Supabase schema — `feedback_reports` table + `feedback-screenshots` bucket

**Files:**
- Create: `db/sql/tables/feedback_reports.sql`
- Supabase (via MCP `apply_migration`, project id `fwezzgduywgyhxinjurn`)

**Interfaces:**
- Produces: table `public.feedback_reports` and bucket `feedback-screenshots`, consumed by Task 6 (`localDb.ts` methods).

- [ ] **Step 1: Apply the table migration**

Call the Supabase MCP tool `apply_migration` with `project_id: "fwezzgduywgyhxinjurn"`, `name: "create_feedback_reports"`, and this `query`:

```sql
create table public.feedback_reports (
  id text primary key,
  type text not null check (type in ('bug', 'sugestao')),
  status text not null default 'novo' check (status in ('novo', 'em_analise', 'resolvido', 'arquivado')),
  description text not null,
  page_path text not null,
  user_id text references public.profiles(id),
  user_name text not null,
  user_email text,
  screenshot_path text,
  console_logs jsonb,
  error_stack text,
  user_agent text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_reports_status_idx on public.feedback_reports (status);
create index feedback_reports_created_at_idx on public.feedback_reports (created_at desc);

alter table public.feedback_reports enable row level security;

create policy feedback_reports_all on public.feedback_reports
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Apply the storage bucket + policies migration**

Call `apply_migration` again with `name: "create_feedback_screenshots_bucket"` and:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-screenshots', 'feedback-screenshots', false, 5242880, array['image/webp', 'image/jpeg', 'image/png']);

create policy feedback_screenshots_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback-screenshots');

create policy feedback_screenshots_select on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback-screenshots');
```

- [ ] **Step 3: Verify**

Call `mcp__claude_ai_Supabase__list_tables` with `project_id: "fwezzgduywgyhxinjurn"`, `schemas: ["public"]`, `verbose: false` and confirm `public.feedback_reports` is listed. Call `execute_sql` with `select id, name, public, file_size_limit from storage.buckets where id = 'feedback-screenshots';` and confirm one row comes back.

- [ ] **Step 4: Write the checked-in copy and commit**

Create `db/sql/tables/feedback_reports.sql`:

```sql
-- Tabela de reportes (bug/sugestão) enviados pelo botão flutuante "Reportar".
-- Bucket "feedback-screenshots" criado junto (ver docs/superpowers/specs/2026-08-12-reportar-erro-sugestao-design.md).
-- Aplicado via Supabase MCP em 2026-08-12 (migrations create_feedback_reports, create_feedback_screenshots_bucket).

create table public.feedback_reports (
  id text primary key,
  type text not null check (type in ('bug', 'sugestao')),
  status text not null default 'novo' check (status in ('novo', 'em_analise', 'resolvido', 'arquivado')),
  description text not null,
  page_path text not null,
  user_id text references public.profiles(id),
  user_name text not null,
  user_email text,
  screenshot_path text,
  console_logs jsonb,
  error_stack text,
  user_agent text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_reports_status_idx on public.feedback_reports (status);
create index feedback_reports_created_at_idx on public.feedback_reports (created_at desc);

alter table public.feedback_reports enable row level security;

create policy feedback_reports_all on public.feedback_reports
  for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-screenshots', 'feedback-screenshots', false, 5242880, array['image/webp', 'image/jpeg', 'image/png']);

create policy feedback_screenshots_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback-screenshots');

create policy feedback_screenshots_select on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback-screenshots');
```

```bash
git add db/sql/tables/feedback_reports.sql
git commit -m "db: cria tabela feedback_reports e bucket feedback-screenshots"
```

---

### Task 2: Types — `FeedbackReport`, `FeedbackLogEntry`

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `FeedbackReport`, `FeedbackLogEntry`, imported by `localDb.ts` (Task 6), `consoleLogBuffer.ts` (Task 3), `AdminPanel.tsx` (Task 14).

- [ ] **Step 1: Add the types at the end of `src/types.ts`**

```ts
export interface FeedbackLogEntry {
  level: 'error' | 'warn';
  message: string;
  timestamp: string;
}

export interface FeedbackReport {
  id: string;
  type: 'bug' | 'sugestao';
  status: 'novo' | 'em_analise' | 'resolvido' | 'arquivado';
  description: string;
  page_path: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  screenshot_path: string | null;
  console_logs: FeedbackLogEntry[] | null;
  error_stack: string | null;
  user_agent: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no new errors (this only adds exports).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: adiciona tipos FeedbackReport e FeedbackLogEntry"
```

---

### Task 3: `consoleLogBuffer.ts` — global ring buffer of recent logs

**Files:**
- Create: `src/lib/consoleLogBuffer.ts`
- Test: `src/lib/consoleLogBuffer.test.ts`

**Interfaces:**
- Consumes: `FeedbackLogEntry` from `../types` (Task 2).
- Produces: `recordLogEntry(level, args)`, `getRecentLogs(): FeedbackLogEntry[]`, `installConsoleLogBuffer(): void`, `resetLogBufferForTests(): void` — consumed by `FeedbackModal.tsx` (Task 9, via `getRecentLogs`) and `main.tsx` (Task 11, via `installConsoleLogBuffer`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/consoleLogBuffer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { recordLogEntry, getRecentLogs, resetLogBufferForTests } from './consoleLogBuffer';

describe('consoleLogBuffer', () => {
  beforeEach(() => {
    resetLogBufferForTests();
  });

  it('deve começar vazio', () => {
    expect(getRecentLogs()).toEqual([]);
  });

  it('deve registrar uma entrada com nível e mensagem', () => {
    recordLogEntry('error', ['Falha ao salvar', 42]);
    const logs = getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toBe('Falha ao salvar 42');
    expect(typeof logs[0].timestamp).toBe('string');
  });

  it('deve serializar um Error como "Nome: mensagem"', () => {
    recordLogEntry('error', [new TypeError('boom')]);
    expect(getRecentLogs()[0].message).toBe('TypeError: boom');
  });

  it('deve truncar mensagens muito longas', () => {
    recordLogEntry('warn', ['x'.repeat(1000)]);
    expect(getRecentLogs()[0].message.length).toBeLessThanOrEqual(501);
  });

  it('deve manter só as últimas 50 entradas (FIFO)', () => {
    for (let i = 0; i < 55; i++) recordLogEntry('warn', [`msg${i}`]);
    const logs = getRecentLogs();
    expect(logs).toHaveLength(50);
    expect(logs[0].message).toBe('msg5');
    expect(logs[49].message).toBe('msg54');
  });

  it('getRecentLogs devolve uma cópia (não a referência interna)', () => {
    recordLogEntry('error', ['a']);
    const logs = getRecentLogs();
    logs.push({ level: 'error', message: 'b', timestamp: 'x' });
    expect(getRecentLogs()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/consoleLogBuffer.test.ts`
Expected: FAIL — `./consoleLogBuffer` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/consoleLogBuffer.ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Buffer em memória com as últimas entradas de console.error/warn e erros
 * globais da sessão. Anexado a todo reporte enviado pelo botão "Reportar"
 * (bug ou sugestão), mesmo quando não veio de um crash — dá contexto de
 * problemas silenciosos que antecederam o reporte.
 */
import { FeedbackLogEntry } from '../types';

const MAX_ENTRIES = 50;
const MAX_MESSAGE_LENGTH = 500;

let buffer: FeedbackLogEntry[] = [];
let installed = false;

function truncate(value: string): string {
  return value.length > MAX_MESSAGE_LENGTH ? value.slice(0, MAX_MESSAGE_LENGTH) + '…' : value;
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/** Lógica pura de registro — separada de `installConsoleLogBuffer` para poder ser testada sem DOM. */
export function recordLogEntry(level: 'error' | 'warn', args: unknown[]): void {
  const message = truncate(args.map(stringifyArg).join(' '));
  buffer.push({ level, message, timestamp: new Date().toISOString() });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function getRecentLogs(): FeedbackLogEntry[] {
  return [...buffer];
}

export function resetLogBufferForTests(): void {
  buffer = [];
}

/**
 * Faz o monkey-patch de console.error/warn e escuta erros globais. Chamado
 * uma única vez, no bootstrap (main.tsx) — antes disso o buffer fica vazio.
 */
export function installConsoleLogBuffer(): void {
  if (installed) return;
  installed = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    recordLogEntry('error', args);
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    recordLogEntry('warn', args);
    originalWarn(...args);
  };

  window.addEventListener('error', (event) => {
    recordLogEntry('error', [event.message]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordLogEntry('error', ['Promise rejeitada sem tratamento:', event.reason]);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/consoleLogBuffer.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/consoleLogBuffer.ts src/lib/consoleLogBuffer.test.ts
git commit -m "feat: adiciona buffer de logs de console para reportes"
```

---

### Task 4: `feedbackReportBus.ts` — pub-sub for crash hand-off

**Files:**
- Create: `src/lib/feedbackReportBus.ts`
- Test: `src/lib/feedbackReportBus.test.ts`

**Interfaces:**
- Produces: `BugPrefill { message: string; stack?: string; pagePath: string }`, `emitBugPrefill(prefill)`, `onBugPrefill(listener): () => void` — consumed by `ErrorBoundary.tsx` (Task 12, emits) and `FeedbackButton.tsx` (Task 10, subscribes).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/feedbackReportBus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { emitBugPrefill, onBugPrefill } from './feedbackReportBus';

describe('feedbackReportBus', () => {
  it('entrega o prefill para quem assinou', () => {
    const listener = vi.fn();
    onBugPrefill(listener);
    emitBugPrefill({ message: 'boom', stack: 'at x', pagePath: '/rastreio' });
    expect(listener).toHaveBeenCalledWith({ message: 'boom', stack: 'at x', pagePath: '/rastreio' });
  });

  it('para de entregar depois de cancelar a assinatura', () => {
    const listener = vi.fn();
    const unsubscribe = onBugPrefill(listener);
    unsubscribe();
    emitBugPrefill({ message: 'boom', pagePath: '/' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('entrega para múltiplos assinantes', () => {
    const a = vi.fn();
    const b = vi.fn();
    onBugPrefill(a);
    onBugPrefill(b);
    emitBugPrefill({ message: 'x', pagePath: '/' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/feedbackReportBus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/feedbackReportBus.ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * `ErrorBoundary` é uma classe montada numa subárvore que pode estar quebrada;
 * o botão/modal de reporte vivem fora dela, no layout persistente do App. Um
 * pub-sub simples evita passar Context por uma árvore que pode não existir
 * mais no momento do crash.
 */
export interface BugPrefill {
  message: string;
  stack?: string;
  pagePath: string;
}

type Listener = (prefill: BugPrefill) => void;

const listeners = new Set<Listener>();

export function emitBugPrefill(prefill: BugPrefill): void {
  listeners.forEach(listener => listener(prefill));
}

export function onBugPrefill(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/feedbackReportBus.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedbackReportBus.ts src/lib/feedbackReportBus.test.ts
git commit -m "feat: adiciona bus de eventos para o Error Boundary pré-preencher reporte de bug"
```

---

### Task 5: `screenshotCapture.ts` — capture + compress viewport

**Files:**
- Create: `src/lib/screenshotCapture.ts`
- Test: `src/lib/screenshotCapture.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `computeScaledDimensions(width, height, max): { width: number; height: number }`, `captureViewport(target?: HTMLElement): Promise<Blob | null>` — consumed by `FeedbackButton.tsx`/`FeedbackModal.tsx` (Tasks 9-10).

- [ ] **Step 1: Install the new dependency**

Run: `npm install html2canvas`
Expected: `package.json` `dependencies` gains `"html2canvas": "^1.x.x"`.

- [ ] **Step 2: Write the failing test (pure function only — no DOM/canvas in this Node-only test env, see `vitest.config.ts`)**

```ts
// src/lib/screenshotCapture.test.ts
import { describe, it, expect } from 'vitest';
import { computeScaledDimensions } from './screenshotCapture';

describe('computeScaledDimensions', () => {
  it('não amplia imagens menores que o máximo', () => {
    expect(computeScaledDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('reduz proporcionalmente quando a largura excede o máximo', () => {
    expect(computeScaledDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it('reduz proporcionalmente quando a altura excede o máximo', () => {
    expect(computeScaledDimensions(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it('nunca devolve dimensão zero', () => {
    expect(computeScaledDimensions(1, 10000, 1600)).toEqual({ width: 1, height: 1600 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/screenshotCapture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/screenshotCapture.ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Captura de tela para o reporte de bug. Mesma estratégia de compressão de
 * `imageCompression.ts` (canvas + WebP 0.7, fallback JPEG), aplicada sobre o
 * canvas que o html2canvas devolve em vez de um File do usuário.
 */
import html2canvas from 'html2canvas';

const MAX_DIMENSAO = 1600;
const QUALIDADE = 0.7;

export function computeScaledDimensions(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, QUALIDADE));
}

/**
 * Devolve `null` em qualquer falha (elemento não encontrado, encoder
 * indisponível) — o chamador deve seguir o fluxo sem screenshot, nunca travar
 * o envio do reporte por causa disso.
 */
export async function captureViewport(target: HTMLElement = document.body): Promise<Blob | null> {
  try {
    const rendered = await html2canvas(target, { logging: false, useCORS: true });
    const { width, height } = computeScaledDimensions(rendered.width, rendered.height, MAX_DIMENSAO);

    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    const ctx = scaled.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(rendered, 0, 0, width, height);

    let blob = await canvasToBlob(scaled, 'image/webp');
    if (!blob || blob.type !== 'image/webp') {
      blob = await canvasToBlob(scaled, 'image/jpeg');
    }
    return blob;
  } catch (err) {
    console.error('Falha ao capturar a tela para o reporte.', err);
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/screenshotCapture.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/screenshotCapture.ts src/lib/screenshotCapture.test.ts package.json package-lock.json
git commit -m "feat: adiciona captura e compressão de print para reporte de bug"
```

---

### Task 6: `localDb.ts` — feedback submit/read/update methods

**Files:**
- Modify: `src/db/localDb.ts`

**Interfaces:**
- Consumes: `FeedbackReport`, `FeedbackLogEntry` from `../types` (Task 2); `gerarUUID` from `../lib/ids` (already imported); `supabase` from `./supabaseClient` (already imported).
- Produces: `localDb.submitFeedbackReport(input): Promise<boolean>`, `localDb.getFeedbackReports(): Promise<FeedbackReport[]>`, `localDb.updateFeedbackReport(id, patch): Promise<boolean>`, `localDb.getFeedbackScreenshotUrl(path): Promise<string | null>` — consumed by `FeedbackModal.tsx` (Task 9) and `AdminPanel.tsx` (Task 14).

- [ ] **Step 1: Add the import and bucket constant**

In `src/db/localDb.ts`, extend the `types` import (around line 6-14) to include `FeedbackReport, FeedbackLogEntry`:

```ts
import {
  Profile, Sector, Material, Request, RequestItem, RequestComment,
  RequestStatusHistory, RequestAttachment, Notification, SAPRequisicao,
  SAPPedido, SAPObsHistory, SAPImportLog, UserBuyerGroup, RequestStatus, Role, RequestType,
  ActivityLog, EnrichedSAPRecord, ItemStatus, PedidoForn, ContatoFornecedor, CidadeForn, HistoricoPedidoView,

  RastreioMensagem, RastreioPrioridade, EstoqueItem, EstoqueAnalise, GrupoMercadoria, ContratoME3N,
  ContratoDetalhes, ContratoAnexo, AuditoriaCompra, AuditoriaHistoricoMaterial, FeedbackReport, FeedbackLogEntry
} from '../types';
```

Right after the existing `const ATTACHMENTS_BUCKET = 'request-attachments';` (line 31), add:

```ts
/** Bucket privado dos prints anexados a reportes de bug. Leitura só por URL assinada. */
const FEEDBACK_BUCKET = 'feedback-screenshots';
```

- [ ] **Step 2: Add the four methods**

Insert right after `getAttachmentUrl` (ends at line 6597, right before the `// Profile Management methods` comment):

```ts
  /**
   * Envia um reporte de bug/sugestão. Sobe o print (quando houver) primeiro;
   * só insere a linha da tabela depois — sem FK entre os dois, essa ordem
   * evita uma linha "órfã" apontando para um arquivo que falhou ao subir.
   */
  public async submitFeedbackReport(input: {
    type: 'bug' | 'sugestao';
    description: string;
    pagePath: string;
    screenshotBlob?: Blob | null;
    consoleLogs: FeedbackLogEntry[];
    errorStack?: string;
  }): Promise<boolean> {
    if (!supabase) return false;
    const user = this.getCurrentUser();
    if (!user) return false;

    const id = gerarUUID();
    let screenshotPath: string | null = null;

    if (input.screenshotBlob) {
      const path = `${id}/screenshot.webp`;
      const { error: upErr } = await supabase.storage
        .from(FEEDBACK_BUCKET)
        .upload(path, input.screenshotBlob, { contentType: input.screenshotBlob.type || 'image/webp', upsert: false });
      if (upErr) {
        console.error('Falha ao enviar o print do reporte.', upErr);
      } else {
        screenshotPath = path;
      }
    }

    const row: FeedbackReport = {
      id,
      type: input.type,
      status: 'novo',
      description: input.description,
      page_path: input.pagePath,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      screenshot_path: screenshotPath,
      console_logs: input.consoleLogs,
      error_stack: input.errorStack || null,
      user_agent: navigator.userAgent,
      admin_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: dbErr } = await supabase.from('feedback_reports').insert(row);
    if (dbErr) {
      console.error('Falha ao registrar o reporte.', dbErr);
      return false;
    }
    return true;
  }

  /** Busca sob demanda para o painel admin — não entra no ciclo de sync geral (baixo volume, só admin lê). */
  public async getFeedbackReports(): Promise<FeedbackReport[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('feedback_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Falha ao carregar reportes.', error);
      return [];
    }
    return (data || []) as FeedbackReport[];
  }

  public async updateFeedbackReport(id: string, patch: { status?: FeedbackReport['status']; admin_notes?: string }): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('feedback_reports')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('Falha ao atualizar o reporte.', error);
      return false;
    }
    return true;
  }

  /** URL assinada do print de um reporte — mesmo cache em memória e TTL dos anexos de solicitação. */
  public async getFeedbackScreenshotUrl(path: string): Promise<string | null> {
    if (!supabase || !path) return null;

    const cached = this.signedUrlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const { data, error } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SEGUNDOS);

    if (error || !data?.signedUrl) {
      console.error('Falha ao gerar URL do print.', error);
      return null;
    }

    this.signedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + (SIGNED_URL_TTL_SEGUNDOS / 2) * 1000
    });
    return data.signedUrl;
  }

```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/localDb.ts
git commit -m "feat: adiciona métodos de reporte (submit/list/update/screenshot url) ao localDb"
```

---

### Task 7: `TourRegistryContext.tsx` — tour registry + `usePageTour`

**Files:**
- Create: `src/components/help/TourRegistryContext.tsx`

**Interfaces:**
- Consumes: `useTour` from `./useTour` (existing).
- Produces: `TourRegistryProvider`, `useTourRegistry(): { activeTour: ActiveTourControls | null; registerTour: (c) => void }`, `usePageTour(tourId, stepCount)` (same return shape as `useTour`) — consumed by `FeedbackButton.tsx` (Task 10, `useTourRegistry`), `NewRequest.tsx`/`RastreioCompras.tsx` (Task 8, `usePageTour`), `App.tsx` (Task 11, `TourRegistryProvider`).

- [ ] **Step 1: Write the file**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTour } from './useTour';

export interface ActiveTourControls {
  open: () => void;
  seen: boolean;
}

interface TourRegistryValue {
  activeTour: ActiveTourControls | null;
  registerTour: (controls: ActiveTourControls | null) => void;
}

const TourRegistryContext = createContext<TourRegistryValue | null>(null);

/**
 * Só uma página tem tour montado por vez (a rota atual), então "o tour ativo"
 * é sempre o último registrado — sem precisar indexar por página.
 */
export function TourRegistryProvider({ children }: { children: React.ReactNode }) {
  const [activeTour, setActiveTour] = useState<ActiveTourControls | null>(null);
  const registerTour = useCallback((controls: ActiveTourControls | null) => {
    setActiveTour(controls);
  }, []);

  return (
    <TourRegistryContext.Provider value={{ activeTour, registerTour }}>
      {children}
    </TourRegistryContext.Provider>
  );
}

/** Lido pelo FeedbackButton global para saber se a página atual tem tour a oferecer. */
export function useTourRegistry(): TourRegistryValue {
  const ctx = useContext(TourRegistryContext);
  if (!ctx) throw new Error('useTourRegistry precisa estar dentro de um TourRegistryProvider.');
  return ctx;
}

/**
 * Substitui `useTour` + `<HelpButton>` renderizado localmente: a página
 * continua dona do `useTour`/`<TourSpotlight>`, só o botão flutuante virou
 * global (FeedbackButton). Registra `{ open, seen }` no mount, limpa no unmount.
 */
export function usePageTour(tourId: string, stepCount: number) {
  const tour = useTour(tourId, stepCount);
  const { registerTour } = useTourRegistry();

  useEffect(() => {
    registerTour({ open: tour.open, seen: tour.seen });
    return () => registerTour(null);
  }, [registerTour, tour.open, tour.seen]);

  return tour;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no new errors (nothing imports this file yet, but it must type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/help/TourRegistryContext.tsx
git commit -m "feat: adiciona registro global de tour por página"
```

---

### Task 8: Wire `NewRequest.tsx` and `RastreioCompras.tsx` to `usePageTour`

**Files:**
- Modify: `src/views/NewRequest.tsx`
- Modify: `src/views/RastreioCompras.tsx`

**Interfaces:**
- Consumes: `usePageTour` from `../components/help/TourRegistryContext` (Task 7).

- [ ] **Step 1: `NewRequest.tsx` — swap the import and hook call**

Replace:
```ts
import { useTour } from '../components/help/useTour';
import TourSpotlight from '../components/help/TourSpotlight';
import HelpButton from '../components/help/HelpButton';
import type { TourStep } from '../components/help/types';
```
with:
```ts
import TourSpotlight from '../components/help/TourSpotlight';
import { usePageTour } from '../components/help/TourRegistryContext';
import type { TourStep } from '../components/help/types';
```

Replace:
```ts
  const tour = useTour('nova-solicitacao', NOVA_SOLICITACAO_TOUR_STEPS.length);
```
with:
```ts
  const tour = usePageTour('nova-solicitacao', NOVA_SOLICITACAO_TOUR_STEPS.length);
```

- [ ] **Step 2: `NewRequest.tsx` — remove the local `<HelpButton>` render**

Find (around line 1865):
```tsx
      <HelpButton onClick={tour.open} pulse={!tour.seen && !tour.isOpen} />
      {tour.isOpen && (
```
Replace with:
```tsx
      {tour.isOpen && (
```

- [ ] **Step 3: `RastreioCompras.tsx` — same three edits**

Replace:
```ts
import { useTour } from '../components/help/useTour';
import TourSpotlight from '../components/help/TourSpotlight';
import HelpButton from '../components/help/HelpButton';
import type { TourStep } from '../components/help/types';
```
with:
```ts
import TourSpotlight from '../components/help/TourSpotlight';
import { usePageTour } from '../components/help/TourRegistryContext';
import type { TourStep } from '../components/help/types';
```

Replace:
```ts
  const tour = useTour('rastreio-compras', RASTREIO_TOUR_STEPS.length);
```
with:
```ts
  const tour = usePageTour('rastreio-compras', RASTREIO_TOUR_STEPS.length);
```

Find (around line 596):
```tsx
      <HelpButton onClick={tour.open} pulse={!tour.seen && !tour.isOpen} />
      {tour.isOpen && (
```
Replace with:
```tsx
      {tour.isOpen && (
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint`
Expected: no errors. (`TourRegistryProvider` isn't mounted in `App.tsx` yet — that's Task 11 — so these two pages would throw at runtime if rendered before then; that's fine, it lands in the same overall change set before shipping. Don't run the dev server against these two pages until Task 11 is done.)

- [ ] **Step 5: Commit**

```bash
git add src/views/NewRequest.tsx src/views/RastreioCompras.tsx
git commit -m "refactor: NewRequest e RastreioCompras usam usePageTour em vez de HelpButton local"
```

---

### Task 9: `FeedbackModal.tsx` — bug/sugestão form

**Files:**
- Create: `src/components/feedback/FeedbackModal.tsx`

**Interfaces:**
- Consumes: `Modal`, `ModalHeader`, `ModalBody`, `ModalFooter` from `../ui/Modal` (existing); `useToast` from `../ui/Toast` (existing); `captureViewport` from `../../lib/screenshotCapture` (Task 5); `getRecentLogs` from `../../lib/consoleLogBuffer` (Task 3); `localDb` from `../../db/localDb` (Task 6).
- Produces: `<FeedbackModal mode="bug"|"sugestao" pagePath={string} prefillDescription?={string} prefillStack?={string} onClose={() => void} />` — consumed by `FeedbackButton.tsx` (Task 10).

- [ ] **Step 1: Write the file**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Bug, Camera, Lightbulb, Loader2, X } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { captureViewport } from '../../lib/screenshotCapture';
import { getRecentLogs } from '../../lib/consoleLogBuffer';
import { localDb } from '../../db/localDb';

interface FeedbackModalProps {
  mode: 'bug' | 'sugestao';
  pagePath: string;
  /** Pré-preenchido quando o modal abre a partir do ErrorBoundary (via feedbackReportBus). */
  prefillDescription?: string;
  prefillStack?: string;
  onClose: () => void;
}

export default function FeedbackModal({ mode, pagePath, prefillDescription, prefillStack, onClose }: FeedbackModalProps) {
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const [description, setDescription] = useState(prefillDescription || '');
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Print automático só no fluxo de bug reportado manualmente pelo menu (não
    // quando vem de um crash — a tela do ErrorBoundary não ajuda visualmente).
    if (mode === 'bug' && !prefillStack) {
      void retakeScreenshot();
    }
    return () => {
      if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retakeScreenshot = async () => {
    setCapturing(true);
    // Esconde o próprio modal durante a captura para não fotografar a si mesmo.
    if (panelRef.current) panelRef.current.style.visibility = 'hidden';
    const blob = await captureViewport();
    if (panelRef.current) panelRef.current.style.visibility = 'visible';
    setCapturing(false);

    if (!blob) return;
    setScreenshotBlob(prev => {
      return blob;
    });
    setScreenshotPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  };

  const removeScreenshot = () => {
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    setScreenshotBlob(null);
    setScreenshotPreviewUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error(mode === 'bug' ? 'Descreva o que aconteceu.' : 'Descreva sua sugestão.');
      return;
    }

    setSubmitting(true);
    const ok = await localDb.submitFeedbackReport({
      type: mode,
      description: description.trim(),
      pagePath,
      screenshotBlob,
      consoleLogs: getRecentLogs(),
      errorStack: prefillStack,
    });
    setSubmitting(false);

    if (!ok) {
      toast.error('Não foi possível enviar. Tente novamente.');
      return;
    }
    toast.success(mode === 'bug' ? 'Erro reportado. Obrigado!' : 'Sugestão enviada. Obrigado!');
    onClose();
  };

  const isBug = mode === 'bug';

  return (
    <Modal onClose={onClose} ariaLabel={isBug ? 'Reportar um erro' : 'Enviar sugestão'} zIndexClassName="z-[95]">
      <div ref={panelRef} className="contents">
        <ModalHeader onClose={onClose}>
          <div className="flex items-center gap-2">
            {isBug ? <Bug className="h-5 w-5 text-red-600" /> : <Lightbulb className="h-5 w-5 text-amber-500" />}
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {isBug ? 'Reportar um erro' : 'Enviar sugestão'}
            </h2>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-4">
            <div>
              <label htmlFor="feedback-description" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                {isBug ? 'O que aconteceu?' : 'Sua sugestão'}
              </label>
              <textarea
                id="feedback-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                autoFocus
                placeholder={isBug ? 'Descreva o problema e, se possível, os passos para reproduzir.' : 'Conte o que você gostaria de ver melhorado.'}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Print da tela</span>
                <button
                  type="button"
                  onClick={retakeScreenshot}
                  disabled={capturing}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50"
                >
                  {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  {screenshotPreviewUrl ? 'Capturar novamente' : 'Anexar print'}
                </button>
              </div>

              {screenshotPreviewUrl ? (
                <div className="relative inline-block">
                  <img src={screenshotPreviewUrl} alt="Print da tela" className="max-h-48 rounded-lg border border-slate-200 dark:border-slate-700" />
                  <button
                    type="button"
                    onClick={removeScreenshot}
                    aria-label="Remover print"
                    className="absolute -top-2 -right-2 rounded-full bg-slate-900 text-white p-1 shadow-md hover:bg-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <p className="mt-1 text-[10px] text-slate-400">A imagem pode conter dados da tela atual.</p>
                </div>
              ) : capturing ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturando...
                </div>
              ) : (
                <p className="text-xs text-slate-400">Nenhum print anexado.</p>
              )}
            </div>
          </ModalBody>

          <ModalFooter>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? 'Enviando...' : 'Enviar'}
            </button>
          </ModalFooter>
        </form>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/feedback/FeedbackModal.tsx
git commit -m "feat: adiciona formulário de reporte de bug/sugestão"
```

---

### Task 10: `FeedbackButton.tsx` — global floating button + popup menu

**Files:**
- Create: `src/components/feedback/FeedbackButton.tsx`
- Delete: `src/components/help/HelpButton.tsx`

**Interfaces:**
- Consumes: `useTourRegistry` from `../help/TourRegistryContext` (Task 7); `onBugPrefill`, `BugPrefill` from `../../lib/feedbackReportBus` (Task 4); `FeedbackModal` from `./FeedbackModal` (Task 9).
- Produces: `<FeedbackButton pagePath={string} />` — consumed by `App.tsx` (Task 11).

- [ ] **Step 1: Delete the superseded component**

```bash
git rm src/components/help/HelpButton.tsx
```

- [ ] **Step 2: Write `FeedbackButton.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bug, HelpCircle, Lightbulb, MessageCircleQuestion } from 'lucide-react';
import { useTourRegistry } from '../help/TourRegistryContext';
import { onBugPrefill, BugPrefill } from '../../lib/feedbackReportBus';
import FeedbackModal from './FeedbackModal';

interface FeedbackButtonProps {
  pagePath: string;
}

type ModalState = { mode: 'bug' | 'sugestao'; prefill?: BugPrefill } | null;

/**
 * Botão flutuante único, montado uma vez no layout autenticado (App.tsx).
 * Substitui o antigo HelpButton por página: o "Tour guiado" só aparece no
 * menu quando a página atual registrou um tour via usePageTour.
 */
export default function FeedbackButton({ pagePath }: FeedbackButtonProps) {
  const { activeTour } = useTourRegistry();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  useEffect(() => onBugPrefill(prefill => {
    setMenuOpen(false);
    setModal({ mode: 'bug', prefill });
  }), []);

  const pulse = !!activeTour && !activeTour.seen;

  return (
    <div className="fixed bottom-6 right-6 z-[90]" data-tour="help-button">
      {pulse && (
        <motion.span
          className="absolute inset-0 rounded-full bg-emerald-500"
          animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      {menuOpen && (
        <div
          role="menu"
          className="absolute bottom-16 right-0 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {activeTour && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); activeTour.open(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <HelpCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              Tour guiado desta página
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); setModal({ mode: 'bug' }); }}
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${activeTour ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}
          >
            <Bug className="h-4 w-4 text-red-600 shrink-0" />
            Reportar um erro
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); setModal({ mode: 'sugestao' }); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800"
          >
            <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
            Enviar sugestão
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMenuOpen(v => !v)}
        aria-label="Ajuda e reportes"
        title="Ajuda / Reportar"
        className="relative flex items-center justify-center h-12 w-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 transition-colors active:scale-95"
      >
        <MessageCircleQuestion className="h-5.5 w-5.5" />
      </button>

      {modal && (
        <FeedbackModal
          mode={modal.mode}
          pagePath={pagePath}
          prefillDescription={modal.prefill?.message}
          prefillStack={modal.prefill?.stack}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/feedback/FeedbackButton.tsx
git rm src/components/help/HelpButton.tsx 2>/dev/null || true
git commit -m "feat: adiciona botão flutuante global Reportar (substitui HelpButton por página)"
```

---

### Task 11: Mount globally — `App.tsx` + `main.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `TourRegistryProvider` from `./components/help/TourRegistryContext` (Task 7), `FeedbackButton` from `./components/feedback/FeedbackButton` (Task 10), `installConsoleLogBuffer` from `./lib/consoleLogBuffer` (Task 3).

- [ ] **Step 1: `main.tsx` — install the log buffer at boot**

```tsx
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/ui/Toast';
import { installConsoleLogBuffer } from './lib/consoleLogBuffer';
import './index.css';

installConsoleLogBuffer();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: `App.tsx` — add imports**

Near the other component imports (around line 9-11):

```ts
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary, { CHUNK_RELOAD_GUARD_KEY } from './components/ErrorBoundary';
import { TourRegistryProvider } from './components/help/TourRegistryContext';
import FeedbackButton from './components/feedback/FeedbackButton';
```

- [ ] **Step 3: `App.tsx` — wrap the authenticated layout and mount the button**

The current return (around line 582-645) is:

```tsx
  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors">
      {/* Collapsible / off-canvas Sidebar */}
      <Sidebar ... />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950 transition-colors min-w-0">
        {/* Dynamic Header */}
        <Header ... />

        {/* Dynamic scrollable main pane view */}
        <main ...>
          <ErrorBoundary key={currentPath}>
            <Suspense fallback={<ViewLoadingFallback />}>
              <div ...>
                {renderActiveView()}
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
```

Change the outer `return (` line to:

```tsx
  return (
    <TourRegistryProvider>
    <div className="flex h-full w-full overflow-hidden bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors">
```

And change the closing of the function (the last few lines) from:

```tsx
      </div>
    </div>
  );
}
```

to:

```tsx
      </div>
      <FeedbackButton pagePath={currentPath} />
    </div>
    </TourRegistryProvider>
  );
}
```

(`FeedbackButton` is `position: fixed`, so its placement in the DOM tree doesn't affect layout — it's added as the last sibling inside the outer flex container, after the "Main Content Area" div, so it renders above everything regardless of which page crashed.)

- [ ] **Step 4: Verify it compiles and boots**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/main.tsx
git commit -m "feat: monta TourRegistryProvider e FeedbackButton globalmente"
```

---

### Task 12: `ErrorBoundary.tsx` — "Reportar este erro" button

**Files:**
- Modify: `src/components/ErrorBoundary.tsx`

**Interfaces:**
- Consumes: `emitBugPrefill` from `../lib/feedbackReportBus` (Task 4).

- [ ] **Step 1: Rewrite the file**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { emitBugPrefill } from '../lib/feedbackReportBus';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Depois de um novo deploy, o chunk JS de uma tela lazy-loaded referenciado pela
// página já aberta no navegador deixa de existir no servidor (Vite gera nomes de
// arquivo com hash a cada build). O import() falha com uma dessas mensagens.
const CHUNK_LOAD_ERROR = /failed to fetch dynamically imported module|loading chunk|error loading dynamically imported module|importing a module script failed/i;

export const CHUNK_RELOAD_GUARD_KEY = 'sisten_chunk_reload_attempted';

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Um recarregamento busca o index.html atual, que aponta para os arquivos já
    // publicados, resolvendo o caso comum de chunk desatualizado. Guardado por
    // sessionStorage para não entrar em loop caso o erro seja outra coisa.
    if (CHUNK_LOAD_ERROR.test(error.message) && !sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
      window.location.reload();
    }
  }

  handleReport = () => {
    emitBugPrefill({
      message: this.state.error?.message || 'Erro desconhecido',
      stack: this.state.error?.stack,
      pagePath: window.location.hash ? window.location.hash.slice(1).split('?')[0] : '/',
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Não foi possível carregar esta tela.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Recarregar
            </button>
            <button
              type="button"
              onClick={this.handleReport}
              className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Reportar este erro
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ErrorBoundary.tsx
git commit -m "feat: ErrorBoundary oferece 'Reportar este erro' pré-preenchendo o formulário de bug"
```

---

### Task 13: `pages.ts` — `admin_feedback` page

**Files:**
- Modify: `src/lib/pages.ts`

**Interfaces:**
- Produces: page id `admin_feedback` (path `/admin/feedback`), consumed by `AdminPanel.tsx` (Task 14) and the Sidebar menu (existing, reads `PAGES` automatically).

- [ ] **Step 1: Add `Flag` to the icon import**

```ts
import {
  Home, Search, BarChart3, PlusCircle, List, FileCheck, Database,
  LayoutDashboard, Upload, Users, Shield, Map, Settings, KeyRound, Radio,
  Truck, PackageSearch, Building2, History, Route, Activity, Boxes, Info,
  ClipboardList, FileText, Receipt, Sparkles, Flag,
} from 'lucide-react';
```

- [ ] **Step 2: Add the page definition**

Right after the `admin_teste` entry, before the closing `];` of `PAGES`:

```ts
  { id: 'admin_teste', group: 'ADMINISTRAÇÃO', label: 'Teste', path: '/admin/teste', icon: Sparkles, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_feedback', group: 'ADMINISTRAÇÃO', label: 'Reportes', path: '/admin/feedback', icon: Flag, defaultRoles: ['admin'], alwaysAdmin: true },
];
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pages.ts
git commit -m "feat: registra a página admin_feedback (Reportes)"
```

---

### Task 14: `AdminPanel.tsx` — "Reportes" tab

**Files:**
- Modify: `src/views/AdminPanel.tsx`
- Modify: `src/App.tsx` (route the new path to `AdminPanel`)

**Interfaces:**
- Consumes: `FeedbackReport` from `../types` (Task 2); `localDb.getFeedbackReports`, `localDb.updateFeedbackReport`, `localDb.getFeedbackScreenshotUrl` (Task 6).

- [ ] **Step 1: `App.tsx` — add `/admin/feedback` to the routes handled by `AdminPanel`**

Find (around line 558-569):
```tsx
      case '/admin/usuarios':
      case '/admin/setores':
      case '/admin/permissoes':
      case '/admin/importacao-materiais':
      case '/suprimentos/importar':
      case '/suprimentos/importar/log':
      case '/suprimentos/grupos-comprador':
      case '/admin/helpdesk':
        if (canAccessPage(user, pageIdForPath(currentPath) as string)) {
          return <AdminPanel user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
```
Add `case '/admin/feedback':` to the list:
```tsx
      case '/admin/usuarios':
      case '/admin/setores':
      case '/admin/permissoes':
      case '/admin/importacao-materiais':
      case '/suprimentos/importar':
      case '/suprimentos/importar/log':
      case '/suprimentos/grupos-comprador':
      case '/admin/helpdesk':
      case '/admin/feedback':
        if (canAccessPage(user, pageIdForPath(currentPath) as string)) {
          return <AdminPanel user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
```

Also add `'/admin/feedback'` to `STATE_PRESERVING_PATHS` (around line 78, next to the other `/admin/*` entries) so navigating away and back doesn't remount and lose the selected report / filters:
```ts
  '/admin/helpdesk',
  '/admin/uso',
  '/admin/feedback',
```

- [ ] **Step 2: `AdminPanel.tsx` — imports**

Add to the `lucide-react` import (around line 7-11):
```ts
import {
  Users, Map, Shield, Upload, Check, X, AlertTriangle,
  Trash, Save, Activity, RefreshCw, FileText, FileSpreadsheet, Plus,
  FileX, CheckCircle2, XCircle, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Download, Truck, Sparkles, UserPlus,
  Flag, Bug, Lightbulb, Image as ImageIcon
} from 'lucide-react';
```

Add to the `types` import (around line 15):
```ts
import { Profile, Sector, Material, FeedbackReport } from '../types';
```

- [ ] **Step 3: `AdminPanel.tsx` — extend `activeTab` union and hash routing**

Change (around line 27-29):
```ts
  const [activeTab, setActiveTab] = useState<
    'usuarios' | 'setores' | 'permissoes' | 'importar' | 'importar_sap' | 'importar_sap_log' | 'grupos_comprador' | 'helpdesk_config'
  >('usuarios');
```
to:
```ts
  const [activeTab, setActiveTab] = useState<
    'usuarios' | 'setores' | 'permissoes' | 'importar' | 'importar_sap' | 'importar_sap_log' | 'grupos_comprador' | 'helpdesk_config' | 'feedback'
  >('usuarios');
```

Change the hash-change handler (around line 94):
```ts
      else if (path === '/admin/helpdesk') setActiveTab('helpdesk_config');
```
to:
```ts
      else if (path === '/admin/helpdesk') setActiveTab('helpdesk_config');
      else if (path === '/admin/feedback') setActiveTab('feedback');
```

- [ ] **Step 4: `AdminPanel.tsx` — feedback state + effects**

Add near the other `useState` blocks (after the "Helpdesk Config States" block, around line 82):

```ts
  // Feedback (Reportes) States
  const [feedbackReports, setFeedbackReports] = useState<FeedbackReport[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [feedbackFilterType, setFeedbackFilterType] = useState<'all' | 'bug' | 'sugestao'>('all');
  const [feedbackFilterStatus, setFeedbackFilterStatus] = useState<'all' | FeedbackReport['status']>('all');
  const [feedbackScreenshotUrl, setFeedbackScreenshotUrl] = useState<string | null>(null);
  const [feedbackNotesDraft, setFeedbackNotesDraft] = useState('');
```

Add near the other `useEffect`s (after the hash-change effect, around line 100):

```ts
  useEffect(() => {
    if (activeTab !== 'feedback') return;
    let cancelled = false;
    setFeedbackLoading(true);
    localDb.getFeedbackReports().then(rows => {
      if (!cancelled) {
        setFeedbackReports(rows);
        setFeedbackLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [activeTab]);

  const selectedFeedback = feedbackReports.find(r => r.id === selectedFeedbackId) || null;
  const filteredFeedbackReports = feedbackReports.filter(r =>
    (feedbackFilterType === 'all' || r.type === feedbackFilterType) &&
    (feedbackFilterStatus === 'all' || r.status === feedbackFilterStatus)
  );
  const novosFeedbackCount = feedbackReports.filter(r => r.status === 'novo').length;

  useEffect(() => {
    setFeedbackScreenshotUrl(null);
    setFeedbackNotesDraft(selectedFeedback?.admin_notes || '');
    if (selectedFeedback?.screenshot_path) {
      localDb.getFeedbackScreenshotUrl(selectedFeedback.screenshot_path).then(setFeedbackScreenshotUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeedback?.id]);

  const handleUpdateFeedbackStatus = async (id: string, status: FeedbackReport['status']) => {
    const ok = await localDb.updateFeedbackReport(id, { status });
    if (!ok) { toast.error('Falha ao atualizar status.'); return; }
    setFeedbackReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const handleSaveFeedbackNotes = async () => {
    if (!selectedFeedback) return;
    const ok = await localDb.updateFeedbackReport(selectedFeedback.id, { admin_notes: feedbackNotesDraft });
    if (!ok) { toast.error('Falha ao salvar nota.'); return; }
    setFeedbackReports(prev => prev.map(r => r.id === selectedFeedback.id ? { ...r, admin_notes: feedbackNotesDraft } : r));
    toast.success('Nota salva.');
  };
```

- [ ] **Step 5: `AdminPanel.tsx` — tab button**

Add right after the "Config. Helpdesk" tab button (around line 459, still inside the `user.roles.includes('admin')` block, or as its own block right after it):

```tsx
        {user.roles.includes('admin') && (
          <button
            onClick={() => { setActiveTab('feedback'); window.location.hash = '/admin/feedback'; }}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'feedback' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Flag className="h-4 w-4 mr-1.5 text-rose-600" />
            Reportes
            {novosFeedbackCount > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5">{novosFeedbackCount}</span>
            )}
          </button>
        )}
```

- [ ] **Step 6: `AdminPanel.tsx` — tab body**

Add right after the `{activeTab === 'helpdesk_config' && ( ... )}` block closes (search for the matching closing `)}` — it's the block that starts around line 2133):

```tsx
      {activeTab === 'feedback' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 h-[calc(100vh-220px)]">
          {/* Lista */}
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <select
                value={feedbackFilterType}
                onChange={e => setFeedbackFilterType(e.target.value as any)}
                className="text-xs rounded-md border border-slate-200 px-2 py-1.5 flex-1"
              >
                <option value="all">Todos os tipos</option>
                <option value="bug">Bug</option>
                <option value="sugestao">Sugestão</option>
              </select>
              <select
                value={feedbackFilterStatus}
                onChange={e => setFeedbackFilterStatus(e.target.value as any)}
                className="text-xs rounded-md border border-slate-200 px-2 py-1.5 flex-1"
              >
                <option value="all">Todos os status</option>
                <option value="novo">Novo</option>
                <option value="em_analise">Em análise</option>
                <option value="resolvido">Resolvido</option>
                <option value="arquivado">Arquivado</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {feedbackLoading && (
                <p className="p-4 text-xs text-slate-400">Carregando...</p>
              )}
              {!feedbackLoading && filteredFeedbackReports.length === 0 && (
                <p className="p-4 text-xs text-slate-400">Nenhum reporte encontrado.</p>
              )}
              {filteredFeedbackReports.map(r => (
                <div
                  key={r.id}
                  onClick={() => setSelectedFeedbackId(r.id)}
                  className={`p-3.5 cursor-pointer hover:bg-slate-50/60 transition-colors ${selectedFeedbackId === r.id ? 'bg-emerald-50/40 border-l-4 border-emerald-600' : ''}`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    {r.type === 'bug' ? <Bug className="h-3.5 w-3.5 text-red-600 shrink-0" /> : <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    <span className="truncate">{r.description.slice(0, 60)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{r.user_name} · {r.page_path} · {new Date(r.created_at).toLocaleString('pt-BR')}</p>
                  <span className={`inline-block mt-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    r.status === 'novo' ? 'bg-rose-100 text-rose-700' :
                    r.status === 'em_analise' ? 'bg-amber-100 text-amber-700' :
                    r.status === 'resolvido' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {r.status === 'novo' ? 'Novo' : r.status === 'em_analise' ? 'Em análise' : r.status === 'resolvido' ? 'Resolvido' : 'Arquivado'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Detalhe */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-y-auto p-5">
            {!selectedFeedback ? (
              <p className="text-xs text-slate-400">Selecione um reporte na lista.</p>
            ) : (
              <div className="space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    {selectedFeedback.type === 'bug' ? <Bug className="h-4 w-4 text-red-600" /> : <Lightbulb className="h-4 w-4 text-amber-500" />}
                    {selectedFeedback.type === 'bug' ? 'Bug reportado' : 'Sugestão'}
                  </h3>
                  <p className="text-slate-500 mt-2 whitespace-pre-wrap">{selectedFeedback.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-500">
                  <div><span className="font-semibold text-slate-700">Reportado por:</span> {selectedFeedback.user_name} ({selectedFeedback.user_email})</div>
                  <div><span className="font-semibold text-slate-700">Página:</span> {selectedFeedback.page_path}</div>
                  <div><span className="font-semibold text-slate-700">Data:</span> {new Date(selectedFeedback.created_at).toLocaleString('pt-BR')}</div>
                  <div><span className="font-semibold text-slate-700">Navegador:</span> {selectedFeedback.user_agent}</div>
                </div>

                {feedbackScreenshotUrl && (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Print</p>
                    <a href={feedbackScreenshotUrl} target="_blank" rel="noreferrer">
                      <img src={feedbackScreenshotUrl} alt="Print do reporte" className="max-h-64 rounded-lg border border-slate-200" />
                    </a>
                  </div>
                )}

                {selectedFeedback.error_stack && (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1.5">Stack trace</p>
                    <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-[10px] overflow-x-auto whitespace-pre-wrap">{selectedFeedback.error_stack}</pre>
                  </div>
                )}

                {selectedFeedback.console_logs && selectedFeedback.console_logs.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1.5">Logs de console ({selectedFeedback.console_logs.length})</p>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-2 max-h-40 overflow-y-auto space-y-1">
                      {selectedFeedback.console_logs.map((log, i) => (
                        <p key={i} className={`text-[10px] font-mono ${log.level === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                          [{log.level}] {log.message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="font-semibold text-slate-700 mb-1.5">Status</p>
                  <select
                    value={selectedFeedback.status}
                    onChange={e => handleUpdateFeedbackStatus(selectedFeedback.id, e.target.value as FeedbackReport['status'])}
                    className="text-xs rounded-md border border-slate-200 px-2 py-1.5 w-full"
                  >
                    <option value="novo">Novo</option>
                    <option value="em_analise">Em análise</option>
                    <option value="resolvido">Resolvido</option>
                    <option value="arquivado">Arquivado</option>
                  </select>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1.5">Nota interna</p>
                  <textarea
                    value={feedbackNotesDraft}
                    onChange={e => setFeedbackNotesDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={handleSaveFeedbackNotes}
                    className="mt-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5"
                  >
                    Salvar nota
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 7: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/views/AdminPanel.tsx src/App.tsx
git commit -m "feat: adiciona aba Reportes no painel admin"
```

---

## Final Verification (manual — after all 14 tasks)

- [ ] `npm run lint` and `npm run build` clean from a fresh checkout.
- [ ] `npm test` (all `.test.ts` files) passes.
- [ ] Log in, go to `/solicitacoes/nova` (has a tour): floating button menu shows "Tour guiado desta página", "Reportar um erro", "Enviar sugestão".
- [ ] Go to a page without a tour (e.g. `/materiais/busca`): menu shows only "Reportar um erro" and "Enviar sugestão".
- [ ] Click "Reportar um erro": screenshot auto-captures (spinner then thumbnail), type a description, submit — confirm success toast.
- [ ] Click "Enviar sugestão": no auto screenshot, "Anexar print" available manually, submit — confirm success toast.
- [ ] In the Supabase dashboard or via `execute_sql`, confirm the two rows landed in `feedback_reports` with `console_logs` populated and (for the bug) a `screenshot_path`.
- [ ] Force a render crash (e.g. temporarily throw inside a view component), confirm `ErrorBoundary`'s fallback shows both "Recarregar" and "Reportar este erro", and clicking the latter opens the bug form with the error message/stack pre-filled.
- [ ] As an admin, open `/admin/feedback` ("Reportes" tab): both submitted reports appear, filters work, clicking a report shows description/screenshot/logs/stack, changing status and saving a note both persist (reload the page and confirm they stuck).
- [ ] Remove the temporary crash-inducing code used for the ErrorBoundary test before considering this done.
