# Importação CadMateriais — Catálogo SAP completo

## Contexto

O catálogo de materiais hoje (tabela `materials`, ~172 mil linhas) é alimentado por uma planilha SAP enxuta (`Material | Texto breve material | Texto longo do material | empresa`), via `parseMaterialsRows` (AdminPanel.tsx) + `importMaterials` (localDb.ts). Esse import faz upsert por `material_code` com desativação (soft delete) de códigos que sumiram da planilha.

Vai passar a existir uma exportação SAP completa (CadMateriais), com 452 mil linhas e ~27 colunas — inclui status/eliminação por material e por centro, classificação fiscal, tipo de material, grupo de mercadorias, texto longo, entre outras. Todas as linhas são do centro **TEN2**. Este documento especifica a nova tabela, o mapeamento de colunas e o fluxo de importação que a substitui.

O catálogo é consultado o tempo todo (tela Catálogo de Materiais e busca de material em Nova Solicitação, ambas via RPC server-side já otimizada com índices trigram — ver `buscar_materiais_catalogo.sql`). Diferente de importações "foto de momento" sem tela de consulta (ex.: ZL0024/estoque), aqui a fluidez da busca durante e após o import importa.

## Escopo

- Recriar a tabela `materials` com o schema completo da planilha CadMateriais (27 colunas mapeadas).
- Trocar a chave primária de `id` (uuid) para `material_code` (texto, já único) — remove uma indireção sem uso real, e o RPC continua devolvendo o mesmo campo `id` para o front sem nenhuma mudança em `Materials.tsx`/`MaterialSearchModal`/tipos.
- Nova função `importCadMateriaisRaw` em `localDb.ts`, seguindo o padrão de substituição total já usado em `importZL0024Raw`: `DELETE` seguido de `INSERT` em lotes de 500.
- Novo card de upload na aba "Importar SAP" do AdminPanel, no lugar do card atual de import de materiais (`parseMaterialsRows`/`processMaterialsFile`/`importMaterials`), que fica obsoleto e é removido.
- Log de importação (`import_logs`, novo tipo `CADMATERIAIS`) reaproveitando a UI de log já existente.
- **Fora de escopo:** telas novas de consulta às colunas SAP adicionais (status, classificação fiscal, etc.) — ficam gravadas na tabela para consulta futura, mas a tela de Catálogo continua mostrando só `material_code`, `description`, `technical_text`, `category`, `company`, `unit`, como hoje. Também fora de escopo qualquer mudança no export CSV de `Reports.tsx` (fetch client-side paginado de 1000 em 1000) — continua funcionando a 452k linhas, só mais lento; ação pontual sob clique, não afeta navegação normal.

## Decisões e trade-offs assumidos

- **Substituição total (delete + insert), não staging+swap.** Durante os ~15-30 min de reinserção de 452 mil linhas, a busca de materiais (Catálogo e Nova Solicitação) fica com resultados vazios/parciais. Avaliado contra a alternativa de staging+swap atômico (sem downtime, mais complexa); optou-se pela simplicidade e reuso do padrão já existente (ZL0024), aceitando a janela de degradação.
- **`material_code` como chave primária**, substituindo o `id` (uuid) surrogate atual. Simplificação segura: `material_code` já era `unique` e é o identificador natural; o RPC `buscar_materiais_catalogo` já devolve uma coluna `id` — passa a devolver `material_code::text as id`, então nenhum consumidor do front precisa mudar.
- **`category` continua calculada por `getAutoCategory(description)`** (regras de palavras-chave já existentes em `src/data/materials.ts`), aplicada no client durante o parse da planilha — preserva o filtro fixo de categorias da tela Catálogo sem qualquer mudança de UI. As colunas reais de taxonomia SAP (`grupo_mercadoria_desc`, `denominacao`) ficam gravadas como metadado, não substituem esse filtro.
- **`company` fixo em `'TEN2'`** para todas as linhas importadas — a planilha não tem essa coluna e é 100% TEN2. A tabela hoje não tem registros reais de `'AG'` (confirmado), então a substituição total não perde dados de outra empresa.
- **`is_active` calculado a partir de `Eliminação` e `Elim.nv.Centro`**: `is_active = false` se qualquer uma das duas vier marcada (`'X'`, convenção padrão SAP para flags de eliminação), `true` caso contrário. Como a tela de Catálogo e a busca de Nova Solicitação já filtram por `is_active`, materiais eliminados/bloqueados somem das buscas sem nenhuma mudança de UI.
  - **Assunção a validar na implementação**: confirmar contra uma amostra real de linhas eliminadas da planilha que o valor marcado é de fato `'X'` (e não outro código). Se for diferente, ajustar a condição antes de rodar o import em produção.

