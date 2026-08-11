# Módulo Almoxarifado — Página Estoque

## Contexto

A importação ZL0024 (posição de estoque) já grava a tabela `estoque` no Supabase (~2.292 linhas, substituição total a cada carga). Falta uma tela para consultar esse estoque. Este é o primeiro item de um novo módulo "Almoxarifado".

## Escopo

- Novo grupo "ALMOXARIFADO" na sidebar, com a página "Estoque" (`/almoxarifado/estoque`).
- Nova permissão `almoxarifado.visualizar` para admin, coordenador_suprimentos e comprador.
- Nova view `Estoque.tsx` com tabela de estoque: busca, filtros, colunas personalizáveis e ordenação — seguindo o padrão já consolidado em `HistoricoPedidos.tsx`.
- Método `localDb.fetchEstoque` para buscar a tabela do Supabase.
- **Fora de escopo:** edição inline, movimentações de entrada/saída, drill-down por material. Apenas a consulta pedida.

## Navegação

- **Sidebar** (`src/components/Sidebar.tsx`): novo grupo `ALMOXARIFADO` com item `{ label: 'Estoque', path: '/almoxarifado/estoque', icon: Boxes, perm: { module: 'almoxarifado', action: 'visualizar' } }`.
- **Permissões** (`src/db/localDb.ts` → `hasPermission`): adicionar `almoxarifado.visualizar` às listas de `comprador` e `coordenador_suprimentos` (admin já tem `*`).
- **Rota** (`src/App.tsx`): `case '/almoxarifado/estoque'` com gate `hasPermission(user, 'almoxarifado', 'visualizar')`, view lazy-loaded. Adicionar o path a `STATE_PRESERVING_PATHS` (preserva filtros/busca durante sync em segundo plano).

## Dados

Novo método em `localDb.ts`:

```ts
public async fetchEstoque(force = false): Promise<EstoqueItem[]>
```

- Busca `estoque` via `fetchAllFromTable('estoque')` (paginação já embutida).
- Cacheia o resultado em memória (`this.cache` sob `estoqueKey`), para re-navegações na mesma sessão não refazerem a query. `force = true` (botão "Atualizar") ignora o cache.
- Acessor síncrono `getEstoque(): EstoqueItem[]` para leitura do cache.
- **Não** entra na sincronização periódica (`syncFromSupabase`) — a tela busca sob demanda, evitando egress recorrente no boot de quem não usa o módulo.

Novo tipo `EstoqueItem` em `src/types.ts` refletindo as colunas da tabela `estoque`.

## View `src/views/Estoque.tsx`

Modelada em `HistoricoPedidos.tsx`. Estrutura:

- **Header:** título "Estoque" (ícone `Boxes`), descrição, "Dados atualizados em" (usa `imported_at` mais recente das linhas), botões "Atualizar" e "Exportar" (Excel).
- **KPIs (4):** Itens em estoque (linhas filtradas) · Materiais distintos · Quantidade total · Valor total em estoque.
- **Filtros:** busca textual (Material, Descrição, Referência Fabricante, Grupo de mercadorias, Texto Pedido Compra) + selects Depósito / Tipo de material / Class. Item + toggle "Apenas com saldo" (quantidade > 0).
- **Tabela:** colunas ordenáveis (clique no cabeçalho), personalizáveis (menu + persistência em `localStorage` sob `sisten_estoque_visible_columns`), paginação "carregar mais" (PAGE_SIZE 50), cards no mobile / tabela no desktop, dark mode.

### Colunas

| id | Rótulo | Fonte | Alinhamento | Padrão visível |
|---|---|---|---|---|
| material | Material | `material` | left | ✔ |
| descricao | Descrição | `txt_breve_material` | left | ✔ |
| deposito | Depósito | `deposito` | left | ✔ |
| quantidade | Quantidade | `quantidade` | right | ✔ |
| umb | UMB | `umb` | left | ✔ |
| preco_medio | Preço Médio | `preco_medio` | right | ✔ |
| valor_total | Valor Total | `valor_total` | right | ✔ |
| centro | Centro | `centro` | left | — |
| tipo_material | Tipo Material | `tipo_material` | left | — |
| referencia_fabricante | Ref. Fabricante | `referencia_fabricante` | left | — |
| grp_mercad | GrpMercad | `grp_mercad` | left | — |
| class_item | Class. Item | `class_item` | left | — |
| grupo_mercadorias | Grupo Mercadorias | `grupo_mercadorias` | left | — |
| aplicacao | Aplicação | `aplicacao` | left | — |
| texto_pedido_compra | Texto Pedido Compra | `texto_pedido_compra` | left | — |
| empresa | Empresa | `empresa` | left | — |

Valores monetários com `formatPreco` (BRL); quantidade com `toLocaleString('pt-BR')`.

## Fora de escopo

- Edição/gravação de estoque pela tela.
- Movimentações (entradas/saídas), histórico por material, reserva/empenho.
- Sincronização periódica no boot.
