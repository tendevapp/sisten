# Permissões de módulos por usuário + gate de valores no Rastreio Compras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin consegue, por usuário, marcar/desmarcar quais páginas do menu ele enxerga (via checkbox num modal), e as colunas "Preço unit."/"Valor total" do Rastreio Compras só aparecem (tabela, export Excel, modal de detalhe) para quem tem a permissão `rastreio_valores` — ligada por padrão para `comprador`, `coordenador_suprimentos`, `gestor` e `admin`.

**Architecture:** Um registro único (`src/lib/pages.ts`) declara todas as páginas do app e uma feature flag (`rastreio_valores`), cada uma com um `defaultRoles`. Uma função `canAccessPage(user, id)` resolve: admin → sempre `true`; senão override salvo em `profiles.page_access` (jsonb) → vence; senão `defaultRoles`. `Sidebar.tsx` e `App.tsx` (hoje divergentes) passam a usar essa única fonte. Um modal novo no AdminPanel escreve o override via `localDb.updatePageAccess`.

**Tech Stack:** React + TypeScript, Vite, Supabase (Postgres via `@supabase/supabase-js`), Tailwind, lucide-react. Sem framework de testes automatizados no repo — verificação é `npm run lint` (`tsc --noEmit`) por task + checagem manual final no navegador (`npm run dev`).

## Global Constraints

- Sem framework de testes (não há vitest/jest configurado) — cada task troca "rodar teste" por `npm run lint` (compila TS) e, quando aplicável, uma verificação manual pontual descrita no passo.
- Textos de UI em português, no mesmo tom do resto do app (ex.: "Editar Permissão", "Sempre restrito ao Admin").
- Scripts SQL avulsos vivem na raiz do repo (padrão existente: `adicionar_coluna_contato.sql`, `criar_tabela_cidadeforn.sql`), não em pasta `migrations/`.
- Não alterar `hasPermission(user, module, action)` em `localDb.ts` — ela resolve permissões de *ação*, fora do escopo deste plano.
- Todo componente novo segue o padrão visual dos componentes existentes (`Modal`/`ModalHeader`/`ModalBody`/`ModalFooter` de `src/components/ui/Modal.tsx`, `useToast()` de `src/components/ui/Toast.tsx`).

---

## File Structure

- **Create** `src/lib/pages.ts` — registro único de páginas (`PAGES`) e feature flags (`FEATURE_FLAGS`), função `canAccessPage`, `pageIdForPath`, `getPageGroups`.
- **Create** `adicionar_coluna_page_access.sql` — migration da coluna `profiles.page_access jsonb`.
- **Modify** `src/db/localDb.ts` — novo método público `updatePageAccess(userId, pageId, allowed)`; `syncProfiles`/mapeamento de perfil já carrega `page_access` via `select('*')`, sem mudança de código ali, mas os pontos de fallback/seed de perfil (linhas ~520-680, ~1068-1099) precisam de `page_access: {}` no objeto `Profile` seedado.
- **Modify** `src/types.ts` — `Profile.page_access?: Record<string, boolean>`.
- **Modify** `src/components/Sidebar.tsx` — `navItems` construído a partir de `PAGES`; filtro trocado de `localDb.hasPermission`/`universal` para `canAccessPage`.
- **Modify** `src/App.tsx` — cada gate manual de rota trocado por `canAccessPage(user, pageIdForPath(currentPath))`; `activeUser` (simulação de role) zera `page_access`.
- **Create** `src/components/admin/PageAccessModal.tsx` — modal "Módulos de acesso" (novo arquivo — `AdminPanel.tsx` já tem 1894 linhas, não cresce mais).
- **Modify** `src/views/AdminPanel.tsx` — botão "Módulos de acesso" na linha de cada usuário da aba "usuarios"; state para abrir o modal.
- **Modify** `src/lib/rastreio.ts` — nenhuma mudança de lógica; `formatBRL` já exportado e reaproveitado.
- **Modify** `src/components/rastreio/RastreioTable.tsx` — `RASTREIO_COLUMNS` vira função `getRastreioColumns(canSeeValores)`.
- **Modify** `src/views/RastreioCompras.tsx` — calcula `canSeeValores`, usa `getRastreioColumns`, filtra export Excel.
- **Modify** `src/components/rastreio/RastreioDetailModal.tsx` — recebe prop `canSeeValores`, condiciona os dois `Field` de preço.

---

### Task 1: Coluna `page_access` no Supabase + tipo `Profile`

**Files:**
- Create: `adicionar_coluna_page_access.sql`
- Modify: `src/types.ts:26-38` (interface `Profile`)

**Interfaces:**
- Produces: `Profile.page_access?: Record<string, boolean>` — usado por todas as tasks seguintes.

- [ ] **Step 1: Criar o script SQL da coluna**

Crie `adicionar_coluna_page_access.sql`:

