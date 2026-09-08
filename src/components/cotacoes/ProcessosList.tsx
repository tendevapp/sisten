/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lista os processos de cotação já criados — a única forma de retomar um
 * processo dias depois de criado; sem ela o fluxo só existiria dentro da
 * sessão que veio da Central de Compras.
 */

import React, { useState } from 'react';
import { FileSpreadsheet, ChevronRight, PackageSearch, PlusCircle, History, Trash2, Loader2 } from 'lucide-react';
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
  /** Cria um processo direto, sem passar pela Central de Compras — para cotações avulsas, sem RM vinculada. */
  onCriarSemVinculo: () => void;
  /** Abre a página analítica de histórico e inteligência de cotações passadas. */
  onAbrirHistorico?: () => void;
  /** Habilita a exclusão de processos ainda abertos (só admin). */
  podeExcluir?: boolean;
  /** Exclui o processo de cotação. Deve rejeitar em caso de falha. */
  onExcluir?: (id: string) => Promise<void>;
}

export default function ProcessosList({
  processos,
  carregando,
  onAbrir,
  onNovoProcesso,
  onCriarSemVinculo,
  onAbrirHistorico,
  podeExcluir = false,
  onExcluir,
}: ProcessosListProps) {
  const semProcessos = !carregando && processos.length === 0;
  const podeGerenciarExclusao = podeExcluir && !!onExcluir;
  const [confirmarId, setConfirmarId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const confirmarExclusao = async (id: string) => {
    setExcluindoId(id);
    try {
      await onExcluir!(id);
      setConfirmarId(null);
    } catch {
      // O componente-pai já notifica o erro; mantém a confirmação aberta
      // para o admin tentar de novo.
    } finally {
      setExcluindoId(null);
    }
  };

  const acoes = (
    <div className="flex flex-wrap items-center gap-2">
      {onAbrirHistorico && (
        <button
          type="button"
          onClick={onAbrirHistorico}
          title="Consultar histórico de cotações e inteligência de preços passados"
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          Histórico de cotações
        </button>
      )}
      <button
        type="button"
        onClick={onNovoProcesso}
        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20"
      >
        <PackageSearch className="h-3.5 w-3.5" />
        Ir para a Central de Compras
      </button>
      <button
        type="button"
        onClick={onCriarSemVinculo}
        title="Criar um processo de cotação sem vincular itens de RM"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
      >
        <PlusCircle className="h-3.5 w-3.5" />
        Criar nova
      </button>
    </div>
  );

  if (semProcessos) {
    return (
      <TableEmpty
        icon={FileSpreadsheet}
        title="Nenhum processo de cotação ainda"
        hint="Um processo normalmente nasce da seleção de itens na Central de Compras, mas também dá para criar uma cotação avulsa, sem RM vinculada."
        action={acoes}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{acoes}</div>
      <TableShell maxHeight="70vh">
        <table className="w-full text-xs">
          <TableHeadRow>
            <Th label="Número" />
            <Th label="Título" />
            <Th label="Status" />
            <Th label="Criado por" />
            <Th label="Criado em" />
            {podeGerenciarExclusao && <Th label="" align="right" width="w-24" />}
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
                {podeGerenciarExclusao && (
                  <Td align="right">
                    {p.status !== 'aberto' ? null : confirmarId === p.id ? (
                      <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={excluindoId === p.id}
                          onClick={() => confirmarExclusao(p.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          {excluindoId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Excluir
                        </button>
                        <button
                          type="button"
                          disabled={excluindoId === p.id}
                          onClick={() => setConfirmarId(null)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          Não
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        title="Excluir este processo de cotação"
                        onClick={e => { e.stopPropagation(); setConfirmarId(p.id); }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </TableBody>
        </table>
      </TableShell>
    </div>
  );
}
