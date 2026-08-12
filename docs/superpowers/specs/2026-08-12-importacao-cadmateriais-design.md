# Importação CadMateriais — Catálogo SAP completo

## Contexto

O catálogo de materiais hoje (tabela `materials`, ~172 mil linhas) é alimentado por uma planilha SAP enxuta (`Material | Texto breve material | Texto longo do material | empresa`), via `parseMaterialsRows` (AdminPanel.tsx) + `importMaterials` (localDb.ts). Esse import faz upsert por `material_code` com desativação (soft delete) de códigos que sumiram da planilha.

Vai passar a existir uma exportação SAP completa (CadMateriais), com 452 mil linhas e ~27 colunas — inclui status/eliminação por material e por centro, classificação fiscal, tipo de material, grupo de mercadorias, texto longo, entre outras. Todas as linhas são do centro **TEN2**. Este documento especifica a extensão da tabela, o mapeamento de colunas e o fluxo de importação que a substitui.

O catálogo é consultado o tempo todo: tela Catálogo de Materiais (`buscar_materiais_catalogo` RPC) e busca de material em Nova Solicitação (`busca_materiais` RPC, via `MaterialSearchModal`/`lib/materiais.ts`), ambas com índices trigram já otimizados. Diferente de importações "foto de momento" sem tela de consulta (ex.: ZL0024/estoque), aqui a fluidez da busca durante e após o import importa.

## Escopo

- Estender a tabela `materials` com as colunas novas da planilha CadMateriais (migração aditiva, ver seção própria).
- Nova função `importCadMateriaisRaw` em `localDb.ts`, seguindo o padrão de substituição total já usado em `importZL0024Raw`/`importFBL1NRaw`: `DELETE` seguido de `INSERT` em lotes de 500.
- Novo módulo puro `src/lib/cadMateriais.ts` com o mapeamento de colunas e a lógica de parsing de linha, testável sem tocar Supabase (mesmo padrão de `src/lib/fbl1n.ts`).
- Troca do conteúdo da aba "Importação do Cadastro de Materiais SAP" do AdminPanel (hoje usa `parseMaterialsRows`/`processMaterialsFile`/`importMaterials`) para usar o novo parser e `importCadMateriaisRaw`, mantendo o fluxo de pré-visualização (10 primeiras linhas) + confirmação antes de disparar a importação — dado o tamanho e o caráter destrutivo (substituição total) da carga, essa confirmação explícita continua valendo a pena, mesmo não existindo nos cards mais simples da aba "Importar SAP".
- Log de importação (`import_logs`, novo tipo `CADMATERIAIS`) reaproveitando a UI de log já existente.
- **Fora de escopo:** telas novas de consulta às colunas SAP adicionais (status, classificação fiscal, etc.) — ficam gravadas na tabela para consulta futura, mas a tela de Catálogo continua mostrando só `material_code`, `description`, `technical_text`, `category`, `company`, `unit`, como hoje. Também fora de escopo qualquer mudança no export CSV de `Reports.tsx` (fetch client-side paginado de 1000 em 1000) — continua funcionando a 452k linhas, só mais lento; ação pontual sob clique, não afeta navegação normal.

## Decisões e trade-offs assumidos

