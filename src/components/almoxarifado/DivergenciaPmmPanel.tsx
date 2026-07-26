/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, FileSpreadsheet, ChevronDown, CheckCircle, AlertCircle, Scale } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DivergenciaPmm, formatBRL, formatDateBR } from '../../lib/almoxarifado';

interface DivergenciaPmmPanelProps {
  dados: DivergenciaPmm[];
  // true quando vw_estoque_analise não pôde ser carregada: sem ela não há com o
  // que comparar, e dizer "nenhuma divergência" seria mentira.
  indisponivel: boolean;
  onSelecionar?: (material: string) => void;
}

const PAGINA = 10;

export default function DivergenciaPmmPanel({ dados, indisponivel, onSelecionar }: DivergenciaPmmPanelProps) {
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
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Scale className="h-4 w-4 text-violet-500" /> Divergência de PMM
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Último preço pago afastado do preço médio em mais de 20%. Acima indica estoque contabilizado abaixo do custo de reposição; abaixo indica PMM inflado por compra antiga.
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

      {indisponivel ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-sm font-medium">
          <AlertCircle className="h-5 w-5 shrink-0" />
          Não foi possível carregar o histórico de preços pagos. Este painel fica indisponível; os demais seguem com a posição de estoque em cache.
        </div>
      ) : dados.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-sm font-semibold">
          <CheckCircle className="h-5 w-5 shrink-0" />
          Nenhum material com preço médio fora da faixa de 20%.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              <strong className="text-rose-600 dark:text-rose-500 text-base font-black">{acima}</strong> acima do PMM
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              <strong className="text-blue-600 dark:text-blue-500 text-base font-black">{abaixo}</strong> abaixo do PMM
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dados.slice(0, visiveis).map(d => {
              const positiva = d.variacao > 0;
              const Icone = positiva ? TrendingUp : TrendingDown;
              return (
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
                    <span className={`shrink-0 inline-flex items-center gap-1 font-bold tabular-nums ${positiva ? 'text-rose-600 dark:text-rose-500' : 'text-blue-600 dark:text-blue-500'}`}>
                      <Icone className="h-3 w-3" />
                      {positiva ? '+' : ''}{(d.variacao * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
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
