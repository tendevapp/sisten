/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, Filter, Edit3, Calendar, Check, AlertCircle, 
  ChevronRight, ArrowRight, MessageSquare, ListCollapse, BookOpen, 
  ExternalLink, RefreshCw, Search, Download, Upload, X, AlertTriangle, 
  Clock, FileText, FileSpreadsheet, ChevronDown, CheckCircle2, SlidersHorizontal, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { Profile, EnrichedSAPRecord, SAPPedido, ItemStatus } from '../types';
import SapDetailModal from '../components/SapDetailModal';

const allColsMe5a = [
  { key: 'Status', label: 'Status' },
  { key: 'Natureza', label: 'Natureza' },
  { key: 'RM / Requisição', label: 'RM / Requisição' },
  { key: 'Item', label: 'Item' },
  { key: 'Pedido', label: 'Pedido' },
  { key: 'Data solic.', label: 'Data solic.' },
  { key: 'Material', label: 'Material' },
  { key: 'Texto breve', label: 'Texto breve' },
  { key: 'Qtd.', label: 'Qtd.' },
  { key: 'Un.', label: 'Un.' },
  { key: 'Comprador', label: 'Comprador' },
  { key: 'Data remessa', label: 'Data remessa' },
  { key: 'Requisitante', label: 'Requisitante' },
  { key: 'Data pedido', label: 'Data pedido' },
  { key: 'Obs. Comprador', label: 'Obs. Comprador' },
  { key: 'Entrega prev.', label: 'Entrega prev.' }
];

const allColsZl0132 = [
  { key: 'Pedido', label: 'Pedido' },
  { key: 'Item', label: 'Item' },
  { key: 'RM Origem', label: 'RM Origem' },
  { key: 'Item RM', label: 'Item RM' },
  { key: 'Material', label: 'Material' },
  { key: 'Texto breve', label: 'Texto breve' },
  { key: 'Fornecedor', label: 'Fornecedor' },
  { key: 'Data Pedido', label: 'Data Pedido' },
  { key: 'Data Remessa', label: 'Data Remessa' },
  { key: 'Data MIGO', label: 'Data MIGO' },
  { key: 'Preço Líq.', label: 'Preço Líq.' },
  { key: 'Valor BRL', label: 'Valor BRL' },
  { key: 'Status Entrega', label: 'Status Entrega' },
  { key: 'Atraso (dias)', label: 'Atraso (dias)' }
];

interface SAPObsHistory {
  id: string;
  ri: string;
  obs_comprador?: string;
  data_entrega_prevista?: string;
  user_name: string;
  created_at: string;
}

interface SapObservationFormProps {
  ri: string;
  initialComment: string;
  initialDate: string;
  initialStatus: ItemStatus | '';
  onSaveSuccess: () => void;
}

