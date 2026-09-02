/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Radio, CheckSquare, Clock, User, ArrowRightLeft, Pause, Play, 
  CheckCircle2, AlertTriangle, FileText, Send, UserCheck, ChevronRight,
  Search, Filter, MessageSquare, Lock, Globe, Paperclip, Sparkles,
  Users, RefreshCw, Star, ShieldAlert, ArrowUpRight, ChevronDown
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile, Request, RequestComment, RequestStatusHistory, Sector, RequestAttachment } from '../../types';
import { useToast } from '../../components/ui/Toast';
import HelpdeskSlaBadge from './HelpdeskSlaBadge';
import { CRITICALITY_CONFIG, CANNED_RESPONSES, getSlaInfo } from './helpdeskUtils';
import HelpdeskSatisfactionCard from '../../components/helpdesk/HelpdeskSatisfactionCard';

interface HelpdeskAtendimentoProps {
  user: Profile;
  onNavigate?: (path: string) => void;
}

type QueueTab = 'unassigned' | 'mine' | 'sector_active' | 'waiting_user' | 'resolved' | 'all';

export default function HelpdeskAtendimento({ user, onNavigate }: HelpdeskAtendimentoProps) {
  const toast = useToast();

  // Estados principais
  const [tickets, setTickets] = useState<Request[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>('unassigned');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>(user.sector_id || 'todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [criticalityFilter, setCriticalityFilter] = useState<number | 'all'>('all');

  // Interações e Ações
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'public' | 'internal'>('public');
  const [transferSectorId, setTransferSectorId] = useState('');
  const [assignTechnicianId, setAssignTechnicianId] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveComment, setResolveComment] = useState('');
  const [showCannedDropdown, setShowCannedDropdown] = useState(false);

  // Bases auxiliares
  const sectors = useMemo(() => localDb.getSectors(), []);
  const allProfiles = useMemo(() => localDb.getProfiles(), []);

  useEffect(() => {
    loadTickets();
  }, []);

  const isExcludedFromHelpdesk = (r: Request) => {
    const sec = sectors.find(s => s.id === r.target_sector_id);
    const secName = (sec?.name || '').toLowerCase();
    const catName = (r.category_id || '').toLowerCase();
    return (
      secName.includes('suprimento') ||
      secName.includes('jurídico') ||
      secName.includes('juridico') ||
      catName.includes('pendência') ||
      catName.includes('processamento')
    );
  };

  const loadTickets = () => {
    const all = localDb.getRequests().filter(r => r.type === 'chamado' && !isExcludedFromHelpdesk(r));
    setTickets(all);
  };

  // Filtragem inteligente da lista
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      // Filtro de Setor Destinatário
      if (selectedSectorFilter !== 'todos' && t.target_sector_id !== selectedSectorFilter) {
        return false;
      }

      // Filtro de Criticidade
      if (criticalityFilter !== 'all' && t.criticality !== criticalityFilter) {
        return false;
      }

      // Filtro de Busca
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const numMatch = t.number.toLowerCase().includes(q);
        const nameMatch = (t.solicitante_name || '').toLowerCase().includes(q);
        const justMatch = (t.justificativa || '').toLowerCase().includes(q);
        const catMatch = (t.category_id || '').toLowerCase().includes(q);
        const localMatch = (t.local || '').toLowerCase().includes(q);
        if (!numMatch && !nameMatch && !justMatch && !catMatch && !localMatch) {
          return false;
        }
      }

      // Filtro de Aba da Fila
      if (activeQueueTab === 'unassigned') {
        return t.status === 'aberto' && !t.atendente_id;
      }
      if (activeQueueTab === 'mine') {
        return (t.atendente_id === user.id || (!t.atendente_id && t.target_sector_id === user.sector_id)) && 
          (t.status === 'em_atendimento' || t.status === 'aguardando_solicitante');
      }
      if (activeQueueTab === 'sector_active') {
        return t.status === 'em_atendimento';
      }
      if (activeQueueTab === 'waiting_user') {
        return t.status === 'aguardando_solicitante';
      }
      if (activeQueueTab === 'resolved') {
        return t.status === 'resolvido' || t.status === 'fechado';
      }
      // 'all'
      return true;
    });
  }, [tickets, selectedSectorFilter, criticalityFilter, searchTerm, activeQueueTab, user.id, user.sector_id]);

  // Manter selecionado válido
  useEffect(() => {
    if (filteredTickets.length > 0) {
      if (!selectedId || !filteredTickets.some(t => t.id === selectedId)) {
        setSelectedId(filteredTickets[0].id);
      }
    } else {
      setSelectedId(null);
    }
  }, [filteredTickets, selectedId]);

  const selectedTicket = useMemo(() => {
    return tickets.find(r => r.id === selectedId) || null;
  }, [tickets, selectedId]);

  // Dados auxiliares do chamado selecionado
  const comments: RequestComment[] = useMemo(() => {
    if (!selectedTicket) return [];
    return localDb.getRequestComments(selectedTicket.id);
  }, [selectedTicket, tickets]);

  const history: RequestStatusHistory[] = useMemo(() => {
    if (!selectedTicket) return [];
    return localDb.getRequestHistory(selectedTicket.id);
  }, [selectedTicket, tickets]);

  const attachments: RequestAttachment[] = useMemo(() => {
    if (!selectedTicket) return [];
    return localDb.getAttachments(selectedTicket.id);
  }, [selectedTicket]);

  // Técnicos disponíveis para atribuição no setor de destino
  const availableTechnicians = useMemo(() => {
    if (!selectedTicket) return [];
    const targetSectorId = selectedTicket.target_sector_id || user.sector_id;

    return allProfiles
      .filter(p => {
        // Apenas usuários com status ativo
        if (p.status !== 'ativo') return false;
        // Exclui Maycon e contas de teste
        const lowerName = (p.name || '').toLowerCase();
        if (lowerName.includes('maycon') || lowerName.includes('teste')) return false;

        // Apenas membros do setor de destino ou atendentes do setor
        return p.sector_id === targetSectorId || (p.roles.includes('atendente') && p.sector_id === targetSectorId);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedTicket, allProfiles, user.sector_id]);

  // Histórico + Comentários combinados em linha do tempo
  const timelineEvents = useMemo(() => {
    const events: Array<{
      id: string;
      date: string;
      type: 'comment' | 'history';
      author: string;
      content: string;
      isInternal?: boolean;
      statusFrom?: string;
      statusTo?: string;
    }> = [];

    comments.forEach(c => {
      events.push({
        id: c.id,
        date: c.created_at,
        type: 'comment',
        author: c.user_name,
        content: c.content,
        isInternal: c.is_internal
      });
    });

    history.forEach(h => {
      events.push({
        id: h.id,
        date: h.created_at,
        type: 'history',
        author: h.user_name,
        content: h.comment || `Alterou status para ${h.to_status.toUpperCase()}`,
        statusFrom: h.from_status,
        statusTo: h.to_status
      });
    });

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [comments, history]);

  // Ações Técnicas
  const handleTakeOver = async () => {
    if (!selectedTicket) return;
    await localDb.assignAtendente(selectedTicket.id, user.id, user.name);
    toast.success('Você assumiu o chamado com sucesso!');
    loadTickets();
  };

  const handleAssignToOther = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !assignTechnicianId) return;
    const targetTech = allProfiles.find(p => p.id === assignTechnicianId);
    if (!targetTech) return;

    await localDb.assignAtendente(selectedTicket.id, targetTech.id, targetTech.name);
    setAssignTechnicianId('');
    toast.success(`Chamado atribuído a ${targetTech.name}.`);
    loadTickets();
  };

  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    const ok = await localDb.updateRequestStatus(
      selectedTicket.id, 
      'resolvido', 
      user.id, 
      resolveComment.trim() || 'Chamado resolvido pelo suporte técnico.'
    );

    if (!ok) {
      toast.error('Falha ao registrar encerramento do chamado.');
      return;
    }

    if (resolveComment.trim()) {
      await localDb.addRequestComment(selectedTicket.id, `Solução aplicada: ${resolveComment.trim()}`, false);
    }

    setIsResolving(false);
    setResolveComment('');
    toast.success('Chamado resolvido e notificação enviada ao solicitante.');
    loadTickets();
  };

  const handleTogglePauseSla = async () => {
    if (!selectedTicket) return;
    const nextStatus = selectedTicket.status === 'em_atendimento' 
      ? 'aguardando_solicitante' 
      : 'em_atendimento';
    
    const msg = nextStatus === 'aguardando_solicitante'
      ? 'Atendimento pausado: Aguardando retorno / dados do solicitante.'
      : 'Atendimento retomado pelo suporte técnico.';

    const ok = await localDb.updateRequestStatus(selectedTicket.id, nextStatus, user.id, msg);
    if (ok) {
      toast.success(nextStatus === 'aguardando_solicitante' ? 'SLA Pausado com sucesso.' : 'Atendimento retomado.');
      loadTickets();
    }
  };

  const handleTransferSector = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !transferSectorId) return;
    localDb.transferTicketSector(selectedTicket.id, transferSectorId, user.id);
    const destSector = sectors.find(s => s.id === transferSectorId)?.name || 'outro setor';
    toast.success(`Chamado #${selectedTicket.number} transferido para ${destSector}.`);
    setTransferSectorId('');
    loadTickets();
  };

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !noteText.trim()) return;

    await localDb.addRequestComment(selectedTicket.id, noteText.trim(), noteType === 'internal');
    setNoteText('');
    toast.success(noteType === 'internal' ? 'Nota interna salva.' : 'Resposta enviada ao solicitante.');
    loadTickets();
  };

  const applyCannedResponse = (text: string) => {
    setNoteText(prev => prev ? `${prev}\n${text}` : text);
    setShowCannedDropdown(false);
  };

  const getSectorName = (id?: string) => sectors.find(s => s.id === id)?.name || 'Geral';

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-slate-50/50">
      
      {/* PAINEL ESQUERDO: FILA DE ATENDIMENTO */}
      <div className="w-full lg:w-[420px] xl:w-[460px] border-r border-slate-200 bg-white flex flex-col h-full shrink-0">
        
        {/* Cabeçalho de Filtros da Fila */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/30">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Radio className="h-4 w-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-800">Fila de Chamados</h2>
            </div>
            <button 
              onClick={loadTickets} 
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Seletor de Setor Destinatário */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">Setor:</span>
            <select
              value={selectedSectorFilter}
              onChange={(e) => setSelectedSectorFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              <option value="todos">Todos os Setores (Visão Geral)</option>
              {sectors
                .filter(s => s.helpdesk_enabled && !s.name.toLowerCase().includes('suprimento') && !s.name.toLowerCase().includes('jurídico') && !s.name.toLowerCase().includes('juridico'))
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.id === user.sector_id ? '(Meu Setor)' : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* Campo de Busca & Criticidade */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nº, solicitante, texto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
            <select
              value={criticalityFilter}
              onChange={(e) => setCriticalityFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs text-slate-600 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-600"
              title="Filtrar por Criticidade"
            >
              <option value="all">Todas</option>
              <option value="5">P5 - Parada</option>
              <option value="4">P4 - Crítica</option>
              <option value="3">P3 - Alta</option>
              <option value="2">P2 - Média</option>
              <option value="1">P1 - Baixa</option>
            </select>
          </div>

          {/* Abas Rápidas de Fila */}
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg text-[11px] font-semibold">
            <button
              onClick={() => setActiveQueueTab('unassigned')}
              className={`py-1.5 rounded transition-all text-center cursor-pointer ${
                activeQueueTab === 'unassigned' 
                  ? 'bg-white shadow-sm text-emerald-800 font-bold' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Não Atribuídos ({tickets.filter(t => t.status === 'aberto' && (!selectedSectorFilter || selectedSectorFilter === 'todos' || t.target_sector_id === selectedSectorFilter)).length})
            </button>
            <button
              onClick={() => setActiveQueueTab('mine')}
              className={`py-1.5 rounded transition-all text-center cursor-pointer ${
                activeQueueTab === 'mine' 
                  ? 'bg-white shadow-sm text-emerald-800 font-bold' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Meus ({tickets.filter(t => t.atendente_id === user.id && (t.status === 'em_atendimento' || t.status === 'aguardando_solicitante')).length})
            </button>
            <button
              onClick={() => setActiveQueueTab('sector_active')}
              className={`py-1.5 rounded transition-all text-center cursor-pointer ${
                activeQueueTab === 'sector_active' 
                  ? 'bg-white shadow-sm text-emerald-800 font-bold' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Em Andamento
            </button>
            <button
              onClick={() => setActiveQueueTab('waiting_user')}
              className={`py-1.5 rounded transition-all text-center cursor-pointer ${
                activeQueueTab === 'waiting_user' 
                  ? 'bg-white shadow-sm text-emerald-800 font-bold' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pausados
            </button>
            <button
              onClick={() => setActiveQueueTab('resolved')}
              className={`py-1.5 rounded transition-all text-center cursor-pointer ${
                activeQueueTab === 'resolved' 
                  ? 'bg-white shadow-sm text-emerald-800 font-bold' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Encerrados
            </button>
            <button
              onClick={() => setActiveQueueTab('all')}
              className={`py-1.5 rounded transition-all text-center cursor-pointer ${
                activeQueueTab === 'all' 
                  ? 'bg-white shadow-sm text-emerald-800 font-bold' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos ({filteredTickets.length})
            </button>
          </div>

        </div>

        {/* Lista de Chamados */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredTickets.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <CheckSquare className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">Nenhum chamado nesta fila.</p>
              <p className="text-[11px] text-slate-400">Altere os filtros ou a aba para visualizar outros chamados.</p>
            </div>
          ) : (
            filteredTickets.map(t => {
              const isSelected = t.id === selectedId;
              const crit = CRITICALITY_CONFIG[t.criticality] || CRITICALITY_CONFIG[2];
              const dateStr = new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-all flex flex-col space-y-2 border-l-4 cursor-pointer ${
                    isSelected 
                      ? 'bg-emerald-50/40 border-emerald-600 shadow-sm' 
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-slate-700">#{t.number}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${crit.bg} ${crit.color} ${crit.border}`}>
                        {crit.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">{dateStr}</span>
                  </div>

                  <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-relaxed">
                    {t.justificativa || 'Incidente sem descrição'}
                  </p>

                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <div className="flex items-center space-x-1.5 text-slate-500 truncate max-w-[200px]">
                      <User className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="truncate">{t.solicitante_name}</span>
                    </div>

                    <HelpdeskSlaBadge ticket={t} size="sm" />
                  </div>
                </button>
              );
            })
          )}
        </div>

      </div>

      {/* PAINEL DIREITO: DETALHES DO CHAMADO E ATENDIMENTO */}
      <div className="flex-1 bg-white flex flex-col h-full overflow-hidden">
        {selectedTicket ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* Header do Chamado */}
            <div className="bg-white p-5 border-b border-slate-200 shrink-0 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2.5">
                    <h2 className="text-lg font-bold text-slate-900">Chamado #{selectedTicket.number}</h2>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                      selectedTicket.status === 'aberto' ? 'bg-amber-100 text-amber-800' :
                      selectedTicket.status === 'em_atendimento' ? 'bg-sky-100 text-sky-800' :
                      selectedTicket.status === 'aguardando_solicitante' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-emerald-100 text-emerald-800'
                    }`}>
                      {selectedTicket.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  
                  <p className="text-xs text-slate-500">
                    Aberto em <strong>{new Date(selectedTicket.created_at).toLocaleString('pt-BR')}</strong> por <strong>{selectedTicket.solicitante_name}</strong> ({getSectorName(selectedTicket.solicitante_sector_id)})
                  </p>
                </div>

                <div className="flex flex-col sm:items-end space-y-1">
                  <HelpdeskSlaBadge ticket={selectedTicket} size="md" showProgress={true} />
                  <span className="text-[10px] text-slate-400">
                    Destino: <strong>{getSectorName(selectedTicket.target_sector_id)}</strong>
                  </span>
                </div>
              </div>

              {/* Informações Rápidas em Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-slate-100">
                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-medium">
                  Categoria: <strong>{selectedTicket.category_id || 'Geral'}</strong>
                </span>
                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-medium">
                  Local: <strong>{selectedTicket.local || 'Não informado'}</strong>
                </span>
                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-medium">
                  Atendente: <strong>{selectedTicket.atendente_name || 'Nenhum (Na fila)'}</strong>
                </span>
              </div>
            </div>

            {/* Corpo com Scroll: Descrição, Ações e Timeline */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Box de Descrição */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição do Incidente / Solicitação</h3>
                  <span className="text-[10px] text-slate-400 font-mono">ID: {selectedTicket.id}</span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.justificativa || 'Sem justificativa informada.'}
                </p>

                {/* Anexos vinculados */}
                {attachments.length > 0 && (
                  <div className="pt-3 border-t border-slate-200/60 space-y-2">
                    <span className="text-xs font-bold text-slate-500 flex items-center">
                      <Paperclip className="h-3.5 w-3.5 mr-1" />
                      Anexos & Imagens ({attachments.length}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {attachments.map(att => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          <Paperclip className="h-3 w-3" />
                          <span className="font-semibold">{att.name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* BARRA DE AÇÕES TÉCNICAS */}
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-5 space-y-4">
                <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Ações do Atendente</h3>

                <div className="flex flex-wrap gap-3">
                  {selectedTicket.status === 'aberto' && (
                    <button
                      onClick={handleTakeOver}
                      className="flex-1 min-w-[150px] rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 px-4 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                    >
                      <UserCheck className="mr-2 h-4 w-4" />
                      <span>Assumir Chamado</span>
                    </button>
                  )}

                  {(selectedTicket.status === 'em_atendimento' || selectedTicket.status === 'aguardando_solicitante') && (
                    <>
                      <button
                        onClick={() => setIsResolving(true)}
                        className="flex-1 min-w-[150px] rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 px-4 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        <span>Encerrar / Resolver</span>
                      </button>

                      <button
                        onClick={handleTogglePauseSla}
                        className={`flex-1 min-w-[150px] rounded-lg font-bold text-xs py-2.5 px-4 transition-all border flex items-center justify-center cursor-pointer ${
                          selectedTicket.status === 'em_atendimento'
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            : 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                        }`}
                      >
                        {selectedTicket.status === 'em_atendimento' ? (
                          <>
                            <Pause className="mr-2 h-4 w-4" />
                            <span>Pausar SLA (Aguardar Solicitante)</span>
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4 animate-pulse" />
                            <span>Retomar Atendimento</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>

                {/* Modal / Bloco de Resolução */}
                {isResolving && (
                  <form onSubmit={handleResolveTicket} className="p-4 bg-white rounded-lg border border-emerald-200 space-y-3 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-800">Conclusão do Chamado</h4>
                    <p className="text-[11px] text-slate-500">Descreva o serviço realizado e a solução aplicada antes de encerrar o chamado.</p>
                    <textarea
                      required
                      rows={3}
                      placeholder="Ex: Trocado cabo de rede, equipamento testado e operacional..."
                      value={resolveComment}
                      onChange={(e) => setResolveComment(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setIsResolving(false)}
                        className="px-3 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs"
                      >
                        Confirmar Resolução
                      </button>
                    </div>
                  </form>
                )}

                {/* Linha de Atribuição e Transferência */}
                {selectedTicket.status !== 'resolvido' && selectedTicket.status !== 'fechado' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-emerald-100">
                    
                    {/* Atribuir para técnico */}
                    <form onSubmit={handleAssignToOther} className="flex items-center space-x-2">
                      <select
                        value={assignTechnicianId}
                        onChange={(e) => setAssignTechnicianId(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs text-slate-700"
                      >
                        <option value="">Atribuir para técnico...</option>
                        {availableTechnicians.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={!assignTechnicianId}
                        className="rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold text-xs py-1.5 px-3"
                      >
                        Atribuir
                      </button>
                    </form>

                    {/* Transferir de Setor */}
                    <form onSubmit={handleTransferSector} className="flex items-center space-x-2">
                      <select
                        value={transferSectorId}
                        onChange={(e) => setTransferSectorId(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs text-slate-700"
                      >
                        <option value="">Transferir setor...</option>
                        {sectors
                          .filter(s => s.helpdesk_enabled && s.id !== selectedTicket.target_sector_id && !s.name.toLowerCase().includes('suprimento') && !s.name.toLowerCase().includes('jurídico') && !s.name.toLowerCase().includes('juridico'))
                          .map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                      </select>
                      <button
                        type="submit"
                        disabled={!transferSectorId}
                        className="rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold text-xs py-1.5 px-3"
                      >
                        Transferir
                      </button>
                    </form>

                  </div>
                )}
              </div>

              {/* Avaliação de Satisfação CSAT */}
              {selectedTicket.rating && selectedTicket.rating > 0 && (
                <HelpdeskSatisfactionCard request={selectedTicket} readOnly={true} />
              )}

              {/* LINHA DO TEMPO: HISTÓRICO, MENSAGENS E NOTAS INTERNAS */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                    <MessageSquare className="h-4 w-4 text-emerald-700 mr-1.5" />
                    Histórico & Linha do Tempo
                  </h3>
                  <span className="text-[11px] text-slate-400">{timelineEvents.length} eventos</span>
                </div>

                {/* Eventos da Timeline */}
                <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {timelineEvents.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">Nenhum evento registrado ainda.</p>
                  ) : (
                    timelineEvents.map(evt => {
                      const isInternal = evt.isInternal;
                      const isHistory = evt.type === 'history';

                      if (isHistory) {
                        return (
                          <div key={evt.id} className="flex items-start space-x-2.5 text-xs text-slate-500 py-1">
                            <div className="p-1 rounded-full bg-slate-100 text-slate-500 shrink-0 mt-0.5">
                              <ArrowRightLeft className="h-3 w-3" />
                            </div>
                            <div className="flex-1">
                              <span className="font-semibold text-slate-700">{evt.author}</span>: {evt.content}
                              <span className="text-[10px] text-slate-400 ml-2">
                                {new Date(evt.date).toLocaleString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={evt.id} 
                          className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                            isInternal 
                              ? 'bg-amber-50/70 border-amber-200 text-slate-800' 
                              : 'bg-slate-50/70 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-slate-800">{evt.author}</span>
                              {isInternal ? (
                                <span className="inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                  <Lock className="h-2.5 w-2.5 mr-0.5" />
                                  NOTA INTERNA TI
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                                  <Globe className="h-2.5 w-2.5 mr-0.5" />
                                  PÚBLICO
                                </span>
                              )}
                            </div>
                            <span className="text-slate-400 text-[10px]">
                              {new Date(evt.date).toLocaleString('pt-BR')}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {evt.content}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* FORMULÁRIO DE RESPOSTA E NOTA INTERNA */}
                <form onSubmit={handlePostNote} className="pt-3 border-t border-slate-100 space-y-3">
                  
                  <div className="flex items-center justify-between">
                    {/* Toggle Público / Interno */}
                    <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setNoteType('public')}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                          noteType === 'public' 
                            ? 'bg-white text-emerald-800 shadow-sm font-bold' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Globe className="inline h-3 w-3 mr-1" />
                        Resposta Pública (Solicitante)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteType('internal')}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                          noteType === 'internal' 
                            ? 'bg-amber-600 text-white shadow-sm font-bold' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Lock className="inline h-3 w-3 mr-1" />
                        Nota Interna
                      </button>
                    </div>

                    {/* Menu de Respostas Rápidas */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowCannedDropdown(!showCannedDropdown)}
                        className="flex items-center space-x-1 text-xs text-emerald-700 hover:text-emerald-900 font-semibold px-2 py-1 rounded hover:bg-emerald-50 transition-colors cursor-pointer"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Respostas Rápidas</span>
                        <ChevronDown className="h-3 w-3" />
                      </button>

                      {showCannedDropdown && (
                        <div className="absolute right-0 bottom-full mb-1 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-20 space-y-1">
                          <p className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase">Modelos de Resposta</p>
                          {CANNED_RESPONSES.map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => applyCannedResponse(item.text)}
                              className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 transition-colors"
                            >
                              <p className="font-semibold text-slate-800">{item.title}</p>
                              <p className="text-[10px] text-slate-500 line-clamp-1">{item.text}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      required
                      placeholder={
                        noteType === 'internal'
                          ? "Escreva uma anotação técnica confidencial da equipe..."
                          : "Escreva uma resposta ao solicitante do chamado..."
                      }
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className={`flex-1 rounded-xl border p-2.5 text-xs focus:outline-none ${
                        noteType === 'internal'
                          ? 'border-amber-300 focus:ring-1 focus:ring-amber-500 bg-amber-50/20'
                          : 'border-slate-200 focus:ring-1 focus:ring-emerald-600 bg-white'
                      }`}
                    />
                    <button
                      type="submit"
                      className={`rounded-xl px-4 text-white font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                        noteType === 'internal'
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-emerald-700 hover:bg-emerald-800'
                      }`}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>

                </form>

              </div>

            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-3">
            <Radio className="h-12 w-12 text-slate-300" />
            <h3 className="text-sm font-bold text-slate-600">Nenhum chamado selecionado</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Selecione um chamado na lista à esquerda para visualizar os detalhes, interagir na timeline ou assumir o atendimento.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
