# Apontamento de Produção por Tramo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Transferir o apontamento operacional da aba TRAMOS para o SISTEN, preservar o histórico até 06/10/2026 e seguir apontando por tramo no sistema.

**Architecture:** proj_tramos_gwjaco permanece o catálogo canônico da peça Tn-série. Um razão novo de eventos registra os marcos de produção, situação e reparos, e uma view calcula o estado atual. O fluxo POC prod_apt_tramos/prod_apt_operacoes sai da rota ativa, mas seus dados não são apagados. O modelo agregado prod_apt_lancamentos permanece para Programado × Realizado e não receberá cópia destes eventos.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase/Postgres/RLS/RPC e xlsx 0.18.5.

## Global Constraints

- Usar exclusivamente supabase-sisten (fwezzgduywgyhxinjurn).
- Importar somente cadastro e valores apontados; fórmulas, pivôs e totais serão recalculados no banco.
- Não trocar IDs Tn-série, nem excluir dados de virolas, financeiro, kits ou pré-montagem.
- Cada novo evento usa APT-DDMMYY-INDICE, tem autor, data operacional não futura e correção auditável.
- RLS, autorização e cronologia são aplicadas no banco; a tela não é a única barreira.
- Não criar campo de foto neste escopo. Se houver foto posteriormente, passar por prepareAttachment antes do Storage.
- Criar migrations somente com supabase migration new. Preservar alterações locais não relacionadas.

## Findings and mandatory decision

- TRAMOS!C,E,F,G,H,I,L,P,U contém as entradas diretas: setor, sequencial, atividade, reparos, início e quatro marcos seguintes. As demais colunas operacionais são cálculos.
- Há 98 apontamentos, sem sequencial repetido e sem quebra cronológica. NAV02, Jato e Pátio têm lançamentos até 06/10.
- A matriz TORRE!A3:F26 contém 115 combinações das torres 1–23. O banco usa a numeração linear e diverge da matriz em 56 combinações.
- TORRE!A3:F26 tem 3102 em Torre 8/T5, enquanto TORRE!K:L e TRAMOS usam 3202/T5. Não importar nem reconciliar antes de confirmar qual série é correta.
- O cache de Real NAV01 mostra 88, mas há 80 datas diretas em Liberado P/ NAV02. O importador deve usar 80 e registrar a divergência, nunca copiar 88.
- As 115 linhas SP01 já têm 1.081 virolas, 115 linhas de faturamento, 4 kits e 4 alvos de pré-montagem relacionados. Os IDs podem permanecer, mas os campos denormalizados devem ser sincronizados.
- prod_apt_tramos/prod_apt_operacoes possuem 8 tramos e 28 operações de POC, incluindo identificadores de demonstração, sem vínculo ao catálogo. Não apagar sem nova autorização.

**Gate:** o responsável deve confirmar se Torre 8/T5 é série **3102** ou **3202**. O plano não presume a correção.

---

### Task 1: Create a deterministic workbook preflight

**Files:**

- Create: src/lib/producaoTramosImportacao.ts
- Create: src/lib/producaoTramosImportacao.test.ts
- Create: src/lib/__fixtures__/producao-tramos/PROD-Avanca-2026-10-07.xlsx
- Create: scripts/importar-producao-tramos.ts

**Interfaces:**

- Produces lerPlanilhaTramos(bytes: ArrayBuffer): ResultadoLeituraPlanilhaTramos.
- Produces validarPlanilhaTramos(resultado): DivergenciaImportacaoTramos[].
- Reads only TORRE!A3:F26, TORRE!K:L and the direct TRAMOS values.

- [ ] **Step 1: Write failing parser tests**

~~~ts
expect(resultado.cadastro).toHaveLength(115);
expect(resultado.snapshots).toHaveLength(98);
expect(resultado.totaisDiretos).toEqual({
  inicio: 88, liberadoNav02: 80, liberadoJato: 62, liberadoPatio: 36, expedido: 26,
});
expect(resultado.divergencias).toContainEqual(
  expect.objectContaining({ codigo: 'CADASTRO_3102_3202', sequencial: 3202 }),
);
~~~

