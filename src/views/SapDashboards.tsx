/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, TrendingUp, AlertTriangle, Clock, CheckCircle, Users,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { EnrichedSAPRecord } from '../types';
import { formatInt, formatPctInt } from '../lib/format';
import { useChartTokens } from '../lib/chartTokens';
import ChartCard from '../components/charts/ChartCard';
import KpiCard from '../components/charts/KpiCard';

interface SapDashboardsProps {
  onNavigate: (path: string) => void;
}

// Os três níveis de alerta são *status*, não identidade: escala reservada, e
// cada um sempre acompanhado de ícone e rótulo.
const NIVEIS = [
  { chave: '⚠️ AÇÃO URGENTE', rotulo: 'Crítico', detalhe: 'Escalação pendente', token: 'var(--status-critical)' },
  { chave: '⚡ ACOMPANHAR', rotulo: 'Atenção', detalhe: 'Em acompanhamento', token: 'var(--status-warning)' },
  { chave: '✅ OK', rotulo: 'OK / Monitoramento', detalhe: 'Dentro da meta', token: 'var(--status-good)' },
] as const;

export default function SapDashboards({ onNavigate }: SapDashboardsProps) {
  const [records, setRecords] = useState<EnrichedSAPRecord[]>([]);
  const tokens = useChartTokens();

  useEffect(() => {
    setRecords(localDb.getEnrichedSAPRequisicoes());
  }, []);

  const m = useMemo(() => {
    const total = records.length;
    const withPO = records.filter(r => r.status_requisicao === 'Processado').length;
    const withoutPO = records.filter(r => r.status_requisicao === 'Sem PO').length;
    const critical = records.filter(r => r.alerta === '⚠️ ESCALAR IMEDIATAMENTE' || r.alerta === '⚠️ AÇÃO URGENTE').length;
    const attention = records.filter(r => r.alerta === '⚡ ACOMPANHAR').length;
    const ok = records.filter(r => r.alerta === '✅ OK' || r.alerta === '📋 MONITORAR').length;
    const totalOpenDays = records.reduce((acc, r) => acc + (r.dias_em_aberto || 0), 0);
    const avgOpenDays = total > 0 ? Math.round(totalOpenDays / total) : 0;

    const groupCounts: Record<string, number> = {};
    records.forEach(r => {
      groupCounts[r.grupo_comprador] = (groupCounts[r.grupo_comprador] || 0) + 1;
    });
    const sortedGroups = Object.entries(groupCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { total, withPO, withoutPO, critical, attention, ok, avgOpenDays, sortedGroups };
  }, [records]);

  const conversao = m.total > 0 ? (m.withPO / m.total) * 100 : 0;

  const handleDrilldown = (filterType: string, value: string) => {
    let q = '';
    if (filterType === 'status') q = `status=${value}`;
    else if (filterType === 'alert') q = `alert=${value}`;
    else if (filterType === 'buyer') q = `buyer=${value}`;
    onNavigate(`/suprimentos/painel?${q}`);
  };

  const niveis = [
    { ...NIVEIS[0], valor: m.critical, cor: tokens.status.critical },
    { ...NIVEIS[1], valor: m.attention, cor: tokens.status.warning },
    { ...NIVEIS[2], valor: m.ok, cor: tokens.status.good },
  ];
  const totalNiveis = niveis.reduce((a, n) => a + n.valor, 0);

  return (
    <div className="space-y-6 text-left">
      <div className="reveal">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
          <LayoutDashboard className="h-7 w-7" style={{ color: 'var(--brand)' }} />
          Analytics &amp; Dashboards SAP
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          Indicadores consolidados de eficiência, criticidade, gargalos de atendimento e lead time.
        </p>
      </div>

      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4 stagger">
        <KpiCard
          label="Índice de Conversão"
          value={conversao}
          format={formatPctInt}
          detail={`${formatInt(m.withPO)} de ${formatInt(m.total)} requisições convertidas em pedido`}
          icon={TrendingUp}
          accent="var(--series-3)"
          share={conversao / 100}
          emphasize
        />
        <KpiCard
          label="Atrasos Críticos"
          value={m.critical}
          format={formatInt}
          detail="Acima de 30 dias abertos sem PO"
          icon={AlertTriangle}
          accent="var(--status-critical)"
          share={m.total > 0 ? m.critical / m.total : undefined}
          emphasize
          onClick={() => handleDrilldown('alert', '⚠️ AÇÃO URGENTE')}
        />
        <KpiCard
          label="Tempo Médio em Aberto"
          value={m.avgOpenDays}
          format={v => `${formatInt(v)} dias`}
          detail="Média de processamento total"
          icon={Clock}
          accent="var(--series-1)"
        />
        <KpiCard
          label="Atendidos"
          value={m.withPO}
          format={formatInt}
          detail="Pedidos concluídos na base SAP"
          icon={CheckCircle}
          accent="var(--series-3)"
          share={m.total > 0 ? m.withPO / m.total : undefined}
          onClick={() => handleDrilldown('status', 'Com PO')}
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Funil de conversão. A sequência é real (sem PO → com PO), então a
            numeração dos passos carrega informação e a rampa ordinal de um
            matiz só mostra o avanço na própria cor. */}
        <ChartCard
          title="Fluxo de Conversão"
          description="Onde as requisições estão no caminho até virar pedido. Clique num passo para filtrar o painel."
          height={260}
          empty={m.total === 0}
          emptyMessage="Nenhuma requisição importada."
        >
          <ol className="space-y-3 py-2 stagger">
            {[
              { passo: 1, rotulo: 'Aguardando cotação / pedido', valor: m.withoutPO, destino: 'Sem PO', cor: 'var(--atraso-2)' },
              { passo: 2, rotulo: 'Convertido em pedido SAP', valor: m.withPO, destino: 'Com PO', cor: 'var(--atraso-4)' },
            ].map(e => {
              const pct = m.total > 0 ? (e.valor / m.total) * 100 : 0;
              return (
                <li key={e.passo}>
                  <button
                    onClick={() => handleDrilldown('status', e.destino)}
                    className="w-full rounded-lg border p-3.5 text-left group transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ borderColor: 'var(--hairline)', outlineColor: e.cor }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                        Passo {e.passo}
                      </span>
                      <span className="text-[11px] font-semibold tabular" style={{ color: 'var(--ink-muted)' }}>
                        {formatPctInt(pct)}
                      </span>
                    </div>
                    <p className="text-xs font-bold mt-1" style={{ color: 'var(--ink-primary)' }}>{e.rotulo}</p>
                    <p className="text-xl font-black mt-0.5 tabular" style={{ color: 'var(--ink-primary)' }}>
                      {formatInt(e.valor)} RIs
                    </p>
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${pct}%`, background: e.cor }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] group-hover:underline" style={{ color: 'var(--ink-muted)' }}>
                      Filtrar no painel →
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        </ChartCard>

        {/* Níveis de alerta. Era um SVG desenhado à mão em que os três arcos
            começavam todos no zero com strokeDasharray="251" — o anel verde
            cobria a circunferência inteira sempre, independentemente do dado.
            Aqui é uma barra 100% empilhada, que é parte-do-todo lida sem
            precisar comparar ângulos. */}
        <ChartCard
          title="Níveis de Alerta"
          description="Distribuição das requisições por severidade. Clique num nível para filtrar o painel."
          height={260}
          empty={totalNiveis === 0}
          emptyMessage="Nenhuma requisição classificada."
        >
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tabular" style={{ color: 'var(--ink-primary)' }}>
                {formatInt(m.total)}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                itens totais
              </span>
            </div>

            <div className="flex h-7 w-full gap-[2px] rounded-md overflow-hidden">
              {niveis.map(n => (
                <div
                  key={n.chave}
                  className="h-full first:rounded-l-md last:rounded-r-md transition-[filter] duration-200 hover:brightness-110"
                  style={{
                    width: `${totalNiveis > 0 ? (n.valor / totalNiveis) * 100 : 0}%`,
                    background: n.token,
                  }}
                  title={`${n.rotulo}: ${formatInt(n.valor)}`}
                />
              ))}
            </div>

            <ul className="space-y-1.5">
              {niveis.map(n => (
                <li key={n.chave}>
                  <button
                    onClick={() => handleDrilldown('alert', n.chave)}
                    className="w-full flex items-center gap-3 p-2 -mx-2 rounded-lg text-left transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
                    style={{ outlineColor: n.token }}
                  >
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ background: n.token }} aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                        {n.rotulo}: {formatInt(n.valor)} itens
                      </span>
                      <span className="block text-[10px]" style={{ color: 'var(--ink-muted)' }}>{n.detalhe}</span>
                    </span>
                    <span className="text-xs font-semibold tabular shrink-0" style={{ color: 'var(--ink-secondary)' }}>
                      {formatPctInt(totalNiveis > 0 ? (n.valor / totalNiveis) * 100 : 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Top Grupos de Compras por Volume"
        icon={Users}
        description="Os cinco grupos com mais itens atribuídos. Clique num grupo para ver seus itens no painel."
        height={180}
        empty={m.sortedGroups.length === 0}
        emptyMessage="Nenhum grupo de compras na base."
      >
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 stagger">
          {m.sortedGroups.map(([group, val], idx) => {
            const percentage = m.total > 0 ? (val / m.total) * 100 : 0;
            return (
              <button
                key={group}
                onClick={() => handleDrilldown('buyer', group)}
                className="rounded-xl border p-4 text-left space-y-2 cursor-pointer group transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ borderColor: 'var(--hairline)', outlineColor: 'var(--series-1)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded tabular"
                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
                  >
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-extrabold truncate" style={{ color: 'var(--ink-primary)' }}>{group}</span>
                </div>
                <p className="text-lg font-black tabular" style={{ color: 'var(--ink-primary)' }}>{formatInt(val)} itens</p>
                <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${percentage}%`, background: 'var(--series-1)' }}
                  />
                </div>
                <p className="text-[10px] group-hover:underline" style={{ color: 'var(--ink-muted)' }}>Visualizar itens →</p>
              </button>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
}
