/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShoppingBag, ClipboardCopy, Radio, Plus, Trash2, Calendar,
  AlertTriangle, Save, Loader2, Search, Circle, CheckCircle2,
  AlertCircle, Siren, Laptop2, Building2, Wrench, X, Scale, Clock,
  ListChecks, Gauge, Send, Link as LinkIcon, ExternalLink, FileText, HelpCircle, Bug, Lightbulb, RotateCcw,
  ReceiptText,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import { Profile, RequestItem, RequestType, RequestStatus, RequestAttachment } from '../types';
import { formatBRL, formatDateBR } from '../lib/format';
import { NOME_SETOR_JURIDICO, TIPOS_CHAMADO_JURIDICO, TIPOS_CONTRATO_JURIDICO, calcularPrazoSlaJuridico, isJuridicoSector } from '../lib/juridico';
import { buscarMateriais, resumoSinais, type MaterialResultado, type SinalChip } from '../lib/materiais';
import { AttachmentPicker, AttachmentGallery } from '../components/ui/Attachments';
import { SinalChips } from '../components/ui/SinalChips';
import MaterialSearchModal from '../components/MaterialSearchModal';
import { PreparedAttachment } from '../lib/imageCompression';
import { novoItemId } from '../lib/ids';
import { podeEditar, statusAposEdicao, avisoEdicao } from '../lib/solicitacoes';
import TourSpotlight from '../components/help/TourSpotlight';
import { usePageTour } from '../components/help/TourRegistryContext';
import type { TourStep } from '../components/help/types';
import { useToast } from '../components/ui/Toast';
import { obterConfigEmail, montarMailtoComConfig } from '../lib/emailConfigApi';
import {
  CATEGORIA_PENDENCIA_PROCESSAMENTO,
  CATEGORIA_AJUSTE_PEDIDO,
  CATEGORIAS_SUPRIMENTOS,
  isSuprimentosSector,
  parseColagemPlanilha,
  somarValores,
  resumoColunas,
  resumoValores,
  gerarProtocoloSup,
  assuntoEmailPendencias,
  montarCorpoEmailPendencias,
  assuntoEmailAjustePedido,
  montarCorpoEmailAjustePedido,
} from '../lib/supPendenciasProcessamento';
import { proximoIndiceProtocoloDia, criarPendencias, criarAjustePedido, salvarImagensAjuste } from '../lib/supPendenciasApi';
import ImagesPasteInput from '../components/ui/ImagesPasteInput';

const NOVA_SOLICITACAO_TOUR_STEPS: TourStep[] = [
  {
    icon: ShoppingBag,
    title: 'Bem-vindo à Nova Solicitação',
    description: 'Aqui você abre pedidos de compra, cadastro no SAP ou chamados de suporte. Vamos conhecer as partes principais da tela.',
  },
  {
    target: 'novasol-canais',
    icon: CheckCircle2,
    title: 'Escolha o tipo de solicitação',
    description: 'Compra pede itens de material. Cadastro SAP registra um item ou fornecedor novo no sistema. Chamado abre um suporte (TI, Facilities, Jurídico...). O formulário abaixo muda conforme a escolha.',
  },
  {
    target: 'novasol-formulario',
    icon: Search,
    title: 'Preencha os dados do pedido',
    description: 'Em Compra, digite o código SAP ou a descrição para buscar no catálogo — os campos são preenchidos automaticamente ao selecionar um resultado.',
  },
  {
    target: 'novasol-descricao-busca',
    icon: Search,
    title: 'Digite ou busque no catálogo',
    description: 'Digite a descrição para ver sugestões do catálogo SAP aparecerem logo abaixo, ou clique em "Buscar" para abrir a janela de pesquisa e procurar com calma.',
  },
  {
    target: 'novasol-item-generico',
    icon: CheckCircle2,
    title: 'Item sem código no catálogo?',
    description: 'Marque "Item Genérico" quando não encontrar o material no SAP. Ao marcar, o campo de Observação passa a ser obrigatório — descreva ali as especificações técnicas para o comprador entender o que comprar.',
  },
  {
    target: 'novasol-add-item',
    icon: Plus,
    title: 'Peça mais de um item na mesma solicitação',
    description: 'Cada clique adiciona uma nova linha de item, com seus próprios campos, observações e anexos.',
  },
  {
    target: 'novasol-justificativa',
    icon: FileText,
    title: 'Justifique tecnicamente o pedido',
    description: 'Descreva a necessidade com detalhes — é o que o comprador ou o setor responsável usa para entender e aprovar mais rápido.',
  },
  {
    target: 'novasol-prazo',
    icon: Calendar,
    title: 'Informe o prazo necessário',
    description: 'A data limite de necessidade ajuda o comprador a priorizar sua solicitação junto às demais.',
  },
  {
    target: 'novasol-criticidade',
    icon: Gauge,
    title: 'Defina a criticidade',
    description: 'Grau 4 ou 5 notifica os gestores automaticamente e prioriza a numeração. Escolha com honestidade — isso afeta o SLA de atendimento.',
  },
  {
    target: 'novasol-enviar',
    icon: Send,
    title: 'Envie quando estiver pronto',
    description: 'Um rascunho é salvo automaticamente a cada 30 segundos, então você pode sair e continuar depois.',
  },
  {
    target: 'help-button',
    icon: HelpCircle,
    title: 'Reabra o tour a qualquer momento',
    description: 'Ficou com alguma dúvida ou quer rever as dicas desta tela? Clique neste botão a qualquer momento no canto inferior e escolha "Tour guiado desta página".',
  },
  {
    target: 'help-button',
    icon: Bug,
    title: 'Encontrou um erro nesta tela?',
    description: 'No mesmo botão, escolha "Reportar um erro" para descrever o problema — o histórico técnico recente da sessão vai junto, direto para o time responsável.',
  },
  {
    target: 'help-button',
    icon: Lightbulb,
    title: 'Tem uma ideia de melhoria?',
    description: 'Escolha "Enviar sugestão" no mesmo botão para propor uma melhoria a qualquer momento, sem sair da tela.',
  },
];

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
  reference_link?: string;
  suggested_supplier: string;
  estimated_value: number;
  /**
   * Anexos já comprimidos, aguardando o submit para subir. Ficam presos ao item
   * (e não num mapa por índice à parte) para acompanharem naturalmente a
   * inclusão e a remoção de linhas. Não entram no rascunho: `Blob` não
   * sobrevive a `JSON.stringify` — ver `saveDraft`.
   */
  attachments?: PreparedAttachment[];
  /** Anexos reaproveitados do banco de imagens (já existem no Storage — ver Attachments.tsx). */
  reusedAttachments?: RequestAttachment[];
}

/* --------------------------------------------------------------------- */
/* Estilos de campo compartilhados nesta página                           */
/* --------------------------------------------------------------------- */

const fieldClass = 'w-full rounded-lg border py-2 px-3 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1';
const fieldStyle: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};
const labelClass = 'text-sm font-bold block mb-1';
const labelStyle: React.CSSProperties = { color: 'var(--ink-secondary)' };

