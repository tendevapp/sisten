/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Faturamento GW Jacobina.
 *
 * Duas janelas: "Dados" (esta tela — cadastro de torre/tramo, lançamento de
 * faturamento e log de alteração) e "Relatório" (painel consolidado, a fazer
 * depois — fica como aba desabilitada "Em breve").
 *
 * Mesma chave torre+tramo de `proj_tramos_gwjaco` (Almoxarifado > Projetos),
 * mas lançada em tabela própria do Financeiro (`fin_fat_gwjaco`), para não
 * misturar o fluxo de fabricação com o de faturamento.
 *
 * Edição livre para quem tem acesso à página — foge do padrão autor-ou-admin
 * dos demais formulários de propósito (ver `20260911180000_fin_fat_edicao_livre.sql`):
 * o time de Faturamento é pequeno e lança o mesmo tramo em conjunto (quem
 * cadastra a torre não é sempre quem lança a NF depois). A página já é a
 * barreira; toda edição continua registrada campo a campo em
 * `fin_fat_alteracoes` (`fin_fat_editar`).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Receipt, ArrowLeft, Plus, RefreshCw, Loader2, Edit2, Trash2,
  BarChart3, ClipboardList, Search, AlertTriangle,
} from 'lucide-react';
import type { Profile, FinFatGwjaco, FinFatAlteracao } from '../../types';
import * as api from '../../lib/finFaturamentoGwjacoApi';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FinFaturamentoWallboard from './FinFaturamentoWallboard';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const TRAMOS = ['T1', 'T2', 'T3', 'T4', 'T5'] as const;

