/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análise de Contas a Pagar (FBL1N): dashboard sobre a view
 * `vw_fbl1n_c_pagar_analise`, que já cruza os lançamentos com o cadastro de
 * tipos de documento SAP (tipo de documento). Busca paginada direto do
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
  data_compensacao: string | null;
  vencimento_liquido: string | null;
  tipo_documento_categoria_modulo: string | null;
  tipo_documento_descricao: string | null;
}

const PAGE_SIZE = 1000;

function estaAberta(l: Fbl1nAnaliseLinha): boolean {
  return !l.data_compensacao;
}

/** FBL1N traz partidas de fornecedor com sinal de crédito (negativo). A
 *  exposição em aberto é o valor invertido, para somar e ranquear positivo. */
function exposicao(l: Fbl1nAnaliseLinha): number {
  return -(l.montante_moeda_doc || 0);
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
          .select('empresa, razao_social_fornecedor, montante_moeda_doc, doc_compensacao, data_compensacao, vencimento_liquido, tipo_documento_categoria_modulo, tipo_documento_descricao')
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
    const totalAberto = abertas.reduce((sum, l) => sum + exposicao(l), 0);
    const vencidas = abertas.filter(l => l.vencimento_liquido && l.vencimento_liquido < hoje);
    const totalVencido = vencidas.reduce((sum, l) => sum + exposicao(l), 0);

    const porFornecedor = new Map<string, number>();
    abertas.forEach(l => {
      const nome = l.razao_social_fornecedor || 'Sem fornecedor';
      porFornecedor.set(nome, (porFornecedor.get(nome) || 0) + exposicao(l));
    });
    let maiorFornecedor = '—';
    let maiorFornecedorValor = -Infinity;
    porFornecedor.forEach((valor, nome) => {
      if (valor > maiorFornecedorValor) { maiorFornecedorValor = valor; maiorFornecedor = nome; }
    });
    if (maiorFornecedorValor === -Infinity) maiorFornecedorValor = 0;

    return { totalAberto, totalVencido, maiorFornecedor, maiorFornecedorValor, qtdAbertas: abertas.length };
  }, [abertas, hoje]);

  const categoriaChartData = useMemo(() => {
    const porCategoria = new Map<string, number>();
    abertas.forEach(l => {
      const cat = l.tipo_documento_descricao || 'Sem categoria';
      porCategoria.set(cat, (porCategoria.get(cat) || 0) + exposicao(l));
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
      porFornecedor.set(nome, (porFornecedor.get(nome) || 0) + exposicao(l));
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
      const v = exposicao(l);
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
        title="Em Aberto por Tipo de Documento"
        icon={BarChart3}
        description="Soma do valor em aberto por tipo de documento SAP (ex.: Fatura de Logística, Estorno de Fornecedor)."
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
