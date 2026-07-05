/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileCheck, ShieldAlert, ArrowDownUp, CheckCircle, XCircle, 
  RefreshCw, ClipboardList, Clock, AlertTriangle, MessageSquare, Info 
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Request } from '../types';

interface ApprovalsProps {
  user: Profile;
}

export default function Approvals({ user }: ApprovalsProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  useEffect(() => {
    loadRequests();
  }, [user, activeTab]);

  const loadRequests = () => {
    // Managers can approve requests of their own sector
    const all = localDb.getRequests();
    let filtered: Request[] = [];

    if (activeTab === 'pending') {
      filtered = all.filter(r => 
        r.type === 'compra' && 
        r.status === 'pendente' && 
        (r.solicitante_sector_id === user.sector_id || user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos'))
      );

      // Sort: criticality DESC, need date ASC
      filtered.sort((a, b) => {
        if (b.criticality !== a.criticality) {
          return b.criticality - a.criticality; // high criticality first
        }
        const dateA = a.data_necessidade ? new Date(a.data_necessidade).getTime() : 0;
        const dateB = b.data_necessidade ? new Date(b.data_necessidade).getTime() : 0;
        return dateA - dateB; // soonest need date first
      });
    } else {
      filtered = all.filter(r => 
        r.type === 'compra' && 
        r.status !== 'pendente' && 
        (r.solicitante_sector_id === user.sector_id || user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos'))
      );
      // Sort by newest first
      filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    setRequests(filtered);

    if (filtered.length > 0) {
      setSelectedId(filtered[0].id);
    } else {
      setSelectedId(null);
    }
  };

  const selectedRequest = requests.find(r => r.id === selectedId);
  const items = selectedRequest ? localDb.getRequestItems(selectedRequest.id) : [];

  const handleAction = (action: 'aprovar' | 'rejeitar' | 'revisar') => {
    if (!selectedRequest) return;
    setError('');

    if (action !== 'aprovar' && !justification.trim()) {
      setError('A justificativa é obrigatória para rejeitar ou solicitar revisão.');
      return;
    }

    let nextStatus: 'aprovada' | 'rejeitada' | 'em_revisao' = 'aprovada';
    if (action === 'rejeitar') nextStatus = 'rejeitada';
    if (action === 'revisar') nextStatus = 'em_revisao';

    const ok = localDb.updateRequestStatus(selectedRequest.id, nextStatus, user.id, justification.trim());
    if (ok) {
      setJustification('');
      setFeedbackMsg(`Solicitação #${selectedRequest.number} atualizada com sucesso!`);
      setTimeout(() => setFeedbackMsg(''), 3000);
      loadRequests();
    } else {
      setError('Ocorreu um erro ao atualizar o status. Verifique suas permissões.');
    }
  };

  const getCriticalityBadge = (level: number) => {
    const colors: Record<number, string> = {
      1: 'bg-slate-100 text-slate-800 border-slate-200',
      2: 'bg-emerald-50 text-emerald-800 border-emerald-100',
      3: 'bg-amber-50 text-amber-800 border-amber-100',
      4: 'bg-orange-50 text-orange-800 border-orange-100',
      5: 'bg-red-50 text-red-800 border-red-100'
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${colors[level] || 'bg-gray-100'}`}>
        GRAU {level}
      </span>
    );
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      rascunho: 'Rascunho',
      pendente: 'Pendente',
      aprovada: 'Aprovada',
      rejeitada: 'Rejeitada',
      em_revisao: 'Revisão',
      concluida: 'Concluída'
    };
    return labels[status] || status;
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] -m-6 overflow-hidden">
      
      {/* Left panel: Pendentes or Sector History */}
      <div className="w-full lg:w-2/5 border-r border-slate-100 bg-white flex flex-col h-full text-left">
        <div className="p-4 border-b border-slate-50 space-y-3">
          <h2 className="text-lg font-bold text-slate-800">Aprovações de Compra</h2>
          
          <div className="flex rounded-lg border border-slate-100 p-0.5 bg-slate-50/50 text-xs">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex-1 rounded py-1.5 font-bold transition-all text-center cursor-pointer ${activeTab === 'pending' ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Fila Pendente ({localDb.getRequests().filter(r => r.type === 'compra' && r.status === 'pendente' && (r.solicitante_sector_id === user.sector_id || user.roles.includes('admin'))).length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 rounded py-1.5 font-bold transition-all text-center cursor-pointer ${activeTab === 'history' ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Histórico do Setor
            </button>
          </div>
        </div>

        {/* List of Requests */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {requests.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">Nenhuma solicitação nesta fila.</div>
          ) : (
            requests.map((r) => {
              const isSelected = r.id === selectedId;
              const formattedDate = r.data_necessidade ? new Date(r.data_necessidade).toLocaleDateString('pt-BR') : '';
              
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex flex-col space-y-1.5 ${isSelected ? 'bg-emerald-50/35 border-l-4 border-emerald-600' : 'border-l-4 border-transparent'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-500">#{r.number}</span>
                    {getCriticalityBadge(r.criticality)}
                  </div>
                  <p className="text-xs font-semibold text-slate-800 truncate max-w-[240px]">
                    {r.justificativa || 'Solicitação de Compra'}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Precisa até: <strong>{formattedDate}</strong></span>
                    {activeTab === 'history' && (
                      <span className="font-bold text-slate-500 uppercase">{getStatusLabel(r.status)}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Active request details and approval panel */}
      <div className="flex-1 bg-slate-50/50 flex flex-col h-full overflow-hidden text-left">
        {feedbackMsg && (
          <div className="bg-emerald-600 text-white p-3 text-xs font-bold text-center shrink-0">
            {feedbackMsg}
          </div>
        )}

        {selectedRequest ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* Header detail */}
            <div className="bg-white p-6 border-b border-slate-100 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Análise de Solicitação #{selectedRequest.number}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Disparado por {selectedRequest.solicitante_id} • Setor Solicitante</p>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-400">ESTIMATIVA:</span>
                  <span className="text-sm font-bold text-slate-900">
                    R$ {items.reduce((acc, i) => acc + (i.estimated_value * i.quantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Scrolling details Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* S1: Justification detail */}
              <div className="rounded-xl bg-white p-5 border border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Justificativa e Aplicação</h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedRequest.justificativa}</p>
                {selectedRequest.data_necessidade && (
                  <div className="flex items-center space-x-2 text-xs text-slate-500 pt-2 border-t border-slate-50">
                    <Clock className="h-4 w-4" />
                    <span>Data máxima de entrega aceita: <strong>{new Date(selectedRequest.data_necessidade).toLocaleDateString('pt-BR')}</strong></span>
                  </div>
                )}
              </div>

              {/* Items requested */}
              <div className="rounded-xl bg-white border border-slate-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/50">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Itens solicitados ({items.length})</h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <div key={it.id} className="p-4 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-semibold text-slate-800">{idx + 1}. {it.description}</p>
                        <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {it.sap_code ? `SAP: ${it.sap_code}` : 'Sem código SAP associado'} • Marca: {it.brand || 'Não informada'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-700">{it.quantity} {it.unit}</p>
                        {it.estimated_value > 0 && (
                          <p className="text-slate-400 text-[10px]">R$ {it.estimated_value.toLocaleString('pt-BR')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Decision Panel (Only if pending) */}
              {activeTab === 'pending' ? (
                <div className="rounded-xl bg-white p-6 border border-slate-100 space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Painel de Decisão</h4>
                  
                  {error && (
                    <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                      <AlertTriangle className="mr-2 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Justificativa ou parecer (Obrigatório para devoluções/rejeições)</label>
                    <textarea
                      rows={3}
                      placeholder="Parecer técnico de aprovação ou justificativa clara em caso de devolução ou rejeição da compra."
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 py-2 px-3 text-xs focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2.5 pt-2">
                    <button
                      onClick={() => handleAction('aprovar')}
                      className="flex-1 min-w-[120px] rounded-lg bg-emerald-700 hover:bg-emerald-900 text-white font-bold text-xs py-2 px-4 transition-colors flex items-center justify-center cursor-pointer"
                    >
                      <CheckCircle className="mr-1.5 h-4.5 w-4.5" />
                      <span>Aprovar compra</span>
                    </button>
                    
                    <button
                      onClick={() => handleAction('revisar')}
                      className="flex-1 min-w-[120px] rounded-lg border border-yellow-300 hover:bg-yellow-50 text-yellow-800 font-bold text-xs py-2 px-4 transition-colors flex items-center justify-center cursor-pointer"
                    >
                      <RefreshCw className="mr-1.5 h-4.5 w-4.5" />
                      <span>Devolver p/ Revisão</span>
                    </button>

                    <button
                      onClick={() => handleAction('rejeitar')}
                      className="flex-1 min-w-[120px] rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs py-2 px-4 transition-colors flex items-center justify-center cursor-pointer"
                    >
                      <XCircle className="mr-1.5 h-4.5 w-4.5" />
                      <span>Rejeitar</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-5 border border-slate-100 text-slate-500 text-xs">
                  <p>Esta solicitação já foi analisada e possui parecer definitivo. Para alterações, entre em contato com o setor de Suprimentos.</p>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <FileCheck className="h-12 w-12 text-slate-300 mb-2" />
            <p className="text-sm">Selecione uma solicitação pendente para revisar e aprovar.</p>
          </div>
        )}
      </div>

    </div>
  );
}