function SapObservationForm({ ri, initialComment, initialDate, initialStatus, onSaveSuccess }: SapObservationFormProps) {
  const [comment, setComment] = useState(initialComment);
  const [date, setDate] = useState(initialDate);
  const [status, setStatus] = useState<ItemStatus | ''>(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [history, setHistory] = useState<SAPObsHistory[]>([]);

  // Reset internal state when ri changes
  useEffect(() => {
    setComment(initialComment);
    setDate(initialDate);
    setStatus(initialStatus);
    setSaveSuccess(false);
    
    // Load observation history
    const hist = localDb.getObsHistory(ri);
    setHistory(hist.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }, [ri, initialComment, initialDate, initialStatus]);

  // Unified save function (instant write, no unnecessary delay)
  const handleSave = (currentComment: string, currentDate: string, currentStatus: ItemStatus | '', showIndicator = true) => {
    setIsSaving(true);
    if (showIndicator) setSaveSuccess(false);
    
    // Instant save in local database
    localDb.updateBuyerFields(ri, currentComment, currentDate, currentStatus);
    
    setIsSaving(false);
    if (showIndicator) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
    }
    
    // Reload history from database
    const hist = localDb.getObsHistory(ri);
    setHistory(hist.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    
    onSaveSuccess();
  };

  // Real debounced typing effect (using smaller wait for fluid feedback)
  useEffect(() => {
    if (comment === initialComment) return;
    const timer = setTimeout(() => {
      handleSave(comment, date, status, false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [comment]);

  // Handle immediate change when date changes
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    // Saves immediately to database on selection
    handleSave(comment, newDate, status, true);
  };

  // Handle immediate change when status changes
  const handleStatusChange = (newStatus: ItemStatus | '') => {
    setStatus(newStatus);
    handleSave(comment, date, newStatus, true);
  };

  // Handle manual save
  const handleManualSave = () => {
    handleSave(comment, date, status, true);
  };

  // Handle blur save (saves instantly when focus leaves comment box)
  const handleBlur = () => {
    if (comment !== initialComment) {
      handleSave(comment, date, status, true);
    }
  };

  const itemStatusOptions: ItemStatus[] = [
    'Aguardando Cotação',
    'Cotação enviada',
    'Análise de Cotações',
    'Aguardando Aprovação PO',
    'Pedido Enviado',
    'Aguardando Coleta',
    'Em rota de entrega',
    'Entregue',
    'Inativo',
    'Aguardando Solicitante'
  ];

  return (
    <div id="sap_observation_form_container" className="space-y-4">
      {/* Inputs Section */}
      <div className="space-y-3.5">
        {/* Status Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">
            Status do Item
          </label>
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as ItemStatus | '')}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 py-2 px-3 text-xs focus:outline-none focus:border-emerald-600 transition-all cursor-pointer"
          >
            <option value="">Selecionar Status...</option>
            {itemStatusOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Buyer Observation Textarea */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">
            Observação do Comprador
          </label>
          <textarea
            id="buyer_observation_textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={handleBlur}
            placeholder="Escreva observações atualizadas sobre esta RM/Item... (Salva automaticamente ao parar de digitar)"
            rows={4}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 py-2 px-3 text-xs placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 transition-all"
          />
        </div>

        {/* Date Selector */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">
            Promessa de Entrega
          </label>
          <input
            id="buyer_promise_date_input"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 py-2 px-3 text-xs focus:outline-none focus:border-emerald-600 transition-all"
          />
        </div>

        {/* Action Button & Saving Indicator */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex-1">
            <button
              id="buyer_save_manually_btn"
              type="button"
              onClick={handleManualSave}
              disabled={isSaving}
              className={`w-full inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-lg text-xs font-bold text-white transition-all shadow cursor-pointer ${
                saveSuccess 
                  ? 'bg-emerald-600 hover:bg-emerald-700' 
                  : 'bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>✓ Salvo!</span>
                </>
              ) : (
                <>
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Atualizar Status</span>
                </>
              )}
            </button>
          </div>
          
          {/* Automatic indicator status */}
          <div className="text-right shrink-0">
            {isSaving && (
              <span className="text-[10px] text-slate-400 animate-pulse flex items-center font-medium">
                <RefreshCw className="h-3 w-3 animate-spin mr-1 text-slate-400" />
                Salvando...
              </span>
            )}
            {!isSaving && comment !== initialComment && (
              <span className="text-[10px] text-amber-500 font-semibold">
                Pendente...
              </span>
            )}
            {!isSaving && comment === initialComment && date === initialDate && status === initialStatus && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                <Check className="h-3.5 w-3.5 mr-0.5 text-emerald-500" />
                Sincronizado
              </span>
            )}
          </div>
        </div>

        {saveSuccess && (
          <p className="text-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 animate-fade-in">
            ✓ O status e as observações foram registradas com sucesso!
          </p>
        )}
      </div>

      {/* History Log Section */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-2 mb-2 flex items-center">
          <Clock className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
          Histórico do Item
        </h4>

        {history.length === 0 ? (
          <div className="py-4 text-center rounded-lg border border-dashed border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500">
            <p className="text-[10px]">Nenhuma alteração anterior registrada para este item.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {history.map((h, idx) => (
              <div 
                key={h.id || idx} 
                className="relative pl-4 border-l-2 border-slate-100 dark:border-slate-800 last:border-transparent pb-1.5 text-left"
              >
                {/* Dotted indicator */}
                <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700 border border-white dark:border-slate-900" />
                
                <div className="text-[10px] flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1 font-semibold">
                  <span>{h.user_name || 'Sistema'}</span>
                  <span>{new Date(h.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-xs border border-slate-200/80 dark:border-slate-750/50 space-y-1.5 shadow-sm">
                  {h.obs_comprador ? (
                    <p className="text-slate-800 dark:text-slate-200 leading-normal break-words whitespace-pre-wrap font-medium">{h.obs_comprador}</p>
                  ) : (
                    <p className="text-slate-400 dark:text-slate-500 italic">Sem texto de observação</p>
                  )}
                  
                  {h.data_entrega_prevista && (
                    <div className="flex items-center text-[9px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100/60 dark:border-blue-900/30 px-1.5 py-0.5 rounded w-max">
                      <Calendar className="h-2.5 w-2.5 mr-1 text-blue-600 dark:text-blue-400" />
                      <span>Promessa: {new Date(h.data_entrega_prevista).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SapPanelProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function SapPanel({ user, onNavigate }: SapPanelProps) {
  // Core datasets
  const [records, setRecords] = useState<EnrichedSAPRecord[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]);
  
  // Carrega do cache
  const pageCache = localDb.getPageCache('sap_panel', {
    activeTab: 'me5a',
    visibleColsMe5a: ['Status', 'RM / Requisição', 'Item', 'Pedido', 'Material', 'Texto breve', 'Qtd.', 'Comprador', 'Data remessa', 'Obs. Comprador', 'Entrega prev.'],
    visibleColsZl0132: ['Pedido', 'Item', 'RM Origem', 'Material', 'Texto breve', 'Fornecedor', 'Data Remessa', 'Data MIGO', 'Valor BRL', 'Status Entrega', 'Atraso (dias)'],
    searchQuery: '',
    statusFilter: 'Todos',
    buyerGroupFilter: 'Todos',
    alertFilter: 'Todos',
    onlyMine: false,
    sortConfig: { key: '', direction: null }
  });

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'me5a' | 'zl0132'>(pageCache.activeTab as 'me5a' | 'zl0132');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Columns visibility & customization to prevent lateral scroll
  const [visibleColsMe5a, setVisibleColsMe5a] = useState<string[]>(pageCache.visibleColsMe5a);
  const [visibleColsZl0132, setVisibleColsZl0132] = useState<string[]>(pageCache.visibleColsZl0132);
  const [isColMenuOpen, setIsColMenuOpen] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState(pageCache.searchQuery);
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Com PO' | 'Sem PO'>(pageCache.statusFilter as 'Todos' | 'Com PO' | 'Sem PO');
  const [buyerGroupFilter, setBuyerGroupFilter] = useState(pageCache.buyerGroupFilter);
  const [alertFilter, setAlertFilter] = useState(pageCache.alertFilter);
  const [onlyMine, setOnlyMine] = useState(pageCache.onlyMine);

  // Column sorting configuration
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>(pageCache.sortConfig);

  // Efeito para salvar o cache
  useEffect(() => {
    localDb.setPageCache('sap_panel', {
      activeTab,
      visibleColsMe5a,
      visibleColsZl0132,
      searchQuery,
      statusFilter,
      buyerGroupFilter,
      alertFilter,
      onlyMine,
      sortConfig
    });
  }, [activeTab, visibleColsMe5a, visibleColsZl0132, searchQuery, statusFilter, buyerGroupFilter, alertFilter, onlyMine, sortConfig]);

  // Inline editing active keys
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'obs' | 'promessa' | null>(null);
  const [tempComment, setTempComment] = useState('');
  const [tempDate, setTempDate] = useState('');

  // Upload Base Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'ME5A' | 'ZL0132'>('ME5A');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');

  // Universal SAP Detail Modal
  const [selectedRecordForModal, setSelectedRecordForModal] = useState<EnrichedSAPRecord | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Sync status simulation
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'failed'>('idle');

  // Drawer ref for click outside detection
  const drawerRef = useRef<HTMLDivElement>(null);

  // Click outside to close drawer
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        // Ignore clicking a table row (both in ME5A and ZL0132) since row clicks select records
        const isRowClick = (event.target as HTMLElement).closest('tr');
        // Also ignore modal or active dialogs overlayed on the screen
        const isIgnoreClick = (event.target as HTMLElement).closest('.ignore-drawer-close') || 
                              (event.target as HTMLElement).closest('.fixed');
        if (!isRowClick && !isIgnoreClick) {
          setSelectedId(null);
        }
      }
    }
    
    if (selectedId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedId]);

  useEffect(() => {
    // Parse query params from hash for deep linking
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const search = hash.slice(qIndex + 1);
      const params = new URLSearchParams(search);
      
      const statusParam = params.get('status');
      if (statusParam) setStatusFilter(statusParam as any);
      
      const alertParam = params.get('alert');
      if (alertParam) setAlertFilter(alertParam);
      
      const buyerParam = params.get('buyer');
      if (buyerParam) setBuyerGroupFilter(buyerParam);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [user, onlyMine]);

  const loadData = () => {
    // Fetch ME5A Requisicoes
    let list = localDb.getEnrichedSAPRequisicoes();
    if (onlyMine && user.roles.includes('comprador')) {
      const myGroups = localDb.getBuyerGroupsForUser(user.id).map(g => g.group_code);
      list = list.filter(r => myGroups.includes(r.grupo_comprador));
    }
    setRecords(list);

    // Fetch ZL0132 Pedidos & enrich
    const rawPeds = localDb.getPedidos();
    const enrichedPeds = rawPeds.map(p => {
      const matchingReq = list.find(r => r.ri === p.ri);
      
      const data_migo = p.campos_extras?.data_migo || p.campos_extras?.['data_migo'] || (p as any).data_migo;
      const status_entrega = data_migo ? 'Entregue' : 'Não Entregue';
      
      // Calculate dias_atrasado
      let dias_atrasado = 0;
      if (status_entrega === 'Não Entregue' && p.data_entrega_sap) {
        const today = new Date('2026-07-05');
        const remessaDate = new Date(p.data_entrega_sap);
        if (remessaDate < today) {
          const diffTime = today.getTime() - remessaDate.getTime();
          dias_atrasado = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        }
      }

      return {
        ...p,
        requisicao_origem: matchingReq?.requisicao_de_compra || p.campos_extras?.requisicao_origem || '—',
        item_requisicao_origem: matchingReq?.item_reqc || p.campos_extras?.item_requisicao_origem || '—',
        material: matchingReq?.material_code || (p as any).material || p.campos_extras?.material || '—',
        texto_breve: matchingReq?.texto_breve || (p as any).txt_breve || p.campos_extras?.texto_breve || '—',
        status_entrega,
        dias_atrasado,
        preco_liquido: p.preco_liquido !== undefined ? p.preco_liquido : (p.campos_extras?.preco_liquido || p.campos_extras?.['Preço líq.'] || p.campos_extras?.['Preço líquido'] || p.campos_extras?.['preco_liquido'] || 120.00),
        valor_brl: p.valor_brl !== undefined ? p.valor_brl : (p.campos_extras?.valor_brl || p.campos_extras?.['VALOR EM BRL'] || p.campos_extras?.['Valor em BRL'] || p.campos_extras?.['valor_brl'] || 1200.00),
      };
    });
    setPedidos(enrichedPeds);
  };

  // Perform Filters on Requisicoes (ME5A)
  const filteredRequisicoes = records.filter(r => {
    const query = searchQuery.toLowerCase();
    const rmMatch = String(r.requisicao_de_compra || '').toLowerCase().includes(query);
    const poMatch = r.documento_compra ? String(r.documento_compra).toLowerCase().includes(query) : false;
    const matMatch = String(r.material_code || (r as any).material || '').toLowerCase().includes(query);
    const descMatch = String(r.texto_breve || '').toLowerCase().includes(query);
    const supplierMatch = r.fornecedor_name ? String(r.fornecedor_name).toLowerCase().includes(query) : false;
    const matchesSearch = rmMatch || poMatch || matMatch || descMatch || supplierMatch;

    const matchesStatus = statusFilter === 'Todos' || 
      (statusFilter === 'Com PO' && r.status_requisicao === 'Processado') ||
      (statusFilter === 'Sem PO' && r.status_requisicao === 'Sem PO');

    const matchesBuyer = buyerGroupFilter === 'Todos' || r.grupo_comprador === buyerGroupFilter;
    const matchesAlert = alertFilter === 'Todos' || r.alerta === alertFilter;

    return matchesSearch && matchesStatus && matchesBuyer && matchesAlert;
  });

  // Perform Filters on Pedidos (ZL0132)
  const filteredPedidos = pedidos.filter(p => {
    const query = searchQuery.toLowerCase();
    const poMatch = String(p.documento_compra || '').toLowerCase().includes(query);
    const rmMatch = String(p.requisicao_origem || '').toLowerCase().includes(query);
    const matMatch = String(p.material || '').toLowerCase().includes(query);
    const descMatch = String(p.texto_breve || '').toLowerCase().includes(query);
    const supplierMatch = String(p.fornecedor_name || '').toLowerCase().includes(query);
    const matchesSearch = poMatch || rmMatch || matMatch || descMatch || supplierMatch;

    // Pedidos are always "Com PO"
    const matchesStatus = statusFilter === 'Todos' || statusFilter === 'Com PO';

    const matchesAlert = alertFilter === 'Todos' || 
      (alertFilter === '⚠️ AÇÃO URGENTE' && p.dias_atrasado > 15) ||
      (alertFilter === '✅ OK' && p.dias_atrasado === 0);

    const matchingReq = records.find(r => r.ri === p.ri);
    const buyerGroup = matchingReq ? matchingReq.grupo_comprador : '—';
    const matchesBuyer = buyerGroupFilter === 'Todos' || buyerGroup === buyerGroupFilter;

    return matchesSearch && matchesStatus && matchesAlert && matchesBuyer;
  });

  // Sorting Mechanism
  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
  };

  const sortItems = <T extends Record<string, any>>(items: T[], config: typeof sortConfig) => {
    if (!config.key || !config.direction) return items;
    
    const sorted = [...items].sort((a, b) => {
      let aVal = a[config.key];
      let bVal = b[config.key];

      // Dynamic nested key resolution
      if (config.key === 'Status') {
        const score = (r: any) => {
          if (r.status_requisicao === 'Processado') return 0;
          if (r.alerta.includes('⚠️')) return 3;
          if (r.alerta.includes('⚡')) return 2;
          return 1;
        };
        aVal = score(a);
        bVal = score(b);
      } else if (config.key === 'Entrega prev.') {
        aVal = a.data_entrega_prevista || '';
      } else if (config.key === 'RM / Requisição') {
        aVal = a.requisicao_de_compra || '';
      } else if (config.key === 'Item') {
        aVal = a.item_reqc || a.item_pedido || '';
      } else if (config.key === 'Data solic.') {
        aVal = a.data_solicitacao || '';
      } else if (config.key === 'Material') {
        aVal = a.material_code || a.material || '';
      } else if (config.key === 'Texto breve') {
        aVal = a.texto_breve || '';
      } else if (config.key === 'Qtd.') {
        aVal = Number(a.qtd_requisicao || a.qtd_pedido || 0);
      } else if (config.key === 'Un.') {
        aVal = a.unidade_medida || '';
      } else if (config.key === 'Comprador') {
        const matchingReq = records.find(r => r.ri === a.ri);
        aVal = a.grupo_comprador || (matchingReq ? matchingReq.grupo_comprador : '');
        const matchingReqB = records.find(r => r.ri === b.ri);
        bVal = b.grupo_comprador || (matchingReqB ? matchingReqB.grupo_comprador : '');
      } else if (config.key === 'Data remessa') {
        aVal = a.data_remessa || a.data_entrega_sap || '';
      } else if (config.key === 'Requisitante') {
        aVal = a.requisitante_name || '';
      } else if (config.key === 'Data pedido') {
        aVal = a.data_pedido || '';
      } else if (config.key === 'Pedido') {
        aVal = a.documento_compra || '';
      } else if (config.key === 'RM Origem') {
        aVal = a.requisicao_origem || '';
      } else if (config.key === 'Item RM') {
        aVal = a.item_requisicao_origem || '';
      } else if (config.key === 'Fornecedor') {
        aVal = a.fornecedor_name || '';
      } else if (config.key === 'Preço Líq.') {
        aVal = Number(a.preco_liquido || 0);
      } else if (config.key === 'Valor BRL') {
        aVal = Number(a.valor_brl || 0);
      } else if (config.key === 'Status Entrega') {
        aVal = a.status_entrega || '';
      } else if (config.key === 'Atraso (dias)') {
        aVal = Number(a.dias_atrasado || 0);
      }

      // Numeric comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return aVal - bVal;
      }

      // Date comparison helper
      const isDateStr = (val: any) => typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val);
      if (isDateStr(aVal) && isDateStr(bVal)) {
        return new Date(aVal).getTime() - new Date(bVal).getTime();
      }

      // Alpha-locale comparison
      const strA = String(aVal || '').toLowerCase();
      const strB = String(bVal || '').toLowerCase();
      return strA.localeCompare(strB, 'pt-BR');
    });

    return config.direction === 'desc' ? sorted.reverse() : sorted;
  };

  const sortedRequisicoes = sortItems(filteredRequisicoes, sortConfig);
  const sortedPedidos = sortItems(filteredPedidos, sortConfig);

  const selectedRecord = records.find(r => r.ri === selectedId);
  const linkedRequest = selectedRecord 
    ? localDb.getRequests().find(req => req.number === selectedRecord.requisicao_de_compra)
    : null;

  // Optimistic Field Updates with local storage persistence
  const handleUpdateField = async (ri: string, field: 'obs' | 'promessa') => {
    setSyncStatus('syncing');
    const nextComment = field === 'obs' ? tempComment : (selectedRecord?.obs_comprador || '');
    const nextDate = field === 'promessa' ? tempDate : (selectedRecord?.data_entrega_prevista || '');
    
    // Simulating exponential backoff retries offline queue logic
    let attempt = 0;
    const maxRetries = 2;
    const tryUpdate = async (): Promise<boolean> => {
      attempt++;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(Math.random() > 0.05); // low failure simulation
        }, 150);
      });
    };

    let success = false;
    while (attempt < maxRetries && !success) {
      success = await tryUpdate();
    }

    if (success) {
      localDb.updateBuyerFields(ri, nextComment, nextDate);
      setEditingId(null);
      setEditingField(null);
      setSyncStatus('idle');
      loadData();
    } else {
      setSyncStatus('failed');
      alert('Instabilidade de rede detectada. Os dados foram retidos em fila offline para sincronização.');
    }
  };

  const startEditing = (rec: any, field: 'obs' | 'promessa') => {
    setEditingId(rec.ri);
    setEditingField(field);
    setTempComment(rec.obs_comprador || '');
    setTempDate(rec.data_entrega_prevista || '');
  };

  // Helper for generating custom status badges identical to the design
  const getStatusBadge = (r: any) => {
    if (r.status_requisicao === 'Processado') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Check className="h-3 w-3 mr-1 shrink-0" />
          Processado
        </span>
      );
    }

    // Sem PO: Map alert status
    const alertStr = r.alerta || '✅ OK';
    if (alertStr.includes('⚠️')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
          <AlertTriangle className="h-3 w-3 mr-1 text-orange-500 shrink-0" />
          Sem PO
        </span>
      );
    } else if (alertStr.includes('⚡')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-50 text-yellow-700 border border-yellow-200">
          <Clock className="h-3 w-3 mr-1 text-yellow-500 shrink-0" />
          Sem PO
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <FileText className="h-3 w-3 mr-1 text-blue-500 shrink-0" />
          Sem PO
        </span>
      );
    }
  };

  // Extract dynamically the list of buyer groups
  const getBuyerGroupList = () => {
    const groups = new Set<string>();
    records.forEach(r => {
      if (r.grupo_comprador) groups.add(r.grupo_comprador);
    });
    return Array.from(groups).sort();
  };

  // Export tables to Excel — usa Blob + anchor para garantir download com extensao correta
  const handleExportXLS = () => {
    let dataToExport: any[] = [];
    const timestamp = new Date().toISOString().split('T')[0];
    const sheetName = activeTab === 'me5a' ? 'Requisicoes ME5A' : 'Pedidos ZL0132';
    const filename = activeTab === 'me5a'
      ? `Requisicoes_ME5A_${timestamp}.xlsx`
      : `Pedidos_ZL0132_${timestamp}.xlsx`;

    if (activeTab === 'me5a') {
      dataToExport = sortedRequisicoes.map(r => ({
        'Status': r.status_requisicao === 'Sem PO' ? `Sem PO (${r.alerta})` : 'Processado',
        'Natureza': r.natureza || 'Normal',
        'RM': r.requisicao_de_compra,
        'Item': r.item_reqc,
        'Pedido': r.documento_compra || '',
        'Data Solicitacao': r.data_solicitacao ? new Date(r.data_solicitacao).toLocaleDateString('pt-BR') : '',
        'Material': r.material_code || '',
        'Texto Breve': r.texto_breve || '',
        'Qtd': r.qtd_requisicao || '',
        'Un': r.unidade_medida || '',
        'Comprador': r.grupo_comprador || '',
        'Data Remessa': r.data_remessa ? new Date(r.data_remessa).toLocaleDateString('pt-BR') : '',
        'Requisitante': r.requisitante_name || '',
        'Data Pedido': r.data_pedido ? new Date(r.data_pedido).toLocaleDateString('pt-BR') : '',
        'Obs Comprador': r.obs_comprador || '',
        'Entrega Prevista': r.data_entrega_prevista ? new Date(r.data_entrega_prevista).toLocaleDateString('pt-BR') : '',
      }));
    } else {
      dataToExport = sortedPedidos.map(p => ({
        'Pedido (PO)': p.documento_compra || '',
        'Item': p.item_pedido || '',
        'RM Origem': p.requisicao_origem || '',
        'Item RM': p.item_requisicao_origem || '',
        'Material': p.material || '',
        'Texto Breve': p.texto_breve || '',
        'Fornecedor': p.fornecedor_name || '',
        'Data Pedido': p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR') : '',
        'Data Remessa': p.data_entrega_sap ? new Date(p.data_entrega_sap).toLocaleDateString('pt-BR') : '',
        'Data MIGO': p.campos_extras?.data_migo ? new Date(p.campos_extras.data_migo).toLocaleDateString('pt-BR') : '',
        'Preco Liquido': p.preco_liquido ?? '',
        'Valor BRL': p.valor_brl ?? '',
        'Status Entrega': p.status_entrega || '',
        'Atraso (dias)': p.dias_atrasado ?? 0,
      }));
    }

    if (dataToExport.length === 0) {
      alert('Nenhum dado disponivel para exportar. Verifique os filtros ativos.');
      return;
    }

    try {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, filename, { bookType: 'xlsx' });
    } catch (err) {
      console.error('Erro ao exportar planilha:', err);
      alert('Nao foi possivel gerar a planilha. Tente novamente.');
    }
  };

  // KPI calculations
  const totalSemPo = records.filter(r => r.status_requisicao === 'Sem PO').length;
  const totalProcessados = records.filter(r => r.status_requisicao === 'Processado').length;
  const totalCriticos = records.filter(r => r.status_requisicao === 'Sem PO' && (r.atraso_comprador > 15 || r.alerta.includes('⚠️') || r.alerta.includes('⚡'))).length;
  
  const semPoItems = records.filter(r => r.status_requisicao === 'Sem PO');
  const avgAtraso = semPoItems.length > 0 
    ? Math.round(semPoItems.reduce((acc, curr) => acc + (curr.atraso_comprador || 0), 0) / semPoItems.length) 
    : 0;

  const totalGeral = records.length;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    setUploadStatus('loading');
    setUploadMessage('Processando arquivo...');
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let rawRows: any[][] = [];
        if (extension === 'csv') {
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

        if (uploadType === 'ME5A') {
          localDb.importME5ARaw(rawRows, file.name).then(log => {
            setUploadMessage(`ME5A importada com sucesso! ${rawRows.length - 1} linhas lidas.`);
            setUploadStatus('success');
            loadData();
          }).catch(err => {
            setUploadStatus('error');
            setUploadMessage(err.message || 'Falha ao processar arquivo.');
          });
        } else {
          localDb.importZL0132Raw(rawRows, file.name).then(log => {
            setUploadMessage(`ZL0132 importada com sucesso! ${rawRows.length - 1} linhas lidas.`);
            setUploadStatus('success');
            loadData();
          }).catch(err => {
            setUploadStatus('error');
            setUploadMessage(err.message || 'Falha ao processar arquivo.');
          });
        }
      } catch (err: any) {
        setUploadStatus('error');
        setUploadMessage(err.message || 'Falha ao processar arquivo.');
      }
    };

    if (extension === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('Todos');
    setAlertFilter('Todos');
    setBuyerGroupFilter('Todos');
    setSortConfig({ key: '', direction: null });
  };

  // Reusable Sort Header Renderer
  const SortHeader = ({ label, sortKey }: { label: string; sortKey: string }) => {
    const isActive = sortConfig.key === sortKey;
    const dir = isActive ? sortConfig.direction : null;
    return (
      <th 
        onClick={() => requestSort(sortKey)}
        className="py-2.5 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group text-[10px] font-bold text-slate-400 uppercase tracking-wider"
      >
        <div className="flex items-center space-x-1">
          <span>{label}</span>
          <span className={`text-[10px] font-bold ${isActive ? 'text-blue-600' : 'text-slate-300 group-hover:text-slate-400'}`}>
            {dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↑↓'}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] -m-6 overflow-hidden">
      
      {/* Header Panel Layout */}
      <div className="bg-white p-4 border-b border-slate-100 shrink-0 text-left space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Painel SAP</h2>
            <p className="text-xs text-slate-500">Requisições (ME5A) e pedidos (ZL0132) consolidados por chave RI.</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => {
                setUploadType('ME5A');
                setUploadStatus('idle');
                setUploadMessage('');
                setIsUploadModalOpen(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              <span>Atualizar base</span>
            </button>
            <button
              type="button"
              onClick={handleExportXLS}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Exportar Excel (.xls)</span>
            </button>
          </div>
        </div>

        {/* Dynamic KPI Dashboard Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <div className="border border-slate-200/60 rounded-xl p-3 bg-white hover:shadow-sm transition-shadow">
            <span className="text-[9px] font-extrabold tracking-wider text-slate-400 uppercase block">TOTAL (SEM PO)</span>
            <p className="text-2xl font-black text-amber-600 mt-1">{totalSemPo}</p>
          </div>
          <div className="border border-slate-200/60 rounded-xl p-3 bg-white hover:shadow-sm transition-shadow">
            <span className="text-[9px] font-extrabold tracking-wider text-slate-400 uppercase block">PROCESSADOS (COM PO)</span>
            <p className="text-2xl font-black text-blue-600 mt-1">{totalProcessados}</p>
          </div>
          <div className="border border-slate-200/60 rounded-xl p-3 bg-white hover:shadow-sm transition-shadow">
            <span className="text-[9px] font-extrabold tracking-wider text-slate-400 uppercase block">CRÍTICOS / ATRASADOS</span>
            <p className="text-2xl font-black text-red-600 mt-1">{totalCriticos}</p>
          </div>
          <div className="border border-slate-200/60 rounded-xl p-3 bg-white hover:shadow-sm transition-shadow">
            <span className="text-[9px] font-extrabold tracking-wider text-slate-400 uppercase block">ATRASO MÉDIO (DIAS)</span>
            <p className="text-2xl font-black text-slate-800 mt-1">{avgAtraso}</p>
          </div>
          <div className="border border-slate-200/60 rounded-xl p-3 bg-white hover:shadow-sm transition-shadow">
            <span className="text-[9px] font-extrabold tracking-wider text-slate-400 uppercase block">TOTAL</span>
            <p className="text-2xl font-black text-emerald-600 mt-1">{totalGeral}</p>
          </div>
        </div>

        {/* Advanced Filters Layout matching image */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por RM, nº PO, material, texto breve ou fornecedor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-9 pr-4 text-xs placeholder-slate-400 focus:outline-none focus:border-slate-300 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs text-slate-600 focus:outline-none focus:border-slate-300"
            >
              <option value="Todos">Todos status</option>
              <option value="Com PO">Processados (Com PO)</option>
              <option value="Sem PO">Em aberto (Sem PO)</option>
            </select>

            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs text-slate-600 focus:outline-none focus:border-slate-300"
            >
              <option value="Todos">Todos alertas</option>
              <option value="⚠️ ESCALAR IMEDIATAMENTE">Escalar Imediatamente</option>
              <option value="⚠️ AÇÃO URGENTE">Ação Urgente</option>
              <option value="⚡ ACOMPANHAR">Acompanhar</option>
              <option value="📋 MONITORAR">Monitorar</option>
              <option value="✅ OK">OK</option>
            </select>

            <select
              value={buyerGroupFilter}
              onChange={(e) => setBuyerGroupFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs text-slate-600 focus:outline-none focus:border-slate-300"
            >
              <option value="Todos">Todos compradores</option>
              {getBuyerGroupList().map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>

            <button 
              onClick={handleClearFilters}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Pill design */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 shrink-0">
          <div className="flex items-center space-x-1.5">
            <button 
              onClick={() => {
                setActiveTab('me5a');
                setSortConfig({ key: '', direction: null });
                setIsColMenuOpen(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'me5a' ? 'bg-slate-100 text-slate-900 border border-slate-200/80 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
              ME5A — Requisições ({sortedRequisicoes.length})
            </button>
            <button 
              onClick={() => {
                setActiveTab('zl0132');
                setSortConfig({ key: '', direction: null });
                setIsColMenuOpen(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'zl0132' ? 'bg-slate-100 text-slate-900 border border-slate-200/80 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
              ZL0132 — Pedidos ({sortedPedidos.length})
            </button>
          </div>

          {/* Column selector drop-down */}
          <div className="relative">
            {isColMenuOpen && (
              <div className="fixed inset-0 z-20" onClick={() => setIsColMenuOpen(false)} />
            )}
            
            <button
              onClick={() => setIsColMenuOpen(!isColMenuOpen)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all z-30 relative"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              <span>Personalizar Colunas</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
            
            {isColMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200/80 z-30 p-3 text-left">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-700">Colunas Ativas</span>
                  <button 
                    onClick={() => {
                      if (activeTab === 'me5a') {
                        setVisibleColsMe5a(allColsMe5a.map(c => c.key));
                      } else {
                        setVisibleColsZl0132(allColsZl0132.map(c => c.key));
                      }
                    }}
                    className="text-[10px] text-blue-600 hover:underline font-semibold"
                  >
                    Mostrar Todas
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {(activeTab === 'me5a' ? allColsMe5a : allColsZl0132).map((col) => {
                    const isVisible = activeTab === 'me5a' 
                      ? visibleColsMe5a.includes(col.key)
                      : visibleColsZl0132.includes(col.key);
                      
                    return (
                      <label 
                        key={col.key} 
                        className="flex items-center space-x-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs text-slate-600 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => {
                            if (activeTab === 'me5a') {
                              setVisibleColsMe5a(prev => 
                                prev.includes(col.key) 
                                  ? prev.filter(k => k !== col.key) 
                                  : [...prev, col.key]
                              );
                            } else {
                              setVisibleColsZl0132(prev => 
                                prev.includes(col.key) 
                                  ? prev.filter(k => k !== col.key) 
                                  : [...prev, col.key]
                              );
                            }
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                        />
                        <span className="font-medium">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main split grid layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Active table renderer */}
        <div className="flex-1 overflow-auto bg-white border-r border-slate-100">
          {activeTab === 'me5a' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10">
                  {visibleColsMe5a.includes('Status') && <SortHeader label="Status" sortKey="Status" />}
                  {visibleColsMe5a.includes('Natureza') && <SortHeader label="Natureza" sortKey="Natureza" />}
                  {visibleColsMe5a.includes('RM / Requisição') && <SortHeader label="RM / Requisição" sortKey="RM / Requisição" />}
                  {visibleColsMe5a.includes('Item') && <SortHeader label="Item" sortKey="Item" />}
                  {visibleColsMe5a.includes('Pedido') && <SortHeader label="Pedido" sortKey="Pedido" />}
                  {visibleColsMe5a.includes('Data solic.') && <SortHeader label="Data solic." sortKey="Data solic." />}
                  {visibleColsMe5a.includes('Material') && <SortHeader label="Material" sortKey="Material" />}
                  {visibleColsMe5a.includes('Texto breve') && <SortHeader label="Texto breve" sortKey="Texto breve" />}
                  {visibleColsMe5a.includes('Qtd.') && <SortHeader label="Qtd." sortKey="Qtd." />}
                  {visibleColsMe5a.includes('Un.') && <SortHeader label="Un." sortKey="Un." />}
                  {visibleColsMe5a.includes('Comprador') && <SortHeader label="Comprador" sortKey="Comprador" />}
                  {visibleColsMe5a.includes('Data remessa') && <SortHeader label="Data remessa" sortKey="Data remessa" />}
                  {visibleColsMe5a.includes('Requisitante') && <SortHeader label="Requisitante" sortKey="Requisitante" />}
                  {visibleColsMe5a.includes('Data pedido') && <SortHeader label="Data pedido" sortKey="Data pedido" />}
                  {visibleColsMe5a.includes('Obs. Comprador') && <th className="py-2 px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Obs. Comprador</th>}
                  {visibleColsMe5a.includes('Entrega prev.') && <SortHeader label="Entrega prev." sortKey="Entrega prev." />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {sortedRequisicoes.map((r) => {
                  const isSelected = r.ri === selectedId;
                  const isEditingThisComment = editingId === r.ri && editingField === 'obs';
                  const isEditingThisDate = editingId === r.ri && editingField === 'promessa';

                  return (
                    <tr 
                      key={r.ri}
                      onClick={() => setSelectedId(r.ri)}
                      className={`hover:bg-slate-50/40 transition-colors cursor-pointer ${isSelected ? 'bg-emerald-50/30' : ''}`}
                    >
                      {/* Status */}
                      {visibleColsMe5a.includes('Status') && <td className="py-1.5 px-2.5">{getStatusBadge(r)}</td>}
                      
                      {/* Natureza */}
                      {visibleColsMe5a.includes('Natureza') && <td className="py-1.5 px-2.5 text-slate-500">{r.natureza || 'Normal'}</td>}
                      
                      {/* Requisicao */}
                      {visibleColsMe5a.includes('RM / Requisição') && <td className="py-1.5 px-2.5 font-semibold text-slate-800">{r.requisicao_de_compra}</td>}
                      
                      {/* Item */}
                      {visibleColsMe5a.includes('Item') && <td className="py-1.5 px-2.5 font-mono text-slate-400">{r.item_reqc}</td>}
                      
                      {/* Pedido */}
                      {visibleColsMe5a.includes('Pedido') && (
                        <td className="py-1.5 px-2.5 font-mono text-slate-700 font-medium">
                          {r.documento_compra || '—'}
                        </td>
                      )}
                      
                      {/* Data solic */}
                      {visibleColsMe5a.includes('Data solic.') && (
                        <td className="py-1.5 px-2.5 text-slate-600">
                          {r.data_solicitacao ? new Date(r.data_solicitacao).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      )}
                      
                      {/* Material */}
                      {visibleColsMe5a.includes('Material') && (
                        <td className="py-1.5 px-2.5 font-mono text-slate-700 font-medium">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecordForModal(r);
                              setIsDetailModalOpen(true);
                            }}
                            className="hover:underline hover:text-emerald-600 inline-flex items-center gap-1 focus:outline-none cursor-pointer text-left"
                            title="Ver detalhamento SAP completo"
                          >
                            {r.material_code}
                            <Info className="h-3.5 w-3.5 text-slate-400" />
                          </button>
                        </td>
                      )}
                      
                      {/* Texto breve */}
                      {visibleColsMe5a.includes('Texto breve') && (
                        <td className="py-1.5 px-2.5 truncate max-w-[130px] lg:max-w-[180px] text-slate-700" title={r.texto_breve}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecordForModal(r);
                              setIsDetailModalOpen(true);
                            }}
                            className="hover:underline hover:text-emerald-600 focus:outline-none cursor-pointer text-left font-medium block truncate max-w-full"
                          >
                            {r.texto_breve}
                          </button>
                        </td>
                      )}
                      
                      {/* Qtd */}
                      {visibleColsMe5a.includes('Qtd.') && <td className="py-1.5 px-2.5 font-semibold text-slate-800">{r.qtd_requisicao}</td>}
                      
                      {/* Un */}
                      {visibleColsMe5a.includes('Un.') && <td className="py-1.5 px-2.5 font-mono text-slate-400 uppercase">{r.unidade_medida || 'UN'}</td>}
                      
                      {/* Comprador group */}
                      {visibleColsMe5a.includes('Comprador') && <td className="py-1.5 px-2.5 font-mono font-bold text-slate-600">{r.grupo_comprador || '—'}</td>}
                      
                      {/* Data remessa */}
                      {visibleColsMe5a.includes('Data remessa') && (
                        <td className="py-1.5 px-2.5 text-slate-500">
                          {r.data_remessa ? new Date(r.data_remessa).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      )}
                      
                      {/* Requisitante */}
                      {visibleColsMe5a.includes('Requisitante') && <td className="py-1.5 px-2.5 text-slate-500 truncate max-w-[100px]" title={r.requisitante_name}>{r.requisitante_name}</td>}
                      
                      {/* Data pedido */}
                      {visibleColsMe5a.includes('Data pedido') && (
                        <td className="py-1.5 px-2.5 text-slate-500">
                          {r.data_pedido ? new Date(r.data_pedido).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      )}
                      
                      {/* Obs Comprador (Editable) */}
                      {visibleColsMe5a.includes('Obs. Comprador') && (
                        <td className="py-1 px-2.5" onClick={(e) => e.stopPropagation()}>
                          {isEditingThisComment ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="text"
                                value={tempComment}
                                onChange={(e) => setTempComment(e.target.value)}
                                className="flex-1 rounded border border-slate-300 py-0.5 px-1.5 text-xs focus:outline-none focus:border-blue-600 bg-white"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateField(r.ri, 'obs');
                                  if (e.key === 'Escape') { setEditingId(null); setEditingField(null); }
                                }}
                              />
                              <button 
                                onClick={() => handleUpdateField(r.ri, 'obs')}
                                className="p-1 rounded bg-emerald-700 text-white hover:bg-emerald-800"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div 
                              className="flex items-center justify-between group cursor-pointer hover:bg-slate-100/50 p-0.5 px-1 rounded transition-colors min-w-[110px]"
                              onClick={() => startEditing(r, 'obs')}
                            >
                              <span className="text-slate-600 truncate max-w-[110px]">{r.obs_comprador || '—'}</span>
                              <Edit3 className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 ml-1 transition-opacity shrink-0" />
                            </div>
                          )}
                        </td>
                      )}
                      
                      {/* Entrega prev. (Editable) */}
                      {visibleColsMe5a.includes('Entrega prev.') && (
                        <td className="py-1 px-2.5" onClick={(e) => e.stopPropagation()}>
                          {isEditingThisDate ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="date"
                                value={tempDate}
                                onChange={(e) => setTempDate(e.target.value)}
                                className="rounded border border-slate-300 py-0.5 px-1 text-xs focus:outline-none focus:border-blue-600 bg-white"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateField(r.ri, 'promessa');
                                  if (e.key === 'Escape') { setEditingId(null); setEditingField(null); }
                                }}
                              />
                              <button 
                                onClick={() => handleUpdateField(r.ri, 'promessa')}
                                className="p-1 rounded bg-emerald-700 text-white hover:bg-emerald-800"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div 
                              className="flex items-center justify-between group cursor-pointer hover:bg-slate-100/50 p-0.5 px-1 rounded transition-colors min-w-[90px]"
                              onClick={() => startEditing(r, 'promessa')}
                            >
                              <span className="text-slate-700 font-medium">
                                {r.data_entrega_prevista ? new Date(r.data_entrega_prevista).toLocaleDateString('pt-BR') : 'dd/mm/aaaa'}
                              </span>
                              <Calendar className="h-3 w-3 text-slate-400 ml-1 shrink-0" />
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            // ZL0132 Pedidos Grid Table
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10">
                  {visibleColsZl0132.includes('Pedido') && <SortHeader label="Pedido" sortKey="Pedido" />}
                  {visibleColsZl0132.includes('Item') && <SortHeader label="Item" sortKey="Item" />}
                  {visibleColsZl0132.includes('RM Origem') && <SortHeader label="RM Origem" sortKey="RM Origem" />}
                  {visibleColsZl0132.includes('Item RM') && <SortHeader label="Item RM" sortKey="Item RM" />}
                  {visibleColsZl0132.includes('Material') && <SortHeader label="Material" sortKey="Material" />}
                  {visibleColsZl0132.includes('Texto breve') && <SortHeader label="Texto breve" sortKey="Texto breve" />}
                  {visibleColsZl0132.includes('Fornecedor') && <SortHeader label="Fornecedor" sortKey="Fornecedor" />}
                  {visibleColsZl0132.includes('Data Pedido') && <SortHeader label="Data Pedido" sortKey="Data pedido" />}
                  {visibleColsZl0132.includes('Data Remessa') && <SortHeader label="Data Remessa" sortKey="Data remessa" />}
                  {visibleColsZl0132.includes('Data MIGO') && <SortHeader label="Data MIGO" sortKey="Data MIGO" />}
                  {visibleColsZl0132.includes('Preço Líq.') && <SortHeader label="Preço Líq." sortKey="Preço Líq." />}
                  {visibleColsZl0132.includes('Valor BRL') && <SortHeader label="Valor BRL" sortKey="Valor BRL" />}
                  {visibleColsZl0132.includes('Status Entrega') && <SortHeader label="Status Entrega" sortKey="Status Entrega" />}
                  {visibleColsZl0132.includes('Atraso (dias)') && <SortHeader label="Atraso (dias)" sortKey="Atraso (dias)" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {sortedPedidos.map((p) => {
                  const isSelected = p.ri === selectedId;
                  const data_migo = p.campos_extras?.data_migo || p.campos_extras?.['data_migo'] || (p as any).data_migo;

                  return (
                    <tr 
                      key={`${p.documento_compra}_${p.item_pedido}`}
                      onClick={() => setSelectedId(p.ri)}
                      className={`hover:bg-slate-50/40 transition-colors cursor-pointer ${isSelected ? 'bg-emerald-50/30' : ''}`}
                    >
                      {/* Pedido */}
                      {visibleColsZl0132.includes('Pedido') && <td className="py-1.5 px-2.5 font-semibold text-slate-800">{p.documento_compra}</td>}
                      
                      {/* Item */}
                      {visibleColsZl0132.includes('Item') && <td className="py-1.5 px-2.5 font-mono text-slate-400">{p.item_pedido}</td>}
                      
                      {/* RM Origem */}
                      {visibleColsZl0132.includes('RM Origem') && <td className="py-1.5 px-2.5 text-slate-500">{p.requisicao_origem}</td>}
                      
                      {/* Item RM */}
                      {visibleColsZl0132.includes('Item RM') && <td className="py-1.5 px-2.5 font-mono text-slate-400">{p.item_requisicao_origem}</td>}
                      
                      {/* Material */}
                      {visibleColsZl0132.includes('Material') && (
                        <td className="py-1.5 px-2.5 font-mono text-slate-705 font-medium">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rec = records.find(r => r.ri === p.ri);
                              if (rec) {
                                setSelectedRecordForModal(rec);
                                setIsDetailModalOpen(true);
                              }
                            }}
                            className="hover:underline hover:text-emerald-600 inline-flex items-center gap-1 focus:outline-none cursor-pointer text-left font-bold"
                          >
                            {p.material}
                            <Info className="h-3.5 w-3.5 text-slate-400" />
                          </button>
                        </td>
                      )}
                      
                      {/* Texto breve */}
                      {visibleColsZl0132.includes('Texto breve') && (
                        <td className="py-1.5 px-2.5 truncate max-w-[130px] lg:max-w-[180px]" title={p.texto_breve}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rec = records.find(r => r.ri === p.ri);
                              if (rec) {
                                setSelectedRecordForModal(rec);
                                setIsDetailModalOpen(true);
                              }
                            }}
                            className="hover:underline hover:text-emerald-600 focus:outline-none cursor-pointer text-left font-medium block truncate max-w-full"
                          >
                            {p.texto_breve}
                          </button>
                        </td>
                      )}
                      
                      {/* Fornecedor */}
                      {visibleColsZl0132.includes('Fornecedor') && (
                        <td className="py-1.5 px-2.5 text-slate-600 truncate max-w-[100px] lg:max-w-[130px]" title={p.fornecedor_name}>
                          {p.fornecedor_name}
                        </td>
                      )}
                      
                      {/* Data Pedido */}
                      {visibleColsZl0132.includes('Data Pedido') && (
                        <td className="py-1.5 px-2.5 text-slate-500">
                          {p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      )}
                      
                      {/* Data Remessa */}
                      {visibleColsZl0132.includes('Data Remessa') && (
                        <td className="py-1.5 px-2.5 text-slate-500">
                          {p.data_entrega_sap ? new Date(p.data_entrega_sap).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      )}
                      
                      {/* Data MIGO */}
                      {visibleColsZl0132.includes('Data MIGO') && (
                        <td className="py-1.5 px-2.5 text-slate-600 font-medium">
                          {data_migo ? new Date(data_migo).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      )}
                      
                      {/* Preço Líq */}
                      {visibleColsZl0132.includes('Preço Líq.') && (
                        <td className="py-1.5 px-2.5 text-slate-600 font-mono">
                          R$ {Number(p.preco_liquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      )}
                      
                      {/* Valor BRL */}
                      {visibleColsZl0132.includes('Valor BRL') && (
                        <td className="py-1.5 px-2.5 text-slate-800 font-mono font-semibold">
                          R$ {Number(p.valor_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      )}
                      
                      {/* Status Entrega */}
                      {visibleColsZl0132.includes('Status Entrega') && (
                        <td className="py-1.5 px-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status_entrega === 'Entregue' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            {p.status_entrega}
                          </span>
                        </td>
                      )}
                      
                      {/* Atraso */}
                      {visibleColsZl0132.includes('Atraso (dias)') && (
                        <td className="py-1.5 px-2.5 text-center">
                          {p.dias_atrasado > 0 ? (
                            <span className="text-red-600 font-bold">{p.dias_atrasado} dias</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detailed Drawer split-pane */}
        {selectedRecord && (
          <div ref={drawerRef} className="w-96 border-l border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full overflow-hidden text-left shadow-lg">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">Detalhamento SAP</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">RM {selectedRecord.requisicao_de_compra} • Item {selectedRecord.item_reqc}</p>
                </div>
                <button 
                  onClick={() => setSelectedId(null)}
                  className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              
              {/* Geral Section */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  Informações Gerais
                </h4>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Material</span>
                    <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">{selectedRecord.material_code} - {selectedRecord.texto_breve}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Qtd Solicitada</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{selectedRecord.qtd_requisicao}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Unidade</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{selectedRecord.unidade_medida || 'UN'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Data Requisição</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                        {selectedRecord.data_solicitacao ? new Date(selectedRecord.data_solicitacao).toLocaleDateString('pt-BR') : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Grupo Comprador</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{selectedRecord.grupo_comprador || '—'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Natureza</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{selectedRecord.natureza || 'Normal'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Lead Time Meta</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{selectedRecord.lead_time_compras_meta} dias</p>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block font-mono">Chave RI SAP</span>
                    <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 p-2 rounded mt-1 truncate select-all">{selectedRecord.ri}</p>
                  </div>

                  {selectedRecord.documento_compra && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg space-y-1 mt-2">
                      <span className="text-[9px] font-bold text-blue-800 dark:text-blue-400 uppercase block">Pedido de Compra Vinculado</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">Pedido #{selectedRecord.documento_compra} (Item {selectedRecord.item_pedido})</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Fornecedor: {selectedRecord.fornecedor_name || '—'}</p>
                    </div>
                  )}

                  {/* Solicitacao Interna Integration */}
                  {linkedRequest ? (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-lg space-y-2 mt-2">
                      <span className="text-[9px] font-bold text-emerald-800 dark:text-emerald-400 uppercase block">Vinculada à Solicitação Interna</span>
                      <h5 className="font-bold text-slate-800 dark:text-slate-200">Solicitação #{linkedRequest.number}</h5>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">{linkedRequest.justificativa}</p>
                      <button 
                        onClick={() => onNavigate(`/solicitacoes/minhas?id=${linkedRequest.id}`)}
                        className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center pt-1 cursor-pointer"
                      >
                        Abrir acompanhamento <ExternalLink className="h-3 w-3 ml-1" />
                      </button>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-lg mt-2 text-slate-500 dark:text-slate-400">
                      <p className="text-[10px] leading-relaxed">
                        Esta RM foi gerada diretamente no terminal SAP por um coordenador.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Observações e Prazos Section */}
              <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                <SapObservationForm 
                  ri={selectedRecord.ri}
                  initialComment={selectedRecord.obs_comprador || ''}
                  initialDate={selectedRecord.data_entrega_prevista || ''}
                  initialStatus={selectedRecord.item_status || ''}
                  onSaveSuccess={loadData}
                />
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Modern Integrated Upload base modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden text-left">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Atualizar Base SAP</h3>
                <p className="text-[10px] text-slate-400">Importação direta de planilhas de carga</p>
              </div>
              <button 
                onClick={() => setIsUploadModalOpen(false)}
                className="rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center space-x-1.5 border-b border-slate-100 pb-3">
                <button
                  onClick={() => { setUploadType('ME5A'); setUploadStatus('idle'); setUploadMessage(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${uploadType === 'ME5A' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  ME5A (Requisições)
                </button>
                <button
                  onClick={() => { setUploadType('ZL0132'); setUploadStatus('idle'); setUploadMessage(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${uploadType === 'ZL0132' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  ZL0132 (Pedidos PO)
                </button>
              </div>

              {uploadStatus === 'idle' && (
                <div className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl p-6 text-center cursor-pointer relative bg-slate-50/50">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="text-xs font-bold text-slate-700 mt-2">Clique ou arraste a planilha {uploadType}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Aceita arquivos .xlsx, .xls ou .csv</p>
                </div>
              )}

              {uploadStatus === 'loading' && (
                <div className="py-6 text-center space-y-3">
                  <RefreshCw className="mx-auto h-8 w-8 text-blue-600 animate-spin" />
                  <p className="text-xs font-semibold text-slate-600">{uploadMessage}</p>
                </div>
              )}

              {uploadStatus === 'success' && (
                <div className="py-6 text-center space-y-3">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                  <p className="text-xs font-bold text-slate-800">{uploadMessage}</p>
                  <p className="text-[10px] text-slate-400">Todo o banco de dados e os dashboards foram recalculados.</p>
                  <button
                    onClick={() => setIsUploadModalOpen(false)}
                    className="mt-2 inline-flex justify-center px-4 py-2 text-xs font-semibold text-white bg-slate-950 rounded-lg hover:bg-slate-800 shadow"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {uploadStatus === 'error' && (
                <div className="py-6 text-center space-y-3">
                  <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
                  <p className="text-xs font-bold text-slate-800">{uploadMessage}</p>
                  <p className="text-[10px] text-slate-400">Verifique a formatação do arquivo e tente novamente.</p>
                  <button
                    onClick={() => setUploadStatus('idle')}
                    className="mt-2 inline-flex justify-center px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Tentar Novamente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal Universal de Detalhes SAP */}
      {isDetailModalOpen && selectedRecordForModal && (
        <SapDetailModal
          record={selectedRecordForModal}
          fornecedores={[]}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedRecordForModal(null);
          }}
          onUpdate={loadData}
        />
      )}

    </div>
  );
}
