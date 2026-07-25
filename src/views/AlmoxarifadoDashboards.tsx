/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LayoutDashboard, RefreshCw, AlertCircle, Boxes } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, EstoqueItem, EstoqueAnalise, EnrichedSAPRecord } from '../types';
import { calcularKpis, classifyABC, resumirAbc, ClasseAbc } from '../lib/almoxarifado';
import EstoqueKpis from '../components/almoxarifado/EstoqueKpis';
import CurvaAbcChart from '../components/almoxarifado/CurvaAbcChart';

interface AlmoxarifadoDashboardsProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function AlmoxarifadoDashboards({ user, onNavigate }: AlmoxarifadoDashboardsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EstoqueItem[]>([]);
  const [analise, setAnalise] = useState<EstoqueAnalise[]>([]);
  const [requisicoes, setRequisicoes] = useState<EnrichedSAPRecord[]>([]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      // A análise falha de forma isolada: sem ela apenas o painel de PMM degrada,
      // então não deve derrubar o carregamento do estoque.
      const [estoque, analiseRows] = await Promise.all([
        localDb.fetchEstoque(force),
        localDb.fetchEstoqueAnalise(force).catch(() => [] as EstoqueAnalise[]),
      ]);
      setRows(estoque);
      setAnalise(analiseRows);
      setRequisicoes(localDb.getEnrichedSAPRequisicoes());
    } catch (e: any) {
      console.error('Erro ao carregar os dashboards do almoxarifado:', e);
      setError('Falha ao carregar a posição de estoque. Tente atualizar novamente.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const kpi = useMemo(() => calcularKpis(rows), [rows]);

  // Classificação sobre a posição inteira (`rows`), nunca sobre o filtro — ver
  // classifyABC. O resumo, sim, respeita o filtro vigente.
  const mapaAbc = useMemo(() => classifyABC(rows), [rows]);
  const resumoAbc = useMemo(() => resumirAbc(rows, mapaAbc), [rows, mapaAbc]);

  const irParaEstoque = useCallback((query: string) => {
    onNavigate(`/almoxarifado/estoque?${query}`);
  }, [onNavigate]);

  const abrirClasseAbc = useCallback((classe: ClasseAbc) => {
    irParaEstoque(`abc=${classe}`);
  }, [irParaEstoque]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-50 flex items-center gap-2.5">
            <LayoutDashboard className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Dashboards do Almoxarifado
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Onde está o valor imobilizado, quais itens exigem controle e negociação, e que compras estão sendo feitas contra saldo existente.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center p-20 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl space-y-4">
          <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Carregando indicadores...</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-center">
          <Boxes className="h-12 w-12 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-full mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Nenhuma posição de estoque disponível</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
            Importe a posição de estoque (transação ZL0024) na aba "Importar SAP" do painel administrativo.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <EstoqueKpis kpi={kpi} />
          <CurvaAbcChart resumo={resumoAbc} onSelecionar={abrirClasseAbc} />
        </>
      )}
    </div>
  );
}
