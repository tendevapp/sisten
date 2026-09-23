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
import { ChevronDown, LucideIcon } from 'lucide-react';

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
  /** Com `minPlotWidth` ativo, começa o trilho rolado até o fim (categorias mais
   *  recentes à direita já visíveis). Refaz a rolagem quando a largura muda —
   *  novo filtro, nova granularidade —, mas não interfere se o usuário rolar
   *  para trás e nada mudar. */
  scrollToEnd?: boolean;
  loading?: boolean;
  /** Quando verdadeiro, mostra `emptyMessage` no lugar do gráfico. */
  empty?: boolean;
  emptyMessage?: string;
  /** Rodapé: legenda estendida, drill-down, nota de fonte. */
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  /** Permite recolher/expandir o card. */
  collapsible?: boolean;
  /** Inicia recolhido se collapsible for true (padrão: false). */
  defaultCollapsed?: boolean;
  /** Estado de recolhimento controlado externamente. */
  collapsed?: boolean;
  /** Callback disparado ao alternar recolhimento. */
  onToggleCollapse?: (recolhido: boolean) => void;
}

export default function ChartCard({
  title,
  description,
  icon: Icon,
  actions,
  height = 300,
  minPlotWidth,
  scrollToEnd = true,
  loading = false,
  empty = false,
  emptyMessage = 'Nenhum dado no filtro selecionado.',
  footer,
  className = '',
  children,
  collapsible = false,
  defaultCollapsed = false,
  collapsed: controlledCollapsed,
  onToggleCollapse,
}: ChartCardProps) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(defaultCollapsed);
  const isControlled = controlledCollapsed !== undefined;
  const isCollapsed = collapsible ? (isControlled ? controlledCollapsed : internalCollapsed) : false;

  const handleToggle = () => {
    if (!collapsible) return;
    const next = !isCollapsed;
    if (!isControlled) {
      setInternalCollapsed(next);
    }
    onToggleCollapse?.(next);
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!scrollToEnd || !minPlotWidth || loading || empty || isCollapsed) return;
    const el = scrollRef.current;
    if (!el) return;

    const doScrollRight = () => {
      if (el) {
        el.scrollLeft = el.scrollWidth;
      }
    };

    doScrollRight();
    const t1 = setTimeout(doScrollRight, 50);
    const t2 = setTimeout(doScrollRight, 200);
    const t3 = setTimeout(doScrollRight, 400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [scrollToEnd, minPlotWidth, loading, empty, children, isCollapsed]);

  return (
    <section
      className={`rounded-xl border p-5 sm:p-6 transition-shadow duration-200 ${isCollapsed ? 'space-y-0' : 'space-y-4'} ${className}`}
      style={{
        background: 'var(--surface-card)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      }}
    >
      <header
        className={`flex items-start justify-between gap-4 ${collapsible ? 'cursor-pointer select-none group' : ''}`}
        onClick={collapsible ? handleToggle : undefined}
      >
        <div className="min-w-0 flex items-start gap-2.5">
          {collapsible && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggle();
              }}
              className="mt-0.5 p-1 rounded-md text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label={isCollapsed ? `Expandir ${title}` : `Recolher ${title}`}
              aria-expanded={!isCollapsed}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? '-rotate-90 text-slate-400' : 'rotate-0 text-indigo-600 dark:text-indigo-400'}`}
              />
            </button>
          )}
          <div className="min-w-0">
            <h3
              className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 flex-wrap"
              style={{ color: 'var(--ink-primary)' }}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />}
              <span>{title}</span>
              {collapsible && (
                <span className="text-[10px] font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  {isCollapsed ? 'recolhido · clique para expandir' : 'clique para recolher'}
                </span>
              )}
            </h3>
            {description && (
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && !isCollapsed && (
          <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </header>

      {!isCollapsed && (
        <>
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
            <div ref={scrollRef} className="overflow-x-auto custom-scrollbar -mx-5 sm:-mx-6 px-5 sm:px-6 pb-2.5 pt-1">
              <div style={{ minWidth: minPlotWidth, width: '100%' }}>{children}</div>
            </div>
          ) : (
            children
          )}

          {footer && !loading && !empty && footer}
        </>
      )}
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
