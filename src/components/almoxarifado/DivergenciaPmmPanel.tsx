/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, FileSpreadsheet, ChevronDown, CheckCircle, AlertCircle, Scale } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DivergenciaPmm, formatBRL, formatDateBR } from '../../lib/almoxarifado';
import { formatInt, formatPctInt } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface DivergenciaPmmPanelProps {
  dados: DivergenciaPmm[];
  // true quando vw_estoque_analise não pôde ser carregada: sem ela não há com o
  // que comparar, e dizer "nenhuma divergência" seria mentira.
  indisponivel: boolean;
  onSelecionar?: (material: string) => void;
  loading?: boolean;
}

const PAGINA = 10;

// Divergência é *polaridade* — de que lado do PMM o preço caiu —, então usa o
// par divergente (vermelho ↔ azul) em vez de duas cores categóricas quaisquer.
// O sinal nunca fica só na cor: vem com seta e com o sinal no número.
const POLO_ACIMA = 'var(--series-8)';
const POLO_ABAIXO = 'var(--series-1)';

export default function DivergenciaPmmPanel({ dados, indisponivel, onSelecionar, loading }: DivergenciaPmmPanelProps) {
  const [visiveis, setVisiveis] = useState(PAGINA);
  const acima = dados.filter(d => d.variacao > 0).length;
  const abaixo = dados.length - acima;

  const exportar = () => {
    if (dados.length === 0) return;
    const linhas = dados.map(d => ({
      'Material': d.material,
      'Descrição': d.descricao,
      'PMM': d.pmm,
      'Último Preço Pago': d.ultimoPreco,
      'Variação (%)': Number((d.variacao * 100).toFixed(2)),
      'Data Última Compra': d.dataUltimaCompra ?? '',
      'Último Fornecedor': d.fornecedor ?? '',
      'Valor em Estoque': d.valorEstoque,
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Divergencia PMM');
    XLSX.writeFile(wb, `divergencia_pmm_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
  };

  return (
    <ChartCard
      title="Divergência de PMM"
      icon={Scale}
      description="Último preço pago afastado do preço médio em mais de 20%. Acima indica estoque contabilizado abaixo do custo de reposição; abaixo indica PMM inflado por compra antiga."
      height={260}
      loading={loading}
      actions={
        dados.length > 0 ? (
          <button
            onClick={exportar}
            className="flex items-center gap-2 px-3 py-2 text-white rounded-lg text-xs font-bold transition-transform duration-150 shadow-sm cursor-pointer active:scale-95 shrink-0 h-9 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: 'var(--brand)', outlineColor: 'var(--brand)' }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar {formatInt(dados.length)}
          </button>
        ) : undefined
      }
    >
      {indisponivel ? (
        <div
          className="flex items-center gap-3 p-4 rounded-lg text-sm font-medium"
          style={{ background: 'color-mix(in srgb, var(--status-warning) 10%, transparent)', color: 'var(--ink-primary)' }}
        >
          <AlertCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--status-warning)' }} />
          Não foi possível carregar o histórico de preços pagos. Este painel fica indisponível; os demais seguem com a posição de estoque em cache.
        </div>
      ) : dados.length === 0 ? (
        <div
          className="flex items-center gap-3 p-4 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--brand-wash)', color: 'var(--ink-primary)' }}
        >
          <CheckCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--status-good)' }} />
          Nenhum material com preço médio fora da faixa de 20%.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="inline-flex items-baseline gap-1.5" style={{ color: 'var(--ink-muted)' }}>
              <span className="h-2 w-2 rounded-[2px] self-center" style={{ background: POLO_ACIMA }} aria-hidden="true" />
              <strong className="text-base font-black tabular" style={{ color: 'var(--ink-primary)' }}>{formatInt(acima)}</strong>
              acima do PMM
            </span>
            <span className="inline-flex items-baseline gap-1.5" style={{ color: 'var(--ink-muted)' }}>
              <span className="h-2 w-2 rounded-[2px] self-center" style={{ background: POLO_ABAIXO }} aria-hidden="true" />
              <strong className="text-base font-black tabular" style={{ color: 'var(--ink-primary)' }}>{formatInt(abaixo)}</strong>
              abaixo do PMM
            </span>
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {dados.slice(0, visiveis).map(d => {
              const positiva = d.variacao > 0;
              const Icone = positiva ? TrendingUp : TrendingDown;
              return (
                <button
                  key={d.material}
                  onClick={() => onSelecionar?.(d.material)}
                  className="w-full text-left py-2.5 group cursor-pointer px-2 -mx-2 rounded transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
                  style={{ borderColor: 'var(--hairline)', outlineColor: positiva ? POLO_ACIMA : POLO_ABAIXO }}
                  title={`Ver ${d.material} na posição de estoque`}
                >
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-mono font-bold shrink-0" style={{ color: 'var(--ink-primary)' }}>
                      {d.material}
                    </span>
                    <span className="truncate flex-1" style={{ color: 'var(--ink-secondary)' }}>{d.descricao || '—'}</span>
                    <span
                      className="shrink-0 inline-flex items-center gap-1 font-bold tabular"
                      style={{ color: positiva ? POLO_ACIMA : POLO_ABAIXO }}
                    >
                      <Icone className="h-3 w-3" aria-hidden="true" />
                      {positiva ? '+' : ''}{formatPctInt(d.variacao * 100)}
                    </span>
                  </div>
                  <p className="text-[10px] mt-0.5 tabular" style={{ color: 'var(--ink-muted)' }}>
                    PMM {formatBRL(d.pmm)} · pago {formatBRL(d.ultimoPreco)} em {formatDateBR(d.dataUltimaCompra)}
                    {d.fornecedor ? ` · ${d.fornecedor}` : ''}
                  </p>
                </button>
              );
            })}
          </div>

          {visiveis < dados.length && (
            <button
              onClick={() => setVisiveis(v => v + PAGINA)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border rounded-lg text-xs font-bold cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              <ChevronDown className="h-3.5 w-3.5" /> Ver mais {Math.min(PAGINA, dados.length - visiveis)}
            </button>
          )}
        </div>
      )}
    </ChartCard>
  );
}
