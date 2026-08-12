# Importação CadMateriais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a importação do catálogo de materiais SAP (tabela `materials`) por uma versão que aceita a exportação completa "CadMateriais" (452 mil linhas, 27 colunas), preservando a busca (Catálogo + Nova Solicitação) já otimizada com índices trigram e sem quebrar a view materializada `mv_material_sinais` não versionada no repo.

**Architecture:** Migração aditiva em SQL (`ALTER TABLE ADD COLUMN`, sem tocar `id`/PK nem colunas existentes) + um módulo puro `src/lib/cadMateriais.ts` (mapeamento de colunas e parsing de linha, testável sem Supabase, no molde de `src/lib/fbl1n.ts`) + uma função `importCadMateriaisRaw` em `localDb.ts` que segue o padrão de substituição total já usado em `importZL0024Raw`/`importFBL1NRaw` (delete total + insert em lotes de 500) + troca do conteúdo da aba de import de materiais no AdminPanel para usar o novo parser/import, mantendo a etapa de pré-visualização + confirmação.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres 17), `xlsx` (SheetJS) para parse client-side, Vitest para testes.

## Global Constraints

- Não remover nem renomear as colunas existentes de `materials` (`id`, `material_code`, `description`, `technical_text`, `category`, `company`, `unit`, `is_active`, `busca_desc`, `busca_texto`) — preserva `mv_material_sinais` e as RPCs `buscar_materiais_catalogo`, `..._incluir_tecnico`, `busca_materiais`, `busca_materiais_apenas_descricao` sem alteração.
- `category` continua calculada por `getAutoCategory(description)` (de `src/data/materials.ts`); `company` é sempre `'TEN2'` nesta importação.
- `is_active = false` quando `Eliminação` ou `Elim.nv.Centro` vier marcada com `'X'` (case-insensitive, trim); `true` caso contrário.
- A migração SQL (`ALTER TABLE`) é aplicada manualmente contra o Supabase (SQL editor ou `apply_migration`), nunca automaticamente — é a tabela mais consultada do sistema.
- Import por substituição total (delete + insert): durante o processamento, a busca de materiais pode retornar resultados vazios/parciais — comportamento aceito e documentado no spec, não é bug.

---

### Task 1: Migração SQL — colunas novas em `materials`

**Files:**
- Create: `db/sql/alters/cadmateriais_colunas_materials.sql`

**Interfaces:**
- Produces: as colunas `centro, eliminacao, elim_nivel_centro, status_geral, status_centro, modificado_por, tipo_material, tipo_material_desc, codigo_controle, categoria_item, indicador_s, grupo_mercadoria_codigo, grupo_mercadoria_desc, denominacao, material_basico, classe_fiscal, unidade_medida_alt, classe_avaliacao, numero_pf, idioma, pais, criado_em, ultima_modificacao, imported_at` na tabela `public.materials`, todas nullable exceto `imported_at` — usadas pela Task 4 (`importCadMateriaisRaw`).

- [ ] **Step 1: Escrever o arquivo de migração**