```sql
-- Adiciona a coluna "page_access" (override de acesso a páginas/feature flags
-- por usuário, editável pelo admin no painel "Módulos de acesso"). Só as
-- chaves desviadas do padrão do perfil entram no JSON; {} = segue o padrão.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS page_access jsonb NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 2: Rodar o script no Supabase**

Abra o SQL Editor do projeto Supabase (mesmo processo usado para os outros
scripts `adicionar_coluna_*.sql` da raiz do repo) e execute o conteúdo do
arquivo. Confirme rodando `SELECT page_access FROM public.profiles LIMIT 1;`
— deve retornar `{}` para todas as linhas existentes.

- [ ] **Step 3: Adicionar o campo ao tipo `Profile`**

Em `src/types.ts`, dentro da interface `Profile` (linha 26), logo após o
campo `grupo_compras`:

```ts
  // Número do grupo de compras SAP (ex.: 314, 358) atribuído ao usuário pelo
  // admin, usado para identificar de qual grupo ele é o comprador responsável.
  grupo_compras?: string | null;
  // Override de acesso a páginas/feature flags por usuário, definido pelo
  // admin em "Módulos de acesso". Só chaves desviadas do padrão do perfil
  // aparecem aqui — chave ausente = segue o defaultRoles da página.
  page_access?: Record<string, boolean>;
