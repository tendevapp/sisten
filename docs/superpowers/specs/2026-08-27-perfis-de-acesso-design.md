# Perfis de Acesso — camada de autorização editável por dados

Data: 2026-08-27
Revisão: 2 (após análise crítica contra o código — ver §9 "Mudanças deliberadas de comportamento")

## Problema

O controle de acesso do SISTEN hoje tem **duas camadas apenas**:

1. **Papel fixo no código** (`Role` em `src/types.ts`). Cada papel mapeia:
   - páginas visíveis — `PageDef.defaultRoles` em `src/lib/pages.ts`;
   - ações — o objeto `rolePermissions` dentro de `localDb.hasPermission`
     (`src/db/localDb.ts:1378`).
2. **Exceção por usuário** — `core_perfis.page_access` (JSONB). Só entram as
   chaves desviadas do padrão do papel. Editada em `PageAccessModal.tsx`
   (individual) e `localDb.updateBulkPageAccess` (lote).

Consequências, com o sistema crescendo:

- **Não há camada intermediária editável.** Todo usuário novo cujo acesso é
  "quase igual ao de outro" vira configuração manual de exceções, uma a uma.
  Não existe o conceito de "conjunto de acessos nomeado" que o admin possa
  criar, revisar e reaproveitar sem tocar em código.
- **Toda página/função nova acopla deploy a acesso.** Para definir quem vê uma
  rota nova, é preciso editar `defaultRoles` no código. Usuários com exceções
  em `page_access` ficam invisíveis a essa decisão, e não há como listar
  "quem ficou de fora da capacidade nova".
- **`Role` é rígido.** Adicionar um perfil funcional (ex.: "RH-DP consulta",
  "Financeiro leitura") exige mexer no union type `Role`, no `rolePermissions`,
  no `defaultRoles` de várias páginas e na matriz da doc `RBAC.md`.
- **Sem auditoria.** Não há tela que responda "quem acessa a página X" ou
  "de onde vem cada permissão deste usuário".

### Achado ao inspecionar o código: `alwaysAdmin` não faz o que o nome diz

O JSDoc em `src/lib/pages.ts` descreve `alwaysAdmin` como *"Página
administrativa: sempre restrita a admin"*. **Não é o que o código faz.**
Traçando `canAccessPage(coordenador_suprimentos, 'admin_usuarios')`:

```
não é admin → def encontrada → override ignorado (alwaysAdmin)
→ defaultRoles = ['admin','coordenador_suprimentos'] → .some(...) → TRUE
```

A semântica real de `alwaysAdmin` é **"não sobrescrevível por exceção de
usuário"** — uma *trava*, não uma restrição a admin. Quem entra por
`defaultRoles` entra normalmente. Há teste fixando esse comportamento em
`src/lib/pages.test.ts:63-69`. Corrigir esse JSDoc faz parte desta entrega.

### Decisões tomadas no brainstorming (2026-08-27) e na revisão da spec

| Tema | Decisão |
| :--- | :--- |
| Modelo | **Perfis de Acesso editáveis (dados).** `Role` deixa de ser autorização. |
| Página/função nova | **Herda do módulo.** Capacidade nova entra automática em quem já tem o módulo — salvo se marcada `sensivel`. |
| Escopo | Visibilidade de página/módulo **+** ações (`hasPermission`) **+** auditoria. |
| Conflito entre perfis | **Aditivo puro.** Se qualquer perfil concede, o usuário tem. `capacidades_negadas` só subtrai dentro do perfil que a listou. |
| Capacidade `sensivel` dentro de módulo concedido | **Default-deny.** Exige concessão avulsa explícita no perfil. |
| Trava `alwaysAdmin` | **Descontinuada.** Uma flag só (`sensivel`); páginas `admin_*` passam a ser **concedíveis** — ver §9.1. |
| Quem edita Perfis de Acesso | **Somente `admin`.** É o que impede escalação de privilégio — ver §9.2. |
| Bypass de admin | **Perfil-sistema "Administrador" com `todos: true`.** `roles.includes('admin')` deixa de ser autorização — ver §9.3. |
| Simulação no Header | Passa a simular **Perfil de Acesso**, não `Role` — vira o preview de acesso. |
| `Role` pós-migração | **Mantido como rótulo/semente.** Cargo funcional e origem do seed; sem poder de autorização. |
| Escala alvo | Dezenas de usuários, ~10–15 padrões distintos. |
| RLS no banco | **Fora de escopo desta rodada** (registrado como dívida). |

