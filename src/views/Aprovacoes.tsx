/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pagina de Aprovacoes de Compras para Gestores e Lideranca.
 * Cockpit executivo para triagem rapida, analise profunda de itens,
 * verificacao de sinais do catalogo SAP (saldo em estoque, RM aberta)
 * e decisao (aprovar, devolver para revisao, rejeitar e aprovacao em lote).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, ArrowRight, Building2, Calendar, Check,
  CheckCircle2, CheckSquare, ChevronRight, Clock, Download, ExternalLink,
  FileSpreadsheet, FileText, Filter, Layers, RefreshCw, Search,
  Square, User, X, XCircle, ArrowUpRight, ShieldCheck, DollarSign,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Request, RequestAttachment, RequestItem, Sector, RequestStatus } from '../types';
import { podeAprovar, podeAlterarDecisao } from '../lib/solicitacoesCentral';
import { rotuloCriticidade, rotuloStatus, exportarSolicitacoes } from '../lib/solicitacoes';
import { formatBRL, formatDateBR, formatDateTimeBR } from '../lib/format';
import { buscarMateriais, resumoSinais, type SinalChip } from '../lib/materiais';
import { SinalChips } from '../components/ui/SinalChips';
import { useToast } from '../components/ui/Toast';
import Modal, { ModalBody, ModalHeader } from '../components/ui/Modal';
import { exportCompraPdf } from '../lib/pdfExport/exportCompraPdf';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type AbaStatus = 'pendentes' | 'aprovadas' | 'revisao' | 'rejeitadas' | 'todas';

const SUGESTOES_PARECER = [
  'Aprovado conforme planejamento orçamentário.',
  'Devolvido para anexar cotações complementares.',
  'Favor detalhar a aplicação técnica e justificativa da quantidade.',
  'Orçamento não previsto para o setor no período.',
];

