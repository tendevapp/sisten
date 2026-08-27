/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Relatório de Portaria & Ocorrências" (FRM.SGP-0010).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, Search, FileDown, CheckCircle2,
  Trash2, X, Loader2, ClipboardList, Shield, Clock, AlertTriangle, Info,
  AlertOctagon, Check, MessageSquare
} from 'lucide-react';
import type {
  Profile, PortRelatorioPortaria, PortRelatorioOcorrencia,
  PortRelatorioStatus, PortTurno, PortLocalSetor, PortSeveridade
} from '../../types';
import * as api from '../../lib/portariaApi';
import { exportRelatorioPortariaPdf } from '../../lib/pdfExport/exportPortariaPdf';
import StatusPortariaBadge from '../../components/portaria/StatusPortariaBadge';
import VigilanteSelect from '../../components/portaria/VigilanteSelect';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const SETORES: { id: PortLocalSetor; label: string }[] = [
  { id: 'PORTARIA', label: 'Portaria Geral' },
  { id: 'RONDA_01', label: 'Ronda 01 (Perímetro Fábrica)' },
  { id: 'RONDA_02', label: 'Ronda 02 (Pátios & Tramos)' },
  { id: 'PATIO_CHAPAS', label: 'Pátio de Chapas' },
  { id: 'PATIO_TRAMOS', label: 'Pátio de Tramos' },
  { id: 'FABRICA', label: 'Área Produtiva' },
  { id: 'OUTRO', label: 'Outro Local' },
];

