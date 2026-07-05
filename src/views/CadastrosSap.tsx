/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  KeyRound, Search, Filter, CheckCircle, Clock, AlertTriangle, ArrowRight, UserPlus, HelpCircle, Check, Info, FileText
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Request, Sector } from '../types';

interface CadastrosSapProps {
  user: Profile;
}

export default function CadastrosSap({ user }: CadastrosSapProps) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedReq, setSelectedReq] = useState<Request | null>(null);
  
  // Filter state
  const [viewTab, setViewTab] = useState<'meus' | 'fila' | 'todos'>('fila');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');

  // Action fields
  const [question, setQuestion] = useState('');
  const [resolution, setResolution] = useState('');
  const [sapResultCode, setSapResultCode] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    loadData();
  }, [viewTab, statusFilter, typeFilter]);

  const loadData = () => {
    let list = localDb.getRequests().filter(r => r.type === 'cadastro_sap');
    const allSectors = localDb.getSectors();
    setSectors(allSectors);

    // Apply View tab filter
    if (viewTab === 'meus') {
      list = list.filter(r => r.atendente_id === user.id);
    } else if (viewTab === 'fila') {
      list = list.filter(r => !r.atendente_id || r.status === 'aberto');
    }

    // Apply Status filter
    if (statusFilter !== 'todos') {
      list = list.filter(r => r.status === statusFilter);
    }

    // Apply Registration Type filter
    if (typeFilter !== 'todos') {
      list = list.filter(r => r.registration_type === typeFilter);
    }

    // Apply text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => 
        r.number.includes(q) || 
        r.solicitante_name.toLowerCase().includes(q) ||
        (r.justificativa && r.justificativa.toLowerCase().includes(q))
      );
    }

    // Sort: criticality desc, then created_at asc
    list.sort((a, b) => {
      if (b.criticality !== a.criticality) {
        return b.criticality - a.criticality;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    setRequests(list);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    loadData();
  };

  const handleSelectRequest = (req: Request) => {
    setSelectedReq(req);
    setQuestion('');
    setResolution('');
    setSapResultCode('');
    setActionSuccess('');
    setActionError('');
  };

  const handleAssumir = () => {
    if (!selectedReq) return;
    try {
      localDb.assignAtendente(selectedReq.id, user.id, user.name);
      
      // Update local state
      setActionSuccess('Você assumiu este atendimento!');
      setTimeout(() => setActionSuccess(''), 3000);
      
      // Refresh
      const updatedReq = localDb.getRequests().find(r => r.id === selectedReq.id);
      if (updatedReq) setSelectedReq(updatedReq);
      loadData();
    } catch (err) {
      setActionError('Falha ao assumir atendimento.');
    }
  };

  const handleAguardarSolicitante = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !question.trim()) {
      setActionError('Por favor, informe a pergunta para o solicitante.');
      return;
    }

    try {
      localDb.transitionRequestStatus(
        selectedReq.id, 
        'aguardando_solicitante', 
        `Dúvida/Pendência de Suprimentos: ${question}`
      );
      
      // Post comment
      localDb.addRequestComment(selectedReq.id, question, false);
      
      setActionSuccess('Solicitação colocada em aguardo.');
      setQuestion('');
      
      const updatedReq = localDb.getRequests().find(r => r.id === selectedReq.id);
      if (updatedReq) setSelectedReq(updatedReq);
      loadData();
    } catch (err) {
      setActionError('Falha ao atualizar status.');
    }
  };

  const handleResolver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !resolution.trim()) {
      setActionError('A nota de resolução é obrigatória.');
      return;
    }

    try {
      let finalComment = `Cadastro Finalizado: ${resolution}`;
      if (sapResultCode.trim()) {
        finalComment += ` | Código SAP Gerado: ${sapResultCode}`;
      }

      localDb.transitionRequestStatus(selectedReq.id, 'resolvido', finalComment);
      
      // Add official comment
      localDb.addRequestComment(selectedReq.id, finalComment, false);
      
      setActionSuccess('Solicitação marcada como resolvida!');
      setResolution('');
      setSapResultCode('');

      const updatedReq = localDb.getRequests().find(r => r.id === selectedReq.id);
      if (updatedReq) setSelectedReq(updatedReq);
      loadData();
    } catch (err) {
      setActionError('Falha ao resolver cadastro.');
    }
  };

  const getSlaTimeRemaining = (req: Request) => {
    // 120h for scale 1 down to 2h for scale 5
    const slaHoursMap: Record<number, number> = { 1: 120, 2: 72, 3: 24, 4: 8, 5: 2 };
    const allowedHours = slaHoursMap[req.criticality] || 24;
    
    const start = new Date(req.created_at).getTime();
    const elapsed = Date.now() - start;
    const elapsedHours = elapsed / (3600 * 1000);
    const remaining = allowedHours - elapsedHours;

    if (req.status === 'resolvido' || req.status === 'fechado') return 'Resolvido';
    if (req.status === 'aguardando_solicitante') return 'Pausado';

    if (remaining < 0) {
      return `Atrasado ${Math.abs(Math.round(remaining))}h`;
    }
    return `${Math.round(remaining)}h restantes`;
  };

  const getSlaColor = (req: Request) => {
    if (req.status === 'resolvido' || req.status === 'fechado') return 'bg-emerald-100 text-emerald-800';
    if (req.status === 'aguardando_solicitante') return 'bg-slate-100 text-slate-500';

    const slaHoursMap: Record<number, number> = { 1: 120, 2: 72, 3: 24, 4: 8, 5: 2 };
    const allowed = slaHoursMap[req.criticality] || 24;
    const start = new Date(req.created_at).getTime();
    const elapsed = Date.now() - start;
    const pct = 1 - (elapsed / (allowed * 3600 * 1000));

    if (pct < 0) return 'bg-red-100 text-red-800 border-red-200 animate-pulse';
    if (pct < 0.5) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'aberto': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'em_atendimento': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'aguardando_solicitante': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'resolvido': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'fechado': return 'bg-slate-50 text-slate-500 border-slate-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      aberto: 'Aberto na Fila',
      em_atendimento: 'Em Atendimento',
      aguardando_solicitante: 'Aguardando Solicitante',
      resolvido: 'Resolvido',
      fechado: 'Fechado/Concluído'
    };
    return labels[status] || status;
  };

  const getCriticalityBadge = (crit: number) => {
    const map: Record<number, { text: string; color: string }> = {
      1: { text: '1 - Baixa', color: 'bg-slate-100 text-slate-700' },
      2: { text: '2 - Moderada', color: 'bg-green-100 text-green-700' },
      3: { text: '3 - Urgente', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
      4: { text: '4 - Crítica', color: 'bg-orange-100 text-orange-800 border-orange-200' },
      5: { text: '5 - Impeditiva', color: 'bg-red-100 text-red-800 border-red-200 animate-pulse' }
    };
    const c = map[crit] || { text: String(crit), color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] border ${c.color}`}>
        {c.text}
      </span>
    );
  };

  const getSectorName = (id: string) => {
    return sectors.find(s => s.id === id)?.name || id;
  };

  return (
    <div className="space-y-6 text-left py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-emerald-700" /> Cadastros SAP
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Fila coletiva do setor Suprimentos para atendimento de solicitações de novos itens ou fornecedores.
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Table Column */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Filter Bar */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-center gap-2 justify-between">
              {/* Toggles */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs w-full sm:w-auto">
                <button
                  onClick={() => setViewTab('fila')}
                  className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${viewTab === 'fila' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Fila Pendente
                </button>
                <button
                  onClick={() => setViewTab('meus')}
                  className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${viewTab === 'meus' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Meus Atendimentos
                </button>
                <button
                  onClick={() => setViewTab('todos')}
                  className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${viewTab === 'todos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Ver Todos
                </button>
              </div>

              {/* Text Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar nº ou solicitante..."
                  value={search}
                  onChange={handleSearchChange}
                  className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1 text-slate-500 font-semibold">
                <Filter className="h-3.5 w-3.5" /> Filtrar por:
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); }}
                className="rounded border border-slate-200 p-1 bg-white focus:outline-none focus:border-emerald-500 text-slate-700"
              >
                <option value="todos">Todos os Status</option>
                <option value="aberto">Aberto</option>
                <option value="em_atendimento">Em Atendimento</option>
                <option value="aguardando_solicitante">Aguardando Solicitante</option>
                <option value="resolvido">Resolvido</option>
                <option value="fechado">Fechado</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); }}
                className="rounded border border-slate-200 p-1 bg-white focus:outline-none focus:border-emerald-500 text-slate-700"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="Item">Item</option>
                <option value="Fornecedor">Fornecedor</option>
              </select>
            </div>
          </div>

          {/* Queue List Table */}
          <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Número</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Solicitante</th>
                    <th className="py-3 px-4">Criticidade</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">SLA</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        Nenhuma solicitação de cadastro SAP encontrada.
                      </td>
                    </tr>
                  ) : (
                    requests.map((req) => (
                      <tr 
                        key={req.id} 
                        onClick={() => handleSelectRequest(req)}
                        className={`hover:bg-slate-50/50 cursor-pointer transition-colors ${selectedReq?.id === req.id ? 'bg-emerald-50/30' : ''}`}
                      >
                        <td className="py-3 px-4 font-bold text-slate-800">#{req.number}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-indigo-50 border border-indigo-150 text-indigo-700">
                            {req.registration_type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-bold text-slate-700">{req.solicitante_name}</p>
                            <p className="text-[10px] text-slate-400">{getSectorName(req.solicitante_sector_id)}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">{getCriticalityBadge(req.criticality)}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${getStatusBadgeColor(req.status)}`}>
                            {getStatusLabel(req.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${getSlaColor(req)}`}>
                            {getSlaTimeRemaining(req)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button 
                            className="text-emerald-700 hover:text-emerald-900 font-bold text-xs flex items-center gap-1 mx-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectRequest(req);
                            }}
                          >
                            Atender <ArrowRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Action / Detail Drawer Column */}
        <div className="lg:col-span-1">
          {selectedReq ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md space-y-6">
              
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">Solicitação #{selectedReq.number}</span>
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                      {selectedReq.registration_type}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Aberta em {new Date(selectedReq.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedReq(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              {/* Details */}
              <div className="space-y-4 text-xs">
                <div>
                  <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Item / Fornecedor</h4>
                  <p className="font-bold text-slate-800 text-sm mt-1">{selectedReq.justificativa?.split('|')[0] || selectedReq.justificativa}</p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Solicitante</h4>
                  <p className="font-semibold text-slate-700 mt-1">
                    {selectedReq.solicitante_name} ({getSectorName(selectedReq.solicitante_sector_id)})
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Justificativa da Demanda</h4>
                  <p className="text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-100 italic mt-1">
                    &ldquo;{selectedReq.justificativa}&rdquo;
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Criticidade</h4>
                    <div className="mt-1">{getCriticalityBadge(selectedReq.criticality)}</div>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Status Atual</h4>
                    <span className={`inline-flex mt-1 px-2 py-0.5 rounded border text-[10px] font-bold ${getStatusBadgeColor(selectedReq.status)}`}>
                      {getStatusLabel(selectedReq.status)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Atendente Atribuído</h4>
                  <p className="font-semibold text-slate-700 mt-1 flex items-center gap-1.5">
                    {selectedReq.atendente_id ? (
                      <span className="text-slate-800 font-bold">{selectedReq.atendente_name}</span>
                    ) : (
                      <span className="text-slate-400 italic">Ninguém assumiu ainda</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Forms / Buttons */}
              <div className="border-t border-slate-100 pt-5 space-y-4">
                
                {actionSuccess && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-100 flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{actionSuccess}</span>
                  </div>
                )}

                {actionError && (
                  <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                {/* 1. Assumir Atendimento */}
                {!selectedReq.atendente_id && (
                  <button
                    onClick={handleAssumir}
                    className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 px-4 cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <UserPlus className="h-4 w-4" /> Assumir Cadastro SAP
                  </button>
                )}

                {/* 2. Atendente is current user & state is not final */}
                {selectedReq.atendente_id === user.id && selectedReq.status !== 'resolvido' && selectedReq.status !== 'fechado' && (
                  <div className="space-y-6">
                    
                    {/* Ask Solicitante (Aguardando Solicitante) */}
                    <form onSubmit={handleAguardarSolicitante} className="space-y-2 border border-slate-100 p-3 rounded-xl bg-slate-50/50">
                      <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <HelpCircle className="h-3.5 w-3.5 text-blue-500" /> Solicitar Esclarecimento
                      </p>
                      <p className="text-[10px] text-slate-400">Insira a pergunta ou documento complementar pendente:</p>
                      <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Ex: Por favor anexe a ficha técnica do fabricante..."
                        className="w-full rounded border border-slate-200 p-2 text-xs focus:border-emerald-500 focus:outline-none bg-white min-h-[60px]"
                        required
                      />
                      <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] py-1.5 px-3 rounded cursor-pointer transition-colors"
                      >
                        Enviar & Pausar SLA
                      </button>
                    </form>

                    {/* Resolve Cadastro */}
                    <form onSubmit={handleResolver} className="space-y-3.5 border border-slate-100 p-3 rounded-xl bg-emerald-50/10">
                      <p className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Resolver Cadastro SAP
                      </p>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Nota de Resolução / Homologação</label>
                        <textarea
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                          placeholder="Ex: Item homologado no SAP sob o grupo de mercadorias..."
                          className="w-full rounded border border-slate-200 p-2 text-xs focus:border-emerald-500 focus:outline-none bg-white min-h-[60px]"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Novo Código SAP Gerado (Opcional)</label>
                        <input
                          type="text"
                          value={sapResultCode}
                          onChange={(e) => setSapResultCode(e.target.value)}
                          placeholder="Ex: 10000259"
                          className="w-full rounded border border-slate-200 p-2 text-xs focus:border-emerald-500 focus:outline-none bg-white font-mono"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] py-2 px-3 rounded cursor-pointer transition-colors"
                      >
                        Marcar como Concluído / Resolvido
                      </button>
                    </form>

                  </div>
                )}

                {selectedReq.status === 'resolvido' && (
                  <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-100 text-center space-y-2">
                    <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto" />
                    <p className="text-xs font-bold text-emerald-800">Cadastro Resolvido</p>
                    <p className="text-[11px] text-slate-500">
                      Aguardando auto-fechamento do sistema ou confirmação de fechamento pelo solicitante.
                    </p>
                  </div>
                )}

              </div>

            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400 space-y-2 bg-slate-50/30">
              <KeyRound className="h-8 w-8 mx-auto text-slate-300" />
              <p className="text-xs font-semibold">Nenhuma Solicitação Selecionada</p>
              <p className="text-[11px] text-slate-400">Clique em qualquer linha da fila ao lado para ver os detalhes, assumir ou resolver a solicitação.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
