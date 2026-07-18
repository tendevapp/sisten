# SISTEN 2.0 — Plano de Recriação do App do Zero

> **Objetivo deste documento:** plano arquitetural completo para recriar o portal **SISTEN** (Torres Eólicas do Nordeste) em um projeto novo — mais eficiente, mais bonito e preparado para escalar novas funções **sem retrabalho**. Ao final está o **prompt de kickoff** pronto para colar no Claude Code (ou outro agente) e iniciar o novo projeto.
>
> Documentos-irmãos nesta pasta: `BD.md` (schema detalhado do Supabase) e o histórico da spec funcional do app atual (regras de negócio, importações SAP, RBAC) — as **regras de negócio permanecem as mesmas**; o que muda é a arquitetura.

---

## 1. Diagnóstico do app atual (por que recriar)

O app atual funciona, mas cresceu sobre decisões de protótipo que hoje geram retrabalho a cada feature nova:

| # | Problema | Evidência | Consequência |
|---|----------|-----------|--------------|
| 1 | **`localDb.ts` god-object (4.025 linhas)** — auth, RBAC, cache, sync, importações, notificações e regras de negócio num único singleton | `src/db/localDb.ts` | Toda feature nova passa por ele; impossível testar isoladamente; merge conflicts constantes |
| 2 | **Cache espelho IndexedDB do banco inteiro** — `syncFromSupabase` baixa tabelas inteiras para memória | chaves `sisten_*`, paginação de 172k materiais | Egress alto no Supabase (já exigiu `otimizacao_egress.sql`), dados desatualizados, cota de navegador, remontagem forçada via `dataVersion` |
| 3 | **Hash router manual** com `switch/case` de 100 linhas e `STATE_PRESERVING_PATHS` para contornar remontagens | `App.tsx` | Cada rota nova exige editar 3 lugares; guarda de permissão duplicada por rota |
| 4 | **Views monolíticas** (SapPanel 1.670, SuppliersNoPO 1.663, AdminPanel 1.776 linhas) com fetch, estado, regra e UI misturados | `src/views/*` | Reuso zero (cada tela reimplementa tabela, ordenação, colunas configuráveis, export XLSX, copy-to-clipboard) |
| 5 | **Lógica de negócio duplicada cliente/banco** — enriquecimento SAP existe no `localDb` **e** na view `view_enriched_requisicoes` | seção 9 da spec antiga vs. view SQL | Regras divergem (ex.: data mockada `2026-07-05` no cliente vs. `CURRENT_DATE` no banco) |
| 6 | **Sem testes, sem CI, sem migrações versionadas** — SQL aplicado por arquivos soltos na raiz (`criar_view_*.sql`, `otimizacao_egress.sql`) | raiz do repo | Nenhuma garantia de reprodutibilidade do banco |
| 7 | **RLS habilitado mas sem políticas granulares por papel** — o acesso efetivo continua amplo via anon key | `BD.md` + advisors | Segurança dependente do cliente |
| 8 | **Notificações por polling (4s)** e sem realtime | `Header.tsx` | Carga desnecessária; UX inferior |

O que o app atual **acertou** e deve ser preservado:
- Banco já bem modelado: views `view_enriched_requisicoes` / `view_enriched_pedidos` / `vw_demandas` / `vw_historico_pedidos` / `vw_historico_fornecedores_sem_po`, matviews `mv_pedido_atual_por_ri` / `mv_historico_pedidos`, função `refresh_historico_pedidos`, tabela `dataset_versions` + `bump_dataset_version` (invalidação de cache por versão de carga) e `has_role` / `handle_new_user` (Supabase Auth real já em uso).
- Regras de negócio maduras e validadas: pipeline de importação ME5A/ZL0132/PEDIDOSFORN/CONTATOS com `reconcileSchema`, RBAC de 8 papéis, SLA por criticidade, numeração 7 dígitos, indicadores de atraso/alerta, classificação de demandas por prefixo da RC (11/12/13/17), atribuição de comprador por `criado_por_pedido` → `compradores.usuario_sistema`.
- Design system consistente (slate + emerald, marca `#0056c6`, dark mode, pt-BR).

---

## 2. Arquitetura proposta (SISTEN 2.0)

