import React from 'react';

const statusVisual = {
  CRITICO: { label: 'Crítico', cor: 'var(--status-critical)', fundo: 'color-mix(in srgb, var(--status-critical) 12%, transparent)' },
  ALERTA: { label: 'Alerta', cor: 'var(--status-warning)', fundo: 'color-mix(in srgb, var(--status-warning) 12%, transparent)' },
  OK: { label: 'OK', cor: 'var(--status-good)', fundo: 'color-mix(in srgb, var(--status-good) 12%, transparent)' },
  SEM_DADOS: { label: 'Sem dados', cor: 'var(--ink-muted)', fundo: 'var(--surface-sunken)' },
} as const;

export const StatusBadge = ({ status }: { status: keyof typeof statusVisual }) => {
  const visual = statusVisual[status];
  return <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ color: visual.cor, background: visual.fundo }}>{visual.label}</span>;
};