- **Substituição total (delete + insert), não staging+swap.** Durante os ~15-30 min de reinserção de 452 mil linhas, a busca de materiais (Catálogo e Nova Solicitação) fica com resultados vazios/parciais. Avaliado contra a alternativa de staging+swap atômico (sem downtime, mais complexa); optou-se pela simplicidade e reuso do padrão já existente (ZL0024), aceitando a janela de degradação.
- **Migração aditiva (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), não `DROP TABLE`/recriação, e `id` permanece a chave primária sem mudança.** Descoberto durante o planejamento: a tabela `materials` tem uma view materializada dependente (`mv_material_sinais`, usada pela RPC `busca_materiais` que alimenta a busca de Nova Solicitação) e colunas geradas (`busca_texto`, `busca_desc`) que **não estão versionadas neste repositório** — só existem no banco de produção, criadas ad-hoc. Um `DROP TABLE ... CASCADE` (ou uma troca de chave primária) derrubaria ou invalidaria essas dependências sem haver SQL versionado para recriá-las, arriscando quebrar a busca de Nova Solicitação de forma não recuperável a partir do repo. A migração passa a ser só `ALTER TABLE ADD COLUMN` para as colunas novas, preservando `id`, `material_code`, `busca_desc`, `busca_texto`, a view materializada, RLS e todas as RPCs existentes intactas e sem nenhuma mudança de SQL nelas. `importCadMateriaisRaw` gera um `id` novo por linha do mesmo jeito que `importMaterials` faz hoje (`'m_' + Math.random().toString(36).substr(2, 9)`).
- **`category` continua calculada por `getAutoCategory(description)`** (regras de palavras-chave já existentes em `src/data/materials.ts`), aplicada no import — preserva o filtro fixo de categorias da tela Catálogo sem qualquer mudança de UI. As colunas reais de taxonomia SAP (`grupo_mercadoria_desc`, `denominacao`) ficam gravadas como metadado, não substituem esse filtro.
- **`company` fixo em `'TEN2'`** para todas as linhas importadas — a planilha não tem essa coluna e é 100% TEN2. A tabela hoje não tem registros reais de `'AG'` (confirmado), então a substituição total não perde dados de outra empresa.
- **`is_active` calculado a partir de `Eliminação` e `Elim.nv.Centro`**: `is_active = false` se qualquer uma das duas vier marcada (`'X'`, convenção padrão SAP para flags de eliminação), `true` caso contrário. Como a tela de Catálogo e a busca de Nova Solicitação já filtram por `is_active`, materiais eliminados/bloqueados somem das buscas sem nenhuma mudança de UI.
  - **Assunção a validar na implementação**: confirmar contra uma amostra real de linhas eliminadas da planilha que o valor marcado é de fato `'X'` (e não outro código). Se for diferente, ajustar a condição antes de rodar o import em produção.

## Mapeamento de colunas (planilha → tabela)

| Coluna da planilha | Campo na tabela | Tipo | Observação |
|---|---|---|---|
| Material | `material_code` | text | obrigatória — linha sem valor é ignorada |
| TxtBreveMaterial | `description` | text | |
| UMB | `unit` | text | |
| Cen. | `centro` | text (nova) | sempre `TEN2` na carga atual |
| Eliminação | `eliminacao` | text (nova) | usada para `is_active` |
| Elim.nv.Centro | `elim_nivel_centro` | text (nova) | usada para `is_active` |
| Status Geral | `status_geral` | text (nova) | |
| Status no Centro | `status_centro` | text (nova) | |
| Modif.por | `modificado_por` | text (nova) | |
| TMat | `tipo_material` | text (nova) | |
| Cód.controle | `codigo_controle` | text (nova) | |
| ItsMt | `categoria_item` | text (nova) | |
| S | `indicador_s` | text (nova) | campo bruto, significado não confirmado |
| GrpMercads. | `grupo_mercadoria_codigo` | text (nova) | |
| Criado | `criado_em` | date (nova) | formato dd/mm/aaaa na planilha |
| ÚltModif | `ultima_modificacao` | date (nova) | formato dd/mm/aaaa na planilha |
| Idioma | `idioma` | text (nova) | |
| País | `pais` | text (nova) | |
| ClFis | `classe_fiscal` | text (nova) | |
| U | `unidade_medida_alt` | text (nova) | |
| ClAv. | `classe_avaliacao` | text (nova) | |
| NºPF | `numero_pf` | text (nova) | |
| Denominação 2 do grupo de mercadorias | `grupo_mercadoria_desc` | text (nova) | |
| Denominação tp.material | `tipo_material_desc` | text (nova) | |
| Denominação | `denominacao` | text (nova) | |
| Mat.básico | `material_basico` | text (nova) | |
| TEXTO LONGO | `technical_text` | text (existente) | mesmo papel do campo já existente |
| — (calculado) | `category` | text (existente) | `getAutoCategory(description)` |
| — (fixo) | `company` | text (existente) | sempre `'TEN2'` |
| — (calculado) | `is_active` | boolean (existente) | `not (eliminacao = 'X' or elim_nivel_centro = 'X')` |

`Material` é a única coluna obrigatória (mesma regra de validação de linha usada em `importZL0024Raw`); demais colunas ausentes entram em `columns_missing` no log, sem impedir o import.

## Tabela `materials` (migração aditiva)

