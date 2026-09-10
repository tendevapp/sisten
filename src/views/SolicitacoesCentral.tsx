/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Solicitações — uma tela para acompanhar, responder e decidir.
 *
 * Oferece visualização em Tabela detalhada (conforme novo design do SISTEN),
 * Quadro Kanban e Calendário de prazos, com filtros por tipo, status, setor,
 * criticidade e período.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Clock, Download, FileEdit, FileSpreadsheet, Loader2, PlusCircle, Search,
  HelpCircle, Bug, Lightbulb, ShoppingCart, Database, LifeBuoy, List, LayoutGrid,
  Calendar as CalendarIcon, MoreVertical, ChevronLeft, ChevronRight, CheckSquare,
} from 'lucide-react';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfMonth, startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { localDb } from '../db/localDb';
import { Profile, Request, RequestItem, RequestStatusHistory, Sector } from '../types';
import { formatDateBR, toDate } from '../lib/format';
import Modal, { ModalBody, ModalHeader } from '../components/ui/Modal';
import { TIPOS_EM_ORDEM, TIPO_VISUAL } from '../components/solicitacoes/tipoVisual';
import RequestDetailPanel from '../components/solicitacoes/RequestDetailPanel';
import TourSpotlight from '../components/help/TourSpotlight';
import { usePageTour } from '../components/help/TourRegistryContext';
import type { TourStep } from '../components/help/types';
import {
  baixarAnexos, contarAnexos, estaEmAberto, exportarSolicitacoes,
  foiEditadaAposAprovacao, rotuloStatus,
} from '../lib/solicitacoes';
import {
  Escopo, FAIXAS, Faixa, Novidade, Pendencia, escopoPadrao, escoposDisponiveis,
  faixaDe, filtrarPorEscopo, indexarEventos, indexarPendencias, lerEstadoLeitura,
  marcarLida, marcarTodasLidas, novidade, ordenarFila, ordenarPorRecencia,
  registrarVisita, universoVisivel,
} from '../lib/solicitacoesCentral';
import {
  calcularPrazoSolicitacao,
  formatarTempoRelativoAbertura,
  obterEstilosCriticidade,
  obterEstilosStatus,
  obterIniciaisNome,
  obterTituloEJustificativa,
} from '../components/solicitacoes/solicitacoesTabelaHelpers';