- [ ] **Step 2: Verify failure**

Run: npx vitest run src/lib/producaoTramosImportacao.test.ts

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement raw-value extraction**

~~~ts
export type MarcoTramo =
  | 'inicio' | 'liberado_nav02' | 'liberado_jato' | 'liberado_patio' | 'expedido';

export interface SnapshotTramoPlanilha {
  linhaOrigem: number;
  sequencial: number;
  tramo: 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
  setor: string;
  atividade: string;
  reparosSolda: number | null;
  marcos: Partial<Record<MarcoTramo, string>>;
}
~~~

Normalize dates as yyyy-MM-dd without new Date('yyyy-mm-dd'). Reject duplicate serials, negative/noninteger repairs, mismatched tramo lookup and out-of-order dates. Recompute totals from the five raw date columns, not from AC:AG.

- [ ] **Step 4: Add a non-writing dry-run**

~~~ts
const resultado = lerPlanilhaTramos(await readFile(arquivo));
const divergencias = validarPlanilhaTramos(resultado);
console.table(resumoImportacao(resultado, divergencias));
process.exitCode = divergencias.some(d => d.bloqueante) ? 1 : 0;
~~~

The CLI accepts one xlsx path and reports sheet/row for each issue. It reports direct totals 88/80/62/36/26 and the stale cached NAV01 total.

- [ ] **Step 5: Verify and commit**

Run: npx vitest run src/lib/producaoTramosImportacao.test.ts

Run: npx tsx scripts/importar-producao-tramos.ts "C:\Users\andre.araujo\Downloads\PROD - Avança de Produção 07-10-26.xlsx" --dry-run

Expected: non-zero while the 3102/3202 decision is unresolved; no database write.

~~~bash
git add src/lib/producaoTramosImportacao.ts src/lib/producaoTramosImportacao.test.ts src/lib/__fixtures__/producao-tramos scripts/importar-producao-tramos.ts
git commit -m "feat(producao): validar planilha de tramos"
~~~

### Task 2: Reconcile catalog ownership before importing history

**Files:**

- Create: migration generated by supabase migration new reconciliar_catalogo_tramos_producao
- Create: src/lib/producaoTramosCatalogo.ts
- Create: src/lib/producaoTramosCatalogo.test.ts
- Modify: src/lib/projetos.ts
- Modify: src/lib/producao.ts

**Interfaces:**

- Produces CatalogoTramo { id, torreNumero, tramo, serie, subprojetoId }.
- Produces compararCadastroTramos(cadastro, catalogo): DivergenciaCadastroTramo[].
- The migration exposes prod_reconciliar_catalogo_tramos(p_lote uuid, p_confirmacao_3202 boolean).

- [ ] **Step 1: Write the catalog-difference test**

~~~ts
expect(compararCadastroTramos(planilha, sistema)).toContainEqual({
  tipo: 'TORRE_DIVERGENTE', serie: 3153, tramo: 'T1', esperado: 2, atual: 3,
});
expect(compararCadastroTramos(planilha, sistema)).toHaveLength(56);
~~~

- [ ] **Step 2: Generate the migration**

Run: supabase migration new reconciliar_catalogo_tramos_producao

Expected: a timestamped file under supabase/migrations/. Use that generated filename; do not invent one.

- [ ] **Step 3: Implement a staged, auditable reconciliation**

Create prod_apt_importacoes_tramos and prod_apt_importacoes_tramos_itens. Store source filename, SHA-256, importer, timestamp, workbook row, series, desired tower/tramo and before/after JSON.

The RPC must reject a batch unless it has 115 distinct series, no unapproved 3102 record and exactly 115 canonical SP01 rows. In one transaction, temporarily set affected tower values to distinct negative values, apply the approved mapping, then propagate torre_numero through immutable tramo IDs to prod_virolas, prod_tramos_entrega and fin_fat_gwjaco. Do not update id, serie, tramo, values, financial statuses, kit states or premontagem state.

- [ ] **Step 4: Add read-only catalog API**

