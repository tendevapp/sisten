/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Primitivas de tabela densa.
 *
 * As quatro telas de listagem (Estoque, Histórico, Rastreio, Central Compras)
 * repetiam a mesma casca com valores divergentes — padding px-2 vs px-3, borda
 * slate-100 vs slate-200, cabeçalho que rolava para fora da tela em listas de
 * milhares de linhas. Aqui a casca é uma só, sobre tokens.
 *
 * O que estas primitivas garantem e as tabelas manuais não garantiam:
 * - cabeçalho fixo no topo durante a rolagem vertical;
 * - algarismos de largura fixa nas colunas numéricas, para os valores
 *   alinharem na vertical e não mudarem de largura ao filtrar;
 * - linha inteira alcançável por teclado quando é clicável;
 * - esqueleto com o número real de colunas, em vez de spinner.
 */

import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

/* --------------------------------------------------------------------- */
/* Casca                                                                  */
/* --------------------------------------------------------------------- */

interface TableShellProps {
  children: React.ReactNode;
  /** Altura máxima da área rolável. Sem ela a tabela cresce sem limite e o
   *  cabeçalho fixo não tem contra o que grudar. */
  maxHeight?: number | string;
  /** Altura mínima da área rolável. Garante espaço vertical para dropdowns e tabelas com poucos itens. */
  minHeight?: number | string;
  className?: string;
}

export function TableShell({ children, maxHeight = '70vh', minHeight, className = '' }: TableShellProps) {
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const mainScrollRef = React.useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = React.useState<number>(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = React.useState<boolean>(false);
  const isSyncingRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    const mainEl = mainScrollRef.current;
    if (!mainEl) return;

    const checkOverflow = () => {
      const scrollWidth = mainEl.scrollWidth;
      const clientWidth = mainEl.clientWidth;
      setContentWidth(scrollWidth);
      setHasHorizontalOverflow(scrollWidth > clientWidth + 1);
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });

    resizeObserver.observe(mainEl);
    if (mainEl.firstElementChild) {
      resizeObserver.observe(mainEl.firstElementChild as Element);
    }

    return () => resizeObserver.disconnect();
  }, [children]);

  const handleTopScroll = () => {
    if (isSyncingRef.current) return;
    if (topScrollRef.current && mainScrollRef.current) {
      isSyncingRef.current = true;
      mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
  };

  const handleMainScroll = () => {
    if (isSyncingRef.current) return;
    if (topScrollRef.current && mainScrollRef.current) {
      isSyncingRef.current = true;
      topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
  };

  return (
    <div
      className={`rounded-xl border overflow-hidden flex flex-col ${className}`}
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
    >
      {/* Barra de rolagem no topo, visível apenas quando houver transbordo horizontal */}
      {hasHorizontalOverflow && (
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="overflow-x-auto overflow-y-hidden border-b shrink-0"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
        >
          <div style={{ width: contentWidth, height: 8 }} />
        </div>
      )}
      <div
        ref={mainScrollRef}
        onScroll={handleMainScroll}
        className="overflow-auto flex-1"
        style={{ maxHeight, minHeight }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Cabeçalho fixo. `position: sticky` no <th> (não no <thead>, que o Safari
 * ignora), com fundo opaco — sem opacidade as linhas passariam visíveis por
 * baixo durante a rolagem.
 */
export function TableHeadRow({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="text-left uppercase tracking-wider text-[10px]">
        {children}
      </tr>
    </thead>
  );
}

const thBase: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--surface-raised)',
  color: 'var(--ink-muted)',
  boxShadow: 'inset 0 -1px 0 var(--hairline)',
};

interface ThProps {
  label?: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  className?: string;
  /** Conteúdo próprio no lugar do rótulo — caixa de seleção, botão. */
  children?: React.ReactNode;
  /** Fixa a coluna à esquerda durante a rolagem horizontal, além do cabeçalho fixo no topo — para a coluna mais consultada de uma grade muito larga (ver `Td` — precisa do mesmo `stickyLeft` na célula do corpo). */
  stickyLeft?: boolean;
}

export function Th({ label, align = 'left', width = '', className = '', children, stickyLeft = false }: ThProps) {
  const alinhamento = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const style: React.CSSProperties = stickyLeft ? { ...thBase, left: 0, zIndex: 2 } : thBase;
  return (
    <th
      className={`px-3 py-2.5 font-bold whitespace-nowrap ${alinhamento} ${width} ${className}`}
      style={style}
      scope="col"
    >
      {children ?? label}
    </th>
  );
}

interface SortableThProps extends ThProps {
  col: string;
  sortColumn: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
}

export function SortableTh({
  col, label, align = 'left', width = '', sortColumn, sortDir, onSort,
}: SortableThProps) {
  const active = sortColumn === col;
  return (
    <th
      className={`px-3 py-2.5 font-bold ${align === 'right' ? 'text-right' : 'text-left'} ${width}`}
      style={thBase}
      scope="col"
      // Comunica a ordenação a leitor de tela: antes só a seta indicava, e
      // seta é informação visual.
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider cursor-pointer max-w-full transition-colors duration-150 rounded-sm
          focus-visible:outline-2 focus-visible:outline-offset-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}
        style={{ color: active ? 'var(--brand)' : 'inherit', outlineColor: 'var(--brand)' }}
        title={`Ordenar por ${label}`}
      >
        <span className="truncate">{label}</span>
        {active
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)
          : <ArrowUpDown className="h-3 w-3 shrink-0" style={{ opacity: 0.4 }} />}
      </button>
    </th>
  );
}