---

## Desenho

### 1. Capacidades no código (`src/lib/capabilities.ts`)

Fonte única da verdade sobre **o que existe para permissionar**. Unifica os
três registros hoje separados (`PAGES`, `FEATURE_FLAGS` e as strings de
`rolePermissions`) num só formato:

```ts
export type CapabilityKind = 'pagina' | 'flag' | 'acao';

export interface CapabilityDef {
  /**
   * Chave estável, gravada em perfis e em core_perfis.page_access. Nunca renomear.
   * Para kind === 'acao', o id É a string `${module}.${action}` já usada hoje
   * por hasPermission (ex.: 'sap.importar') — ver §4.3.
   */
  id: string;
  /** Módulo a que pertence — ver MODULES abaixo. Governa a herança automática. */
  modulo: string;
  kind: CapabilityKind;
  label: string;
  descricao?: string;
  /** Só para kind === 'pagina': rota do menu/roteador. */
  path?: string;
  icon?: LucideIcon;
  /**
   * Nasce default-deny mesmo dentro de um módulo concedido: exige concessão
   * avulsa explícita (`capacidades_extra`), e sua exceção individual
   * (`page_access`) só pode ser editada por admin (§4.4).
   * Ex.: 'rastreio_valores', páginas de FINANCEIRO, todas as 'admin_*'.
   */
  sensivel?: boolean;
  /**
   * Semente para a migração: quais Roles recebiam isto por padrão. Consumido
   * só pelo seed dos perfis-sistema (§5.2) e pelo fallback de transição
   * (§4.2, precedência 4). Não é lido em regime normal.
   */
  seedRoles?: Role[] | '*';
}

export const CAPABILITIES: CapabilityDef[];
```

- `PAGES` e `FEATURE_FLAGS` de `src/lib/pages.ts` são **reescritos como
  derivações** de `CAPABILITIES` (`CAPABILITIES.filter(c => c.kind === 'pagina')`
  etc.), para não quebrar os 15 arquivos que os importam. `pageIdForPath` e
  `getPageGroups` seguem existindo com a mesma assinatura.
- As ~20 ações hoje embutidas em `rolePermissions` entram em `CAPABILITIES`
  com `kind: 'acao'`, `id` no formato `módulo.ação` e `modulo` correspondente.
- `alwaysAdmin` **desaparece** do modelo. Todas as capacidades que o usavam
  passam a `sensivel: true`. Consequência deliberada em §9.1.
- O JSDoc incorreto de `alwaysAdmin` não é migrado — a documentação de
  `sensivel` acima descreve o comportamento real.

**Adicionar uma página nova** = adicionar uma entrada em `CAPABILITIES`. Nada
mais. Quem tiver o módulo dela no perfil já a enxerga na carga seguinte; se
for `sensivel`, ninguém a enxerga até um perfil concedê-la avulsa.

### 2. Módulos (`src/lib/capabilities.ts`)

Formaliza o que hoje é a string solta `group`:

```ts
export interface ModuleDef {
  id: string;      // 'SUPRIMENTOS', 'PORTARIA', 'RH', 'ALMOXARIFADO', ...
  label: string;
  ordem: number;   // ordem no menu e nos editores
}
export const MODULES: ModuleDef[];
```

Grupos atuais viram módulos: `GERAL`, `SOLICITAÇÕES`, `SUPRIMENTOS`,
`ALMOXARIFADO`, `FACILITIES`, `FINANCEIRO`, `HELPDESK`, `ADMINISTRAÇÃO`.
Os agrupamentos que hoje existem só para a UI do modal deixam de ser módulos e
viram atributo da capacidade no módulo dono: `rastreio_valores` →
`modulo: 'GERAL', sensivel: true`; `form_portaria`/`form_rh`/… →
`modulo: 'FORMULARIOS'`.

### 3. Perfil de Acesso — a camada nova (banco)