~~~ts
export async function listarCatalogoTramos(): Promise<CatalogoTramo[]> {
  const { data, error } = await supabase
    .from('proj_tramos_gwjaco')
    .select('id, torre_numero, tramo, serie, subprojeto_id')
    .order('torre_numero').order('tramo');
  if (error) throw new Error(error.message);
  return data.map(normalizarCatalogoTramo);
}
~~~

Only an admin with prod_apt_cadastros can reconcile; users can only select from this catalog.

- [ ] **Step 5: Verify downstream records in a staging branch**

~~~sql
select count(*) from public.prod_virolas v
join public.proj_tramos_gwjaco p on p.id = v.tramo_unidade_id
where (v.torre_numero, v.tramo) is distinct from (p.torre_numero, p.tramo);

select count(*) from public.prod_tramos_entrega e
join public.proj_tramos_gwjaco p on p.id = e.id
where (e.torre_numero, e.tramo, e.serie) is distinct from (p.torre_numero, p.tramo, p.serie);

select count(*) from public.fin_fat_gwjaco f
join public.proj_tramos_gwjaco p on p.id = f.tramo_id
where (f.torre_numero, f.tramo, f.serie) is distinct from (p.torre_numero, p.tramo, p.serie);
~~~

Expected after reconciliation: 0, 0, 0; 345 catalog tramos and 3,243 virolas remain.

- [ ] **Step 6: Commit**

~~~bash
git add supabase/migrations src/lib/producaoTramosCatalogo.ts src/lib/producaoTramosCatalogo.test.ts src/lib/projetos.ts src/lib/producao.ts
git commit -m "feat(producao): reconciliar cadastro de torres e tramos"
~~~

### Task 3: Add an audited per-tramo event ledger

**Files:**

- Create: migration generated by supabase migration new criar_eventos_apontamento_tramos
- Create: src/lib/producaoTramos.ts
- Create: src/lib/producaoTramosApi.ts
- Create: src/lib/producaoTramos.test.ts
- Create: src/lib/producaoTramosApi.test.ts
- Modify: src/lib/producaoApontamentosApi.ts

**Interfaces:**

- Produces TramoAtual with catalog identity, milestone dates, current sector/activity, repair quantity and audit metadata.
- Produces salvarEventoTramo(input): Promise<{ codigo: string; id: string }>.
- Produces listarTramosAtuais(): Promise<TramoAtual[]>, listarAtividadesTramo(): Promise<string[]> and corrigirEventoTramo(input): Promise<{ codigo: string; id: string }>.
- Consumes tramo_id from proj_tramos_gwjaco only.

- [ ] **Step 1: Write failing lifecycle tests**

~~~ts
expect(validarEventoTramo(
  { marco: 'liberado_jato', data: '2026-08-01' },
  { liberadoNav02Em: '2026-08-02' },
)).toEqual(['Jato não pode anteceder a liberação para NAV02.']);

expect(estadoTramo(eventos)).toMatchObject({
  liberadoNav02Em: '2026-10-06',
  setorAtual: 'Jato',
  atividadeAtual: 'Jato em Andamento',
});
~~~

- [ ] **Step 2: Create tables, view, RLS and RPCs**

Create prod_apt_tramo_eventos with id, codigo, tramo_id text FK, tipo, marco, data_operacional, setor, atividade, reparos_solda, observacao, origem, importacao_id, corrige_evento_id, creator and soft-delete fields. Create prod_apt_tramos_atual as a security_invoker view.

The only milestones are:

~~~ts
export const MARCOS_TRAMO = [
  'inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido',
] as const;
~~~

prod_apt_salvar_evento_tramo(p jsonb) authenticates, checks prod_apontamentos/producao_home, validates catalog and chronology, blocks future dates, allocates an APT code and inserts an event. prod_apt_corrigir_evento_tramo soft-deletes the superseded event then writes its correction. Revoke direct write grants from authenticated.

- [ ] **Step 3: Preserve code uniqueness across both pointing models**

