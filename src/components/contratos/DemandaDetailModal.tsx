/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detalhe de uma demanda jurídica (chamado) — aberto ao clicar num card do
 * quadro Kanban. Muda o status pelo mesmo caminho do arrastar (
 * `localDb.updateRequestStatus`), então as duas formas ficam sempre
 * consistentes; aqui também dá para editar título, prazo de conclusão e
 * trocar comentários com o solicitante.
 */

import React, { useState } from 'react';
import { Calendar, Send, User, Building2, FileText, Loader2, Check, Lock, Globe } from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile, Request, RequestComment, RequestStatus } from '../../types';
import { formatDateBR, formatDateTimeBR } from '../../lib/format';
import { STATUS_LABEL_DEMANDA, STATUS_OPTIONS_DEMANDA, corDoStatus } from '../../lib/kanban';
import { useChartConfig } from '../charts/chartDefaults';
import { useToast } from '../ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';

interface DemandaDetailModalProps {
  request: Request;
  user: Profile;
  onClose: () => void;
  onUpdated: (request: Request) => void;
}

const CRITICALITY_LABEL: Record<number, string> = {
  1: 'Melhoria ou dúvida',
  2: 'Incômodo contornável',
  3: 'Impacto parcial',
  4: 'Impacto severo',
  5: 'Parada de setor / risco',
};

function Campo({ label, icon: Icon, value }: { label: string; icon: React.ComponentType<{ className?: string }>; value: React.ReactNode }) {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
        <Icon className="h-3 w-3" /> {label}
      </span>
      <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink-primary)' }}>{value}</p>
    </div>
  );
}