```sql
CREATE TABLE public.core_perfis_acesso (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL UNIQUE,
  descricao   text,
  -- Perfil de fábrica gerado pelo seed (§5.2): clonável, não editável nem
  -- apagável pela UI — se editado, a regeneração do seed diverge.
  sistema     boolean NOT NULL DEFAULT false,
  -- Concede TUDO, inclusive capacidade `sensivel` e capacidade futura.
  -- Exclusivo do perfil "Administrador" (§4.1).
  todos       boolean NOT NULL DEFAULT false,
  modulos              text[] NOT NULL DEFAULT '{}',  -- concede o módulo inteiro, inclusive o que vier depois
  capacidades_extra   text[] NOT NULL DEFAULT '{}',  -- add-ons fora dos módulos concedidos, e as `sensivel`
  capacidades_negadas text[] NOT NULL DEFAULT '{}',  -- subtrai algo que viria por um módulo concedido
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- updated_at automático (mesmo padrão das demais tabelas do projeto).
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.core_perfis_acesso
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Guarda IDS (uuid em texto), nunca nomes — perfis podem ser renomeados.
ALTER TABLE public.core_perfis
  ADD COLUMN IF NOT EXISTS perfis_acesso text[] NOT NULL DEFAULT '{}';
```

- Um usuário recebe **1 ou mais** perfis. Sem perfil = sem acesso (com o
  fallback de transição de §4.2 enquanto durar a migração).
- `core_perfis.page_access` (JSONB) **permanece** — rebaixado a *exceção
  individual pontual*, com aviso na UI. Restrição nova de edição em §4.4.
- Scoping de domínio (`aprovador_setores`, `grupo_compras`,
  `aprovador_cadastro_sap`) **não muda** — é a 3ª camada, ortogonal.
- `core_perfis_acesso` entra no `syncFromSupabase`/cache do `localDb` como as
  demais tabelas de cadastro. O cache do `localDb` é um `Map` em memória
  (respaldado por IndexedDB), então ler perfis a cada chamada de `canAccess`
  é barato — é o que viabiliza a opção (b) de §4.5.

**Integridade referencial.** `perfis_acesso` é `text[]`, sem FK — apagar um
perfil tiraria acesso de N usuários silenciosamente. Regras:
- excluir perfil **em uso** é bloqueado pela UI, que oferece reatribuição;
- id órfão em `perfis_acesso` (perfil apagado fora da UI) é **ignorado** na
  resolução e reportado na aba de Auditoria (§6.3).

### 4. Resolução unificada (`canAccess`)

Nova função em `src/lib/capabilities.ts`, que **substitui** `canAccessPage` e o
corpo de `localDb.hasPermission` (ambos passam a delegar para ela).

#### 4.1 Precedência

1. **Perfil com `todos: true`** entre os perfis do usuário → `true`.
   (É o perfil-sistema "Administrador"; substitui o antigo bypass
   `roles.includes('admin')` — ver §9.3.)
2. **Exceção individual**: `user.page_access[capabilityId]` definido
   (`true`/`false`) → vence o que segue.
3. **Perfis do usuário**, resolvidos em `AccessProfile[]`, **aditivo puro** —
   concede se existir perfil `P` tal que:
   - `capId ∈ P.capacidades_extra`, **ou**
   - `cap.modulo ∈ P.modulos` **e** `cap.sensivel !== true` **e**
     `capId ∉ P.capacidades_negadas`.
4. Nenhum perfil cobre → `false`.

#### 4.2 Fallback de transição

Enquanto `user.perfis_acesso` estiver **vazio**, a precedência 4 cai no
comportamento antigo (`cap.seedRoles` contra `user.roles`). Isso mantém o app
funcionando entre "ligar o código novo" e "concluir o backfill", sem big-bang.
Removido em §5.5.

#### 4.3 Regras de borda (explícitas, por terem ficado ambíguas na revisão 1)

- **Dentro de um mesmo perfil, `capacidades_extra` vence `capacidades_negadas`.**
  `negadas` existe para subtrair do que veio por `modulos`; listar a mesma
  capacidade nos dois é contradição do editor, resolvida a favor da concessão.
- **`capacidades_extra` concede mesmo sem o módulo.** Conceder
  `sup_fornecedores` sem conceder `SUPRIMENTOS` é válido e é o caso de uso de
  add-on pontual.
- **`negadas` não cruza perfis.** Uma negação em `P1` não derruba concessão de
  `P2` — é o que "aditivo puro" significa.
- **Id desconhecido → `false`**, preservando o comportamento atual de
  `canAccessPage` e de `hasPermission`. Em `import.meta.env.DEV`, emitir
  `console.warn` — é o que pega capacidade renomeada ou typo em perfil.
- **Ações**: `hasPermission(user, module, action)` vira
  `canAccess(user, \`${module}.${action}\`)`. Como os ids de `kind: 'acao'`
  usam exatamente esse formato, **nenhum call site de `hasPermission` muda**.

#### 4.4 Quem pode conceder

Consequência direta de §9.1 + §9.2 (`admin_*` virou concedível):

