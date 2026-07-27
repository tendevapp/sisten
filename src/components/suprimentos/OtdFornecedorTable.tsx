/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Desempenho de entrega por fornecedor.
 *
 * Ordenada por spend, não por OTD: um fornecedor com 40% de OTD e R$ 2 mil de
 * gasto não é o problema da semana; um com 85% e R$ 3 milhões é. Colocar o
 * pior OTD no topo faria a tabela apontar para o lado errado — mas a coluna é
 * ordenável para quem quiser justamente essa leitura.
 *
 * Fornecedor sem nenhum recebimento aferível mostra "—" em vez de 0%: ausência
 * de dado não é desempenho ruim.
 */

import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Truck } from 'lucide-react';
import { LinhaFornecedor } from '../../lib/suprimentos';
import { formatInt, formatPctInt, formatBRLCompacto, EMPTY } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface OtdFornecedorTableProps {
  linhas: LinhaFornecedor[];
  limite?: number;
}

type Coluna = 'fornecedor' | 'itens' | 'pedidos' | 'spend' | 'otd' | 'atrasoMedioDias';

const COLUNAS: { chave: Coluna; rotulo: string; numerica: boolean; dica: string }[] = [
  { chave: 'fornecedor', rotulo: 'Fornecedor', numerica: false, dica: 'Razão social como veio do SAP' },
  { chave: 'pedidos', rotulo: 'Pedidos', numerica: true, dica: 'Documentos de compra distintos' },
  { chave: 'itens', rotulo: 'Itens', numerica: true, dica: 'Linhas de pedido' },
  { chave: 'spend', rotulo: 'Spend', numerica: true, dica: 'Valor líquido dos pedidos no período' },
  { chave: 'otd', rotulo: 'OTD', numerica: true, dica: 'Recebido até a data prometida no pedido, prazo seco' },
  { chave: 'atrasoMedioDias', rotulo: 'Atraso médio', numerica: true, dica: 'Média de dias entre os itens entregues com atraso' },
];

function corOtd(v: number | null): string {
  if (v === null) return 'var(--ink-muted)';
  if (v >= 90) return 'var(--status-good)';
  if (v >= 70) return 'var(--status-warning)';
  return 'var(--status-critical)';
}

export default function OtdFornecedorTable({ linhas, limite = 20 }: OtdFornecedorTableProps) {
  const [ordem, setOrdem] = useState<Coluna>('spend');
  const [desc, setDesc] = useState(true);

  const ordenadas = useMemo(() => {
    const copia = [...linhas];
    copia.sort((a, b) => {
      const x = a[ordem];
      const y = b[ordem];
      if (x === null) return 1;
      if (y === null) return -1;
      const cmp = typeof x === 'string' && typeof y === 'string'
        ? x.localeCompare(y, 'pt-BR')
        : Number(x) - Number(y);
      return desc ? -cmp : cmp;
    });
    return copia.slice(0, limite);
  }, [linhas, ordem, desc, limite]);

  function alternar(coluna: Coluna) {
    if (coluna === ordem) setDesc(d => !d);
    else {
      setOrdem(coluna);
      setDesc(coluna !== 'fornecedor');
    }
  }

  return (
    <ChartCard
      title="Desempenho de Entrega por Fornecedor"
      icon={Truck}
      description={`Os ${Math.min(limite, linhas.length)} maiores por gasto. OTD contra a data prometida no pedido, sem tolerância; só itens já recebidos entram no cálculo.`}
      height={280}
      empty={linhas.length === 0}
      emptyMessage="Nenhum pedido no filtro selecionado."
    >
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
              {COLUNAS.map(c => (
                <th
                  key={c.chave}
                  scope="col"
                  className={`px-2 py-2 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap ${c.numerica ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--ink-muted)' }}
                  aria-sort={ordem === c.chave ? (desc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    onClick={() => alternar(c.chave)}
                    title={c.dica}
                    className={`inline-flex items-center gap-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 rounded ${c.numerica ? 'flex-row-reverse' : ''}`}
                    style={{ outlineColor: 'var(--brand)' }}
                  >
                    {c.rotulo}
                    {ordem === c.chave && (
                      desc
                        ? <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        : <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map(l => (
              <tr key={l.fornecedor} style={{ borderBottom: '1px solid var(--hairline)' }} className="transition-colors duration-150 hover:bg-[var(--surface-raised)]">
                <td className="px-2 py-2 font-semibold max-w-[260px] truncate" style={{ color: 'var(--ink-primary)' }} title={l.fornecedor}>
                  {l.fornecedor}
                </td>
                <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatInt(l.pedidos)}</td>
                <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatInt(l.itens)}</td>
                <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {l.spend > 0 ? formatBRLCompacto(l.spend) : EMPTY}
                </td>
                <td className="px-2 py-2 text-right tabular font-bold" style={{ color: corOtd(l.otd) }}>
                  {l.otd === null ? EMPTY : formatPctInt(l.otd)}
                </td>
                <td
                  className="px-2 py-2 text-right tabular"
                  style={{ color: l.atrasoMedioDias > 15 ? 'var(--status-critical)' : 'var(--ink-secondary)' }}
                >
                  {l.atrasoMedioDias > 0 ? `${formatInt(l.atrasoMedioDias)}d` : EMPTY}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
