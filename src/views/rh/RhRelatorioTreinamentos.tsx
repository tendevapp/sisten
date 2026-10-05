/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hub Integrado 360º de Treinamentos do RH:
 * Painel executivo consolidando Execução de Turmas, Cronograma Orçamentário
 * e Matriz de Conformidade / Vencimentos de NRs por Setor e Colaborador.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  Clock,
  Clock3,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Loader2,
  PieChart as PieIcon,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Profile } from '../../types';
import { useToast } from '../../components/ui/Toast';
import * as apiPlano from '../../lib/rhPlanoTreinamentosApi';
import * as apiMatriz from '../../lib/rhMatrizTreinamentosApi';
import {
  filtrarPlanos,
  quantidadeParticipantes,
  resumirIndicadoresMatriz,
  resumirIndicadoresTreinamentos,
} from '../../lib/rhPlanoTreinamentosViewModel';
import PdfPreviewModal from '../../components/ui/PdfPreviewModal';
import type { PdfGerado } from '../../lib/pdfExport/core';
import {
  exportarRelatorioTreinamentosExcel,
  exportarRelatorioTreinamentosPdf,
  gerarRelatorioTreinamentosPdf,
} from '../../lib/rhPlanoTreinamentosExport';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type AbaAtiva = 'executiva' | 'orcamento' | 'conformidade' | 'analitica';

const CORES_STATUS = {
  realizado: '#059669', // Emerald
  programado: '#3b82f6', // Blue
  reagendado: '#f59e0b', // Amber
  atrasado: '#ea580c', // Orange
  cancelado: '#e11d48', // Rose
};

const CORES_PIZZA = ['#059669', '#3b82f6', '#f59e0b', '#ea580c', '#e11d48'];

const MESES_OPCOES = [
  { valor: 'todos', texto: 'Todos os meses' },
  { valor: '01', texto: 'Janeiro' },
  { valor: '02', texto: 'Fevereiro' },
  { valor: '03', texto: 'Março' },
  { valor: '04', texto: 'Abril' },
  { valor: '05', texto: 'Maio' },
  { valor: '06', texto: 'Junho' },
  { valor: '07', texto: 'Julho' },
  { valor: '08', texto: 'Agosto' },
  { valor: '09', texto: 'Setembro' },
  { valor: '10', texto: 'Outubro' },
  { valor: '11', texto: 'Novembro' },
  { valor: '12', texto: 'Dezembro' },
];

const formatarBRL = (valor: number): string =>
  Math.round(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0 });

const formatarData = (iso?: string | null): string => {
  if (!iso) return '—';
  const parte = iso.slice(0, 10);
  const [ano, mes, dia] = parte.split('-');
  return `${dia}/${mes}/${ano}`;
};

