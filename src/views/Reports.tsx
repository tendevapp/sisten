/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Geral > Relatórios do Sistema.
 *
 * Exibe o painel consolidado de Faturamento GW Jacobina (Wallboard de parede/TV),
 * com acesso liberado universalmente para visualização de faturamento e avanço de torres.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import type { FinFatGwjaco } from '../types';
import * as api from '../lib/finFaturamentoGwjacoApi';
import FinFaturamentoWallboard from './financeiro/FinFaturamentoWallboard';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

interface ReportsProps {
  user: any;
}

const TRAMOS = ['T1', 'T2', 'T3', 'T4', 'T5'] as const;

export default function Reports({ user }: ReportsProps) {
  const toast = useToast();
  const [linhas, setLinhas] = useState<FinFatGwjaco[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<FinFatGwjaco | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({
    torre_numero: '',
    tramo: 'T1',
    codigo_cliente: '',
    part_number: '',
    projeto_codigo: '',
    nota_fiscal: '',
    data_faturado: '',
    semana_faturamento: '',
    data_expedido: '',
    data_tramos_previstos: '',
    restricao: false,
    observacao: '',
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setLinhas(await api.listarFaturamentoGwjaco());
    } catch (err: any) {
      toast.error('Erro ao carregar o faturamento: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirEdicao = (row: FinFatGwjaco) => {
    setEditando(row);
    setForm({
      torre_numero: String(row.torre_numero),
      tramo: row.tramo,
      codigo_cliente: row.codigo_cliente ?? '',
      part_number: row.part_number ?? '',
      projeto_codigo: row.projeto_codigo ?? '',
      nota_fiscal: row.nota_fiscal ?? '',
      data_faturado: row.data_faturado ?? '',
      semana_faturamento: row.semana_faturamento != null ? String(row.semana_faturamento) : '',
      data_expedido: row.data_expedido ?? '',
      data_tramos_previstos: row.data_tramos_previstos ?? '',
      restricao: Boolean(row.restricao),
      observacao: row.observacao ?? '',
    });
    setModalAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const torreNum = Number(form.torre_numero);
    if (!torreNum || torreNum < 1) {
      toast.warning('Informe o número da torre.');
      return;
    }

    const base = {
      codigo_cliente: form.codigo_cliente.trim() || null,
      part_number: form.part_number.trim() || null,
      projeto_codigo: form.projeto_codigo.trim() || null,
      nota_fiscal: form.nota_fiscal.trim() || null,
      data_faturado: form.data_faturado || null,
      semana_faturamento: form.semana_faturamento ? Number(form.semana_faturamento) : null,
      data_expedido: form.data_expedido || null,
      data_tramos_previstos: form.data_tramos_previstos || null,
      restricao: form.restricao,
      observacao: form.observacao.trim() || null,
    };

    setSalvando(true);
    try {
      const patch: api.FinFatPatch = { torre_numero: torreNum, tramo: form.tramo, ...base };
      const res = await api.editarLancamentoFaturamento(editando.id, patch, {
        id: user?.id,
        nome: user?.name || user?.email || 'Usuário',
      });
      toast.success(res.alteracoes > 0 ? `Lançamento atualizado (${res.alteracoes} campo(s)).` : 'Nada mudou.');
      setModalAberto(false);
      await carregar();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-12 text-left py-4">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl flex items-center gap-2 dark:text-slate-50">
          <BarChart3 className="h-6 w-6 text-emerald-600" /> Relatórios do Sistema
        </h1>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Acompanhamento consolidado de faturamento e avanço de torres e tramos (GW Jacobina).
        </p>
      </div>

      {/* Relatório Faturamento GW Jacobina (Wallboard) */}
      <div className="space-y-3">
        {loading && linhas.length === 0 ? (
          <div className="flex h-96 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Carregando relatório de faturamento...
              </p>
            </div>
          </div>
        ) : (
          <FinFaturamentoWallboard
            linhas={linhas}
            onAtualizar={carregar}
            carregando={loading}
            modoInicial="sequencial"
            onEditarLinha={abrirEdicao}
          />
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Painel desenhado para TV: use o botão de tela cheia no canto do painel. Ele se atualiza
          sozinho a cada 2 minutos e segue o tema do app (para a TV, deixe no tema escuro).
        </p>
      </div>

      {/* Modal de Edição de Tramo */}
      {modalAberto && editando && (
        <Modal
          onClose={() => setModalAberto(false)}
          maxWidth="max-w-2xl"
          ariaLabel="Editar Lançamento de Faturamento"
        >
          <ModalHeader onClose={() => setModalAberto(false)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Editar Torre {editando.torre_numero} / {editando.tramo}
            </h3>
          </ModalHeader>
          <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col">
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Torre *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    disabled
                    value={form.torre_numero}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none disabled:opacity-60 sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Tramo *</label>
                  <select
                    required
                    disabled
                    value={form.tramo}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 disabled:opacity-60 sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {TRAMOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Código de Cliente</label>
                <input
                  type="text"
                  placeholder="Ex: S1 SEC GW5S120M"
                  value={form.codigo_cliente}
                  onChange={(e) => setForm((f) => ({ ...f, codigo_cliente: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Part Number</label>
                <input
                  type="text"
                  value={form.part_number}
                  onChange={(e) => setForm((f) => ({ ...f, part_number: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Nº Nota Fiscal</label>
                <input
                  type="text"
                  value={form.nota_fiscal}
                  onChange={(e) => setForm((f) => ({ ...f, nota_fiscal: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Faturado (data)</label>
                  <input
                    type="date"
                    value={form.data_faturado}
                    onChange={(e) => setForm((f) => ({ ...f, data_faturado: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Semana (faturamento)</label>
                  <input
                    type="number"
                    min={1}
                    max={53}
                    value={form.semana_faturamento}
                    onChange={(e) => setForm((f) => ({ ...f, semana_faturamento: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Expedido (data)</label>
                  <input
                    type="date"
                    value={form.data_expedido}
                    onChange={(e) => setForm((f) => ({ ...f, data_expedido: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Tramos Previstos (data)</label>
                  <input
                    type="date"
                    value={form.data_tramos_previstos}
                    onChange={(e) => setForm((f) => ({ ...f, data_tramos_previstos: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <label
                htmlFor="reportsFatRestricao"
                className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <input
                  type="checkbox"
                  id="reportsFatRestricao"
                  checked={form.restricao}
                  onChange={(e) => setForm((f) => ({ ...f, restricao: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                <span>
                  <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tramo com restrição
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                    Marca o tramo travado. No relatório ele aparece em laranja em vez de azul.
                  </span>
                </span>
              </label>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Projeto</label>
                <input
                  type="text"
                  placeholder="Ex: GW5S120M-001"
                  value={form.projeto_codigo}
                  onChange={(e) => setForm((f) => ({ ...f, projeto_codigo: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Observação</label>
                <textarea
                  rows={2}
                  value={form.observacao}
                  onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </div>
  );
}
