/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Lista de Presença — Briefing de Segurança" (FRM.SGP-0013).
 * Exibe as sessões de briefing geradas automaticamente a partir das ocorrências
 * e entradas da portaria, permitindo a coleta de assinaturas digitais, registro de
 * horário de assinatura, consulta rápida por CPF e exportação de PDF individual ou
 * consolidado (com cada sessão em uma página e assinaturas digitais renderizadas).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Search, FileDown, CheckCircle2,
  Trash2, Loader2, ShieldCheck, UserCheck, Check, AlertCircle, Clock,
  PenTool, CheckCheck, CheckSquare, Square, Files
} from 'lucide-react';
import type {
  Profile, PortBriefingSessao, PortBriefingParticipante
} from '../../types';
import * as api from '../../lib/portariaApi';
import { exportBriefingPdf, exportBriefingConsolidadoPdf } from '../../lib/pdfExport/exportPortariaPdf';
import StatusPortariaBadge from '../../components/portaria/StatusPortariaBadge';
import SignaturePadModal from '../../components/portaria/SignaturePadModal';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function PortariaBriefing({ user, onNavigate }: Props) {
  const toast = useToast();
  const [sessoes, setSessoes] = useState<PortBriefingSessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessaoAtiva, setSessaoAtiva] = useState<PortBriefingSessao | null>(null);
  const [sessoesSelecionadasIds, setSessoesSelecionadasIds] = useState<string[]>([]);

  // CPF Quick Check
  const [cpfConsulta, setCpfConsulta] = useState('');
  const [resultadoConsulta, setResultadoConsulta] = useState<PortBriefingParticipante | null | 'NOT_FOUND'>(null);
  const [consultandoCpf, setConsultandoCpf] = useState(false);

  // Modais de Assinatura e Exclusão
  const [modalAssinaturaAberto, setModalAssinaturaAberto] = useState(false);
  const [participanteParaAssinar, setParticipanteParaAssinar] = useState<PortBriefingParticipante | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<PortBriefingSessao | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregarSessoes = useCallback(async (selecionarId?: string) => {
    try {
      const data = await api.listarSessoesBriefing();
      setSessoes(data);
      setSessaoAtiva((prev) => {
        if (selecionarId) {
          const matchNovo = data.find((s) => s.id === selecionarId);
          if (matchNovo) return matchNovo;
        }
        if (prev) {
          const match = data.find((s) => s.id === prev.id);
          return match || data[0] || null;
        }
        return data[0] || null;
      });
    } catch (e) {
      toast.error(`Erro ao carregar sessões de briefing: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    carregarSessoes();
  }, [carregarSessoes]);

  const handleSalvarAssinaturaParticipante = async (dataUrl: string) => {
    if (!sessaoAtiva || !participanteParaAssinar) return;

    setSalvando(true);
    try {
      const res = await api.salvarAssinaturaParticipanteBriefing(
        participanteParaAssinar.id,
        dataUrl
      );

      if (res.sessaoConcluida) {
        toast.success(`Assinatura de ${participanteParaAssinar.nome} salva! Todas as assinaturas foram colhidas e o briefing foi finalizado.`);
      } else {
        toast.success(`Assinatura de ${participanteParaAssinar.nome} salva com sucesso!`);
      }

      setModalAssinaturaAberto(false);
      setParticipanteParaAssinar(null);

      const sessaoAtualizada = await api.obterSessaoBriefing(sessaoAtiva.id);
      if (sessaoAtualizada) setSessaoAtiva(sessaoAtualizada);
      carregarSessoes(sessaoAtiva.id);
    } catch (err: any) {
      toast.error('Erro ao salvar assinatura: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const handleRemoverParticipante = async (participanteId: string) => {
    if (!sessaoAtiva) return;
    try {
      await api.removerParticipanteBriefing(participanteId);
      toast.success('Participante removido da lista.');
      const sessaoAtualizada = await api.obterSessaoBriefing(sessaoAtiva.id);
      if (sessaoAtualizada) setSessaoAtiva(sessaoAtualizada);
      carregarSessoes(sessaoAtiva.id);
    } catch (e) {
      toast.error(`Erro ao remover participante: ${(e as Error).message}`);
    }
  };

  const handleConsultarCpf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpfConsulta.trim()) return;
    setConsultandoCpf(true);
    try {
      const res = await api.buscarBriefingValidoPorCpf(cpfConsulta);
      setResultadoConsulta(res || 'NOT_FOUND');
    } catch (e) {
      toast.error(`Erro ao consultar CPF: ${(e as Error).message}`);
    } finally {
      setConsultandoCpf(false);
    }
  };

  const handleExcluirSessao = async () => {
    if (!itemParaExcluir) return;
    try {
      await api.excluirSessaoBriefing(itemParaExcluir.id);
      toast.success('Sessão de briefing excluída.');
      if (sessaoAtiva?.id === itemParaExcluir.id) setSessaoAtiva(null);
      setSessoesSelecionadasIds((prev) => prev.filter((id) => id !== itemParaExcluir.id));
      setItemParaExcluir(null);
      carregarSessoes();
    } catch (e) {
      toast.error(`Erro ao excluir: ${(e as Error).message}`);
    }
  };

  // Multi-seleção de Sessões para PDF Consolidado
  const toggleSelecionarSessao = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessoesSelecionadasIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelecionarTodas = () => {
    if (sessoesSelecionadasIds.length === sessoes.length) {
      setSessoesSelecionadasIds([]);
    } else {
      setSessoesSelecionadasIds(sessoes.map((s) => s.id));
    }
  };

  const handleExportarConsolidado = async () => {
    const sessoesParaExportar = sessoes.filter((s) =>
      sessoesSelecionadasIds.includes(s.id)
    );
    if (sessoesParaExportar.length === 0) {
      toast.error('Selecione ao menos uma sessão para exportar.');
      return;
    }

    try {
      await exportBriefingConsolidadoPdf(sessoesParaExportar);
      toast.success(`PDF consolidado com ${sessoesParaExportar.length} turmas gerado com sucesso!`);
    } catch (err: any) {
      toast.error('Erro ao gerar PDF consolidado: ' + (err.message || ''));
    }
  };

  // Estatísticas da sessão ativa
  const participantes = sessaoAtiva?.participantes || [];
  const totalAssinados = participantes.filter((p) => !!p.assinatura_digital).length;
  const todosAssinaram = participantes.length > 0 && totalAssinados === participantes.length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/portaria')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para o Painel da Portaria</span>
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                Lista de Presença — Briefing de Segurança
              </h1>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                FRM.SGP-0013 · Sessões geradas a partir das entradas e ocorrências da portaria
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {sessoesSelecionadasIds.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setSessoesSelecionadasIds([])}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                Limpar Seleção ({sessoesSelecionadasIds.length})
              </button>
              <button
                type="button"
                onClick={handleExportarConsolidado}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 active:scale-95 transition-all"
              >
                <Files className="h-4 w-4" />
                Exportar PDF Consolidado ({sessoesSelecionadasIds.length} turmas)
              </button>
            </>
          ) : (
            sessaoAtiva && (
              <button
                type="button"
                onClick={() => exportBriefingPdf(sessaoAtiva)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileDown className="h-4 w-4 text-slate-500" />
                Imprimir / PDF da Lista
              </button>
            )
          )}
        </div>
      </div>

      {/* Instant CPF Validator Box for Portaria */}
      <div className="rounded-2xl border border-slate-200 bg-linear-to-r from-blue-50/50 to-indigo-50/40 p-4 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/60">
        <form onSubmit={handleConsultarCpf} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 shrink-0">
            <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Consulta Rápida de Briefing por CPF:
          </div>
          <div className="relative flex-1 w-full">
            <input
              type="text"
              placeholder="Digite o CPF do visitante/terceirizado (somente números)..."
              value={cpfConsulta}
              onChange={(e) => {
                setCpfConsulta(e.target.value);
                setResultadoConsulta(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={consultandoCpf}
            className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 shrink-0"
          >
            {consultandoCpf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Verificar Validade'}
          </button>
        </form>

        {resultadoConsulta && resultadoConsulta !== 'NOT_FOUND' && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>
                <strong className="font-semibold">{resultadoConsulta.nome}</strong> ({resultadoConsulta.empresa}) — Briefing realizado em <strong>{resultadoConsulta.data}</strong> (Válido por {resultadoConsulta.validade_dias} dias).
              </span>
            </div>
            <span className="font-bold text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-200/60 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300">
              Briefing Ativo
            </span>
          </div>
        )}

        {resultadoConsulta === 'NOT_FOUND' && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span>Nenhum briefing ativo encontrado para este CPF. O visitante deve assistir ao vídeo e assinar a lista de presença.</span>
          </div>
        )}
      </div>

      {/* Main Grid: Left = Sessions / Right = Session Details & Attendance Sheet */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Sessions list */}
        <div className="space-y-3 lg:col-span-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelecionarTodas}
                className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                title={sessoesSelecionadasIds.length === sessoes.length ? 'Desmarcar todas' : 'Selecionar todas para PDF consolidado'}
              >
                {sessoesSelecionadasIds.length > 0 && sessoesSelecionadasIds.length === sessoes.length ? (
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Sessões Realizadas
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-400">{sessoes.length} turmas</span>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            </div>
          ) : sessoes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nenhuma sessão de briefing registrada. As sessões são criadas automaticamente ao lançar entradas com &quot;Fará Briefing&quot; no Livro de Ocorrências.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
              {sessoes.map((s) => {
                const isSelected = sessaoAtiva?.id === s.id;
                const isChecked = sessoesSelecionadasIds.includes(s.id);
                const parts = s.participantes || [];
                const ass = parts.filter((p) => !!p.assinatura_digital).length;
                const concl = parts.length > 0 && ass === parts.length;

                return (
                  <div
                    key={s.id}
                    onClick={() => setSessaoAtiva(s)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => toggleSelecionarSessao(s.id, e)}
                          className="mt-0.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                          title="Selecionar para exportação consolidada"
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                        <div>
                          <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                            {s.numero_protocolo}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {s.tema_treinamento}
                          </h4>
                        </div>
                      </div>
                      <StatusPortariaBadge status={concl ? 'CONCLUIDA' : s.status} />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pl-6.5">
                      <span>Data: {s.data.split('-').reverse().join('/')}</span>
                      <span className={`font-bold ${concl ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>
                        {ass} de {parts.length} assinados
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Attendance List for Active Session */}
        <div className="lg:col-span-8">
          {sessaoAtiva ? (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col">
              {/* Header Box */}
              <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        {sessaoAtiva.tema_treinamento} ({sessaoAtiva.tipo})
                      </h2>
                      <StatusPortariaBadge status={todosAssinaram ? 'CONCLUIDA' : sessaoAtiva.status} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Data: {sessaoAtiva.data.split('-').reverse().join('/')} · Instrutor: {sessaoAtiva.instrutor_responsavel} · Protocolo: {sessaoAtiva.numero_protocolo}
                    </p>
                    {sessaoAtiva.observacoes && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 italic mt-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        {sessaoAtiva.observacoes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setItemParaExcluir(sessaoAtiva)}
                      className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                      title="Excluir sessão de briefing"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    {todosAssinaram ? (
                      <CheckCheck className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-blue-600" />
                    )}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Status da Turma: {todosAssinaram ? 'Briefing Concluído (100% Assinado)' : `${totalAssinados} de ${participantes.length} assinaturas colhidas`}
                    </span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    todosAssinaram
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                  }`}>
                    {todosAssinaram ? 'Finalizada' : 'Pendente de Assinatura'}
                  </span>
                </div>

                {/* Programmatic Content & Term Accordion */}
                <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                  <div className="font-bold text-slate-900 dark:text-slate-100 mb-1">Conteúdo Programático:</div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-slate-600 dark:text-slate-400">
                    <li>Apresentação do Layout da Fábrica TEN - Vídeo institucional e vídeo de segurança;</li>
                    <li>Apresentação dos procedimentos e rotinas de segurança;</li>
                    <li>Protocolo de proibição do uso do celular nas áreas produtivas da TEN.</li>
                  </ol>
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 italic">
                    &quot;Declaro ter recebido as orientações de segurança aplicáveis à minha visita ou atividade, estar ciente das regras gerais de conduta da fábrica e portar as documentações e EPIs exigidos para a minha atuação.&quot;
                  </div>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Lista de Participantes ({ participantes.length })
                </h3>

                {participantes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-950/30">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Nenhum participante vinculado a esta sessão.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 bg-slate-50/75 font-bold uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                        <tr>
                          <th className="px-3.5 py-3">Nome / CPF</th>
                          <th className="px-3.5 py-3">Empresa</th>
                          <th className="px-3.5 py-3">Função</th>
                          <th className="px-3.5 py-3 text-center">Assinatura do Termo</th>
                          <th className="px-3.5 py-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {participantes.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="px-3.5 py-3 font-semibold text-slate-900 dark:text-slate-100">
                              <div>{p.nome}</div>
                              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                                CPF: {p.cpf}
                              </div>
                            </td>
                            <td className="px-3.5 py-3 text-slate-700 dark:text-slate-300">
                              {p.empresa}
                            </td>
                            <td className="px-3.5 py-3 text-slate-700 dark:text-slate-300">
                              {p.funcao || '-'}
                            </td>
                            <td className="px-3.5 py-3 text-center">
                              {p.assinatura_digital ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md dark:bg-emerald-950/50 dark:text-emerald-400">
                                    <Check className="h-3 w-3" /> Assinada
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setParticipanteParaAssinar(p);
                                      setModalAssinaturaAberto(true);
                                    }}
                                    className="text-[10px] text-blue-600 hover:underline dark:text-blue-400"
                                    title="Refazer assinatura"
                                  >
                                    (Alterar)
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setParticipanteParaAssinar(p);
                                    setModalAssinaturaAberto(true);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 shadow-2xs dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                >
                                  <PenTool className="h-3.5 w-3.5" />
                                  Coletar Assinatura
                                </button>
                              )}
                            </td>
                            <td className="px-3.5 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoverParticipante(p.id)}
                                className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                                title="Remover participante"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <ShieldCheck className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                Selecione uma Sessão de Briefing
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Selecione uma turma na lista ao lado para conferir a lista de presença e coletar as assinaturas.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Assinatura Canvas Modal */}
      <SignaturePadModal
        isOpen={modalAssinaturaAberto}
        onClose={() => {
          setModalAssinaturaAberto(false);
          setParticipanteParaAssinar(null);
        }}
        onSave={handleSalvarAssinaturaParticipante}
        title={`Assinatura: ${participanteParaAssinar?.nome || 'Participante'}`}
        subtitle="Termo de responsabilidade e ciência do Briefing de Segurança (FRM.SGP-0013)"
      />

      {/* Confirm Dialog Excluir */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Sessão de Briefing"
          mensagem={`Deseja realmente excluir a sessão de briefing ${itemParaExcluir.numero_protocolo}? Todos os participantes vinculados serão removidos.`}
          confirmarLabel="Sim, Excluir"
          variante="perigo"
          onConfirmar={handleExcluirSessao}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
    </div>
  );
}