export default function PortariaRelatorio({ user, onNavigate }: Props) {
  const toast = useToast();
  const [relatorios, setRelatorios] = useState<PortRelatorioPortaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [relatorioAtivo, setRelatorioAtivo] = useState<PortRelatorioPortaria | null>(null);

  // Modais
  const [modalNovoRelatorio, setModalNovoRelatorio] = useState(false);
  const [modalNovaOcorrencia, setModalNovaOcorrencia] = useState(false);
  const [modalEncerrar, setModalEncerrar] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<PortRelatorioPortaria | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Forms
  const [formRelatorio, setFormRelatorio] = useState({
    data: api.hojeISO(),
    turno: api.sugerirTurno(),
    horario_inicio: '06:00',
    horario_fim: '18:00',
    vigilante_principal: user.name || '',
    vigilante_ronda01: '',
    vigilante_ronda02: '',
    observacoes_gerais: '',
  });

  const [formOcorrencia, setFormOcorrencia] = useState<{
    horario: string;
    local_setor: PortLocalSetor;
    descricao: string;
    severidade: PortSeveridade;
    vigilante: string;
  }>({
    horario: api.horaAgora(),
    local_setor: 'PORTARIA',
    descricao: '',
    severidade: 'INFO',
    vigilante: user.name || '',
  });

  const [obsEncerramento, setObsEncerramento] = useState('');

  const carregarRelatorios = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listarRelatorios();
      setRelatorios(data);
      if (relatorioAtivo) {
        const atualizado = data.find((r) => r.id === relatorioAtivo.id);
        if (atualizado) setRelatorioAtivo(atualizado);
      }
    } catch (e) {
      toast.error(`Erro ao carregar relatórios: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [relatorioAtivo, toast]);

  useEffect(() => {
    carregarRelatorios();
  }, [carregarRelatorios]);

  const handleCriarRelatorio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRelatorio.vigilante_principal.trim()) {
      toast.error('Informe o vigilante principal da portaria.');
      return;
    }

    setSalvando(true);
    try {
      const novo = await api.criarRelatorio({
        ...formRelatorio,
        criado_por: user.id,
      });
      toast.success('Livro de plantão / Relatório de portaria aberto!');
      setModalNovoRelatorio(false);
      setRelatorioAtivo(novo);
      carregarRelatorios();
    } catch (e) {
      toast.error(`Falha ao abrir relatório: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleAdicionarOcorrencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relatorioAtivo || !formOcorrencia.descricao.trim()) {
      toast.error('Informe a descrição da ocorrência.');
      return;
    }

    setSalvando(true);
    try {
      await api.adicionarOcorrencia(relatorioAtivo.id, formOcorrencia);
      toast.success('Ocorrência registrada com sucesso!');
      setModalNovaOcorrencia(false);
      setFormOcorrencia({
        horario: api.horaAgora(),
        local_setor: 'PORTARIA',
        descricao: '',
        severidade: 'INFO',
        vigilante: user.name || '',
      });
      // Recarrega relatório ativo
      const relAtualizado = await api.obterRelatorio(relatorioAtivo.id);
      if (relAtualizado) setRelatorioAtivo(relAtualizado);
      carregarRelatorios();
    } catch (e) {
      toast.error(`Falha ao adicionar ocorrência: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirOcorrencia = async (ocorrenciaId: string) => {
    if (!relatorioAtivo) return;
    try {
      await api.excluirOcorrencia(ocorrenciaId);
      toast.success('Ocorrência removida.');
      const relAtualizado = await api.obterRelatorio(relatorioAtivo.id);
      if (relAtualizado) setRelatorioAtivo(relAtualizado);
      carregarRelatorios();
    } catch (e) {
      toast.error(`Erro ao excluir ocorrência: ${(e as Error).message}`);
    }
  };

  const handleEncerrarPlantao = async () => {
    if (!relatorioAtivo) return;
    setSalvando(true);
    try {
      await api.encerrarRelatorio(relatorioAtivo.id, obsEncerramento);
      toast.success('Plantão encerrado e relatório concluído!');
      setModalEncerrar(false);
      const relAtualizado = await api.obterRelatorio(relatorioAtivo.id);
      if (relAtualizado) setRelatorioAtivo(relAtualizado);
      carregarRelatorios();
    } catch (e) {
      toast.error(`Falha ao encerrar plantão: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirRelatorio = async () => {
    if (!itemParaExcluir) return;
    try {
      await api.excluirRelatorio(itemParaExcluir.id);
      toast.success('Relatório de plantão excluído.');
      if (relatorioAtivo?.id === itemParaExcluir.id) setRelatorioAtivo(null);
      setItemParaExcluir(null);
      carregarRelatorios();
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
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                Relatório de Portaria & Ocorrências
              </h1>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                FRM.SGP-0010 · Livro de Plantão & Rondas TEN
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {relatorioAtivo && (
            <button
              type="button"
              onClick={() => exportRelatorioPortariaPdf(relatorioAtivo)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileDown className="h-4 w-4 text-slate-500" />
              Exportar Plantão (PDF)
            </button>
          )}

          <button
            type="button"
            onClick={() => setModalNovoRelatorio(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Plus className="h-4 w-4" />
            Abrir Novo Plantão
          </button>
        </div>
      </div>

      {/* Main Grid: Left = List of Shifts / Right = Shift Details & Occurrence Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Shifts */}
        <div className="space-y-3 lg:col-span-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Plantões Registrados
            </h2>
            <span className="text-xs font-semibold text-slate-400">{relatorios.length} plantões</span>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            </div>
          ) : relatorios.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum plantão registrado ainda.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
              {relatorios.map((rel) => {
                const isSelected = relatorioAtivo?.id === rel.id;
                return (
                  <div
                    key={rel.id}
                    onClick={() => setRelatorioAtivo(rel)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                          {rel.numero_protocolo}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {rel.data} · Turno {rel.turno}
                        </h4>
                      </div>
                      <StatusPortariaBadge status={rel.status} />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Vig: {rel.vigilante_principal}</span>
                      <span>{(rel.ocorrencias || []).length} ocorrências</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Selected Shift Timeline & Ocorrências */}
        <div className="lg:col-span-8">
          {relatorioAtivo ? (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col">
              {/* Shift Header Bar */}
              <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Plantão {relatorioAtivo.data} — Turno {relatorioAtivo.turno}
                      </h2>
                      <StatusPortariaBadge status={relatorioAtivo.status} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Horário: {relatorioAtivo.horario_inicio} às {relatorioAtivo.horario_fim} · Vigilante: {relatorioAtivo.vigilante_principal}
                      {relatorioAtivo.vigilante_ronda01 && ` · Ronda 01: ${relatorioAtivo.vigilante_ronda01}`}
                      {relatorioAtivo.vigilante_ronda02 && ` · Ronda 02: ${relatorioAtivo.vigilante_ronda02}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {relatorioAtivo.status === 'EM_ANDAMENTO' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setModalNovaOcorrencia(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 dark:bg-blue-500"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Lançar Ocorrência
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalEncerrar(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Encerrar Plantão
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setItemParaExcluir(relatorioAtivo)}
                      className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                      title="Excluir plantão"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Occurrences Timeline */}
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Linha do Tempo de Ocorrências & Rondas
                  </h3>
                </div>

                {(relatorioAtivo.ocorrencias || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-950/30">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Nenhuma ocorrência registrada neste plantão.
                    </p>
                    {relatorioAtivo.status === 'EM_ANDAMENTO' && (
                      <button
                        type="button"
                        onClick={() => setModalNovaOcorrencia(true)}
                        className="mt-2 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        + Adicionar primeira ocorrência ou ronda
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-200 pl-4 ml-3 space-y-4 dark:border-slate-800">
                    {(relatorioAtivo.ocorrencias || []).map((oc) => {
                      const isAlerta = oc.severidade === 'ALERTA';
                      const isGrave = oc.severidade === 'GRAVE';
                      return (
                        <div key={oc.id} className="relative group">
                          {/* Dot on line */}
                          <div
                            className={`absolute -left-[23px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                              isGrave ? 'bg-rose-500' : isAlerta ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                          />

                          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-slate-400" />
                                  {oc.horario}
                                </span>
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {SETORES.find(s => s.id === oc.local_setor)?.label || oc.local_setor}
                                </span>
                                {isGrave && (
                                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400">
                                    Grave
                                  </span>
                                )}
                                {isAlerta && (
                                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                    Alerta
                                  </span>
                                )}
                              </div>

                              {relatorioAtivo.status === 'EM_ANDAMENTO' && (
                                <button
                                  type="button"
                                  onClick={() => handleExcluirOcorrencia(oc.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500"
                                  title="Remover ocorrência"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            <p className="mt-1.5 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                              {oc.descricao}
                            </p>

                            <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                              Registrado por: {oc.vigilante}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* General Observations if closed */}
                {relatorioAtivo.observacoes_gerais && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Observações de Fechamento / Passagem de Turno:
                    </h4>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                      {relatorioAtivo.observacoes_gerais}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <ClipboardList className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                Selecione ou Abra um Plantão
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Selecione um plantão na lista ao lado para visualizar a linha do tempo ou clique no botão &quot;Abrir Novo Plantão&quot;.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Novo Plantão */}
      {modalNovoRelatorio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Abrir Novo Plantão / Livro de Portaria
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Formulário FRM.SGP-0010</p>
              </div>
              <button
                type="button"
                onClick={() => setModalNovoRelatorio(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCriarRelatorio} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data do Plantão
                  </label>
                  <input
                    type="date"
                    value={formRelatorio.data}
                    onChange={(e) => setFormRelatorio({ ...formRelatorio, data: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Turno *
                  </label>
                  <select
                    value={formRelatorio.turno}
                    onChange={(e) => setFormRelatorio({ ...formRelatorio, turno: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="MANHA">Manhã (06:00 às 18:00)</option>
                    <option value="TARDE">Tarde</option>
                    <option value="NOITE">Noite (18:00 às 06:00)</option>
                    <option value="TURNO_A">Turno A</option>
                    <option value="TURNO_B">Turno B</option>
                    <option value="TURNO_C">Turno C</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário Início
                  </label>
                  <input
                    type="time"
                    value={formRelatorio.horario_inicio}
                    onChange={(e) => setFormRelatorio({ ...formRelatorio, horario_inicio: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário Fim
                  </label>
                  <input
                    type="time"
                    value={formRelatorio.horario_fim}
                    onChange={(e) => setFormRelatorio({ ...formRelatorio, horario_fim: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <VigilanteSelect
                  label="Vigilante Responsável (Portaria)"
                  required
                  value={formRelatorio.vigilante_principal}
                  onChange={(val) => setFormRelatorio({ ...formRelatorio, vigilante_principal: val })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <VigilanteSelect
                    label="Vigilante Ronda 01 (Opcional)"
                    placeholder="Selecione ou digite o vigilante de ronda..."
                    value={formRelatorio.vigilante_ronda01}
                    onChange={(val) => setFormRelatorio({ ...formRelatorio, vigilante_ronda01: val })}
                  />
                </div>
                <div>
                  <VigilanteSelect
                    label="Vigilante Ronda 02 (Opcional)"
                    placeholder="Selecione ou digite o vigilante de ronda..."
                    value={formRelatorio.vigilante_ronda02}
                    onChange={(val) => setFormRelatorio({ ...formRelatorio, vigilante_ronda02: val })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalNovoRelatorio(false)}
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
                  Iniciar Plantão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nova Ocorrência */}
      {modalNovaOcorrencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Lançar Registro / Ocorrência no Plantão
              </h3>
              <button
                type="button"
                onClick={() => setModalNovaOcorrencia(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdicionarOcorrencia} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário *
                  </label>
                  <input
                    type="time"
                    required
                    value={formOcorrencia.horario}
                    onChange={(e) => setFormOcorrencia({ ...formOcorrencia, horario: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Severidade
                  </label>
                  <select
                    value={formOcorrencia.severidade}
                    onChange={(e) => setFormOcorrencia({ ...formOcorrencia, severidade: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="INFO">Informativo / Ronda Normal</option>
                    <option value="ALERTA">Alerta / Atenção</option>
                    <option value="GRAVE">Ocorrência Grave / Incidente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Local / Posto *
                </label>
                <select
                  value={formOcorrencia.local_setor}
                  onChange={(e) => setFormOcorrencia({ ...formOcorrencia, local_setor: e.target.value as any })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {SETORES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição Minuciosa da Ocorrência *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Descreva o que foi observado, status da ronda, pessoas envolvidas ou ações tomadas."
                  value={formOcorrencia.descricao}
                  onChange={(e) => setFormOcorrencia({ ...formOcorrencia, descricao: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <VigilanteSelect
                  label="Vigilante que Registrou"
                  required
                  value={formOcorrencia.vigilante}
                  onChange={(val) => setFormOcorrencia({ ...formOcorrencia, vigilante: val })}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalNovaOcorrencia(false)}
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
                  Salvar Ocorrência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Encerrar Plantão */}
      {modalEncerrar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Encerrar Plantão e Passagem de Turno
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Ao encerrar, o relatório será finalizado como concluído e ficará disponível para conferência e auditoria.
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações de Passagem de Turno (Opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Turno passado para a equipe da noite sem pendências no pátio."
                  value={obsEncerramento}
                  onChange={(e) => setObsEncerramento(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalEncerrar(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleEncerrarPlantao}
                  disabled={salvando}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-700"
                >
                  {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar Encerramento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog Excluir */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Relatório de Plantão"
          mensagem={`Deseja excluir o relatório de plantão ${itemParaExcluir.numero_protocolo} (${itemParaExcluir.data} - Turno ${itemParaExcluir.turno})?`}
          confirmarLabel="Sim, Excluir"
          variante="perigo"
          onConfirmar={handleExcluirRelatorio}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
    </div>
  );
}
