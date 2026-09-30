/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Saídas do estoque do depósito 0002 (EPIs + Consumíveis): o que realmente saiu
 * do almoxarifado, lido das baixas da MB51. É um retrato diferente da análise
 * de consumo da ficha — que conta o que foi entregue e assinado — e serve para
 * conferir uma contra a outra. A conta está em `consumoEstoqueEpi.ts` (testada).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, Boxes, CalendarRange, CircleDollarSign, Download, Hourglass, Loader2, PackageMinus,
  RefreshCw, Receipt, Tags, Warehouse, X,
} from 'lucide-react';
import KpiCard from '../../charts/KpiCard';
import ChartCard from '../../charts/ChartCard';
import ChartTooltip from '../../charts/ChartTooltip';
import { estimateCategoryChartWidth, useChartConfig } from '../../charts/chartDefaults';
import SearchKeywordsChips from '../../ui/SearchKeywordsChips';
import Pagination from '../../ui/Pagination';
import Modal, { ModalBody, ModalHeader } from '../../ui/Modal';
import {
  DEPOSITO_EPI,
  analisarSaidas,
  filtrarSaidas,
  filtrarSaldos,
  itensSemSaida,
  type LinhaItemSaida,
  type SaidaEstoque,
  type SaldoEstoque,
} from '../../../lib/consumoEstoqueEpi';
import { listarSaidasEstoqueEpi, listarSaldoEstoqueEpi, ultimaDataMb51 } from '../../../lib/consumoEstoqueEpiApi';
import { exportarSaidasEstoqueExcel } from '../../../lib/consumoEstoqueEpiExport';
import { formatBRL, formatBRLCompacto, formatDateBR, formatDateTimeBR, formatInt, formatQtd } from '../../../lib/format';
import { formatDeposito } from '../../../lib/almoxarifado';

const PERIODOS = [
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: '180', rotulo: 'Últimos 6 meses' },
  { valor: 'tudo', rotulo: 'Todo o histórico' },
];

const PAGE_SIZE = 50;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

const selectCls = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const thCls = 'px-3 py-2.5 font-bold';

const isoDeHoje = () => new Date().toISOString().slice(0, 10);
const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

type ChaveOrdem = 'valor' | 'quantidade' | 'saldo' | 'cobertura' | 'ultima';

const ORDENACOES: Record<ChaveOrdem, (item: LinhaItemSaida) => number> = {
  valor: item => item.valor,
  quantidade: item => item.quantidade,
  saldo: item => item.saldo,
  cobertura: item => item.coberturaDias ?? Number.POSITIVE_INFINITY,
  ultima: item => (item.ultimaSaida ? new Date(item.ultimaSaida).getTime() : 0),
};

