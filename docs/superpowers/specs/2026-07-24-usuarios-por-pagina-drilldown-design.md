# Design — Drill-down "Usuários por página" (SISTEN / Uso do App)

**Data:** 2026-07-24
**Status:** Aprovado para planejamento
**Contexto:** Extensão da página `/admin/uso` ([UsageDashboard.tsx](../../../src/views/UsageDashboard.tsx)),
definida no design [2026-07-22-analytics-uso-app-design.md](2026-07-22-analytics-uso-app-design.md).

## Objetivo

No card **"Páginas mais acessadas"**, permitir ver, para cada página, **quem**
foram os usuários que a acessaram — respondendo "das páginas mais acessadas,
quais usuários acessaram cada uma".

Hoje existe o caminho inverso (selecionar um usuário → ver as páginas dele), mas
não o de partir de uma página e listar seus usuários.

## Comportamento

- Cada linha da tabela do ranking vira **clicável**, com um chevron à esquerda
  indicando expansão.
- Ao expandir, mostra uma **sub-lista dos usuários** que acessaram aquela página
  no período, ordenados por nº de visitas (desc). Para cada usuário:
  **nome, nº de visitas, data/hora do último acesso**.
- A expansão mostra **todos** os usuários que acessaram a página no período,
  **independente do filtro de usuário do topo** (o filtro só afeta as contagens
  do ranking; o drill-down de "quem acessou" fica sempre completo).
- Múltiplas linhas podem ficar expandidas ao mesmo tempo.

## Backend — nova função RPC

`public.usage_page_users(p_path text, p_from timestamptz, p_to timestamptz)`

- `SECURITY DEFINER`, `SET search_path = public`, com `PERFORM public._usage_require_admin();`
  no início — mesmo padrão de `usage_page_ranking` e demais funções de uso.
- Retorna: `user_id text, user_name text, email text, visits int, last_visit timestamptz`.
- Lógica: filtra `usage_events` por `event_type = 'page_view'`, `path = p_path`,
  `created_at BETWEEN p_from AND p_to`; agrupa por `user_id`; `count(*)` = visits,
  `max(created_at)` = last_visit; `max(user_name)`/`max(email)` desnormalizados.
  Ordena por `visits DESC`.
- Aplicada via MCP Supabase (`apply_migration`), consistente com as demais funções
  de uso que já vivem no banco (não no repo).

## Frontend — `src/views/UsageDashboard.tsx`

Alterações restritas ao card "Páginas mais acessadas" (a tabela, ~linhas 305-346).

Estado novo:
- `expandedPaths: Set<string>` — paths atualmente expandidos.
- `pageUsers: Map<string, PageUserRow[]>` — cache de resultados por path.
- `pageUsersLoading: Set<string>` — paths com busca em andamento.

Onde `PageUserRow = { user_id, user_name, email, visits, last_visit }`.

Comportamento:
- Clique na linha alterna o path em `expandedPaths`.
- Se ao expandir o path ainda não está no cache nem carregando, dispara
  `supabase.rpc('usage_page_users', { p_path, p_from: fromISO, p_to: toISO })`,
  marca loading, grava no cache ao concluir. Erros são engolidos por linha
  (mostra estado vazio), sem quebrar o restante do dashboard.
- O cache (`pageUsers`), `expandedPaths` e `pageUsersLoading` são **limpos**
  sempre que `fromISO`/`toISO` ou `selectedUser` mudam (os dados ficam obsoletos).
- Sub-lista renderizada como linhas extras (`<tr>`) abaixo da linha da página,
  reutilizando `fmtDateTime` para o último acesso.
- Chevron: `ChevronRight` (fechado) / `ChevronDown` (aberto) do `lucide-react`.

## Fora de escopo

- Nenhuma mudança no gráfico de barras, heatmap, KPIs, filtros ou no painel
  por-usuário existente.
- Sem tempo médio de permanência por usuário na sub-lista (YAGNI nesta versão).
- Sem exportação.

## Sequência de implementação

1. Migration Supabase: função `usage_page_users` (com checagem de admin).
2. `UsageDashboard.tsx`: estado de expansão + cache, chamada RPC preguiçosa,
   linhas expansíveis com chevron e sub-lista de usuários.
3. Verificação: expandir páginas do ranking e conferir os usuários/visitas.