- Escrever em `core_perfis_acesso` (criar/editar/excluir perfil): **só quem
  tem `todos: true`**.
- Atribuir perfis existentes a usuários (`perfis_acesso`): quem tem
  `admin_usuarios`.
- Editar exceção individual (`page_access`) de capacidade **`sensivel`**: **só
  quem tem `todos: true`**. Sem isso, a camada de exceção seria o caminho
  alternativo para a mesma escalação que §9.2 fecha.
- Editar exceção de capacidade não-sensível: quem tem `admin_usuarios`.

Essas regras valem na UI **e** em `localDb` (as funções de escrita checam antes
de gravar), não só escondendo botões.

#### 4.5 Assinatura

`canAccess` precisa da lista de perfis. Escolha: **a função lê o `localDb`
internamente** — como `hasPermission` já faz hoje —, mantendo os ~52 call
sites de `App.tsx` como simples rename (`canAccessPage(user, id)` →
`canAccess(user, id)`). O cache em memória de §3 torna isso barato.

Para os testes existe a variante **pura**:

```ts
export function canAccessWith(user: Profile, capId: string, perfis: AccessProfile[]): boolean;
export function canAccess(user: Profile, capId: string): boolean; // = canAccessWith(user, capId, localDb.getAccessProfiles())
```

`canAccessFormGroup` e `canViewAllAse` são reescritos sobre `canAccess`. A
compatibilidade com a flag legada `rh_ase_hora_extra` (hoje em
`canAccessFormGroup`, com teste em `pages.test.ts:118-127`) **deve ser
preservada** na reescrita.

### 5. Migração

**5.1 Schema.** Criar `core_perfis_acesso` + coluna `core_perfis.perfis_acesso`.
Convenção de arquivo: ver §10 (questão em aberto).

**5.2 Seed dos perfis-sistema.** Script **idempotente** (`ON CONFLICT (nome) DO
UPDATE`) que, a partir de `CAPABILITIES[].seedRoles`, gera um perfil
`sistema: true` por `Role` atual: `Administrador` (`todos: true`),
`Coordenador de Suprimentos`, `Comprador`, `Gestor`, `Requisitante`,
`Solicitante`, `Atendente`, `Visualizador`. `pendente` → perfil vazio. Cada um
reproduz exatamente o acesso de hoje daquele papel.

**5.3 Backfill de usuários.** Para cada `core_perfis`: `perfis_acesso` = os
**ids** dos perfis-sistema equivalentes aos seus `roles`. `page_access` fica
**intacto** (continua valendo, precedência 2).

**5.4 Ligar o código novo** com o fallback de §4.2 ativo → deploy → validar.

**5.5 Remover o fallback.** A partir daqui, criar um perfil funcional novo é
100% pela UI.

**5.6 Proteção contra lockout.** Com o bypass por `Role` removido (§9.3), um
seed malsucedido pode deixar **ninguém** com `todos: true` e nenhum caminho de
UI para corrigir. Salvaguardas obrigatórias:
- o passo 5.4 só é liberado após uma query de verificação confirmar
  `≥1 usuário ativo com o perfil Administrador`;
- `canAccess` mantém, **até a conclusão de 5.5**, o reconhecimento de
  `roles.includes('admin')` como equivalente a `todos: true` (é o mesmo
  fallback de §4.2, aplicado à precedência 1);
- o script de rollback (§5.7) é escrito e testado *antes* do deploy.

**5.7 Rollback.** Cada passo é reversível sem perda:
- 5.4 → reverter o deploy do frontend; o schema novo é inerte para o código
  antigo (colunas/tabela ignoradas), e `page_access`/`roles` seguem intactos;
- 5.1–5.3 → `DROP TABLE core_perfis_acesso` + `ALTER TABLE core_perfis DROP
  COLUMN perfis_acesso`. Nenhum dado pré-existente é alterado pela migração,
  então não há o que restaurar.

**5.8 Teste de caracterização (a rede de segurança).** O repo tem vitest
(`npm run test`, `npm run check`). Antes de ligar, escrever um teste que varre
**todo par (perfil-sistema × capacidade)** e afirma:

```
canAccessPage_antigo(userComRole, capId) === canAccessWith(userComPerfil, capId, perfisSemeados)
```

É o que transforma "validar em produção" (revisão 1) em prova automatizada de
que o seed é fiel. Deve rodar no `npm run check` até a conclusão de 5.5.

`Role` permanece em `types.ts` e nos registros que já o carregam
(`RequestComment.user_roles`) como **rótulo de cargo**, sem efeito em
`canAccess` após 5.5.