function Secao({ titulo, descricao, icone: Icone, children }: { titulo: string; descricao: string; icone: typeof Boxes; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-2.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <Icone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">{titulo}</h3>
          <p className="text-xs text-slate-500">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function DetalheItem({ item, movimentos, onClose }: { item: LinhaItemSaida; movimentos: SaidaEstoque[]; onClose: () => void }) {
  const c = useChartConfig();
  const ordenados = useMemo(() => [...movimentos].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)), [movimentos]);
  const porMes = useMemo(() => {
    const mapa = new Map<string, number>();
    movimentos.forEach(m => mapa.set(m.data.slice(0, 7), (mapa.get(m.data.slice(0, 7)) ?? 0) - m.quantidade));
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mes, quantidade]) => ({ mes: rotuloMes(mes), quantidade }));
  }, [movimentos]);

  return (
    <Modal onClose={onClose} ariaLabel={`Saídas do material ${item.material}`} maxWidth="max-w-4xl">
      <ModalHeader onClose={onClose}>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Saídas do depósito {DEPOSITO_EPI}</p>
          <h2 className="truncate font-mono text-lg font-bold text-slate-900 dark:text-slate-50">{item.material}</h2>
          <p className="truncate text-xs text-slate-500">{item.descricao || 'Sem descrição'}</p>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['Saída líquida', `${formatQtd(item.quantidade)} ${item.umb ?? ''}`],
            ['Valor da saída', formatBRL(item.valor)],
            ['Saldo atual', `${formatQtd(item.saldo)} ${item.umb ?? ''}`],
            ['Cobertura', item.coberturaDias === null ? '—' : `${formatInt(item.coberturaDias)} dias`],
            ['Saídas', `${item.lancamentos}${item.estornos ? ` (+${item.estornos} estorno)` : ''}`],
            ['Média mensal', formatQtd(item.mediaMensal)],
            ['Primeira saída', item.primeiraSaida ? formatDateBR(item.primeiraSaida) : '—'],
            ['Última saída', item.ultimaSaida ? formatDateBR(item.ultimaSaida) : '—'],
          ] as const).map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-50">{valor}</p>
            </div>
          ))}
        </div>

        {porMes.length > 0 && (
          <ChartCard title="Saída por mês" description="Unidades líquidas de estorno." icon={CalendarRange} height={200} minPlotWidth={estimateCategoryChartWidth(porMes.length)}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porMes} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid {...c.grid} />
                <XAxis dataKey="mes" {...c.xAxis} />
                <YAxis allowDecimals={false} {...c.yAxis} />
                <Tooltip cursor={c.cursor} content={({ active, payload, label }) => active && payload?.length ? (
                  <ChartTooltip title={label} rows={[{ label: 'Unidades', value: formatQtd(Number(payload[0].value)), color: c.tokens.brand }]} />
                ) : null} />
                <Bar dataKey="quantidade" fill={c.tokens.brand} radius={c.radius.top} maxBarSize={32} {...c.animation}>
                  <LabelList dataKey="quantidade" position="top" formatter={(v: number) => formatQtd(v)} style={c.labelOnSurface} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Lançamentos no período ({ordenados.length})</p>
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr><th className={`${thCls} pl-3`}>Data</th><th className={thCls}>Lançamento</th><th className={`${thCls} text-right`}>Qtd.</th><th className={`${thCls} text-right`}>Valor</th><th className={thCls}>Documento</th><th className={thCls}>Finalidade</th><th className={thCls}>PEP</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ordenados.map(m => (
                  <tr key={m.id} className="text-slate-700 dark:text-slate-200">
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatDateBR(m.data)}</td>
                    <td className={`px-3 py-1.5 ${m.estorno ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>{m.estorno ? `Estorno (${m.tipo})` : `Baixa (${m.tipo})`}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold">{formatQtd(m.quantidade)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(m.valor)}</td>
                    <td className="px-3 py-1.5 font-mono">{m.documento ?? '—'}</td>
                    <td className="px-3 py-1.5">{m.finalidade}</td>
                    <td className="px-3 py-1.5 font-mono">{m.pep ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

export default function ConsumoEstoqueEpi() {
  const c = useChartConfig();
  const [saidas, setSaidas] = useState<SaidaEstoque[]>([]);
  const [saldos, setSaldos] = useState<SaldoEstoque[]>([]);
  const [saldoImportadoEm, setSaldoImportadoEm] = useState<string | null>(null);
  const [dataMb51, setDataMb51] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState('90');
  const [finalidade, setFinalidade] = useState('');
  const [palavras, setPalavras] = useState<string[]>([]);
  const [incluirParados, setIncluirParados] = useState(false);
  const [medidaMes, setMedidaMes] = useState<'valor' | 'quantidade'>('valor');
  const [ordem, setOrdem] = useState<{ chave: ChaveOrdem; desc: boolean }>({ chave: 'valor', desc: true });
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [lista, posicao, ultima] = await Promise.all([listarSaidasEstoqueEpi(), listarSaldoEstoqueEpi(), ultimaDataMb51()]);
      setSaidas(lista);
      setSaldos(posicao.saldos);
      setSaldoImportadoEm(posicao.importadoEm);
      setDataMb51(ultima);
    } catch (e) {
      const detalhe = e && typeof e === 'object' ? (e as { message?: unknown }).message : null;
      setErro(typeof detalhe === 'string' && detalhe ? detalhe : 'Não foi possível carregar as saídas do estoque.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // A janela termina na última data da MB51: base desatualizada não dilui a média.
  const janela = useMemo(() => {
    const fim = dataMb51 ?? isoDeHoje();
    if (periodo === 'tudo') {
      const primeira = saidas.reduce<string | null>((menor, s) => (!menor || s.data < menor ? s.data : menor), null);
      return { inicio: primeira ?? fim, fim };
    }
    return { inicio: somarDias(fim, -(Number(periodo) - 1)), fim };
  }, [periodo, dataMb51, saidas]);

  const filtros = useMemo(() => ({
    inicio: janela.inicio, fim: janela.fim, finalidade: finalidade || null, palavras,
  }), [janela, finalidade, palavras]);

  const finalidades = useMemo(() => Array.from(new Set(saidas.map(s => s.finalidade))).sort(), [saidas]);
  const filtradas = useMemo(() => filtrarSaidas(saidas, filtros), [saidas, filtros]);
  const saldosFiltrados = useMemo(() => filtrarSaldos(saldos, palavras), [saldos, palavras]);
  const analise = useMemo(() => analisarSaidas(filtradas, saldosFiltrados, janela), [filtradas, saldosFiltrados, janela]);

  const linhas = useMemo(() => {
    const base = incluirParados ? [...analise.porItem, ...itensSemSaida(saldosFiltrados, analise.porItem)] : analise.porItem;
    const valorDe = ORDENACOES[ordem.chave];
    return [...base].sort((a, b) => (ordem.desc ? valorDe(b) - valorDe(a) : valorDe(a) - valorDe(b)) || a.material.localeCompare(b.material));
  }, [analise.porItem, saldosFiltrados, incluirParados, ordem]);

  useEffect(() => { setPagina(0); }, [linhas.length, periodo, finalidade, palavras, incluirParados, ordem]);

  const ordenarPor = (chave: ChaveOrdem) => setOrdem(atual => ({ chave, desc: atual.chave === chave ? !atual.desc : true }));
  const seta = (chave: ChaveOrdem) => (ordem.chave === chave ? (ordem.desc ? ' ↓' : ' ↑') : '');

  const limpar = () => { setPeriodo('90'); setFinalidade(''); setPalavras([]); setIncluirParados(false); };
  const filtrosAtivos = (periodo !== '90' ? 1 : 0) + (finalidade ? 1 : 0) + palavras.length + (incluirParados ? 1 : 0);

  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>;

  if (erro) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/60 px-6 py-8 text-center dark:border-red-900/50 dark:bg-red-950/20" role="alert">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
        <p className="mt-2 text-sm font-bold text-red-800 dark:text-red-300">{erro}</p>
        <button type="button" onClick={() => void carregar()} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300">
          <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
        </button>
      </div>
    );
  }

  if (saidas.length === 0 && saldos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-slate-700">
        <Warehouse className="mx-auto h-9 w-9 text-slate-400" />
        <h2 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">Sem dados do depósito {DEPOSITO_EPI}</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">Importe a MB51 e a ZL0024 na aba Importar SAP do painel administrativo.</p>
      </div>
    );
  }

  const { resumo } = analise;
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / PAGE_SIZE));
  const visiveis = linhas.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);
  const topItens = analise.porItem.slice(0, 12).map(i => ({
    nome: `${i.material} · ${i.descricao ?? ''}`, valor: i.valor, quantidade: i.quantidade, lancamentos: i.lancamentos,
  }));
  const serieMensal = analise.porMes.map(m => ({ mes: rotuloMes(m.mes), valor: m.valor, quantidade: m.quantidade, lancamentos: m.lancamentos }));
  const itemAberto = aberto ? linhas.find(l => l.material === aberto) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-xs leading-relaxed text-slate-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-slate-300">
        <strong>O que saiu do estoque.</strong> Baixas de consumo da MB51 (SAP) no depósito <strong>{formatDeposito(DEPOSITO_EPI)}</strong>, líquidas de estorno.
        É diferente da <em>Análise de consumo</em>, que conta o que foi entregue e assinado em ficha — comparar as duas mostra o que saiu sem ficha.
        Transferências entre depósitos não contam.
      </div>

      {/* Filtros */}
      <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SearchKeywordsChips
          chips={palavras}
          onChangeChips={setPalavras}
          accent="brand"
          compact
          placeholder="Palavras-chave — código ou descrição do material (Enter adiciona)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-slate-400" />
          <select value={periodo} onChange={e => setPeriodo(e.target.value)} className={selectCls} aria-label="Período">
            {PERIODOS.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
          <Tags className="ml-1 h-4 w-4 text-slate-400" />
          <select value={finalidade} onChange={e => setFinalidade(e.target.value)} className={selectCls} aria-label="Finalidade da baixa">
            <option value="">Finalidade: todas</option>
            {finalidades.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="ml-1 inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={incluirParados} onChange={e => setIncluirParados(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Incluir itens sem saída
          </label>
          {filtrosAtivos > 0 && (
            <button type="button" onClick={limpar} className="ml-auto inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-[#0056c6] dark:hover:bg-slate-800">
              <X className="h-3.5 w-3.5" />Limpar filtros ({filtrosAtivos})
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Janela de {formatDateBR(janela.inicio)} a {formatDateBR(janela.fim)} ({formatInt(resumo.dias)} dias).
          {dataMb51 && <> MB51 até {formatDateBR(dataMb51)}.</>}
          {saldoImportadoEm && <> Saldo (ZL0024) de {formatDateTimeBR(saldoImportadoEm)}.</>}
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Valor saído" value={resumo.valor} format={formatBRL} icon={CircleDollarSign} emphasize detail={`${formatBRL(resumo.mediaMensalValor)} por mês`} />
        <KpiCard label="Unidades saídas" value={resumo.quantidade} format={formatQtd} icon={PackageMinus} accent="#0891b2" detail="líquidas de estorno" />
        <KpiCard label="Itens com saída" value={resumo.itensComSaida} format={formatInt} icon={Boxes} accent="#7c3aed" share={resumo.itensEmEstoque ? Math.min(1, resumo.itensComSaida / resumo.itensEmEstoque) : undefined} detail={`de ${formatInt(resumo.itensEmEstoque)} em estoque`} />
        <KpiCard label="Lançamentos" value={resumo.lancamentos} format={formatInt} icon={Receipt} accent="var(--status-good)" detail={resumo.estornos ? `${formatInt(resumo.estornos)} estornos` : 'sem estornos'} />
        <KpiCard label="Valor em estoque" value={resumo.valorEstoque} format={formatBRL} icon={Warehouse} accent="var(--series-3)" detail={`${formatInt(resumo.itensEmEstoque)} itens no depósito`} />
        <KpiCard label="Itens sem saída" value={resumo.itensParados} format={formatInt} icon={Hourglass} accent="var(--status-warning)" share={resumo.valorEstoque ? Math.min(1, resumo.valorParado / resumo.valorEstoque) : undefined} detail={`${formatBRL(resumo.valorParado)} parados no período`} />
      </div>

      {resumo.lancamentos === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-xs text-slate-500 dark:border-slate-700">
          Nenhuma saída com esses filtros.{' '}
          <button type="button" onClick={limpar} className="font-bold text-[#0056c6] hover:underline">Limpar filtros</button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Itens que mais saíram" description="Valor da saída líquida no período." icon={Boxes} height={Math.max(220, topItens.length * 30)} empty={!topItens.length}>
          <ResponsiveContainer width="100%" height={Math.max(220, topItens.length * 30)}>
            <BarChart data={topItens} layout="vertical" margin={{ top: 4, right: 64, left: 0, bottom: 4 }}>
              <CartesianGrid {...c.grid} vertical horizontal={false} />
              <XAxis type="number" {...c.yAxis} tickFormatter={(v: number) => formatBRLCompacto(v)} />
              <YAxis type="category" dataKey="nome" {...c.xAxis} tick={{ fontSize: 11, fill: c.tokens.labelStrong, fontWeight: 600 }} width={190} interval={0} tickFormatter={(v: string) => (v.length > 30 ? `${v.slice(0, 29)}…` : v)} />
              <Tooltip cursor={c.cursor} content={({ active, payload }) => active && payload?.length ? (
                <ChartTooltip title={payload[0].payload.nome} rows={[
                  { label: 'Valor', value: formatBRL(payload[0].payload.valor), color: c.tokens.brand },
                  { label: 'Unidades', value: formatQtd(payload[0].payload.quantidade) },
                  { label: 'Saídas', value: payload[0].payload.lancamentos },
                ]} />
              ) : null} />
              <Bar dataKey="valor" radius={c.radius.right} maxBarSize={22} {...c.animation}>
                {topItens.map((_, i) => <Cell key={i} fill={c.tokens.brand} fillOpacity={1 - i * 0.045} />)}
                <LabelList dataKey="valor" position="right" formatter={(v: number) => formatBRLCompacto(v)} style={c.labelOnSurface} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div>
          <ChartCard
            title="Saída por mês"
            description={medidaMes === 'valor' ? 'Valor saído, líquido de estorno.' : 'Unidades saídas, líquidas de estorno.'}
            icon={CalendarRange}
            height={220}
            minPlotWidth={estimateCategoryChartWidth(serieMensal.length)}
            empty={!serieMensal.length}
            actions={(
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-bold dark:border-slate-700" role="group" aria-label="Medida do gráfico">
                {([['valor', 'Valor (R$)'], ['quantidade', 'Quantidade']] as const).map(([medida, rotulo]) => (
                  <button
                    key={medida}
                    type="button"
                    onClick={() => setMedidaMes(medida)}
                    aria-pressed={medidaMes === medida}
                    className={`px-2.5 py-1 transition-colors ${medidaMes === medida ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            )}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serieMensal} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid {...c.grid} />
                <XAxis dataKey="mes" {...c.xAxis} />
                <YAxis {...c.yAxis} allowDecimals={medidaMes === 'valor'} tickFormatter={(v: number) => (medidaMes === 'valor' ? formatBRLCompacto(v) : formatQtd(v))} />
                <Tooltip cursor={c.cursor} content={({ active, payload, label }) => active && payload?.length ? (
                  <ChartTooltip title={label} rows={[
                    { label: 'Valor', value: formatBRL(payload[0].payload.valor), color: medidaMes === 'valor' ? c.tokens.brand : undefined },
                    { label: 'Unidades', value: formatQtd(payload[0].payload.quantidade), color: medidaMes === 'quantidade' ? c.tokens.brand : undefined },
                    { label: 'Saídas', value: payload[0].payload.lancamentos },
                  ]} />
                ) : null} />
                <Bar dataKey={medidaMes} fill={c.tokens.brand} radius={c.radius.top} maxBarSize={36} {...c.animation}>
                  <LabelList dataKey={medidaMes} position="top" formatter={(v: number) => (medidaMes === 'valor' ? formatBRLCompacto(v) : formatQtd(v))} style={c.labelOnSurface} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Itens */}
      <Secao titulo="Saída por item" descricao="Clique no item para ver cada lançamento. Cobertura = quantos dias o saldo atual dura no ritmo do período." icone={PackageMinus}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <span className="text-[11px] text-slate-500">{formatInt(linhas.length)} itens</span>
          <button
            type="button"
            onClick={() => exportarSaidasEstoqueExcel(linhas, filtradas, filtros, janela)}
            disabled={linhas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" /> Exportar
          </button>
        </div>
        {linhas.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhum item com esses filtros.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th className={`${thCls} pl-4`}>Material</th>
                    <th className={`${thCls} text-right`}><button type="button" onClick={() => ordenarPor('saldo')} className="font-bold uppercase">Saldo{seta('saldo')}</button></th>
                    <th className={`${thCls} text-right`}><button type="button" onClick={() => ordenarPor('quantidade')} className="font-bold uppercase">Saída (un.){seta('quantidade')}</button></th>
                    <th className={`${thCls} text-right`}><button type="button" onClick={() => ordenarPor('valor')} className="font-bold uppercase">Valor{seta('valor')}</button></th>
                    <th className={`${thCls} text-right`}>Saídas</th>
                    <th className={`${thCls} text-right`}>Média/mês</th>
                    <th className={`${thCls} text-right`}><button type="button" onClick={() => ordenarPor('cobertura')} className="font-bold uppercase">Cobertura{seta('cobertura')}</button></th>
                    <th className={`${thCls} pr-4 text-right`}><button type="button" onClick={() => ordenarPor('ultima')} className="font-bold uppercase">Última saída{seta('ultima')}</button></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visiveis.map(item => {
                    const semSaida = item.lancamentos === 0 && item.estornos === 0;
                    const cobertura = item.coberturaDias;
                    return (
                      <tr key={item.material} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ${semSaida ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`} onClick={() => setAberto(item.material)}>
                        <td className="px-3 py-2 pl-4 max-w-80">
                          <span className="font-mono font-bold text-[#0056c6] dark:text-sky-400">{item.material}</span>
                          <p className="truncate" title={item.descricao ?? ''}>{item.descricao || 'Sem descrição'}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatQtd(item.saldo)} <span className="text-slate-400">{item.umb ?? ''}</span></td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{semSaida ? '—' : formatQtd(item.quantidade)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{semSaida ? '—' : formatBRL(item.valor)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{semSaida ? '—' : <>{item.lancamentos}{item.estornos > 0 && <span className="text-red-500" title="Estornos"> +{item.estornos}</span>}</>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{semSaida ? '—' : formatQtd(item.mediaMensal)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${cobertura !== null && cobertura < 15 ? 'font-bold text-red-600 dark:text-red-400' : cobertura !== null && cobertura < 30 ? 'font-bold text-amber-600 dark:text-amber-400' : ''}`}>{cobertura === null ? '—' : `${formatInt(cobertura)} d`}</td>
                        <td className="px-3 py-2 pr-4 text-right whitespace-nowrap">{item.ultimaSaida ? formatDateBR(item.ultimaSaida) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">
              <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} info={`${formatInt(linhas.length)} itens`} />
            </div>
          </>
        )}
      </Secao>

      {itemAberto && (
        <DetalheItem
          item={itemAberto}
          movimentos={filtradas.filter(s => s.material === itemAberto.material)}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}
