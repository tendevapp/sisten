# Botão flutuante "Reportar" (bug / sugestão) + painel admin

## Contexto

Hoje só duas telas (`NewRequest.tsx`, `RastreioCompras.tsx`) têm um botão flutuante `HelpButton` que reabre o tour guiado da página (`useTour` + `TourSpotlight`, `src/components/help/`). O `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) só oferece "Recarregar" quando uma tela quebra ou um chunk lazy falha ao carregar. Não existe nenhum canal para o usuário reportar um erro ou sugerir algo — o único caminho é abrir um "chamado" (Helpdesk) roteado por setor, o que não captura print, logs de console nem stack trace.

O app é local-first (IndexedDB via `idb-keyval` + sync com Supabase pelo `localDb.ts`), mas as mutações "fire-and-forget" recentes (ex.: anexos de solicitação, `docs/superpowers/specs/2026-07-28-anexos-imagens-design.md`) já seguem um padrão mais simples: grava direto no Supabase no momento da ação, sem passar pelo ciclo de sync geral. Reportes de bug/sugestão seguem esse mesmo padrão — não precisam de cache offline nem de sync automático para todo usuário; só o admin lê.

## Decisão de escopo (confirmada com o usuário)

| Questão | Decisão |
|---|---|
| Captura de tela | Automática (html2canvas) ao abrir "Reportar um erro", com preview e opção de remover antes de enviar |
| Armazenamento | Tabela nova dedicada `feedback_reports` + bucket de Storage próprio (não reaproveita o sistema de chamados/Helpdesk) |
| Logs de console | Buffer global captura sempre, em todo envio (bug ou sugestão), não só quando vem de um crash do Error Boundary |
| Retorno ao usuário | MVP é só painel interno do admin (status + nota interna). Sem tela de resposta visível ao usuário reportante |

## Arquitetura do botão

Um único botão flutuante global, montado uma vez em `App.tsx`, fora do `<Suspense>`/`ErrorBoundary` por-página (irmão do `<main>`, dentro do layout autenticado), visível em toda tela após login. Substitui o `HelpButton` atual.

- **`TourRegistryContext`** (novo, `src/components/help/TourRegistryContext.tsx`): contexto + provider montado no layout autenticado. Expõe `registerTour(controls | null)` e o tour ativo atual (só um por vez, o da página em foco). Um hook novo `usePageTour(tourId, stepCount)` envolve o `useTour` existente e registra `{ open, seen }` no contexto via `useEffect` (registra no mount, `null` no unmount). As duas páginas que hoje têm tour passam a usar esse hook em vez de renderizar `<HelpButton>` diretamente — elas continuam donas do `<TourSpotlight>`.
- **`FeedbackButton`** (novo, `src/components/feedback/FeedbackButton.tsx`): botão flutuante (mesma posição/visual do `HelpButton` atual — `fixed bottom-6 right-6 z-[90]`). Ao clicar, abre um menu popup com até 3 opções, montadas condicionalmente:
  1. "Tour guiado desta página" — só aparece se `TourRegistryContext` tiver um tour registrado para a página atual.
  2. "Reportar um erro"
  3. "Enviar sugestão"
- **`FeedbackModal`** (novo, `src/components/feedback/FeedbackModal.tsx`): modal único com `mode: 'bug' | 'sugestao'`, compartilha submit/upload.

`HelpButton.tsx` é removido (função absorvida pelo `FeedbackButton`); os dois usos em `NewRequest.tsx` e `RastreioCompras.tsx` são atualizados.

## Captura de erro (Error Boundary)

`ErrorBoundary.tsx` ganha um segundo botão na tela de fallback, "Reportar este erro", ao lado de "Recarregar". Como o `ErrorBoundary` é uma classe e pode estar isolado numa subárvore que quebrou (o `FeedbackModal` vive fora dela, no layout persistente), a comunicação não passa por Context — usa um pub-sub módulo simples:

- **`feedbackReportBus.ts`** (novo, `src/lib/`): `emitBugPrefill({ message, stack, pagePath })` / `onBugPrefill(callback)`. `ErrorBoundary.componentDidCatch` chama `emitBugPrefill`; `FeedbackButton` assina no mount e abre o `FeedbackModal` já no modo `bug`, com descrição e stack trace pré-preenchidos quando o evento chega.

## Captura de logs de console

**`consoleLogBuffer.ts`** (novo, `src/lib/`): instalado uma vez (import de efeito colateral em `main.tsx` ou topo de `App.tsx`). Faz *monkey-patch* de `console.error`/`console.warn`, e escuta `window.addEventListener('error', ...)` e `'unhandledrejection'`. Mantém um ring buffer em memória com as últimas 50 entradas (`{ level, message, timestamp }`, argumentos serializados com `String()`/`JSON.stringify` truncado a ~500 chars cada). Expõe `getRecentLogs(): LogEntry[]`. Não persiste em disco — é só contexto de sessão, anexado ao `console_logs` (jsonb) do relatório no momento do envio.

## Captura de tela

**`screenshotCapture.ts`** (novo, `src/lib/`): thin wrapper sobre `html2canvas` (dependência nova, `npm install html2canvas`). `captureViewport(): Promise<Blob>` captura o `<body>` (ou `#root`) no momento do clique em "Reportar um erro", **antes** do modal abrir (evita capturar o próprio modal). Reaproveita o padrão de compressão existente (`src/lib/imageCompression.ts` já converte para WebP qualidade 0.7 redimensionado) passando o blob capturado por `prepareAttachment`-like flow, ou aplicando a mesma lógica de canvas resize/WebP diretamente — mantém formato de saída consistente com os outros anexos do app.

