/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Histórico consultável de conversões (tabela `conversoes_markdown`) — via
 * local (planilha/JSON/XML, sem IA) e via IA (PDF/imagem, com modelo, tokens
 * e custo). Cada linha busca o markdown completo sob demanda ao clicar em
 * "Ver" — a listagem em si não carrega o conteúdo de cada conversão, só o
 * resumo, para não pesar a rede com centenas de blocos de markdown.
 */

import React, { useEffect, useState } from 'react';
import { History, Eye, Loader2, RefreshCw, CheckCircle2, XCircle, Sparkles, Cpu, User } from 'lucide-react';
import Modal, { ModalHeader, ModalBody } from '../ui/Modal';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty, TableSkeleton } from '../ui/DataTable';
import { formatDuration, formatUsd, formatDateTimeBR } from '../../lib/format';
import { listarConversoesMarkdown, buscarConversaoMarkdown } from '../../lib/converterMarkdownApi';
import { useToast } from '../ui/Toast';
import type { ConversaoMarkdownResumo, ConversaoMarkdownLog } from '../../types';

interface HistoricoConversoesModalProps {
  onClose: () => void;
}

export default function HistoricoConversoesModal({ onClose }: HistoricoConversoesModalProps) {
  const toast = useToast();
  const [itens, setItens] = useState<ConversaoMarkdownResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [verId, setVerId] = useState<string | null>(null);
  const [verConteudo, setVerConteudo] = useState<ConversaoMarkdownLog | null>(null);
  const [carregandoConteudo, setCarregandoConteudo] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      setItens(await listarConversoesMarkdown());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirConteudo = async (id: string) => {
    setVerId(id);
    setVerConteudo(null);
    setCarregandoConteudo(true);
    try {
      setVerConteudo(await buscarConversaoMarkdown(id));
    } catch (err) {
      toast.error((err as Error).message);
      setVerId(null);
    } finally {
      setCarregandoConteudo(false);
    }
  };

  const copiar = async (markdown: string) => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success('Markdown copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel="Histórico de conversões">
      <ModalHeader onClose={onClose}>
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50">
          <History className="h-4 w-4" />
          Histórico de conversões
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Arquivo, formato, modelo/API usado, tokens, custo e duração de cada conversão já feita.</p>
      </ModalHeader>
      <ModalBody>
        {verId ? (
          <div className="space-y-3">
            <button type="button" onClick={() => setVerId(null)} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              ← Voltar para a lista
            </button>
            {carregandoConteudo ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : verConteudo ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{verConteudo.nome_arquivo}</p>
                  {verConteudo.markdown && (
                    <button
                      type="button"
                      onClick={() => copiar(verConteudo.markdown!)}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                    >
                      Copiar markdown
                    </button>
                  )}
                </div>
                <textarea
                  readOnly
                  value={verConteudo.markdown ?? '(sem markdown — conversão falhou)'}
                  className="h-[50vh] w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            ) : null}
          </div>
        ) : carregando ? (
          <TableSkeleton columns={7} rows={6} />
        ) : itens.length === 0 ? (
          <TableEmpty icon={History} title="Nenhuma conversão registrada ainda" hint="Toda conversão feita nesta tela — local ou por IA — fica registrada aqui." />
        ) : (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button type="button" onClick={carregar} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-indigo-600">
                <RefreshCw className="h-3 w-3" />
                Atualizar
              </button>
            </div>
            <TableShell maxHeight="60vh">
              <table className="w-full text-xs">
                <TableHeadRow>
                  <Th label="Quando" />
                  <Th label="Usuário" />
                  <Th label="Arquivo" />
                  <Th label="Via / Modelo" />
                  <Th label="Tokens" align="right" />
                  <Th label="Custo" align="right" />
                  <Th label="Duração" align="right" />
                  <Th label="Status" />
                  <Th label="" />
                </TableHeadRow>
                <TableBody>
                  {itens.map(item => (
                    <Tr key={item.id}>
                      <Td>{formatDateTimeBR(item.created_at)}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200" title={item.user_name ?? 'Sistema'}>
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[120px]">{item.user_name || 'Sistema'}</span>
                        </span>
                      </Td>
                      <Td truncate title={item.nome_arquivo}>{item.nome_arquivo}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-1">
                          {item.via === 'ia' ? <Sparkles className="h-3 w-3 text-indigo-500" /> : <Cpu className="h-3 w-3 text-slate-400" />}
                          {item.modelo ?? (item.via === 'local' ? 'local (sem IA)' : '—')}
                        </span>
                      </Td>
                      <Td align="right" numeric>{item.tokens != null ? item.tokens.toLocaleString('pt-BR') : '—'}</Td>
                      <Td align="right" numeric>{formatUsd(item.custo_usd)}</Td>
                      <Td align="right" numeric>{formatDuration(item.duracao_ms)}</Td>
                      <Td>
                        {item.sucesso ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400" title={item.erro_mensagem ?? undefined}><XCircle className="h-3.5 w-3.5" /> Falhou</span>
                        )}
                      </Td>
                      <Td align="right">
                        {item.sucesso && (
                          <button type="button" onClick={() => abrirConteudo(item.id)} title="Ver markdown" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </table>
            </TableShell>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