const CENTRAL_SOLICITACOES_TOUR_STEPS: TourStep[] = [
  {
    icon: ClipboardList,
    title: 'Bem-vindo à Central de Solicitações',
    description: 'Aqui você acompanha, responde e toma decisões sobre todos os pedidos de compra, cadastros no SAP e chamados de suporte em um só lugar.',
  },
  {
    target: 'solicitacoes-header',
    icon: PlusCircle,
    title: 'Visão geral e nova solicitação',
    description: 'Veja o escopo ativo e acione o botão "+ Nova solicitação" para abrir um novo pedido de compra, chamado ou cadastro SAP a qualquer momento.',
  },
  {
    target: 'solicitacoes-abas',
    icon: LayoutGrid,
    title: 'Abas de escopo dinâmico',
    description: 'Alterne entre "Precisa de mim" (suas pendências ativas de aprovação ou resposta), "Minhas solicitações" (pedidos criados por você), "Do meu setor" e "Todas".',
  },
  {
    target: 'solicitacoes-tipos',
    icon: List,
    title: 'Composição por tipo em chips e visualizações',
    description: 'Filtre instantaneamente por Compras, Cadastros SAP ou Chamados, ou alterne os modos de exibição entre Lista, Quadro Kanban e Calendário.',
  },
  {
    target: 'solicitacoes-filtros',
    icon: Search,
    title: 'Busca instantânea e filtros refinados',
    description: 'Localize rapidamente por número, solicitante, título, criticidade, status e período de abertura.',
  },
  {
    target: 'solicitacoes-lista',
    icon: ClipboardList,
    title: 'Tabela de solicitações',
    description: 'Visualize todas as informações essenciais: tipo, título, justificativa, solicitante, setor, data de abertura, prazo e criticidade. Clique em qualquer linha para abrir o detalhe.',
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

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
  escopoInicial?: Escopo;
}

interface Linha {
  request: Request;
  pendencia: Pendencia | null;
  novidade: Novidade | null;
  faixa: Faixa;
}

type ModoVisao = 'lista' | 'quadro' | 'calendario';

export default function SolicitacoesCentral({ user, onNavigate, escopoInicial }: Props) {
  const tour = usePageTour('central-solicitacoes', CENTRAL_SOLICITACOES_TOUR_STEPS.length);
  const abas = useMemo(() => escoposDisponiveis(user), [user]);

  const cache = localDb.getPageCache('solicitacoes_central', {
    escopo: escopoInicial || escopoPadrao(user),
    busca: '',
    tipo: 'todos',
    criticidade: 'todas',
    setor: 'todos',
    statusFiltro: 'abertas',
    dataFiltro: 'todas',
    visao: 'lista' as ModoVisao,
  });

  const [escopo, setEscopo] = useState<Escopo>(
    abas.some(a => a.id === (escopoInicial || cache.escopo))
      ? (escopoInicial || cache.escopo)
      : escopoPadrao(user),
  );
  const [busca, setBusca] = useState<string>(cache.busca);
  const [tipo, setTipo] = useState<string>(cache.tipo);
  const [criticidade, setCriticidade] = useState<string>(cache.criticidade);
  const [setor, setSetor] = useState<string>(cache.setor);
  const [statusFiltro, setStatusFiltro] = useState<string>(cache.statusFiltro || 'abertas');
  const [dataFiltro, setDataFiltro] = useState<string>(cache.dataFiltro || 'todas');
  const [visao, setVisao] = useState<ModoVisao>((cache.visao as ModoVisao) || 'lista');

  const [todas, setTodas] = useState<Request[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  const [refMes, setRefMes] = useState(() => startOfMonth(new Date()));

  const [leitura, setLeitura] = useState(() => lerEstadoLeitura(user.id));
  const [leituraDaSessao] = useState(() => lerEstadoLeitura(user.id));

  useEffect(() => {
    localDb.setPageCache('solicitacoes_central', {
      escopo, busca, tipo, criticidade, setor, statusFiltro, dataFiltro, visao,
    });
  }, [escopo, busca, tipo, criticidade, setor, statusFiltro, dataFiltro, visao]);

  const carregar = () => {
    setTodas(localDb.getRequests());
    setSectors(localDb.getSectors());
  };

  const aplicarUrl = () => {
    const params = new URLSearchParams((window.location.hash.split('?')[1]) || '');

    const escopoUrl = params.get('escopo') as Escopo | null;
    if (escopoUrl && abas.some(a => a.id === escopoUrl)) setEscopo(escopoUrl);

    const id = params.get('id');
    if (id) abrir(id);
  };

  useEffect(() => {
    carregar();
    registrarVisita(user.id);
    aplicarUrl();

    window.addEventListener('hashchange', aplicarUrl);
    const cancelarSubscribe = localDb.subscribe(carregar);

    return () => {
      window.removeEventListener('hashchange', aplicarUrl);
      cancelarSubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  /* Indices ---------------------------------------------------------------- */

  const universo = useMemo(() => universoVisivel(todas, user), [todas, user]);

  const eventos = useMemo(
    () => indexarEventos(localDb.getAllRequestComments(), localDb.getAllRequestHistory()),
    [todas],
  );

  const pendencias = useMemo(
    () => indexarPendencias(universo, user, eventos.conversa),
    [universo, user, eventos],
  );

  const totalPendencias = pendencias.size;

  const itensPorRequestId = useMemo(() => {
    const map = new Map<string, RequestItem[]>();
    for (const req of todas) {
      if (req.type === 'compra') {
        map.set(req.id, localDb.getRequestItems(req.id));
      }
    }
    return map;
  }, [todas]);

  const idsEditadasAposAprovacao = useMemo(() => {
    const todosHistoricos = localDb.getAllRequestHistory();
    const map = new Map<string, RequestStatusHistory[]>();
    for (const h of todosHistoricos) {
      let arr = map.get(h.request_id);
      if (!arr) {
        arr = [];
        map.set(h.request_id, arr);
      }
      arr.push(h);
    }

    const editadas = new Set<string>();
    for (const req of todas) {
      if (['pendente', 'em_revisao'].includes(req.status)) {
        const hist = map.get(req.id) || [];
        if (foiEditadaAposAprovacao(req, hist)) {
          editadas.add(req.id);
        }
      }
    }
    return editadas;
  }, [todas]);

  /* Filtros e Linhas -------------------------------------------------------- */

  const antesDoTipo = useMemo(() => {
    let lista = filtrarPorEscopo(universo, user, escopo, pendencias);

    // Filtro por status
    if (statusFiltro !== 'todas') {
      if (statusFiltro === 'abertas') {
        lista = lista.filter(r => estaEmAberto(r));
      } else if (statusFiltro === 'em_analise') {
        lista = lista.filter(r => ['em_atendimento', 'em_revisao', 'aguardando_solicitante'].includes(r.status));
      } else if (statusFiltro === 'aguardando_aprovacao') {
        lista = lista.filter(r => r.type === 'compra' && r.status === 'pendente');
      } else if (statusFiltro === 'concluidas') {
        lista = lista.filter(r => ['resolvido', 'fechado', 'aprovada'].includes(r.status));
      } else if (statusFiltro === 'canceladas') {
        lista = lista.filter(r => ['cancelada', 'rejeitada'].includes(r.status));
      }
    }

    // Filtro por criticidade
    if (criticidade !== 'todas') {
      lista = lista.filter(r => r.criticality === Number(criticidade));
    }

    // Filtro por setor
    if (setor !== 'todos') {
      lista = lista.filter(r => r.solicitante_sector_id === setor);
    }

    // Filtro por data
    if (dataFiltro !== 'todas') {
      const agora = new Date();
      const hojeZero = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
      const msPorDia = 24 * 60 * 60 * 1000;

      lista = lista.filter(r => {
        const dt = toDate(r.created_at);
        if (!dt) return false;
        const dtZero = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
        const diffDias = Math.round((hojeZero - dtZero) / msPorDia);

        if (dataFiltro === 'hoje') return diffDias === 0;
        if (dataFiltro === '7dias') return diffDias >= 0 && diffDias <= 7;
        if (dataFiltro === '30dias') return diffDias >= 0 && diffDias <= 30;
        if (dataFiltro === 'este_mes') {
          return dt.getMonth() === agora.getMonth() && dt.getFullYear() === agora.getFullYear();
        }
        return true;
      });
    }

    // Busca textual
    const q = busca.trim().toLowerCase();
    if (q) {
      lista = lista.filter(r =>
        r.number.toLowerCase().includes(q) ||
        r.solicitante_name.toLowerCase().includes(q) ||
        (r.justificativa || '').toLowerCase().includes(q) ||
        (r.titulo || '').toLowerCase().includes(q),
      );
    }
    return lista;
  }, [universo, user, escopo, pendencias, statusFiltro, criticidade, setor, dataFiltro, busca]);

  const contagemPorTipo = useMemo(() => {
    const contagem = { total: antesDoTipo.length, compra: 0, cadastro_sap: 0, chamado: 0 };
    for (const r of antesDoTipo) contagem[r.type]++;
    return contagem;
  }, [antesDoTipo]);

  const linhas: Linha[] = useMemo(() => {
    const lista = tipo === 'todos' ? antesDoTipo : antesDoTipo.filter(r => r.type === tipo);

    return lista.map(r => {
      const p = pendencias.get(r.id) || null;
      const n = novidade(r, user, leituraDaSessao, eventos, rotuloStatus);
      return { request: r, pendencia: p, novidade: n, faixa: faixaDe(r, !!p, !!n) };
    });
  }, [antesDoTipo, tipo, pendencias, user, eventos, leituraDaSessao]);

  const aberta = universo.find(r => r.id === abertaId) || todas.find(r => r.id === abertaId) || null;

  /* Acoes ------------------------------------------------------------------ */

  function abrir(id: string) {
    setAbertaId(id);
    setLeitura(marcarLida(user.id, id));
    localDb.markRequestNotificationsAsRead(user.id, id);
  }

  const fechar = () => setAbertaId(null);

  const limparFiltros = () => {
    setBusca('');
    setStatusFiltro('abertas');
    setCriticidade('todas');
    setSetor('todos');
    setDataFiltro('todas');
    setTipo('todos');
  };

  const alternarSelecao = (id: string) => {
    const proximo = new Set(selecionadas);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    setSelecionadas(proximo);
  };

  const alternarTodasSelecoes = () => {
    if (selecionadas.size === linhas.length && linhas.length > 0) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(linhas.map(l => l.request.id)));
    }
  };

  const selecionadasReq = useMemo(
    () => linhas.filter(l => selecionadas.has(l.request.id)).map(l => l.request),
    [linhas, selecionadas],
  );

  const baixar = async () => {
    setOcupado(true);
    setAviso('');
    const { baixados, falhas } = await baixarAnexos(selecionadasReq);
    setOcupado(false);

    if (baixados === 0 && falhas.length === 0) setAviso('Nenhuma das selecionadas tem anexo.');
    else if (falhas.length > 0) setAviso(`${baixados} anexo(s) baixado(s). Falharam: ${falhas.join(', ')}.`);
    else setAviso(`${baixados} anexo(s) baixado(s).`);
  };

  const nomeSetor = (id: string) => sectors.find(s => s.id === id)?.name || id;
  const abaAtiva = abas.find(a => a.id === escopo) || abas[0];
  const modoFila = escopo === 'todas' || escopo === 'setor';

  /* Calendario -------------------------------------------------------------- */

  const diasCalendario = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(refMes), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(refMes), { weekStartsOn: 0 }),
  }), [refMes]);

  const itensPorDiaCalendario = useMemo(() => {
    const mapa = new Map<string, Linha[]>();
    for (const linha of linhas) {
      const prazo = linha.request.prazo_conclusao || linha.request.data_necessidade || linha.request.created_at;
      if (prazo) {
        const d = toDate(prazo);
        if (d) {
          const chave = format(d, 'yyyy-MM-dd');
          const arr = mapa.get(chave) || [];
          arr.push(linha);
          mapa.set(chave, arr);
        }
      }
    }
    return mapa;
  }, [linhas]);

  /* Desenho ---------------------------------------------------------------- */

  return (
    <div className="space-y-4 py-3 text-left">
      {/* Cabecalho Principal */}
      <header data-tour="solicitacoes-header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
            <ClipboardList className="h-6 w-6" style={{ color: 'var(--brand)' }} /> Solicitações
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {abaAtiva.descricao}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('/solicitacoes/nova')}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white cursor-pointer shadow-xs transition-opacity hover:opacity-95"
          style={{ background: 'var(--brand)' }}
        >
          <PlusCircle className="h-4 w-4" /> Nova solicitação
        </button>
      </header>

      {/* Abas de escopo dinâmico */}
      <nav
        data-tour="solicitacoes-abas"
        className="flex flex-wrap gap-1 rounded-xl border p-1"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
        aria-label="Recorte das solicitações"
      >
        {abas.map(aba => {
          const ativa = aba.id === escopo;
          return (
            <button
              key={aba.id}
              type="button"
              onClick={() => setEscopo(aba.id)}
              aria-current={ativa ? 'page' : undefined}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-bold cursor-pointer transition-colors"
              style={ativa
                ? { background: 'var(--brand)', color: '#fff' }
                : { color: 'var(--ink-secondary)' }}
            >
              {aba.label}
              {aba.id === 'acao' && totalPendencias > 0 && (
                <span
                  className="rounded-full px-1.5 text-xs font-bold tabular-nums"
                  style={ativa
                    ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                    : { background: 'var(--status-critical)', color: '#fff' }}
                >
                  {totalPendencias}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Barra de Tipos e Alternador de Visao (Exibicao do Mockup) */}
      <div data-tour="solicitacoes-tipos" className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Pilulas de Tipo */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Todas */}
          <button
            type="button"
            onClick={() => setTipo('todos')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold cursor-pointer transition-all ${
              tipo === 'todos'
                ? 'bg-[#00897b] text-white shadow-sm'
                : 'bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span>Todas</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                tipo === 'todos' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300'
              }`}
            >
              {contagemPorTipo.total}
            </span>
          </button>

          {/* Compras */}
          <button
            type="button"
            onClick={() => setTipo(tipo === 'compra' ? 'todos' : 'compra')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold cursor-pointer transition-all ${
              tipo === 'compra'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingCart className={`h-4 w-4 ${tipo === 'compra' ? 'text-white' : 'text-sky-500'}`} />
            <span>Compras</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                tipo === 'compra' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300'
              }`}
            >
              {contagemPorTipo.compra}
            </span>
          </button>

          {/* Cadastros SAP */}
          <button
            type="button"
            onClick={() => setTipo(tipo === 'cadastro_sap' ? 'todos' : 'cadastro_sap')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold cursor-pointer transition-all ${
              tipo === 'cadastro_sap'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Database className={`h-4 w-4 ${tipo === 'cadastro_sap' ? 'text-white' : 'text-purple-600'}`} />
            <span>Cadastros SAP</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                tipo === 'cadastro_sap' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300'
              }`}
            >
              {contagemPorTipo.cadastro_sap}
            </span>
          </button>

          {/* Chamados */}
          <button
            type="button"
            onClick={() => setTipo(tipo === 'chamado' ? 'todos' : 'chamado')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold cursor-pointer transition-all ${
              tipo === 'chamado'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <LifeBuoy className={`h-4 w-4 ${tipo === 'chamado' ? 'text-white' : 'text-orange-500'}`} />
            <span>Chamados</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                tipo === 'chamado' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300'
              }`}
            >
              {contagemPorTipo.chamado}
            </span>
          </button>
        </div>

        {/* Alternador de Modo de Exibicao */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-850 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs">
          <button
            type="button"
            onClick={() => setVisao('lista')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              visao === 'lista'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700 shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <List className="h-4 w-4" />
            Lista
          </button>
          <button
            type="button"
            onClick={() => setVisao('quadro')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              visao === 'quadro'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700 shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Quadro
          </button>
          <button
            type="button"
            onClick={() => setVisao('calendario')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              visao === 'calendario'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700 shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <CalendarIcon className="h-4 w-4" />
            Calendário
          </button>
        </div>
      </div>

      {/* Barra de Busca e Filtros com Rotulos Superiores */}
      <div
        data-tour="solicitacoes-filtros"
        className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-end gap-3 justify-between"
      >
        {/* Campo de Busca */}
        <div data-tour="solicitacoes-busca" className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por número, solicitante, título ou justificativa..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 py-2 pl-10 pr-4 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>

        {/* Dropdowns com Rotulos */}
        <div className="flex flex-wrap items-end gap-3 text-xs">
          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Status</label>
            <select
              value={statusFiltro}
              onChange={e => setStatusFiltro(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              <option value="abertas">Abertas</option>
              <option value="todas">Todas</option>
              <option value="em_analise">Em análise</option>
              <option value="aguardando_aprovacao">Aguardando aprovação</option>
              <option value="concluidas">Concluídas</option>
              <option value="canceladas">Canceladas / Rejeitadas</option>
            </select>
          </div>

          {/* Criticidade */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Criticidade</label>
            <select
              value={criticidade}
              onChange={e => setCriticidade(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              <option value="todas">Todas</option>
              <option value="5">5 - Impeditiva</option>
              <option value="4">4 - Crítica</option>
              <option value="3">3 - Alta</option>
              <option value="2">2 - Média</option>
              <option value="1">1 - Baixa</option>
            </select>
          </div>

          {/* Meu setor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Meu setor</label>
            <select
              value={setor}
              onChange={e => setSetor(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              <option value="todos">Todos</option>
              {sectors.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Data */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Data</label>
            <select
              value={dataFiltro}
              onChange={e => setDataFiltro(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              <option value="todas">Todas</option>
              <option value="hoje">Hoje</option>
              <option value="7dias">Últimos 7 dias</option>
              <option value="30dias">Últimos 30 dias</option>
              <option value="este_mes">Este mês</option>
            </select>
          </div>

          {/* Limpar filtros */}
          <button
            type="button"
            onClick={limparFiltros}
            className="text-xs sm:text-sm font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 cursor-pointer whitespace-nowrap self-end pb-2.5 transition-colors"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Barra de Acoes em Lote (Exportacao e Download de Anexos) */}
      {modoFila && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              {selecionadas.size} de {linhas.length} selecionada(s)
            </span>

            <button
              type="button"
              onClick={() => exportarSolicitacoes(selecionadasReq, sectors)}
              disabled={selecionadasReq.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Exportar Excel
            </button>

            <button
              type="button"
              onClick={baixar}
              disabled={selecionadasReq.length === 0 || contarAnexos(selecionadasReq) === 0 || ocupado}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar anexos
            </button>
          </div>

          {aviso && (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{aviso}</span>
          )}
        </div>
      )}

      {/* VISÃO 1: TABELA (LISTA) */}
      {visao === 'lista' && (
        <div
          data-tour="solicitacoes-lista"
          className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {modoFila && (
                    <th scope="col" className="w-10 px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={linhas.length > 0 && selecionadas.size === linhas.length}
                        onChange={alternarTodasSelecoes}
                        aria-label="Selecionar todas"
                        className="cursor-pointer rounded"
                        style={{ accentColor: 'var(--brand)' }}
                      />
                    </th>
                  )}
                  <th scope="col" className="w-24 px-4 py-3">#</th>
                  <th scope="col" className="w-28 px-3 py-3">Tipo</th>
                  <th scope="col" className="min-w-[240px] px-3 py-3">Título / Justificativa</th>
                  <th scope="col" className="w-44 px-3 py-3">Solicitante</th>
                  <th scope="col" className="w-32 px-3 py-3">Setor</th>
                  <th scope="col" className="w-36 px-3 py-3">Data de abertura</th>
                  <th scope="col" className="w-32 px-3 py-3">Prazo</th>
                  <th scope="col" className="w-36 px-3 py-3">Criticidade</th>
                  <th scope="col" className="w-28 px-3 py-3">Status</th>
                  <th scope="col" className="w-16 px-3 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {linhas.length === 0 ? (
                  <tr>
                    <td colSpan={modoFila ? 11 : 10} className="py-12 text-center text-slate-500 dark:text-slate-400">
                      <ClipboardList className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="font-semibold text-slate-700 dark:text-slate-200">
                        {escopo === 'acao' ? 'Nada esperando você no momento' : 'Nenhuma solicitação encontrada'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Ajuste os filtros de busca para ampliar os resultados.</p>
                    </td>
                  </tr>
                ) : (
                  linhas.map(linha => {
                    const req = linha.request;
                    const itens = itensPorRequestId.get(req.id) || [];
                    const { titulo, subtitulo } = obterTituloEJustificativa(req, itens, nomeSetor);
                    const prazoInfo = calcularPrazoSolicitacao(req);
                    const criticidadeInfo = obterEstilosCriticidade(req.criticality);
                    const statusInfo = obterEstilosStatus(req.status, req.type, !!req.linked_rm_number);
                    const iniciais = obterIniciaisNome(req.solicitante_name);
                    const tempoAbertura = formatarTempoRelativoAbertura(req.created_at);

                    return (
                      <tr
                        key={req.id}
                        onClick={() => abrir(req.id)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors cursor-pointer group"
                      >
                        {modoFila && (
                          <td className="px-3 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selecionadas.has(req.id)}
                              onChange={() => alternarSelecao(req.id)}
                              aria-label={`Selecionar ${req.number}`}
                              className="cursor-pointer rounded"
                              style={{ accentColor: 'var(--brand)' }}
                            />
                          </td>
                        )}

                        {/* # */}
                        <td className="px-4 py-3.5 font-mono font-bold text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          #{req.number}
                        </td>

                        {/* Tipo */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          {req.type === 'chamado' && (
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200/60 dark:border-orange-800/60 text-orange-500 flex items-center justify-center shrink-0">
                                <LifeBuoy className="h-4 w-4" />
                              </span>
                              <span className="text-[11px] font-bold text-orange-500 tracking-wider">CHAMADO</span>
                            </div>
                          )}
                          {req.type === 'compra' && (
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60 text-blue-500 flex items-center justify-center shrink-0">
                                <ShoppingCart className="h-4 w-4" />
                              </span>
                              <span className="text-[11px] font-bold text-blue-500 tracking-wider">COMPRA</span>
                            </div>
                          )}
                          {req.type === 'cadastro_sap' && (
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                                <Database className="h-4 w-4" />
                              </span>
                              <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 tracking-wider">SAP</span>
                            </div>
                          )}
                        </td>

                        {/* Titulo / Justificativa */}
                        <td className="px-3 py-3.5 min-w-[240px] max-w-[340px]">
                          <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate" title={titulo}>
                            {titulo}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5" title={subtitulo}>
                            {subtitulo}
                          </div>
                        </td>

                        {/* Solicitante */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 uppercase">
                              {iniciais}
                            </span>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[130px]">
                              {req.solicitante_name}
                            </span>
                          </div>
                        </td>

                        {/* Setor */}
                        <td className="px-3 py-3.5 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">
                          {nomeSetor(req.solicitante_sector_id)}
                        </td>

                        {/* Data de abertura */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {formatDateBR(req.created_at)}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {tempoAbertura}
                          </div>
                        </td>

                        {/* Prazo */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {prazoInfo.dataPrazoFormatada}
                          </div>
                          <div
                            className={`text-xs font-semibold mt-0.5 ${
                              prazoInfo.urgente || prazoInfo.estaVencido
                                ? 'text-red-500 dark:text-red-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {prazoInfo.textoRelativo}
                          </div>
                        </td>

                        {/* Criticidade */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${criticidadeInfo.classes}`}>
                            {criticidadeInfo.rotulo}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${statusInfo.classes}`}>
                            {statusInfo.rotulo}
                          </span>
                        </td>

                        {/* Acoes */}
                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              abrir(req.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                            title="Ver detalhes da solicitação"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISÃO 2: QUADRO (KANBAN) */}
      {visao === 'quadro' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { id: 'abertas', titulo: 'Abertas', cor: 'border-sky-500', filtro: (r: Request) => estaEmAberto(r) && !['em_atendimento', 'em_revisao', 'aguardando_solicitante'].includes(r.status) },
            { id: 'analise', titulo: 'Em análise', cor: 'border-amber-500', filtro: (r: Request) => ['em_atendimento', 'em_revisao', 'aguardando_solicitante'].includes(r.status) },
            { id: 'concluidas', titulo: 'Concluídas / Encerradas', cor: 'border-emerald-500', filtro: (r: Request) => ['resolvido', 'fechado', 'aprovada', 'cancelada', 'rejeitada'].includes(r.status) },
          ] as const).map(col => {
            const itensCol = linhas.filter(l => col.filtro(l.request));
            return (
              <div
                key={col.id}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3.5 flex flex-col min-h-[420px]"
              >
                <div className={`flex items-center justify-between pb-3 mb-3 border-b-2 ${col.cor}`}>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">{col.titulo}</h3>
                  <span className="text-xs font-bold rounded-full bg-slate-200 dark:bg-slate-750 px-2 py-0.5 text-slate-700 dark:text-slate-300">
                    {itensCol.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[640px] pr-1">
                  {itensCol.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">Nenhum item nesta coluna</div>
                  ) : (
                    itensCol.map(linha => {
                      const req = linha.request;
                      const itens = itensPorRequestId.get(req.id) || [];
                      const { titulo, subtitulo } = obterTituloEJustificativa(req, itens, nomeSetor);
                      const prazoInfo = calcularPrazoSolicitacao(req);
                      const criticidadeInfo = obterEstilosCriticidade(req.criticality);
                      const statusInfo = obterEstilosStatus(req.status, req.type, !!req.linked_rm_number);

                      return (
                        <div
                          key={req.id}
                          onClick={() => abrir(req.id)}
                          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-850 p-3.5 shadow-2xs hover:shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                              #{req.number}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${criticidadeInfo.classes}`}>
                              {criticidadeInfo.rotulo}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-1">{titulo}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{subtitulo}</p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                            <span className="text-slate-500 truncate max-w-[130px]">{req.solicitante_name}</span>
                            <span className={`font-semibold ${prazoInfo.urgente ? 'text-red-500' : 'text-slate-400'}`}>
                              {prazoInfo.textoRelativo}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VISÃO 3: CALENDÁRIO */}
      {visao === 'calendario' && (
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRefMes(m => addMonths(m, -1))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setRefMes(startOfMonth(new Date()))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setRefMes(m => addMonths(m, 1))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <h3 className="text-base font-bold capitalize text-slate-800 dark:text-slate-100">
              {format(refMes, "MMMM 'de' yyyy", { locale: ptBR })}
            </h3>
          </div>

          <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-800">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="py-2 text-center text-xs font-bold uppercase bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400">
                {d}
              </div>
            ))}

            {diasCalendario.map(dia => {
              const chave = format(dia, 'yyyy-MM-dd');
              const itensDia = itensPorDiaCalendario.get(chave) || [];
              const ehMesAtual = isSameMonth(dia, refMes);
              const ehHoje = isToday(dia);

              return (
                <div
                  key={chave}
                  className={`min-h-[90px] p-2 bg-white dark:bg-slate-900 transition-colors ${
                    !ehMesAtual ? 'opacity-40' : ''
                  } ${ehHoje ? 'ring-2 ring-emerald-500 ring-inset' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${ehHoje ? 'text-emerald-600 font-extrabold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {format(dia, 'd')}
                    </span>
                    {itensDia.length > 0 && (
                      <span className="text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 text-slate-600 dark:text-slate-300">
                        {itensDia.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[60px]">
                    {itensDia.slice(0, 2).map(l => (
                      <button
                        key={l.request.id}
                        type="button"
                        onClick={() => abrir(l.request.id)}
                        className="w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors block cursor-pointer"
                      >
                        #{l.request.number} {l.request.titulo || l.request.justificativa || 'Solicitação'}
                      </button>
                    ))}
                    {itensDia.length > 2 && (
                      <span className="text-[9px] text-slate-400 font-medium pl-1 block">
                        +{itensDia.length - 2} mais
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detalhe — em janela suspensa Modal */}
      {aberta && (
        <Modal onClose={fechar} maxWidth="max-w-4xl" ariaLabel={`Solicitação ${aberta.number}`}>
          <ModalHeader onClose={fechar}>
            <div className="flex flex-1 items-center justify-between gap-3 mr-6">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: TIPO_VISUAL[aberta.type].fundo,
                    color: TIPO_VISUAL[aberta.type].cor,
                  }}
                >
                  {(() => {
                    const Icone = TIPO_VISUAL[aberta.type].icone;
                    return <Icone className="h-5 w-5" />;
                  })()}
                </span>
                <div className="min-w-0">
                  <h3 className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                    #{aberta.number}
                  </h3>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {TIPO_VISUAL[aberta.type].rotulo} · aberta em {formatDateBR(aberta.created_at)}
                  </p>
                </div>
              </div>

              {aberta.type === 'compra' && aberta.status === 'pendente' && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100/90 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/80">
                    <Clock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    Aguardando aprovação
                  </span>
                  {idsEditadasAposAprovacao.has(aberta.id) && (
                    <span
                      title="Esta solicitação já havia sido aprovada anteriormente e voltou para a fila após ser editada pelo solicitante"
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/80"
                    >
                      <FileEdit className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                      Editada
                    </span>
                  )}
                </div>
              )}

              {aberta.type === 'compra' && aberta.status === 'em_revisao' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs bg-amber-100/90 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/80">
                  <Clock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                  Em revisão
                </span>
              )}
            </div>
          </ModalHeader>
          <ModalBody>
            <RequestDetailPanel
              request={aberta}
              user={user}
              sectors={sectors}
              pendencia={pendencias.get(aberta.id) || null}
              onNavigate={onNavigate}
              onChanged={carregar}
            />
          </ModalBody>
        </Modal>
      )}

      {tour.isOpen && (
        <TourSpotlight
          steps={CENTRAL_SOLICITACOES_TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
    </div>
  );
}
