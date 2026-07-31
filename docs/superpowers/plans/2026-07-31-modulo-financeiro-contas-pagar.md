# Módulo Financeiro — Contas a Pagar + Análise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o grupo de menu "Financeiro", migrar a página "Contas a Pagar" de Suprimentos para lá, e adicionar uma página de análise/dashboard sobre os mesmos dados via a view `vw_fbl1n_c_pagar_analise`.

**Architecture:** Reaproveita o componente `ContasPagar.tsx` já existente (só muda registro de menu/rota). A nova tela de análise é um arquivo único seguindo o padrão `ChartCard`/`KpiCard`/Recharts já usado em `TabContratosLista.tsx`, buscando dados paginados direto do Supabase (mesmo padrão de `ContasPagar.tsx`, sem cache em `localDb`).

**Tech Stack:** React + TypeScript, Supabase (view `vw_fbl1n_c_pagar_analise`), Recharts.

## Global Constraints

- As duas páginas (`fin_contas_pagar`, `fin_contas_pagar_analise`) usam `defaultRoles: ['admin']` e **não** usam `alwaysAdmin` — precisam aparecer como checkbox editável em "Módulos de acesso" (`PageAccessModal.tsx`), não bloqueadas.
- Grupo de menu novo: `'FINANCEIRO'`, entre `'ALMOXARIFADO'` e `'HELPDESK'` em `Sidebar.tsx`.
- Rotas novas: `/financeiro/contas-pagar` (lista, era `/suprimentos/contas-pagar`) e `/financeiro/contas-pagar/analise` (análise, nova).
- `npm run lint` (`tsc --noEmit`) deve passar sem erros ao final de cada task.

---

### Task 1: Migrar o menu — grupo Financeiro e renomear a entrada de Contas a Pagar

**Files:**
- Modify: `src/lib/pages.ts:59` (renomear/mover a entrada existente)
- Modify: `src/lib/pages.ts` (adicionar nova entrada de análise, logo após a de Contas a Pagar)
- Modify: `src/components/Sidebar.tsx:30` (adicionar `'FINANCEIRO'` ao `groupOrder`)

**Interfaces:**
- Produces: `PageDef` com `id: 'fin_contas_pagar'` (`path: '/financeiro/contas-pagar'`) e `id: 'fin_contas_pagar_analise'` (`path: '/financeiro/contas-pagar/analise'`) — consumidos pela Task 2 (`App.tsx` routing) e pela Task 3 (a própria tela de análise, indiretamente, via `canAccessPage`).

- [ ] **Step 1: Renomear a entrada existente de Contas a Pagar**

Em `src/lib/pages.ts:59`, trocar:

```ts
  { id: 'sup_contas_pagar', group: 'SUPRIMENTOS', label: 'Contas a Pagar', path: '/suprimentos/contas-pagar', icon: Receipt, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
```

por (nova entrada some daqui, some com as demais de SUPRIMENTOS — vai para o bloco novo do Step 2, que fica logo após o bloco de ALMOXARIFADO):

```ts
```

(ou seja: remover a linha inteira daqui — ela reaparece, já com os novos valores, no Step 2).

- [ ] **Step 2: Adicionar o bloco do grupo FINANCEIRO**

Em `src/lib/pages.ts`, logo após a linha `{ id: 'almox_dashboards', ... }` (fim do bloco ALMOXARIFADO) e antes da linha em branco que precede o bloco HELPDESK, inserir:

```ts

  { id: 'fin_contas_pagar', group: 'FINANCEIRO', label: 'Contas a Pagar', path: '/financeiro/contas-pagar', icon: Receipt, defaultRoles: ['admin'] },
  { id: 'fin_contas_pagar_analise', group: 'FINANCEIRO', label: 'Análise', path: '/financeiro/contas-pagar/analise', icon: BarChart3, defaultRoles: ['admin'] },
```

