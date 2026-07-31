/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Página Contratos: duas subpáginas — Demandas (quadro Kanban dos chamados
 * jurídicos) e Contratos (acompanhamento dos contratos ME3N e suas vigências).
 */

import React, { useEffect, useState } from 'react';
import { FileText, KanbanSquare } from 'lucide-react';
import { Profile } from '../types';
import TabDemandas from '../components/contratos/TabDemandas';
import TabContratosLista from '../components/contratos/TabContratosLista';

interface ContratosProps {
  user: Profile;
  onNavigate: (path: string) => void;
  abaInicial?: 'demandas' | 'contratos';
}

const ABAS = [
  { id: 'demandas' as const, label: 'Demandas', icon: KanbanSquare },
  { id: 'contratos' as const, label: 'Contratos', icon: FileText },
];

export default function Contratos({ user, abaInicial = 'demandas' }: ContratosProps) {
  const [aba, setAba] = useState<'demandas' | 'contratos'>(abaInicial);

  useEffect(() => { setAba(abaInicial); }, [abaInicial]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
          <FileText className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
          Contratos
        </h2>
        <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
          Demandas jurídicas em andamento e o acompanhamento dos contratos de fornecimento.
        </p>

        <div className="flex items-center gap-1 mt-4">
          {ABAS.map(a => {
            const Icon = a.icon;
            const active = aba === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors duration-150 cursor-pointer"
                style={{
                  color: active ? 'var(--brand-strong)' : 'var(--ink-secondary)',
                  background: active ? 'var(--brand-wash)' : 'transparent',
                }}
              >
                <Icon className="h-4 w-4" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      <div key={aba} className="reveal">
        {aba === 'demandas' && <TabDemandas user={user} />}
        {aba === 'contratos' && <TabContratosLista />}
      </div>
    </div>
  );
}
