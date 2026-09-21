/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janela suspensa (Modal) para visualização rápida do Mapa Comparativo de Cotação.
 * Aberto diretamente a partir da Central de Compras ao clicar no número da cotação
 * de qualquer item que esteja associado a um processo.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { FileSpreadsheet, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import Modal, { ModalHeader, ModalBody } from '../ui/Modal';
import MapaComparativo from './MapaComparativo';
import { buscarProcessoCotacao } from '../../lib/cotacoesApi';
import { propostaSalvaParaDraft } from '../../lib/cotacoes';
import { useToast } from '../ui/Toast';
import type { CotacaoProcesso, CotacaoProcessoItem, CotacaoPropostaDraft } from '../../types';

interface MapaCotacaoModalProps {
  processoId: string;
  numero?: string;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  usuarioNome?: string;
  compradorPadrao?: string | null;
}

export default function MapaCotacaoModal({
  processoId,
  numero,
  onClose,
  onNavigate,
  usuarioNome = '',
  compradorPadrao = null,
}: MapaCotacaoModalProps) {
  const toast = useToast();

  const [processo, setProcesso] = useState<CotacaoProcesso | null>(null);
  const [escopo, setEscopo] = useState<CotacaoProcessoItem[]>([]);
  const [propostas, setPropostas] = useState<CotacaoPropostaDraft[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    if (!processoId) return;
    setCarregando(true);
    setErro(null);
    try {
      const { processo: p, itens, propostas: props } = await buscarProcessoCotacao(processoId);
      setProcesso(p);
      setEscopo(itens);
      setPropostas(props.map(propostaSalvaParaDraft));
    } catch (err) {
      console.error('Falha ao carregar mapa de cotação:', err);
      setErro((err as Error).message || 'Não foi possível carregar os dados do processo de cotação.');
    } finally {
      setCarregando(false);
    }
  }, [processoId]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  const handleChangeProposta = (key: string, patch: Partial<CotacaoPropostaDraft>) => {
    setPropostas(prev => prev.map(p => (p._key === key ? { ...p, ...patch } : p)));
  };

  const handleDecisaoSalva = () => {
    toast.success('Decisão do mapa salva com sucesso.');
  };

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-[96vw]"
      ariaLabel={`Mapa de Cotação ${processo?.numero || numero || ''}`}
      zIndexClassName="z-[90]"
    >
      <ModalHeader onClose={onClose} className="bg-slate-50 dark:bg-slate-850">
        <div className="flex items-center justify-between gap-3 pr-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40 shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight">
                  {processo?.numero || numero || 'Processo de Cotação'}
                </h2>
                {processo?.status && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      processo.status === 'concluido'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : processo.status === 'em_analise'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        : processo.status === 'cancelado'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {processo.status === 'em_analise'
                      ? 'Em análise'
                      : processo.status === 'concluido'
                      ? 'Concluído'
                      : processo.status === 'cancelado'
                      ? 'Cancelado'
                      : 'Aberto'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {processo?.titulo
                  ? `${processo.titulo} · `
                  : ''}
                {escopo.length} {escopo.length === 1 ? 'item no escopo' : 'itens no escopo'} · {propostas.length} {propostas.length === 1 ? 'proposta salva' : 'propostas salvas'}
              </p>
            </div>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigate(`/suprimentos/cotacoes?processoId=${processoId}`);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer shrink-0"
              title="Abrir no módulo de Cotações para importar propostas ou editar o processo"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Módulo Cotações</span>
            </button>
          )}
        </div>
      </ModalHeader>

      <ModalBody className="p-3 sm:p-5 bg-slate-50/50 dark:bg-slate-900/40">
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-28 text-slate-400 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Carregando mapa comparativo de cotação...
            </p>
          </div>
        ) : erro ? (
          <div className="p-8 text-center space-y-4 max-w-md mx-auto my-12">
            <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Não foi possível carregar a cotação</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{erro}</p>
            </div>
            <button
              type="button"
              onClick={() => void carregarDados()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        ) : processo ? (
          <MapaComparativo
            processo={processo}
            escopo={escopo}
            propostas={propostas}
            usuarioNome={usuarioNome}
            onVoltar={onClose}
            rotuloVoltar="Fechar"
            onAtualizarProposta={handleChangeProposta}
            onDecisaoSalva={handleDecisaoSalva}
            onRecarregarPropostas={carregarDados}
            compradorPadrao={compradorPadrao}
          />
        ) : null}
      </ModalBody>
    </Modal>
  );
}