/** `2026-08-31` → `31/08/2026`. Fatia a string em vez de `new Date` (foge do fuso). */
function fmtDataBR(iso?: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

function fmtDataHoraBR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const ROTULO_CAMPO: Record<string, string> = {
  torre_numero: 'Torre',
  tramo: 'Tramo',
  serie: 'Seq.',
  codigo_cliente: 'Código de Cliente',
  projeto_codigo: 'Projeto',
  nota_fiscal: 'Nº Nota Fiscal',
  data_faturado: 'Faturado',
  semana_faturamento: 'Semana',
  data_expedido: 'Expedido',
  data_tramos_previstos: 'Tramos previstos',
  restricao: 'Restrição',
  observacao: 'Observação',
};

function fmtValorLog(campo: string, v: string | null): string {
  if (campo === 'restricao') return v === 'true' ? 'Sim' : 'Não';
  if (!v) return '∅';
  if (['data_faturado', 'data_expedido', 'data_tramos_previstos'].includes(campo)) return fmtDataBR(v);
  return v;
}

type Aba = 'dados' | 'relatorio';

export default function FinFaturamentoGwjaco({ user, onNavigate }: Props) {
  const toast = useToast();
  const [aba, setAba] = useState<Aba>('dados');
  const [linhas, setLinhas] = useState<FinFatGwjaco[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<FinFatGwjaco | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<FinFatGwjaco | null>(null);

  /** Só vale para cadastro novo: uma torre inteira (5 tramos) ou um tramo avulso. */
  const [modoNovo, setModoNovo] = useState<'todos' | 'individual'>('todos');

  const [form, setForm] = useState({
    torre_numero: '',
    tramo: 'T1',
    codigo_cliente: '',
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
      setAtualizadoEm(new Date());
    } catch (err: any) {
      toast.error('Erro ao carregar o faturamento: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => {
    setEditando(null);
    setModoNovo('todos');
    setForm({
      torre_numero: '', tramo: 'T1', codigo_cliente: '', projeto_codigo: '',
      nota_fiscal: '', data_faturado: '', semana_faturamento: '',
      data_expedido: '', data_tramos_previstos: '', restricao: false, observacao: '',
    });
    setModalAberto(true);
  };

  const abrirEdicao = (row: FinFatGwjaco) => {
    setEditando(row);
    setForm({
      torre_numero: String(row.torre_numero),
      tramo: row.tramo,
      codigo_cliente: row.codigo_cliente ?? '',
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
    const torreNum = Number(form.torre_numero);
    if (!torreNum || torreNum < 1) {
      toast.warning('Informe o número da torre.');
      return;
    }

    const base = {
      codigo_cliente: form.codigo_cliente.trim() || null,
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
      if (editando) {
        const patch: api.FinFatPatch = { torre_numero: torreNum, tramo: form.tramo, ...base };
        const res = await api.editarLancamentoFaturamento(editando.id, patch, { id: user.id, nome: user.name });
        toast.success(res.alteracoes > 0 ? `Lançamento atualizado (${res.alteracoes} campo(s)).` : 'Nada mudou.');
      } else if (modoNovo === 'todos') {
        // Torre inteira: cadastra os 5 tramos de uma vez (dados de lançamento
        // ficam vazios — cada tramo fatura em data/NF diferente, edita depois).
        const jaExistem = new Set(linhas.filter((l) => l.torre_numero === torreNum).map((l) => l.tramo));
        const faltantes = TRAMOS.filter((t) => !jaExistem.has(t));
        if (faltantes.length === 0) {
          toast.warning(`Torre ${torreNum} já tem os 5 tramos cadastrados.`);
          setSalvando(false);
          return;
        }
        for (const t of faltantes) {
          await api.criarLancamentoFaturamento({
            torre_numero: torreNum,
            tramo: t,
            projeto_codigo: base.projeto_codigo,
            observacao: base.observacao,
          });
        }
        toast.success(
          faltantes.length === TRAMOS.length
            ? `Torre ${torreNum} cadastrada com os 5 tramos.`
            : `Torre ${torreNum}: ${faltantes.length} tramo(s) cadastrado(s) (${jaExistem.size} já existiam).`,
        );
      } else {
        const duplicado = linhas.some((l) => l.torre_numero === torreNum && l.tramo === form.tramo);
        if (duplicado) {
          toast.warning(`Torre ${torreNum} / ${form.tramo} já está cadastrada.`);
          setSalvando(false);
          return;
        }
        await api.criarLancamentoFaturamento({ torre_numero: torreNum, tramo: form.tramo, ...base });
        toast.success(`Torre ${torreNum} / ${form.tramo} cadastrada.`);
      }
      setModalAberto(false);
      await carregar();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    try {
      await api.excluirLancamentoFaturamento(paraExcluir.id);
      toast.success(`Torre ${paraExcluir.torre_numero} / ${paraExcluir.tramo} excluída.`);
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + (err.message || ''));
    }
  };

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter((l) =>
      String(l.torre_numero).includes(termo) ||
      l.tramo.toLowerCase().includes(termo) ||
      (l.codigo_cliente ?? '').toLowerCase().includes(termo) ||
      (l.nota_fiscal ?? '').toLowerCase().includes(termo) ||
      (l.projeto_codigo ?? '').toLowerCase().includes(termo),
    );
  }, [linhas, busca]);

  const totalFaturado = linhas.filter((l) => l.data_faturado).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/financeiro')}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para Financeiro
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/20">
              <Receipt className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">
                Faturamento GW Jacobina
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Controle de faturamento por torre e tramo
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Abas: Dados / Relatório */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setAba('dados')}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
            aba === 'dados'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Dados
        </button>
        <button
          type="button"
          onClick={() => setAba('relatorio')}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
            aba === 'relatorio'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Relatório
        </button>
      </div>

      {aba === 'relatorio' ? (
        <div className="space-y-3">
          <FinFaturamentoWallboard
            linhas={linhas}
            onAtualizar={carregar}
            atualizadoEm={atualizadoEm}
            carregando={loading}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Painel desenhado para TV: use o botão de tela cheia no canto do painel. Ele se atualiza
            sozinho a cada 2 minutos e segue o tema do app (para a TV, deixe no tema escuro).
          </p>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Tramos cadastrados</p>
              <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{linhas.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Faturados</p>
              <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{totalFaturado}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-1 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Pendentes</p>
              <p className="mt-1 text-xl font-bold text-slate-500 dark:text-slate-400">{linhas.length - totalFaturado}</p>
            </div>
          </div>

          {/* Filtros + ações */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por torre, tramo, código de cliente, NF ou projeto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={carregar}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={abrirNovo}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" />
              Nova Torre/Tramo
            </button>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/40">
                <tr className="text-left font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">Torre</th>
                  <th className="px-3 py-2">Tramo</th>
                  <th className="px-3 py-2">Seq.</th>
                  <th className="px-3 py-2">Código de Cliente</th>
                  <th className="px-3 py-2">Nº NF</th>
                  <th className="px-3 py-2">Faturado</th>
                  <th className="px-3 py-2">Semana</th>
                  <th className="px-3 py-2">Expedido</th>
                  <th className="px-3 py-2">Tramos Previstos</th>
                  <th className="px-3 py-2">Restrição</th>
                  <th className="px-3 py-2">Projeto</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {linhasFiltradas.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">{row.torre_numero}</td>
                    <td className="px-3 py-2">{row.tramo}</td>
                    <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">{row.serie ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.codigo_cliente || '—'}</td>
                    <td className="px-3 py-2">{row.nota_fiscal || '—'}</td>
                    <td className="px-3 py-2">
                      {row.data_faturado
                        ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtDataBR(row.data_faturado)}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2">{row.semana_faturamento ?? '—'}</td>
                    <td className="px-3 py-2">{fmtDataBR(row.data_expedido)}</td>
                    <td className="px-3 py-2">{fmtDataBR(row.data_tramos_previstos)}</td>
                    <td className="px-3 py-2">
                      {row.restricao ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                          <AlertTriangle className="h-3 w-3" />
                          Sim
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.projeto_codigo || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(row)}
                          title="Editar lançamento"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setParaExcluir(row)}
                          title="Excluir"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhasFiltradas.length === 0 && !loading && (
              <div className="p-8 text-center">
                <Receipt className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum lançamento encontrado</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Ajuste a busca ou cadastre uma nova torre/tramo.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Nova / Editar */}
      {modalAberto && (
        <Modal
          onClose={() => setModalAberto(false)}
          maxWidth="max-w-2xl"
          ariaLabel={editando ? 'Editar Lançamento de Faturamento' : 'Nova Torre/Tramo'}
        >
          <ModalHeader onClose={() => setModalAberto(false)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {editando ? `Editar Torre ${editando.torre_numero} / ${editando.tramo}` : 'Nova Torre/Tramo'}
            </h3>
          </ModalHeader>
          <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col">
            <ModalBody className="space-y-4">
              {!editando && (
                <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => setModoNovo('todos')}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${
                      modoNovo === 'todos'
                        ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Torre inteira (5 tramos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoNovo('individual')}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${
                      modoNovo === 'individual'
                        ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Um tramo
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Torre *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    disabled={!!editando}
                    value={form.torre_numero}
                    onChange={(e) => setForm((f) => ({ ...f, torre_numero: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none disabled:opacity-60 sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                {(editando || modoNovo === 'individual') && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Tramo *</label>
                    <select
                      required
                      disabled={!!editando}
                      value={form.tramo}
                      onChange={(e) => setForm((f) => ({ ...f, tramo: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 disabled:opacity-60 sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {TRAMOS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {!editando && modoNovo === 'todos' && (
                <p className="rounded-lg bg-emerald-50 p-2.5 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Cria os tramos T1 a T5 da torre {form.torre_numero || '—'} de uma vez, sem os dados de lançamento
                  (NF, faturamento, expedição) — cada tramo fatura em data diferente, então isso se edita depois,
                  tramo a tramo, na tabela.
                </p>
              )}

              {(editando || modoNovo === 'individual') && (
                <>
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
                    htmlFor="finFatRestricao"
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <input
                      type="checkbox"
                      id="finFatRestricao"
                      checked={form.restricao}
                      onChange={(e) => setForm((f) => ({ ...f, restricao: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span>
                      <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Tramo com restrição
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                        Marca o tramo travado. No relatório de parede ele aparece em laranja em vez
                        de azul. O motivo, quando houver, vai na observação.
                      </span>
                    </span>
                  </label>
                </>
              )}

              {/* Projeto e observação valem para a torre inteira, então ficam nos dois modos. */}
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
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none sm:text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {editando && <LogAlteracoes fatId={editando.id} />}
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {editando ? 'Salvar Alterações' : modoNovo === 'todos' ? 'Cadastrar Torre (5 tramos)' : 'Cadastrar Tramo'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {paraExcluir && (
        <ConfirmDialog
          titulo="Excluir Lançamento"
          mensagem={`Tem certeza que deseja excluir o lançamento da Torre ${paraExcluir.torre_numero} / ${paraExcluir.tramo}?`}
          confirmarLabel="Sim, Excluir"
          cancelarLabel="Cancelar"
          variante="perigo"
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </div>
  );
}

/** Log de alterações do lançamento — sempre no fim da janela de edição. */
function LogAlteracoes({ fatId }: { fatId: string }) {
  const [linhas, setLinhas] = useState<FinFatAlteracao[] | null>(null);
  useEffect(() => {
    api.listarAlteracoesFaturamento(fatId).then(setLinhas).catch(() => setLinhas([]));
  }, [fatId]);

  return (
    <div className="mt-2 border-t pt-3" style={{ borderColor: 'var(--hairline, #e2e8f0)' }}>
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Log de alterações
      </p>
      {linhas === null && <div className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
      {linhas?.length === 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Sem edições — está como foi cadastrado.</p>
      )}
      <ul className="space-y-2">
        {(linhas ?? []).map((a) => (
          <li key={a.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-bold text-slate-700 dark:text-slate-300">{a.alterado_por_nome || '—'}</span>
              <span>{fmtDataHoraBR(a.created_at)}</span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {a.alteracoes.map((m, i) => (
                <li key={i} className="text-[11px] text-slate-700 dark:text-slate-300">
                  <span className="font-bold">{ROTULO_CAMPO[m.campo] ?? m.campo}:</span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">{fmtValorLog(m.campo, m.de)}</span> →{' '}
                  <span>{fmtValorLog(m.campo, m.para)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
