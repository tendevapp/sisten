/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, Paperclip, Send, MessageSquare, History, 
  Calendar, Check, AlertCircle, Copy, CheckCircle2, ChevronRight, Download, Upload, Loader2, Info, Star
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Request, RequestItem, RequestComment, RequestStatusHistory } from '../types';

interface MyRequestsProps {
  user: Profile;
}

export default function MyRequests({ user }: MyRequestsProps) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [typeFilter, setTypeFilter] = useState('Todos');
  
  // New comment text
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState<'public' | 'internal'>('public');

  // File upload state for details
  const [uploadingFile, setUploadingFile] = useState(false);

  // Satisfaction Star Rating state
  const [selectRating, setSelectRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState('');

  useEffect(() => {
    setSelectRating(0);
    setHoverRating(0);
    setRatingComment('');
  }, [selectedId]);

  const handleSendRating = () => {
    if (!selectedRequest || selectRating === 0) return;
    localDb.evaluateTicket(selectedRequest.id, selectRating, ratingComment);
    setSelectRating(0);
    setHoverRating(0);
    setRatingComment('');
    // Refresh requests list
    setRequests(getFilteredUserRequests(localDb.getRequests()));
  };

  const getFilteredUserRequests = (allReqs: Request[]) => {
    return allReqs.filter(r => {
      if (r.type === 'chamado') {
        return r.solicitante_id === user.id;
      }
      return (
        r.solicitante_id === user.id || 
        (user.roles.includes('gestor') && r.solicitante_sector_id === user.sector_id) ||
        user.roles.includes('admin') ||
        user.roles.includes('coordenador_suprimentos') ||
        (user.roles.includes('comprador') && r.comprador_id === user.id) ||
        (user.roles.includes('atendente') && r.target_sector_id === user.sector_id)
      );
    });
  };

  useEffect(() => {
    // Load requests
    const list = getFilteredUserRequests(localDb.getRequests());
    setRequests(list);

    // Deep link check
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const idParam = urlParams.get('id');
    if (idParam) {
      const match = list.find(r => r.id === idParam);
      if (match) setSelectedId(match.id);
    } else if (list.length > 0) {
      setSelectedId(list[0].id);
    }
  }, [user]);

  // Read active selected request
  const selectedRequest = requests.find(r => r.id === selectedId);
  const items = selectedRequest ? localDb.getRequestItems(selectedRequest.id) : [];
  const comments = selectedRequest ? localDb.getRequestComments(selectedRequest.id) : [];
  const history = selectedRequest ? localDb.getRequestHistory(selectedRequest.id) : [];

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !newComment.trim()) return;

    localDb.addComment(selectedRequest.id, user.id, newComment.trim(), commentType);
    setNewComment('');
    
    // Refresh list/data
    setRequests(getFilteredUserRequests(localDb.getRequests()));
  };

  const handleSimulateAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedRequest || !e.target.files?.length) return;
    setUploadingFile(true);

    setTimeout(() => {
      const fileName = e.target.files![0].name;
      localDb.addAttachment(selectedRequest.id, fileName);
      setUploadingFile(false);
      
      // Refresh list
      setRequests(getFilteredUserRequests(localDb.getRequests()));
    }, 1000);
  };

  // Filter requests
  const filteredRequests = requests.filter(r => {
    const numMatch = r.number.toLowerCase().includes(searchQuery.toLowerCase());
    const descMatch = (r.justificativa || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSearch = numMatch || descMatch;

    const matchesStatus = statusFilter === 'Todos' || r.status === statusFilter;
    const matchesType = typeFilter === 'Todos' || r.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const getCriticalityColor = (level: number) => {
    const colors: Record<number, string> = {
      1: 'bg-slate-400',
      2: 'bg-emerald-500',
      3: 'bg-amber-500',
      4: 'bg-orange-500',
      5: 'bg-red-500'
    };
    return colors[level] || 'bg-slate-400';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      rascunho: 'Rascunho',
      pendente: 'Pendente',
      aprovada: 'Aprovada',
      rejeitada: 'Rejeitada',
      em_revisao: 'Em Revisão',
      aberto: 'Aberto',
      em_atendimento: 'Em Atendimento',
      aguardando_solicitante: 'Aguardando Solicitante',
      resolvido: 'Resolvido',
      fechado: 'Fechado',
      reaberto: 'Reaberto',
      cancelada: 'Cancelado'
    };
    return labels[status] || status;
  };

  // Stepper timeline calculation helper
  const getStepperSteps = (type: string) => {
    if (type === 'compra') {
      return [
        { key: 'pendente', label: 'Aprovação Gestor' },
        { key: 'aprovada', label: 'Suprimentos (Fila)' },
        { key: 'em_cotacao', label: 'Em Cotação' },
        { key: 'pedido_emitido', label: 'Pedido Emitido' },
        { key: 'concluida', label: 'Entregue' }
      ];
    } else if (type === 'cadastro_sap') {
      return [
        { key: 'pendente', label: 'Triagem Suprimentos' },
        { key: 'em_revisao', label: 'Em Análise' },
        { key: 'aprovada', label: 'Cadastrado no SAP' }
      ];
    } else { // chamado
      return [
        { key: 'aberto', label: 'Aberto' },
        { key: 'em_atendimento', label: 'Em Atendimento' },
        { key: 'aguardando_solicitante', label: 'Pendente Solicitante' },
        { key: 'resolvido', label: 'Resolvido' }
      ];
    }
  };

  const getActiveStepIndex = (currentStatus: string, steps: { key: string }[]) => {
    const idx = steps.findIndex(s => s.key === currentStatus);
    if (idx !== -1) return idx;
    // Fallbacks if status is not in basic pipeline
    if (currentStatus === 'rejeitada') return -1;
    if (currentStatus === 'cancelada') return -1;
    return 0;
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] -m-6 overflow-hidden">
      
      {/* Left panel: Searchable Table / List of Requests */}
      <div className="w-full lg:w-2/5 border-r border-slate-100 bg-white flex flex-col h-full text-left">
        {/* Filter header */}
        <div className="p-4 border-b border-slate-50 space-y-3">
          <h2 className="text-lg font-bold text-slate-800">Minhas Solicitações</h2>
          
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar por nº, palavra-chave..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-4 text-xs focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full mt-0.5 rounded border border-slate-200 bg-white py-1 px-2 text-xs focus:outline-none"
              >
                <option value="Todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="aprovada">Aprovada / Ativa</option>
                <option value="rejeitada">Rejeitada</option>
                <option value="em_atendimento">Em Atendimento</option>
                <option value="resolvido">Resolvida</option>
              </select>
            </div>

            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Tipo</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full mt-0.5 rounded border border-slate-200 bg-white py-1 px-2 text-xs focus:outline-none"
              >
                <option value="Todos">Todos</option>
                <option value="compra">Compra</option>
                <option value="cadastro_sap">Cadastro SAP</option>
                <option value="chamado">Helpdesk</option>
              </select>
            </div>
          </div>
        </div>

        {/* Requests List content */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredRequests.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">Nenhuma solicitação encontrada com os filtros selecionados.</div>
          ) : (
            filteredRequests.map((r) => {
              const isSelected = r.id === selectedId;
              const formattedDate = new Date(r.created_at).toLocaleDateString('pt-BR');
              
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-start justify-between ${isSelected ? 'bg-emerald-50/35 border-l-4 border-emerald-600' : 'border-l-4 border-transparent'}`}
                >
                  <div className="space-y-1 pr-3 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-slate-500">#{r.number}</span>
                      <span className={`h-2 w-2 rounded-full ${getCriticalityColor(r.criticality)}`} title={`Criticidade Grau ${r.criticality}`} />
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1 py-0.5 rounded uppercase">{r.type === 'compra' ? 'Compra' : (r.type === 'cadastro_sap' ? 'SAP' : 'TI/Fac')}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 truncate max-w-[200px]">
                      {r.justificativa || 'Solicitação'}
                    </p>
                    <span className="text-[10px] text-slate-400 block">{formattedDate} • por {r.solicitante_id === user.id ? 'mim' : 'Colega'}</span>
                  </div>
                  
                  <div className="text-right shrink-0">
                    <span className="inline-block text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                      {getStatusLabel(r.status)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Live Stepper, Timeline history log, detailed items, Comments Thread */}
      <div className="flex-1 bg-slate-50/50 flex flex-col h-full overflow-hidden text-left">
        {selectedRequest ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Detail Header */}
            <div className="bg-white p-6 border-b border-slate-100 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-bold text-slate-900">Solicitação #{selectedRequest.number}</h3>
                    <span className="text-xs bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded uppercase">
                      {selectedRequest.type === 'compra' ? 'Compra de Material' : (selectedRequest.type === 'cadastro_sap' ? 'Cadastro SAP' : 'Suporte')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Criada em {new Date(selectedRequest.created_at).toLocaleString('pt-BR')}</p>
                </div>

                <div className="flex items-center space-x-2 self-start sm:self-center">
                  <span className="text-xs font-bold text-slate-400">CRITICIDADE:</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold ${selectedRequest.criticality >= 4 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-800'}`}>
                    Grau {selectedRequest.criticality}
                  </span>
                </div>
              </div>

              {/* Dynamic Stepper progress pipeline */}
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-y-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
                  
                  <div className="relative z-10 flex justify-between">
                    {getStepperSteps(selectedRequest.type).map((step, sIdx) => {
                      const activeIdx = getActiveStepIndex(selectedRequest.status, getStepperSteps(selectedRequest.type));
                      const isCompleted = sIdx < activeIdx;
                      const isActive = sIdx === activeIdx;

                      return (
                        <div key={step.key} className="flex flex-col items-center">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                            isCompleted ? 'bg-emerald-600 border-emerald-600 text-white' : (
                              isActive ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-400'
                            )
                          }`}>
                            {isCompleted ? <Check className="h-4.5 w-4.5" /> : sIdx + 1}
                          </div>
                          <span className={`mt-1.5 text-[9px] font-bold text-center max-w-[80px] leading-tight ${
                            isActive ? 'text-blue-700 font-extrabold' : (isCompleted ? 'text-emerald-700' : 'text-slate-400')
                          }`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Scrolling details content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Satisfaction Evaluation (For resolved/closed Helpdesk tickets) */}
              {selectedRequest.type === 'chamado' && (selectedRequest.status === 'resolvido' || selectedRequest.status === 'fechado') && (
                <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 p-5 space-y-4 shadow-sm text-left">
                  <div className="flex items-center space-x-2">
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                    <h4 className="text-sm font-bold text-slate-805">Avaliação de Satisfação do Chamado</h4>
                  </div>
                  
                  {selectedRequest.rating && selectedRequest.rating > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600">Sua avaliação para este atendimento:</p>
                      <div className="flex items-center space-x-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star 
                            key={star} 
                            className={`h-6 w-6 ${star <= (selectedRequest.rating || 0) ? 'text-amber-500 fill-amber-400' : 'text-slate-300'}`} 
                          />
                        ))}
                        <span className="ml-2 text-sm font-bold text-amber-700">{selectedRequest.rating} / 5 estrelas</span>
                      </div>
                      {selectedRequest.rating_comment && (
                        <p className="text-xs text-slate-500 italic mt-2 bg-white/75 p-2.5 rounded border border-amber-100">
                          &ldquo;{selectedRequest.rating_comment}&rdquo;
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-600">Como você avalia o atendimento recebido pelo técnico do suporte?</p>
                      <div className="flex items-center space-x-1.5">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const isHighlighted = star <= (hoverRating || selectRating);
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setSelectRating(star)}
                              onMouseEnter={() => setHoverRating(star)}
                              onMouseLeave={() => setHoverRating(0)}
                              className="focus:outline-none transition-transform hover:scale-110"
                            >
                              <Star className={`h-8 w-8 cursor-pointer ${isHighlighted ? 'text-amber-500 fill-amber-400' : 'text-slate-300'}`} />
                            </button>
                          );
                        })}
                      </div>
                      
                      {selectRating > 0 && (
                        <div className="space-y-2 pt-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Comentário Adicional (Opcional)</label>
                          <textarea
                            placeholder="Deixe um elogio ou sugestão..."
                            value={ratingComment}
                            onChange={(e) => setRatingComment(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:outline-none focus:border-amber-500"
                            rows={2}
                          />
                          <button
                            type="button"
                            onClick={handleSendRating}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
                          >
                            Enviar Avaliação
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* S1: Form Details */}
              <div className="rounded-xl bg-white p-5 border border-slate-100 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Especificações & Justificativa</h4>
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {selectedRequest.justificativa}
                </div>

                {selectedRequest.type === 'compra' && selectedRequest.data_necessidade && (
                  <div className="flex items-center space-x-2 text-xs text-slate-500 pt-2 border-t border-slate-50">
                    <Calendar className="h-4 w-4" />
                    <span>Data de necessidade no Almoxarifado: <strong>{new Date(selectedRequest.data_necessidade).toLocaleDateString('pt-BR')}</strong></span>
                  </div>
                )}
              </div>

              {/* Items List (Only for Purchase requests) */}
              {selectedRequest.type === 'compra' && items.length > 0 && (
                <div className="rounded-xl bg-white border border-slate-100 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/50">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Itens Solicitados ({items.length})</h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <div key={it.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-800">{idx + 1}. {it.description}</p>
                          <div className="flex items-center space-x-3 mt-1 text-slate-400">
                            {it.sap_code ? (
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1 rounded">SAP: {it.sap_code}</span>
                            ) : (
                              <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-1 rounded inline-flex items-center"><Info className="h-3 w-3 mr-0.5" /> Sem código SAP</span>
                            )}
                            {it.brand && (
                              <span>Marca: <strong>{it.brand}</strong> {it.is_similar_allowed ? '(ou similar)' : ''}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-start gap-1">
                          <span className="font-bold text-slate-700">{it.quantity} {it.unit}</span>
                          {it.estimated_value > 0 && (
                            <span className="text-slate-400 text-[10px]">Est: R$ {it.estimated_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}



              {/* Chronological History Log */}
              <div className="rounded-xl bg-white p-5 border border-slate-100 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Histórico de Movimentações</h4>
                
                <div className="space-y-4 relative before:absolute before:inset-y-2 before:left-3 before:w-0.5 before:bg-slate-100 text-xs">
                  {history.map((log) => {
                    return (
                      <div key={log.id} className="relative pl-7 flex flex-col">
                        <span className="absolute left-1.5 top-1 h-3.5 w-3.5 rounded-full bg-white border-2 border-slate-300" />
                        <div className="flex items-baseline justify-between">
                          <span className="font-bold text-slate-800">
                            Alterado para <span className="text-blue-600 uppercase font-extrabold">{getStatusLabel(log.to_status)}</span>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-slate-500 mt-1">Por: <strong>{log.user_name || 'Sistema'}</strong></p>
                        {log.comment && (
                          <p className="mt-1 bg-slate-50 p-2 rounded border border-slate-100 italic text-slate-600">
                            &ldquo;{log.comment}&rdquo;
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Comments Thread messaging area */}
              <div className="rounded-xl bg-white p-5 border border-slate-100 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mensagens & Conversas</h4>

                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 text-center">Nenhuma mensagem trocada ainda.</p>
                  ) : (
                    comments.map((comm) => {
                      const isMe = comm.user_id === user.id;

                      return (
                        <div key={comm.id} className={`flex flex-col text-xs max-w-[85%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                          <span className="text-[10px] text-slate-400 mb-0.5">{comm.user_name || 'Usuário'} • {new Date(comm.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          <div className={`p-3 rounded-xl border ${isMe ? 'bg-emerald-800 dark:bg-emerald-750 text-white border-emerald-800 dark:border-emerald-750 rounded-br-none' : 'bg-white dark:bg-slate-850 text-slate-850 dark:text-slate-100 border-slate-200 dark:border-slate-800 rounded-bl-none shadow-sm'}`}>
                            <p>{comm.content}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* New message input */}
                <form onSubmit={handlePostComment} className="flex gap-2 pt-2 border-t border-slate-50">
                  <input
                    type="text"
                    placeholder="Digite sua mensagem para a equipe de atendimento..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white p-1.5 cursor-pointer"
                  >
                    <Send className="h-4.5 w-4.5" />
                  </button>
                </form>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <MessageSquare className="h-12 w-12 text-slate-300 mb-2" />
            <p className="text-sm">Selecione uma solicitação na lista para visualizar detalhes.</p>
          </div>
        )}
      </div>

    </div>
  );
}
