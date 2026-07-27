# Permissões de módulos por usuário + gate de valores no Rastreio Compras

Data: 2026-07-27

## Problema

1. O painel de Admin (`AdminPanel.tsx`, aba "Permissões") só **exibe** a matriz de
   papéis x ações; nada é editável. O admin não tem como liberar/bloquear uma
   página específica para um usuário específico.
2. O acesso às páginas está espalhado e inconsistente entre `Sidebar.tsx`
   (`navItems[].perm`) e `App.tsx` (`switch` do roteador), com checagens
   divergentes na mesma rota (ex.: Fornecedores aparece no menu para
   `coordenador_suprimentos` mas o `App.tsx` só libera para `admin`/`comprador`).
3. Na página Rastreio Compras, as colunas "Preço unit." e "Valor total" são
   visíveis para qualquer perfil — devem ser restritas a
   `comprador`, `coordenador_suprimentos`, `gestor` e `admin`.

## Desenho

### 1. Registro único de páginas (`src/lib/pages.ts`)

Novo módulo, fonte única da verdade sobre "quais páginas existem e quem vê
por padrão", substituindo `Sidebar.navItems` (perm) e o `switch` de gates em
`App.tsx`:

```ts
export interface PageDef {
  id: string;             // 'sup_fornecedores' — chave estável usada no override
  group: string;          // 'SUPRIMENTOS' — mesmo agrupamento visual do Sidebar hoje
  label: string;
  path: string;
  icon: LucideIcon;
  defaultRoles: Role[] | '*';  // '*' = universal (Rastreio, Sobre, Início, etc.)
  alwaysAdmin?: boolean;       // páginas /admin/*: sempre admin, sem checkbox editável
}

export const PAGES: PageDef[];

// Resolve acesso: admin sempre true; senão override do usuário se existir;
// senão defaultRoles da página.
export function canAccessPage(user: Profile, pageId: string): boolean;

// Lookup por path (para o gate de rota no App.tsx).
export function pageIdForPath(path: string): string | undefined;
```

`defaultRoles` reproduz o acesso atual página a página, com duas correções de
incoerência (Sidebar vs. App.tsx) já levantadas e aprovadas:

- **Fornecedores** (`/suprimentos/fornecedores`): padrão passa a
  `comprador, coordenador_suprimentos, admin` (hoje o menu promete coordenador
  mas o `App.tsx` barra).
- **Aprovações** (`/solicitacoes/aprovacoes`): padrão passa a `gestor, admin`
  (hoje o `App.tsx` aceita coordenador por engano; o menu nunca prometeu isso).