export default function RhRelatorioTreinamentos({ onNavigate }: Props) {
  const toast = useToast();

  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('executiva');
  const [carregando, setCarregando] = useState(true);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ gerar: () => Promise<PdfGerado>; titulo?: string } | null>(null);

  // Dados das APIs
  const [dadosPlano, setDadosPlano] = useState<Awaited<ReturnType<typeof apiPlano.carregarPlanoTreinamentos>> | null>(null);
  const [dadosCronograma, setDadosCronograma] = useState<Awaited<ReturnType<typeof apiPlano.carregarCronogramaTreinamentos>> | null>(null);
  const [dadosMatriz, setDadosMatriz] = useState<Awaited<ReturnType<typeof apiMatriz.carregarMatrizTreinamentos>> | null>(null);

  // Filtros Globais
  const [ano, setAno] = useState<string>('todos');
  const [mes, setMes] = useState<string>('todos');
  const [tipo, setTipo] = useState<'todos' | apiPlano.PlanoRh['tipo_informacao']>('todos');
  const [area, setArea] = useState<string>('todos');
  const [buscaTabela, setBuscaTabela] = useState<string>('');

  // Carregamento inicial em paralelo
  useEffect(() => {
    let montado = true;
    async function carregarTodosDados() {
      try {
        setCarregando(true);
        const [plano, crono, matriz] = await Promise.all([
          apiPlano.carregarPlanoTreinamentos(),
          apiPlano.carregarCronogramaTreinamentos(),
          apiMatriz.carregarMatrizTreinamentos(),
        ]);

        if (montado) {
          setDadosPlano(plano);
          setDadosCronograma(crono);
          setDadosMatriz(matriz);

          // Ajusta ano padrão para o mais recente se disponível
          const anosDisponiveis = [
            ...new Set([
              ...(plano.planos || []).map((p) => p.data_inicio.slice(0, 4)),
              ...(crono.itens || []).flatMap((c) => c.meses.map((m) => m.competencia.slice(0, 4))),
            ]),
          ].filter(Boolean);

          if (anosDisponiveis.includes('2026')) {
            setAno('2026');
          } else if (anosDisponiveis.length > 0) {
            setAno(anosDisponiveis.sort().reverse()[0]);
          }
        }
      } catch (erro) {
        if (montado) {
          toast.error(erro instanceof Error ? erro.message : 'Falha ao carregar indicadores de treinamentos.');
        }
      } finally {
        if (montado) setCarregando(false);
      }
    }

    void carregarTodosDados();
    return () => {
      montado = false;
    };
  }, []);

  // Lista de anos para o filtro
  const anosDisponiveis = useMemo(() => {
    const todosAnos = [
      ...new Set([
        ...(dadosPlano?.planos || []).map((p) => p.data_inicio.slice(0, 4)),
        ...(dadosCronograma?.itens || []).flatMap((c) => c.meses.map((m) => m.competencia.slice(0, 4))),
      ]),
    ].filter(Boolean);
    return todosAnos.sort().reverse();
  }, [dadosPlano, dadosCronograma]);

  // Lista de áreas para o filtro
  const areasDisponiveis = useMemo(() => {
    const listaAreas = new Set<string>();
    dadosMatriz?.pessoas.forEach((p) => {
      if (p.area) listaAreas.add(p.area.trim());
    });
    dadosPlano?.planos.forEach((p) => {
      if (p.local) listaAreas.add(p.local.trim());
      if (p.categoria) listaAreas.add(p.categoria.trim());
    });
    return Array.from(listaAreas).filter(Boolean).sort();
  }, [dadosMatriz, dadosPlano]);

  // Cronogramas filtrados pelo tipo selecionado
  const cronogramasFiltrados = useMemo(() => {
    if (!dadosCronograma || tipo === 'todos') return dadosCronograma?.itens || [];
    const tiposPorTreinamento = new Map(dadosCronograma.catalogo.map((item) => [item.id, item.tipo_informacao]));
    return dadosCronograma.itens.filter((item) => tiposPorTreinamento.get(item.treinamento_id || '') === tipo);
  }, [dadosCronograma, tipo]);

  // Resumo de Indicadores do Plano e Cronograma
  const resumoPlano = useMemo(() => {
    return resumirIndicadoresTreinamentos(dadosPlano?.planos || [], cronogramasFiltrados, {
      ano,
      tipo,
      mes,
      area,
    });
  }, [dadosPlano, cronogramasFiltrados, ano, tipo, mes, area]);

  // Resumo da Matriz de Conformidade
  const resumoMatriz = useMemo(() => {
    if (!dadosMatriz) return null;
    return resumirIndicadoresMatriz({
      pessoas: dadosMatriz.pessoas,
      catalogo: dadosMatriz.catalogo,
      requisitos: dadosMatriz.requisitos,
      registros: dadosMatriz.registros,
      alertas: dadosMatriz.alertas,
      area,
    });
  }, [dadosMatriz, area]);

  // Planos filtrados para a tabela analítica
  const planosFiltradosTabela = useMemo(() => {
    return filtrarPlanos(dadosPlano?.planos || [], {
      busca: buscaTabela,
      ano,
      mes,
      tipo,
      area,
      status: 'todos',
      responsavel: 'todos',
    });
  }, [dadosPlano, buscaTabela, ano, mes, tipo, area]);

  const limparFiltros = () => {
    setAno('todos');
    setMes('todos');
    setTipo('todos');
    setArea('todos');
    setBuscaTabela('');
  };

  const temFiltroAtivo = ano !== 'todos' || mes !== 'todos' || tipo !== 'todos' || area !== 'todos' || buscaTabela !== '';

  // Handler de Exportação PDF Executivo
  const handleExportarPdf = () => {
    setPdfPreview({
      gerar: () => gerarRelatorioTreinamentosPdf({
        resumoPlano,
        resumoMatriz: resumoMatriz || undefined,
        filtros: { ano, tipo, mes, area },
      }),
      titulo: `Relatório Executivo de Treinamentos - ${ano === 'todos' ? 'Geral' : ano}`,
    });
  };

  // Handler de Exportação Excel
  const handleExportarExcel = async () => {
    try {
      setExportandoExcel(true);
      await exportarRelatorioTreinamentosExcel({
        planos: planosFiltradosTabela,
        resumoPlano,
        resumoMatriz: resumoMatriz || undefined,
        ano: ano === 'todos' ? 'TODOS' : ano,
      });
      toast.success('Planilha consolidada exportada com sucesso.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível exportar a planilha.');
    } finally {
      setExportandoExcel(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Topo / Cabeçalho e Navegação */}
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/rh')}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao Hub de RH
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 dark:bg-emerald-500">
              <BarChart3 className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Indicadores de Treinamentos (T&D)
              </h1>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400 sm:text-sm">
                Hub executivo integrado: Execução do Plano, Gestão Orçamentária e Conformidade da Matriz de NRs.
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação Global (Exportar PDF e Excel) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportarPdf}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileText className="h-4 w-4 text-rose-600" />
            <span>Visualizar / Exportar PDF</span>
          </button>

          <button
            type="button"
            onClick={() => void handleExportarExcel()}
            disabled={carregando || exportandoExcel}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {exportandoExcel ? <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
            <span>{exportandoExcel ? 'Exportando...' : 'Exportar Excel'}</span>
          </button>
        </div>
      </header>

      {/* Barra de Filtros Globais */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Filter className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Filtros do Relatório</span>
          </div>
          {temFiltroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400"
            >
              <RotateCcw className="h-3 w-3" />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Ano</label>
            <select
              value={ano}
              onChange={(e) => setAno(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="todos">Todos os anos</option>
              {anosDisponiveis.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Mês</label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              {MESES_OPCOES.map((op) => (
                <option key={op.valor} value={op.valor}>
                  {op.texto}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Tipo de Treinamento</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="todos">Interno e Externo</option>
              <option value="interno">Interno</option>
              <option value="externo">Externo</option>
              <option value="nao_informado">Não informado</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Área / Setor</label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="todos">Todas as áreas</option>
              {areasDisponiveis.map((ar) => (
                <option key={ar} value={ar}>
                  {ar}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Navegação por Abas */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex space-x-2 sm:space-x-4 overflow-x-auto">
          <BotaoAba
            ativa={abaAtiva === 'executiva'}
            onClick={() => setAbaAtiva('executiva')}
            icone={<Target className="h-4 w-4" />}
            label="Visão Executiva"
            badge={`${resumoPlano.taxaRealizacao}%`}
          />
          <BotaoAba
            ativa={abaAtiva === 'orcamento'}
            onClick={() => setAbaAtiva('orcamento')}
            icone={<DollarSign className="h-4 w-4" />}
            label="Orçamento & Custos"
            badge={formatarBRL(resumoPlano.custoRealizado)}
          />
          <BotaoAba
            ativa={abaAtiva === 'conformidade'}
            onClick={() => setAbaAtiva('conformidade')}
            icone={<ShieldCheck className="h-4 w-4" />}
            label="Matriz & Conformidade"
            badge={resumoMatriz ? `${resumoMatriz.taxaConformidadeGeral}%` : undefined}
          />
          <BotaoAba
            ativa={abaAtiva === 'analitica'}
            onClick={() => setAbaAtiva('analitica')}
            icone={<Layers className="h-4 w-4" />}
            label="Tabela Analítica"
            badge={String(planosFiltradosTabela.length)}
          />
        </nav>
      </div>

      {carregando ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400" />
          <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
            Consolidando indicadores de treinamentos, cronograma e conformidade...
          </p>
        </div>
      ) : (
        <>
          {/* ======================================================== */}
          {/* ABA 1: VISÃO EXECUTIVA GERAL */}
          {/* ======================================================== */}
          {abaAtiva === 'executiva' && (
            <div className="space-y-6">
              {/* Cards de KPIs Principais */}
              <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <CardKpi
                  icone={<CalendarCheck />}
                  titulo="Cumprimento do Plano"
                  valor={`${resumoPlano.realizados} / ${resumoPlano.programados}`}
                  apoio={`${resumoPlano.taxaRealizacao}% das turmas realizadas`}
                  destaque={`${resumoPlano.taxaRealizacao}%`}
                  cor="text-emerald-600 dark:text-emerald-400"
                  corFundo="bg-emerald-50 dark:bg-emerald-950/40"
                />
                <CardKpi
                  icone={<ShieldCheck />}
                  titulo="Conformidade da Equipe"
                  valor={resumoMatriz ? `${resumoMatriz.taxaConformidadeGeral}%` : '—'}
                  apoio={resumoMatriz ? `${resumoMatriz.totalAptos} de ${resumoMatriz.totalMonitorados} colaboradores aptos` : 'Matriz não disponível'}
                  destaque={resumoMatriz ? `${resumoMatriz.totalVencidos} vencidos` : undefined}
                  cor="text-blue-600 dark:text-blue-400"
                  corFundo="bg-blue-50 dark:bg-blue-950/40"
                />
                <CardKpi
                  icone={<Clock3 />}
                  titulo="Horas Capacitadas (HHT)"
                  valor={Math.round(resumoPlano.hht).toLocaleString('pt-BR')}
                  apoio={`${Math.round(resumoPlano.horasTotais)}h ministradas (${resumoPlano.participacoes} presenças)`}
                  destaque="Homem-Hora"
                  cor="text-amber-600 dark:text-amber-400"
                  corFundo="bg-amber-50 dark:bg-amber-950/40"
                />
                <CardKpi
                  icone={<TrendingUp />}
                  titulo="Custo Realizado"
                  valor={formatarBRL(resumoPlano.custoRealizado)}
                  apoio={
                    resumoPlano.custoPrevisto
                      ? `${Math.round((resumoPlano.custoRealizado / resumoPlano.custoPrevisto) * 100)}% do orçamento previsto`
                      : 'Sem cronograma no período'
                  }
                  destaque={formatarBRL(resumoPlano.custoPrevisto)}
                  cor="text-violet-600 dark:text-violet-400"
                  corFundo="bg-violet-50 dark:bg-violet-950/40"
                />
              </section>

              {/* Gráficos da Visão Executiva */}
              <section className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
                {/* Gráfico 1: Execução Mensal */}
                <PainelCard
                  titulo="Execução Mensal de Turmas"
                  subtitulo="Comparativo de eventos programados versus realizados ao longo das competências"
                >
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={resumoPlano.porMes}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          }}
                        />
                        <Legend />
                        <Bar dataKey="programados" name="Programados" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="realizados" name="Realizados" fill="#059669" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </PainelCard>

                {/* Gráfico 2: Status do Plano */}
                <PainelCard titulo="Situação do Plano de Treinamentos" subtitulo="Distribuição por status dos eventos no período">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={resumoPlano.porStatus.filter((item) => item.quantidade > 0)}
                          dataKey="quantidade"
                          nameKey="status"
                          innerRadius={56}
                          outerRadius={88}
                          paddingAngle={3}
                        >
                          {resumoPlano.porStatus
                            .filter((item) => item.quantidade > 0)
                            .map((item, indice) => (
                              <Cell
                                key={item.status}
                                fill={CORES_STATUS[item.status as keyof typeof CORES_STATUS] || CORES_PIZZA[indice % CORES_PIZZA.length]}
                              />
                            ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                          }}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </PainelCard>
              </section>

              {/* Alertas Operacionais e Resumo de Eficiência */}
              <section className="grid gap-6 lg:grid-cols-2">
                {/* Atenção Operacional no Plano */}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <CircleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <h2 className="font-bold text-slate-900 dark:text-slate-100">Atenção Operacional no Plano</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('/rh/plano-treinamentos')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      <span>Abrir Plano</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {resumoPlano.planos.filter((p) => p.status === 'atrasado' || p.status === 'reagendado').length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
                        Nenhum evento com atraso ou reagendamento no período selecionado.
                      </div>
                    ) : (
                      resumoPlano.planos
                        .filter((p) => p.status === 'atrasado' || p.status === 'reagendado')
                        .slice(0, 5)
                        .map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                            <div>
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.titulo}</p>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {item.codigo} · {formatarData(item.data_inicio)} · {item.responsavel || 'Sem responsável'}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                item.status === 'atrasado'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </section>

                {/* Radar de Vencimentos da Matriz */}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                      <h2 className="font-bold text-slate-900 dark:text-slate-100">Vencimentos Críticos da Matriz RH</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('/rh/matriz-treinamentos')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      <span>Abrir Matriz</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {!resumoMatriz || resumoMatriz.topTreinamentosCriticos.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
                        Nenhum colaborador com treinamento obrigatório vencido no momento.
                      </div>
                    ) : (
                      resumoMatriz.topTreinamentosCriticos.slice(0, 5).map((treino) => (
                        <div key={treino.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{treino.nome}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {treino.totalProximos > 0 ? `${treino.totalProximos} vencem em até 30 dias` : 'Treinamento obrigatório'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {treino.totalVencidos > 0 && (
                              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-400">
                                {treino.totalVencidos} vencido(s)
                              </span>
                            )}
                            {treino.totalPendentes > 0 && (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                                {treino.totalPendentes} pendente(s)
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </section>
            </div>
          )}

          {/* ======================================================== */}
          {/* ABA 2: ORÇAMENTO & CUSTOS */}
          {/* ======================================================== */}
          {abaAtiva === 'orcamento' && (
            <div className="space-y-6">
              {/* KPIs Financeiros */}
              <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <CardKpi
                  icone={<DollarSign />}
                  titulo="Orçamento Previsto"
                  valor={formatarBRL(resumoPlano.custoPrevisto)}
                  apoio="Cotação x turmas no cronograma"
                  cor="text-slate-700 dark:text-slate-200"
                  corFundo="bg-slate-100 dark:bg-slate-800"
                />
                <CardKpi
                  icone={<TrendingUp />}
                  titulo="Custo Realizado"
                  valor={formatarBRL(resumoPlano.custoRealizado)}
                  apoio="Desembolso nas turmas realizadas"
                  cor="text-emerald-600 dark:text-emerald-400"
                  corFundo="bg-emerald-50 dark:bg-emerald-950/40"
                />
                <CardKpi
                  icone={resumoPlano.desvioOrcamentario >= 0 ? <TrendingUp /> : <TrendingDown />}
                  titulo="Desvio Orçamentário"
                  valor={formatarBRL(Math.abs(resumoPlano.desvioOrcamentario))}
                  apoio={resumoPlano.desvioOrcamentario > 0 ? 'Acima do orçado' : 'Abaixo do orçado (economia)'}
                  cor={resumoPlano.desvioOrcamentario > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}
                  corFundo={resumoPlano.desvioOrcamentario > 0 ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-emerald-50 dark:bg-emerald-950/40'}
                />
                <CardKpi
                  icone={<Users />}
                  titulo="Custo Médio por Aluno"
                  valor={formatarBRL(resumoPlano.custoMedioParticipante)}
                  apoio={`Baseado em ${resumoPlano.participacoes} participações`}
                  cor="text-blue-600 dark:text-blue-400"
                  corFundo="bg-blue-50 dark:bg-blue-950/40"
                />
              </section>

              {/* Gráfico de Evolução Financeira */}
              <PainelCard
                titulo="Evolução Mensal do Orçamento e Desembolso"
                subtitulo="Comparativo da verba prevista no cronograma versus o custo real registrado no plano"
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={resumoPlano.porMes}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        stroke="#64748b"
                        tickFormatter={(v) => `R$ ${Math.round(v / 1000)}k`}
                      />
                      <Tooltip
                        formatter={(valor) => [formatarBRL(Number(valor)), '']}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="custoPrevisto"
                        name="Custo Previsto (Cronograma)"
                        stroke="#8b5cf6"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="custoRealizado"
                        name="Custo Realizado (Plano)"
                        stroke="#059669"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </PainelCard>

              {/* Tabela de Custos por Treinamento */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <h2 className="font-bold text-slate-900 dark:text-slate-100">Detalhamento de Custos por Treinamento</h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Cotação, turmas executadas, volume de participantes e saldo por curso.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                      <tr>
                        <th className="px-5 py-3">Treinamento</th>
                        <th className="px-4 py-3 text-center">Tipo</th>
                        <th className="px-4 py-3 text-right">Cotação Unitária</th>
                        <th className="px-4 py-3 text-center">Turmas (Real/Prog)</th>
                        <th className="px-4 py-3 text-center">Alunos</th>
                        <th className="px-4 py-3 text-right">Previsto</th>
                        <th className="px-4 py-3 text-right">Realizado</th>
                        <th className="px-5 py-3 text-right">Desvio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {resumoPlano.custosPorTreinamento.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-sm text-slate-500">
                            Nenhum custo registrado no período filtrado.
                          </td>
                        </tr>
                      ) : (
                        resumoPlano.custosPorTreinamento.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{item.titulo}</td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {item.tipo}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-slate-600 dark:text-slate-400">
                              {formatarBRL(item.cotacaoUnitario)}
                            </td>
                            <td className="px-4 py-3.5 text-center font-medium text-slate-700 dark:text-slate-300">
                              {item.turmasRealizadas} / {item.turmasProgramadas}
                            </td>
                            <td className="px-4 py-3.5 text-center text-slate-600 dark:text-slate-400">{item.participantesTotal}</td>
                            <td className="px-4 py-3.5 text-right font-mono text-slate-600 dark:text-slate-400">
                              {formatarBRL(item.custoPrevisto)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                              {formatarBRL(item.custoRealizado)}
                            </td>
                            <td
                              className={`px-5 py-3.5 text-right font-mono font-bold ${
                                item.desvio > 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : item.desvio < 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {item.desvio > 0 ? `+${formatarBRL(item.desvio)}` : formatarBRL(item.desvio)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* ======================================================== */}
          {/* ABA 3: CONFORMIDADE & VENCIMENTOS (MATRIZ RH) */}
          {/* ======================================================== */}
          {abaAtiva === 'conformidade' && (
            <div className="space-y-6">
              {/* KPIs de Conformidade */}
              <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <CardKpi
                  icone={<Users />}
                  titulo="Colaboradores Monitorados"
                  valor={resumoMatriz?.totalMonitorados || 0}
                  apoio="Base ativa na fábrica e obra"
                  cor="text-slate-700 dark:text-slate-200"
                  corFundo="bg-slate-100 dark:bg-slate-800"
                />
                <CardKpi
                  icone={<CheckCircle2 />}
                  titulo="Colaboradores Aptos"
                  valor={resumoMatriz?.totalAptos || 0}
                  apoio={resumoMatriz ? `${resumoMatriz.taxaConformidadeGeral}% de conformidade legal` : '—'}
                  cor="text-emerald-600 dark:text-emerald-400"
                  corFundo="bg-emerald-50 dark:bg-emerald-950/40"
                />
                <CardKpi
                  icone={<AlertTriangle />}
                  titulo="Com Treinamento Vencido"
                  valor={resumoMatriz?.totalVencidos || 0}
                  apoio="Necessitam reciclagem imediata"
                  cor="text-rose-600 dark:text-rose-400"
                  corFundo="bg-rose-50 dark:bg-rose-950/40"
                />
                <CardKpi
                  icone={<Clock />}
                  titulo="A Vencer em até 30 Dias"
                  valor={resumoMatriz?.proximosVencimentoCount || 0}
                  apoio="Recomendado agendar turmas"
                  cor="text-amber-600 dark:text-amber-400"
                  corFundo="bg-amber-50 dark:bg-amber-950/40"
                />
              </section>

              {/* Gráfico de Conformidade por Área */}
              {resumoMatriz && resumoMatriz.porArea.length > 0 && (
                <PainelCard
                  titulo="Índice de Conformidade por Área / Setor"
                  subtitulo="Percentual de colaboradores 100% aptos em relação aos requisitos obrigatórios do cargo"
                >
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={resumoMatriz.porArea} layout="vertical" margin={{ left: 40, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#64748b" />
                        <YAxis dataKey="area" type="category" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                        <Tooltip
                          formatter={(v) => [`${v}%`, 'Conformidade']}
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                          }}
                        />
                        <Bar dataKey="taxaConformidade" name="Conformidade (%)" fill="#059669" radius={[0, 6, 6, 0]}>
                          {resumoMatriz.porArea.map((item) => (
                            <Cell
                              key={item.area}
                              fill={item.taxaConformidade >= 90 ? '#059669' : item.taxaConformidade >= 70 ? '#f59e0b' : '#e11d48'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </PainelCard>
              )}

              {/* Tabela de Alertas de Vencimento Nominais */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-slate-100">Colaboradores com Vencimento ou Alerta</h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Relação nominal de colaboradores com pendências para planejamento de turmas.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Total: {resumoMatriz?.alertas.length || 0} alerta(s)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                      <tr>
                        <th className="px-5 py-3">Colaborador</th>
                        <th className="px-4 py-3">Registro</th>
                        <th className="px-4 py-3">Treinamento Obrigatório</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-center">Data Limite</th>
                        <th className="px-5 py-3 text-right">Prazo Restante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {!resumoMatriz || resumoMatriz.alertas.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-sm text-slate-500">
                            Nenhum alerta de vencimento registrado.
                          </td>
                        </tr>
                      ) : (
                        resumoMatriz.alertas.slice(0, 15).map((alerta, idx) => (
                          <tr key={`${alerta.pessoa_id}-${alerta.treinamento_id}-${idx}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{alerta.colaborador}</td>
                            <td className="px-4 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">{alerta.registro}</td>
                            <td className="px-4 py-3.5 text-slate-800 dark:text-slate-200">{alerta.treinamento}</td>
                            <td className="px-4 py-3.5 text-center">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  alerta.status_calculado === 'vencido'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                                }`}
                              >
                                {alerta.status_calculado === 'vencido' ? 'Vencido' : 'A Vencer'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                              {formatarData(alerta.validade_em)}
                            </td>
                            <td className="px-5 py-3.5 text-right font-medium text-slate-700 dark:text-slate-300">
                              {alerta.dias_para_vencimento !== null
                                ? alerta.dias_para_vencimento < 0
                                  ? `${Math.abs(alerta.dias_para_vencimento)}d atrás`
                                  : `em ${alerta.dias_para_vencimento}d`
                                : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* ======================================================== */}
          {/* ABA 4: TABELA ANALÍTICA */}
          {/* ======================================================== */}
          {abaAtiva === 'analitica' && (
            <div className="space-y-4">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={buscaTabela}
                      onChange={(e) => setBuscaTabela(e.target.value)}
                      placeholder="Buscar por código, curso, responsável ou local..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {planosFiltradosTabela.length} evento(s) listado(s)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                      <tr>
                        <th className="px-5 py-3">Código</th>
                        <th className="px-4 py-3">Treinamento</th>
                        <th className="px-4 py-3">Data Início</th>
                        <th className="px-4 py-3 text-center">Horas</th>
                        <th className="px-4 py-3 text-center">Participantes</th>
                        <th className="px-4 py-3 text-right">Custo Total</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-5 py-3">Responsável</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {planosFiltradosTabela.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-sm text-slate-500">
                            Nenhum evento encontrado para os critérios de busca.
                          </td>
                        </tr>
                      ) : (
                        planosFiltradosTabela.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                              {item.codigo}
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                              {item.titulo}
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                              {formatarData(item.data_inicio)}
                            </td>
                            <td className="px-4 py-3.5 text-center text-slate-600 dark:text-slate-400">
                              {item.carga_horaria ? `${Math.round(Number(item.carga_horaria))}h` : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-center font-medium text-slate-800 dark:text-slate-200">
                              {quantidadeParticipantes(item)} / {item.participantes_planejados || '—'}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-900 dark:text-slate-100">
                              {formatarBRL(Number(item.custo_total || 0))}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  item.status === 'realizado'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                                    : item.status === 'programado'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400'
                                    : item.status === 'atrasado'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                              {item.responsavel || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      )}
      {pdfPreview && (
        <PdfPreviewModal
          gerar={pdfPreview.gerar}
          tituloPadrao={pdfPreview.titulo}
          onClose={() => setPdfPreview(null)}
        />
      )}
    </div>
  );
}

function BotaoAba({
  ativa,
  onClick,
  icone,
  label,
  badge,
}: {
  ativa: boolean;
  onClick: () => void;
  icone: ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-all ${
        ativa
          ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'
      }`}
    >
      <span>{icone}</span>
      <span>{label}</span>
      {badge && (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            ativa
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function CardKpi({
  icone,
  titulo,
  valor,
  apoio,
  destaque,
  cor,
  corFundo,
}: {
  icone: ReactNode;
  titulo: string;
  valor: string | number;
  apoio: string;
  destaque?: string;
  cor: string;
  corFundo: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4.5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${corFundo} ${cor}`}>{icone}</span>
        {destaque && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {destaque}
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${cor}`}>{valor}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{apoio}</p>
    </div>
  );
}

function PainelCard({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitulo}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
