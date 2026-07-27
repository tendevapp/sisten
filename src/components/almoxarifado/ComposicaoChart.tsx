/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Composição do valor imobilizado.
 *
 * Eram duas roscas com sete cores cicladas (`CORES[i % CORES.length]`), o que
 * dava a duas fatias diferentes a mesma cor sempre que havia mais de sete
 * categorias. Agora são barras 100% empilhadas: parte-do-todo se lê melhor em
 * barra, nomes longos de categoria cabem, e a comparação entre fatias próximas
 * — que rosca não resolve — passa a ser possível.
 *
 * Acima de seis categorias o excedente vira "Outros" em vez de ganhar cor
 * nova: a ordem de slots é fixa e nunca é ciclada.
 */

import React, { useMemo } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Agregado, formatBRL } from '../../lib/almoxarifado';
import { formatInt, formatPct } from '../../lib/format';
import { useChartTokens } from '../../lib/chartTokens';
import ChartCard from '../charts/ChartCard';

interface ComposicaoChartProps {
  porTipo: Agregado[];
  porClasse: Agregado[];
  onSelecionarTipo?: (tipo: string) => void;
  onSelecionarClasse?: (classe: string) => void;
  // Rótulos sintéticos (agregados de campo vazio) que não correspondem a um
  // valor real de filtro — clicar neles não deve navegar, senão o usuário cai
  // num filtro que não existe como opção na tela de destino.
  roteulosNaoClicaveis?: string[];
  loading?: boolean;
}

const MAX_FATIAS = 6;
const OUTROS = 'Outros';

interface Fatia {
  chave: string;
  valor: number;
  itens: number;
  materiais: number;
  pct: number;
  cor: string;
  clicavel: boolean;
}

function useFatias(dados: Agregado[], cores: string[], naoClicaveis: string[]): { fatias: Fatia[]; total: number } {
  return useMemo(() => {
    const ordenado = [...dados].sort((a, b) => b.valor - a.valor);
    const total = ordenado.reduce((a, d) => a + d.valor, 0);
    if (total <= 0) return { fatias: [], total: 0 };

    const principais = ordenado.slice(0, MAX_FATIAS);
    const resto = ordenado.slice(MAX_FATIAS);

    const fatias: Fatia[] = principais.map((d, i) => ({
      chave: d.chave,
      valor: d.valor,
      itens: d.itens,
      materiais: d.materiais,
      pct: (d.valor / total) * 100,
      cor: cores[i],
      clicavel: !naoClicaveis.includes(d.chave),
    }));

    if (resto.length > 0) {
      const valor = resto.reduce((a, d) => a + d.valor, 0);
      fatias.push({
        chave: `${OUTROS} (${resto.length})`,
        valor,
        itens: resto.reduce((a, d) => a + d.itens, 0),
        materiais: resto.reduce((a, d) => a + d.materiais, 0),
        pct: (valor / total) * 100,
        // O agrupado usa tinta neutra: "Outros" não é uma identidade, é a
        // ausência de uma.
        cor: 'var(--ink-muted)',
        clicavel: false,
      });
    }

    return { fatias, total };
  }, [dados, cores, naoClicaveis]);
}

function BarraComposicao({
  titulo,
  dados,
  onSelecionar,
  naoClicaveis,
}: {
  titulo: string;
  dados: Agregado[];
  onSelecionar?: (chave: string) => void;
  naoClicaveis: string[];
}) {
  const tokens = useChartTokens();
  const { fatias, total } = useFatias(dados, tokens.series, naoClicaveis);

  if (total <= 0) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{titulo}</p>
        <div className="flex items-center h-40 text-sm" style={{ color: 'var(--ink-muted)' }}>Sem dados.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{titulo}</p>
        <p className="text-[11px] font-semibold tabular" style={{ color: 'var(--ink-secondary)' }}>{formatBRL(total)}</p>
      </div>

      {/* Barra 100%. O vão de 2px entre segmentos é a superfície aparecendo —
          é o que separa duas cores vizinhas sem precisar de contorno. */}
      <div className="flex h-7 w-full gap-[2px] rounded-md overflow-hidden" role="img"
        aria-label={`${titulo}: ${fatias.map(f => `${f.chave} ${formatPct(f.pct)}`).join(', ')}`}>
        {fatias.map(f => (
          <div
            key={f.chave}
            className="h-full transition-[filter] duration-200 hover:brightness-110 first:rounded-l-md last:rounded-r-md"
            style={{ width: `${f.pct}%`, background: f.cor }}
            title={`${f.chave} — ${formatPct(f.pct)}`}
          />
        ))}
      </div>

      {/* Legenda que também é a tabela de valores: identidade nunca fica só na
          cor, e o número exato dispensa medir a fatia com o olho. */}
      <ul className="space-y-1">
        {fatias.map(f => {
          const Element = f.clicavel && onSelecionar ? 'button' : 'div';
          return (
            <li key={f.chave}>
              <Element
                type={f.clicavel && onSelecionar ? 'button' : undefined}
                onClick={f.clicavel && onSelecionar ? () => onSelecionar(f.chave) : undefined}
                className={`w-full flex items-center gap-2 text-xs rounded px-1.5 py-1 -mx-1.5 text-left transition-colors duration-150
                  ${f.clicavel && onSelecionar ? 'cursor-pointer hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1' : ''}`}
                style={{ outlineColor: f.cor }}
              >
                <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: f.cor }} aria-hidden="true" />
                <span className="flex-1 truncate" style={{ color: 'var(--ink-secondary)' }}>{f.chave}</span>
                <span className="tabular shrink-0" style={{ color: 'var(--ink-muted)' }}>{formatInt(f.materiais)} mat.</span>
                <span className="font-semibold tabular shrink-0 w-14 text-right" style={{ color: 'var(--ink-primary)' }}>
                  {formatPct(f.pct)}
                </span>
              </Element>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ComposicaoChart({
  porTipo,
  porClasse,
  onSelecionarTipo,
  onSelecionarClasse,
  roteulosNaoClicaveis = ['Sem classe', 'Não informado'],
  loading,
}: ComposicaoChartProps) {
  return (
    <ChartCard
      title="Composição do Valor"
      icon={PieChartIcon}
      description="Natureza do material e classificação contábil do item. Clique numa faixa para ver os itens."
      loading={loading}
      height={280}
      empty={porTipo.length === 0 && porClasse.length === 0}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        <BarraComposicao
          titulo="Por tipo de material"
          dados={porTipo}
          onSelecionar={onSelecionarTipo}
          naoClicaveis={roteulosNaoClicaveis}
        />
        <BarraComposicao
          titulo="Por classe de item"
          dados={porClasse}
          onSelecionar={onSelecionarClasse}
          naoClicaveis={roteulosNaoClicaveis}
        />
      </div>
    </ChartCard>
  );
}
