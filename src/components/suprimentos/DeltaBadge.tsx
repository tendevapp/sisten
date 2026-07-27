/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Selo de variação contra o período anterior.
 *
 * A cor sozinha não carrega o sinal: a seta indica o sentido do movimento e o
 * texto diz o número, então quem não distingue verde de vermelho lê a mesma
 * informação. Verde/vermelho aqui significam "favorável/desfavorável ao setor",
 * não "subiu/desceu" — carteira aberta crescendo é ruim mesmo sendo aumento.
 */

import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Delta } from '../../lib/suprimentos';
import { EMPTY } from '../../lib/format';

interface DeltaBadgeProps {
  delta: Delta;
  /** Formata o valor absoluto (ex.: "3 dias", "1,2 p.p."). */
  formatAbsoluto?: (v: number) => string;
  /**
   * `relativo` mostra a variação percentual e cai no absoluto quando ela não é
   * definida. `absoluto` sempre mostra a diferença crua — é o certo para
   * indicadores que já são percentuais: dizer que a conversão "subiu 6%" quando
   * ela foi de 68% para 72% mistura variação relativa com ponto percentual, e
   * ninguém em suprimentos lê nesse sentido.
   */
  modo?: 'relativo' | 'absoluto';
  /**
   * False quando não existe janela de comparação (o usuário limpou as datas).
   * Sem isso o selo mostraria "+1.234 itens vs. período anterior" comparando
   * contra um período que não existe.
   */
  comparavel?: boolean;
  /** Rótulo do período de comparação. */
  sufixo?: string;
}

const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export default function DeltaBadge({
  delta,
  formatAbsoluto,
  modo = 'relativo',
  comparavel = true,
  sufixo = 'vs. período anterior',
}: DeltaBadgeProps) {
  const semBase = !comparavel || (!delta.comparavel && delta.absoluto === 0);

  if (semBase) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
        <Minus className="h-3 w-3" aria-hidden="true" />
        {comparavel ? `${EMPTY} ${sufixo}` : 'sem período de comparação'}
      </span>
    );
  }

  const subiu = delta.absoluto > 0;
  const Icone = delta.absoluto === 0 ? Minus : subiu ? ArrowUpRight : ArrowDownRight;
  const cor = delta.absoluto === 0
    ? 'var(--ink-muted)'
    : delta.bom
      ? 'var(--status-good)'
      : 'var(--status-critical)';

  const usarRelativo = modo === 'relativo' && delta.percentual !== null;
  const texto = usarRelativo
    ? `${subiu ? '+' : ''}${pct.format(delta.percentual as number)}%`
    : formatAbsoluto
      ? `${subiu ? '+' : ''}${formatAbsoluto(delta.absoluto)}`
      : `${subiu ? '+' : ''}${pct.format(delta.absoluto)}`;

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular" style={{ color: cor }}>
      <Icone className="h-3 w-3" aria-hidden="true" />
      {texto}
      <span className="font-medium" style={{ color: 'var(--ink-muted)' }}>{sufixo}</span>
    </span>
  );
}
