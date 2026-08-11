# Dashboards do Almoxarifado — plano de implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Objetivo:** Entregar a página `/almoxarifado/dashboards` com nove painéis sobre a posição de estoque vigente — valor imobilizado, curva ABC, concentração por depósito e categoria, top materiais, compra evitável, divergência de PMM e qualidade de cadastro.

**Arquitetura:** View fina orquestradora (`AlmoxarifadoDashboards.tsx`) que carrega dados e distribui por props; painéis isolados em `src/components/almoxarifado/`; toda a matemática em `src/lib/almoxarifado.ts` sem React. Segue o padrão de `src/views/DemandDashboard.tsx`. Um único cruzamento (PMM vs último preço pago) é agregado no Postgres por uma view nova, porque o cache local de pedidos cobre só 2026.

**Stack:** React 19 + TypeScript, recharts 3.9, lucide-react, Tailwind 4 com dark mode, Supabase (projeto `fwezzgduywgyhxinjurn`), XLSX para export.

**Spec:** [2026-07-24-almoxarifado-dashboards-design.md](../specs/2026-07-24-almoxarifado-dashboards-design.md)

## Restrições globais

Valem para todas as tarefas.

- **Não existe test runner no projeto.** O único gate automatizado é `npm run lint`, que é `tsc --noEmit`. Não instale vitest, jest ou qualquer ferramenta de teste — essa decisão foi tomada explicitamente. A verificação de cada tarefa é: `npm run lint` passando, mais conferência do número renderizado contra o SQL de referência da própria tarefa.
- **Dark mode obrigatório** em todo componente novo: cada cor precisa de variante `dark:`. Use `src/views/Estoque.tsx` como referência visual. **Não** use `src/views/SapDashboards.tsx` como referência — é anterior ao dark mode e não o suporta.
- **Todo texto de interface em português**, seguindo o resto do app.
- **Cabeçalho de licença** em todo arquivo novo, idêntico aos existentes:
  ```ts
  /**
   * @license
   * SPDX-License-Identifier: Apache-2.0
   */
  ```
- **Egress é custo real neste projeto.** Nada que a tarefa criar entra em `syncFromSupabase` — as buscas do módulo Almoxarifado são sob demanda. Ver `src/db/localDb.ts:187-211`.
- **Nenhum indicador de giro, cobertura, aging ou obsolescência.** A série `pedidosforn.data_migo` tem lacuna em 2024–2025 (4.643 entradas em 2023 → 120 em 2024 → 59 em 2025 → 885 em 2026), então esses números seriam falsos. A Tarefa 9 adiciona a nota que declara essa ausência.
- **Commit por tarefa**, mensagem em português no padrão do repositório (`feat:`, `fix:`, `docs:`). Rodapé obrigatório:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- **Cuidado com o shell:** o ambiente é Windows PowerShell 5.1. Para mensagens de commit multilinha, escreva num arquivo temporário e use `git commit -F arquivo.txt`. Here-strings com aspas duplas dentro quebram o parser.

## Números de referência

Extraídos do Postgres em 2026-07-24. São o gabarito de verificação: o que a tela mostra tem que bater com isto.

| Medida | Valor esperado |
| --- | --- |
| Linhas em `estoque` | 2.292 |
| Materiais distintos | 2.052 |
| Valor imobilizado | R$ 17.889.351,14 |
| Depósitos | 12 |
| Curva ABC | A = 254 · B = 529 · C = 1.269 |
| Top depósito por valor | 0004 — R$ 7.701.437,90 em 1.488 itens |
| Compra evitável | 51 materiais (52 linhas de RM) |
| Divergência de PMM | 657 materiais fora de ±20% — 135 acima, 522 abaixo |
| Itens sem classe de item | 82 itens — R$ 223.990,92 |
| Itens sem grupo de mercadoria | 0 |
| Itens sem PMM | 0 |

Duas observações que evitam caça a fantasma:

A spec cita 50 materiais em compra evitável; o valor correto para a tela é **51**. Os 50 vieram de uma consulta sobre a tabela `requisicoes` inteira; a tela usa `localDb.getEnrichedSAPRequisicoes()`, cujo cache é filtrado a partir de 2026-01-01. Essa função exclui requisições com `codigo_de_eliminacao = true`, mas **não** exclui `status_processamento = 'B'` (comportamento documentado e intencional em `src/db/localDb.ts`, por volta da linha 2443-2447). O gabarito de 51 foi medido com essa mesma definição — a versão anterior deste plano tinha a lógica de filtro invertida nos dois critérios (excluía `status_processamento = 'B'`, que a tela inclui, e não excluía eliminadas, que a tela exclui), o que produzia 64 em vez de 51.

Os contadores de "sem grupo de mercadoria" e "sem PMM" valem zero hoje. O painel da Tarefa 9 tem que renderizar bem com zero — não é bug, é a base estando limpa nesses dois campos.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/almoxarifado.ts` | criar — toda a matemática e os formatadores, puros, sem React |
| `src/types.ts` | modificar — adicionar `EstoqueAnalise` |
| `src/db/localDb.ts` | modificar — `estoqueAnaliseKey`, `getEstoqueAnalise()`, `fetchEstoqueAnalise()` |
| `src/views/AlmoxarifadoDashboards.tsx` | criar — orquestradora: carrega, filtra, distribui |
| `src/components/almoxarifado/EstoqueKpis.tsx` | criar — linha de 4 KPIs |
| `src/components/almoxarifado/CurvaAbcChart.tsx` | criar — Pareto A/B/C |
| `src/components/almoxarifado/ValorPorDepositoChart.tsx` | criar — barras horizontais por depósito |
| `src/components/almoxarifado/ComposicaoChart.tsx` | criar — tipo de material e classe de item |
| `src/components/almoxarifado/ConcentracaoChart.tsx` | criar — grupo de mercadoria e aplicação, top 10 |
| `src/components/almoxarifado/TopMateriaisChart.tsx` | criar — top 15 materiais por valor |
| `src/components/almoxarifado/CompraEvitavelPanel.tsx` | criar — alerta de RM aberta com saldo |
| `src/components/almoxarifado/DivergenciaPmmPanel.tsx` | criar — alerta de PMM fora de ±20% |
| `src/components/almoxarifado/QualidadeCadastroPanel.tsx` | criar — lacunas de cadastro |
| `src/views/Estoque.tsx` | modificar — ler query da hash, coluna e filtro ABC |
| `src/components/Sidebar.tsx` | modificar — item "Dashboards" no grupo ALMOXARIFADO |
| `src/App.tsx` | modificar — rota, `lazy()`, `STATE_PRESERVING_PATHS` |

---

### Tarefa 1: View `vw_estoque_analise` e acesso pelo cliente

Entrega o único dado que não fecha no navegador: último preço unitário pago por material. Sem isso a Tarefa 8 não tem o que comparar.

**Arquivos:**
- Criar: migration Supabase `create_vw_estoque_analise` (via MCP `apply_migration`, projeto `fwezzgduywgyhxinjurn`)
- Modificar: `src/types.ts` — adicionar `EstoqueAnalise` depois de `EstoqueItem` (que hoje termina na linha 391)
- Modificar: `src/db/localDb.ts` — chave privada junto de `estoqueKey` (linha 56); métodos junto de `fetchEstoque` (linhas 2326-2344)

**Interfaces:**
- Consome: `fetchAllFromTable<T>(table, selectCols, pageSize)` — privado, já existe em `src/db/localDb.ts:1467`
- Produz: `EstoqueAnalise`; `localDb.getEstoqueAnalise(): EstoqueAnalise[]`; `localDb.fetchEstoqueAnalise(force?: boolean): Promise<EstoqueAnalise[]>`

- [ ] **Passo 1: Aplicar a migration no Supabase**

Use a ferramenta MCP `apply_migration` com `project_id: "fwezzgduywgyhxinjurn"` e `name: "create_vw_estoque_analise"`:

```sql
create or replace view public.vw_estoque_analise as
with ult as (
  select distinct on (p.material)
    p.material,
    p.preco_liquido_unit / case
      when p.por ~ '^[0-9]+([.,][0-9]+)?$'
        then coalesce(nullif(replace(p.por, ',', '.')::numeric, 0), 1)
      else 1
    end as ultimo_preco_unit,
    p.data_doc as data_ultima_compra,
    coalesce(p.fornecedor_nome, p.fornecedor) as ultimo_fornecedor
  from pedidosforn p
  where p.preco_liquido_unit is not null and p.preco_liquido_unit > 0
  order by p.material, p.data_doc desc nulls last
)
select distinct
  e.material,
  u.ultimo_preco_unit,
  u.data_ultima_compra,
  u.ultimo_fornecedor
from estoque e
left join ult u on u.material = e.material;

grant select on public.vw_estoque_analise to authenticated;
```

A divisão por `por` reproduz a correção do commit `217d1e3`: no SAP, `preco_liquido_unit` é o preço de `por` unidades, então o unitário real exige dividir. A guarda por regex evita erro de cast quando `por` vem vazio ou não numérico, e o `coalesce(nullif(...,0),1)` protege contra `por = '0'`, que causaria divisão por zero.

- [ ] **Passo 2: Verificar a view contra o gabarito**

Rode via MCP `execute_sql`:

```sql
select count(*) as materiais,
       count(ultimo_preco_unit) as com_preco
from vw_estoque_analise;
```

Esperado: `materiais = 2052`, `com_preco = 2009`. Se `materiais` vier 2292, o `distinct` não está funcionando — a view tem que ter uma linha por material, não por linha de estoque.

- [ ] **Passo 3: Adicionar o tipo em `src/types.ts`**

Logo depois do fechamento da interface `EstoqueItem`:

```ts
// Uma linha da view `vw_estoque_analise`: enriquecimento por material da posição
// de estoque com o último preço efetivamente pago. Agregado no Postgres porque o
// cache local de `pedidosforn` cobre apenas 2026 e a comparação precisa de todo
// o histórico.
export interface EstoqueAnalise {
  material: string;
  ultimo_preco_unit?: number | null;
  data_ultima_compra?: string | null;
  ultimo_fornecedor?: string | null;
}
```

- [ ] **Passo 4: Adicionar a chave de cache em `src/db/localDb.ts`**

Imediatamente após `private estoqueKey = 'sisten_estoque';` (linha 56):

```ts
  private estoqueAnaliseKey = 'sisten_estoque_analise';
```

E no import de `'../types'` no topo do arquivo, adicione `EstoqueAnalise` à lista de tipos importados (onde já consta `EstoqueItem`).

- [ ] **Passo 5: Adicionar os métodos de acesso**

Logo depois de `fetchEstoque` (que termina na linha 2344), no mesmo bloco do Almoxarifado:

```ts
  // Enriquecimento por material (último preço pago), lido de vw_estoque_analise.
  // Mesma política de `fetchEstoque`: busca sob demanda, cache em memória por
  // sessão, e fora do `syncFromSupabase` para não cobrar egress de quem nunca
  // abre o módulo. Em falha devolve o cache local — quem consome detecta a lista
  // vazia e degrada só o painel que depende dela.
  public getEstoqueAnalise(): EstoqueAnalise[] {
    return this.getStorageItem<EstoqueAnalise[]>(this.estoqueAnaliseKey, []);
  }

  public async fetchEstoqueAnalise(force = false): Promise<EstoqueAnalise[]> {
    if (!supabase) return this.getEstoqueAnalise();
    if (!force && this.cache.has(this.estoqueAnaliseKey)) {
      return this.getEstoqueAnalise();
    }
    try {
      const rows = await this.fetchAllFromTable<EstoqueAnalise>('vw_estoque_analise', '*', 1000);
      this.setStorageItem(this.estoqueAnaliseKey, rows);
      return rows;
    } catch (err) {
      console.warn('Falha ao buscar a análise de estoque; usando cache local.', err);
      return this.getEstoqueAnalise();
    }
  }
