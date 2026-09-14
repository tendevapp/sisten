/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janela de detalhes dos gráficos e indicadores de Faturamento GW Jacobina.
 * Aberta ao clicar em colunas de ritmo, barras por tramo, células da matriz,
 * régua de torres, últimas notas ou cards de KPI no Wallboard.
 */

import React, { useMemo, useState } from 'react';
import {
  X, Search, AlertTriangle, CheckCircle2, Clock, Edit2, Layers,
  Calendar, Building2, Hash, FileText, ArrowRight, Check,
} from 'lucide-react';
import type { FinFatGwjaco } from '../../types';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { estadoTramo, type EstadoTramo } from '../../lib/finFaturamentoRelatorio';

export type DetalheModalTipo =
  | { tipo: 'tramo_individual'; linha: FinFatGwjaco | null; torre: number; tramo: string }
  | { tipo: 'torre_completa'; torre: number; linhasDaTorre: FinFatGwjaco[] }
  | { tipo: 'periodo_ritmo'; visao: 'mes' | 'semana'; rotulo: string; linhasDoPeriodo: FinFatGwjaco[] }
  | { tipo: 'tramo_tipo'; tramo: string; linhasDoTramo: FinFatGwjaco[] }
  | { tipo: 'kpi_filtro'; titulo: string; subtitulo?: string; linhas: FinFatGwjaco[] };

interface Props {
  detalhe: DetalheModalTipo;
  onFechar: () => void;
  onEditarLinha?: (linha: FinFatGwjaco) => void;
  onVerTramo?: (linha: FinFatGwjaco | null, torre: number, tramo: string) => void;
}

function fmtDataBR(iso?: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

function BadgeStatus({ estado, restricao }: { estado: EstadoTramo; restricao?: boolean }) {
  if (estado === 'expedido') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
        <Check className="h-3 w-3" />
        Expedido
      </span>
    );
  }
  if (estado === 'faturado') {
    if (restricao) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          Faturado (com restrição)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
        <FileText className="h-3 w-3" />
        Faturado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      <Clock className="h-3 w-3" />
      Pendente
    </span>
  );
}

