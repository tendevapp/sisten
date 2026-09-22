# Book de EPIs SSMA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disponibilizar no hub SSMA um Book de EPIs editável, agrupado por EPI e com cada variante SAP/CA preservada, incluindo fotos reutilizáveis em Compras.

**Architecture:** O importador do navegador lê os valores e os desenhos da planilha XLSX via `XLSX.CFB`, expande cada tamanho/código SAP em uma linha individual e envia a foto comprimida para um bucket privado. O banco mantém o item, seu vínculo SAP e um histórico imutável produzido por trigger; o banco de imagens de Compras agrega as fotos desses itens por código SAP.

**Tech Stack:** React 19, TypeScript, Vite, SheetJS (`xlsx`), Supabase Postgres/Storage/RLS e Vitest.

## Global Constraints

- Preservar os campos do Book: foto, descrição do EPI, indicação, CA, validade, fabricante, tamanho/código SAP e descrição SAP.
- A variante é identificada por `codigo_sap + ca`; descrições iguais agrupam a visualização, sem fundir as variantes.
- Fotos passam por `comprimirImagemUpload` antes do Storage.
- Usuários autenticados que já podem acessar SSMA podem ler, criar, editar e reimportar; toda alteração deve ficar registrada no banco.
- Não alterar as mudanças pendentes de Produção em `src/App.tsx`, `src/lib/moduleHomes.ts` e `src/lib/pages.ts`.

---

### Task 1: Parser determinístico do Book

**Files:**
- Create: `src/lib/bookEpisImportacao.ts`
- Test: `src/lib/bookEpisImportacao.test.ts`

**Interfaces:**
- Produces `parseBookEpisWorkbook(buffer): Promise<BookEpiImportado[]>`.
- Produces `expandirVariantesEpi(linha): BookEpiVariante[]`.

- [ ] **Step 1: Write the failing tests** for expansion of `36 - 1026092\n37 - 1026093`, pairing each SAP description with its size and retaining one item when there is no size.
- [ ] **Step 2: Run** `npx vitest run src/lib/bookEpisImportacao.test.ts` and confirm the missing parser fails.
- [ ] **Step 3: Implement** a header-tolerant SheetJS parser, XML drawing relation reader and image extraction using `XLSX.CFB`.
- [ ] **Step 4: Run** `npx vitest run src/lib/bookEpisImportacao.test.ts` and confirm the parser passes.

### Task 2: Persistência, auditoria e Storage

**Files:**
- Create: `supabase/migrations/<generated>_create_ssma_book_epis.sql`
- Create: `src/lib/ssmaBookEpisApi.ts`
- Test: `src/lib/ssmaBookEpisApi.test.ts`

**Interfaces:**
- Produces `listarBookEpis`, `salvarEpi`, `importarBookEpis` and `listarImagensEpiPorCodigoSap`.
- Consumes `BookEpiImportado`, `comprimirImagemUpload` and `supabase`.

- [ ] **Step 1: Write failing API tests** for the stable key `codigo_sap + ca` and photo-to-code mapping.
- [ ] **Step 2: Run** `npx vitest run src/lib/ssmaBookEpisApi.test.ts` and confirm failure.
- [ ] **Step 3: Generate the migration name using Supabase CLI**, then define tables, auditing trigger, indexes, RLS/grants and private bucket policies.
- [ ] **Step 4: Implement** the API with compressed uploads, per-row upsert and signed URLs.
- [ ] **Step 5: Run** the focused tests and inspect migration SQL for RLS and Storage operations.

### Task 3: Hub SSMA, cadastro e banco de imagens de Compras

**Files:**
- Create: `src/views/ssma/SsmaBookEpisView.tsx`
- Modify: `src/views/ssma/SsmaHub.tsx`
- Modify: `src/components/ui/Attachments.tsx`
- Test: `src/lib/bookEpisImportacao.test.ts`

**Interfaces:**
- Consumes `SsmaBookEpisView` as `activeTab === 'book_epis'`.
- Consumes `listarImagensEpiPorCodigoSap(materialCode): Promise<RequestAttachment[]>` in the existing image bank.

- [ ] **Step 1: Write a failing parser-facing UI test only for pure grouping/filter helpers when needed.**
- [ ] **Step 2: Implement** the RH-style SSMA home sections: Book de EPIs in Cadastros and every visible SSMA form under Relatórios.
- [ ] **Step 3: Implement** responsive grouped cards, editing form, audit history, SAP lookup state, manual photo replacement and workbook import summary.
- [ ] **Step 4: Extend** the existing Buscar imagem modal with EPI photos returned by the new API, retaining its signed URL behavior.
- [ ] **Step 5: Run** focused tests and a production build.

### Task 4: Verification

**Files:**
- Modify only files from Tasks 1-3 when validation identifies a defect.

- [ ] **Step 1: Run** `npx vitest run src/lib/bookEpisImportacao.test.ts src/lib/ssmaBookEpisApi.test.ts`.
- [ ] **Step 2: Run** `npm run build`.
- [ ] **Step 3: Run** `npx tsc --noEmit`, compare failures against the pre-existing baseline and report only touched-file regressions.
- [ ] **Step 4: Report** the pending migration application and the required real import confirmation, if no target Supabase project is connected.