```

- [ ] **Passo 6: Rodar o typecheck**

```bash
npm run lint
```

Esperado: nenhum erro. Se aparecer "Cannot find name 'EstoqueAnalise'" em `localDb.ts`, o Passo 4 não incluiu o tipo no import.

- [ ] **Passo 7: Commit**

```bash
git add src/types.ts src/db/localDb.ts
git commit -F mensagem.txt
```

Conteúdo de `mensagem.txt`:

```
feat(almoxarifado): view vw_estoque_analise e acesso pelo cliente

Ultimo preco unitario pago por material, agregado no Postgres. O cache
local de pedidosforn cobre so 2026 e a comparacao com o PMM precisa dos
2.009 materiais com historico, entao baixar 66 mil pedidos ao navegador
para calcular um max(data_doc) seria desperdicio.

Fora do syncFromSupabase: busca sob demanda, como fetchEstoque.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 2: Lib de cálculo, KPIs e a página no ar

Primeira entrega ponta a ponta: a rota existe, a página renderiza e os quatro KPIs podem ser conferidos contra o SQL. A lib pura nasce junto porque é o que os KPIs consomem — separar em duas tarefas produziria uma tarefa sem nada verificável.

**Arquivos:**
- Criar: `src/lib/almoxarifado.ts`
- Criar: `src/components/almoxarifado/EstoqueKpis.tsx`
- Criar: `src/views/AlmoxarifadoDashboards.tsx`
- Modificar: `src/components/Sidebar.tsx:66-70` (grupo ALMOXARIFADO)
- Modificar: `src/App.tsx` (import `lazy`, `STATE_PRESERVING_PATHS`, `case` de rota)

**Interfaces:**
- Consome: `localDb.fetchEstoque(force?)`, `localDb.fetchEstoqueAnalise(force?)` (Tarefa 1), `EstoqueItem`, `EstoqueAnalise`, `Profile`
- Produz: de `src/lib/almoxarifado.ts` — `ClasseAbc`, `Agregado`, `EstoqueKpi`, `AbcResumo`, `CompraEvitavel`, `DivergenciaPmm`, `LacunaCadastro`, `normalizeCode`, `formatBRL`, `formatBRLCompacto`, `formatQtd`, `formatDateBR`, `formatDateTimeBR`, `classifyABC`, `agregarPor`, `topN`, `calcularKpis`, `resumirAbc`, `acharCompraEvitavel`, `acharDivergenciaPmm`, `acharLacunasCadastro`. Componente `EstoqueKpis`.

- [ ] **Passo 1: Criar `src/lib/almoxarifado.ts`**

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EstoqueItem, EstoqueAnalise, EnrichedSAPRecord } from '../types';

export type ClasseAbc = 'A' | 'B' | 'C';

export const CLASSE_ABC_COR: Record<ClasseAbc, string> = {
  A: '#059669',
  B: '#f59e0b',
  C: '#94a3b8',
};

// Normaliza códigos de material ignorando zeros à esquerda, para que o mesmo
// material escrito '01433206' e '1433206' seja tratado como um só.
export const normalizeCode = (c: any): string => {
  const s = String(c ?? '').trim();
  const stripped = s.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : (s.length > 0 ? '0' : '');
};

export const formatBRL = (v?: number | null): string =>
  v === undefined || v === null || isNaN(v)
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Versão curta para eixos e rótulos de gráfico, onde o valor completo não cabe.
export const formatBRLCompacto = (v?: number | null): string => {
  if (v === undefined || v === null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};

export const formatQtd = (v?: number | null): string =>
  v === undefined || v === null || isNaN(v)
    ? '—'
    : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export const formatDateBR = (d?: string | null): string => {
  if (!d) return '—';
  const parsed = new Date(d);
  return isNaN(parsed.getTime())
    ? String(d)
    : parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatDateTimeBR = (d?: string | null): string => {
  if (!d) return '—';
  const parsed = new Date(d);
  return isNaN(parsed.getTime())
    ? String(d)
    : parsed.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/**
 * Classifica cada material em A, B ou C pelo valor imobilizado acumulado:
 * A até 80% do valor, B até 95%, C o resto.
 *
 * Recebe sempre a posição INTEIRA, nunca o subconjunto filtrado. Se a classe
 * fosse recalculada sobre o filtro, um material classe A viraria C ao filtrar
 * por um depósito onde ele tem pouco saldo, e a letra deixaria de significar
 * algo estável.
 */
export function classifyABC(itens: EstoqueItem[]): Map<string, ClasseAbc> {
  const porMaterial = new Map<string, number>();
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (!mat) return;
    porMaterial.set(mat, (porMaterial.get(mat) || 0) + (i.valor_total || 0));
  });

  const total = Array.from(porMaterial.values()).reduce((a, b) => a + b, 0);
  const mapa = new Map<string, ClasseAbc>();
  if (total <= 0) {
    porMaterial.forEach((_, mat) => mapa.set(mat, 'C'));
    return mapa;
  }

  const ordenado = Array.from(porMaterial.entries()).sort((a, b) => b[1] - a[1]);
  let acumulado = 0;
  ordenado.forEach(([mat, valor]) => {
    acumulado += valor;
    const pct = acumulado / total;
    mapa.set(mat, pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C');
  });
  return mapa;
}

export interface Agregado {
  chave: string;
  itens: number;
  materiais: number;
  valor: number;
  quantidade: number;
}

// Agregação genérica por um campo textual, usada pelos painéis de depósito,
// tipo, classe de item, grupo de mercadoria e aplicação.
export function agregarPor(
  itens: EstoqueItem[],
  campo: keyof EstoqueItem,
  rotuloVazio = 'Não informado'
): Agregado[] {
  const mapa = new Map<string, { itens: number; materiais: Set<string>; valor: number; quantidade: number }>();
  itens.forEach(i => {
    const bruto = i[campo];
    const chave = String(bruto ?? '').trim() || rotuloVazio;
    let atual = mapa.get(chave);
    if (!atual) {
      atual = { itens: 0, materiais: new Set<string>(), valor: 0, quantidade: 0 };
      mapa.set(chave, atual);
    }
    atual.itens += 1;
    const mat = normalizeCode(i.material);
    if (mat) atual.materiais.add(mat);
    atual.valor += i.valor_total || 0;
    atual.quantidade += i.quantidade || 0;
  });
  return Array.from(mapa.entries())
    .map(([chave, v]) => ({ chave, itens: v.itens, materiais: v.materiais.size, valor: v.valor, quantidade: v.quantidade }))
    .sort((a, b) => b.valor - a.valor);
}

// Top N por valor, somando o restante numa linha "Outros". Sem isso, um gráfico
// de 113 grupos de mercadoria vira ruído ilegível.
export function topN(agregados: Agregado[], n: number, rotuloResto = 'Outros'): Agregado[] {
  if (agregados.length <= n) return agregados;
  const topo = agregados.slice(0, n);
  const resto = agregados.slice(n);
  const somaResto: Agregado = {
    chave: rotuloResto,
    itens: resto.reduce((a, r) => a + r.itens, 0),
    materiais: resto.reduce((a, r) => a + r.materiais, 0),
    valor: resto.reduce((a, r) => a + r.valor, 0),
    quantidade: resto.reduce((a, r) => a + r.quantidade, 0),
  };
  return [...topo, somaResto];
}

export interface EstoqueKpi {
  valor: number;
  materiais: number;
  itens: number;
  depositos: number;
  dataPosicao: string | null;
}

export function calcularKpis(itens: EstoqueItem[]): EstoqueKpi {
  const materiais = new Set<string>();
  const depositos = new Set<string>();
  let valor = 0;
  let dataPosicao = '';
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (mat) materiais.add(mat);
    const dep = String(i.deposito ?? '').trim();
    if (dep) depositos.add(dep);
    valor += i.valor_total || 0;
    if (i.imported_at && i.imported_at > dataPosicao) dataPosicao = i.imported_at;
  });
  return {
    valor,
    materiais: materiais.size,
    itens: itens.length,
    depositos: depositos.size,
    dataPosicao: dataPosicao || null,
  };
}

export interface AbcResumo {
  classe: ClasseAbc;
  materiais: number;
  valor: number;
  pctValor: number;
  pctAcumulado: number;
}

// Resume as três classes para o gráfico de Pareto. `mapa` vem de classifyABC
// sobre a posição inteira; `itens` pode estar filtrado.
export function resumirAbc(itens: EstoqueItem[], mapa: Map<string, ClasseAbc>): AbcResumo[] {
  const base: Record<ClasseAbc, { materiais: Set<string>; valor: number }> = {
    A: { materiais: new Set(), valor: 0 },
    B: { materiais: new Set(), valor: 0 },
    C: { materiais: new Set(), valor: 0 },
  };
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (!mat) return;
    const classe = mapa.get(mat) || 'C';
    base[classe].materiais.add(mat);
    base[classe].valor += i.valor_total || 0;
  });
  const total = base.A.valor + base.B.valor + base.C.valor;
  let acumulado = 0;
  return (['A', 'B', 'C'] as ClasseAbc[]).map(classe => {
    acumulado += base[classe].valor;
    return {
      classe,
      materiais: base[classe].materiais.size,
      valor: base[classe].valor,
      pctValor: total > 0 ? (base[classe].valor / total) * 100 : 0,
      pctAcumulado: total > 0 ? (acumulado / total) * 100 : 0,
    };
  });
}

export interface CompraEvitavel {
  material: string;
  descricao: string;
  saldo: number;
  umb: string;
  valorEstoque: number;
  rms: string[];
  qtdSolicitada: number;
}

/**
 * Materiais que têm saldo em estoque e, ao mesmo tempo, requisição de compra
 * aberta. Cada linha é uma compra que talvez não precise acontecer.
 *
 * "Aberta" é `status_requisicao === 'Sem PO'`, o mesmo conceito que o Painel SAP
 * usa. As requisições vêm de `localDb.getEnrichedSAPRequisicoes()`, cujo cache
 * cobre 2026 em diante — o que é adequado, já que RM aberta é recente por
 * definição.
 */
export function acharCompraEvitavel(
  itens: EstoqueItem[],
  requisicoes: EnrichedSAPRecord[]
): CompraEvitavel[] {
  const saldoPorMaterial = new Map<string, { saldo: number; valor: number; descricao: string; umb: string }>();
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (!mat) return;
    const qtd = i.quantidade || 0;
    let atual = saldoPorMaterial.get(mat);
    if (!atual) {
      atual = { saldo: 0, valor: 0, descricao: i.txt_breve_material || '', umb: i.umb || '' };
      saldoPorMaterial.set(mat, atual);
    }
    atual.saldo += qtd;
    atual.valor += i.valor_total || 0;
    if (!atual.descricao && i.txt_breve_material) atual.descricao = i.txt_breve_material;
    if (!atual.umb && i.umb) atual.umb = i.umb;
  });

  const porMaterial = new Map<string, CompraEvitavel>();
  requisicoes.forEach(r => {
    if (r.status_requisicao !== 'Sem PO') return;
    const mat = normalizeCode(r.material_code);
    if (!mat) return;
    const estoque = saldoPorMaterial.get(mat);
    if (!estoque || estoque.saldo <= 0) return;

    let atual = porMaterial.get(mat);
    if (!atual) {
      atual = {
        material: mat,
        descricao: estoque.descricao || r.texto_breve || '',
        saldo: estoque.saldo,
        umb: estoque.umb,
        valorEstoque: estoque.valor,
        rms: [],
        qtdSolicitada: 0,
      };
      porMaterial.set(mat, atual);
    }
    if (r.requisicao_de_compra && !atual.rms.includes(r.requisicao_de_compra)) {
      atual.rms.push(r.requisicao_de_compra);
    }
    atual.qtdSolicitada += r.qtd_requisicao || 0;
  });

  return Array.from(porMaterial.values()).sort((a, b) => b.valorEstoque - a.valorEstoque);
}