## Mapeamento de colunas (planilha → tabela)

| Coluna da planilha | Campo na tabela | Tipo | Observação |
|---|---|---|---|
| Material | `material_code` | text (PK) | obrigatória — linha sem valor é ignorada |
| TxtBreveMaterial | `description` | text | |
| UMB | `unit` | text | |
| Cen. | `centro` | text | sempre `TEN2` na carga atual |
| Eliminação | `eliminacao` | text | usada para `is_active` |
| Elim.nv.Centro | `elim_nivel_centro` | text | usada para `is_active` |
| Status Geral | `status_geral` | text | |
| Status no Centro | `status_centro` | text | |
| Modif.por | `modificado_por` | text | |
| TMat | `tipo_material` | text | |
| Cód.controle | `codigo_controle` | text | |
| ItsMt | `categoria_item` | text | |
| S | `indicador_s` | text | campo bruto, significado não confirmado |
| GrpMercads. | `grupo_mercadoria_codigo` | text | |
| Criado | `criado_em` | date | formato dd/mm/aaaa na planilha |
| ÚltModif | `ultima_modificacao` | date | formato dd/mm/aaaa na planilha |
| Idioma | `idioma` | text | |
| País | `pais` | text | |
| ClFis | `classe_fiscal` | text | |
| U | `unidade_medida_alt` | text | |
| ClAv. | `classe_avaliacao` | text | |
| NºPF | `numero_pf` | text | |
| Denominação 2 do grupo de mercadorias | `grupo_mercadoria_desc` | text | |
| Denominação tp.material | `tipo_material_desc` | text | |
| Denominação | `denominacao` | text | |
| Mat.básico | `material_basico` | text | |
| TEXTO LONGO | `technical_text` | text | mesmo papel do campo já existente |
| — (calculado) | `category` | text | `getAutoCategory(description)` |
| — (fixo) | `company` | text | sempre `'TEN2'` |
| — (calculado) | `is_active` | boolean | `not (eliminacao = 'X' or elim_nivel_centro = 'X')` |

`Material` é a única coluna obrigatória (mesma regra de validação de linha usada em `importZL0024Raw`); demais colunas ausentes entram em `columns_missing` no log, sem impedir o import.

## Tabela `materials` (nova definição)

```sql
drop table if exists public.materials cascade;

create table public.materials (
  material_code           text primary key,
  description              text not null,
  technical_text            text,
  category                  text,
  company                   text not null default 'TEN2',
  unit                      text,
  centro                    text,
  eliminacao                text,
  elim_nivel_centro          text,
  status_geral               text,
  status_centro              text,
  modificado_por             text,
  tipo_material              text,
  tipo_material_desc          text,
  codigo_controle             text,
  categoria_item              text,
  indicador_s                 text,
  grupo_mercadoria_codigo      text,
  grupo_mercadoria_desc        text,
  denominacao                  text,
  material_basico               text,
  classe_fiscal                  text,
  unidade_medida_alt              text,
  classe_avaliacao                text,
  numero_pf                        text,
  idioma                            text,
  pais                              text,
  criado_em                         date,
  ultima_modificacao                 date,
  is_active                          boolean not null default true,
  busca_desc   text generated always as (f_unaccent(upper(description))) stored,
  busca_texto  text generated always as (f_unaccent(upper(description || ' ' || coalesce(technical_text, '')))) stored,
  imported_at                          timestamptz not null default now()
);

create index materials_busca_desc_trgm  on public.materials using gin (busca_desc gin_trgm_ops);
create index materials_busca_texto_trgm on public.materials using gin (busca_texto gin_trgm_ops);
create index materials_code_trgm        on public.materials using gin (material_code gin_trgm_ops);
create index materials_category_idx     on public.materials (category) where is_active;
create index materials_company_idx      on public.materials (company) where is_active;

alter table public.materials enable row level security;

create policy materials_read on public.materials
  for select to authenticated using (true);

create policy materials_write on public.materials
  for all to authenticated using (
    has_role('admin') or has_role('coordenador_suprimentos') or has_role('comprador')
  );
```

