/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Curva ABC dos grupos de mercadoria.
 *
 * Com 105 grupos em cinco meses, listar todos é ruído. A classificação ABC
 * responde onde vale gastar atenção de gestão: a classe A concentra 80% do
 * dinheiro em poucos grupos — é onde contrato, cotação estruturada e
 * negociação de escala pagam o esforço. A classe C é cauda longa, onde o custo
 * de negociar supera o ganho e a resposta certa costuma ser simplificar o
 * processo, não brigar por preço.
 *
 * A escala ABC é ordinal e tem tokens próprios no tema (`--abc-a/b/c`), então
 * a ordem aparece na própria cor — e sempre com o rótulo da classe ao lado.
 */

import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { FatiaABC, ClasseABC } from '../../lib/historicoAnalytics';
import { formatInt, formatPct, formatBRLCompacto } from '../../lib/format';
import { useChartTokens } from '../../lib/chartTokens';
import ChartCard from '../charts/ChartCard';

interface CurvaAbcGruposProps {
  fatias: FatiaABC[];
  onSelecionar?: (grupo: string) => void;
  limite?: number;
}

const DESCRICAO: Record<ClasseABC, string> = {
  A: 'Até 80% do gasto — contrato e negociação estruturada pagam o esforço',
  B: 'De 80% a 95% — acompanhamento periódico',
  C: 'Últimos 5% — cauda longa; simplificar o processo rende mais que negociar',
};

export default function CurvaAbcGrupos({ fatias, onSelecionar, limite = 12 }: CurvaAbcGruposProps) {
  const tokens = useChartTokens();

  const { classes, total } = useMemo(() => {
    const base: Record<ClasseABC, { itens: number; valor: number }> = {
      A: { itens: 0, valor: 0 },
      B: { itens: 0, valor: 0 },
      C: { itens: 0, valor: 0 },
    };
    let t = 0;
    for (const f of fatias) {
      base[f.classe].itens++;
      base[f.classe].valor += f.valor;
      t += f.valor;
    }
    return { classes: base, total: t };
  }, [fatias]);

  const corDe = (c: ClasseABC) => tokens.abc[c];

  return (
    <ChartCard
      title="Curva ABC de Grupos de Mercadoria"
      icon={Layers}
      description={`${formatInt(fatias.length)} grupos no filtro. A classe A concentra o gasto que justifica gestão ativa.`}
      height={320}
      empty={fatias.length === 0 || total <= 0}
      emptyMessage="Nenhum grupo de mercadoria com valor no filtro selecionado."
    >
      <div className="space-y-5">
        {/* Composição das três classes numa barra 100% empilhada — parte do
            todo lida sem comparar ângulos nem áreas. */}
        <div>
          <div className="flex h-7 w-full gap-[2px] rounded-md overflow-hidden">
            {(['A', 'B', 'C'] as ClasseABC[]).map(c => (
              <div
                key={c}
                className="h-full first:rounded-l-md last:rounded-r-md transition-[filter] duration-200 hover:brightness-110"
                style={{
                  width: `${total > 0 ? (classes[c].valor / total) * 100 : 0}%`,
                  background: corDe(c),
                }}
                title={`Classe ${c}: ${formatBRLCompacto(classes[c].valor)}`}
              />
            ))}
          </div>
          <ul className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-3">
            {(['A', 'B', 'C'] as ClasseABC[]).map(c => (
              <li key={c} className="flex items-start gap-2">
                <span className="h-3 w-3 rounded-full shrink-0 mt-0.5" style={{ background: corDe(c) }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                    Classe {c}: {formatInt(classes[c].itens)} grupos ·{' '}
                    {formatPct(total > 0 ? (classes[c].valor / total) * 100 : 0)}
                  </span>
                  <span className="block text-[10px] leading-snug" style={{ color: 'var(--ink-muted)' }}>
                    {DESCRICAO[c]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                {[
                  { r: 'Grupo', n: false },
                  { r: 'Classe', n: false },
                  { r: 'Itens', n: true },
                  { r: 'Pedidos', n: true },
                  { r: 'Valor', n: true },
                  { r: '%', n: true },
                  { r: 'Acum.', n: true },
                ].map(h => (
                  <th
                    key={h.r}
                    scope="col"
                    className={`px-2 py-2 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap ${h.n ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {h.r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fatias.slice(0, limite).map(f => (
                <tr
                  key={f.chave}
                  onClick={() => onSelecionar?.(f.chave)}
                  className={`transition-colors duration-150 hover:bg-[var(--surface-raised)] ${onSelecionar ? 'cursor-pointer' : ''}`}
                  style={{ borderBottom: '1px solid var(--hairline)' }}
                >
                  <td className="px-2 py-2 font-semibold" style={{ color: 'var(--ink-primary)' }}>
                    {f.chave}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold"
                      style={{ color: 'var(--ink-secondary)' }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: corDe(f.classe) }} aria-hidden="true" />
                      {f.classe}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatInt(f.itens)}</td>
                  <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatInt(f.pedidos)}</td>
                  <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRLCompacto(f.valor)}</td>
                  <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatPct(f.participacao)}</td>
                  <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-muted)' }}>{formatPct(f.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fatias.length > limite && (
            <p className="mt-2 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
              Mostrando os {limite} maiores de {formatInt(fatias.length)} grupos.
            </p>
          )}
        </div>
      </div>
    </ChartCard>
  );
}