```

- [ ] **Step 4: Verificar compilação**

Run: `npm run lint`
Expected: sem erros novos relacionados a `types.ts`.

- [ ] **Step 5: Commit**

```bash
git add adicionar_coluna_page_access.sql src/types.ts
git commit -m "feat: adiciona coluna page_access em profiles para override de acesso por usuario"
```

---

### Task 2: Registro único de páginas (`src/lib/pages.ts`)

**Files:**
- Create: `src/lib/pages.ts`
- Test manual: nenhum runtime ainda consome este arquivo (consumido nas tasks 3-5).

**Interfaces:**
- Consumes: `Profile` e `Role` de `../types` (Task 1).
- Produces:
  - `interface PageDef { id: string; group: string; label: string; path?: string; icon?: LucideIcon; defaultRoles: Role[] | '*'; alwaysAdmin?: boolean; }`
  - `PAGES: PageDef[]` (páginas com `path`)
  - `FEATURE_FLAGS: PageDef[]` (sem `path`, começando com `rastreio_valores`)
  - `canAccessPage(user: Profile, pageId: string): boolean`
  - `pageIdForPath(path: string): string | undefined`
  - `getPageGroups(): { group: string; pages: PageDef[] }[]` — `PAGES` + `FEATURE_FLAGS` agrupados por `group`, na ordem de declaração, para o modal.

- [ ] **Step 1: Criar o arquivo com o registro de páginas**

Copie o `navItems` de `Sidebar.tsx` (linhas 33-97) e os gates de `App.tsx`
(linhas 337-469) para montar `PAGES`. Cada `PageDef.id` é um slug estável
(nunca reaproveitar/renomear depois — é a chave salva no JSON do Supabase).

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Registro único de páginas e feature flags do SISTEN — fonte da verdade
// consumida por Sidebar (menu), App (gate de rota) e AdminPanel (painel de
// "Módulos de acesso"). Antes deste arquivo, Sidebar.tsx e App.tsx tinham
// checagens de acesso divergentes para a mesma rota (ex.: Fornecedores).

import type { LucideIcon } from 'lucide-react';
import {
  Home, Search, BarChart3, PlusCircle, List, FileCheck, Database,
  LayoutDashboard, Upload, Users, Shield, Map, Settings, KeyRound, Radio,
  Truck, PackageSearch, Building2, History, Route, Activity, Boxes, Info,
} from 'lucide-react';
import { Profile, Role } from '../types';

export interface PageDef {
  /** Chave estável, usada como chave no JSON `profiles.page_access`. Nunca renomear. */
  id: string;
  group: string;
  label: string;
  /** Rota do menu/roteador. Ausente para feature flags (não são páginas). */
  path?: string;
  icon?: LucideIcon;
  /** '*' = acesso universal, todo perfil vê por padrão. */
  defaultRoles: Role[] | '*';
  /** Página administrativa: sempre restrita a admin, sem checkbox editável no painel. */
  alwaysAdmin?: boolean;
}

export const PAGES: PageDef[] = [
  { id: 'inicio', group: 'GERAL', label: 'Início', path: '/', icon: Home, defaultRoles: '*' },
  { id: 'materiais_busca', group: 'GERAL', label: 'Catálogo SAP', path: '/materiais/busca', icon: Search, defaultRoles: '*' },
  { id: 'rastreio', group: 'GERAL', label: 'Rastreio Compras', path: '/rastreio', icon: Route, defaultRoles: '*' },
  { id: 'relatorios', group: 'GERAL', label: 'Relatórios', path: '/relatorios', icon: BarChart3, defaultRoles: '*' },
  { id: 'sobre', group: 'GERAL', label: 'Sobre o SISTEN', path: '/sobre', icon: Info, defaultRoles: '*' },

  { id: 'sol_nova', group: 'SOLICITAÇÕES', label: 'Nova Solicitação', path: '/solicitacoes/nova', icon: PlusCircle, defaultRoles: '*' },
  { id: 'sol_minhas', group: 'SOLICITAÇÕES', label: 'Minhas Solicitações', path: '/solicitacoes/minhas', icon: List, defaultRoles: '*' },
  // Correção de incoerência: o App.tsx aceitava coordenador_suprimentos por
  // engano (Sidebar nunca prometeu isso no menu). Padrão alinhado ao menu.
  { id: 'sol_aprovacoes', group: 'SOLICITAÇÕES', label: 'Aprovações', path: '/solicitacoes/aprovacoes', icon: FileCheck, defaultRoles: ['gestor', 'admin'] },

  { id: 'sup_cadastros_sap', group: 'SUPRIMENTOS', label: 'Cadastros SAP', path: '/suprimentos/cadastros-sap', icon: KeyRound, defaultRoles: ['admin', 'coordenador_suprimentos', 'comprador'] },
  { id: 'sup_painel', group: 'SUPRIMENTOS', label: 'Painel SAP', path: '/suprimentos/painel', icon: Database, defaultRoles: ['admin', 'coordenador_suprimentos', 'comprador'] },
  // Correção de incoerência: menu prometia coordenador_suprimentos, App.tsx
  // só liberava admin/comprador. Padrão alinhado ao menu (permissão sap.fornecedores).
  { id: 'sup_fornecedores', group: 'SUPRIMENTOS', label: 'Fornecedores', path: '/suprimentos/fornecedores', icon: Building2, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_central_compras', group: 'SUPRIMENTOS', label: 'Central Compras', path: '/suprimentos/fornecedores-sem-po', icon: PackageSearch, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_historico', group: 'SUPRIMENTOS', label: 'Histórico', path: '/suprimentos/historico', icon: History, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_dashboards', group: 'SUPRIMENTOS', label: 'Dashboards', path: '/suprimentos/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'coordenador_suprimentos'] },
  { id: 'sup_importar', group: 'SUPRIMENTOS', label: 'Importar SAP', path: '/suprimentos/importar', icon: Upload, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },

  { id: 'almox_estoque', group: 'ALMOXARIFADO', label: 'Estoque', path: '/almoxarifado/estoque', icon: Boxes, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_dashboards', group: 'ALMOXARIFADO', label: 'Dashboards', path: '/almoxarifado/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },

  { id: 'helpdesk_atendimento', group: 'HELPDESK', label: 'Atendimento', path: '/helpdesk', icon: Radio, defaultRoles: ['atendente', 'admin'] },
  { id: 'helpdesk_relatorios', group: 'HELPDESK', label: 'Relatórios Helpdesk', path: '/helpdesk/relatorios', icon: BarChart3, defaultRoles: ['atendente', 'admin'] },

  { id: 'admin_uso', group: 'ADMINISTRAÇÃO', label: 'Uso do App', path: '/admin/uso', icon: Activity, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_usuarios', group: 'ADMINISTRAÇÃO', label: 'Usuários', path: '/admin/usuarios', icon: Users, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_setores', group: 'ADMINISTRAÇÃO', label: 'Setores', path: '/admin/setores', icon: Map, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_permissoes', group: 'ADMINISTRAÇÃO', label: 'Permissões', path: '/admin/permissoes', icon: Shield, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_importacao_materiais', group: 'ADMINISTRAÇÃO', label: 'Import. Materiais', path: '/admin/importacao-materiais', icon: Upload, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_importar_sap_log', group: 'ADMINISTRAÇÃO', label: 'Log Importação SAP', path: '/suprimentos/importar/log', icon: List, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_grupos_comprador', group: 'ADMINISTRAÇÃO', label: 'Grupos Comprador', path: '/suprimentos/grupos-comprador', icon: Settings, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_helpdesk_config', group: 'ADMINISTRAÇÃO', label: 'Config. Helpdesk', path: '/admin/helpdesk', icon: Settings, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
];

// Feature flags: sub-permissões que não são páginas próprias (sem path/icon),
// controladas pelo mesmo mecanismo de override em profiles.page_access.
export const FEATURE_FLAGS: PageDef[] = [
  {
    id: 'rastreio_valores',
    group: 'DADOS SENSÍVEIS',
    label: 'Ver valores de compra (Rastreio Compras)',
    defaultRoles: ['comprador', 'coordenador_suprimentos', 'gestor', 'admin'],
  },
];

const ALL_ENTRIES: PageDef[] = [...PAGES, ...FEATURE_FLAGS];
const BY_ID = new Map(ALL_ENTRIES.map(p => [p.id, p]));

export function canAccessPage(user: Profile, pageId: string): boolean {
  if (user.roles.includes('admin')) return true;

  const def = BY_ID.get(pageId);
  if (!def) return false;

  const override = user.page_access?.[pageId];
  if (override !== undefined && !def.alwaysAdmin) return override;

  if (def.defaultRoles === '*') return true;
  return def.defaultRoles.some(r => user.roles.includes(r));
}

export function pageIdForPath(path: string): string | undefined {
  return PAGES.find(p => p.path === path)?.id;
}

export function getPageGroups(): { group: string; pages: PageDef[] }[] {
  const groups: { group: string; pages: PageDef[] }[] = [];
  for (const entry of ALL_ENTRIES) {
    let g = groups.find(x => x.group === entry.group);
    if (!g) { g = { group: entry.group, pages: [] }; groups.push(g); }
    g.pages.push(entry);
  }
  return groups;
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npm run lint`
Expected: sem erros. Se houver erro de tipo em `defaultRoles.some(r => ...)`
(TS não estreita `'*' | Role[]` sozinho), confirme que o `if (def.defaultRoles === '*') return true;` está *antes* do `.some`, o que já estreita o tipo corretamente.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pages.ts
git commit -m "feat: registro unico de paginas e feature flags com resolucao de acesso"
```

---

### Task 3: `localDb.updatePageAccess` + seeds com `page_access: {}`

**Files:**
- Modify: `src/db/localDb.ts`

**Interfaces:**
- Consumes: `Profile` (Task 1), `supabase` client já importado no arquivo.
- Produces: `localDb.updatePageAccess(userId: string, pageId: string, allowed: boolean | null): void` — `allowed: null` remove a chave do override (volta ao padrão).

- [ ] **Step 1: Adicionar `page_access: {}` nos perfis semeados**

Em `src/db/localDb.ts`, localize os blocos de seed de perfis (por volta das
linhas 515-645, um objeto de perfil por bloco, todos com `roles: [...]`).
Para cada um, adicione `page_access: {}` logo após o campo `roles`. Exemplo
do primeiro bloco (linha ~520):

```ts
          roles: ['admin', 'visualizador'],
          page_access: {},
