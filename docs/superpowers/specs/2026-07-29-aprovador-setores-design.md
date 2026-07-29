# Aprovador de Setores — Design

## Problema

Hoje, quem aprova uma solicitação de compra é decidido implicitamente: qualquer usuário com role `gestor` aprova automaticamente as solicitações cujo `solicitante_sector_id` é igual ao seu próprio `sector_id` (`Approvals.tsx`, `localDb.ts`). Não existe forma de um usuário aprovar solicitações de setores diferentes do seu, nem de ter mais de um aprovador por setor de forma explícita.

## Objetivo

Permitir que o admin, na página de Gestão de Usuários, atribua a cada usuário uma lista de setores solicitantes que ele pode aprovar (multi-seleção). Essa lista passa a ser a única regra que decide:
1. Quais solicitações de compra aparecem na fila de aprovação do usuário.
2. Quem recebe notificação quando uma nova solicitação de compra é criada (ou reenviada após edição) para aquele setor.

`admin` e `coordenador_suprimentos` continuam com bypass total (veem/aprovam/são notificados de tudo), como hoje — isso também cobre o caso de um setor ficar sem nenhum aprovador explícito atribuído.

## Modelo de dados

Novo arquivo `adicionar_coluna_aprovador_setores.sql` na raiz do repo (segue o padrão existente de `adicionar_coluna_page_access.sql`):

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aprovador_setores jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Array jsonb de `sector_id` (strings). Escolhido em vez de tabela de junção por simplicidade — mesmo padrão já validado em `profiles.page_access`.

`src/types.ts`: adicionar `aprovador_setores: string[]` à interface `Profile`.

## UI — Gestão de Usuários

Em `AdminPanel.tsx`, nova coluna **"Aprovador"** na tabela de usuários, entre "Grupo Compras" e "Nível de Acesso". A célula mostra um resumo (`"3 setores"` ou `"—"` se vazio) e um botão que abre um novo modal `src/components/admin/AprovadorSetoresModal.tsx`, copiando o padrão de `PageAccessModal.tsx` (`Modal`/`ModalHeader`/`ModalBody`/`ModalFooter`):

- Lista todos os setores (`sectors`) com checkbox.
- Admin marca/desmarca os setores que aquele usuário pode aprovar.
- Salva via `localDb.updateUserAprovadorSetores(profileId, sectorIds)` — mesmo padrão fire-and-forget dos outros updaters (`updateUserRole`, `updateUserGrupoCompras`): atualiza cache local imediatamente, depois `supabase.from('profiles').update({ aprovador_setores: sectorIds }).eq('id', profileId)` em background.

Disponível para qualquer usuário ativo, independente do role atual.

## Fluxo de aprovação (`Approvals.tsx`)

Troca o filtro de carregamento de solicitações (linhas ~36-40) de:

```ts
r.solicitante_sector_id === user.sector_id && user.roles.includes('gestor')
```

para:

```ts
user.aprovador_setores?.includes(r.solicitante_sector_id)
```

mantendo os bypasses existentes para `admin` e `coordenador_suprimentos` (`||` na mesma condição).

## Notificações (`localDb.ts`)

Em `submitRequest` (fanout ao criar solicitação `compra`, linha ~2318) e em `saveRequestEdit` (reenvio após edição de solicitação já aprovada, linha ~2444), troca o filtro de destinatários de:

```ts
u.sector_id === request.solicitante_sector_id && u.roles.includes('gestor')
```

para:

```ts
u.aprovador_setores?.includes(request.solicitante_sector_id)
```

O alerta especial de criticidade 5 + setores Saúde/Segurança (linhas ~2331-2344) não muda — é um alerta adicional, independente de quem aprova.

## Fora de escopo

- Comportamento de `admin`/`coordenador_suprimentos` (já veem/aprovam tudo).
- Central de Compras / Rastreio de Compras (não fazem parte do fluxo de aprovação).
- Notificação por e-mail (não existe hoje no projeto).
- CRUD de setores (fora do escopo, já existe tela própria).

## Testes manuais

1. Admin atribui setor "Financeiro" a um usuário X (role `solicitante`) via novo modal.
2. Uma solicitação de compra é criada por alguém do setor Financeiro.
3. Usuário X recebe notificação e vê a solicitação na fila de aprovações (`/solicitacoes/aprovacoes`).
4. Um `gestor` do setor Financeiro que **não** foi marcado como aprovador não vê mais a solicitação (regra antiga removida).
5. Setor sem nenhum aprovador atribuído: solicitação aparece normalmente para `admin`/`coordenador_suprimentos`.
