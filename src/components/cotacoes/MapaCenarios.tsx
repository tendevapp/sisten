/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Os três cenários de compra, lado a lado. É a parte do mapa que responde a
 * pergunta que a matriz sozinha não responde: dividir o pedido entre os
 * menores preços quase sempre parece melhor célula a célula e quase sempre
 * sai pior no total, porque cada fornecedor a mais é mais um frete, mais um
 * pedido e mais um recebimento. Ver os três totais juntos — com os fretes
 * inteiros, não rateados — é o que evita essa decisão errada.
 */

import React from 'react';
import { Split, Package, MousePointerClick, AlertTriangle, TrendingDown, Check } from 'lucide-react';
import { formatBRL } from '../../lib/format';
import { nomeFornecedorCurto } from '../../lib/cotacoes';
import type { Cenario } from '../../lib/mapaCotacao';

const ICONES: Record<Cenario['id'], React.ElementType> = {
  menor_preco: Split,
  fornecedor_unico: Package,
  selecao: MousePointerClick,
};

interface MapaCenariosProps {
  cenarios: Cenario[];
  /** Cenário aplicado na matriz com um clique — leva as marcações do cenário para as células. */
  onAplicar?: (cenario: Cenario) => void;
}

export default function MapaCenarios({ cenarios, onAplicar }: MapaCenariosProps) {
  const completos = cenarios.filter(c => c.total > 0 && c.itensAtendidos === c.totalLinhas);
  const melhorTotal = completos.length > 0 ? Math.min(...completos.map(c => c.total)) : null;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cenarios.map(cenario => {
        const Icone = ICONES[cenario.id];
        const eMelhor = melhorTotal != null && cenario.total === melhorTotal && cenario.itensAtendidos === cenario.totalLinhas;
        const diferenca = melhorTotal != null && cenario.total > 0 ? cenario.total - melhorTotal : null;

        return (
          <div
            key={cenario.id}
            className={`flex flex-col rounded-xl border p-4 transition-colors ${
              eMelhor
                ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icone className={`h-4 w-4 ${eMelhor ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{cenario.nome}</span>
              </div>
              {eMelhor && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  <TrendingDown className="h-3 w-3" />
                  Menor total
                </span>
              )}
            </div>

            <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{cenario.descricao}</p>

            <div className="mt-3">
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {formatBRL(cenario.total)}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{cenario.itensAtendidos} de {cenario.totalLinhas} itens</span>
                <span>·</span>
                <span>{cenario.parcelas.length} {cenario.parcelas.length === 1 ? 'fornecedor' : 'fornecedores'}</span>
                {diferenca != null && diferenca > 0 && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">+{formatBRL(diferenca)}</span>
                  </>
                )}
              </div>
            </div>

            {cenario.parcelas.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                {cenario.parcelas.map(p => (
                  <li key={p.propostaKey} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="truncate text-slate-600 dark:text-slate-300" title={p.nome}>{nomeFornecedorCurto(p.nome)}</span>
                    <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                      {p.itens} {p.itens === 1 ? 'item' : 'itens'} · {formatBRL(p.total)}
                      {p.frete > 0 && <span className="text-slate-400"> (frete {formatBRL(p.frete)})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {cenario.alertas.length > 0 && (
              <ul className="mt-2 space-y-1">
                {cenario.alertas.map(a => (
                  <li key={a} className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}

            {onAplicar && cenario.id !== 'selecao' && cenario.parcelas.length > 0 && (
              <button
                type="button"
                onClick={() => onAplicar(cenario)}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Check className="h-3 w-3" />
                Marcar este cenário na matriz
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