```

Repita para todos os blocos de perfil seedados nesse trecho (são 13 blocos,
um por usuário de exemplo). Faça o mesmo no bloco de perfil de
signup/fallback perto da linha 1068 (`roles: ['visualizador'],`) e no bloco
perto de 1085 (`roles: profile.roles || []`) — adicione
`page_access: profile.page_access || {}`.

- [ ] **Step 2: Implementar `updatePageAccess`**

Logo abaixo de `updateProfileStatus` (após a linha 1252, fechamento do
método), adicione:

```ts
  public async updatePageAccess(userId: string, pageId: string, allowed: boolean | null): Promise<void> {
    const users = this.getStorageItem<Profile[]>(this.profilesKey, []);
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return;

    const current = { ...(users[idx].page_access || {}) };
    if (allowed === null) {
      delete current[pageId];
    } else {
      current[pageId] = allowed;
    }
    users[idx].page_access = current;
    this.setStorageItem(this.profilesKey, users);

    const actingUser = this.getCurrentUser();
    this.logActivity(
      actingUser?.id || 'admin',
      'Administração',
      'Editar Módulos de Acesso',
      `Acesso de ${users[idx].name} à página "${pageId}" alterado para ${allowed === null ? 'padrão do perfil' : (allowed ? 'liberado' : 'bloqueado')}.`
    );

    if (actingUser && actingUser.id === userId) {
      this.setStorageItem(this.currentUserKey, users[idx]);
    }

    const { error } = await supabase
      .from('profiles')
      .update({ page_access: current })
      .eq('id', userId);
    if (error) console.warn('Falha ao sincronizar page_access com o Supabase:', error);
  }
```

- [ ] **Step 3: Verificar compilação**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/db/localDb.ts
git commit -m "feat: metodo updatePageAccess e seeds com page_access"
```

---

### Task 4: `Sidebar.tsx` e `App.tsx` consumindo o registro único

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PAGES`, `canAccessPage`, `pageIdForPath` de `../lib/pages` (Task 2).

- [ ] **Step 1: Reescrever `navItems` do Sidebar a partir de `PAGES`**

Em `src/components/Sidebar.tsx`, substitua o import de ícones (linhas 7-11) e
o bloco `navItems` (linhas 33-97) por:

```ts
import React, { useState } from 'react';
import { Menu, X, KeyRound as _unused, Sun, Moon, ArrowUpRight } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import { PAGES, canAccessPage } from '../lib/pages';
import SistenLogo from './SistenLogo';
```

Remova o import `_unused` (era só para ilustrar — na prática, delete
`KeyRound` da lista já que não é mais usado diretamente aqui; os ícones
individuais de cada item agora vêm de `PAGES[i].icon`). Import final:

```ts
import React, { useState } from 'react';
import { Menu, X, Sun, Moon, ArrowUpRight } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import { PAGES, canAccessPage } from '../lib/pages';
import SistenLogo from './SistenLogo';
```

Troque o bloco `navItems` (linhas 33-97) por uma derivação agrupada:

```ts
  const groupOrder = ['GERAL', 'SOLICITAÇÕES', 'SUPRIMENTOS', 'ALMOXARIFADO', 'HELPDESK', 'ADMINISTRAÇÃO'];
  const navItems = groupOrder.map(group => ({
    group,
    items: PAGES.filter(p => p.group === group),
  }));
```

- [ ] **Step 2: Trocar o filtro de visibilidade**

No bloco `visibleItems` (linha ~168-172), troque:

```ts
          const visibleItems = group.items.filter(item =>
            ('universal' in item && item.universal) ||
            localDb.hasPermission(user, item.perm.module, item.perm.action)
          );
```

por:

```ts
          const visibleItems = group.items.filter(item => canAccessPage(user, item.id));
