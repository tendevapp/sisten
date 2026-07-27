/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { EstoqueItem } from '../../types';
import { ClasseAbc, CLASSE_ABC_COR, normalizeCode, formatBRL, formatQtd } from '../../lib/almoxarifado';
import ChartCard from '../charts/ChartCard';

interface TopMateriaisChartProps {
  itens: EstoqueItem[];
  mapaAbc: Map<string, ClasseAbc>;
  onSelecionar?: (material: string) => void;
  loading?: boolean;
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

export default function TopMateriaisChart({ itens, mapaAbc, onSelecionar, loading }: TopMateriaisChartProps) {
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
    <ChartCard
      title={`Top ${LIMITE} Materiais por Valor`}
      icon={Trophy}
      description="Os itens que mais imobilizam capital. Clique num material para abrir sua posição detalhada."
      height={320}
      loading={loading}
      empty={top.length === 0}
      emptyMessage="Nenhum item no filtro selecionado."
    >
      {/* O ranking é uma sequência real (1º, 2º, 3º por valor), então a
          numeração carrega informação — não é ornamento. */}
      <ol className="space-y-1">
        {top.map((m, idx) => (
          <li key={m.material}>
            <button
              onClick={() => onSelecionar?.(m.material)}
              className="w-full text-left group cursor-pointer rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
              style={{ outlineColor: 'var(--series-1)' }}
              title={`Ver ${m.material} na posição de estoque`}
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="w-6 shrink-0 text-[10px] font-bold tabular" style={{ color: 'var(--ink-muted)' }}>
                  {idx + 1}
                </span>
                <span
                  className="font-mono font-bold shrink-0 transition-colors"
                  style={{ color: 'var(--ink-primary)' }}
                >
                  {m.material}
                </span>
                {/* Distintivo contornado, não preenchido: o passo C da rampa é
                    claro demais para carregar texto branco em cima, e o passo A
                    inverte de claro para escuro entre os temas. */}
                <span
                  className="shrink-0 rounded px-1 py-0.5 text-[9px] font-black border"
                  style={{ borderColor: CLASSE_ABC_COR[m.classe], color: 'var(--ink-primary)' }}
                  title={`Classe ${m.classe}`}
                >
                  {m.classe}
                </span>
                <span className="truncate flex-1" style={{ color: 'var(--ink-secondary)' }}>{m.descricao || '—'}</span>
                <span className="shrink-0 font-bold tabular" style={{ color: 'var(--ink-primary)' }}>{formatBRL(m.valor)}</span>
              </div>
              <div className="mt-1 ml-8 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${maior > 0 ? (m.valor / maior) * 100 : 0}%`, background: CLASSE_ABC_COR[m.classe] }}
                />
              </div>
              <p className="mt-0.5 ml-8 text-[10px] tabular" style={{ color: 'var(--ink-muted)' }}>
                Saldo: {formatQtd(m.quantidade)} {m.umb}
              </p>
            </button>
          </li>
        ))}
      </ol>
    </ChartCard>
  );
}