### 2.1 Princípios
1. **O banco é a fonte de verdade e o dono das regras derivadas.** Todo indicador calculado vive em view/matview/função SQL versionada por migração. O cliente só renderiza.
2. **Server-state ≠ client-state.** TanStack Query gerencia dados do servidor (cache, invalidação, paginação, retry); estado local de UI fica em hooks/Zustand. **Sem espelho IndexedDB do banco.**
3. **Feature-first.** Cada domínio é uma pasta autocontida (`features/<dominio>/{api,components,hooks,pages}`) — adicionar módulo novo = adicionar pasta + rota + item de menu, sem tocar no resto.
4. **Componentes de plataforma reutilizáveis.** DataTable (ordenação, colunas configuráveis, export XLSX, paginação server-side), FilterBar, Drawer de detalhe, badges de status — escritos uma vez em `components/`.
5. **Segurança no banco.** RLS com políticas por papel usando `has_role()`; permissões de UI derivadas da mesma matriz.
6. **Tudo versionado e testável**: migrações Supabase CLI, tipos gerados (`supabase gen types`), Vitest + Testing Library, CI com lint/typecheck/test.

### 2.2 Stack

| Camada | Escolha | Motivo |
|--------|---------|--------|
| Build | **Vite 7** + React 19 + TypeScript strict | continuidade, DX |
| Rotas | **React Router v7** (data routers, lazy, loaders) | elimina hash router manual; guarda de permissão declarativa por rota |
| Server state | **TanStack Query v5** | cache com `staleTime` por dataset, invalidação via `dataset_versions` + realtime, infinite queries p/ catálogos grandes |
| UI kit | **Tailwind CSS v4 + shadcn/ui (Radix)** | acessível, tematizável com os tokens atuais (slate/emerald/`#0056c6`), dark mode |
| Tabelas | **TanStack Table v8** | base do DataTable de plataforma |
| Gráficos | **Recharts** (paleta validada de `lib/demandas.ts`) | já em uso nos dashboards de demandas |
| Formulários | **react-hook-form + zod** | validação tipada, schemas reusados no import |
| Planilhas | **xlsx** (SheetJS) | leitura/exportação como hoje |
| Backend | **Supabase** — Postgres 17, Auth, RLS, Realtime, Edge Functions, Storage | projeto atual `sisten` (sa-east-1) como referência de schema |
| Importações pesadas | **Edge Function** (`import-sap`) com upsert em lote no servidor | tira o pipeline de import do navegador; log e progresso persistidos |
| Datas | date-fns + ptBR | como hoje |

### 2.3 Estrutura de pastas

```
src/
  app/                    # bootstrap: router, providers (Query, Auth, Theme), layout shell
  components/             # plataforma: DataTable, FilterBar, StatusBadge, KpiCard, DetailDrawer,
                          # PageHeader, EmptyState, ConfirmDialog, ExportButton, CopyButton
  lib/                    # supabase client, tipos gerados, permissions.ts (matriz RBAC),
                          # format.ts (moeda/data pt-BR), xlsx.ts, demandas.ts (classificações)
  features/
    auth/                 # login, signup, reset, hook useSession (Supabase Auth)
    dashboard/            # home com KPIs por papel
    materials/            # catálogo SAP (busca server-side, favoritos, export)
    requests/             # motor de solicitações (nova, minhas, aprovações) + máquina de estados
    cadastros-sap/        # fila de cadastro item/fornecedor com SLA
    helpdesk/             # atendimento, SLA, transferência, avaliação, relatórios
    sap-panel/            # painel ME5A/ZL0132 (edição campos do comprador, item_status)
    sap-dashboards/       # dashboards de conversão/atraso + demandas (vw_demandas)
    suppliers/            # fornecedores sem PO, histórico de pedidos, contatos (CRUD)
    imports/              # uploads ME5A/ZL0132/PEDIDOSFORN/CONTATOS/materiais + logs
    admin/                # usuários, setores, permissões, grupos comprador, config helpdesk
    reports/              # relatórios gerais
  types/                  # tipos de domínio (complementam os gerados do banco)
supabase/
  migrations/             # TODO o DDL atual convertido em migrações numeradas
  functions/import-sap/   # edge function de importação
```

### 2.4 Dados e cache (substitui o `localDb`)

- **Consultas sempre server-side** com filtros/paginação no PostgREST (`ilike`, `range`, `count`), como as telas de busca pesada já fazem hoje — agora para **todas** as telas.
- **`staleTime` por natureza do dado**: catálogos SAP (materiais, requisições, pedidos, pedidosforn) mudam só em carga → `staleTime` alto + invalidação quando `dataset_versions.version` muda (canal Realtime na tabela `dataset_versions`). Dados transacionais (requests, notificações) → realtime subscription direta.
- **Notificações via Supabase Realtime** (INSERT em `notifications` filtrado por `user_id`) — fim do polling de 4s.
- **Rascunho de Nova Solicitação** continua em `localStorage` (autosave 30s) — único estado persistido no cliente.
- **Enriquecimento SAP**: o cliente lê exclusivamente `view_enriched_requisicoes` / `vw_demandas`; apagar a duplicata client-side.

