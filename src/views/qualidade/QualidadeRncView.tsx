/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Qualidade — Gestão de RNC (Relatório de Não Conformidade), FRM.QUA-0026.
 * Abas: Nova RNC (formulário de abertura), Histórico (listagem, seleção
 * múltipla e relatório consolidado em PDF) e Planos de Ação (atividades de
 * todas as RNCs em aberto, agregadas por prazo).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, PlusCircle, List, Search, ClipboardCheck, FileDown, CheckSquare,
  Square, Target, AlertTriangle, Clock, ChevronRight,
} from 'lucide-react';
import type { Profile, QuaRnc, QuaRncFiltros, QuaRncMetricas } from '../../types';
import * as api from '../../lib/qualidadeApi';
import QualidadeRncForm from '../../components/qualidade/QualidadeRncForm';
import QualidadeRncDetalhesModal from '../../components/qualidade/QualidadeRncDetalhesModal';
import QualidadeRelatorioSelecaoModal from '../../components/qualidade/QualidadeRelatorioSelecaoModal';
import { MostrarExcluidosToggle, BadgeExcluido, classeLinhaExcluida } from '../../components/ui/ExcluidosControls';
import { useToast } from '../../components/ui/Toast';

interface QualidadeRncViewProps {
  user: Profile;
  onNavigate: (path: string) => void;
  abaInicial?: 'novo' | 'historico' | 'plano_acao';
}