```sql
-- Estende materials com as colunas da exportação SAP completa "CadMateriais"
-- (452 mil linhas, ~27 colunas). Migração ADITIVA por design — ver
-- docs/superpowers/specs/2026-08-12-importacao-cadmateriais-design.md,
-- seção "Decisões e trade-offs assumidos": um DROP TABLE/troca de PK
-- arriscaria quebrar a view materializada mv_material_sinais e as colunas
-- geradas busca_desc/busca_texto, que não estão versionadas neste repo.
--
-- Nenhuma coluna existente é tocada. id, material_code, description,
-- technical_text, category, company, unit, is_active, busca_desc,
-- busca_texto permanecem exatamente como estão.

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

- [ ] **Step 2: Commit**

```bash
git add db/sql/alters/cadmateriais_colunas_materials.sql
git commit -m "feat: migração aditiva de colunas CadMateriais em materials"
```

**Não rode este SQL contra o Supabase ainda** — isso é feito manualmente, com confirmação explícita do usuário, depois que o código das próximas tasks estiver pronto e revisado (ver Task 6).

---

### Task 2: Módulo puro `src/lib/cadMateriais.ts` (mapeamento e parsing)

**Files:**
- Create: `src/lib/cadMateriais.ts`
- Test: `src/lib/cadMateriais.test.ts`

**Interfaces:**
- Consumes: `excelSerialToISO` de `src/lib/fbl1n.ts` (assinatura: `(val: unknown) => string | null`).
- Produces: `CADMATERIAIS_COLUMNS: { header: string; field: string }[]`, `isEliminado(value: unknown): boolean`, `mapCadMaterialRow(headers: string[], mappedFields: (string | null)[], row: any[]): { record: Record<string, any>; camposExtras: Record<string, any> }` — usados pela Task 4 (`importCadMateriaisRaw` em `localDb.ts`) e pela Task 5 (pré-visualização no `AdminPanel.tsx`).

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
// src/lib/cadMateriais.test.ts
import { describe, expect, it } from 'vitest';
import { CADMATERIAIS_COLUMNS, isEliminado, mapCadMaterialRow } from './cadMateriais';

describe('CADMATERIAIS_COLUMNS', () => {
  it('tem as 27 colunas da exportação SAP, na ordem da planilha', () => {
    expect(CADMATERIAIS_COLUMNS).toHaveLength(27);
    expect(CADMATERIAIS_COLUMNS[0]).toEqual({ header: 'Material', field: 'material_code' });
    expect(CADMATERIAIS_COLUMNS[1]).toEqual({ header: 'TxtBreveMaterial', field: 'description' });
    expect(CADMATERIAIS_COLUMNS[25]).toEqual({ header: 'Mat.básico', field: 'material_basico' });
    expect(CADMATERIAIS_COLUMNS[26]).toEqual({ header: 'TEXTO LONGO', field: 'technical_text' });
  });

  it('mapeia Eliminação e Elim.nv.Centro', () => {
    expect(CADMATERIAIS_COLUMNS.find(c => c.header === 'Eliminação')?.field).toBe('eliminacao');
    expect(CADMATERIAIS_COLUMNS.find(c => c.header === 'Elim.nv.Centro')?.field).toBe('elim_nivel_centro');
  });
});

describe('isEliminado', () => {
  it('reconhece X maiúsculo como eliminado', () => {
    expect(isEliminado('X')).toBe(true);
  });

  it('reconhece x minúsculo e com espaços como eliminado', () => {
    expect(isEliminado(' x ')).toBe(true);
  });

  it('trata vazio, null e undefined como não eliminado', () => {
    expect(isEliminado('')).toBe(false);
    expect(isEliminado(null)).toBe(false);
    expect(isEliminado(undefined)).toBe(false);
  });

  it('trata qualquer outro valor como não eliminado', () => {
    expect(isEliminado('Z1')).toBe(false);
  });
});

describe('mapCadMaterialRow', () => {
  const headers = CADMATERIAIS_COLUMNS.map(c => c.header);
  const mappedFields = CADMATERIAIS_COLUMNS.map(c => c.field);

  it('mapeia uma linha real da planilha (material não eliminado, sem NºPF/ClFis)', () => {
    const row = [
      '100000000000000110', 'SETOR DE MARCO DE PORTA DE AÇO', 'UN', 'TEN2', '', '',
      'Z1', '', 'SFLORET', 'ZENG', '7308.30.00', 'NORM', 'Z', 'B2908',
      '02/02/2015', '17/05/2025', 'PT', 'BR', '', '2', '1107', '',
      'PORTA E JANELA', 'Materiais Engenharia', 'Forros e divisorias', '', '',
    ];

    const { record } = mapCadMaterialRow(headers, mappedFields, row);

    expect(record.material_code).toBe('100000000000000110');
    expect(record.description).toBe('SETOR DE MARCO DE PORTA DE AÇO');
    expect(record.unit).toBe('UN');
    expect(record.centro).toBe('TEN2');
    expect(record.eliminacao).toBeNull();
    expect(record.elim_nivel_centro).toBeNull();
    expect(record.status_geral).toBe('Z1');
    expect(record.grupo_mercadoria_codigo).toBe('B2908');
    expect(record.criado_em).toBe('2015-02-02');
    expect(record.ultima_modificacao).toBe('2025-05-17');
    expect(record.numero_pf).toBeNull();
    expect(record.classe_fiscal).toBeNull();
    expect(record.denominacao).toBe('Forros e divisorias');
    expect(record.material_basico).toBeNull();
    expect(record.technical_text).toBeNull();
  });

  it('mapeia uma linha real da planilha com TEXTO LONGO preenchido', () => {
    const row = [
      '100000000000000138', 'SIST. CALANDRAGEM VIROLAS MCB 3060WT', 'UN', 'TEN2', '', '',
      'Z1', '', 'SFLORET', 'ZENG', '8462.29.00', 'NORM', 'A', 'B2114',
      '09/02/2015', '17/05/2025', 'PT', 'BR', '1', '3', '1051', '21440058',
      'MAQUINA PARA CORTE E DOBRA DE ACO', 'Materiais Engenharia', 'Equipamentos/acessorios d', '',
      'SISTEMA DE CALANDRAGEM PARA VIROLAS MODELO MCB 3060WT -TEN02',
    ];

    const { record } = mapCadMaterialRow(headers, mappedFields, row);

    expect(record.material_code).toBe('100000000000000138');
    expect(record.classe_fiscal).toBe('1');
    expect(record.numero_pf).toBe('21440058');
    expect(record.technical_text).toBe('SISTEMA DE CALANDRAGEM PARA VIROLAS MODELO MCB 3060WT -TEN02');
    expect(record.criado_em).toBe('2015-02-09');
  });

  it('joga coluna desconhecida em camposExtras', () => {
    const { camposExtras } = mapCadMaterialRow(
      ['Material', 'Coluna Nova'],
      ['material_code', null],
      ['123', 'valor qualquer'],
    );
    expect(camposExtras).toEqual({ 'Coluna Nova': 'valor qualquer' });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/cadMateriais.test.ts`
