/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DollarSign, Package, Warehouse, Clock } from 'lucide-react';
import { EstoqueKpi, formatBRL, formatDateTimeBR } from '../../lib/almoxarifado';

interface EstoqueKpisProps {
  kpi: EstoqueKpi;
}

export default function EstoqueKpis({ kpi }: EstoqueKpisProps) {
  const cards = [
    {
      rotulo: 'Valor Imobilizado',
      valor: formatBRL(kpi.valor),
      detalhe: `${kpi.itens.toLocaleString('pt-BR')} linhas de estoque`,
      icone: DollarSign,
      barra: 'bg-emerald-500 dark:bg-emerald-600',
      cor: 'text-emerald-600 dark:text-emerald-500',
    },
    {
      rotulo: 'Materiais',
      valor: kpi.materiais.toLocaleString('pt-BR'),
      detalhe: 'códigos distintos com saldo',
      icone: Package,
      barra: 'bg-blue-500 dark:bg-blue-600',
      cor: 'text-slate-800 dark:text-slate-100',
    },
    {
      rotulo: 'Depósitos',
      valor: kpi.depositos.toLocaleString('pt-BR'),
      detalhe: 'locais de armazenagem',
      icone: Warehouse,
      barra: 'bg-violet-500 dark:bg-violet-600',
      cor: 'text-slate-800 dark:text-slate-100',
    },
    {
      rotulo: 'Data da Posição',
      valor: formatDateTimeBR(kpi.dataPosicao),
      detalhe: 'última importação ZL0024',
      icone: Clock,
      barra: 'bg-slate-400 dark:bg-slate-700',
      cor: 'text-slate-800 dark:text-slate-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {cards.map(c => {
        const Icone = c.icone;
        return (
          <div
            key={c.rotulo}
            className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden"
          >
            <div className={`absolute top-0 left-0 w-1.5 h-full ${c.barra}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <Icone className="h-3 w-3" /> {c.rotulo}
            </span>
            <p className={`text-xl font-black mt-2 leading-tight ${c.cor}`}>{c.valor}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{c.detalhe}</p>
          </div>
        );
      })}
    </div>
  );
}
