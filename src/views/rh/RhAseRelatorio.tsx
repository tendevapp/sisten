/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório gerencial do ASE - Hora Extra (FRM.RHU-0007).
 *
 * A lista de ASEs responde "o que foi autorizado hoje"; esta tela responde
 * "quanto de hora extra o site consumiu no período, onde e com quem". Os
 * recortes (período, setor, turno, status, solicitante, benefício) valem ao
 * mesmo tempo para os indicadores, os gráficos e a exportação — a planilha sai
 * do mesmo agregado que está na tela, nunca de um recálculo paralelo.
 *
 * Busca por intervalo de data no servidor (`listarSolicitacoesASEPeriodo`),
 * porque a lista de trabalho corta em 300 registros recentes e um relatório
 * anual passaria disso sem avisar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, RefreshCw, FileSpreadsheet, Users, Timer, CalendarDays, Building2,
  Clock3, Bus, UtensilsCrossed, UserRound, Layers, AlertTriangle, Route, ListFilter, Network,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer,
} from 'recharts';
import type { LucideIcon } from 'lucide-react';
import type { AseHoraExtraCompleta, Profile, RhPessoa } from '../../types';
import * as api from '../../lib/rhApi';
import { diaDaSemana } from '../../lib/rhApi';
import { canViewAllAse } from '../../lib/pages';
import { formatInt } from '../../lib/format';
import { useChartConfig, estimateCategoryChartWidth } from '../../components/charts/chartDefaults';
import ChartCard from '../../components/charts/ChartCard';
import ChartTooltip from '../../components/charts/ChartTooltip';
import KpiCard from '../../components/charts/KpiCard';
import MultiSelectFilter from '../../components/ui/MultiSelectFilter';
import Modal, { ModalBody, ModalHeader } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { exportAseRelatorioExcel } from '../../lib/pdfExport/exportAseHoraExtraPdf';
import {
  acharLinhas, agruparPor, chaveColaboradorAse, descreverFiltro, filtrarSolicitacoes, formatarDataBR,
  horasPorAreaSubsetor, intervaloDoPreset, opcoesDe, porRota, resumoAse, serieDiaria,
  setorDe, solicitanteDe, topColaboradores, turnoDe, PRESETS_PERIODO, SEM_INFO, STATUS_ASE_LABEL,
  type FiltroRelatorioAse, type GrupoAse, type LinhaAreaSubsetor, type LinhaColaboradorAse,
  type PontoDiario, type PresetPeriodoAse,
} from '../../lib/aseRelatorio';

interface Props {
  user: Profile;
  onVoltar: () => void;
  /** Texto do botão voltar — muda conforme a tela de origem (ASE ou hub RH). */
  voltarLabel?: string;
}

const umaCasa = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fmtHoras = (v: number) => `${umaCasa.format(v)} h`;
const STATUS_OPCOES = ['RASCUNHO', 'ENVIADO', 'CANCELADO'];

