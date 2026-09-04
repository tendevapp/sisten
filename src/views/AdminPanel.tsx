/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import Diretrizes from '../components/admin/Diretrizes';
import { ApiManagement } from '../components/admin/ApiManagement';
import {
  Users, Map as MapIcon, Shield, Upload, Check, X, AlertTriangle,
  Trash, Save, Activity, RefreshCw, FileText, FileSpreadsheet, Plus,
  FileX, CheckCircle2, XCircle, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Download, Truck, Sparkles,
  Flag, Bug, Lightbulb, Image as ImageIcon, Copy, Hash, Layers, Info, ArrowRight, Database, BookOpen, Cpu, Users2, Boxes, Receipt,
  Building2, Edit2, Search, UserCheck, UserX, MoreHorizontal, Filter, ShieldCheck, ShoppingBag, Award, Briefcase, KeyRound, Lock,
  SlidersHorizontal, Eye, Mail, Settings2, UserPlus, FileCheck, Trash2, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { getAutoCategory } from '../data/materials';
import { calcularProximoCodigoMaterial, sanitizeTechnicalText } from '../lib/materiais';
import { Profile, Sector, Material, FeedbackReport, RhSetor } from '../types';
import { useToast } from '../components/ui/Toast';
import { formatDateBR } from '../lib/format';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageAccessModal from '../components/admin/PageAccessModal';
import BulkPageAccessModal from '../components/admin/BulkPageAccessModal';
import AdminResetPasswordModal from '../components/admin/AdminResetPasswordModal';
import UserEditGovernanceModal from '../components/admin/UserEditGovernanceModal';
import AprovadorSetoresSelect from '../components/admin/AprovadorSetoresSelect';
import AdminChatbot from '../components/admin/AdminChatbot';
import {
  importarRhPessoas, importarRhSetores, importarRhHoraExtra,
  listarRhSetores, criarRhSetor, atualizarRhSetor, alternarStatusRhSetor, excluirRhSetor,
} from '../lib/rhApi';
import { mapearPlanilhaPessoas } from '../lib/rhPessoasImport';
import UsersByModuleView from '../components/admin/UsersByModuleView';

interface AdminPanelProps {
  user: Profile;
}

export default function AdminPanel({ user }: AdminPanelProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<
    'usuarios' | 'setores' | 'permissoes' | 'importar_planilhas' | 'importar_sap_log' | 'grupos_comprador' | 'helpdesk_config' | 'feedback' | 'diretrizes' | 'apis'
  >('usuarios');
  
  // Users Management State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [pageAccessProfileId, setPageAccessProfileId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkAccessModalOpen, setBulkAccessModalOpen] = useState(false);
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  // Grupo de Compras (SAP) inline por usuário na tabela de Perfis Ativos.
  const [grupoComprasInputs, setGrupoComprasInputs] = useState<Record<string, string>>({});
  // Busca e filtro por setor e status na tabela de Usuários
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSectorFilter, setUserSectorFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'ativo' | 'pendente' | 'inativo' | 'admin' | 'comprador' | 'gestor'>('all');
  // Edição de setor inline por usuário
  const [editingSectorProfileId, setEditingSectorProfileId] = useState<string | null>(null);
  const [editingSectorId, setEditingSectorId] = useState<string>('');
  // Modal unificado de edição e governança de usuário
  const [governanceModalUser, setGovernanceModalUser] = useState<Profile | null>(null);
  // Menu de ações rápidas aberto
  const [actionDropdownUserId, setActionDropdownUserId] = useState<string | null>(null);
  // Modo de visualização da aba Usuários: por Colaborador ou por Módulo
  const [userViewMode, setUserViewMode] = useState<'colaborador' | 'modulo'>('colaborador');

  // Sectors State
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [subTabSetores, setSubTabSetores] = useState<'corporativos' | 'ase'>('corporativos');
  const [rhSetores, setRhSetores] = useState<RhSetor[]>([]);
  const [loadingRhSetores, setLoadingRhSetores] = useState(false);
  const [buscaRhSetores, setBuscaRhSetores] = useState('');
  const [filtroStatusRhSetores, setFiltroStatusRhSetores] = useState<'todos' | 'ativos' | 'inativos'>('todos');
  const [modalRhSetorAberto, setModalRhSetorAberto] = useState(false);
  const [editingRhSetor, setEditingRhSetor] = useState<RhSetor | null>(null);
  const [rhSetorNomeInput, setRhSetorNomeInput] = useState('');
  const [rhSetorAtivoInput, setRhSetorAtivoInput] = useState(true);
  const [salvandoRhSetor, setSalvandoRhSetor] = useState(false);
  const [confirmDeleteRhSetor, setConfirmDeleteRhSetor] = useState<RhSetor | null>(null);
  const [excluindoRhSetor, setExcluindoRhSetor] = useState(false);

  // Materials Importer ZL0169 (Cadastro de Materiais SAP)
  const [zl0169File, setZl0169File] = useState<File | null>(null);
  const [zl0169Preview, setZl0169Preview] = useState<any[]>([]);
  const [pendingZL0169Items, setPendingZL0169Items] = useState<Omit<Material, 'id' | 'is_active' | 'created_at'>[]>([]);
  const [zl0169Status, setZl0169Status] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [zl0169Progress, setZl0169Progress] = useState(0);
  const [zl0169ProgressMsg, setZl0169ProgressMsg] = useState('');
  const [zl0169Error, setZl0169Error] = useState('');
  const [zl0169Summary, setZl0169Summary] = useState<{ read: number; inserted: number; updated: number; deactivated: number; syncFailed: number } | null>(null);

  // Materials Importer ZL0162 (Texto Técnico / Longo SAP)
  const [zl0162File, setZl0162File] = useState<File | null>(null);
  const [zl0162Preview, setZl0162Preview] = useState<{ material_code: string; description?: string; technical_text: string }[]>([]);
  const [pendingZL0162Items, setPendingZL0162Items] = useState<{ material_code: string; description?: string; technical_text: string }[]>([]);
  const [zl0162Status, setZl0162Status] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [zl0162Progress, setZl0162Progress] = useState(0);
  const [zl0162ProgressMsg, setZl0162ProgressMsg] = useState('');
  const [zl0162Error, setZl0162Error] = useState('');
  const [zl0162Summary, setZl0162Summary] = useState<{ read: number; updated: number; notFound: number; syncFailed: number } | null>(null);

  // Maiores códigos de material cadastrados no catálogo para referência de nova importação SAP
  const [catalogCodeStats, setCatalogCodeStats] = useState<{
    maxStandard7d: string | null;
    maxLong18d: string | null;
    totalMaterials: number;
    lastCreatedAt: string | null;
  } | null>(null);
  const [loadingCatalogStats, setLoadingCatalogStats] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadCatalogStats = async () => {
    setLoadingCatalogStats(true);
    try {
      const stats = await localDb.getCatalogCodeStats();
      setCatalogCodeStats(stats);
    } catch (err) {
      console.error('Erro ao carregar maiores códigos do catálogo:', err);
    } finally {
      setLoadingCatalogStats(false);
    }
  };

  const handleCopyCode = (code: string, label: string) => {
    if (!code || code === '—') return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Código ${code} (${label}) copiado para a área de transferência!`);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const calcNextCode = calcularProximoCodigoMaterial;

  // SAP ME5A/ZL0132 upload simulation states
  const [sapLogPreview, setSapLogPreview] = useState<any[]>([]);
  const [sapLogs, setSapLogs] = useState<any[]>([]);
  // A sincronização com o Supabase não garante ordem de retorno; sem isso,
  // uma carga recém-feita podia aparecer no meio/fim da lista em vez do topo,
  // dando a falsa impressão de que o log não tinha sido salvo.
  const sortedSapLogs = useMemo(
    () => [...sapLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [sapLogs]
  );
  const [sapLogStatus, setSapLogStatus] = useState<'idle' | 'parsed' | 'saving' | 'success' | 'error'>('idle');
  const [sapProgress, setSapProgress] = useState(0);
  const [sapLogMessage, setSapLogMessage] = useState('');
  const [sapLogError, setSapLogError] = useState('');
  const [currentSapUploadType, setCurrentSapUploadType] = useState<'ME5A' | 'ZL0132'>('ME5A');
  const [sapCsvText, setSapCsvText] = useState('');
  const [mb51ImportMode, setMb51ImportMode] = useState<'upsert' | 'replace'>('upsert');
  const [lastUploadLog, setLastUploadLog] = useState<any | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  // O sync geral não traz mais `ignored_rows`/`missing_ris` (jsonb pesado — ver
  // plano de egress). Ao expandir um log, busca o detalhe sob demanda e guarda
  // aqui, mesclado com o log "magro" vindo do cache para a renderização.
  const [logDetails, setLogDetails] = useState<Record<string, { ignored_rows: any[]; missing_ris: string[] }>>({});
  const [loadingLogDetailId, setLoadingLogDetailId] = useState<string | null>(null);

  // Buyer Groups Config States
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null);
  const [buyerGroupsInput, setBuyerGroupsInput] = useState<string>('');
  const [buyerPrimaryGroup, setBuyerPrimaryGroup] = useState<string>('');

  // Helpdesk Config States
  const [selectedHelpdeskSectorId, setSelectedHelpdeskSectorId] = useState<string | null>(null);
  const [newHelpdeskCategory, setNewHelpdeskCategory] = useState<string>('');

  // Feedback (Reportes) States
  const [feedbackReports, setFeedbackReports] = useState<FeedbackReport[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [feedbackFilterType, setFeedbackFilterType] = useState<'all' | 'bug' | 'sugestao'>('all');
  const [feedbackFilterStatus, setFeedbackFilterStatus] = useState<'all' | FeedbackReport['status']>('all');
  const [feedbackScreenshotUrl, setFeedbackScreenshotUrl] = useState<string | null>(null);
  const [feedbackNotesDraft, setFeedbackNotesDraft] = useState('');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '#/';
      const [path, queryString] = hash.slice(1).split('?');
      if (path === '/admin/usuarios') setActiveTab('usuarios');
      else if (path === '/admin/setores') setActiveTab('setores');
      else if (path === '/admin/permissoes') setActiveTab('permissoes');
      else if (path === '/admin/importacao-materiais' || path === '/suprimentos/importar' || path === '/admin/importacao-rh') setActiveTab('importar_planilhas');
      else if (path === '/suprimentos/importar/log') setActiveTab('importar_sap_log');
      else if (path === '/suprimentos/grupos-comprador') setActiveTab('grupos_comprador');
      else if (path === '/admin/helpdesk') setActiveTab('helpdesk_config');
      else if (path === '/admin/feedback') {
        setActiveTab('feedback');
        if (queryString) {
          const params = new URLSearchParams(queryString);
          const feedbackId = params.get('id');
          if (feedbackId) {
            setSelectedFeedbackId(feedbackId);
            setFeedbackFilterType('all');
            setFeedbackFilterStatus('all');
          }
        }
      }
      else if (path === '/admin/diretrizes') setActiveTab('diretrizes');
      else if (path === '/admin/apis') setActiveTab('apis');
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (activeTab !== 'feedback') return;
    let cancelled = false;
    setFeedbackLoading(true);
    localDb.getFeedbackReports().then(rows => {
      if (!cancelled) {
        setFeedbackReports(rows);
        setFeedbackLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'importar_planilhas') {
      loadCatalogStats();
    }
  }, [activeTab]);

  const selectedFeedback = feedbackReports.find(r => r.id === selectedFeedbackId) || null;
  const filteredFeedbackReports = feedbackReports.filter(r =>
    (feedbackFilterType === 'all' || r.type === feedbackFilterType) &&
    (feedbackFilterStatus === 'all' || r.status === feedbackFilterStatus)
  );
  const novosFeedbackCount = feedbackReports.filter(r => r.status === 'novo').length;

  useEffect(() => {
    setFeedbackScreenshotUrl(null);
    setFeedbackNotesDraft(selectedFeedback?.admin_notes || '');
    if (!selectedFeedback?.screenshot_path) return;
    let cancelled = false;
    localDb.getFeedbackScreenshotUrl(selectedFeedback.screenshot_path).then(url => {
      if (!cancelled) setFeedbackScreenshotUrl(url);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeedback?.id]);

  const handleUpdateFeedbackStatus = async (id: string, status: FeedbackReport['status']) => {
    const ok = await localDb.updateFeedbackReport(id, { status });
    if (!ok) { toast.error('Falha ao atualizar status.'); return; }
    setFeedbackReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const handleSaveFeedbackNotes = async () => {
    if (!selectedFeedback) return;
    const ok = await localDb.updateFeedbackReport(selectedFeedback.id, { admin_notes: feedbackNotesDraft });
    if (!ok) { toast.error('Falha ao salvar nota.'); return; }
    setFeedbackReports(prev => prev.map(r => r.id === selectedFeedback.id ? { ...r, admin_notes: feedbackNotesDraft } : r));
    toast.success('Nota salva.');
  };

  useEffect(() => {
    loadData();
    const unsubscribe = localDb.subscribe(() => {
      loadData();
    });
    return () => unsubscribe();
  }, [activeTab]);

  const loadData = () => {
    setProfiles(localDb.getProfiles());
    setSectors(localDb.getSectors());
    setSapLogs(localDb.getImportLogs());
    carregarRhSetores();
  };

  // Expande/recolhe um log de importação, buscando as linhas ignoradas/RIs
  // ausentes sob demanda na primeira vez (o sync geral só traz as contagens).
  const handleToggleLog = (id: string) => {
    if (expandedLogId === id) {
      setExpandedLogId(null);
      return;
    }
    setExpandedLogId(id);
    if (!logDetails[id]) {
      setLoadingLogDetailId(id);
      localDb.fetchImportLogDetail(id)
        .then(detail => {
          if (detail) {
            setLogDetails(prev => ({
              ...prev,
              [id]: { ignored_rows: detail.ignored_rows || [], missing_ris: detail.missing_ris || [] }
            }));
          }
        })
        .catch(err => console.error('Falha ao buscar detalhe do log de importação:', err))
        .finally(() => setLoadingLogDetailId(curr => (curr === id ? null : curr)));
    }
  };

  const handleApproveUser = async (id: string, approve: boolean) => {
    const ok = await localDb.updateUserStatus(id, approve ? 'ativo' : 'rejeitado');
    if (ok) {
      loadData();
    } else {
      toast.error('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
    }
  };

  const handleToggleUserStatus = async (id: string, newStatus: 'ativo' | 'inativo') => {
    const ok = await localDb.updateUserStatus(id, newStatus);
    if (ok) {
      toast.success(`Status do usuário alterado para ${newStatus.toUpperCase()}.`);
      loadData();
    } else {
      toast.error('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
    }
  };

  const handleUpdateRole = async (id: string) => {
    if (!editingRole) return;
    const ok = await localDb.updateUserRole(id, editingRole);
    if (ok) {
      setSelectedProfileId(null);
      setEditingRole('');
      toast.success('Permissão do usuário atualizada com sucesso.');
      loadData();
    } else {
      toast.error('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
    }
  };

  const handleUpdateSector = async (userId: string, newSectorId: string) => {
    if (!newSectorId) {
      toast.error('Selecione um setor válido.');
      return;
    }
    const ok = await localDb.updateUserSector(userId, newSectorId);
    if (ok) {
      setEditingSectorProfileId(null);
      setEditingSectorId('');
      toast.success('Setor do usuário atualizado com sucesso.');
      loadData();
    } else {
      toast.error('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
    }
  };

  const handleSaveGrupoCompras = async (id: string) => {
    const value = grupoComprasInputs[id] ?? '';
    const ok = await localDb.updateUserGrupoCompras(id, value);
    if (ok) {
      loadData();
      setGrupoComprasInputs(prev => { const next = { ...prev }; delete next[id]; return next; });
    } else {
      toast.error('Falha ao salvar no Supabase. A alteração não foi persistida — tente novamente.');
    }
  };

  // Salvam a cada clique, sem botão de confirmar: é um toggle, e o estado da
  // linha já mostra o resultado. Em falha, o loadData() redesenha a
  // partir do que de fato está gravado, desfazendo a marcação otimista.
  const handleChangeAprovadorSetores = async (id: string, next: string[]) => {
    try {
      const ok = await localDb.updateUserAprovadorSetores(id, next);
      if (!ok) toast.error('Não foi possível salvar os setores. Tente novamente.');
      loadData();
    } catch (e) {
      console.error('Falha ao atualizar setores de aprovação:', e);
      toast.error('Não foi possível salvar os setores. Tente novamente.');
      loadData();
    }
  };

  const handleChangeAprovadorCadastroSap = async (id: string, next: boolean) => {
    try {
      const ok = await localDb.updateUserAprovadorCadastroSap(id, next);
      if (!ok) toast.error('Não foi possível salvar. Tente novamente.');
      loadData();
    } catch (e) {
      console.error('Falha ao atualizar aprovador de Cadastro SAP:', e);
      toast.error('Não foi possível salvar. Tente novamente.');
      loadData();
    }
  };

  const handleToggleSectorSupport = (id: string) => {
    localDb.toggleSectorSupport(id);
    loadData();
  };

  const handleToggleSectorHelpdesk = (id: string) => {
    localDb.toggleSectorHelpdesk(id);
    loadData();
  };

  const carregarRhSetores = async () => {
    setLoadingRhSetores(true);
    try {
      const data = await listarRhSetores();
      setRhSetores(data);
    } catch (err: any) {
      console.error('Erro ao carregar setores da ASE:', err);
    } finally {
      setLoadingRhSetores(false);
    }
  };

  const handleOpenNovoRhSetor = () => {
    setEditingRhSetor(null);
    setRhSetorNomeInput('');
    setRhSetorAtivoInput(true);
    setModalRhSetorAberto(true);
  };

  const handleOpenEditarRhSetor = (setor: RhSetor) => {
    setEditingRhSetor(setor);
    setRhSetorNomeInput(setor.nome);
    setRhSetorAtivoInput(setor.ativo);
    setModalRhSetorAberto(true);
  };

  const handleSalvarRhSetor = async (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = rhSetorNomeInput.trim().toUpperCase();
    if (!nomeLimpo) {
      toast.warning('Informe o nome do setor da ASE.');
      return;
    }

    setSalvandoRhSetor(true);
    try {
      if (editingRhSetor) {
        await atualizarRhSetor(editingRhSetor.id, {
          nome: nomeLimpo,
          ativo: rhSetorAtivoInput,
        });
        toast.success(`Setor "${nomeLimpo}" atualizado com sucesso.`);
      } else {
        await criarRhSetor(nomeLimpo);
        toast.success(`Setor "${nomeLimpo}" cadastrado com sucesso.`);
      }
      setModalRhSetorAberto(false);
      await carregarRhSetores();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar setor da ASE.');
    } finally {
      setSalvandoRhSetor(false);
    }
  };

  const handleToggleStatusRhSetor = async (setor: RhSetor) => {
    const novoStatus = !setor.ativo;
    try {
      await alternarStatusRhSetor(setor.id, novoStatus);
      setRhSetores(prev => prev.map(s => s.id === setor.id ? { ...s, ativo: novoStatus } : s));
      toast.success(`Setor "${setor.nome}" ${novoStatus ? 'ativado' : 'inativado'}.`);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao alterar status do setor.');
      await carregarRhSetores();
    }
  };

  const handleConfirmarExcluirRhSetor = async () => {
    if (!confirmDeleteRhSetor) return;
    setExcluindoRhSetor(true);
    try {
      await excluirRhSetor(confirmDeleteRhSetor.id);
      toast.success(`Setor "${confirmDeleteRhSetor.nome}" excluído com sucesso.`);
      setConfirmDeleteRhSetor(null);
      await carregarRhSetores();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível excluir o setor.');
    } finally {
      setExcluindoRhSetor(false);
    }
  };

  const filteredRhSetores = useMemo(() => {
    return rhSetores.filter(s => {
      const matchBusca = !buscaRhSetores.trim() || s.nome.toLowerCase().includes(buscaRhSetores.trim().toLowerCase());
      const matchStatus =
        filtroStatusRhSetores === 'todos' ||
        (filtroStatusRhSetores === 'ativos' && s.ativo) ||
        (filtroStatusRhSetores === 'inativos' && !s.ativo);
      return matchBusca && matchStatus;
    });
  }, [rhSetores, buscaRhSetores, filtroStatusRhSetores]);

  const VALID_COMPANIES = ['TEN2', 'AG', 'AMBAS'];

  // Normalização padronizada de cabeçalhos SAP (remove acentos, pontuações e espaços para matching exato)
  // Normalização padronizada de cabeçalhos SAP (remove acentos, pontuações e espaços para matching exato)
  const sanitizeSAPHeader = (h: any): string => {
    return String(h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  };

  // Conversão segura de datas SAP (número serial Excel ex: 46245 ou strings DD/MM/YYYY) para ISO YYYY-MM-DD
  const parseSAPDate = (val: any): string | undefined => {
    if (val === null || val === undefined) return undefined;
    
    // 1. Se for número de série de data do Excel (ex: 46245 ou "46245")
    const strVal = String(val).trim();
    if (typeof val === 'number' || (/^\d{4,5}(\.\d+)?$/.test(strVal) && !strVal.includes('-') && !strVal.includes('/'))) {
      const num = Number(val);
      if (!isNaN(num) && num > 1000 && num < 100000) {
        // Excel epoch date: 25569 dias entre 1899-12-30 e 1970-01-01
        const date = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(date.getTime())) {
          const y = date.getUTCFullYear();
          const m = String(date.getUTCMonth() + 1).padStart(2, '0');
          const d = String(date.getUTCDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      }
    }

    if (!strVal || strVal === '0' || strVal === 'null' || strVal === 'undefined' || strVal === '—' || strVal === '-') return undefined;

    // 2. Se já estiver no formato ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
      return strVal;
    }

    // 3. Se estiver no formato DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
    const parts = strVal.split(/[\/\-\.]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2];
        const dayNum = parseInt(d, 10);
        const monthNum = parseInt(m, 10);
        const yearNum = parseInt(y, 10);
        if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
          return `${y}-${m}-${d}`;
        }
      } else if (parts[0].length === 4) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    return undefined;
  };

  // ZL0169: Parser de Cadastro de Materiais SAP (Todas as colunas da planilha SAP)
  const parseZL0169Rows = (rawRows: any[][]): Omit<Material, 'id' | 'is_active' | 'created_at'>[] => {
    if (rawRows.length < 2) {
      throw new Error('Planilha vazia ou sem linhas de dados.');
    }

    const rawHeaders = rawRows[0];
    const cleanHeaders = rawHeaders.map(sanitizeSAPHeader);

    // 1. Código do Material (Material)
    const codeIdx = cleanHeaders.findIndex(c => 
      c === 'material' || 
      c === 'codigomaterial' || 
      c === 'codmaterial' || 
      c === 'nmaterial' || 
      c === 'nomaterial' || 
      c === 'nummaterial' ||
      c === 'codigo' ||
      c === 'codigosap' ||
      c === 'codigodosap' ||
      (c.includes('material') && (c.includes('n') || c.includes('num') || c.includes('cod')))
    );
    
    // 2. Descrição Breve do Material (TxtBreveMaterial)
    const findMaterialDescriptionIndex = (cleanHdrs: string[]): number => {
      const primaryMatches = [
        'txtbrevematerial',
        'textobrevematerial',
        'textobrevedomaterial',
        'textobrevedematerial',
        'txtbrevemat',
        'textobrevemat',
        'txtbreve',
        'textobreve',
        'descricaodomaterial',
        'descricaodematerial',
        'descricaomaterial',
        'denominacaodomaterial',
        'denominacaodematerial',
        'denominacaomaterial',
        'materialdescription',
        'shorttext'
      ];

      for (const target of primaryMatches) {
        const idx = cleanHdrs.indexOf(target);
        if (idx !== -1) return idx;
      }

      const txtBreveIdx = cleanHdrs.findIndex(c => c.includes('txtbreve') || c.includes('textobreve'));
      if (txtBreveIdx !== -1) return txtBreveIdx;

      const genericIdx = cleanHdrs.findIndex(c => {
        if (c.includes('grupo') || c.includes('tipo') || c.includes('tpmaterial') || c.includes('status') || c.includes('centro') || c.includes('deposito') || c.includes('setor') || c.includes('classe') || c.includes('mercadoria')) {
          return false;
        }
        return c === 'descricao' || c === 'descricaodomaterial' || c === 'denominacao' || c === 'denominacaodomaterial';
      });

      return genericIdx;
    };

    const descIdx = findMaterialDescriptionIndex(cleanHeaders);
    
    // 3. Unidade de Medida (UMB)
    const unitIdx = cleanHeaders.findIndex(c => 
      c === 'umb' || 
      c === 'unidade' || 
      c === 'um' || 
      c === 'un' || 
      c === 'unmedida' || 
      c === 'unidadedemedida' || 
      c === 'unidadebasica' || 
      c === 'unidadedemedidabasica' || 
      c === 'unmedidabasica' || 
      c === 'medida'
    );

    // 4. Centro / Empresa (Cen.)
    const centroIdx = cleanHeaders.findIndex(c => 
      c === 'cen' || 
      c === 'centro' || 
      c === 'empresa' || 
      c === 'emp'
    );

    // 5. Eliminação (Eliminação)
    const eliminacaoIdx = cleanHeaders.findIndex(c => c === 'eliminacao');

    // 6. Elim.nv.Centro (Elim.nv.Centro)
    const elimNivelCentroIdx = cleanHeaders.findIndex(c => c === 'elimnvcentro' || c === 'elimnivelcentro');

    // 7. Status Geral (Status Geral)
    const statusGeralIdx = cleanHeaders.findIndex(c => 
      c === 'statusgeral' || 
      c === 'statusmatgeral' || 
      c === 'statusdomaterialgeral' || 
      c === 'stsgeral' || 
      c === 'statusglobal' ||
      (c.includes('status') && (c.includes('geral') || c.includes('global')))
    );
    
    // 8. Status no Centro (Status no Centro)
    const statusCentroIdx = cleanHeaders.findIndex(c => 
      c === 'statusnocentro' || 
      c === 'statuscentro' || 
      c === 'statusmatcentro' || 
      c === 'statusdomaterialnocentro' || 
      c === 'stscentro' ||
      (c.includes('status') && (c.includes('centro') || c.includes('planta')))
    );

    // 9. Modificado por (Modif.por)
    const modifPorIdx = cleanHeaders.findIndex(c => c === 'modifpor' || c === 'modificadopor');

    // 10. Tipo de Material (TMat)
    const tmatIdx = cleanHeaders.findIndex(c => 
      c === 'tmat' || 
      c === 'tipodematerial' || 
      c === 'tipodemat' || 
      c === 'tipomaterial' || 
      c === 'tmattipo' ||
      c === 'tipodomaterial'
    );
    
    // 11. Código de Controle / NCM (Cód.controle)
    const ncmIdx = cleanHeaders.findIndex(c => 
      c === 'codcontrole' || 
      c === 'codigodecontrole' || 
      c === 'codigocontrole' || 
      c === 'ncm' || 
      c === 'classefiscal' || 
      c === 'ncmcodcontrole'
    );

    // 12. Categoria do Item (ItsMt)
    const itsMtIdx = cleanHeaders.findIndex(c => c === 'itsmt' || c === 'categoriaitem');

    // 13. Indicador S (S)
    const sIdx = cleanHeaders.findIndex(c => c === 's' || c === 'indicadors');

    // 14. Grupo de Mercadorias (GrpMercads.)
    const grpMercadsIdx = cleanHeaders.findIndex(c => c === 'grpmercads' || c === 'grupodemercadorias' || c === 'grupomercadorias');

    // 15. Criado em (Criado)
    const criadoIdx = cleanHeaders.findIndex(c => c === 'criado' || c === 'criadoem' || c === 'datadecriacao');

    // 16. Última Modificação (ÚltModif)
    const ultModifIdx = cleanHeaders.findIndex(c => c === 'ultmodif' || c === 'ultimamodificacao' || c === 'datamodificacao');

    // 17. Idioma (Idioma)
    const idiomaIdx = cleanHeaders.findIndex(c => c === 'idioma');

    // 18. País (País)
    const paisIdx = cleanHeaders.findIndex(c => c === 'pais');

    // 19. Classe Fiscal (ClFis)
    const clFisIdx = cleanHeaders.findIndex(c => c === 'clfis' || c === 'classefiscal');

    // 20. Unidade Alternativa (U)
    const uIdx = cleanHeaders.findIndex(c => c === 'u' || c === 'unidadealternativa' || c === 'unidademedidaalt');

    // 21. Classe de Avaliação (ClAv.)
    const clAvIdx = cleanHeaders.findIndex(c => c === 'clav' || c === 'classeavaliacao' || c === 'classeavaliação');

    // 22. Nº PF (NºPF)
    const npfIdx = cleanHeaders.findIndex(c => c === 'npf' || c === 'numeropf' || c === 'numpf');

    // 23. Denominação do Grupo de Mercadorias (Denominação 2 do grupo de mercadorias)
    const grpDescIdx = cleanHeaders.findIndex(c => c === 'denominacao2dogrupodemercadorias' || c.includes('denominacaogrupo') || c.includes('denominacao2dogrupo'));

    // 24. Denominação do Tipo de Material (Denominação tp.material)
    const tmatDescIdx = cleanHeaders.findIndex(c => c === 'denominacaotpmaterial' || c === 'denominacaotipomaterial' || c.includes('denominacaotp'));

    // 25. Denominação Geral (Denominação)
    const denominacaoIdx = cleanHeaders.findIndex(c => c === 'denominacao');

    // 26. Material Básico (Mat.básico)
    const matBasicoIdx = cleanHeaders.findIndex(c => c === 'matbasico' || c === 'materialbasico');

    // Texto Técnico (Opcional)
    const techIdx = cleanHeaders.findIndex(c => 
      c.includes('textolongo') || 
      c.includes('textotecnico') || 
      c.includes('technicaltext') ||
      c.includes('especificacao')
    );

    if (codeIdx === -1 || descIdx === -1) {
      throw new Error('Colunas obrigatórias não encontradas na ZL0169. Esperado: "Material" e "TxtBreveMaterial" / "Texto breve material". A coluna "Texto técnico" é opcional.');
    }

    const items: Omit<Material, 'id' | 'is_active' | 'created_at'>[] = [];
    rawRows.slice(1).forEach(row => {
      const material_code = String(row[codeIdx] ?? '').trim();
      if (!material_code) return;

      const description = String(row[descIdx] ?? '').trim();
      const centro = centroIdx !== -1 ? String(row[centroIdx] ?? '').trim() : '';
      const rawCompany = centro.toUpperCase();
      const unit = unitIdx !== -1 ? String(row[unitIdx] ?? '').trim().toUpperCase() : 'UN';
      const eliminacao = eliminacaoIdx !== -1 ? String(row[eliminacaoIdx] ?? '').trim() : '';
      const elim_nivel_centro = elimNivelCentroIdx !== -1 ? String(row[elimNivelCentroIdx] ?? '').trim() : '';
      const status_geral = statusGeralIdx !== -1 ? String(row[statusGeralIdx] ?? '').trim() : '';
      const status_centro = statusCentroIdx !== -1 ? String(row[statusCentroIdx] ?? '').trim() : '';
      const modificado_por = modifPorIdx !== -1 ? String(row[modifPorIdx] ?? '').trim() : '';
      const tipo_material = tmatIdx !== -1 ? String(row[tmatIdx] ?? '').trim() : '';
      const tipo_material_desc = tmatDescIdx !== -1 ? String(row[tmatDescIdx] ?? '').trim() : '';
      const codigo_controle = ncmIdx !== -1 ? String(row[ncmIdx] ?? '').trim() : '';
      const categoria_item = itsMtIdx !== -1 ? String(row[itsMtIdx] ?? '').trim() : '';
      const indicador_s = sIdx !== -1 ? String(row[sIdx] ?? '').trim() : '';
      const grupo_mercadoria_codigo = grpMercadsIdx !== -1 ? String(row[grpMercadsIdx] ?? '').trim() : '';
      const grupo_mercadoria_desc = grpDescIdx !== -1 ? String(row[grpDescIdx] ?? '').trim() : '';
      const denominacao = denominacaoIdx !== -1 ? String(row[denominacaoIdx] ?? '').trim() : '';
      const material_basico = matBasicoIdx !== -1 ? String(row[matBasicoIdx] ?? '').trim() : '';
      const classe_fiscal = clFisIdx !== -1 ? String(row[clFisIdx] ?? '').trim() : '';
      const unidade_medida_alt = uIdx !== -1 ? String(row[uIdx] ?? '').trim() : '';
      const classe_avaliacao = clAvIdx !== -1 ? String(row[clAvIdx] ?? '').trim() : '';
      const numero_pf = npfIdx !== -1 ? String(row[npfIdx] ?? '').trim() : '';
      const idioma = idiomaIdx !== -1 ? String(row[idiomaIdx] ?? '').trim() : '';
      const pais = paisIdx !== -1 ? String(row[paisIdx] ?? '').trim() : '';
      const criado_em = criadoIdx !== -1 ? parseSAPDate(row[criadoIdx]) : undefined;
      const ultima_modificacao = ultModifIdx !== -1 ? parseSAPDate(row[ultModifIdx]) : undefined;
      const isObsoleto = status_geral.toUpperCase() === 'Z1' || status_centro.toUpperCase() === 'Z1';

      items.push({
        material_code,
        description,
        technical_text: techIdx !== -1 ? sanitizeTechnicalText(row[techIdx]) : '',
        category: getAutoCategory(description),
        company: (VALID_COMPANIES.includes(rawCompany) ? rawCompany : 'TEN2') as Material['company'],
        unit: unit || 'UN',
        centro,
        eliminacao,
        elim_nivel_centro,
        status_geral,
        status_centro,
        status_sap: isObsoleto ? 'Obsoleto' : 'Ativo',
        modificado_por,
        tipo_material,
        tipo_material_desc,
        codigo_controle,
        categoria_item,
        indicador_s,
        grupo_mercadoria_codigo,
        grupo_mercadoria_desc,
        denominacao,
        material_basico,
        classe_fiscal,
        unidade_medida_alt,
        classe_avaliacao,
        numero_pf,
        idioma,
        pais,
        criado_em,
        ultima_modificacao
      });
    });

    if (items.length === 0) {
      throw new Error('Nenhum material válido encontrado na planilha ZL0169.');
    }

    return items;
  };

  const processZL0169File = (file: File) => {
    setZl0169Error('');
    setZl0169File(file);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();

    reader.onerror = () => {
      setZl0169Error('Falha ao ler o arquivo selecionado.');
      setZl0169Status('error');
    };

    if (isExcel) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
          const items = parseZL0169Rows(rawRows);
          setPendingZL0169Items(items);
          setZl0169Preview(items.slice(0, 10));
          setZl0169Status('parsed');
        } catch (err: any) {
          setZl0169Error(err.message || 'Falha ao processar a planilha ZL0169 (.xlsx/.xls).');
          setZl0169Status('error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (lines.length === 0) throw new Error('Arquivo vazio.');
          const firstLine = lines[0];
          let delimiter = ';';
          if (firstLine.includes('\t')) delimiter = '\t';
          else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';
          else if (firstLine.includes(',') && !firstLine.includes(';')) delimiter = ',';
          else if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/;/g) || []).length) delimiter = '\t';

          const rawRows = lines.map(line =>
            line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''))
          );
          const items = parseZL0169Rows(rawRows);
          setPendingZL0169Items(items);
          setZl0169Preview(items.slice(0, 10));
          setZl0169Status('parsed');
        } catch (err: any) {
          setZl0169Error(err.message || 'Falha ao processar o arquivo ZL0169. Verifique os cabeçalhos.');
          setZl0169Status('error');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleBulkImportZL0169 = async () => {
    setZl0169Status('saving');
    setZl0169Progress(0);
    setZl0169ProgressMsg('Iniciando importação ZL0169...');
    try {
      const result = await localDb.importMaterials(
        pendingZL0169Items,
        zl0169File?.name || 'export_zl0169.xlsx',
        (progress, message) => {
          setZl0169Progress(progress);
          if (message) setZl0169ProgressMsg(message);
        }
      );
      setZl0169Summary(result);
      setZl0169Status('success');
      setZl0169Preview([]);
      setPendingZL0169Items([]);
      loadCatalogStats();
    } catch (err: any) {
      console.error('Erro ao importar catálogo de materiais ZL0169:', err);
      setZl0169Error(`Erro ao realizar salvamento do catálogo: ${err?.message || String(err)}`);
      setZl0169Status('error');
    }
  };

  // ZL0162: Parser de Textos Técnicos / Longos do SAP
  interface ZL0162Item {
    material_code: string;
    description?: string;
    technical_text: string;
  }

  const parseZL0162Rows = (rawRows: any[][]): ZL0162Item[] => {
    if (rawRows.length < 2) {
      throw new Error('Planilha vazia ou sem linhas de dados.');
    }

    const rawHeaders = rawRows[0];
    const cleanHeaders = rawHeaders.map(sanitizeSAPHeader);

    const codeIdx = cleanHeaders.findIndex(c => 
      c === 'material' || 
      c === 'codigomaterial' || 
      c === 'codmaterial' || 
      c === 'nmaterial' || 
      c === 'nomaterial' || 
      c === 'nummaterial' || 
      c === 'codigo'
    );
    
    // Texto longo do material / Texto técnico
    const techIdx = cleanHeaders.findIndex(c => 
      c.includes('textolongo') || 
      c.includes('textotecnico') || 
      c.includes('technicaltext') || 
      c.includes('especificacao') ||
      c === 'txtlongo' ||
      c === 'txtlongodomaterial'
    );

    // Texto breve do material (opcional na ZL0162)
    const descIdx = cleanHeaders.findIndex(c => 
      c === 'txtbrevematerial' || 
      c === 'textobrevematerial' || 
      c === 'textobrevedomaterial' || 
      c === 'txtbreve' || 
      c === 'textobreve' ||
      c === 'descricaodomaterial' ||
      c === 'descricaomaterial'
    );

    if (codeIdx === -1 || techIdx === -1) {
      throw new Error('Colunas obrigatórias não encontradas na ZL0162. Esperado: "Material" e "Texto longo do material" (a coluna "Texto breve material" é opcional).');
    }

    const itemsMap = new Map<string, ZL0162Item>();
    rawRows.slice(1).forEach(row => {
      const material_code = String(row[codeIdx] ?? '').trim();
      if (!material_code) return;

      const technical_text = sanitizeTechnicalText(row[techIdx]);
      const description = descIdx !== -1 ? String(row[descIdx] ?? '').trim() : '';

      if (technical_text || !itemsMap.has(material_code)) {
        itemsMap.set(material_code, {
          material_code,
          description,
          technical_text
        });
      }
    });

    const items = Array.from(itemsMap.values());
    if (items.length === 0) {
      throw new Error('Nenhum registro com código de material válido encontrado na planilha ZL0162.');
    }

    return items;
  };

  const processZL0162File = (file: File) => {
    setZl0162Error('');
    setZl0162File(file);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();

    reader.onerror = () => {
      setZl0162Error('Falha ao ler o arquivo selecionado.');
      setZl0162Status('error');
    };

    if (isExcel) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
          const items = parseZL0162Rows(rawRows);
          setPendingZL0162Items(items);
          setZl0162Preview(items.slice(0, 10));
          setZl0162Status('parsed');
        } catch (err: any) {
          setZl0162Error(err.message || 'Falha ao processar a planilha ZL0162 (.xlsx/.xls).');
          setZl0162Status('error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (lines.length === 0) throw new Error('Arquivo vazio.');
          const firstLine = lines[0];
          let delimiter = ';';
          if (firstLine.includes('\t')) delimiter = '\t';
          else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';
          else if (firstLine.includes(',') && !firstLine.includes(';')) delimiter = ',';
          else if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/;/g) || []).length) delimiter = '\t';

          const rawRows = lines.map(line =>
            line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''))
          );
          const items = parseZL0162Rows(rawRows);
          setPendingZL0162Items(items);
          setZl0162Preview(items.slice(0, 10));
          setZl0162Status('parsed');
        } catch (err: any) {
          setZl0162Error(err.message || 'Falha ao processar o arquivo CSV ZL0162. Verifique o delimitador (; ou TAB).');
          setZl0162Status('error');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleBulkImportZL0162 = async () => {
    setZl0162Status('saving');
    setZl0162Progress(0);
    setZl0162ProgressMsg('Iniciando atualização de textos técnicos ZL0162...');
    try {
      const result = await localDb.importZL0162(
        pendingZL0162Items,
        zl0162File?.name || 'export_zl0162.xlsx',
        (progress, message) => {
          setZl0162Progress(progress);
          if (message) setZl0162ProgressMsg(message);
        }
      );
      setZl0162Summary(result);
      setZl0162Status('success');
      setZl0162Preview([]);
      setPendingZL0162Items([]);
    } catch (err: any) {
      console.error('Erro ao importar textos técnicos ZL0162:', err);
      setZl0162Error(`Erro ao atualizar textos técnicos: ${err?.message || String(err)}`);
      setZl0162Status('error');
    }
  };

  const isRecentlyCreated = (createdAt?: string) => {
    if (!createdAt) return false;
    const createdTime = new Date(createdAt).getTime();
    if (isNaN(createdTime)) return false;
    const now = new Date().getTime();
    const diffDays = (now - createdTime) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  };

  const sectorMap = useMemo(() => {
    const map = new Map<string, string>();
    sectors.forEach(s => map.set(s.id, s.name));
    return map;
  }, [sectors]);

  const userStats = useMemo(() => {
    const total = profiles.length;
    const pending = profiles.filter(p => p.status === 'pendente').length;
    const active = profiles.filter(p => p.status === 'ativo').length;
    const inactive = profiles.filter(p => p.status === 'inativo').length;
    const admins = profiles.filter(p => p.roles?.includes('admin')).length;
    const buyers = profiles.filter(p => p.roles?.includes('comprador') || p.roles?.includes('coordenador_suprimentos')).length;
    const managers = profiles.filter(p => p.roles?.includes('gestor')).length;
    return { total, pending, active, inactive, admins, buyers, managers };
  }, [profiles]);

  const pendingUsers = useMemo(
    () => profiles
      .filter(p => p.status === 'pendente')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })),
    [profiles]
  );

  const filteredUsers = useMemo(
    () => [...profiles]
      .filter(p => {
        // Status / Role chips filter
        if (userStatusFilter === 'ativo' && p.status !== 'ativo') return false;
        if (userStatusFilter === 'inativo' && p.status !== 'inativo') return false;
        if (userStatusFilter === 'pendente' && p.status !== 'pendente') return false;
        if (userStatusFilter === 'admin' && !p.roles?.includes('admin')) return false;
        if (userStatusFilter === 'comprador' && !p.roles?.includes('comprador') && !p.roles?.includes('coordenador_suprimentos')) return false;
        if (userStatusFilter === 'gestor' && !p.roles?.includes('gestor')) return false;

        // Sector dropdown filter
        if (userSectorFilter !== 'all' && p.sector_id !== userSectorFilter) {
          return false;
        }

        // Global search query filter
        if (userSearchQuery.trim()) {
          const q = userSearchQuery.toLowerCase();
          const sectorName = (sectorMap.get(p.sector_id) || '').toLowerCase();
          const matchesName = (p.name || '').toLowerCase().includes(q);
          const matchesEmail = (p.email || '').toLowerCase().includes(q);
          const matchesCargo = (p.cargo || '').toLowerCase().includes(q);
          const matchesSector = sectorName.includes(q);
          const matchesGrupoCompras = (p.grupo_compras || '').toLowerCase().includes(q);
          const matchesRole = (p.roles || []).some(r => getRoleLabel(r).toLowerCase().includes(q));
          return matchesName || matchesEmail || matchesCargo || matchesSector || matchesGrupoCompras || matchesRole;
        }
        return true;
      })
      .sort((a, b) => {
        // Pending users first, then alphabetically
        if (a.status === 'pendente' && b.status !== 'pendente') return -1;
        if (a.status !== 'pendente' && b.status === 'pendente') return 1;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
      }),
    [profiles, userSearchQuery, userSectorFilter, userStatusFilter, sectorMap]
  );

  const getInitials = (str: string) => {
    if (!str) return 'U';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-emerald-600 to-teal-700 text-white',
      'from-blue-600 to-indigo-700 text-white',
      'from-indigo-600 to-violet-700 text-white',
      'from-amber-600 to-orange-700 text-white',
      'from-sky-600 to-cyan-700 text-white',
      'from-slate-700 to-slate-900 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % gradients.length;
    return gradients[idx];
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      visualizador: 'Visualizador',
      solicitante: 'Solicitante',
      requisitante: 'Requisitante',
      gestor: 'Gestor',
      comprador: 'Comprador',
      coordenador_suprimentos: 'Coordenador',
      atendente: 'Atendente Suporte',
      pendente: 'Acesso Pendente'
    };
    return labels[role] || role;
  };

  const getRoleBadgeUI = (role: string) => {
    switch (role) {
      case 'admin':
        return {
          bg: 'bg-amber-50 text-amber-900 border-amber-200',
          icon: ShieldCheck,
          label: 'Administrador'
        };
      case 'comprador':
        return {
          bg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
          icon: ShoppingBag,
          label: 'Comprador'
        };
      case 'coordenador_suprimentos':
        return {
          bg: 'bg-purple-50 text-purple-900 border-purple-200',
          icon: Award,
          label: 'Coordenador'
        };
      case 'gestor':
        return {
          bg: 'bg-indigo-50 text-indigo-900 border-indigo-200',
          icon: Briefcase,
          label: 'Gestor'
        };
      case 'solicitante':
        return {
          bg: 'bg-sky-50 text-sky-900 border-sky-200',
          icon: UserCheck,
          label: 'Solicitante'
        };
      case 'requisitante':
        return {
          bg: 'bg-blue-50 text-blue-900 border-blue-200',
          icon: Users,
          label: 'Requisitante'
        };
      case 'atendente':
        return {
          bg: 'bg-teal-50 text-teal-900 border-teal-200',
          icon: Users2,
          label: 'Atendente'
        };
      case 'pendente':
        return {
          bg: 'bg-yellow-50 text-yellow-900 border-yellow-300',
          icon: AlertTriangle,
          label: 'Pendente'
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          icon: Eye,
          label: 'Visualizador'
        };
    }
  };

  // Matrix configurations
  const permMatrix = [
    { module: 'Solicitações', desc: 'Criar novas solicitações', roles: ['admin', 'solicitante', 'gestor'] },
    { module: 'Solicitações', desc: 'Visualizar próprias solicitações', roles: ['admin', 'solicitante', 'requisitante', 'gestor', 'comprador', 'atendente', 'coordenador_suprimentos', 'visualizador'] },
    { module: 'Solicitações', desc: 'Ver e responder todas as solicitações', roles: ['admin', 'requisitante', 'gestor', 'comprador', 'coordenador_suprimentos'] },
    { module: 'Compras', desc: 'Aprovar compras (setor)', roles: ['admin', 'gestor', 'coordenador_suprimentos'] },
    { module: 'Suprimentos', desc: 'Acessar painel e dashboards SAP', roles: ['admin', 'comprador', 'coordenador_suprimentos'] },
    { module: 'Helpdesk', desc: 'Atender chamados do setor', roles: ['admin', 'atendente'] },
    { module: 'Admin', desc: 'Gerenciar usuários e setores', roles: ['admin'] }
  ];

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Painel de Administração</h2>
        <p className="mt-1 text-sm text-slate-500">Configurações globais, controle de privilégios de acesso, setores ativos e importação de materiais.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 text-xs font-semibold gap-y-1">
        <button
          onClick={() => { setActiveTab('usuarios'); window.location.hash = '/admin/usuarios'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'usuarios' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Users className="h-4 w-4 mr-1.5" />
          Usuários
        </button>
        <button
          onClick={() => { setActiveTab('setores'); window.location.hash = '/admin/setores'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'setores' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <MapIcon className="h-4 w-4 mr-1.5" />
          Setores ({sectors.length})
        </button>
        <button
          onClick={() => { setActiveTab('permissoes'); window.location.hash = '/admin/permissoes'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'permissoes' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Shield className="h-4 w-4 mr-1.5" />
          Permissões (Matrix)
        </button>
        <button
          onClick={() => { setActiveTab('importar_planilhas'); window.location.hash = '/admin/importacao-materiais'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'importar_planilhas' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Upload className="h-4 w-4 mr-1.5" />
          Importação de Planilhas
        </button>
        {(user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos')) && (
          <>
            <button
              onClick={() => { setActiveTab('importar_sap_log'); window.location.hash = '/suprimentos/importar/log'; }}
              className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'importar_sap_log' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Activity className="h-4 w-4 mr-1.5 text-amber-600" />
              Logs SAP
            </button>
            <button
              onClick={() => { setActiveTab('grupos_comprador'); window.location.hash = '/suprimentos/grupos-comprador'; }}
              className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'grupos_comprador' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Users className="h-4 w-4 mr-1.5 text-blue-600" />
              Grupos Compradores
            </button>
          </>
        )}
        {user.roles.includes('admin') && (
          <button
            onClick={() => { setActiveTab('helpdesk_config'); window.location.hash = '/admin/helpdesk'; }}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'helpdesk_config' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <RefreshCw className="h-4 w-4 mr-1.5 text-indigo-600" />
            Config. Helpdesk
          </button>
        )}
        {user.roles.includes('admin') && (
          <button
            onClick={() => { setActiveTab('feedback'); window.location.hash = '/admin/feedback'; }}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'feedback' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Flag className="h-4 w-4 mr-1.5 text-rose-600" />
            Reportes
            {novosFeedbackCount > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5">{novosFeedbackCount}</span>
            )}
          </button>
        )}
        {user.roles.includes('admin') && (
          <button
            onClick={() => { setActiveTab('apis'); window.location.hash = '/admin/apis'; }}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'apis' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Cpu className="h-4 w-4 mr-1.5 text-amber-600" />
            Gestão de APIs & IA
          </button>
        )}
        {user.roles.includes('admin') && (
          <button
            onClick={() => { setActiveTab('diretrizes'); window.location.hash = '/admin/diretrizes'; }}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'diretrizes' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <BookOpen className="h-4 w-4 mr-1.5 text-[#0056c6]" />
            Diretrizes
          </button>
        )}
      </div>

      {/* Tab 1: Users approval list and settings */}
      {activeTab === 'usuarios' && (
        <div className="space-y-6">
          {/* Seletor de Visão: Colaborador vs Módulo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUserViewMode('colaborador')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  userViewMode === 'colaborador'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Visão por Colaborador</span>
              </button>

              <button
                type="button"
                onClick={() => setUserViewMode('modulo')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  userViewMode === 'modulo'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Visão por Módulo & Permissões</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 font-medium px-2">
              {userViewMode === 'colaborador' 
                ? 'Lista de colaboradores cadastrados, setores, cargos e papéis'
                : 'Auditoria e controle de acesso tela a tela do SISTEN'}
            </p>
          </div>

          {userViewMode === 'modulo' ? (
            <UsersByModuleView
              profiles={profiles}
              sectors={sectors}
              currentUser={user}
              onChanged={loadData}
              onEditUser={(u) => setGovernanceModalUser(u)}
              onConfigurePermissions={(id) => setPageAccessProfileId(id)}
            />
          ) : (
            <>
              {/* Executive Overview KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card 1: Total */}
            <div
              onClick={() => { setUserStatusFilter('all'); setUserSectorFilter('all'); setUserSearchQuery(''); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white shadow-2xs hover:shadow-xs flex items-center justify-between ${
                userStatusFilter === 'all' && !userSearchQuery && userSectorFilter === 'all'
                  ? 'border-slate-300 ring-2 ring-slate-400/20'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total de Usuários</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-slate-900">{userStats.total}</span>
                  <span className="text-[11px] font-semibold text-slate-500">cadastrados</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
            </div>

            {/* Card 2: Pendentes */}
            <div
              onClick={() => { setUserStatusFilter('pendente'); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white shadow-2xs hover:shadow-xs flex items-center justify-between ${
                userStatusFilter === 'pendente'
                  ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-400/20'
                  : userStats.pending > 0
                  ? 'border-amber-200/80 bg-amber-50/10 hover:border-amber-300'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div>
                <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  Pendentes {userStats.pending > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`text-2xl font-black ${userStats.pending > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                    {userStats.pending}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">aguardando</span>
                </div>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${userStats.pending > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

            {/* Card 3: Ativos */}
            <div
              onClick={() => { setUserStatusFilter('ativo'); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white shadow-2xs hover:shadow-xs flex items-center justify-between ${
                userStatusFilter === 'ativo'
                  ? 'border-emerald-400 bg-emerald-50/30 ring-2 ring-emerald-400/20'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div>
                <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Perfis Ativos</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-emerald-700">{userStats.active}</span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    ({userStats.total > 0 ? Math.round((userStats.active / userStats.total) * 100) : 0}%)
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>

            {/* Card 4: Privilégios Elevados */}
            <div
              onClick={() => { setUserStatusFilter('admin'); }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white shadow-2xs hover:shadow-xs flex items-center justify-between ${
                userStatusFilter === 'admin'
                  ? 'border-purple-400 bg-purple-50/30 ring-2 ring-purple-400/20'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div>
                <p className="text-[11px] font-bold text-purple-900 uppercase tracking-wider">Administradores</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-purple-900">{userStats.admins}</span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    +{userStats.buyers} compradores
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Fila de aprovações pendentes (Inbox de Novos Cadastros) */}
          {pendingUsers.length > 0 && (
            <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/80 via-amber-50/40 to-white p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                      Fila de Aprovações Pendentes
                      <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-2xs">
                        {pendingUsers.length}
                      </span>
                    </h3>
                    <p className="text-xs text-amber-800/80 mt-0.5">
                      Novos colaboradores que criaram conta e aguardam liberação de perfil e setor.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {pendingUsers.map((p) => {
                  const secName = sectorMap.get(p.sector_id) || (p.sector_id ? `Setor ${p.sector_id}` : 'Não informado');
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl border border-amber-200/80 p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between space-y-3.5"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-sm flex items-center justify-center shadow-2xs shrink-0">
                          {getInitials(p.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 text-xs truncate" title={p.name}>{p.name}</p>
                          <p className="text-[11px] text-slate-500 truncate" title={p.email}>{p.email}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 truncate">
                              <Briefcase className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                              {p.cargo || 'Sem cargo'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 truncate">
                              <Building2 className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                              {secName}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApproveUser(p.id, true)}
                          className="flex-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-1.5 px-3 transition-colors shadow-2xs flex items-center justify-center gap-1 cursor-pointer"
                          title="Aprovar com papel padrão (Visualizador)"
                        >
                          <Check className="w-3.5 h-3.5" /> Aprovar
                        </button>
                        <button
                          type="button"
                          onClick={() => setGovernanceModalUser(p)}
                          className="rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs py-1.5 px-2.5 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          title="Definir setor e papel antes de aprovar"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveUser(p.id, false)}
                          className="rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs py-1.5 px-2.5 transition-colors flex items-center justify-center cursor-pointer"
                          title="Recusar cadastro"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Diretório de Usuários & Controles */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
            {/* Header da Tabela com Sincronização */}
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Diretório de Usuários ({filteredUsers.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gerenciamento de credenciais, setores vinculados, alçadas de compras e liberação de módulos.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedUserIds.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setBulkAccessModalOpen(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-3.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Editar Acessos em Massa ({selectedUserIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedUserIds([])}
                      className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs py-2 px-3 cursor-pointer transition-colors"
                    >
                      Desmarcar todos
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      await localDb.syncFromSupabase(true);
                      toast.success('Usuários e setores sincronizados com o Supabase com sucesso.');
                    } catch (err) {
                      console.error('Falha de sincronização explícita no painel admin:', err);
                      toast.error('Erro na sincronização com o banco.');
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  disabled={syncing}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 font-bold text-xs py-2 px-3.5 cursor-pointer transition-colors border border-slate-200/80 shadow-2xs"
                  title="Sincronizar base local com Supabase"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin text-emerald-600' : ''}`} />
                  Sincronizar
                </button>
              </div>
            </div>

            {/* Chips Rápidos de Filtragem por Status / Papel */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setUserStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  userStatusFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos ({userStats.total})
              </button>
              <button
                type="button"
                onClick={() => setUserStatusFilter('ativo')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  userStatusFilter === 'ativo'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200/70 hover:bg-emerald-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Ativos ({userStats.active})
              </button>
              {userStats.pending > 0 && (
                <button
                  type="button"
                  onClick={() => setUserStatusFilter('pendente')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    userStatusFilter === 'pendente'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Pendentes ({userStats.pending})
                </button>
              )}
              <button
                type="button"
                onClick={() => setUserStatusFilter('admin')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  userStatusFilter === 'admin'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-purple-50 text-purple-900 border border-purple-200/70 hover:bg-purple-100'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admins ({userStats.admins})
              </button>
              <button
                type="button"
                onClick={() => setUserStatusFilter('comprador')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  userStatusFilter === 'comprador'
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-teal-50 text-teal-900 border border-teal-200/70 hover:bg-teal-100'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Compradores ({userStats.buyers})
              </button>
              <button
                type="button"
                onClick={() => setUserStatusFilter('gestor')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  userStatusFilter === 'gestor'
                    ? 'bg-indigo-700 text-white shadow-xs'
                    : 'bg-indigo-50 text-indigo-900 border border-indigo-200/70 hover:bg-indigo-100'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                Gestores ({userStats.managers})
              </button>
              {userStats.inactive > 0 && (
                <button
                  type="button"
                  onClick={() => setUserStatusFilter('inativo')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    userStatusFilter === 'inativo'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  Inativos ({userStats.inactive})
                </button>
              )}
            </div>

            {/* Barra de Busca e Filtro de Setor */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Buscar por nome, e-mail, cargo, setor, papel ou grupo SAP..."
                  className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white placeholder:text-slate-400"
                />
                {userSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setUserSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpar busca"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500 font-semibold">Setor:</span>
                  <select
                    value={userSectorFilter}
                    onChange={(e) => setUserSectorFilter(e.target.value)}
                    className="bg-transparent border-0 text-slate-800 font-bold focus:outline-none cursor-pointer pr-2 text-xs"
                  >
                    <option value="all">Todos ({profiles.length})</option>
                    {sectors.map((sec) => {
                      const count = profiles.filter(p => p.sector_id === sec.id).length;
                      return (
                        <option key={sec.id} value={sec.id}>
                          {sec.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {(userSearchQuery || userSectorFilter !== 'all' || userStatusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserSearchQuery('');
                      setUserSectorFilter('all');
                      setUserStatusFilter('all');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded-lg hover:bg-rose-50 cursor-pointer transition-colors"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>

            {/* Barra de Seleção em Lote */}
            {selectedUserIds.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs animate-in fade-in-50">
                <div className="flex items-center gap-2.5 text-emerald-950 font-semibold">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-white text-[10px] font-bold">
                    {selectedUserIds.length}
                  </span>
                  <span>
                    {selectedUserIds.length} {selectedUserIds.length === 1 ? 'usuário selecionado' : 'usuários selecionados'} para modificação em massa.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkAccessModalOpen(true)}
                  className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                >
                  Configurar módulos em lote &rarr;
                </button>
              </div>
            )}

            {/* Tabela de Usuários */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredUsers.length > 0 && filteredUsers.every(u => selectedUserIds.includes(u.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUserIds(filteredUsers.map(u => u.id));
                          } else {
                            setSelectedUserIds([]);
                          }
                        }}
                        title="Selecionar / Desmarcar todos os usuários listados"
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">Colaborador</th>
                    <th className="py-3 px-3">Cargo & Setor</th>
                    <th className="py-3 px-3">Papel Principal</th>
                    <th className="py-3 px-3 text-center">Grupo SAP</th>
                    <th className="py-3 px-3">Alçadas / Aprovador</th>
                    <th className="py-3 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((p) => {
                    const secName = sectorMap.get(p.sector_id) || (p.sector_id ? `Setor ${p.sector_id}` : null);
                    const isSelected = selectedUserIds.includes(p.id);
                    const isSelf = p.id === user.id;
                    const roleBadge = getRoleBadgeUI(p.roles?.[0] || 'visualizador');
                    const RoleIcon = roleBadge.icon;
                    const hasSectorsApproval = (p.aprovador_setores || []).length > 0;
                    const hasSapApproval = !!p.aprovador_cadastro_sap;

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isSelected ? 'bg-emerald-50/30' : p.status === 'inativo' ? 'bg-slate-50/40 opacity-70' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUserIds(prev => [...prev, p.id]);
                              } else {
                                setSelectedUserIds(prev => prev.filter(id => id !== p.id));
                              }
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                          />
                        </td>

                        {/* Colaborador (Avatar, Nome, E-mail, Status) */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarGradient(p.name)} font-bold text-xs flex items-center justify-center shadow-2xs shrink-0`}>
                              {getInitials(p.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-bold text-slate-900 ${p.status === 'inativo' ? 'line-through text-slate-400' : ''}`}>
                                  {p.name}
                                </span>
                                {isSelf && (
                                  <span className="bg-sky-100 text-sky-800 text-[9px] font-bold px-1.5 py-0.2 rounded border border-sky-200">
                                    Você
                                  </span>
                                )}
                                {p.status === 'pendente' && (
                                  <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1.5 py-0.2 rounded border border-amber-300">
                                    Pendente
                                  </span>
                                )}
                                {p.status === 'inativo' && (
                                  <span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-1.5 py-0.2 rounded border border-rose-200">
                                    Inativo
                                  </span>
                                )}
                                {p.status === 'ativo' && isRecentlyCreated(p.created_at) && (
                                  <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5">
                                    <Sparkles className="w-2.5 h-2.5 text-emerald-600" /> Novo
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{p.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Cargo & Setor */}
                        <td className="py-3.5 px-3">
                          <p className="font-semibold text-slate-800 text-xs">{p.cargo || '—'}</p>
                          <button
                            type="button"
                            onClick={() => setGovernanceModalUser(p)}
                            className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-slate-600 hover:text-emerald-800 transition-colors cursor-pointer group"
                            title="Clique para editar dados ou setor deste colaborador"
                          >
                            <Building2 className="w-3 h-3 text-slate-400 group-hover:text-emerald-600 shrink-0" />
                            <span className="group-hover:underline">{secName || 'Sem setor vinculado'}</span>
                          </button>
                        </td>

                        {/* Papel Principal */}
                        <td className="py-3.5 px-3">
                          <button
                            type="button"
                            onClick={() => setGovernanceModalUser(p)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${roleBadge.bg}`}
                            title="Clique para gerenciar papéis e permissões"
                          >
                            <RoleIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{roleBadge.label}</span>
                          </button>
                        </td>

                        {/* Grupo SAP */}
                        <td className="py-3.5 px-3 text-center">
                          {p.grupo_compras ? (
                            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                              {p.grupo_compras}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">—</span>
                          )}
                        </td>

                        {/* Alçadas / Aprovador */}
                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {hasSectorsApproval && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                                {p.aprovador_setores?.length} setor(es)
                              </span>
                            )}
                            {hasSapApproval && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <FileCheck className="w-3 h-3 text-amber-600" />
                                SAP Mat.
                              </span>
                            )}
                            {!hasSectorsApproval && !hasSapApproval && (
                              <span className="text-slate-400 text-xs font-normal">Nenhuma</span>
                            )}
                          </div>
                        </td>

                        {/* Ações */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setGovernanceModalUser(p)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer border border-slate-200/80"
                              title="Gerenciar todos os dados, alçadas e setor deste colaborador"
                            >
                              <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setPageAccessProfileId(p.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                              title="Configurar permissão granular por módulo"
                            >
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>

                            {p.status === 'inativo' ? (
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(p.id, 'ativo')}
                                className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                                title="Reativar colaborador"
                              >
                                <UserCheck className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(p.id, 'inativo')}
                                disabled={isSelf}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                title={isSelf ? 'Você não pode inativar sua própria conta' : 'Inativar acesso deste usuário'}
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                          <Users className="w-8 h-8 opacity-30" />
                          <p className="font-semibold text-sm text-slate-600">Nenhum colaborador encontrado</p>
                          <p className="text-xs text-slate-400">Tente ajustar a busca ou os filtros aplicados acima.</p>
                          {(userSearchQuery || userSectorFilter !== 'all' || userStatusFilter !== 'all') && (
                            <button
                              type="button"
                              onClick={() => {
                                setUserSearchQuery('');
                                setUserSectorFilter('all');
                                setUserStatusFilter('all');
                              }}
                              className="mt-2 text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                            >
                              Limpar todos os filtros
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: Sectors matrix settings (Corporativos + ASE) */}
      {activeTab === 'setores' && (
        <div className="space-y-4">
          {/* Sub-tabs header */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:px-5 sm:py-3.5 shadow-2xs">
            <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setSubTabSetores('corporativos')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  subTabSetores === 'corporativos'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>Setores Corporativos</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  subTabSetores === 'corporativos' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {sectors.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSubTabSetores('ase')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  subTabSetores === 'ase'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>Setores da ASE / RH</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  subTabSetores === 'ase' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-200 text-slate-600'
                }`}>
                  {rhSetores.length}
                </span>
              </button>
            </div>

            {subTabSetores === 'ase' && (
              <button
                type="button"
                onClick={handleOpenNovoRhSetor}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Novo Setor ASE</span>
              </button>
            )}
          </div>

          {/* Sub-tab 1: Setores Corporativos */}
          {subTabSetores === 'corporativos' && (
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Setores Corporativos da Torres Eólicas ({sectors.length})</h3>
                  <p className="text-xs text-slate-500">
                    Setores organizacionais para cadastro de usuários, fluxo de aprovações e roteamento de chamados do Helpdesk.
                  </p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-3">ID Setor</th>
                      <th className="py-3">Nome do Setor</th>
                      <th className="py-3 text-center">É Apoio? (Suporte)</th>
                      <th className="py-3 text-center">Helpdesk Ativo?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sectors.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="py-3 font-mono text-slate-500 font-bold">#{s.id}</td>
                        <td className="py-3 font-semibold text-slate-800">{s.name}</td>
                        <td className="py-3 text-center">
                          <button
                            onClick={() => handleToggleSectorSupport(s.id)}
                            className={`inline-flex items-center px-2 py-1 rounded font-bold text-[10px] uppercase border transition-all cursor-pointer ${s.is_support ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                          >
                            {s.is_support ? 'Suporte Ativo' : 'Não'}
                          </button>
                        </td>
                        <td className="py-3 text-center">
                          <button
                            onClick={() => handleToggleSectorHelpdesk(s.id)}
                            className={`inline-flex items-center px-2 py-1 rounded font-bold text-[10px] uppercase border transition-all cursor-pointer ${s.helpdesk_enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                          >
                            {s.helpdesk_enabled ? 'Helpdesk Ativo' : 'Inativo'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-tab 2: Setores da ASE / RH */}
          {subTabSetores === 'ase' && (
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">
                      Setores da ASE / RH (Hora Extra)
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {rhSetores.length} setores ({rhSetores.filter(s => s.ativo).length} ativos)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Setores operacionais de fábrica utilizados na abertura de solicitações de ASE e controle de horas extras.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={carregarRhSetores}
                  disabled={loadingRhSetores}
                  title="Recarregar setores da ASE"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer transition-colors shrink-0 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loadingRhSetores ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>

              {/* Filtros e Busca */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome do setor..."
                    value={buscaRhSetores}
                    onChange={e => setBuscaRhSetores(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                  />
                  {buscaRhSetores && (
                    <button
                      type="button"
                      onClick={() => setBuscaRhSetores('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 mr-1 font-medium">Filtrar:</span>
                  {(['todos', 'ativos', 'inativos'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFiltroStatusRhSetores(st)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                        filtroStatusRhSetores === st
                          ? 'bg-slate-800 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabela de Setores ASE */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-3">Nome do Setor</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-center">Criado em</th>
                      <th className="py-3 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRhSetores.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full shrink-0 bg-slate-300" />
                            <span className={`font-bold ${s.ativo ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                              {s.nome}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                            s.ativo
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${s.ativo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {s.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-500">
                          {s.created_at ? formatDateBR(s.created_at) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditarRhSetor(s)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                              title="Editar nome ou status do setor"
                            >
                              <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleStatusRhSetor(s)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                s.ativo
                                  ? 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'
                                  : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                              }`}
                              title={s.ativo ? 'Inativar setor (não aparecerá em novas solicitações)' : 'Reativar setor'}
                            >
                              <span>{s.ativo ? 'Inativar' : 'Reativar'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRhSetor(s)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Excluir setor"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredRhSetores.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-slate-400">
                          <p className="font-semibold text-sm">Nenhum setor da ASE encontrado</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {buscaRhSetores || filtroStatusRhSetores !== 'todos'
                              ? 'Tente limpar a busca ou os filtros de status.'
                              : 'Clique em "Novo Setor ASE" para cadastrar.'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Modal Adicionar / Editar Setor ASE */}
          {modalRhSetorAberto && (
            <Modal
              onClose={() => !salvandoRhSetor && setModalRhSetorAberto(false)}
              maxWidth="max-w-md"
              ariaLabel={editingRhSetor ? 'Editar Setor da ASE' : 'Novo Setor da ASE'}
            >
              <ModalHeader onClose={() => !salvandoRhSetor && setModalRhSetorAberto(false)}>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      {editingRhSetor ? 'Editar Setor da ASE' : 'Novo Setor da ASE'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {editingRhSetor ? 'Altere o nome ou o status do setor' : 'Cadastre um novo setor para o formulário de ASE'}
                    </p>
                  </div>
                </div>
              </ModalHeader>

              <form onSubmit={handleSalvarRhSetor} className="flex flex-col flex-1 min-h-0">
                <ModalBody className="space-y-4">
                  <div>
                    <label htmlFor="nomeSetorAse" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      Nome do Setor *
                    </label>
                    <input
                      id="nomeSetorAse"
                      type="text"
                      required
                      placeholder="Ex: CALDEIRARIA, PINTURA, PRODUÇÃO..."
                      value={rhSetorNomeInput}
                      onChange={e => setRhSetorNomeInput(e.target.value.toUpperCase())}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-bold uppercase text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                      autoFocus
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      O nome será salvo padronizado em caixa alta.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rhSetorAtivoInput}
                        onChange={e => setRhSetorAtivoInput(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Setor Ativo</span>
                        <span className="text-[11px] text-slate-500 block">
                          Setores ativos ficam visíveis para seleção em novas solicitações de ASE.
                        </span>
                      </div>
                    </label>
                  </div>
                </ModalBody>

                <ModalFooter>
                  <button
                    type="button"
                    onClick={() => setModalRhSetorAberto(false)}
                    disabled={salvandoRhSetor}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoRhSetor}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {salvandoRhSetor ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>{editingRhSetor ? 'Salvar Alterações' : 'Cadastrar Setor'}</span>
                      </>
                    )}
                  </button>
                </ModalFooter>
              </form>
            </Modal>
          )}

          {/* Diálogo de confirmação de exclusão */}
          {confirmDeleteRhSetor && (
            <ConfirmDialog
              titulo="Excluir Setor da ASE"
              mensagem={
                <div className="space-y-2 text-xs text-slate-600">
                  <p>
                    Tem certeza de que deseja excluir o setor <strong>{confirmDeleteRhSetor.nome}</strong>?
                  </p>
                  <p className="text-slate-500">
                    Se este setor já tiver solicitações de ASE vinculadas no banco, o sistema impedirá a exclusão física e recomendará <strong>inativá-lo</strong> para preservar o histórico.
                  </p>
                </div>
              }
              confirmarLabel="Sim, excluir"
              cancelarLabel="Cancelar"
              variante="perigo"
              confirmando={excluindoRhSetor}
              onConfirmar={handleConfirmarExcluirRhSetor}
              onCancelar={() => setConfirmDeleteRhSetor(null)}
            />
          )}
        </div>
      )}

      {/* Tab 3: Detailed standard permission matrix for 7 roles */}
      {activeTab === 'permissoes' && (
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Matriz de Privilégios (RBAC)</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">Módulo</th>
                  <th className="py-3 px-3">Ação Autorizada</th>
                  <th className="py-3 px-3 text-center">Admin</th>
                  <th className="py-3 px-3 text-center">Coord.</th>
                  <th className="py-3 px-3 text-center">Gestor</th>
                  <th className="py-3 px-3 text-center">Comprador</th>
                  <th className="py-3 px-3 text-center">Atendente</th>
                  <th className="py-3 px-3 text-center">Solicitante</th>
                  <th className="py-3 px-3 text-center">Requisitante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {permMatrix.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-bold text-slate-800">{item.module}</td>
                    <td className="py-3 px-3">{item.desc}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('admin') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('coordenador_suprimentos') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('gestor') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('comprador') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('atendente') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('solicitante') ? '✓' : '-'}</td>
                    <td className="py-3 px-3 text-center">{item.roles.includes('requisitante') ? '✓' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/*
        Aba "Importação de Planilhas": todos os módulos empilhados numa única
        página (Suprimentos, Almoxarifado, Financeiro, RH), igual ao padrão já
        usado em Formulários (áreas com cards) — sem sub-abas para trocar de
        módulo.
      */}
      {activeTab === 'importar_planilhas' && (
        <div className="space-y-8">

        {/* Módulo: Suprimentos */}
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white px-5 py-6 sm:px-8 sm:py-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">Suprimentos</h2>
          </div>
        {/* Carga de Dados do SAP e Fornecedores exibida primeiro (order-1) — o
            bloco de Catálogo (ZL0169/ZL0162) continua logo abaixo (order-2)
            no código; só a posição visual mudou, via `order` do flexbox, para
            não arriscar mover ~1400 linhas de JSX self-contido. */}
        <div className="order-2 mt-6 space-y-6">
          {/* Painel de Referência de Códigos para Próxima Exportação no SAP */}
          <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 via-white to-slate-50 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100/80 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-700 text-white shadow-2xs">
                    <Database className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-bold text-slate-800">
                    Referência de Códigos SAP para Nova Importação
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    2 Consultas Distintas
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Use os maiores códigos abaixo para parametrizar o filtro de extração incremental no SAP (filtro &gt; maior código cadastrado) e trazer apenas os novos materiais.
                </p>
              </div>
              <button
                type="button"
                onClick={loadCatalogStats}
                disabled={loadingCatalogStats}
                title="Recarregar maiores códigos"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer transition-colors shrink-0 self-start sm:self-auto disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-emerald-600 ${loadingCatalogStats ? 'animate-spin' : ''}`} />
                <span>{loadingCatalogStats ? 'Atualizando...' : 'Recarregar'}</span>
              </button>
            </div>

            {/* Cards das 2 Consultas Distintas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Faixa Padrão (7 dígitos) */}
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/60">
                      <Hash className="h-3.5 w-3.5 text-emerald-700" /> Consulta 1: Código Padrão (7 dígitos)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Faixa 1.000.000 a 1.999.999</span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-semibold text-slate-500 block">
                      Maior código atual no SISTEN:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xl font-black text-slate-900 tracking-tight">
                        {loadingCatalogStats ? (
                          <span className="inline-block w-24 h-7 bg-slate-100 rounded animate-pulse" />
                        ) : (
                          catalogCodeStats?.maxStandard7d || '—'
                        )}
                      </span>
                      {catalogCodeStats?.maxStandard7d && (
                        <button
                          type="button"
                          onClick={() => handleCopyCode(catalogCodeStats.maxStandard7d!, 'Padrão 7d')}
                          title="Copiar maior código"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
                        >
                          {copiedCode === catalogCodeStats.maxStandard7d ? (
                            <Check className="h-4 w-4 text-emerald-600 font-bold" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Próxima exportação a partir de */}
                  <div className="rounded-lg bg-emerald-50/80 border border-emerald-200/80 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-900 flex items-center gap-1">
                        <ArrowRight className="h-3.5 w-3.5 text-emerald-700" /> Nova importação a partir de:
                      </span>
                      <span className="font-mono font-black text-emerald-800 text-sm">
                        {loadingCatalogStats ? '...' : calcNextCode(catalogCodeStats?.maxStandard7d)}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-tight">
                      Filtro no SAP: <code className="bg-emerald-100/70 px-1 py-0.5 rounded font-mono text-emerald-900">&gt; {catalogCodeStats?.maxStandard7d || '1487950'}</code> ou <code className="bg-emerald-100/70 px-1 py-0.5 rounded font-mono text-emerald-900">&gt;= {calcNextCode(catalogCodeStats?.maxStandard7d)}</code>
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>Consulta de materiais gerais, insumos e peças com numeração padrão de 7 dígitos.</span>
                </div>
              </div>

              {/* Card 2: Faixa Longa (18 dígitos iniciados em 100000...) */}
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200/60">
                      <Layers className="h-3.5 w-3.5 text-blue-700" /> Consulta 2: Código Longo (18 dígitos)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Iniciados em 100000...</span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-semibold text-slate-500 block">
                      Maior código atual no SISTEN:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base sm:text-lg font-black text-slate-900 tracking-tight break-all">
                        {loadingCatalogStats ? (
                          <span className="inline-block w-40 h-7 bg-slate-100 rounded animate-pulse" />
                        ) : (
                          catalogCodeStats?.maxLong18d || '—'
                        )}
                      </span>
                      {catalogCodeStats?.maxLong18d && (
                        <button
                          type="button"
                          onClick={() => handleCopyCode(catalogCodeStats.maxLong18d!, 'Longo 18d')}
                          title="Copiar maior código"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer transition-colors shrink-0"
                        >
                          {copiedCode === catalogCodeStats.maxLong18d ? (
                            <Check className="h-4 w-4 text-emerald-600 font-bold" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Próxima exportação a partir de */}
                  <div className="rounded-lg bg-blue-50/80 border border-blue-200/80 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-blue-900 flex items-center gap-1">
                        <ArrowRight className="h-3.5 w-3.5 text-blue-700" /> Nova importação a partir de:
                      </span>
                      <span className="font-mono font-black text-blue-800 text-xs sm:text-sm break-all">
                        {loadingCatalogStats ? '...' : calcNextCode(catalogCodeStats?.maxLong18d)}
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-700 leading-tight">
                      Filtro no SAP: <code className="bg-blue-100/70 px-1 py-0.5 rounded font-mono text-blue-900">&gt; {catalogCodeStats?.maxLong18d || '100000000000047981'}</code> ou <code className="bg-blue-100/70 px-1 py-0.5 rounded font-mono text-blue-900">&gt;= {calcNextCode(catalogCodeStats?.maxLong18d)}</code>
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>Consulta SAP específica para a série estendida de 18 dígitos com prefixo 100000.</span>
                </div>
              </div>
            </div>

            {/* Rodapé informativo */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <span>
                  Total no catálogo: <strong className="text-slate-800 font-bold">{catalogCodeStats?.totalMaterials ? Number(catalogCodeStats.totalMaterials).toLocaleString('pt-BR') : '452.072'}</strong> materiais
                </span>
                {catalogCodeStats?.lastCreatedAt && (
                  <span className="text-[11px] text-slate-400">
                    • Última inclusão em {new Date(catalogCodeStats.lastCreatedAt).toLocaleDateString('pt-BR')} às {new Date(catalogCodeStats.lastCreatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 italic">
                Dica: Realize as duas extrações no SAP separadamente e importe as planilhas aqui.
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-700" /> Carga de Catálogo e Textos Técnicos do SAP
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  O catálogo do SISTEN é alimentado em 2 etapas: primeiro importe o cadastro mestre com código e descrição breve (transação <strong>ZL0169</strong>), e depois enriqueça a base com os textos técnicos longos e especificações detalhadas (transação <strong>ZL0162</strong>).
                </p>
              </div>
            </div>



            {/* Grid de Cards de Importação (Estilo Importar SAP) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
              {/* Card 1: Importar ZL0169 (Cadastro de Materiais) */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-3.5 bg-white shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-2xs" />
                      Importar ZL0169 (Cadastro de Materiais SAP)
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Cadastro Mestre
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Carregue a planilha exportada da transação <strong>ZL0169</strong> para cadastrar ou atualizar o catálogo mestre de materiais. O texto técnico nesta planilha agora é <strong>não obrigatório</strong>.
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded border border-slate-200">
                      Material (Obrigatório)
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded border border-slate-200">
                      Texto breve material (Obrigatório)
                    </span>
                    <span className="text-[10px] bg-slate-50 text-slate-500 font-mono px-2 py-0.5 rounded border border-slate-200">
                      empresa (Opcional)
                    </span>
                    <span className="text-[10px] bg-amber-50 text-amber-700 font-mono px-2 py-0.5 rounded border border-amber-200">
                      Texto técnico (Opcional)
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="border-2 border-dashed border-emerald-200/80 hover:border-emerald-500 hover:bg-emerald-50/30 rounded-xl p-6 text-center cursor-pointer relative transition-all group">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          processZL0169File(e.target.files[0]);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="mx-auto h-7 w-7 text-emerald-600 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-700 mt-2">Carregar planilha ZL0169</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Aceita .xlsx, .xls ou .csv (delimitado por ;) • Máx 10 MB</p>
                  </div>

                  {zl0169Error && (
                    <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                      <AlertTriangle className="mr-2 h-4 w-4 shrink-0 text-red-500" />
                      <span>{zl0169Error}</span>
                    </div>
                  )}

                  {zl0169Status === 'saving' && (
                    <div className="rounded-lg bg-blue-50 p-3 text-xs font-semibold text-blue-800 border border-blue-100 space-y-1.5">
                      <div className="flex items-center">
                        <RefreshCw className="mr-2 h-4 w-4 shrink-0 text-blue-600 animate-spin" />
                        <span>{zl0169ProgressMsg || 'Salvando catálogo ZL0169 no Supabase...'}</span>
                      </div>
                      {zl0169Progress > 0 && (
                        <div className="w-full bg-blue-200/60 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${zl0169Progress}%` }} />
                        </div>
                      )}
                    </div>
                  )}

                  {zl0169Status === 'success' && zl0169Summary && (
                    <div className={`rounded-lg p-3 text-xs font-semibold border flex items-center ${zl0169Summary.syncFailed > 0 ? 'bg-amber-50 text-amber-800 border-amber-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
                      {zl0169Summary.syncFailed > 0 ? (
                        <AlertTriangle className="mr-2 h-4 w-4 shrink-0 text-amber-600" />
                      ) : (
                        <Check className="mr-2 h-4 w-4 shrink-0 text-emerald-600 font-black" />
                      )}
                      <span>
                        Importação ZL0169 concluída! Lidos: {zl0169Summary.read}, Inseridos: {zl0169Summary.inserted}, Atualizados: {zl0169Summary.updated}.
                        {zl0169Summary.syncFailed > 0 && ` ${zl0169Summary.syncFailed} linha(s) falharam na sincronização.`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Importar ZL0162 (Texto Técnico dos Materiais) */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-3.5 bg-white shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shadow-2xs" />
                      Importar ZL0162 (Texto Técnico dos Materiais)
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Texto Técnico
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Carregue a planilha exportada da transação <strong>ZL0162</strong> com as especificações técnicas longas. O sistema vincula pela coluna <strong>Material</strong> e atualiza o texto técnico dos materiais no catálogo.
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded border border-slate-200">
                      Material (Obrigatório)
                    </span>
                    <span className="text-[10px] bg-blue-50 text-blue-700 font-mono px-2 py-0.5 rounded border border-blue-200">
                      Texto longo do material (Obrigatório)
                    </span>
                    <span className="text-[10px] bg-slate-50 text-slate-500 font-mono px-2 py-0.5 rounded border border-slate-200">
                      Texto breve material (Opcional)
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="border-2 border-dashed border-blue-200/80 hover:border-blue-500 hover:bg-blue-50/30 rounded-xl p-6 text-center cursor-pointer relative transition-all group">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          processZL0162File(e.target.files[0]);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="mx-auto h-7 w-7 text-blue-600 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-700 mt-2">Carregar planilha ZL0162</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Aceita .xlsx, .xls ou .csv (delimitado por ;) • Máx 10 MB</p>
                  </div>

                  {zl0162Error && (
                    <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                      <AlertTriangle className="mr-2 h-4 w-4 shrink-0 text-red-500" />
                      <span>{zl0162Error}</span>
                    </div>
                  )}

                  {zl0162Status === 'saving' && (
                    <div className="rounded-lg bg-blue-50 p-3 text-xs font-semibold text-blue-800 border border-blue-100 space-y-1.5">
                      <div className="flex items-center">
                        <RefreshCw className="mr-2 h-4 w-4 shrink-0 text-blue-600 animate-spin" />
                        <span>{zl0162ProgressMsg || 'Atualizando textos técnicos ZL0162 no Supabase...'}</span>
                      </div>
                      {zl0162Progress > 0 && (
                        <div className="w-full bg-blue-200/60 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${zl0162Progress}%` }} />
                        </div>
                      )}
                    </div>
                  )}

                  {zl0162Status === 'success' && zl0162Summary && (
                    <div className={`rounded-lg p-3 text-xs font-semibold border flex items-center ${zl0162Summary.syncFailed > 0 ? 'bg-amber-50 text-amber-800 border-amber-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
                      {zl0162Summary.syncFailed > 0 ? (
                        <AlertTriangle className="mr-2 h-4 w-4 shrink-0 text-amber-600" />
                      ) : (
                        <Check className="mr-2 h-4 w-4 shrink-0 text-emerald-600 font-black" />
                      )}
                      <span>
                        Textos técnicos atualizados! Lidos: {zl0162Summary.read}, Atualizados no catálogo: {zl0162Summary.updated}, Não encontrados: {zl0162Summary.notFound}.
                        {zl0162Summary.syncFailed > 0 && ` ${zl0162Summary.syncFailed} linha(s) falharam na sincronização.`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Import preview panel ZL0169 */}
          {zl0169Status === 'parsed' && zl0169Preview.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 pb-3">
                <div>
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Pré-visualização ZL0169 ({pendingZL0169Items.length} materiais lidos, amostra dos 10 primeiros)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Confira os dados antes de gravar as inclusões/atualizações no banco.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setZl0169Status('idle');
                      setZl0169Preview([]);
                      setPendingZL0169Items([]);
                    }}
                    className="rounded border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs py-1.5 px-3 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkImportZL0169}
                    className="rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-1.5 px-4 cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" /> Confirmar Importação ZL0169
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-2 px-3">Código SAP</th>
                      <th className="py-2 px-3">Descrição Breve</th>
                      <th className="py-2 px-3 text-center">Status SAP</th>
                      <th className="py-2 px-3 text-center">TMAT</th>
                      <th className="py-2 px-3">NCM</th>
                      <th className="py-2 px-3 text-center">UN</th>
                      <th className="py-2 px-3">Categoria Sugerida</th>
                      <th className="py-2 px-3 text-center">Empresa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {zl0169Preview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-mono text-emerald-800 font-bold">{item.material_code}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{item.description}</td>
                        <td className="py-2 px-3 text-center">
                          {item.status_sap === 'Obsoleto' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Obsoleto (Z1)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-600 font-semibold">{item.tipo_material || '—'}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{item.codigo_controle || '—'}</td>
                        <td className="py-2 px-3 text-center font-mono text-slate-600">{item.unit || 'UN'}</td>
                        <td className="py-2 px-3 font-medium text-slate-600">{item.category}</td>
                        <td className="py-2 px-3 text-center font-bold text-slate-500">{item.company}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import preview panel ZL0162 */}
          {zl0162Status === 'parsed' && zl0162Preview.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-3">
                <div>
                  <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Pré-visualização ZL0162 ({pendingZL0162Items.length} textos técnicos lidos, amostra dos 10 primeiros)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Estes textos serão vinculados aos materiais pelo código SAP correspondente.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setZl0162Status('idle');
                      setZl0162Preview([]);
                      setPendingZL0162Items([]);
                    }}
                    className="rounded border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs py-1.5 px-3 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkImportZL0162}
                    className="rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-1.5 px-4 cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" /> Confirmar Atualização (ZL0162)
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-2 px-3 w-32">Código SAP</th>
                      <th className="py-2 px-3 w-64">Descrição (Referência)</th>
                      <th className="py-2 px-3">Texto Longo do Material (Especificação Técnica)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {zl0162Preview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-mono text-blue-800 font-bold align-top">{item.material_code}</td>
                        <td className="py-2 px-3 font-medium text-slate-700 align-top">{item.description || '—'}</td>
                        <td className="py-2 px-3 text-slate-600 font-mono text-[11px] leading-relaxed break-words max-w-xl">
                          {item.technical_text || <span className="text-slate-400 italic">Vazio</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="order-1 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-700" /> Carga de Dados do SAP e Fornecedores
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              O sistema sincroniza a fila de solicitações e ordens de compra cruzando as requisições abertas (ME5A), posição de estoque (ZL0024), histórico de compras por fornecedor (ZL0132) e contatos.
              Você pode carregar arquivos nos formatos XLSX, XLS ou CSV.
            </p>

            {/* Custom file parser */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5 pt-1">

              {/* ME5A Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Transação ME5A (Requisições)
                </h4>
                <p className="text-[10px] text-slate-400">Arraste ou cole o arquivo exportado do SAP para atualizar as demandas em aberto.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setSapProgress(0);
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importME5ARaw(rawRows, file.name, setSapProgress).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };
                        
                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV ME5A</p>
                </div>
              </div>

              {/* ZL0024 Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Transação ZL0024 (Posição de Estoque)
                </h4>
                <p className="text-[10px] text-slate-400">Substitui integralmente a posição de estoque anterior — a última carga é sempre a mais atual.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setSapProgress(0);
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importZL0024Raw(rawRows, file.name, setSapProgress).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };

                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV ZL0024</p>
                </div>
              </div>

              {/* PedidosForn Upload Card (renomeado para ZL0132) */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Transação ZL0132 (Histórico de Pedidos)
                </h4>
                <p className="text-[10px] text-slate-400">Arraste ou cole o arquivo para atualizar o histórico de fornecedores por material.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();
                        
                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }
                            
                            setSapProgress(0);
                            setSapLogMessage('Lendo dados...');
                            localDb.importPedidosForn(rawRows, file.name, (progress, message) => {
                              setSapProgress(progress);
                              if (message) setSapLogMessage(message);
                            }).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };
                        
                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV ZL0132</p>
                </div>
              </div>

              {/* MB51 Upload Card (trocado de lugar com Contatos) */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-orange-500" /> Transação MB51 (Mov. Estoque)
                  </h4>
                </div>
                <p className="text-[10px] text-slate-400">
                  Importa entradas, saídas, baixas de projeto (PEP) e transferências de estoque.
                </p>

                {/* Seletor de Modo de Importação */}
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80 space-y-1.5">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Modo de Carga</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMb51ImportMode('upsert')}
                      className={`text-[10px] font-semibold py-1 px-2 rounded transition-all cursor-pointer text-center ${
                        mb51ImportMode === 'upsert'
                          ? 'bg-orange-500 text-white shadow-xs font-bold'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ➕ Apenas Novos
                    </button>
                    <button
                      type="button"
                      onClick={() => setMb51ImportMode('replace')}
                      className={`text-[10px] font-semibold py-1 px-2 rounded transition-all cursor-pointer text-center ${
                        mb51ImportMode === 'replace'
                          ? 'bg-red-600 text-white shadow-xs font-bold'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      🔄 Substituir Tudo
                    </button>
                  </div>
                </div>

                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-5 text-center cursor-pointer relative transition-colors">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setSapProgress(0);
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importMB51Raw(rawRows, file.name, mb51ImportMode, setSapProgress).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha MB51.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha MB51.');
                            setSapLogStatus('error');
                          }
                        };

                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV MB51</p>
                  <span className="text-[9px] text-slate-400 mt-0.5 block">
                    {mb51ImportMode === 'upsert' ? 'Modo: Upsert de novos registros' : 'Modo: Substituição completa da tabela'}
                  </span>
                </div>
              </div>

              {/* CidadeForn Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-purple-500" /> Cidades & Endereços (CidadeForn)
                </h4>
                <p className="text-[10px] text-slate-400">Arraste ou cole o arquivo para atualizar ruas, países e localidades dos fornecedores.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();
                        
                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }
                            
                            localDb.importCidadeForn(rawRows, file.name).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };
                        
                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV CidadeForn</p>
                </div>
              </div>

              {/* ME3N Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Transação ME3N (Contratos)
                </h4>
                <p className="text-[10px] text-slate-400">Substitui integralmente os contratos anteriores — a última carga é sempre a mais atual.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setSapProgress(0);
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importME3NRaw(rawRows, file.name, setSapProgress).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };

                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV ME3N</p>
                </div>
              </div>

              {/* ZL0170 Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-teal-500" /> ZL0170 (Reconciliação Pedido x MIGO x MIRO)
                </h4>
                <p className="text-[10px] text-slate-400">Substitui integralmente os dados anteriores — a última carga é sempre a mais atual. Permite identificar a qual Pedido (PO) cada fatura MIRO se refere.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setSapProgress(0);
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importZL0170MiroRaw(rawRows, file.name, setSapProgress).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };

                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV ZL0170</p>
                </div>
              </div>

              {/* Tabela de Frete Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-cyan-500" /> Tabela de Frete (Rodoviário)
                </h4>
                <p className="text-[10px] text-slate-400">Importa a tabela de frete com faixas de peso, taxas (CAT, ITR/TAS, Pedágio), ICMS e tipos de veículos.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setSapProgress(0);
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importTabelaFreteRaw(rawRows, file.name, (pct, msg) => {
                              setSapProgress(pct);
                              if (msg) setSapLogMessage(msg);
                            }).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha de frete.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha de frete.');
                            setSapLogStatus('error');
                          }
                        };

                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV Tabela de Frete</p>
                </div>
              </div>

              {/* Contatos Upload Card (trocado de lugar com MB51) */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Cadastro de Contatos (Contatos)
                </h4>
                <p className="text-[10px] text-slate-400">Arraste ou cole o arquivo para atualizar os contatos de fornecedores.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            localDb.importContatos(rawRows, file.name).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha.');
                            setSapLogStatus('error');
                          }
                        };

                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV Contatos</p>
                </div>
              </div>

              {/* Bahia Sul Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Bahia Sul (Entregas CTe)
                </h4>
                <p className="text-[10px] text-slate-400">Planilha de CTe da transportadora Bahia Sul com dados de entregas das compras.</p>
                <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const file = e.target.files[0];
                        const fileExtension = file.name.split('.').pop()?.toLowerCase();
                        setSapLogStatus('saving');
                        setLastUploadLog(null);
                        setSapLogError('');
                        const r = new FileReader();

                        r.onload = (ev) => {
                          try {
                            let rawRows: any[][] = [];
                            if (fileExtension === 'csv') {
                              const text = ev.target?.result as string;
                              rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                                return l.split(';').map(c => c.replace(/"/g, '').trim());
                              });
                            } else {
                              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                              const workbook = XLSX.read(data, { type: 'array' });
                              if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                            }

                            setSapProgress(0);
                            setSapLogMessage('Processando dados da transportadora Bahia Sul...');
                            localDb.importBahiaSulRaw(rawRows, file.name, setSapProgress).then(log => {
                              setLastUploadLog(log);
                              setSapLogStatus('success');
                              toast.success(`Bahia Sul: ${log.records_inserted} CTe novo(s), ${log.records_updated} atualizado(s).`);
                              loadData();
                            }).catch(err => {
                              setSapLogError(err.message || 'Falha ao processar planilha Bahia Sul.');
                              setSapLogStatus('error');
                            });
                          } catch (err: any) {
                            setSapLogError(err.message || 'Falha ao processar planilha Bahia Sul.');
                            setSapLogStatus('error');
                          }
                        };

                        if (fileExtension === 'csv') {
                          r.readAsText(file);
                        } else {
                          r.readAsArrayBuffer(file);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV Bahia Sul</p>
                </div>
              </div>
            </div>


            {sapLogStatus === 'saving' && (
              <div className="space-y-2 py-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                  <span>{sapLogMessage || 'Processando carga do SAP e recalculando metas de entrega...'}</span>
                  <span className="ml-auto tabular-nums text-emerald-600">{sapProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
                    style={{ width: `${sapProgress}%` }}
                  />
                </div>
              </div>
            )}

            {sapLogError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center">
                <AlertTriangle className="mr-1.5 h-4 w-4 text-red-500 shrink-0" />
                <span>{sapLogError}</span>
              </div>
            )}

            {sapLogStatus === 'success' && lastUploadLog && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-4 text-left">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                  <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>Carga importada e integrada com sucesso! Todos os SLAs e prazos recalculados.</span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
                  <div className="bg-white border border-emerald-100 p-2.5 rounded-lg">
                    <p className="text-slate-400 font-semibold">Arquivo</p>
                    <p className="text-slate-700 font-bold font-mono mt-0.5 break-all">{lastUploadLog.filename}</p>
                  </div>
                  <div className="bg-white border border-emerald-100 p-2.5 rounded-lg">
                    <p className="text-slate-400 font-semibold">Linhas Lidas</p>
                    <p className="text-slate-700 font-black text-sm mt-0.5">{lastUploadLog.records_read}</p>
                  </div>
                  <div className="bg-white border border-emerald-100 p-2.5 rounded-lg">
                    <p className="text-slate-400 font-semibold">Novas Inseridas</p>
                    <p className="text-emerald-700 font-black text-sm mt-0.5">+{lastUploadLog.records_inserted}</p>
                  </div>
                  <div className="bg-white border border-emerald-100 p-2.5 rounded-lg">
                    <p className="text-slate-400 font-semibold">Atualizadas / Inativas</p>
                    <p className="text-slate-600 font-black text-sm mt-0.5">{lastUploadLog.records_updated} / {lastUploadLog.records_eliminated}</p>
                  </div>
                </div>

                {lastUploadLog.quantity_changes && lastUploadLog.quantity_changes.length > 0 && (
                  <div className="bg-white border border-emerald-100 p-3 rounded-lg text-[10px] space-y-2">
                    <p className="font-bold text-slate-700">Mudanças de Quantidade Detectadas:</p>
                    <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto">
                      {lastUploadLog.quantity_changes.map((qc: any, idx: number) => (
                        <div key={idx} className="py-1 flex justify-between font-mono">
                          <span className="text-slate-500">{qc.item} (RI: {qc.ri})</span>
                          <span className="font-bold text-amber-600">Qtd: {qc.oldQty} → {qc.newQty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {lastUploadLog.missing_ris && lastUploadLog.missing_ris.length > 0 && (
                  <div className="bg-white border border-emerald-100 p-3 rounded-lg text-[10px] space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-700">RIs Ausentes na última carga ({lastUploadLog.missing_ris.length}):</p>
                      <button
                        onClick={() => {
                          const text = lastUploadLog.missing_ris.join('\n');
                          const blob = new Blob([text], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `ris_ausentes_${lastUploadLog.id}.txt`;
                          a.click();
                        }}
                        className="text-[9px] font-bold text-blue-600 hover:underline"
                      >
                        Exportar Lista (.txt)
                      </button>
                    </div>
                  </div>
                )}

                {(lastUploadLog.columns_missing?.length > 0 || lastUploadLog.columns_new?.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px]">
                    {lastUploadLog.columns_missing?.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg space-y-1 text-amber-800">
                        <p className="font-bold flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Colunas Esperadas Ausentes:
                        </p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {lastUploadLog.columns_missing.map((c: string, idx: number) => <li key={`${c}_${idx}`}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                    {lastUploadLog.columns_new?.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg space-y-1 text-blue-800">
                        <p className="font-bold flex items-center gap-1">
                          <RefreshCw className="h-3.5 w-3.5 text-blue-600 animate-spin-slow" /> Colunas Novas Detectadas (Salvas em extra):
                        </p>
                        <ul className="list-disc pl-4 space-y-0.5 animate-pulse">
                          {lastUploadLog.columns_new.map((c: string, idx: number) => <li key={`${c}_${idx}`}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Módulo: Almoxarifado */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-6 sm:px-8 sm:py-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Boxes className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">Almoxarifado</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 px-5 py-6 text-sm text-slate-500">
          Nenhum importador ainda.
        </div>
      </section>

      {/* Módulo: Financeiro */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-6 sm:px-8 sm:py-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Receipt className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">Financeiro</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* FBL1N Upload Card */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-500" /> Transação FBL1N (Contas a Pagar)
            </h4>
            <p className="text-[10px] text-slate-400">Substitui integralmente as partidas de contas a pagar anteriores — a última carga é sempre a mais atual.</p>
            <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    const file = e.target.files[0];
                    const fileExtension = file.name.split('.').pop()?.toLowerCase();
                    setSapLogStatus('saving');
                    setSapProgress(0);
                    setLastUploadLog(null);
                    setSapLogError('');
                    const r = new FileReader();

                    r.onload = (ev) => {
                      try {
                        let rawRows: any[][] = [];
                        if (fileExtension === 'csv') {
                          const text = ev.target?.result as string;
                          rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                            return l.split(';').map(c => c.replace(/"/g, '').trim());
                          });
                        } else {
                          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                          const sheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[sheetName];
                          rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                        }

                        localDb.importFBL1NRaw(rawRows, file.name, setSapProgress).then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Falha ao processar planilha.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Falha ao processar planilha.');
                        setSapLogStatus('error');
                      }
                    };

                    if (fileExtension === 'csv') {
                      r.readAsText(file);
                    } else {
                      r.readAsArrayBuffer(file);
                    }
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="mx-auto h-6 w-6 text-slate-400" />
              <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV FBL1N</p>
            </div>
          </div>
        </div>
      </section>

      {/* Módulo: RH */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-6 sm:px-8 sm:py-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Users2 className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">RH</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500 leading-relaxed">
          Cadastros usados pelo formulário ASE - Hora Extra (Formulários › RH). Turno (ADM, 2º Turno, 3º Turno) já vem
          pré-cadastrado e não tem importação própria.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Colaboradores Upload Card */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Colaboradores (rh_pessoas)
            </h4>
            <p className="text-[10px] text-slate-400">
              MATRÍCULA, COLABORADOR, CHAVE DO NOME, MACROÁREA, ÁREA, SUBSETOR, CARGO, LIDERANÇA, TURNO, SITUAÇÃO.
              Só MATRÍCULA e COLABORADOR são obrigatórias. Linhas existentes (mesma MATRÍCULA) são atualizadas.
            </p>
            <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    const file = e.target.files[0];
                    const fileExtension = file.name.split('.').pop()?.toLowerCase();
                    const r = new FileReader();

                    r.onload = (ev) => {
                      try {
                        let rawRows: any[][] = [];
                        if (fileExtension === 'csv') {
                          const text = ev.target?.result as string;
                          rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                            return l.split(';').map(c => c.replace(/"/g, '').trim());
                          });
                        } else {
                          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                          const sheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[sheetName];
                          rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                        }

                        // Leitura de cabeçalho e linhas em lib/rhPessoasImport.ts
                        // (com testes): a tela só entrega a matriz crua.
                        const itens = mapearPlanilhaPessoas(rawRows);

                        importarRhPessoas(itens).then(result => {
                          toast.success(`Colaboradores: ${result.inseridos} novo(s), ${result.atualizados} atualizado(s).`);
                        }).catch(err => {
                          toast.error(err.message || 'Falha ao salvar no Supabase.');
                        });
                      } catch (err: any) {
                        toast.error(err.message || 'Falha ao processar a planilha.');
                      }
                    };

                    if (fileExtension === 'csv') {
                      r.readAsText(file);
                    } else {
                      r.readAsArrayBuffer(file);
                    }
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="mx-auto h-6 w-6 text-slate-400" />
              <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV Colaboradores</p>
            </div>
          </div>

          {/* Setores Upload Card */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Setores (rh_setores)
            </h4>
            <p className="text-[10px] text-slate-400">Coluna única de setores (com ou sem cabeçalho "SETOR").</p>
            <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    const file = e.target.files[0];
                    const fileExtension = file.name.split('.').pop()?.toLowerCase();
                    const r = new FileReader();

                    r.onload = (ev) => {
                      try {
                        let rawRows: any[][] = [];
                        if (fileExtension === 'csv') {
                          const text = ev.target?.result as string;
                          rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                            return l.split(';').map(c => c.replace(/"/g, '').trim());
                          });
                        } else {
                          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                          const sheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[sheetName];
                          rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                        }

                        if (rawRows.length < 1) throw new Error('Planilha vazia.');
                        // Coluna única: aceita com ou sem cabeçalho — se a primeira
                        // linha não parecer um cabeçalho ("setor"), ela também
                        // entra como dado.
                        const headers = rawRows[0].map(sanitizeSAPHeader);
                        const temCabecalho = headers[0] === 'setor' || headers[0] === 'setores' || headers[0] === 'nome';
                        const linhas = temCabecalho ? rawRows.slice(1) : rawRows;
                        const nomes = linhas.map(row => String(row[0] ?? '').trim()).filter(Boolean);
                        if (nomes.length === 0) throw new Error('Nenhuma linha válida encontrada na planilha.');

                        importarRhSetores(nomes).then(result => {
                          toast.success(`Setores: ${result.inseridos} novo(s), ${result.atualizados} atualizado(s).`);
                        }).catch(err => {
                          toast.error(err.message || 'Falha ao salvar no Supabase.');
                        });
                      } catch (err: any) {
                        toast.error(err.message || 'Falha ao processar a planilha.');
                      }
                    };

                    if (fileExtension === 'csv') {
                      r.readAsText(file);
                    } else {
                      r.readAsArrayBuffer(file);
                    }
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="mx-auto h-6 w-6 text-slate-400" />
              <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV Setores</p>
            </div>
          </div>

          {/* Horário (%HE) Upload Card */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-purple-500" /> Horário (rh_hora_extra)
            </h4>
            <p className="text-[10px] text-slate-400">DIA, %HEX — calendário de percentual de hora extra por dia.</p>
            <div className="border border-dashed border-slate-200 hover:bg-slate-50/50 rounded-lg p-6 text-center cursor-pointer relative">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    const file = e.target.files[0];
                    const fileExtension = file.name.split('.').pop()?.toLowerCase();
                    const r = new FileReader();

                    r.onload = (ev) => {
                      try {
                        let rawRows: any[][] = [];
                        if (fileExtension === 'csv') {
                          const text = ev.target?.result as string;
                          rawRows = text.split('\n').filter(l => l.trim()).map(l => {
                            return l.split(';').map(c => c.replace(/"/g, '').trim());
                          });
                        } else {
                          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
                          const sheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[sheetName];
                          rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                        }

                        if (rawRows.length < 2) throw new Error('Planilha vazia ou sem linhas de dados.');
                        const headers = rawRows[0].map(sanitizeSAPHeader);
                        const diaIdx = headers.findIndex(h => h === 'dia' || h === 'data');
                        const percentualIdx = headers.findIndex(h => h === 'hex' || h === 'percentualhe' || h.includes('he'));
                        if (diaIdx === -1 || percentualIdx === -1) {
                          throw new Error('Colunas obrigatórias não encontradas. Esperado: "DIA" e "%HEX".');
                        }
                        const itens = rawRows.slice(1)
                          .map(row => ({ dia: parseSAPDate(row[diaIdx]), percentual_he: Number(String(row[percentualIdx] ?? '').replace(',', '.').replace('%', '')) }))
                          .filter((it): it is { dia: string; percentual_he: number } => Boolean(it.dia) && !isNaN(it.percentual_he));
                        if (itens.length === 0) throw new Error('Nenhuma linha válida encontrada na planilha.');

                        importarRhHoraExtra(itens).then(result => {
                          toast.success(`Horário (%HE): ${result.inseridos} novo(s), ${result.atualizados} atualizado(s).`);
                        }).catch(err => {
                          toast.error(err.message || 'Falha ao salvar no Supabase.');
                        });
                      } catch (err: any) {
                        toast.error(err.message || 'Falha ao processar a planilha.');
                      }
                    };

                    if (fileExtension === 'csv') {
                      r.readAsText(file);
                    } else {
                      r.readAsArrayBuffer(file);
                    }
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="mx-auto h-6 w-6 text-slate-400" />
              <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV Horário</p>
            </div>
          </div>
        </div>
      </section>
        </div>
      )}

      {/* Tab 6: Logs SAP */}
      {activeTab === 'importar_sap_log' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Histórico de Cargas do SAP</h3>
              <p className="text-xs text-slate-500">Detalhamento completo das importações ME5A e ZL0132 — registros processados, ignorados e alterações detectadas.</p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs cursor-pointer transition-colors"
              title="Atualizar Logs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4 w-8"></th>
                    <th className="py-2.5 px-4">ID Carga</th>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4">Arquivo</th>
                    <th className="py-2.5 px-4 text-center">Lidos</th>
                    <th className="py-2.5 px-4 text-center">Importados</th>
                    <th className="py-2.5 px-4 text-center">Ignorados</th>
                    <th className="py-2.5 px-4 text-center">Inativos</th>
                    <th className="py-2.5 px-4">Feito por</th>
                    <th className="py-2.5 px-4">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {sortedSapLogs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <FileSpreadsheet className="h-8 w-8 opacity-30" />
                          <p className="font-medium text-sm">Nenhum registro de carga encontrado.</p>
                          <p className="text-xs">Importe uma planilha ME5A ou ZL0132 para ver o histórico aqui.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedSapLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      const detail = logDetails[log.id];
                      const isLoadingDetail = isExpanded && loadingLogDetailId === log.id;
                      // Log "cheio" para a seção expandida: mescla o detalhe buscado sob
                      // demanda (ignored_rows/missing_ris) por cima do log magro do sync.
                      const fullLog = detail ? { ...log, ...detail } : log;
                      const totalImported = (log.records_inserted || 0) + (log.records_updated || 0);
                      // Contagens vêm do sync (colunas geradas no banco); cai para o
                      // tamanho do array só se um dia vier um log já com dados completos.
                      const totalIgnored = log.ignored_rows_count ?? (log.ignored_rows?.length || 0);
                      const totalMissingRis = log.missing_ris_count ?? (log.missing_ris?.length || 0);
                      const hasIssues = totalIgnored > 0 || (log.columns_missing?.length || 0) > 0;
                      return (
                        <React.Fragment key={log.id}>
                          <tr
                            onClick={() => handleToggleLog(log.id)}
                            className={`hover:bg-slate-50/80 cursor-pointer select-none border-b border-slate-100 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                          >
                            <td className="py-3 px-3 text-slate-400">
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-indigo-500" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                              }
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-700 text-[11px]">#{log.id.slice(-6).toUpperCase()}</td>
                            <td className="py-3 px-4 font-bold">
                              <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wide ${
                                log.type === 'ME5A'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : log.type === 'ZL0132'
                                  ? 'bg-blue-100 text-blue-800'
                                  : log.type === 'PEDIDOSFORN'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : log.type === 'ZL0024'
                                  ? 'bg-amber-100 text-amber-800'
                                  : log.type === 'ME3N' || log.type === 'ME3M'
                                  ? 'bg-rose-100 text-rose-800'
                                  : log.type === 'FBL1N'
                                  ? 'bg-cyan-100 text-cyan-800'
                                  : log.type === 'MB51'
                                  ? 'bg-orange-100 text-orange-800'
                                  : log.type === 'ZL0170'
                                  ? 'bg-teal-100 text-teal-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {log.type}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="font-semibold text-slate-700 truncate max-w-[160px]">{log.filename}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-slate-800">{log.records_read}</td>
                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                {totalImported}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {totalIgnored > 0
                                ? <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                                    <XCircle className="h-3 w-3" />
                                    {totalIgnored}
                                  </span>
                                : <span className="text-slate-300 font-medium">—</span>
                              }
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-red-600">
                              {log.records_eliminated > 0 ? log.records_eliminated : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-600">{log.user_name}</td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={10} className="px-6 py-4 border-b border-slate-200">
                                <div className="space-y-4 text-xs">

                                  {/* Resumo em cards */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">ID da Carga</p>
                                      <p className="font-mono font-bold text-slate-700 mt-0.5 text-[11px]">{log.id}</p>
                                    </div>
                                    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Data / Hora</p>
                                      <p className="font-bold text-slate-700 mt-0.5">{new Date(log.created_at).toLocaleString('pt-BR')}</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 shadow-sm">
                                      <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Importados com Sucesso</p>
                                      <p className="font-bold text-emerald-700 text-lg mt-0.5">{totalImported}</p>
                                      <p className="text-[9px] text-emerald-500 mt-0.5">{log.records_inserted || 0} novos · {log.records_updated || 0} atualizados</p>
                                    </div>
                                    <div className={`rounded-lg border p-3 shadow-sm ${
                                      totalIgnored > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                                    }`}>
                                      <p className={`text-[9px] font-bold uppercase tracking-wider ${
                                        totalIgnored > 0 ? 'text-amber-600' : 'text-slate-400'
                                      }`}>Ignorados / Filtrados</p>
                                      <p className={`font-bold text-lg mt-0.5 ${
                                        totalIgnored > 0 ? 'text-amber-700' : 'text-slate-300'
                                      }`}>{totalIgnored}</p>
                                      {totalIgnored > 0 && (
                                        <p className="text-[9px] text-amber-500 mt-0.5">
                                          de {log.records_read} linhas lidas ({Math.round((totalIgnored / log.records_read) * 100)}%)
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Barra de progresso de importação */}
                                  {log.records_read > 0 && (
                                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm space-y-2">
                                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Aproveitamento da Carga</p>
                                      <div className="flex gap-0.5 rounded-full overflow-hidden h-2.5 bg-slate-100">
                                        <div
                                          className="bg-emerald-500 h-full transition-all"
                                          style={{ width: `${Math.round((totalImported / log.records_read) * 100)}%` }}
                                        />
                                        <div
                                          className="bg-amber-400 h-full transition-all"
                                          style={{ width: `${Math.round((totalIgnored / log.records_read) * 100)}%` }}
                                        />
                                      </div>
                                      <div className="flex gap-4 text-[9px] font-semibold">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Importados ({Math.round((totalImported / log.records_read) * 100)}%)</span>
                                        {totalIgnored > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Ignorados ({Math.round((totalIgnored / log.records_read) * 100)}%)</span>}
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200 inline-block" /> Restante</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Detalhe (linhas ignoradas / RIs ausentes) buscado sob demanda */}
                                  {isLoadingDetail && (
                                    <div className="flex items-center gap-2 text-slate-400 bg-white border border-slate-200 rounded-lg p-3 text-[10px] font-semibold">
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando detalhes da carga...
                                    </div>
                                  )}

                                  {/* Itens ignorados */}
                                  {fullLog.ignored_rows && fullLog.ignored_rows.length > 0 && (() => {
                                    const byReason = fullLog.ignored_rows.reduce((acc: Record<string, any[]>, row: any) => {
                                      const key = row.reason || 'Outros';
                                      if (!acc[key]) acc[key] = [];
                                      acc[key].push(row);
                                      return acc;
                                    }, {});
                                    return (
                                      <div className="bg-white border border-amber-200 rounded-lg shadow-sm overflow-hidden">
                                        <div className="bg-amber-50 px-3 py-2 flex items-center justify-between border-b border-amber-200">
                                          <p className="font-bold text-amber-800 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                                            <FileX className="h-3.5 w-3.5" /> Linhas Não Importadas ({fullLog.ignored_rows.length})
                                          </p>
                                          <button
                                            onClick={() => {
                                              const lines = fullLog.ignored_rows.map((r: any) => `Linha ${r.row}\tRI: ${r.identifier}\t${r.reason}`);
                                              const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                                              const url = URL.createObjectURL(blob);
                                              const a = document.createElement('a');
                                              a.href = url;
                                              a.download = `ignorados_${log.id}.txt`;
                                              a.click();
                                            }}
                                            className="flex items-center gap-1 text-[9px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                                          >
                                            <Download className="h-3 w-3" /> Exportar
                                          </button>
                                        </div>
                                        <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                          {Object.entries(byReason).map(([reason, rows]: [string, any]) => (
                                            <div key={reason} className="p-3 space-y-1.5">
                                              <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" /> {reason} ({rows.length}x)
                                              </p>
                                              <div className="flex flex-wrap gap-1.5">
                                                {rows.map((r: any, i: number) => (
                                                  <span key={i} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 font-mono text-[9px]">
                                                    L{r.row} · {r.identifier}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Alterações de Quantidade */}
                                  {log.quantity_changes && log.quantity_changes.length > 0 && (
                                    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                                      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                                        <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                                          <Activity className="h-3.5 w-3.5 text-indigo-500" /> Alterações de Quantidade ({log.quantity_changes.length})
                                        </p>
                                      </div>
                                      <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                                        {log.quantity_changes.map((qc: any, idx: number) => {
                                          const increased = (qc.newQty || 0) > (qc.oldQty || 0);
                                          return (
                                            <div key={idx} className="py-2 px-3 flex items-center justify-between font-mono text-[10px]">
                                              <span className="text-slate-500 font-medium">{qc.item} <span className="text-slate-400 text-[9px]">RI: {qc.ri}</span></span>
                                              <span className={`flex items-center gap-1 font-bold ${
                                                increased ? 'text-emerald-600' : 'text-red-500'
                                              }`}>
                                                {increased ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                                {qc.oldQty} → {qc.newQty}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* RIs ausentes nessa carga */}
                                  {fullLog.missing_ris && fullLog.missing_ris.length > 0 && (
                                    <div className="bg-white border border-red-200 rounded-lg shadow-sm overflow-hidden">
                                      <div className="bg-red-50 px-3 py-2 flex items-center justify-between border-b border-red-200">
                                        <p className="font-bold text-red-700 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                                          <XCircle className="h-3.5 w-3.5" /> RIs Ausentes nesta Carga ({fullLog.missing_ris.length})
                                        </p>
                                        <button
                                          onClick={() => {
                                            const blob = new Blob([fullLog.missing_ris.join('\n')], { type: 'text/plain' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `ris_ausentes_${log.id}.txt`;
                                            a.click();
                                          }}
                                          className="flex items-center gap-1 text-[9px] font-bold text-red-600 hover:text-red-800 cursor-pointer"
                                        >
                                          <Download className="h-3 w-3" /> Exportar
                                        </button>
                                      </div>
                                      <div className="p-3">
                                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                          {fullLog.missing_ris.map((ri: string, i: number) => (
                                            <span key={i} className="inline-block bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-mono text-[9px]">{ri}</span>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Colunas com divergência */}
                                  {(log.columns_missing?.length > 0 || log.columns_new?.length > 0) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {log.columns_missing?.length > 0 && (
                                        <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-lg space-y-1.5">
                                          <p className="font-bold text-amber-800 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Colunas Esperadas Ausentes ({log.columns_missing.length})
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {log.columns_missing.map((c: string) => (
                                              <span key={c} className="inline-block bg-amber-100 text-amber-700 border border-amber-300 rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold">{c}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {log.columns_new?.length > 0 && (
                                        <div className="bg-blue-50/60 border border-blue-200 p-3 rounded-lg space-y-1.5">
                                          <p className="font-bold text-blue-800 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                            <RefreshCw className="h-3.5 w-3.5 text-blue-600" /> Colunas Novas Detectadas ({log.columns_new.length})
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {log.columns_new.map((c: string) => (
                                              <span key={c} className="inline-block bg-blue-100 text-blue-700 border border-blue-300 rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold">{c}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Nenhum problema */}
                                  {!hasIssues && !log.quantity_changes?.length && !totalMissingRis && (
                                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                                      <span className="text-xs font-semibold">Carga importada com sucesso. Nenhum problema ou divergência detectado.</span>
                                    </div>
                                  )}

                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Grupos Comprador */}
      {activeTab === 'grupos_comprador' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Users className="h-5 w-5 text-blue-600" /> Associação de Compradores aos Grupos SAP
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Associe os compradores do time de Suprimentos aos códigos de grupos de compras oficiais do SAP (ex: 314, 358).
              Isso direciona automaticamente as requisições e simplifica a filtragem de demandas operacionais no painel e nos dashboards.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-2">
              
              {/* Left Column: Buyers List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lista de Compradores Cadastrados</h4>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {profiles.filter(p => p.roles.includes('comprador')).length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">Nenhum comprador cadastrado no sistema.</div>
                  ) : (
                    profiles.filter(p => p.roles.includes('comprador')).map((buyer) => {
                      const buyerGroups = localDb.getStorageItem<any[]>('sisten_buyer_groups', [])
                        .filter(bg => bg.user_id === buyer.id);
                      
                      return (
                        <div 
                          key={buyer.id}
                          onClick={() => {
                            setSelectedBuyerId(buyer.id);
                            const grps = buyerGroups.map(bg => bg.group_code).join(', ');
                            setBuyerGroupsInput(grps);
                            const primary = buyerGroups.find(bg => bg.is_primary)?.group_code || '';
                            setBuyerPrimaryGroup(primary);
                          }}
                          className={`p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors ${selectedBuyerId === buyer.id ? 'bg-blue-50/30 font-bold border-l-4 border-blue-600' : ''}`}
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-800">{buyer.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{buyer.email}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[9px] font-bold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full text-slate-600">
                              {buyerGroups.length} grupos
                            </span>
                            {buyerGroups.find(bg => bg.is_primary) && (
                              <span className="text-[9px] font-bold text-blue-600">
                                Principal: {buyerGroups.find(bg => bg.is_primary)?.group_code}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Groups Association Form */}
              <div>
                {selectedBuyerId ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      Editar Grupos de {profiles.find(u => u.id === selectedBuyerId)?.name}
                    </h4>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Grupos de Compra Relacionados</label>
                      <input
                        type="text"
                        value={buyerGroupsInput}
                        onChange={(e) => setBuyerGroupsInput(e.target.value)}
                        placeholder="Ex: 314, 358, 447"
                        className="w-full rounded border border-slate-200 p-2.5 bg-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <p className="text-[9px] text-slate-400">Separe os códigos por vírgula.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Grupo Principal (Primary)</label>
                      <input
                        type="text"
                        value={buyerPrimaryGroup}
                        onChange={(e) => setBuyerPrimaryGroup(e.target.value)}
                        placeholder="Ex: 314"
                        className="w-full rounded border border-slate-200 p-2.5 bg-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <p className="text-[9px] text-slate-400">Deve ser um dos códigos listados no campo superior.</p>
                    </div>

                    <button
                      onClick={() => {
                        const list = buyerGroupsInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                        if (buyerPrimaryGroup && !list.includes(buyerPrimaryGroup.trim().toUpperCase())) {
                          toast.warning('O grupo principal deve estar presente na lista de grupos.');
                          return;
                        }
                        localDb.updateBuyerGroups(selectedBuyerId, list, buyerPrimaryGroup.trim().toUpperCase());
                        loadData();
                        setSelectedBuyerId(null);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Save className="h-4 w-4" /> Salvar Associação SAP
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 space-y-1.5 bg-slate-50/20">
                    <Users className="h-6 w-6 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold">Nenhum Comprador Selecionado</p>
                    <p className="text-[11px] text-slate-400">Selecione um comprador à esquerda para associar ou alterar os privilégios de grupos SAP.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Helpdesk Config */}
      {activeTab === 'helpdesk_config' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <RefreshCw className="h-5 w-5 text-indigo-600" /> Matriz de SLAs & Categorias por Setor
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Gerencie quais setores da companhia estão autorizados a receber chamados de helpdesk, gerencie as categorias disponíveis para triagem dos solicitantes e configure a matriz de conformidade SLA.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-2">
              {/* Left Column: List of Sectors and toggles */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Setores com Helpdesk Ativo</h4>
                
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
                  {sectors.map((sec) => (
                    <div 
                      key={sec.id}
                      onClick={() => {
                        if (sec.helpdesk_enabled) {
                          setSelectedHelpdeskSectorId(sec.id);
                        } else {
                          setSelectedHelpdeskSectorId(null);
                        }
                      }}
                      className={`p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors ${selectedHelpdeskSectorId === sec.id ? 'bg-indigo-50/20 border-l-4 border-indigo-600 font-semibold' : ''}`}
                    >
                      <div>
                        <p className="font-bold text-slate-800">{sec.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">ID Setor: {sec.id}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSectorHelpdesk(sec.id);
                            if (selectedHelpdeskSectorId === sec.id) setSelectedHelpdeskSectorId(null);
                          }}
                          className={`px-3 py-1.5 rounded-md font-bold text-[10px] cursor-pointer transition-colors ${sec.helpdesk_enabled ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {sec.helpdesk_enabled ? '✓ Ativo' : 'Inativo'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Categories CRUD & SLAs matrix display */}
              <div>
                {selectedHelpdeskSectorId ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-5 text-xs">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        Configurações de {sectors.find(s => s.id === selectedHelpdeskSectorId)?.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Visualize a matriz de conformidade SLA padrão para atendimento.</p>
                    </div>

                    {/* Matrix SLA list */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Matriz de Resolução de SLA (Padrão do Sistema)</p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 5 (Impeditiva)</span>
                          <span className="text-red-600 font-extrabold">2 Horas</span>
                        </div>
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 4 (Crítica)</span>
                          <span className="text-orange-600 font-extrabold">8 Horas</span>
                        </div>
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 3 (Urgente)</span>
                          <span className="text-amber-600 font-extrabold">24 Horas (1 Dia)</span>
                        </div>
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 2 (Moderada)</span>
                          <span className="text-emerald-600 font-extrabold">72 Horas (3 Dias)</span>
                        </div>
                        <div className="flex justify-between p-1.5 bg-white border border-slate-150 rounded text-[11px] font-bold">
                          <span className="text-slate-500">Criticidade 1 (Baixa)</span>
                          <span className="text-slate-600 font-extrabold">120 Horas (5 Dias)</span>
                        </div>
                      </div>
                    </div>

                    {/* Categories of helpdesk */}
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Categorias de Triagem de Chamado</p>
                      <div className="flex flex-wrap gap-1.5">
                        {/* Render based on what is in NewRequest.tsx */}
                        {selectedHelpdeskSectorId === '9' ? (
                          ['Acesso/Senha', 'Equipamento', 'Software', 'Rede', 'E-mail', 'Outro'].map((cat, idx) => (
                            <span key={idx} className="bg-white border border-slate-200 px-2.5 py-1 rounded font-bold text-slate-700 text-[11px]">
                              {cat}
                            </span>
                          ))
                        ) : selectedHelpdeskSectorId === '3' ? (
                          ['Elétrica', 'Hidráulica', 'Climatização', 'Mobiliário', 'Limpeza', 'Chaves/Acesso', 'Outro'].map((cat, idx) => (
                            <span key={idx} className="bg-white border border-slate-200 px-2.5 py-1 rounded font-bold text-slate-700 text-[11px]">
                              {cat}
                            </span>
                          ))
                        ) : (
                          ['Elétrica', 'Hidráulica', 'Climatização', 'Equipamento', 'Outro'].map((cat, idx) => (
                            <span key={idx} className="bg-white border border-slate-200 px-2.5 py-1 rounded font-bold text-slate-700 text-[11px]">
                              {cat}
                            </span>
                          ))
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1 italic">Nota: As categorias de triagem integradas são mapeadas em conformidade com as regras operacionais do setor.</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 space-y-1.5 bg-slate-50/20">
                    <RefreshCw className="h-6 w-6 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold">Nenhum Setor Selecionado</p>
                    <p className="text-[11px] text-slate-400">Selecione um setor ativo de Helpdesk à esquerda para inspecionar categorias de triagem e tempos de conformidade SLA.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'feedback' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 h-[calc(100vh-220px)]">
          {/* Lista */}
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <select
                value={feedbackFilterType}
                onChange={e => setFeedbackFilterType(e.target.value as any)}
                className="text-xs rounded-md border border-slate-200 px-2 py-1.5 flex-1"
              >
                <option value="all">Todos os tipos</option>
                <option value="bug">Bug</option>
                <option value="sugestao">Sugestão</option>
              </select>
              <select
                value={feedbackFilterStatus}
                onChange={e => setFeedbackFilterStatus(e.target.value as any)}
                className="text-xs rounded-md border border-slate-200 px-2 py-1.5 flex-1"
              >
                <option value="all">Todos os status</option>
                <option value="novo">Novo</option>
                <option value="em_analise">Em análise</option>
                <option value="resolvido">Resolvido</option>
                <option value="arquivado">Arquivado</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {feedbackLoading && (
                <p className="p-4 text-xs text-slate-400">Carregando...</p>
              )}
              {!feedbackLoading && filteredFeedbackReports.length === 0 && (
                <p className="p-4 text-xs text-slate-400">Nenhum reporte encontrado.</p>
              )}
              {filteredFeedbackReports.map(r => (
                <div
                  key={r.id}
                  onClick={() => setSelectedFeedbackId(r.id)}
                  className={`p-3.5 cursor-pointer hover:bg-slate-50/60 transition-colors ${selectedFeedbackId === r.id ? 'bg-emerald-50/40 border-l-4 border-emerald-600' : ''}`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    {r.type === 'bug' ? <Bug className="h-3.5 w-3.5 text-red-600 shrink-0" /> : <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    <span className="truncate">{r.description.slice(0, 60)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{r.user_name} · {r.page_path} · {new Date(r.created_at).toLocaleString('pt-BR')}</p>
                  <span className={`inline-block mt-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    r.status === 'novo' ? 'bg-rose-100 text-rose-700' :
                    r.status === 'em_analise' ? 'bg-amber-100 text-amber-700' :
                    r.status === 'resolvido' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {r.status === 'novo' ? 'Novo' : r.status === 'em_analise' ? 'Em análise' : r.status === 'resolvido' ? 'Resolvido' : 'Arquivado'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Detalhe */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-y-auto p-5">
            {!selectedFeedback ? (
              <p className="text-xs text-slate-400">Selecione um reporte na lista.</p>
            ) : (
              <div className="space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    {selectedFeedback.type === 'bug' ? <Bug className="h-4 w-4 text-red-600" /> : <Lightbulb className="h-4 w-4 text-amber-500" />}
                    {selectedFeedback.type === 'bug' ? 'Bug reportado' : 'Sugestão'}
                  </h3>
                  <p className="text-slate-500 mt-2 whitespace-pre-wrap">{selectedFeedback.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-500">
                  <div><span className="font-semibold text-slate-700">Reportado por:</span> {selectedFeedback.user_name}{selectedFeedback.user_email ? ` (${selectedFeedback.user_email})` : ''}</div>
                  <div><span className="font-semibold text-slate-700">Página:</span> {selectedFeedback.page_path}</div>
                  <div><span className="font-semibold text-slate-700">Data:</span> {new Date(selectedFeedback.created_at).toLocaleString('pt-BR')}</div>
                  <div><span className="font-semibold text-slate-700">Navegador:</span> {selectedFeedback.user_agent}</div>
                </div>

                {feedbackScreenshotUrl && (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Print</p>
                    <a href={feedbackScreenshotUrl} target="_blank" rel="noreferrer">
                      <img src={feedbackScreenshotUrl} alt="Print do reporte" className="max-h-64 rounded-lg border border-slate-200" />
                    </a>
                  </div>
                )}

                {selectedFeedback.error_stack && (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1.5">Stack trace</p>
                    <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-[10px] overflow-x-auto whitespace-pre-wrap">{selectedFeedback.error_stack}</pre>
                  </div>
                )}

                {selectedFeedback.console_logs && selectedFeedback.console_logs.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1.5">Logs de console ({selectedFeedback.console_logs.length})</p>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-2 max-h-40 overflow-y-auto space-y-1">
                      {selectedFeedback.console_logs.map((log, i) => (
                        <p key={i} className={`text-[10px] font-mono ${log.level === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                          [{log.level}] {log.message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="font-semibold text-slate-700 mb-1.5">Status</p>
                  <select
                    value={selectedFeedback.status}
                    onChange={e => handleUpdateFeedbackStatus(selectedFeedback.id, e.target.value as FeedbackReport['status'])}
                    className="text-xs rounded-md border border-slate-200 px-2 py-1.5 w-full"
                  >
                    <option value="novo">Novo</option>
                    <option value="em_analise">Em análise</option>
                    <option value="resolvido">Resolvido</option>
                    <option value="arquivado">Arquivado</option>
                  </select>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1.5">Nota interna</p>
                  <textarea
                    value={feedbackNotesDraft}
                    onChange={e => setFeedbackNotesDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={handleSaveFeedbackNotes}
                    className="mt-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5"
                  >
                    Salvar nota
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'diretrizes' && <Diretrizes />}

      {activeTab === 'apis' && <ApiManagement />}

      {pageAccessProfileId && (() => {
        const target = profiles.find(p => p.id === pageAccessProfileId);
        if (!target) return null;
        return (
          <PageAccessModal
            user={target}
            onClose={() => setPageAccessProfileId(null)}
            onChanged={loadData}
          />
        );
      })()}

      {bulkAccessModalOpen && selectedUserIds.length > 0 && (
        <BulkPageAccessModal
          users={profiles.filter(p => selectedUserIds.includes(p.id))}
          onClose={() => setBulkAccessModalOpen(false)}
          onChanged={() => {
            setSelectedUserIds([]);
            loadData();
          }}
        />
      )}

      {resetPwdUserId && (() => {
        const target = profiles.find(p => p.id === resetPwdUserId);
        if (!target) return null;
        return (
          <AdminResetPasswordModal
            target={target}
            onClose={() => setResetPwdUserId(null)}
            onDone={loadData}
          />
        );
      })()}

      {governanceModalUser && (
        <UserEditGovernanceModal
          isOpen={!!governanceModalUser}
          onClose={() => setGovernanceModalUser(null)}
          profile={governanceModalUser}
          sectors={sectors}
          currentUserId={user.id}
          onSaveSuccess={loadData}
          onOpenPageAccess={(userId) => {
            setGovernanceModalUser(null);
            setPageAccessProfileId(userId);
          }}
          onOpenResetPassword={(userId) => {
            setGovernanceModalUser(null);
            setResetPwdUserId(userId);
          }}
        />
      )}

      {/* Botão flutuante e janela de chatbot para o usuário Admin */}
      <AdminChatbot user={user} />

    </div>
  );
}
