/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Agregado, formatBRL } from '../../lib/almoxarifado';

interface ConcentracaoChartProps {
  titulo: string;
  subtitulo: string;
  dados: Agregado[];
  // 'Outros' agrega várias categorias, então não é um destino de filtro válido.
  onSelecionar?: (chave: string) => void;
}

export default function ConcentracaoChart({ titulo, subtitulo, dados, onSelecionar }: ConcentracaoChartProps) {
  const maior = dados.reduce((m, d) => Math.max(m, d.valor), 0);
  const total = dados.reduce((a, d) => a + d.valor, 0);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{titulo}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitulo}</p>
      </div>

      {dados.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400 dark:text-slate-500">
          Nenhum item no filtro selecionado.
        </div>
      ) : (
        <div className="space-y-2.5">
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
                className={`w-full text-left group ${clicavel ? 'cursor-pointer' : 'cursor-default'}`}
                title={clicavel ? `Ver itens de ${d.chave}` : undefined}
              >
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className={`truncate font-semibold ${agregado ? 'text-slate-400 dark:text-slate-500 italic' : 'text-slate-700 dark:text-slate-300'} ${clicavel ? 'group-hover:text-emerald-600 dark:group-hover:text-emerald-500' : ''}`}>
                    {d.chave}
                  </span>
                  <span className="shrink-0 font-bold text-slate-600 dark:text-slate-400 tabular-nums">
                    {formatBRL(d.valor)} <span className="text-slate-400 dark:text-slate-500 font-medium">({pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${agregado ? 'bg-slate-300 dark:bg-slate-700' : 'bg-emerald-500 dark:bg-emerald-600'}`}
                    style={{ width: `${largura}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  {d.itens.toLocaleString('pt-BR')} itens · {d.materiais.toLocaleString('pt-BR')} materiais
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
