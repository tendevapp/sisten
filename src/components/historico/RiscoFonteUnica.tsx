/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Risco de fonte de suprimento por grupo de mercadoria.
 *
 * Um grupo comprado de um único fornecedor é duas coisas ao mesmo tempo: ponto
 * de falha se aquele fornecedor parar, e compra que nunca passou por cotação.
 * Nenhuma das duas aparece num ranking de gasto.
 *
 * Ordenado por valor, não por número de fornecedores: um grupo monofornecedor
 * de R$ 2 mil não é o problema da semana; um de R$ 400 mil é. E a coluna de
 * dominância cobre o caso que a contagem esconde — três fornecedores no grupo,
 * um deles com 97% do gasto, é concentração disfarçada de pluralidade.
 */

import React, { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { RiscoGrupo, NAO_INFORMADO } from '../../lib/historicoAnalytics';
import { formatInt, formatPct, formatBRLCompacto, EMPTY } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface RiscoFonteUnicaProps {
  riscos: RiscoGrupo[];
  limite?: number;
  onSelecionarGrupo?: (grupo: string) => void;
}

/** Limite acima do qual a dominância de um fornecedor deixa de ser saudável. */
const DOMINANCIA_ALERTA = 80;

export default function RiscoFonteUnica({ riscos, limite = 15, onSelecionarGrupo }: RiscoFonteUnicaProps) {
  const [soRisco, setSoRisco] = useState(true);

  const { visiveis, resumo } = useMemo(() => {
    const reais = riscos.filter(r => r.grupo !== NAO_INFORMADO);
    const emRisco = reais.filter(r => r.fornecedores === 1 || r.dominancia >= DOMINANCIA_ALERTA);
    const unicos = reais.filter(r => r.fornecedores === 1);
    const base = soRisco ? emRisco : reais;
    return {
      visiveis: base.slice(0, limite),
      resumo: {
        grupos: reais.length,
        unicos: unicos.length,
        valorUnicos: unicos.reduce((s, r) => s + r.valor, 0),
        emRisco: emRisco.length,
        valorEmRisco: emRisco.reduce((s, r) => s + r.valor, 0),
        valorTotal: reais.reduce((s, r) => s + r.valor, 0),
      },
    };
  }, [riscos, soRisco, limite]);

  const pctRisco = resumo.valorTotal > 0 ? (resumo.valorEmRisco / resumo.valorTotal) * 100 : 0;

  return (
    <ChartCard
      title="Risco de Fonte de Suprimento"
      icon={ShieldAlert}
      description={
        resumo.grupos > 0
          ? `${formatInt(resumo.unicos)} de ${formatInt(resumo.grupos)} grupos têm fornecedor único (${formatBRLCompacto(resumo.valorUnicos)}). Somando os de fornecedor dominante, ${formatPct(pctRisco)} do gasto depende de uma fonte só.`
          : 'Grupos de mercadoria por quantidade de fornecedores.'
      }
      height={280}
      empty={resumo.grupos === 0}
      emptyMessage="Nenhum grupo de mercadoria no filtro selecionado."
      actions={
        <button
          onClick={() => setSoRisco(v => !v)}
          aria-pressed={soRisco}
          className="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1"
          style={{
            borderColor: 'var(--hairline)',
            background: soRisco ? 'var(--brand)' : 'transparent',
            color: soRisco ? '#ffffff' : 'var(--ink-secondary)',
            outlineColor: 'var(--brand)',
          }}
        >
          Só os de risco
        </button>
      }
    >
      {visiveis.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm text-center px-6"
          style={{ height: 240, color: 'var(--status-good)' }}
        >
          Nenhum grupo com fonte única ou fornecedor dominante no filtro. É um bom sinal.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                {[
                  { r: 'Grupo', n: false },
                  { r: 'Fornecedores', n: true },
                  { r: 'Dominância', n: true },
                  { r: 'Valor', n: true },
                  { r: '% do gasto', n: true },
                  { r: 'Fornecedor único', n: false },
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
              {visiveis.map(r => {
                const critico = r.fornecedores === 1;
                return (
                  <tr
                    key={r.grupo}
                    onClick={() => onSelecionarGrupo?.(r.grupo)}
                    className={`transition-colors duration-150 hover:bg-[var(--surface-raised)] ${onSelecionarGrupo ? 'cursor-pointer' : ''}`}
                    style={{ borderBottom: '1px solid var(--hairline)' }}
                  >
                    <td className="px-2 py-2 font-semibold" style={{ color: 'var(--ink-primary)' }}>
                      {r.grupo}
                    </td>
                    {/* A gravidade não fica só na cor: fornecedor único aparece
                        como "1" com rótulo textual ao lado. */}
                    <td
                      className="px-2 py-2 text-right tabular font-bold"
                      style={{ color: critico ? 'var(--status-critical)' : 'var(--ink-secondary)' }}
                    >
                      {formatInt(r.fornecedores)}
                      {critico && <span className="ml-1 font-medium">único</span>}
                    </td>
                    <td
                      className="px-2 py-2 text-right tabular"
                      style={{ color: r.dominancia >= DOMINANCIA_ALERTA ? 'var(--status-warning)' : 'var(--ink-secondary)' }}
                    >
                      {formatPct(r.dominancia)}
                    </td>
                    <td className="px-2 py-2 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {formatBRLCompacto(r.valor)}
                    </td>
                    <td className="px-2 py-2 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>
                      {formatPct(r.participacao)}
                    </td>
                    <td
                      className="px-2 py-2 max-w-[220px] truncate"
                      style={{ color: 'var(--ink-muted)' }}
                      title={r.fornecedorUnico}
                    >
                      {r.fornecedorUnico || EMPTY}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
