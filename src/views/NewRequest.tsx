/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag, ClipboardCopy, Radio, Plus, Trash2, Calendar,
  AlertTriangle, Save, Loader2, Search, Circle, CheckCircle2,
  AlertCircle, Siren, Laptop2, Building2, Wrench, X,
  ListChecks, Gauge, Send,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import { Profile, RequestItem, RequestType, RequestStatus, Material } from '../types';
import { formatBRL } from '../lib/format';
import { AttachmentPicker } from '../components/ui/Attachments';
import { PreparedAttachment } from '../lib/imageCompression';

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
  is_generic?: boolean;
  observation?: string;
  suggested_supplier: string;
  estimated_value: number;
  /**
   * Anexos já comprimidos, aguardando o submit para subir. Ficam presos ao item
   * (e não num mapa por índice à parte) para acompanharem naturalmente a
   * inclusão e a remoção de linhas. Não entram no rascunho: `Blob` não
   * sobrevive a `JSON.stringify` — ver `saveDraft`.
   */
  attachments?: PreparedAttachment[];
}

/* --------------------------------------------------------------------- */
/* Estilos de campo compartilhados nesta página                           */
/* --------------------------------------------------------------------- */

const fieldClass = 'w-full rounded-lg border py-2 px-3 text-xs transition-colors duration-150 focus:outline-2 focus:outline-offset-1';
const fieldStyle: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};
const labelClass = 'text-xs font-bold block mb-1';
const labelStyle: React.CSSProperties = { color: 'var(--ink-secondary)' };

const cardStyle: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
};

/* Criticidade é gravidade, não identidade: usa a mesma escala de status
   reservada dos gráficos (bom → crítico), com o grau 1 fora da escala porque
   "posso aguardar" não é um estado bom nem ruim — é ausência de urgência. */
function criticalityToken(level: number): string {
  switch (level) {
    case 1: return 'var(--ink-muted)';
    case 2: return 'var(--status-good)';
    case 3: return 'var(--status-warning)';
    case 4: return 'var(--status-serious)';
    default: return 'var(--status-critical)';
  }
}

function criticalityIcon(level: number) {
  switch (level) {
    case 1: return Circle;
    case 2: return CheckCircle2;
    case 3: return AlertCircle;
    case 4: return AlertTriangle;
    default: return Siren;
  }
}

