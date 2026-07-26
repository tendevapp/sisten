/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ClipboardCheck, CheckCircle } from 'lucide-react';
import { LacunaCadastro, formatBRL } from '../../lib/almoxarifado';

interface QualidadeCadastroPanelProps {
  lacunas: LacunaCadastro[];
  totalItens: number;
}

export default function QualidadeCadastroPanel({ lacunas, totalItens }: QualidadeCadastroPanelProps) {
  const semLacuna = lacunas.every(l => l.itens === 0);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-blue-500" /> Qualidade de Cadastro
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Campos que o item precisa ter preenchidos para entrar em qualquer política de classificação e reposição.
        </p>
      </div>

      {semLacuna ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-sm font-semibold">
          <CheckCircle className="h-5 w-5 shrink-0" />
          Todos os {totalItens.toLocaleString('pt-BR')} itens do filtro têm classe, grupo de mercadoria e preço médio preenchidos.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {lacunas.map(l => {
            const pct = totalItens > 0 ? (l.itens / totalItens) * 100 : 0;
            const vazio = l.itens === 0;
            return (
              <div
                key={l.rotulo}
                className={`rounded-lg border p-3 ${vazio ? 'border-slate-200 dark:border-slate-800' : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10'}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{l.rotulo}</p>
                <p className={`text-2xl font-black mt-1 ${vazio ? 'text-slate-400 dark:text-slate-600' : 'text-amber-600 dark:text-amber-500'}`}>
                  {l.itens.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {vazio ? 'nenhum item' : `${pct.toFixed(1)}% dos itens · ${formatBRL(l.valor)}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
