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
 *
 * Layout em faixa (3 colunas com divisórias), não 3 cartões separados: em
 * monitor largo (1920px) três caixas com borda própria sobram espaço vazio
 * nas laterais e ainda competem visualmente com a matriz logo abaixo. Uma
 * faixa única com divisórias finas lê como um só bloco de informação — o
 * "resumo executivo" antes do detalhe — e aproveita a largura para números
 * maiores em vez de espaço morto.
 */

import React, { useState } from 'react';
import { Split, Package, MousePointerClick, AlertTriangle, TrendingDown, Check, Gauge, ChevronDown, ChevronUp } from 'lucide-react';
import { formatBRL } from '../../lib/format';
import { nomeFornecedorCurto } from '../../lib/cotacoes';
import type { Cenario, ParcelaCenario } from '../../lib/mapaCotacao';

const ICONES: Record<Cenario['id'], React.ElementType> = {
  menor_preco: Split,
  fornecedor_unico: Package,
  selecao: MousePointerClick,
};

/** Frete de uma parcela, com o selo de "estimado" quando ainda não veio do fornecedor — ver `ResumoFornecedor.freteEhTeorico`. */
function FreteParcela({ parcela }: { parcela: ParcelaCenario }) {
  if (parcela.frete <= 0) return null;
  return (
    <span
      className={parcela.freteEhTeorico ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400'}
      title={parcela.freteEhTeorico ? 'Frete estimado pela tabela Bahia Sul a partir do peso dos itens — ainda não é o frete que o fornecedor cotou.' : undefined}
    >
      {' '}(frete {formatBRL(parcela.frete)}{parcela.freteEhTeorico ? '*' : ''})
    </span>
  );
}

/** Desconto da proposta, já abatido de `parcela.total` — ver `ResumoFornecedor.valorDesconto`. */
function DescontoParcela({ parcela }: { parcela: ParcelaCenario }) {
  if (parcela.desconto <= 0) return null;
  return (
    <span className="text-emerald-600 dark:text-emerald-400" title="Desconto identificado na cotação — já abatido deste total.">
      {' '}(-{formatBRL(parcela.desconto)})
    </span>
  );
}

interface MapaCenariosProps {
  cenarios: Cenario[];
  /** Cenário aplicado na matriz com um clique — leva as marcações do cenário para as células. */
  onAplicar?: (cenario: Cenario) => void;
}

export default function MapaCenarios({ cenarios, onAplicar }: MapaCenariosProps) {
  const [recolhido, setRecolhido] = useState(false);
  const completos = cenarios.filter(c => c.total > 0 && c.itensAtendidos === c.totalLinhas);
  const melhorTotal = completos.length > 0 ? Math.min(...completos.map(c => c.total)) : null;
  const algumFreteTeorico = cenarios.some(c => c.parcelas.some(p => p.freteEhTeorico));

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setRecolhido(v => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-left dark:border-slate-800 dark:bg-slate-900"
      >
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cenários de compra</span>
          {recolhido && melhorTotal != null && (
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              melhor: {formatBRL(melhorTotal)}
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          {recolhido ? 'Mostrar' : 'Recolher'}
          {recolhido ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </span>
      </button>

      {!recolhido && (
      <div className="grid grid-cols-1 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {cenarios.map(cenario => {
          const Icone = ICONES[cenario.id];
          const eMelhor = melhorTotal != null && cenario.total === melhorTotal && cenario.itensAtendidos === cenario.totalLinhas;
          const diferenca = melhorTotal != null && cenario.total > 0 ? cenario.total - melhorTotal : null;
          const dividido = cenario.parcelas.length > 1;

          return (
            <div key={cenario.id} className="relative flex flex-col gap-2 px-4 py-3.5">
              {/* Faixa de destaque na borda — substitui o preenchimento colorido do cartão inteiro por um sinal mais discreto e "premium". */}
              {eMelhor && <span className="absolute inset-y-0 left-0 w-1 rounded-full bg-emerald-500 lg:left-0" aria-hidden />}

              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2" title={cenario.descricao}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${eMelhor ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
                    <Icone className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{cenario.nome}</span>
                </div>
                {eMelhor && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    <TrendingDown className="h-2.5 w-2.5" />
                    Menor total
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-2xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-50">
                  {formatBRL(cenario.total)}
                </span>
                {diferenca != null && diferenca > 0 && (
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">+{formatBRL(diferenca)}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {cenario.itensAtendidos}/{cenario.totalLinhas} itens · {cenario.parcelas.length} {cenario.parcelas.length === 1 ? 'fornecedor' : 'fornecedores'}
              </p>

              {/* Fornecedor único: o cabeçalho já diz nome e frete não fazem
                  falta repetir numa lista. Só abre o detalhamento quando a
                  compra está de fato dividida — é aí que o comprador precisa
                  ver quanto cada parcela pesa. */}
              {cenario.parcelas.length === 1 && (
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={cenario.parcelas[0].nome}>
                  {nomeFornecedorCurto(cenario.parcelas[0].nome)}
                  <FreteParcela parcela={cenario.parcelas[0]} />
                  <DescontoParcela parcela={cenario.parcelas[0]} />
                </p>
              )}

              {dividido && (
                <ul className="space-y-0.5">
                  {cenario.parcelas.map(p => (
                    <li key={p.propostaKey} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="truncate text-slate-600 dark:text-slate-300" title={p.nome}>{nomeFornecedorCurto(p.nome)}</span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                        {p.itens}× · {formatBRL(p.total)}
                        <FreteParcela parcela={p} />
                        <DescontoParcela parcela={p} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {cenario.alertas.length > 0 && (
                <ul className="space-y-0.5">
                  {cenario.alertas.map(a => (
                    <li key={a} className="flex items-start gap-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              )}

              {onAplicar && cenario.id !== 'selecao' && cenario.parcelas.length > 0 && (
                <button
                  type="button"
                  onClick={() => onAplicar(cenario)}
                  className="mt-auto inline-flex w-fit items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300"
                >
                  <Check className="h-3 w-3" />
                  Marcar este cenário na matriz
                </button>
              )}
            </div>
          );
        })}
      </div>
      )}

      {!recolhido && algumFreteTeorico && (
        <p className="flex items-center gap-1 px-1 text-[10px] text-slate-400">
          <Gauge className="h-3 w-3 shrink-0 text-indigo-400" />
          * frete estimado pela tabela Bahia Sul a partir do peso dos itens — o fornecedor ainda não cotou frete.
        </p>
      )}
    </div>
  );
}
