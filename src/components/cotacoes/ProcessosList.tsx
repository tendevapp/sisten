/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lista os processos de cotação já criados — a única forma de retomar um
 * processo dias depois de criado; sem ela o fluxo só existiria dentro da
 * sessão que veio da Central de Compras.
 *
 * Inclui opção de busca em tempo real por número, título, RM, autor e status.
 */

import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  ChevronRight,
  PackageSearch,
  PlusCircle,
  History,
  Trash2,
  Loader2,
  Search,
  X,
} from 'lucide-react';
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
  const [termoBusca, setTermoBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<CotacaoProcessoStatus | 'todos'>('todos');

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

  const normalizar = (txt: string) =>
    txt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const processosFiltrados = useMemo(() => {
    const buscaLimpa = normalizar(termoBusca.trim());

    return processos.filter(p => {
      // Filtro por status
      if (filtroStatus !== 'todos' && p.status !== filtroStatus) {
        return false;
      }

      // Se não houver busca em texto, inclui todos
      if (!buscaLimpa) return true;

      // Busca por número, título, autor, observações ou data
      const num = normalizar(p.numero || '');
      const tit = normalizar(p.titulo || '');
      const autor = normalizar(p.criado_por_nome || '');
      const obs = normalizar(p.observacoes || '');
      const dataFmt = new Date(p.created_at).toLocaleDateString('pt-BR');

      return (
        num.includes(buscaLimpa) ||
        tit.includes(buscaLimpa) ||
        autor.includes(buscaLimpa) ||
        obs.includes(buscaLimpa) ||
        dataFmt.includes(buscaLimpa)
      );
    });
  }, [processos, termoBusca, filtroStatus]);

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
      {/* Barra de Pesquisa, Filtro de Status e Botões de Ação */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-xl">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={termoBusca}
              onChange={e => setTermoBusca(e.target.value)}
              placeholder="Pesquisar por número, RM, título ou autor..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
            />
            {termoBusca && (
              <button
                type="button"
                onClick={() => setTermoBusca('')}
                title="Limpar pesquisa"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value as any)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              title="Filtrar por status"
            >
              <option value="todos">Todos os status</option>
              <option value="aberto">Abertos</option>
              <option value="em_analise">Em análise</option>
              <option value="concluido">Concluídos</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">{acoes}</div>
      </div>

      {/* Indicador de Filtros Ativos */}
      {(termoBusca || filtroStatus !== 'todos') && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <span>
            Exibindo <strong>{processosFiltrados.length}</strong> de <strong>{processos.length}</strong> processos
          </span>
          <button
            type="button"
            onClick={() => {
              setTermoBusca('');
              setFiltroStatus('todos');
            }}
            className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {/* Tabela de Processos */}
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
            {processosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={podeGerenciarExclusao ? 6 : 5} className="py-12 text-center text-xs text-slate-500">
                  <div className="flex flex-col items-center gap-1.5">
                    <Search className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Nenhum processo encontrado
                    </span>
                    <span className="text-slate-400">
                      Tente buscar por outro termo ou limpe os filtros aplicados.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTermoBusca('');
                        setFiltroStatus('todos');
                      }}
                      className="mt-2 rounded-lg bg-slate-100 px-3 py-1 font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Limpar filtros
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              processosFiltrados.map(p => (
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
              ))
            )}
          </TableBody>
        </table>
      </TableShell>
    </div>
  );
}
