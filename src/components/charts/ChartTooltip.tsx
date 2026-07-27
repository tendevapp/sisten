/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tooltip único dos gráficos.
 *
 * Substitui sete implementações quase idênticas que carregavam estilo inline de
 * tema claro (`background: '#fff'`, `color: '#0f172a'`) — no tema escuro elas
 * apareciam como caixa branca com texto invisível.
 *
 * Regra de tinta: o valor e o rótulo usam cor de texto; a identidade da série
 * é carregada pelo quadradinho colorido ao lado, nunca pelo texto.
 */

import React from 'react';

export interface TooltipRow {
  label: string;
  value: React.ReactNode;
  /** Cor da marca da série. Sem ela a linha não ganha quadradinho. */
  color?: string;
  /** Recuo para sub-linhas (composição dentro de um total). */
  indent?: boolean;
}

interface ChartTooltipProps {
  title?: React.ReactNode;
  /** Linha de contexto sob o título — descrição da categoria, período. */
  subtitle?: React.ReactNode;
  rows: TooltipRow[];
  /** Nota final: percentual acumulado, dica de clique. */
  footer?: React.ReactNode;
}

export default function ChartTooltip({ title, subtitle, rows, footer }: ChartTooltipProps) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs min-w-[180px] border"
      style={{
        background: 'var(--chart-tooltip-bg)',
        borderColor: 'var(--chart-tooltip-border)',
        boxShadow: 'var(--chart-tooltip-shadow)',
        color: 'var(--ink-primary)',
      }}
    >
      {title && (
        <div className="font-bold leading-tight" style={{ color: 'var(--ink-primary)' }}>
          {title}
        </div>
      )}
      {subtitle && (
        <div className="mt-0.5 leading-snug" style={{ color: 'var(--ink-muted)' }}>
          {subtitle}
        </div>
      )}

      {rows.length > 0 && (
        <div
          className={title || subtitle ? 'mt-2 pt-2 border-t space-y-1' : 'space-y-1'}
          style={title || subtitle ? { borderColor: 'var(--hairline)' } : undefined}
        >
          {rows.map((r, i) => (
            <div
              key={`${r.label}-${i}`}
              className="flex items-center gap-2"
              style={r.indent ? { paddingLeft: 10 } : undefined}
            >
              {r.color ? (
                <span
                  className="h-2 w-2 rounded-[2px] shrink-0"
                  style={{ background: r.color }}
                  aria-hidden="true"
                />
              ) : (
                <span className="h-2 w-2 shrink-0" aria-hidden="true" />
              )}
              <span className="flex-1 truncate" style={{ color: 'var(--ink-secondary)' }}>
                {r.label}
              </span>
              <span className="font-semibold tabular" style={{ color: 'var(--ink-primary)' }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {footer && (
        <div
          className="mt-2 pt-2 border-t leading-snug"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
