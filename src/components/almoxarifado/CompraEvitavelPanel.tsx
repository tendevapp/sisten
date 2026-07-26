/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, FileSpreadsheet, ChevronDown, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CompraEvitavel, formatBRL, formatQtd } from '../../lib/almoxarifado';

interface CompraEvitavelPanelProps {
  dados: CompraEvitavel[];
  onSelecionar?: (material: string) => void;
}

const PAGINA = 10;

export default function CompraEvitavelPanel({ dados, onSelecionar }: CompraEvitavelPanelProps) {
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
    <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Compra Evitável
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Materiais com requisição de compra aberta e saldo disponível em estoque. Confirme o saldo antes de seguir com a cotação.
          </p>
        </div>
        {dados.length > 0 && (
          <button
            onClick={exportar}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95 shrink-0 h-9"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar {dados.length}
          </button>
        )}
      </div>

      {dados.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-sm font-semibold">
          <CheckCircle className="h-5 w-5 shrink-0" />
          Nenhuma requisição aberta para material com saldo em estoque.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              <strong className="text-amber-600 dark:text-amber-500 text-base font-black">{dados.length}</strong> materiais
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              <strong className="text-slate-800 dark:text-slate-200">{formatBRL(valorEmRisco)}</strong> já em estoque
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dados.slice(0, visiveis).map(d => (
              <button
                key={d.material}
                onClick={() => onSelecionar?.(d.material)}
                className="w-full text-left py-2.5 group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors px-2 -mx-2 rounded"
                title={`Ver ${d.material} na posição de estoque`}
              >
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0 group-hover:text-emerald-600 dark:group-hover:text-emerald-500">
                    {d.material}
                  </span>
                  <span className="truncate text-slate-600 dark:text-slate-400 flex-1">{d.descricao || '—'}</span>
                  <span className="shrink-0 font-bold text-slate-700 dark:text-slate-300 tabular-nums">{formatBRL(d.valorEstoque)}</span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Saldo {formatQtd(d.saldo)} {d.umb} · solicitado {formatQtd(d.qtdSolicitada)} {d.umb} · RM {d.rms.join(', ') || '—'}
                </p>
              </button>
            ))}
          </div>

          {visiveis < dados.length && (
            <button
              onClick={() => setVisiveis(v => v + PAGINA)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" /> Ver mais {Math.min(PAGINA, dados.length - visiveis)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
