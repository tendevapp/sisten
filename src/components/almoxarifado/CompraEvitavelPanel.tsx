/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, FileSpreadsheet, ChevronDown, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CompraEvitavel, formatBRL, formatQtd } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import ChartCard from '../charts/ChartCard';

interface CompraEvitavelPanelProps {
  dados: CompraEvitavel[];
  onSelecionar?: (material: string) => void;
  loading?: boolean;
}

const PAGINA = 10;

export default function CompraEvitavelPanel({ dados, onSelecionar, loading }: CompraEvitavelPanelProps) {
  const [visiveis, setVisiveis] = useState(PAGINA);
  const valorEmRisco = dados.reduce((a, d) => a + d.valorEstoque, 0);

  const exportar = () => {
    if (dados.length === 0) return;
    const linhas = dados.map(d => ({
      'Material': d.material,
      'Descrição': d.descricao,
      'Saldo em Estoque': d.saldo,
      'UMB': d.umb,
      'Valor em Estoque': d.valorEstoque,
      'Qtd. Solicitada': d.qtdSolicitada,
      'Requisições Abertas': d.rms.join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Compra Evitavel');
    XLSX.writeFile(wb, `compra_evitavel_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
  };

  return (
    <ChartCard
      title="Compra Evitável"
      icon={AlertTriangle}
      description="Materiais com requisição de compra aberta e saldo disponível em estoque. Confirme o saldo antes de seguir com a cotação."
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
      {dados.length === 0 ? (
        // Estado bom também é informação: diz o que foi verificado, não só que
        // a lista está vazia.
        <div
          className="flex items-center gap-3 p-4 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--brand-wash)', color: 'var(--ink-primary)' }}
        >
          <CheckCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--status-good)' }} />
          Nenhuma requisição aberta para material com saldo em estoque.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span style={{ color: 'var(--ink-muted)' }}>
              <strong className="text-base font-black tabular" style={{ color: 'var(--status-warning)' }}>
                {formatInt(dados.length)}
              </strong>{' '}
              materiais
            </span>
            <span style={{ color: 'var(--ink-muted)' }}>
              <strong className="tabular" style={{ color: 'var(--ink-primary)' }}>{formatBRL(valorEmRisco)}</strong> já em estoque
            </span>
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {dados.slice(0, visiveis).map(d => (
              <button
                key={d.material}
                onClick={() => onSelecionar?.(d.material)}
                className="w-full text-left py-2.5 group cursor-pointer px-2 -mx-2 rounded transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
                style={{ borderColor: 'var(--hairline)', outlineColor: 'var(--status-warning)' }}
                title={`Ver ${d.material} na posição de estoque`}
              >
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-mono font-bold shrink-0" style={{ color: 'var(--ink-primary)' }}>
                    {d.material}
                  </span>
                  <span className="truncate flex-1" style={{ color: 'var(--ink-secondary)' }}>{d.descricao || '—'}</span>
                  <span className="shrink-0 font-bold tabular" style={{ color: 'var(--ink-primary)' }}>{formatBRL(d.valorEstoque)}</span>
                </div>
                <p className="text-[10px] mt-0.5 tabular" style={{ color: 'var(--ink-muted)' }}>
                  Saldo {formatQtd(d.saldo)} {d.umb} · solicitado {formatQtd(d.qtdSolicitada)} {d.umb} · RM {d.rms.join(', ') || '—'}
                </p>
              </button>
            ))}
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