No fluxo de "Enviar sugestão" o print **não** é automático — fica um botão manual "Anexar print" opcional, mesma captura sob demanda.

O preview no modal mostra um aviso curto: "A imagem pode conter dados da tela atual" — e um "×" para remover antes de enviar.

## Dados — Supabase (via MCP)

### Tabela `feedback_reports`

Verificado via MCP (`list_tables`): `profiles.id` e todo o resto do schema usam `id text` (gerado no cliente por `gerarUUID()`), não `uuid`. `feedback_reports` segue a mesma convenção — sem isso a FK para `profiles(id)` seria um erro de tipo.

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

-- Segue o mesmo padrão permissivo já usado em request_attachments_all:
-- o gate real de quem vê o painel admin é em código (canAccessPage), não em RLS.
create policy feedback_reports_all on public.feedback_reports
  for all to authenticated using (true) with check (true);
```

`user_id` referencia `profiles(id)` sem `on delete cascade` (mantém o histórico do relatório mesmo se o perfil for removido depois — `user_name`/`user_email` já ficam congelados na linha).

### Bucket de Storage

Bucket **`feedback-screenshots`**, `public = false`, limite 5 MB, MIME restrito a imagem. Policies em `storage.objects` para `authenticated` (SELECT/INSERT), espelhando o bucket `request-attachments`.

Caminho: `<report_id>/screenshot.webp`. Como não há FK do Storage para a tabela, o cliente gera `id` via `crypto.randomUUID()` antes de subir o arquivo, sobe o screenshot com esse `id` no caminho, e só então insere a linha em `feedback_reports` já com `screenshot_path` preenchido — uma chamada de insert só, sem update posterior.

### Camada `localDb`

Segue o padrão já usado por `uploadAttachments`/logs SAP: métodos novos e enxutos, sem entrar no ciclo de sync geral (o admin busca sob demanda ao abrir a aba, como os `sapLogs`):

```ts
public async submitFeedbackReport(input: {
  type: 'bug' | 'sugestao';
  description: string;
  pagePath: string;
  screenshotBlob?: Blob;
  consoleLogs: LogEntry[];
  errorStack?: string;
}): Promise<boolean>

public async getFeedbackReports(): Promise<FeedbackReport[]>  // admin-only, fetch sob demanda

public async updateFeedbackReport(id: string, patch: { status?: string; admin_notes?: string }): Promise<boolean>

public async getFeedbackScreenshotUrl(path: string): Promise<string | null>  // signed URL, cache em memória (mesmo padrão de getAttachmentUrl)
```

Falha de rede no envio: toast de erro, mensagem para o usuário tentar de novo (mesmo padrão de erro usado em `Helpdesk.tsx`/`updateRequestStatus`) — não fica em fila offline, dado que é um relatório pontual, não dado de negócio.

## Painel admin

Nova aba dentro do `AdminPanel.tsx` existente (`activeTab` ganha `'feedback'`), consistente com todas as outras ferramentas admin vivendo ali como abas. Rota `/admin/feedback`.

- Novo `PageDef` em `src/lib/pages.ts`: `admin_feedback`, grupo `ADMINISTRAÇÃO`, `alwaysAdmin: true`, ícone (ex. `Flag` ou `MessageSquareWarning`).
- Layout master-detail (mesmo padrão do `Helpdesk.tsx`): lista à esquerda (filtros por `type` e `status`, ordenada por `created_at desc`), painel de detalhe à direita.
- Detalhe mostra: descrição, screenshot (via signed URL, clique amplia), logs de console (lista colapsável), stack trace (bloco monoespaçado, só quando presente), reportado por (`user_name`/`user_email`), página (`page_path`), data. Ações: dropdown de `status`, textarea de `admin_notes` com botão salvar.
- Badge com contagem de `status = 'novo'` no rótulo da aba.

## Fora de escopo (registrado, não implementado agora)

- Notificação por e-mail/Slack ao admin quando chega um bug novo (daria para usar Edge Function, já existe precedente em `supabase/functions/atualizar-ipca`, mas é escopo à parte).
- Resposta visível ao usuário reportante.
- Deduplicação/agrupamento de relatórios semelhantes.
- Badge de pendentes no item de menu da Sidebar (cabe numa iteração futura pequena).

## Verificação

- `npm run lint` (`tsc --noEmit`) e `npm run build` limpos.
- Teste manual: reportar bug em uma tela com tour (menu mostra as 3 opções) e em uma sem tour (menu mostra 2); conferir screenshot e logs chegando na aba admin; forçar um erro de render e confirmar que "Reportar este erro" no `ErrorBoundary` pré-preenche a descrição/stack; enviar sugestão sem print; mudar status e salvar nota interna no admin.