export default function RhAseRelatorio({ user, onVoltar, voltarLabel = 'Voltar para a lista de ASEs' }: Props) {
  const toast = useToast();
  const podeVerTodas = canViewAllAse(user);

  const [preset, setPreset] = useState<PresetPeriodoAse>('30dias');
  const [de, setDe] = useState(() => intervaloDoPreset('30dias').de);
  const [ate, setAte] = useState(() => intervaloDoPreset('30dias').ate);

  const [setores, setSetores] = useState<Set<string>>(new Set());
  const [turnos, setTurnos] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Set<string>>(new Set());
  const [solicitantes, setSolicitantes] = useState<Set<string>>(new Set());
  const [apenasTransporte, setApenasTransporte] = useState(false);
  const [apenasRefeicao, setApenasRefeicao] = useState(false);

  const [dados, setDados] = useState<AseHoraExtraCompleta[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Cadastro dos colaboradores — é o que traz área e sub-setor (o item da ASE
  // só guarda pessoa_id). Carrega uma vez; falha aqui não quebra o relatório,
  // só deixa a tabulação por área/sub-setor como "Não informado".
  const [pessoas, setPessoas] = useState<RhPessoa[]>([]);
  useEffect(() => {
    let vivo = true;
    api.listarRhPessoas().then(p => { if (vivo) setPessoas(p); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const pessoasPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p])), [pessoas]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await api.listarSolicitacoesASEPeriodo(de || null, ate || null);
      // Mesma regra da lista: quem não pode ver todas só entra nas próprias.
      setDados(podeVerTodas ? lista : lista.filter(s => s.solicitante_id === user.id));
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar as solicitações do período.');
      setDados([]);
    } finally {
      setCarregando(false);
    }
  }, [de, ate, podeVerTodas, user.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  const aplicarPreset = (p: PresetPeriodoAse) => {
    const { de: novoDe, ate: novoAte } = intervaloDoPreset(p);
    setPreset(p);
    setDe(novoDe);
    setAte(novoAte);
  };

  const base = dados || [];

  const filtro = useMemo<FiltroRelatorioAse>(() => ({
    // Período já veio recortado do servidor; manter aqui deixa o filtro
    // coerente com o texto que vai para o Excel.
    de, ate, setores, turnos, status, solicitantes, apenasTransporte, apenasRefeicao,
  }), [de, ate, setores, turnos, status, solicitantes, apenasTransporte, apenasRefeicao]);

  const solicitacoes = useMemo(() => filtrarSolicitacoes(base, filtro), [base, filtro]);
  const linhas = useMemo(() => acharLinhas(solicitacoes, pessoasPorId), [solicitacoes, pessoasPorId]);
  const resumo = useMemo(() => resumoAse(solicitacoes, linhas), [solicitacoes, linhas]);
  const serie = useMemo(() => serieDiaria(solicitacoes), [solicitacoes]);
  const porSetor = useMemo(() => agruparPor(linhas, l => l.setor), [linhas]);
  const porTurno = useMemo(() => agruparPor(linhas, l => l.turno), [linhas]);
  const areaSubsetor = useMemo(() => horasPorAreaSubsetor(linhas), [linhas]);
  const porSolicitante = useMemo(() => agruparPor(linhas, l => l.solicitante, 12), [linhas]);
  const porColaborador = useMemo(() => topColaboradores(linhas, 15), [linhas]);
  const rotas = useMemo(() => porRota(linhas), [linhas]);

  // Drill-down: clicar numa barra (ou linha da tabulação por área) abre o
  // recorte de colaboradores que formam aquele número — a mesma lista `linhas`
  // que alimenta os gráficos, só filtrada.
  const [detalhe, setDetalhe] = useState<{ titulo: string; linhas: LinhaColaboradorAse[] } | null>(null);
  const abrirDetalhe = useCallback(
    (titulo: string, filtro: (l: LinhaColaboradorAse) => boolean) => {
      const sel = linhas.filter(filtro);
      if (sel.length > 0) setDetalhe({ titulo, linhas: sel });
    },
    [linhas],
  );

  const opcoesSetor = useMemo(() => opcoesDe(base, setorDe), [base]);
  const opcoesTurno = useMemo(() => opcoesDe(base, turnoDe), [base]);
  const opcoesSolicitante = useMemo(() => opcoesDe(base, solicitanteDe), [base]);

  const filtrosAtivos =
    setores.size > 0 || turnos.size > 0 || status.size > 0 || solicitantes.size > 0 ||
    apenasTransporte || apenasRefeicao;

  const limparFiltros = () => {
    setSetores(new Set());
    setTurnos(new Set());
    setStatus(new Set());
    setSolicitantes(new Set());
    setApenasTransporte(false);
    setApenasRefeicao(false);
  };

  const exportar = () => {
    if (solicitacoes.length === 0) {
      toast.error('Nada para exportar na seleção atual.');
      return;
    }
    try {
      exportAseRelatorioExcel({
        solicitacoes,
        linhas,
        resumo,
        serie,
        porSetor,
        porTurno,
        areaSubsetor,
        // O Excel leva a lista inteira; na tela os rankings mostram só o topo.
        porSolicitante: agruparPor(linhas, l => l.solicitante),
        porColaborador: topColaboradores(linhas, undefined),
        rotas,
        descricaoFiltro: descreverFiltro(filtro),
      });
      toast.success('Relatório exportado em Excel.');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao gerar o Excel.');
    }
  };

  const periodoTexto = de && ate
    ? `${formatarDataBR(de)} a ${formatarDataBR(ate)}`
    : de ? `a partir de ${formatarDataBR(de)}`
    : ate ? `até ${formatarDataBR(ate)}`
    : 'todo o histórico';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onVoltar}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500 transition-transform group-hover:-translate-x-1 group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-blue-400" />
            <span>{voltarLabel}</span>
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
              Relatório de Horas Extras
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              FRM.RHU-0007
            </span>
            {!podeVerTodas && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                <UserRound className="h-3 w-3" />
                Apenas as suas ASEs
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Consumo de horas extras autorizadas por período, setor, turno e colaborador — {periodoTexto}.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:border-blue-400 hover:text-blue-700 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={exportar}
            disabled={carregando || solicitacoes.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS_PERIODO.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => aplicarPreset(p.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                preset === p.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
            De
            <input
              type="date"
              value={de}
              onChange={e => { setDe(e.target.value); setPreset('tudo'); }}
              className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/80 dark:bg-slate-950/50 dark:text-slate-100"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
            Até
            <input
              type="date"
              value={ate}
              onChange={e => { setAte(e.target.value); setPreset('tudo'); }}
              className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/80 dark:bg-slate-950/50 dark:text-slate-100"
            />
          </label>

          <MultiSelectFilter
            label="Setor"
            icon={Building2}
            options={opcoesSetor}
            selected={setores}
            onChange={setSetores}
            className="shrink-0 w-[150px] sm:w-auto sm:min-w-[150px]"
          />
          <MultiSelectFilter
            label="Turno"
            icon={Clock3}
            options={opcoesTurno}
            selected={turnos}
            onChange={setTurnos}
            className="shrink-0 w-[150px] sm:w-auto sm:min-w-[150px]"
          />
          <MultiSelectFilter
            label="Status"
            icon={Layers}
            options={STATUS_OPCOES}
            selected={status}
            onChange={setStatus}
            renderOption={op => STATUS_ASE_LABEL[op] || op}
            className="shrink-0 w-[150px] sm:w-auto sm:min-w-[150px]"
          />
          <MultiSelectFilter
            label="Solicitante"
            icon={UserRound}
            options={opcoesSolicitante}
            selected={solicitantes}
            onChange={setSolicitantes}
            panelClassName="w-80"
            className="shrink-0 w-[150px] sm:w-auto sm:min-w-[150px]"
          />

          <button
            type="button"
            onClick={() => setApenasTransporte(v => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              apenasTransporte
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <Bus className="h-3.5 w-3.5" />
            Só com transporte
          </button>
          <button
            type="button"
            onClick={() => setApenasRefeicao(v => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              apenasRefeicao
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <UtensilsCrossed className="h-3.5 w-3.5" />
            Só com refeição
          </button>

          {filtrosAtivos && (
            <button
              type="button"
              onClick={limparFiltros}
              className="px-2 py-1.5 text-xs font-bold text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <ListFilter className="h-3 w-3" />
          Indicadores, gráficos e exportação seguem exatamente esta seleção. Clique numa barra ou linha para abrir as ASEs que a compõem.
        </p>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {carregando && !dados ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin" />
        </div>
      ) : solicitacoes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Nenhuma ASE no período e filtros selecionados.
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Amplie o período ou limpe os filtros para ver os indicadores.
          </p>
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Total de horas extras" value={resumo.horas} format={fmtHoras} icon={Timer} accent="var(--brand)" emphasize />
            <KpiCard label="ASEs emitidas" value={resumo.ases} format={formatInt} icon={Layers} accent="#0891b2" />
            <KpiCard label="Autorizações de colaborador" value={resumo.colaboradores} format={formatInt} icon={Users} detail={`${resumo.pessoasDistintas} pessoa(s) distinta(s)`} accent="#7c3aed" />
            <KpiCard label="Média por colaborador" value={resumo.mediaHorasPorColaborador} format={fmtHoras} icon={Clock3} accent="var(--status-warning)" />
            <KpiCard label="Transportes" value={resumo.transportes} format={formatInt} icon={Bus} accent="var(--status-serious)" />
            <KpiCard label="Refeições" value={resumo.refeicoes} format={formatInt} icon={UtensilsCrossed} accent="var(--status-good)" />
          </div>

          {/* Evolução diária */}
          <ChartCard
            title="Horas extras por dia"
            icon={CalendarDays}
            description="Horas autorizadas pela data de execução da ASE. Dias sem ASE não aparecem."
            height={320}
            minPlotWidth={estimateCategoryChartWidth(serie.length, 52, 460)}
            empty={serie.length === 0}
          >
            <ResponsiveContainer width="100%" height={320}>
              <SerieDiariaChart
                data={serie}
                aoSelecionar={dia =>
                  abrirDetalhe(`Horas extras de ${formatarDataBR(dia)}`, l => l.data_execucao === dia)
                }
              />
            </ResponsiveContainer>
          </ChartCard>

          {/* Setor + Turno */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <GraficoHoras
              titulo="Horas por setor"
              icone={Building2}
              descricao="Onde a hora extra está sendo consumida."
              data={porSetor}
              aoSelecionar={nome => abrirDetalhe(`Setor · ${nome}`, l => l.setor === nome)}
            />
            <GraficoHoras
              titulo="Horas por turno"
              icone={Clock3}
              descricao="Distribuição entre os turnos de trabalho."
              data={porTurno}
              aoSelecionar={nome => abrirDetalhe(`Turno · ${nome}`, l => l.turno === nome)}
            />
          </div>

          {/* Tabulação: horas por área e sub-setor (cadastro do colaborador) */}
          <TabelaAreaSubsetor
            data={areaSubsetor}
            aoSelecionar={(area, subsetor) =>
              abrirDetalhe(
                `${area} · ${subsetor}`,
                l => l.area === area && l.subsetor === subsetor,
              )
            }
          />

          {/* Colaboradores + Solicitantes */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <GraficoHoras
              titulo="Colaboradores com mais horas"
              icone={Users}
              descricao="Top 15 por horas acumuladas no período — apoio ao controle do limite da CLT."
              data={porColaborador}
              aoSelecionar={nome => abrirDetalhe(nome, l => chaveColaboradorAse(l) === nome)}
            />
            <GraficoHoras
              titulo="Horas por solicitante"
              icone={UserRound}
              descricao="Quem emitiu as ASEs do período (top 12)."
              data={porSolicitante}
              aoSelecionar={nome => abrirDetalhe(`Solicitante · ${nome}`, l => l.solicitante === nome)}
            />
          </div>

          {/* Transporte por rota */}
          {rotas.length > 0 && (
            <GraficoHoras
              titulo="Transporte por rota"
              icone={Route}
              descricao="Passageiros autorizados por rota — base para programar o fretamento."
              data={rotas}
              metrica="colaboradores"
              aoSelecionar={nome =>
                abrirDetalhe(`Rota · ${nome}`, l => l.transporte && (l.rota || SEM_INFO) === nome)
              }
            />
          )}

          {/* Tabela das ASEs da seleção */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                ASEs da seleção ({formatInt(solicitacoes.length)})
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {formatInt(resumo.colaboradores)} autorização(ões) · {fmtHoras(resumo.horas)}
              </span>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/80 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-bold">Protocolo</th>
                    <th className="px-3 py-2 font-bold">Data</th>
                    <th className="px-3 py-2 font-bold">Setor</th>
                    <th className="px-3 py-2 font-bold">Turno</th>
                    <th className="px-3 py-2 font-bold">Solicitante</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                    <th className="px-3 py-2 text-right font-bold">Colab.</th>
                    <th className="px-3 py-2 text-right font-bold">Horas</th>
                    <th className="px-3 py-2 text-right font-bold">Transp.</th>
                    <th className="px-4 py-2 text-right font-bold">Refeição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {solicitacoes.map(s => {
                    const horas = s.itens.reduce((a, it) => a + (it.total_horas || 0), 0);
                    return (
                      <tr key={s.id} className="text-slate-700 hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/40">
                        <td className="whitespace-nowrap px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">{s.numero_protocolo}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatarDataBR(s.data_execucao)}
                          <span className="ml-1 text-[10px] text-slate-400">{diaDaSemana(s.data_execucao)}</span>
                        </td>
                        <td className="px-3 py-2">{s.setor_nome || '-'}</td>
                        <td className="px-3 py-2">{s.turno_nome || '-'}</td>
                        <td className="px-3 py-2">{s.solicitante_nome || '-'}</td>
                        <td className="px-3 py-2">{STATUS_ASE_LABEL[s.status] || s.status}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.itens.length}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{umaCasa.format(horas)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.itens.filter(it => it.transporte).length}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.itens.filter(it => it.refeicao).length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {detalhe && (
        <Modal
          onClose={() => setDetalhe(null)}
          maxWidth="max-w-5xl"
          ariaLabel={`Detalhe: ${detalhe.titulo}`}
        >
          <ModalHeader onClose={() => setDetalhe(null)}>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
                {detalhe.titulo}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {formatInt(detalhe.linhas.length)} autorização(ões) ·{' '}
                {fmtHoras(detalhe.linhas.reduce((a, l) => a + l.horas, 0))} ·{' '}
                {formatInt(new Set(detalhe.linhas.map(l => l.solicitacao_id)).size)} ASE(s)
              </p>
            </div>
          </ModalHeader>
          <ModalBody className="!p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/80 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-bold">Protocolo</th>
                    <th className="px-3 py-2 font-bold">Data</th>
                    <th className="px-3 py-2 font-bold">Colaborador</th>
                    <th className="px-3 py-2 font-bold">Setor</th>
                    <th className="px-3 py-2 font-bold">Turno</th>
                    <th className="px-3 py-2 font-bold">Solicitante</th>
                    <th className="px-3 py-2 text-right font-bold">Entrada</th>
                    <th className="px-3 py-2 text-right font-bold">Saída</th>
                    <th className="px-3 py-2 text-right font-bold">Horas</th>
                    <th className="px-3 py-2 font-bold">Transporte</th>
                    <th className="px-4 py-2 text-center font-bold">Refeição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detalhe.linhas.map((l, i) => (
                    <tr
                      key={`${l.solicitacao_id}-${l.registro || l.nome}-${i}`}
                      className="text-slate-700 hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/40"
                    >
                      <td className="whitespace-nowrap px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                        {l.protocolo}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatarDataBR(l.data_execucao)}
                        <span className="ml-1 text-[10px] text-slate-400">{diaDaSemana(l.data_execucao)}</span>
                      </td>
                      <td className="px-3 py-2">{l.registro ? `${l.registro} - ${l.nome}` : l.nome}</td>
                      <td className="px-3 py-2">{l.setor}</td>
                      <td className="px-3 py-2">{l.turno}</td>
                      <td className="px-3 py-2">{l.solicitante}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.hora_entrada || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.hora_saida || '-'}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{umaCasa.format(l.horas)}</td>
                      <td className="px-3 py-2">{l.transporte ? l.rota || 'Sim' : '—'}</td>
                      <td className="px-4 py-2 text-center">{l.refeicao ? 'Sim' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModalBody>
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SerieDiariaChart({
  data,
  aoSelecionar,
}: {
  data: PontoDiario[];
  aoSelecionar?: (dia: string) => void;
}) {
  const c = useChartConfig();

  const Tip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <ChartTooltip
        title={formatarDataBR(p.dia)}
        subtitle={diaDaSemana(p.dia)}
        rows={[
          { color: c.tokens.brand, label: 'Horas extras', value: fmtHoras(p.horas) },
          { color: c.tokens.series[1], label: 'Colaboradores', value: formatInt(p.colaboradores) },
          { color: c.tokens.series[2], label: 'ASEs', value: formatInt(p.ases) },
        ]}
      />
    );
  };

  return (
    <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
      <CartesianGrid {...c.grid} />
      <XAxis dataKey="label" {...c.xAxis} interval="preserveStartEnd" minTickGap={6} />
      <YAxis {...c.yAxis} width={48} />
      <Tooltip content={<Tip />} cursor={c.cursor} />
      <Bar
        dataKey="horas"
        fill={c.tokens.brand}
        radius={c.radius.top}
        maxBarSize={38}
        cursor={aoSelecionar ? 'pointer' : undefined}
        onClick={aoSelecionar
          ? (entry: any, index: number) => {
              const dia = data[index]?.dia ?? entry?.dia ?? entry?.payload?.dia;
              if (dia) aoSelecionar(String(dia));
            }
          : undefined}
        {...c.animation}
      >
        <LabelList
          dataKey="horas"
          position="top"
          formatter={(v: number) => (data.length <= 20 && v > 0 ? umaCasa.format(v) : '')}
          style={c.labelOnSurface}
        />
      </Bar>
    </BarChart>
  );
}

/** Ranking horizontal. `metrica` troca a barra de horas para nº de colaboradores. */
function GraficoHoras({
  titulo,
  icone,
  descricao,
  data,
  metrica = 'horas',
  aoSelecionar,
}: {
  titulo: string;
  icone: LucideIcon;
  descricao: string;
  data: GrupoAse[];
  metrica?: 'horas' | 'colaboradores';
  aoSelecionar?: (nome: string) => void;
}) {
  const c = useChartConfig();
  const altura = Math.max(180, data.length * 30 + 42);
  const maxValor = Math.max(1, ...data.map(d => (metrica === 'horas' ? d.horas : d.colaboradores)));
  const rotuloMetrica = metrica === 'horas' ? 'Horas extras' : 'Colaboradores';

  const encurtar = (v: string) => (v.length > 30 ? `${v.slice(0, 29)}…` : v);
  const formatar = (v: number) => (metrica === 'horas' ? umaCasa.format(v) : formatInt(v));

  const Tip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const g = payload[0].payload as GrupoAse;
    return (
      <ChartTooltip
        title={g.nome}
        rows={[
          { color: c.tokens.brand, label: 'Horas extras', value: fmtHoras(g.horas) },
          { color: c.tokens.series[1], label: 'Colaboradores', value: formatInt(g.colaboradores) },
          { color: c.tokens.series[2], label: 'ASEs', value: formatInt(g.ases) },
          { color: c.tokens.series[3], label: 'Transporte / Refeição', value: `${formatInt(g.transportes)} / ${formatInt(g.refeicoes)}` },
        ]}
      />
    );
  };

  return (
    <ChartCard
      title={titulo}
      icon={icone}
      description={descricao}
      height={altura}
      empty={data.length === 0}
      emptyMessage="Sem dados na seleção atual."
      footer={
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Barras por {rotuloMetrica.toLowerCase()}; o restante aparece ao passar o cursor.
          {aoSelecionar && ' Clique numa barra para abrir as ASEs.'}
        </p>
      }
    >
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" {...c.yAxis} />
          <YAxis
            type="category"
            dataKey="nome"
            {...c.xAxis}
            tick={{ fontSize: 11, fill: c.tokens.labelStrong, fontWeight: 600 }}
            tickFormatter={encurtar}
            tickMargin={8}
            width={196}
            interval={0}
          />
          <Tooltip content={<Tip />} cursor={c.cursor} />
          <Bar
            dataKey={metrica}
            radius={c.radius.right}
            maxBarSize={24}
            cursor={aoSelecionar ? 'pointer' : undefined}
            onClick={aoSelecionar
              ? (entry: any, index: number) => {
                  const nome = data[index]?.nome ?? entry?.nome ?? entry?.payload?.nome;
                  if (nome != null) aoSelecionar(String(nome));
                }
              : undefined}
            {...c.animation}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={c.tokens.brand}
                fillOpacity={0.5 + 0.5 * ((metrica === 'horas' ? d.horas : d.colaboradores) / maxValor)}
              />
            ))}
            <LabelList
              dataKey={metrica}
              position="right"
              formatter={(v: number) => (v > 0 ? formatar(v) : '')}
              style={c.labelOnSurface}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Tabulação de horas por área × sub-setor, com subtotal por área e total geral. */
function TabelaAreaSubsetor({
  data,
  aoSelecionar,
}: {
  data: LinhaAreaSubsetor[];
  aoSelecionar?: (area: string, subsetor: string) => void;
}) {
  const areas = useMemo(() => {
    const ordem: string[] = [];
    const porArea = new Map<string, LinhaAreaSubsetor[]>();
    data.forEach(l => {
      if (!porArea.has(l.area)) { porArea.set(l.area, []); ordem.push(l.area); }
      porArea.get(l.area)!.push(l);
    });
    return ordem.map(area => ({ area, linhas: porArea.get(area)! }));
  }, [data]);

  const totalHoras = data.reduce((a, l) => a + l.horas, 0);
  const totalColab = data.reduce((a, l) => a + l.colaboradores, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
          <Network className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          Horas por área e sub-setor
        </h2>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Área e sub-setor do cadastro do colaborador · {fmtHoras(totalHoras)}
        </span>
      </div>
      {data.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Sem colaboradores com área/sub-setor na seleção atual.
        </p>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/80 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-bold">Área</th>
                <th className="px-3 py-2 font-bold">Sub-setor</th>
                <th className="px-3 py-2 text-right font-bold">Horas</th>
                <th className="px-3 py-2 text-right font-bold">Colab.</th>
                <th className="px-3 py-2 text-right font-bold">ASEs</th>
                <th className="px-3 py-2 text-right font-bold">Transp.</th>
                <th className="px-4 py-2 text-right font-bold">Refeição</th>
              </tr>
            </thead>
            {areas.map(({ area, linhas }) => {
              const subHoras = linhas.reduce((a, l) => a + l.horas, 0);
              const subColab = linhas.reduce((a, l) => a + l.colaboradores, 0);
              const subTransp = linhas.reduce((a, l) => a + l.transportes, 0);
              const subRef = linhas.reduce((a, l) => a + l.refeicoes, 0);
              return (
                <tbody key={area} className="divide-y divide-slate-100 dark:divide-slate-800">
                  {linhas.map((l, i) => (
                    <tr
                      key={`${area}-${l.subsetor}`}
                      onClick={aoSelecionar ? () => aoSelecionar(l.area, l.subsetor) : undefined}
                      className={`text-slate-700 hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/40 ${aoSelecionar ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">{i === 0 ? area : ''}</td>
                      <td className="px-3 py-2">{l.subsetor}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{umaCasa.format(l.horas)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatInt(l.colaboradores)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatInt(l.ases)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatInt(l.transportes)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatInt(l.refeicoes)}</td>
                    </tr>
                  ))}
                  {linhas.length > 1 && (
                    <tr className="bg-slate-50/70 text-[11px] font-bold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                      <td className="px-4 py-1.5" />
                      <td className="px-3 py-1.5">Subtotal {area}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{umaCasa.format(subHoras)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatInt(subColab)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">—</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatInt(subTransp)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{formatInt(subRef)}</td>
                    </tr>
                  )}
                </tbody>
              );
            })}
            <tfoot className="sticky bottom-0 bg-slate-100 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
              <tr>
                <td className="px-4 py-2" colSpan={2}>Total geral</td>
                <td className="px-3 py-2 text-right tabular-nums">{umaCasa.format(totalHoras)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInt(totalColab)}</td>
                <td className="px-3 py-2 text-right tabular-nums" colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