Change prod_apt_proximo_codigo(date) to find its maximum suffix in prod_apt_lancamentos and prod_apt_tramo_eventos. Keep the advisory lock and existing idempotence of prod_apt_salvar_lancamento.

- [ ] **Step 4: Implement typed API**

~~~ts
export interface SalvarEventoTramoInput {
  tramoId: string;
  dataOperacional: string;
  marco?: MarcoTramo;
  setor?: string;
  atividade?: string;
  reparosSolda?: number;
  observacao?: string;
}

export async function salvarEventoTramo(input: SalvarEventoTramoInput) {
  const { data, error } = await supabase.rpc('prod_apt_salvar_evento_tramo', {
    p: serializarEvento(input),
  });
  if (error) throw new Error(error.message);
  return data as { codigo: string; id: string };
}
~~~

- [ ] **Step 5: Verify and commit**

Run: npx vitest run src/lib/producaoTramos.test.ts src/lib/producaoTramosApi.test.ts

Expected: PASS for chronology, state reduction, correction and serialization.

Run authenticated staging RPC tests: unauthenticated rejection, no-access rejection, invalid catalog rejection, valid create, correction and unique codes.

~~~bash
git add supabase/migrations src/lib/producaoTramos.ts src/lib/producaoTramosApi.ts src/lib/producaoTramos.test.ts src/lib/producaoTramosApi.test.ts src/lib/producaoApontamentosApi.ts
git commit -m "feat(producao): registrar eventos auditáveis por tramo"
~~~

### Task 4: Import the historical source as events

**Files:**

- Modify: scripts/importar-producao-tramos.ts
- Modify: src/lib/producaoTramosImportacao.ts
- Modify: src/lib/producaoTramosImportacao.test.ts
- Modify: migration generated in Task 3

**Interfaces:**

- Consumes the approved source result and catalog import batch ID.
- Calls prod_apt_importar_snapshot_tramos(p jsonb) after resolving the approved source SHA-256 batch.
- Produces an idempotent ResultadoImportacaoTramos.

- [ ] **Step 1: Write the import payload test**

~~~ts
expect(montarPayloadImportacao(resultado, loteId)).toMatchObject({
  arquivo: 'PROD - Avança de Produção 07-10-26.xlsx',
  snapshots: [expect.objectContaining({ sequencial: 3147, linhaOrigem: 2 })],
});
expect(montarPayloadImportacao(resultado, loteId).snapshots).toHaveLength(98);
~~~

- [ ] **Step 2: Implement idempotent historical import**

Resolve every snapshot by serie plus tramo. Insert only populated milestone events, plus one current-situation event containing setor, atividade and reparos. Link every event to the import batch. Reject a repeated SHA-256 import unless the call is dry-run. Never infer missing milestones from activity.

- [ ] **Step 3: Keep monthly planning separate**

Store an audit extract of direct Plan NAV01, Plan Jato and Plan Greentag inputs. Do not write monthly figures into prod_apt_programacao: it is ISO-weekly, and an invented week would distort adherence. Create a separate approved import only after Planning supplies the week mapping.

- [ ] **Step 4: Dry-run, apply and reconcile**

Run: npx tsx scripts/importar-producao-tramos.ts "C:\Users\andre.araujo\Downloads\PROD - Avança de Produção 07-10-26.xlsx" --dry-run

Expected: 98 snapshots, 88 starts, 80 NAV02, 62 Jato, 36 Pátio, 26 expedidos, zero missing catalog and zero chronology violations.

Run the same command with --apply only after dry-run approval. A repeated apply must report already imported.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/importar-producao-tramos.ts src/lib/producaoTramosImportacao.ts src/lib/producaoTramosImportacao.test.ts supabase/migrations
git commit -m "feat(producao): importar histórico de tramos"
~~~

### Task 5: Replace the active POC launch screen

**Files:**

- Create: src/components/producao/apontamentos/ApontamentoTramos.tsx
- Create: src/components/producao/apontamentos/ApontamentoTramos.test.tsx
- Modify: src/views/producao/ProducaoApontamentos.tsx
- Modify: src/lib/producaoTramosApi.ts
- Keep unchanged until accepted: src/components/producao/apontamentos/ApontamentosTorresFluxo.tsx
- Keep unchanged until accepted: src/lib/producaoTorresApi.ts