### 2.5 Banco (evolução, não reescrita)

O schema atual (ver `BD.md`) é mantido, com estas correções na migração inicial:
1. Converter todo o DDL existente (tabelas, views, matviews, funções, índices, triggers) em **migrações Supabase CLI numeradas** — reprodutível do zero.
2. **IDs**: novas tabelas com `uuid default gen_random_uuid()`; manter `text` nas legadas para compatibilidade de dados (migração de tipo é opcional/fase 2).
3. **Remover `profiles.password`** — auth é 100% Supabase Auth (`handle_new_user` já cria o profile).
4. **RLS granular por papel** usando `has_role(role)`: leitura de `requests` por solicitante/gestor-do-setor/atendente/comprador/admin (espelhar `getFilteredUserRequests`); escrita em `requisicoes.obs_comprador/item_status` só para comprador/coordenador; tabelas SAP de leitura para quem tem papel de suprimentos; `materials/pedidosforn/contatos` leitura autenticada, escrita só coordenador/admin.
5. **Numeração de solicitações atômica**: função SQL `next_request_number(criticality int)` com `UPDATE sequences ... RETURNING` (elimina corrida do incremento client-side).
6. **Triggers**: histórico de status (`request_status_history`) e notificações de transição geradas por trigger/função — consistência garantida mesmo se o cliente falhar.
7. Manter e usar: `dataset_versions` + `bump_dataset_version` (chamado ao fim de cada import), `refresh_historico_pedidos` (refresh das matviews pós-import ZL0132/PEDIDOSFORN).

### 2.6 Importações SAP (Edge Function)

Pipeline atual preservado (reconcileSchema, chaves `ri = rc + item.padStart(5,'0')`, preservação de `obs_comprador`, `presente_ultima_carga`, dedup por `data_doc`, `Eflag='L'` ignorado, dedup `material+cod_forn+data_pedido`, soft-delete de materiais), mas movido para `supabase/functions/import-sap`:
- Cliente lê o arquivo com SheetJS, envia linhas em JSON (chunks) para a function.
- Function valida schema, reconcilia contra o estado atual **no servidor**, faz upserts em lote, grava `import_logs`, chama `bump_dataset_version` e `refresh_historico_pedidos`.
- Progresso via linhas de status no `import_logs` (ou canal realtime).
- Ganhos: sem baixar tabela inteira para o navegador para reconciliar, import auditável e atômico por lote.

### 2.7 UI/UX (mais bonito, mesma identidade)

- **Tokens**: marca `#0056c6` (login/institucional), ação `emerald-600/700`, neutros slate, dark mode classe `dark`; tipografia Inter; raios 12/24px. Sem roxo em controles.
- **shadcn/ui** como base (Button, Dialog, Sheet, Command, Popover, Toast/Sonner, Tabs, Select) — consistência e acessibilidade que hoje variam tela a tela.
- **DataTable de plataforma** substitui as 5 implementações de tabela: colunas configuráveis persistidas por usuário, ordenação, densidade, export XLSX, paginação server-side, células de cópia rápida.
- **Command palette (⌘K)**: busca global — nº de solicitação de 7 dígitos abre o detalhe, texto busca no catálogo.
- Skeletons de carregamento no lugar de spinners; toasts padronizados; `EmptyState` ilustrado; micro-animações com `motion`.
- Layout shell: sidebar colapsável (grupos filtrados por permissão, como hoje) + header com notificações realtime + breadcrumb.

### 2.8 Qualidade

- **Testes**: Vitest para `lib/` (demandas, permissions, format, reconcileSchema), testes de componente para DataTable e máquina de estados de solicitações; testes SQL das views com dados sintéticos (opcional, via pgTAP ou script).
- **CI (GitHub Actions)**: `tsc --noEmit` + `eslint` + `vitest` + `supabase db lint` em PR.
- **Tipos do banco gerados** (`supabase gen types typescript`) e commitados — zero drift entre schema e cliente.

---

## 3. Roadmap de implementação (fases sem retrabalho)

Cada fase entrega valor navegável e não é retrabalhada pelas seguintes.

