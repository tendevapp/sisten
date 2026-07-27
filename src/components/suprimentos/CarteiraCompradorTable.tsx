/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carteira por comprador — a tabela que substitui o antigo "Top 5 grupos por
 * volume".
 *
 * Volume sozinho não distingue o comprador com carteira grande e em dia do
 * comprador com carteira grande e parada. Aqui a mesma linha traz carga
 * (abertos), envelhecimento (aging, críticos), vazão (conversão), dinheiro
 * (spend) e prazo (OTD) — que são as cinco perguntas de uma reunião de
 * carteira.
 *
 * Ordenável porque a pergunta muda: às vezes é "quem tem mais item parado",
 * às vezes "quem tem a carteira mais velha".
 */

import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Users } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { CompradorInfo } from '../../lib/demandas';
import { calcCarteiraPorComprador, LinhaComprador, DIAS_CRITICO } from '../../lib/suprimentos';
import { formatInt, formatPctInt, formatBRLCompacto, EMPTY } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface CarteiraCompradorTableProps {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
  onSelecionarComprador?: (comprador: string) => void;
}

type Coluna = keyof Pick<LinhaComprador, 'comprador' | 'abertos' | 'processados' | 'conversao' | 'agingMedio' | 'criticos' | 'spend' | 'otd'>;

const COLUNAS: { chave: Coluna; rotulo: string; numerica: boolean; dica: string }[] = [
  { chave: 'comprador', rotulo: 'Comprador', numerica: false, dica: 'Quem lançou o pedido; sem pedido, o grupo atribuído' },
  { chave: 'abertos', rotulo: 'Abertos', numerica: true, dica: 'Itens ainda sem pedido' },
  { chave: 'processados', rotulo: 'Pedidos', numerica: true, dica: 'Itens já convertidos em pedido' },
  { chave: 'conversao', rotulo: 'Conversão', numerica: true, dica: 'Pedidos sobre o total da carteira' },
  { chave: 'agingMedio', rotulo: 'Aging médio', numerica: true, dica: 'Idade média dos itens em aberto' },
  { chave: 'criticos', rotulo: `> ${DIAS_CRITICO}d`, numerica: true, dica: `Itens abertos há mais de ${DIAS_CRITICO} dias` },
  { chave: 'spend', rotulo: 'Spend', numerica: true, dica: 'Valor dos pedidos colocados no período' },
  { chave: 'otd', rotulo: 'OTD forn.', numerica: true, dica: 'Recebidos até a data prometida pelo fornecedor' },
];

/** Semáforo do OTD. Sempre acompanhado do número — a cor reforça, não informa. */
function corOtd(v: number | null): string {
  if (v === null) return 'var(--ink-muted)';
  if (v >= 90) return 'var(--status-good)';
  if (v >= 70) return 'var(--status-warning)';
  return 'var(--status-critical)';
}

export default function CarteiraCompradorTable({
  records,
  compradores,
  onSelecionarComprador,
}: CarteiraCompradorTableProps) {
  const [ordem, setOrdem] = useState<Coluna>('abertos');
  const [desc, setDesc] = useState(true);

  const linhas = useMemo(() => calcCarteiraPorComprador(records, compradores), [records, compradores]);

  const ordenadas = useMemo(() => {
    const copia = [...linhas];
    copia.sort((a, b) => {
      const x = a[ordem];
      const y = b[ordem];
      // OTD null (comprador sem nada recebido) vai sempre para o fim, nas duas
      // direções: é ausência de dado, não desempenho ruim.
      if (x === null) return 1;
      if (y === null) return -1;
      const cmp = typeof x === 'string' && typeof y === 'string'
        ? x.localeCompare(y, 'pt-BR')
        : Number(x) - Number(y);
      return desc ? -cmp : cmp;
    });
    return copia;
  }, [linhas, ordem, desc]);

  const totais = useMemo(() => ({
    abertos: linhas.reduce((s, l) => s + l.abertos, 0),
    processados: linhas.reduce((s, l) => s + l.processados, 0),
    criticos: linhas.reduce((s, l) => s + l.criticos, 0),
    spend: linhas.reduce((s, l) => s + l.spend, 0),
  }), [linhas]);

  function alternar(coluna: Coluna) {
    if (coluna === ordem) setDesc(d => !d);
    else {
      setOrdem(coluna);
      setDesc(coluna !== 'comprador');
    }
  }

  return (
    <ChartCard
      title="Carteira por Comprador"
      icon={Users}
      description="Carga, envelhecimento, vazão, valor e prazo na mesma linha. Clique num comprador para ver seus itens no painel."
      height={280}
      empty={linhas.length === 0}
      emptyMessage="Nenhum comprador com itens no filtro selecionado."
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
              <tr
                key={l.comprador}
                onClick={() => onSelecionarComprador?.(l.comprador)}
                className={`transition-colors duration-150 hover:bg-[var(--surface-raised)] ${onSelecionarComprador ? 'cursor-pointer' : ''}`}
                style={{ borderBottom: '1px solid var(--hairline)' }}
              >
                <td className="px-2 py-2 font-semibold max-w-[220px] truncate" style={{ color: 'var(--ink-primary)' }} title={l.comprador}>
                  {l.comprador}
                </td>
                <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {formatInt(l.abertos)}
                </td>
                <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>
                  {formatInt(l.processados)}
                </td>
                <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>
                  {formatPctInt(l.conversao)}
                </td>
                <td
                  className="px-2 py-2 text-right tabular font-semibold"
                  style={{ color: l.agingMedio > DIAS_CRITICO ? 'var(--status-critical)' : 'var(--ink-secondary)' }}
                >
                  {l.abertos > 0 ? `${formatInt(l.agingMedio)}d` : EMPTY}
                </td>
                <td
                  className="px-2 py-2 text-right tabular font-bold"
                  style={{ color: l.criticos > 0 ? 'var(--status-critical)' : 'var(--ink-muted)' }}
                >
                  {formatInt(l.criticos)}
                </td>
                <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>
                  {l.spend > 0 ? formatBRLCompacto(l.spend) : EMPTY}
                </td>
                <td className="px-2 py-2 text-right tabular font-bold" style={{ color: corOtd(l.otd) }}>
                  {l.otd === null ? EMPTY : formatPctInt(l.otd)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--hairline)' }}>
              <td className="px-2 py-2 font-bold uppercase text-[10px] tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                Total ({formatInt(linhas.length)})
              </td>
              <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatInt(totais.abertos)}</td>
              <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatInt(totais.processados)}</td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatInt(totais.criticos)}</td>
              <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRLCompacto(totais.spend)}</td>
              <td className="px-2 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </ChartCard>
  );
}
