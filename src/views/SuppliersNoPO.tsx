/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PackageSearch, Search, FileSpreadsheet, AlertCircle, ChevronDown, ChevronRight,
  Phone, Mail, Tag, Calendar, AlertTriangle, RefreshCw, Filter, User, FileText,
  LayoutGrid, List, Table, Save, Clock, History, Check, Info, ArrowUpRight, Copy
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import {
  Profile, EnrichedSAPRecord, PedidoForn, ContatoFornecedor,
  FornecedorMaterialRow, SAPObsHistory, ItemStatus
} from '../types';
import SapDetailModal from '../components/SapDetailModal';

interface SuppliersNoPOProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface ItemNode {
  record: EnrichedSAPRecord;
  encontrado: boolean;
  fornecedores: FornecedorMaterialRow[];
}

interface RMGroup {
  rm: string;
  items: ItemNode[];
}

// Normaliza códigos de material para casar registros mesmo com diferença de zeros à
// esquerda.
const normalizeCode = (c: any): string => {
  const s = String(c ?? '').trim();
  const stripped = s.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : (s.length > 0 ? '0' : '');
};

const formatPreco = (v?: number | null): string =>
  v === undefined || v === null || isNaN(v)
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });



// Componente local de cópia rápida reutilizável
const ClipboardCopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md bg-slate-50 hover:bg-slate-150 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors relative group cursor-pointer inline-flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700"
      title={`Copiar ${label}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-650 dark:text-emerald-450" />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-850 dark:bg-slate-700 text-white text-[10px] py-1 px-1.5 rounded shadow-md whitespace-nowrap z-50">
            Copiado!
          </span>
        </>
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
};

export default function SuppliersNoPO({ user, onNavigate }: SuppliersNoPOProps) {
  const [loading, setLoading] = useState(true);
  const [rawRmGroups, setRawRmGroups] = useState<RMGroup[]>([]);
  const [expandedRMs, setExpandedRMs] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Modal SAP
  const [selectedRecordForModal, setSelectedRecordForModal] = useState<EnrichedSAPRecord | null>(null);

  // Modos de Visualização: 'cards' | 'compact' | 'table'
  const [viewMode, setViewMode] = useState<'cards' | 'compact' | 'table'>(() => {
    const saved = localStorage.getItem('sisten_suppliers_view_mode');
    return (saved === 'cards' || saved === 'compact' || saved === 'table') ? saved : 'cards';
  });

  // Salva preferência do modo de visualização
  const handleViewModeChange = (mode: 'cards' | 'compact' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('sisten_suppliers_view_mode', mode);
  };

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [buyerFilter, setBuyerFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [alertFilter, setAlertFilter] = useState('Todos');
  const [poFilter, setPoFilter] = useState<'Todos' | 'Sem PO'>('Todos');

  const rmGroups = useMemo(() => {
    if (poFilter === 'Sem PO') {
      return rawRmGroups.map(g => {
        const items = g.items.filter(it => it.record.status_requisicao === 'Sem PO');
        return { rm: g.rm, items };
      }).filter(g => g.items.length > 0);
    }
    return rawRmGroups;
  }, [rawRmGroups, poFilter]);

  // Estado para controle de edição inline de cada item
  const [obsInputState, setObsInputState] = useState<Record<string, string>>({});
  const [dateInputState, setDateInputState] = useState<Record<string, string>>({});
  const [statusInputState, setStatusInputState] = useState<Record<string, ItemStatus | ''>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
  const [historyOpenRi, setHistoryOpenRi] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<SAPObsHistory[]>([]);

  const buildSuppliersData = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const allRecords = localDb.getEnrichedSAPRequisicoes();
      const semPoRecords = allRecords;

      // Inicializa os inputs com os dados atuais salvos
      const initialObs: Record<string, string> = {};
      const initialDates: Record<string, string> = {};
      const initialStatus: Record<string, ItemStatus> = {};
      semPoRecords.forEach(r => {
        initialObs[r.ri] = r.obs_comprador || '';
        initialDates[r.ri] = r.data_entrega_prevista || '';
        initialStatus[r.ri] = r.item_status || 'Buscar Fornecedores';
      });
      setObsInputState(initialObs);
      setDateInputState(initialDates);
      setStatusInputState(initialStatus);

      // Monta conjunto de variantes de codigo para matching tolerante a zeros (apenas para itens Sem PO)
      const codeVariants = new Set<string>();
      semPoRecords.forEach(r => {
        if (r.status_requisicao !== 'Sem PO') return;
        const raw = (r.material_code || '').trim();
        if (!raw) return;
        codeVariants.add(raw);
        const stripped = raw.replace(/^0+/, '');
        if (stripped) {
          codeVariants.add(stripped);
          codeVariants.add(stripped.padStart(8, '0'));
        }
        codeVariants.add(raw.padStart(8, '0'));
      });

      const fornecedoresPorMaterial = new Map<string, FornecedorMaterialRow[]>();

      if (codeVariants.size > 0) {
        // Usa dados ja sincronizados no IndexedDB — sem round-trips HTTP
        const todosPedidos = localDb.getPedidosForn();
        const todosContatos = localDb.getContatosForn();

        // Monta mapa de contatos indexado por cod_vendor
        const contatosMap = new Map<string, ContatoFornecedor>();
        todosContatos.forEach(c => {
          if (c.cod_vendor) contatosMap.set(c.cod_vendor, c);
        });

        // Filtra pedidos relevantes para os materiais desta pagina
        const pedidosPorNorm = new Map<string, PedidoForn[]>();
        todosPedidos.forEach(p => {
          const normKey = normalizeCode(p.material);
          if (!normKey || !codeVariants.has(p.material) && !codeVariants.has(normKey)) return;
          const arr = pedidosPorNorm.get(normKey);
          if (arr) arr.push(p);
          else pedidosPorNorm.set(normKey, [p]);
        });

        pedidosPorNorm.forEach((pedidosMaterial, normKey) => {
          // Deduplica por fornecedor, mantendo o pedido mais recente
          const fornMap = new Map<string, PedidoForn>();
          pedidosMaterial.forEach(p => {
            const key = p.cnpj ? p.cnpj.trim() : (p.cod_forn || '');
            if (!key) return;
            const existing = fornMap.get(key);
            if (!existing) {
              fornMap.set(key, p);
            } else {
              const dateA = p.data_pedido ? new Date(p.data_pedido).getTime() : 0;
              const dateB = existing.data_pedido ? new Date(existing.data_pedido).getTime() : 0;
              if (dateA > dateB) fornMap.set(key, p);
            }
          });

          const list: FornecedorMaterialRow[] = Array.from(fornMap.values()).map(p => {
            const contato = p.cod_forn ? contatosMap.get(p.cod_forn) : undefined;
            return {
              cod_forn: p.cod_forn || '—',
              cnpj: p.cnpj || '—',
              fornecedor: p.fornecedor || contato?.fornecedor || '—',
              regiao_uf: p.regiao_uf || '—',
              telefone: contato?.telefone || '—',
              email: contato?.email || '—',
              classificacao: contato?.classificacao || '—',
              ultima_data: p.data_pedido || '—',
              preco_liquido: p.preco_liquido
            };
          });

          list.sort((a, b) => {
            const dateA = a.ultima_data !== '—' ? new Date(a.ultima_data).getTime() : 0;
            const dateB = b.ultima_data !== '—' ? new Date(b.ultima_data).getTime() : 0;
            return dateB - dateA;
          });

          fornecedoresPorMaterial.set(normKey, list);
        });
      }

      const rmMap = new Map<string, ItemNode[]>();
      const rmOrder: string[] = [];
      semPoRecords.forEach(record => {
        const isSemPo = record.status_requisicao === 'Sem PO';
        const fornecedores = isSemPo
          ? (fornecedoresPorMaterial.get(normalizeCode(record.material_code)) || [])
          : [];
        const node: ItemNode = { record, encontrado: fornecedores.length > 0, fornecedores };
        const rm = record.requisicao_de_compra || '—';
        if (!rmMap.has(rm)) { rmMap.set(rm, []); rmOrder.push(rm); }
        rmMap.get(rm)!.push(node);
      });

      const built: RMGroup[] = rmOrder.map(rm => {
        const items = rmMap.get(rm)!;
        items.sort((a, b) => (a.record.item_reqc || '').localeCompare(b.record.item_reqc || ''));
        return { rm, items };
      });

      setRawRmGroups(built);
    } catch (e: any) {
      console.error('Erro ao montar fornecedores (Sem PO):', e);
      setError('Falha ao montar dados. Tente atualizar novamente.');
      setRawRmGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    buildSuppliersData();
  }, [buildSuppliersData]);

  // Função para salvar observações, data prevista e status
  const handleSaveFields = (ri: string) => {
    setSaveStatus(prev => ({ ...prev, [ri]: 'saving' }));
    const comment = obsInputState[ri] || '';
    const date = dateInputState[ri] || '';
    const status = statusInputState[ri];

    // Atualiza base local de forma instantânea
    localDb.updateBuyerFields(ri, comment, date, status);

    setTimeout(() => {
      setSaveStatus(prev => ({ ...prev, [ri]: 'saved' }));
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [ri]: 'idle' }));
        // Recarrega os dados locais para atualizar a tela
        buildSuppliersData();
      }, 1500);
    }, 400);
  };

  // Carrega histórico de observações de uma RM/Item específica
  const handleViewHistory = (ri: string) => {
    const hist = localDb.getObsHistory(ri);
    setHistoryData(hist.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setHistoryOpenRi(ri);
  };

  // Opções de filtro
  const buyerOptions = useMemo(() => {
    const s = new Set<string>();
    rmGroups.forEach(g => g.items.forEach(it => { if (it.record.grupo_comprador) s.add(it.record.grupo_comprador); }));
    return Array.from(s).sort();
  }, [rmGroups]);

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    rmGroups.forEach(g => g.items.forEach(it => { if (it.record.status_atualizado) s.add(it.record.status_atualizado); }));
    return Array.from(s).sort();
  }, [rmGroups]);

  const alertOptions = useMemo(() => {
    const s = new Set<string>();
    rmGroups.forEach(g => g.items.forEach(it => { if (it.record.alerta) s.add(it.record.alerta); }));
    return Array.from(s).sort();
  }, [rmGroups]);

  // Filtragem
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result: RMGroup[] = [];
    rmGroups.forEach(g => {
      const rmMatchesSearch = q ? g.rm.toLowerCase().includes(q) : false;
      const items = g.items.filter(it => {
        const r = it.record;
        if (buyerFilter !== 'Todos' && r.grupo_comprador !== buyerFilter) return false;
        if (statusFilter !== 'Todos' && r.status_atualizado !== statusFilter) return false;
        if (alertFilter !== 'Todos' && r.alerta !== alertFilter) return false;
        if (q) {
          const inRecord =
            (r.material_code || '').toLowerCase().includes(q) ||
            (r.texto_breve || '').toLowerCase().includes(q) ||
            (r.requisitante_name || '').toLowerCase().includes(q);
          const inFornecedor = it.fornecedores.some(f =>
            f.fornecedor.toLowerCase().includes(q) ||
            f.cnpj.toLowerCase().includes(q) ||
            f.cod_forn.toLowerCase().includes(q)
          );
          if (!rmMatchesSearch && !inRecord && !inFornecedor) return false;
        }
        return true;
      });
      if (items.length > 0) result.push({ rm: g.rm, items });
    });
    return result;
  }, [rmGroups, searchQuery, buyerFilter, statusFilter, alertFilter]);

  // Lista plana de itens filtrados
  const filteredFlatItems = useMemo(() => {
    const list: { rm: string; item: ItemNode }[] = [];
    filteredGroups.forEach(g => {
      g.items.forEach(it => {
        list.push({ rm: g.rm, item: it });
      });
    });
    return list;
  }, [filteredGroups]);

  const totalItems = useMemo(() => rmGroups.reduce((s, g) => s + g.items.length, 0), [rmGroups]);
  const filteredItemCount = useMemo(() => filteredGroups.reduce((s, g) => s + g.items.length, 0), [filteredGroups]);

  const toggleRM = (rm: string) => setExpandedRMs(prev => ({ ...prev, [rm]: !prev[rm] }));
  const toggleItem = (ri: string) => setExpandedItems(prev => ({ ...prev, [ri]: !prev[ri] }));

  const allExpanded = filteredGroups.length > 0 && filteredGroups.every(g => expandedRMs[g.rm]);
  const toggleExpandAll = () => {
    const nextRMs: Record<string, boolean> = { ...expandedRMs };
    const nextItems: Record<string, boolean> = { ...expandedItems };
    const expand = !allExpanded;
    filteredGroups.forEach(g => {
      nextRMs[g.rm] = expand;
      g.items.forEach(it => { nextItems[it.record.ri] = expand; });
    });
    setExpandedRMs(nextRMs);
    setExpandedItems(nextItems);
  };

  const handleExportExcel = () => {
    if (filteredGroups.length === 0) return;
    const dataToExport: any[] = [];
    filteredGroups.forEach(g => {
      g.items.forEach(({ record: r, encontrado, fornecedores }) => {
        const base = {
          'RM / Requisição': r.requisicao_de_compra || '—',
          'Item': r.item_reqc || '—',
          'Código do Material': r.material_code || '—',
          'Descrição': r.texto_breve || '—',
          'Qtd.': r.qtd_requisicao ?? '—',
          'Un.': r.unidade_medida || '—',
          'Grupo Comprador': r.grupo_comprador || '—',
          'Natureza': r.natureza || '—',
          'Status': r.status_atualizado || '—',
          'Alerta': r.alerta || '—',
          'Dias em Aberto': r.dias_em_aberto ?? '—',
          'Status do Item': r.item_status || 'Buscar Fornecedores',
          'Observação Comprador': obsInputState[r.ri] || '',
          'Entrega Prevista': dateInputState[r.ri] || ''
        };
        if (!encontrado || fornecedores.length === 0) {
          dataToExport.push({
            ...base,
            'Cód. Fornecedor': '—', 'CNPJ': '—', 'Fornecedor': 'Material sem histórico de fornecedores',
            'UF': '—', 'Telefone': '—', 'E-mail': '—', 'Classificação': '—', 'Preço Líquido': '—', 'Última Compra': '—'
          });
        } else {
          fornecedores.forEach(f => {
            dataToExport.push({
              ...base,
              'Cód. Fornecedor': f.cod_forn, 'CNPJ': f.cnpj, 'Fornecedor': f.fornecedor,
              'UF': f.regiao_uf, 'Telefone': f.telefone, 'E-mail': f.email,
              'Classificação': f.classificacao,
              'Preço Líquido': f.preco_liquido !== undefined && f.preco_liquido !== null ? f.preco_liquido : '—',
              'Última Compra': f.ultima_data
            });
          });
        }
      });
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Itens Sem PO - Fornecedores');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `itens_sem_po_comprador_${timestamp}.xlsx`);
  };

  const alertLevel = (alerta: string): 'critico' | 'atencao' | 'monitorar' | 'ok' => {
    if (alerta.includes('⚠️') || alerta.toLowerCase().includes('crítico')) return 'critico';
    if (alerta.includes('⚡') || alerta.toLowerCase().includes('atraso')) return 'atencao';
    if (alerta.includes('📋') || alerta.toLowerCase().includes('pendente')) return 'monitorar';
    return 'ok';
  };

  const ALERT_STYLE: Record<string, { chip: string; border: string; bg: string; text: string }> = {
    critico: {
      chip: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-250 dark:border-rose-900/50',
      border: 'border-rose-500 dark:border-rose-800',
      bg: 'bg-rose-50/50 dark:bg-rose-950/10',
      text: 'text-rose-600 dark:text-rose-400'
    },
    atencao: {
      chip: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-250 dark:border-amber-900/50',
      border: 'border-amber-500 dark:border-amber-800',
      bg: 'bg-amber-50/50 dark:bg-amber-950/10',
      text: 'text-amber-600 dark:text-amber-400'
    },
    monitorar: {
      chip: 'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900/50',
      border: 'border-sky-500 dark:border-sky-850',
      bg: 'bg-sky-50/50 dark:bg-sky-950/10',
      text: 'text-sky-600 dark:text-sky-450'
    },
    ok: {
      chip: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-250',
      border: 'border-emerald-500 dark:border-emerald-850',
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/10',
      text: 'text-emerald-600 dark:text-emerald-450'
    },
  };

  const worstLevel = (items: ItemNode[]): 'critico' | 'atencao' | 'monitorar' | 'ok' => {
    const order = ['ok', 'monitorar', 'atencao', 'critico'];
    let worst = 'ok';
    items.forEach(it => {
      const lvl = alertLevel(it.record.alerta || '');
      if (order.indexOf(lvl) > order.indexOf(worst)) worst = lvl;
    });
    return worst as any;
  };

  const kpis = useMemo(() => {
    let rmsSet = new Set<string>();
    let itens = 0;
    let com = 0, sem = 0, criticos = 0;
    filteredGroups.forEach(g => g.items.forEach(it => {
      if (it.record.status_requisicao !== 'Sem PO') return;
      rmsSet.add(g.rm);
      itens++;
      if (it.encontrado) com++; else sem++;
      const lvl = alertLevel(it.record.alerta || '');
      if (lvl === 'critico' || lvl === 'atencao') criticos++;
    }));
    return { rms: rmsSet.size, itens, com, sem, criticos };
  }, [filteredGroups]);

  // Lista com as opções de status
  const itemStatusOptions: ItemStatus[] = [
    'Buscar Fornecedores',
    'Cotação enviada',
    'Análise de Cotações',
    'Pedido Enviado',
    'Aguardando Coleta',
    'Em rota de entrega',
    'Entregue',
    'Inativo',
    'Aguardando Solicitante'
  ];

  // Helper para renderizar dropdown com todas as opções de status disponíveis
  const renderStatusSelect = (ri: string, currentStatus: ItemStatus) => {
    const normalizedVal = statusInputState[ri] !== undefined ? statusInputState[ri] : (currentStatus || '');

    return (
      <select
        value={normalizedVal}
        onChange={(e) => setStatusInputState(prev => ({ ...prev, [ri]: e.target.value as ItemStatus | '' }))}
        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5 px-2.5 focus:border-emerald-600 focus:outline-none"
      >
        <option value="">Selecione</option>
        {itemStatusOptions.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
            <PackageSearch className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Central de Compras
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestão operacional avançada de requisições pendentes. Localize fornecedores históricos, registre promessas de entrega e gerencie os status operacionais na mesma tela.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro PO (Todos / Sem PO) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-1 mr-2 border border-slate-200/50 dark:border-slate-850">
            <button
              onClick={() => setPoFilter('Todos')}
              className={`px-3 py-1.5 rounded-md transition-all text-xs font-bold ${poFilter === 'Todos' ? 'bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-455 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Exibir todos os registros enriquecidos (com e sem PO)"
            >
              Todos
            </button>
            <button
              onClick={() => setPoFilter('Sem PO')}
              className={`px-3 py-1.5 rounded-md transition-all text-xs font-bold ${poFilter === 'Sem PO' ? 'bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-455 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Exibir apenas registros que não possuem documento de compra (pedido)"
            >
              Sem PO
            </button>
          </div>

          {/* View Toggles */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-1 mr-2 border border-slate-200/50 dark:border-slate-850">
            <button
              onClick={() => handleViewModeChange('cards')}
              className={`p-2 rounded-md transition-all flex items-center gap-1.5 text-xs font-bold ${viewMode === 'cards' ? 'bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Visualização em Cards"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => handleViewModeChange('compact')}
              className={`p-2 rounded-md transition-all flex items-center gap-1.5 text-xs font-bold ${viewMode === 'compact' ? 'bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Visualização em Lista Compacta"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Compacto</span>
            </button>
            <button
              onClick={() => handleViewModeChange('table')}
              className={`p-2 rounded-md transition-all flex items-center gap-1.5 text-xs font-bold ${viewMode === 'table' ? 'bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Visualização em Tabela Plana"
            >
              <Table className="h-4 w-4" />
              <span className="hidden sm:inline">Tabela</span>
            </button>
          </div>

          <button
            onClick={buildSuppliersData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {filteredItemCount > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm h-9 cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar Planilha
            </button>
          )}
        </div>
      </div>

      {/* KPIs Grid */}
      {!loading && !error && rmGroups.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-400 dark:bg-slate-700" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">RMs em aberto</span>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{kpis.rms}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 dark:bg-blue-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Itens Sem PO</span>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{kpis.itens}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 dark:bg-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Com Fornecedor</span>
            <p className="text-3xl font-black text-emerald-600 dark:text-emerald-500 mt-1">{kpis.com}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500 dark:bg-rose-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Sem Histórico</span>
            <p className="text-3xl font-black text-rose-600 dark:text-rose-500 mt-1">{kpis.sem}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden col-span-2 lg:col-span-1">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500 dark:bg-amber-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Críticos / Em Atraso</span>
            <p className="text-3xl font-black text-amber-600 dark:text-amber-500 mt-1">{kpis.criticos}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-xl border border-slate-250 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-col xl:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtre rapidamente por código de material, descrição, requisição RM ou fornecedor..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[130px]">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-450 pointer-events-none" />
              <select
                value={buyerFilter}
                onChange={(e) => setBuyerFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Comprador: Todos</option>
                {buyerOptions.map(g => <option key={g} value={g}>Grupo {g}</option>)}
              </select>
            </div>
            <div className="relative min-w-[130px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Status: Todos</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative min-w-[130px]">
              <AlertTriangle className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-450 pointer-events-none" />
              <select
                value={alertFilter}
                onChange={(e) => setAlertFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Alertas: Todos</option>
                {alertOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading & Empty States */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-20 border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 rounded-xl space-y-4">
          <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Carregando itens em aberto e buscando fornecedores...</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-955/15 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 text-rose-550 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && rmGroups.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 rounded-xl text-center">
          <Check className="h-12 w-12 text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-full mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Nenhum item pendente (Sem PO)!</h3>
          <p className="text-sm text-slate-555 dark:text-slate-455 mt-1 max-w-md">
            Parabéns! Todos os itens das requisições ME5A carregadas no sistema já foram devidamente processados ou vinculados a pedidos.
          </p>
        </div>
      )}

      {/* Content Layouts */}
      {!loading && !error && rmGroups.length > 0 && (
        <div className="space-y-4">
          {/* Summary / Expand Toggles */}
          <div className="flex items-center justify-between text-xs text-slate-550 dark:text-slate-455 px-1 font-bold">
            <span>Localizados {filteredItemCount} item(ns) em aberto de {totalItems} totais</span>
            {viewMode === 'compact' && filteredGroups.length > 0 && (
              <button onClick={toggleExpandAll} className="text-emerald-650 hover:text-emerald-700 dark:text-emerald-450 dark:hover:text-emerald-350 cursor-pointer">
                {allExpanded ? 'Colapsar todos' : 'Expandir todos'}
              </button>
            )}
          </div>

          {filteredGroups.length === 0 && (
            <div className="flex items-center gap-3 p-6 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/50 dark:bg-amber-955/15 text-amber-800 dark:text-amber-300 text-sm font-semibold">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              Nenhum registro coincide com os critérios e filtros aplicados atualmente.
            </div>
          )}

          {/* VIEW: CARDS (Default) */}
          {viewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFlatItems.map(({ rm, item: { record: r, encontrado, fornecedores } }) => {
                const ilvl = alertLevel(r.alerta || '');
                const alertStyle = ALERT_STYLE[ilvl];
                const itemSaveStatus = saveStatus[r.ri] || 'idle';
                return (
                  <div key={r.ri} className={`border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow relative ${encontrado ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-rose-500'}`}>
                    {/* Card Top */}
                    <div className="p-4 space-y-3 flex-1">
                      {/* Meta header */}
                      <div className="flex items-center justify-between flex-wrap gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-500">RM {rm}</span>
                          <span className="text-[10px] text-slate-350">•</span>
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Item {r.item_reqc}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedRecordForModal(r)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-450 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-450 cursor-pointer"
                            title="Ver detalhes SAP"
                          >
                            <Info className="h-4.5 w-4.5" />
                          </button>
                          {r.alerta && (
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wide uppercase ${alertStyle.chip}`}>
                              {r.alerta}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & Desc (Clickable to modal) */}
                      <div className="cursor-pointer group" onClick={() => setSelectedRecordForModal(r)}>
                        <h4 className="text-[13px] font-mono font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-450 group-hover:underline leading-tight flex items-center gap-1">
                          {r.material_code || '—'}
                          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h4>
                        <p className="text-sm text-slate-700 dark:text-slate-250 mt-1 font-semibold leading-relaxed line-clamp-2">
                          {r.texto_breve || 'Descrição não cadastrada'}
                        </p>
                      </div>

                      {/* Technical Specs Tags */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-450 dark:text-slate-500 font-bold bg-slate-55 dark:bg-slate-955 p-2 rounded-lg border border-slate-150 dark:border-slate-900">
                        <span>Qtd: {r.qtd_requisicao} {r.unidade_medida}</span>
                        <span>•</span>
                        <span>Comprador: Grupo {r.grupo_comprador || '—'}</span>
                        <span>•</span>
                        <span>Natureza: {r.natureza}</span>
                        <span>•</span>
                        <span className={r.dias_em_aberto > 15 ? 'text-amber-600 dark:text-amber-500' : ''}>
                          Aberto há {r.dias_em_aberto}d
                        </span>
                      </div>

                      {/* Fornecedores Históricos */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                          Fornecedores com Histórico ({fornecedores.length})
                        </span>
                        
                        {!encontrado ? (
                          <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-rose-150 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-955/5 text-rose-800 dark:text-rose-455 text-xs">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                            <span>Sem histórico de compras anteriores para este material.</span>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {fornecedores.map((f, fIdx) => (
                              <div key={fIdx} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-955/20 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 text-left">
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-extrabold text-slate-850 dark:text-slate-200 break-words" title={f.fornecedor}>
                                      {f.fornecedor}
                                    </span>
                                    {f.regiao_uf && f.regiao_uf !== '—' && (
                                      <span className="px-1.5 py-0.3 bg-slate-100 dark:bg-slate-800 text-[9px] font-black rounded text-slate-500 dark:text-slate-400">
                                        {f.regiao_uf}
                                      </span>
                                    )}
                                  </div>
                                  {f.nome_fantasia && f.nome_fantasia !== '—' && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                      Fantasia: {f.nome_fantasia}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-slate-450 dark:text-slate-500 font-bold">
                                    Cód: {f.cod_forn} | CNPJ: {f.cnpj || '—'}
                                  </p>
                                  
                                  {/* Detalhes de preço e data */}
                                  <div className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400 font-bold bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 w-fit shadow-3xs">
                                    <span>Preço: <span className="text-emerald-600 dark:text-emerald-450">{formatPreco(f.preco_liquido)}</span></span>
                                    <span className="text-slate-200 dark:text-slate-800">|</span>
                                    <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-455">
                                      <Calendar className="h-3 w-3" />
                                      Compra: {f.ultima_data !== '—' ? (isNaN(Date.parse(f.ultima_data)) ? f.ultima_data : new Date(f.ultima_data).toLocaleDateString('pt-BR')) : '—'}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1.5 shrink-0 text-[11px] items-start sm:items-end">
                                  {f.telefone !== '—' && f.telefone.split(';').map(t => t.trim()).filter(Boolean).map((singleTel, telIdx) => (
                                    <div key={telIdx} className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-3xs">
                                      <Phone className="h-3 w-3 text-slate-450" />
                                      <a
                                        href={`tel:${singleTel}`}
                                        className="font-mono text-slate-705 dark:text-slate-305 hover:underline hover:text-emerald-650 cursor-pointer font-bold"
                                        title={`Ligar: ${singleTel}`}
                                      >
                                        {singleTel}
                                      </a>
                                      <ClipboardCopyButton text={singleTel} label="telefone" />
                                    </div>
                                  ))}
                                  {f.email !== '—' && (
                                    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-3xs">
                                      <Mail className="h-3 w-3 text-slate-455" />
                                      <a
                                        href={`mailto:${f.email}`}
                                        className="text-slate-705 dark:text-slate-305 hover:underline hover:text-blue-655 break-all cursor-pointer font-bold"
                                        title={`Email: ${f.email}`}
                                      >
                                        {f.email}
                                      </a>
                                      <ClipboardCopyButton text={f.email} label="e-mail" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Actions (Painel SAP Inline - Renomeado para Atualizar Status) */}
                    <div className="border-t border-slate-150 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider block">
                            Status do Item
                          </label>
                          {renderStatusSelect(r.ri, r.item_status || 'Buscar Fornecedores')}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider block">
                            Previsão de Entrega
                          </label>
                          <input
                            type="date"
                            value={dateInputState[r.ri] || ''}
                            onChange={(e) => setDateInputState(prev => ({ ...prev, [r.ri]: e.target.value }))}
                            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5 px-2.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider block">
                              Observações
                            </label>
                            <button
                              onClick={() => handleViewHistory(r.ri)}
                              className="text-[9px] font-bold text-slate-400 hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400 flex items-center gap-0.5 cursor-pointer"
                              title="Histórico de alterações"
                            >
                              <History className="h-3 w-3" /> Histórico
                            </button>
                          </div>
                          <input
                            type="text"
                            value={obsInputState[r.ri] || ''}
                            onChange={(e) => setObsInputState(prev => ({ ...prev, [r.ri]: e.target.value }))}
                            placeholder="Notas de compra..."
                            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5 px-2.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                          {r.item_status_updated_at 
                            ? `Alt: ${new Date(r.item_status_updated_at).toLocaleDateString('pt-BR')} por ${r.item_status_updated_by || 'Sistema'}`
                            : r.obs_updated_at
                            ? `Alt: ${new Date(r.obs_updated_at).toLocaleDateString('pt-BR')} por ${r.obs_updated_by || 'Sistema'}`
                            : 'Ainda não editado'}
                        </span>
                        
                        <button
                          onClick={() => handleSaveFields(r.ri)}
                          disabled={itemSaveStatus === 'saving'}
                          type="button"
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                            itemSaveStatus === 'saved'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {itemSaveStatus === 'saving' && <RefreshCw className="h-3 w-3 animate-spin" />}
                          {itemSaveStatus === 'saved' && <Check className="h-3.5 w-3.5" />}
                          {itemSaveStatus === 'idle' && <Save className="h-3.5 w-3.5" />}
                          <span>
                            {itemSaveStatus === 'saving' ? 'Salvando...' : itemSaveStatus === 'saved' ? 'Salvo!' : 'Salvar'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW: COMPACT (Interactive list row click) */}
          {viewMode === 'compact' && (
            <div className="space-y-2">
              {filteredGroups.map(g => {
                const rmExpanded = !!expandedRMs[g.rm];
                const lvl = worstLevel(g.items);
                const rmBar = { critico: 'border-l-rose-500', atencao: 'border-l-amber-500', monitorar: 'border-l-sky-500', ok: 'border-l-emerald-500' }[lvl];
                return (
                  <div key={g.rm} className={`border border-slate-200 dark:border-slate-800 border-l-4 ${rmBar} rounded-xl shadow-xs overflow-hidden bg-white dark:bg-slate-900`}>
                    {/* RM header */}
                    <div
                      onClick={() => toggleRM(g.rm)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
                        <div>
                          <span className="font-mono font-black text-sm text-slate-800 dark:text-slate-100">RM {g.rm}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                            ({g.items.length} {g.items.length === 1 ? 'item' : 'itens'} · {g.items.filter(it => it.encontrado).length} com histórico)
                          </span>
                        </div>
                      </div>
                      <div>
                        {rmExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      </div>
                    </div>

                    {/* Items row */}
                    {rmExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-850 divide-y divide-slate-100 dark:divide-slate-850">
                        {g.items.map(({ record: r, encontrado, fornecedores }) => {
                          const itemExpanded = !!expandedItems[r.ri];
                          const ilvl = alertLevel(r.alerta || '');
                          const itemSaveStatus = saveStatus[r.ri] || 'idle';
                          return (
                            <div key={r.ri} className="bg-white dark:bg-slate-900">
                              <div
                                onClick={() => toggleItem(r.ri)}
                                className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer transition-colors ${itemExpanded ? 'bg-slate-50/70 dark:bg-slate-850/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-850/10'}`}
                              >
                                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${encontrado ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-205 hover:underline" onClick={(e) => { e.stopPropagation(); setSelectedRecordForModal(r); }}>
                                        Item {r.item_reqc} • {r.material_code}
                                      </span>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedRecordForModal(r); }}
                                        className="p-0.5 hover:bg-slate-150 dark:hover:bg-slate-800 rounded text-slate-400"
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                      </button>
                                      {r.alerta && (
                                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${ALERT_STYLE[ilvl].chip}`}>
                                          {r.alerta}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-300 font-bold truncate max-w-[500px] mt-0.5">
                                      {r.texto_breve}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end text-[11px] text-slate-450 dark:text-slate-500 font-semibold">
                                  <span>{r.qtd_requisicao} {r.unidade_medida}</span>
                                  <span>Status: <span className="font-bold text-slate-700 dark:text-slate-350">{r.item_status || 'Buscar Fornecedores'}</span></span>
                                  <span>{r.dias_em_aberto}d aberto</span>
                                  <div className="flex items-center gap-2">
                                    {encontrado ? (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold">
                                        {fornecedores.length} forn
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 font-bold uppercase tracking-wide text-[9px]">
                                        Sem hist.
                                      </span>
                                    )}
                                    {itemExpanded ? <ChevronDown className="h-4.5 w-4.5 text-slate-400" /> : <ChevronRight className="h-4.5 w-4.5 text-slate-400" />}
                                  </div>
                                </div>
                              </div>

                              {/* Dropdown panel for editing obs / viewing suppliers */}
                              {itemExpanded && (
                                <div className="px-4 pb-4 pt-1 bg-slate-50/50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-850">
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2 pl-4 border-l-2 border-emerald-400/80">
                                    {/* Fornecedores */}
                                    <div className="space-y-2">
                                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500">
                                        Histórico de Fornecedores do Item
                                      </h5>
                                      {!encontrado ? (
                                        <div className="p-3 rounded-lg border border-dashed border-rose-150 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-955/5 text-rose-800 dark:text-rose-455 text-xs">
                                          Nenhum fornecedor localizado anteriormente.
                                        </div>
                                      ) : (
                                        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                                          {fornecedores.map((f, idx) => (
                                            <div key={idx} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-955/20 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all flex flex-col md:flex-row md:items-center justify-between text-xs gap-3 text-left">
                                              <div className="min-w-0 flex-1 space-y-1.5">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-extrabold text-slate-850 dark:text-slate-200 break-words" title={f.fornecedor}>
                                                    {f.fornecedor}
                                                  </span>
                                                  {f.regiao_uf && f.regiao_uf !== '—' && (
                                                    <span className="px-1.5 py-0.3 bg-slate-100 dark:bg-slate-800 text-[9px] font-black rounded text-slate-500 dark:text-slate-400">
                                                      {f.regiao_uf}
                                                    </span>
                                                  )}
                                                </div>
                                                {f.nome_fantasia && f.nome_fantasia !== '—' && (
                                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                                    Fantasia: {f.nome_fantasia}
                                                  </p>
                                                )}
                                                <p className="text-[10px] text-slate-450 dark:text-slate-500 font-bold">
                                                  Cód: {f.cod_forn} | CNPJ: {f.cnpj || '—'}
                                                </p>
                                                
                                                {/* Preço e última compra */}
                                                <div className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400 font-bold bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 w-fit shadow-3xs">
                                                  <span>Preço: <span className="text-emerald-600 dark:text-emerald-455">{formatPreco(f.preco_liquido)}</span></span>
                                                  <span className="text-slate-200 dark:text-slate-800">|</span>
                                                  <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-455">
                                                    <Calendar className="h-3 w-3" />
                                                    Compra: {f.ultima_data !== '—' ? (isNaN(Date.parse(f.ultima_data)) ? f.ultima_data : new Date(f.ultima_data).toLocaleDateString('pt-BR')) : '—'}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex flex-col gap-1.5 shrink-0 text-[11px] items-start md:items-end">
                                                {f.telefone !== '—' && f.telefone.split(';').map(t => t.trim()).filter(Boolean).map((singleTel, telIdx) => (
                                                  <div key={telIdx} className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-3xs">
                                                    <Phone className="h-3 w-3 text-slate-455" />
                                                    <a
                                                      href={`tel:${singleTel}`}
                                                      className="font-mono text-slate-705 dark:text-slate-305 hover:underline hover:text-emerald-650 cursor-pointer font-bold"
                                                      title={`Ligar: ${singleTel}`}
                                                    >
                                                      {singleTel}
                                                    </a>
                                                    <ClipboardCopyButton text={singleTel} label="telefone" />
                                                  </div>
                                                ))}
                                                {f.email !== '—' && (
                                                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-3xs">
                                                    <Mail className="h-3 w-3 text-slate-455" />
                                                    <a
                                                      href={`mailto:${f.email}`}
                                                      className="text-slate-705 dark:text-slate-305 hover:underline hover:text-blue-650 break-all cursor-pointer font-bold"
                                                      title={`Email: ${f.email}`}
                                                    >
                                                      {f.email}
                                                    </a>
                                                    <ClipboardCopyButton text={f.email} label="e-mail" />
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Inputs SAP Inline */}
                                    <div className="space-y-3 bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-150 dark:border-slate-800 shadow-2xs">
                                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                        <h5 className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                                          Atualizar Status
                                        </h5>
                                        <button
                                          onClick={() => handleViewHistory(r.ri)}
                                          className="text-[10px] font-bold text-slate-400 hover:text-emerald-500 flex items-center gap-0.5 cursor-pointer"
                                        >
                                          <History className="h-3 w-3" /> Histórico
                                        </button>
                                      </div>
                                      
                                      <div className="space-y-2">
                                        <div className="space-y-1">
                                          <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 block">
                                            Status do Item
                                          </label>
                                          {renderStatusSelect(r.ri, r.item_status || 'Buscar Fornecedores')}
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 block">
                                            Promessa de Entrega
                                          </label>
                                          <input
                                            type="date"
                                            value={dateInputState[r.ri] || ''}
                                            onChange={(e) => setDateInputState(prev => ({ ...prev, [r.ri]: e.target.value }))}
                                            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5 px-2.5 focus:border-emerald-600 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 block">
                                            Observação
                                          </label>
                                          <textarea
                                            value={obsInputState[r.ri] || ''}
                                            onChange={(e) => setObsInputState(prev => ({ ...prev, [r.ri]: e.target.value }))}
                                            rows={2}
                                            placeholder="Descreva o status da compra..."
                                            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5 px-2.5 focus:border-emerald-600 focus:outline-none"
                                          />
                                        </div>
                                      </div>

                                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold">
                                          {r.item_status_updated_at 
                                            ? `Atualizado por ${r.item_status_updated_by || 'Comprador'}` 
                                            : 'Sem registro de edição'}
                                        </span>
                                        <button
                                          onClick={() => handleSaveFields(r.ri)}
                                          disabled={itemSaveStatus === 'saving'}
                                          type="button"
                                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer ${
                                            itemSaveStatus === 'saved'
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200'
                                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                          }`}
                                        >
                                          {itemSaveStatus === 'saving' && <RefreshCw className="h-3 w-3 animate-spin" />}
                                          {itemSaveStatus === 'saved' && <Check className="h-3.5 w-3.5" />}
                                          {itemSaveStatus === 'idle' && <Save className="h-3.5 w-3.5" />}
                                          <span>
                                            {itemSaveStatus === 'saving' ? 'Salvando...' : itemSaveStatus === 'saved' ? 'Salvo!' : 'Salvar'}
                                          </span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW: TABLE (Flat spreadsheet mode) */}
          {viewMode === 'table' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800 text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-3">RM / Item</th>
                    <th className="py-3 px-3">Material</th>
                    <th className="py-3 px-3">Descrição</th>
                    <th className="py-3 px-3">Qtd / Un</th>
                    <th className="py-3 px-3">Histórico Fornecedores</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Promessa Entrega</th>
                    <th className="py-3 px-3">Observação</th>
                    <th className="py-3 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-705 dark:text-slate-350">
                  {filteredFlatItems.map(({ rm, item: { record: r, encontrado, fornecedores } }) => {
                    const itemSaveStatus = saveStatus[r.ri] || 'idle';
                    return (
                      <tr key={r.ri} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 align-top transition-colors">
                        {/* RM / Item */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-mono font-bold block text-slate-850 dark:text-slate-100">RM {rm}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">Item {r.item_reqc}</span>
                        </td>

                        {/* Material Code (Clickable) */}
                        <td className="py-3 px-3 font-mono font-semibold whitespace-nowrap">
                          <button
                            onClick={() => setSelectedRecordForModal(r)}
                            className="hover:underline hover:text-emerald-600 dark:hover:text-emerald-450 cursor-pointer flex items-center gap-1 focus:outline-none"
                          >
                            {r.material_code}
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </td>

                        {/* Description (Clickable) */}
                        <td className="py-3 px-3 max-w-[280px] break-words font-medium text-slate-800 dark:text-slate-200">
                          <button
                            onClick={() => setSelectedRecordForModal(r)}
                            className="text-left font-bold hover:underline hover:text-emerald-600 dark:hover:text-emerald-450 focus:outline-none"
                          >
                            {r.texto_breve}
                          </button>
                          <div className="flex gap-2 items-center mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-semibold flex-wrap">
                            <span>Aberto {r.dias_em_aberto}d</span>
                            <span>•</span>
                            <span>G: {r.grupo_comprador}</span>
                            {r.alerta && (
                              <>
                                <span>•</span>
                                <span className="text-amber-600 dark:text-amber-500">{r.alerta}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Qtd */}
                        <td className="py-3 px-3 whitespace-nowrap font-bold">
                          {r.qtd_requisicao} {r.unidade_medida}
                        </td>

                        {/* Suppliers History */}
                        <td className="py-3 px-3 max-w-[320px]">
                          {!encontrado ? (
                            <span className="text-rose-500 font-bold uppercase tracking-wider text-[9px] bg-rose-50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded">
                              Sem fornecedor
                            </span>
                          ) : (
                            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                              {fornecedores.slice(0, 3).map((f, idx) => (
                                <div key={idx} className="p-2 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-[10px] space-y-1 text-left">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-slate-800 dark:text-slate-200 break-words" title={f.fornecedor}>
                                      {f.fornecedor}
                                      {f.nome_fantasia && f.nome_fantasia !== '—' && (
                                        <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-medium">
                                          Fantasia: {f.nome_fantasia}
                                        </span>
                                      )}
                                    </span>
                                    <span className="px-1 py-0.2 bg-slate-100 dark:bg-slate-700 rounded text-[9px] font-semibold text-slate-500">
                                      {f.regiao_uf}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold">
                                    <span>Preço: <span className="text-emerald-600 dark:text-emerald-450">{formatPreco(f.preco_liquido)}</span></span>
                                    <span className="flex items-center gap-0.5">
                                      <Calendar className="h-2.5 w-2.5 text-slate-400" />
                                      {f.ultima_data !== '—' ? (isNaN(Date.parse(f.ultima_data)) ? f.ultima_data : new Date(f.ultima_data).toLocaleDateString('pt-BR')) : '—'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-150/50 dark:border-slate-750">
                                    {f.telefone !== '—' && f.telefone.split(';').map(t => t.trim()).filter(Boolean).map((singleTel, telIdx) => (
                                      <div key={telIdx} className="flex items-center gap-0.5 bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-150 dark:border-slate-750 text-[9px]">
                                        <a href={`tel:${singleTel}`} className="text-emerald-600 hover:underline font-bold font-mono" title={`Ligar: ${singleTel}`}>
                                          {singleTel}
                                        </a>
                                        <ClipboardCopyButton text={singleTel} label="telefone" />
                                      </div>
                                    ))}
                                    {f.email !== '—' && (
                                      <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-150 dark:border-slate-750 text-[9px]">
                                        <a href={`mailto:${f.email}`} className="text-blue-600 hover:underline font-bold break-all" title={f.email}>
                                          {f.email}
                                        </a>
                                        <ClipboardCopyButton text={f.email} label="e-mail" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {fornecedores.length > 3 && (
                                <span className="text-[10px] text-slate-400 block text-right font-bold italic">
                                  + {fornecedores.length - 3} outros
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Status Select */}
                        <td className="py-2.5 px-3 min-w-[140px]">
                          {renderStatusSelect(r.ri, r.item_status || 'Buscar Fornecedores')}
                        </td>

                        {/* Delivery Date */}
                        <td className="py-2.5 px-3">
                          <input
                            type="date"
                            value={dateInputState[r.ri] || ''}
                            onChange={(e) => setDateInputState(prev => ({ ...prev, [r.ri]: e.target.value }))}
                            className="text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1 px-1.5 focus:border-emerald-600 focus:outline-none"
                          />
                        </td>

                        {/* Buyer Observation */}
                        <td className="py-2.5 px-3">
                          <div className="relative">
                            <input
                              type="text"
                              value={obsInputState[r.ri] || ''}
                              onChange={(e) => setObsInputState(prev => ({ ...prev, [r.ri]: e.target.value }))}
                              placeholder="Notas..."
                              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1 pr-7 pl-2 focus:border-emerald-600 focus:outline-none"
                            />
                            <button
                              onClick={() => handleViewHistory(r.ri)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              title="Ver histórico de alterações"
                            >
                              <History className="h-3 w-3" />
                            </button>
                          </div>
                        </td>

                        {/* Save Action */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleSaveFields(r.ri)}
                            disabled={itemSaveStatus === 'saving'}
                            type="button"
                            className={`p-1.5 rounded-lg border transition-all inline-flex items-center justify-center cursor-pointer ${
                              itemSaveStatus === 'saved'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                            }`}
                            title="Salvar"
                          >
                            {itemSaveStatus === 'saving' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                            {itemSaveStatus === 'saved' && <Check className="h-3.5 w-3.5" />}
                            {itemSaveStatus === 'idle' && <Save className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Observações Históricas Modal / Dialog Drawer */}
      {historyOpenRi && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in ignore-drawer-close">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
                <h3 className="font-bold text-slate-850 dark:text-slate-50 text-sm">
                  Histórico de Alterações SAP
                </h3>
              </div>
              <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-350 px-2 py-0.5 rounded">
                RI: {historyOpenRi}
              </span>
            </div>

            <div className="p-5 max-h-[350px] overflow-y-auto space-y-4">
              {historyData.length === 0 ? (
                <div className="py-8 text-center text-slate-450 dark:text-slate-550 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <Info className="h-7 w-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs">Nenhuma nota ou promessa de entrega editada anteriormente.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {historyData.map((h, idx) => (
                    <div key={h.id || idx} className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-850">
                      <div className="absolute -left-[5.5px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-2xs" />
                      
                      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-semibold mb-1">
                        <span>{h.user_name || 'Comprador'}</span>
                        <span>{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-955 border border-slate-200/80 dark:border-slate-850/60 rounded-xl p-3 text-xs space-y-2">
                        {h.obs_comprador ? (
                          <p className="text-slate-750 dark:text-slate-200 leading-normal font-medium whitespace-pre-wrap">{h.obs_comprador}</p>
                        ) : (
                          <p className="text-slate-400 dark:text-slate-500 italic">Sem anotação de texto</p>
                        )}
                        {h.data_entrega_prevista && (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-450 rounded text-[10px] font-bold border border-blue-100/60 dark:border-blue-900/30">
                            <Calendar className="h-3 w-3" />
                            <span>Promessa: {new Date(h.data_entrega_prevista).toLocaleDateString('pt-BR')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setHistoryOpenRi(null)}
                className="px-4 py-2 bg-slate-850 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-750 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Fechar janela
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal de Detalhes SAP */}
      {selectedRecordForModal && (
        <SapDetailModal
          record={selectedRecordForModal}
          fornecedores={
            rmGroups
              .flatMap(g => g.items)
              .find(it => it.record.ri === selectedRecordForModal.ri)?.fornecedores || []
          }
          onClose={() => setSelectedRecordForModal(null)}
          onUpdate={buildSuppliersData}
        />
      )}
    </div>
  );
}