| Fase | Entrega | Conteúdo |
|------|---------|----------|
| **0. Fundação** | repo + banco reprodutível | Scaffold Vite/TS/Tailwind/shadcn, tokens de design, migrações com TODO o schema atual + correções 2.5, tipos gerados, CI |
| **1. Shell + Auth** | login → app vazio | Supabase Auth (login/signup/reset), router com guardas por permissão, sidebar/header, dark mode, matriz RBAC em `lib/permissions.ts` |
| **2. Plataforma** | componentes core | DataTable, FilterBar, KpiCard, DetailDrawer, ExportButton, hooks de query padrão (paginação server-side, invalidação por `dataset_versions`) |
| **3. Catálogo + Fornecedores** | consultas de leitura | Materials (busca server-side, favoritos, export), Fornecedores/contatos (CRUD), Histórico de Pedidos, Fornecedores sem PO — todos sobre as views existentes |
| **4. Painel + Dashboards SAP** | operação de suprimentos | SapPanel (edição obs/entrega/item_status com histórico), SapDashboards + DemandDashboard (vw_demandas, resolveComprador, resolveDataCorte) |
| **5. Importações** | edge function | `import-sap` com os 5 fluxos + tela de upload/logs; `bump_dataset_version` + refresh matviews |
| **6. Solicitações** | motor completo | NewRequest (3 tipos, rascunho, autocomplete), MyRequests (mestre-detalhe, stepper, thread), Approvals, CadastrosSap (SLA), numeração atômica, notificações realtime |
| **7. Helpdesk + Admin + Relatórios** | paridade total | Helpdesk (SLA, transferência, avaliação, dashboard), AdminPanel dividido em páginas, Reports |
| **8. Corte** | go-live | Migrar dados do projeto atual (mesmo schema → cópia direta), RLS final auditada (`get_advisors`), desativar app antigo |

---

## 4. PROMPT DE KICKOFF — copiar e colar para iniciar o novo projeto

````markdown
Você é o arquiteto e desenvolvedor principal do **SISTEN 2.0**, a recriação do portal corporativo de operações da Torres Eólicas do Nordeste (TEN). Trabalhe em português (pt-BR); toda a UI é em português.

## Contexto
O app atual (React 19 + Vite + Supabase) funciona mas tem arquitetura de protótipo: um singleton `localDb.ts` de 4.000 linhas que espelha o banco inteiro em IndexedDB, hash router manual, views de 1.700 linhas e lógica duplicada entre cliente e banco. Vamos recriá-lo do zero com arquitetura feature-first, TanStack Query e o banco como fonte de verdade. Os documentos de referência estão na pasta `documentos/`:
- `app.md` — este plano (arquitetura, diagnóstico, roadmap)
- `BD.md` — schema completo do Supabase atual (20 tabelas, 5 views, 2 matviews, funções)
As regras de negócio do app atual devem ser preservadas fielmente.

## O produto
Portal interno com 4 domínios:
1. **Solicitações** — compras, cadastro SAP (item/fornecedor) e chamados, com criticidade 1–5, número de 7 dígitos (1º dígito = criticidade, sequência atômica no banco), fluxo de aprovação por gestor do setor, SLA por criticidade {1:120h, 2:72h, 3:24h, 4:8h, 5:2h}, thread de comentários, histórico de status, avaliação 1–5.
2. **Suprimentos/SAP** — painel de requisições (ME5A) × pedidos (ZL0132) unidas por `ri = requisicao + item.padStart(5,'0')`, com indicadores calculados NO BANCO (view `view_enriched_requisicoes`): natureza por tipo ZR01–ZR17, lead time meta (urgente 6d, máquina parada 2d, normal 15d, senão 30d), atraso, faixa, alerta, status. Edição pelo comprador de `obs_comprador`, `data_entrega_prevista` e `item_status` com trilha em `obs_historico`. Dashboards de demandas sobre `vw_demandas` (classificação por prefixo da RC: 11=normal, 12=urgente, 13=máquina parada, 17=serviço). Consultas: fornecedores sem PO, histórico de pedidos (`vw_historico_pedidos`), CRUD de contatos de fornecedores.
3. **Helpdesk** — chamados por setor de suporte (TI/Facilities/Manutenção), assumir/resolver/pausar/transferir, SLA, avaliação, dashboard.
4. **Administração** — usuários (aprovação de cadastros pendentes), setores, matriz RBAC, grupos de comprador (314/358/447/575/588), importações e logs.

