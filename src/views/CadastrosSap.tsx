/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  KeyRound, Search, Filter, CheckCircle, Clock, AlertTriangle, ArrowRight, UserPlus, HelpCircle, Check, Info, FileText,
  MessageSquare, Send, Loader2, Trash2
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Request, RequestComment, Sector } from '../types';
import { AttachmentGallery } from '../components/ui/Attachments';
import { useToast } from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal, { ModalBody, ModalHeader } from '../components/ui/Modal';
import { exportCadastroSapPdf } from '../lib/pdfExport/exportCadastroSapPdf';
import { formatDateTimeBR } from '../lib/format';

interface CadastrosSapProps {
  user: Profile;
}

export default function CadastrosSap({ user }: CadastrosSapProps) {
  const toast = useToast();
  const [requests, setRequests] = useState<Request[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedReq, setSelectedReq] = useState<Request | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  
  // Carrega do cache
  const pageCache = localDb.getPageCache('cadastros_sap', {
    viewTab: 'fila',
    statusFilter: 'todos',
    typeFilter: 'todos',
    search: ''
  });

  // Filter state
  const [viewTab, setViewTab] = useState<'meus' | 'fila' | 'todos'>(pageCache.viewTab as 'meus' | 'fila' | 'todos');
  const [statusFilter, setStatusFilter] = useState<string>(pageCache.statusFilter);
  const [typeFilter, setTypeFilter] = useState<string>(pageCache.typeFilter);
  const [search, setSearch] = useState(pageCache.search);

  // Efeito para salvar no cache
  useEffect(() => {
    localDb.setPageCache('cadastros_sap', {
      viewTab,
      statusFilter,
      typeFilter,
      search
    });
  }, [viewTab, statusFilter, typeFilter, search]);

  // Action fields
  const [observacao, setObservacao] = useState('');
  const [enviandoObservacao, setEnviandoObservacao] = useState(false);
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [question, setQuestion] = useState('');
  const [resolution, setResolution] = useState('');
  const [sapResultCode, setSapResultCode] = useState('');
  const [ticketExterno, setTicketExterno] = useState('');
  const [salvandoTicket, setSalvandoTicket] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('?')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const idParam = params.get('id');
      if (idParam) {
        const found = localDb.getRequests().find(r => r.id === idParam && r.type === 'cadastro_sap');
        if (found) {
          setViewTab('todos');
          setSelectedReq(found);
          setTicketExterno(found.ticket_externo || '');
          setComments(localDb.getRequestComments(found.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
        }
      }
    }
  }, []);

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
      list = list.filter(r => 
        !['cancelada', 'rejeitada', 'resolvido', 'fechado'].includes(r.status) &&
        (!r.atendente_id || r.status === 'aberto')
      );
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

    if (selectedReq) {
      setComments(localDb.getRequestComments(selectedReq.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
    }
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
    setObservacao('');
    setTicketExterno(req.ticket_externo || '');
    setActionSuccess('');
    setActionError('');
    setComments(localDb.getRequestComments(req.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
  };

  const handleSalvarTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    const valor = ticketExterno.trim();
    if (valor === (selectedReq.ticket_externo || '')) return;

    setSalvandoTicket(true);
    setActionError('');
    setActionSuccess('');
    try {
      const ok = await localDb.updateCadastroSapTicketExterno(selectedReq.id, valor || null);
      if (!ok) {
        setActionError('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
        return;
      }
      setActionSuccess(valor ? 'Nº do ticket externo registrado.' : 'Nº do ticket externo removido.');
      const updatedReq = localDb.getRequests().find(r => r.id === selectedReq.id);
      if (updatedReq) setSelectedReq(updatedReq);
      loadData();
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err) {
      setActionError('Falha ao salvar o nº do ticket externo.');
    } finally {
      setSalvandoTicket(false);
    }
  };

  const handleAssumir = async () => {
    if (!selectedReq) return;
    try {
      const ok = await localDb.assignAtendente(selectedReq.id, user.id, user.name);
      if (!ok) {
        setActionError('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
        return;
      }
      
      // Update local state
      setActionSuccess('Você assumiu este atendimento!');
      setTimeout(() => setActionSuccess(''), 3000);
      
      // Refresh
      const updatedReq = localDb.getRequests().find(r => r.id === selectedReq.id);
      if (updatedReq) setSelectedReq(updatedReq);
      setComments(localDb.getRequestComments(selectedReq.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
      loadData();
    } catch (err) {
      setActionError('Falha ao assumir atendimento.');
    }
  };

  const handleAdicionarObservacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !observacao.trim()) {
      setActionError('Por favor, informe a observação ou andamento.');
      return;
    }

    try {
      setEnviandoObservacao(true);
      setActionError('');
      setActionSuccess('');

      const texto = observacao.trim();
      await localDb.addRequestComment(selectedReq.id, texto, false);

      setActionSuccess('Observação registrada na conversa da solicitação!');
      setObservacao('');

      const updatedComments = localDb.getRequestComments(selectedReq.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      setComments(updatedComments);
      loadData();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setActionError('Falha ao registrar observação.');
    } finally {
      setEnviandoObservacao(false);
    }
  };

  const handleAguardarSolicitante = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !question.trim()) {
      setActionError('Por favor, informe a pergunta para o solicitante.');
      return;
    }

    try {
      const ok = await localDb.transitionRequestStatus(
        selectedReq.id,
        'aguardando_solicitante',
        `Dúvida/Pendência de Suprimentos: ${question}`
      );
      if (!ok) {
        setActionError('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
        return;
      }

      // Post comment
      await localDb.addRequestComment(selectedReq.id, question, false);
      
      setActionSuccess('Solicitação colocada em aguardo (SLA pausado).');
      setQuestion('');
      
      const updatedReq = localDb.getRequests().find(r => r.id === selectedReq.id);
      if (updatedReq) setSelectedReq(updatedReq);
      setComments(localDb.getRequestComments(selectedReq.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
      loadData();
    } catch (err) {
      setActionError('Falha ao atualizar status.');
    }
  };

  const handleResolver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !resolution.trim()) {
      setActionError('A nota de resolução é obrigatória.');
      return;
    }

    try {
      const labelCod = selectedReq.registration_type === 'Item' ? 'Cód. Material SAP' : 'Cód. Fornecedor SAP';
      let finalComment = `Cadastro Finalizado: ${resolution}`;
      if (sapResultCode.trim()) {
        finalComment += ` | ${labelCod}: ${sapResultCode.trim()}`;
      }

      const ok = await localDb.transitionRequestStatus(
        selectedReq.id,
        'resolvido',
        finalComment,
        sapResultCode.trim() || undefined
      );
      if (!ok) {
        setActionError('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
        return;
      }

      // Add official comment
      await localDb.addRequestComment(selectedReq.id, finalComment, false);
      
      setActionSuccess('Solicitação marcada como resolvida!');
      setResolution('');
      setSapResultCode('');

      const updatedReq = localDb.getRequests().find(r => r.id === selectedReq.id);
      if (updatedReq) setSelectedReq(updatedReq);
      setComments(localDb.getRequestComments(selectedReq.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
      loadData();
    } catch (err) {
      setActionError('Falha ao resolver cadastro.');
    }
  };

  const podeExcluir = Boolean(selectedReq && (
    user.roles.includes('admin') ||
    user.roles.includes('coordenador_suprimentos') ||
    user.id === selectedReq.solicitante_id
  ));

  const handleExcluir = async () => {
    if (!selectedReq) return;
    setExcluindo(true);
    try {
      const ok = await localDb.deleteRequest(selectedReq.id);
      if (ok) {
        toast.success(`Solicitação #${selectedReq.number} excluída com sucesso.`);
        setSelectedReq(null);
        setConfirmarExclusao(false);
        loadData();
      } else {
        toast.error('Não foi possível excluir a solicitação. Tente novamente.');
      }
    } catch (e) {
      console.error('Falha ao excluir solicitação:', e);
      toast.error('Ocorreu um erro ao excluir a solicitação.');
    } finally {
      setExcluindo(false);
    }
  };

  const getSlaTimeRemaining = (req: Request) => {
    if (req.status === 'cancelada') return 'Cancelada';
    if (req.status === 'rejeitada') return 'Rejeitada';
    if (req.status === 'resolvido' || req.status === 'fechado') return 'Resolvido';
    if (req.status === 'aguardando_solicitante') return 'Pausado';

    // 120h for scale 1 down to 2h for scale 5
    const slaHoursMap: Record<number, number> = { 1: 120, 2: 72, 3: 24, 4: 8, 5: 2 };
    const allowedHours = slaHoursMap[req.criticality] || 24;
    
    const start = new Date(req.created_at).getTime();
    const elapsed = Date.now() - start;
    const elapsedHours = elapsed / (3600 * 1000);
    const remaining = allowedHours - elapsedHours;

    if (remaining < 0) {
      return `Atrasado ${Math.abs(Math.round(remaining))}h`;
    }
    return `${Math.round(remaining)}h restantes`;
  };

  const getSlaColor = (req: Request) => {
    if (req.status === 'cancelada' || req.status === 'rejeitada') return 'bg-slate-100 text-slate-500';
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
      case 'cancelada': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'rejeitada': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      aberto: 'Aberto na Fila',
      em_atendimento: 'Em Atendimento',
      aguardando_solicitante: 'Aguardando Solicitante',
      resolvido: 'Resolvido',
      fechado: 'Fechado/Concluído',
      cancelada: 'Cancelada',
      rejeitada: 'Rejeitada'
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

  const handleExportPdf = async () => {
    if (!selectedReq) return;
    setExportingPdf(true);
    try {
      const attachments = localDb.getAttachments(selectedReq.id);
      const { failedAttachments } = await exportCadastroSapPdf(selectedReq, getSectorName(selectedReq.solicitante_sector_id), attachments);
      if (failedAttachments.length > 0) {
        toast.error(`PDF gerado, mas os anexos "${failedAttachments.join('", "')}" não puderam ser incluídos.`);
      } else {
        toast.success('PDF exportado com sucesso.');
      }
    } catch (e) {
      console.error('Falha ao exportar PDF do cadastro SAP:', e);
      toast.error('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  };

  const getItemSummary = (req: Request): string => {
    const texto = req.justificativa || '';
    const itemMatch = texto.match(/^Nome:\s*(.*?)\.\s*Specs:/i);
    if (itemMatch) return itemMatch[1].trim();

    const novoNomeMatch = texto.match(/NOVO Nome:\s*(.*?)\./i);
    if (novoNomeMatch) return novoNomeMatch[1].trim();

    const fornecMatch = texto.match(/^Nome:\s*(.*?)\.\s*(?:CNPJ:|Justificativa:)/i);
    if (fornecMatch) return fornecMatch[1].trim();

    const simpleNome = texto.match(/^Nome:\s*([^.]+)/i);
    if (simpleNome) return simpleNome[1].trim();

    const firstPart = texto.split('|')[0]?.split('.')[0]?.trim();
    if (firstPart) return firstPart;

    return texto.trim() || '-';
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

      {/* Tabela de Solicitações (Largura Total) */}
      <div className="space-y-4">
          
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
                <option value="cancelada">Cancelada</option>
                <option value="rejeitada">Rejeitada</option>
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
                    <th className="py-3 px-4">Item</th>
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
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
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
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-indigo-50 border border-indigo-150 text-indigo-700 w-fit">
                              {req.registration_type}
                            </span>
                            {req.registration_type === 'Fornecedor' && req.fornecedor_operacao === 'atualizacao' && (
                              <span className="px-1.5 py-0.5 rounded font-semibold text-[9px] bg-amber-50 border border-amber-200 text-amber-800 w-fit">
                                Atualização
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-[200px] lg:max-w-[280px]">
                          <span 
                            className="block truncate font-semibold text-slate-800 text-xs" 
                            title={getItemSummary(req)}
                          >
                            {getItemSummary(req)}
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
                            className={`font-bold text-xs flex items-center gap-1 mx-auto cursor-pointer ${
                              ['cancelada', 'rejeitada', 'resolvido', 'fechado'].includes(req.status)
                                ? 'text-slate-600 hover:text-slate-900'
                                : 'text-emerald-700 hover:text-emerald-900'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectRequest(req);
                            }}
                          >
                            {['cancelada', 'rejeitada', 'resolvido', 'fechado'].includes(req.status) ? (
                              <>Ver <ArrowRight className="h-3 w-3" /></>
                            ) : (
                              <>Atender <ArrowRight className="h-3 w-3" /></>
                            )}
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

        {/* Janela Suspensa (Modal) de Detalhes e Atendimento */}
      {selectedReq && (
        <Modal
          onClose={() => setSelectedReq(null)}
          maxWidth="max-w-3xl"
          ariaLabel={`Solicitação #${selectedReq.number}`}
        >
          <ModalHeader onClose={() => setSelectedReq(null)}>
            <div className="flex flex-wrap items-center justify-between gap-3 pr-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-bold text-slate-800">Solicitação #{selectedReq.number}</span>
                  <span className="text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded">
                    {selectedReq.registration_type}
                  </span>
                  {selectedReq.registration_type === 'Fornecedor' && selectedReq.fornecedor_operacao === 'atualizacao' && (
                    <span className="text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded">
                      Atualização
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Aberta em {new Date(selectedReq.created_at).toLocaleString('pt-BR')}
                </p>
              </div>

              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                {exportingPdf ? 'Gerando...' : 'Exportar PDF'}
              </button>
            </div>
          </ModalHeader>

          <ModalBody className="p-5 sm:p-6 space-y-6">

              {/* Details */}
              <div className="space-y-4 text-xs">
                <div>
                  <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Item / Fornecedor</h4>
                  <p className="font-bold text-slate-800 text-sm mt-1">{selectedReq.justificativa?.split('|')[0] || selectedReq.justificativa}</p>
                </div>

                {selectedReq.registration_type === 'Fornecedor' && selectedReq.codigo_fornecedor_sap && (
                  <div className="rounded border border-amber-200 bg-amber-50/60 p-2.5">
                    <h4 className="font-bold text-amber-800 uppercase text-[9px] tracking-wider">Código Fornecedor SAP (atual)</h4>
                    <p className="font-mono font-bold text-slate-800 text-sm mt-0.5">{selectedReq.codigo_fornecedor_sap}</p>
                  </div>
                )}

                {selectedReq.codigo_sap_gerado && (
                  <div className="rounded border border-emerald-200 bg-emerald-50/70 p-2.5">
                    <h4 className="font-bold text-emerald-800 uppercase text-[9px] tracking-wider">
                      {selectedReq.registration_type === 'Item' ? 'Cód. Material SAP Gerado' : 'Cód. Fornecedor SAP Gerado'}
                    </h4>
                    <p className="font-mono font-bold text-emerald-700 text-sm mt-0.5">{selectedReq.codigo_sap_gerado}</p>
                  </div>
                )}

                {selectedReq.ticket_externo && (
                  <div className="rounded border border-indigo-200 bg-indigo-50/60 p-2.5">
                    <h4 className="font-bold text-indigo-800 uppercase text-[9px] tracking-wider">Ticket em Plataforma Externa</h4>
                    <p className="font-mono font-bold text-slate-800 text-sm mt-0.5">{selectedReq.ticket_externo}</p>
                  </div>
                )}

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

                {/* Anexos do solicitante — foto do item, etiqueta, ficha
                    técnica, cartão CNPJ. É o que o atendente precisa ter à mão
                    para fazer o cadastro sem abrir uma rodada de perguntas. */}
                <div className="border-t border-slate-100 pt-3">
                  <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider mb-1.5">Anexos</h4>
                  <AttachmentGallery
                    requestId={selectedReq.id}
                    emptyLabel="Nenhum anexo enviado pelo solicitante."
                  />
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

                {/* Conversa / Histórico de Observações e Andamentos */}
                <div className="border-t border-slate-100 pt-3">
                  <h4 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3 text-slate-400" /> Conversa & Andamentos
                    </span>
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded-full">
                      {comments.length}
                    </span>
                  </h4>

                  {comments.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic bg-slate-50 p-2.5 rounded border border-slate-100">
                      Nenhuma observação ou esclarecimento registrado ainda.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {comments.map((c) => {
                        const souEu = c.user_id === user.id;
                        const ehSolicitante = c.user_id === selectedReq.solicitante_id;
                        return (
                          <div
                            key={c.id}
                            className={`p-2.5 rounded-lg border text-xs ${
                              souEu
                                ? 'bg-blue-50/70 border-blue-100 text-blue-950'
                                : ehSolicitante
                                  ? 'bg-amber-50/70 border-amber-100 text-amber-950'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] mb-1">
                              <span className="font-bold flex items-center gap-1">
                                {c.user_name || 'Usuário'}
                                {ehSolicitante && (
                                  <span className="bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-semibold text-[9px]">
                                    Solicitante
                                  </span>
                                )}
                                {souEu && !ehSolicitante && (
                                  <span className="bg-blue-100 text-blue-800 px-1 py-0.2 rounded font-semibold text-[9px]">
                                    Você
                                  </span>
                                )}
                              </span>
                              <span className="text-slate-400 font-mono text-[9px]">
                                {formatDateTimeBR(c.created_at)}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{c.content}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                {!selectedReq.atendente_id && !['cancelada', 'rejeitada', 'resolvido', 'fechado'].includes(selectedReq.status) && (
                  <button
                    onClick={handleAssumir}
                    className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 px-4 cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <UserPlus className="h-4 w-4" /> Assumir Cadastro SAP
                  </button>
                )}

                {/* 2. Atendente is current user & state is not final */}
                {selectedReq.atendente_id === user.id && !['cancelada', 'rejeitada', 'resolvido', 'fechado'].includes(selectedReq.status) && (
                  <div className="space-y-5">

                    {/* Nº do ticket externo — opcional. O cadastro real costuma
                        ser aberto em outra plataforma; guardar o número aqui liga
                        as duas pontas sem depender da conversa. */}
                    <form onSubmit={handleSalvarTicket} className="space-y-2 border border-indigo-100 p-3 rounded-xl bg-indigo-50/40">
                      <label className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-indigo-600" /> Nº do Ticket Externo
                        <span className="text-[9px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">Opcional</span>
                      </label>
                      <p className="text-[10px] text-slate-500 leading-snug">
                        Chamado aberto em outra plataforma (Astrein, service desk...). Ex.: <span className="font-mono">Astrein #507203</span>.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={ticketExterno}
                          onChange={(e) => setTicketExterno(e.target.value)}
                          placeholder="Ex: Astrein #507203"
                          className="flex-1 rounded border border-slate-200 p-2 text-xs focus:border-indigo-500 focus:outline-none bg-white font-mono"
                        />
                        <button
                          type="submit"
                          disabled={salvandoTicket || ticketExterno.trim() === (selectedReq.ticket_externo || '')}
                          className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[10px] py-2 px-3 rounded cursor-pointer transition-colors flex items-center gap-1.5 shadow-2xs"
                        >
                          {salvandoTicket ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Salvar
                        </button>
                      </div>
                    </form>

                    {/* 1. Observação / Andamento (NÃO pausa SLA) */}
                    <form onSubmit={handleAdicionarObservacao} className="space-y-2 border border-slate-200 p-3 rounded-xl bg-white shadow-2xs">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5 text-slate-700" /> Observações / Andamento
                        </p>
                        <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          SLA Ativo (não pausa)
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-snug">
                        Adicione notas de progresso para a conversa da solicitação (ex.: chamado aberto no Astrein, aguardando validação cadastral):
                      </p>
                      <textarea
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex: Chamado aberto na plataforma Astrein (Chamado: 507203), aguardando retorno..."
                        className="w-full rounded border border-slate-200 p-2 text-xs focus:border-slate-400 focus:outline-none bg-white min-h-[60px]"
                        required
                      />
                      <button
                        type="submit"
                        disabled={enviandoObservacao || !observacao.trim()}
                        className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold text-[10px] py-2 px-3 rounded cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        {enviandoObservacao ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Registrar Observação
                      </button>
                    </form>

                    {/* 2. Ask Solicitante (Aguardando Solicitante - Pausa SLA) */}
                    <form onSubmit={handleAguardarSolicitante} className="space-y-2 border border-blue-100 p-3 rounded-xl bg-blue-50/40">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                          <HelpCircle className="h-3.5 w-3.5 text-blue-600" /> Solicitar Esclarecimento
                        </p>
                        <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                          Pausa SLA
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-snug">
                        Insira a pergunta ou documento complementar pendente. O chamado mudará para &ldquo;Aguardando Solicitante&rdquo; e o SLA será pausado:
                      </p>
                      <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Ex: Por favor anexe a ficha técnica do fabricante..."
                        className="w-full rounded border border-slate-200 p-2 text-xs focus:border-blue-500 focus:outline-none bg-white min-h-[60px]"
                        required
                      />
                      <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] py-2 px-3 rounded cursor-pointer transition-colors shadow-2xs"
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
                        <label className="text-[10px] font-bold text-slate-500">
                          {selectedReq.registration_type === 'Item' ? 'Cód. Material SAP' : 'Cód. Fornecedor SAP'}
                        </label>
                        <input
                          type="text"
                          value={sapResultCode}
                          onChange={(e) => setSapResultCode(e.target.value)}
                          placeholder={selectedReq.registration_type === 'Item' ? 'Ex: 10000259' : 'Ex: 20004567'}
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

                {/* 3. Status Cancelada / Rejeitada */}
                {['cancelada', 'rejeitada'].includes(selectedReq.status) && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs space-y-2.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                      <p className="font-bold text-rose-900">
                        Solicitação {selectedReq.status === 'cancelada' ? 'Cancelada' : 'Rejeitada'}
                      </p>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Esta solicitação foi {selectedReq.status === 'cancelada' ? 'cancelada' : 'rejeitada'} e não está mais ativa para atendimento na fila de Suprimentos.
                    </p>
                    {podeExcluir && (
                      <div className="pt-2 border-t border-rose-200">
                        <button
                          type="button"
                          onClick={() => setConfirmarExclusao(true)}
                          disabled={excluindo}
                          className="w-full rounded-lg bg-white hover:bg-rose-100 text-rose-700 font-bold text-xs py-2 px-3 border border-rose-300 cursor-pointer flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          Excluir Registro Definitivamente
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Status Resolvido / Fechado */}
                {(selectedReq.status === 'resolvido' || selectedReq.status === 'fechado') && (
                  <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-100 text-center space-y-2">
                    <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto" />
                    <p className="text-xs font-bold text-emerald-800">
                      Cadastro {selectedReq.status === 'fechado' ? 'Fechado/Concluído' : 'Resolvido'}
                    </p>
                    {selectedReq.codigo_sap_gerado && (
                      <div className="inline-block bg-white border border-emerald-200 rounded px-3 py-1.5 text-xs shadow-xs">
                        <span className="text-slate-500 font-medium">
                          {selectedReq.registration_type === 'Item' ? 'Cód. Material SAP: ' : 'Cód. Fornecedor SAP: '}
                        </span>
                        <span className="font-mono font-bold text-emerald-700">{selectedReq.codigo_sap_gerado}</span>
                      </div>
                    )}
                    {selectedReq.ticket_externo && (
                      <div className="inline-block bg-white border border-slate-200 rounded px-3 py-1.5 text-xs shadow-xs">
                        <span className="text-slate-500 font-medium">Ticket externo: </span>
                        <span className="font-mono font-bold text-slate-700">{selectedReq.ticket_externo}</span>
                      </div>
                    )}
                    <p className="text-[11px] text-slate-500">
                      {selectedReq.status === 'fechado'
                        ? 'Solicitação concluída definitivamente no sistema.'
                        : 'Aguardando auto-fechamento do sistema ou confirmação de fechamento pelo solicitante.'}
                    </p>
                    {podeExcluir && (
                      <div className="pt-2 border-t border-emerald-200/60">
                        <button
                          type="button"
                          onClick={() => setConfirmarExclusao(true)}
                          disabled={excluindo}
                          className="w-full rounded-lg bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs py-1.5 px-3 border border-slate-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          Excluir Registro Definitivamente
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>

          </ModalBody>
        </Modal>
      )}

      {confirmarExclusao && selectedReq && (
        <ConfirmDialog
          titulo="Excluir Solicitação de Cadastro SAP?"
          mensagem={
            <span>
              Tem certeza de que deseja excluir definitivamente a solicitação <strong>#{selectedReq.number}</strong>?
              Esta ação removerá o registro do banco de dados e é irreversível.
            </span>
          }
          variante="perigo"
          confirmarLabel="Sim, excluir"
          cancelarLabel="Cancelar"
          confirmando={excluindo}
          onConfirmar={handleExcluir}
          onCancelar={() => setConfirmarExclusao(false)}
        />
      )}
    </div>
  );
}