Resultado esperado da região ALMOXARIFADO → FINANCEIRO → HELPDESK:

```ts
  { id: 'almox_estoque', group: 'ALMOXARIFADO', label: 'Estoque', path: '/almoxarifado/estoque', icon: Boxes, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_dashboards', group: 'ALMOXARIFADO', label: 'Dashboards', path: '/almoxarifado/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },

  { id: 'fin_contas_pagar', group: 'FINANCEIRO', label: 'Contas a Pagar', path: '/financeiro/contas-pagar', icon: Receipt, defaultRoles: ['admin'] },
  { id: 'fin_contas_pagar_analise', group: 'FINANCEIRO', label: 'Análise', path: '/financeiro/contas-pagar/analise', icon: BarChart3, defaultRoles: ['admin'] },

  { id: 'helpdesk_atendimento', group: 'HELPDESK', label: 'Atendimento', path: '/helpdesk', icon: Radio, defaultRoles: ['atendente', 'admin'] },
```

Não é necessário alterar o import de ícones — `Receipt` e `BarChart3` já estão importados no topo do arquivo (`src/lib/pages.ts:13,16`).

- [ ] **Step 3: Adicionar `'FINANCEIRO'` ao `groupOrder` do Sidebar**

Em `src/components/Sidebar.tsx:30`, trocar:

```ts
  const groupOrder = ['GERAL', 'SOLICITAÇÕES', 'SUPRIMENTOS', 'ALMOXARIFADO', 'HELPDESK', 'ADMINISTRAÇÃO'];
```

por:

```ts
  const groupOrder = ['GERAL', 'SOLICITAÇÕES', 'SUPRIMENTOS', 'ALMOXARIFADO', 'FINANCEIRO', 'HELPDESK', 'ADMINISTRAÇÃO'];
```

- [ ] **Step 4: Verificar tipagem**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pages.ts src/components/Sidebar.tsx
git commit -m "feat: cria grupo de menu Financeiro e migra Contas a Pagar para lá"
```

---

### Task 2: Atualizar o roteamento em `App.tsx`

**Files:**
- Modify: `src/App.tsx:34` (lazy import — já existe, sem alteração de conteúdo, só referenciado abaixo)
- Modify: `src/App.tsx:65` (`STATE_PRESERVING_PATHS`)
- Modify: `src/App.tsx:488-492` (`case` de rota da lista)
- Modify: `src/App.tsx` (novo lazy import + novo `case` para a análise)

**Interfaces:**
- Consumes: `canAccessPage(user, 'fin_contas_pagar')` e `canAccessPage(user, 'fin_contas_pagar_analise')` (Task 1). `ContasPagarAnalise` — componente produzido pela Task 3, `export default function ContasPagarAnalise({ user }: { user: Profile })`. Este task pode ser implementado antes da Task 3 existir fisicamente — o lazy import só é resolvido em runtime, e `tsc --noEmit` não executa o import dinâmico, mas para o `npm run lint` deste task passar sem erro de módulo ausente, **implemente esta task depois da Task 3**, ou crie `src/views/ContasPagarAnalise.tsx` como um stub mínimo primeiro — a ordem recomendada é executar a Task 3 antes desta Task 2. (Ver nota de ordem no final deste task.)

- [ ] **Step 1: Trocar a rota da lista de `/suprimentos/contas-pagar` para `/financeiro/contas-pagar`**

Em `src/App.tsx:65`, dentro de `STATE_PRESERVING_PATHS`, trocar:

```ts
  '/suprimentos/contas-pagar',
```

por:

```ts
  '/financeiro/contas-pagar',
  '/financeiro/contas-pagar/analise',
