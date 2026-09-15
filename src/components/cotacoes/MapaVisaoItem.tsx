/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visão por item: uma barra horizontal por fornecedor, dentro de cada item —
 * nem card (pesado demais para varrer muitos itens), nem tabela (não mostra
 * a distância entre os preços, só o número). É a view para responder "esse
 * item tem preço parecido entre todo mundo, ou tem um fornecedor fora da
 * curva?" num relance, sem fazer conta.
 *
 * Não precisa de scroll horizontal por fornecedor — o ponto desta view é
 * exatamente esse, para processo com muitos fornecedores onde a matriz vira
 * uma faixa larga demais para comparar de olho.
 *
 * Clicar numa barra marca aquele item para comprar daquele fornecedor —
 * mesmo gesto da Visão Detalhada.
 */

import React from 'react';
import { Ban, Check, ShoppingCart } from 'lucide-react';
import { formatBRL, formatQtd } from '../../lib/format';
import { nomeFornecedorCurto } from '../../lib/cotacoes';
import type { CelulaMapa, LinhaMapa, ResumoFornecedor } from '../../lib/mapaCotacao';

function BarraFornecedor({
  nome, valor, maiorValor, melhor, marcado, onClick,
}: {
  nome: string; valor: number; maiorValor: number; melhor: boolean; marcado: boolean; onClick: () => void;
}) {
  const pct = maiorValor > 0 ? Math.max(4, (valor / maiorValor) * 100) : 4;
  return (
    <button
      type="button"
      onClick={onClick}
      title={marcado ? 'Clique para desmarcar' : 'Clique para marcar este item deste fornecedor para compra'}
      className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors ${marcado ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
    >
      {marcado ? <Check className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400" /> : <ShoppingCart className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />}
      <span className="w-28 shrink-0 truncate text-[11px] text-slate-500 dark:text-slate-400" title={nome}>
        {nomeFornecedorCurto(nome)}
      </span>
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${marcado ? 'bg-indigo-500' : melhor ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-24 shrink-0 text-right text-[11px] tabular-nums ${marcado ? 'font-semibold text-indigo-700 dark:text-indigo-300' : melhor ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
        {formatBRL(valor)}
      </span>
    </button>
  );
}

interface MapaVisaoItemProps {
  linhas: LinhaMapa[];
  resumos: ResumoFornecedor[];
  selecionados: Set<string>;
  onMarcar: (celula: CelulaMapa, linha: LinhaMapa, marcar: boolean) => void;
}

export default function MapaVisaoItem({ linhas, resumos, selecionados, onMarcar }: MapaVisaoItemProps) {
  if (linhas.length === 0) return null;
  const nomePorChave = new Map(resumos.map(r => [r.propostaKey, r.nome]));

  return (
    <div className="space-y-2 rounded-b-2xl border border-t-0 border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      {linhas.map(linha => {
        // Por preço unitário — não pelo total da célula, que premiaria quem
        // cotou menos unidades que a RM pediu (mesmo raciocínio de `melhor`
        // em mapaCotacao.ts).
        const cotadas = linha.celulas
          .filter(c => c.custo.unitarioComparavel != null)
          .sort((a, b) => (a.custo.unitarioComparavel ?? 0) - (b.custo.unitarioComparavel ?? 0));
        const semCotacao = linha.celulas.length === 0;
        const maiorValor = cotadas.length ? Math.max(...cotadas.map(c => c.custo.unitarioComparavel ?? 0)) : 0;

        return (
          <div key={linha.key} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800/70">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{linha.titulo}</span>
                {linha.ri && <span className="ml-2 text-[10px] text-slate-400">{linha.ri}</span>}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                {linha.qtdSolicitada != null && <span>{formatQtd(linha.qtdSolicitada)} {linha.unidade || ''}</span>}
                {linha.dispersao != null && linha.dispersao > 0 && (
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    diferença entre melhor e pior (por unidade): {formatBRL(linha.dispersao)}
                  </span>
                )}
              </div>
            </div>

            {semCotacao ? (
              <div className="flex items-center gap-1.5 text-[11px] italic text-rose-400">
                <Ban className="h-3 w-3" />
                nenhum fornecedor cotou este item
              </div>
            ) : (
              <div className="space-y-1">
                {cotadas.map(c => {
                  const marcado = selecionados.has(c.item._key);
                  return (
                    <BarraFornecedor
                      key={c.propostaKey}
                      nome={nomePorChave.get(c.propostaKey) ?? 'Fornecedor'}
                      valor={c.custo.unitarioComparavel ?? 0}
                      maiorValor={maiorValor}
                      melhor={c.melhor}
                      marcado={marcado}
                      onClick={() => onMarcar(c, linha, !marcado)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