**Interfaces:**

- Consumes listarTramosAtuais, listarAtividadesTramo, salvarEventoTramo and corrigirEventoTramo.
- Makes no direct database mutation; it calls only the ledger RPCs.

- [ ] **Step 1: Write the UI behavior test**

~~~tsx
render(<ApontamentoTramos user={usuarioComAcesso} />);
await user.click(screen.getByRole('row', { name: /3202/i }));
expect(screen.getByText('Torre 8')).toBeVisible();
expect(screen.getByLabelText('Sequencial')).toHaveAttribute('readonly');

await user.selectOptions(screen.getByLabelText('Marco'), 'liberado_jato');
await user.type(screen.getByLabelText('Data operacional'), '2026-10-05');
expect(await screen.findByText('Jato não pode anteceder a liberação para NAV02.')).toBeVisible();
~~~

- [ ] **Step 2: Implement the responsive operational screen**

Replace the lançar content in ProducaoApontamentos.tsx. The list shows serial, derived tower/tramo, current sector/activity and latest milestone. Filters are sector, tramo and serial. On a narrow viewport, use cards.

The detail form selects a catalog serial and only displays tower/tramo; users cannot edit identity. It permits one auditable action: record/correct a milestone, update sector/activity, or update repair total, each with date and optional observation. Display imported source row and full timeline.

- [ ] **Step 3: Cut over safely**

Do not render ApontamentosTorresFluxo from the active lançar tab. Keep POC tables and code read-only until the migrated history is accepted; do not delete their 8/28 records.

- [ ] **Step 4: Verify and commit**

Run: npx vitest run src/components/producao/apontamentos/ApontamentoTramos.test.tsx

Expected: PASS for locked identity, chronology feedback, payload and correction.

Manually verify with an authenticated Production user on desktop and 390px mobile. Verify a no-access user receives database rejection.

~~~bash
git add src/components/producao/apontamentos/ApontamentoTramos.tsx src/components/producao/apontamentos/ApontamentoTramos.test.tsx src/views/producao/ProducaoApontamentos.tsx src/lib/producaoTramosApi.ts
git commit -m "feat(producao): apontar progresso por tramo"
~~~

### Task 6: Production acceptance and POC retirement decision

**Files:**

- Create: docs/producao/apontamento-tramos-operacao.md
- Modify: docs/superpowers/plans/2026-10-07-apontamento-producao-tramos.md

- [ ] **Step 1: Document operational evidence**

Record source hash, chosen T8/T5 series, catalog batch ID, history batch ID, counts 98/88/80/62/36/26, results of the three downstream coherence queries and approver/date.

- [ ] **Step 2: Verify the repository**

Run: npx tsc --noEmit

Expected: no new diagnostics relative to the documented baseline.

Run: npx vitest run

Expected: existing suite plus parser, catalog, API and UI tests pass.

Run: npm run build

Expected: production build passes.

- [ ] **Step 3: Smoke-test production**

With a Production user, create and correct one event for a non-imported test tramo. Confirm unique APT code, audit timeline, changed current state, unchanged catalog ID and no duplicate in the legacy aggregate table. Confirm a user without page access is rejected by the RPC.

- [ ] **Step 4: Keep the retirement separate**

Keep the POC for at least one agreed operational cycle. Archiving/removing prod_apt_tramos and prod_apt_operacoes requires a separate explicit approval and task.

- [ ] **Step 5: Commit documentation**

~~~bash
git add docs/producao/apontamento-tramos-operacao.md docs/superpowers/plans/2026-10-07-apontamento-producao-tramos.md
git commit -m "docs(producao): registrar operação de apontamento por tramo"
~~~

## Plan Review

The plan covers workbook logic, catalog repair, historical migration, continuing operational entries, authorization, audit, mobile use and rollout evidence. It intentionally excludes silent correction of 3102/3202, automatic conversion of monthly targets to weeks, POC deletion and unrelated finance/production status changes.