```sql
alter table public.materials
  add column if not exists centro                   text,
  add column if not exists eliminacao                text,
  add column if not exists elim_nivel_centro          text,
  add column if not exists status_geral               text,
  add column if not exists status_centro               text,
  add column if not exists modificado_por               text,
  add column if not exists tipo_material                 text,
  add column if not exists tipo_material_desc             text,
  add column if not exists codigo_controle                 text,
  add column if not exists categoria_item                   text,
  add column if not exists indicador_s                       text,
  add column if not exists grupo_mercadoria_codigo            text,
  add column if not exists grupo_mercadoria_desc               text,
  add column if not exists denominacao                          text,
  add column if not exists material_basico                       text,
  add column if not exists classe_fiscal                          text,
  add column if not exists unidade_medida_alt                      text,
  add column if not exists classe_avaliacao                         text,
  add column if not exists numero_pf                                 text,
  add column if not exists idioma                                     text,
  add column if not exists pais                                       text,
  add column if not exists criado_em                                   date,
  add column if not exists ultima_modificacao                           date,
  add column if not exists imported_at timestamptz not null default now();
```

Nenhuma coluna existente (`id`, `material_code`, `description`, `technical_text`, `category`, `company`, `unit`, `is_active`, `busca_desc`, `busca_texto`) é alterada, removida ou recriada — preserva a view materializada `mv_material_sinais`, os índices trigram já existentes e todas as RPCs (`buscar_materiais_catalogo`, `..._incluir_tecnico`, `busca_materiais`, `busca_materiais_apenas_descricao`) sem nenhuma mudança de código SQL.

Esta migração é **destrutiva o suficiente para exigir confirmação explícita antes de rodar em produção** (mesmo sendo só `ADD COLUMN`, toca a tabela mais consultada do sistema) — deve ser aplicada manualmente (SQL editor do Supabase ou `apply_migration`) com o usuário no comando, não de forma automática.

## Fluxo de importação (`importCadMateriaisRaw`)

Segue o mesmo formato de `importZL0024Raw`/`importFBL1NRaw`:

1. Recebe `rawRows` (array de arrays, primeira linha = headers) e `filename`.
2. `reconcileSchema(headers, CADMATERIAIS_COLUMNS)` → `mappedFields`, `missingColumns`, `newColumns`.
3. Valida presença da coluna `Material`; ausente → erro, planilha rejeitada.
4. Para cada linha, usa `mapCadMaterialRow` (novo módulo `src/lib/cadMateriais.ts`) para montar o registro mapeado. Linhas sem `Material` são ignoradas (`ignored_rows`). Datas (`Criado`, `ÚltModif`) convertidas de `dd/mm/aaaa` para ISO via `excelSerialToISO` (reaproveitado de `src/lib/fbl1n.ts`); se inválidas, gravadas como `null`.
   - `category = getAutoCategory(description)`.
   - `company = 'TEN2'`.
   - `is_active = !(isEliminado(eliminacao) || isEliminado(elim_nivel_centro))`, `isEliminado(v) = String(v ?? '').trim().toUpperCase() === 'X'`.
   - `id = 'm_' + Math.random().toString(36).substr(2, 9)`.
   - Deduplicação por `material_code` (última ocorrência prevalece), mesma regra do import atual de materiais — a própria exportação SAP pode repetir um código.
5. Conta o total atual de linhas em `materials` (para `records_eliminated` no log).
6. `DELETE FROM materials` (delete total) seguido de `INSERT` em lotes de 500, com callback de progresso.
7. Chama `refreshMaterialSinais()` (mesma chamada já feita após ME5A/ZL0132/ZL0024) para recalcular `mv_material_sinais` com o catálogo novo.
8. Monta e insere o log (`import_logs`, `type: 'CADMATERIAIS'`): `records_read`, `records_inserted`, `records_updated: 0`, `records_eliminated`, `columns_missing`, `columns_new`, `ignored_rows`.
9. Grava o log também no cache local (`importLogsKey`).
10. Chama `bumpDatasetVersion('materials', dbRows.length)` ao final, para o mecanismo de cache versionado (`otimizacao_egress.sql`) invalidar o carimbo e os clientes revalidarem.
11. `logActivity(...)` registrando a importação, mesmo padrão dos demais imports SAP.

## Módulo `src/lib/cadMateriais.ts` (novo, puro, testável)