const itemVazio = (): PurchaseItemState => ({
  id: novoItemId(),
  description: '', sap_code: '', technical_text: '', quantity: '', unit: '', brand: '',
  is_similar_allowed: true, is_generic: false, observation: '', reference_link: '',
  suggested_supplier: '', estimated_value: 0,
});

/** UN até PAC, em ordem alfabética visual — "M²"/"M³" lidos como "M2"/"M3". */
const UNIDADES = ['GAL', 'KG', 'L', 'M', 'M²', 'M³', 'PAC', 'UN'] as const;

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
  'Suprimentos': ReceiptText,
  [NOME_SETOR_JURIDICO]: Scale,
};

export default function NewRequest({ user, onNavigate }: NewRequestProps) {
  const toast = useToast();
  const tour = usePageTour('nova-solicitacao', NOVA_SOLICITACAO_TOUR_STEPS.length);
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
  /** Item cujo modal de busca ampliada está aberto, ou null. */
  const [buscaModalIndex, setBuscaModalIndex] = useState<number | null>(null);
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

    // Código tem precedência: quem digitou o código sabe o que quer.
    const termo = activeSapCodeTerm || activeDescriptionTerm;

    // O piso da lib é 3 caracteres (limite do índice trigram). Aqui exigimos
    // 4, porque este caminho dispara sozinho: com 3 letras a sugestão quase
    // nunca é útil e o request sai a cada palavra começada. Quem quer buscar
    // com pouco texto usa o botão — lá a intenção é explícita.
    if (!activeSapCodeTerm && termo.length < 4) {
      setActiveSearchResults([]);
      setIsSearchingCatalog(false);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      const thisRequestId = ++searchRequestIdRef.current;
      setIsSearchingCatalog(true);
      setErroBusca(false);
      try {
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
      // 600ms em vez de 300: numa descrição de catálogo a pessoa digita várias
      // palavras seguidas, e a pausa curta transformava cada uma delas num
      // request cuja resposta ninguém chegava a ler.
    }, 600);

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
  const [sapRepresentanteNome, setSapRepresentanteNome] = useState('');
  const [sapRepresentanteCargo, setSapRepresentanteCargo] = useState('');
  const [sapRepresentanteTelefone, setSapRepresentanteTelefone] = useState('');
  const [sapRepresentanteEmail, setSapRepresentanteEmail] = useState('');
  // Cadastro SAP não tem itens, então os anexos se prendem à solicitação. Fora
  // do rascunho pelo mesmo motivo dos anexos de item (Blob não serializa).
  const [sapAttachments, setSapAttachments] = useState<PreparedAttachment[]>([]);

  // Specific for Helpdesk Chamados
  const [chamadoSectorId, setChamadoSectorId] = useState(''); // Setor solicitante — sem pré-seleção
  const [helpdeskSectorId, setHelpdeskSectorId] = useState(''); // E.g., '9' for TI, '3' for Facilities
  const [helpdeskCategory, setHelpdeskCategory] = useState('');
  const [helpdeskLocal, setHelpdeskLocal] = useState('');
  // Específicos do destino Jurídico
  const [juridicoTitulo, setJuridicoTitulo] = useState('');
  const [juridicoTipoContrato, setJuridicoTipoContrato] = useState('');
  const [juridicoFornecedor, setJuridicoFornecedor] = useState('');
  // Específico do destino Suprimentos: texto da planilha de pendências colado
  // pelo solicitante, interpretado em linhas de NF na prévia e no envio.
  const [pendenciasTexto, setPendenciasTexto] = useState('');
  // Específicos da categoria "Ajuste de Pedido" (destino Suprimentos).
  const [ajusteDemanda, setAjusteDemanda] = useState('');
  const [ajusteNf, setAjusteNf] = useState('');
  const [ajustePedido, setAjustePedido] = useState('');
  const [ajusteFornecedor, setAjusteFornecedor] = useState('');
  const [ajusteComprador, setAjusteComprador] = useState(''); // opcional
  // Imagens comprimidas; fora do rascunho (Blob não serializa), como sapAttachments.
  const [ajusteImagens, setAjusteImagens] = useState<PreparedAttachment[]>([]);

  // States
  const [uploadProgress, setUploadProgress] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');

  // Lista de compradores responsáveis vem da tabela compradores (grupo_compras/nome_comprador),
  // resolvendo o usuário do sistema vinculado via buyer_groups para manter o comprador_id
  // apontando para um profile válido (usado nos painéis "Minhas Solicitações" do comprador).
  const [compradoresList, setCompradoresList] = useState<{ grupo_compras: string; nome_comprador: string }[]>([]);
  useEffect(() => {
    supabase.from('sup_compradores').select('*').order('nome_comprador').then(({ data, error }) => {
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
  // Nomes de comprador únicos, para o seletor opcional do "Ajuste de Pedido".
  const compradorNomes = Array.from(
    new Set(compradoresList.map(c => c.nome_comprador).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Modo edição: `?editar=<id>` carrega uma solicitação já existente neste
  // mesmo formulário. Enquanto ele estiver ativo, o rascunho automático fica
  // fora do caminho — ver `saveDraft`.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [carregandoEdicao, setCarregandoEdicao] = useState(true);
  const editLoadedRef = useRef(false);
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    if (editLoadedRef.current) return;
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const alvo = params.get('editar');
    if (!alvo) {
      setCarregandoEdicao(false);
      return;
    }
    editLoadedRef.current = true;

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
      if (req.brand) setSapRegBrand(req.brand);
      if (req.suggested_supplier) setSapRegVendorInfo(req.suggested_supplier);
      if (req.representante_nome) setSapRepresentanteNome(req.representante_nome);
      if (req.representante_cargo) setSapRepresentanteCargo(req.representante_cargo);
      if (req.representante_telefone) setSapRepresentanteTelefone(req.representante_telefone);
      if (req.representante_email) setSapRepresentanteEmail(req.representante_email);
    }
    if (req.target_sector_id) setHelpdeskSectorId(req.target_sector_id);
    if (req.category_id) setHelpdeskCategory(req.category_id);
    if (req.local) setHelpdeskLocal(req.local);
    if (req.titulo) setJuridicoTitulo(req.titulo);
    if (req.contrato_tipo) setJuridicoTipoContrato(req.contrato_tipo);
    if (req.fornecedor_terceiro) setJuridicoFornecedor(req.fornecedor_terceiro);
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
        reference_link: it.reference_link || '',
        suggested_supplier: it.suggested_supplier || '',
        estimated_value: it.estimated_value || 0,
      })));
    }

    setCarregandoEdicao(false);
  }, [user.id, onNavigate]);

  // Abre o tour sozinho na primeira visita — só para quem está criando uma
  // solicitação nova, nunca durante uma edição (o fluxo e o foco são outros).
  useEffect(() => {
    tour.autoOpenWhenReady(!carregandoEdicao && !editandoId);
  }, [carregandoEdicao, editandoId, tour.autoOpenWhenReady]);

  // Load draft if exists (executa estritamente uma única vez no carregamento inicial)
  useEffect(() => {
    // Em modo edição o rascunho não entra: sobrescreveria os dados da
    // solicitação real que acabou de ser carregada.
    if (carregandoEdicao || editandoId) return;
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;

    const draftKey = `sisten_draft_${user.id}`;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.activeTab) setActiveTab(parsed.activeTab);
        if (parsed.sectorId) setSectorId(parsed.sectorId);
        if (parsed.compradorId) setCompradorId(parsed.compradorId);
        if (parsed.tipoCompra) setTipoCompra(parsed.tipoCompra);
        if (parsed.criticality !== undefined && parsed.criticality !== null) setCriticality(parsed.criticality);
        if (parsed.dataNecessidade) setDataNecessidade(parsed.dataNecessidade);
        if (parsed.justificativa) setJustificativa(parsed.justificativa);
        // Rascunho salvo antes do id estável de item não traz `id`; sem este
        // preenchimento o item iria para o banco sem identidade e o anexo
        // perderia a que se prender.
        if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
          setItems(parsed.items.map((it: PurchaseItemState) => ({ ...it, id: it.id || novoItemId() })));
        }
        if (parsed.registrationType) setRegistrationType(parsed.registrationType);
        if (parsed.sapRegName) setSapRegName(parsed.sapRegName);
        if (parsed.sapRegSpecs) setSapRegSpecs(parsed.sapRegSpecs);
        if (parsed.sapRegBrand) setSapRegBrand(parsed.sapRegBrand);
        if (parsed.sapRegVendorInfo) setSapRegVendorInfo(parsed.sapRegVendorInfo);
        if (parsed.sapRepresentanteNome) setSapRepresentanteNome(parsed.sapRepresentanteNome);
        if (parsed.sapRepresentanteCargo) setSapRepresentanteCargo(parsed.sapRepresentanteCargo);
        if (parsed.sapRepresentanteTelefone) setSapRepresentanteTelefone(parsed.sapRepresentanteTelefone);
        if (parsed.sapRepresentanteEmail) setSapRepresentanteEmail(parsed.sapRepresentanteEmail);
        if (parsed.chamadoSectorId) setChamadoSectorId(parsed.chamadoSectorId);
        if (parsed.helpdeskSectorId) {
          setHelpdeskSectorId(parsed.helpdeskSectorId);
        } else {
          const supportSectors = sectors.filter(s => s.helpdesk_enabled);
          if (supportSectors.length > 0) setHelpdeskSectorId(supportSectors[0].id);
        }
        if (parsed.helpdeskCategory) setHelpdeskCategory(parsed.helpdeskCategory);
        if (parsed.helpdeskLocal) setHelpdeskLocal(parsed.helpdeskLocal);
        if (parsed.juridicoTitulo) setJuridicoTitulo(parsed.juridicoTitulo);
        if (parsed.juridicoTipoContrato) setJuridicoTipoContrato(parsed.juridicoTipoContrato);
        if (parsed.juridicoFornecedor) setJuridicoFornecedor(parsed.juridicoFornecedor);
        if (parsed.pendenciasTexto) setPendenciasTexto(parsed.pendenciasTexto);
        if (parsed.ajusteDemanda) setAjusteDemanda(parsed.ajusteDemanda);
        if (parsed.ajusteNf) setAjusteNf(parsed.ajusteNf);
        if (parsed.ajustePedido) setAjustePedido(parsed.ajustePedido);
        if (parsed.ajusteFornecedor) setAjusteFornecedor(parsed.ajusteFornecedor);
        if (parsed.ajusteComprador) setAjusteComprador(parsed.ajusteComprador);
      } catch (err) {
        console.error('Error loading draft', err);
      }
    } else {
      // Se não há rascunho anterior, define o setor de helpdesk padrão
      const supportSectors = sectors.filter(s => s.helpdesk_enabled);
      if (supportSectors.length > 0) {
        setHelpdeskSectorId(supportSectors[0].id);
      }
    }
  }, [user.id, carregandoEdicao, editandoId, sectors]);

  // Draft autosave com debounce ao alterar campos + intervalo periódico de garantia
  useEffect(() => {
    if (!draftLoadedRef.current || editandoId) return;

    const timeout = setTimeout(() => {
      saveDraft();
    }, 1200);

    return () => clearTimeout(timeout);
  }, [
    activeTab, sectorId, compradorId, tipoCompra, criticality, dataNecessidade, justificativa,
    items, registrationType, sapRegName, sapRegSpecs, sapRegBrand, sapRegVendorInfo,
    sapRepresentanteNome, sapRepresentanteCargo, sapRepresentanteTelefone, sapRepresentanteEmail,
    chamadoSectorId, helpdeskSectorId, helpdeskCategory, helpdeskLocal,
    juridicoTitulo, juridicoTipoContrato, juridicoFornecedor, pendenciasTexto,
    ajusteDemanda, ajusteNf, ajustePedido, ajusteFornecedor, ajusteComprador,
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
      sapRepresentanteNome, sapRepresentanteCargo, sapRepresentanteTelefone, sapRepresentanteEmail,
      chamadoSectorId, helpdeskSectorId, helpdeskCategory, helpdeskLocal,
      juridicoTitulo, juridicoTipoContrato, juridicoFornecedor, pendenciasTexto,
      ajusteDemanda, ajusteNf, ajustePedido, ajusteFornecedor, ajusteComprador,
    };
    localStorage.setItem(`sisten_draft_${user.id}`, JSON.stringify(draftData));
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  const clearDraft = () => {
    localStorage.removeItem(`sisten_draft_${user.id}`);
  };

  const handleResetForm = () => {
    if (editandoId) return;

    const confirmed = window.confirm(
      'Tem certeza de que deseja limpar todos os campos e apagar o rascunho para comecar uma nova solicitacao?'
    );
    if (!confirmed) return;

    clearDraft();
    draftLoadedRef.current = true;
    setActiveTab('compra');
    setSectorId('');
    setCompradorId('');
    setTipoCompra('Estoque');
    setCriticality(null);
    setDataNecessidade('');
    setJustificativa('');
    setItems([itemVazio()]);
    setRegistrationType('Item');
    setSapRegName('');
    setSapRegSpecs('');
    setSapRegBrand('');
    setSapRegVendorInfo('');
    setSapRepresentanteNome('');
    setSapRepresentanteCargo('');
    setSapRepresentanteTelefone('');
    setSapRepresentanteEmail('');
    setSapAttachments([]);
    setChamadoSectorId('');
    const supportSectors = sectors.filter(s => s.helpdesk_enabled);
    setHelpdeskSectorId(supportSectors.length > 0 ? supportSectors[0].id : '');
    setHelpdeskCategory('');
    setHelpdeskLocal('');
    setJuridicoTitulo('');
    setJuridicoTipoContrato('');
    setJuridicoFornecedor('');
    setPendenciasTexto('');
    setAjusteDemanda('');
    setAjusteNf('');
    setAjustePedido('');
    setAjusteFornecedor('');
    setAjusteComprador('');
    setAjusteImagens([]);
    setActiveSearchIndex(null);
    setActiveSearchResults([]);
    setErroBusca(false);
    setBuscaModalIndex(null);
    setAutosaveStatus('idle');

    toast.info('Formulario reiniciado e rascunho apagado.');
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
    } else if (isJuridicoSector(sectors.find(s => s.id === secId))) {
      return [...TIPOS_CHAMADO_JURIDICO];
    } else if (isSuprimentosSector(sectors.find(s => s.id === secId))) {
      return [...CATEGORIAS_SUPRIMENTOS];
    } else { // Manutenção / Others
      return ['Elétrica', 'Hidráulica', 'Climatização', 'Equipamento', 'Outro'];
    }
  };

  const isDestinoJuridico = isJuridicoSector(sectors.find(s => s.id === helpdeskSectorId));
  const isDestinoSuprimentos = isSuprimentosSector(sectors.find(s => s.id === helpdeskSectorId));
  // Categorias do destino Suprimentos.
  const isSupPendencia = isDestinoSuprimentos && helpdeskCategory === CATEGORIA_PENDENCIA_PROCESSAMENTO;
  const isAjustePedido = isDestinoSuprimentos && helpdeskCategory === CATEGORIA_AJUSTE_PEDIDO;

  // Prévia das notas reconhecidas no texto colado (categoria "Pendência de Processamento").
  const pendenciasParse = useMemo(
    () => parseColagemPlanilha(pendenciasTexto),
    [pendenciasTexto],
  );
  const pendenciasProntas = isSupPendencia
    && pendenciasParse.linhas.length > 0
    && pendenciasParse.erros.length === 0;
  const ajustePronto = isAjustePedido
    && ajusteDemanda.trim() !== ''
    && ajusteNf.trim() !== ''
    && ajustePedido.trim() !== ''
    && ajusteFornecedor.trim() !== ''
    && ajusteImagens.length > 0;
  /** O envio deste chamado Suprimentos está bloqueado por falta de dados? */
  const suprimentosBloqueado = isDestinoSuprimentos && !pendenciasProntas && !ajustePronto;

  // Monta o corpo do e-mail de aviso ao Suprimentos com o conteúdo preenchido no
  // formulário. Um mailto: não consegue anexar arquivos (restrição de segurança
  // do navegador/SO) — por isso os anexos entram como lista + link para a
  // solicitação no SISTEN, e o usuário precisa anexá-los manualmente no Outlook.
  const buildCadastroSapEmailBody = (reqId: string, reqNumero: string): string => {
    const linhas: string[] = [
      'Olá, Jeff!',
      '',
      'Abri uma solicitação de cadastro no SAP:',
      '',
      `Número da solicitação: #${reqNumero}`,
      `Tipo de cadastro: ${registrationType}`,
      `Solicitante: ${user.name}${user.cargo ? ` (${user.cargo})` : ''}`,
      '',
      registrationType === 'Item' ? `Nome / Descrição: ${sapRegName}` : `Razão Social / Nome Fantasia: ${sapRegName}`,
      registrationType === 'Item' ? `Fabricante: ${sapRegBrand}` : `CNPJ / Site corporativo: ${sapRegBrand}`,
      registrationType === 'Item' ? `Fornecedor de referência: ${sapRegVendorInfo || '—'}` : `Representante / Contato: ${sapRegVendorInfo || '—'}`,
    ];

    if (registrationType === 'Fornecedor') {
      linhas.push(
        `Nome do representante: ${sapRepresentanteNome || '—'}`,
        `Cargo: ${sapRepresentanteCargo || '—'}`,
        `Telefone: ${sapRepresentanteTelefone || '—'}`,
        `E-mail: ${sapRepresentanteEmail || '—'}`
      );
    }

    if (registrationType === 'Item') {
      linhas.push('', `Especificações técnicas: ${sapRegSpecs}`);
    }

    linhas.push('', `Justificativa: ${justificativa}`);

    linhas.push(
      '',
      `Anexos (${sapAttachments.length}) - ${sapAttachments.length > 0 ? 'Essa solicitação contém anexos' : 'Essa solicitação não contém anexos'}`
    );

    linhas.push(
      '',
      `Acompanhe a solicitação no SISTEN: ${window.location.origin}/#/solicitacoes/minhas?id=${reqId}`
    );

    return linhas.join('\n');
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

    if (activeTab === 'chamado' && isDestinoSuprimentos && !helpdeskCategory) {
      alert('Selecione a categoria do chamado.');
      return;
    }
    if (activeTab === 'chamado' && isSupPendencia && !pendenciasProntas) {
      alert('Cole o texto da planilha de pendências. Nenhum registro foi reconhecido no conteúdo colado.');
      return;
    }
    if (activeTab === 'chamado' && isAjustePedido && !ajustePronto) {
      alert('Preencha a demanda, o número da NF, o número do pedido, o fornecedor e anexe a imagem.');
      return;
    }

    setUploadProgress(true);

    // Protocolo SUP-DDMMAA-NN do chamado de pendências — gerado antes do payload
    // para já entrar em `titulo` e acompanhar a solicitação nas listagens.
    let protocoloSup = '';

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
            reference_link: it.reference_link || '',
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
          suggested_supplier: sapRegVendorInfo,
          ...(registrationType === 'Fornecedor' && {
            representante_nome: sapRepresentanteNome,
            representante_cargo: sapRepresentanteCargo,
            representante_telefone: sapRepresentanteTelefone,
            representante_email: sapRepresentanteEmail,
          })
        };
      } else if (activeTab === 'chamado') {
        if (isDestinoSuprimentos) {
          const hojeISO = new Date().toISOString().slice(0, 10);
          const indice = await proximoIndiceProtocoloDia(hojeISO);
          protocoloSup = gerarProtocoloSup(indice, hojeISO);
        }
        payload = {
          ...payload,
          solicitante_sector_id: chamadoSectorId,
          target_sector_id: helpdeskSectorId,
          category_id: isDestinoSuprimentos
            ? helpdeskCategory
            : (helpdeskCategory || getHelpdeskCategories(helpdeskSectorId)[0]),
          justificativa: isSupPendencia
            ? `${pendenciasParse.linhas.length} ${pendenciasParse.modelo === 'documento' ? 'lançamento(s)' : 'nota(s) fiscal(is)'} para processamento (protocolo ${protocoloSup}). Ver a relação no chamado.`
            : isAjustePedido
              ? `Ajuste de pedido (protocolo ${protocoloSup}) — NF ${ajusteNf.trim()} / Pedido ${ajustePedido.trim()} / ${ajusteFornecedor.trim()}. Ver detalhes e imagem no chamado.`
              : justificativa,
          local: isDestinoSuprimentos ? '' : helpdeskLocal,
          ...(isDestinoJuridico && {
            titulo: juridicoTitulo,
            contrato_tipo: juridicoTipoContrato,
            fornecedor_terceiro: juridicoFornecedor,
          }),
          ...(isDestinoSuprimentos && { titulo: protocoloSup }),
        };
      }

      // Os anexos se prendem ao id do item, que já existe neste ponto: nasceu
      // no formulário na criação, ou veio do banco na edição.
      const anexosDeItens = () => activeTab === 'compra'
        ? items.flatMap(item =>
            (item.attachments || []).map(prepared => ({ prepared, requestItemId: item.id }))
          )
        : sapAttachments.map(prepared => ({ prepared }));

      // Fotos reaproveitadas do banco de imagens (já existem no Storage —
      // ver "Buscar imagem" no AttachmentPicker): vinculam sem reenviar bytes.
      const anexosReaproveitados = () => activeTab === 'compra'
        ? items.flatMap(item =>
            (item.reusedAttachments || []).map(attachment => ({ attachment, requestItemId: item.id }))
          )
        : [];

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
      const { failed: falhasReaproveitadas } = await localDb.linkExistingAttachments(reqId, anexosReaproveitados());
      const todasAsFalhas = [...failed, ...falhasReaproveitadas];

      if (todasAsFalhas.length > 0) {
        // A solicitação já foi gravada; perder um anexo não pode desfazê-la — o
        // usuário reenviar o arquivo em Minhas Solicitações é o caminho.
        alert(
          `A solicitação #${reqNumero} foi ${editandoId ? 'atualizada' : 'criada'}, mas ${todasAsFalhas.length === 1 ? 'este anexo não subiu' : 'estes anexos não subiram'}: ` +
          `${todasAsFalhas.join(', ')}. Você pode reenviá-${todasAsFalhas.length === 1 ? 'lo' : 'los'} em Minhas Solicitações.`
        );
      }

      if (activeTab === 'chamado' && isDestinoSuprimentos) {
        const configEmail = await obterConfigEmail('helpdesk_suprimentos');
        const destinatarios = configEmail?.destinatarios || 'suprimentosten@ten.ind.br';
        const linkChamado = `${window.location.origin}/#/solicitacoes/minhas?id=${reqId}`;
        let assunto = '';
        let corpo = '';

        if (isAjustePedido) {
          const dados = {
            demanda: ajusteDemanda.trim(),
            nf: ajusteNf.trim(),
            pedido: ajustePedido.trim(),
            fornecedor: ajusteFornecedor.trim(),
            comprador: ajusteComprador.trim() || undefined,
          };
          try {
            const rowId = await criarAjustePedido(reqId, protocoloSup, dados);
            if (rowId && ajusteImagens.length > 0) {
              const ok = await salvarImagensAjuste(
                rowId,
                reqId,
                ajusteImagens.map(i => ({ blob: i.blob, mimeType: i.mimeType })),
              );
              if (!ok) toast.warning('O chamado foi criado, mas as imagens não subiram. Reenvie pela página de Pendências.');
            }
          } catch {
            alert(`O chamado #${reqNumero} foi criado, mas o ajuste de pedido não pôde ser gravado. Contate o suporte.`);
          }
          assunto = assuntoEmailAjustePedido(protocoloSup, dados);
          corpo = montarCorpoEmailAjustePedido({
            protocolo: protocoloSup,
            solicitante: user.name,
            numeroChamado: reqNumero,
            dados,
            qtdImagens: ajusteImagens.length,
            linkChamado,
          });
        } else {
          try {
            await criarPendencias(reqId, protocoloSup, pendenciasParse.linhas);
          } catch {
            alert(
              `O chamado #${reqNumero} foi criado, mas a relação de notas não pôde ser gravada. ` +
              `Abra um novo chamado ou contate o suporte.`
            );
          }
          assunto = assuntoEmailPendencias(protocoloSup);
          corpo = montarCorpoEmailPendencias({
            protocolo: protocoloSup,
            solicitante: user.name,
            numeroChamado: reqNumero,
            linkChamado,
            linhas: pendenciasParse.linhas,
          });
        }

        // O corpo vai sempre montado no e-mail — nada de "copie e cole".
        window.location.href = montarMailtoComConfig({
          destinatarios,
          copia: configEmail?.copia,
          copiaOculta: configEmail?.copia_oculta,
          assunto,
          corpo,
        });
      }

      if (activeTab === 'cadastro_sap') {
        const configEmail = await obterConfigEmail('cadastro_sap');
        const subject = configEmail?.assunto_padrao
          ? `${configEmail.assunto_padrao} #${reqNumero}`
          : `Cadastro SAP #${reqNumero}`;
        const body = buildCadastroSapEmailBody(reqId, reqNumero);
        const mailtoUrl = montarMailtoComConfig({
          destinatarios: configEmail?.destinatarios || 'jefferson.santana@ten.ind.br',
          copia: configEmail?.copia,
          copiaOculta: configEmail?.copia_oculta,
          assunto: subject,
          corpo: body,
        });
        window.location.href = mailtoUrl;
        if (sapAttachments.length > 0) {
          toast.info('E-mail aberto no Outlook. Anexe os arquivos manualmente antes de enviar — o link não inclui anexos.');
        }
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
    <div className="space-y-6 text-left w-full pb-12">
      <div className="reveal">
        <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
          {editandoId ? 'Editar Solicitação' : 'Nova Solicitação'}
        </h2>
        <p className="mt-1 text-base" style={{ color: 'var(--ink-secondary)' }}>
          {editandoId ? avisoEdicao(activeTab) : 'Escolha o tipo e preencha o formulário abaixo.'}
        </p>
      </div>

      {/* Seletor de canal — três opções reais, então cabe lado a lado mesmo em
          telas largas; cresce um pouco de porte para preencher a largura sem
          ficar vazio.

          Em modo edição o tipo fica travado: trocar o tipo de uma solicitação
          existente descartaria os campos e itens que só existem no tipo atual. */}
      <div data-tour="novasol-canais" className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
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
              <span className={`mt-2.5 text-base ${active ? 'font-bold' : 'font-semibold'}`}>{ch.label}</span>
              <span className="text-[12px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>{ch.hint}</span>
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
      <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 items-start">
        {/* Coluna principal */}
        <div className="space-y-6 min-w-0">
        <div data-tour="novasol-formulario" className="rounded-xl border p-6 shadow-xs space-y-4 reveal" style={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--hairline)' }}>
            <h3 className="font-bold text-base flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
              <ListChecks className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
              O que você precisa?
            </h3>
            <div className="flex items-center gap-3">
              {autosaveStatus === 'saving' && (
                <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--ink-muted)' }}>
                  <Loader2 className="animate-spin h-3 w-3" /> Salvando rascunho...
                </span>
              )}
              {autosaveStatus === 'saved' && (
                <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: 'var(--status-good)' }}>
                  <CheckCircle2 className="h-3 w-3" /> Rascunho salvo
                </span>
              )}
              <button
                type="button"
                onClick={saveDraft}
                className="text-[11px] inline-flex items-center gap-1 font-bold cursor-pointer transition-colors duration-150 hover:text-[var(--ink-primary)]"
                style={{ color: 'var(--ink-muted)' }}
              >
                <Save className="h-3 w-3" /> Salvar agora
              </button>
              {!editandoId && (
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="text-[11px] inline-flex items-center gap-1 font-bold cursor-pointer transition-colors duration-150 hover:text-[var(--status-critical)]"
                  style={{ color: 'var(--ink-muted)' }}
                  title="Limpar todos os campos e apagar rascunho"
                >
                  <RotateCcw className="h-3 w-3" /> Limpar / Novo
                </button>
              )}
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
                        className="rounded py-1 text-center text-[11px] font-bold uppercase cursor-pointer transition-colors duration-150"
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
                  <span className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Itens solicitados *</span>
                  <button
                    type="button"
                    data-tour="novasol-add-item"
                    onClick={handleAddItem}
                    className="flex items-center gap-1 text-sm font-bold cursor-pointer transition-colors duration-150 hover:text-[var(--brand-strong)]"
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
                      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
                        Item {index + 1}
                      </span>
                      <div className="flex items-center gap-3">
                        <label data-tour="novasol-item-generico" className="inline-flex items-center gap-1.5 text-sm font-semibold cursor-pointer select-none" style={{ color: 'var(--ink-secondary)' }}>
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
                          <div className="w-28 shrink-0">
                            <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Código SAP</label>
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
                              className="w-full rounded border py-1 px-2 text-sm font-mono transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                              style={fieldStyle}
                            />
                          </div>
                          <div data-tour="novasol-descricao-busca" className="flex-1">
                            <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Descrição *</label>
                            <div className="flex gap-1.5">
                              <div className="relative flex-1">
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
                                  className="w-full rounded border py-1 pl-7 pr-2 text-sm font-medium transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                                  style={fieldStyle}
                                />
                              </div>
                              {/* Escape para o caso difícil: termo genérico, muita
                                  quase-duplicata, decisão que pede ler a lista
                                  inteira em vez de espiar um dropdown de 60px. */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSearchIndex(null);
                                  setBuscaModalIndex(index);
                                }}
                                title="Abrir o catálogo SAP para buscar com calma"
                                className="shrink-0 rounded border px-2.5 text-[11px] font-bold transition-colors hover:bg-[var(--surface-raised)]"
                                style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}
                              >
                                Buscar
                              </button>
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
                              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between sticky top-0 border-b"
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
                              <div className="p-3 text-sm text-center" style={{ color: 'var(--status-serious)' }}>
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
                              <div className="p-3 text-sm text-center" style={{ color: 'var(--ink-muted)' }}>Buscando no catálogo SAP...</div>
                            ) : activeSearchResults.length === 0 ? (
                              <div className="p-3 text-sm text-center" style={{ color: 'var(--ink-muted)' }}>
                                Nenhum item correspondente no catálogo.
                                <div className="text-[11px] mt-0.5">
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
                                  className="w-full text-left px-3 py-2 transition-colors duration-150 flex items-start gap-2 text-sm hover:bg-[var(--surface-raised)]"
                                >
                                  <span
                                    className="font-mono px-1.5 py-0.5 rounded font-bold text-[10px] shrink-0 mt-0.5"
                                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
                                  >
                                    {mat.materialCode}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate" style={{ color: 'var(--ink-primary)' }} title={mat.description}>
                                      {mat.description}
                                    </div>
                                    {mat.technicalText && (
                                      <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                                        {mat.technicalText}
                                      </div>
                                    )}
                                    <SinalChips chips={chips} className="mt-1" />
                                  </div>
                                  <span
                                    className="text-[11px] font-mono px-1 rounded uppercase shrink-0 self-center"
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
                      <div className="sm:col-span-2 sm:max-w-[160px]">
                        <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Qtd *</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          required
                          min={1}
                          placeholder="0"
                          value={it.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full rounded border py-1 px-2 text-sm tabular transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>

                      {/* Un — sem padrão: UN silencioso escondia a unidade
                          errada passar despercebida. */}
                      <div className="sm:col-span-2 sm:max-w-[160px]">
                        <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Un. *</label>
                        <select
                          required
                          value={it.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          className="w-full rounded border py-1 px-1.5 text-sm cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
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
                            <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>
                              Texto Técnico (Catálogo SAP)
                            </label>
                            <p
                              className="w-full rounded border py-1.5 px-2 text-[12px] leading-relaxed"
                              style={{ ...fieldStyle, background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
                            >
                              {it.technical_text}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Marca */}
                      <div>
                        <label className="text-[11px] font-bold flex items-center justify-between mb-1" style={{ color: 'var(--ink-muted)' }}>
                          <span>Marca / Fabricante</span>
                          <label className="inline-flex items-center gap-1 text-[11px] font-normal cursor-pointer" style={{ color: 'var(--ink-muted)' }}>
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
                          className="w-full rounded border py-1 px-2 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>

                      {/* Fornecedor */}
                      <div>
                        <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Fornecedor sugerido</label>
                        <input
                          type="text"
                          placeholder="Sugestão de distribuidor"
                          value={it.suggested_supplier}
                          onChange={(e) => handleItemChange(index, 'suggested_supplier', e.target.value)}
                          className="w-full rounded border py-1 px-2 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>

                      {/* Link de Referência de Compra (opcional) */}
                      <div>
                        <label className="text-[11px] font-bold flex items-center gap-1 mb-1" style={{ color: 'var(--ink-muted)' }}>
                          <LinkIcon className="h-3 w-3" /> Link de referência
                        </label>
                        <input
                          type="url"
                          placeholder="https://site.com.br/produto"
                          value={it.reference_link || ''}
                          onChange={(e) => handleItemChange(index, 'reference_link', e.target.value)}
                          className="w-full rounded border py-1 px-2 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>

                      {/* Estimativa de valor */}
                      <div>
                        <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>Estimativa (R$)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          placeholder="R$ Estimado"
                          value={it.estimated_value}
                          onChange={(e) => handleItemChange(index, 'estimated_value', Number(e.target.value))}
                          className="w-full rounded border py-1 px-2 text-sm tabular transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                          style={fieldStyle}
                        />
                      </div>
                    </div>

                    {/* Observação / Informações Técnicas — obrigatória para
                        item genérico: sem código SAP nem ficha de catálogo,
                        é o único lugar onde o comprador sabe o que comprar. */}
                    <div>
                      <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>
                        Observação / Informações Técnicas{it.is_generic ? ' *' : ''}
                      </label>
                      <textarea
                        rows={2}
                        required={it.is_generic || false}
                        placeholder="Informações técnicas adicionais, observações ou especificações..."
                        value={it.observation || ''}
                        onChange={(e) => handleItemChange(index, 'observation', e.target.value)}
                        className="w-full rounded border py-1.5 px-2 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                        style={fieldStyle}
                      />
                    </div>

                    {/* Anexos do item — foto da peça, etiqueta com código,
                        ficha técnica. O comprador vê a imagem ao lado do item
                        certo, não solta na solicitação. */}
                    <div>
                      <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--ink-muted)' }}>
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
                        reusedValue={it.reusedAttachments || []}
                        onReusedChange={(anexos) => handleItemChange(index, 'reusedAttachments', anexos)}
                        materialCode={it.sap_code.trim().length === 7 ? it.sap_code.trim() : undefined}
                        label="Anexar foto ou PDF"
                      />
                    </div>
                  </div>
                ))}
                </div>
              </div>

              {/* Justificativa text */}
              <div data-tour="novasol-justificativa" className="pt-2">
                <label className={labelClass} style={labelStyle}>Justificativa e Especificações Técnicas *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Detalhamento técnico do que se busca e justificativa da aplicação na Torres Eólicas do Nordeste."
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border py-2 px-3 text-base transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
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
                        className="rounded py-1.5 text-center text-sm font-bold uppercase cursor-pointer transition-colors duration-150"
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
                    {registrationType === 'Item' ? 'Fabricante *' : 'CNPJ / Site corporativo *'}
                  </label>
                  <input
                    type="text"
                    required
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

              {registrationType === 'Fornecedor' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass} style={labelStyle}>Nome do Representante</label>
                    <input
                      type="text"
                      placeholder="Nome completo"
                      value={sapRepresentanteNome}
                      onChange={(e) => setSapRepresentanteNome(e.target.value)}
                      className={fieldClass}
                      style={fieldStyle}
                    />
                  </div>

                  <div>
                    <label className={labelClass} style={labelStyle}>Cargo</label>
                    <input
                      type="text"
                      placeholder="Ex: Gerente de Vendas"
                      value={sapRepresentanteCargo}
                      onChange={(e) => setSapRepresentanteCargo(e.target.value)}
                      className={fieldClass}
                      style={fieldStyle}
                    />
                  </div>

                  <div>
                    <label className={labelClass} style={labelStyle}>Telefone</label>
                    <input
                      type="tel"
                      placeholder="Ex: (11) 99999-9999"
                      value={sapRepresentanteTelefone}
                      onChange={(e) => setSapRepresentanteTelefone(e.target.value)}
                      className={fieldClass}
                      style={fieldStyle}
                    />
                  </div>

                  <div>
                    <label className={labelClass} style={labelStyle}>E-mail</label>
                    <input
                      type="email"
                      placeholder="Ex: email@empresa.com"
                      value={sapRepresentanteEmail}
                      onChange={(e) => setSapRepresentanteEmail(e.target.value)}
                      className={fieldClass}
                      style={fieldStyle}
                    />
                  </div>
                </div>
              )}

              {registrationType === 'Item' && (
                <div>
                  <label className={labelClass} style={labelStyle}>Especificações Técnicas *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Dimensões, padrão de materiais, certificado de calibração necessário ou outras informações mínimas para que o setor de Suprimentos valide o cadastro."
                    value={sapRegSpecs}
                    onChange={(e) => setSapRegSpecs(e.target.value)}
                    className="w-full rounded-lg border py-2 px-3 text-base transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                    style={fieldStyle}
                  />
                </div>
              )}

              <div data-tour="novasol-justificativa">
                <label className={labelClass} style={labelStyle}>Justificativa de necessidade *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Por que é necessário criar este novo item ou homologar este fornecedor?"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border py-2 px-3 text-base transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
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
                          <p className="text-sm font-bold" style={{ color: active ? 'var(--brand-strong)' : 'var(--ink-primary)' }}>{s.name}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>Suporte habilitado</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isDestinoJuridico && (
                <div>
                  <label className={labelClass} style={labelStyle}>Título da solicitação *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex.: Análise de minuta - fornecimento de EPIs"
                    value={juridicoTitulo}
                    onChange={(e) => setJuridicoTitulo(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
              )}

              {isDestinoSuprimentos ? (
                <div>
                  <label className={labelClass} style={labelStyle}>Categoria *</label>
                  <select
                    value={helpdeskCategory}
                    onChange={(e) => setHelpdeskCategory(e.target.value)}
                    required
                    className={`${fieldClass} cursor-pointer`}
                    style={fieldStyle}
                  >
                    <option value="">Selecione a categoria...</option>
                    {CATEGORIAS_SUPRIMENTOS.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              ) : (
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

                {isDestinoJuridico ? (
                  <div>
                    <label className={labelClass} style={labelStyle}>Tipo de contrato *</label>
                    <select
                      value={juridicoTipoContrato}
                      onChange={(e) => setJuridicoTipoContrato(e.target.value)}
                      required
                      className={`${fieldClass} cursor-pointer`}
                      style={fieldStyle}
                    >
                      <option value="">Selecione...</option>
                      {TIPOS_CONTRATO_JURIDICO.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                ) : (
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
                )}
              </div>
              )}

              {isDestinoJuridico && (
                <div>
                  <label className={labelClass} style={labelStyle}>Fornecedor / terceiro *</label>
                  <input
                    type="text"
                    required
                    placeholder="Razão social"
                    value={juridicoFornecedor}
                    onChange={(e) => setJuridicoFornecedor(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
              )}

              {isSupPendencia ? (
                <div data-tour="novasol-justificativa" className="space-y-3">
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Pendências de processamento — cole o texto da planilha *
                    </label>
                    <textarea
                      required
                      rows={8}
                      placeholder={
                        'Cole aqui o bloco copiado da planilha, com o cabeçalho. Dois modelos são aceitos:\n' +
                        '• NFS-e: Número da NFS-e · NFS-e Cancelada · Data Emissão NFS-e · Fornecedor · Nome Fornecedor · OBSERVAÇÃO · Valor da NFS-e · Mês de Competência\n' +
                        '• Lançamentos SAP: STATUS · Número de documento de nove posições · Data da Emissão · Séries · UF emissor · Chegou ? · Nome do Fornecedor · Documento de compras · OBSERVAÇÕES · COMPRADOR · DATA ENVIO'
                      }
                      value={pendenciasTexto}
                      onChange={(e) => setPendenciasTexto(e.target.value)}
                      className="w-full rounded-lg border py-2 px-3 text-sm font-mono transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                      style={fieldStyle}
                    />
                    <p className="text-[11px] mt-1" style={{ color: 'var(--ink-muted)' }}>
                      Aceita a colagem direta do Excel (colunas separadas por tabulação) ou uma célula por linha.
                      O modelo é reconhecido pelo cabeçalho colado.
                    </p>
                  </div>

                  {pendenciasParse.erros.length > 0 && (
                    <div
                      className="rounded-lg border p-3 text-[12px] space-y-1"
                      style={{
                        borderColor: 'var(--status-serious)',
                        background: 'color-mix(in srgb, var(--status-serious) 8%, transparent)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {pendenciasParse.erros.map((msg, i) => (
                        <p key={i} className="flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: 'var(--status-serious)' }} />
                          <span>{msg}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {pendenciasParse.linhas.length > 0 && (
                    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
                      <div
                        className="px-3 py-1.5 text-[11px] font-bold flex items-center justify-between"
                        style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
                      >
                        <span>
                          {pendenciasParse.linhas.length} registro(s) reconhecido(s)
                          {' · '}
                          {pendenciasParse.modelo === 'documento' ? 'Lançamentos SAP' : 'NFS-e'}
                        </span>
                        {pendenciasParse.modelo === 'nfse' && (
                          <span>Total: {formatBRL(somarValores(pendenciasParse.linhas))}</span>
                        )}
                      </div>
                      <div className="max-h-56 overflow-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr style={{ color: 'var(--ink-muted)' }}>
                              {resumoColunas(pendenciasParse.modelo).map(col => (
                                <th key={col} className="text-left font-bold px-2 py-1 whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pendenciasParse.linhas.map((l, i) => (
                              <tr key={i} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                                {resumoValores(l).map((val, c) => (
                                  <td
                                    key={c}
                                    className={`px-2 py-1 ${c === 0 ? 'font-mono' : ''} ${c === 2 ? 'truncate max-w-[200px]' : ''}`}
                                    style={{ color: c === 0 ? 'var(--ink-primary)' : 'var(--ink-secondary)' }}
                                    title={c === 2 ? val : undefined}
                                  >
                                    {val || '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Ao enviar, abre um e-mail para <strong>suprimentosten@ten.ind.br</strong> com a relação em texto
                    organizado, e os itens ficam disponíveis para o Suprimentos dar baixa um a um — você é notificado a
                    cada conclusão.
                  </p>
                </div>
              ) : isAjustePedido ? (
                <div data-tour="novasol-justificativa" className="space-y-4">
                  <div>
                    <label className={labelClass} style={labelStyle}>Demanda *</label>
                    <textarea
                      required
                      rows={10}
                      placeholder="Descreva o ajuste necessário no pedido: o que precisa mudar e por quê."
                      value={ajusteDemanda}
                      onChange={(e) => setAjusteDemanda(e.target.value)}
                      className="w-full rounded-lg border py-2 px-3 text-base leading-relaxed transition-colors duration-150 focus:outline-2 focus:outline-offset-1 resize-y min-h-[10rem]"
                      style={fieldStyle}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className={labelClass} style={labelStyle}>Número da NF *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: 000014252"
                        value={ajusteNf}
                        onChange={(e) => setAjusteNf(e.target.value)}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>Número do Pedido *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: 4100455805"
                        value={ajustePedido}
                        onChange={(e) => setAjustePedido(e.target.value)}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>Nome do Fornecedor *</label>
                      <input
                        type="text"
                        required
                        placeholder="RAZÃO SOCIAL DO FORNECEDOR"
                        value={ajusteFornecedor}
                        onChange={(e) => setAjusteFornecedor(e.target.value.toLocaleUpperCase('pt-BR'))}
                        className={fieldClass}
                        style={{ ...fieldStyle, textTransform: 'uppercase' }}
                      />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>Comprador (opcional)</label>
                      <select
                        value={ajusteComprador}
                        onChange={(e) => setAjusteComprador(e.target.value)}
                        className={`${fieldClass} cursor-pointer`}
                        style={fieldStyle}
                      >
                        <option value="">Sem comprador definido</option>
                        {compradorNomes.map(nome => (
                          <option key={nome} value={nome}>{nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass} style={labelStyle}>Imagens do pedido / print da divergência *</label>
                    <ImagesPasteInput
                      value={ajusteImagens}
                      onChange={setAjusteImagens}
                      hint="As imagens são comprimidas automaticamente e aparecem no chamado, na página de Pendências do Suprimentos. Você pode adicionar mais de uma."
                    />
                  </div>

                  <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    NF, Pedido e Fornecedor vão no título do e-mail enviado para{' '}
                    <strong>suprimentosten@ten.ind.br</strong>. As imagens ficam anexadas ao chamado no SISTEN — o Suprimentos
                    dá baixa e você é notificado.
                  </p>
                </div>
              ) : isDestinoSuprimentos ? (
                <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                  Selecione a categoria acima para continuar.
                </p>
              ) : (
              <div data-tour="novasol-justificativa">
                <label className={labelClass} style={labelStyle}>Descrição detalhada *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Descreva as características do erro, mensagens de sistema apresentadas, impactos causados no setor, e passos já efetuados para tentar resolver."
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full rounded-lg border py-2 px-3 text-base transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                  style={fieldStyle}
                />
              </div>
              )}
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
            <div data-tour="novasol-prazo" className="rounded-xl border p-5 shadow-xs space-y-3 reveal" style={cardStyle}>
              <h3 className="font-bold text-base flex items-center gap-2 border-b pb-3" style={{ color: 'var(--ink-primary)', borderColor: 'var(--hairline)' }}>
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
                  className="w-full rounded-lg border py-2 px-3 text-base cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1"
                  style={fieldStyle}
                />
                <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Considere o SLA de compra e o lead time logístico da empresa.</p>
              </div>
            </div>
          )}

          <div data-tour="novasol-criticidade" className="rounded-xl border p-5 shadow-xs space-y-3 reveal" style={cardStyle}>
            <h3 className="font-bold text-base flex items-center gap-2 border-b pb-3" style={{ color: 'var(--ink-primary)', borderColor: 'var(--hairline)' }}>
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
                    <div className="flex items-center gap-1.5 font-extrabold text-sm shrink-0" style={{ color: active ? token : 'var(--ink-primary)' }}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>Grau {card.level}</span>
                    </div>
                    <p className="mt-2 xl:mt-0 text-[11px] leading-relaxed font-medium" style={{ color: 'var(--ink-secondary)' }}>
                      {card.label}
                    </p>
                  </button>
                );
              })}
            </div>

            {criticality !== null && criticality >= 4 && (
              <div
                className="rounded-lg border p-3 flex items-start gap-2.5 text-[12px] reveal"
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

            {activeTab === 'chamado' && isDestinoJuridico && criticality !== null && (
              <div
                className="rounded-lg border p-3 flex items-start gap-2.5 text-[12px] reveal"
                style={{
                  borderColor: 'var(--brand)',
                  background: 'var(--brand-wash)',
                  color: 'var(--ink-primary)',
                }}
              >
                <Clock className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--brand-strong)' }} />
                <div>
                  <strong>Prazo estimado: {formatDateBR(calcularPrazoSlaJuridico(criticality))}</strong>
                  <p className="mt-0.5" style={{ color: 'var(--ink-secondary)' }}>
                    O SLA é calculado automaticamente pela criticidade selecionada.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Envio: botão primário cheio, sempre a vista dentro do painel
              fixo — antes ficava no fim da página, e uma lista longa de itens
              obrigava rolar tudo de volta pra enviar. */}
          <div data-tour="novasol-enviar" className="rounded-xl border p-5 shadow-xs space-y-2.5 reveal" style={cardStyle}>
            <button
              type="submit"
              disabled={uploadProgress || (activeTab === 'chamado' && suprimentosBloqueado)}
              className="w-full rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm py-2.5 px-6 transition-[background-color,transform] duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2"
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
              <p className="text-[12px] text-center" style={{ color: 'var(--ink-muted)' }}>
                {avisoEdicao(activeTab)}
              </p>
            )}

            {!editandoId && (
              <button
                type="button"
                onClick={handleResetForm}
                className="w-full rounded-lg border py-2 text-sm font-bold cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)] flex items-center justify-center gap-1.5"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Limpar / Novo</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (editandoId) { onNavigate(`/solicitacoes/minhas?id=${editandoId}`); return; }
                clearDraft();
                onNavigate('/');
              }}
              className="w-full rounded-lg border py-2 text-sm font-bold cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </form>

      {buscaModalIndex !== null && (
        <MaterialSearchModal
          termoInicial={items[buscaModalIndex]?.description || ''}
          areaUsuario={areaUsuario}
          onClose={() => setBuscaModalIndex(null)}
          onSelect={(mat, chips) => {
            // Mesmo preenchimento do dropdown, inclusive deixando a unidade
            // para o usuário confirmar.
            const idx = buscaModalIndex;
            setItems(atual => atual.map((it, i) => i === idx ? {
              ...it,
              description: mat.description,
              sap_code: mat.materialCode,
              technical_text: mat.technicalText || '',
              sinais: chips,
            } : it));
          }}
        />
      )}

      {tour.isOpen && (
        <TourSpotlight
          steps={NOVA_SOLICITACAO_TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
    </div>
  );
}
