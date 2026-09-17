/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Qualidade — Editor do Plano de Ação de uma RNC: lista de
 * atividades (O quê / Quem / Quando planejado / Início real / Término
 * real), cada uma com status e anexos próprios. Espelha a tela "Plano de
 * Ação" do formulário de referência (Qualiex): atraso/adiantamento é
 * calculado comparando a data real com a planejada.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, Paperclip, Plus, Save, Trash2, Upload,
} from 'lucide-react';
import type { QuaPlanoAcaoAtividade, QuaAtividadeStatus, QuaRncAnexo } from '../../types';
import * as api from '../../lib/qualidadeApi';
import { useLightbox } from '../ui/Lightbox';
import { useToast } from '../ui/Toast';

interface QualidadePlanoAcaoEditorProps {
  rncId: string;
  atividades: QuaPlanoAcaoAtividade[];
  podeEditar: boolean;
  responsavelPadrao?: string;
  onAtualizado: (atividades: QuaPlanoAcaoAtividade[], novoStatus: string) => void;
}

const novaAtividade = (sequencial: number, quemPadrao = ''): QuaPlanoAcaoAtividade => ({
  id: crypto.randomUUID(),
  sequencial,
  o_que: '',
  quem_nome: quemPadrao,
  quando_inicio: '',
  quando_fim: '',
  inicio_real: '',
  termino_real: '',
  status: 'PENDENTE',
  observacao: '',
  anexos: [],
});

