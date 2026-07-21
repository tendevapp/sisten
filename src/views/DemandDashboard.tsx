/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import { EnrichedSAPRecord } from '../types';
import { classifyTipoDemanda, classifyCriticidade, resolveDataCorte, resolveComprador, TipoDemanda, Criticidade, CompradorInfo } from '../lib/demandas';
import RequisitadoVsPedidoChart, { Granularidade } from '../components/demandas/RequisitadoVsPedidoChart';
import CriticidadeChart from '../components/demandas/CriticidadeChart';
import AreaSolicitanteChart from '../components/demandas/AreaSolicitanteChart';
import CompradorPerformanceChart from '../components/demandas/CompradorPerformanceChart';
import QuantidadesPeriodoTable from '../components/demandas/QuantidadesPeriodoTable';
import AtrasoChart from '../components/demandas/AtrasoChart';

export default function DemandDashboard() {
  const [records, setRecords] = useState<EnrichedSAPRecord[]>([]);
  const [compradores, setCompradores] = useState<CompradorInfo[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [granularidade, setGranularidade] = useState<Granularidade>('semana');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | TipoDemanda>('todos');
  const [criticidadeFiltro, setCriticidadeFiltro] = useState<'todas' | Criticidade>('todas');
  const [areaFiltro, setAreaFiltro] = useState('todas');
  const [compradorFiltro, setCompradorFiltro] = useState('todos');

  const loadRecords = useCallback(() => {
    setRecords(localDb.getEnrichedSAPRequisicoes());
  }, []);

  const loadCompradores = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('compradores').select('grupo_compras, nome_comprador, usuario_sistema');
    if (data) setCompradores(data as CompradorInfo[]);
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      await localDb.syncFromSupabase(true);
    } catch (err) {
      console.error('Falha ao sincronizar demandas:', err);
    } finally {
      loadRecords();
      setLastSync(new Date());
      setSyncing(false);
    }
  }, [loadRecords]);

  useEffect(() => {
    loadRecords();
    loadCompradores();
    setLastSync(new Date());
  }, [loadRecords, loadCompradores]);

  const areas = useMemo(() => {
    const s = new Set<string>();
    records.forEach(r => {
      const a = (r as any).area_solicitante?.trim();
      if (a) s.add(a);
    });
    return Array.from(s).sort();
  }, [records]);

  const compradorFiltroNome = useMemo(
    () => compradores.find(c => c.grupo_compras === compradorFiltro)?.nome_comprador,
    [compradores, compradorFiltro]
  );

  const filtered = useMemo(() => {
    return records.filter(r => {
      // Corte por data_pedido quando já há PO colocado (senão uma RM antiga que só
      // ganha PO dentro do período filtrado reaparece com a data de solicitação,
      // fora do período); enquanto aberta, o corte é pela data de solicitação.
      if (dateFrom || dateTo) {
        const corte = resolveDataCorte(r);
        if ((dateFrom && corte < dateFrom) || (dateTo && corte > dateTo)) return false;
      }
      if (tipoFiltro !== 'todos' && classifyTipoDemanda(r.requisicao_de_compra) !== tipoFiltro) return false;
      if (criticidadeFiltro !== 'todas' && classifyCriticidade(r.requisicao_de_compra) !== criticidadeFiltro) return false;
      if (areaFiltro !== 'todas' && ((r as any).area_solicitante?.trim() || 'Não informada') !== areaFiltro) return false;
      // Filtra pelo mesmo comprador "resolvido" usado nos gráficos/tabela (quem
      // de fato colocou o PO, com fallback pro grupo atribuído) — comparar só
      // r.grupo_comprador deixa passar RMs de um comprador cujo PO foi colocado
      // por outro (cobertura entre compradores), que reaparecem sob o nome errado.
      if (compradorFiltro !== 'todos' && resolveComprador(r, compradores) !== compradorFiltroNome) return false;
      return true;
    });
  }, [records, dateFrom, dateTo, tipoFiltro, criticidadeFiltro, areaFiltro, compradorFiltro, compradorFiltroNome, compradores]);

  const materiais = useMemo(() => filtered.filter(r => classifyTipoDemanda(r.requisicao_de_compra) === 'material'), [filtered]);
  const servicos = useMemo(() => filtered.filter(r => classifyTipoDemanda(r.requisicao_de_compra) === 'servico'), [filtered]);

  const kpis = useMemo(() => {
    const totalRequisitado = filtered.length;
    const totalPedido = filtered.filter(r => r.status_requisicao === 'Processado').length;
    const totalAberto = totalRequisitado - totalPedido;
    const pctProcessado = totalRequisitado > 0 ? Math.round((totalPedido / totalRequisitado) * 100) : 0;
    const abertos = filtered.filter(r => r.status_requisicao !== 'Processado');
    const atrasoMedio = abertos.length > 0
      ? Math.round(abertos.reduce((acc, r) => acc + (r.atraso_comprador || 0), 0) / abertos.length)
      : 0;
    return { totalRequisitado, totalPedido, totalAberto, pctProcessado, atrasoMedio };
  }, [filtered]);

  const selectClass = 'rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer';

  return (
    <div className="space-y-6 text-left">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Acompanhamento de Demandas</h2>
          <p className="mt-1 text-sm text-slate-500">Requisições de materiais (RI 11/12/13) e serviços (RI 17) — requisitado x pedido, criticidade, área e comprador.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {lastSync && <span>Atualizado às {lastSync.toLocaleTimeString('pt-BR')}</span>}
          <button
            onClick={refresh}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">Total Requisitado</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.totalRequisitado}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">% Processado</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{kpis.pctProcessado}%</p>
          <p className="text-[11px] text-slate-400">{kpis.totalPedido} pedidos colocados</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">Total Aberto</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{kpis.totalAberto}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">Atraso Médio (aberto)</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{kpis.atrasoMedio}d</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
          {(['dia', 'semana', 'mes'] as Granularidade[]).map(g => (
            <button
              key={g}
              onClick={() => setGranularidade(g)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${granularidade === g ? 'bg-emerald-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {g === 'dia' ? 'Dia' : g === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>

        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={selectClass} title="Data inicial" />
        <span className="text-xs text-slate-400">até</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={selectClass} title="Data final" />

        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as any)} className={selectClass}>
          <option value="todos">Todos os tipos</option>
          <option value="material">Materiais</option>
          <option value="servico">Serviços</option>
        </select>

        <select value={criticidadeFiltro} onChange={e => setCriticidadeFiltro(e.target.value as any)} className={selectClass}>
          <option value="todas">Todas as criticidades</option>
          <option value="normal">Normal</option>
          <option value="urgente">Urgente</option>
          <option value="maquina_parada">Máquina Parada</option>
        </select>

        <select value={areaFiltro} onChange={e => setAreaFiltro(e.target.value)} className={selectClass}>
          <option value="todas">Todas as áreas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={compradorFiltro} onChange={e => setCompradorFiltro(e.target.value)} className={selectClass}>
          <option value="todos">Todos os compradores</option>
          {compradores.map(c => <option key={c.grupo_compras} value={c.grupo_compras}>{c.nome_comprador}</option>)}
        </select>

        <span className="ml-auto text-xs text-slate-400">{filtered.length} requisições no filtro</span>
      </div>

      {/* Gráfico geral */}
      <RequisitadoVsPedidoChart
        records={filtered}
        granularidade={granularidade}
        title="Demandas Gerais"
        subtitle="Itens requisitados x pedidos efetivados, com volume acumulado no período"
      />

      {/* Gráfico de serviços */}
      <RequisitadoVsPedidoChart
        records={servicos}
        granularidade={granularidade}
        title="Demandas de Serviço (RI 17)"
        subtitle="Serviços requisitados x pedidos colocados, com volume acumulado no período"
      />

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <CriticidadeChart records={materiais} />
        <AreaSolicitanteChart records={filtered} />
      </div>

      <CompradorPerformanceChart records={materiais} compradores={compradores} />
      <QuantidadesPeriodoTable records={filtered} compradores={compradores} granularidade={granularidade} />

      <AtrasoChart records={filtered} compradores={compradores} />
    </div>
  );
}
