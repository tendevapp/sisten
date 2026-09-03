/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck, Search, Filter, RefreshCw, Upload, FileSpreadsheet,
  Calendar, CheckCircle2, Clock, AlertTriangle, ChevronRight,
  ExternalLink, Package, ArrowRight, ShieldCheck, MapPin,
  Scale, DollarSign, X, Edit2, Check, HelpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../../db/localDb';
import { BahiaSulEntrega, SAPPedido, Profile } from '../../types';
import {
  enriquecerEntregasComPedidos,
  calcularKpisBahiaSul,
  BahiaSulEnriquecida,
  BahiaSulKpis
} from '../../lib/bahiasul';
import { useToast } from '../ui/Toast';
import BahiaSulUploadModal from './BahiaSulUploadModal';

interface BahiaSulAnalyticsPanelProps {
  user: Profile;
  onNavigate?: (path: string) => void;
}

export default function BahiaSulAnalyticsPanel({
  user,
  onNavigate
}: BahiaSulAnalyticsPanelProps) {
  const toast = useToast();
  const [entregas, setEntregas] = useState<BahiaSulEntrega[]>([]);
  const [pedidosSap, setPedidosSap] = useState<SAPPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BahiaSulEnriquecida | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'TRANSITO' | 'A ENTREGAR' | 'ENTREGUE'>('todos');
  const [vinculoFilter, setVinculoFilter] = useState<'todos' | 'vinculado' | 'sem_vinculo'>('todos');

  // Manual PO linking edit
  const [editingPoChave, setEditingPoChave] = useState<string | null>(null);
  const [inputPoNumber, setInputPoNumber] = useState('');
  const [savingPo, setSavingPo] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [listEntregas, listPedidos] = await Promise.all([
        localDb.getBahiaSulEntregas(),
        Promise.resolve(localDb.getPedidos())
      ]);
      setEntregas(listEntregas);
      setPedidosSap(listPedidos);
    } catch (e: any) {
      console.error('Erro ao carregar dados Bahia Sul:', e);
      toast.error('Não foi possível carregar as entregas da Bahia Sul.');
    } finally {
      setLoading(false);
    }
  };

  // Enriquecimento das entregas com os pedidos SAP
  const entregasEnriquecidas = useMemo(() => {
    return enriquecerEntregasComPedidos(entregas, pedidosSap);
  }, [entregas, pedidosSap]);

  // Indicadores (KPIs)
  const kpis: BahiaSulKpis = useMemo(() => {
    return calcularKpisBahiaSul(entregasEnriquecidas);
  }, [entregasEnriquecidas]);

  // Lista filtrada
  const entregasFiltradas = useMemo(() => {
    return entregasEnriquecidas.filter(item => {
      // Filtro de status
      if (statusFilter !== 'todos') {
        const sit = (item.situacao || '').toUpperCase();
        if (!sit.includes(statusFilter)) return false;
      }

      // Filtro de vínculo SAP
      if (vinculoFilter === 'vinculado' && !item.pedidoEncontrado && !item.nro_pedido) {
        return false;
      }
      if (vinculoFilter === 'sem_vinculo' && (item.pedidoEncontrado || Boolean(item.nro_pedido))) {
        return false;
      }

      // Busca textual
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matches =
          (item.cto_numero || '').toLowerCase().includes(q) ||
          (item.cto_filial || '').toLowerCase().includes(q) ||
          (item.rmt_nome || '').toLowerCase().includes(q) ||
          (item.rmt_cnpj || '').toLowerCase().includes(q) ||
          (item.org_cidade || '').toLowerCase().includes(q) ||
          (item.dst_cidade || '').toLowerCase().includes(q) ||
          (item.nfs_embarcadas || '').toLowerCase().includes(q) ||
          (item.nro_pedido || '').toLowerCase().includes(q) ||
          (item.pedidoSap?.documento_compra || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [entregasEnriquecidas, statusFilter, vinculoFilter, searchTerm]);

  // Salva o vínculo manual com PO
  const handleSavePo = async (chaveUnica: string) => {
    if (!inputPoNumber.trim()) return;
    setSavingPo(true);
    try {
      await localDb.updateBahiaSulPedido(chaveUnica, inputPoNumber);
      toast.success(`Pedido SAP ${inputPoNumber} vinculado com sucesso!`);
      setEditingPoChave(null);
      setInputPoNumber('');
      // Atualiza localmente
      setEntregas(prev => prev.map(e => e.chave_unica === chaveUnica ? { ...e, nro_pedido: inputPoNumber } : e));
      if (selectedItem && selectedItem.chave_unica === chaveUnica) {
        setSelectedItem(prev => prev ? { ...prev, nro_pedido: inputPoNumber } : null);
      }
    } catch (e: any) {
      toast.error('Erro ao salvar vínculo do pedido SAP.');
    } finally {
      setSavingPo(false);
    }
  };

  // Exportação Excel
  const handleExportExcel = () => {
    if (entregasFiltradas.length === 0) {
      toast.warning('Nenhum registro para exportar.');
      return;
    }

    const dataToExport = entregasFiltradas.map(it => ({
      'CTe Número': it.cto_numero,
      'CTe Filial': it.cto_filial,
      'CTe Série': it.cto_serie,
      'Situação': it.situacao,
      'Remetente': it.rmt_nome,
      'CNPJ Remetente': it.rmt_cnpj,
      'Destinatário': it.dst_nome,
      'Emissão': it.emissao,
      'Previsão Entrega': it.prv_entrega,
      'Entrega Real': it.entrega,
      'Origem': it.org_cidade,
      'Destino': it.dst_cidade,
      'NFs Embarcadas': it.nfs_embarcadas,
      'Pedido SAP': it.nro_pedido || (it.pedidoSap?.documento_compra ?? ''),
      'Fornecedor SAP': it.pedidoSap?.fornecedor_name ?? '',
      'Status Prazo': it.statusPrazo,
      'Peso Real (kg)': it.kgs_real,
      'Peso Cubado (kg)': it.kgs_cubado,
      'Volumes': it.qtd_volumes,
      'Valor Mercadoria (R$)': it.vlr_mercadoria,
      'Frete Cobrado (R$)': it.frt_cobrado,
      'Observações': it.obs_diversos,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Entregas Bahia Sul');
    XLSX.writeFile(workbook, `Bahia_Sul_Entregas_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Relatório Excel exportado com sucesso!');
  };

  return (
    <div className="space-y-6 text-left">
      {/* Banner / Toolbar Superior */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <Truck className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              Acompanhamento & Análise das Entregas (Bahia Sul)
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">
            Rastreamento de conhecimentos de frete (CTe), status em trânsito, previsão de chegada na TEN e cruzamento inteligente com os Pedidos de Compras do SAP.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
            title="Recarregar dados"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Exportar Excel</span>
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-500 text-xs font-bold text-white hover:bg-amber-600 transition-all shadow cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Importar Planilha</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas (KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total CTe */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold">Total de CTes</span>
            <Package className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-800">{kpis.totalCte}</p>
          <span className="text-[10px] text-slate-400">Conhecimentos na base</span>
        </div>

        {/* Em Trânsito */}
        <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-xs space-y-1 bg-gradient-to-br from-white to-blue-50/30">
          <div className="flex items-center justify-between text-blue-600">
            <span className="text-[11px] font-bold">Em Trânsito</span>
            <Truck className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-blue-700">{kpis.emTransito}</p>
          <span className="text-[10px] font-medium text-blue-600">Cargas em rota</span>
        </div>

        {/* A Entregar */}
        <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-xs space-y-1 bg-gradient-to-br from-white to-amber-50/30">
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-[11px] font-bold">A Entregar</span>
            <Clock className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-amber-700">{kpis.aEntregar}</p>
          <span className="text-[10px] font-medium text-amber-600">Chegada iminente</span>
        </div>

        {/* Entregues */}
        <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs space-y-1 bg-gradient-to-br from-white to-emerald-50/30">
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-[11px] font-bold">Entregues</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-emerald-700">{kpis.entregues}</p>
          <span className="text-[10px] font-medium text-emerald-600">Concluídos na fábrica</span>
        </div>

        {/* Total Frete */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold">Frete Cobrado</span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-slate-800">
            {kpis.totalFreteCobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <span className="text-[10px] text-slate-400">Total contratado</span>
        </div>

        {/* Vínculo SAP */}
        <div className="bg-white rounded-2xl p-4 border border-indigo-100 shadow-xs space-y-2 bg-gradient-to-br from-white to-indigo-50/30">
          <div className="flex items-center justify-between text-indigo-600">
            <span className="text-[11px] font-bold">Vínculo SAP</span>
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-indigo-800">{kpis.vinculadosSap}</span>
            <span className="text-xs font-bold text-indigo-600">{kpis.taxaVinculoPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-indigo-100 overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${kpis.taxaVinculoPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Input de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por CTe, Fornecedor, Cidade, NF ou Pedido SAP..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filtros de Status Operacional */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> Status:
          </span>
          <div className="flex items-center rounded-xl bg-slate-100 p-1 space-x-1">
            <button
              onClick={() => setStatusFilter('todos')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'todos' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos ({kpis.totalCte})
            </button>
            <button
              onClick={() => setStatusFilter('TRANSITO')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'TRANSITO' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Em Trânsito ({kpis.emTransito})
            </button>
            <button
              onClick={() => setStatusFilter('A ENTREGAR')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'A ENTREGAR' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              A Entregar ({kpis.aEntregar})
            </button>
            <button
              onClick={() => setStatusFilter('ENTREGUE')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'ENTREGUE' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Entregue ({kpis.entregues})
            </button>
          </div>

          {/* Filtro de Vínculo SAP */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 space-x-1">
            <button
              onClick={() => setVinculoFilter('todos')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                vinculoFilter === 'todos' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setVinculoFilter('vinculado')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                vinculoFilter === 'vinculado' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Com Pedido SAP
            </button>
            <button
              onClick={() => setVinculoFilter('sem_vinculo')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                vinculoFilter === 'sem_vinculo' ? 'bg-slate-700 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sem Pedido SAP
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de Entregas Bahia Sul */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="mx-auto h-8 w-8 text-amber-500 animate-spin" />
            <p className="text-xs font-semibold text-slate-600">Carregando entregas da Bahia Sul...</p>
          </div>
        ) : entregasFiltradas.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Package className="mx-auto h-12 w-12 text-slate-300" />
            <h4 className="text-sm font-bold text-slate-700">Nenhum conhecimento de entrega encontrado</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {entregas.length === 0
                ? 'Nenhuma planilha da Bahia Sul foi importada ainda. Clique no botão "Importar Planilha" acima para carregar o arquivo da transportadora.'
                : 'Nenhum registro corresponde aos filtros selecionados. Tente ajustar os termos de busca.'}
            </p>
            {entregas.length === 0 && (
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-all cursor-pointer shadow-xs"
              >
                <Upload className="h-4 w-4" />
                <span>Importar Primeira Planilha</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">CTe / Filial</th>
                  <th className="py-3 px-4">Remetente (Fornecedor)</th>
                  <th className="py-3 px-4">Rota (Origem ➔ Destino)</th>
                  <th className="py-3 px-4">Previsão Entrega</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4">Pedido SAP (PO)</th>
                  <th className="py-3 px-4">NFs Embarcadas</th>
                  <th className="py-3 px-4 text-right">Frete Cobrado</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entregasFiltradas.map((item) => {
                  const sitUpper = (item.situacao || '').toUpperCase();
                  const isEmTransito = sitUpper.includes('TRANSITO');
                  const isAEntregar = sitUpper.includes('A ENTREGAR');
                  const isEntregue = sitUpper.includes('ENTREGUE');

                  return (
                    <tr
                      key={item.chave_unica}
                      className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                      onClick={() => setSelectedItem(item)}
                    >
                      {/* CTe / Filial */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900 flex items-center gap-1">
                            <span>{item.cto_numero}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold">
                              {item.cto_filial}
                            </span>
                          </p>
                          <p className="text-[10px] text-slate-400">Série {item.cto_serie || '1'}</p>
                        </div>
                      </td>

                      {/* Remetente */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-800 truncate" title={item.rmt_nome || ''}>
                            {item.rmt_nome || '—'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {item.rmt_cnpj || 'CNPJ não inf.'}
                          </p>
                        </div>
                      </td>

                      {/* Rota */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="text-slate-700 font-medium flex items-center gap-1">
                            <span>{item.org_cidade || '—'}</span>
                            <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="font-bold text-slate-900">{item.dst_cidade || 'TEN'}</span>
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {item.qtd_volumes ? `${item.qtd_volumes} vol.` : ''} {item.kgs_real ? `• ${item.kgs_real} kg` : ''}
                          </p>
                        </div>
                      </td>

                      {/* Previsão Entrega */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-800">
                            {item.prv_entrega ? new Date(item.prv_entrega + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                          </p>
                          {item.entrega ? (
                            <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3" /> Entregue em {new Date(item.entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                          ) : item.statusPrazo === 'atrasado' ? (
                            <p className="text-[10px] text-red-600 font-bold flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> {item.diasAtraso}d atraso
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400">Embarque: {item.embarque ? new Date(item.embarque + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                          )}
                        </div>
                      </td>

                      {/* Situação */}
                      <td className="py-3.5 px-4">
                        {isEmTransito && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                            Em Trânsito
                          </span>
                        )}
                        {isAEntregar && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            A Entregar
                          </span>
                        )}
                        {isEntregue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Entregue
                          </span>
                        )}
                        {!isEmTransito && !isAEntregar && !isEntregue && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                            {item.situacao || 'Normal'}
                          </span>
                        )}
                      </td>

                      {/* Pedido SAP (PO) */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        {editingPoChave === item.chave_unica ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={inputPoNumber}
                              onChange={(e) => setInputPoNumber(e.target.value)}
                              placeholder="Nº Pedido SAP..."
                              className="w-28 px-2 py-1 text-xs border border-indigo-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSavePo(item.chave_unica)}
                              disabled={savingPo}
                              className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                              title="Salvar"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingPoChave(null)}
                              className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                              title="Cancelar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : item.pedidoSap || item.nro_pedido ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <ShieldCheck className="h-3 w-3 text-indigo-500" />
                                {item.nro_pedido || item.pedidoSap?.documento_compra}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingPoChave(item.chave_unica);
                                  setInputPoNumber(item.nro_pedido || item.pedidoSap?.documento_compra || '');
                                }}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity p-0.5"
                                title="Editar pedido vinculado"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            </div>
                            {item.pedidoSap?.fornecedor_name && (
                              <p className="text-[10px] text-slate-500 truncate max-w-[140px]" title={item.pedidoSap.fornecedor_name}>
                                {item.pedidoSap.fornecedor_name}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingPoChave(item.chave_unica);
                              setInputPoNumber('');
                            }}
                            className="text-[10px] font-semibold text-slate-400 hover:text-indigo-600 underline cursor-pointer"
                          >
                            + Vincular PO SAP
                          </button>
                        )}
                      </td>

                      {/* NFs Embarcadas */}
                      <td className="py-3.5 px-4 max-w-[150px]">
                        <p className="font-mono text-[11px] text-slate-700 truncate" title={item.nfs_embarcadas || ''}>
                          {item.nfs_embarcadas || '—'}
                        </p>
                      </td>

                      {/* Frete Cobrado */}
                      <td className="py-3.5 px-4 text-right">
                        <p className="font-bold text-slate-900">
                          {item.frt_cobrado ? item.frt_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                        </p>
                        {item.vlr_mercadoria && (
                          <p className="text-[10px] text-slate-400">
                            Merc: {item.vlr_mercadoria.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem(item);
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-[11px] transition-all cursor-pointer"
                        >
                          <span>Ver</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer com contagem */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Exibindo <strong>{entregasFiltradas.length}</strong> de <strong>{entregas.length}</strong> entregas registradas</span>
          <span className="text-[11px] text-slate-400">Clique em qualquer linha para abrir os detalhes completos do CTe</span>
        </div>
      </div>

      {/* Modal de Detalhes da Entrega */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xl max-w-2xl w-full p-6 text-left space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <span className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <Truck className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <span>CTe {selectedItem.cto_numero}</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      Filial: {selectedItem.cto_filial}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Série {selectedItem.cto_serie} • {selectedItem.cto_documento || 'CONHECIMENTO'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Destaque Vínculo Pedido SAP */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                    Vínculo com Pedido SAP (PO)
                  </h4>
                </div>
                {selectedItem.pedidoEncontrado && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    Casado com Sucesso
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[11px] text-slate-500 font-semibold">Número do Pedido SAP:</p>
                  <p className="font-mono font-bold text-slate-800 text-sm">
                    {selectedItem.nro_pedido || selectedItem.pedidoSap?.documento_compra || 'Não informado'}
                  </p>
                </div>
                {selectedItem.pedidoSap && (
                  <div>
                    <p className="text-[11px] text-slate-500 font-semibold">Fornecedor no SAP:</p>
                    <p className="font-semibold text-slate-800">{selectedItem.pedidoSap.fornecedor_name}</p>
                  </div>
                )}
                {selectedItem.pedidoSap?.data_pedido && (
                  <div>
                    <p className="text-[11px] text-slate-500 font-semibold">Data do Pedido SAP:</p>
                    <p className="text-slate-800">{new Date(selectedItem.pedidoSap.data_pedido).toLocaleDateString('pt-BR')}</p>
                  </div>
                )}
                {selectedItem.pedidoSap?.valor_brl && (
                  <div>
                    <p className="text-[11px] text-slate-500 font-semibold">Valor do Pedido SAP:</p>
                    <p className="font-bold text-slate-900">
                      {selectedItem.pedidoSap.valor_brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Grid de Informações da Entrega */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              
              {/* Partes Envolvidas */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                <p className="font-bold text-slate-700 border-b border-slate-200 pb-1">Partes Envolvidas</p>
                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-slate-400">Remetente (Fornecedor):</span>
                    <p className="font-semibold text-slate-800">{selectedItem.rmt_nome || '—'}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{selectedItem.rmt_cnpj}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Destinatário:</span>
                    <p className="font-semibold text-slate-800">{selectedItem.dst_nome || '—'}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{selectedItem.dst_cnpj}</p>
                  </div>
                </div>
              </div>

              {/* Prazos e Datas */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                <p className="font-bold text-slate-700 border-b border-slate-200 pb-1">Datas & Prazos</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400">Emissão:</span>
                    <p className="font-medium text-slate-800">{selectedItem.emissao ? new Date(selectedItem.emissao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Embarque:</span>
                    <p className="font-medium text-slate-800">{selectedItem.embarque ? new Date(selectedItem.embarque + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Previsão Entrega:</span>
                    <p className="font-bold text-amber-700">{selectedItem.prv_entrega ? new Date(selectedItem.prv_entrega + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Entrega Real:</span>
                    <p className="font-bold text-emerald-700">{selectedItem.entrega ? new Date(selectedItem.entrega + 'T00:00:00').toLocaleDateString('pt-BR') : 'Pendente'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Prazo Contratado:</span>
                    <p className="text-slate-800">{selectedItem.prz_contratado ? new Date(selectedItem.prz_contratado + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Chegada Terminal:</span>
                    <p className="text-slate-800">{selectedItem.chegada ? new Date(selectedItem.chegada + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                </div>
              </div>

              {/* Rota e Carga */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                <p className="font-bold text-slate-700 border-b border-slate-200 pb-1">Rota & Carga</p>
                <div className="space-y-1 text-[11px]">
                  <p><span className="text-slate-400">Origem:</span> <strong className="text-slate-800">{selectedItem.org_cidade || '—'}</strong></p>
                  <p><span className="text-slate-400">Destino:</span> <strong className="text-slate-800">{selectedItem.dst_cidade || '—'}</strong></p>
                  <p><span className="text-slate-400">Volumes:</span> <strong className="text-slate-800">{selectedItem.qtd_volumes || '—'}</strong></p>
                  <p><span className="text-slate-400">Peso Real:</span> <strong className="text-slate-800">{selectedItem.kgs_real ? `${selectedItem.kgs_real} kg` : '—'}</strong></p>
                  <p><span className="text-slate-400">Peso Cubado:</span> <strong className="text-slate-800">{selectedItem.kgs_cubado ? `${selectedItem.kgs_cubado} kg` : '—'}</strong></p>
                  <p><span className="text-slate-400">NFs Embarcadas:</span> <strong className="font-mono text-slate-800">{selectedItem.nfs_embarcadas || '—'}</strong></p>
                </div>
              </div>

              {/* Valores Financeiros */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                <p className="font-bold text-slate-700 border-b border-slate-200 pb-1">Valores Financeiros</p>
                <div className="space-y-1 text-[11px]">
                  <p>
                    <span className="text-slate-400">Valor da Mercadoria:</span>{' '}
                    <strong className="text-slate-800">
                      {selectedItem.vlr_mercadoria ? selectedItem.vlr_mercadoria.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                    </strong>
                  </p>
                  <p>
                    <span className="text-slate-400">Frete Cobrado:</span>{' '}
                    <strong className="text-emerald-700 font-black text-sm">
                      {selectedItem.frt_cobrado ? selectedItem.frt_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                    </strong>
                  </p>
                  <p>
                    <span className="text-slate-400">Tipo de Embarque:</span>{' '}
                    <span className="font-semibold text-slate-700">{selectedItem.tpo_embarque || 'NORMAL'}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Observações e Cubagem */}
            {selectedItem.obs_diversos && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1 text-xs">
                <p className="font-bold text-slate-700">Observações & Cubagem:</p>
                <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-mono bg-white p-2.5 rounded-lg border border-slate-200">
                  {selectedItem.obs_diversos}
                </pre>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Upload de Planilha */}
      <BahiaSulUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => {
          loadData();
          setIsUploadModalOpen(false);
          toast.success('Dados da Bahia Sul atualizados!');
        }}
      />
    </div>
  );
}