Todas as demais páginas mantêm o comportamento atual como padrão. Páginas
`/admin/*` (Usuários, Setores, Permissões, Importações, Grupos Comprador,
Config. Helpdesk) recebem `alwaysAdmin: true` — aparecem na lista do modal de
"Módulos de acesso" mas com o checkbox desabilitado ("sempre restrito ao
Admin").

`hasPermission(user, module, action)` em `localDb.ts` **não muda** — continua
resolvendo permissões de *ação* (editar campo do comprador, importar,
exportar, dashboards). Só o acesso a *página* migra para `canAccessPage`.

`Sidebar.tsx` passa a montar `navItems` a partir de `PAGES` (mantendo os
grupos/labels/ícones atuais) e filtrar com `canAccessPage`. `App.tsx` troca
cada gate manual (`user.roles.includes(...)`, `hasPermission(...)` usado só
para página) por `canAccessPage(user, pageIdForPath(currentPath))`.

### 2. Persistência do override (`profiles.page_access`)

Nova coluna, não tabela nova — `Sidebar`/`App` só têm o objeto `Profile` em
mãos, e uma tabela separada exigiria um sync e um join extra sem ganho real:

```sql
ALTER TABLE profiles ADD COLUMN page_access jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Formato: `{ "sup_fornecedores": true, "almox_estoque": false }` — só páginas
**desviadas do padrão** entram no JSON. `{}` (padrão) segue o `defaultRoles`
da página conforme os roles do usuário. Trocar o role do usuário continua
funcionando exatamente como hoje.

`syncProfiles()` em `localDb.ts` já traz a coluna automaticamente (`select('*')`).
Novo método `localDb.updatePageAccess(userId, pageId, allowed | null)` —
`null` remove a chave do JSON (volta ao padrão) — grava local e faz upsert em
`profiles.page_access` no Supabase, com log de atividade (mesmo padrão de
`updateProfileStatus`).

### 3. Painel "Módulos de acesso" (AdminPanel → aba Usuários)

Na linha de cada usuário (não-admin) da aba "Usuários", ao lado do botão
"Editar Permissão" existente, novo botão **"Módulos de acesso"** que abre um
`Modal` com:

- Lista de todas as `PAGES`, agrupadas por `group` (mesmos grupos do Sidebar).
- Checkbox por página: refletindo override se existir, senão o padrão do
  perfil atual do usuário (com indicação visual "(padrão)").
- Páginas `alwaysAdmin`: checkbox desabilitado, sempre marcado, tooltip
  "Sempre restrito ao Admin".
- Botão "Restaurar padrão do perfil" por página (limpa o override) e um
  botão geral "Restaurar todos".
- Usuários com role `admin`: modal abre em modo somente-leitura, tudo marcado,
  aviso "Administradores têm acesso total".

Cada toggle chama `localDb.updatePageAccess` imediatamente (sem "salvar" em
lote, consistente com o padrão de outros toggles do AdminPanel como
`handleToggleSectorSupport`).

### 4. Permissão "Ver valores de compra" no Rastreio Compras

Mesmo mecanismo, reaproveitado: uma entrada em `PAGES`? Não — isso não é uma
página, é uma sub-permissão dentro de uma página universal. Em vez de forçar
no registro de páginas, criamos um segundo registro pequeno,
`FEATURE_FLAGS`, no mesmo arquivo `pages.ts`, com o mesmo mecanismo de
resolução (override no `page_access` JSON, mesma chave-valor, mesma função
`updatePageAccess` — reaproveitada porque a estrutura de dados é idêntica):

```ts
export const FEATURE_FLAGS: PageDef[] = [
  { id: 'rastreio_valores', group: 'DADOS SENSÍVEIS',
    label: 'Ver valores de compra (Rastreio Compras)',
    defaultRoles: ['comprador', 'coordenador_suprimentos', 'gestor', 'admin'] },
];
```

Sem `path`/`icon` (não é rota). Aparece na mesma modal "Módulos de acesso",
seção separada "Dados sensíveis". `canAccessPage` funciona igual para
`PAGES` e `FEATURE_FLAGS` (mesma forma de checar override → defaultRoles).

Pontos de corte em `RastreioCompras.tsx` / `RastreioTable.tsx` /
`RastreioDetailModal.tsx`, todos controlados por
`const canSeeValores = canAccessPage(user, 'rastreio_valores')`:

1. **Colunas da tabela**: `RASTREIO_COLUMNS` filtra `precoUnitario`/`valorTotal`
   antes de popular `visibleColumns` e o menu "Personalizar Colunas", quando
   `!canSeeValores`.
2. **Export Excel**: `handleExportExcel` omite as duas chaves do objeto
   quando `!canSeeValores`.
3. **Export PDF**: já não inclui preço — nada a fazer.
4. **Modal de detalhes**: os dois `Field` de preço em `RastreioDetailModal`
   ficam condicionados também a `canSeeValores`.
5. **Ordenação**: cai naturalmente do item 1 — coluna ausente não aparece
   como opção de sort.

### 5. Simulação de perfil (Header "simular role")

`App.tsx` monta `activeUser` trocando `roles` para simular um perfil
(`simulatedRole`), mas mantém o resto do `Profile` — incluindo
`page_access`. Isso faria a simulação "vazar" overrides do admin real. Ajuste:
ao simular, `activeUser` zera `page_access` para `{}`, garantindo que a
simulação reflita puramente o padrão do perfil escolhido.

## Fora de escopo

- Não altera `hasPermission` (permissões de ação já existentes).
- Não cria UI para editar o `defaultRoles` por perfil (isso seria editar o
  RBAC-base, não o override por usuário — não foi pedido).
- Não adiciona auditoria detalhada além do log de atividade padrão já usado
  em outras trocas de permissão do AdminPanel.