export interface DivergenciaPmm {
  material: string;
  descricao: string;
  pmm: number;
  ultimoPreco: number;
  variacao: number;
  dataUltimaCompra: string | null;
  fornecedor: string | null;
  valorEstoque: number;
}

/**
 * Materiais cujo último preço pago se afasta do PMM além da tolerância.
 *
 * Acima da faixa indica PMM subavaliado: o estoque está contabilizado abaixo do
 * custo de reposição. Abaixo indica PMM inflado por compra antiga cara.
 * `variacao` é a fração assinada — 0,35 significa 35% acima do PMM.
 */
export function acharDivergenciaPmm(
  itens: EstoqueItem[],
  analise: EstoqueAnalise[],
  tolerancia = 0.2
): DivergenciaPmm[] {
  const analisePorMaterial = new Map<string, EstoqueAnalise>();
  analise.forEach(a => {
    const mat = normalizeCode(a.material);
    if (mat) analisePorMaterial.set(mat, a);
  });

  const porMaterial = new Map<string, { pmm: number; descricao: string; valor: number }>();
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (!mat) return;
    const pmm = i.preco_medio || 0;
    let atual = porMaterial.get(mat);
    if (!atual) {
      atual = { pmm, descricao: i.txt_breve_material || '', valor: 0 };
      porMaterial.set(mat, atual);
    }
    // O PMM é do material, não da linha: com o mesmo material em vários
    // depósitos, todas as linhas repetem o valor. Guardar o maior evita que uma
    // linha com PMM zerado apague o preço válido das outras.
    if (pmm > atual.pmm) atual.pmm = pmm;
    atual.valor += i.valor_total || 0;
  });

  const resultado: DivergenciaPmm[] = [];
  porMaterial.forEach((dados, mat) => {
    if (dados.pmm <= 0) return;
    const a = analisePorMaterial.get(mat);
    const ultimo = a?.ultimo_preco_unit;
    if (ultimo === undefined || ultimo === null || !(ultimo > 0)) return;
    const variacao = (ultimo - dados.pmm) / dados.pmm;
    if (Math.abs(variacao) < tolerancia) return;
    resultado.push({
      material: mat,
      descricao: dados.descricao,
      pmm: dados.pmm,
      ultimoPreco: ultimo,
      variacao,
      dataUltimaCompra: a?.data_ultima_compra ?? null,
      fornecedor: a?.ultimo_fornecedor ?? null,
      valorEstoque: dados.valor,
    });
  });

  // Maior desvio primeiro: é o que exige revisão de valoração antes.
  return resultado.sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));
}

export interface LacunaCadastro {
  rotulo: string;
  campo: keyof EstoqueItem;
  itens: number;
  valor: number;
}

// Campos que o almoxarifado precisa preenchidos para classificar e controlar o
// item. Governança de estoque começa aqui: sem classe e sem grupo, o item não
// entra em nenhuma política de reposição.
export function acharLacunasCadastro(itens: EstoqueItem[]): LacunaCadastro[] {
  const definicoes: { rotulo: string; campo: keyof EstoqueItem; vazio: (i: EstoqueItem) => boolean }[] = [
    { rotulo: 'Sem classe de item', campo: 'class_item', vazio: i => !String(i.class_item ?? '').trim() },
    { rotulo: 'Sem grupo de mercadoria', campo: 'grupo_mercadorias', vazio: i => !String(i.grupo_mercadorias ?? '').trim() },
    { rotulo: 'Sem preço médio', campo: 'preco_medio', vazio: i => !((i.preco_medio || 0) > 0) },
  ];
  return definicoes.map(d => {
    const atingidos = itens.filter(d.vazio);
    return {
      rotulo: d.rotulo,
      campo: d.campo,
      itens: atingidos.length,
      valor: atingidos.reduce((a, i) => a + (i.valor_total || 0), 0),
    };
  });
}
```

- [ ] **Passo 2: Criar `src/components/almoxarifado/EstoqueKpis.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DollarSign, Package, Warehouse, Clock } from 'lucide-react';
import { EstoqueKpi, formatBRL, formatDateTimeBR } from '../../lib/almoxarifado';

interface EstoqueKpisProps {
  kpi: EstoqueKpi;
}