function situacaoAtividade(a: QuaPlanoAcaoAtividade): { label: string; cor: string; icon: any } {
  if (a.status === 'CONCLUIDA') {
    const noPrazo = !a.quando_fim || !a.termino_real || a.termino_real <= a.quando_fim;
    return noPrazo
      ? { label: 'Concluída no prazo', cor: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800', icon: CheckCircle2 }
      : { label: 'Concluída com atraso', cor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800', icon: AlertTriangle };
  }
  const hoje = new Date().toISOString().slice(0, 10);
  if (a.quando_fim && a.quando_fim < hoje) {
    return { label: 'Atrasada', cor: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800', icon: AlertTriangle };
  }
  return a.status === 'EM_ANDAMENTO'
    ? { label: 'Em andamento', cor: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800', icon: Clock }
    : { label: 'Pendente', cor: 'text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', icon: Clock };
}

export default function QualidadePlanoAcaoEditor({
  rncId, atividades, podeEditar, responsavelPadrao, onAtualizado,
}: QualidadePlanoAcaoEditorProps) {
  const toast = useToast();
  const lightbox = useLightbox();
  const [lista, setLista] = useState<QuaPlanoAcaoAtividade[]>(atividades);
  const [salvando, setSalvando] = useState(false);
  const [enviandoAnexoId, setEnviandoAnexoId] = useState<string | null>(null);

  const alterou = useMemo(() => JSON.stringify(lista) !== JSON.stringify(atividades), [lista, atividades]);

  const atualizarCampo = (id: string, campo: keyof QuaPlanoAcaoAtividade, valor: any) => {
    setLista((prev) => prev.map((a) => (a.id === id ? { ...a, [campo]: valor } : a)));
  };

  const adicionar = () => {
    setLista((prev) => [...prev, novaAtividade(prev.length + 1, responsavelPadrao)]);
  };

  const remover = (id: string) => {
    setLista((prev) => prev.filter((a) => a.id !== id).map((a, idx) => ({ ...a, sequencial: idx + 1 })));
  };

  const anexarArquivo = async (atividadeId: string, file: File | null) => {
    if (!file) return;
    setEnviandoAnexoId(atividadeId);
    try {
      const anexo = await api.uploadAnexoAtividade(rncId, atividadeId, file);
      setLista((prev) =>
        prev.map((a) => (a.id === atividadeId ? { ...a, anexos: [...a.anexos, anexo] } : a))
      );
      toast.success('Anexo adicionado à atividade.');
    } catch (err: any) {
      toast.error(`Erro ao anexar arquivo: ${err.message || ''}`);
    } finally {
      setEnviandoAnexoId(null);
    }
  };

  const removerAnexo = (atividadeId: string, anexoId: string) => {
    setLista((prev) =>
      prev.map((a) => (a.id === atividadeId ? { ...a, anexos: a.anexos.filter((x) => x.id !== anexoId) } : a))
    );
  };

  const salvar = async () => {
    if (lista.some((a) => !a.o_que.trim())) {
      toast.error('Preencha "O que" em todas as atividades antes de salvar.');
      return;
    }
    setSalvando(true);
    try {
      const listaFinal = lista.map((a) => ({ ...a, atualizado_em: new Date().toISOString() }));
      const novoStatus = await api.atualizarPlanoAcaoRnc(rncId, listaFinal);
      toast.success('Plano de ação salvo com sucesso!');
      onAtualizado(listaFinal, novoStatus);
    } catch (err: any) {
      toast.error(`Erro ao salvar plano de ação: ${err.message || ''}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      {lightbox.elemento}

      {lista.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
          Nenhuma atividade cadastrada. Adicione as ações necessárias para o fechamento desta RNC.
        </div>
      )}

      {lista.map((a) => {
        const situacao = situacaoAtividade(a);
        const SituacaoIcon = situacao.icon;
        return (
          <div
            key={a.id}
            className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-bold text-slate-400">
                {String(a.sequencial).padStart(6, '0')}
              </span>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${situacao.cor}`}>
                  <SituacaoIcon className="h-3 w-3" />
                  {situacao.label}
                </span>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => remover(a.id)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">O quê?</label>
              <textarea
                disabled={!podeEditar}
                rows={2}
                value={a.o_que}
                onChange={(e) => atualizarCampo(a.id, 'o_que', e.target.value)}
                placeholder="Ação a ser executada..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Quem?</label>
                <input
                  disabled={!podeEditar}
                  type="text"
                  value={a.quem_nome}
                  onChange={(e) => atualizarCampo(a.id, 'quem_nome', e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Início Prev.</label>
                <input
                  disabled={!podeEditar}
                  type="date"
                  value={a.quando_inicio || ''}
                  onChange={(e) => atualizarCampo(a.id, 'quando_inicio', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-800 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Fim Prev.</label>
                <input
                  disabled={!podeEditar}
                  type="date"
                  value={a.quando_fim || ''}
                  onChange={(e) => atualizarCampo(a.id, 'quando_fim', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-800 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Início Real</label>
                <input
                  disabled={!podeEditar}
                  type="date"
                  value={a.inicio_real || ''}
                  onChange={(e) => atualizarCampo(a.id, 'inicio_real', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-800 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Término Real</label>
                <input
                  disabled={!podeEditar}
                  type="date"
                  value={a.termino_real || ''}
                  onChange={(e) => atualizarCampo(a.id, 'termino_real', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-800 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA'] as QuaAtividadeStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!podeEditar}
                    onClick={() => atualizarCampo(a.id, 'status', s)}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors disabled:cursor-not-allowed ${
                      a.status === s
                        ? 'bg-white text-rose-700 shadow-sm dark:bg-slate-900 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {s === 'PENDENTE' ? 'Pendente' : s === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Concluída'}
                  </button>
                ))}
              </div>

              {podeEditar && (
                <label className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-800 dark:text-rose-400">
                  {enviandoAnexoId === a.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Anexar evidência
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      anexarArquivo(a.id, e.target.files?.[0] || null);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            {a.anexos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {a.anexos.map((anexo: QuaRncAnexo) => (
                  <button
                    key={anexo.id}
                    type="button"
                    onClick={() =>
                      anexo.mime_type.startsWith('image/') && anexo.preview_url
                        ? lightbox.abrir(a.anexos.filter((x) => x.mime_type.startsWith('image/')).map((x) => ({ url: x.preview_url || '', legenda: x.name })), 0)
                        : anexo.preview_url && window.open(anexo.preview_url, '_self')
                    }
                    className="group relative inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[100px] truncate">{anexo.name}</span>
                    {podeEditar && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          removerAnexo(a.id, anexo.id);
                        }}
                        className="ml-0.5 text-slate-400 hover:text-rose-600"
                      >
                        ×
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {podeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={adicionar}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:border-rose-400 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Atividade
          </button>

          {alterou && (
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-500 disabled:opacity-60"
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar Plano de Ação
            </button>
          )}
        </div>
      )}
    </div>
  );
}