Isso formaliza em SQL versionado as colunas geradas `busca_desc`/`busca_texto` e os índices trigram que hoje existem só ad-hoc no banco (não rastreados no repo) — ficam recriados do zero junto com a tabela.

O RPC `buscar_materiais_catalogo` (e as variantes `..._incluir_tecnico`, `busca_materiais_apenas_descricao`) não precisam mudar: continuam referenciando `materials` pelo nome e pelas mesmas colunas (`id`, `material_code`, `description`, `technical_text`, `category`, `company`, `unit`, `busca_desc`, `busca_texto`, `is_active`) — só que agora `id` é devolvido como `m.material_code::text as id` no lugar do surrogate antigo.

## Fluxo de importação (`importCadMateriaisRaw`)

Segue o mesmo formato de `importZL0024Raw`:

1. Recebe `rawRows` (array de arrays, primeira linha = headers) e `filename`.
2. `reconcileSchema(headers, this.CADMATERIAIS_COLUMNS)` → `mappedFields`, `missingColumns`, `newColumns`.
3. Valida presença da coluna `Material`; ausente → erro, planilha rejeitada.
4. Para cada linha: monta o registro mapeado (tabela acima). Linhas sem `Material` são ignoradas (`ignored_rows`). Datas (`Criado`, `ÚltModif`) convertidas de `dd/mm/aaaa` para ISO; se inválidas, gravadas como `null`.
   - `category = getAutoCategory(description)`.
   - `company = 'TEN2'`.
   - `is_active = !(eliminacao === 'X' || elim_nivel_centro === 'X')`.
   - Deduplicação por `material_code` (última ocorrência prevalece), mesma regra do import atual de materiais — a própria exportação SAP pode repetir um código.
5. Conta o total atual de linhas em `materials` (para `records_eliminated` no log).
6. `DELETE FROM materials` (delete total) seguido de `INSERT` em lotes de 500, com callback de progresso.
7. Monta e insere o log (`import_logs`, `type: 'CADMATERIAIS'`): `records_read`, `records_inserted`, `records_updated: 0`, `records_eliminated`, `columns_missing`, `columns_new`, `ignored_rows`.
8. Grava o log também no cache local (`importLogsKey`).
9. Chama `bump_dataset_version('materials', ...)` ao final, para o mecanismo de cache versionado (`otimizacao_egress.sql`) invalidar o carimbo e os clientes revalidarem.

## Tipos (`types.ts`)

- Adicionar `'CADMATERIAIS'` ao union `SAPImportLog['type']`.
- `Material` (interface) ganha os campos opcionais novos (`centro?`, `status_geral?`, `codigo_controle?`, etc.) para os componentes que quiserem exibi-los futuramente — os campos hoje usados pela UI (`material_code`, `description`, `technical_text`, `category`, `company`, `unit`, `is_active`) não mudam de nome nem de tipo.

## UI (AdminPanel.tsx)

Na aba "Importar SAP":
- Remove o card de upload de materiais atual (`processMaterialsFile`/`parseMaterialsRows`/`importMaterials` ficam obsoletos e são removidos).
- Adiciona o card "Catálogo de Materiais (CadMateriais)": mesmo padrão de leitura de arquivo (xlsx/xls via `XLSX.utils.sheet_to_json`, csv via split por `;`), chamando `localDb.importCadMateriaisRaw(rawRows, file.name, setSapProgress)`.
- Texto de apoio explícito sobre a substituição total e a janela de indisponibilidade da busca durante o import: "Substitui integralmente o catálogo de materiais. Durante o processamento (pode levar de 15 a 30 minutos para o volume completo), a busca de materiais no Catálogo e em Nova Solicitação pode retornar resultados vazios ou incompletos."
- Na tabela de Logs SAP, adiciona cor de badge para `CADMATERIAIS`.

## Fora de escopo

- Tela de consulta às colunas SAP adicionais (status, classificação fiscal, tipo de material, etc.).
- Mudança no export CSV de `Reports.tsx`.
- Staging + swap atômico (avaliado, não escolhido — ver "Decisões e trade-offs assumidos").
- Substituir `getAutoCategory` pela taxonomia real do SAP (`grupo_mercadoria_desc`/`denominacao`).
