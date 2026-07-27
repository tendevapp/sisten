/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visão Hierárquica Geográfica:
 * Nível 1: Estado (UF ou 'Exterior')
 * Nível 2: Cidade
 *
 * Permite expandir/recolher cada estado para visualizar a decomposição por cidade.
 * O que não tem estado cadastrado ou é fornecedor internacional é agrupado sob 'Exterior'.
 */

import React, { useState } from 'react';
import { MapPin, ChevronDown, ChevronRight, Globe, Building } from 'lucide-react';
import { GrupoEstadoHierarquico } from '../../lib/historicoAnalytics';
import { formatInt, formatPct, formatBRLCompacto } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface HierarquiaGeograficaTreeProps {
  hierarquia: GrupoEstadoHierarquico[];
  onSelecionarCidade?: (cidadeOuChave: string) => void;
  onSelecionarEstado?: (estado: string) => void;
}

export default function HierarquiaGeograficaTree({
  hierarquia,
  onSelecionarCidade,
  onSelecionarEstado,
}: HierarquiaGeograficaTreeProps) {
  // Por padrão, mantemos todos os estados expandidos
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>(() => {
    const obj: Record<string, boolean> = {};
    hierarquia.forEach((g, idx) => {
      obj[g.estado] = idx < 5; // primeiros 5 expandidos por padrão
    });
    return obj;
  });

  const toggle = (est: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandidos(prev => ({ ...prev, [est]: !prev[est] }));
  };

  const totalGeral = hierarquia.reduce((s, g) => s + g.valorTotal, 0);

  return (
    <ChartCard
      title="Distribuição Geográfica Hierárquica"
      icon={MapPin}
      description="Nível 1: Estado (ou Exterior) · Nível 2: Cidade. Clique em um estado ou cidade para recortar a análise."
      empty={hierarquia.length === 0 || totalGeral <= 0}
      emptyMessage="Nenhum valor geográfico no filtro selecionado."
    >
      <div className="space-y-3 pt-2">
        {hierarquia.map(g => {
          const isExpanded = !!expandidos[g.estado];
          const isExterior = g.estado === 'Exterior';

          return (
            <div
              key={g.estado}
              className="rounded-xl border transition-all duration-150 overflow-hidden"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--surface-card)',
              }}
            >
              {/* Nível 1: Cabeçalho do Estado */}
              <div
                className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-[var(--surface-raised)] transition-colors select-none"
                onClick={() => onSelecionarEstado?.(g.estado)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={e => toggle(g.estado, e)}
                    className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-[var(--ink-muted)]"
                    aria-label={isExpanded ? 'Recolher cidades' : 'Expandir cidades'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="px-2 py-0.5 text-xs font-bold rounded-md tracking-wide"
                      style={
                        isExterior
                          ? { background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }
                          : { background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }
                      }
                    >
                      {isExterior ? (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3 inline" /> Exterior
                        </span>
                      ) : (
                        g.estado
                      )}
                    </span>

                    <span className="text-xs font-semibold text-[var(--ink-primary)] truncate">
                      {isExterior ? 'Compras Internacionais / Sem Estado' : `Estado de ${g.estado}`}
                    </span>

                    <span className="text-[11px] text-[var(--ink-muted)] hidden sm:inline">
                      ({g.cidades.length} {g.cidades.length === 1 ? 'local' : 'locais'})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 text-right">
                  <div className="w-24 sm:w-36 hidden md:block">
                    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, g.participacao))}%`,
                          background: isExterior ? 'var(--series-2)' : 'var(--series-1)',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-black tabular block text-[var(--ink-primary)]">
                      {formatBRLCompacto(g.valorTotal)}
                    </span>
                    <span className="text-[10px] text-[var(--ink-muted)] tabular block">
                      {formatPct(g.participacao)} · {formatInt(g.pedidos)} ped.
                    </span>
                  </div>
                </div>
              </div>

              {/* Nível 2: Lista de Cidades do Estado */}
              {isExpanded && g.cidades.length > 0 && (
                <div className="border-t border-[var(--hairline)] bg-slate-50/50 dark:bg-slate-900/40 p-2 sm:p-3 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] px-2 py-1 flex items-center justify-between">
                    <span>Nível 2 — Cidade / Localidade</span>
                    <span>Gasto & Participação</span>
                  </div>

                  {g.cidades.map(c => (
                    <div
                      key={c.chave}
                      onClick={() => onSelecionarCidade?.(c.chave)}
                      className="flex items-center justify-between p-2 rounded-lg border border-transparent hover:border-[var(--hairline)] hover:bg-[var(--surface-card)] transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pl-2">
                        <Building className="h-3.5 w-3.5 text-[var(--ink-muted)] group-hover:text-[var(--brand)] transition-colors flex-shrink-0" />
                        <span className="text-xs font-medium text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)] truncate">
                          {c.cidade}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0 text-right">
                        <span className="text-xs font-bold tabular text-[var(--ink-primary)]">
                          {formatBRLCompacto(c.valor)}
                        </span>
                        <span className="text-[11px] font-semibold tabular text-[var(--brand)] w-12 text-right">
                          {formatPct(c.participacao)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
