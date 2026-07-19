/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PackageSearch, Search, FileSpreadsheet, AlertCircle, ChevronDown, ChevronRight,
  Phone, Mail, Tag, Calendar, AlertTriangle, RefreshCw, Filter, User, FileText,
  LayoutGrid, List, Table, Save, Clock, History, Check, Info, ArrowUpRight, Copy, Users, X, Send,
  MessageCircle, Flag
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import {
  Profile, EnrichedSAPRecord, HistoricoPedidoView, ContatoFornecedor,
  FornecedorMaterialRow, SAPObsHistory, ItemStatus, RastreioPrioridade
} from '../types';
import { latestPriorityByRi, priorityMeta } from '../lib/rastreio';
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

interface QuoteItemEntry {
  record: EnrichedSAPRecord;
  rm: string;
}

const CARTA_CONVITE_HEADER = `Prezado Fornecedor,

A Empresa TORRES EÓLICAS DO NORDESTE S/A, inscrita no CNPJ nº 13.892.216/0002-31, convida V.S.ª a apresentar proposta para fornecimento dos materiais conforme especificados em Carta Convite.

INSTRUÇÕES ÀS PROPONENTES
1.1.     Emitir a proposta em nome da TORRES EÓLICAS DO NORDESTE S/A.
1.2.     Mencionar o número da Carta Convite na proposta e no assunto do e-mail.
1.3.     A proposta deverá ser apresentada até 48h do recebimento deste e-mail.

MATERIAL/PRODUTO
`;

const CARTA_CONVITE_FOOTER = `
CONDIÇÕES DE PARTICIPAÇÃO
3.1.     Apresentar propostas técnica e comercial em separado;
3.2.    Especificar de forma técnica e detalhada o produto, material ou serviço;
3.3.    Fornecer ficha técnica, croqui ou desenho quando necessário;
3.4.    Apresentar preços unitários em moeda "REAL";
3.5.    Destacar alíquotas de impostos incidentes mediante a legislação em vigor;
3.6.    Informar condições de pagamento;
3.7.    Informar prazo de fornecimento;
3.8.    Mencionar validade da proposta;
3.9.    Informar Razão Social e CNPJ.
3.10.                     Informar NCM do item.

APRESENTAÇÃO DE PROPOSTAS E CONDIÇÕES OBRIGATÓRIAS
4.1.     Propostas recebidas após o encerramento do prazo estabelecido para apresentação serão automaticamente desconsideradas;
4.2.     Propostas com pendências de informações, sejam técnicas ou comerciais serão automaticamente desclassificadas;
4.3.     Questionamentos técnicos, comercial ou documental devem ser levantados e esclarecidos no decorrer do processo de cotação, caso ocorra mudanças nas características do objeto, seja material, serviço ou mão de abra, hipótese na qual o processo atual será paralisado para os devidos ajustes e reaberto ao mercado quando sanados tais pendenciais.

DISPOSIÇÕES GERAIS
5.1.     O proponente deve declarar em proposta o aceite e de acordo com as condições estabelecidas nesta Carta Convite;
1.1.     Verificar e se inteirar de todos os documentos e informações relacionadas nessa carta/convite, examinando detalhadamente todos os dados e informações nela contidos e que não haja discrepâncias nos dados fornecidos;
5.2.     Conferir os valores e informações existentes em sua proposta e assumir integral responsabilidade por eventuais erros e/ou omissões que nela venham a ser constatados;
5.3.     Na hipótese de V. Sas. vir a declinar do convite ora feito, agradeceremos que o façam por e-mail em até 24 horas da apresentação da carta convite;
5.4.     Pedimos notar que este convite não estabelece nenhum tipo de obrigação entre V. Sas. e a TEN, a qual cabe exclusivamente arbitrar qual dentre as propostas recebidas atende melhor o seu interesse ou desclassificá-las todas, sem que isso possa ensejar reclamação de qualquer natureza, por qualquer dos PROPONENTES;
5.5.     A TEN se reserva o direito de contratar a totalidade ou parte do escopo, bem como de alterar as especificações básicas desta carta convite, podendo neste caso haver revisão da(s) partes(s) afetada(s) da proposta;
5.6.     Será (ao) vencedor(es) a(s) proponente(s) que apresentar (em) as melhores condições técnicas, preços (custo-benefício);
5.7.     Ao responder a Carta Convite a Proponente declara estar ciente das condições de fornecimento proposto pela TEN, bem como, ofertar e prestar o serviço em conformidade com as melhores práticas de mercado e leis governamentais.

DESTINAÇÃO DESTA CARTA CONVITE
Individual e intransferível.

Demais informações que se façam necessárias além das contidas nesta Carta Convite, favor entrar em contato.

FINEZA, SEMPRE MANTER O NOSSO Nº DE COTAÇÃO NO ASSUNTO DO E-MAIL, BEM COMO MANTER TODAS AS PESSOAS COPIADAS. `;

// Monta a lista de itens em blocos rotulados (não em tabela de colunas alinhadas), pois o
// Texto Técnico costuma ser longo demais para caber em uma coluna sem quebrar a leitura.
const buildQuoteItemsTable = (items: QuoteItemEntry[], techTextByCode: Map<string, string>): string => {
  // Remove duplicatas exatas (mesmo material na mesma RM aparecendo mais de uma vez)
  const seen = new Set<string>();
  const dedupedItems = items.filter(({ record: r, rm }) => {
    const key = `${normalizeCode(r.material_code)}|${rm}|${r.item_reqc}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return dedupedItems.map(({ record: r, rm }, idx) => {
    const techText = techTextByCode.get(normalizeCode(r.material_code)) || '—';
    return [
      `${idx + 1}) Material: ${r.material_code || '—'} — ${r.texto_breve || '—'}`,
      `   RM: ${rm || '—'}   |   Unidade: ${r.unidade_medida || '—'}   |   Quantidade: ${r.qtd_requisicao ?? '—'}`,
      `   Texto Técnico: ${techText}`
    ].join('\n');
  }).join('\n\n');
};

const buildQuoteText = (items: QuoteItemEntry[], techTextByCode: Map<string, string>): string => {
  return CARTA_CONVITE_HEADER + buildQuoteItemsTable(items, techTextByCode) + '\n' + CARTA_CONVITE_FOOTER;
};

// Versão resumida para WhatsApp: saudação curta + RMs + tabela de itens, sem o texto
// jurídico completo da Carta Convite (não cabe bem em mensagem de chat).
const buildWhatsAppText = (items: QuoteItemEntry[], rms: string[], techTextByCode: Map<string, string>): string => {
  return `Prezado Fornecedor,\n\nA Empresa TORRES EÓLICAS DO NORDESTE S/A, inscrita no CNPJ nº 13.892.216/0002-31, convida V.S.ª a apresentar proposta para fornecimento dos materiais conforme especificados RM ${rms.join(', ')}\n\n` +
    buildQuoteItemsTable(items, techTextByCode);
};

// Extrai o primeiro telefone válido do campo (pode vir com múltiplos números separados
// por ";") e normaliza para o formato aceito pelo wa.me (só dígitos, com DDI 55 se faltar).
const extractWhatsAppNumber = (telefone: string): string | null => {
  if (!telefone || telefone === '—') return null;
  const first = telefone.split(';')[0].trim();
  const digits = first.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
};

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

// Data + hora para o rótulo "Dados atualizados em".
const formatDateTimeBR = (d?: string | null): string => {
  if (!d) return '—';
  const parsed = new Date(d);
  return isNaN(parsed.getTime())
    ? String(d)
    : parsed.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};



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

interface SearchInputProps {
  onSearch: (value: string) => void;
  initialValue: string;
}

const SearchInput = React.memo(({ onSearch, initialValue }: SearchInputProps) => {
  const [value, setValue] = useState(initialValue);

  // Sincroniza estado se initialValue mudar externamente
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const triggerSearch = (val: string) => {
    // Executa de forma assíncrona no próximo tick do event loop.
    // Isso garante que o navegador repinte o estado do input e dos botões imediatamente,
    // dando feedback visual instantâneo antes que o processamento pesado de re-filtragem comece.
    setTimeout(() => {
      onSearch(val);
    }, 10);
  };

  return (
    <div className="relative flex-1 flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-450 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              triggerSearch(value);
            }
          }}
          placeholder="Pesquisar por material, descrição, RM ou fornecedor... (Pressione Enter)"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-[#0056c6] focus:ring-1 focus:ring-[#0056c6]/20 focus:outline-none transition-all"
        />
      </div>
      <button
        onClick={() => triggerSearch(value)}
        className="px-4 py-2.5 bg-[#0056c6] hover:bg-[#004bb0] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95"
      >
        <Search className="h-4 w-4" />
        <span>Pesquisar</span>
      </button>
      <button
        onClick={() => {
          setValue('');
          triggerSearch('');
        }}
        disabled={!value}
        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 border ${
          value 
            ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700' 
            : 'bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-600 border-slate-100 dark:border-slate-850 cursor-not-allowed opacity-50'
        }`}
      >
        <span>Limpar</span>
      </button>
    </div>
  );
});