export default function FinFaturamentoDetalhesModal({
  detalhe,
  onFechar,
  onEditarLinha,
  onVerTramo,
}: Props) {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'faturado' | 'expedido' | 'pendente' | 'restricao'>('todos');

  // Determina título e subtítulo
  const { titulo, subtitulo, linhasTabela } = useMemo(() => {
    switch (detalhe.tipo) {
      case 'tramo_individual':
        return {
          titulo: `Torre ${detalhe.torre} · Tramo ${detalhe.tramo}`,
          subtitulo: detalhe.linha ? `Sequencial ${detalhe.linha.serie ?? '—'} · Projeto ${detalhe.linha.projeto_codigo ?? 'GW Jacobina'}` : 'Tramo ainda não cadastrado',
          linhasTabela: detalhe.linha ? [detalhe.linha] : [],
        };
      case 'torre_completa':
        return {
          titulo: `Torre ${detalhe.torre} — Visão Geral dos Tramos`,
          subtitulo: `${detalhe.linhasDaTorre.length} tramos cadastrados`,
          linhasTabela: detalhe.linhasDaTorre,
        };
      case 'periodo_ritmo':
        return {
          titulo: `Tramos faturados · ${detalhe.rotulo}`,
          subtitulo: `${detalhe.linhasDoPeriodo.length} tramo(s) com faturamento em ${detalhe.rotulo}`,
          linhasTabela: detalhe.linhasDoPeriodo,
        };
      case 'tramo_tipo':
        return {
          titulo: `Detalhamento Geral · Tramo ${detalhe.tramo}`,
          subtitulo: `${detalhe.linhasDoTramo.length} torres com tramo ${detalhe.tramo}`,
          linhasTabela: detalhe.linhasDoTramo,
        };
      case 'kpi_filtro':
        return {
          titulo: detalhe.titulo,
          subtitulo: detalhe.subtitulo ?? `${detalhe.linhas.length} tramo(s) listados`,
          linhasTabela: detalhe.linhas,
        };
    }
  }, [detalhe]);

  // Contagens para os filtros
  const contagens = useMemo(() => {
    const list = linhasTabela;
    let expedidos = 0;
    let faturados = 0;
    let pendentes = 0;
    let comRestricao = 0;

    for (const l of list) {
      const st = estadoTramo(l);
      if (st === 'expedido') expedidos++;
      else if (st === 'faturado') faturados++;
      else pendentes++;

      if (l.restricao) comRestricao++;
    }

    return { total: list.length, faturados: faturados + expedidos, expedidos, pendentes, comRestricao };
  }, [linhasTabela]);

  // Linhas filtradas para tabela
  const linhasFiltradas = useMemo(() => {
    let result = linhasTabela;

    if (filtroStatus === 'expedido') {
      result = result.filter((l) => estadoTramo(l) === 'expedido');
    } else if (filtroStatus === 'faturado') {
      result = result.filter((l) => Boolean(l.data_faturado));
    } else if (filtroStatus === 'pendente') {
      result = result.filter((l) => estadoTramo(l) === 'pendente');
    } else if (filtroStatus === 'restricao') {
      result = result.filter((l) => Boolean(l.restricao));
    }

    const termo = busca.trim().toLowerCase();
    if (termo) {
      result = result.filter(
        (l) =>
          String(l.torre_numero).includes(termo) ||
          l.tramo.toLowerCase().includes(termo) ||
          String(l.serie ?? '').includes(termo) ||
          (l.nota_fiscal ?? '').toLowerCase().includes(termo) ||
          (l.codigo_cliente ?? '').toLowerCase().includes(termo) ||
          (l.projeto_codigo ?? '').toLowerCase().includes(termo),
      );
    }

    return result.slice().sort((a, b) => {
      if (a.torre_numero !== b.torre_numero) return a.torre_numero - b.torre_numero;
      return a.tramo.localeCompare(b.tramo);
    });
  }, [linhasTabela, filtroStatus, busca]);

  const ehVisualizacaoIndividual = detalhe.tipo === 'tramo_individual';
  const linhaIndividual = detalhe.tipo === 'tramo_individual' ? detalhe.linha : null;

  return (
    <Modal
      onClose={onFechar}
      maxWidth={ehVisualizacaoIndividual ? 'max-w-xl' : 'max-w-4xl'}
      ariaLabel={titulo}
    >
      <ModalHeader onClose={onFechar}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            {ehVisualizacaoIndividual ? <Layers className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
              {titulo}
            </h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {subtitulo}
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Caso 1: Detalhe Individual de um Tramo */}
        {ehVisualizacaoIndividual ? (
          linhaIndividual ? (
            <div className="space-y-4">
              {/* Header com status e alerta de restrição */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Status atual:</span>
                  <BadgeStatus estado={estadoTramo(linhaIndividual)} restricao={linhaIndividual.restricao} />
                </div>
                {linhaIndividual.restricao && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Possui Restrição
                  </span>
                )}
              </div>

              {/* Grid de campos */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Torre</p>
                  <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">Torre {linhaIndividual.torre_numero}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tramo</p>
                  <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">{linhaIndividual.tramo}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sequencial (Série)</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                    {linhaIndividual.serie ?? '—'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nota Fiscal</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                    {linhaIndividual.nota_fiscal || '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Data Faturado</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {fmtDataBR(linhaIndividual.data_faturado)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Semana Faturamento</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {linhaIndividual.semana_faturamento != null ? `Semana ${linhaIndividual.semana_faturamento}` : '—'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Data Expedido</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {fmtDataBR(linhaIndividual.data_expedido)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tramos Previstos</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {fmtDataBR(linhaIndividual.data_tramos_previstos)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Código Cliente</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                    {linhaIndividual.codigo_cliente || '—'}
                  </p>
                </div>

                <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:col-span-2 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Part Number</p>
                  <p className="mt-0.5 truncate font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                    {linhaIndividual.part_number || '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Projeto</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                    {linhaIndividual.projeto_codigo || 'GW Jacobina'}
                  </p>
                </div>
              </div>

              {/* Observações */}
              {linhaIndividual.observacao && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Observação:</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                    {linhaIndividual.observacao}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center">
              <Clock className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Torre {detalhe.torre} · Tramo {detalhe.tramo} ainda não foi cadastrado.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Você pode cadastrar este tramo ou a torre inteira na aba "Dados".
              </p>
            </div>
          )
        ) : (
          /* Caso 2: Tabela com múltiplos tramos (ritmo, tramo tipo, torre completa, KPIs) */
          <div className="space-y-4">
            {/* Faixa de KPIs compacta */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                <span className="text-[11px] font-semibold uppercase text-slate-400">Total</span>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{contagens.total}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                <span className="text-[11px] font-semibold uppercase text-blue-600 dark:text-blue-400">Faturados</span>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{contagens.faturados}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                <span className="text-[11px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">Expedidos</span>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{contagens.expedidos}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Pendentes</span>
                <p className="text-lg font-bold text-slate-500 dark:text-slate-400">{contagens.pendentes}</p>
              </div>
              <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:col-span-1 dark:border-slate-800 dark:bg-slate-950/40">
                <span className="text-[11px] font-semibold uppercase text-amber-600 dark:text-amber-400">Restrição</span>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{contagens.comRestricao}</p>
              </div>
            </div>

            {/* Filtros e Busca */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* Pílulas de filtro */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFiltroStatus('todos')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    filtroStatus === 'todos'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  Todos ({contagens.total})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatus('faturado')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    filtroStatus === 'faturado'
                      ? 'bg-blue-600 text-white dark:bg-blue-500'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  Faturados ({contagens.faturados})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatus('expedido')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    filtroStatus === 'expedido'
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  Expedidos ({contagens.expedidos})
                </button>
                {contagens.pendentes > 0 && (
                  <button
                    type="button"
                    onClick={() => setFiltroStatus('pendente')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      filtroStatus === 'pendente'
                        ? 'bg-slate-600 text-white dark:bg-slate-500'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    Pendentes ({contagens.pendentes})
                  </button>
                )}
                {contagens.comRestricao > 0 && (
                  <button
                    type="button"
                    onClick={() => setFiltroStatus('restricao')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      filtroStatus === 'restricao'
                        ? 'bg-amber-600 text-white dark:bg-amber-500'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    Restrição ({contagens.comRestricao})
                  </button>
                )}
              </div>

              {/* Busca */}
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar torre, NF, seq..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Tabela de itens */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950/40">
                  <tr className="text-left font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Torre</th>
                    <th className="px-3 py-2">Tramo</th>
                    <th className="px-3 py-2">Seq.</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Nº NF</th>
                    <th className="px-3 py-2">Faturado</th>
                    <th className="px-3 py-2">Expedido</th>
                    <th className="px-3 py-2">Restrição</th>
                    <th className="px-3 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {linhasFiltradas.map((l) => (
                    <tr
                      key={l.id}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">
                        Torre {l.torre_numero}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">
                        {l.tramo}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                        {l.serie ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <BadgeStatus estado={estadoTramo(l)} restricao={l.restricao} />
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {l.nota_fiscal || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {fmtDataBR(l.data_faturado)}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {fmtDataBR(l.data_expedido)}
                      </td>
                      <td className="px-3 py-2">
                        {l.restricao ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            Sim
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onVerTramo && (
                            <button
                              type="button"
                              onClick={() => onVerTramo(l, l.torre_numero, l.tramo)}
                              title="Ver detalhes deste tramo"
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {onEditarLinha && (
                            <button
                              type="button"
                              onClick={() => {
                                onFechar();
                                onEditarLinha(l);
                              }}
                              title="Editar este lançamento"
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {linhasFiltradas.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Nenhum tramo encontrado para os filtros selecionados.
                </div>
              )}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-slate-400">
            {ehVisualizacaoIndividual && linhaIndividual ? (
              linhaIndividual.updated_at ? `Última edição: ${fmtDataBR(linhaIndividual.updated_at)}` : ''
            ) : (
              `Exibindo ${linhasFiltradas.length} de ${linhasTabela.length} registro(s)`
            )}
          </span>

          <div className="flex items-center gap-2">
            {ehVisualizacaoIndividual && linhaIndividual && onEditarLinha && (
              <button
                type="button"
                onClick={() => {
                  onFechar();
                  onEditarLinha(linhaIndividual);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Editar Lançamento
              </button>
            )}
            <button
              type="button"
              onClick={onFechar}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Fechar
            </button>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}
