/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel Analítico de Lead Time das Carretas (Logística & Expedição).
 *
 * Exibe visões gráficas interativas (por semana, por carreta e por transportadora)
 * para monitorar os tempos de ciclo de carregamento e identificar veículos que
 * ultrapassaram o SLA de 24 horas.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft, RefreshCw, FileSpreadsheet, Truck, Clock, Timer,
  AlertTriangle, CheckCircle2, TrendingUp, Calendar, Search, Filter,
  Building2, CalendarDays, X, ChevronRight, Eye, ShieldAlert,
  MessageSquare, MessageSquarePlus, Paperclip, Camera, FileText,
  Download, ImageIcon, Send, Loader2, AlertCircle, Trash2,
} from 'lucide-react';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import type { Profile, TipoObservacaoTramo, ExpedicaoTramoObservacao, ExpedicaoTramoEvidencia } from '../../types';
import * as api from '../../lib/expedicaoApi';
import {
  extrairCarretas, agruparPorSemana, agruparPorTransportadora, agruparPorTramo,
  calcularResumoKpis, calcularIntervaloPreset, filtrarCarretas, exportarRelatorioExcel,
  formatarHorasHumanas,
  type CarretaMetrica, type PresetPeriodo, type FiltroSla, type FiltrosRelatorioExpedicao,
} from '../../lib/expedicaoRelatorio';
import { useChartConfig, estimateCategoryChartWidth } from '../../components/charts/chartDefaults';
import ChartCard from '../../components/charts/ChartCard';
import ChartTooltip from '../../components/charts/ChartTooltip';
import KpiCard from '../../components/charts/KpiCard';
import Modal, { ModalBody, ModalHeader, ModalFooter } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';

interface Props {
  user: Profile;
  onVoltar: () => void;
}

type TabVisao = 'semanas' | 'carretas' | 'transportadoras';

interface TableDoubleScrollProps {
  children: React.ReactNode;
  className?: string;
  trigger?: any;
}

/**
 * Container de tabela com barra de rolagem horizontal dupla (no topo e na base).
 * Sincroniza o scrollLeft bidirecionalmente e exibe a barra superior apenas quando
 * houver transbordo horizontal real na tabela.
 */