```

Em `src/App.tsx:488-492`, trocar:

```tsx
      case '/suprimentos/contas-pagar':
        if (canAccessPage(user, 'sup_contas_pagar')) {
          return <ContasPagar user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
```

por:

```tsx
      case '/financeiro/contas-pagar':
        if (canAccessPage(user, 'fin_contas_pagar')) {
          return <ContasPagar user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/financeiro/contas-pagar/analise':
        if (canAccessPage(user, 'fin_contas_pagar_analise')) {
          return <ContasPagarAnalise user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
```

- [ ] **Step 2: Adicionar o lazy import da tela de análise**

Em `src/App.tsx:34`, logo após `const ContasPagar = lazy(() => import('./views/ContasPagar'));`, adicionar:

```ts
const ContasPagarAnalise = lazy(() => import('./views/ContasPagarAnalise'));
```

- [ ] **Step 3: Verificar tipagem**

Run: `npm run lint`
Expected: sem erros — isto exige que `src/views/ContasPagarAnalise.tsx` já exista com um `export default` compatível com `{ user: Profile }` (produzido pela Task 3). Se este task for executado antes da Task 3, o `lint` falhará por módulo ausente; nesse caso, execute a Task 3 primeiro e volte para este ponto.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: roteia /financeiro/contas-pagar e /financeiro/contas-pagar/analise"
```

**Nota de ordem:** este plano numera as tasks na ordem do design, mas a Task 2 depende do arquivo que a Task 3 cria (para o `lint` passar limpo). Execute a Task 3 antes da Task 2, ou trate a Task 2 como "Task 3 + 4" na prática — a ordem de execução recomendada é **1, 3, 2**.

---

### Task 3: Tela de Análise (`src/views/ContasPagarAnalise.tsx`)

**Files:**
- Create: `src/views/ContasPagarAnalise.tsx`

**Interfaces:**
- Consumes:
  - `supabase` de `../db/supabaseClient`
  - `Profile` de `../types`
  - `formatBRL`, `formatBRLCompacto` de `../lib/format`
  - `KpiCard` (default export) de `../components/charts/KpiCard`
  - `ChartCard` (default export) de `../components/charts/ChartCard`
  - `ChartTooltip`, `TooltipRow` de `../components/charts/ChartTooltip`
  - `useChartConfig` de `../components/charts/chartDefaults`
  - `useChartTokens`, `seriesColor` de `../lib/chartTokens`
  - `BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer` de `recharts`
- Produces: `export default function ContasPagarAnalise({ user: _user }: { user: Profile })` — consumido pela Task 2 (`App.tsx`).

- [ ] **Step 1: Criar `src/views/ContasPagarAnalise.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análise de Contas a Pagar (FBL1N): dashboard sobre a view
 * `vw_fbl1n_c_pagar_analise`, que já cruza os lançamentos com o cadastro de
 * tipos de documento SAP (categoria/módulo). Busca paginada direto do
 * Supabase, sem cache em `localDb` — mesmo racional de `ContasPagar.tsx`.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, Wallet, CalendarClock, Building2, ListChecks } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer,
} from 'recharts';
import { supabase } from '../db/supabaseClient';
import { Profile } from '../types';
import { formatBRL, formatBRLCompacto } from '../lib/format';
import { useChartTokens, seriesColor } from '../lib/chartTokens';
import { useChartConfig } from '../components/charts/chartDefaults';
import ChartCard from '../components/charts/ChartCard';
import ChartTooltip from '../components/charts/ChartTooltip';
import KpiCard from '../components/charts/KpiCard';

interface ContasPagarAnaliseProps {
  user: Profile;
}

interface Fbl1nAnaliseLinha {
  empresa: string | null;
  razao_social_fornecedor: string | null;
  montante_moeda_doc: number | null;
  doc_compensacao: string | null;
  vencimento_liquido: string | null;
  tipo_documento_categoria_modulo: string | null;
}

const PAGE_SIZE = 1000;

function estaAberta(l: Fbl1nAnaliseLinha): boolean {
  return !l.doc_compensacao;
}

export default function ContasPagarAnalise({ user: _user }: ContasPagarAnaliseProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Fbl1nAnaliseLinha[]>([]);
  const [empresaFilter, setEmpresaFilter] = useState('Todas');

  const tokens = useChartTokens();
  const c = useChartConfig();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allRows: Fbl1nAnaliseLinha[] = [];
      let from = 0;
      while (true) {
        const { data, error: fetchError } = await supabase
          .from('vw_fbl1n_c_pagar_analise')
          .select('empresa, razao_social_fornecedor, montante_moeda_doc, doc_compensacao, vencimento_liquido, tipo_documento_categoria_modulo')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (fetchError) throw fetchError;
        if (!data || data.length === 0) break;
        allRows.push(...(data as Fbl1nAnaliseLinha[]));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setLinhas(allRows);
    } catch (e) {
      console.error('Erro ao carregar análise de contas a pagar (FBL1N):', e);
      setError('Falha ao carregar os dados. Tente atualizar novamente.');
      setLinhas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const empresaOptions = useMemo(() => {
    const s = new Set<string>();
    linhas.forEach(l => { if (l.empresa) s.add(l.empresa); });
    return Array.from(s).sort();
  }, [linhas]);

  const filtradas = useMemo(() => {
    if (empresaFilter === 'Todas') return linhas;
    return linhas.filter(l => l.empresa === empresaFilter);
  }, [linhas, empresaFilter]);

  const abertas = useMemo(() => filtradas.filter(estaAberta), [filtradas]);

  const hoje = new Date().toISOString().split('T')[0];
  const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const em30dias = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const kpis = useMemo(() => {
    const totalAberto = abertas.reduce((sum, l) => sum + (l.montante_moeda_doc || 0), 0);
    const vencidas = abertas.filter(l => l.vencimento_liquido && l.vencimento_liquido < hoje);
    const totalVencido = vencidas.reduce((sum, l) => sum + (l.montante_moeda_doc || 0), 0);

    const porFornecedor = new Map<string, number>();
    abertas.forEach(l => {
      const nome = l.razao_social_fornecedor || 'Sem fornecedor';
      porFornecedor.set(nome, (porFornecedor.get(nome) || 0) + (l.montante_moeda_doc || 0));
    });
    let maiorFornecedor = '—';
    let maiorFornecedorValor = 0;
    porFornecedor.forEach((valor, nome) => {
      if (valor > maiorFornecedorValor) { maiorFornecedorValor = valor; maiorFornecedor = nome; }
    });

    return { totalAberto, totalVencido, maiorFornecedor, maiorFornecedorValor, qtdAbertas: abertas.length };
  }, [abertas, hoje]);

  const categoriaChartData = useMemo(() => {
    const porCategoria = new Map<string, number>();
    abertas.forEach(l => {
      const cat = l.tipo_documento_categoria_modulo || 'Sem categoria';
      porCategoria.set(cat, (porCategoria.get(cat) || 0) + (l.montante_moeda_doc || 0));
    });
    return Array.from(porCategoria.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8)
      .map((d, i) => ({ ...d, cor: seriesColor(tokens, i) }));
  }, [abertas, tokens]);

  const fornecedoresChartData = useMemo(() => {
    const porFornecedor = new Map<string, number>();
    abertas.forEach(l => {
      const nome = l.razao_social_fornecedor || 'Sem fornecedor';
      porFornecedor.set(nome, (porFornecedor.get(nome) || 0) + (l.montante_moeda_doc || 0));
    });
    return Array.from(porFornecedor.entries())
      .map(([fornecedor, valor]) => ({ fornecedor, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [abertas]);

  const agingChartData = useMemo(() => {
    const buckets = {
      'Vencido': 0,
      'Vence em até 7 dias': 0,
      'Vence em até 30 dias': 0,
      'Vence em 30+ dias': 0,
      'Sem vencimento informado': 0,
    };
    abertas.forEach(l => {
      const v = l.montante_moeda_doc || 0;
      if (!l.vencimento_liquido) {
        buckets['Sem vencimento informado'] += v;
      } else if (l.vencimento_liquido < hoje) {
        buckets['Vencido'] += v;
      } else if (l.vencimento_liquido < em7dias) {
        buckets['Vence em até 7 dias'] += v;
      } else if (l.vencimento_liquido < em30dias) {
        buckets['Vence em até 30 dias'] += v;
      } else {
        buckets['Vence em 30+ dias'] += v;
      }
    });
    const cores = [tokens.atraso[4], tokens.atraso[3], tokens.atraso[2], tokens.atraso[1], tokens.atraso[0]];
    return Object.entries(buckets).map(([bucket, valor], i) => ({ bucket, valor, cor: cores[i] }));
  }, [abertas, hoje, em7dias, em30dias, tokens]);

  function CategoriaTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const rows: { label: string; value: React.ReactNode; color?: string }[] = [
      { color: row.cor, label: 'Em aberto', value: formatBRL(row.valor) },
    ];
    return <ChartTooltip title={row.categoria} rows={rows} />;
  }

  function FornecedorTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const rows: { label: string; value: React.ReactNode; color?: string }[] = [
      { color: tokens.brand, label: 'Em aberto', value: formatBRL(row.valor) },
    ];
    return <ChartTooltip title={row.fornecedor} rows={rows} />;
  }

  function AgingTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const rows: { label: string; value: React.ReactNode; color?: string }[] = [
      { color: row.cor, label: 'Valor', value: formatBRL(row.valor) },
    ];
    return <ChartTooltip title={row.bucket} rows={rows} />;
  }

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
          <BarChart3 className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
          Análise de Contas a Pagar
        </h2>
        <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
          Visão consolidada das partidas em aberto por categoria de documento, fornecedor e vencimento.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={empresaFilter}
          onChange={e => setEmpresaFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-xs h-9"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
        >
          <option value="Todas">Todas empresas</option>
          {empresaOptions.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: 'color-mix(in srgb, #dc2626 10%, transparent)', color: '#dc2626' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label="Total em Aberto" value={kpis.totalAberto} format={formatBRL} icon={Wallet} accent="var(--brand)" />
        <KpiCard label="Total Vencido" value={kpis.totalVencido} format={formatBRL} icon={CalendarClock} accent="#dc2626" />
        <KpiCard label="Maior Fornecedor em Aberto" display={kpis.maiorFornecedor} detail={formatBRL(kpis.maiorFornecedorValor)} icon={Building2} accent="#0891b2" />
        <KpiCard label="Lançamentos em Aberto" value={kpis.qtdAbertas} format={(v) => String(Math.round(v))} icon={ListChecks} accent="#7c3aed" />
      </div>

      <ChartCard
        title="Em Aberto por Categoria/Módulo"
        icon={BarChart3}
        description="Soma do valor em aberto por categoria/módulo do tipo de documento SAP."
        height={260}
        loading={loading}
        empty={!loading && categoriaChartData.length === 0}
        emptyMessage="Nenhuma partida em aberto no filtro selecionado."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={categoriaChartData} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }}>
            <CartesianGrid {...c.grid} vertical horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickFormatter={(v: number) => formatBRLCompacto(v)} {...c.yAxis} />
            <YAxis type="category" dataKey="categoria" {...c.xAxis} width={180} />
            <Tooltip content={<CategoriaTooltip />} cursor={c.cursor} />
            <Bar dataKey="valor" radius={c.radius.right} maxBarSize={28} {...c.animation}>
              {categoriaChartData.map(d => <Cell key={d.categoria} fill={d.cor} />)}
              <LabelList dataKey="valor" position="right" formatter={(v: number) => formatBRLCompacto(v)} style={c.labelOnSurface} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Maiores Fornecedores em Aberto"
        icon={Building2}
        description="Top 10 fornecedores por valor em aberto."
        height={300}
        loading={loading}
        empty={!loading && fornecedoresChartData.length === 0}
        emptyMessage="Nenhuma partida em aberto no filtro selecionado."
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={fornecedoresChartData} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }}>
            <CartesianGrid {...c.grid} vertical horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickFormatter={(v: number) => formatBRLCompacto(v)} {...c.yAxis} />
            <YAxis type="category" dataKey="fornecedor" {...c.xAxis} width={200} />
            <Tooltip content={<FornecedorTooltip />} cursor={c.cursor} />
            <Bar dataKey="valor" fill={tokens.brand} radius={c.radius.right} maxBarSize={22} {...c.animation}>
              <LabelList dataKey="valor" position="right" formatter={(v: number) => formatBRLCompacto(v)} style={c.labelOnSurface} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Aging das Partidas em Aberto"
        icon={CalendarClock}
        description="Distribuição do valor em aberto por proximidade do vencimento."
        height={260}
        loading={loading}
        empty={!loading && kpis.qtdAbertas === 0}
        emptyMessage="Nenhuma partida em aberto no filtro selecionado."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={agingChartData} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }}>
            <CartesianGrid {...c.grid} vertical horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickFormatter={(v: number) => formatBRLCompacto(v)} {...c.yAxis} />
            <YAxis type="category" dataKey="bucket" {...c.xAxis} width={180} />
            <Tooltip content={<AgingTooltip />} cursor={c.cursor} />
            <Bar dataKey="valor" radius={c.radius.right} maxBarSize={28} {...c.animation}>
              {agingChartData.map(d => <Cell key={d.bucket} fill={d.cor} />)}
              <LabelList dataKey="valor" position="right" formatter={(v: number) => formatBRLCompacto(v)} style={c.labelOnSurface} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipagem**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/views/ContasPagarAnalise.tsx
git commit -m "feat: adiciona tela de Análise de Contas a Pagar (KPIs + gráficos)"
```

---

## Ordem de execução recomendada

**1 → 3 → 2**, não 1 → 2 → 3: a Task 2 referencia `src/views/ContasPagarAnalise.tsx` (criado na Task 3) no lazy import, e `npm run lint` só passa limpo se o arquivo já existir. Execute Task 1 (menu), depois Task 3 (tela de análise), depois Task 2 (roteamento), nessa ordem.

## Self-Review

**Spec coverage:**
1. Grupo de menu FINANCEIRO → Task 1, Step 3. ✅
2. Migração da página Contas a Pagar (id/group/path) → Task 1, Steps 1-2; Task 2, Step 1. ✅
3. Nova página de Análise com KPIs e 3 gráficos (categoria, fornecedores, aging) → Task 3. ✅
4. Acesso restrito a admin por padrão, mas editável em Módulos de Acesso (sem `alwaysAdmin`) → Task 1, Step 2 (`defaultRoles: ['admin']`, sem `alwaysAdmin` em nenhuma das duas entradas). ✅
5. Roteamento das duas rotas novas, com `STATE_PRESERVING_PATHS` → Task 2. ✅

**Placeholder scan:** nenhum "TBD"/"similar to"/passo sem código — todos os steps de código têm o código completo, incluindo o componente inteiro da Task 3.

**Type consistency:** `Fbl1nAnaliseLinha` (Task 3) usa os mesmos nomes de coluna da view `vw_fbl1n_c_pagar_analise` criada em `criar_view_fbl1n_c_pagar_analise.sql`: `empresa`, `razao_social_fornecedor`, `montante_moeda_doc`, `doc_compensacao`, `vencimento_liquido`, `tipo_documento_categoria_modulo` — todas colunas reais da view (a última é o alias de `t.categoria_modulo` na definição da view). `ContasPagarAnalise({ user }: { user: Profile })` casa com a chamada `<ContasPagarAnalise user={user} />` na Task 2.
