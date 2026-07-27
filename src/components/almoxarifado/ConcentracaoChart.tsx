/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Agregado, formatBRL } from '../../lib/almoxarifado';
import { formatInt, formatPct } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface ConcentracaoChartProps {
  titulo: string;
  subtitulo: string;
  dados: Agregado[];
  icon?: LucideIcon;
  // 'Outros' agrega várias categorias, então não é um destino de filtro válido.
  onSelecionar?: (chave: string) => void;
  loading?: boolean;
}

export default function ConcentracaoChart({ titulo, subtitulo, dados, icon, onSelecionar, loading }: ConcentracaoChartProps) {
  const maior = dados.reduce((m, d) => Math.max(m, d.valor), 0);
  const total = dados.reduce((a, d) => a + d.valor, 0);

  return (
    <ChartCard
      title={titulo}
      description={subtitulo}
      icon={icon}
      height={240}
      loading={loading}
      empty={dados.length === 0}
      emptyMessage="Nenhum item no filtro selecionado."
    >
      <div className="space-y-2.5 stagger">
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
              className={`w-full text-left group rounded-md px-1.5 py-1 -mx-1.5 transition-colors duration-150
                ${clicavel ? 'cursor-pointer hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1' : 'cursor-default'}`}
              style={{ outlineColor: 'var(--series-1)' }}
              title={clicavel ? `Ver itens de ${d.chave}` : undefined}
            >
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span
                  className={`truncate font-semibold ${agregado ? 'italic' : ''}`}
                  style={{ color: agregado ? 'var(--ink-muted)' : 'var(--ink-secondary)' }}
                >
                  {d.chave}
                </span>
                <span className="shrink-0 font-bold tabular" style={{ color: 'var(--ink-primary)' }}>
                  {formatBRL(d.valor)}{' '}
                  <span className="font-medium" style={{ color: 'var(--ink-muted)' }}>({formatPct(pct)})</span>
                </span>
              </div>
              {/* O trilho é a superfície rebaixada; a barra cresce a partir de
                  zero na entrada, o que ancora a leitura na linha de base. */}
              <div className="mt-1 h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${largura}%`,
                    background: agregado ? 'var(--ink-muted)' : 'var(--series-1)',
                  }}
                />
              </div>
              <p className="mt-0.5 text-[10px] tabular" style={{ color: 'var(--ink-muted)' }}>
                {formatInt(d.itens)} itens · {formatInt(d.materiais)} materiais
              </p>
            </button>
          );
        })}
      </div>
    </ChartCard>
  );
}