const STATUS_LABEL: Record<QuaRnc['status'], string> = {
  ABERTA: 'Aberta',
  EM_TRATAMENTO: 'Em Tratamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const STATUS_COR: Record<QuaRnc['status'], string> = {
  ABERTA: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
  EM_TRATAMENTO: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300',
  CONCLUIDA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300',
  CANCELADA: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function formatDataBR(iso?: string | null): string {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function QualidadeRncView({ user, onNavigate, abaInicial = 'novo' }: QualidadeRncViewProps) {
  const toast = useToast();
  const [aba, setAba] = useState<'novo' | 'historico' | 'plano_acao'>(abaInicial);

  const [rncs, setRncs] = useState<QuaRnc[]>([]);
  const [metricas, setMetricas] = useState<QuaRncMetricas | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [incluirExcluidos, setIncluirExcluidos] = useState(false);

  const [filtros, setFiltros] = useState<QuaRncFiltros>({ termo: '', status: 'TODOS' });
  const [rncSelecionada, setRncSelecionada] = useState<QuaRnc | null>(null);

  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [modalRelatorio, setModalRelatorio] = useState(false);

  const ehAdmin = user.roles.includes('admin');

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, mets] = await Promise.all([
        api.listarRncs(filtros, incluirExcluidos),
        api.obterMetricasRnc(),
      ]);
      setRncs(lista);
      setMetricas(mets);
    } catch (err: any) {
      toast.error(`Erro ao carregar RNCs: ${err.message || ''}`);
    } finally {
      setCarregando(false);
    }
  }, [filtros, incluirExcluidos, toast]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    setAba(abaInicial);
  }, [abaInicial]);

  const toggleSelecao = (id: string) => {
    setSelecionadas((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const handleExcluir = async (id: string) => {
    try {
      await api.excluirRnc(id, user.id);
      setRncSelecionada(null);
      carregarDados();
      toast.undo('RNC excluída com sucesso.', async () => {
        try {
          await api.restaurarRnc(id);
          carregarDados();
          toast.success('RNC restaurada com sucesso.');
        } catch (err: any) {
          toast.error(`Erro ao desfazer exclusão: ${err.message || ''}`);
        }
      });
    } catch (err: any) {
      toast.error(`Erro ao excluir RNC: ${err.message || ''}`);
    }
  };

  const handleRestaurar = async (id: string) => {
    try {
      await api.restaurarRnc(id);
      setRncSelecionada(null);
      toast.success('RNC restaurada com sucesso.');
      carregarDados();
    } catch (err: any) {
      toast.error(`Erro ao restaurar RNC: ${err.message || ''}`);
    }
  };

  // Atividades de plano de ação de todas as RNCs em aberto/tratamento, para a aba agregada.
  const atividadesAgregadas = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return rncs
      .filter((r) => !r.excluido_em && (r.status === 'ABERTA' || r.status === 'EM_TRATAMENTO'))
      .flatMap((rnc) =>
        (rnc.plano_acao || [])
          .filter((a) => a.status !== 'CONCLUIDA')
          .map((a) => ({
            rnc,
            atividade: a,
            atrasada: !!a.quando_fim && a.quando_fim < hoje,
          }))
      )
      .sort((a, b) => (a.atividade.quando_fim || '9999').localeCompare(b.atividade.quando_fim || '9999'));
  }, [rncs]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/qualidade')}
            className="group mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Voltar para o Módulo de Qualidade
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
              <ClipboardCheck className="h-3.5 w-3.5" />
              FRM.QUA-0026
            </span>
            <span className="text-xs text-slate-400">• Módulo de Qualidade</span>
          </div>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Gestão de RNC — Relatório de Não Conformidade
          </h1>
        </div>

        <div className="flex rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800/80 shadow-inner self-start sm:self-center">
          <button
            type="button"
            onClick={() => setAba('novo')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              aba === 'novo'
                ? 'bg-white text-rose-700 shadow-sm dark:bg-slate-900 dark:text-rose-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            Nova RNC
          </button>
          <button
            type="button"
            onClick={() => setAba('historico')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              aba === 'historico'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <List className="h-4 w-4" />
            Histórico ({metricas?.total || 0})
          </button>
          <button
            type="button"
            onClick={() => setAba('plano_acao')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              aba === 'plano_acao'
                ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Target className="h-4 w-4" />
            Planos de Ação ({atividadesAgregadas.length})
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total de RNCs</span>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">{metricas?.total || 0}</p>
        </div>
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/20">
          <span className="text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">Abertas</span>
          <p className="mt-1 font-display text-2xl font-bold text-amber-600 dark:text-amber-400">{metricas?.abertas || 0}</p>
        </div>
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 shadow-2xs dark:border-blue-900/40 dark:bg-blue-950/20">
          <span className="text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">Em Tratamento</span>
          <p className="mt-1 font-display text-2xl font-bold text-blue-600 dark:text-blue-400">{metricas?.emTratamento || 0}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <span className="text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">Concluídas</span>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metricas?.concluidas || 0}</p>
        </div>
        <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/20">
          <span className="text-rose-700 dark:text-rose-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Atividades Atrasadas
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-rose-600 dark:text-rose-400">{metricas?.atividadesAtrasadas || 0}</p>
        </div>
      </div>

      {/* Aba: Nova RNC */}
      {aba === 'novo' && (
        <QualidadeRncForm
          user={user}
          onSuccess={() => {
            carregarDados();
            setAba('historico');
          }}
        />
      )}

      {/* Aba: Histórico */}
      {aba === 'historico' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, fornecedor, projeto ou descrição..."
                  value={filtros.termo || ''}
                  onChange={(e) => setFiltros((prev) => ({ ...prev, termo: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>

              <select
                value={filtros.status || 'TODOS'}
                onChange={(e) => setFiltros((prev) => ({ ...prev, status: e.target.value as any }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="ABERTA">Aberta</option>
                <option value="EM_TRATAMENTO">Em Tratamento</option>
                <option value="CONCLUIDA">Concluída</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <MostrarExcluidosToggle visivel={ehAdmin} checked={incluirExcluidos} onChange={setIncluirExcluidos} />

              <button
                type="button"
                onClick={() => {
                  setModoSelecao((v) => !v);
                  setSelecionadas(new Set());
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  modoSelecao
                    ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                }`}
              >
                {modoSelecao ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {modoSelecao ? `${selecionadas.size} selecionada(s)` : 'Selecionar para relatório'}
              </button>

              {modoSelecao && selecionadas.size > 0 && (
                <button
                  type="button"
                  onClick={() => setModalRelatorio(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-500"
                >
                  <FileDown className="h-4 w-4" />
                  Gerar Relatório
                </button>
              )}
            </div>
          </div>

          {carregando ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Carregando registros de RNC...
            </div>
          ) : rncs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <ClipboardCheck className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Nenhuma RNC encontrada</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Não foram localizadas RNCs com os filtros aplicados. Registre uma nova RNC para iniciar o controle.
              </p>
              <button
                type="button"
                onClick={() => setAba('novo')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-500"
              >
                <PlusCircle className="h-4 w-4" />
                Registrar Nova RNC
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rncs.map((rnc) => {
                const atividadesAbertas = (rnc.plano_acao || []).filter((a) => a.status !== 'CONCLUIDA').length;
                return (
                  <div
                    key={rnc.id}
                    onClick={() => (modoSelecao ? toggleSelecao(rnc.id) : setRncSelecionada(rnc))}
                    className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs hover:border-rose-500/40 hover:shadow-md transition-all cursor-pointer dark:border-slate-800 dark:bg-slate-900 ${classeLinhaExcluida(rnc.excluido_em)}`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-1.5">
                          {modoSelecao && (
                            selecionadas.has(rnc.id)
                              ? <CheckSquare className="h-4 w-4 text-rose-600 shrink-0" />
                              : <Square className="h-4 w-4 text-slate-300 shrink-0" />
                          )}
                          <span className="font-mono text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md dark:bg-rose-950/60 dark:text-rose-300">
                            {rnc.numero_registro}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {rnc.excluido_em && <BadgeExcluido em={rnc.excluido_em} />}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COR[rnc.status]}`}>
                            {STATUS_LABEL[rnc.status]}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                        {rnc.descricao}
                      </p>

                      <div className="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <div>
                          Fornecedor: <strong className="text-slate-700 dark:text-slate-300">{rnc.fornecedor || '-'}</strong>
                        </div>
                        {rnc.projeto && (
                          <div>
                            Projeto: <strong className="text-slate-700 dark:text-slate-300">{rnc.projeto}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
                      <span>{formatDataBR(rnc.data_emissao)}</span>
                      <div className="flex items-center gap-2">
                        {atividadesAbertas > 0 && (
                          <span className="flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                            <Target className="h-3 w-3" />
                            {atividadesAbertas}
                          </span>
                        )}
                        {rnc.anexos.length > 0 && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {rnc.anexos.length} anexo(s)
                          </span>
                        )}
                        {!modoSelecao && <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aba: Planos de Ação agregados */}
      {aba === 'plano_acao' && (
        <div className="space-y-3">
          {atividadesAgregadas.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-2">
              <Target className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Nenhuma atividade pendente
              </h3>
              <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
                Todas as atividades dos planos de ação das RNCs em aberto estão concluídas, ou nenhuma RNC ainda tem plano de ação cadastrado.
              </p>
            </div>
          ) : (
            atividadesAgregadas.map(({ rnc, atividade, atrasada }) => (
              <div
                key={atividade.id}
                onClick={() => setRncSelecionada(rnc)}
                className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-md transition-all dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded dark:bg-rose-950/60 dark:text-rose-300">
                      {rnc.numero_registro}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                        atrasada
                          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                          : atividade.status === 'EM_ANDAMENTO'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {atrasada ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {atrasada ? 'Atrasada' : atividade.status === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Pendente'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{atividade.o_que}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Responsável: <strong>{atividade.quem_nome || '-'}</strong> · Prazo: {formatDataBR(atividade.quando_fim)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal de Detalhes */}
      {rncSelecionada && (
        <QualidadeRncDetalhesModal
          rnc={rncSelecionada}
          user={user}
          onClose={() => setRncSelecionada(null)}
          onDelete={handleExcluir}
          onRestore={handleRestaurar}
          onAtualizado={(atualizado) => {
            setRncSelecionada(atualizado);
            setRncs((prev) => prev.map((r) => (r.id === atualizado.id ? atualizado : r)));
            api.obterMetricasRnc().then(setMetricas).catch(() => {});
          }}
        />
      )}

      {/* Modal de Relatório Consolidado */}
      {modalRelatorio && (
        <QualidadeRelatorioSelecaoModal
          rncsDisponiveis={rncs}
          selecaoInicial={Array.from(selecionadas)}
          onClose={() => {
            setModalRelatorio(false);
            setModoSelecao(false);
            setSelecionadas(new Set());
          }}
        />
      )}
    </div>
  );
}
