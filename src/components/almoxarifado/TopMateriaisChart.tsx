/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { EstoqueItem } from '../../types';
import { ClasseAbc, CLASSE_ABC_COR, normalizeCode, formatBRL, formatQtd } from '../../lib/almoxarifado';

interface TopMateriaisChartProps {
  itens: EstoqueItem[];
  mapaAbc: Map<string, ClasseAbc>;
  onSelecionar?: (material: string) => void;
}

interface TopMaterial {
  material: string;
  descricao: string;
  valor: number;
  quantidade: number;
  umb: string;
  classe: ClasseAbc;
}

const LIMITE = 15;

export default function TopMateriaisChart({ itens, mapaAbc, onSelecionar }: TopMateriaisChartProps) {
  const top = useMemo<TopMaterial[]>(() => {
    const mapa = new Map<string, TopMaterial>();
    itens.forEach(i => {
      const mat = normalizeCode(i.material);
      if (!mat) return;
      let atual = mapa.get(mat);
      if (!atual) {
        atual = {
          material: mat,
          descricao: i.txt_breve_material || '',
          valor: 0,
          quantidade: 0,
          umb: i.umb || '',
          classe: mapaAbc.get(mat) || 'C',
        };
        mapa.set(mat, atual);
      }
      atual.valor += i.valor_total || 0;
      atual.quantidade += i.quantidade || 0;
      if (!atual.descricao && i.txt_breve_material) atual.descricao = i.txt_breve_material;
      if (!atual.umb && i.umb) atual.umb = i.umb;
    });
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor).slice(0, LIMITE);
  }, [itens, mapaAbc]);

  const maior = top.length > 0 ? top[0].valor : 0;

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Top {LIMITE} Materiais por Valor</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Os itens que mais imobilizam capital. Clique num material para abrir sua posição detalhada.
        </p>
      </div>

      {top.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400 dark:text-slate-500">
          Nenhum item no filtro selecionado.
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((m, idx) => (
            <button
              key={m.material}
              onClick={() => onSelecionar?.(m.material)}
              className="w-full text-left group cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              title={`Ver ${m.material} na posição de estoque`}
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="w-6 shrink-0 text-[10px] font-bold text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0 group-hover:text-emerald-600 dark:group-hover:text-emerald-500">
                  {m.material}
                </span>
                <span
                  className="shrink-0 rounded px-1 py-0.5 text-[9px] font-black text-white"
                  style={{ backgroundColor: CLASSE_ABC_COR[m.classe] }}
                  title={`Classe ${m.classe}`}
                >
                  {m.classe}
                </span>
                <span className="truncate text-slate-600 dark:text-slate-400 flex-1">{m.descricao || '—'}</span>
                <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-500 tabular-nums">{formatBRL(m.valor)}</span>
              </div>
              <div className="mt-1 ml-8 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 dark:bg-emerald-600"
                  style={{ width: `${maior > 0 ? (m.valor / maior) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-0.5 ml-8 text-[10px] text-slate-400 dark:text-slate-500">
                Saldo: {formatQtd(m.quantidade)} {m.umb}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