export default function DemandaDetailModal({ request, user, onClose, onUpdated }: DemandaDetailModalProps) {
  const toast = useToast();
  const chartTokens = useChartConfig().tokens;
  const [titulo, setTitulo] = useState(request.titulo || request.category_id || '');
  const [savingTitulo, setSavingTitulo] = useState(false);
  const [status, setStatus] = useState<RequestStatus>(request.status);
  const [savingStatus, setSavingStatus] = useState(false);
  const [prazo, setPrazo] = useState(request.prazo_conclusao || '');
  const [savingPrazo, setSavingPrazo] = useState(false);
  const [comments, setComments] = useState<RequestComment[]>(() => localDb.getRequestComments(request.id));
  const [novoComentario, setNovoComentario] = useState('');
  const [comentarioInterno, setComentarioInterno] = useState(true);
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  const handleSalvarTitulo = async () => {
    const valor = titulo.trim();
    if (!valor || valor === (request.titulo || request.category_id)) return;
    setSavingTitulo(true);
    try {
      await localDb.updateRequestTitulo(request.id, valor);
      onUpdated({ ...request, titulo: valor });
    } catch (err) {
      console.error('Falha ao salvar o título.', err);
      toast.error('Não foi possível salvar o título. Tente novamente.');
      setTitulo(request.titulo || request.category_id || '');
    } finally {
      setSavingTitulo(false);
    }
  };

  const handleMudarStatus = async (novoStatus: RequestStatus) => {
    const statusAnterior = status;
    setStatus(novoStatus);
    setSavingStatus(true);
    try {
      await localDb.updateRequestStatus(request.id, novoStatus, user.id, `Status alterado para "${STATUS_LABEL_DEMANDA[novoStatus]}" nos detalhes da demanda.`);
      onUpdated({ ...request, status: novoStatus });
      toast.success(`Status alterado para "${STATUS_LABEL_DEMANDA[novoStatus]}".`);
    } catch (err) {
      console.error('Falha ao alterar o status.', err);
      toast.error('Não foi possível alterar o status. Tente novamente.');
      setStatus(statusAnterior);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSalvarPrazo = async () => {
    setSavingPrazo(true);
    try {
      await localDb.updateRequestPrazoConclusao(request.id, prazo || null);
      onUpdated({ ...request, prazo_conclusao: prazo || null });
      toast.success('Prazo de conclusão salvo.');
    } catch (err) {
      console.error('Falha ao salvar o prazo de conclusão.', err);
      toast.error('Não foi possível salvar o prazo. Tente novamente.');
    } finally {
      setSavingPrazo(false);
    }
  };

  const handleEnviarComentario = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = novoComentario.trim();
    if (!texto) return;

    setEnviandoComentario(true);
    try {
      await localDb.addComment(request.id, user.id, texto, comentarioInterno ? 'internal' : 'public');
      setComments(localDb.getRequestComments(request.id));
      setNovoComentario('');
    } catch (err) {
      console.error('Falha ao enviar o comentário.', err);
      toast.error('Não foi possível enviar o comentário. Tente novamente.');
    } finally {
      setEnviandoComentario(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Detalhes da Demanda" maxWidth="max-w-2xl">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Chamado #{request.number}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{request.category_id || 'Sem categoria'}</p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-6">
        <div className="space-y-1.5">
          <label htmlFor="demanda_titulo" className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Título</label>
          <div className="flex items-center gap-2">
            <input
              id="demanda_titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={handleSalvarTitulo}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
              className="flex-1 rounded-xl border px-3.5 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            />
            {savingTitulo && <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--ink-muted)' }} />}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="demanda_status" className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Status</label>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: corDoStatus(status, chartTokens.status, chartTokens.brand, chartTokens.inkMuted) }} />
            <select
              id="demanda_status"
              value={status}
              onChange={(e) => handleMudarStatus(e.target.value as RequestStatus)}
              disabled={savingStatus}
              className="flex-1 rounded-xl border px-3.5 py-2 text-sm font-semibold cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            >
              {STATUS_OPTIONS_DEMANDA.map(s => (
                <option key={s} value={s}>{STATUS_LABEL_DEMANDA[s]}</option>
              ))}
            </select>
            {savingStatus && <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--ink-muted)' }} />}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Campo label="Solicitante" icon={User} value={request.solicitante_name} />
          <Campo label="Criticidade" icon={FileText} value={`Grau ${request.criticality} — ${CRITICALITY_LABEL[request.criticality] || ''}`} />
          <Campo label="Aberto em" icon={Calendar} value={formatDateTimeBR(request.created_at)} />
          {request.contrato_tipo && <Campo label="Tipo de contrato" icon={FileText} value={request.contrato_tipo} />}
          {request.fornecedor_terceiro && <Campo label="Fornecedor / Terceiro" icon={Building2} value={request.fornecedor_terceiro} />}
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Descrição</span>
          <p className="text-sm rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}>
            {request.justificativa || '—'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="prazo_conclusao" className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
            Prazo de conclusão
          </label>
          <div className="flex items-center gap-2">
            <input
              id="prazo_conclusao"
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="rounded-xl border px-3.5 py-2 text-sm cursor-pointer"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            />
            <button
              type="button"
              onClick={handleSalvarPrazo}
              disabled={savingPrazo || prazo === (request.prazo_conclusao || '')}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-2 text-xs font-bold text-white transition-colors"
            >
              {savingPrazo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
            Comentários ({comments.length})
          </span>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {comments.length === 0 && (
              <p className="text-xs italic" style={{ color: 'var(--ink-secondary)' }}>Nenhum comentário ainda.</p>
            )}
            {comments.map(c => (
              <div key={c.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-xs" style={{ color: 'var(--ink-primary)' }}>{c.user_name}</span>
                  <span className="flex items-center gap-2">
                    {c.is_internal && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase" style={{ color: 'var(--status-warning)' }}>
                        <Lock className="h-2.5 w-2.5" /> Interno
                      </span>
                    )}
                    <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{formatDateTimeBR(c.created_at)}</span>
                  </span>
                </div>
                <p style={{ color: 'var(--ink-secondary)' }}>{c.content}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleEnviarComentario} className="space-y-2">
            <textarea
              rows={2}
              value={novoComentario}
              onChange={(e) => setNovoComentario(e.target.value)}
              placeholder="Escreva um comentário..."
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setComentarioInterno(v => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-lg border px-2.5 py-1.5 transition-colors cursor-pointer"
                style={{
                  borderColor: 'var(--hairline)',
                  color: comentarioInterno ? 'var(--status-warning)' : 'var(--ink-secondary)',
                  background: comentarioInterno ? 'color-mix(in srgb, var(--status-warning) 12%, transparent)' : 'var(--surface-card)',
                }}
              >
                {comentarioInterno ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                {comentarioInterno ? 'Interno (equipe)' : 'Visível ao solicitante'}
              </button>
              <button
                type="submit"
                disabled={enviandoComentario || !novoComentario.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-1.5 text-xs font-bold text-white transition-colors"
              >
                {enviandoComentario ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar
              </button>
            </div>
          </form>
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}
