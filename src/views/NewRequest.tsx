/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShoppingBag, ClipboardCopy, Radio, Plus, Trash2, Calendar,
  AlertTriangle, Save, Loader2, Search, Circle, CheckCircle2,
  AlertCircle, Siren, Laptop2, Building2, Wrench, X,
  ListChecks, Gauge, Send,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import { Profile, RequestItem, RequestType, RequestStatus } from '../types';
import { formatBRL } from '../lib/format';
import { buscarMateriais, resumoSinais, type MaterialResultado, type SinalChip } from '../lib/materiais';
import { AttachmentPicker, AttachmentGallery } from '../components/ui/Attachments';
import { PreparedAttachment } from '../lib/imageCompression';
import { novoItemId } from '../lib/ids';
import { podeEditar, statusAposEdicao, avisoEdicao } from '../lib/solicitacoes';

interface NewRequestProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface PurchaseItemState {
  /**
   * Id estável, gerado quando a linha nasce. Os anexos apontam para ele, então
   * ele não pode derivar da posição: índice escorrega assim que um item é
   * removido ou reordenado numa edição.
   */
  id: string;
  description: string;
  sap_code: string;
  /**
   * Texto técnico do catálogo SAP — vem junto quando o item é selecionado no
   * dropdown de busca ou autopreenchido pelo código. Não é enviado no
   * payload: é um dado do catálogo, não do item da solicitação; existe só
   * para o solicitante conferir a ficha técnica sem reabrir o dropdown.
   */
  technical_text?: string;
  /** Chips de estoque/RM/pedido — vêm junto com `technical_text`, mesmo motivo. */
  sinais?: SinalChip[];
  quantity: number | '';
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

const itemVazio = (): PurchaseItemState => ({
  id: novoItemId(),
  description: '', sap_code: '', technical_text: '', quantity: '', unit: '', brand: '',
  is_similar_allowed: true, is_generic: false, observation: '',
  suggested_supplier: '', estimated_value: 0,
});

/** UN até PAC, em ordem alfabética visual — "M²"/"M³" lidos como "M2"/"M3". */
const UNIDADES = ['GAL', 'KG', 'L', 'M', 'M²', 'M³', 'PAC', 'UN'] as const;

/** Chips de estoque/RM/pedido — usado tanto no dropdown quanto no item já selecionado. */
function SinalChips({ chips, className = '' }: { chips: SinalChip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {chips.map(chip => (
        <span
          key={chip.texto}
          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{
            // "estoque" e "demanda" usam tons de status (verde/âmbar, sinal
            // de decisão). "pedido" e "uso" são informativos, não decisão —
            // por isso ficam neutros e sem colorir o texto, para não competir
            // visualmente com "estoque" (que é o sinal mais relevante: "tem
            // agora" pesa mais que "já foi pedido").
            background: chip.tom === 'estoque'
              ? 'color-mix(in srgb, var(--status-good) 14%, transparent)'
              : chip.tom === 'demanda'
              ? 'color-mix(in srgb, var(--status-warning) 18%, transparent)'
              : 'var(--surface-sunken)',
            color: 'var(--ink-secondary)',
          }}
        >
          {chip.texto}
        </span>
      ))}
    </div>
  );
}

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
  // Sem valor padrão: criticidade é decisão do solicitante, não um "grau 3"
  // silencioso que ele nem percebeu que escolheu.
  const [criticality, setCriticality] = useState<number | null>(null);
  const [dataNecessidade, setDataNecessidade] = useState('');
  const [justificativa, setJustificativa] = useState('');

  // Memoizado: localDb.getSectors() lê e faz JSON.parse do localStorage a
  // cada chamada, devolvendo um array novo sempre. Sem isto, `sectors` vira
  // dependência "sempre diferente" do efeito de busca (abaixo) e o reexecuta
  // a cada render — inclusive os que o próprio efeito provoca ao terminar,
  // criando um loop de requisições repetidas à RPC enquanto o dropdown fica
  // aberto.
  const sectors = useMemo(() => localDb.getSectors(), []);

  // Área SAP do setor selecionado, para o sinal "sua área já pediu" na busca
  // de material. Depende de `sectorId` (não da lista `sectors` inteira, que
  // fica congelada no mount acima) para não perder um sync de setores que
  // termine depois da montagem do componente.
  const areaUsuario = useMemo(
    () => localDb.getSectors().find(s => s.id === sectorId)?.sap_area_code ?? null,
    [sectorId],
  );

  // Repeated items for Purchase
  const [items, setItems] = useState<PurchaseItemState[]>([itemVazio()]);

  // SAP catalog autocomplete states — busca direto no Supabase (catálogo tem
  // 180k+ linhas, não cabe em memória/localStorage), com debounce por item ativo.
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [activeSearchResults, setActiveSearchResults] = useState<MaterialResultado[]>([]);
  const [erroBusca, setErroBusca] = useState(false);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  // Incrementado pelo botão "Tentar de novo" para forçar o efeito de busca a
  // reexecutar mesmo quando índice e termo não mudaram.
  const [tentativaBusca, setTentativaBusca] = useState(0);
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
      setErroBusca(false);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      const thisRequestId = ++searchRequestIdRef.current;
      setIsSearchingCatalog(true);
      setErroBusca(false);
      try {
        // Código tem precedência: quem digitou o código sabe o que quer.
        const termo = activeSapCodeTerm || activeDescriptionTerm;
        const achados = await buscarMateriais(termo, {
          areaUsuario: areaUsuario,
          limite: 20,
        });
        if (searchRequestIdRef.current === thisRequestId) setActiveSearchResults(achados);
      } catch (err) {
        console.error('Erro ao buscar materiais no catálogo SAP:', err);
        if (searchRequestIdRef.current === thisRequestId) {
          setActiveSearchResults([]);
          // Sem isto, falha de rede e "não achei nada" ficam
          // indistinguíveis — os dois mostravam a mesma lista vazia.
          setErroBusca(true);
        }
      } finally {
        if (searchRequestIdRef.current === thisRequestId) setIsSearchingCatalog(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [activeSearchIndex, activeDescriptionTerm, activeSapCodeTerm, areaUsuario, tentativaBusca]);

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

  // Modo edição: `?editar=<id>` carrega uma solicitação já existente neste
  // mesmo formulário. Enquanto ele estiver ativo, o rascunho automático fica
  // fora do caminho — ver `saveDraft`.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [carregandoEdicao, setCarregandoEdicao] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const alvo = params.get('editar');
    if (!alvo) {
      setCarregandoEdicao(false);
      return;
    }

    const req = localDb.getRequests().find(r => r.id === alvo);
    if (!req || !podeEditar(req, user)) {
      onNavigate('/solicitacoes/minhas');
      return;
    }

    setEditandoId(req.id);
    setActiveTab(req.type);
    setCriticality(req.criticality);
    setSectorId(req.solicitante_sector_id || '');
    setJustificativa(req.justificativa || '');
    if (req.comprador_id) setCompradorId(req.comprador_id);
    if (req.tipo_compra) setTipoCompra(req.tipo_compra);
    if (req.data_necessidade) setDataNecessidade(req.data_necessidade);
    if (req.registration_type) setRegistrationType(req.registration_type);
    if (req.type === 'cadastro_sap' && req.justificativa) {
      // Ao criar, Nome/Specs/Justificativa são compostos num único texto (ver
      // handleSubmit) porque o Request não tem campos próprios pra eles. Ao
      // editar, faz o parse reverso pra não deixar os campos em branco.
      const itemMatch = req.justificativa.match(/^Nome: (.*?)\. Specs: (.*?)\. Justificativa: ([\s\S]*)$/);
      const fornecedorMatch = itemMatch ? null : req.justificativa.match(/^Nome: (.*?)\. Justificativa: ([\s\S]*)$/);
      if (itemMatch) {
        setSapRegName(itemMatch[1]);
        setSapRegSpecs(itemMatch[2]);
        setJustificativa(itemMatch[3]);
      } else if (fornecedorMatch) {
        setSapRegName(fornecedorMatch[1]);
        setJustificativa(fornecedorMatch[2]);
      }
    }
    if (req.target_sector_id) setHelpdeskSectorId(req.target_sector_id);
    if (req.category_id) setHelpdeskCategory(req.category_id);
    if (req.local) setHelpdeskLocal(req.local);
    if (req.solicitante_sector_id) setChamadoSectorId(req.solicitante_sector_id);

    const itensExistentes = localDb.getRequestItems(req.id);
    if (itensExistentes.length > 0) {
      // O id vem do banco e é preservado: é o que mantém os anexos colados ao
      // item certo depois de salvar.
      setItems(itensExistentes.map(it => ({
        id: it.id,
        description: it.description,
        sap_code: it.sap_code || '',
        quantity: it.quantity,
        unit: it.unit,
        brand: it.brand || '',
        is_similar_allowed: it.is_similar_allowed ?? true,
        is_generic: it.is_generic || false,
        observation: it.observation || '',
        suggested_supplier: it.suggested_supplier || '',
        estimated_value: it.estimated_value || 0,
      })));
    }

    setCarregandoEdicao(false);
  }, [user, onNavigate]);

  // Load draft if exists
  useEffect(() => {
    // Em modo edição o rascunho não entra: sobrescreveria os dados da
    // solicitação real que acabou de ser carregada.
    if (carregandoEdicao || editandoId) return;

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
        // Rascunho salvo antes do id estável de item não traz `id`; sem este
        // preenchimento o item iria para o banco sem identidade e o anexo
        // perderia a que se prender.
        if (parsed.items) {
          setItems(parsed.items.map((it: PurchaseItemState) => ({ ...it, id: it.id || novoItemId() })));
        }
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
  }, [user, carregandoEdicao, editandoId]);

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
    // O rascunho pertence a uma solicitação sendo criada. Salvá-lo durante a
    // edição de uma solicitação real sobrescreveria o rascunho que o usuário
    // talvez estivesse montando em paralelo.
    if (editandoId) return;

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
    setItems([...items, itemVazio()]);
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

    // Auto-fill descrição/unidade só com o código completo (7 dígitos): todo
    // material_code do catálogo tem exatamente 7 dígitos, então disparar a
    // cada tecla a partir de 4 só gera 3 requisições descartadas por código.
    if (key === 'sap_code' && String(val).trim().length === 7) {
      const code = String(val).trim();
      buscarMateriais(code, { limite: 1 })
        .then(([achado]) => {
          if (!achado || achado.materialCode !== code) return;
          setItems(prev => prev.map((item, i) => {
            if (i !== index || item.sap_code.trim() !== code) return item; // usuário já mudou o campo
            // Unidade não é autopreenchida — fica em "Selecione..." até o
            // usuário confirmar, mesmo quando o catálogo já sabe a unidade.
            return {
              ...item,
              description: achado.description,
              technical_text: achado.technicalText || '',
              sinais: resumoSinais(achado),
            };
          }));
        })
        .catch(err => console.error('Falha ao autopreencher pelo código SAP:', err));
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

    // Criticidade é obrigatória em todos os canais — não é um <select>
    // nativo, então o `required` do HTML não cobre; valida antes de montar
    // o payload, com o mesmo padrão de aviso já usado nesta tela.
    if (criticality === null) {
      alert('Selecione a criticidade antes de enviar.');
      return;
    }

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
            // O id acompanha o item: na criação ele já nasceu no formulário,
            // na edição veio do banco. É o que amarra os anexos.
            id: it.id,
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

      // Os anexos se prendem ao id do item, que já existe neste ponto: nasceu
      // no formulário na criação, ou veio do banco na edição.
      const anexosDeItens = () => activeTab === 'compra'
        ? items.flatMap(item =>
            (item.attachments || []).map(prepared => ({ prepared, requestItemId: item.id }))
          )
        : sapAttachments.map(prepared => ({ prepared }));

      let reqId: string;
      let reqNumero: string;

      if (editandoId) {
        const erro = await localDb.saveRequestEdit(
          editandoId,
          payload,
          activeTab === 'compra' ? payload.items : undefined,
          statusAposEdicao(activeTab)
        );
        if (erro) {
          alert(erro);
          return;
        }
        reqId = editandoId;
        reqNumero = localDb.getRequests().find(r => r.id === editandoId)?.number || '';
      } else {
        const req = await localDb.submitRequest(payload, false);
        reqId = req.id;
        reqNumero = req.number;
        clearDraft();
      }

      const { failed } = await localDb.uploadAttachments(reqId, anexosDeItens());

      if (failed.length > 0) {
        // A solicitação já foi gravada; perder um anexo não pode desfazê-la — o
        // usuário reenviar o arquivo em Minhas Solicitações é o caminho.
        alert(
          `A solicitação #${reqNumero} foi ${editandoId ? 'atualizada' : 'criada'}, mas ${failed.length === 1 ? 'este anexo não subiu' : 'estes anexos não subiram'}: ` +
          `${failed.join(', ')}. Você pode reenviá-${failed.length === 1 ? 'lo' : 'los'} em Minhas Solicitações.`
        );
      }

      // Navigate to tracking
      onNavigate(`/solicitacoes/minhas?id=${reqId}`);
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
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
          {editandoId ? 'Editar Solicitação' : 'Nova Solicitação'}
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          {editandoId ? avisoEdicao(activeTab) : 'Escolha o tipo e preencha o formulário abaixo.'}
        </p>
      </div>

      {/* Seletor de canal — três opções reais, então cabe lado a lado mesmo em
          telas largas; cresce um pouco de porte para preencher a largura sem
          ficar vazio.

          Em modo edição o tipo fica travado: trocar o tipo de uma solicitação
          existente descartaria os campos e itens que só existem no tipo atual. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
        {CHANNELS.map(ch => {
          const active = activeTab === ch.id;
          const Icon = ch.icon;
          if (editandoId && !active) return null;
          return (
            <button
              key={ch.id}
              type="button"
              disabled={!!editandoId}
              onClick={() => { setActiveTab(ch.id); setCriticality(null); }}
              aria-pressed={active}
              className="flex flex-col items-center justify-center p-5 rounded-xl border text-center transition-[transform,box-shadow] duration-200 cursor-pointer hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:hover:translate-y-0"
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
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
                        Item {index + 1}
                      </span>
                      <div className="flex items-center gap-3">
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
                            {erroBusca ? (
                              <div className="p-3 text-xs text-center" style={{ color: 'var(--status-serious)' }}>
                                Não foi possível buscar no catálogo.
                                <button
                                  type="button"
                                  onClick={() => setTentativaBusca(n => n + 1)}
                                  className="block mx-auto mt-1 font-bold underline cursor-pointer"
                                  style={{ color: 'var(--brand)' }}
                                >
                                  Tentar de novo
                                </button>
                              </div>
                            ) : isSearchingCatalog ? (
                              <div className="p-3 text-xs text-center" style={{ color: 'var(--ink-muted)' }}>Buscando no catálogo SAP...</div>
                            ) : activeSearchResults.length === 0 ? (
                              <div className="p-3 text-xs text-center" style={{ color: 'var(--ink-muted)' }}>
                                Nenhum item correspondente no catálogo.
                                <div className="text-[10px] mt-0.5">
                                  Você pode digitar livremente para cadastrar um item novo.
                                </div>
                              </div>
                            ) : (
                              activeSearchResults.map((mat) => {
                                const chips = resumoSinais(mat);
                                return (
                                <button
                                  key={mat.materialCode}
                                  type="button"
                                  onClick={() => {
                                    // Unidade não é autopreenchida — fica em
                                    // "Selecione..." até o usuário confirmar.
                                    const updated = [...items];
                                    updated[index] = {
                                      ...updated[index],
                                      description: mat.description,
                                      sap_code: mat.materialCode,
                                      technical_text: mat.technicalText || '',
                                      sinais: chips,
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
                                    {mat.materialCode}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate" style={{ color: 'var(--ink-primary)' }} title={mat.description}>
                                      {mat.description}
                                    </div>
                                    {mat.technicalText && (
                                      <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                                        {mat.technicalText}
                                      </div>
                                    )}
                                    <SinalChips chips={chips} className="mt-1" />
                                  </div>
                                  <span
                                    className="text-[10px] font-mono px-1 rounded uppercase shrink-0 self-center"
                                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
                                  >
                                    {mat.unit}
                                  </span>
                                </button>
                                );
                              })
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
                          placeholder="0"
                          value={it.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full rounded border py-1 px-2 text-xs tabular transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>

                      {/* Un — sem padrão: UN silencioso escondia a unidade
                          errada passar despercebida. */}
                      <div className="sm:col-span-2 sm:max-w-[140px]">
                        <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Un. *</label>
                        <select
                          required
                          value={it.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          className="w-full rounded border py-1 px-1.5 text-xs cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        >
                          <option value="">Selecione...</option>
                          {UNIDADES.map(un => (
                            <option key={un} value={un}>{un}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Chips de estoque/RM/pedido + texto técnico do catálogo
                        SAP — só aparecem depois que o item é selecionado no
                        dropdown ou autopreenchido pelo código; são ficha do
                        catálogo, não dado do item. Chips vêm em cima do texto
                        técnico: são o resumo, o texto é o detalhe. */}
                    {((it.sinais && it.sinais.length > 0) || it.technical_text) && (
                      <div className="space-y-1.5">
                        <SinalChips chips={it.sinais || []} />
                        {it.technical_text && (
                          <div>
                            <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>
                              Texto Técnico (Catálogo SAP)
                            </label>
                            <p
                              className="w-full rounded border py-1.5 px-2 text-[11px] leading-relaxed"
                              style={{ ...fieldStyle, background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
                            >
                              {it.technical_text}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

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

                    {/* Observação / Informações Técnicas — obrigatória para
                        item genérico: sem código SAP nem ficha de catálogo,
                        é o único lugar onde o comprador sabe o que comprar. */}
                    <div>
                      <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>
                        Observação / Informações Técnicas{it.is_generic ? ' *' : ''}
                      </label>
                      <textarea
                        rows={2}
                        required={it.is_generic || false}
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
                      {/* Em edição, os anexos já enviados aparecem como
                          somente-leitura; os novos entram pelo seletor abaixo. */}
                      {editandoId && (
                        <div className="mb-2">
                          <AttachmentGallery
                            requestId={editandoId}
                            itemId={it.id}
                            onDelete={(anexoId) => localDb.deleteAttachment(anexoId)}
                          />
                        </div>
                      )}
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
                {editandoId && (
                  <div className="mb-2">
                    <AttachmentGallery
                      requestId={editandoId}
                      onDelete={(anexoId) => localDb.deleteAttachment(anexoId)}
                    />
                  </div>
                )}
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

            {criticality !== null && criticality >= 4 && (
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
                  <span>{editandoId ? 'Salvando alterações...' : 'Enviando solicitação...'}</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>{editandoId ? 'Salvar alterações' : 'Enviar solicitação'}</span>
                </>
              )}
            </button>

            {editandoId && (
              <p className="text-[11px] text-center" style={{ color: 'var(--ink-muted)' }}>
                {avisoEdicao(activeTab)}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                if (editandoId) { onNavigate(`/solicitacoes/minhas?id=${editandoId}`); return; }
                clearDraft();
                onNavigate('/');
              }}
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
