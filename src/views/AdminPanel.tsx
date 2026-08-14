/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Map as MapIcon, Shield, Upload, Check, X, AlertTriangle,
  Trash, Save, Activity, RefreshCw, FileText, FileSpreadsheet, Plus,
  FileX, CheckCircle2, XCircle, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Download, Truck, Sparkles, UserPlus,
  Flag, Bug, Lightbulb, Image as ImageIcon, Copy, Hash, Layers, Info, ArrowRight, Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { getAutoCategory } from '../data/materials';
import { calcularProximoCodigoMaterial } from '../lib/materiais';
import { Profile, Sector, Material, FeedbackReport } from '../types';
import { useToast } from '../components/ui/Toast';
import PageAccessModal from '../components/admin/PageAccessModal';
import AprovadorSetoresSelect from '../components/admin/AprovadorSetoresSelect';
import AdminChatbot from '../components/admin/AdminChatbot';

interface AdminPanelProps {
  user: Profile;
}

export default function AdminPanel({ user }: AdminPanelProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<
    'usuarios' | 'setores' | 'permissoes' | 'importar' | 'importar_sap' | 'importar_sap_log' | 'grupos_comprador' | 'helpdesk_config' | 'feedback'
  >('usuarios');
  
  // Users Management State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [pageAccessProfileId, setPageAccessProfileId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  // Grupo de Compras (SAP) inline por usuário na tabela de Perfis Ativos.
  const [grupoComprasInputs, setGrupoComprasInputs] = useState<Record<string, string>>({});

  // Sectors State
  const [sectors, setSectors] = useState<Sector[]>([]);

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
      const path = hash.slice(1).split('?')[0];
      if (path === '/admin/usuarios') setActiveTab('usuarios');
      else if (path === '/admin/setores') setActiveTab('setores');
      else if (path === '/admin/permissoes') setActiveTab('permissoes');
      else if (path === '/admin/importacao-materiais') setActiveTab('importar');
      else if (path === '/suprimentos/importar') setActiveTab('importar_sap');
      else if (path === '/suprimentos/importar/log') setActiveTab('importar_sap_log');
      else if (path === '/suprimentos/grupos-comprador') setActiveTab('grupos_comprador');
      else if (path === '/admin/helpdesk') setActiveTab('helpdesk_config');
      else if (path === '/admin/feedback') setActiveTab('feedback');
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
    if (activeTab === 'importar') {
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

  const VALID_COMPANIES = ['TEN2', 'AG', 'AMBAS'];

  // Normalização padronizada de cabeçalhos SAP (remove acentos, pontuações e espaços para matching exato)
  const sanitizeSAPHeader = (h: any): string => {
    return String(h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  };

  // ZL0169: Parser de Cadastro de Materiais SAP (Texto técnico opcional)
  const parseZL0169Rows = (rawRows: any[][]): Omit<Material, 'id' | 'is_active' | 'created_at'>[] => {
    if (rawRows.length < 2) {
      throw new Error('Planilha vazia ou sem linhas de dados.');
    }

    const rawHeaders = rawRows[0];
    const cleanHeaders = rawHeaders.map(sanitizeSAPHeader);

    // 1. Código do Material (ex: Material, Codigo, Cod. Material, Nº Material)
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
    
    // 2. Descrição Breve do Material (ex: TxtBreveMaterial, Texto breve material, Txt.breve material, Denominação do material)
    // ATENÇÃO: NUNCA capturar Denominação 2 do grupo de mercadorias ou Denominação tp.material!
    const findMaterialDescriptionIndex = (cleanHdrs: string[]): number => {
      // Prioridade 1: correspondência exata para descrição do material
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

      // Prioridade 2: termos que contenham 'txtbreve' ou 'textobreve'
      const txtBreveIdx = cleanHdrs.findIndex(c => c.includes('txtbreve') || c.includes('textobreve'));
      if (txtBreveIdx !== -1) return txtBreveIdx;

      // Prioridade 3: 'descricao' ou 'denominacao' puras, garantindo que não sejam de grupo ou tipo
      const genericIdx = cleanHdrs.findIndex(c => {
        if (c.includes('grupo') || c.includes('tipo') || c.includes('tpmaterial') || c.includes('status') || c.includes('centro') || c.includes('deposito') || c.includes('setor') || c.includes('classe') || c.includes('mercadoria')) {
          return false;
        }
        return c === 'descricao' || c === 'descricaodomaterial' || c === 'denominacao' || c === 'denominacaodomaterial';
      });

      return genericIdx;
    };

    const descIdx = findMaterialDescriptionIndex(cleanHeaders);
    
    // 3. Texto Técnico (Opcional)
    const techIdx = cleanHeaders.findIndex(c => 
      c.includes('textolongo') || 
      c.includes('textotecnico') || 
      c.includes('technicaltext') ||
      c.includes('especificacao')
    );

    // 4. Empresa / Centro (ex: Cen., Centro, Empresa, Emp)
    const companyIdx = cleanHeaders.findIndex(c => 
      c === 'cen' || 
      c === 'centro' || 
      c === 'empresa' || 
      c === 'emp'
    );
    
    // 5. Unidade de Medida (ex: UMB, Unidade, UM, UN, Un. Medida)
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
    
    // 6. Tipo de Material (ex: TMat, Tipo de material, Tipo de mat)
    const tmatIdx = cleanHeaders.findIndex(c => 
      c === 'tmat' || 
      c === 'tipodematerial' || 
      c === 'tipodemat' || 
      c === 'tipomaterial' || 
      c === 'tmattipo' ||
      c === 'tipodomaterial'
    );
    
    // 7. Código de Controle / NCM (ex: Cód.controle, Cod. controle, NCM, ClFis)
    const ncmIdx = cleanHeaders.findIndex(c => 
      c === 'codcontrole' || 
      c === 'codigodecontrole' || 
      c === 'codigocontrole' || 
      c === 'ncm' || 
      c === 'classefiscal' || 
      c === 'ncmcodcontrole'
    );
    
    // 8. Status Geral (ex: Status Geral, Status mat.geral, Sts.geral)
    const statusGeralIdx = cleanHeaders.findIndex(c => 
      c === 'statusgeral' || 
      c === 'statusmatgeral' || 
      c === 'statusdomaterialgeral' || 
      c === 'stsgeral' || 
      c === 'statusglobal' ||
      (c.includes('status') && (c.includes('geral') || c.includes('global')))
    );
    
    // 9. Status Centro (ex: Status no Centro, Status mat.centro, Sts.centro)
    const statusCentroIdx = cleanHeaders.findIndex(c => 
      c === 'statusnocentro' || 
      c === 'statuscentro' || 
      c === 'statusmatcentro' || 
      c === 'statusdomaterialnocentro' || 
      c === 'stscentro' ||
      (c.includes('status') && (c.includes('centro') || c.includes('planta')))
    );

    if (codeIdx === -1 || descIdx === -1) {
      throw new Error('Colunas obrigatórias não encontradas na ZL0169. Esperado: "Material" e "TxtBreveMaterial" / "Texto breve material". A coluna "Texto técnico" é opcional.');
    }

    const items: Omit<Material, 'id' | 'is_active' | 'created_at'>[] = [];
    rawRows.slice(1).forEach(row => {
      const material_code = String(row[codeIdx] ?? '').trim();
      if (!material_code) return;

      const description = String(row[descIdx] ?? '').trim();
      const rawCompany = companyIdx !== -1 ? String(row[companyIdx] ?? '').trim().toUpperCase() : '';
      const unit = unitIdx !== -1 ? String(row[unitIdx] ?? '').trim().toUpperCase() : 'UN';
      const tipo_material = tmatIdx !== -1 ? String(row[tmatIdx] ?? '').trim() : '';
      const codigo_controle = ncmIdx !== -1 ? String(row[ncmIdx] ?? '').trim() : '';
      const status_geral = statusGeralIdx !== -1 ? String(row[statusGeralIdx] ?? '').trim() : '';
      const status_centro = statusCentroIdx !== -1 ? String(row[statusCentroIdx] ?? '').trim() : '';
      const isObsoleto = status_geral.toUpperCase() === 'Z1' || status_centro.toUpperCase() === 'Z1';

      items.push({
        material_code,
        description,
        technical_text: techIdx !== -1 ? String(row[techIdx] ?? '').trim() : '',
        category: getAutoCategory(description),
        company: (VALID_COMPANIES.includes(rawCompany) ? rawCompany : 'TEN2') as Material['company'],
        unit: unit || 'UN',
        tipo_material,
        codigo_controle,
        status_geral,
        status_centro,
        status_sap: isObsoleto ? 'Obsoleto' : 'Ativo'
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

      const technical_text = String(row[techIdx] ?? '').trim();
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

  const pendingUsers = useMemo(
    () => profiles
      .filter(p => p.status === 'pendente')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })),
    [profiles]
  );
  const activeUsers = useMemo(
    () => [...profiles]
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })),
    [profiles]
  );

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
          onClick={() => { setActiveTab('importar'); window.location.hash = '/admin/importacao-materiais'; }}
          className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'importar' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Upload className="h-4 w-4 mr-1.5" />
          Importação Catálogo
        </button>
        {(user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos')) && (
          <>
            <button
              onClick={() => { setActiveTab('importar_sap'); window.location.hash = '/suprimentos/importar'; }}
              className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center ${activeTab === 'importar_sap' ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-600" />
              Importar SAP
            </button>
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
      </div>

      {/* Tab 1: Users approval list and settings */}
      {activeTab === 'usuarios' && (
        <div className="space-y-6">
          {/* Approval Queue for pending users */}
          {pendingUsers.length > 0 && (
            <div className="rounded-xl border border-yellow-100 bg-yellow-50/50 p-5 space-y-3.5">
              <h3 className="text-xs font-bold text-yellow-800 uppercase tracking-widest flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1.5 shrink-0" /> Fila de aprovações pendentes ({pendingUsers.length})
              </h3>
              
              <div className="divide-y divide-yellow-100">
                {pendingUsers.map((p) => (
                  <div key={p.id} className="py-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-800">{p.name}</p>
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-300 uppercase shrink-0 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                          Novo Cadastro
                        </span>
                      </div>
                      <p className="text-slate-500 mt-0.5">{p.email} • {p.cargo}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleApproveUser(p.id, true)}
                        className="rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1 px-3 cursor-pointer"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => handleApproveUser(p.id, false)}
                        className="rounded border border-yellow-300 hover:bg-yellow-100 text-yellow-800 font-bold py-1 px-3 cursor-pointer"
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active profiles list */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800">Perfis Ativos ({activeUsers.length})</h3>
              <button
                onClick={async () => {
                  setSyncing(true);
                  try {
                    await localDb.syncFromSupabase(true);
                  } catch (err) {
                    console.error('Falha de sincronização explícita no painel admin:', err);
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 font-bold text-[11px] py-1.5 px-3 cursor-pointer transition-colors border border-slate-200"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sincronizar com o Supabase
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-2.5">Nome</th>
                    <th className="py-2.5">E-mail</th>
                    <th className="py-2.5">Cargo / Setor</th>
                    <th className="py-2.5">Grupo Compras</th>
                    <th className="py-2.5">Aprovador</th>
                    <th className="py-2.5">Nível de Acesso (Role)</th>
                    <th className="py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeUsers.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                        <span className={p.status === 'inativo' ? 'line-through text-slate-400' : ''}>{p.name}</span>
                        {p.status === 'pendente' && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-300 uppercase shrink-0 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            Novo Cadastro (Pendente)
                          </span>
                        )}
                        {p.status === 'inativo' && (
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-slate-300 uppercase shrink-0">
                            Inativo
                          </span>
                        )}
                        {p.status === 'ativo' && isRecentlyCreated(p.created_at) && (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-300 uppercase shrink-0 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-emerald-600" />
                            Novo Cadastro
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-slate-500">{p.email}</td>
                      <td className="py-3 text-slate-600 font-medium">{p.cargo} • Setor {p.sector_id}</td>
                      <td className="py-3">
                        {(() => {
                          const current = p.grupo_compras || '';
                          const value = grupoComprasInputs[p.id] ?? current;
                          const dirty = value.trim() !== current.trim();
                          return (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={value}
                                onChange={(e) => setGrupoComprasInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter' && dirty) handleSaveGrupoCompras(p.id); }}
                                placeholder="Ex: 314"
                                className="w-20 rounded border border-slate-200 py-1 px-2 text-xs font-mono focus:outline-none focus:border-emerald-600 bg-white"
                              />
                              {dirty && (
                                <button
                                  onClick={() => handleSaveGrupoCompras(p.id)}
                                  className="rounded bg-emerald-700 hover:bg-emerald-800 text-white p-1 shrink-0"
                                  title="Salvar grupo de compras"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3" onClick={(e) => e.stopPropagation()}>
                        <AprovadorSetoresSelect
                          sectors={sectors}
                          selected={p.aprovador_setores || []}
                          cadastroSap={!!p.aprovador_cadastro_sap}
                          onChangeSetores={(next) => handleChangeAprovadorSetores(p.id, next)}
                          onChangeCadastroSap={(next) => handleChangeAprovadorCadastroSap(p.id, next)}
                        />
                      </td>
                      <td className="py-3">
                        {selectedProfileId === p.id ? (
                          <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={editingRole}
                              onChange={(e) => setEditingRole(e.target.value)}
                              className="rounded border border-slate-200 py-1 px-2 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer bg-white"
                            >
                              <option value="pendente">Acesso Pendente</option>
                              <option value="admin">Admin</option>
                              <option value="solicitante">Solicitante</option>
                              <option value="requisitante">Requisitante</option>
                              <option value="gestor">Gestor</option>
                              <option value="comprador">Comprador</option>
                              <option value="atendente">Atendente</option>
                              <option value="coordenador_suprimentos">Coordenador</option>
                              <option value="visualizador">Visualizador</option>
                            </select>
                            <button
                              onClick={() => handleUpdateRole(p.id)}
                              className="rounded bg-emerald-800 text-white p-1"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setSelectedProfileId(null)}
                              className="rounded border border-slate-200 text-slate-400 p-1"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded inline-block border">
                            {getRoleLabel(p.roles[0])}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        {selectedProfileId !== p.id && (
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => { setSelectedProfileId(p.id); setEditingRole(p.roles[0]); }}
                              className="text-emerald-700 hover:underline font-bold"
                            >
                              Editar Permissão
                            </button>
                            <button
                              onClick={() => setPageAccessProfileId(p.id)}
                              className="text-slate-600 hover:underline font-bold"
                            >
                              Módulos de acesso
                            </button>
                            {p.status === 'inativo' ? (
                              <button
                                onClick={() => handleToggleUserStatus(p.id, 'ativo')}
                                className="text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-200 font-bold transition-colors cursor-pointer"
                                title="Ativar usuário no sistema"
                              >
                                Ativar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleUserStatus(p.id, 'inativo')}
                                disabled={p.id === user.id}
                                className="text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:hover:bg-rose-50 px-2.5 py-0.5 rounded border border-rose-200 font-bold transition-colors cursor-pointer"
                                title={p.id === user.id ? 'Você não pode inativar seu próprio usuário' : 'Inativar usuário no sistema'}
                              >
                                Inativar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Sectors matrix settings */}
      {activeTab === 'setores' && (
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Setores Corporativos da Torres Eólicas ({sectors.length})</h3>
          
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
                        className={`inline-flex items-center px-2 py-1 rounded font-bold text-[10px] uppercase border transition-all ${s.is_support ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      >
                        {s.is_support ? 'Suporte Ativo' : 'Não'}
                      </button>
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleToggleSectorHelpdesk(s.id)}
                        className={`inline-flex items-center px-2 py-1 rounded font-bold text-[10px] uppercase border transition-all ${s.helpdesk_enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
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

      {/* Tab 4: Materials import (cadastro SAP) */}
      {activeTab === 'importar' && (
        <div className="space-y-6">
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
      )}

      {/* Tab 5: Importar SAP (ME5A, ZL0132, PedidosForn & Contatos) */}
      {activeTab === 'importar_sap' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-700" /> Carga de Dados do SAP e Fornecedores
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              O sistema sincroniza a fila de solicitações e ordens de compra cruzando as requisições abertas (ME5A), posição de estoque (ZL0024), histórico de compras por fornecedor (PedidosForn) e contatos.
              Você pode carregar arquivos nos formatos XLSX, XLS ou CSV, ou simular cargas integradas demonstrativas.
            </p>

            {/* Quick Demo Simulator Buttons */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 space-y-3.5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <RefreshCw className="h-4 w-4 text-emerald-600 shrink-0" /> Simulador de Cargas do SAP e Fornecedores
              </h4>
              <p className="text-[11px] text-slate-500">
                Pressione os botões abaixo para preencher o banco de dados com registros demonstrativos válidos de requisições, ordens, históricos e contatos.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setLastUploadLog(null);
                    setTimeout(() => {
                      try {
                        const headers = ['Tipo de documento', 'Requisição de compra', 'Item ReqC', 'Data da solicitação', 'Requisitante', 'Material', 'Texto breve', 'Qtd.solicitada', 'Unidade de medida', 'Grupo de compradores'];
                        const data = [
                          ['ZR01', '1000000123', '00010', new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString().split('T')[0], 'Guilherme Silva', '10000123', 'Cabo de Cobre Flexível 4mm', 150, 'M', '314'],
                          ['ZR02', '1000000123', '00020', new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().split('T')[0], 'Guilherme Silva', '10000456', 'Disjuntor Termomagnético 50A', 12, 'UN', '314'],
                          ['ZR03', '1000000124', '00010', new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0], 'Roberto Souza', '10000789', 'Placa de Aço Laminado 2000x1000x10mm', 5, 'UN', '358']
                        ];
                        const rawRows = [headers, ...data];
                        localDb.importME5ARaw(rawRows, 'sap_export_me5a_simulado.xlsx').then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          setSapLogError('');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Erro ao simular ME5A.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Erro ao simular ME5A.');
                        setSapLogStatus('error');
                      }
                    }, 800);
                  }}
                  className="rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Alimentar Fila SAP (ME5A)
                </button>

                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setLastUploadLog(null);
                    setTimeout(() => {
                      try {
                        const headers = ['ReqC', 'Itm', 'Material', 'TxtBreve', 'Fornecedor', 'Nº ID fiscal 1', 'Nome 1', 'Rg', 'Data doc.', 'Valor líquido'];
                        const data = [
                          ['1100320195', '00020', '10000123', 'Cabo de Cobre Flexível 4mm', '1000015507', '12.345.678/0001-99', 'Metalúrgica Gerdau S.A.', 'SP', '2026-06-01', 500],
                          ['1100320250', '00030', '10000123', 'Cabo de Cobre Flexível 4mm', 'F800555', '98.765.432/0001-00', 'Alcoa Alumínio Brasil', 'RJ', '2026-07-01', 1200],
                          ['1100320250', '00040', '10000456', 'Disjuntor Termomagnético 50A', '1000015507', '12.345.678/0001-99', 'Metalúrgica Gerdau S.A.', 'SP', '2026-05-15', 300],
                          ['1100327694', '00010', '10000789', 'Placa de Aço Laminado 2000x1000x10mm', 'F700333', '11.222.333/0001-44', 'Usiminas S.A.', 'MG', '2026-06-20', 4500]
                        ];
                        const rawRows = [headers, ...data];
                        localDb.importPedidosForn(rawRows, 'historico_pedidos_simulado.xlsx', (progress, message) => {
                          setSapProgress(progress);
                          if (message) setSapLogMessage(message);
                        }).then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          setSapLogError('');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Erro ao simular Histórico de Pedidos.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Erro ao simular Histórico de Pedidos.');
                        setSapLogStatus('error');
                      }
                    }, 800);
                  }}
                  className="rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Alimentar Histórico (PedidosForn)
                </button>

                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setLastUploadLog(null);
                    setTimeout(() => {
                      try {
                        const headers = ['N° VENDOR', 'FORNECEDORES', 'Contato', 'NOME FANTASIA', 'TELEFONE', 'E-MAIL', 'CLASSIFICAÇÃO'];
                        const data = [
                          ['F900213', 'Metalúrgica Gerdau S.A.', 'Carlos Silva', 'Gerdau', '(11) 98888-7777', 'vendas@gerdau.com.br', 'Parceiro Estratégico'],
                          ['F800555', 'Alcoa Alumínio Brasil', 'Ana Souza', 'Alcoa', '(21) 2555-1234', 'comercial@alcoa.com', 'Homologado'],
                          ['F700333', 'Usiminas S.A.', 'João Pereira', 'Usiminas', '(31) 3499-8000', 'atendimento@usiminas.com', 'Preferencial']
                        ];
                        const rawRows = [headers, ...data];
                        localDb.importContatos(rawRows, 'contatos_fornecedores_simulado.xlsx').then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          setSapLogError('');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Erro ao simular Contatos.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Erro ao simular Contatos.');
                        setSapLogStatus('error');
                      }
                    }, 800);
                  }}
                  className="rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Alimentar Contatos (Contatos)
                </button>
                <button
                  onClick={() => {
                    setSapLogStatus('saving');
                    setLastUploadLog(null);
                    setTimeout(() => {
                      try {
                        const headers = ['Fornecedor', 'Nome do fornecedor', 'Rua', 'País', 'Código postal', 'Local'];
                        const data = [
                          ['1000000084', 'Agcomex Comercial Exportadora, Lda', 'R. Dr. Geraldo Campos Moreira, 375', 'BR', '04571-020', 'SÃO PAULO'],
                          ['1000000106', 'Aguiar & Silva, Lda', 'Rua Juvenal F. Pestana, 10', 'PT', '9350-219', 'Ribeira Brava'],
                          ['1000000113', 'Air Liquide Soldadura, Lda', 'Rua Dr. Loureiro Borges 4-2º', 'PT', '1495-131', 'Algés']
                        ];
                        const rawRows = [headers, ...data];
                        localDb.importCidadeForn(rawRows, 'cidadeforn_simulado.xlsx').then(log => {
                          setLastUploadLog(log);
                          setSapLogStatus('success');
                          setSapLogError('');
                          loadData();
                        }).catch(err => {
                          setSapLogError(err.message || 'Erro ao simular Cidades Fornecedores.');
                          setSapLogStatus('error');
                        });
                      } catch (err: any) {
                        setSapLogError(err.message || 'Erro ao simular Cidades Fornecedores.');
                        setSapLogStatus('error');
                      }
                    }, 800);
                  }}
                  className="rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Alimentar Endereços/Cidades (CidadeForn)
                </button>
              </div>
            </div>

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

              {/* PedidosForn Upload Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Histórico de Pedidos (PedidosForn)
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
                  <p className="text-[10px] font-semibold text-slate-600 mt-1">Carregar Excel ou CSV PedidosForn</p>
                </div>
              </div>

              {/* Contatos Upload Card */}
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

      {/* Botão flutuante e janela de chatbot para o usuário Admin */}
      <AdminChatbot user={user} />

    </div>
  );
}
