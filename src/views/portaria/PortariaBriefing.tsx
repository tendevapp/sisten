/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Lista de Presença — Briefing de Segurança" (FRM.SGP-0013).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, Search, FileDown, CheckCircle2,
  Trash2, X, Loader2, ShieldCheck, UserCheck, Calendar, User, Building,
  PenTool, Check, AlertCircle, Clock
} from 'lucide-react';
import type {
  Profile, PortBriefingSessao, PortBriefingParticipante,
  PortBriefingStatus, PortBriefingTipo
} from '../../types';
import * as api from '../../lib/portariaApi';
import { exportBriefingPdf } from '../../lib/pdfExport/exportPortariaPdf';
import StatusPortariaBadge from '../../components/portaria/StatusPortariaBadge';
import VigilanteSelect from '../../components/portaria/VigilanteSelect';
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

  // CPF Quick Check
  const [cpfConsulta, setCpfConsulta] = useState('');
  const [resultadoConsulta, setResultadoConsulta] = useState<PortBriefingParticipante | null | 'NOT_FOUND'>(null);
  const [consultandoCpf, setConsultandoCpf] = useState(false);

  // Modais
  const [modalNovaSessao, setModalNovaSessao] = useState(false);
  const [modalNovoParticipante, setModalNovoParticipante] = useState(false);
  const [modalAssinaturaAberto, setModalAssinaturaAberto] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<PortBriefingSessao | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Forms
  const [formSessao, setFormSessao] = useState({
    data: api.hojeISO(),
    tipo: 'INTERNO' as PortBriefingTipo,
    tema_treinamento: 'BRIEFING DE SEGURANÇA',
    instrutor_responsavel: user.name || '',
    observacoes: '',
  });

  const [formParticipante, setFormParticipante] = useState({
    data: api.hojeISO(),
    empresa: '',
    nome: '',
    cpf: '',
    funcao: '',
    assinatura_digital: '',
    validade_dias: 90,
  });

  const carregarSessoes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listarSessoesBriefing();
      setSessoes(data);
      if (sessaoAtiva) {
        const atualizada = data.find((s) => s.id === sessaoAtiva.id);
        if (atualizada) setSessaoAtiva(atualizada);
      }
    } catch (e) {
      toast.error(`Erro ao carregar sessões de briefing: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [sessaoAtiva, toast]);

  useEffect(() => {
    carregarSessoes();
  }, [carregarSessoes]);

  const handleCriarSessao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSessao.instrutor_responsavel.trim()) {
      toast.error('Informe o instrutor responsável.');
      return;
    }

    setSalvando(true);
    try {
      const nova = await api.criarSessaoBriefing({
        ...formSessao,
        criado_por: user.id,
      });
      toast.success('Sessão de Briefing criada!');
      setModalNovaSessao(false);
      setSessaoAtiva(nova);
      carregarSessoes();
    } catch (e) {
      toast.error(`Falha ao criar sessão: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleAdicionarParticipante = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessaoAtiva) return;
    if (!formParticipante.nome.trim() || !formParticipante.cpf.trim() || !formParticipante.empresa.trim()) {
      toast.error('Preencha Nome, CPF e Empresa do participante.');
      return;
    }

    setSalvando(true);
    try {
      await api.adicionarParticipanteBriefing(sessaoAtiva.id, formParticipante);
      toast.success('Participante adicionado à lista com sucesso!');
      setModalNovoParticipante(false);
      setFormParticipante({
        data: api.hojeISO(),
        empresa: '',
        nome: '',
        cpf: '',
        funcao: '',
        assinatura_digital: '',
        validade_dias: 90,
      });
      const sessaoAtualizada = await api.obterSessaoBriefing(sessaoAtiva.id);
      if (sessaoAtualizada) setSessaoAtiva(sessaoAtualizada);
      carregarSessoes();
    } catch (e) {
      toast.error(`Falha ao adicionar participante: ${(e as Error).message}`);
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
      carregarSessoes();
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
      setItemParaExcluir(null);
      carregarSessoes();
    } catch (e) {
      toast.error(`Erro ao excluir: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios')}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Formulários
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
                FRM.SGP-0013 · Integração & Termo de Responsabilidade TEN
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {sessaoAtiva && (
            <button
              type="button"
              onClick={() => exportBriefingPdf(sessaoAtiva)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileDown className="h-4 w-4 text-slate-500" />
              Imprimir / PDF da Lista
            </button>
          )}

          <button
            type="button"
            onClick={() => setModalNovaSessao(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Plus className="h-4 w-4" />
            Nova Sessão de Treinamento
          </button>
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
            <span>Nenhum briefing ativo encontrado para este CPF. O visitante deve assistir ao vídeo e assinar a lista de presença antes de entrar.</span>
          </div>
        )}
      </div>

      {/* Main Grid: Left = Sessions / Right = Session Details & Attendance Sheet */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Sessions list */}
        <div className="space-y-3 lg:col-span-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sessões Realizadas
            </h2>
            <span className="text-xs font-semibold text-slate-400">{sessoes.length} turmas</span>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            </div>
          ) : sessoes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma sessão de briefing registrada.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
              {sessoes.map((s) => {
                const isSelected = sessaoAtiva?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSessaoAtiva(s)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                          {s.numero_protocolo}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {s.tema_treinamento} ({s.tipo})
                        </h4>
                      </div>
                      <StatusPortariaBadge status={s.status} />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Data: {s.data}</span>
                      <span>{(s.participantes || []).length} presentes</span>
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
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {sessaoAtiva.tema_treinamento} ({sessaoAtiva.tipo})
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Data: {sessaoAtiva.data} · Instrutor: {sessaoAtiva.instrutor_responsavel} · Protocolo: {sessaoAtiva.numero_protocolo}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModalNovoParticipante(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 dark:bg-blue-500"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Presente
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemParaExcluir(sessaoAtiva)}
                      className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                      title="Excluir sessão"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
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
                  Lista de Participantes ({ (sessaoAtiva.participantes || []).length })
                </h3>

                {(sessaoAtiva.participantes || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-950/30">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Nenhum participante adicionado nesta sessão.
                    </p>
                    <button
                      type="button"
                      onClick={() => setModalNovoParticipante(true)}
                      className="mt-2 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      + Adicionar participante e colher assinatura
                    </button>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 bg-slate-50/75 font-bold uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                        <tr>
                          <th className="px-3.5 py-3">Nome / CPF</th>
                          <th className="px-3.5 py-3">Empresa</th>
                          <th className="px-3.5 py-3">Função</th>
                          <th className="px-3.5 py-3 text-center">Assinatura</th>
                          <th className="px-3.5 py-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(sessaoAtiva.participantes || []).map((p) => (
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
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md dark:bg-emerald-950/50 dark:text-emerald-400">
                                  <Check className="h-3 w-3" /> Assinada
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400">Presencial</span>
                              )}
                            </td>
                            <td className="px-3.5 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoverParticipante(p.id)}
                                className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                                title="Remover da lista"
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
                Selecione ou Crie uma Sessão de Briefing
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Selecione uma turma na lista ao lado ou clique em &quot;Nova Sessão de Treinamento&quot; para registrar presentes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Nova Sessão */}
      {modalNovaSessao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Nova Sessão de Briefing de Segurança
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Formulário FRM.SGP-0013</p>
              </div>
              <button
                type="button"
                onClick={() => setModalNovaSessao(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCriarSessao} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data da Sessão
                  </label>
                  <input
                    type="date"
                    value={formSessao.data}
                    onChange={(e) => setFormSessao({ ...formSessao, data: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Treinamento
                  </label>
                  <select
                    value={formSessao.tipo}
                    onChange={(e) => setFormSessao({ ...formSessao, tipo: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="INTERNO">Interno (Colaboradores)</option>
                    <option value="EXTERNO">Externo (Visitantes & Terceirizados)</option>
                  </select>
                </div>
              </div>

              <div>
                <VigilanteSelect
                  label="Instrutor / Técnico / Vigilante Responsável"
                  required
                  placeholder="Selecione ou digite o responsável..."
                  value={formSessao.instrutor_responsavel}
                  onChange={(val) => setFormSessao({ ...formSessao, instrutor_responsavel: val })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Turma da empresa terceirizada de manutenção"
                  value={formSessao.observacoes}
                  onChange={(e) => setFormSessao({ ...formSessao, observacoes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalNovaSessao(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 dark:bg-blue-500"
                >
                  {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Abrir Sessão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Participante */}
      {modalNovoParticipante && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Adicionar Participante ao Briefing
              </h3>
              <button
                type="button"
                onClick={() => setModalNovoParticipante(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdicionarParticipante} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nome do participante"
                  value={formParticipante.nome}
                  onChange={(e) => setFormParticipante({ ...formParticipante, nome: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    CPF (somente números) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="000.000.000-00"
                    value={formParticipante.cpf}
                    onChange={(e) => setFormParticipante({ ...formParticipante, cpf: e.target.value })}
                    className="w-full font-mono rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Andrade Gutierrez"
                    value={formParticipante.empresa}
                    onChange={(e) => setFormParticipante({ ...formParticipante, empresa: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Função / Cargo
                </label>
                <input
                  type="text"
                  placeholder="Ex: Técnico de Montagem / Eletricista"
                  value={formParticipante.funcao}
                  onChange={(e) => setFormParticipante({ ...formParticipante, funcao: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {/* Assinatura Digital do Participante */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Assinatura do Participante (Termo de Responsabilidade)
                </label>
                {formParticipante.assinatura_digital ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                        Assinatura digital capturada
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalAssinaturaAberto(true)}
                      className="text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Refazer
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setModalAssinaturaAberto(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  >
                    <PenTool className="h-4 w-4 text-slate-400" />
                    Coletar Assinatura do Participante
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalNovoParticipante(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 dark:bg-blue-500"
                >
                  {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar Participante
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assinatura Canvas Modal */}
      <SignaturePadModal
        isOpen={modalAssinaturaAberto}
        onClose={() => setModalAssinaturaAberto(false)}
        onSave={(dataUrl) => setFormParticipante({ ...formParticipante, assinatura_digital: dataUrl })}
        title={`Assinatura: ${formParticipante.nome || 'Participante'}`}
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