```

- [ ] **Step 3: Ajustar as referências a `item.icon`/`item.path`**

`PageDef.icon` e `PageDef.path` têm os mesmos nomes de campo que o `navItems`
antigo — o JSX de renderização dos itens (linhas 184-228) não precisa mudar.
Confirme visualmente que `item.icon`/`item.path`/`item.label` continuam
resolvendo (agora vêm de `PageDef`).

- [ ] **Step 4: Trocar os gates de rota em `App.tsx`**

Em `src/App.tsx`, adicione o import:

```ts
import { canAccessPage, pageIdForPath } from './lib/pages';
```

No `switch (currentPath)` de `renderActiveView` (linhas 337-469), troque
cada `if (...)` de gate por `canAccessPage`. Padrão de substituição, caso a
caso:

```ts
      case '/materiais/busca':
        return <Materials user={user} />;

      case '/sobre':
        return <Sobre user={user} onNavigate={handleNavigate} />;

      case '/rastreio':
        return <RastreioCompras user={user} onNavigate={handleNavigate} />;

      case '/solicitacoes/nova':
        return <NewRequest user={user} onNavigate={handleNavigate} />;

      case '/solicitacoes/minhas':
        return <MyRequests user={user} />;

      case '/solicitacoes/aprovacoes':
        if (canAccessPage(user, 'sol_aprovacoes')) {
          return <Approvals user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/painel':
        if (canAccessPage(user, 'sup_painel')) {
          return <SapPanel user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/dashboards':
        if (canAccessPage(user, 'sup_dashboards')) {
          return <SapDashboards onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/demandas':
        if (canAccessPage(user, 'sup_dashboards')) {
          return <SapDashboards onNavigate={handleNavigate} abaInicial="demandas" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/historico/dashboards':
        if (canAccessPage(user, 'sup_dashboards')) {
          return <SapDashboards onNavigate={handleNavigate} abaInicial="compras" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/fornecedores-sem-po':
        if (canAccessPage(user, 'sup_central_compras')) {
          return <SuppliersNoPO user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/historico':
        if (canAccessPage(user, 'sup_historico')) {
          return <HistoricoPedidos user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/fornecedores':
        if (canAccessPage(user, 'sup_fornecedores')) {
          return <Fornecedores user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/helpdesk':
        if (canAccessPage(user, 'helpdesk_atendimento')) {
          return <Helpdesk user={user} onNavigate={handleNavigate} initialView="atendimento" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/helpdesk/relatorios':
        if (canAccessPage(user, 'helpdesk_relatorios')) {
          return <Helpdesk user={user} onNavigate={handleNavigate} initialView="dashboard" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/perfil':
        return <ProfileView user={user} onNavigate={handleNavigate} onProfileUpdate={handleUserSessionChange} />;

      case '/suprimentos/cadastros-sap':
        if (canAccessPage(user, 'sup_cadastros_sap')) {
          return <CadastrosSap user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/relatorios':
        return <Reports user={user} />;

      case '/almoxarifado/estoque':
        if (canAccessPage(user, 'almox_estoque')) {
          return <Estoque user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado/dashboards':
        if (canAccessPage(user, 'almox_dashboards')) {
          return <AlmoxarifadoDashboards user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/admin/uso':
        if (canAccessPage(user, 'admin_uso')) {
          return <UsageDashboard />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

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

      default:
        return <Dashboard user={user} onNavigate={handleNavigate} />;
    }
```

`/` (Dashboard) e `/rastreio`/`/sobre`/etc. continuam sem gate (são `'*'` em
`PAGES`, mas as rotas raiz e universais já renderizavam sem `if` — mantenha
como está, é comportamento equivalente e mais simples).

- [ ] **Step 5: Zerar `page_access` na simulação de role**

Em `App.tsx`, linha 104-106:

```ts
  const activeUser = user && simulatedRole && user.roles.includes('admin')
    ? { ...user, roles: [simulatedRole] }
    : user;
```

troque por:

```ts
  const activeUser = user && simulatedRole && user.roles.includes('admin')
    ? { ...user, roles: [simulatedRole], page_access: {} }
    : user;
```

- [ ] **Step 6: Verificar compilação**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 7: Verificação manual — menu e rotas**

Run: `npm run dev`, abra `http://localhost:3000`, faça login como um usuário
`comprador` (ou use "simular perfil" no Header, se logado como admin).
Confirme que o menu lateral mostra as mesmas páginas de antes (Rastreio,
Catálogo, Painel SAP, Fornecedores, Central Compras, Histórico, Almoxarifado)
e que nenhuma página deixou de abrir. Repita rapidamente para `gestor` e
`atendente`, conferindo que Aprovações/Helpdesk seguem visíveis só para quem
deve ver.

- [ ] **Step 8: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "refactor: unifica gate de rotas do menu e do roteador no registro de paginas"
```

---

### Task 5: Modal "Módulos de acesso" no AdminPanel

**Files:**
- Create: `src/components/admin/PageAccessModal.tsx`
- Modify: `src/views/AdminPanel.tsx`

**Interfaces:**
- Consumes: `getPageGroups`, `canAccessPage` de `../../lib/pages` (Task 2); `localDb.updatePageAccess` (Task 3); `Modal`/`ModalHeader`/`ModalBody`/`ModalFooter` de `../ui/Modal`; `useToast` de `../ui/Toast`; `Profile` de `../../types`.
- Produces: `<PageAccessModal user={Profile} onClose={() => void} onChanged={() => void} />` — componente default export.

- [ ] **Step 1: Criar o modal**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile } from '../../types';
import { canAccessPage, getPageGroups } from '../../lib/pages';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface PageAccessModalProps {
  user: Profile;
  onClose: () => void;
  /** Chamado após qualquer alteração, para o AdminPanel atualizar a lista de perfis. */
  onChanged: () => void;
}

export default function PageAccessModal({ user, onClose, onChanged }: PageAccessModalProps) {
  const toast = useToast();
  const [pageAccess, setPageAccess] = useState<Record<string, boolean>>(user.page_access || {});
  const isAdmin = user.roles.includes('admin');
  const groups = getPageGroups();

  const handleToggle = async (pageId: string, next: boolean) => {
    setPageAccess(prev => ({ ...prev, [pageId]: next }));
    try {
      await localDb.updatePageAccess(user.id, pageId, next);
      onChanged();
    } catch (e) {
      console.error('Falha ao atualizar módulo de acesso:', e);
      toast.error('Não foi possível salvar. Tente novamente.');
    }
  };

  const handleReset = async (pageId: string) => {
    setPageAccess(prev => {
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
    try {
      await localDb.updatePageAccess(user.id, pageId, null);
      onChanged();
    } catch (e) {
      console.error('Falha ao restaurar módulo de acesso:', e);
      toast.error('Não foi possível restaurar. Tente novamente.');
    }
  };

  const handleResetAll = async () => {
    const ids = Object.keys(pageAccess);
    setPageAccess({});
    try {
      await Promise.all(ids.map(id => localDb.updatePageAccess(user.id, id, null)));
      onChanged();
      toast.success('Acesso restaurado ao padrão do perfil.');
    } catch (e) {
      console.error('Falha ao restaurar todos os módulos:', e);
      toast.error('Não foi possível restaurar tudo. Tente novamente.');
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-xl" ariaLabel={`Módulos de acesso — ${user.name}`}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Módulos de acesso</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user.name} · {user.email}</p>
      </ModalHeader>
      <ModalBody>
        {isAdmin ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
            Administradores têm acesso total a todas as páginas e não podem ser restringidos aqui.
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(g => (
              <div key={g.group}>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-1.5">{g.group}</h4>
                <div className="space-y-1">
                  {g.pages.map(p => {
                    const hasOverride = pageAccess[p.id] !== undefined;
                    const checked = p.alwaysAdmin ? false : canAccessPage({ ...user, page_access: pageAccess }, p.id);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 py-1">
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!!p.alwaysAdmin}
                            onChange={(e) => handleToggle(p.id, e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 shrink-0 disabled:opacity-40"
                          />
                          <span className="truncate">{p.label}</span>
                          {!hasOverride && !p.alwaysAdmin && (
                            <span className="text-[10px] text-slate-400 shrink-0">(padrão)</span>
                          )}
                          {p.alwaysAdmin && (
                            <span className="text-[10px] text-slate-400 shrink-0">(restrito ao Admin)</span>
                          )}
                        </label>
                        {hasOverride && !p.alwaysAdmin && (
                          <button
                            type="button"
                            onClick={() => handleReset(p.id)}
                            title="Restaurar padrão do perfil"
                            className="text-slate-400 hover:text-emerald-700 shrink-0"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {!isAdmin && Object.keys(pageAccess).length > 0 && (
          <button
            type="button"
            onClick={handleResetAll}
            className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mr-auto"
          >
            Restaurar todos
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold hover:bg-slate-900 dark:hover:bg-slate-600"
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npm run lint`
Expected: sem erros. Se `useToast()` não expuser `.error`/`.success`, ajuste
para os métodos reais do hook (confira `src/components/ui/Toast.tsx`).

- [ ] **Step 3: Adicionar o botão e o state no AdminPanel**

Em `src/views/AdminPanel.tsx`, adicione o import:

```ts
import PageAccessModal from '../components/admin/PageAccessModal';
```

Adicione um state, próximo a `selectedProfileId` (linha ~30):

```ts
  const [pageAccessProfileId, setPageAccessProfileId] = useState<string | null>(null);
```

Na célula de ações da tabela de usuários (linhas 515-524), ao lado do botão
"Editar Permissão":

```tsx
                      <td className="py-3 text-center">
                        {selectedProfileId !== p.id && (
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => { setSelectedProfileId(p.id); setEditingRole(p.roles[0]); }}
                              className="text-emerald-700 hover:underline font-bold"
                            >
                              Editar Permissão
                            </button>
                            <button
                              onClick={() => setPageAccessProfileId(p.id)}
                              className="text-slate-600 hover:underline font-bold"
                            >
                              Módulos de acesso
                            </button>
                          </div>
                        )}
                      </td>
```

- [ ] **Step 4: Renderizar o modal condicionalmente**

Próximo ao fim do componente `AdminPanel`, antes do `return` final (procure
onde outros modais do arquivo são renderizados — se não houver nenhum ainda,
adicione logo antes do fechamento da `</div>` raiz do componente):

```tsx
      {pageAccessProfileId && (() => {
        const target = profiles.find(p => p.id === pageAccessProfileId);
        if (!target) return null;
        return (
          <PageAccessModal
            user={target}
            onClose={() => setPageAccessProfileId(null)}
            onChanged={() => localDb.syncFromSupabase(true).then(() => setProfiles(localDb.getProfiles()))}
          />
        );
      })()}
```

Confirme que `profiles` já é recarregado em algum `useEffect` do componente
(procure por `setProfiles(localDb.getProfiles())` existente) — se houver uma
função local de reload (ex.: `loadProfiles`), use-a no `onChanged` em vez de
chamar `syncFromSupabase` diretamente.

- [ ] **Step 5: Verificar compilação**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 6: Verificação manual**

Run: `npm run dev`, logue como `admin`, vá em Admin → Usuários, clique
"Módulos de acesso" num usuário `solicitante`. Desmarque "Rastreio Compras".
Feche o modal, faça logout, logue como aquele usuário (ou use "simular
perfil" no Header) e confirme que "Rastreio Compras" sumiu do menu e que
acessar `#/rastreio` diretamente redireciona para o Dashboard. Volte ao
modal e clique no ícone de restaurar (⟲) ao lado do item — confirme que a
página volta a aparecer.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/PageAccessModal.tsx src/views/AdminPanel.tsx
git commit -m "feat: modal de modulos de acesso por usuario no AdminPanel"
```

---

### Task 6: Gate de valores (`rastreio_valores`) no Rastreio Compras

**Files:**
- Modify: `src/components/rastreio/RastreioTable.tsx`
- Modify: `src/views/RastreioCompras.tsx`
- Modify: `src/components/rastreio/RastreioDetailModal.tsx`

**Interfaces:**
- Consumes: `canAccessPage` de `../lib/pages` (Task 2), `Profile` de `../types`.
- Produces: `getRastreioColumns(canSeeValores: boolean): ColumnOption[]` (substitui a constante `RASTREIO_COLUMNS` como export principal; mantém `RASTREIO_COLUMNS` como o array completo, sem filtro, para o caso de precisar da lista total).

- [ ] **Step 1: Tornar as colunas de valor filtráveis em `RastreioTable.tsx`**

Em `src/components/rastreio/RastreioTable.tsx`, logo após a definição de
`RASTREIO_COLUMNS` (linha ~40), adicione:

```ts
// IDs das colunas que expõem valores de compra — visíveis apenas para quem
// tem a permissão `rastreio_valores` (comprador, coordenador, gestor, admin).
const VALUE_COLUMN_IDS = new Set(['precoUnitario', 'valorTotal']);

export function getRastreioColumns(canSeeValores: boolean): ColumnOption[] {
  return canSeeValores ? RASTREIO_COLUMNS : RASTREIO_COLUMNS.filter(c => !VALUE_COLUMN_IDS.has(c.id));
}
```

Na tabela de renderização (a linha `const cols = RASTREIO_COLUMNS.filter(c => visibleColumns[c.id]);`,
por volta da linha 68), adicione a prop `canSeeValores` ao componente e
troque a fonte:

```ts
interface RastreioTableProps {
  rows: RastreioRow[];
  hoje: Date;
  visibleColumns: Record<string, boolean>;
  sortColumn: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
  onOpenRow: (row: RastreioRow) => void;
  unreadRis: Set<string>;
  canSeeValores: boolean;
}

export default function RastreioTable({ rows, hoje, visibleColumns, sortColumn, sortDir, onSort, onOpenRow, unreadRis, canSeeValores }: RastreioTableProps) {
  const cols = getRastreioColumns(canSeeValores).filter(c => visibleColumns[c.id]);
```

Nas linhas de renderização de célula (mais abaixo no arquivo, onde cada
`<Td>` é montado por `col.id`), nenhuma mudança é necessária — os `<Td>` de
`precoUnitario`/`valorTotal` simplesmente não são alcançados porque `cols`
já não os contém.

- [ ] **Step 2: Calcular `canSeeValores` e propagar em `RastreioCompras.tsx`**

Em `src/views/RastreioCompras.tsx`, adicione o import:

```ts
import { canAccessPage } from '../lib/pages';
```

Logo após a declaração de `hoje` (linha 77), adicione:

```ts
  const canSeeValores = useMemo(() => canAccessPage(user, 'rastreio_valores'), [user]);
```

No menu "Personalizar Colunas" (linhas 456-467), troque a fonte de
`RASTREIO_COLUMNS` por `getRastreioColumns(canSeeValores)`:

```tsx
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {getRastreioColumns(canSeeValores).map(col => (
```

E no botão "Mostrar Todas" (linha ~450), troque o `.reduce` para também usar
`getRastreioColumns(canSeeValores)`:

```tsx
                          onClick={() => setVisibleColumns(getRastreioColumns(canSeeValores).reduce((acc, col) => ({ ...acc, [col.id]: true }), {}))}
```

Atualize o import de `RASTREIO_COLUMNS` (linha 19) para trazer também
`getRastreioColumns`:

```ts
import RastreioTable, { RASTREIO_COLUMNS, getRastreioColumns, SortDir } from '../components/rastreio/RastreioTable';
```

Passe a prop nova ao `<RastreioTable>` (linha ~481-490):

```tsx
                  <RastreioTable
                    rows={visibleRows}
                    hoje={hoje}
                    visibleColumns={visibleColumns}
                    sortColumn={sortColumn}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    onOpenRow={setSelectedRow}
                    unreadRis={unreadRis}
                    canSeeValores={canSeeValores}
                  />
```

No `handleExportExcel` (linhas 186-210), remova as duas chaves quando não
autorizado:

```ts
  const handleExportExcel = () => {
    if (filteredRows.length === 0) return;
    const data = filteredRows.map(r => ({
      'RM': r.rm,
      'PO': r.po,
      'Material': r.material,
      'Descrição': r.descricao,
      'Fornecedor': r.fornecedor,
      'Setor': r.setor,
      'Quantidade': r.qtd ?? '—',
      'Unidade': r.unidade,
      ...(canSeeValores ? {
        'Preço Unit. (R$)': r.precoUnitario ?? '—',
        'Valor Total (R$)': r.valorTotal ?? '—',
      } : {}),
      'Data Criação': formatDateBR(r.dataCriacao),
      'Prev. Entrega': formatDateBR(r.dataPrevista),
      'Entrega (MIGO)': formatDateBR(r.dataEntrega),
      'Status': r.status,
      'Observações': r.observacoes,
    }));
```

Passe `canSeeValores` para o modal de detalhe (bloco final do arquivo, linhas
511-519):

```tsx
      {selectedRow && (
        <RastreioDetailModal
          row={selectedRow}
          user={user}
          hoje={hoje}
          onClose={() => setSelectedRow(null)}
          onThreadRead={refreshUnread}
          canSeeValores={canSeeValores}
        />
      )}
```

- [ ] **Step 3: Condicionar os campos de preço em `RastreioDetailModal.tsx`**

Em `src/components/rastreio/RastreioDetailModal.tsx`, a interface de props se
chama `Props` (linha 27):

```ts
interface Props {
  row: RastreioRow;
  user: Profile;
  hoje: Date;
  onClose: () => void;
  onThreadRead?: () => void;
  canSeeValores: boolean;
}
```

E a assinatura do componente (linha 46) recebe o novo parâmetro:

```ts
export default function RastreioDetailModal({ row, user, hoje, onClose, onThreadRead, canSeeValores }: Props) {
```

Nas linhas 207-213, troque:

```tsx
            {row.precoUnitario !== undefined && (
              <Field label="Preço unit." icon={CircleDollarSign}>{formatBRL(row.precoUnitario)}</Field>
            )}
            {row.valorTotal !== undefined && (
              <Field label="Valor total" icon={CircleDollarSign}>
                <span className="text-emerald-600 dark:text-emerald-400">{formatBRL(row.valorTotal)}</span>
```

por:

```tsx
            {canSeeValores && row.precoUnitario !== undefined && (
              <Field label="Preço unit." icon={CircleDollarSign}>{formatBRL(row.precoUnitario)}</Field>
            )}
            {canSeeValores && row.valorTotal !== undefined && (
              <Field label="Valor total" icon={CircleDollarSign}>
                <span className="text-emerald-600 dark:text-emerald-400">{formatBRL(row.valorTotal)}</span>
```

(mantenha o `</Field>` de fechamento como está, sem mudança).

- [ ] **Step 4: Verificar compilação**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`. Logue (ou simule) como `solicitante`: na página Rastreio
Compras, confirme que as colunas "Preço unit." e "Valor total" não aparecem
na tabela nem no menu "Personalizar Colunas"; abra o modal de detalhe de um
item e confirme que os campos de preço não aparecem; exporte para Excel e
abra o arquivo — confirme que as colunas de preço não estão na planilha.
Repita simulando `comprador` — confirme que tudo volta a aparecer.

- [ ] **Step 6: Commit**

```bash
git add src/components/rastreio/RastreioTable.tsx src/views/RastreioCompras.tsx src/components/rastreio/RastreioDetailModal.tsx
git commit -m "feat: gate de permissao rastreio_valores nas colunas de preco do Rastreio Compras"
```

---

## Self-Review Notes

- **Cobertura da spec:** Bloco 1 (registro único) → Tasks 2 e 4. Bloco 2
  (persistência + painel) → Tasks 1, 3 e 5. Bloco 3 (gate de valores) → Task
  6, cobrindo os 4 pontos de corte aprovados (tabela/menu de colunas, Excel,
  modal de detalhe, ordenação — esta última cai naturalmente de `cols` não
  conter mais a coluna). Simulação de role (item 5 do desenho) → Task 4,
  Step 5.
- **Sem placeholders:** todos os steps têm código completo, sem "TBD" ou
  "similar to task N".
- **Consistência de tipos:** `PageDef`, `canAccessPage`, `pageIdForPath`,
  `getPageGroups` (Task 2) são usados com a mesma assinatura em Tasks 4, 5 e
  6. `localDb.updatePageAccess(userId, pageId, allowed)` (Task 3) é chamado
  com a mesma assinatura em Task 5. `getRastreioColumns` (Task 6, Step 1) é
  importado e chamado de forma consistente em Task 6, Step 2.