### 6. UI — aba Administração

**6.1. Sub-aba "Perfis de Acesso" (nova).** Visível apenas para `todos: true`
(§4.4).
- Lista: nome, descrição, nº de usuários que usam, badge `sistema`. Ações:
  criar, editar, clonar, excluir (bloqueado para `sistema` e para perfil em uso).
- Editor: árvore **Módulo → Capacidade**, agrupada por `kind` (Páginas / Flags /
  Ações). Checkbox tri-state por módulo:
  - marcado = `modulo ∈ modulos` (concede tudo, inclusive futuro);
  - parcial = capacidades avulsas em `capacidades_extra` sem o módulo inteiro,
    ou módulo concedido com itens em `capacidades_negadas`;
  - vazio = nada.
  Capacidades `sensivel` têm selo e **sempre** exigem marcação individual.
- **Painel "Acesso efetivo"** ao lado da árvore: lista resolvida do que o perfil
  concede, incluindo o que vem por herança de módulo. É onde o admin confere o
  resultado antes de salvar.
- Salvar em lote (um `update` na linha), diferente do toggle-imediato do
  `PageAccessModal` — aqui há revisão antes de aplicar.

**6.2. Aba "Usuários".**
- O botão "Módulos de acesso" passa a abrir seletor de **Perfis** (multi-select
  com busca) + bloco colapsado **"Exceções deste usuário"** — o
  `PageAccessModal` atual, rotulado como desvio pontual, com as capacidades
  `sensivel` desabilitadas para quem não é admin (§4.4).
- Coluna "Perfis" na linha do usuário.
- `updateBulkPageAccess` ganha par `updateBulkPerfisAcesso(userIds, perfis)`.

**6.3. Sub-aba "Auditoria de Acesso" (nova).**
- **Por capacidade:** escolhe página/flag/ação → usuários com acesso e a origem
  de cada um (qual perfil, ou "exceção individual").
- **Por usuário:** acesso efetivo consolidado + origem de cada item.
- **Capacidades órfãs:** as que nenhum perfil não-`sistema` concede — pega
  "entrou página nova e ninguém foi liberado".
- **Ids órfãos:** `perfis_acesso` apontando para perfil inexistente (§3).
- Histórico via `logActivity` (módulo "Administração"): criação/edição de
  perfil e mudança de `perfis_acesso`, no formato já usado por
  `updatePageAccess`.