export default function EstoqueKpis({ kpi }: EstoqueKpisProps) {
  const cards = [
    {
      rotulo: 'Valor Imobilizado',
      valor: formatBRL(kpi.valor),
      detalhe: `${kpi.itens.toLocaleString('pt-BR')} linhas de estoque`,
      icone: DollarSign,
      barra: 'bg-emerald-500 dark:bg-emerald-600',
      cor: 'text-emerald-600 dark:text-emerald-500',
    },
    {
      rotulo: 'Materiais',
      valor: kpi.materiais.toLocaleString('pt-BR'),
      detalhe: 'códigos distintos com saldo',
      icone: Package,
      barra: 'bg-blue-500 dark:bg-blue-600',
      cor: 'text-slate-800 dark:text-slate-100',
    },
    {
      rotulo: 'Depósitos',
      valor: kpi.depositos.toLocaleString('pt-BR'),
      detalhe: 'locais de armazenagem',
      icone: Warehouse,
      barra: 'bg-violet-500 dark:bg-violet-600',
      cor: 'text-slate-800 dark:text-slate-100',
    },
    {
      rotulo: 'Data da Posição',
      valor: formatDateTimeBR(kpi.dataPosicao),
      detalhe: 'última importação ZL0024',
      icone: Clock,
      barra: 'bg-slate-400 dark:bg-slate-700',
      cor: 'text-slate-800 dark:text-slate-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {cards.map(c => {
        const Icone = c.icone;
        return (
          <div
            key={c.rotulo}
            className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden"
          >
            <div className={`absolute top-0 left-0 w-1.5 h-full ${c.barra}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <Icone className="h-3 w-3" /> {c.rotulo}
            </span>
            <p className={`text-xl font-black mt-2 leading-tight ${c.cor}`}>{c.valor}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{c.detalhe}</p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Passo 3: Criar `src/views/AlmoxarifadoDashboards.tsx`**

Versão inicial: carrega, calcula os KPIs, renderiza. Os painéis das tarefas seguintes entram aqui.

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LayoutDashboard, RefreshCw, AlertCircle, Boxes } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, EstoqueItem, EstoqueAnalise, EnrichedSAPRecord } from '../types';
import { calcularKpis } from '../lib/almoxarifado';
import EstoqueKpis from '../components/almoxarifado/EstoqueKpis';

interface AlmoxarifadoDashboardsProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function AlmoxarifadoDashboards({ user, onNavigate }: AlmoxarifadoDashboardsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EstoqueItem[]>([]);
  const [analise, setAnalise] = useState<EstoqueAnalise[]>([]);
  const [requisicoes, setRequisicoes] = useState<EnrichedSAPRecord[]>([]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      // A análise falha de forma isolada: sem ela apenas o painel de PMM degrada,
      // então não deve derrubar o carregamento do estoque.
      const [estoque, analiseRows] = await Promise.all([
        localDb.fetchEstoque(force),
        localDb.fetchEstoqueAnalise(force).catch(() => [] as EstoqueAnalise[]),
      ]);
      setRows(estoque);
      setAnalise(analiseRows);
      setRequisicoes(localDb.getEnrichedSAPRequisicoes());
    } catch (e: any) {
      console.error('Erro ao carregar os dashboards do almoxarifado:', e);
      setError('Falha ao carregar a posição de estoque. Tente atualizar novamente.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const kpi = useMemo(() => calcularKpis(rows), [rows]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-50 flex items-center gap-2.5">
            <LayoutDashboard className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Dashboards do Almoxarifado
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Onde está o valor imobilizado, quais itens exigem controle e negociação, e que compras estão sendo feitas contra saldo existente.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center p-20 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl space-y-4">
          <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Carregando indicadores...</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-center">
          <Boxes className="h-12 w-12 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-full mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Nenhuma posição de estoque disponível</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
            Importe a posição de estoque (transação ZL0024) na aba "Importar SAP" do painel administrativo.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <EstoqueKpis kpi={kpi} />
        </>
      )}
    </div>
  );
}
```

Nesta tarefa `analise`, `requisicoes`, `user` e `onNavigate` ainda não são lidos pelos painéis — o typecheck não reclama de variáveis de estado não usadas, e as tarefas 3 a 10 as consomem. Não remova.

- [ ] **Passo 4: Adicionar o item na sidebar**

Em `src/components/Sidebar.tsx`, no grupo ALMOXARIFADO (linhas 66-70), adicione o segundo item depois de Estoque:

```tsx
    {
      group: 'ALMOXARIFADO',
      items: [
        { label: 'Estoque', path: '/almoxarifado/estoque', icon: Boxes, perm: { module: 'almoxarifado', action: 'visualizar' } },
        { label: 'Dashboards', path: '/almoxarifado/dashboards', icon: LayoutDashboard, perm: { module: 'almoxarifado', action: 'visualizar' } },
      ],
    },
```

`LayoutDashboard` já está no import do lucide-react na linha 9 — não duplique.

- [ ] **Passo 5: Registrar a rota em `src/App.tsx`**

Três edições, seguindo exatamente o que já existe para `Estoque`:

Junto dos outros `lazy()`:

```tsx
const AlmoxarifadoDashboards = lazy(() => import('./views/AlmoxarifadoDashboards'));
```

Em `STATE_PRESERVING_PATHS`, ao lado de `'/almoxarifado/estoque'`, adicione `'/almoxarifado/dashboards'`. Sem isso os filtros da Tarefa 6 são perdidos a cada sync em background.

E o `case`, imediatamente depois do `case '/almoxarifado/estoque'`:

```tsx
      case '/almoxarifado/dashboards':
        if (localDb.hasPermission(user, 'almoxarifado', 'visualizar')) {
          return <AlmoxarifadoDashboards user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
```

- [ ] **Passo 6: Rodar o typecheck**

```bash
npm run lint
```

Esperado: nenhum erro.

- [ ] **Passo 7: Conferir os KPIs contra o SQL**

Rode `npm run dev`, faça login e abra `#/almoxarifado/dashboards`.

Gabarito, obtido com:

```sql
select count(*) itens, count(distinct material) materiais,
       count(distinct deposito) depositos, sum(valor_total) valor,
       max(imported_at) posicao
from estoque;
```

A tela tem que mostrar Valor Imobilizado **R$ 17.889.351,14**, Materiais **2.052**, Depósitos **12** e "2.292 linhas de estoque" no detalhe do primeiro card.

Se Materiais vier 2.052 no SQL mas diferente na tela, a causa provável é `normalizeCode` colapsando códigos que o Postgres conta como distintos — compare rodando `select count(distinct ltrim(material,'0')) from estoque;`, que deve dar o mesmo 2.052.

Confirme também que o menu lateral mostra "Dashboards" sob ALMOXARIFADO e que a página funciona nos temas claro e escuro (alterne no rodapé da sidebar).

- [ ] **Passo 8: Commit**

```bash
git add src/lib/almoxarifado.ts src/components/almoxarifado/EstoqueKpis.tsx src/views/AlmoxarifadoDashboards.tsx src/components/Sidebar.tsx src/App.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): pagina de dashboards com KPIs de estoque

Lib pura em src/lib/almoxarifado.ts concentra a matematica (ABC,
agregacoes, cruzamentos) sem React, para que a pagina Estoque possa
reusar a classificacao ABC sem duplicar a regra.

Rota /almoxarifado/dashboards com lazy, permissao almoxarifado.visualizar
e entrada em STATE_PRESERVING_PATHS.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 3: Curva ABC

O gráfico que responde onde vale a pena contar estoque e negociar preço: 12% dos materiais concentram 80% do valor.

**Arquivos:**
- Criar: `src/components/almoxarifado/CurvaAbcChart.tsx`
- Modificar: `src/views/AlmoxarifadoDashboards.tsx`

**Interfaces:**
- Consome: `classifyABC`, `resumirAbc`, `AbcResumo`, `ClasseAbc`, `CLASSE_ABC_COR`, `formatBRL`, `formatBRLCompacto` de `src/lib/almoxarifado.ts`
- Produz: componente `CurvaAbcChart({ resumo, onSelecionar })`, onde `onSelecionar?: (classe: ClasseAbc) => void`

- [ ] **Passo 1: Criar `src/components/almoxarifado/CurvaAbcChart.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell, ResponsiveContainer } from 'recharts';
import { AbcResumo, ClasseAbc, CLASSE_ABC_COR, formatBRL, formatBRLCompacto } from '../../lib/almoxarifado';

interface CurvaAbcChartProps {
  resumo: AbcResumo[];
  onSelecionar?: (classe: ClasseAbc) => void;
}

const DESCRICAO: Record<ClasseAbc, string> = {
  A: 'Alto valor — contagem frequente e negociação',
  B: 'Valor intermediário — controle periódico',
  C: 'Baixo valor — controle simplificado',
};

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as AbcResumo;
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Classe {row.classe}</div>
      <div style={{ color: '#475569' }}>{DESCRICAO[row.classe]}</div>
      <div style={{ marginTop: 4, color: '#0f172a' }}>{formatBRL(row.valor)} — {row.pctValor.toFixed(1)}% do valor</div>
      <div style={{ color: '#475569' }}>{row.materiais.toLocaleString('pt-BR')} materiais</div>
      <div style={{ color: '#475569' }}>Acumulado: {row.pctAcumulado.toFixed(1)}%</div>
    </div>
  );
}

export default function CurvaAbcChart({ resumo, onSelecionar }: CurvaAbcChartProps) {
  const total = resumo.reduce((a, r) => a + r.valor, 0);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Curva ABC</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Classificação por valor imobilizado acumulado — A até 80%, B até 95%, C o restante. Clique numa classe para ver os itens.
        </p>
      </div>

      {total <= 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400 dark:text-slate-500">
          Nenhum item no filtro selecionado.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={resumo} margin={{ top: 28, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="classe" tick={{ fontSize: 12, fill: '#334155', fontWeight: 700 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
              <YAxis yAxisId="valor" tickFormatter={(v: number) => formatBRLCompacto(v)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={72} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" formatter={(v: string) => (v === 'valor' ? 'Valor imobilizado' : '% acumulado')} />
              <Bar
                yAxisId="valor"
                dataKey="valor"
                maxBarSize={96}
                radius={[4, 4, 0, 0]}
                cursor={onSelecionar ? 'pointer' : undefined}
                onClick={(d: any) => onSelecionar?.(d?.payload?.classe)}
              >
                {resumo.map(r => <Cell key={r.classe} fill={CLASSE_ABC_COR[r.classe]} />)}
                <LabelList
                  dataKey="pctValor"
                  position="top"
                  formatter={(v: number) => (v > 0 ? `${v.toFixed(0)}%` : '')}
                  style={{ fontSize: 12, fontWeight: 700, fill: '#0f172a' }}
                />
              </Bar>
              <Line yAxisId="pct" dataKey="pctAcumulado" stroke="#0f172a" strokeWidth={2} dot={{ r: 4, fill: '#0f172a' }} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {resumo.map(r => (
              <button
                key={r.classe}
                onClick={() => onSelecionar?.(r.classe)}
                className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black" style={{ color: CLASSE_ABC_COR[r.classe] }}>Classe {r.classe}</span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{r.pctValor.toFixed(1)}% do valor</span>
                </div>
                <p className="text-base font-black text-slate-800 dark:text-slate-100 mt-1">{r.materiais.toLocaleString('pt-BR')} materiais</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatBRL(r.valor)}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 group-hover:underline">{DESCRICAO[r.classe]}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: Ligar na página**

Em `src/views/AlmoxarifadoDashboards.tsx`, adicione o import:

```tsx
import { calcularKpis, classifyABC, resumirAbc, ClasseAbc } from '../lib/almoxarifado';
import CurvaAbcChart from '../components/almoxarifado/CurvaAbcChart';
```

Depois do `useMemo` de `kpi`, adicione:

```tsx
  // Classificação sobre a posição inteira (`rows`), nunca sobre o filtro — ver
  // classifyABC. O resumo, sim, respeita o filtro vigente.
  const mapaAbc = useMemo(() => classifyABC(rows), [rows]);
  const resumoAbc = useMemo(() => resumirAbc(rows, mapaAbc), [rows, mapaAbc]);

  const irParaEstoque = useCallback((query: string) => {
    onNavigate(`/almoxarifado/estoque?${query}`);
  }, [onNavigate]);

  const abrirClasseAbc = useCallback((classe: ClasseAbc) => {
    irParaEstoque(`abc=${classe}`);
  }, [irParaEstoque]);
```

E dentro do bloco `rows.length > 0`, depois de `<EstoqueKpis kpi={kpi} />`:

```tsx
          <CurvaAbcChart resumo={resumoAbc} onSelecionar={abrirClasseAbc} />
```

O drill-down por `?abc=` só passa a filtrar de fato na Tarefa 10; até lá a navegação abre a página Estoque sem filtro, o que é esperado.

- [ ] **Passo 3: Rodar o typecheck**

```bash
npm run lint
```

- [ ] **Passo 4: Conferir contra o SQL**

Gabarito:

```sql
with m as (select material, sum(valor_total) v from estoque group by 1),
c as (select material, v, sum(v) over (order by v desc) / (select sum(v) from m) cum from m)
select count(*) filter (where cum <= 0.8) a,
       count(*) filter (where cum > 0.8 and cum <= 0.95) b,
       count(*) filter (where cum > 0.95) c
from c;
```

A tela tem que mostrar **A = 254 · B = 529 · C = 1.269** materiais, a linha de acumulado terminando em 100%, e o rótulo da barra A perto de 80%.

- [ ] **Passo 5: Commit**

```bash
git add src/components/almoxarifado/CurvaAbcChart.tsx src/views/AlmoxarifadoDashboards.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): curva ABC no dashboard

Pareto de valor imobilizado com barras por classe e linha de acumulado.
A classificacao roda sempre sobre a posicao inteira: recalculada sobre o
subconjunto filtrado, um material A viraria C ao filtrar por um deposito
onde tem pouco saldo, e a letra perderia sentido.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 4: Valor por depósito

Revela perfis de controle opostos sob o mesmo teto: o depósito 0004 guarda R$ 7,70 M em 1.488 itens; o 0090, R$ 2,86 M em 30.

**Arquivos:**
- Criar: `src/components/almoxarifado/ValorPorDepositoChart.tsx`
- Modificar: `src/views/AlmoxarifadoDashboards.tsx`

**Interfaces:**
- Consome: `Agregado`, `agregarPor`, `formatBRL`, `formatBRLCompacto` de `src/lib/almoxarifado.ts`
- Produz: componente `ValorPorDepositoChart({ dados, onSelecionar })`, onde `onSelecionar?: (deposito: string) => void`

- [ ] **Passo 1: Criar `src/components/almoxarifado/ValorPorDepositoChart.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { Agregado, formatBRL, formatBRLCompacto, formatQtd } from '../../lib/almoxarifado';

interface ValorPorDepositoChartProps {
  dados: Agregado[];
  onSelecionar?: (deposito: string) => void;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Agregado;
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Depósito {row.chave}</div>
      <div style={{ color: '#0f172a' }}>{formatBRL(row.valor)}</div>
      <div style={{ color: '#475569' }}>{row.itens.toLocaleString('pt-BR')} itens · {row.materiais.toLocaleString('pt-BR')} materiais</div>
      <div style={{ color: '#475569' }}>Quantidade: {formatQtd(row.quantidade)}</div>
    </div>
  );
}

export default function ValorPorDepositoChart({ dados, onSelecionar }: ValorPorDepositoChartProps) {
  const altura = Math.max(240, dados.length * 32 + 40);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Valor por Depósito</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Onde o capital está fisicamente parado. Clique num depósito para ver seus itens.
        </p>
      </div>

      {dados.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400 dark:text-slate-500">
          Nenhum item no filtro selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 88, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tickFormatter={(v: number) => formatBRLCompacto(v)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="chave" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey="valor"
              fill="#059669"
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              cursor={onSelecionar ? 'pointer' : undefined}
              onClick={(d: any) => onSelecionar?.(d?.payload?.chave)}
            >
              <LabelList
                dataKey="valor"
                position="right"
                formatter={(v: number) => formatBRLCompacto(v)}
                style={{ fontSize: 11, fontWeight: 600, fill: '#475569' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: Ligar na página**

Imports:

```tsx
import { calcularKpis, classifyABC, resumirAbc, agregarPor, ClasseAbc } from '../lib/almoxarifado';
import ValorPorDepositoChart from '../components/almoxarifado/ValorPorDepositoChart';
```

Depois de `resumoAbc`:

```tsx
  const porDeposito = useMemo(() => agregarPor(rows, 'deposito'), [rows]);
```

E no JSX, depois de `<CurvaAbcChart ... />`:

```tsx
          <ValorPorDepositoChart
            dados={porDeposito}
            onSelecionar={(dep) => irParaEstoque(`deposito=${encodeURIComponent(dep)}`)}
          />
```

- [ ] **Passo 3: Rodar o typecheck**

```bash
npm run lint
```

- [ ] **Passo 4: Conferir contra o SQL**

```sql
select deposito, count(*) itens, sum(valor_total) valor
from estoque group by 1 order by valor desc nulls last limit 3;
```

Esperado no topo: **0004 — R$ 7.701.437,90 / 1.488 itens**, depois **0090 — R$ 2.858.203,56 / 30 itens**, depois **0005 — R$ 1.717.786,65 / 17 itens**. A tela mostra na mesma ordem e o tooltip do 0004 tem que trazer esses dois números.

- [ ] **Passo 5: Commit**

```bash
git add src/components/almoxarifado/ValorPorDepositoChart.tsx src/views/AlmoxarifadoDashboards.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): grafico de valor por deposito

Barras horizontais ordenadas por valor, com itens e materiais no tooltip.
Torna visivel a diferenca de perfil entre depositos: 0004 concentra
R$ 7,70 M em 1.488 itens; 0090, R$ 2,86 M em apenas 30.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 5: Composição e concentração por categoria

Dois painéis irmãos que respondem "que natureza de material é esse dinheiro". Vão juntos porque compartilham o componente de barra proporcional e um revisor não aprovaria um sem o outro.

**Arquivos:**
- Criar: `src/components/almoxarifado/ComposicaoChart.tsx`
- Criar: `src/components/almoxarifado/ConcentracaoChart.tsx`
- Modificar: `src/views/AlmoxarifadoDashboards.tsx`

**Interfaces:**
- Consome: `Agregado`, `agregarPor`, `topN`, `formatBRL`, `formatBRLCompacto` de `src/lib/almoxarifado.ts`
- Produz: `ComposicaoChart({ porTipo, porClasse, onSelecionarTipo, onSelecionarClasse })` e `ConcentracaoChart({ titulo, subtitulo, dados, onSelecionar })`

- [ ] **Passo 1: Criar `src/components/almoxarifado/ConcentracaoChart.tsx`**

Componente genérico de ranking, reutilizado para grupo de mercadoria e aplicação.

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Agregado, formatBRL } from '../../lib/almoxarifado';

interface ConcentracaoChartProps {
  titulo: string;
  subtitulo: string;
  dados: Agregado[];
  // 'Outros' agrega várias categorias, então não é um destino de filtro válido.
  onSelecionar?: (chave: string) => void;
}

export default function ConcentracaoChart({ titulo, subtitulo, dados, onSelecionar }: ConcentracaoChartProps) {
  const maior = dados.reduce((m, d) => Math.max(m, d.valor), 0);
  const total = dados.reduce((a, d) => a + d.valor, 0);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{titulo}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitulo}</p>
      </div>

      {dados.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400 dark:text-slate-500">
          Nenhum item no filtro selecionado.
        </div>
      ) : (
        <div className="space-y-2.5">
          {dados.map(d => {
            const largura = maior > 0 ? (d.valor / maior) * 100 : 0;
            const pct = total > 0 ? (d.valor / total) * 100 : 0;
            const agregado = d.chave === 'Outros';
            const clicavel = !!onSelecionar && !agregado;
            return (
              <button
                key={d.chave}
                onClick={clicavel ? () => onSelecionar?.(d.chave) : undefined}
                disabled={!clicavel}
                className={`w-full text-left group ${clicavel ? 'cursor-pointer' : 'cursor-default'}`}
                title={clicavel ? `Ver itens de ${d.chave}` : undefined}
              >
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className={`truncate font-semibold ${agregado ? 'text-slate-400 dark:text-slate-500 italic' : 'text-slate-700 dark:text-slate-300'} ${clicavel ? 'group-hover:text-emerald-600 dark:group-hover:text-emerald-500' : ''}`}>
                    {d.chave}
                  </span>
                  <span className="shrink-0 font-bold text-slate-600 dark:text-slate-400 tabular-nums">
                    {formatBRL(d.valor)} <span className="text-slate-400 dark:text-slate-500 font-medium">({pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${agregado ? 'bg-slate-300 dark:bg-slate-700' : 'bg-emerald-500 dark:bg-emerald-600'}`}
                    style={{ width: `${largura}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  {d.itens.toLocaleString('pt-BR')} itens · {d.materiais.toLocaleString('pt-BR')} materiais
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: Criar `src/components/almoxarifado/ComposicaoChart.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Agregado, formatBRL } from '../../lib/almoxarifado';

interface ComposicaoChartProps {
  porTipo: Agregado[];
  porClasse: Agregado[];
  onSelecionarTipo?: (tipo: string) => void;
  onSelecionarClasse?: (classe: string) => void;
}

const CORES = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#94a3b8'];

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Agregado;
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{row.chave}</div>
      <div style={{ color: '#0f172a' }}>{formatBRL(row.valor)}</div>
      <div style={{ color: '#475569' }}>{row.itens.toLocaleString('pt-BR')} itens · {row.materiais.toLocaleString('pt-BR')} materiais</div>
    </div>
  );
}

function Rosca({ titulo, dados, onSelecionar }: { titulo: string; dados: Agregado[]; onSelecionar?: (chave: string) => void }) {
  const total = dados.reduce((a, d) => a + d.valor, 0);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">{titulo}</p>
      {total <= 0 ? (
        <div className="flex items-center justify-center h-56 text-sm text-slate-400 dark:text-slate-500">Sem dados.</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="chave"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              cursor={onSelecionar ? 'pointer' : undefined}
              onClick={(d: any) => onSelecionar?.(d?.payload?.chave)}
            >
              {dados.map((d, i) => <Cell key={d.chave} fill={CORES[i % CORES.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function ComposicaoChart({ porTipo, porClasse, onSelecionarTipo, onSelecionarClasse }: ComposicaoChartProps) {
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Composição do Valor</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Natureza do material e classificação contábil do item. Clique numa fatia para ver os itens.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Rosca titulo="Por tipo de material" dados={porTipo} onSelecionar={onSelecionarTipo} />
        <Rosca titulo="Por classe de item" dados={porClasse} onSelecionar={onSelecionarClasse} />
      </div>
    </div>
  );
}
```

- [ ] **Passo 3: Ligar na página**

Imports:

```tsx
import { calcularKpis, classifyABC, resumirAbc, agregarPor, topN, ClasseAbc } from '../lib/almoxarifado';
import ComposicaoChart from '../components/almoxarifado/ComposicaoChart';
import ConcentracaoChart from '../components/almoxarifado/ConcentracaoChart';
```

Depois de `porDeposito`:

```tsx
  const porTipo = useMemo(() => agregarPor(rows, 'tipo_material'), [rows]);
  const porClasse = useMemo(() => agregarPor(rows, 'class_item', 'Sem classe'), [rows]);
  // Top 10 mais "Outros": são 113 grupos de mercadoria e 62 aplicações, e o
  // ranking inteiro seria ilegível.
  const porGrupo = useMemo(() => topN(agregarPor(rows, 'grupo_mercadorias'), 10), [rows]);
  const porAplicacao = useMemo(() => topN(agregarPor(rows, 'aplicacao'), 10), [rows]);
```

No JSX, depois de `<ValorPorDepositoChart ... />`:

```tsx
          <ComposicaoChart
            porTipo={porTipo}
            porClasse={porClasse}
            onSelecionarTipo={(t) => irParaEstoque(`tipo=${encodeURIComponent(t)}`)}
            onSelecionarClasse={(c) => irParaEstoque(`classe=${encodeURIComponent(c)}`)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ConcentracaoChart
              titulo="Concentração por Grupo de Mercadoria"
              subtitulo="Top 10 grupos por valor imobilizado; os demais somados em Outros."
              dados={porGrupo}
              onSelecionar={(g) => irParaEstoque(`grupo=${encodeURIComponent(g)}`)}
            />
            <ConcentracaoChart
              titulo="Concentração por Aplicação"
              subtitulo="Top 10 aplicações por valor imobilizado; as demais somadas em Outros."
              dados={porAplicacao}
            />
          </div>
```

A concentração por aplicação não recebe `onSelecionar` porque a página Estoque não tem filtro por aplicação — botão que não filtra nada é pior que botão ausente.

- [ ] **Passo 4: Rodar o typecheck**

```bash
npm run lint
```

- [ ] **Passo 5: Conferir contra o SQL**

```sql
select tipo_material, count(*) itens, sum(valor_total) valor
from estoque group by 1 order by valor desc;

select coalesce(nullif(trim(class_item),''),'Sem classe') classe,
       count(*) itens, sum(valor_total) valor
from estoque group by 1 order by valor desc;
```

Na rosca de tipo, "Materiais Consumo" tem que ser a maior fatia: **R$ 6.915.931,39** em **1.414 itens**, somando suas quatro classes de item. Na rosca de classe, "Sem classe" tem que aparecer com **82 itens** e **R$ 223.990,92** — se aparecer como fatia vazia ou ausente, o `rotuloVazio` de `agregarPor` não foi passado.

No painel de grupos, confirme que a última linha é "Outros", em itálico e não clicável.

- [ ] **Passo 6: Commit**

```bash
git add src/components/almoxarifado/ComposicaoChart.tsx src/components/almoxarifado/ConcentracaoChart.tsx src/views/AlmoxarifadoDashboards.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): composicao e concentracao por categoria

Roscas de tipo de material e classe de item, mais ranking dos 10 maiores
grupos de mercadoria e aplicacoes. O restante entra numa linha Outros:
com 113 grupos, o ranking completo seria ilegivel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 6: Top 15 materiais

**Arquivos:**
- Criar: `src/components/almoxarifado/TopMateriaisChart.tsx`
- Modificar: `src/views/AlmoxarifadoDashboards.tsx`

**Interfaces:**
- Consome: `EstoqueItem`, `ClasseAbc`, `CLASSE_ABC_COR`, `normalizeCode`, `formatBRL`, `formatQtd` de `src/lib/almoxarifado.ts`
- Produz: `TopMateriaisChart({ itens, mapaAbc, onSelecionar })`, com `TopMaterial` interno

- [ ] **Passo 1: Criar `src/components/almoxarifado/TopMateriaisChart.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { EstoqueItem } from '../../types';
import { ClasseAbc, CLASSE_ABC_COR, normalizeCode, formatBRL, formatQtd } from '../../lib/almoxarifado';

interface TopMateriaisChartProps {
  itens: EstoqueItem[];
  mapaAbc: Map<string, ClasseAbc>;
  onSelecionar?: (material: string) => void;
}

interface TopMaterial {
  material: string;
  descricao: string;
  valor: number;
  quantidade: number;
  umb: string;
  classe: ClasseAbc;
}

const LIMITE = 15;

export default function TopMateriaisChart({ itens, mapaAbc, onSelecionar }: TopMateriaisChartProps) {
  const top = useMemo<TopMaterial[]>(() => {
    const mapa = new Map<string, TopMaterial>();
    itens.forEach(i => {
      const mat = normalizeCode(i.material);
      if (!mat) return;
      let atual = mapa.get(mat);
      if (!atual) {
        atual = {
          material: mat,
          descricao: i.txt_breve_material || '',
          valor: 0,
          quantidade: 0,
          umb: i.umb || '',
          classe: mapaAbc.get(mat) || 'C',
        };
        mapa.set(mat, atual);
      }
      atual.valor += i.valor_total || 0;
      atual.quantidade += i.quantidade || 0;
      if (!atual.descricao && i.txt_breve_material) atual.descricao = i.txt_breve_material;
      if (!atual.umb && i.umb) atual.umb = i.umb;
    });
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor).slice(0, LIMITE);
  }, [itens, mapaAbc]);

  const maior = top.length > 0 ? top[0].valor : 0;

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Top {LIMITE} Materiais por Valor</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Os itens que mais imobilizam capital. Clique num material para abrir sua posição detalhada.
        </p>
      </div>

      {top.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400 dark:text-slate-500">
          Nenhum item no filtro selecionado.
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((m, idx) => (
            <button
              key={m.material}
              onClick={() => onSelecionar?.(m.material)}
              className="w-full text-left group cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              title={`Ver ${m.material} na posição de estoque`}
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="w-6 shrink-0 text-[10px] font-bold text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0 group-hover:text-emerald-600 dark:group-hover:text-emerald-500">
                  {m.material}
                </span>
                <span
                  className="shrink-0 rounded px-1 py-0.5 text-[9px] font-black text-white"
                  style={{ backgroundColor: CLASSE_ABC_COR[m.classe] }}
                  title={`Classe ${m.classe}`}
                >
                  {m.classe}
                </span>
                <span className="truncate text-slate-600 dark:text-slate-400 flex-1">{m.descricao || '—'}</span>
                <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-500 tabular-nums">{formatBRL(m.valor)}</span>
              </div>
              <div className="mt-1 ml-8 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 dark:bg-emerald-600"
                  style={{ width: `${maior > 0 ? (m.valor / maior) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-0.5 ml-8 text-[10px] text-slate-400 dark:text-slate-500">
                Saldo: {formatQtd(m.quantidade)} {m.umb}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: Ligar na página**

Import:

```tsx
import TopMateriaisChart from '../components/almoxarifado/TopMateriaisChart';
```

No JSX, depois do bloco de `ConcentracaoChart`:

```tsx
          <TopMateriaisChart
            itens={rows}
            mapaAbc={mapaAbc}
            onSelecionar={(mat) => irParaEstoque(`material=${encodeURIComponent(mat)}`)}
          />
```

- [ ] **Passo 3: Rodar o typecheck**

```bash
npm run lint
```

- [ ] **Passo 4: Conferir contra o SQL**

```sql
select material, max(txt_breve_material) descricao, sum(valor_total) valor
from estoque group by 1 order by valor desc limit 3;
```

Os três primeiros da tela têm que ser os mesmos códigos e valores, todos com badge **A**, e a barra do primeiro ocupando 100% da largura.

- [ ] **Passo 5: Commit**

```bash
git add src/components/almoxarifado/TopMateriaisChart.tsx src/views/AlmoxarifadoDashboards.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): top 15 materiais por valor imobilizado

Ranking com badge da classe ABC, saldo e barra proporcional. Cada linha
navega para a posicao detalhada do material.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 7: Barra de filtros compartilhada

Todos os painéis passam a responder ao mesmo recorte. Vem depois dos painéis descritivos porque só faz sentido filtrar o que já existe na tela.

**Arquivos:**
- Modificar: `src/views/AlmoxarifadoDashboards.tsx`

**Interfaces:**
- Consome: `classifyABC` e `ClasseAbc` já importados; `Agregado`
- Produz: estado `filtrados: EstoqueItem[]`, consumido por todos os painéis já ligados

- [ ] **Passo 1: Adicionar o estado dos filtros**

Em `src/views/AlmoxarifadoDashboards.tsx`, depois do estado `requisicoes`:

```tsx
  // Filtros compartilhados por todos os painéis.
  const [depositoFiltro, setDepositoFiltro] = useState('Todos');
  const [tipoFiltro, setTipoFiltro] = useState('Todos');
  const [classeFiltro, setClasseFiltro] = useState('Todos');
  const [abcFiltro, setAbcFiltro] = useState<'Todos' | ClasseAbc>('Todos');
  const [grupoFiltro, setGrupoFiltro] = useState('Todos');
```

- [ ] **Passo 2: Derivar as opções e aplicar o filtro**

Depois do `useMemo` de `mapaAbc` (que continua sobre `rows`, a posição inteira):

```tsx
  const opcoes = useMemo(() => {
    const depositos = new Set<string>();
    const tipos = new Set<string>();
    const classes = new Set<string>();
    const grupos = new Set<string>();
    rows.forEach(r => {
      if (r.deposito) depositos.add(r.deposito);
      if (r.tipo_material) tipos.add(r.tipo_material);
      if (r.class_item) classes.add(r.class_item);
      if (r.grupo_mercadorias) grupos.add(r.grupo_mercadorias);
    });
    const ordenar = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { depositos: ordenar(depositos), tipos: ordenar(tipos), classes: ordenar(classes), grupos: ordenar(grupos) };
  }, [rows]);

  const filtrados = useMemo(() => rows.filter(r => {
    if (depositoFiltro !== 'Todos' && r.deposito !== depositoFiltro) return false;
    if (tipoFiltro !== 'Todos' && r.tipo_material !== tipoFiltro) return false;
    if (classeFiltro !== 'Todos' && r.class_item !== classeFiltro) return false;
    if (grupoFiltro !== 'Todos' && r.grupo_mercadorias !== grupoFiltro) return false;
    if (abcFiltro !== 'Todos' && mapaAbc.get(normalizeCode(r.material)) !== abcFiltro) return false;
    return true;
  }), [rows, depositoFiltro, tipoFiltro, classeFiltro, grupoFiltro, abcFiltro, mapaAbc]);

  const filtroAtivo = depositoFiltro !== 'Todos' || tipoFiltro !== 'Todos'
    || classeFiltro !== 'Todos' || grupoFiltro !== 'Todos' || abcFiltro !== 'Todos';

  const limparFiltros = useCallback(() => {
    setDepositoFiltro('Todos');
    setTipoFiltro('Todos');
    setClasseFiltro('Todos');
    setGrupoFiltro('Todos');
    setAbcFiltro('Todos');
  }, []);
```

Adicione `normalizeCode` ao import de `../lib/almoxarifado`.

- [ ] **Passo 3: Trocar `rows` por `filtrados` nos cálculos dos painéis**

`mapaAbc` continua sobre `rows` — é a única exceção, e o comentário em `classifyABC` explica por quê. Todos os outros passam a usar `filtrados`:

```tsx
  const kpi = useMemo(() => calcularKpis(filtrados), [filtrados]);
  const resumoAbc = useMemo(() => resumirAbc(filtrados, mapaAbc), [filtrados, mapaAbc]);
  const porDeposito = useMemo(() => agregarPor(filtrados, 'deposito'), [filtrados]);
  const porTipo = useMemo(() => agregarPor(filtrados, 'tipo_material'), [filtrados]);
  const porClasse = useMemo(() => agregarPor(filtrados, 'class_item', 'Sem classe'), [filtrados]);
  const porGrupo = useMemo(() => topN(agregarPor(filtrados, 'grupo_mercadorias'), 10), [filtrados]);
  const porAplicacao = useMemo(() => topN(agregarPor(filtrados, 'aplicacao'), 10), [filtrados]);
```

E na chamada do top de materiais, troque `itens={rows}` por `itens={filtrados}`.

Atenção à ordem de declaração: `filtrados` tem que ser declarado antes de qualquer `useMemo` que o use, senão o TypeScript acusa uso antes da declaração (`Block-scoped variable used before its declaration`).

- [ ] **Passo 4: Renderizar a barra de filtros**

No JSX, dentro do bloco `rows.length > 0`, imediatamente antes de `<EstoqueKpis ... />`:

```tsx
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <Filter className="h-3 w-3" /> Filtros
            </span>

            <select value={depositoFiltro} onChange={e => setDepositoFiltro(e.target.value)} className={selectClass}>
              <option value="Todos">Depósito: Todos</option>
              {opcoes.depositos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className={selectClass}>
              <option value="Todos">Tipo: Todos</option>
              {opcoes.tipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select value={classeFiltro} onChange={e => setClasseFiltro(e.target.value)} className={selectClass}>
              <option value="Todos">Class. Item: Todos</option>
              {opcoes.classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={abcFiltro} onChange={e => setAbcFiltro(e.target.value as 'Todos' | ClasseAbc)} className={selectClass}>
              <option value="Todos">Curva ABC: Todas</option>
              <option value="A">Classe A</option>
              <option value="B">Classe B</option>
              <option value="C">Classe C</option>
            </select>

            <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)} className={selectClass}>
              <option value="Todos">Grupo: Todos</option>
              {opcoes.grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            {filtroAtivo && (
              <button
                onClick={limparFiltros}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                <X className="h-3.5 w-3.5" /> Limpar
              </button>
            )}

            <span className="ml-auto text-xs font-bold text-slate-400 dark:text-slate-500">
              {filtrados.length.toLocaleString('pt-BR')} de {rows.length.toLocaleString('pt-BR')} itens
            </span>
          </div>
```

Declare `selectClass` acima do `return`, junto das outras constantes do componente:

```tsx
  const selectClass = 'rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 py-2 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer';
```

E adicione `Filter` e `X` ao import do lucide-react no topo do arquivo.

- [ ] **Passo 5: Rodar o typecheck**

```bash
npm run lint
```

- [ ] **Passo 6: Verificar no navegador**

Selecione Depósito **0004**. Esperado: o contador mostra "1.488 de 2.292 itens" e o KPI de Valor Imobilizado cai para **R$ 7.701.437,90**.

Com esse filtro ativo, selecione Curva ABC **Classe A** e confirme que o painel de curva ABC passa a mostrar zero material em B e C — se B ou C continuarem povoados, o filtro ABC está usando um mapa recalculado sobre o subconjunto em vez do mapa global.

Clique em "Limpar" e confirme que os KPIs voltam a R$ 17.889.351,14.

- [ ] **Passo 7: Commit**

```bash
git add src/views/AlmoxarifadoDashboards.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): barra de filtros compartilhada nos dashboards

Deposito, tipo, classe de item, curva ABC e grupo de mercadoria alimentam
todos os paineis pelo mesmo useMemo. A classificacao ABC continua sendo
calculada sobre a posicao inteira, e nao sobre o subconjunto filtrado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 8: Compra evitável

O painel que paga a página: cada linha é uma compra que talvez não precise acontecer.

**Arquivos:**
- Criar: `src/components/almoxarifado/CompraEvitavelPanel.tsx`
- Modificar: `src/views/AlmoxarifadoDashboards.tsx`

**Interfaces:**
- Consome: `CompraEvitavel`, `acharCompraEvitavel`, `formatBRL`, `formatQtd` de `src/lib/almoxarifado.ts`; `XLSX` de `xlsx`
- Produz: `CompraEvitavelPanel({ dados, onSelecionar })`

- [ ] **Passo 1: Criar `src/components/almoxarifado/CompraEvitavelPanel.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, FileSpreadsheet, ChevronDown, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CompraEvitavel, formatBRL, formatQtd } from '../../lib/almoxarifado';

interface CompraEvitavelPanelProps {
  dados: CompraEvitavel[];
  onSelecionar?: (material: string) => void;
}

const PAGINA = 10;

export default function CompraEvitavelPanel({ dados, onSelecionar }: CompraEvitavelPanelProps) {
  const [visiveis, setVisiveis] = useState(PAGINA);
  const valorEmRisco = dados.reduce((a, d) => a + d.valorEstoque, 0);

  const exportar = () => {
    if (dados.length === 0) return;
    const linhas = dados.map(d => ({
      'Material': d.material,
      'Descrição': d.descricao,
      'Saldo em Estoque': d.saldo,
      'UMB': d.umb,
      'Valor em Estoque': d.valorEstoque,
      'Qtd. Solicitada': d.qtdSolicitada,
      'Requisições Abertas': d.rms.join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Compra Evitavel');
    XLSX.writeFile(wb, `compra_evitavel_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
  };

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Compra Evitável
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Materiais com requisição de compra aberta e saldo disponível em estoque. Confirme o saldo antes de seguir com a cotação.
          </p>
        </div>
        {dados.length > 0 && (
          <button
            onClick={exportar}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95 shrink-0 h-9"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar {dados.length}
          </button>
        )}
      </div>

      {dados.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-sm font-semibold">
          <CheckCircle className="h-5 w-5 shrink-0" />
          Nenhuma requisição aberta para material com saldo em estoque.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              <strong className="text-amber-600 dark:text-amber-500 text-base font-black">{dados.length}</strong> materiais
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              <strong className="text-slate-800 dark:text-slate-200">{formatBRL(valorEmRisco)}</strong> já em estoque
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dados.slice(0, visiveis).map(d => (
              <button
                key={d.material}
                onClick={() => onSelecionar?.(d.material)}
                className="w-full text-left py-2.5 group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors px-2 -mx-2 rounded"
                title={`Ver ${d.material} na posição de estoque`}
              >
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0 group-hover:text-emerald-600 dark:group-hover:text-emerald-500">
                    {d.material}
                  </span>
                  <span className="truncate text-slate-600 dark:text-slate-400 flex-1">{d.descricao || '—'}</span>
                  <span className="shrink-0 font-bold text-slate-700 dark:text-slate-300 tabular-nums">{formatBRL(d.valorEstoque)}</span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Saldo {formatQtd(d.saldo)} {d.umb} · solicitado {formatQtd(d.qtdSolicitada)} {d.umb} · RM {d.rms.join(', ') || '—'}
                </p>
              </button>
            ))}
          </div>

          {visiveis < dados.length && (
            <button
              onClick={() => setVisiveis(v => v + PAGINA)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" /> Ver mais {Math.min(PAGINA, dados.length - visiveis)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: Ligar na página**

Imports:

```tsx
import { /* ...já existentes... */ acharCompraEvitavel } from '../lib/almoxarifado';
import CompraEvitavelPanel from '../components/almoxarifado/CompraEvitavelPanel';
```

Depois de `porAplicacao`:

```tsx
  const compraEvitavel = useMemo(() => acharCompraEvitavel(filtrados, requisicoes), [filtrados, requisicoes]);
```

No JSX, antes de `<CurvaAbcChart ... />` — alerta acionável vem antes do descritivo:

```tsx
          <CompraEvitavelPanel
            dados={compraEvitavel}
            onSelecionar={(mat) => irParaEstoque(`material=${encodeURIComponent(mat)}`)}
          />
```

- [ ] **Passo 3: Rodar o typecheck**

```bash
npm run lint
```

- [ ] **Passo 4: Conferir contra o SQL**

Este SQL reproduz exatamente a definição usada no cliente — cache a partir de 2026-01-01, `status_requisicao = 'Sem PO'`, excluindo apenas `codigo_de_eliminacao = true` (requisições com `status_processamento = 'B'` **permanecem** incluídas, pois `getEnrichedSAPRequisicoes()` não as descarta):

```sql
select count(distinct v.material) materiais, count(*) linhas_rm
from view_enriched_requisicoes v
where v.data_da_solicitacao >= '2026-01-01'
  and v.status_requisicao = 'Sem PO'
  and coalesce(v.codigo_de_eliminacao, false) = false
  and exists (select 1 from estoque e where e.material = v.material and coalesce(e.quantidade,0) > 0);
```

Esperado sem nenhum filtro na tela: **51 materiais** (52 linhas de RM).

Se aparecer 0, a causa mais provável é o cache de requisições estar vazio nesta sessão — abra `#/suprimentos/painel` uma vez para forçar o sync e volte. A spec menciona 50; esse número veio de uma consulta sobre a tabela `requisicoes` inteira, com definição diferente, e não é o gabarito desta tela.

- [ ] **Passo 5: Commit**

```bash
git add src/components/almoxarifado/CompraEvitavelPanel.tsx src/views/AlmoxarifadoDashboards.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): painel de compra evitavel

Cruza requisicoes abertas (Sem PO) com saldo em estoque: cada linha e uma
compra que talvez nao precise acontecer. Lista clicavel com export Excel
da relacao completa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 9: Divergência de PMM

**Arquivos:**
- Criar: `src/components/almoxarifado/DivergenciaPmmPanel.tsx`
- Modificar: `src/views/AlmoxarifadoDashboards.tsx`

**Interfaces:**
- Consome: `DivergenciaPmm`, `acharDivergenciaPmm`, `formatBRL`, `formatDateBR` de `src/lib/almoxarifado.ts`; `XLSX`
- Produz: `DivergenciaPmmPanel({ dados, indisponivel, onSelecionar })`

- [ ] **Passo 1: Criar `src/components/almoxarifado/DivergenciaPmmPanel.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, FileSpreadsheet, ChevronDown, CheckCircle, AlertCircle, Scale } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DivergenciaPmm, formatBRL, formatDateBR } from '../../lib/almoxarifado';

interface DivergenciaPmmPanelProps {
  dados: DivergenciaPmm[];
  // true quando vw_estoque_analise não pôde ser carregada: sem ela não há com o
  // que comparar, e dizer "nenhuma divergência" seria mentira.
  indisponivel: boolean;
  onSelecionar?: (material: string) => void;
}

const PAGINA = 10;

export default function DivergenciaPmmPanel({ dados, indisponivel, onSelecionar }: DivergenciaPmmPanelProps) {
  const [visiveis, setVisiveis] = useState(PAGINA);
  const acima = dados.filter(d => d.variacao > 0).length;
  const abaixo = dados.length - acima;

  const exportar = () => {
    if (dados.length === 0) return;
    const linhas = dados.map(d => ({
      'Material': d.material,
      'Descrição': d.descricao,
      'PMM': d.pmm,
      'Último Preço Pago': d.ultimoPreco,
      'Variação (%)': Number((d.variacao * 100).toFixed(2)),
      'Data Última Compra': d.dataUltimaCompra ?? '',
      'Último Fornecedor': d.fornecedor ?? '',
      'Valor em Estoque': d.valorEstoque,
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Divergencia PMM');
    XLSX.writeFile(wb, `divergencia_pmm_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
  };

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Scale className="h-4 w-4 text-violet-500" /> Divergência de PMM
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Último preço pago afastado do preço médio em mais de 20%. Acima indica estoque contabilizado abaixo do custo de reposição; abaixo indica PMM inflado por compra antiga.
          </p>
        </div>
        {dados.length > 0 && (
          <button
            onClick={exportar}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95 shrink-0 h-9"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar {dados.length}
          </button>
        )}
      </div>

      {indisponivel ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-sm font-medium">
          <AlertCircle className="h-5 w-5 shrink-0" />
          Não foi possível carregar o histórico de preços pagos. Este painel fica indisponível; os demais seguem com a posição de estoque em cache.
        </div>
      ) : dados.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-sm font-semibold">
          <CheckCircle className="h-5 w-5 shrink-0" />
          Nenhum material com preço médio fora da faixa de 20%.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              <strong className="text-rose-600 dark:text-rose-500 text-base font-black">{acima}</strong> acima do PMM
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              <strong className="text-blue-600 dark:text-blue-500 text-base font-black">{abaixo}</strong> abaixo do PMM
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dados.slice(0, visiveis).map(d => {
              const positiva = d.variacao > 0;
              const Icone = positiva ? TrendingUp : TrendingDown;
              return (
                <button
                  key={d.material}
                  onClick={() => onSelecionar?.(d.material)}
                  className="w-full text-left py-2.5 group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors px-2 -mx-2 rounded"
                  title={`Ver ${d.material} na posição de estoque`}
                >
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0 group-hover:text-emerald-600 dark:group-hover:text-emerald-500">
                      {d.material}
                    </span>
                    <span className="truncate text-slate-600 dark:text-slate-400 flex-1">{d.descricao || '—'}</span>
                    <span className={`shrink-0 inline-flex items-center gap-1 font-bold tabular-nums ${positiva ? 'text-rose-600 dark:text-rose-500' : 'text-blue-600 dark:text-blue-500'}`}>
                      <Icone className="h-3 w-3" />
                      {positiva ? '+' : ''}{(d.variacao * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    PMM {formatBRL(d.pmm)} · pago {formatBRL(d.ultimoPreco)} em {formatDateBR(d.dataUltimaCompra)}
                    {d.fornecedor ? ` · ${d.fornecedor}` : ''}
                  </p>
                </button>
              );
            })}
          </div>

          {visiveis < dados.length && (
            <button
              onClick={() => setVisiveis(v => v + PAGINA)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" /> Ver mais {Math.min(PAGINA, dados.length - visiveis)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: Ligar na página**

Imports:

```tsx
import { /* ...já existentes... */ acharDivergenciaPmm } from '../lib/almoxarifado';
import DivergenciaPmmPanel from '../components/almoxarifado/DivergenciaPmmPanel';
```

Depois de `compraEvitavel`:

```tsx
  const divergenciaPmm = useMemo(() => acharDivergenciaPmm(filtrados, analise), [filtrados, analise]);
  // A análise vazia com estoque carregado significa que a view não respondeu.
  const analiseIndisponivel = rows.length > 0 && analise.length === 0;
```

No JSX, depois de `<CompraEvitavelPanel ... />`:

```tsx
          <DivergenciaPmmPanel
            dados={divergenciaPmm}
            indisponivel={analiseIndisponivel}
            onSelecionar={(mat) => irParaEstoque(`material=${encodeURIComponent(mat)}`)}
          />
```

- [ ] **Passo 3: Rodar o typecheck**

```bash
npm run lint
```

- [ ] **Passo 4: Conferir contra o SQL**

```sql
with ult as (
  select distinct on (p.material) p.material,
    p.preco_liquido_unit / case when p.por ~ '^[0-9]+([.,][0-9]+)?$'
      then coalesce(nullif(replace(p.por,',','.')::numeric,0),1) else 1 end as up
  from pedidosforn p where p.preco_liquido_unit is not null and p.preco_liquido_unit > 0
  order by p.material, p.data_doc desc nulls last
), e as (select material, max(preco_medio) pmm from estoque where coalesce(preco_medio,0) > 0 group by 1)
select count(*) filter (where u.up > e.pmm*1.2) acima,
       count(*) filter (where u.up < e.pmm*0.8) abaixo
from e join ult u on u.material = e.material;
```

Esperado sem filtros: **135 acima** e **522 abaixo**, 657 no total.

Verifique também a degradação isolada: no DevTools, aba Network, bloqueie requisições para `vw_estoque_analise` e recarregue. Só este painel tem que mostrar o aviso âmbar de indisponibilidade; os outros oito continuam renderizando.

- [ ] **Passo 5: Commit**

```bash
git add src/components/almoxarifado/DivergenciaPmmPanel.tsx src/views/AlmoxarifadoDashboards.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): painel de divergencia de PMM

Compara o ultimo preco unitario pago com o preco medio do material,
sinalizando desvios acima de 20%. Falha ao carregar vw_estoque_analise
degrada apenas este painel, com aviso proprio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 10: Qualidade de cadastro e nota sobre giro

Fecha a página: o painel de governança e a declaração explícita do que a página não mede.

**Arquivos:**
- Criar: `src/components/almoxarifado/QualidadeCadastroPanel.tsx`
- Modificar: `src/views/AlmoxarifadoDashboards.tsx`

**Interfaces:**
- Consome: `LacunaCadastro`, `acharLacunasCadastro`, `formatBRL` de `src/lib/almoxarifado.ts`
- Produz: `QualidadeCadastroPanel({ lacunas, totalItens })`

- [ ] **Passo 1: Criar `src/components/almoxarifado/QualidadeCadastroPanel.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ClipboardCheck, CheckCircle } from 'lucide-react';
import { LacunaCadastro, formatBRL } from '../../lib/almoxarifado';

interface QualidadeCadastroPanelProps {
  lacunas: LacunaCadastro[];
  totalItens: number;
}

export default function QualidadeCadastroPanel({ lacunas, totalItens }: QualidadeCadastroPanelProps) {
  const semLacuna = lacunas.every(l => l.itens === 0);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-blue-500" /> Qualidade de Cadastro
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Campos que o item precisa ter preenchidos para entrar em qualquer política de classificação e reposição.
        </p>
      </div>

      {semLacuna ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-sm font-semibold">
          <CheckCircle className="h-5 w-5 shrink-0" />
          Todos os {totalItens.toLocaleString('pt-BR')} itens do filtro têm classe, grupo de mercadoria e preço médio preenchidos.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {lacunas.map(l => {
            const pct = totalItens > 0 ? (l.itens / totalItens) * 100 : 0;
            const vazio = l.itens === 0;
            return (
              <div
                key={l.rotulo}
                className={`rounded-lg border p-3 ${vazio ? 'border-slate-200 dark:border-slate-800' : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10'}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{l.rotulo}</p>
                <p className={`text-2xl font-black mt-1 ${vazio ? 'text-slate-400 dark:text-slate-600' : 'text-amber-600 dark:text-amber-500'}`}>
                  {l.itens.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {vazio ? 'nenhum item' : `${pct.toFixed(1)}% dos itens · ${formatBRL(l.valor)}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: Ligar na página e adicionar a nota de rodapé**

Imports:

```tsx
import { /* ...já existentes... */ acharLacunasCadastro } from '../lib/almoxarifado';
import QualidadeCadastroPanel from '../components/almoxarifado/QualidadeCadastroPanel';
import { Info } from 'lucide-react';
```

Depois de `divergenciaPmm`:

```tsx
  const lacunas = useMemo(() => acharLacunasCadastro(filtrados), [filtrados]);
```

No JSX, depois de `<TopMateriaisChart ... />` e ainda dentro do bloco `rows.length > 0`:

```tsx
          <QualidadeCadastroPanel lacunas={lacunas} totalItens={filtrados.length} />

          {/* Declara o que a página não mede. Sem isso, alguém acaba lendo valor
              imobilizado como se fosse indicador de giro. */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400 dark:text-slate-500" />
            <p>
              Esta página analisa a <strong className="text-slate-700 dark:text-slate-300">posição de estoque vigente</strong>, importada da transação ZL0024.
              Giro, cobertura e obsolescência não são exibidos porque dependem do histórico de movimentos de material (MB51/MB5B), ainda não importado —
              calculá-los sobre os dados atuais produziria números incorretos. Valor imobilizado alto não significa item parado.
            </p>
          </div>
```

- [ ] **Passo 3: Rodar o typecheck**

```bash
npm run lint
```

- [ ] **Passo 4: Conferir contra o SQL**

```sql
select
 count(*) filter (where coalesce(trim(class_item),'')='') sem_classe,
 sum(valor_total) filter (where coalesce(trim(class_item),'')='') val_sem_classe,
 count(*) filter (where coalesce(trim(grupo_mercadorias),'')='') sem_grupo,
 count(*) filter (where coalesce(preco_medio,0)=0) sem_pmm
from estoque;
```

Esperado: **82** itens sem classe, valendo **R$ 223.990,92**; **0** sem grupo; **0** sem PMM. Os dois cartões zerados têm que aparecer em cinza com "nenhum item" — não é bug, é a base estando limpa nesses campos. Confirme que o cartão de classe aparece em âmbar e os outros dois em cinza.

- [ ] **Passo 5: Commit**

```bash
git add src/components/almoxarifado/QualidadeCadastroPanel.tsx src/views/AlmoxarifadoDashboards.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): qualidade de cadastro e nota sobre giro

Contadores de itens sem classe, sem grupo de mercadoria e sem preco medio.
Nota fixa no rodape declara que giro, cobertura e obsolescencia dependem
do historico de movimentos (MB51/MB5B) e por isso nao sao exibidos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tarefa 11: Drill-down na página Estoque

Faz os cliques dos dashboards realmente filtrarem a tabela. Última tarefa porque consome os links que as anteriores criaram.

**Arquivos:**
- Modificar: `src/views/Estoque.tsx`

**Interfaces:**
- Consome: `classifyABC`, `ClasseAbc`, `normalizeCode` de `src/lib/almoxarifado.ts`
- Produz: nenhuma interface nova; a página passa a aceitar `?deposito=`, `?tipo=`, `?classe=`, `?grupo=`, `?abc=` e `?material=` na hash

- [ ] **Passo 1: Importar a lib e remover a duplicação de `normalizeCode`**

Em `src/views/Estoque.tsx`, adicione depois do import de `../types`:

```tsx
import { classifyABC, ClasseAbc, normalizeCode } from '../lib/almoxarifado';
```

E **remova** a definição local de `normalizeCode` (linhas 72-77), que agora vive na lib. A função é idêntica — a versão da lib foi copiada desta. Deixar as duas seria a mesma regra em dois lugares.

- [ ] **Passo 2: Adicionar a coluna ABC**

Em `ColumnOption`, o `id` é hoje `keyof EstoqueItem`. A classe ABC é calculada, não é campo da linha, então o tipo precisa acomodá-la:

```tsx
type ColumnId = keyof EstoqueItem | 'classe_abc';

interface ColumnOption {
  id: ColumnId;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  numeric?: boolean;
}
```

Em `COLUMNS`, adicione a coluna logo depois de `txt_breve_material`:

```tsx
  { id: 'classe_abc', label: 'ABC', sortable: true, defaultVisible: true },
```

- [ ] **Passo 3: Calcular o mapa ABC e o filtro**

Depois do `useMemo` de `lastUpdated`:

```tsx
  // Classificação sobre a posição inteira, não sobre `filteredRows`: a classe de
  // um material não pode mudar conforme o filtro da tela.
  const mapaAbc = useMemo(() => classifyABC(rows), [rows]);
```

Junto dos outros estados de filtro:

```tsx
  const [abcFilter, setAbcFilter] = useState<'Todos' | ClasseAbc>('Todos');
  const [grupoFilter, setGrupoFilter] = useState('Todos');
```

E dentro do `filter` de `filteredRows`, antes do bloco de busca:

```tsx
      if (abcFilter !== 'Todos' && mapaAbc.get(normalizeCode(r.material)) !== abcFilter) return false;
      if (grupoFilter !== 'Todos' && r.grupo_mercadorias !== grupoFilter) return false;
```

Adicione `abcFilter`, `grupoFilter` e `mapaAbc` ao array de dependências de `filteredRows`, e `abcFilter` e `grupoFilter` ao `useEffect` que reinicia `visibleCount` (hoje na linha 231).

- [ ] **Passo 4: Ler a query da hash no mount**

Adicione este `useEffect` depois de `useEffect(() => { load(false); }, [load]);`, seguindo a convenção de `src/views/SapPanel.tsx:429-446`:

```tsx
  // Deep link vindo dos dashboards do almoxarifado: pré-aplica o recorte que o
  // usuário clicou no gráfico.
  useEffect(() => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));

    const deposito = params.get('deposito');
    if (deposito) setDepositoFilter(deposito);

    const tipo = params.get('tipo');
    if (tipo) setTipoFilter(tipo);

    const classe = params.get('classe');
    if (classe) setClassFilter(classe);

    const grupo = params.get('grupo');
    if (grupo) setGrupoFilter(grupo);

    const abc = params.get('abc');
    if (abc === 'A' || abc === 'B' || abc === 'C') setAbcFilter(abc);

    // Material entra na busca já aplicada, para que o campo mostre o termo e o
    // botão "Limpar" apareça — senão o usuário não tem como sair do recorte.
    const material = params.get('material');
    if (material) {
      setSearchInput(material);
      setSearchQuery(material);
    }
  }, []);
```

- [ ] **Passo 5: Adicionar os seletores de ABC e grupo**

No bloco de filtros, depois do `select` de `classFilter` (que termina na linha 436):

```tsx
            <div className="relative min-w-[140px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={abcFilter}
                onChange={(e) => setAbcFilter(e.target.value as 'Todos' | ClasseAbc)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Curva ABC: Todas</option>
                <option value="A">Classe A</option>
                <option value="B">Classe B</option>
                <option value="C">Classe C</option>
              </select>
            </div>
            <div className="relative min-w-[160px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={grupoFilter}
                onChange={(e) => setGrupoFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Grupo: Todos</option>
                {grupoOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
```

E declare `grupoOptions` junto das outras listas de opções (depois de `classOptions`, linha 183):

```tsx
  const grupoOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.grupo_mercadorias) s.add(r.grupo_mercadorias); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rows]);
```

- [ ] **Passo 6: Renderizar e ordenar a coluna ABC**

Em `renderCell`, mude a assinatura para aceitar o novo id e trate o caso:

```tsx
  const renderCell = (r: EstoqueItem, colId: ColumnId) => {
    switch (colId) {
      case 'material':
        return <span className="font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.material || '—'}</span>;
      case 'classe_abc': {
        const classe = mapaAbc.get(normalizeCode(r.material)) || 'C';
        return (
          <span
            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-black text-white"
            style={{ backgroundColor: CLASSE_ABC_COR[classe] }}
            title={`Classe ${classe} da curva ABC`}
          >
            {classe}
          </span>
        );
      }
      case 'quantidade':
        return formatQtd(r.quantidade);
      case 'preco_medio':
        return formatPreco(r.preco_medio);
      case 'valor_total':
        return <span className="font-bold text-emerald-600 dark:text-emerald-500 whitespace-nowrap">{formatPreco(r.valor_total)}</span>;
      default:
        return (r[colId as keyof EstoqueItem] as string) || '—';
    }
  };
```

Adicione `CLASSE_ABC_COR` ao import da lib.

Em `sortedRows`, a ordenação por `classe_abc` precisa de um caso próprio, porque o valor não está na linha. Insira antes do `if (sortColumn === 'material')`:

```tsx
        if (sortColumn === 'classe_abc') {
          const va = mapaAbc.get(normalizeCode(a.material)) || 'C';
          const vb = mapaAbc.get(normalizeCode(b.material)) || 'C';
          return va.localeCompare(vb) * dir;
        }
```

E acrescente `mapaAbc` às dependências de `sortedRows`. As leituras genéricas de `a[sortColumn as keyof EstoqueItem]` continuam válidas para as demais colunas.

No export Excel, adicione a classe como primeira coluna do objeto para que a planilha carregue a mesma informação da tela:

```tsx
      'Classe ABC': mapaAbc.get(normalizeCode(r.material)) || 'C',
```

- [ ] **Passo 7: Rodar o typecheck**

```bash
npm run lint
```

Esperado: nenhum erro. Se aparecer `Type '"classe_abc"' is not assignable to type 'keyof EstoqueItem'`, alguma referência a `ColumnOption['id']` ainda usa o tipo antigo — o `SortableTh` recebe `col` como `string` e não precisa de mudança.

- [ ] **Passo 8: Verificar o drill-down ponta a ponta**

Com `npm run dev` rodando:

1. Abra `#/almoxarifado/dashboards` e clique na barra do depósito **0004**. A página Estoque tem que abrir com o seletor de depósito já em 0004 e "Exibindo 50 de 1.488 itens".
2. Volte e clique no cartão da **Classe A** na curva ABC. Estoque abre com Curva ABC em "Classe A"; o KPI Materiais tem que mostrar **254**.
3. Volte e clique no primeiro item do Top 15. Estoque abre com o código no campo de busca, o botão "Limpar" visível, e a tabela mostrando só as linhas daquele material.
4. Clique numa fatia de tipo de material e confirme que o seletor Tipo vem preenchido.
5. Confirme que a coluna **ABC** aparece na tabela por padrão, ordena ao clicar no cabeçalho, e que a planilha exportada tem a coluna "Classe ABC".

- [ ] **Passo 9: Commit**

```bash
git add src/views/Estoque.tsx
git commit -F mensagem.txt
```

```
feat(almoxarifado): drill-down dos dashboards para a pagina Estoque

Estoque passa a ler deposito, tipo, classe, grupo, abc e material da query
da hash, pre-aplicando o recorte clicado no grafico. Ganha tambem coluna e
filtro de curva ABC, reusando classifyABC da lib.

normalizeCode sai daqui e passa a vir de src/lib/almoxarifado, eliminando
a copia da mesma regra em dois arquivos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Auto-revisão

**Cobertura da spec.** Cada seção tem tarefa correspondente: view `vw_estoque_analise` e `fetchEstoqueAnalise` → Tarefa 1; lib pura e KPIs → Tarefa 2; curva ABC → 3; valor por depósito → 4; composição e concentração → 5; top materiais → 6; barra de filtros → 7; compra evitável → 8; divergência de PMM → 9; qualidade de cadastro e nota sobre giro → 10; drill-down com filtro ABC em Estoque → 11. Rota, sidebar e `STATE_PRESERVING_PATHS` estão na Tarefa 2. Estados vazios por painel e degradação isolada da view estão nas tarefas 8, 9 e 10. Dark mode é restrição global. Os itens listados como fora de escopo na spec não têm tarefa, corretamente.

**Consistência de nomes.** `classifyABC`, `agregarPor`, `topN`, `calcularKpis`, `resumirAbc`, `acharCompraEvitavel`, `acharDivergenciaPmm`, `acharLacunasCadastro`, `normalizeCode`, `formatBRL`, `formatBRLCompacto`, `formatQtd`, `formatDateBR`, `formatDateTimeBR` e `CLASSE_ABC_COR` são definidos na Tarefa 2 e usados com a mesma grafia nas tarefas 3 a 11. `EstoqueAnalise` é definido na Tarefa 1 e consumido nas tarefas 2 e 9. `Agregado` é produzido por `agregarPor` e consumido por `ValorPorDepositoChart`, `ComposicaoChart` e `ConcentracaoChart`.

**Pontos de atenção deixados explícitos no plano.** A Tarefa 7 alerta sobre ordem de declaração de `filtrados`. A Tarefa 11 alerta sobre a mudança de `ColumnOption['id']` para `ColumnId`. A Tarefa 8 explica por que o gabarito é 51 e não os 50 citados na spec (nem os 64 de uma versão anterior deste plano, que tinha a lógica de filtro invertida), e o que fazer se a tela mostrar zero.