Expected: FAIL — `Cannot find module './cadMateriais'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar o módulo**

```ts
// src/lib/cadMateriais.ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mapeamento puro das colunas da exportação SAP "CadMateriais" (cadastro
 * completo de materiais, ~27 colunas) para os campos da tabela `materials`.
 * Separado de `localDb.ts` no mesmo molde de `src/lib/fbl1n.ts`: testar o
 * mapeamento isoladamente, sem tocar Supabase, é mais barato que testar via
 * importCadMateriaisRaw.
 */

import { excelSerialToISO } from './fbl1n';

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

const DATE_FIELDS = new Set(['criado_em', 'ultima_modificacao']);

/** Convenção SAP para flags de eliminação/bloqueio: célula marcada com 'X'
 *  (maiúscula ou minúscula, com espaços). Qualquer outro valor — incluindo
 *  vazio — não é eliminado. */
export function isEliminado(value: unknown): boolean {
  return String(value ?? '').trim().toUpperCase() === 'X';
}

/** Aplica o mapeamento de colunas a uma linha crua da planilha. Colunas sem
 *  campo conhecido (mappedFields[i] === null) vão para camposExtras, nunca
 *  são descartadas — mesmo comportamento de mapFbl1nRow. */
export function mapCadMaterialRow(
  headers: string[],
  mappedFields: (string | null)[],
  row: any[],
): { record: Record<string, any>; camposExtras: Record<string, any> } {
  const record: Record<string, any> = {};
  const camposExtras: Record<string, any> = {};

  row.forEach((val, colIdx) => {
    const field = mappedFields[colIdx];
    const header = headers[colIdx];
    if (field) {
      if (DATE_FIELDS.has(field)) {
        record[field] = excelSerialToISO(val);
      } else {
        const s = val === null || val === undefined ? '' : String(val).trim();
        record[field] = s || null;
      }
    } else if (header) {
      camposExtras[header] = val;
    }
  });

  return { record, camposExtras };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/cadMateriais.test.ts`
Expected: PASS (todos os testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cadMateriais.ts src/lib/cadMateriais.test.ts
git commit -m "feat: módulo puro de mapeamento CadMateriais (colunas SAP -> materials)"
```

---

### Task 3: Tipos — `SAPImportLog` e `Material`

**Files:**
- Modify: `src/types.ts:88-98` (interface `Material`)
- Modify: `src/types.ts:380-397` (interface `SAPImportLog`)

**Interfaces:**
- Consumes: nenhuma (mudança de tipos apenas).
- Produces: `SAPImportLog['type']` passa a incluir `'CADMATERIAIS'`; `Material` ganha campos opcionais novos usados pela Task 4/5.

- [ ] **Step 1: Adicionar `'CADMATERIAIS'` ao union de `SAPImportLog['type']`**

Em `src/types.ts:382`, trocar:

```ts
  type: 'ME5A' | 'ZL0132' | 'PEDIDOSFORN' | 'CONTATOS' | 'ZL0024' | 'ME3N' | 'ME3M' | 'FBL1N';
```

por:

```ts
  type: 'ME5A' | 'ZL0132' | 'PEDIDOSFORN' | 'CONTATOS' | 'ZL0024' | 'ME3N' | 'ME3M' | 'FBL1N' | 'CADMATERIAIS';
```

- [ ] **Step 2: Estender a interface `Material` com os campos opcionais novos**

Em `src/types.ts:88-98`, trocar:

```ts
export interface Material {
  id: string;
  material_code: string; // 8 digits
  description: string;
  technical_text?: string;
  category: string;
  company: 'TEN2' | 'AG' | 'AMBAS';
  unit: string; // UN, KG, M, L, M2, etc.
  is_active: boolean;
  created_at: string;
}
```

por:

```ts
export interface Material {
  id: string;
  material_code: string; // 8 digits
  description: string;
  technical_text?: string;
  category: string;
  company: 'TEN2' | 'AG' | 'AMBAS';
  unit: string; // UN, KG, M, L, M2, etc.
  is_active: boolean;
  created_at: string;
  // Campos da exportação SAP completa "CadMateriais" — opcionais porque a
  // RPC de busca (buscar_materiais_catalogo) não os devolve hoje; ficam
  // disponíveis para telas futuras que consultem materials diretamente.
  centro?: string;
  eliminacao?: string;
  elim_nivel_centro?: string;
  status_geral?: string;
  status_centro?: string;
  modificado_por?: string;
  tipo_material?: string;
  tipo_material_desc?: string;
  codigo_controle?: string;
  categoria_item?: string;
  indicador_s?: string;
  grupo_mercadoria_codigo?: string;
  grupo_mercadoria_desc?: string;
  denominacao?: string;
  material_basico?: string;
  classe_fiscal?: string;
  unidade_medida_alt?: string;
  classe_avaliacao?: string;
  numero_pf?: string;
  idioma?: string;
  pais?: string;
  criado_em?: string;
  ultima_modificacao?: string;
}
```

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: sem novos erros de tipo (os campos são todos opcionais, não quebram nenhum uso existente de `Material`).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: tipos para importação CadMateriais (SAPImportLog + Material)"
```

---

### Task 4: `importCadMateriaisRaw` em `localDb.ts`

**Files:**
- Modify: `src/db/localDb.ts` (import no topo do arquivo, junto de `FBL1N_COLUMNS, mapFbl1nRow`; novo método público perto de `importFBL1NRaw`, por volta da linha 5469-5563)

**Interfaces:**
- Consumes: `CADMATERIAIS_COLUMNS`, `isEliminado`, `mapCadMaterialRow` de `../lib/cadMateriais` (Task 2); `getAutoCategory` de `../data/materials` (já importado no arquivo); `this.reconcileSchema`, `this.getCurrentUser`, `this.getStorageItem`, `this.setStorageItem`, `this.bumpDatasetVersion`, `this.logActivity`, `this.refreshMaterialSinais` (métodos privados/públicos já existentes na classe); `SAPImportLog` de `../types`.
- Produces: `public async importCadMateriaisRaw(rawRows: any[][], filename: string, onProgress?: (percent: number) => void): Promise<SAPImportLog>` — consumido pela Task 5 (`AdminPanel.tsx`).

- [ ] **Step 1: Adicionar o import do novo módulo no topo de `localDb.ts`**

Logo abaixo da linha `import { FBL1N_COLUMNS, mapFbl1nRow } from '../lib/fbl1n';` (linha 25), adicionar:

```ts
import { CADMATERIAIS_COLUMNS, isEliminado, mapCadMaterialRow } from '../lib/cadMateriais';
```

- [ ] **Step 2: Adicionar o método `importCadMateriaisRaw`**

Inserir logo após o fechamento do método `importFBL1NRaw` (depois da linha 5563, antes do comentário `// Contratos (ME3N): upsert por...`):

```ts
  // Cadastro de Materiais SAP (CadMateriais): assim como ZL0024/FBL1N, é uma
  // exportação completa (foto do cadastro) — não um incremental. Cada carga
  // substitui integralmente o catálogo anterior. Diferente das outras cargas
  // "foto", esta tabela é consultada o tempo todo (Catálogo de Materiais e
  // busca de Nova Solicitação), então a janela de substituição é uma
  // degradação real da busca, não apenas uma tabela sem tela de consulta —
  // ver docs/superpowers/specs/2026-08-12-importacao-cadmateriais-design.md.
  public async importCadMateriaisRaw(rawRows: any[][], filename: string, onProgress?: (percent: number) => void): Promise<SAPImportLog> {
    if (rawRows.length < 2) {
      throw new Error('Formato rejeitado: Linhas insuficientes no arquivo.');
    }
    onProgress?.(0);

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''));

    const { mappedFields, missingColumns, newColumns } = this.reconcileSchema(headers, CADMATERIAIS_COLUMNS);

    if (!mappedFields.includes('material_code')) {
      throw new Error('Formato rejeitado: Coluna obrigatória "Material" não encontrada.');
    }

    const user = this.getCurrentUser();
    const dbRows: any[] = [];
    const ignoredRows: any[] = [];
    // Deduplica por material_code (última ocorrência prevalece) — a própria
    // exportação SAP pode repetir um código, e duas linhas iguais na mesma
    // leva de insert violariam a constraint de unicidade.
    const indexByCode = new Map<string, number>();

    dataRows.forEach((row, index) => {
      const fileRowIndex = index + 2;
      const { record } = mapCadMaterialRow(headers, mappedFields, row);

      if (!record.material_code) {
        ignoredRows.push({
          row: fileRowIndex,
          identifier: 'N/A',
          reason: 'Material vazio.'
        });
        return;
      }

      const dbRow = {
        ...record,
        category: getAutoCategory(record.description || ''),
        company: 'TEN2',
        is_active: !(isEliminado(record.eliminacao) || isEliminado(record.elim_nivel_centro)),
        id: 'm_' + Math.random().toString(36).substr(2, 9),
        imported_at: new Date().toISOString()
      };

      const existingIdx = indexByCode.get(dbRow.material_code);
      if (existingIdx !== undefined) {
        dbRows[existingIdx] = dbRow;
      } else {
        indexByCode.set(dbRow.material_code, dbRows.length);
        dbRows.push(dbRow);
      }
    });

    onProgress?.(10);

    try {
      const { count: previousCount } = await supabase
        .from('materials')
        .select('id', { count: 'exact', head: true });

      const { error: deleteError } = await supabase.from('materials').delete().neq('material_code', '');
      if (deleteError) throw deleteError;
      onProgress?.(20);

      const totalBatches = Math.ceil(dbRows.length / 500) || 1;
      for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('materials').insert(dbRows.slice(i, i + 500));
        if (error) throw error;
        const batchIndex = Math.floor(i / 500) + 1;
        onProgress?.(20 + Math.round((batchIndex / totalBatches) * 70));
      }

      const logId = 'il_' + Math.random().toString(36).substr(2, 9);
      const logObj = {
        id: logId,
        type: 'CADMATERIAIS',
        user_name: user?.name || 'Sistema',
        filename,
        records_read: dataRows.length,
        records_inserted: dbRows.length,
        records_updated: 0,
        records_unchanged: 0,
        records_eliminated: previousCount || 0,
        columns_missing: missingColumns,
        columns_new: newColumns,
        quantity_changes: [],
        missing_ris: [],
        ignored_rows: ignoredRows,
        created_at: new Date().toISOString()
      };

      await this.refreshMaterialSinais();
      await supabase.from('import_logs').insert(logObj);
      onProgress?.(95);

      const logs = this.getStorageItem<SAPImportLog[]>(this.importLogsKey, []);
      logs.unshift(logObj as any);
      this.setStorageItem(this.importLogsKey, logs);

      await this.bumpDatasetVersion('materials', dbRows.length);

      this.logActivity(user?.id || 'sistema', 'Suprimentos', 'Importar Catálogo de Materiais', `Importou catálogo de materiais CadMateriais (${filename}). Lidos: ${dataRows.length}, substituídos: ${previousCount || 0}, novos: ${dbRows.length}.`);

      onProgress?.(100);
      return logObj as any;
    } catch (e) {
      console.error('Erro ao salvar importação do catálogo de materiais (CadMateriais) no Supabase:', e);
      throw e;
    }
  }
```

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add src/db/localDb.ts
git commit -m "feat: importCadMateriaisRaw — substituição total do catálogo via planilha CadMateriais"
```

---

### Task 5: `AdminPanel.tsx` — trocar o import de materiais

**Files:**
- Modify: `src/views/AdminPanel.tsx:6-20` (imports)
- Modify: `src/views/AdminPanel.tsx:44-49` (estado do importador)
- Modify: `src/views/AdminPanel.tsx:275-403` (parsing, handlers, `handleBulkImport`)
- Modify: `src/views/AdminPanel.tsx:838-928` (JSX da aba "Importação do Cadastro de Materiais SAP")

**Interfaces:**
- Consumes: `CADMATERIAIS_COLUMNS` de `../lib/cadMateriais` (Task 2); `localDb.importCadMateriaisRaw(rawRows, filename, onProgress)` (Task 4); `Material`, `SAPImportLog` de `../types` (Task 3).
- Produces: nenhuma (é a ponta de UI, task final da cadeia).

- [ ] **Step 1: Atualizar os imports do arquivo**

Em `src/views/AdminPanel.tsx:14-16`, trocar:

```ts
import { localDb } from '../db/localDb';
import { getAutoCategory } from '../data/materials';
import { Profile, Sector, Material, FeedbackReport } from '../types';
```

por:

```ts
import { localDb } from '../db/localDb';
import { CADMATERIAIS_COLUMNS } from '../lib/cadMateriais';
import { Profile, Sector, Material, FeedbackReport, SAPImportLog } from '../types';
```

(`getAutoCategory` deixa de ser usado neste arquivo — a categoria agora é calculada dentro de `importCadMateriaisRaw`, em `localDb.ts`. Se o build acusar import não utilizado em outro ponto do arquivo, é sinal de que sobrou um uso de `parseMaterialsRows`/`getAutoCategory` fora dos trechos listados aqui — remova-o também.)

- [ ] **Step 2: Trocar o estado do importador**

Em `src/views/AdminPanel.tsx:44-49`, trocar:

```ts
  // Materials Importer (aceita planilha SAP .xlsx/.xls ou .csv)
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [pendingImportItems, setPendingImportItems] = useState<Omit<Material, 'id' | 'is_active' | 'created_at'>[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState<{ read: number; inserted: number; updated: number; deactivated: number; syncFailed: number } | null>(null);
```

por:

```ts
  // Materials Importer (aceita a exportação SAP completa "CadMateriais", .xlsx/.xls ou .csv)
  const [importPreview, setImportPreview] = useState<{ material_code: string; description: string; category: string; unit: string; is_active: boolean }[]>([]);
  const [pendingRawRows, setPendingRawRows] = useState<any[][]>([]);
  const [pendingFilename, setPendingFilename] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState<SAPImportLog | null>(null);
```

- [ ] **Step 3: Trocar o parser e os handlers de arquivo/confirmação**

Em `src/views/AdminPanel.tsx:275-403`, localizar o bloco que começa em `// Materials import: SAP export structure...` (linha 275) e termina no fechamento de `handleBulkImport` (linha ~403, antes do próximo handler). Substituir tudo esse bloco por:

```ts
  // Materials import: exportação SAP completa "CadMateriais" (27 colunas) ->
  // pré-visualização leve (10 primeiras linhas) usando o mesmo mapeamento de
  // colunas de importCadMateriaisRaw, sem duplicar a lógica de parse completa
  // aqui — a planilha real (452k linhas) só é processada de fato dentro de
  // localDb.importCadMateriaisRaw, no momento da confirmação.
  const buildMaterialsPreview = (rawRows: any[][]) => {
    if (rawRows.length < 2) {
      throw new Error('Planilha vazia ou sem linhas de dados.');
    }

    const headers = rawRows[0].map((h: any) => String(h || '').trim());
    const normalize = (h: string) => h.toLowerCase().trim();
    const mappedFields = headers.map(h => {
      const match = CADMATERIAIS_COLUMNS.find(c => normalize(c.header) === normalize(h));
      return match ? match.field : null;
    });

    const codeIdx = mappedFields.indexOf('material_code');
    if (codeIdx === -1) {
      throw new Error('Coluna obrigatória não encontrada. Esperado: "Material".');
    }
    const descIdx = mappedFields.indexOf('description');
    const unitIdx = mappedFields.indexOf('unit');
    const eliminacaoIdx = mappedFields.indexOf('eliminacao');
    const elimCentroIdx = mappedFields.indexOf('elim_nivel_centro');

    const isX = (v: any) => String(v ?? '').trim().toUpperCase() === 'X';

    const preview: { material_code: string; description: string; category: string; unit: string; is_active: boolean }[] = [];
    for (let i = 1; i < rawRows.length && preview.length < 10; i++) {
      const row = rawRows[i];
      const material_code = String(row[codeIdx] ?? '').trim();
      if (!material_code) continue;
      preview.push({
        material_code,
        description: descIdx !== -1 ? String(row[descIdx] ?? '').trim() : '',
        category: 'calculada na importação',
        unit: unitIdx !== -1 ? String(row[unitIdx] ?? '').trim() : '',
        is_active: !(isX(eliminacaoIdx !== -1 ? row[eliminacaoIdx] : null) || isX(elimCentroIdx !== -1 ? row[elimCentroIdx] : null)),
      });
    }

    if (preview.length === 0) {
      throw new Error('Nenhum material válido encontrado na planilha.');
    }

    return preview;
  };

  const processMaterialsFile = (file: File) => {
    setImportError('');
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();

    reader.onerror = () => {
      setImportError('Falha ao ler o arquivo selecionado.');
      setImportStatus('error');
    };

    const handleParsed = (rawRows: any[][]) => {
      try {
        const preview = buildMaterialsPreview(rawRows);
        setPendingRawRows(rawRows);
        setPendingFilename(file.name);
        setImportPreview(preview);
        setImportStatus('parsed');
      } catch (err: any) {
        setImportError(err.message || 'Falha ao processar a planilha.');
        setImportStatus('error');
      }
    };

    if (isExcel) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
          handleParsed(rawRows);
        } catch (err: any) {
          setImportError(err.message || 'Falha ao processar a planilha .xlsx.');
          setImportStatus('error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const rawRows = text.split('\n').filter(l => l.trim()).map(line =>
            line.split(';').map(c => c.trim().replace(/"/g, ''))
          );
          handleParsed(rawRows);
        } catch (err: any) {
          setImportError(err.message || 'Falha ao processar o arquivo CSV. Verifique o delimitador (;).');
          setImportStatus('error');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleCSVDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCSVDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      processMaterialsFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processMaterialsFile(e.target.files[0]);
    }
  };

  const handleBulkImport = async () => {
    setImportStatus('saving');
    setImportProgress(0);
    try {
      const result = await localDb.importCadMateriaisRaw(pendingRawRows, pendingFilename, setImportProgress);
      setImportSummary(result);
      setImportStatus('success');
      setImportPreview([]);
      setPendingRawRows([]);
      setPendingFilename('');
    } catch (err: any) {
      console.error('Erro ao importar catálogo de materiais:', err);
      setImportError(`Erro ao realizar salvamento do catálogo: ${err?.message || String(err)}`);
      setImportStatus('error');
    }
  };
```

- [ ] **Step 4: Trocar a seção JSX da aba de import**

Em `src/views/AdminPanel.tsx:838-928` (bloco `{activeTab === 'importar' && ( ... )}`), fazer três trocas pontuais:

1. O texto de apoio (linha 843):

```tsx
            <p className="text-xs text-slate-500">Carregue a planilha exportada do SAP com as colunas "Material", "Texto breve material", "Texto longo do material" e "empresa". O catálogo local e a tabela <code>materials</code> no Supabase são atualizados automaticamente.</p>
```

vira:

```tsx
            <p className="text-xs text-slate-500">Carregue a exportação completa "CadMateriais" do SAP (todas as colunas do cadastro). <strong>Substitui integralmente</strong> o catálogo atual — durante o processamento (pode levar de 15 a 30 minutos para o volume completo), a busca de materiais no Catálogo e em Nova Solicitação pode retornar resultados vazios ou incompletos.</p>
```

2. O banner de status `saving` (linhas 868-873) passa a mostrar o progresso:

```tsx
            {importStatus === 'saving' && (
              <div className="rounded-lg bg-blue-50 p-3 text-xs font-semibold text-blue-800 border border-blue-100 flex items-center">
                <RefreshCw className="mr-2 h-4.5 w-4.5 shrink-0 text-blue-600 animate-spin" />
                <span>Substituindo o catálogo no Supabase... {importProgress}%</span>
              </div>
            )}
```

3. O banner de sucesso (linhas 875-887), que hoje lê `importSummary.read/inserted/updated/deactivated/syncFailed`, passa a ler o formato de `SAPImportLog` (igual às demais importações SAP):

```tsx
            {importStatus === 'success' && importSummary && (
              <div className="rounded-lg p-3 text-xs font-semibold border flex items-center bg-emerald-50 text-emerald-800 border-emerald-100">
                <Check className="mr-2 h-4.5 w-4.5 shrink-0 text-emerald-600 font-black" />
                <span>
                  Importação concluída! Lidos: {importSummary.records_read}, Inseridos: {importSummary.records_inserted}, Substituídos: {importSummary.records_eliminated}.
                  {importSummary.columns_missing.length > 0 && ` Colunas ausentes: ${importSummary.columns_missing.join(', ')}.`}
                </span>
              </div>
            )}
```

A tabela de pré-visualização (linhas 890-926) já usa `importPreview.map(item => ...)` com `item.material_code`, `item.description`, `item.category`, `item.company` — trocar a última coluna de `item.company` (que deixou de existir no novo shape do preview) para `item.is_active`:

```tsx
                      <th className="py-2 px-3 text-center">Empresa</th>
```

vira:

```tsx
                      <th className="py-2 px-3 text-center">Ativo</th>
```

e:

```tsx
                        <td className="py-2 px-3 text-center font-bold text-slate-500">{item.company}</td>
```

vira:

```tsx
                        <td className={`py-2 px-3 text-center font-bold ${item.is_active ? 'text-emerald-600' : 'text-red-500'}`}>{item.is_active ? 'Sim' : 'Não'}</td>
```

- [ ] **Step 5: Rodar o build e checar erros de tipo/lint**

Run: `npx tsc --noEmit`
Expected: sem erros — nenhuma referência restante a `parseMaterialsRows`, `pendingImportItems`, `VALID_COMPANIES` ou `localDb.importMaterials` (busque por essas quatro strings no arquivo; se alguma sobrar fora do que foi listado nesta task, é sinal de uso não mapeado — remova).

- [ ] **Step 6: Testar manualmente no navegador**

Run: `npm run dev`

1. Abrir o AdminPanel, aba "Importação do Cadastro de Materiais SAP".
2. Montar uma planilha `.csv` pequena (5-10 linhas) com o cabeçalho exato de `CADMATERIAIS_COLUMNS` (as 27 colunas) e algumas linhas de teste, incluindo pelo menos uma com `Eliminação` ou `Elim.nv.Centro` = `X`.
3. Soltar o arquivo na área de upload — confirmar que a pré-visualização aparece com até 10 linhas, mostrando `Sim`/`Não` corretamente na coluna Ativo.
4. Clicar em "Confirmar Importação de Planilha" — confirmar que o progresso avança e a mensagem de sucesso aparece com as contagens.
5. Ir à tela Catálogo de Materiais (`Materials.tsx`) e buscar por um dos códigos importados — confirmar que aparece (se ativo) ou não aparece (se eliminado).
6. Ir à aba "Log de Importações SAP" e confirmar que a entrada `CADMATERIAIS` aparece na lista, com o badge roxo (cor padrão de tipos não mapeados explicitamente).

- [ ] **Step 7: Commit**

```bash
git add src/views/AdminPanel.tsx
git commit -m "feat: aba de import de materiais usa CadMateriais (importCadMateriaisRaw)"
```

---

### Task 6: Aplicar a migração no Supabase (manual, com confirmação)

**Files:**
- Nenhum arquivo novo — usa `db/sql/alters/cadmateriais_colunas_materials.sql` (Task 1).

**Interfaces:**
- Consumes: o SQL da Task 1.
- Produces: as colunas novas existindo de fato na tabela `materials` do Supabase de produção — sem isso, `importCadMateriaisRaw` (Task 4) falha ao tentar inserir colunas inexistentes.

- [ ] **Step 1: Confirmar com o usuário antes de aplicar**

Este `ALTER TABLE` mexe na tabela mais consultada do sistema em produção. Antes de rodar, mostrar o SQL final (`db/sql/alters/cadmateriais_colunas_materials.sql`) ao usuário e pedir confirmação explícita do momento de aplicar (idealmente fora do horário de pico de uso do Catálogo/Nova Solicitação, já que embora seja só `ADD COLUMN` — operação rápida — mexe na tabela em produção).

- [ ] **Step 2: Aplicar a migração**

Com a confirmação do usuário, aplicar via `mcp__claude_ai_Supabase__apply_migration` (se o projeto Supabase estiver acessível pelo MCP) ou instruir o usuário a colar o SQL no SQL Editor do painel Supabase.

- [ ] **Step 3: Verificar que as colunas foram criadas**

Rodar (via MCP `execute_sql` ou SQL Editor):

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'materials'
order by ordinal_position;
```

Expected: a lista inclui todas as colunas novas (`centro`, `eliminacao`, `elim_nivel_centro`, ..., `imported_at`) além das já existentes (`id`, `material_code`, `description`, `technical_text`, `category`, `company`, `unit`, `is_active`, `busca_desc`, `busca_texto`, `created_at`).

- [ ] **Step 4: Fazer uma importação real de teste (planilha pequena) em produção**

Repetir o teste manual do Task 5/Step 6 agora contra o Supabase de produção, com uma planilha pequena (não a de 452 mil linhas ainda) para validar o fluxo ponta a ponta antes da carga completa.

- [ ] **Step 5: Rodar a importação completa (452 mil linhas)**

Só depois do Step 4 validado: solicitar ao usuário o arquivo completo da exportação CadMateriais e rodar a importação pelo AdminPanel, avisando que a busca pode ficar degradada durante o processamento (15-30 min).

Não commitar nada nesta task — é execução operacional, não mudança de código.
