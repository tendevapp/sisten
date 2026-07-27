/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Matriz de calor: gasto no cruzamento de duas dimensões.
 *
 * Responde a pergunta que nenhum dos dois rankings isolados responde — se o
 * grupo de mercadoria que mais gasta está concentrado numa praça só, ou se
 * está distribuído. Um grupo grande atendido de um estado único é risco
 * logístico que o ranking de grupos e o ranking de UF, lidos separadamente,
 * escondem.
 *
 * A intensidade é uma rampa de um matiz só, proporcional ao valor da célula:
 * a grandeza aqui é ordinal e contínua, não identidade. O número fica escrito
 * na célula — a cor reforça o padrão, mas nunca é a única via de leitura.
 */

import React from 'react';
import { Grid3x3 } from 'lucide-react';
import { Matriz } from '../../lib/historicoAnalytics';
import { formatBRLCompacto, formatPct } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface MatrizCalorProps {
  matriz: Matriz;
  title: string;
  description?: React.ReactNode;
  rotuloLinha: string;
  rotuloColuna: string;
}

export default function MatrizCalor({
  matriz,
  title,
  description,
  rotuloLinha,
  rotuloColuna,
}: MatrizCalorProps) {
  const { linhas, colunas, valores, totalLinha, totalColuna, total, maximo } = matriz;

  /**
   * Intensidade 0..1 pela raiz do valor relativo, não pelo valor direto: com
   * uma célula dominante, a escala linear achata todo o resto em quase branco
   * e o padrão some. A raiz preserva a ordem e recupera o contraste da cauda.
   */
  const intensidade = (v: number) => (maximo > 0 ? Math.sqrt(v / maximo) : 0);

  return (
    <ChartCard
      title={title}
      icon={Grid3x3}
      description={description}
      height={320}
      empty={linhas.length === 0 || colunas.length === 0 || total <= 0}
      emptyMessage="Nenhum cruzamento com valor no filtro selecionado."
    >
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs border-collapse">
          <caption className="sr-only">
            {rotuloLinha} por {rotuloColuna}, em reais
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="px-2 py-2 text-left font-bold uppercase tracking-wider text-[10px] whitespace-nowrap sticky left-0"
                style={{ color: 'var(--ink-muted)', background: 'var(--surface-card)' }}
              >
                {rotuloLinha}
              </th>
              {colunas.map(c => (
                <th
                  key={c}
                  scope="col"
                  className="px-2 py-2 text-right font-bold uppercase tracking-wider text-[10px] whitespace-nowrap"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  {c}
                </th>
              ))}
              <th
                scope="col"
                className="px-2 py-2 text-right font-bold uppercase tracking-wider text-[10px] whitespace-nowrap"
                style={{ color: 'var(--ink-muted)' }}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l}>
                <th
                  scope="row"
                  className="px-2 py-1.5 text-left font-semibold whitespace-nowrap max-w-[180px] truncate sticky left-0"
                  style={{ color: 'var(--ink-primary)', background: 'var(--surface-card)' }}
                  title={l}
                >
                  {l}
                </th>
                {colunas.map(c => {
                  const v = valores[l]?.[c] || 0;
                  const i = intensidade(v);
                  return (
                    <td
                      key={c}
                      className="px-2 py-1.5 text-right tabular"
                      title={`${l} × ${c}: ${formatBRLCompacto(v)}`}
                      style={{
                        background: v > 0 ? `color-mix(in srgb, var(--series-1) ${i * 78}%, transparent)` : undefined,
                        // Sobre fundo forte a tinta escura some; o limiar
                        // acompanha a mesma escala da intensidade.
                        color: i > 0.6 ? 'var(--chart-value-on-mark)' : 'var(--ink-secondary)',
                        fontWeight: i > 0.45 ? 700 : 400,
                      }}
                    >
                      {v > 0 ? formatBRLCompacto(v) : ''}
                    </td>
                  );
                })}
                <td
                  className="px-2 py-1.5 text-right tabular font-bold"
                  style={{ color: 'var(--ink-primary)', borderLeft: '1px solid var(--hairline)' }}
                >
                  {formatBRLCompacto(totalLinha[l] || 0)}
                  <span className="ml-1.5 font-medium" style={{ color: 'var(--ink-muted)' }}>
                    {formatPct(total > 0 ? ((totalLinha[l] || 0) / total) * 100 : 0)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--hairline)' }}>
              <th
                scope="row"
                className="px-2 py-2 text-left font-bold uppercase tracking-wider text-[10px] sticky left-0"
                style={{ color: 'var(--ink-muted)', background: 'var(--surface-card)' }}
              >
                Total
              </th>
              {colunas.map(c => (
                <td key={c} className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {formatBRLCompacto(totalColuna[c] || 0)}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>
                {formatBRLCompacto(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ChartCard>
  );
}