function TableDoubleScroll({ children, className = '', trigger }: TableDoubleScrollProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false);

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;

    const atualizar = () => {
      const sw = el.scrollWidth;
      const cw = el.clientWidth;
      setScrollWidth(sw);
      setHasHorizontalScroll(sw > cw + 2);
      if (topScrollRef.current && Math.abs(topScrollRef.current.scrollLeft - el.scrollLeft) > 1) {
        topScrollRef.current.scrollLeft = el.scrollLeft;
      }
    };

    atualizar();
    const rafId = requestAnimationFrame(atualizar);
    const timeoutId = setTimeout(atualizar, 100);

    const ro = new ResizeObserver(() => {
      atualizar();
    });
    ro.observe(el);
    if (el.firstElementChild) {
      ro.observe(el.firstElementChild);
    }
    window.addEventListener('resize', atualizar);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      ro.disconnect();
      window.removeEventListener('resize', atualizar);
    };
  }, [trigger]);

  const handleTopScroll = () => {
    if (isSyncingRef.current) return;
    if (topScrollRef.current && mainScrollRef.current) {
      isSyncingRef.current = true;
      mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
  };

  const handleMainScroll = () => {
    if (isSyncingRef.current) return;
    if (topScrollRef.current && mainScrollRef.current) {
      isSyncingRef.current = true;
      topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
  };

  return (
    <div className={`w-full flex flex-col ${className}`}>
      {hasHorizontalScroll && (
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="overflow-x-auto overflow-y-hidden custom-scrollbar border-b border-slate-200/80 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-950/70 shrink-0"
          style={{ height: '15px' }}
          title="Barra de rolagem horizontal superior"
          aria-hidden="true"
        >
          <div style={{ width: scrollWidth, height: '1px' }} />
        </div>
      )}
      <div
        ref={mainScrollRef}
        onScroll={handleMainScroll}
        className="overflow-x-auto custom-scrollbar"
      >
        {children}
      </div>
    </div>
  );
}

export default function ExpedicaoRelatorioLeadTime({ user, onVoltar }: Props) {
  const toast = useToast();
  const chartConfig = useChartConfig();

  // Estados de dados
  const [carregando, setCarregando] = useState(true);
  const [carretasBrutas, setCarretasBrutas] = useState<CarretaMetrica[]>([]);
  const [carretaDetalhes, setCarretaDetalhes] = useState<CarretaMetrica | null>(null);

  // Estados para observação e evidências da carreta selecionada
  const [textoNovaObs, setTextoNovaObs] = useState<string>('');
  const [tipoNovaObs, setTipoNovaObs] = useState<TipoObservacaoTramo>('justificativa_atraso');
  const [arquivosEvidencia, setArquivosEvidencia] = useState<File[]>([]);
  const [salvandoObs, setSalvandoObs] = useState<boolean>(false);
  const [carregandoUrls, setCarregandoUrls] = useState<boolean>(false);
  const [previewFotoUrl, setPreviewFotoUrl] = useState<{ url: string; nome: string } | null>(null);

  // Aba ativa
  const [abaAtiva, setAbaAtiva] = useState<TabVisao>('semanas');

  // Filtros
  const [preset, setPreset] = useState<PresetPeriodo>('tudo');
  const [dataDe, setDataDe] = useState<string>('');
  const [dataAte, setDataAte] = useState<string>('');
  const [filtroSla, setFiltroSla] = useState<FiltroSla>('todos');
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('TODAS');
  const [filtroTramo, setFiltroTramo] = useState<string>('TODOS');
  const [termoBusca, setTermoBusca] = useState<string>('');

  // Carregamento de dados
  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await api.listarCarregamentosRelatorio();
      const extraidas = extrairCarretas(lista);
      setCarretasBrutas(extraidas);
    } catch (err: any) {
      toast.error(`Falha ao carregar dados do relatório: ${err?.message || 'Erro de rede'}`);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  // Carrega e assina URLs de evidências ao abrir o modal de detalhes da carreta
  useEffect(() => {
    if (carretaDetalhes) {
      setTipoNovaObs(carretaDetalhes.passou24h ? 'justificativa_atraso' : 'observacao');
      setTextoNovaObs('');
      setArquivosEvidencia([]);

      if (carretaDetalhes.historico_observacoes && carretaDetalhes.historico_observacoes.length > 0) {
        setCarregandoUrls(true);
        api.carregarUrlsEvidencias(carretaDetalhes.historico_observacoes)
          .then(comUrls => {
            setCarretaDetalhes(prev => (prev && prev.id === carretaDetalhes.id ? { ...prev, historico_observacoes: comUrls } : prev));
          })
          .catch(err => console.error('Erro ao carregar URLs de evidências:', err))
          .finally(() => setCarregandoUrls(false));
      }
    }
  }, [carretaDetalhes?.id]);

  // Handler de anexo de arquivos de evidência
  const handleArquivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const novos = Array.from(e.target.files);
      setArquivosEvidencia(prev => [...prev, ...novos]);
      e.target.value = '';
    }
  };

  const handleRemoverArquivo = (index: number) => {
    setArquivosEvidencia(prev => prev.filter((_, i) => i !== index));
  };

  // Salvar nova observação/justificativa e evidências
  const handleSalvarObservacao = async () => {
    if (!carretaDetalhes || !textoNovaObs.trim()) return;

    setSalvandoObs(true);
    try {
      const historicoAtualizado = await api.adicionarObservacaoTramo({
        carregamentoId: carretaDetalhes.carregamento_id,
        tramoId: carretaDetalhes.id,
        texto: textoNovaObs.trim(),
        tipo: tipoNovaObs,
        usuarioId: user.id,
        usuarioNome: user.name || user.email || 'Usuário',
        arquivos: arquivosEvidencia,
        historicoExistente: carretaDetalhes.historico_observacoes,
      });

      const totalEvi = historicoAtualizado.reduce((acc, o) => acc + (o.evidencias?.length || 0), 0);
      const ultimaObs = textoNovaObs.trim();

      // Atualiza carreta selecionada
      setCarretaDetalhes(prev => {
        if (!prev) return null;
        return {
          ...prev,
          historico_observacoes: historicoAtualizado,
          totalObservacoes: historicoAtualizado.length,
          totalEvidencias: totalEvi,
          observacoes: ultimaObs,
        };
      });

      // Atualiza tabela principal
      setCarretasBrutas(prev => prev.map(c => {
        if (c.id === carretaDetalhes.id) {
          return {
            ...c,
            historico_observacoes: historicoAtualizado,
            totalObservacoes: historicoAtualizado.length,
            totalEvidencias: totalEvi,
            observacoes: ultimaObs,
          };
        }
        return c;
      }));

      setTextoNovaObs('');
      setArquivosEvidencia([]);
      toast.success('Observação e evidências salvas com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha ao salvar observação: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setSalvandoObs(false);
    }
  };

  // Lista de empresas e tramos disponíveis para os seletores
  const empresasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    carretasBrutas.forEach(c => {
      if (c.empresa) set.add(c.empresa);
    });
    return Array.from(set).sort();
  }, [carretasBrutas]);

  const tramosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    carretasBrutas.forEach(c => {
      if (c.tramo) set.add(c.tramo);
    });
    return Array.from(set).sort();
  }, [carretasBrutas]);

  // Aplicação do preset de data
  const handlePresetChange = (novoPreset: PresetPeriodo) => {
    setPreset(novoPreset);
    if (novoPreset !== 'custom') {
      const { de, ate } = calcularIntervaloPreset(novoPreset);
      setDataDe(de || '');
      setDataAte(ate || '');
    }
  };

  // Filtros consolidados
  const filtros = useMemo<FiltrosRelatorioExpedicao>(() => {
    const empresasSet = new Set<string>();
    if (filtroEmpresa !== 'TODAS') empresasSet.add(filtroEmpresa);

    const tramosSet = new Set<string>();
    if (filtroTramo !== 'TODOS') tramosSet.add(filtroTramo);

    return {
      preset,
      de: dataDe || null,
      ate: dataAte || null,
      empresas: empresasSet,
      tramos: tramosSet,
      filtroSla,
      busca: termoBusca,
    };
  }, [preset, dataDe, dataAte, filtroEmpresa, filtroTramo, filtroSla, termoBusca]);

  // Carretas filtradas
  const carretasFiltradas = useMemo(() => {
    return filtrarCarretas(carretasBrutas, filtros);
  }, [carretasBrutas, filtros]);

  // Indicadores (KPIs)
  const kpis = useMemo(() => {
    return calcularResumoKpis(carretasFiltradas);
  }, [carretasFiltradas]);

  // Agrupamento semanal
  const dadosSemanais = useMemo(() => {
    return agruparPorSemana(carretasFiltradas);
  }, [carretasFiltradas]);

  // Agrupamento por transportadora
  const dadosTransportadoras = useMemo(() => {
    return agruparPorTransportadora(carretasFiltradas);
  }, [carretasFiltradas]);

  // Dados para gráfico de carretas individuais (top 40 para não sobrecarregar)
  const dadosCarretasGrafico = useMemo(() => {
    const ordenadas = [...carretasFiltradas]
      .filter(c => c.horasTotal !== null && c.horasTotal > 0)
      .sort((a, b) => (b.horasTotal ?? 0) - (a.horasTotal ?? 0))
      .slice(0, 35);

    return ordenadas.map(c => ({
      ...c,
      identificacaoCurta: `${c.carreta_placa || 'S/PLACA'} (${c.tramo})`,
    }));
  }, [carretasFiltradas]);

  // Componentes de Tooltip customizados para Recharts
  const TooltipSemanal = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item: any = payload[0]?.payload;
    if (!item) return null;
    return (
      <ChartTooltip
        title={item.rotulo}
        subtitle={`${item.inicioSemana?.slice(8, 10)}/${item.inicioSemana?.slice(5, 7)} a ${item.fimSemana?.slice(8, 10)}/${item.fimSemana?.slice(5, 7)}/${item.ano}`}
        rows={[
          { color: '#2563eb', label: 'Lead Time Médio', value: `${item.horasTotalMedia} h (${formatarHorasHumanas(item.horasTotalMedia)})` },
          { color: '#94a3b8', label: 'Total de Carretas', value: String(item.totalCarretas) },
          { color: '#ef4444', label: 'Excedeu 24h', value: `${item.qtdPassou24h} (${item.taxaPassou24h}%)` },
        ]}
      />
    );
  };

  const TooltipGargalos = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item: any = payload[0]?.payload;
    if (!item) return null;
    return (
      <ChartTooltip
        title={item.rotulo}
        subtitle={`Tempo Médio Total: ${item.horasTotalMedia} h`}
        rows={[
          { color: '#8b5cf6', label: 'Espera Portaria ➔ Pátio', value: `${item.horasPortariaPatioMedia} h (${formatarHorasHumanas(item.horasPortariaPatioMedia)})` },
          { color: '#10b981', label: 'Operação Pátio ➔ Saída', value: `${item.horasPatioExpedicaoMedia} h (${formatarHorasHumanas(item.horasPatioExpedicaoMedia)})` },
        ]}
      />
    );
  };

  const TooltipCarreta = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const c: any = payload[0]?.payload;
    if (!c) return null;
    return (
      <ChartTooltip
        title={`Carreta: ${c.carreta_placa || 'S/N'} (${c.tramo}${c.numero_tramo ? ` - ${c.numero_tramo}` : ''})`}
        subtitle={`Transportadora: ${c.empresa} • Motorista: ${c.motorista}`}
        rows={[
          {
            color: c.passou24h ? '#ef4444' : '#10b981',
            label: 'Lead Time Total',
            value: `${c.duracaoTotalFormatada} (${c.horasTotal ?? 0} h)`,
          },
          {
            color: '#8b5cf6',
            label: 'Espera Portaria ➔ Pátio',
            value: c.tempoPortariaPatioFormatado,
          },
          {
            color: '#10b981',
            label: 'Tempo Pátio ➔ Expedição',
            value: c.tempoPatioExpedicaoFormatado,
          },
          {
            color: c.passou24h ? '#ef4444' : '#10b981',
            label: 'Status SLA',
            value: c.passou24h ? '⚠️ EXCEDEU 24H' : '✅ DENTRO DA META',
          },
        ]}
        footer={c.numero_nf ? `Nota Fiscal: ${c.numero_nf}` : undefined}
      />
    );
  };

  const TooltipTransportadoraTempo = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item: any = payload[0]?.payload;
    if (!item) return null;
    return (
      <ChartTooltip
        title={item.empresa}
        subtitle={`${item.totalCarretas} carretas analisadas`}
        rows={[
          { color: item.horasTotalMedia > 24 ? '#ef4444' : '#3b82f6', label: 'Lead Time Médio', value: `${item.horasTotalMedia} h (${formatarHorasHumanas(item.horasTotalMedia)})` },
          { color: '#8b5cf6', label: 'Espera Portaria', value: formatarHorasHumanas(item.horasPortariaPatioMedia) },
          { color: '#10b981', label: 'Tempo Pátio', value: formatarHorasHumanas(item.horasPatioExpedicaoMedia) },
        ]}
      />
    );
  };

  const TooltipTransportadoraTaxa = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item: any = payload[0]?.payload;
    if (!item) return null;
    return (
      <ChartTooltip
        title={item.empresa}
        subtitle={`${item.totalCarretas} carretas analisadas`}
        rows={[
          { color: '#ef4444', label: 'Violações de 24h', value: `${item.qtdPassou24h} carretas (${item.taxaPassou24h}%)` },
          { color: '#10b981', label: 'Na Meta (<= 24h)', value: `${item.totalCarretas - item.qtdPassou24h} carretas` },
        ]}
      />
    );
  };

  // Exportação Excel
  const handleExportarExcel = () => {
    if (carretasFiltradas.length === 0) {
      toast.error('Nenhuma carreta no filtro atual para exportação.');
      return;
    }
    try {
      exportarRelatorioExcel(carretasFiltradas);
      toast.success('Relatório Excel exportado com sucesso!');
    } catch (e: any) {
      toast.error(`Falha ao exportar Excel: ${e?.message}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800">
        <div>
          <button
            type="button"
            onClick={onVoltar}
            className="group mb-2.5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para Lista de Carregamentos</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20">
              <Timer className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Relatório de Lead Time das Carretas
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Análise de permanência operacional, SLA de 24 horas e tempos de ciclo na Logística e Expedição.
              </p>
            </div>
          </div>
        </div>

        {/* Ações superiores */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={carregarDados}
            disabled={carregando}
            title="Atualizar dados"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportarExcel}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </header>

      {/* Barra de Filtros Globais */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Filtros Operacionais
            </span>
          </div>

          {/* Presets de Período */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(['tudo', '30dias', '60dias', 'mes_atual', 'custom'] as PresetPeriodo[]).map(p => {
              const rotulos: Record<PresetPeriodo, string> = {
                tudo: 'Todo o Histórico',
                '30dias': 'Últimos 30 dias',
                '60dias': 'Últimos 60 dias',
                mes_atual: 'Mês Atual',
                '7dias': '7 dias',
                custom: 'Personalizado',
              };
              const ativo = preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetChange(p)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                    ativo
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {rotulos[p]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Linha com inputs de filtro */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Busca por texto */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={termoBusca}
              onChange={e => setTermoBusca(e.target.value)}
              placeholder="Placa, motorista, NF, tramo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {termoBusca && (
              <button
                type="button"
                onClick={() => setTermoBusca('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Transportadora */}
          <div>
            <select
              value={filtroEmpresa}
              onChange={e => setFiltroEmpresa(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200 cursor-pointer"
            >
              <option value="TODAS">Todas as Transportadoras ({empresasDisponiveis.length})</option>
              {empresasDisponiveis.map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>

          {/* Tipo de Tramo */}
          <div>
            <select
              value={filtroTramo}
              onChange={e => setFiltroTramo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200 cursor-pointer"
            >
              <option value="TODOS">Todos os Tramos</option>
              {tramosDisponiveis.map(tr => (
                <option key={tr} value={tr}>{tr}</option>
              ))}
            </select>
          </div>

          {/* Datas customizadas (quando preset for custom ou se quiser refinar) */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dataDe}
              onChange={e => {
                setDataDe(e.target.value);
                setPreset('custom');
              }}
              title="Data inicial"
              className="w-1/2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
            />
            <span className="text-xs font-bold text-slate-400">até</span>
            <input
              type="date"
              value={dataAte}
              onChange={e => {
                setDataAte(e.target.value);
                setPreset('custom');
              }}
              title="Data final"
              className="w-1/2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Filtro Rápido de SLA de 24h (Destaque Principal) */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Filtro de SLA:</span>

          <button
            type="button"
            onClick={() => setFiltroSla('todos')}
            className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              filtroSla === 'todos'
                ? 'bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Todas ({carretasBrutas.length})
          </button>

          <button
            type="button"
            onClick={() => setFiltroSla('apenas_24h')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              filtroSla === 'apenas_24h'
                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-600/30'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>⚠️ Excedeu 24h ({carretasBrutas.filter(c => c.passou24h).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroSla('na_meta')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              filtroSla === 'na_meta'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Na Meta &lt;= 24h</span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroSla('no_patio')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              filtroSla === 'no_patio'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>No Pátio ({carretasBrutas.filter(c => c.status === 'NO_PATIO').length})</span>
          </button>

          {(filtroSla !== 'todos' || filtroEmpresa !== 'TODAS' || filtroTramo !== 'TODOS' || termoBusca || preset !== 'tudo') && (
            <button
              type="button"
              onClick={() => {
                setPreset('tudo');
                setDataDe('');
                setDataAte('');
                setFiltroSla('todos');
                setFiltroEmpresa('TODAS');
                setFiltroTramo('TODOS');
                setTermoBusca('');
              }}
              className="ml-auto text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      {/* Grade de KPIs Principais */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Carretas Analisadas"
          value={kpis.totalCarretas}
          detail={`${kpis.totalConcluidas} expedidas`}
          icon={Truck}
          accent="var(--brand)"
        />

        <KpiCard
          label="Lead Time Médio Total"
          display={formatarHorasHumanas(kpis.mediaHorasTotal)}
          detail={`${kpis.mediaHorasTotal.toFixed(1)} h totais`}
          icon={Timer}
          accent="#3b82f6"
        />

        <KpiCard
          label="Carretas > 24 Horas"
          value={kpis.totalPassou24h}
          detail={`${kpis.taxaPassou24h}% das carretas`}
          icon={AlertTriangle}
          accent="#ef4444"
          emphasize={kpis.totalPassou24h > 0}
          onClick={() => setFiltroSla(filtroSla === 'apenas_24h' ? 'todos' : 'apenas_24h')}
        />

        <KpiCard
          label="Média Portaria ➔ Pátio"
          display={formatarHorasHumanas(kpis.mediaHorasPortariaPatio)}
          detail={`${kpis.mediaHorasPortariaPatio.toFixed(1)} h de fila`}
          icon={Clock}
          accent="#8b5cf6"
        />

        <KpiCard
          label="Média Pátio ➔ Expedição"
          display={formatarHorasHumanas(kpis.mediaHorasPatioExpedicao)}
          detail={`${kpis.mediaHorasPatioExpedicao.toFixed(1)} h de pátio`}
          icon={CheckCircle2}
          accent="#10b981"
        />

        <KpiCard
          label="Maior Lead Time"
          display={formatarHorasHumanas(kpis.maiorLeadTimeHoras)}
          detail="Pior caso registrado"
          icon={TrendingUp}
          accent="#f97316"
        />
      </section>

      {/* Navegador de Abas de Visão */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-4" aria-label="Abas de visualização">
          <button
            type="button"
            onClick={() => setAbaAtiva('semanas')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-bold transition-colors cursor-pointer ${
              abaAtiva === 'semanas'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            <span>Visão por Semanas</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {dadosSemanais.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('carretas')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-bold transition-colors cursor-pointer ${
              abaAtiva === 'carretas'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Visão por Carreta (Individual)</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {carretasFiltradas.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('transportadoras')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-bold transition-colors cursor-pointer ${
              abaAtiva === 'transportadoras'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Visão por Transportadora</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {dadosTransportadoras.length}
            </span>
          </button>
        </nav>
      </div>

      {/* CONTEÚDO DA ABA 1: VISÃO POR SEMANAS */}
      {abaAtiva === 'semanas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Gráfico 1: Evolução Semanal de Lead Time Médio e Carretas > 24h */}
            <ChartCard
              title="Evolução Semanal: Lead Time Médio & Violações de SLA"
              description="Lead time médio em horas (linha azul) comparado ao volume total e carretas que passaram de 24h (barras)."
              icon={CalendarDays}
              height={340}
              empty={dadosSemanais.length === 0}
              emptyMessage="Nenhuma semana encontrada para o período filtrado."
            >
              <div style={{ height: 320 }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dadosSemanais} margin={{ top: 20, right: 15, left: -10, bottom: 10 }}>
                    <CartesianGrid {...chartConfig.grid} />
                    <XAxis
                      dataKey="rotuloCurto"
                      interval={0}
                      height={30}
                      {...chartConfig.xAxis}
                    />
                  <YAxis
                    yAxisId="horas"
                    orientation="left"
                    unit="h"
                    {...chartConfig.yAxis}
                  />
                  <YAxis
                    yAxisId="qtd"
                    orientation="right"
                    allowDecimals={false}
                    {...chartConfig.yAxis}
                  />
                  <Tooltip content={<TooltipSemanal />} />
                  <Legend verticalAlign="top" height={36} />

                  {/* Linha de Referência de 24h */}
                  <ReferenceLine
                    yAxisId="horas"
                    y={24}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: 'Meta 24h',
                      fill: '#ef4444',
                      fontSize: 11,
                      fontWeight: 700,
                      position: 'insideTopLeft',
                    }}
                  />

                  {/* Barras de Volume */}
                  <Bar
                    yAxisId="qtd"
                    dataKey="totalCarretas"
                    name="Total de Carretas"
                    fill="#94a3b8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    yAxisId="qtd"
                    dataKey="qtdPassou24h"
                    name="Carretas > 24h"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />

                  {/* Linha de Lead Time Médio */}
                  <Line
                    yAxisId="horas"
                    type="monotone"
                    dataKey="horasTotalMedia"
                    name="Lead Time Médio"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#2563eb' }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Gráfico 2: Decomposição de Gargalos por Etapa (Portaria vs Pátio) */}
            <ChartCard
              title="Decomposição de Tempos por Etapa (Médias Semanais)"
              description="Divisão do lead time entre tempo de espera na portaria e tempo operacional no pátio até a expedição."
              icon={Clock}
              height={340}
              empty={dadosSemanais.length === 0}
            >
              <div style={{ height: 320 }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosSemanais} margin={{ top: 20, right: 15, left: -10, bottom: 10 }}>
                    <CartesianGrid {...chartConfig.grid} />
                    <XAxis
                      dataKey="rotuloCurto"
                      interval={0}
                      height={30}
                      {...chartConfig.xAxis}
                    />
                  <YAxis unit="h" {...chartConfig.yAxis} />
                  <Tooltip content={<TooltipGargalos />} />
                  <Legend verticalAlign="top" height={36} />

                  <Bar
                    dataKey="horasPortariaPatioMedia"
                    name="Espera Portaria ➔ Pátio"
                    stackId="etapas"
                    fill="#8b5cf6"
                    radius={[0, 0, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="horasPatioExpedicaoMedia"
                    name="Operação Pátio ➔ Saída"
                    stackId="etapas"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Tabela de Consolidação Semanal */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span>Resumo Consolidado por Semanas</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {dadosSemanais.length} semanas registradas
              </span>
            </div>

            <TableDoubleScroll trigger={dadosSemanais}>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider dark:bg-slate-950/50 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Semana</th>
                    <th className="px-4 py-3">Período (Seg a Dom)</th>
                    <th className="px-4 py-3 text-center">Total Carretas</th>
                    <th className="px-4 py-3 text-center">Expedidas</th>
                    <th className="px-4 py-3 text-center">No Pátio</th>
                    <th className="px-4 py-3 text-center">Excedeu 24h</th>
                    <th className="px-4 py-3 text-center">% Violação SLA</th>
                    <th className="px-4 py-3 text-right">Média Portaria</th>
                    <th className="px-4 py-3 text-right">Média Pátio</th>
                    <th className="px-4 py-3 text-right font-black">Lead Time Médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {dadosSemanais.map(sem => {
                    const critico = sem.taxaPassou24h > 30 || sem.horasTotalMedia > 24;
                    return (
                      <tr
                        key={sem.chave}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                          Semana {sem.semana}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {sem.inicioSemana.slice(8, 10)}/{sem.inicioSemana.slice(5, 7)} a {sem.fimSemana.slice(8, 10)}/{sem.fimSemana.slice(5, 7)}/{sem.ano}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-800 dark:text-slate-200">
                          {sem.totalCarretas}
                        </td>
                        <td className="px-4 py-3 text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                          {sem.concluidas}
                        </td>
                        <td className="px-4 py-3 text-center text-amber-600 dark:text-amber-400 font-semibold">
                          {sem.noPatio}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                              sem.qtdPassou24h > 0
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            }`}
                          >
                            {sem.qtdPassou24h}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold">
                          <span
                            className={
                              sem.taxaPassou24h > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            {sem.taxaPassou24h}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                          {formatarHorasHumanas(sem.horasPortariaPatioMedia)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                          {formatarHorasHumanas(sem.horasPatioExpedicaoMedia)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`font-black ${
                              critico
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {formatarHorasHumanas(sem.horasTotalMedia)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {dadosSemanais.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        Nenhum dado semanal no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableDoubleScroll>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: VISÃO POR CARRETA (INDIVIDUAL) */}
      {abaAtiva === 'carretas' && (
        <div className="space-y-6">
          {/* Gráfico de Barras Horizontais com Linha de Corte de 24h */}
          <ChartCard
            title="Lead Time Individual por Carreta (Horas Totais)"
            description="Gráfico com linha de corte em 24h: carretas em vermelho ultrapassaram o SLA máximo estipulado."
            icon={Truck}
            height={Math.max(400, dadosCarretasGrafico.length * 28)}
            empty={dadosCarretasGrafico.length === 0}
            emptyMessage="Nenhuma carreta com tempo calculado no filtro atual."
          >
            <div style={{ height: Math.max(400, dadosCarretasGrafico.length * 28) }} className="w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dadosCarretasGrafico}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                >
                  <CartesianGrid {...chartConfig.grid} horizontal={false} vertical={true} />
                  <XAxis type="number" unit="h" {...chartConfig.xAxis} />
                  <YAxis
                    type="category"
                    dataKey="identificacaoCurta"
                    width={150}
                    tick={{ fontSize: 11, fill: 'var(--ink-secondary)', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<TooltipCarreta />} />

                  {/* Linha de Corte de 24 horas */}
                  <ReferenceLine
                    x={24}
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    label={{
                      value: 'Limite 24h',
                      fill: '#ef4444',
                      fontSize: 12,
                      fontWeight: 800,
                      position: 'top',
                    }}
                  />

                  <Bar
                    dataKey="horasTotal"
                    name="Lead Time Total"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    onClick={(entry) => setCarretaDetalhes(entry as unknown as CarretaMetrica)}
                    className="cursor-pointer"
                  >
                    {dadosCarretasGrafico.map(entry => {
                      const cor = entry.passou24h
                        ? '#ef4444' // Vermelho crítico
                        : entry.classificacaoSla === 'alerta'
                        ? '#f59e0b' // Âmbar alerta
                        : '#10b981'; // Verde meta
                      return <Cell key={entry.id} fill={cor} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>
                <strong>Dica Operacional:</strong> Clique em qualquer barra ou linha da tabela para abrir a ficha completa da carreta com o histórico detalhado dos horários.
              </span>
            </span>
            <span className="shrink-0 font-bold">
              Exibindo {dadosCarretasGrafico.length} de {carretasFiltradas.length} carretas
            </span>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: VISÃO POR TRANSPORTADORA */}
      {abaAtiva === 'transportadoras' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Gráfico 1: Lead Time Médio por Empresa */}
            <ChartCard
              title="Lead Time Médio por Transportadora (Horas)"
              description="Tempo médio de permanência da frota de cada empresa na fábrica TEN."
              icon={Building2}
              height={320}
              empty={dadosTransportadoras.length === 0}
            >
              <div style={{ height: 300 }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosTransportadoras} margin={{ top: 15, right: 15, left: -10, bottom: 20 }}>
                    <CartesianGrid {...chartConfig.grid} />
                    <XAxis dataKey="empresa" {...chartConfig.xAxis} />
                    <YAxis unit="h" {...chartConfig.yAxis} />
                    <Tooltip content={<TooltipTransportadoraTempo />} />
                    <ReferenceLine
                      y={24}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: 'Meta 24h', fill: '#ef4444', fontSize: 11, position: 'insideTopLeft' }}
                    />
                    <Bar dataKey="horasTotalMedia" name="Lead Time Médio" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={44}>
                      {dadosTransportadoras.map(entry => (
                        <Cell
                          key={entry.empresa}
                          fill={entry.horasTotalMedia > 24 ? '#ef4444' : '#3b82f6'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Gráfico 2: Taxa de Violação do SLA (> 24h) por Empresa */}
            <ChartCard
              title="Taxa de Carretas com Violação de SLA (> 24h)"
              description="Percentual de carretas de cada transportadora que ultrapassaram o limite de 24 horas."
              icon={AlertTriangle}
              height={320}
              empty={dadosTransportadoras.length === 0}
            >
              <div style={{ height: 300 }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosTransportadoras} margin={{ top: 15, right: 15, left: -10, bottom: 20 }}>
                    <CartesianGrid {...chartConfig.grid} />
                    <XAxis dataKey="empresa" {...chartConfig.xAxis} />
                    <YAxis unit="%" domain={[0, 100]} {...chartConfig.yAxis} />
                    <Tooltip content={<TooltipTransportadoraTaxa />} />
                    <Bar dataKey="taxaPassou24h" name="% Violação" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={44}>
                      {dadosTransportadoras.map(entry => (
                        <Cell
                          key={entry.empresa}
                          fill={entry.taxaPassou24h > 30 ? '#ef4444' : entry.taxaPassou24h > 0 ? '#f59e0b' : '#10b981'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        </div>
      )}

      {/* TABELA ANALÍTICA CONSOLIDADA (SEMPRE VISÍVEL) */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              <span>Extrato Detalhado das Carretas</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {carretasFiltradas.length} {carretasFiltradas.length === 1 ? 'carreta listada' : 'carretas listadas'} no filtro atual
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportarExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Baixar Tabela</span>
            </button>
          </div>
        </div>

        <TableDoubleScroll trigger={carretasFiltradas}>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider dark:bg-slate-950/50 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">SLA / Status</th>
                <th className="px-4 py-3">Carreta / Cavalo</th>
                <th className="px-4 py-3">Transportadora</th>
                <th className="px-4 py-3">Tramo / NF</th>
                <th className="px-4 py-3">Motorista</th>
                <th className="px-4 py-3">Chegada</th>
                <th className="px-4 py-3">Pátio</th>
                <th className="px-4 py-3">Expedição</th>
                <th className="px-4 py-3 text-right">Espera Fila</th>
                <th className="px-4 py-3 text-right">Tempo Pátio</th>
                <th className="px-4 py-3 text-right font-black">Lead Time Total</th>
                <th className="px-4 py-3 text-center">Obs / Histórico</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {carretasFiltradas.map(c => {
                return (
                  <tr
                    key={c.id}
                    onClick={() => setCarretaDetalhes(c)}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    {/* SLA Badge */}
                    <td className="px-4 py-3">
                      {c.passou24h ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-extrabold text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>&gt; 24h (Crítico)</span>
                        </span>
                      ) : c.status === 'NO_PATIO' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>No Pátio</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          <span>&lt;= 24h (Meta)</span>
                        </span>
                      )}
                    </td>

                    {/* Placas */}
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                      <div>{c.carreta_placa || '—'}</div>
                      <div className="text-[10px] font-normal text-slate-400">Cav: {c.cavalo_placa || '—'}</div>
                    </td>

                    {/* Transportadora */}
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                      {c.empresa}
                    </td>

                    {/* Tramo / NF */}
                    <td className="px-4 py-3">
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {c.tramo} {c.numero_tramo ? `- ${c.numero_tramo}` : ''}
                      </span>
                      {c.numero_nf && (
                        <div className="text-[10px] text-slate-400 font-mono">NF: {c.numero_nf}</div>
                      )}
                    </td>

                    {/* Motorista */}
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">
                      <div className="truncate max-w-[140px] font-semibold">{c.motorista}</div>
                      {c.cnh && <div className="text-[10px] text-slate-400">CNH: {c.cnh}</div>}
                    </td>

                    {/* Chegada */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {c.data_chegada_portaria ? `${c.data_chegada_portaria.slice(8, 10)}/${c.data_chegada_portaria.slice(5, 7)}` : '—'}{' '}
                      <span className="font-bold text-slate-900 dark:text-slate-100">{c.hora_chegada_portaria || ''}</span>
                    </td>

                    {/* Entrada Pátio */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {c.data_entrada_patio ? `${c.data_entrada_patio.slice(8, 10)}/${c.data_entrada_patio.slice(5, 7)}` : '—'}{' '}
                      <span className="font-bold text-slate-900 dark:text-slate-100">{c.hora_entrada_patio || ''}</span>
                    </td>

                    {/* Saída / Expedição */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {c.data_expedicao ? `${c.data_expedicao.slice(8, 10)}/${c.data_expedicao.slice(5, 7)}` : '—'}{' '}
                      <span className="font-bold text-slate-900 dark:text-slate-100">{c.hora_expedicao || 'Aguardando'}</span>
                    </td>

                    {/* Espera Fila */}
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                      {c.tempoPortariaPatioFormatado}
                    </td>

                    {/* Tempo Pátio */}
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                      {c.tempoPatioExpedicaoFormatado}
                    </td>

                    {/* Lead Time Total */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-extrabold ${
                          c.passou24h
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {c.duracaoTotalFormatada}
                      </span>
                    </td>

                    {/* Histórico / Observações */}
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {c.totalObservacoes > 0 ? (
                        <button
                          type="button"
                          onClick={() => setCarretaDetalhes(c)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 hover:border-blue-300 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/80 cursor-pointer transition-all shadow-2xs"
                          title={c.observacoes || `${c.totalObservacoes} apontamentos registrados`}
                        >
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                          <span>{c.totalObservacoes}</span>
                          {c.totalEvidencias > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-200/70 px-1.5 py-0.2 text-[10px] font-extrabold text-blue-900 dark:bg-blue-900 dark:text-blue-100">
                              <Paperclip className="h-2.5 w-2.5" />
                              {c.totalEvidencias}
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCarretaDetalhes(c)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                          title="Adicionar justificativa ou observação"
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
                          <span>+ Obs</span>
                        </button>
                      )}
                    </td>

                    {/* Ação */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCarretaDetalhes(c);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {carretasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    <Truck className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="font-semibold">Nenhuma carreta encontrada para os filtros selecionados.</p>
                    <p className="text-xs text-slate-400 mt-1">Tente remover alguns filtros ou selecionar outro período.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableDoubleScroll>
      </section>

      {/* MODAL DE DETALHES DA CARRETA */}
      {carretaDetalhes && (
        <Modal onClose={() => setCarretaDetalhes(null)} maxWidth="max-w-4xl">
          <ModalHeader onClose={() => setCarretaDetalhes(null)}>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              <span>Detalhes da Carreta: {carretaDetalhes.carreta_placa}</span>
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              {/* Alerta de SLA */}
              {carretaDetalhes.passou24h ? (
                <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                  <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold">Violação de SLA: Tempo superior a 24 horas</h4>
                    <p className="text-xs mt-0.5 text-rose-700 dark:text-rose-300">
                      Esta carreta permaneceu um total de <strong>{carretaDetalhes.duracaoTotalFormatada}</strong> ({carretaDetalhes.horasTotal}h) na planta, ultrapassando o limite operacional de 24h.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold">Dentro da Meta Operacional</h4>
                    <p className="text-xs mt-0.5 text-emerald-700 dark:text-emerald-300">
                      O ciclo total foi concluído em <strong>{carretaDetalhes.duracaoTotalFormatada}</strong>, atendendo com folga o SLA máximo de 24 horas.
                    </p>
                  </div>
                </div>
              )}

              {/* Informações Gerais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Transportadora</span>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{carretaDetalhes.empresa}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Tramo</span>
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {carretaDetalhes.tramo} {carretaDetalhes.numero_tramo ? `(${carretaDetalhes.numero_tramo})` : ''}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Placas</span>
                  <p className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    {carretaDetalhes.carreta_placa} / {carretaDetalhes.cavalo_placa}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Nota Fiscal</span>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{carretaDetalhes.numero_nf || 'Não informada'}</p>
                </div>
              </div>

              {/* Trilha de Etapas & Horários */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Cronologia de Etapas
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-700">
                    <span className="text-[10px] font-bold uppercase text-slate-400">1. Chegada na Portaria</span>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                      {carretaDetalhes.hora_chegada_portaria || '—'}
                    </p>
                    <p className="text-[11px] text-slate-500">{carretaDetalhes.data_chegada_portaria || '—'}</p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-700">
                    <span className="text-[10px] font-bold uppercase text-slate-400">2. Entrada no Pátio</span>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                      {carretaDetalhes.hora_entrada_patio || '—'}
                    </p>
                    <p className="text-[11px] text-slate-500">{carretaDetalhes.data_entrada_patio || '—'}</p>
                    <p className="text-[10px] font-semibold text-purple-600 mt-1">
                      Fila: {carretaDetalhes.tempoPortariaPatioFormatado}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-700">
                    <span className="text-[10px] font-bold uppercase text-slate-400">3. Expedição (Saída)</span>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                      {carretaDetalhes.hora_expedicao || 'Em andamento'}
                    </p>
                    <p className="text-[11px] text-slate-500">{carretaDetalhes.data_expedicao || '—'}</p>
                    <p className="text-[10px] font-semibold text-emerald-600 mt-1">
                      Pátio: {carretaDetalhes.tempoPatioExpedicaoFormatado}
                    </p>
                  </div>
                </div>
              </div>

              {/* SEÇÃO DE HISTÓRICO DE OBSERVAÇÕES & EVIDÊNCIAS */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Histórico de Observações & Evidências
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Justificativas de SLA, ocorrências operacionais e comprovações com foto
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {carretaDetalhes.totalObservacoes} {carretaDetalhes.totalObservacoes === 1 ? 'apontamento' : 'apontamentos'}
                    </span>
                    {carretaDetalhes.totalEvidencias > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950/70 dark:text-blue-300">
                        <Paperclip className="h-3 w-3" />
                        {carretaDetalhes.totalEvidencias} {carretaDetalhes.totalEvidencias === 1 ? 'anexo' : 'anexos'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timeline de apontamentos */}
                {carretaDetalhes.historico_observacoes && carretaDetalhes.historico_observacoes.length > 0 ? (
                  <div className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
                    {carretaDetalhes.historico_observacoes.map((obs) => {
                      const ehJustificativa = obs.tipo === 'justificativa_atraso';
                      const ehOcorrencia = obs.tipo === 'ocorrencia';
                      const badgeClasse = ehJustificativa
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-900'
                        : ehOcorrencia
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-900';
                      const labelTipo = ehJustificativa
                        ? 'Justificativa Lead Time (> 24h)'
                        : ehOcorrencia
                        ? 'Ocorrência Operacional'
                        : 'Observação Geral';

                      return (
                        <div
                          key={obs.id}
                          className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-extrabold text-white">
                                {obs.usuario_nome?.slice(0, 2).toUpperCase() || 'U'}
                              </span>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {obs.usuario_nome}
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${badgeClasse}`}>
                                {ehJustificativa && <AlertTriangle className="h-2.5 w-2.5" />}
                                {ehOcorrencia && <AlertCircle className="h-2.5 w-2.5" />}
                                <span>{labelTipo}</span>
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {new Date(obs.criado_em).toLocaleDateString('pt-BR')} às {new Date(obs.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap pl-8">
                            {obs.texto}
                          </p>

                          {/* Galeria de Evidências */}
                          {obs.evidencias && obs.evidencias.length > 0 && (
                            <div className="pl-8 pt-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                                Evidências Anexadas ({obs.evidencias.length})
                              </span>
                              <div className="flex flex-wrap gap-2.5">
                                {obs.evidencias.map((evi) => {
                                  const ehImg = evi.tipo?.startsWith('image/') || evi.nome_arquivo.match(/\.(jpg|jpeg|png|webp|gif)$/i);
                                  return (
                                    <div
                                      key={evi.id}
                                      className="group relative flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xs dark:border-slate-700 dark:bg-slate-900"
                                    >
                                      {ehImg && evi.url ? (
                                        <div
                                          onClick={() => setPreviewFotoUrl({ url: evi.url!, nome: evi.nome_arquivo })}
                                          className="relative h-14 w-14 overflow-hidden rounded-md cursor-pointer bg-slate-100 dark:bg-slate-800"
                                        >
                                          <img
                                            src={evi.url}
                                            alt={evi.nome_arquivo}
                                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                          />
                                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                            <Eye className="h-4 w-4 text-white" />
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800">
                                          <FileText className="h-6 w-6" />
                                        </div>
                                      )}
                                      <div className="max-w-[120px] text-[11px] pr-2">
                                        <p className="truncate font-semibold text-slate-800 dark:text-slate-200" title={evi.nome_arquivo}>
                                          {evi.nome_arquivo}
                                        </p>
                                        {evi.url ? (
                                          <a
                                            href={evi.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-400"
                                          >
                                            <Download className="h-3 w-3" />
                                            <span>Abrir</span>
                                          </a>
                                        ) : (
                                          <span className="text-[10px] text-slate-400">Anexo</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mb-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center dark:border-slate-800 dark:bg-slate-950/30">
                    <MessageSquare className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600 mb-1" />
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Nenhuma observação ou justificativa registrada para esta carreta.
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Use o formulário abaixo para registrar justificativas operacionais ou anexar fotos de evidência.
                    </p>
                  </div>
                )}

                {/* Formulário para Novo Apontamento */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                      Novo Apontamento / Justificativa
                    </span>
                    <select
                      value={tipoNovaObs}
                      onChange={(e) => setTipoNovaObs(e.target.value as TipoObservacaoTramo)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="justificativa_atraso">Justificativa de Lead Time (&gt; 24h)</option>
                      <option value="ocorrencia">Ocorrência Operacional / Pátio</option>
                      <option value="observacao">Observação Geral</option>
                      <option value="outro">Outro Apontamento</option>
                    </select>
                  </div>

                  <div>
                    <textarea
                      rows={3}
                      value={textoNovaObs}
                      onChange={(e) => setTextoNovaObs(e.target.value)}
                      placeholder="Descreva a observação ou motivo do atraso (ex.: aguardando liberação de faturamento, pane mecânica no cavalo mecânico, congestionamento na balança externa...)"
                      className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  {/* Anexo de Evidências */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
                        <Camera className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Anexar Evidências (Fotos / Docs)</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,application/pdf"
                          onChange={handleArquivoChange}
                          className="sr-only"
                        />
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Fotos são comprimidas automaticamente antes do upload.
                      </span>
                    </div>

                    {/* Lista de arquivos selecionados */}
                    {arquivosEvidencia.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {arquivosEvidencia.map((arq, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          >
                            <Paperclip className="h-3 w-3 text-blue-500 shrink-0" />
                            <span className="truncate max-w-[150px]">{arq.name}</span>
                            <span className="text-[10px] text-slate-400">({(arq.size / 1024).toFixed(0)} KB)</span>
                            <button
                              type="button"
                              onClick={() => handleRemoverArquivo(idx)}
                              className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer ml-0.5"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={salvandoObs || !textoNovaObs.trim()}
                      onClick={handleSalvarObservacao}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                    >
                      {salvandoObs ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Comprimindo e Salvando...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Salvar no Histórico</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setCarretaDetalhes(null)}
              className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              Fechar
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* MODAL LIGHTBOX DE FOTO EM TELA CHEIA */}
      {previewFotoUrl && (
        <Modal onClose={() => setPreviewFotoUrl(null)} maxWidth="max-w-3xl">
          <ModalHeader onClose={() => setPreviewFotoUrl(null)}>
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-600" />
              <span className="truncate">{previewFotoUrl.nome || 'Visualização da Evidência'}</span>
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col items-center justify-center p-2">
              <img
                src={previewFotoUrl.url}
                alt={previewFotoUrl.nome}
                className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <a
              href={previewFotoUrl.url}
              target="_blank"
              rel="noopener noreferrer"
              download={previewFotoUrl.nome}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Baixar Imagem</span>
            </a>
            <button
              type="button"
              onClick={() => setPreviewFotoUrl(null)}
              className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              Fechar
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