```ts
export const CADMATERIAIS_COLUMNS: { header: string; field: string }[] = [
  { header: 'Material', field: 'material_code' },
  { header: 'TxtBreveMaterial', field: 'description' },
  { header: 'UMB', field: 'unit' },
  { header: 'Cen.', field: 'centro' },
  { header: 'Eliminação', field: 'eliminacao' },
  { header: 'Elim.nv.Centro', field: 'elim_nivel_centro' },
  { header: 'Status Geral', field: 'status_geral' },
  { header: 'Status no Centro', field: 'status_centro' },
  { header: 'Modif.por', field: 'modificado_por' },
  { header: 'TMat', field: 'tipo_material' },
  { header: 'Cód.controle', field: 'codigo_controle' },
  { header: 'ItsMt', field: 'categoria_item' },
  { header: 'S', field: 'indicador_s' },
  { header: 'GrpMercads.', field: 'grupo_mercadoria_codigo' },
  { header: 'Criado', field: 'criado_em' },
  { header: 'ÚltModif', field: 'ultima_modificacao' },
  { header: 'Idioma', field: 'idioma' },
  { header: 'País', field: 'pais' },
  { header: 'ClFis', field: 'classe_fiscal' },
  { header: 'U', field: 'unidade_medida_alt' },
  { header: 'ClAv.', field: 'classe_avaliacao' },
  { header: 'NºPF', field: 'numero_pf' },
  { header: 'Denominação 2 do grupo de mercadorias', field: 'grupo_mercadoria_desc' },
  { header: 'Denominação tp.material', field: 'tipo_material_desc' },
  { header: 'Denominação', field: 'denominacao' },
  { header: 'Mat.básico', field: 'material_basico' },
  { header: 'TEXTO LONGO', field: 'technical_text' },
];
```

- `isEliminado(value: string | null | undefined): boolean` — trim + uppercase + compara com `'X'`.
- `mapCadMaterialRow(headers, mappedFields, row): { record: Record<string, any> }` — mesmo padrão de `mapFbl1nRow`: percorre a linha, aplica `excelSerialToISO` nos campos de data (`criado_em`, `ultima_modificacao`), `String(val).trim() || null` nos demais.
- Datas: reaproveita `excelSerialToISO` de `src/lib/fbl1n.ts` (já trata serial do Excel e string pt-BR `dd/mm/aaaa`).

## Tipos (`types.ts`)

- Adicionar `'CADMATERIAIS'` ao union `SAPImportLog['type']`.
- `Material` (interface) ganha os campos opcionais novos (`centro?`, `status_geral?`, `codigo_controle?`, etc.) para os componentes que quiserem exibi-los futuramente — os campos hoje usados pela UI (`id`, `material_code`, `description`, `technical_text`, `category`, `company`, `unit`, `is_active`) não mudam de nome nem de tipo.

## UI (AdminPanel.tsx)

Na aba "Importação do Cadastro de Materiais SAP" (`activeTab === 'importar'`):
- Troca `parseMaterialsRows` por um parser que usa `CADMATERIAIS_COLUMNS`/`reconcileSchema` para gerar a pré-visualização (10 primeiras linhas com `material_code`, `description`, `category`, `unit`, `is_active`) — mantém a etapa de pré-visualização + botão "Confirmar Importação de Planilha" já existente, mas agora guardando `rawRows` completo (não uma lista já mapeada) para repassar a `importCadMateriaisRaw` na confirmação.
- Remove o dropdown/coluna de empresa da pré-visualização (sempre `TEN2`) e a constante `VALID_COMPANIES`.
- Texto de apoio explícito sobre a substituição total e a janela de indisponibilidade da busca durante o import: "Substitui integralmente o catálogo de materiais. Durante o processamento (pode levar de 15 a 30 minutos para o volume completo), a busca de materiais no Catálogo e em Nova Solicitação pode retornar resultados vazios ou incompletos."
- Resultado da importação passa a mostrar os campos de `SAPImportLog` (lidos/inseridos/eliminados/colunas ausentes), igual às demais importações SAP, no lugar do resumo atual de upsert (`read/inserted/updated/deactivated/syncFailed`).
- Na tabela de Logs SAP (`importar_sap_log`), adiciona cor de badge para `CADMATERIAIS`.

## Fora de escopo

- Tela de consulta às colunas SAP adicionais (status, classificação fiscal, tipo de material, etc.).
- Mudança no export CSV de `Reports.tsx`.
- Staging + swap atômico (avaliado, não escolhido — ver "Decisões e trade-offs assumidos").
- Troca de chave primária ou recriação da tabela `materials` (avaliado, descartado pelo risco de romper dependências não versionadas — ver "Decisões e trade-offs assumidos").
- Substituir `getAutoCategory` pela taxonomia real do SAP (`grupo_mercadoria_desc`/`denominacao`).
