# Design — Analytics de Uso do App (SISTEN)

**Data:** 2026-07-22
**Autor:** brainstorming com o time
**Status:** Aprovado para planejamento

## Objetivo

Criar um histórico de uso do aplicativo (logins e navegação por página) e uma
nova página no painel Admin com dashboards e filtros, para acompanhar
indicadores de uso: usuários ativos, páginas mais usadas, atividade por usuário
e horários/frequência de acesso.

## Decisões (confirmadas com o usuário)

- **Granularidade:** login + navegação de páginas (com tempo de permanência
  derivado). Sem rastreio de cliques individuais.
- **Indicadores desejados:** usuários ativos (DAU/WAU/MAU), páginas mais usadas,
  atividade por usuário, horários e frequência de acesso.
- **Acesso à página:** somente `admin`.
- **Escrita da telemetria:** direto no Supabase, fire-and-forget (não passa pelo
  `localDb`). Se offline, o evento é descartado — aceitável para analytics.
- **Escopo de rastreio:** todos os usuários, inclusive admin (sem exceções).

## Arquitetura escolhida

Tabela única `public.usage_events` (uma linha por evento) + funções SQL de
agregação. Volume esperado é baixo (login + navegação), então uma tabela
indexada é suficiente e mantém o frontend leve. O tempo de permanência em cada
página é derivado no SQL pela diferença entre eventos consecutivos da mesma
sessão — sem coluna de duração nem `beforeunload`.

Alternativas descartadas:
- Duas tabelas (`user_sessions` + `page_views`): mais normalizado, porém mais
  código de escrita e joins, ganho pequeno para o volume.
- Reaproveitar `activity_logs`: desenhada para auditoria (`module/action/details`),
  sem semântica de path/sessão/dwell — ficaria forçado.

## Modelo de dados

Tabela nova `public.usage_events`:

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | text | FK lógica → `profiles.id` |
| `user_name` | text | desnormalizado p/ exibir sem join |
| `email` | text | idem |
| `session_id` | text | gerado no login, guardado em `sessionStorage` |
| `event_type` | text | `'login'` \| `'page_view'` (CHECK) |
| `path` | text | rota (nulo p/ login) |
| `page_label` | text | rótulo amigável (ex.: "Central Compras") |
| `created_at` | timestamptz | `now()` |

Índices:
- `idx_usage_events_created_at` em `created_at`
- `idx_usage_events_user_id` em `user_id`
- `idx_usage_events_type_created` em `(event_type, created_at)`
- `idx_usage_events_session` em `session_id`

## Backend (aplicado via MCP Supabase)

### Migration
- Cria tabela `usage_events` + índices.
- Habilita RLS.

### RLS
- `INSERT`: permitido a qualquer usuário autenticado, **forçando**
  `user_id = auth.uid()::text` (usuário só registra os próprios eventos).
- `SELECT`: **apenas admin** — `EXISTS (SELECT 1 FROM profiles WHERE
  id = auth.uid()::text AND 'admin' = ANY(roles))`.
- Sem `UPDATE`/`DELETE` para clientes.

> Observação: `profiles.id` é `text` guardando o uuid do auth; comparar com
> `auth.uid()::text`, seguindo o comportamento das políticas existentes.

### Funções SQL (RPC) — `SECURITY DEFINER`, com checagem de admin interna
Cada função valida que o chamador é admin antes de retornar dados agregados:

- `usage_active_users(p_from, p_to, p_granularity)` → série temporal de usuários
  ativos únicos (day/week/month) para DAU/WAU/MAU.
- `usage_page_ranking(p_from, p_to, p_user_id default null)` → páginas por número
  de visitas + tempo médio de permanência (dwell via `lead()` sobre eventos da
  mesma sessão).
- `usage_by_hour(p_from, p_to, p_user_id default null)` → contagem por hora do dia
  × dia da semana (heatmap).
- `usage_user_summary(p_user_id)` → último login, nº de sessões, nº de eventos,
  páginas favoritas.
- `usage_user_timeline(p_user_id, p_limit)` → eventos recentes do usuário.
- `usage_kpis(p_from, p_to)` → KPIs resumidos (ativos hoje, nº de sessões, tempo
  médio de sessão, total de page views) para os cartões do topo.

## Frontend

### Instrumentação — `src/lib/usageTracker.ts` (novo)
Módulo fire-and-forget; nunca lança erro para a UI (try/catch + swallow):
- `getOrCreateSessionId()` — gera `session_id` no login, guarda em `sessionStorage`.
- `trackLogin(user)` — insere evento `login`. Chamado quando o auth entra em
  sessão de fato.
- `trackPageView(path, label)` — insere evento `page_view`. Chamado a cada troca
  de rota.
- Usa `label` derivado de um mapa `path → rótulo` (reaproveitar rótulos do
  Sidebar quando possível).

### Integração em `src/App.tsx`
- **Login:** disparar `trackLogin` no fluxo de autenticação bem-sucedida
  (`onAuthStateChange` quando vira sessão ativa e no carregamento com sessão
  inicial), respeitando o guard de `is_signing_up`.
- **Page view:** chamar `trackPageView(pathOnly, label)` dentro de
  `handleHashChange`, a cada mudança de rota, apenas quando há usuário logado.

### Página de dashboards — `src/views/UsageDashboard.tsx` (novo)
- Rota `/admin/uso`, **somente admin** (gate em `App.tsx` com
  `user.roles.includes('admin')`; fallback para `Dashboard`).
- Novo item no Sidebar (grupo ADMINISTRAÇÃO, ícone `Activity`, `path: '/admin/uso'`).
- Adicionar `/admin/uso` ao `STATE_PRESERVING_PATHS` (tem filtros locais).
- Layout (usando `recharts`, seguindo o visual dos dashboards existentes):
  - **Filtros no topo:** intervalo de datas (7/30/90 dias + custom) e seletor de
    usuário (dropdown "Todos" + busca por nome).
  - **KPIs (cartões):** usuários ativos hoje, nº de sessões, tempo médio de
    sessão, total de page views no período.
  - **Gráfico de usuários ativos** (DAU/WAU/MAU) ao longo do tempo (linha/área).
  - **Ranking de páginas** (barras: visitas + tempo médio de permanência).
  - **Heatmap hora × dia-da-semana** de acessos.
  - **Painel por usuário** (quando um usuário é selecionado): último login,
    nº de sessões, páginas favoritas e linha do tempo de atividade recente.
- Todas as leituras via RPC (`supabase.rpc(...)`), com estados de loading/erro.

## Fora de escopo (YAGNI nesta versão)

- Rastreio de cliques individuais / eventos de ação.
- Fila offline de telemetria.
- Rastreio de `beforeunload` para dwell da última página.
- Exportação de relatórios.
- Filtro para excluir o admin das métricas (rastreia todos por ora).

## Sequência de implementação (alto nível)

1. Migration Supabase: tabela `usage_events` + índices + RLS.
2. Funções RPC de agregação + checagem de admin.
3. `usageTracker.ts` (escrita fire-and-forget).
4. Instrumentar `App.tsx` (login + page view).
5. `UsageDashboard.tsx` + rota + item no Sidebar + gate admin.
6. Verificação: gerar eventos navegando e conferir os dashboards.
