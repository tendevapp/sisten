/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, ClipboardCopy, Radio, Plus, Trash2, Calendar, 
  AlertTriangle, Save, CheckCircle, HelpCircle, Loader2, Info, Search
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import { Profile, RequestItem, RequestType, RequestStatus, Material } from '../types';

interface NewRequestProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface PurchaseItemState {
  description: string;
  sap_code: string;
  quantity: number;
  unit: string;
  brand: string;
  is_similar_allowed: boolean;
  suggested_supplier: string;
  estimated_value: number;
}

export default function NewRequest({ user, onNavigate }: NewRequestProps) {
  const [activeTab, setActiveTab] = useState<RequestType>('compra');
  const [sectorId, setSectorId] = useState('');
  const [compradorId, setCompradorId] = useState('');
  const [tipoCompra, setTipoCompra] = useState<'Estoque' | 'Direta' | 'Serviço'>('Estoque');
  const [criticality, setCriticality] = useState(3);
  const [dataNecessidade, setDataNecessidade] = useState('');
  const [justificativa, setJustificativa] = useState('');
  
  // Repeated items for Purchase
  const [items, setItems] = useState<PurchaseItemState[]>([
    { description: '', sap_code: '', quantity: 1, unit: 'UN', brand: '', is_similar_allowed: true, suggested_supplier: '', estimated_value: 0 }
  ]);

  // SAP catalog autocomplete states — busca direto no Supabase (catálogo tem
  // 180k+ linhas, não cabe em memória/localStorage), com debounce por item ativo.
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [activeSearchResults, setActiveSearchResults] = useState<Material[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const dropdownRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const clickedInsideDropdown = dropdownRefs.current.some(
        ref => ref && ref.contains(event.target as Node)
      );
      if (!clickedInsideDropdown) {
        setActiveSearchIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeItemForSearch = activeSearchIndex !== null ? items[activeSearchIndex] : null;
  const activeDescriptionTerm = activeItemForSearch?.description.trim() || '';
  const activeSapCodeTerm = activeItemForSearch?.sap_code.trim() || '';

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (activeSearchIndex === null) {
      setActiveSearchResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      const thisRequestId = ++searchRequestIdRef.current;
      setIsSearchingCatalog(true);
      try {
        let query = supabase.from('materials').select('*').eq('is_active', true);
        if (activeSapCodeTerm) query = query.ilike('material_code', `%${activeSapCodeTerm}%`);
        if (activeDescriptionTerm) query = query.ilike('description', `%${activeDescriptionTerm}%`);
        const limit = activeSapCodeTerm || activeDescriptionTerm ? 8 : 5;
        const { data, error } = await query.order('material_code', { ascending: true }).limit(limit);
        if (error) throw error;
        if (searchRequestIdRef.current === thisRequestId) {
          setActiveSearchResults(data || []);
        }
      } catch (err) {
        console.error('Erro ao buscar materiais no catálogo SAP:', err);
        if (searchRequestIdRef.current === thisRequestId) setActiveSearchResults([]);
      } finally {
        if (searchRequestIdRef.current === thisRequestId) setIsSearchingCatalog(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [activeSearchIndex, activeDescriptionTerm, activeSapCodeTerm]);

  // Specific for SAP registration
  const [registrationType, setRegistrationType] = useState<'Item' | 'Fornecedor'>('Item');
  const [sapRegName, setSapRegName] = useState('');
  const [sapRegSpecs, setSapRegSpecs] = useState('');
  const [sapRegBrand, setSapRegBrand] = useState('');
  const [sapRegVendorInfo, setSapRegVendorInfo] = useState(''); // CNPJ / Site or vendor suggestion

  // Specific for Helpdesk Chamados
  const [chamadoSectorId, setChamadoSectorId] = useState(''); // Setor solicitante — sem pré-seleção
  const [helpdeskSectorId, setHelpdeskSectorId] = useState(''); // E.g., '9' for TI, '3' for Facilities
  const [helpdeskCategory, setHelpdeskCategory] = useState('');
  const [helpdeskLocal, setHelpdeskLocal] = useState('');

  // States
  const [uploadProgress, setUploadProgress] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');

  const sectors = localDb.getSectors();

  // Lista de compradores responsáveis vem da tabela compradores (grupo_compras/nome_comprador),
  // resolvendo o usuário do sistema vinculado via buyer_groups para manter o comprador_id
  // apontando para um profile válido (usado nos painéis "Minhas Solicitações" do comprador).
  const [compradoresList, setCompradoresList] = useState<{ grupo_compras: string; nome_comprador: string }[]>([]);
  useEffect(() => {
    supabase.from('compradores').select('*').order('nome_comprador').then(({ data, error }) => {
      if (error) {
        console.error('Erro ao buscar compradores:', error);
        return;
      }
      setCompradoresList(data || []);
    });
  }, []);

  const buyerGroups = localDb.getBuyerGroups();
  const buyerOptions = compradoresList.map(c => {
    const bg = buyerGroups.find(b => b.group_code === c.grupo_compras);
    return { code: c.grupo_compras, label: c.nome_comprador, profileId: bg?.user_id };
  });

  // Load draft if exists
  useEffect(() => {
    const draftKey = `sisten_draft_${user.id}`;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.activeTab) setActiveTab(parsed.activeTab);
        if (parsed.sectorId) setSectorId(parsed.sectorId);
        if (parsed.compradorId) setCompradorId(parsed.compradorId);
        if (parsed.tipoCompra) setTipoCompra(parsed.tipoCompra);
        if (parsed.criticality) setCriticality(parsed.criticality);
        if (parsed.dataNecessidade) setDataNecessidade(parsed.dataNecessidade);
        if (parsed.justificativa) setJustificativa(parsed.justificativa);
        if (parsed.items) setItems(parsed.items);
        if (parsed.registrationType) setRegistrationType(parsed.registrationType);
        if (parsed.sapRegName) setSapRegName(parsed.sapRegName);
        if (parsed.sapRegSpecs) setSapRegSpecs(parsed.sapRegSpecs);
        if (parsed.sapRegBrand) setSapRegBrand(parsed.sapRegBrand);
        if (parsed.sapRegVendorInfo) setSapRegVendorInfo(parsed.sapRegVendorInfo);
        if (parsed.chamadoSectorId) setChamadoSectorId(parsed.chamadoSectorId);
        if (parsed.helpdeskSectorId) setHelpdeskSectorId(parsed.helpdeskSectorId);
        if (parsed.helpdeskCategory) setHelpdeskCategory(parsed.helpdeskCategory);
        if (parsed.helpdeskLocal) setHelpdeskLocal(parsed.helpdeskLocal);
      } catch (err) {
        console.error('Error loading draft', err);
      }
    }

    // Set a default helpdesk sector if empty
    const supportSectors = sectors.filter(s => s.helpdesk_enabled);
    if (supportSectors.length > 0) {
      setHelpdeskSectorId(supportSectors[0].id);
    }
  }, [user]);

  // Draft autosave interval (every 30 seconds as requested)
  useEffect(() => {
    const interval = setInterval(() => {
      saveDraft();
    }, 30000);

    return () => clearInterval(interval);
  }, [
    activeTab, sectorId, compradorId, tipoCompra, criticality, dataNecessidade, justificativa,
    items, registrationType, sapRegName, sapRegSpecs, sapRegBrand, sapRegVendorInfo,
    chamadoSectorId, helpdeskSectorId, helpdeskCategory, helpdeskLocal
  ]);

  const saveDraft = () => {
    setAutosaveStatus('saving');
    const draftData = {
      activeTab, sectorId, compradorId, tipoCompra, criticality, dataNecessidade, justificativa,
      items, registrationType, sapRegName, sapRegSpecs, sapRegBrand, sapRegVendorInfo,
      chamadoSectorId, helpdeskSectorId, helpdeskCategory, helpdeskLocal
    };
    localStorage.setItem(`sisten_draft_${user.id}`, JSON.stringify(draftData));
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  const clearDraft = () => {
    localStorage.removeItem(`sisten_draft_${user.id}`);
  };

  const handleAddItem = () => {
    setItems([...items, { description: '', sap_code: '', quantity: 1, unit: 'UN', brand: '', is_similar_allowed: true, suggested_supplier: '', estimated_value: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index: number, key: keyof PurchaseItemState, val: any) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [key]: val
    };
    setItems(updated);

    // Auto-fill descrição/unidade se um código SAP válido de 8 dígitos for digitado
    if (key === 'sap_code' && String(val).trim().length === 8) {
      const code = String(val).trim();
      supabase.from('materials').select('*').eq('material_code', code).eq('is_active', true).maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) return;
          setItems(prev => prev.map((item, i) => {
            if (i !== index || item.sap_code.trim() !== code) return item; // usuário já alterou o campo
            return { ...item, description: data.description, unit: data.unit || 'UN' };
          }));
        });
    }
  };

  // Criticality selector details
  const getCriticalityCards = () => {
    if (activeTab === 'chamado') {
      return [
        { level: 1, label: 'Melhoria ou dúvida. Sem impacto no trabalho.', color: 'border-slate-300 hover:border-slate-500 bg-slate-50 text-slate-800' },
        { level: 2, label: 'Incômodo contornável. Consigo trabalhar normalmente.', color: 'border-emerald-200 hover:border-emerald-400 bg-emerald-50 text-emerald-800' },
        { level: 3, label: 'Impacto parcial. Parte do meu trabalho está travada.', color: 'border-amber-200 hover:border-amber-400 bg-amber-50/50 text-amber-800' },
        { level: 4, label: 'Impacto severo. Não consigo executar minha função.', color: 'border-orange-200 hover:border-orange-400 bg-orange-50 text-orange-800' },
        { level: 5, label: 'Parada de setor ou risco de segurança. Vários afetados.', color: 'border-red-200 hover:border-red-400 bg-red-50 text-red-800' }
      ];
    } else {
      return [
        { level: 1, label: 'Posso aguardar. Demanda planejada, sem pressão de prazo.', color: 'border-slate-300 hover:border-slate-500 bg-slate-50 text-slate-800' },
        { level: 2, label: 'Tem prazo, mas há fôlego. Preciso em 2–4 semanas.', color: 'border-emerald-200 hover:border-emerald-400 bg-emerald-50 text-emerald-800' },
        { level: 3, label: 'Começa a apertar. Preciso em 1–2 semanas.', color: 'border-amber-200 hover:border-amber-400 bg-amber-50/50 text-amber-800' },
        { level: 4, label: 'Situação crítica. Preciso em menos de 7 dias.', color: 'border-orange-200 hover:border-orange-400 bg-orange-50 text-orange-800' },
        { level: 5, label: 'Produção parada ou risco de segurança. Preciso imediatamente.', color: 'border-red-200 hover:border-red-400 bg-red-50 text-red-800' }
      ];
    }
  };

  const getHelpdeskCategories = (secId: string) => {
    if (secId === '9') { // TI
      return ['Acesso/Senha', 'Equipamento', 'Software', 'Rede', 'E-mail', 'Outro'];
    } else if (secId === '3') { // Facilities
      return ['Elétrica', 'Hidráulica', 'Climatização', 'Mobiliário', 'Limpeza', 'Chaves/Acesso', 'Outro'];
    } else { // Manutenção / Others
      return ['Elétrica', 'Hidráulica', 'Climatização', 'Equipamento', 'Outro'];
    }
  };



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadProgress(true);

    setTimeout(() => {
      // Structure base request payload
      let payload: any = {
        type: activeTab,
        criticality,
        justificativa: activeTab === 'compra' ? justificativa : '',
      };

      if (activeTab === 'compra') {
        payload = {
          ...payload,
          solicitante_sector_id: sectorId,
          comprador_id: compradorId || buyerOptions.find(b => b.profileId)?.profileId,
          tipo_compra: tipoCompra,
          data_necessidade: dataNecessidade,
          items: items.map(it => ({
            description: it.description,
            sap_code: it.sap_code,
            has_no_sap_code: !it.sap_code || it.sap_code.trim().length !== 8,
            quantity: it.quantity,
            unit: it.unit,
            brand: it.brand,
            is_similar_allowed: it.is_similar_allowed,
            suggested_supplier: it.suggested_supplier,
            estimated_value: it.estimated_value
          }))
        };
      } else if (activeTab === 'cadastro_sap') {
        payload = {
          ...payload,
          registration_type: registrationType,
          justificativa: registrationType === 'Item'
            ? `Nome: ${sapRegName}. Specs: ${sapRegSpecs}. Justificativa: ${justificativa}`
            : `Nome: ${sapRegName}. Justificativa: ${justificativa}`,
          brand: sapRegBrand,
          suggested_supplier: sapRegVendorInfo
        };
      } else if (activeTab === 'chamado') {
        payload = {
          ...payload,
          solicitante_sector_id: chamadoSectorId,
          target_sector_id: helpdeskSectorId,
          category_id: helpdeskCategory || getHelpdeskCategories(helpdeskSectorId)[0],
          justificativa,
          local: helpdeskLocal
        };
      }

      const req = localDb.submitRequest(payload, false);
      setUploadProgress(false);
      clearDraft();
      
      // Navigate to tracking
      onNavigate(`/solicitacoes/minhas?id=${req.id}`);
    }, 1200);
  };

  const activeCategoryList = getHelpdeskCategories(helpdeskSectorId);

  return (
    <div className="space-y-6 text-left max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Nova Solicitação</h2>
        <p className="mt-1 text-sm text-slate-500">Escolha o tipo e preencha o formulário. A criticidade define a numeração e os alertas.</p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => { setActiveTab('compra'); setCriticality(3); }}
          className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer ${activeTab === 'compra' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm font-semibold' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'}`}
        >
          <ShoppingBag className="h-6 w-6" />
          <span className="mt-2 text-xs">Compra</span>
          <span className="text-[10px] text-slate-400 mt-0.5">Solicitar compra de itens</span>
        </button>

        <button
          onClick={() => { setActiveTab('cadastro_sap'); setCriticality(3); }}
          className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer ${activeTab === 'cadastro_sap' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm font-semibold' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'}`}
        >
          <ClipboardCopy className="h-6 w-6" />
          <span className="mt-2 text-xs">Cadastro SAP</span>
          <span className="text-[10px] text-slate-400 mt-0.5">Cadastrar item/fornecedor</span>
        </button>

        <button
          onClick={() => { setActiveTab('chamado'); setCriticality(3); }}
          className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer ${activeTab === 'chamado' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm font-semibold' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'}`}
        >
          <Radio className="h-6 w-6" />
          <span className="mt-2 text-xs">Chamado</span>
          <span className="text-[10px] text-slate-400 mt-0.5">Helpdesk (TI, Facilities...)</span>
        </button>
      </div>

      {/* Form Submission */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: O que precisa */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <h3 className="font-bold text-slate-800 text-sm">S1 — O que você precisa?</h3>
            <div className="flex items-center space-x-2">
              {autosaveStatus === 'saving' && <span className="text-[10px] text-slate-400 flex items-center"><Loader2 className="animate-spin h-3 w-3 mr-1" /> Salvando rascunho...</span>}
              {autosaveStatus === 'saved' && <span className="text-[10px] text-emerald-600 font-bold flex items-center">✓ Rascunho salvo</span>}
              <button type="button" onClick={saveDraft} className="text-[10px] text-slate-400 hover:text-slate-600 inline-flex items-center font-bold">
                <Save className="h-3 w-3 mr-1" /> Salvar agora
              </button>
            </div>
          </div>

          {activeTab === 'compra' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Setor solicitante *</label>
                  <select
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="">Selecione seu setor...</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Comprador responsável *</label>
                  <select
                    value={compradorId}
                    onChange={(e) => setCompradorId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="">Selecione um comprador...</option>
                    {buyerOptions.map(b => (
                      <option key={b.code} value={b.profileId || b.code} disabled={!b.profileId}>
                        {b.label} ({b.code}){!b.profileId ? ' — sem login vinculado' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tipo de compra</label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                    {(['Estoque', 'Direta', 'Serviço'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setTipoCompra(type)}
                        className={`rounded py-1 text-center text-[10px] font-bold uppercase transition-colors cursor-pointer ${tipoCompra === type ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Repeatable Items Area */}
              <div className="space-y-4 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Itens solicitados *</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="flex items-center text-xs font-bold text-emerald-700 hover:text-emerald-900 focus:outline-none cursor-pointer"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Item
                  </button>
                </div>

                {items.map((it, index) => (
                  <div key={index} className="relative rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Item {index + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-red-500 hover:text-red-700 focus:outline-none cursor-pointer"
                          title="Remover Item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Código SAP + Descrição — busca bidirecional no catálogo SAP */}
                      <div className="sm:col-span-8 relative" ref={(el) => { dropdownRefs.current[index] = el; }}>
                        <div className="flex gap-3">
                          <div className="w-24 shrink-0 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block">Código SAP</label>
                            <input
                              type="text"
                              placeholder="8 dígitos"
                              maxLength={8}
                              value={it.sap_code}
                              onChange={(e) => {
                                handleItemChange(index, 'sap_code', e.target.value);
                                setActiveSearchIndex(index);
                              }}
                              onFocus={() => setActiveSearchIndex(index)}
                              className="w-full rounded border border-gray-200 bg-white py-1 px-2 text-xs font-mono focus:outline-none focus:border-emerald-600"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block">Descrição *</label>
                            <div className="relative">
                              <input
                                type="text"
                                required
                                placeholder="Digite para buscar no catálogo SAP..."
                                value={it.description}
                                onChange={(e) => {
                                  handleItemChange(index, 'description', e.target.value);
                                  setActiveSearchIndex(index);
                                }}
                                onFocus={() => setActiveSearchIndex(index)}
                                className="w-full rounded border border-gray-200 bg-white py-1 pl-7 pr-2 text-xs focus:outline-none focus:border-emerald-600 font-medium"
                              />
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            </div>
                          </div>
                        </div>

                        {/* Autocomplete Dropdown list */}
                        {activeSearchIndex === index && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-50">
                            <div className="bg-slate-50 px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between sticky top-0 border-b border-slate-100">
                              <span>Resultados do Catálogo SAP</span>
                              <span className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">
                                {isSearchingCatalog ? '...' : `${activeSearchResults.length} itens`}
                              </span>
                            </div>
                            {isSearchingCatalog ? (
                              <div className="p-3 text-xs text-slate-400 text-center">Buscando no catálogo SAP...</div>
                            ) : activeSearchResults.length === 0 ? (
                              <div className="p-3 text-xs text-slate-400 text-center">
                                Nenhum item correspondente no catálogo.
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Você pode digitar livremente para cadastrar um item novo.
                                </div>
                              </div>
                            ) : (
                              activeSearchResults.map((mat) => (
                                <button
                                  key={mat.id}
                                  type="button"
                                  onClick={() => {
                                    const updated = [...items];
                                    updated[index] = {
                                      ...updated[index],
                                      description: mat.description,
                                      sap_code: mat.material_code,
                                      unit: mat.unit || 'UN'
                                    };
                                    setItems(updated);
                                    setActiveSearchIndex(null);
                                    setActiveSearchResults([]);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-emerald-50/20 transition-colors flex items-start space-x-2 text-xs"
                                >
                                  <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold text-[9px] shrink-0 mt-0.5">
                                    {mat.material_code}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-800 truncate" title={mat.description}>
                                      {mat.description}
                                    </div>
                                    {mat.technical_text && (
                                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                        {mat.technical_text}
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1 rounded uppercase shrink-0 self-center">
                                    {mat.unit}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* Qtd */}
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Qtd *</label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={it.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                          className="w-full rounded border border-gray-200 bg-white py-1 px-2 text-xs focus:outline-none"
                        />
                      </div>

                      {/* Un */}
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Un.</label>
                        <select
                          value={it.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          className="w-full rounded border border-gray-200 bg-white py-1 px-1.5 text-xs focus:outline-none"
                        >
                          <option value="UN">UN</option>
                          <option value="KG">KG</option>
                          <option value="M">M</option>
                          <option value="L">L</option>
                          <option value="M²">M²</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Marca */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 flex items-center justify-between">
                          <span>Marca / Fabricante</span>
                          <label className="inline-flex items-center text-[10px] font-normal text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={it.is_similar_allowed}
                              onChange={(e) => handleItemChange(index, 'is_similar_allowed', e.target.checked)}
                              className="mr-1 rounded border-gray-300 text-emerald-600"
                            /> ou similar
                          </label>
                        </label>
                        <input
                          type="text"
                          placeholder="Marca sugerida"
                          value={it.brand}
                          onChange={(e) => handleItemChange(index, 'brand', e.target.value)}
                          className="w-full rounded border border-gray-200 bg-white py-1 px-2 text-xs focus:outline-none"
                        />
                      </div>

                      {/* Fornecedor */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Fornecedor sugerido</label>
                        <input
                          type="text"
                          placeholder="Sugestão de distribuidor"
                          value={it.suggested_supplier}
                          onChange={(e) => handleItemChange(index, 'suggested_supplier', e.target.value)}
                          className="w-full rounded border border-gray-200 bg-white py-1 px-2 text-xs focus:outline-none"
                        />
                      </div>

                      {/* Estimativa de valor */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Estimativa (R$)</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="R$ Estimado"
                          value={it.estimated_value}
                          onChange={(e) => handleItemChange(index, 'estimated_value', Number(e.target.value))}
                          className="w-full rounded border border-gray-200 bg-white py-1 px-2 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Justificativa text */}
              <div className="space-y-1 pt-2">
                <label className="text-xs font-bold text-slate-700">Justificativa e Especificações Técnicas *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Detalhamento técnico do que se busca e justificativa da aplicação na Torres Eólicas do Nordeste."
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'cadastro_sap' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tipo de cadastro</label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                    {(['Item', 'Fornecedor'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setRegistrationType(type)}
                        className={`rounded py-1.5 text-center text-xs font-bold uppercase transition-colors cursor-pointer ${registrationType === type ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        {type === 'Item' ? 'Item' : 'Fornecedor'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    {registrationType === 'Item' ? 'Nome / Descrição Curta *' : 'Razão Social / Nome Fantasia *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={registrationType === 'Item' ? 'Ex: CHAPA DE AÇO 12MM' : 'Ex: METALURGICA JACOBINA LTDA'}
                    value={sapRegName}
                    onChange={(e) => setSapRegName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    {registrationType === 'Item' ? 'Marca / Fabricante' : 'CNPJ / Site corporativo'}
                  </label>
                  <input
                    type="text"
                    placeholder={registrationType === 'Item' ? 'Ex: Belgo Bekaert' : 'Ex: 00.000.000/0001-00'}
                    value={sapRegBrand}
                    onChange={(e) => setSapRegBrand(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    {registrationType === 'Item' ? 'Fornecedor de Referência' : 'Representante / Contato'}
                  </label>
                  <input
                    type="text"
                    placeholder="Nome ou e-mail de contato do parceiro"
                    value={sapRegVendorInfo}
                    onChange={(e) => setSapRegVendorInfo(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 py-1.5 px-3 text-xs focus:outline-none"
                  />
                </div>
              </div>

              {registrationType === 'Item' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Especificações Técnicas *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Dimensões, padrão de materiais, certificado de calibração necessário ou outras informações mínimas para que o setor de Suprimentos valide o cadastro."
                    value={sapRegSpecs}
                    onChange={(e) => setSapRegSpecs(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Justificativa de necessidade *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Por que é necessário criar este novo item ou homologar este fornecedor?"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'chamado' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Setor solicitante *</label>
                <select
                  value={chamadoSectorId}
                  onChange={(e) => setChamadoSectorId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer"
                >
                  <option value="">Selecione seu setor...</option>
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Step 1: Support Sector Card Selectors */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Destino do chamado *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {sectors.filter(s => s.helpdesk_enabled).map(s => {
                    const iconMap: Record<string, string> = {
                      'TI': '💻',
                      'Facilities': '🏢',
                      'Manutenção': '⚙️',
                    };
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setHelpdeskSectorId(s.id); setHelpdeskCategory(''); }}
                        className={`flex items-center space-x-3 p-4 rounded-xl border text-left cursor-pointer transition-all ${helpdeskSectorId === s.id ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                      >
                        <span className="text-2xl">{iconMap[s.name] || '🛠️'}</span>
                        <div>
                          <p className="text-xs font-bold">{s.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Suporte habilitado</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Categoria do incidente/pedido *</label>
                  <select
                    value={helpdeskCategory}
                    onChange={(e) => setHelpdeskCategory(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="">Selecione a categoria...</option>
                    {activeCategoryList.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Local de ocorrência {helpdeskSectorId === '3' ? '*' : '(Opcional)'}
                  </label>
                  <input
                    type="text"
                    required={helpdeskSectorId === '3'} // Required for Facilities
                    placeholder="Ex: Galpão B, Ponte Rolante ou Sala de Reunião 104"
                    value={helpdeskLocal}
                    onChange={(e) => setHelpdeskLocal(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 py-1.5 px-3 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Descrição detalhada *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Descreva as características do erro, mensagens de sistema apresentadas, impactos causados no setor, e passos já efetuados para tentar resolver."
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Pra quando (Only for Compra) */}
        {activeTab === 'compra' && (
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm border-b border-slate-50 pb-3">S2 — Pra quando?</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center">
                <Calendar className="h-4 w-4 mr-1 text-slate-400" /> Data Limite de Necessidade no Almoxarifado *
              </label>
              <input
                type="date"
                required
                min="2026-07-05" // Standard min local date
                value={dataNecessidade}
                onChange={(e) => setDataNecessidade(e.target.value)}
                className="rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-emerald-600 focus:outline-none cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">Certifique-se de que a data informada comporta o SLA de compra e o lead time logístico da empresa.</p>
            </div>
          </div>
        )}

        {/* Section 3: Criticidade Selector (All channels have this) */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 text-sm border-b border-slate-50 pb-3">S3 — Qual a criticidade?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {getCriticalityCards().map((card) => {
              const colors: Record<number, string> = {
                1: 'border-slate-200 hover:border-slate-400',
                2: 'border-emerald-200 hover:border-emerald-400',
                3: 'border-amber-200 hover:border-amber-400 ring-2 ring-amber-500/10',
                4: 'border-orange-200 hover:border-orange-400',
                5: 'border-red-200 hover:border-red-400'
              };

              const activeColor: Record<number, string> = {
                1: 'border-slate-500 bg-slate-50 ring-2 ring-slate-500/20 text-slate-900',
                2: 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20 text-emerald-900',
                3: 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20 text-amber-950',
                4: 'border-orange-500 bg-orange-50 ring-2 ring-orange-500/20 text-orange-950',
                5: 'border-red-600 bg-red-50 ring-2 ring-red-500/20 text-red-950'
              };

              return (
                <button
                  key={card.level}
                  type="button"
                  onClick={() => setCriticality(card.level)}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${criticality === card.level ? activeColor[card.level] : colors[card.level]}`}
                >
                  <div className="flex items-center space-x-1.5 font-extrabold text-xs">
                    <span className={`h-2.5 w-2.5 rounded-full ${card.level === 1 ? 'bg-slate-400' : (card.level === 2 ? 'bg-emerald-500' : (card.level === 3 ? 'bg-amber-500' : (card.level === 4 ? 'bg-orange-500' : 'bg-red-500')))}`}></span>
                    <span>Grau {card.level}</span>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500 font-medium">
                    {card.label}
                  </p>
                </button>
              );
            })}
          </div>

          {criticality >= 4 && (
            <div className="rounded-lg bg-orange-50 border border-orange-100 p-3.5 flex items-start text-xs text-orange-800">
              <AlertTriangle className="h-5 w-5 mr-3 shrink-0 text-orange-600 mt-0.5" />
              <div>
                <strong>Atenção: Criticidade Alta selecionada.</strong>
                <p className="mt-0.5 text-orange-700">Esta solicitação irá disparar notificações especiais para os gestores e gerará um número sequencial prioritário. Justifique de forma técnica por que o prazo é restrito ou o risco associado.</p>
              </div>
            </div>
          )}
        </div>



        {/* Action controls */}
        <div className="flex items-center justify-end space-x-4 pt-4">
          <button
            type="button"
            onClick={() => { clearDraft(); onNavigate('/'); }}
            className="rounded-lg border border-gray-200 px-5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={uploadProgress}
            className="rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-xs py-2 px-6 transition-colors flex items-center cursor-pointer"
          >
            {uploadProgress ? (
              <>
                <Loader2 className="animate-spin h-4.5 w-4.5 mr-2" />
                <span>Enviando solicitação...</span>
              </>
            ) : (
              <span>Enviar solicitação</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