const SECTOR_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  'TI': Laptop2,
  'Facilities': Building2,
  'Manutenção': Wrench,
};

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
    { description: '', sap_code: '', quantity: 1, unit: 'UN', brand: '', is_similar_allowed: true, is_generic: false, observation: '', suggested_supplier: '', estimated_value: 0 }
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
  // Cadastro SAP não tem itens, então os anexos se prendem à solicitação. Fora
  // do rascunho pelo mesmo motivo dos anexos de item (Blob não serializa).
  const [sapAttachments, setSapAttachments] = useState<PreparedAttachment[]>([]);

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
      if (error || !data || data.length === 0) {
        setCompradoresList(localDb.getCompradores());
        return;
      }
      setCompradoresList(data);
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
      // Anexos ficam de fora: `Blob` vira `{}` no JSON e `previewUrl` vira um
      // object URL morto, o que reencheria o rascunho de chips quebrados.
      items: items.map(({ attachments, ...resto }) => resto),
      registrationType, sapRegName, sapRegSpecs, sapRegBrand, sapRegVendorInfo,
      chamadoSectorId, helpdeskSectorId, helpdeskCategory, helpdeskLocal
    };
    localStorage.setItem(`sisten_draft_${user.id}`, JSON.stringify(draftData));
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  const clearDraft = () => {
    localStorage.removeItem(`sisten_draft_${user.id}`);
  };

  const handleAddItem = () => {
    setItems([...items, { description: '', sap_code: '', quantity: 1, unit: 'UN', brand: '', is_similar_allowed: true, is_generic: false, observation: '', suggested_supplier: '', estimated_value: 0 }]);
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
        { level: 1, label: 'Melhoria ou dúvida. Sem impacto no trabalho.' },
        { level: 2, label: 'Incômodo contornável. Consigo trabalhar normalmente.' },
        { level: 3, label: 'Impacto parcial. Parte do meu trabalho está travada.' },
        { level: 4, label: 'Impacto severo. Não consigo executar minha função.' },
        { level: 5, label: 'Parada de setor ou risco de segurança. Vários afetados.' }
      ];
    } else {
      return [
        { level: 1, label: 'Posso aguardar. Demanda planejada, sem pressão de prazo.' },
        { level: 2, label: 'Tem prazo, mas há fôlego. Preciso em 2–4 semanas.' },
        { level: 3, label: 'Começa a apertar. Preciso em 1–2 semanas.' },
        { level: 4, label: 'Situação crítica. Preciso em menos de 7 dias.' },
        { level: 5, label: 'Produção parada ou risco de segurança. Preciso imediatamente.' }
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



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadProgress(true);

    try {
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
          comprador_id: compradorId || buyerOptions[0]?.profileId || buyerOptions[0]?.code,
          tipo_compra: tipoCompra,
          data_necessidade: dataNecessidade,
          items: items.map(it => ({
            description: it.description,
            sap_code: it.sap_code,
            has_no_sap_code: !it.sap_code || it.sap_code.trim().length !== 8,
            is_generic: it.is_generic || false,
            observation: it.observation || '',
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

      const req = await localDb.submitRequest(payload, false);

      // Só agora os anexos têm a que se prender: o id da solicitação nasce
      // dentro do submitRequest, e o id do item é derivado dele pelo índice
      // (`ri_<request_id>_<índice>`, ver localDb.submitRequest).
      const entries = activeTab === 'compra'
        ? items.flatMap((item, index) =>
            (item.attachments || []).map(prepared => ({
              prepared,
              requestItemId: `ri_${req.id}_${index}`,
            }))
          )
        : sapAttachments.map(prepared => ({ prepared }));

      const { failed } = await localDb.uploadAttachments(req.id, entries);
      clearDraft();

      if (failed.length > 0) {
        // A solicitação já existe; perder um anexo não pode desfazê-la — o
        // usuário reenviar o arquivo em Minhas Solicitações é o caminho.
        alert(
          `A solicitação #${req.number} foi criada, mas ${failed.length === 1 ? 'este anexo não subiu' : 'estes anexos não subiram'}: ` +
          `${failed.join(', ')}. Você pode reenviá-${failed.length === 1 ? 'lo' : 'los'} em Minhas Solicitações.`
        );
      }

      // Navigate to tracking
      onNavigate(`/solicitacoes/minhas?id=${req.id}`);
    } catch (err) {
      console.error('Falha ao enviar a solicitação.', err);
      alert('Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setUploadProgress(false);
    }
  };

  const activeCategoryList = getHelpdeskCategories(helpdeskSectorId);

  const CHANNELS: { id: RequestType; icon: React.ComponentType<{ className?: string }>; label: string; hint: string }[] = [
    { id: 'compra', icon: ShoppingBag, label: 'Compra', hint: 'Solicitar compra de itens' },
    { id: 'cadastro_sap', icon: ClipboardCopy, label: 'Cadastro SAP', hint: 'Cadastrar item/fornecedor' },
    { id: 'chamado', icon: Radio, label: 'Chamado', hint: 'Helpdesk (TI, Facilities...)' },
  ];

  return (
    <div className="space-y-6 text-left max-w-7xl mx-auto pb-12">
      <div className="reveal">
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>Nova Solicitação</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          Escolha o tipo e preencha o formulário abaixo.
        </p>
      </div>

      {/* Seletor de canal — três opções reais, então cabe lado a lado mesmo em
          telas largas; cresce um pouco de porte para preencher a largura sem
          ficar vazio. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
        {CHANNELS.map(ch => {
          const active = activeTab === ch.id;
          const Icon = ch.icon;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => { setActiveTab(ch.id); setCriticality(3); }}
              aria-pressed={active}
              className="flex flex-col items-center justify-center p-5 rounded-xl border text-center transition-[transform,box-shadow] duration-200 cursor-pointer hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderColor: active ? 'var(--brand)' : 'var(--hairline)',
                background: active ? 'var(--brand-wash)' : 'var(--surface-card)',
                color: active ? 'var(--brand-strong)' : 'var(--ink-secondary)',
                boxShadow: active ? '0 1px 2px 0 rgb(0 0 0 / 0.04)' : undefined,
                outlineColor: 'var(--brand)',
              }}
            >
              <Icon className="h-7 w-7" />
              <span className={`mt-2.5 text-sm ${active ? 'font-bold' : 'font-semibold'}`}>{ch.label}</span>
              <span className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>{ch.hint}</span>
            </button>
          );
        })}
      </div>

      {/*
        Layout em duas colunas a partir de xl: o conteúdo principal (o que
        precisa) fica largo o bastante para os campos respirarem, e "pra
        quando" / "criticidade" / envio formam um painel lateral fixo — só
        eles, sozinhos ocupando a largura inteira da tela, deixavam a metade
        direita vazia em qualquer monitor largo. O painel fica `sticky`, então
        o botão de enviar permanece alcançável mesmo com a lista de itens
        crescendo. Abaixo de xl (tablet/celular) as colunas empilham na ordem
        de leitura natural: o que precisa → quando → criticidade → enviar.
      */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Coluna principal */}
        <div className="space-y-6 min-w-0">
        <div className="rounded-xl border p-6 shadow-xs space-y-4 reveal" style={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--hairline)' }}>
            <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
              <ListChecks className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
              O que você precisa?
            </h3>
            <div className="flex items-center gap-3">
              {autosaveStatus === 'saving' && (
                <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--ink-muted)' }}>
                  <Loader2 className="animate-spin h-3 w-3" /> Salvando rascunho...
                </span>
              )}
              {autosaveStatus === 'saved' && (
                <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'var(--status-good)' }}>
                  <CheckCircle2 className="h-3 w-3" /> Rascunho salvo
                </span>
              )}
              <button
                type="button"
                onClick={saveDraft}
                className="text-[10px] inline-flex items-center gap-1 font-bold cursor-pointer transition-colors duration-150 hover:text-[var(--ink-primary)]"
                style={{ color: 'var(--ink-muted)' }}
              >
                <Save className="h-3 w-3" /> Salvar agora
              </button>
            </div>
          </div>

          {activeTab === 'compra' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass} style={labelStyle}>Setor solicitante *</label>
                  <select
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    required
                    className={`${fieldClass} cursor-pointer`}
                    style={fieldStyle}
                  >
                    <option value="">Selecione seu setor...</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>Comprador responsável *</label>
                  <select
                    value={compradorId}
                    onChange={(e) => setCompradorId(e.target.value)}
                    required
                    className={`${fieldClass} cursor-pointer`}
                    style={fieldStyle}
                  >
                    <option value="">Selecione um comprador...</option>
                    {buyerOptions.map(b => (
                      <option key={b.code} value={b.profileId || b.code}>
                        {b.label} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>Tipo de compra</label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                    {(['Estoque', 'Direta', 'Serviço'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setTipoCompra(type)}
                        aria-pressed={tipoCompra === type}
                        className="rounded py-1 text-center text-[10px] font-bold uppercase cursor-pointer transition-colors duration-150"
                        style={
                          tipoCompra === type
                            ? { background: 'var(--brand)', color: '#ffffff' }
                            : { color: 'var(--ink-muted)' }
                        }
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Repeatable Items Area */}
              <div className="space-y-3 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Itens solicitados *</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="flex items-center gap-1 text-xs font-bold cursor-pointer transition-colors duration-150 hover:text-[var(--brand-strong)]"
                    style={{ color: 'var(--brand)' }}
                  >
                    <Plus className="h-4 w-4" /> Item
                  </button>
                </div>

                <div className="space-y-3 stagger">
                {items.map((it, index) => (
                  <div
                    key={index}
                    className="relative rounded-xl border p-4 space-y-3"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
                          Item {index + 1}
                        </span>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none" style={{ color: 'var(--ink-secondary)' }}>
                          <input
                            type="checkbox"
                            checked={it.is_generic || false}
                            onChange={(e) => handleItemChange(index, 'is_generic', e.target.checked)}
                            className="rounded cursor-pointer"
                            style={{ accentColor: 'var(--brand)' }}
                          />
                          Item Genérico
                        </label>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 rounded"
                          style={{ color: 'var(--status-critical)', outlineColor: 'var(--status-critical)' }}
                          title="Remover Item"
                          aria-label={`Remover item ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Código SAP + Descrição — busca bidirecional no catálogo SAP */}
                      <div className="sm:col-span-8 relative" ref={(el) => { dropdownRefs.current[index] = el; }}>
                        <div className="flex gap-3">
                          <div className="w-24 shrink-0">
                            <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Código SAP</label>
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
                              className="w-full rounded border py-1 px-2 text-xs font-mono transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                              style={fieldStyle}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Descrição *</label>
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: 'var(--ink-muted)' }} />
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
                                className="w-full rounded border py-1 pl-7 pr-2 text-xs font-medium transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                                style={fieldStyle}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Autocomplete Dropdown list */}
                        {activeSearchIndex === index && (
                          <div
                            className="absolute left-0 right-0 top-full mt-1 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto divide-y border animate-fade-in"
                            style={{ background: 'var(--chart-tooltip-bg)', borderColor: 'var(--chart-tooltip-border)', boxShadow: 'var(--chart-tooltip-shadow)' }}
                          >
                            <div
                              className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider flex items-center justify-between sticky top-0 border-b"
                              style={{ background: 'var(--surface-raised)', color: 'var(--ink-muted)', borderColor: 'var(--hairline)' }}
                            >
                              <span>Resultados do Catálogo SAP</span>
                              <span className="flex items-center gap-2">
                                <span className="font-bold px-1.5 py-0.5 rounded tabular" style={{ background: 'var(--brand-wash)', color: 'var(--brand-strong)' }}>
                                  {isSearchingCatalog ? '...' : `${activeSearchResults.length} itens`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveSearchIndex(null)}
                                  className="cursor-pointer"
                                  style={{ color: 'var(--ink-muted)' }}
                                  aria-label="Fechar resultados"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            </div>
                            {isSearchingCatalog ? (
                              <div className="p-3 text-xs text-center" style={{ color: 'var(--ink-muted)' }}>Buscando no catálogo SAP...</div>
                            ) : activeSearchResults.length === 0 ? (
                              <div className="p-3 text-xs text-center" style={{ color: 'var(--ink-muted)' }}>
                                Nenhum item correspondente no catálogo.
                                <div className="text-[10px] mt-0.5">
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
                                  className="w-full text-left px-3 py-2 transition-colors duration-150 flex items-start gap-2 text-xs hover:bg-[var(--surface-raised)]"
                                >
                                  <span
                                    className="font-mono px-1.5 py-0.5 rounded font-bold text-[9px] shrink-0 mt-0.5"
                                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
                                  >
                                    {mat.material_code}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate" style={{ color: 'var(--ink-primary)' }} title={mat.description}>
                                      {mat.description}
                                    </div>
                                    {mat.technical_text && (
                                      <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                                        {mat.technical_text}
                                      </div>
                                    )}
                                  </div>
                                  <span
                                    className="text-[10px] font-mono px-1 rounded uppercase shrink-0 self-center"
                                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
                                  >
                                    {mat.unit}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* Qtd — largura máxima própria: numa coluna principal
                          larga (sem o painel lateral, abaixo de xl) o track de
                          grid de 2/12 ficaria bem mais largo que um campo
                          numérico precisa. */}
                      <div className="sm:col-span-2 sm:max-w-[140px]">
                        <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Qtd *</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          required
                          min={1}
                          value={it.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                          className="w-full rounded border py-1 px-2 text-xs tabular transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>

                      {/* Un */}
                      <div className="sm:col-span-2 sm:max-w-[140px]">
                        <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Un.</label>
                        <select
                          value={it.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          className="w-full rounded border py-1 px-1.5 text-xs cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
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
                      <div>
                        <label className="text-[10px] font-bold flex items-center justify-between mb-1" style={{ color: 'var(--ink-muted)' }}>
                          <span>Marca / Fabricante</span>
                          <label className="inline-flex items-center gap-1 text-[10px] font-normal cursor-pointer" style={{ color: 'var(--ink-muted)' }}>
                            <input
                              type="checkbox"
                              checked={it.is_similar_allowed}
                              onChange={(e) => handleItemChange(index, 'is_similar_allowed', e.target.checked)}
                              style={{ accentColor: 'var(--brand)' }}
                            /> ou similar
                          </label>
                        </label>
                        <input
                          type="text"
                          placeholder="Marca sugerida"
                          value={it.brand}
                          onChange={(e) => handleItemChange(index, 'brand', e.target.value)}
                          className="w-full rounded border py-1 px-2 text-xs transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>

                      {/* Fornecedor */}
                      <div>
                        <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Fornecedor sugerido</label>
                        <input
                          type="text"
                          placeholder="Sugestão de distribuidor"
                          value={it.suggested_supplier}
                          onChange={(e) => handleItemChange(index, 'suggested_supplier', e.target.value)}
                          className="w-full rounded border py-1 px-2 text-xs transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>

                      {/* Estimativa de valor */}
                      <div>
                        <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Estimativa (R$)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          placeholder="R$ Estimado"
                          value={it.estimated_value}
                          onChange={(e) => handleItemChange(index, 'estimated_value', Number(e.target.value))}
                          className="w-full rounded border py-1 px-2 text-xs tabular transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>
                    </div>

                    {/* Observação / Informações Técnicas */}
                    <div>
                      <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Observação / Informações Técnicas</label>
                      <textarea
                        rows={2}
                        placeholder="Informações técnicas adicionais, observações ou especificações..."
                        value={it.observation || ''}
                        onChange={(e) => handleItemChange(index, 'observation', e.target.value)}
                        className="w-full rounded border py-1.5 px-2 text-xs transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                        style={fieldStyle}
                      />
                    </div>

                    {/* Anexos do item — foto da peça, etiqueta com código,
                        ficha técnica. O comprador vê a imagem ao lado do item
                        certo, não solta na solicitação. */}
                    <div>
                      <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>
                        Fotos / documentos do item
                      </label>
                      <AttachmentPicker
                        value={it.attachments || []}
                        onChange={(anexos) => handleItemChange(index, 'attachments', anexos)}
                        label="Anexar foto ou PDF"
                      />
                    </div>
                  </div>
                ))}
                </div>
              </div>

              {/* Justificativa text */}
              <div className="pt-2">
                <label className={labelClass} style={labelStyle}>Justificativa e Especificações Técnicas *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Detalhamento técnico do que se busca e justificativa da aplicação na Torres Eólicas do Nordeste."
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border py-2 px-3 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                  style={fieldStyle}
                />
              </div>
            </div>
          )}

          {activeTab === 'cadastro_sap' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} style={labelStyle}>Tipo de cadastro</label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                    {(['Item', 'Fornecedor'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setRegistrationType(type)}
                        aria-pressed={registrationType === type}
                        className="rounded py-1.5 text-center text-xs font-bold uppercase cursor-pointer transition-colors duration-150"
                        style={
                          registrationType === type
                            ? { background: 'var(--brand)', color: '#ffffff' }
                            : { color: 'var(--ink-muted)' }
                        }
                      >
                        {type === 'Item' ? 'Item' : 'Fornecedor'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    {registrationType === 'Item' ? 'Nome / Descrição Curta *' : 'Razão Social / Nome Fantasia *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={registrationType === 'Item' ? 'Ex: CHAPA DE AÇO 12MM' : 'Ex: METALURGICA JACOBINA LTDA'}
                    value={sapRegName}
                    onChange={(e) => setSapRegName(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} style={labelStyle}>
                    {registrationType === 'Item' ? 'Marca / Fabricante' : 'CNPJ / Site corporativo'}
                  </label>
                  <input
                    type="text"
                    placeholder={registrationType === 'Item' ? 'Ex: Belgo Bekaert' : 'Ex: 00.000.000/0001-00'}
                    value={sapRegBrand}
                    onChange={(e) => setSapRegBrand(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    {registrationType === 'Item' ? 'Fornecedor de Referência' : 'Representante / Contato'}
                  </label>
                  <input
                    type="text"
                    placeholder="Nome ou e-mail de contato do parceiro"
                    value={sapRegVendorInfo}
                    onChange={(e) => setSapRegVendorInfo(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
              </div>

              {registrationType === 'Item' && (
                <div>
                  <label className={labelClass} style={labelStyle}>Especificações Técnicas *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Dimensões, padrão de materiais, certificado de calibração necessário ou outras informações mínimas para que o setor de Suprimentos valide o cadastro."
                    value={sapRegSpecs}
                    onChange={(e) => setSapRegSpecs(e.target.value)}
                    className="w-full rounded-lg border py-2 px-3 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                    style={fieldStyle}
                  />
                </div>
              )}

              <div>
                <label className={labelClass} style={labelStyle}>Justificativa de necessidade *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Por que é necessário criar este novo item ou homologar este fornecedor?"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border py-2 px-3 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                  style={fieldStyle}
                />
              </div>

              {/* Anexos da solicitação: é o que evita o vaivém de
                  "Solicitar Esclarecimento" pedindo a ficha técnica que o
                  solicitante já tinha em mãos. */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  {registrationType === 'Item'
                    ? 'Fotos do item, etiqueta ou ficha técnica'
                    : 'Cartão CNPJ, catálogo ou documento do fornecedor'}
                </label>
                <AttachmentPicker
                  value={sapAttachments}
                  onChange={setSapAttachments}
                  label="Anexar imagem ou PDF"
                />
              </div>
            </div>
          )}

          {activeTab === 'chamado' && (
            <div className="space-y-4">
              <div>
                <label className={labelClass} style={labelStyle}>Setor solicitante *</label>
                <select
                  value={chamadoSectorId}
                  onChange={(e) => setChamadoSectorId(e.target.value)}
                  required
                  className={`${fieldClass} cursor-pointer`}
                  style={fieldStyle}
                >
                  <option value="">Selecione seu setor...</option>
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Step 1: Support Sector Card Selectors */}
              <div className="space-y-1.5">
                <label className={labelClass} style={labelStyle}>Destino do chamado *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {sectors.filter(s => s.helpdesk_enabled).map(s => {
                    const Icon = SECTOR_ICON[s.name] || Wrench;
                    const active = helpdeskSectorId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setHelpdeskSectorId(s.id); setHelpdeskCategory(''); }}
                        aria-pressed={active}
                        className="flex items-center gap-3 p-4 rounded-xl border text-left cursor-pointer transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          borderColor: active ? 'var(--brand)' : 'var(--hairline)',
                          background: active ? 'var(--brand-wash)' : 'var(--surface-card)',
                          color: active ? 'var(--brand-strong)' : 'var(--ink-secondary)',
                          outlineColor: 'var(--brand)',
                        }}
                      >
                        <Icon className="h-6 w-6 shrink-0" />
                        <div>
                          <p className="text-xs font-bold" style={{ color: active ? 'var(--brand-strong)' : 'var(--ink-primary)' }}>{s.name}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>Suporte habilitado</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} style={labelStyle}>Categoria do incidente/pedido *</label>
                  <select
                    value={helpdeskCategory}
                    onChange={(e) => setHelpdeskCategory(e.target.value)}
                    required
                    className={`${fieldClass} cursor-pointer`}
                    style={fieldStyle}
                  >
                    <option value="">Selecione a categoria...</option>
                    {activeCategoryList.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    Local de ocorrência {helpdeskSectorId === '3' ? '*' : '(Opcional)'}
                  </label>
                  <input
                    type="text"
                    required={helpdeskSectorId === '3'} // Required for Facilities
                    placeholder="Ex: Galpão B, Ponte Rolante ou Sala de Reunião 104"
                    value={helpdeskLocal}
                    onChange={(e) => setHelpdeskLocal(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} style={labelStyle}>Descrição detalhada *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Descreva as características do erro, mensagens de sistema apresentadas, impactos causados no setor, e passos já efetuados para tentar resolver."
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border py-2 px-3 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                  style={fieldStyle}
                />
              </div>
            </div>
          )}
        </div>
        </div>
        {/* fim da coluna principal */}

        {/* Painel lateral: quando + criticidade + envio. Fica sticky para
            continuar alcançável enquanto a lista de itens cresce na coluna
            principal, e some do fluxo sticky abaixo de xl (empilha normal). */}
        <div className="space-y-6 xl:sticky xl:top-6">
          {activeTab === 'compra' && (
            <div className="rounded-xl border p-5 shadow-xs space-y-3 reveal" style={cardStyle}>
              <h3 className="font-bold text-sm flex items-center gap-2 border-b pb-3" style={{ color: 'var(--ink-primary)', borderColor: 'var(--hairline)' }}>
                <Calendar className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                Pra quando?
              </h3>
              <div className="space-y-2">
                <label className={labelClass} style={labelStyle}>Data Limite de Necessidade no Almoxarifado *</label>
                <input
                  type="date"
                  required
                  min="2026-07-05" // Standard min local date
                  value={dataNecessidade}
                  onChange={(e) => setDataNecessidade(e.target.value)}
                  className="w-full rounded-lg border py-2 px-3 text-sm cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                  style={fieldStyle}
                />
                <p className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>Considere o SLA de compra e o lead time logístico da empresa.</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border p-5 shadow-xs space-y-3 reveal" style={cardStyle}>
            <h3 className="font-bold text-sm flex items-center gap-2 border-b pb-3" style={{ color: 'var(--ink-primary)', borderColor: 'var(--hairline)' }}>
              <Gauge className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
              Qual a criticidade?
            </h3>
            {/* Lista vertical: no painel lateral de 360px, uma grade de 5
                colunas ficaria ilegível. Abaixo de xl a coluna volta a ser
                larga (a página é uma só até lá), e 5 colunas cabem bem. */}
            <div className="grid grid-cols-1 sm:grid-cols-5 xl:grid-cols-1 gap-2 stagger">
              {getCriticalityCards().map((card) => {
                const active = criticality === card.level;
                const token = criticalityToken(card.level);
                const Icon = criticalityIcon(card.level);
                return (
                  <button
                    key={card.level}
                    type="button"
                    onClick={() => setCriticality(card.level)}
                    aria-pressed={active}
                    className="flex flex-col xl:flex-row xl:items-start xl:gap-2.5 text-left p-3 rounded-xl border transition-[transform,box-shadow] duration-200 cursor-pointer hover:-translate-y-0.5 xl:hover:translate-y-0 xl:hover:translate-x-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      borderColor: active ? token : 'var(--hairline)',
                      background: active ? `color-mix(in srgb, ${token} 10%, transparent)` : 'var(--surface-card)',
                      outlineColor: token,
                    }}
                  >
                    <div className="flex items-center gap-1.5 font-extrabold text-xs shrink-0" style={{ color: active ? token : 'var(--ink-primary)' }}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>Grau {card.level}</span>
                    </div>
                    <p className="mt-2 xl:mt-0 text-[10px] leading-relaxed font-medium" style={{ color: 'var(--ink-secondary)' }}>
                      {card.label}
                    </p>
                  </button>
                );
              })}
            </div>

            {criticality >= 4 && (
              <div
                className="rounded-lg border p-3 flex items-start gap-2.5 text-[11px] reveal"
                style={{
                  borderColor: 'var(--status-serious)',
                  background: 'color-mix(in srgb, var(--status-serious) 8%, transparent)',
                  color: 'var(--ink-primary)',
                }}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--status-serious)' }} />
                <div>
                  <strong>Criticidade alta.</strong>
                  <p className="mt-0.5" style={{ color: 'var(--ink-secondary)' }}>
                    Dispara notificação aos gestores e gera numeração prioritária. Justifique tecnicamente o prazo ou risco.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Envio: botão primário cheio, sempre a vista dentro do painel
              fixo — antes ficava no fim da página, e uma lista longa de itens
              obrigava rolar tudo de volta pra enviar. */}
          <div className="rounded-xl border p-5 shadow-xs space-y-2.5 reveal" style={cardStyle}>
            <button
              type="submit"
              disabled={uploadProgress}
              className="w-full rounded-lg disabled:opacity-50 text-white font-bold text-xs py-2.5 px-6 transition-[background-color,transform] duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: 'var(--brand)', outlineColor: 'var(--brand)' }}
            >
              {uploadProgress ? (
                <>
                  <Loader2 className="animate-spin h-4.5 w-4.5" />
                  <span>Enviando solicitação...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar solicitação</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => { clearDraft(); onNavigate('/'); }}
              className="w-full rounded-lg border py-2 text-xs font-bold cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
