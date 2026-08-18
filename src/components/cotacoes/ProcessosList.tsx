/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lista os processos de cotação já criados — a única forma de retomar um
 * processo dias depois de criado; sem ela o fluxo só existiria dentro da
 * sessão que veio da Central de Compras.
 */

import React from 'react';
import { FileSpreadsheet, ChevronRight, PackageSearch } from 'lucide-react';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty } from '../ui/DataTable';
import type { CotacaoProcesso, CotacaoProcessoStatus } from '../../types';

const STATUS_LABEL: Record<CotacaoProcessoStatus, string> = {
  aberto: 'Aberto',
  em_analise: 'Em análise',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_CLASSES: Record<CotacaoProcessoStatus, string> = {
  aberto: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  em_analise: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  concluido: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  cancelado: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

interface ProcessosListProps {
  processos: CotacaoProcesso[];
  carregando: boolean;
  onAbrir: (id: string) => void;
  onNovoProcesso: () => void;
}

export default function ProcessosList({ processos, carregando, onAbrir, onNovoProcesso }: ProcessosListProps) {
  if (!carregando && processos.length === 0) {
    return (
      <TableEmpty
        icon={FileSpreadsheet}
        title="Nenhum processo de cotação ainda"
        hint="Um processo nasce da seleção de itens na Central de Compras. Marque os itens que quer cotar e clique em 'Criar processo de cotação'."
        action={
          <button
            type="button"
            onClick={onNovoProcesso}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <PackageSearch className="h-3.5 w-3.5" />
            Ir para a Central de Compras
          </button>
        }
      />
    );
  }

  return (
    <TableShell maxHeight="70vh">
      <table className="w-full text-xs">
        <TableHeadRow>
          <Th label="Número" />
          <Th label="Título" />
          <Th label="Status" />
          <Th label="Criado por" />
          <Th label="Criado em" />
        </TableHeadRow>
        <TableBody>
          {processos.map(p => (
            <Tr key={p.id} onClick={() => onAbrir(p.id)}>
              <Td strong>{p.numero}</Td>
              <Td>{p.titulo || <span className="text-slate-400">—</span>}</Td>
              <Td>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASSES[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </Td>
              <Td>{p.criado_por_nome}</Td>
              <Td>
                <span className="inline-flex items-center gap-1">
                  {new Date(p.created_at).toLocaleDateString('pt-BR')}
                  <ChevronRight className="h-3 w-3 text-slate-400" />
                </span>
              </Td>
            </Tr>
          ))}
        </TableBody>
      </table>
    </TableShell>
  );
}
