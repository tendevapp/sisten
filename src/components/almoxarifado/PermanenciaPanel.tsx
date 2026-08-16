/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Qualidade da decisão de compra, medida pela permanência de cada camada
 * entre a entrada (MIGO) e o consumo.
 *
 * A leitura que este painel habilita: uma compra tratada como urgente que
 * ficou 120 dias parada não era urgente; uma que saiu em 2 dias era. Como o
 * FIFO casa camada a camada, a medida é por lote recebido, não por material —
 * o mesmo item pode ter compras boas e ruins ao longo do período.
 */

import React from 'react';
import { Timer } from 'lucide-react';
import { ResumoPermanencia, FAIXAS_PERMANENCIA } from '../../lib/giroEstoque';
import { formatBRL } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface PermanenciaPanelProps {
  dados: ResumoPermanencia[];
  onSelecionar?: (classe: string) => void;
  loading?: boolean;
}

export default function PermanenciaPanel({ dados, onSelecionar, loading }: PermanenciaPanelProps) {
  const totalCamadas = dados.reduce((a, d) => a + d.camadas, 0);

  return (
    <ChartCard
      title="Urgência e Qualidade da Compra"
      icon={Timer}
      description="Tempo entre a entrada no almoxarifado (MIGO) e o consumo, por lote recebido. Clique numa classe para ver os lotes."
      height={260}
      loading={loading}
      empty={totalCamadas === 0}
      emptyMessage="Nenhuma camada no filtro selecionado."
    >
      <ul className="space-y-2">
        {dados.map(d => {
          const faixa = FAIXAS_PERMANENCIA[d.classe];
          const pct = totalCamadas > 0 ? (d.camadas / totalCamadas) * 100 : 0;
          const clicavel = !!onSelecionar && d.camadas > 0;
          const Element = clicavel ? 'button' : 'div';
          return (
            <li key={d.classe}>
              <Element
                type={clicavel ? 'button' : undefined}
                onClick={clicavel ? () => onSelecionar!(d.classe) : undefined}
                className={`w-full rounded-lg px-2.5 py-2 -mx-2.5 text-left transition-colors duration-150
                  ${clicavel ? 'cursor-pointer hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1' : ''}`}
                style={{ outlineColor: faixa.cor }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: faixa.cor }} aria-hidden="true" />
                  <span className="font-semibold text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--ink-primary)' }}>
                    {faixa.rotulo}
                  </span>
                  {d.medianaDias !== null && (
                    <span className="text-[11px] tabular shrink-0" style={{ color: 'var(--ink-secondary)' }}>
                      mediana {Math.round(d.medianaDias)}d
                    </span>
                  )}
                  <span className="text-[11px] tabular shrink-0 w-20 text-right" style={{ color: 'var(--ink-muted)' }}>
                    {formatInt(d.camadas)} lotes
                  </span>
                  <span className="text-[11px] font-semibold tabular shrink-0 w-24 text-right" style={{ color: 'var(--ink-primary)' }}>
                    {d.valor > 0 ? formatBRL(d.valor) : '—'}
                  </span>
                </div>

                {/* Trilho de participação: a barra é a medida, não enfeite. */}
                <div className="mt-1.5 ml-5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: faixa.cor }} />
                </div>

                <p className="text-[10px] mt-1 ml-5 leading-snug" style={{ color: 'var(--ink-muted)' }}>
                  {faixa.descricao}
                </p>
              </Element>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
