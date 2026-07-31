# Importação FBL1N (Contas a Pagar)

## Contexto

O SISTEN já importa diversos relatórios SAP (ME5A, ZL0132, ZL0024, ME3N, PedidosForn,
Contatos, CidadeForn) através da aba "Importar SAP" em `AdminPanel.tsx`, gravando os
dados brutos em tabelas próprias no Supabase e um registro em `import_logs`, visível na
aba "Log Importação SAP".

Este design adiciona um novo tipo de importação para o relatório **FBL1N** do SAP
(contas a pagar / partidas em aberto de fornecedores), reaproveitando integralmente o
padrão já existente, e cria uma tela de consulta dedicada para os dados importados.

## Escopo

1. Nova tabela `fbl1n_c_pagar` no Supabase.
2. Nova função de importação `importFBL1NRaw()` em `localDb.ts`, com estratégia de
   **substituição total** (delete + insert), igual à ZL0024 — cada carga é uma foto do
   momento, não um histórico incremental.
3. Novo card de upload na aba "Importar SAP".
4. Novo tipo `'FBL1N'` no log de importações (`import_logs` / `SAPImportLog`).
5. Nova tela "Contas a Pagar" (`/suprimentos/contas-pagar`) para consulta dos dados
   importados, com filtros, KPIs e exportação para Excel.

Fora de escopo: qualquer integração desses dados com outras telas existentes
(Rastreio, Dashboards, Fornecedores etc.) — fica para uma iteração futura.

## Modelo de dados

### Tabela `fbl1n_c_pagar`

Uma linha por parcela de documento contábil. Estrutura análoga a `estoque`: `id`
bigserial, colunas mapeadas 1:1 das colunas do relatório FBL1N, mais `campos_extras`
jsonb para qualquer coluna não mapeada, mais `imported_at`.

| Coluna do SAP (FBL1N) | Campo | Tipo |
|---|---|---|
| Símb.prtds.em aberto/comp | `simbolo_partida` | text |
| Código de imposto | `codigo_imposto` | text |
| Empresa | `empresa` | text |
| Chave referência 1 | `chave_referencia_1` | text |
| Conta | `conta` | text |
| Nº documento | `numero_documento` | text |
| Razão social do fornecedor | `razao_social_fornecedor` | text |
| Ano/Mês | `ano_mes` | text |
| Referência | `referencia` | text |
| Data do documento | `data_documento` | date |
| Data de lançamento | `data_lancamento` | date |
| Tipo de documento | `tipo_documento` | text |
| Estorno com | `estorno_com` | text |
| Conta lnçto.contrap. | `conta_lancamento_contrapartida` | text |
| Data de pagamento | `data_pagamento` | date |
| Mont.moeda doc. | `montante_moeda_doc` | numeric |
| Mont.base desconto | `montante_base_desconto` | numeric |
| Montante base de IRF | `montante_base_irf` | numeric |
| Montante IRF | `montante_irf` | numeric |
| Moeda do documento | `moeda_documento` | text |
| Data de compensação | `data_compensacao` | date |
| Doc.compensação | `doc_compensacao` | text |
| Centro | `centro` | text |
| Documento de compras | `documento_compras` | text |
| Elemento PEP | `elemento_pep` | text |
| Imobilizado | `imobilizado` | text |
| Loc.negócios | `loc_negocios` | text |
| Nº ID fiscal 1 | `id_fiscal_1` | text |
| Nº ID fiscal de IVA | `id_fiscal_iva` | text |
| Texto | `texto` | text |
| Atribuição | `atribuicao` | text |
| Centro de lucro | `centro_lucro` | text |
| Parcelamento Tributário | `parcelamento_tributario` | text |
| Texto cabeçalho documento | `texto_cabecalho_documento` | text |
| Bloqueio pgto. | `bloqueio_pagamento` | text |
| Montante em MI2 | `montante_mi2` | numeric |
| Montante em MI3 | `montante_mi3` | numeric |
| Condições pgto. | `condicoes_pagamento` | text |
| Data de entrada | `data_entrada` | date |
| Doc.faturamento | `doc_faturamento` | text |
| Fornecedor | `fornecedor` | text |
| Mot.estorno | `motivo_estorno` | text |
| Vencimento líquido | `vencimento_liquido` | date |
| Vencimento Original | `vencimento_original` | date |
| Parcela | `parcela` | text |

Datas vêm do Excel como serial numérico (mesmo tratamento já usado em ME5A/outros
imports: serial → ISO `YYYY-MM-DD`; string já formatada é aceita como está). Campos
monetários (`Mont.*`, `Montante *`) são convertidos para número (vírgula decimal
tratada, milhar removido), igual ao padrão de `numAt()` usado em `importZL0024Raw`.

