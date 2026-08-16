/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Situação de cobertura da carteira: quanto do capital está em ruptura
 * iminente, saudável, em excesso, ou simplesmente sem giro nenhum.
 *
 * Barra 100% empilhada em vez de rosca: as quatro situações são partes de um
 * todo (o valor imobilizado) e a comparação entre fatias vizinhas importa —
 * é o que rosca não resolve. A legenda carrega o valor exato, então a
 * identidade nunca fica só na cor.
 */

import React from 'react';
import { Gauge } from 'lucide-react';
import { ResumoCobertura, FAIXAS_COBERTURA } from '../../lib/giroEstoque';
import { formatBRL } from '../../lib/almoxarifado';
import { formatInt, formatPct } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface CoberturaPanelProps {
  dados: ResumoCobertura[];
  onSelecionar?: (situacao: string) => void;
  loading?: boolean;
}

export default function CoberturaPanel({ dados, onSelecionar, loading }: CoberturaPanelProps) {
  const total = dados.reduce((a, d) => a + d.valor, 0);
  const comValor = dados.filter(d => d.valor > 0);

  return (
    <ChartCard
      title="Cobertura da Carteira"
      icon={Gauge}
      description="Dias que o saldo atual dura no ritmo de consumo da janela. Clique numa situação para filtrar a tabela."
      height={220}
      loading={loading}
      empty={total <= 0}
      emptyMessage="Nenhum material com valor no filtro selecionado."
    >
      <div className="space-y-4">
        <div className="flex h-8 w-full gap-[2px] rounded-md overflow-hidden" role="img"
          aria-label={comValor.map(d => `${FAIXAS_COBERTURA[d.situacao].rotulo} ${formatPct((d.valor / total) * 100)}`).join(', ')}>
          {comValor.map(d => (
            <div
              key={d.situacao}
              className="h-full transition-[filter] duration-200 hover:brightness-110 first:rounded-l-md last:rounded-r-md"
              style={{ width: `${(d.valor / total) * 100}%`, background: FAIXAS_COBERTURA[d.situacao].cor }}
              title={`${FAIXAS_COBERTURA[d.situacao].rotulo} — ${formatPct((d.valor / total) * 100)}`}
            />
          ))}
        </div>

        <ul className="space-y-1.5">
          {dados.map(d => {
            const faixa = FAIXAS_COBERTURA[d.situacao];
            const pct = total > 0 ? (d.valor / total) * 100 : 0;
            const clicavel = !!onSelecionar && d.materiais > 0;
            const Element = clicavel ? 'button' : 'div';
            return (
              <li key={d.situacao}>
                <Element
                  type={clicavel ? 'button' : undefined}
                  onClick={clicavel ? () => onSelecionar!(d.situacao) : undefined}
                  className={`w-full flex items-start gap-2.5 text-xs rounded px-2 py-1.5 -mx-2 text-left transition-colors duration-150
                    ${clicavel ? 'cursor-pointer hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1' : ''}`}
                  style={{ outlineColor: faixa.cor }}
                >
                  <span className="h-2.5 w-2.5 rounded-[3px] shrink-0 mt-1" style={{ background: faixa.cor }} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold block" style={{ color: 'var(--ink-primary)' }}>{faixa.rotulo}</span>
                    <span className="block leading-snug mt-0.5" style={{ color: 'var(--ink-muted)' }}>{faixa.descricao}</span>
                  </span>
                  <span className="tabular shrink-0 text-right" style={{ color: 'var(--ink-muted)' }}>
                    {formatInt(d.materiais)} mat.
                  </span>
                  <span className="font-semibold tabular shrink-0 w-28 text-right" style={{ color: 'var(--ink-primary)' }}>
                    {formatBRL(d.valor)}
                  </span>
                  <span className="tabular shrink-0 w-14 text-right" style={{ color: 'var(--ink-secondary)' }}>
                    {formatPct(pct)}
                  </span>
                </Element>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartCard>
  );
}