## RBAC (8 papéis)
admin (tudo) · visualizador · solicitante · gestor (+aprovar do setor) · comprador (+painel SAP, editar campos comprador, fornecedores, cadastros SAP) · coordenador_suprimentos (+importar, dashboards, grupos, exportar) · atendente (+helpdesk do setor) · pendente (nada). Matriz única em `lib/permissions.ts`, espelhada em políticas RLS via função SQL `has_role()`.

## Stack obrigatória
Vite + React 19 + TypeScript strict · React Router v7 (data router, lazy, guardas por permissão declarativas) · TanStack Query v5 (NUNCA espelhar o banco em cliente; consultas server-side paginadas com ilike/range/count) · Tailwind v4 + shadcn/ui · TanStack Table (um DataTable de plataforma com colunas configuráveis, ordenação, export XLSX server-aware) · react-hook-form + zod · Recharts · xlsx · date-fns/ptBR · Supabase (Auth, RLS, Realtime para notificações e `dataset_versions`, Edge Function `import-sap` para importações) · Vitest + Testing Library · Supabase CLI com migrações versionadas e tipos gerados.

## Design system
Marca `#0056c6` (telas de login/institucional, fundo `bg-app.png`, logo `logo-ten.png`), ação interna emerald-600/700, neutros slate, dark mode por classe `dark` (só logado), Inter, cards rounded-3xl, inputs rounded-xl, SEM roxo em controles. Skeletons, toasts (sonner), empty states, command palette ⌘K (nº 7 dígitos → abre solicitação; texto → catálogo).

## Banco
Reaproveitar o schema do projeto Supabase atual (`BD.md`) convertendo TODO o DDL em migrações numeradas, com estas mudanças: remover `profiles.password` (Supabase Auth puro, trigger `handle_new_user`); função `next_request_number(criticality)` atômica; triggers para `request_status_history` e notificações; RLS granular por papel; manter `dataset_versions` + `bump_dataset_version` (invalidação de cache) e `refresh_historico_pedidos` (matviews `mv_pedido_atual_por_ri`, `mv_historico_pedidos`).

## Importações (Edge Function, regras exatas do app atual)
- **ME5A**: chave `ri`; preservar campos do comprador em updates; `presente_ultima_carga=false` para RIs ausentes; log de mudanças de quantidade; colunas desconhecidas → `campos_extras` jsonb.
- **ZL0132**: ignorar `Eflag='L'`; duplicatas de `ri` → manter `data_doc` mais recente.
- **PEDIDOSFORN**: dedup por `(material, cod_forn, data_pedido)`.
- **CONTATOS**: upsert por `cod_vendor`.
- **Materiais**: dedup por `material_code` (última vence), soft-delete `is_active=false` para ausentes.
Todas gravam `import_logs` (lidos/inseridos/atualizados/eliminados, colunas faltantes/novas, linhas ignoradas) e chamam `bump_dataset_version`.

## Estrutura
`src/app` (providers, router, shell) · `src/components` (plataforma) · `src/lib` (supabase, permissions, format, demandas, xlsx) · `src/features/{auth,dashboard,materials,requests,cadastros-sap,helpdesk,sap-panel,sap-dashboards,suppliers,imports,admin,reports}` cada uma com `api/ components/ hooks/ pages/` · `supabase/migrations` + `supabase/functions/import-sap`.

## Método de trabalho
Siga o roadmap de fases do `app.md` (Fase 0 → 8), uma fase por vez, cada uma navegável e testada antes da próxima. Em cada fase: escreva migrações antes do cliente, gere tipos, escreva testes das regras puras, e valide com `tsc --noEmit` + `vitest` antes de concluir. Comece agora pela **Fase 0 (Fundação)**: scaffold do projeto, tokens de design, migração inicial com o schema completo do `BD.md` (com as correções acima) e CI. Ao final de cada fase, liste o que foi entregue e o que vem a seguir.
````

---

## 5. Migração de dados (fase 8)

O novo app usa o mesmo schema, então o corte é simples:
1. Congelar importações no app antigo.
2. `supabase db dump` do projeto atual → restaurar no projeto novo (ou apontar o app novo para o mesmo projeto após aplicar as migrações de correção — opção recomendada se o projeto `sisten` for mantido).
3. Usuários: já estão no Supabase Auth (`handle_new_user`) — nada a migrar além de remover a coluna `password`.
4. Rodar `get_advisors` (security + performance) e corrigir pendências antes do go-live.
