/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Moldura padrão de um painel de gráfico: título, descrição, ações, e os
 * estados de carregando / vazio.
 *
 * Antes cada gráfico repetia essa casca com valores divergentes (p-4 vs p-5 vs
 * p-6, border-slate-100 vs border-slate-200/80), então dois cards lado a lado
 * não alinhavam. Aqui a moldura é uma só.
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ChartCardProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Canto superior direito — filtro local, alternador de granularidade. */
  actions?: React.ReactNode;
  /** Altura da área de plotagem. Reservada também no skeleton, para o
   *  conteúdo não empurrar a página ao chegar. */
  height?: number;
  /** Largura mínima da área de plotagem, em px (ver `estimateCategoryChartWidth`
   *  em chartDefaults.ts). Quando definida, o gráfico ganha um trilho com
   *  rolagem horizontal própria em vez de espremer todas as categorias no
   *  espaço disponível — melhor ler com o dedo do que apertar barras e
   *  rótulos até sobrepor. Sem espaço sobrando (card mais largo que o
   *  mínimo) o trilho não aparece, o gráfico só preenche a largura normal. */
  minPlotWidth?: number;
  loading?: boolean;
  /** Quando verdadeiro, mostra `emptyMessage` no lugar do gráfico. */
  empty?: boolean;
  emptyMessage?: string;
  /** Rodapé: legenda estendida, drill-down, nota de fonte. */
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export default function ChartCard({
  title,
  description,
  icon: Icon,
  actions,
  height = 300,
  minPlotWidth,
  loading = false,
  empty = false,
  emptyMessage = 'Nenhum dado no filtro selecionado.',
  footer,
  className = '',
  children,
}: ChartCardProps) {
  return (
    <section
      className={`rounded-xl border p-5 sm:p-6 space-y-4 transition-shadow duration-200 ${className}`}
      style={{
        background: 'var(--surface-card)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      }}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            className="text-sm font-bold uppercase tracking-wider flex items-center gap-2"
            style={{ color: 'var(--ink-primary)' }}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />}
            {title}
          </h3>
          {description && (
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </header>

      {loading ? (
        <ChartSkeleton height={height} />
      ) : empty ? (
        <div
          className="flex items-center justify-center text-sm text-center px-6"
          style={{ height, color: 'var(--ink-muted)' }}
        >
          {emptyMessage}
        </div>
      ) : minPlotWidth ? (
        <div className="overflow-x-auto no-scrollbar -mx-5 sm:-mx-6 px-5 sm:px-6">
          <div style={{ minWidth: minPlotWidth }}>{children}</div>
        </div>
      ) : (
        children
      )}

      {footer && !loading && !empty && footer}
    </section>
  );
}

/**
 * Skeleton com a forma da plotagem final — barras de alturas variadas sobre uma
 * linha de base — para a página não saltar quando os dados chegam.
 */
export function ChartSkeleton({ height = 300 }: { height?: number }) {
  const barras = [52, 78, 41, 90, 63, 71, 35, 84];
  return (
    <div
      className="flex items-end gap-2.5 pb-6 border-b"
      style={{ height, borderColor: 'var(--hairline)' }}
      role="status"
      aria-label="Carregando gráfico"
    >
      {barras.map((h, i) => (
        <div
          key={i}
          className="skeleton flex-1 rounded-t"
          style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