/* --------------------------------------------------------------------- */
/* Corpo                                                                  */
/* --------------------------------------------------------------------- */

export function TableBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
      {children}
    </tbody>
  );
}

interface TrProps {
  children: React.ReactNode;
  onClick?: () => void;
  /** Marca a linha como alterada/destacada, com uma faixa na borda esquerda. */
  accent?: string;
  title?: string;
}

export function Tr({ children, onClick, accent, title }: TrProps) {
  return (
    <tr
      onClick={onClick}
      title={title}
      // `onClick` aqui é conveniência para mouse, não a única forma de abrir a
      // linha: toda tabela com linha clicável carrega também um botão real
      // numa das células, que é o caminho de teclado e de leitor de tela.
      //
      // Deliberadamente sem `role="button"` nem `tabIndex`: role de botão num
      // <tr> apaga a semântica de linha (o leitor de tela deixa de anunciar
      // "linha 12 de 340" e a posição das colunas), e um <tr> focável sem role
      // é pior ainda — recebe foco sem anunciar o que faz.
      className={`align-top transition-colors duration-150 hover:bg-[var(--surface-raised)]
        ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        borderColor: 'var(--hairline)',
        ...(accent ? { boxShadow: `inset 3px 0 0 0 ${accent}` } : null),
      }}
    >
      {children}
    </tr>
  );
}

interface TdProps {
  children: React.ReactNode;
  align?: 'left' | 'right';
  /** Aplica algarismos tabulares. Use em toda coluna de número. */
  numeric?: boolean;
  /** Trunca com reticências e expõe o texto completo no title. */
  truncate?: boolean;
  title?: string;
  strong?: boolean;
  mono?: boolean;
  className?: string;
  colSpan?: number;
  /** Fixa a coluna à esquerda durante a rolagem horizontal — ver `Th`. Fundo opaco, senão as colunas por trás apareceriam por baixo ao rolar. */
  stickyLeft?: boolean;
}

export function Td({
  children, align = 'left', numeric = false, truncate = false,
  title, strong = false, mono = false, className = '', colSpan, stickyLeft = false,
}: TdProps) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}
        ${numeric ? 'tabular' : ''} ${truncate ? 'max-w-[240px] truncate' : ''}
        ${mono ? 'font-mono' : ''} ${strong ? 'font-bold' : ''} ${className}`}
      style={{
        color: strong ? 'var(--ink-primary)' : 'var(--ink-secondary)',
        ...(stickyLeft ? { position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface-card)' } : null),
      }}
    >
      {children}
    </td>
  );
}

/* --------------------------------------------------------------------- */
/* Estados                                                                */
/* --------------------------------------------------------------------- */

/** Esqueleto com o número real de colunas, para a tabela não saltar ao chegar. */
export function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <TableShell maxHeight="none">
      <table className="w-full text-xs">
        <TableHeadRow>
          {Array.from({ length: columns }).map((_, i) => (
            <Th key={i} label="" />
          ))}
        </TableHeadRow>
        <TableBody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ borderColor: 'var(--hairline)' }}>
              {Array.from({ length: columns }).map((_, ccol) => (
                <td key={ccol} className="px-3 py-2.5">
                  <div
                    className="skeleton h-3"
                    // Larguras irregulares: uma grade de barras idênticas lê
                    // como gráfico, não como tabela carregando.
                    style={{ width: `${55 + ((r * 7 + ccol * 13) % 40)}%`, animationDelay: `${(r * 3 + ccol) * 30}ms` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </TableBody>
      </table>
    </TableShell>
  );
}

interface TableEmptyProps {
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  /** O que fazer agora. Uma tela vazia é um convite à ação, não um aviso. */
  hint?: string;
  action?: React.ReactNode;
}

export function TableEmpty({ icon: Icon, title, hint, action }: TableEmptyProps) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center rounded-xl border px-6 py-14"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
    >
      {Icon && (
        <Icon className="h-10 w-10 mb-3" style={{ color: 'var(--ink-muted)', opacity: 0.6 }} />
      )}
      <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{title}</p>
      {hint && (
        <p className="text-xs mt-1 max-w-md" style={{ color: 'var(--ink-muted)' }}>{hint}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Rodapé com contagem e ação de carregar mais. */
export function TableFooter({
  shown, total, onLoadMore, loadStep,
}: {
  shown: number;
  total: number;
  onLoadMore?: () => void;
  loadStep: number;
}) {
  const restante = total - shown;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <span className="text-xs tabular" style={{ color: 'var(--ink-muted)' }}>
        Mostrando {shown.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
      </span>
      {restante > 0 && onLoadMore && (
        <button
          onClick={onLoadMore}
          className="px-4 py-2 border rounded-lg text-xs font-bold cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
        >
          Carregar mais {Math.min(loadStep, restante).toLocaleString('pt-BR')}
        </button>
      )}
    </div>
  );
}