export default function Aprovacoes({ user, onNavigate }: Props) {
  const toast = useToast();

  const [todasSolicitacoes, setTodasSolicitacoes] = useState<Request[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [carregado, setCarregado] = useState(false);

  // Filtros de Triage
  const [abaAtiva, setAbaAtiva] = useState<AbaStatus>('pendentes');
  const [busca, setBusca] = useState('');
  const [filtroSetor, setFiltroSetor] = useState('todos');
  const [filtroCriticidade, setFiltroCriticidade] = useState('todas');
  const [filtroFaixaValor, setFiltroFaixaValor] = useState('todas');

  // Selecao para inspecao e lote
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [selecionadasLote, setSelecionadasLote] = useState<Set<string>>(new Set());

  // Estado do painel de decisao
  const [parecer, setParecer] = useState('');
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const [erroDecisao, setErroDecisao] = useState('');

  // Modal de Aprovacao em Lote
  const [modalLoteAberta, setModalLoteAberta] = useState(false);
  const [parecerLote, setParecerLote] = useState('');
  const [processandoLote, setProcessandoLote] = useState(false);

  // Modal de Redecisao / Alterar Decisao
  const [modalRedecidirAberta, setModalRedecidirAberta] = useState(false);
  const [novoStatusDecisao, setNovoStatusDecisao] = useState<RequestStatus>('aprovada');
  const [justificativaRedecidir, setJustificativaRedecidir] = useState('');
  const [processandoRedecisao, setProcessandoRedecisao] = useState(false);
  const [erroRedecidir, setErroRedecidir] = useState('');

  // Sinais do catalogo SAP por item
  const [sinaisPorItem, setSinaisPorItem] = useState<Record<string, SinalChip[]>>({});
  const [carregandoSinais, setCarregandoSinais] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Carga inicial e subscricao reativa
  const carregarDados = () => {
    setTodasSolicitacoes(localDb.getRequests());
    setSectors(localDb.getSectors());
    setCarregado(true);
  };

  useEffect(() => {
    carregarDados();
    const unsubscribe = localDb.subscribe(carregarDados);

    // Deep-link ?id=...
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const idUrl = params.get('id');
    if (idUrl) {
      setSelecionadaId(idUrl);
    }

    return () => unsubscribe();
  }, []);

  // Universo de solicitacoes de compras elegiveis para o gestor
  const comprasElegiveis = useMemo(() => {
    return todasSolicitacoes.filter(req => req.type === 'compra' && podeAprovar(req, user));
  }, [todasSolicitacoes, user]);

  // Setores que o usuario aprova (para dropdown de filtros)
  const setoresAprovados = useMemo(() => {
    if (user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos')) {
      return sectors;
    }
    const ids = new Set(user.aprovador_setores || []);
    return sectors.filter(s => ids.has(s.id));
  }, [sectors, user]);

  const nomeSetor = (id?: string) => (id ? sectors.find(s => s.id === id)?.name || id : '—');

  // Metricas e KPIs Executivos
  const kpis = useMemo(() => {
    const pendentes = comprasElegiveis.filter(r => r.status === 'pendente');
    const aprovadas = comprasElegiveis.filter(r => ['aprovada', 'pedido_gerado', 'parcialmente_atendido', 'resolvido', 'fechado'].includes(r.status));
    const emRevisao = comprasElegiveis.filter(r => r.status === 'em_revisao');
    const rejeitadas = comprasElegiveis.filter(r => r.status === 'rejeitada');

    // Valor financeiro pendente
    let valorPendente = 0;
    for (const r of pendentes) {
      const itens = localDb.getRequestItems(r.id);
      valorPendente += itens.reduce((acc, it) => acc + (it.estimated_value || 0) * (it.quantity || 1), 0);
    }

    // Prazo critico: criticidade >= 4 ou necessidade nos proximos 7 dias
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite7Dias = new Date(hoje);
    limite7Dias.setDate(limite7Dias.getDate() + 7);

    const pendentesCriticas = pendentes.filter(r => {
      if (r.criticality >= 4) return true;
      if (r.data_necessidade) {
        const dt = new Date(r.data_necessidade);
        if (!isNaN(dt.getTime()) && dt <= limite7Dias) return true;
      }
      return false;
    }).length;

    // Decididas no mes corrente
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const decididasMes = comprasElegiveis.filter(r => {
      if (r.status === 'pendente') return false;
      const dt = new Date(r.updated_at || r.created_at);
      return !isNaN(dt.getTime()) && dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual;
    }).length;

    return {
      totalPendentes: pendentes.length,
      valorPendente,
      pendentesCriticas,
      decididasMes,
      totalAprovadas: aprovadas.length,
      totalEmRevisao: emRevisao.length,
      totalRejeitadas: rejeitadas.length,
      totalGeral: comprasElegiveis.length,
    };
  }, [comprasElegiveis]);

  // Filtragem da lista da aba ativa
  const solicitacoesFiltradas = useMemo(() => {
    let lista = comprasElegiveis.filter(r => {
      if (abaAtiva === 'pendentes') return r.status === 'pendente';
      if (abaAtiva === 'aprovadas') {
        return ['aprovada', 'pedido_gerado', 'parcialmente_atendido', 'resolvido', 'fechado'].includes(r.status);
      }
      if (abaAtiva === 'revisao') return r.status === 'em_revisao';
      if (abaAtiva === 'rejeitadas') return r.status === 'rejeitada';
      return true; // todas
    });

    // Filtro por setor
    if (filtroSetor !== 'todos') {
      lista = lista.filter(r => r.solicitante_sector_id === filtroSetor);
    }

    // Filtro por criticidade
    if (filtroCriticidade !== 'todas') {
      const critNum = Number(filtroCriticidade);
      lista = lista.filter(r => r.criticality === critNum);
    }

    // Filtro por busca textual
    if (busca.trim()) {
      const termo = busca.toLowerCase().trim();
      lista = lista.filter(r => {
        if (r.number.toLowerCase().includes(termo)) return true;
        if (r.solicitante_name.toLowerCase().includes(termo)) return true;
        if (r.justificativa && r.justificativa.toLowerCase().includes(termo)) return true;
        const itens = localDb.getRequestItems(r.id);
        return itens.some(
          it =>
            it.description.toLowerCase().includes(termo) ||
            (it.sap_code && it.sap_code.toLowerCase().includes(termo)) ||
            (it.brand && it.brand.toLowerCase().includes(termo))
        );
      });
    }

    // Filtro por faixa de valor
    if (filtroFaixaValor !== 'todas') {
      lista = lista.filter(r => {
        const itens = localDb.getRequestItems(r.id);
        const total = itens.reduce((acc, it) => acc + (it.estimated_value || 0) * (it.quantity || 1), 0);
        if (filtroFaixaValor === 'ate5k') return total <= 5000;
        if (filtroFaixaValor === '5ka25k') return total > 5000 && total <= 25000;
        if (filtroFaixaValor === 'acima25k') return total > 25000;
        return true;
      });
    }

    // Ordenacao executiva:
    // Pendentes: maior criticidade primeiro, depois prazo mais proximo
    return lista.sort((a, b) => {
      if (a.status === 'pendente' && b.status === 'pendente') {
        if (b.criticality !== a.criticality) return b.criticality - a.criticality;
        if (a.data_necessidade && b.data_necessidade) {
          return new Date(a.data_necessidade).getTime() - new Date(b.data_necessidade).getTime();
        }
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [comprasElegiveis, abaAtiva, filtroSetor, filtroCriticidade, busca, filtroFaixaValor]);

  // Se nao houver solicitacao selecionada mas a lista tiver itens, seleciona a primeira
  useEffect(() => {
    if (!selecionadaId && solicitacoesFiltradas.length > 0) {
      setSelecionadaId(solicitacoesFiltradas[0].id);
    } else if (selecionadaId && !solicitacoesFiltradas.some(r => r.id === selecionadaId)) {
      setSelecionadaId(solicitacoesFiltradas[0]?.id || null);
    }
  }, [solicitacoesFiltradas, selecionadaId]);

  // Dados da solicitacao ativa inspecionada
  const solicitacaoAtiva = useMemo(() => {
    if (!selecionadaId) return null;
    return todasSolicitacoes.find(r => r.id === selecionadaId) || null;
  }, [todasSolicitacoes, selecionadaId]);

  const itensAtivos = useMemo(() => {
    if (!solicitacaoAtiva) return [];
    return localDb.getRequestItems(solicitacaoAtiva.id);
  }, [solicitacaoAtiva]);

  const anexosAtivos = useMemo(() => {
    if (!solicitacaoAtiva) return [];
    return localDb.getAttachments(solicitacaoAtiva.id);
  }, [solicitacaoAtiva]);

  const historicoAtivo = useMemo(() => {
    if (!solicitacaoAtiva) return [];
    return localDb.getRequestHistory(solicitacaoAtiva.id).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [solicitacaoAtiva]);

  const valorTotalAtivo = useMemo(() => {
    return itensAtivos.reduce((acc, it) => acc + (it.estimated_value || 0) * (it.quantity || 1), 0);
  }, [itensAtivos]);

  // Consulta de sinais do catalogo SAP para os itens da solicitacao inspecionada
  useEffect(() => {
    if (!solicitacaoAtiva || itensAtivos.length === 0) {
      setSinaisPorItem({});
      return;
    }

    const comCodigo = itensAtivos.filter(i => i.sap_code && i.sap_code.trim().length >= 4);
    if (comCodigo.length === 0) {
      setSinaisPorItem({});
      return;
    }

    let cancelado = false;
    setCarregandoSinais(true);
    const setor = sectors.find(s => s.id === solicitacaoAtiva.solicitante_sector_id);

    Promise.all(
      comCodigo.map(async it => {
        const cod = it.sap_code!.trim();
        try {
          const [achado] = await buscarMateriais(cod, {
            areaUsuario: setor?.sap_area_code ?? null,
            limite: 1,
          });
          if (!achado || achado.materialCode !== cod) return [it.id, []] as const;
          return [it.id, resumoSinais(achado)] as const;
        } catch (err) {
          console.error('Falha ao consultar sinais do catalogo para item', it.id, err);
          return [it.id, []] as const;
        }
      })
    )
      .then(pares => {
        if (!cancelado) setSinaisPorItem(Object.fromEntries(pares));
      })
      .finally(() => {
        if (!cancelado) setCarregandoSinais(false);
      });

    return () => {
      cancelado = true;
    };
  }, [solicitacaoAtiva?.id, itensAtivos.length, sectors]);

  // Acoes de decisao individual
  const executarDecisao = async (acao: 'aprovar' | 'revisar' | 'rejeitar') => {
    if (!solicitacaoAtiva) return;
    setErroDecisao('');

    if (acao !== 'aprovar' && !parecer.trim()) {
      setErroDecisao('O parecer / justificativa é obrigatório para devolver ou rejeitar.');
      return;
    }

    const novoStatus: RequestStatus =
      acao === 'aprovar' ? 'aprovada' : acao === 'revisar' ? 'em_revisao' : 'rejeitada';

    const textoComentario =
      parecer.trim() || (acao === 'aprovar' ? 'Aprovação realizada pelo gestor.' : '');

    setProcessandoAcao(true);
    try {
      const ok = await localDb.updateRequestStatus(
        solicitacaoAtiva.id,
        novoStatus,
        user.id,
        textoComentario
      );

      if (!ok) {
        setErroDecisao('Não foi possível atualizar o status. Verifique suas permissões.');
        return;
      }

      toast.success(
        acao === 'aprovar'
          ? `Solicitação #${solicitacaoAtiva.number} aprovada com sucesso!`
          : acao === 'revisar'
          ? `Solicitação #${solicitacaoAtiva.number} devolvida para revisão.`
          : `Solicitação #${solicitacaoAtiva.number} rejeitada.`
      );
      setParecer('');
    } catch (err) {
      console.error(err);
      setErroDecisao('Erro ao processar a solicitação.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Acao de Aprovacao em Lote
  const alternarSelecaoLote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelecionadasLote(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const alternarTodasLote = () => {
    const pendentesIds = solicitacoesFiltradas.filter(r => r.status === 'pendente').map(r => r.id);
    if (selecionadasLote.size === pendentesIds.length && pendentesIds.length > 0) {
      setSelecionadasLote(new Set());
    } else {
      setSelecionadasLote(new Set(pendentesIds));
    }
  };

  const confirmarAprovacaoLote = async () => {
    if (selecionadasLote.size === 0) return;
    setProcessandoLote(true);

    const ids = Array.from(selecionadasLote);
    const texto = parecerLote.trim() || 'Aprovação em lote realizada pelo gestor.';
    let sucessoCount = 0;

    for (const id of ids) {
      const ok = await localDb.updateRequestStatus(id, 'aprovada', user.id, texto);
      if (ok) sucessoCount++;
    }

    setProcessandoLote(false);
    setModalLoteAberta(false);
    setSelecionadasLote(new Set());
    setParecerLote('');

    toast.success(`${sucessoCount} solicitação(ões) aprovada(s) com sucesso em lote!`);
  };

  // Acao de Redecisao / Alterar Parecer
  const abrirModalRedecisao = () => {
    if (!solicitacaoAtiva) return;
    setNovoStatusDecisao(solicitacaoAtiva.status === 'aprovada' ? 'em_revisao' : 'aprovada');
    setJustificativaRedecidir('');
    setErroRedecidir('');
    setModalRedecidirAberta(true);
  };

  const salvarRedecisao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solicitacaoAtiva) return;
    setErroRedecidir('');

    if (!justificativaRedecidir.trim()) {
      setErroRedecidir('A justificativa da alteração da decisão é obrigatória.');
      return;
    }

    setProcessandoRedecisao(true);
    const ok = await localDb.updateApproverDecision(
      solicitacaoAtiva.id,
      novoStatusDecisao,
      user.id,
      justificativaRedecidir.trim()
    );
    setProcessandoRedecisao(false);

    if (!ok) {
      setErroRedecidir('Não foi possível salvar a nova decisão.');
      return;
    }

    toast.success(`Decisão da solicitação #${solicitacaoAtiva.number} alterada para ${rotuloStatus({ ...solicitacaoAtiva, status: novoStatusDecisao })}.`);
    setModalRedecidirAberta(false);
  };

  // Exportacao de PDF Oficial
  const exportarPdfSolicitacao = async () => {
    if (!solicitacaoAtiva) return;
    setGerandoPdf(true);
    try {
      await exportCompraPdf(
        solicitacaoAtiva,
        nomeSetor(solicitacaoAtiva.solicitante_sector_id),
        itensAtivos
      );
      toast.success('PDF executivo gerado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar PDF da solicitação.');
    } finally {
      setGerandoPdf(false);
    }
  };

  // Exportacao Excel
  const exportarPlanilha = () => {
    const listaParaExportar =
      selecionadasLote.size > 0
        ? comprasElegiveis.filter(r => selecionadasLote.has(r.id))
        : solicitacoesFiltradas;

    if (listaParaExportar.length === 0) {
      toast.warning('Nenhuma solicitação para exportar.');
      return;
    }

    exportarSolicitacoes(listaParaExportar, sectors);
    toast.success(`Planilha exportada com ${listaParaExportar.length} solicitação(ões)!`);
  };

  // Tempo relativo de espera
  const tempoAguardando = (dataIso: string) => {
    const diffMs = Date.now() - new Date(dataIso).getTime();
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffDias === 0) {
      if (diffHoras === 0) return 'hoje';
      return `há ${diffHoras}h`;
    }
    if (diffDias === 1) return 'há 1 dia';
    return `há ${diffDias} dias`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-[1680px] mx-auto p-3 sm:p-5 space-y-4 animate-fade-in overflow-hidden">
      
      {/* 1. Header Executivo e KPIs de Decisao */}
      <header className="shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white rounded-xl p-4 sm:p-5 shadow-lg border border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center p-2 rounded-lg bg-emerald-700/80 text-emerald-100 ring-1 ring-emerald-500/40">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Aprovações de Compras
                </h1>
                <p className="text-xs text-slate-300">
                  Painel de decisão gerencial · Análise orçamentária e liberação para cotação
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {abaAtiva === 'pendentes' && selecionadasLote.size > 0 && (
              <button
                onClick={() => setModalLoteAberta(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aprovar Selecionadas ({selecionadasLote.size})</span>
              </button>
            )}

            <button
              onClick={exportarPlanilha}
              title="Exportar dados visíveis para planilha Excel"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline">Exportar Excel</span>
            </button>

            <button
              onClick={() => onNavigate('/solicitacoes')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              <span>Central Geral</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Grid de KPIs de Alto Impacto */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* KPI 1: Pendentes */}
          <div className="rounded-xl p-3.5 bg-slate-900 border border-slate-800 text-white shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Aguardando Minha Aprovação</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-amber-500">
                {kpis.totalPendentes}
              </span>
              {kpis.pendentesCriticas > 0 && (
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800">
                  {kpis.pendentesCriticas} urgente(s)
                </span>
              )}
            </div>
          </div>

          {/* KPI 2: Volume Financeiro */}
          <div className="rounded-xl p-3.5 bg-slate-900 border border-slate-800 text-white shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Montante em Análise</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline">
              <span className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">
                {formatBRL(kpis.valorPendente)}
              </span>
            </div>
          </div>

          {/* KPI 3: Críticas / Prazo Proximo */}
          <div className="rounded-xl p-3.5 bg-slate-900 border border-slate-800 text-white shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Prazo & Criticidade Alta</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-rose-400">
                {kpis.pendentesCriticas}
              </span>
              <span className="text-[11px] text-slate-400">
                necessitam prioridade
              </span>
            </div>
          </div>

          {/* KPI 4: Decididas no Mes */}
          <div className="rounded-xl p-3.5 bg-slate-900 border border-slate-800 text-white shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Decisões Tomadas no Mês</span>
              <CheckCircle2 className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {kpis.decididasMes}
              </span>
              <span className="text-[11px] text-slate-400">
                ({kpis.totalAprovadas} aprovadas no total)
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Barra de Filtros e Abas de Status */}
      <section className="shrink-0 bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Abas com Badges */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setAbaAtiva('pendentes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                abaAtiva === 'pendentes'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Pendentes de Decisão</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  abaAtiva === 'pendentes' ? 'bg-amber-800 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {kpis.totalPendentes}
              </span>
            </button>

            <button
              onClick={() => setAbaAtiva('aprovadas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                abaAtiva === 'aprovadas'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Já Aprovadas</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  abaAtiva === 'aprovadas' ? 'bg-emerald-900 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {kpis.totalAprovadas}
              </span>
            </button>

            <button
              onClick={() => setAbaAtiva('revisao')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                abaAtiva === 'revisao'
                  ? 'bg-orange-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Em Revisão</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  abaAtiva === 'revisao' ? 'bg-orange-950 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {kpis.totalEmRevisao}
              </span>
            </button>

            <button
              onClick={() => setAbaAtiva('rejeitadas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                abaAtiva === 'rejeitadas'
                  ? 'bg-rose-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Rejeitadas</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  abaAtiva === 'rejeitadas' ? 'bg-rose-950 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {kpis.totalRejeitadas}
              </span>
            </button>

            <button
              onClick={() => setAbaAtiva('todas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                abaAtiva === 'todas'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Todas</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  abaAtiva === 'todas' ? 'bg-slate-900 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {kpis.totalGeral}
              </span>
            </button>
          </div>

          {/* Filtros em Linha */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Campo de Busca */}
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por #, solicitante, item..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filtro Setor */}
            <select
              value={filtroSetor}
              onChange={e => setFiltroSetor(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="todos">Todos os Setores</option>
              {setoresAprovados.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Filtro Criticidade */}
            <select
              value={filtroCriticidade}
              onChange={e => setFiltroCriticidade(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="todas">Criticidade: Todas</option>
              <option value="5">5 - Impeditiva</option>
              <option value="4">4 - Crítica</option>
              <option value="3">3 - Urgente</option>
              <option value="2">2 - Moderada</option>
              <option value="1">1 - Baixa</option>
            </select>

            {/* Filtro Valor */}
            <select
              value={filtroFaixaValor}
              onChange={e => setFiltroFaixaValor(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="todas">Valor: Todos</option>
              <option value="ate5k">Até R$ 5.000</option>
              <option value="5ka25k">R$ 5.000 a R$ 25.000</option>
              <option value="acima25k">Acima de R$ 25.000</option>
            </select>
          </div>
        </div>
      </section>

      {/* 3. Cockpit Master-Detail Dual Pane */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        
        {/* PAINEL ESQUERDO: Lista de Triagem de Solicitacoes (col-span-5) */}
        <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {/* Header da Lista com Selecao em Lote */}
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              {abaAtiva === 'pendentes' && (
                <button
                  type="button"
                  onClick={alternarTodasLote}
                  className="text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer select-none"
                  title="Selecionar todas as pendentes filtradas"
                >
                  {solicitacoesFiltradas.length > 0 &&
                  selecionadasLote.size ===
                    solicitacoesFiltradas.filter(r => r.status === 'pendente').length ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span className="font-semibold">Selecionar Tudo</span>
                </button>
              )}
              <span className="font-mono text-[11px] text-slate-500">
                Exibindo {solicitacoesFiltradas.length} solicitação(ões)
              </span>
            </div>

            {selecionadasLote.size > 0 && (
              <span className="text-emerald-400 font-bold text-[11px]">
                {selecionadasLote.size} selecionada(s)
              </span>
            )}
          </div>

          {/* Fila de Cards Rolavel */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1.5">
            {solicitacoesFiltradas.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                <CheckCircle2 className="w-12 h-12 text-slate-700 mb-2" />
                <p className="font-bold text-sm text-slate-300">Nenhuma solicitação encontrada</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  {abaAtiva === 'pendentes'
                    ? 'Parabéns! Você não possui compras pendentes de aprovação no momento.'
                    : 'Nenhum registro corresponde aos filtros selecionados.'}
                </p>
              </div>
            ) : (
              solicitacoesFiltradas.map(req => {
                const isSelected = req.id === selecionadaId;
                const isChecked = selecionadasLote.has(req.id);
                const itensReq = localDb.getRequestItems(req.id);
                const totalReq = itensReq.reduce(
                  (acc, it) => acc + (it.estimated_value || 0) * (it.quantity || 1),
                  0
                );

                // Destaque de criticidade
                const crit = req.criticality || 1;
                const critCor =
                  crit >= 4 ? 'text-rose-400 bg-rose-950/70 border-rose-800' :
                  crit === 3 ? 'text-amber-400 bg-amber-950/70 border-amber-800' :
                  'text-slate-300 bg-slate-800 border-slate-700';

                return (
                  <div
                    key={req.id}
                    onClick={() => setSelecionadaId(req.id)}
                    className={`group relative p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-slate-800 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                        : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    {/* Topo do Card */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {abaAtiva === 'pendentes' && (
                          <button
                            type="button"
                            onClick={e => alternarSelecaoLote(req.id, e)}
                            className="text-slate-400 hover:text-white cursor-pointer mt-0.5"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <span className="font-mono text-xs font-black text-white">
                          #{req.number}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${critCor}`}>
                          {rotuloCriticidade(req.criticality)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-black text-emerald-400">
                          {formatBRL(totalReq)}
                        </span>
                      </div>
                    </div>

                    {/* Solicitante e Setor */}
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold truncate">{req.solicitante_name}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400 truncate">{nomeSetor(req.solicitante_sector_id)}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0 ml-2">
                        {tempoAguardando(req.created_at)}
                      </span>
                    </div>

                    {/* Resumo de Itens e Data de Necessidade */}
                    <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-1.5">
                      <div className="flex items-center gap-1 truncate text-slate-400">
                        <Layers className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">
                          {itensReq.length} {itensReq.length === 1 ? 'item' : 'itens'}:{' '}
                          {itensReq.slice(0, 2).map(it => it.description).join(', ')}
                          {itensReq.length > 2 && '...'}
                        </span>
                      </div>

                      {req.data_necessidade && (
                        <div className="flex items-center gap-1 shrink-0 ml-2 font-mono text-[10px] text-slate-400">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span>Para {formatDateBR(req.data_necessidade)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* PAINEL DIREITO: Inspecao Profunda & Estacao de Decisao (col-span-7) */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {solicitacaoAtiva ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              
              {/* Header da Inspecao */}
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-white font-mono tracking-tight">
                        #{solicitacaoAtiva.number}
                      </h2>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        solicitacaoAtiva.status === 'aprovada' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        solicitacaoAtiva.status === 'pendente' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                        solicitacaoAtiva.status === 'em_revisao' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {rotuloStatus(solicitacaoAtiva)}
                      </span>
                      {solicitacaoAtiva.tipo_compra && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {solicitacaoAtiva.tipo_compra}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Criada em {formatDateTimeBR(solicitacaoAtiva.created_at)} por {solicitacaoAtiva.solicitante_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={exportarPdfSolicitacao}
                    disabled={gerandoPdf}
                    title="Exportar documento oficial FRM.SUP-0001 em PDF"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-400" />
                    <span>{gerandoPdf ? 'Gerando...' : 'PDF Oficial'}</span>
                  </button>

                  <button
                    onClick={() => onNavigate(`/solicitacoes?id=${solicitacaoAtiva.id}`)}
                    title="Abrir detalhes completos na Central de Solicitações"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
                  >
                    <span>Ver na Central</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Area Rolavel dos Detalhes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* Cartao: Solicitante & Logistica */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Setor Solicitante</span>
                    <p className="font-bold text-slate-200 mt-0.5">{nomeSetor(solicitacaoAtiva.solicitante_sector_id)}</p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Data Limite de Entrega</span>
                    <p className="font-bold text-slate-200 mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-500" />
                      {solicitacaoAtiva.data_necessidade ? formatDateBR(solicitacaoAtiva.data_necessidade) : 'Não estipulada'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Valor Estimado Total</span>
                    <p className="font-mono font-black text-emerald-400 text-sm mt-0.5">
                      {formatBRL(valorTotalAtivo)}
                    </p>
                  </div>
                </div>

                {/* Cartao: Justificativa e Aplicacao */}
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>Justificativa e Aplicação da Compra</span>
                  </h3>
                  <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {solicitacaoAtiva.justificativa || 'Nenhuma justificativa detalhada foi fornecida.'}
                  </p>
                </div>

                {/* Cartao: Itens Solicitados com Sinais SAP */}
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                      <span>Itens Solicitados ({itensAtivos.length})</span>
                    </h3>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      Subtotal: {formatBRL(valorTotalAtivo)}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-800/80">
                    {itensAtivos.map((it, idx) => {
                      const sinais = sinaisPorItem[it.id];
                      const totalItem = (it.estimated_value || 0) * (it.quantity || 1);

                      return (
                        <div key={it.id} className="py-3 flex flex-col gap-1.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-bold text-slate-200">
                                {idx + 1}. {it.description}
                                {it.is_generic && (
                                  <span className="ml-2 text-[10px] bg-slate-800 text-amber-400 font-bold px-1.5 py-0.5 rounded border border-amber-800/40">
                                    Item Genérico
                                  </span>
                                )}
                              </p>

                              <p className="font-mono text-[11px] text-slate-400 mt-0.5">
                                {it.sap_code ? `Código SAP: ${it.sap_code}` : 'Sem código SAP vinculado'}
                                {it.brand && ` · Marca/Fabricante: ${it.brand}`}
                                {it.is_similar_allowed && ' (Aceita similar)'}
                              </p>

                              {/* Chips de inteligencia SAP (estoque no almoxarifado, RM aberta, pedido a caminho) */}
                              {it.sap_code && (
                                <div className="mt-1.5">
                                  {sinais && sinais.length > 0 ? (
                                    <SinalChips chips={sinais} />
                                  ) : carregandoSinais ? (
                                    <p className="text-[11px] text-slate-400 italic">Consultando estoque e demandas no SAP...</p>
                                  ) : null}
                                </div>
                              )}

                              {it.observation && (
                                <p className="text-[11px] text-slate-400 italic mt-1">
                                  Observação: {it.observation}
                                </p>
                              )}

                              {it.reference_link && (
                                <a
                                  href={it.reference_link.startsWith('http') ? it.reference_link : `https://${it.reference_link}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300 hover:underline mt-1 cursor-pointer"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Link de Referência / Catálogo</span>
                                </a>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <p className="font-bold text-slate-200">
                                {it.quantity} {it.unit}
                              </p>
                              <p className="text-slate-400 text-[11px]">
                                {it.estimated_value > 0 ? `un: ${formatBRL(it.estimated_value)}` : 'Sem estimativa'}
                              </p>
                              {totalItem > 0 && (
                                <p className="font-mono font-bold text-emerald-400 text-xs mt-0.5">
                                  {formatBRL(totalItem)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cartao: Anexos e Cotacoes */}
                {anexosAtivos.length > 0 && (
                  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Anexos e Documentos ({anexosAtivos.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {anexosAtivos.map(att => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-xs text-slate-200 transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="truncate font-semibold">{att.name}</span>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cartao: Historico e Decisoes Anteriores */}
                {historicoAtivo.length > 0 && (
                  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Histórico de Decisões & Trâmite</span>
                    </h3>
                    <div className="space-y-2 pt-1 text-xs">
                      {historicoAtivo.map(h => (
                        <div key={h.id} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-200">
                              Mudança para <strong className="text-emerald-400">{h.to_status}</strong> por {h.user_name}
                            </p>
                            {h.comment && (
                              <p className="text-slate-400 mt-1 italic whitespace-pre-wrap">
                                &quot;{h.comment}&quot;
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0 font-mono">
                            {formatDateTimeBR(h.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* DOCK FIXO DE DECISAO DO GESTOR */}
              <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0 space-y-3">
                {solicitacaoAtiva.status === 'pendente' ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Estação de Decisão do Gestor</span>
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        Parecer obrigatório para devolução ou rejeição
                      </span>
                    </div>

                    {erroDecisao && (
                      <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{erroDecisao}</span>
                      </div>
                    )}

                    {/* Sugestoes Rapidas de Parecer */}
                    <div className="flex flex-wrap gap-1.5">
                      {SUGESTOES_PARECER.map((frase, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setParecer(frase)}
                          className="text-[11px] px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                        >
                          {frase}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={2}
                      value={parecer}
                      onChange={e => setParecer(e.target.value)}
                      placeholder="Insira o parecer técnico de aprovação ou a justificativa caso esteja devolvendo para revisão ou rejeitando a compra..."
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />

                    {/* Botoes de Acao */}
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        onClick={() => executarDecisao('aprovar')}
                        disabled={processandoAcao}
                        className="flex-1 min-w-[140px] py-2.5 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Aprovar Compra</span>
                      </button>

                      <button
                        onClick={() => executarDecisao('revisar')}
                        disabled={processandoAcao}
                        className="flex-1 min-w-[140px] py-2.5 px-4 rounded-lg bg-amber-950 hover:bg-amber-900 border border-amber-800 active:scale-[0.98] text-amber-300 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Devolver p/ Revisão</span>
                      </button>

                      <button
                        onClick={() => executarDecisao('rejeitar')}
                        disabled={processandoAcao}
                        className="flex-1 min-w-[140px] py-2.5 px-4 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-800 active:scale-[0.98] text-rose-300 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Rejeitar</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        Esta solicitação já foi decidida com status <strong>{rotuloStatus(solicitacaoAtiva)}</strong>.
                      </span>
                    </div>

                    {podeAlterarDecisao(solicitacaoAtiva, user) && (
                      <button
                        onClick={abrirModalRedecisao}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                      >
                        Alterar Decisão
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <FileText className="w-16 h-16 text-slate-700 mb-3" />
              <p className="font-bold text-base text-slate-300">Nenhuma solicitação selecionada</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Selecione uma solicitação na lista ao lado para inspecionar os detalhes, verificar os sinais do catálogo SAP e emitir seu parecer.
              </p>
            </div>
          )}
        </section>
      </main>

      {/* MODAL: Aprovacao em Lote */}
      {modalLoteAberta && (
        <Modal onClose={() => setModalLoteAberta(false)} maxWidth="max-w-lg">
          <ModalHeader onClose={() => setModalLoteAberta(false)}>
            <div className="flex items-center gap-2 text-white">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-base">Aprovação em Lote ({selecionadasLote.size} solicitações)</h3>
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4 text-xs">
              <p className="text-slate-300">
                Você está prestes a aprovar <strong className="text-white">{selecionadasLote.size} solicitações</strong> de compra simultaneamente. O status será alterado para <strong>Aprovada</strong> e os compradores serão notificados para cotação.
              </p>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300">Parecer Coletivo (Opcional):</label>
                <input
                  type="text"
                  value={parecerLote}
                  onChange={e => setParecerLote(e.target.value)}
                  placeholder="Ex.: Aprovado em lote pela gerência conforme demanda programada."
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalLoteAberta(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarAprovacaoLote}
                  disabled={processandoLote}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow transition-colors cursor-pointer disabled:opacity-50"
                >
                  {processandoLote ? 'Aprovando...' : `Confirmar Aprovação (${selecionadasLote.size})`}
                </button>
              </div>
            </div>
          </ModalBody>
        </Modal>
      )}

      {/* MODAL: Redecisao / Alterar Parecer */}
      {modalRedecidirAberta && (
        <Modal onClose={() => setModalRedecidirAberta(false)} maxWidth="max-w-md">
          <ModalHeader onClose={() => setModalRedecidirAberta(false)}>
            <div className="flex items-center gap-2 text-white">
              <RefreshCw className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-base">Alterar Decisão da Compra</h3>
            </div>
          </ModalHeader>
          <ModalBody>
            <form onSubmit={salvarRedecisao} className="space-y-4 text-xs">
              {erroRedecidir && (
                <div className="p-2.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300">
                  {erroRedecidir}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300">Novo Status:</label>
                <select
                  value={novoStatusDecisao}
                  onChange={e => setNovoStatusDecisao(e.target.value as RequestStatus)}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="aprovada">Aprovada</option>
                  <option value="em_revisao">Devolver para Revisão</option>
                  <option value="rejeitada">Rejeitada</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300">Motivo da Alteração da Decisão:</label>
                <textarea
                  rows={3}
                  required
                  value={justificativaRedecidir}
                  onChange={e => setJustificativaRedecidir(e.target.value)}
                  placeholder="Explique detalhadamente o motivo da reavaliação..."
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalRedecidirAberta(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={processandoRedecisao}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {processandoRedecisao ? 'Salvando...' : 'Salvar Nova Decisão'}
                </button>
              </div>
            </form>
          </ModalBody>
        </Modal>
      )}

    </div>
  );
}
