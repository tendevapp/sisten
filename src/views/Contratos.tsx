/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Página Contratos: Demandas (quadro Kanban dos chamados jurídicos),
 * Contratos (acompanhamento dos contratos ME3N e suas vigências) e Auditoria
 * (contrato × pedidos × FBL1N — só com a permissão `sup_contratos_auditoria`).
 */

import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { FileText, KanbanSquare, ShieldCheck } from 'lucide-react';
import { Profile } from '../types';
import TabDemandas from '../components/contratos/TabDemandas';
import TabContratosLista from '../components/contratos/TabContratosLista';
import { TableSkeleton } from '../components/ui/DataTable';
import { canAccessPage } from '../lib/pages';

const TabAuditoria = lazy(() => import('../components/contratos/TabAuditoria'));

type AbaContratos = 'demandas' | 'contratos' | 'auditoria';

interface ContratosProps {
  user: Profile;
  onNavigate: (path: string) => void;
  abaInicial?: AbaContratos;
}

const TODAS_ABAS = [
  { id: 'demandas' as const, label: 'Demandas', icon: KanbanSquare },
  { id: 'contratos' as const, label: 'Contratos', icon: FileText },
  { id: 'auditoria' as const, label: 'Auditoria', icon: ShieldCheck },
];

export default function Contratos({ user, abaInicial = 'demandas' }: ContratosProps) {
  const podeAuditar = canAccessPage(user, 'sup_contratos_auditoria');
  const abas = useMemo(() => TODAS_ABAS.filter(a => a.id !== 'auditoria' || podeAuditar), [podeAuditar]);
  const inicial: AbaContratos = abaInicial === 'auditoria' && !podeAuditar ? 'demandas' : abaInicial;
  const [aba, setAba] = useState<AbaContratos>(inicial);

  useEffect(() => { setAba(inicial); }, [inicial]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
          <FileText className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
          Contratos
        </h2>
        <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
          Demandas jurídicas em andamento, o acompanhamento dos contratos de fornecimento e a auditoria de valores lançados e pagos.
        </p>

        <div className="flex items-center gap-1 mt-4">
          {abas.map(a => {
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
        {aba === 'auditoria' && podeAuditar && (
          <Suspense fallback={<TableSkeleton columns={10} />}>
            <TabAuditoria />
          </Suspense>
        )}
      </div>
    </div>
  );
}
