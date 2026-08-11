# Importação ZL0024 — Posição de Estoque

## Contexto

O painel Admin já suporta importação de planilhas SAP (ME5A, ZL0132, PedidosForn, Contatos), todas seguindo o mesmo padrão: parse de xlsx/csv → reconciliação de schema (`reconcileSchema`) → merge/upsert no Supabase → geração de log de importação (`import_logs`) → atualização do cache local.

A ZL0024 é diferente: representa a **posição de estoque atual** (foto do momento). Não faz sentido fazer merge/upsert por chave — a última importação é sempre a fonte da verdade completa. Por isso, ao invés de comparar com o que já existe, a importação deve **substituir todo o conteúdo da tabela** a cada carga.

## Escopo

- Nova tabela Supabase `estoque`.
- Nova função `importZL0024Raw` em `localDb.ts`, com substituição total (delete + insert), sem checagem de existência prévia.
- Novo card de upload na aba "Importar SAP" do Admin, **no lugar** do card e do botão simulador do ZL0132 (Pedidos de Compra). A função `importZL0132Raw` permanece no código, pois ainda é usada em outros fluxos (histórico de pedidos).
- Log de importação (`import_logs`, tipo `ZL0024`) reaproveitando a UI de log já existente (linhas lidas, inseridas, eliminadas, colunas ausentes/novas).
- **Fora de escopo:** qualquer tela de visualização/consulta do estoque importado.

## Mapeamento de colunas

| Coluna da planilha SAP | Campo na tabela `estoque` | Tipo |
|---|---|---|
| Cen. | `centro` | text |
| Dep. | `deposito` | text |
| Tipo de material | `tipo_material` | text |
| Material | `material` | text |
| Referência Fabricante | `referencia_fabricante` | text |
| TxtBreveMaterial | `txt_breve_material` | text |
| Stock UL (Dep) | `quantidade` | numeric |
| UMB | `umb` | text |
| PMM | `preco_medio` | numeric |
| Val.Total (depósito) | `valor_total` | numeric |
| GrpMercad | `grp_mercad` | text |
| Class. Item | `class_item` | text |
| Grupo de mercadorias (1ª ocorrência) | `grupo_mercadorias` | text |
| Grupo de mercadorias (2ª ocorrência = Aplicação) | `aplicacao` | text |
| Texto Pedido Compra | `texto_pedido_compra` | text |
| Nome 1 | `empresa` | text |

A coluna "Material" é obrigatória (chave mínima de validação de linha); demais colunas ausentes viram `columns_missing` no log, sem impedir a importação. `Grupo de mercadorias` aparece duas vezes no cabeçalho da planilha — `reconcileSchema` já resolve múltiplas ocorrências por ordem de aparição (mesmo mecanismo usado no ZL0132 para colunas repetidas como "Moeda"/"Itm").

## Tabela `estoque`

```sql
create table public.estoque (
  id bigint generated always as identity primary key,
  centro text,
  deposito text,
  tipo_material text,
  material text,
  referencia_fabricante text,
  txt_breve_material text,
  quantidade numeric,
  umb text,
  preco_medio numeric,
  valor_total numeric,
  grp_mercad text,
  class_item text,
  grupo_mercadorias text,
  aplicacao text,
  texto_pedido_compra text,
  empresa text,
  imported_at timestamptz not null default now()
);
```

RLS replicando o padrão de `pedidosforn`/`contatos`:
- `estoque_read`: SELECT para `authenticated`, `qual = true`.
- `estoque_write`: ALL para `authenticated`, restrito a `has_role('admin') OR has_role('coordenador_suprimentos') OR has_role('comprador')`.

## Fluxo de importação (`importZL0024Raw`)

1. Recebe `rawRows` (mesmo formato das demais: array de arrays, primeira linha = headers) e `filename`.
2. `reconcileSchema(headers, ESTOQUE_COLUMNS)` → `mappedFields`, `missingColumns`, `newColumns`.
3. Valida presença da coluna `Material`; se ausente, lança erro (planilha rejeitada).
4. Para cada linha de dados: monta o registro mapeado; linhas sem `Material` preenchido são ignoradas (`ignored_rows`, motivo "Material vazio"). Campos numéricos (`quantidade`, `preco_medio`, `valor_total`) convertidos com `Number(val) || 0`.
5. Conta o total atual de linhas em `estoque` (para preencher `records_eliminated` no log — quantidade substituída).
6. **Sem merge:** `DELETE FROM estoque` (delete total) seguido de `INSERT` das novas linhas em lotes de 500, com callback de progresso.
7. Monta e insere o log (`import_logs`, `type: 'ZL0024'`): `records_read`, `records_inserted` (= linhas válidas inseridas), `records_updated: 0` (não há conceito de update — é substituição total), `records_eliminated` (= linhas que existiam antes da substituição), `columns_missing`, `columns_new`, `ignored_rows`.
8. Grava o log também no cache local (`importLogsKey`), igual às demais importações.
9. Não mantém cache local dos dados de estoque em si (nenhuma tela consome ainda; evita inflar o `localStorage`).

## Tipos (`types.ts`)

Adicionar `'ZL0024'` ao union `SAPImportLog['type']`: `'ME5A' | 'ZL0132' | 'PEDIDOSFORN' | 'CONTATOS' | 'ZL0024'`.

## UI (AdminPanel.tsx)

Na aba "Importar SAP" (`importar_sap`):
- Remover o botão simulador "Vincular Pedidos Emitidos (ZL0132)".
- Remover o card de upload "Transação ZL0132 (Pedidos de Compra)".
- Adicionar no mesmo lugar (grid de 4 cards) o card "Transação ZL0024 (Posição de Estoque)": mesmo padrão de leitura de arquivo (xlsx/xls via `XLSX.utils.sheet_to_json`, csv via split por `;`), chamando `localDb.importZL0024Raw(rawRows, file.name, setSapProgress)`.
- Texto de apoio do card deixa explícito o comportamento de substituição total: "Substitui integralmente a posição de estoque anterior — a última carga é sempre a mais atual."
- Na tabela de Logs SAP (`importar_sap_log`), adicionar cor de badge para `ZL0024` (roxo, reaproveitando a cor já usada para tipos não mapeados explicitamente, ou uma cor dedicada).

## Fora de escopo

- Tela de consulta/dashboard da posição de estoque.
- Botão de simulação/demo para ZL0024 (os demais têm simulador demonstrativo; não foi pedido para este).