**6.4. Simulação no Header.** `simulatedRole: Role | null` passa a
`simulatedPerfilId: string | null` (mesma persistência em `sessionStorage`,
chave renovada). `activeUser` troca `perfis_acesso` pelo perfil simulado e
zera `page_access` (como já faz hoje). O gate da simulação em
[App.tsx:186](src/App.tsx#L186) troca `user.roles.includes('admin')` por
"tem perfil com `todos: true`". Isso converte a simulação no **preview de
"como fica o acesso deste perfil"** — o instrumento que faltava ao lançar
página nova.

### 7. Pontos de código afetados

| Arquivo | Mudança |
| :--- | :--- |
| `src/lib/capabilities.ts` | **novo** — `CAPABILITIES`, `MODULES`, `canAccess`, `canAccessWith` |
| `src/lib/pages.ts` | `PAGES`/`FEATURE_FLAGS`/`getPageGroups` viram derivações; `canAccessPage` delega; `canAccessFormGroup`/`canViewAllAse` reescritos preservando a compat `rh_ase_hora_extra` |
| `src/lib/pages.test.ts` | adaptar; **reescrever** o teste `não deve permitir override para páginas alwaysAdmin` (§9.1) |
| `src/lib/capabilities.test.ts` | **novo** — `canAccessWith` (aditividade, `sensivel`, `negadas`, bordas de §4.3) + caracterização (§5.8) |
| `src/types.ts` | `Profile.perfis_acesso?: string[]`; novo `interface AccessProfile` |
| `src/db/localDb.ts` | `hasPermission` delega; CRUD `getAccessProfiles`/`saveAccessProfile`/`deleteAccessProfile` (com checagem de §4.4); `updateUserPerfisAcesso`/`updateBulkPerfisAcesso`; `core_perfis_acesso` no sync; seeds com `perfis_acesso` |
| `src/App.tsx` | ~52 call sites `canAccessPage` → `canAccess` (rename); `simulatedRole` → `simulatedPerfilId`; gate da simulação por `todos` |
| `src/components/Header.tsx` | seletor "Simular Visão" passa a listar Perfis de Acesso; `getRoleBadge` do rodapé usa o perfil simulado |
| `src/components/Sidebar.tsx` | filtro do menu por `canAccess` |
| `src/views/AdminPanel.tsx` | sub-abas "Perfis de Acesso" e "Auditoria de Acesso"; aba Usuários com seletor de perfis |
| `src/components/admin/PageAccessModal.tsx` | vira o bloco "Exceções", com `sensivel` travado para não-admin |
| `src/components/admin/*` | **novos**: `AccessProfileList`, `AccessProfileEditor`, `AccessAuditView` |
| `db/sql/...` | tabela + coluna; seed idempotente; backfill; verificação anti-lockout; rollback (§10) |
| `docs/referencia/RBAC.md` | reescrever: a matriz papel×página deixa de ser a fonte; documentar perfis, `canAccess` e a correção do `alwaysAdmin` |

### 8. Compatibilidade e riscos

- **`page_access` legado continua valendo** (precedência 2). Nada a migrar.
- **Fallback de transição** (§4.2) e **anti-lockout** (§5.6) garantem que
  ninguém perde acesso entre ligar e backfillar.
- **Aditividade pura** pode surpreender ("dei um perfil e ele ganhou mais do
  que eu queria") — mitigado pelo painel "Acesso efetivo" (§6.1) e pela
  auditoria (§6.3). Foi escolha explícita, por previsibilidade.
- **Perfis-sistema editáveis divergiriam do seed** — por isso são só clonáveis.
- **`canAccess` lendo `localDb`** mantém o acoplamento que `hasPermission` já
  tem; os testes usam `canAccessWith`.

### 9. Mudanças deliberadas de comportamento

Três pontos onde esta spec **muda** o comportamento atual de propósito. Foram
decididos na revisão, não são efeito colateral.

**9.1. Páginas `admin_*` passam a ser concedíveis a não-admins.** Hoje
`alwaysAdmin` impede que qualquer exceção conceda uma página administrativa
(teste em `pages.test.ts:63-69`). Com uma flag só (`sensivel`), elas viram
default-deny **concedíveis**. O teste citado deve ser reescrito para afirmar a
nova regra: `sensivel` não entra por herança de módulo, mas entra por
`capacidades_extra`. O teto de privilégio passa a ser garantido por 9.2, não
pela trava.

**9.2. Só `admin` cria/edita Perfis de Acesso.** Sem essa regra, 9.1 abriria
escalação: `coordenador_suprimentos` alcança `/admin/permissoes` hoje e, com
perfis editáveis, criaria um perfil com todos os módulos e se atribuiria. A
regra vale também para exceções de capacidades `sensivel` (§4.4) — senão a
camada de exceção seria a rota alternativa para a mesma escalação.

**9.3. O bypass de admin deixa de ser `roles.includes('admin')`.** Passa a ser
o perfil-sistema "Administrador" (`todos: true`). Coerente com "`Role` vira só
rótulo" — antes, `Role` seguia com poder de autorização justamente no caso mais
perigoso. O risco (lockout) é tratado em §5.6.

### 10. Questão em aberto

**Onde vive o SQL?** O repo tem duas convenções ativas:
- `db/sql/alters/` — 20+ scripts hand-run (inclui
  `adicionar_coluna_page_access.sql`, o análogo direto desta entrega);
- `supabase/migrations/` — criado em 2026-08-27 com um único
  `20260827132829_remote_schema.sql` (dump), sugerindo adoção recente do
  Supabase CLI.

Definir antes de escrever o plano. Se o CLI é o caminho, esta é uma boa
migração para estrear — ela tem seed, backfill e rollback, que o fluxo
hand-run não versiona bem.

---

## Fora de escopo

- **RLS no Supabase.** O gate continua só no frontend. Capacidades sensíveis
  de *dados* (valores de compra, Financeiro) idealmente teriam reforço em RLS
  espelhando este modelo — dívida registrada, não entrega desta rodada.
- **Delegação de administração por setor.** Só compensa no cenário de centenas
  de usuários; hoje a administração é concentrada em 1–2 admins.
- **CRUD de capacidades/módulos pela UI.** Capacidades continuam no código —
  é o que faz "herda do módulo" funcionar no deploy sem tabela extra.
- **Editar o `seedRoles`/RBAC-base pela UI.** Após a migração é só documentação
  de origem.
- **Workflow de aprovação para conceder acesso.** Concessão segue direta.