export default function SuppliersNoPO({ user, onNavigate }: SuppliersNoPOProps) {
  const [loading, setLoading] = useState(true);
  const [rawRmGroups, setRawRmGroups] = useState<RMGroup[]>([]);
  // Texto técnico por código, buscado só para os materiais desta página (Sem PO),
  // não mais do catálogo inteiro em cache local.
  const [techTextByCode, setTechTextByCode] = useState<Map<string, string>>(new Map());
  const [expandedRMs, setExpandedRMs] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Modal SAP
  const [selectedRecordForModal, setSelectedRecordForModal] = useState<EnrichedSAPRecord | null>(null);

  // Envio de Cotação: escolha de escopo (apenas este item x todos do fornecedor) e texto gerado
  const [quoteChoicePending, setQuoteChoicePending] = useState<{ supplier: FornecedorMaterialRow; record: EnrichedSAPRecord; rm: string } | null>(null);
  const [quoteModal, setQuoteModal] = useState<{ supplier: FornecedorMaterialRow; text: string; rms: string[]; items: QuoteItemEntry[] } | null>(null);

  // Modos de Visualização: 'cards' | 'table'
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('sisten_suppliers_view_mode');
    return (saved === 'cards' || saved === 'table') ? saved : 'cards';
  });

  // Salva preferência do modo de visualização
  const handleViewModeChange = (mode: 'cards' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('sisten_suppliers_view_mode', mode);
  };

  const [tableShowSupplierFirst, setTableShowSupplierFirst] = useState<boolean>(() => {
    return localStorage.getItem('sisten_suppliers_table_supplier_first') === 'true';
  });

  const handleTableShowSupplierFirstChange = (val: boolean) => {
    setTableShowSupplierFirst(val);
    localStorage.setItem('sisten_suppliers_table_supplier_first', String(val));
  };

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [buyerFilter, setBuyerFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [alertFilter, setAlertFilter] = useState('Todos');
  const [poFilter, setPoFilter] = useState<'Todos' | 'Sem PO' | 'Sem MIGO'>('Todos');
  const [kpiFilter, setKpiFilter] = useState<'Todos' | 'Com Fornecedor' | 'Sem Histórico' | 'Críticos'>('Todos');
  const [prioridadeFilter, setPrioridadeFilter] = useState<'Todos' | '1' | '2' | '3' | '4' | '5' | 'Nenhuma'>('Todos');

  // Prioridades solicitadas pelos usuários (Rastreio Compras), nível atual por RI.
  const [prioridadesMap, setPrioridadesMap] = useState<Map<string, RastreioPrioridade>>(new Map());

  const handleSearch = useCallback((val: string) => {
    setSearchQuery(val);
  }, []);

  // Paginação incremental para evitar travamento ao carregar listagens gigantescas (ex: ao limpar busca)
  const [visibleCount, setVisibleCount] = useState(40);

  useEffect(() => {
    setVisibleCount(40);
  }, [searchQuery, buyerFilter, statusFilter, alertFilter, prioridadeFilter, poFilter, kpiFilter, viewMode]);

  const rmGroups = useMemo(() => {
    if (poFilter === 'Sem PO') {
      return rawRmGroups.map(g => {
        const items = g.items.filter(it => it.record.status_requisicao === 'Sem PO');
        return { rm: g.rm, items };
      }).filter(g => g.items.length > 0);
    }
    if (poFilter === 'Sem MIGO') {
      return rawRmGroups.map(g => {
        const items = g.items.filter(it => {
          const hasPO = it.record.status_requisicao === 'Processado';
          const hasMigo = !!it.record.data_migo;
          return hasPO && !hasMigo;
        });
        return { rm: g.rm, items };
      }).filter(g => g.items.length > 0);
    }
    return rawRmGroups;
  }, [rawRmGroups, poFilter]);

  // Resolve o escopo escolhido ("apenas este item" ou "todos do fornecedor") e monta o
  // texto da cotação. No escopo "todos", varre rawRmGroups inteiro (ignora filtros/busca
  // ativos) para não perder itens do mesmo fornecedor espalhados em RMs diferentes.
  const handleConfirmQuoteScope = (scope: 'single' | 'all') => {
    if (!quoteChoicePending) return;
    const { supplier, record, rm } = quoteChoicePending;

    let items: QuoteItemEntry[];
    if (scope === 'single') {
      items = [{ record, rm }];
    } else {
      items = [];
      rawRmGroups.forEach(g => {
        g.items.forEach(it => {
          if (it.fornecedores.some(f => f.cod_forn === supplier.cod_forn)) {
            items.push({ record: it.record, rm: g.rm });
          }
        });
      });
    }

    const rms = Array.from(new Set(items.map(it => it.rm).filter(Boolean)));
    setQuoteModal({ supplier, text: buildQuoteText(items, techTextByCode), rms, items });
    setQuoteChoicePending(null);
  };

  // Ação "Cotação" por item (visão por RM / cards): abre o Outlook com todos os e-mails
  // de fornecedores históricos do item em cópia oculta (BCC), sem escolher um fornecedor específico.
  const handleSendItemQuoteToAllSuppliers = (record: EnrichedSAPRecord, rm: string, fornecedores: FornecedorMaterialRow[]) => {
    const bccEmails = Array.from(new Set(fornecedores.map(f => f.email).filter(e => e && e !== '—')));
    const text = buildQuoteText([{ record, rm }], techTextByCode);
    const subject = `Cotação RM ${rm}`;
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccEmails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = mailtoUrl;
  };

  // Estado para controle de edição inline de cada item
  const [obsInputState, setObsInputState] = useState<Record<string, string>>({});
  const [dateInputState, setDateInputState] = useState<Record<string, string>>({});
  const [statusInputState, setStatusInputState] = useState<Record<string, ItemStatus | ''>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
  const [historyOpenRi, setHistoryOpenRi] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<SAPObsHistory[]>([]);

  const isModified = useCallback((ri: string, record: EnrichedSAPRecord) => {
    const currentObs = obsInputState[ri] ?? '';
    const originalObs = record.obs_comprador ?? '';

    const currentDate = dateInputState[ri] ?? '';
    const originalDate = record.data_entrega_prevista ?? '';

    const currentStatus = statusInputState[ri] || 'Aguardando Cotação';
    const originalStatus = record.item_status || 'Aguardando Cotação';

    return currentObs !== originalObs || currentDate !== originalDate || currentStatus !== originalStatus;
  }, [obsInputState, dateInputState, statusInputState]);

  // Data/hora da última atualização dos dados (última importação/refresh).
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const buildSuppliersData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      // Atualiza status/previsão de entrega/observação com o que está no
      // Supabase antes de montar a tela, para refletir edições feitas por
      // outros usuários (que não disparam um sync completo do dataset).
      await localDb.refreshBuyerFieldsFromSupabase();

      const allRecords = localDb.getEnrichedSAPRequisicoes();
      const semPoRecords = allRecords;

      // Prioridades solicitadas pelos usuários no Rastreio Compras — nível
      // atual (mais recente) por item, para o comprador acompanhar aqui.
      setPrioridadesMap(latestPriorityByRi(localDb.getRastreioPrioridades()));

      // Inicializa os inputs com os dados atuais salvos
      const initialObs: Record<string, string> = {};
      const initialDates: Record<string, string> = {};
      const initialStatus: Record<string, ItemStatus> = {};
      semPoRecords.forEach(r => {
        initialObs[r.ri] = r.obs_comprador || '';
        initialDates[r.ri] = r.data_entrega_prevista || '';
        initialStatus[r.ri] = r.item_status || 'Aguardando Cotação';
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

      if (codeVariants.size > 0 && supabase) {
        try {
          const codesArr = Array.from(codeVariants);
          const techMap = new Map<string, string>();
          for (let i = 0; i < codesArr.length; i += 500) {
            const { data, error } = await supabase
              .from('materials')
              .select('material_code, technical_text')
              .in('material_code', codesArr.slice(i, i + 500));
            if (error) throw error;
            data?.forEach((m: any) => {
              if (m.technical_text) techMap.set(normalizeCode(m.material_code), m.technical_text);
            });
          }
          setTechTextByCode(techMap);
        } catch (err) {
          console.warn('Falha ao buscar texto técnico dos materiais Sem PO:', err);
        }
      } else {
        setTechTextByCode(new Map());
      }

      const fornecedoresPorMaterial = new Map<string, FornecedorMaterialRow[]>();

      if (codeVariants.size > 0 && supabase) {
        // A view vw_historico_fornecedores_sem_po (fornecedor + pedido + contato +
        // MIGO, CRF = 'x') não existe no banco — busca-se direto na tabela
        // pedidosforn (que já traz data_migo) filtrando pelos materiais em
        // aberto, e o contato (telefone/e-mail/nome fantasia) é resolvido no
        // cliente via localDb.getContatosForn(), igual ao HistoricoPedidos.tsx.
        // Sem corte de data: os materiais já vêm restritos ao conjunto pendente,
        // então convém trazer o histórico completo (inclusive compras antigas).
        let linhasHistorico: HistoricoPedidoView[] = [];
        try {
          const codesArr = Array.from(codeVariants);
          for (let i = 0; i < codesArr.length; i += 200) {
            const { data, error } = await supabase
              .from('pedidosforn')
              .select('material, cod_forn:fornecedor_codigo, cnpj:cnpj_fornecedor, fornecedor:fornecedor_nome, regiao_uf, doc_compra, data_doc, qtd_pedido, valor_liquido, preco_liquido_unit, data_migo')
              .ilike('crf', 'x')
              .in('material', codesArr.slice(i, i + 200));
            if (error) throw error;
            if (data) linhasHistorico.push(...(data as HistoricoPedidoView[]));
          }
        } catch (netErr) {
          console.warn('Falha ao buscar histórico de fornecedores (Sem PO).', netErr);
          linhasHistorico = [];
        }

        const contatosMap = new Map<string, ContatoFornecedor>();
        localDb.getContatosForn().forEach(c => {
          if (c.cod_vendor) contatosMap.set(String(c.cod_vendor).trim(), c);
        });

        // Filtra linhas do histórico relevantes para os materiais desta pagina
        const linhasPorNorm = new Map<string, HistoricoPedidoView[]>();
        linhasHistorico.forEach(l => {
          const normKey = normalizeCode(l.material);
          if (!normKey || (!codeVariants.has(l.material) && !codeVariants.has(normKey))) return;
          const arr = linhasPorNorm.get(normKey);
          if (arr) arr.push(l);
          else linhasPorNorm.set(normKey, [l]);
        });

        linhasPorNorm.forEach((linhasMaterial, normKey) => {
          // Deduplica por fornecedor, mantendo o pedido mais recente
          const fornMap = new Map<string, HistoricoPedidoView>();
          linhasMaterial.forEach(l => {
            const key = l.cnpj ? l.cnpj.trim() : (l.cod_forn || '');
            if (!key) return;
            const existing = fornMap.get(key);
            if (!existing) {
              fornMap.set(key, l);
            } else {
              const dateA = l.data_doc ? new Date(l.data_doc).getTime() : 0;
              const dateB = existing.data_doc ? new Date(existing.data_doc).getTime() : 0;
              if (dateA > dateB) fornMap.set(key, l);
            }
          });

          const list: FornecedorMaterialRow[] = Array.from(fornMap.values()).map(l => {
            const contato = l.cod_forn ? contatosMap.get(String(l.cod_forn).trim()) : undefined;
            return {
              cod_forn: l.cod_forn || '—',
              cnpj: l.cnpj || '—',
              fornecedor: l.fornecedor || contato?.fornecedor || '—',
              nome_fantasia: contato?.nome_fantasia || '—',
              regiao_uf: l.regiao_uf || '—',
              telefone: contato?.telefone || '—',
              email: contato?.email || '—',
              classificacao: contato?.classificacao || '—',
              ultima_data: l.data_doc || '—',
              preco_liquido: l.preco_liquido_unit,
              data_migo: l.data_migo || undefined
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
      setLastUpdated(localDb.getDatasetUpdatedAt('requisicoes'));
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

  // Itens "Sem PO" sempre antes dos que já possuem PO (Processado), preservando a ordem
  // original entre itens do mesmo status.
  const poRank = (r: EnrichedSAPRecord): number => r.status_requisicao === 'Processado' ? 1 : 0;

  // Filtragem (Primeiro estágio sem KPI)
  const filteredGroupsWithoutKpi = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result: RMGroup[] = [];
    rmGroups.forEach(g => {
      const rmMatchesSearch = q ? g.rm.toLowerCase().includes(q) : false;
      const items = g.items.filter(it => {
        const r = it.record;
        if (buyerFilter !== 'Todos' && r.grupo_comprador !== buyerFilter) return false;
        if (statusFilter !== 'Todos' && r.status_atualizado !== statusFilter) return false;
        if (alertFilter !== 'Todos' && r.alerta !== alertFilter) return false;
        if (prioridadeFilter !== 'Todos') {
          const nivel = prioridadesMap.get(r.ri)?.nivel;
          if (prioridadeFilter === 'Nenhuma' ? nivel !== undefined : String(nivel) !== prioridadeFilter) return false;
        }
        if (q) {
          const inRecord =
            (r.material_code || '').toLowerCase().includes(q) ||
            (r.texto_breve || '').toLowerCase().includes(q) ||
            (r.requisitante_name || '').toLowerCase().includes(q) ||
            (r.fornecedor_name || '').toLowerCase().includes(q) ||
            (r.fornecedor_code || '').toLowerCase().includes(q);
          const inFornecedor = it.fornecedores.some(f =>
            f.fornecedor.toLowerCase().includes(q) ||
            (f.nome_fantasia || '').toLowerCase().includes(q) ||
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
  }, [rmGroups, searchQuery, buyerFilter, statusFilter, alertFilter, prioridadeFilter, prioridadesMap]);

  // Filtragem (Segundo estágio aplicando KPI)
  const filteredGroups = useMemo(() => {
    if (kpiFilter === 'Todos') {
      return filteredGroupsWithoutKpi.map(g => ({
        ...g,
        items: g.items.slice().sort((a, b) => poRank(a.record) - poRank(b.record))
      }));
    }
    const result: RMGroup[] = [];
    filteredGroupsWithoutKpi.forEach(g => {
      const items = g.items.filter(it => {
        const r = it.record;
        if (kpiFilter === 'Com Fornecedor' && !it.encontrado) return false;
        if (kpiFilter === 'Sem Histórico' && it.encontrado) return false;
        if (kpiFilter === 'Críticos') {
          const lvl = alertLevel(r.alerta || '');
          return lvl === 'critico' || lvl === 'atencao';
        }
        return true;
      });
      if (items.length > 0) {
        result.push({
          rm: g.rm,
          items: items.slice().sort((a, b) => poRank(a.record) - poRank(b.record))
        });
      }
    });
    return result;
  }, [filteredGroupsWithoutKpi, kpiFilter]);

  // Lista plana de itens filtrados (Sem PO sempre antes dos que já possuem PO)
  const filteredFlatItems = useMemo(() => {
    const list: { rm: string; item: ItemNode }[] = [];
    filteredGroups.forEach(g => {
      g.items.forEach(it => {
        list.push({ rm: g.rm, item: it });
      });
    });
    return list.slice().sort((a, b) => poRank(a.item.record) - poRank(b.item.record));
  }, [filteredGroups]);

  // Lista plana específica para tabela, opcionalmente expandida/ordenada por fornecedor
  const flatTableItems = useMemo(() => {
    const list: Array<{
      rm: string;
      item: ItemNode;
      selectedSupplier?: any;
    }> = [];

    const q = searchQuery.trim().toLowerCase();

    filteredGroups.forEach(g => {
      g.items.forEach(it => {
        const { encontrado, fornecedores } = it;
        if (!tableShowSupplierFirst || !encontrado || fornecedores.length === 0) {
          list.push({ rm: g.rm, item: it });
        } else {
          // Se o termo de busca estiver ativo, e o item em si NÃO bater com o termo de busca,
          // mas um fornecedor da lista bater, nós devemos apenas listar os fornecedores que batem!
          let showAllSuppliers = true;
          if (q) {
            const r = it.record;
            const itemMatches =
              (r.material_code || '').toLowerCase().includes(q) ||
              (r.texto_breve || '').toLowerCase().includes(q) ||
              (r.requisitante_name || '').toLowerCase().includes(q) ||
              (r.fornecedor_name || '').toLowerCase().includes(q) ||
              (r.fornecedor_code || '').toLowerCase().includes(q) ||
              g.rm.toLowerCase().includes(q);
            if (!itemMatches) {
              showAllSuppliers = false;
            }
          }

          fornecedores.forEach(f => {
            if (showAllSuppliers) {
              list.push({ rm: g.rm, item: it, selectedSupplier: f });
            } else {
              // Apenas inclui se o fornecedor bater com a busca
              const supplierMatches =
                f.fornecedor.toLowerCase().includes(q) ||
                (f.nome_fantasia || '').toLowerCase().includes(q) ||
                f.cnpj.toLowerCase().includes(q) ||
                f.cod_forn.toLowerCase().includes(q);
              if (supplierMatches) {
                list.push({ rm: g.rm, item: it, selectedSupplier: f });
              }
            }
          });
        }
      });
    });

    if (tableShowSupplierFirst) {
      // Ordenação alfabética por nome do fornecedor
      return list.sort((a, b) => {
        const nameA = a.selectedSupplier?.fornecedor?.toLowerCase() || 'zzz_sem_fornecedor';
        const nameB = b.selectedSupplier?.fornecedor?.toLowerCase() || 'zzz_sem_fornecedor';
        return nameA.localeCompare(nameB);
      });
    }

    // Ordenação padrão por status de PO
    return list.sort((a, b) => poRank(a.item.record) - poRank(b.item.record));
  }, [filteredGroups, tableShowSupplierFirst, searchQuery]);

  const totalItemCount = useMemo(() => rmGroups.reduce((s, g) => s + g.items.length, 0), [rmGroups]);
  const filteredItemCount = useMemo(() => filteredGroups.reduce((s, g) => s + g.items.length, 0), [filteredGroups]);

  const totalFilteredCount = useMemo(() => {
    return viewMode === 'table' ? flatTableItems.length : filteredFlatItems.length;
  }, [viewMode, flatTableItems.length, filteredFlatItems.length]);

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
    const materialsByCode = techTextByCode;
    const dataToExport: any[] = [];
    filteredGroups.forEach(g => {
      g.items.forEach(({ record: r, encontrado, fornecedores }) => {
        const base = {
          'RM / Requisição': r.requisicao_de_compra || '—',
          'Item': r.item_reqc || '—',
          'Código do Material': r.material_code || '—',
          'Descrição': r.texto_breve || '—',
          'Texto Técnico': materialsByCode.get(normalizeCode(r.material_code)) || '—',
          'Qtd.': r.qtd_requisicao ?? '—',
          'Un.': r.unidade_medida || '—',
          'Grupo Comprador': r.grupo_comprador || '—',
          'Natureza': r.natureza || '—',
          'Status': r.status_atualizado || '—',
          'Alerta': r.alerta || '—',
          'Dias em Aberto': r.dias_em_aberto ?? '—',
          'Status do Item': r.item_status || 'Aguardando Cotação',
          'Observação Comprador': obsInputState[r.ri] || '',
          'Entrega Prevista': dateInputState[r.ri] || '',
          'Data de Solicitação': r.data_solicitacao ? formatDateBR(r.data_solicitacao) : '—'
        };
        if (r.status_requisicao === 'Processado') {
          // Item já possui PO emitida: exporta os dados do pedido de compra ao invés do
          // histórico de fornecedores (que não se aplica a itens já comprados).
          dataToExport.push({
            ...base,
            'PO': r.documento_compra || '—',
            'Item PO': r.item_pedido || '—',
            'Fornecedor do PO': r.fornecedor_name || '—',
            'Cód. Fornecedor do PO': r.fornecedor_code || '—',
            'Data do Pedido': r.data_pedido ? formatDateBR(r.data_pedido) : '—',
            'Data Entrega SAP': r.data_entrega_sap ? formatDateBR(r.data_entrega_sap) : '—',
            'Data MIGO': r.data_migo ? formatDateBR(r.data_migo) : 'Sem MIGO',
            'Comprador (PO)': r.criado_por_pedido || '—'
          });
        } else if (!encontrado || fornecedores.length === 0) {
          dataToExport.push({
            ...base,
            'Cód. Fornecedor': '—', 'CNPJ': '—', 'Fornecedor': 'Material sem histórico de fornecedores',
            'UF': '—', 'Telefone': '—', 'E-mail': '—', 'Classificação': '—', 'Preço Líquido': '—', 'Última Compra': '—', 'Data MIGO': '—'
          });
        } else {
          fornecedores.forEach(f => {
            dataToExport.push({
              ...base,
              'Cód. Fornecedor': f.cod_forn, 'CNPJ': f.cnpj, 'Fornecedor': f.fornecedor,
              'UF': f.regiao_uf, 'Telefone': f.telefone, 'E-mail': f.email,
              'Classificação': f.classificacao,
              'Preço Líquido': f.preco_liquido !== undefined && f.preco_liquido !== null ? f.preco_liquido : '—',
              'Última Compra': f.ultima_data,
              'Data MIGO': f.data_migo ? formatDateBR(f.data_migo) : 'Sem MIGO'
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

  const formatDateBR = (d?: string): string => {
    if (!d) return '—';
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('pt-BR');
  };

  // Badge compacto de MIGO por fornecedor histórico (vem de vw_historico_fornecedores_sem_po.data_migo)
  const renderMigoInfo = (dataMigo?: string) => (
    <span className={`flex items-center gap-0.5 ${dataMigo ? 'text-emerald-600 dark:text-emerald-450' : 'text-amber-600 dark:text-amber-450'}`}>
      {dataMigo ? `MIGO: ${formatDateBR(dataMigo)}` : 'Sem MIGO'}
    </span>
  );

  // Badge de identificação visual: item já possui PO emitida vs. ainda em aberto (Sem PO)
  const renderPOBadge = (r: EnrichedSAPRecord) => {
    const hasPO = r.status_requisicao === 'Processado';
    if (hasPO) {
      const dataMigo = r.data_migo;
      return (
        <div className="inline-flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-250 dark:border-blue-900/50"
            title={`PO ${r.documento_compra || '—'} emitida em ${formatDateBR(r.data_pedido)}`}
          >
            <Check className="h-3 w-3 shrink-0" />
            PO {r.documento_compra || '—'}{r.data_pedido ? ` • ${formatDateBR(r.data_pedido)}` : ''}
          </span>
          {!dataMigo && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-amber-100 dark:bg-amber-955/40 text-amber-700 dark:text-amber-450 border border-amber-250 dark:border-amber-900/50"
              title="Item comprado mas sem registro de entrada física/nota fiscal (Sem MIGO)"
            >
              Sem MIGO
            </span>
          )}
        </div>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-250 dark:border-rose-900/50">
        Sem PO
      </span>
    );
  };

  // Bloco com os dados do Pedido de Compra (PO) já emitido para o item — usado no lugar do
  // histórico de fornecedores quando o item já possui PO (ex.: itens "Sem MIGO").
  const renderPOInfoBlock = (r: EnrichedSAPRecord) => (
    <div className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/20 border border-slate-200/60 dark:border-slate-800/40 text-[11px] space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-extrabold text-slate-850 dark:text-slate-200">PO {r.documento_compra || '—'}</span>
        {r.item_pedido && (
          <span className="px-1.5 py-0.3 bg-slate-100 dark:bg-slate-700 rounded text-[9px] font-black text-slate-500 dark:text-slate-400">
            Item {r.item_pedido}
          </span>
        )}
      </div>
      <p className="text-slate-700 dark:text-slate-300 font-bold break-words">
        {r.fornecedor_name || 'Fornecedor não identificado'}
        {r.fornecedor_code && <span className="text-slate-450 dark:text-slate-500 font-semibold"> ({r.fornecedor_code})</span>}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 dark:text-slate-450 font-semibold">
        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Pedido: {formatDateBR(r.data_pedido)}</span>
        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Entrega SAP: {formatDateBR(r.data_entrega_sap)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-150/50 dark:border-slate-750">
        {renderMigoInfo(r.data_migo || undefined)}
        {r.criado_por_pedido && (
          <span className="text-slate-400 dark:text-slate-500 font-semibold">Comprador: {r.criado_por_pedido}</span>
        )}
      </div>
    </div>
  );

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
    filteredGroupsWithoutKpi.forEach(g => g.items.forEach(it => {
      if (poFilter === 'Sem PO' && it.record.status_requisicao !== 'Sem PO') return;
      if (poFilter === 'Sem MIGO') {
        const hasPO = it.record.status_requisicao === 'Processado';
        const hasMigo = !!it.record.data_migo;
        if (!hasPO || hasMigo) return;
      }
      rmsSet.add(g.rm);
      itens++;
      if (it.encontrado) com++; else sem++;
      const lvl = alertLevel(it.record.alerta || '');
      if (lvl === 'critico' || lvl === 'atencao') criticos++;
    }));
    return { rms: rmsSet.size, itens, com, sem, criticos };
  }, [filteredGroupsWithoutKpi, poFilter]);

  // Lista com as opções de status
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

  // Helper para renderizar dropdown com todas as opções de status disponíveis
  const renderStatusSelect = (ri: string, currentStatus: ItemStatus) => {
    const normalizedVal = statusInputState[ri] !== undefined ? statusInputState[ri] : (currentStatus || '');

    return (
      <select
        value={normalizedVal}
        onChange={(e) => setStatusInputState(prev => ({ ...prev, [ri]: e.target.value as ItemStatus | '' }))}
        className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5 px-2.5 focus:border-[#0056c6] focus:outline-none"
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
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
            <PackageSearch className="h-7 w-7 text-[#0056c6] dark:text-blue-500" />
            Central de Compras
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestão operacional avançada de requisições pendentes. Localize fornecedores históricos, registre promessas de entrega e gerencie os status operacionais na mesma tela.
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3" /> Dados atualizados em: {formatDateTimeBR(lastUpdated)}
            </p>
          )}
        </div>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto shrink-0">
          {/* Filtro PO (Todos / Sem PO / Sem MIGO) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-xl p-1 mr-2 border border-slate-200/50 dark:border-slate-850">
            <button
              onClick={() => setPoFilter('Todos')}
              className={`px-3 py-1.5 rounded-lg transition-all text-xs font-bold cursor-pointer ${poFilter === 'Todos' ? 'bg-white dark:bg-slate-850 text-[#0056c6] dark:text-[#0056c6] shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Exibir todos os registros enriquecidos (com e sem PO)"
            >
              Todos
            </button>
            <button
              onClick={() => setPoFilter('Sem PO')}
              className={`px-3 py-1.5 rounded-lg transition-all text-xs font-bold cursor-pointer ${poFilter === 'Sem PO' ? 'bg-white dark:bg-slate-850 text-[#0056c6] dark:text-[#0056c6] shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Exibir apenas registros que não possuem documento de compra (pedido)"
            >
              Sem PO
            </button>
            <button
              onClick={() => setPoFilter('Sem MIGO')}
              className={`px-3 py-1.5 rounded-lg transition-all text-xs font-bold cursor-pointer ${poFilter === 'Sem MIGO' ? 'bg-white dark:bg-slate-850 text-[#0056c6] dark:text-[#0056c6] shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Exibir apenas registros que possuem pedido (PO) mas sem data de MIGO (ainda não entregues)"
            >
              Sem MIGO
            </button>
          </div>

          {/* View Toggles */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-xl p-1 mr-2 border border-slate-200/50 dark:border-slate-850">
            <button
              onClick={() => handleViewModeChange('cards')}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer ${viewMode === 'cards' ? 'bg-white dark:bg-slate-850 text-[#0056c6] dark:text-[#0056c6] shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Visualização em Cards"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => handleViewModeChange('table')}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer ${viewMode === 'table' ? 'bg-white dark:bg-slate-850 text-[#0056c6] dark:text-[#0056c6] shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              title="Visualização em Tabela Plana"
            >
              <Table className="h-4 w-4" />
              <span className="hidden sm:inline">Tabela</span>
            </button>
          </div>

          <button
            onClick={() => buildSuppliersData(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all disabled:opacity-50 h-9 cursor-pointer active:scale-95 active:translate-y-[1px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {filteredItemCount > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-[#0056c6] hover:bg-[#004bb0] text-white rounded-xl text-xs font-bold transition-all shadow-sm h-9 cursor-pointer active:scale-95 active:translate-y-[1px]"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar
            </button>
          )}
          {viewMode === 'table' && filteredItemCount > 0 && (
            <button
              onClick={() => handleTableShowSupplierFirstChange(!tableShowSupplierFirst)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs font-bold transition-all h-9 cursor-pointer active:scale-95 active:translate-y-[1px] ${
                tableShowSupplierFirst
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-[#0056c6] dark:text-[#0056c6] border-blue-250 dark:border-blue-900/60 shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-855/40 text-slate-700 dark:text-slate-300'
              }`}
              title="Mostrar fornecedor como primeira coluna e ordenar por fornecedor"
            >
              <Users className="h-4 w-4" />
              <span>{tableShowSupplierFirst ? 'Ordenar por RM' : 'Ver por Fornecedor'}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPIs Grid */}
      {!loading && !error && rmGroups.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card 1: RMs em aberto (Info) */}
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-400 dark:bg-slate-700" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">RMs em aberto</span>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{kpis.rms}</p>
          </div>

          {/* Card 2: Itens Sem PO (Filtra 'Todos') */}
          <div
            onClick={() => setKpiFilter('Todos')}
            className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden cursor-pointer hover:shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] select-none ${
              kpiFilter === 'Todos'
                ? 'border-[#0056c6] ring-1 ring-[#0056c6]/20'
                : 'border-slate-200/80 dark:border-slate-850'
            }`}
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0056c6]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              {poFilter === 'Sem MIGO' ? 'Itens Sem MIGO' : poFilter === 'Sem PO' ? 'Itens Sem PO' : 'Total Itens'}
            </span>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{kpis.itens}</p>
            {kpiFilter === 'Todos' && (
              <span className="absolute right-3 top-3 px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-blue-50 text-[#0056c6] dark:bg-blue-950/40">Filtro Ativo</span>
            )}
          </div>

          {/* Card 3: Com Fornecedor */}
          <div
            onClick={() => setKpiFilter('Com Fornecedor')}
            className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden cursor-pointer hover:shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] select-none ${
              kpiFilter === 'Com Fornecedor'
                ? 'border-emerald-500 ring-1 ring-emerald-500/20'
                : 'border-slate-200/80 dark:border-slate-850'
            }`}
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 dark:bg-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Com Fornecedor</span>
            <p className="text-3xl font-black text-emerald-600 dark:text-emerald-500 mt-1">{kpis.com}</p>
            {kpiFilter === 'Com Fornecedor' && (
              <span className="absolute right-3 top-3 px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">Filtro Ativo</span>
            )}
          </div>

          {/* Card 4: Sem Histórico */}
          <div
            onClick={() => setKpiFilter('Sem Histórico')}
            className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden cursor-pointer hover:shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] select-none ${
              kpiFilter === 'Sem Histórico'
                ? 'border-rose-500 ring-1 ring-rose-500/20'
                : 'border-slate-200/80 dark:border-slate-850'
            }`}
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500 dark:bg-rose-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Sem Histórico</span>
            <p className="text-3xl font-black text-rose-600 dark:text-rose-500 mt-1">{kpis.sem}</p>
            {kpiFilter === 'Sem Histórico' && (
              <span className="absolute right-3 top-3 px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-rose-50 text-rose-600 dark:bg-rose-955/35">Filtro Ativo</span>
            )}
          </div>

          {/* Card 5: Críticos / Em Atraso */}
          <div
            onClick={() => setKpiFilter('Críticos')}
            className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden col-span-2 lg:col-span-1 cursor-pointer hover:shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] select-none ${
              kpiFilter === 'Críticos'
                ? 'border-amber-500 ring-1 ring-amber-500/20'
                : 'border-slate-200/80 dark:border-slate-850'
            }`}
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500 dark:bg-amber-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Críticos / Em Atraso</span>
            <p className="text-3xl font-black text-amber-600 dark:text-amber-500 mt-1">{kpis.criticos}</p>
            {kpiFilter === 'Críticos' && (
              <span className="absolute right-3 top-3 px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-50 text-amber-650 dark:bg-amber-955/20">Filtro Ativo</span>
            )}
          </div>
        </div>
      )}
      {/* Filtros */}
      <div className="rounded-xl border border-slate-250 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-col xl:flex-row gap-3">
          <SearchInput
            initialValue={searchQuery}
            onSearch={handleSearch}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[130px]">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-450 pointer-events-none" />
              <select
                value={buyerFilter}
                onChange={(e) => setBuyerFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-[#0056c6] focus:outline-none cursor-pointer appearance-none transition-all"
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
                className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-55 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-[#0056c6] focus:outline-none cursor-pointer appearance-none transition-all"
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
                className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-[#0056c6] focus:outline-none cursor-pointer appearance-none transition-all"
              >
                <option value="Todos">Alertas: Todos</option>
                {alertOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative min-w-[150px]">
              <Flag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-450 pointer-events-none" />
              <select
                value={prioridadeFilter}
                onChange={(e) => setPrioridadeFilter(e.target.value as typeof prioridadeFilter)}
                className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-[#0056c6] focus:outline-none cursor-pointer appearance-none transition-all"
              >
                <option value="Todos">Prioridade: Todas</option>
                <option value="5">Grau 5</option>
                <option value="4">Grau 4</option>
                <option value="3">Grau 3</option>
                <option value="2">Grau 2</option>
                <option value="1">Grau 1</option>
                <option value="Nenhuma">Sem solicitação</option>
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
            <span>Localizados {filteredItemCount} item(ns) em aberto de {totalItemCount} totais</span>
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
              {filteredFlatItems.slice(0, visibleCount).map(({ rm, item: { record: r, encontrado, fornecedores } }) => {
                const ilvl = alertLevel(r.alerta || '');
                const alertStyle = ALERT_STYLE[ilvl];
                const itemSaveStatus = saveStatus[r.ri] || 'idle';
                return (
                  <div key={r.ri} className={`border border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-all duration-200 relative ${isModified(r.ri, r) ? 'border-l-4 border-l-amber-500 ring-1 ring-amber-500/10' : encontrado ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-rose-500'}`}>
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
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-450 dark:text-slate-500 hover:text-[#0056c6] dark:hover:text-emerald-450 cursor-pointer"
                            title="Ver detalhes SAP"
                          >
                            <Info className="h-4.5 w-4.5" />
                          </button>
                          {renderPOBadge(r)}
                          {r.status_requisicao !== 'Processado' && r.alerta && (
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wide uppercase ${alertStyle.chip}`}>
                              {r.alerta}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & Desc (Clickable to modal) */}
                      <div className="cursor-pointer group" onClick={() => setSelectedRecordForModal(r)}>
                        <h4 className="text-[13px] font-mono font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#0056c6] dark:group-hover:text-emerald-450 group-hover:underline leading-tight flex items-center gap-1">
                          {r.material_code || '—'}
                          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h4>
                        <p className="text-sm text-slate-700 dark:text-slate-250 mt-1 font-semibold leading-relaxed line-clamp-2">
                          {r.texto_breve || 'Descrição não cadastrada'}
                        </p>
                      </div>

                      {/* Technical Specs Tags */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-450 dark:text-slate-500 font-bold bg-slate-55 dark:bg-slate-955 p-2 rounded-xl border border-slate-150 dark:border-slate-900">
                        <span>Qtd: {r.qtd_requisicao} {r.unidade_medida}</span>
                        <span>•</span>
                        <span>Comprador: Grupo {r.grupo_comprador || '—'}</span>
                        <span>•</span>
                        <span>Natureza: {r.natureza}</span>
                        {r.status_requisicao !== 'Processado' && (
                          <>
                            <span>•</span>
                            <span className={r.dias_em_aberto > 15 ? 'text-amber-600 dark:text-amber-500' : ''}>
                              Aberto há {r.dias_em_aberto}d
                            </span>
                          </>
                        )}
                      </div>

                      {/* Informações do Pedido de Compra (PO) já emitido */}
                      {r.status_requisicao === 'Processado' && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                            Informações do Pedido de Compra (PO)
                          </span>
                          {renderPOInfoBlock(r)}
                        </div>
                      )}

                      {/* Fornecedores Históricos */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                          Fornecedores com Histórico ({fornecedores.length})
                        </span>

                        {!encontrado ? (
                          <div className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-rose-150 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-955/5 text-rose-800 dark:text-rose-455 text-xs">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                            <span>Sem histórico de compras anteriores para este material.</span>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {fornecedores.map((f, fIdx) => (
                              <div key={fIdx} className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-955/20 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 text-left">
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
                                    <span className="text-slate-200 dark:text-slate-800">|</span>
                                    {renderMigoInfo(f.data_migo)}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1.5 shrink-0 text-[11px] items-start sm:items-end">
                                  {f.telefone !== '—' && f.telefone.split(';').map(t => t.trim()).filter(Boolean).map((singleTel, telIdx) => (
                                    <div key={telIdx} className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs shrink-0">
                                      <Phone className="h-3 w-3 text-slate-450 shrink-0" />
                                      <a
                                        href={`tel:${singleTel}`}
                                        className="font-mono text-slate-705 dark:text-slate-355 hover:underline hover:text-[#0056c6] cursor-pointer font-bold"
                                        title={`Ligar: ${singleTel}`}
                                      >
                                        {singleTel}
                                      </a>
                                      <ClipboardCopyButton text={singleTel} label="telefone" />
                                    </div>
                                  ))}
                                  {f.email !== '—' && (
                                    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs max-w-full">
                                      <Mail className="h-3 w-3 text-slate-455 shrink-0" />
                                      <a
                                        href={`mailto:${f.email}`}
                                        className="text-[#0056c6] dark:text-blue-400 hover:underline font-bold truncate max-w-[150px] sm:max-w-[200px]"
                                        title={f.email}
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
                          {renderStatusSelect(r.ri, r.item_status || 'Aguardando Cotação')}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider block">
                            Previsão de Entrega
                          </label>
                          <input
                            type="date"
                            value={dateInputState[r.ri] || ''}
                            onChange={(e) => setDateInputState(prev => ({ ...prev, [r.ri]: e.target.value }))}
                            className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5 px-2.5 focus:border-[#0056c6] focus:ring-1 focus:ring-[#0056c6]/20 focus:outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider block">
                              Observações
                            </label>
                            <button
                              onClick={() => handleViewHistory(r.ri)}
                              className="text-[9px] font-bold text-slate-400 hover:text-[#0056c6] dark:text-slate-500 dark:hover:text-emerald-450 flex items-center gap-0.5 cursor-pointer"
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
                            className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5 px-2.5 focus:border-[#0056c6] focus:ring-1 focus:ring-[#0056c6]/20 focus:outline-none transition-all"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 font-semibold">
                        {isModified(r.ri, r) ? (
                          <span className="text-[10px] text-amber-650 dark:text-amber-450 font-black flex items-center gap-1.5 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Pendente de salvar
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                            {r.item_status_updated_at 
                              ? `Alt: ${new Date(r.item_status_updated_at).toLocaleDateString('pt-BR')} por ${r.item_status_updated_by || 'Sistema'}`
                              : r.obs_updated_at
                              ? `Alt: ${new Date(r.obs_updated_at).toLocaleDateString('pt-BR')} por ${r.obs_updated_by || 'Sistema'}`
                              : 'Ainda não editado'}
                          </span>
                        )}

                        <div className="flex items-center gap-2">
                          {encontrado && (
                            <button
                              onClick={() => handleSendItemQuoteToAllSuppliers(r, rm, fornecedores)}
                              type="button"
                              title="Enviar cotação por e-mail para todos os fornecedores deste item (em cópia oculta)"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 active:translate-y-[1px] bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>Cotação</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleSaveFields(r.ri)}
                            disabled={itemSaveStatus === 'saving'}
                            type="button"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 active:translate-y-[1px] ${
                              itemSaveStatus === 'saved'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-450 border border-emerald-250 dark:border-emerald-900/30'
                                : isModified(r.ri, r)
                                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md border border-amber-500 animate-pulse-subtle'
                                : 'bg-[#0056c6] hover:bg-[#004bb0] text-white'
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
                    {tableShowSupplierFirst && <th className="py-3 px-3">Fornecedor</th>}
                    <th className="py-3 px-3">RM / Item</th>
                    <th className="py-3 px-3">PO</th>
                    <th className="py-3 px-3">Material</th>
                    <th className="py-3 px-3">Descrição</th>
                    <th className="py-3 px-3">Qtd / Un</th>
                    {!tableShowSupplierFirst && <th className="py-3 px-3">{poFilter === 'Sem MIGO' ? 'Informações do PO' : 'Histórico Fornecedores'}</th>}
                    <th className="py-3 px-3">Prioridade</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Promessa Entrega</th>
                    <th className="py-3 px-3">Observação</th>
                    <th className="py-3 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-705 dark:text-slate-350">
                  {flatTableItems.slice(0, visibleCount).map(({ rm, item: { record: r, encontrado, fornecedores }, selectedSupplier }) => {
                    const itemSaveStatus = saveStatus[r.ri] || 'idle';
                    return (
                      <tr key={`${r.ri}-${selectedSupplier ? selectedSupplier.cod_forn : 'none'}`} className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/20 align-top transition-colors ${isModified(r.ri, r) ? 'bg-amber-50/15 dark:bg-amber-955/5' : ''}`}>
                        {/* Column 1: Fornecedor (when focused) */}
                        {tableShowSupplierFirst && (
                          <td className="py-3 px-3 min-w-[280px] lg:min-w-[320px] max-w-[320px]">
                            {!selectedSupplier ? (
                              <span className="text-rose-500 font-bold uppercase tracking-wider text-[9px] bg-rose-50 dark:bg-rose-955/20 px-1.5 py-0.5 rounded">
                                Sem fornecedor
                              </span>
                            ) : (
                              <div className="p-2 rounded bg-slate-50/60 dark:bg-slate-800/20 border border-slate-200/60 dark:border-slate-800/40 text-[10px] space-y-1 text-left">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-slate-800 dark:text-slate-200 break-words" title={selectedSupplier.fornecedor}>
                                    {selectedSupplier.fornecedor}
                                    {selectedSupplier.nome_fantasia && selectedSupplier.nome_fantasia !== '—' && (
                                      <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-medium">
                                        Fantasia: {selectedSupplier.nome_fantasia}
                                      </span>
                                    )}
                                  </span>
                                  <span className="px-1 py-0.2 bg-slate-100 dark:bg-slate-700 rounded text-[9px] font-semibold text-slate-500">
                                    {selectedSupplier.regiao_uf}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold">
                                  <span>Preço: <span className="text-emerald-600 dark:text-emerald-450">{formatPreco(selectedSupplier.preco_liquido)}</span></span>
                                  <span className="flex items-center gap-0.5">
                                    <Calendar className="h-2.5 w-2.5 text-slate-400" />
                                    {selectedSupplier.ultima_data !== '—' ? (isNaN(Date.parse(selectedSupplier.ultima_data)) ? selectedSupplier.ultima_data : new Date(selectedSupplier.ultima_data).toLocaleDateString('pt-BR')) : '—'}
                                  </span>
                                </div>
                                <div className="text-[9px] font-bold">
                                  {renderMigoInfo(selectedSupplier.data_migo)}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-150/50 dark:border-slate-750">
                                  {selectedSupplier.telefone !== '—' && selectedSupplier.telefone.split(';').map(t => t.trim()).filter(Boolean).map((singleTel, telIdx) => (
                                    <div key={telIdx} className="flex items-center gap-1 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-150 dark:border-slate-750 text-[9px] shrink-0">
                                      <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                      <a href={`tel:${singleTel}`} className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold font-mono" title={`Ligar: ${singleTel}`}>
                                        {singleTel}
                                      </a>
                                      <ClipboardCopyButton text={singleTel} label="telefone" />
                                    </div>
                                  ))}
                                  {selectedSupplier.email !== '—' && (
                                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-150 dark:border-slate-750 text-[9px] min-w-0 max-w-full">
                                      <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                                      <a href={`mailto:${selectedSupplier.email}`} className="text-[#0056c6] dark:text-blue-400 hover:underline font-bold truncate max-w-[155px]" title={selectedSupplier.email}>
                                        {selectedSupplier.email}
                                      </a>
                                      <ClipboardCopyButton text={selectedSupplier.email} label="e-mail" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        )}

                        {/* RM / Item */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-mono font-bold block text-slate-850 dark:text-slate-100">RM {rm}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">Item {r.item_reqc}</span>
                        </td>

                        {/* PO Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {renderPOBadge(r)}
                        </td>

                        {/* Material Code (Clickable) */}
                        <td className="py-3 px-3 font-mono font-semibold whitespace-nowrap">
                          <button
                            onClick={() => setSelectedRecordForModal(r)}
                            className="hover:underline hover:text-[#0056c6] dark:hover:text-emerald-455 cursor-pointer flex items-center gap-1 focus:outline-none"
                          >
                            {r.material_code}
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </td>

                        {/* Description (Clickable) */}
                        <td className="py-3 px-3 max-w-[280px] break-words font-medium text-slate-800 dark:text-slate-200">
                          <button
                            onClick={() => setSelectedRecordForModal(r)}
                            className="text-left font-bold hover:underline hover:text-[#0056c6] dark:hover:text-emerald-455 focus:outline-none"
                          >
                            {r.texto_breve}
                          </button>
                          <div className="flex gap-2 items-center mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-semibold flex-wrap">
                            {r.status_requisicao !== 'Processado' && (
                              <>
                                <span>Aberto {r.dias_em_aberto}d</span>
                                <span>•</span>
                              </>
                            )}
                            <span>G: {r.grupo_comprador}</span>
                            {r.status_requisicao !== 'Processado' && r.alerta && (
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

                        {/* Column 6: Informações do PO (itens já comprados) ou Histórico Fornecedores (Sem PO) */}
                        {!tableShowSupplierFirst && (
                          <td className="py-3 px-3 min-w-[280px] lg:min-w-[320px] max-w-[320px]">
                            {r.status_requisicao === 'Processado' ? (
                              renderPOInfoBlock(r)
                            ) : !encontrado ? (
                              <span className="text-rose-500 font-bold uppercase tracking-wider text-[9px] bg-rose-50 dark:bg-rose-955/20 px-1.5 py-0.5 rounded">
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
                                      <span>Preço: <span className="text-emerald-600 dark:text-emerald-455">{formatPreco(f.preco_liquido)}</span></span>
                                      <span className="flex items-center gap-0.5">
                                        <Calendar className="h-2.5 w-2.5 text-slate-400" />
                                        {f.ultima_data !== '—' ? (isNaN(Date.parse(f.ultima_data)) ? f.ultima_data : new Date(f.ultima_data).toLocaleDateString('pt-BR')) : '—'}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      {renderMigoInfo(f.data_migo)}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-150/50 dark:border-slate-750">
                                      {f.telefone !== '—' && f.telefone.split(';').map(t => t.trim()).filter(Boolean).map((singleTel, telIdx) => (
                                        <div key={telIdx} className="flex items-center gap-1 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-150 dark:border-slate-750 text-[9px] shrink-0">
                                          <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                          <a href={`tel:${singleTel}`} className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold font-mono" title={`Ligar: ${singleTel}`}>
                                            {singleTel}
                                          </a>
                                          <ClipboardCopyButton text={singleTel} label="telefone" />
                                        </div>
                                      ))}
                                      {f.email !== '—' && (
                                        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-150 dark:border-slate-750 text-[9px] min-w-0 max-w-full">
                                          <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                                          <a href={`mailto:${f.email}`} className="text-[#0056c6] dark:text-blue-400 hover:underline font-bold truncate max-w-[155px]" title={f.email}>
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
                        )}

                        {/* Prioridade solicitada (Rastreio Compras) */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {(() => {
                            const p = prioridadesMap.get(r.ri);
                            if (!p) return <span className="text-slate-300 dark:text-slate-600">—</span>;
                            const meta = priorityMeta(p.nivel);
                            return (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${meta.badge}`}
                                title={`Solicitado por ${p.solicitante_nome} em ${new Date(p.created_at).toLocaleString('pt-BR')}`}
                              >
                                <Flag className="h-2.5 w-2.5" /> Grau {p.nivel}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Status Select */}
                        <td className="py-2.5 px-3 min-w-[140px]">
                          {renderStatusSelect(r.ri, r.item_status || 'Aguardando Cotação')}
                        </td>

                        {/* Delivery Date */}
                        <td className="py-2.5 px-3">
                          <input
                            type="date"
                            value={dateInputState[r.ri] || ''}
                            onChange={(e) => setDateInputState(prev => ({ ...prev, [r.ri]: e.target.value }))}
                            className="text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1 px-1.5 focus:border-[#0056c6] focus:outline-none transition-all"
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
                              className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1 pr-7 pl-2 focus:border-[#0056c6] focus:outline-none transition-all"
                            />
                            <button
                              onClick={() => handleViewHistory(r.ri)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-655 cursor-pointer"
                              title="Ver histórico de alterações"
                            >
                              <History className="h-3 w-3" />
                            </button>
                          </div>
                        </td>

                        {/* Save Action */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <button
                              onClick={() => handleSaveFields(r.ri)}
                              disabled={itemSaveStatus === 'saving'}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 mx-auto min-w-[76px] cursor-pointer active:scale-95 active:translate-y-[1px] ${
                                itemSaveStatus === 'saved'
                                  ? 'bg-emerald-100 text-emerald-850 dark:bg-emerald-955/40 dark:text-emerald-450 border border-emerald-250'
                                  : isModified(r.ri, r)
                                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md border border-amber-500 animate-pulse-subtle'
                                  : 'bg-[#0056c6] hover:bg-[#004bb0] text-white'
                              }`}
                            >
                              {itemSaveStatus === 'saving' && <RefreshCw className="h-3 w-3 animate-spin" />}
                              {itemSaveStatus === 'saved' && <Check className="h-3.5 w-3.5" />}
                              {itemSaveStatus === 'idle' && <Save className="h-3.5 w-3.5" />}
                              <span>
                                {itemSaveStatus === 'saving' ? 'Salvando...' : itemSaveStatus === 'saved' ? 'Salvo!' : 'Salvar'}
                              </span>
                            </button>
                            {tableShowSupplierFirst && selectedSupplier && (
                              <button
                                onClick={() => setQuoteChoicePending({ supplier: selectedSupplier, record: r, rm })}
                                className="px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 mx-auto min-w-[76px] cursor-pointer active:scale-95 active:translate-y-[1px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                title="Enviar cotação para este fornecedor"
                              >
                                <Send className="h-3.5 w-3.5" />
                                <span>Cotação</span>
                              </button>
                            )}
                            {!tableShowSupplierFirst && encontrado && fornecedores.length > 0 && (
                              <button
                                onClick={() => handleSendItemQuoteToAllSuppliers(r, rm, fornecedores)}
                                className="px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 mx-auto min-w-[76px] cursor-pointer active:scale-95 active:translate-y-[1px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                title="Enviar cotação por e-mail para todos os fornecedores deste item (em cópia oculta)"
                              >
                                <Send className="h-3.5 w-3.5" />
                                <span>Cotação</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Load More Button */}
          {totalFilteredCount > visibleCount && (
            <div className="flex flex-col items-center justify-center pt-6 pb-2 border-t border-slate-100 dark:border-slate-850 mt-6 space-y-2">
              <span className="text-xs text-slate-500 dark:text-slate-450 font-bold">
                Exibindo {visibleCount} de {totalFilteredCount} itens localizados
              </span>
              <button
                onClick={() => setVisibleCount(prev => prev + 40)}
                className="px-5 py-2 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <span>Carregar mais itens</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
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
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-350 px-2 py-0.5 rounded">
                  RI: {historyOpenRi}
                </span>
                <button
                  onClick={() => setHistoryOpenRi(null)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 transition-colors cursor-pointer"
                  aria-label="Fechar janela"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
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

      {/* Escolha de escopo da cotação */}
      {quoteChoicePending && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-850 dark:text-slate-50 text-sm">Enviar Cotação</h3>
              <button
                onClick={() => setQuoteChoicePending(null)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 transition-colors cursor-pointer"
                aria-label="Fechar janela"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Fornecedor: <span className="font-bold text-slate-850 dark:text-slate-200">{quoteChoicePending.supplier.fornecedor}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-450">Quais itens devem entrar no texto da cotação?</p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => handleConfirmQuoteScope('single')}
                  className="w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                >
                  Apenas este item
                </button>
                <button
                  onClick={() => handleConfirmQuoteScope('all')}
                  className="w-full px-4 py-2.5 bg-[#0056c6] hover:bg-[#004bb0] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  Todos os itens deste fornecedor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Texto da Cotação gerado */}
      {quoteModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden animate-scale-up flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Send className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                <h3 className="font-bold text-slate-850 dark:text-slate-50 text-sm truncate">
                  Cotação — {quoteModal.supplier.fornecedor}
                </h3>
              </div>
              <button
                onClick={() => setQuoteModal(null)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 transition-colors cursor-pointer shrink-0"
                aria-label="Fechar janela"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <textarea
                value={quoteModal.text}
                onChange={(e) => setQuoteModal(prev => prev ? { ...prev, text: e.target.value } : prev)}
                className="w-full h-[50vh] font-mono text-xs leading-relaxed rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 p-3 focus:border-[#0056c6] focus:ring-1 focus:ring-[#0056c6]/20 focus:outline-none transition-all resize-y"
                spellCheck={false}
              />
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setQuoteModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(quoteModal.text);
                  } catch (err) {
                    console.error('Falha ao copiar texto da cotação:', err);
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copiar Texto</span>
              </button>
              <button
                onClick={() => {
                  const supplierEmail = quoteModal.supplier.email !== '—' ? quoteModal.supplier.email : '';
                  const subject = `Cotação RM ${quoteModal.rms.join(', ')}`;
                  const mailtoUrl = `mailto:${encodeURIComponent(supplierEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(quoteModal.text)}`;
                  window.location.href = mailtoUrl;
                }}
                title="Abre o cliente de e-mail padrão (ex: Outlook) com o texto preenchido. Cotações muito longas podem ser truncadas pelo limite de tamanho do mailto."
                className="px-4 py-2 bg-[#0056c6] hover:bg-[#004bb0] text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Abrir no Outlook</span>
              </button>
              {(() => {
                const waNumber = extractWhatsAppNumber(quoteModal.supplier.telefone);
                return (
                  <button
                    onClick={() => {
                      if (!waNumber) return;
                      const waText = buildWhatsAppText(quoteModal.items, quoteModal.rms, techTextByCode);
                      window.open(`https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`, '_blank', 'noopener,noreferrer');
                    }}
                    disabled={!waNumber}
                    title={waNumber ? 'Abre o WhatsApp Web/App com a mensagem preenchida para o fornecedor' : 'Fornecedor sem telefone cadastrado'}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 ${
                      waNumber
                        ? 'bg-[#25D366] hover:bg-[#1fbd59] text-white cursor-pointer'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>WhatsApp</span>
                  </button>
                );
              })()}
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