**Chave natural** (não é constraint de banco, é usada só para validação/identificação
de linha nos logs de erro): `numero_documento + empresa + ano_mes + parcela`. Linha sem
`numero_documento` ou `empresa` é rejeitada e cai em `ignored_rows` do log.

**Status derivado** (calculado na tela, não armazenado): uma partida está "Em aberto"
quando `doc_compensacao` está vazio; "Compensado" caso contrário.

Migração SQL em `sql/criar_tabela_fbl1n_c_pagar.sql`, seguindo o padrão dos scripts
existentes (`criar_tabela_me3n_contratos.sql`, `criar_tabela_cidadeforn.sql`).

## Importação (`localDb.ts`)

- `FBL1N_COLUMNS`: array `{ header, field }[]` com os 43 mapeamentos acima.
- `importFBL1NRaw(rawRows, filename, onProgress)`:
  1. `reconcileSchema(headers, this.FBL1N_COLUMNS)` → `mappedFields`, `missingColumns`, `newColumns`.
  2. Exige colunas `numero_documento` e `empresa` mapeadas; senão lança erro (planilha rejeitada), igual ao guard de `material` em `importZL0024Raw`.
  3. Para cada linha: monta o objeto tipado (coerção de datas/números), linhas sem `numero_documento` ou `empresa` vão para `ignoredRows`.
  4. Conta registros atuais (`select count`), `delete().gte('id', 0)`, insere em lotes de 500 com `onProgress`.
  5. Grava `import_logs` com `type: 'FBL1N'`, `records_read`, `records_inserted`, `records_eliminated` (contagem anterior), `columns_missing`, `columns_new`, `ignored_rows`.
  6. `logActivity(..., 'Suprimentos', 'Importar Contas a Pagar', ...)`.

## UI — Importar SAP

Novo card em `AdminPanel.tsx`, aba `importar_sap`, mesmo padrão visual dos existentes
(dropzone, parsing CSV/XLSX inline, chamada a `localDb.importFBL1NRaw`):

> **Transação FBL1N (Contas a Pagar)**
> Substitui integralmente as partidas de contas a pagar anteriores — a última carga é
> sempre a mais atual.

## UI — Log Importação SAP

Sem mudança estrutural. Adiciona:
- `'FBL1N'` ao union type `SAPImportLog['type']` em `types.ts`.
- Um `case 'FBL1N'` no switch de label/cor do badge (~`AdminPanel.tsx:1602`), com label
  "Contas a Pagar (FBL1N)" e uma cor não usada pelos outros tipos.

## UI — Tela "Contas a Pagar"

Nova entrada de menu em `src/lib/pages.ts`:

```ts
{ id: 'sup_contas_pagar', group: 'SUPRIMENTOS', label: 'Contas a Pagar',
  path: '/suprimentos/contas-pagar', icon: Receipt,
  defaultRoles: ['admin', 'coordenador_suprimentos', 'comprador'] }
```

Novo componente `src/components/contaspagar/TabContasPagarLista.tsx` (montado por um
view simples `src/views/ContasPagar.tsx`, ou diretamente roteado se não houver
subabas — a decidir no plano de implementação), seguindo o padrão de
`TabContratosLista.tsx`:

- **Filtros**: fornecedor (texto, busca por `razao_social_fornecedor`/`fornecedor`),
  empresa, nº documento, status (Em aberto / Compensado / Todos), período (por
  `vencimento_liquido` ou `data_lancamento`, com seletor de qual campo).
- **KPIs** (`KpiCard`, mesmo componente já usado em Contratos): Total em aberto, Total
  vencido (vencimento líquido < hoje e ainda em aberto), Total do período filtrado.
- **Tabela** (`DataTable` — `TableShell`/`SortableTh`/`Tr`/`Td`/`TableFooter` já
  existentes): colunas Fornecedor, Nº Documento, Empresa, Data Lançamento, Vencimento
  Líquido, Valor (moeda + montante), Status, Doc.Compensação. Paginada (mesmo
  `PAGE_SIZE = 50` do padrão existente), ordenável por coluna.
- **Exportar para Excel**: reaproveita `XLSX.utils.json_to_sheet` / `writeFile`, mesmo
  padrão de `TabContratosLista.tsx`.

Dados vêm direto de `supabase.from('fbl1n_c_pagar').select(...)` (sem cache local em
`localDb`, já que a tabela é grande e volátil — mesmo racional de outras telas
read-heavy do projeto).

## Testes/verificação

- Importar uma planilha FBL1N de exemplo (ou mock de linhas) e conferir: contagem de
  registros lidos/inseridos/eliminados no log, tratamento de linha sem
  `numero_documento`, conversão correta de datas e valores monetários.
- Conferir que o card aparece em Importar SAP e o novo tipo aparece corretamente
  formatado no Log de Importação.
- Conferir que a tela Contas a Pagar filtra, pagina, soma KPIs corretamente e exporta
  Excel com as colunas visíveis.
