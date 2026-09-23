import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, ChevronDown, ChevronRight, ChevronsUpDown,
  Clock, FileText, Link2, MousePointerClick, Package, Receipt, Search, TrendingDown,
  TrendingUp, Wallet, X,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { supabase } from '../../db/supabaseClient';
import { Profile } from '../../types';
import { formatBRL, formatBRLCompacto, formatDateBR, formatMesAno, formatPct, formatQtd } from '../../lib/format';
import {
  acumularValoresPorPeriodo, agruparHistoricoPreco, AgrupamentoPreco, chaveFornecedorItem, LinhaFornecedorItem, periodoDoAgrupamento, ResumoFornecedorItem, rotuloSemanaISO, StatusPagamentoRastreado, resumirFornecedorItem,
} from '../../lib/finFornecedorItem';
import ChartCard from '../../components/charts/ChartCard';
import ChartTooltip from '../../components/charts/ChartTooltip';
import KpiCard from '../../components/charts/KpiCard';
import MultiSelectFilter from '../../components/ui/MultiSelectFilter';
import { TableBody, TableHeadRow, TableShell, TableSkeleton, Td, Th } from '../../components/ui/DataTable';

interface FinFornecedorItemAnaliseProps {
  user: Profile;
}

interface LinhaApi {
  id: number;
  fornecedor_codigo: string;
  fornecedor_nome: string | null;
  numero_nf_normalizado: string;
  item_chave: string;
  tipo_item: LinhaFornecedorItem['tipoItem'];
  descricao_item: string | null;
  data_documento: string | null;
  quantidade: number | null;
  valor_item_nf: number | null;
  valor_nf: number | null;
  valor_pago_bruto: number | null;
  valor_pago_rateado: number | null;
  valor_pago_excedente_nf: number | null;
  preco_unitario: number | null;
  status_pagamento: StatusPagamentoRastreado;
  qtd_linhas_zf0076: number | null;
}

interface Fbl1nPagamentoApi {
  id: number;
  numero_documento: string;
  referencia: string | null;
  tipo_documento: string | null;
  data_documento: string | null;
  data_pagamento: string | null;
  data_compensacao: string | null;
  doc_compensacao: string | null;
  montante_moeda_doc: number | null;
  moeda_documento: string | null;
  texto: string | null;
}

const PAGE_SIZE = 1000;

const STATUS_LABEL: Record<StatusPagamentoRastreado, string> = {
  PAGO_TOTAL: 'Pago total',
  PAGO_PARCIAL: 'Pago parcial',
  SEM_VINCULO_FBL1N: 'Sem vínculo FBL1N',
  PAGAMENTO_SUPERIOR_A_NF: 'Pago total c/ excedente',
};

function badgeStatus(status: StatusPagamentoRastreado, onClick?: () => void) {
  const classes: Record<StatusPagamentoRastreado, string> = {
    PAGO_TOTAL: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    PAGO_PARCIAL: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    SEM_VINCULO_FBL1N: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    PAGAMENTO_SUPERIOR_A_NF: 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300 border-violet-300 dark:border-violet-800',
  };
  if (!onClick || status === 'SEM_VINCULO_FBL1N') return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${classes[status]}`}>{STATUS_LABEL[status]}</span>;
  return <button type="button" onClick={event => { event.stopPropagation(); onClick(); }} className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap cursor-pointer hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-violet-400 ${classes[status]}`} title="Abrir lançamentos FBL1N">{STATUS_LABEL[status]}</button>;
}

function detalheExcedenteFbl1n(linha: LinhaApi) {
  if (linha.status_pagamento !== 'PAGAMENTO_SUPERIOR_A_NF' || Number(linha.valor_pago_excedente_nf) <= 0) return null;
  return <span className="mt-1 block text-[10px] leading-tight font-semibold text-violet-700 dark:text-violet-300" title="O pagamento bruto do FBL1N supera o total da NF; o valor rastreado da linha foi limitado ao faturado fiscal.">FBL1N {formatBRL(linha.valor_pago_bruto)} · excedente NF {formatBRL(linha.valor_pago_excedente_nf)}</span>;
}

function normalizarReferenciaFbl1n(referencia: string | null) {
  const semZeros = (referencia || '').trim().replace(/^0+/, '');
  const semSufixo = semZeros.replace(/[-/]\d+$/, '');
  return semSufixo || null;
}

export default function FinFornecedorItemAnalise({ user: _user }: FinFornecedorItemAnaliseProps) {
  const [linhas, setLinhas] = useState<LinhaApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fornecedores, setFornecedores] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [tipoItem, setTipoItem] = useState<'Todos' | LinhaFornecedorItem['tipoItem']>('Todos');
  const [status, setStatus] = useState<'Todos' | StatusPagamentoRastreado>('Todos');
  const [periodoDe, setPeriodoDe] = useState('');
  const [periodoAte, setPeriodoAte] = useState('');
  const [serieSelecionada, setSerieSelecionada] = useState('');
  const [agrupamentoPreco, setAgrupamentoPreco] = useState<AgrupamentoPreco>('mes');
  const [resumosExpandidos, setResumosExpandidos] = useState<Record<string, boolean>>({});
  const [periodoAcumuladoSelecionado, setPeriodoAcumuladoSelecionado] = useState<string | null>(null);
  const [linhaFbl1nSelecionada, setLinhaFbl1nSelecionada] = useState<LinhaApi | null>(null);
  const [lancamentosFbl1n, setLancamentosFbl1n] = useState<Fbl1nPagamentoApi[]>([]);
  const [carregandoFbl1n, setCarregandoFbl1n] = useState(false);
  const [erroFbl1n, setErroFbl1n] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows: LinhaApi[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: fetchError } = await (supabase as any)
          .from('vw_fin_faturas_fornecedor_item')
          .select('id, fornecedor_codigo, fornecedor_nome, numero_nf_normalizado, item_chave, tipo_item, descricao_item, data_documento, quantidade, valor_item_nf, valor_nf, valor_pago_bruto, valor_pago_rateado, valor_pago_excedente_nf, preco_unitario, status_pagamento, qtd_linhas_zf0076')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (fetchError) throw fetchError;
        if (!data?.length) break;
        rows.push(...data as LinhaApi[]);
        if (data.length < PAGE_SIZE) break;
      }
      setLinhas(rows);
    } catch (fetchError) {
      console.error('Erro ao carregar análise por fornecedor e item:', fetchError);
      setError('Não foi possível carregar a análise fiscal. Verifique a permissão de Financeiro e tente novamente.');
      setLinhas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const fornecedorOptions = useMemo(() => Array.from(new Set(linhas.map(l => l.fornecedor_nome || l.fornecedor_codigo))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [linhas]);
  const fornecedorCodigo = useMemo(() => new Map(linhas.map(l => [l.fornecedor_nome || l.fornecedor_codigo, l.fornecedor_codigo])), [linhas]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return linhas.filter(linha => {
      const fornecedor = linha.fornecedor_nome || linha.fornecedor_codigo;
      if (fornecedores.size && !fornecedores.has(fornecedor)) return false;
      if (tipoItem !== 'Todos' && linha.tipo_item !== tipoItem) return false;
      if (status !== 'Todos' && linha.status_pagamento !== status) return false;
      if (periodoDe && (!linha.data_documento || linha.data_documento < periodoDe)) return false;
      if (periodoAte && (!linha.data_documento || linha.data_documento > periodoAte)) return false;
      if (!termo) return true;
      return [linha.fornecedor_codigo, linha.fornecedor_nome, linha.item_chave, linha.descricao_item, linha.numero_nf_normalizado]
        .some(value => (value || '').toLocaleLowerCase('pt-BR').includes(termo));
    });
  }, [linhas, fornecedores, tipoItem, status, periodoDe, periodoAte, busca]);

  const linhasDominio = useMemo<LinhaFornecedorItem[]>(() => filtradas.map(linha => ({
    id: linha.id,
    fornecedorCodigo: linha.fornecedor_codigo,
    fornecedorNome: linha.fornecedor_nome || linha.fornecedor_codigo,
    itemChave: linha.item_chave,
    descricaoItem: linha.descricao_item || linha.item_chave,
    tipoItem: linha.tipo_item,
    dataDocumento: linha.data_documento,
    quantidade: linha.quantidade,
    valorItemNf: linha.valor_item_nf,
    valorPagoRateado: linha.valor_pago_rateado,
    precoUnitario: linha.preco_unitario,
    numeroNf: linha.numero_nf_normalizado,
    statusPagamento: linha.status_pagamento,
  })), [filtradas]);

  const resumo = useMemo(() => resumirFornecedorItem(linhasDominio).sort((a, b) => b.valorFaturado - a.valorFaturado), [linhasDominio]);
  const kpis = useMemo(() => {
    const valorFaturado = filtradas.reduce((sum, linha) => sum + Number(linha.valor_item_nf || 0), 0);
    const valorPago = filtradas.reduce((sum, linha) => sum + Number(linha.valor_pago_rateado || 0), 0);
    const totalNfs = new Set(filtradas.map(l => `${l.fornecedor_codigo}:${l.numero_nf_normalizado}`)).size;
    const nfsComEvidenciaZf = new Set(filtradas.filter(l => Number(l.qtd_linhas_zf0076) > 0).map(l => `${l.fornecedor_codigo}:${l.numero_nf_normalizado}`)).size;
    return {
      valorFaturado,
      valorPago,
      cobertura: valorFaturado > 0 ? (valorPago / valorFaturado) * 100 : 0,
      emConciliacao: Math.max(valorFaturado - valorPago, 0),
      totalNfs,
      nfsComEvidenciaZf,
      fornecedores: new Set(filtradas.map(l => l.fornecedor_codigo)).size,
    };
  }, [filtradas]);

  const resumoSelecionado = useMemo(
    () => resumo.find(item => chaveFornecedorItem(item.fornecedorCodigo, item.itemChave) === serieSelecionada) || null,
    [resumo, serieSelecionada],
  );

  const detalhesPorResumo = useMemo(() => {
    const grupos = new Map<string, LinhaApi[]>();
    filtradas.forEach(linha => {
      const chave = chaveFornecedorItem(linha.fornecedor_codigo, linha.item_chave);
      const grupo = grupos.get(chave) || [];
      grupo.push(linha);
      grupos.set(chave, grupo);
    });
    grupos.forEach(grupo => grupo.sort((a, b) => (b.data_documento || '').localeCompare(a.data_documento || '') || b.id - a.id));
    return grupos;
  }, [filtradas]);

  const todosExpandidos = resumo.length > 0 && resumo.every(item => resumosExpandidos[chaveFornecedorItem(item.fornecedorCodigo, item.itemChave)]);

  const selecionarResumo = (item: ResumoFornecedorItem) => {
    setSerieSelecionada(chaveFornecedorItem(item.fornecedorCodigo, item.itemChave));
    setPeriodoAcumuladoSelecionado(null);
  };

  const alternarResumo = (item: ResumoFornecedorItem) => {
    const chave = chaveFornecedorItem(item.fornecedorCodigo, item.itemChave);
    setResumosExpandidos(anterior => ({ ...anterior, [chave]: !anterior[chave] }));
  };

  const alternarTodosResumos = () => {
    if (todosExpandidos) {
      setResumosExpandidos({});
      return;
    }
    setResumosExpandidos(Object.fromEntries(resumo.map(item => [chaveFornecedorItem(item.fornecedorCodigo, item.itemChave), true])));
  };

  const historicoPreco = useMemo(() => {
    if (!serieSelecionada) return [];
    const [fornecedorCodigoSelecionado, itemChaveSelecionado] = serieSelecionada.split('::');
    const linhasSelecionadas = filtradas
      .filter(l => l.fornecedor_codigo === fornecedorCodigoSelecionado && l.item_chave === itemChaveSelecionado && Number(l.preco_unitario) > 0)
      .sort((a, b) => (a.data_documento || '').localeCompare(b.data_documento || '') || a.id - b.id)
      .map(l => ({ dataDocumento: l.data_documento, precoUnitario: Number(l.preco_unitario), quantidade: l.quantidade, numeroNf: l.numero_nf_normalizado }));
    return agruparHistoricoPreco(linhasSelecionadas, agrupamentoPreco).map(ponto => ({
      ...ponto,
      rotulo: agrupamentoPreco === 'dia'
        ? formatDateBR(ponto.periodo)
        : agrupamentoPreco === 'semana'
          ? rotuloSemanaISO(ponto.periodo)
          : formatMesAno(`${ponto.periodo}-01`),
      tituloTooltip: agrupamentoPreco === 'semana'
        ? `${rotuloSemanaISO(ponto.periodo)} · semana de ${formatDateBR(ponto.periodo)}`
        : agrupamentoPreco === 'mes'
          ? formatMesAno(`${ponto.periodo}-01`)
          : formatDateBR(ponto.periodo),
    }));
  }, [filtradas, serieSelecionada, agrupamentoPreco]);

  const linhasDoAcumulado = useMemo(() => {
    if (!serieSelecionada) return filtradas;
    const [fornecedorCodigoSelecionado, itemChaveSelecionado] = serieSelecionada.split('::');
    return filtradas.filter(linha => linha.fornecedor_codigo === fornecedorCodigoSelecionado && linha.item_chave === itemChaveSelecionado);
  }, [filtradas, serieSelecionada]);

  const acumuladoPorPeriodo = useMemo(() => acumularValoresPorPeriodo(
    linhasDoAcumulado.map(linha => ({ dataDocumento: linha.data_documento, valorFaturado: linha.valor_item_nf, valorPagoRastreado: linha.valor_pago_rateado })),
    agrupamentoPreco,
  ).map(ponto => ({
    ...ponto,
    rotulo: agrupamentoPreco === 'dia'
      ? formatDateBR(ponto.periodo)
      : agrupamentoPreco === 'semana'
        ? rotuloSemanaISO(ponto.periodo)
        : formatMesAno(`${ponto.periodo}-01`),
    tituloTooltip: agrupamentoPreco === 'semana'
      ? `${rotuloSemanaISO(ponto.periodo)} · semana de ${formatDateBR(ponto.periodo)}`
      : agrupamentoPreco === 'mes'
        ? formatMesAno(`${ponto.periodo}-01`)
        : formatDateBR(ponto.periodo),
  })), [linhasDoAcumulado, agrupamentoPreco]);

  const pontoAcumuladoSelecionado = useMemo(
    () => acumuladoPorPeriodo.find(ponto => ponto.periodo === periodoAcumuladoSelecionado) || null,
    [acumuladoPorPeriodo, periodoAcumuladoSelecionado],
  );

  const linhasComposicaoAcumulada = useMemo(() => {
    if (!pontoAcumuladoSelecionado) return [];
    return linhasDoAcumulado
      .filter(linha => linha.data_documento && periodoDoAgrupamento(linha.data_documento, agrupamentoPreco) === pontoAcumuladoSelecionado.periodo)
      .sort((a, b) => (b.data_documento || '').localeCompare(a.data_documento || '') || b.id - a.id);
  }, [linhasDoAcumulado, agrupamentoPreco, pontoAcumuladoSelecionado]);

  const abrirComposicaoAcumulada = (dado: any) => {
    const periodo = dado?.periodo || dado?.payload?.periodo;
    if (periodo) setPeriodoAcumuladoSelecionado(periodo);
  };

  const abrirLancamentosFbl1n = async (linha: LinhaApi) => {
    setLinhaFbl1nSelecionada(linha);
    setLancamentosFbl1n([]);
    setErroFbl1n(null);
    setCarregandoFbl1n(true);
    try {
      const { data, error: fetchError } = await (supabase as any)
        .from('vw_fin_fbl1n_deduplicado')
        .select('id, numero_documento, referencia, tipo_documento, data_documento, data_pagamento, data_compensacao, doc_compensacao, montante_moeda_doc, moeda_documento, texto')
        .eq('fornecedor', linha.fornecedor_codigo)
        .lt('montante_moeda_doc', 0)
        .not('data_pagamento', 'is', null)
        .ilike('referencia', `%${linha.numero_nf_normalizado}%`);
      if (fetchError) throw fetchError;
      setLancamentosFbl1n(((data || []) as Fbl1nPagamentoApi[])
        .filter(registro => normalizarReferenciaFbl1n(registro.referencia) === linha.numero_nf_normalizado)
        .sort((a, b) => (b.data_pagamento || '').localeCompare(a.data_pagamento || '') || b.id - a.id));
    } catch (fetchError) {
      console.error('Erro ao carregar lancamentos FBL1N:', fetchError);
      setErroFbl1n('Nao foi possivel carregar os lancamentos FBL1N desta nota.');
    } finally {
      setCarregandoFbl1n(false);
    }
  };

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80"><TrendingUp className="h-6 w-6 text-indigo-600 dark:text-indigo-400" /></span>
            Análise por Fornecedor e Item
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            Notas fiscais de fornecedor (ZL0136), pagamento rastreado no FBL1N e evidência complementar da ZF0076.
          </p>
        </div>
        <button onClick={loadData} className="text-xs font-bold px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">Atualizar dados</button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible">
        <MultiSelectFilter label="Fornecedor" icon={Building2} allLabel="Todos" searchable options={fornecedorOptions} selected={fornecedores} onChange={setFornecedores}
          renderOption={(nome) => `${nome} (${fornecedorCodigo.get(nome) || ''})`} className="shrink-0 w-64 lg:w-auto lg:min-w-[250px]" panelClassName="w-96 max-h-80" />
        <div className="relative shrink-0 w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={busca} onChange={event => setBusca(event.target.value)} placeholder="NF, material, serviço ou fornecedor" className="pl-9 pr-8 py-2 border rounded-lg text-xs h-9 w-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
          {busca && <button onClick={() => setBusca('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <select value={tipoItem} onChange={event => setTipoItem(event.target.value as typeof tipoItem)} className="px-3 py-2 border rounded-lg text-xs h-9 shrink-0 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <option value="Todos">Todos os itens</option><option value="MATERIAL">Materiais</option><option value="SERVICO">Serviços</option><option value="SEM_ITEM">Sem item identificado</option>
        </select>
        <select value={status} onChange={event => setStatus(event.target.value as typeof status)} className="px-3 py-2 border rounded-lg text-xs h-9 shrink-0 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <option value="Todos">Todos os pagamentos</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1 text-xs h-9 shrink-0 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
          <input type="date" value={periodoDe} onChange={event => setPeriodoDe(event.target.value)} className="bg-transparent outline-none" aria-label="Data inicial" />
          <span className="text-slate-400">até</span>
          <input type="date" value={periodoAte} onChange={event => setPeriodoAte(event.target.value)} className="bg-transparent outline-none" aria-label="Data final" />
        </div>
      </div>

      {error && <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 border border-rose-200 dark:border-rose-900/60"><AlertTriangle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <KpiCard label="Faturado fiscal" value={kpis.valorFaturado} format={formatBRL} icon={Receipt} accent="#0284c7" />
        <KpiCard label="Pago rastreado" value={kpis.valorPago} format={formatBRL} detail={`${formatPct(kpis.cobertura)} do faturado`} icon={Wallet} accent="#10b981" emphasize />
        <KpiCard label="A conciliar" value={kpis.emConciliacao} format={formatBRL} icon={Clock} accent="#f59e0b" />
        <KpiCard label="Fornecedores" value={kpis.fornecedores} format={v => `${Math.round(v)}`} icon={Building2} accent="#6366f1" />
        <KpiCard label="NFs com ZF0076" value={kpis.nfsComEvidenciaZf} format={v => `${Math.round(v)} de ${kpis.totalNfs}`} icon={Link2} accent="#8b5cf6" />
      </div>

      <ChartCard
        title="Evolução do preço unitário"
        description={resumoSelecionado ? `${resumoSelecionado.fornecedorNome} · ${resumoSelecionado.descricaoItem}. Preço ponderado pela quantidade no período.` : 'Selecione uma linha no resumo para analisar seu histórico de preço.'}
        icon={TrendingUp}
        height={440}
        loading={loading}
        empty={!historicoPreco.length}
        emptyMessage="Selecione um fornecedor e item no resumo abaixo para exibir a evolução."
        actions={<div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5" role="group" aria-label="Agrupamento da evolução de preço">{(['dia', 'semana', 'mes'] as AgrupamentoPreco[]).map(opcao => <button key={opcao} onClick={() => setAgrupamentoPreco(opcao)} className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${agrupamentoPreco === opcao ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{opcao === 'dia' ? 'Dia' : opcao === 'semana' ? 'Semana' : 'Mês'}</button>)}</div>}
      >
        <div className="h-[440px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historicoPreco} margin={{ top: 38, right: 32, bottom: 12, left: 18 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tickFormatter={formatBRLCompacto} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={76} />
              <Tooltip content={({ active, payload }) => active && payload?.[0] ? <ChartTooltip title={String(payload[0].payload.tituloTooltip)} rows={[{ color: '#6366f1', label: 'Preço unitário', value: formatBRL(payload[0].payload.precoUnitario) }, { color: '#64748b', label: 'Quantidade', value: formatQtd(payload[0].payload.quantidade) }, { color: '#64748b', label: 'NFs', value: String(payload[0].payload.qtdNfs) }]} /> : null} />
              <Line type="monotone" dataKey="precoUnitario" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--surface-card)', strokeWidth: 2.5 }} activeDot={{ r: 6 }}>
                <LabelList dataKey="precoUnitario" position="top" formatter={(valor: number) => formatBRL(valor)} style={{ fontSize: 11, fontWeight: 700, fill: '#4f46e5' }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Valor por período"
        description={resumoSelecionado
          ? `${resumoSelecionado.fornecedorNome} · ${resumoSelecionado.descricaoItem}. Clique em uma barra para abrir as notas que compõem o período.`
          : 'Faturado fiscal e pago rastreado em cada período conforme os filtros ativos. Clique em uma barra para abrir as notas que a compõem.'}
        icon={Wallet}
        height={380}
        loading={loading}
        empty={!acumuladoPorPeriodo.length}
      >
        <div className="h-[380px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={acumuladoPorPeriodo} margin={{ top: 30, right: 32, bottom: 38, left: 18 }} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tickFormatter={formatBRLCompacto} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={76} />
              <Tooltip content={({ active, payload }) => active && payload?.[0] ? <ChartTooltip title={String(payload[0].payload.tituloTooltip)} rows={[{ color: '#0284c7', label: 'Faturado no período', value: formatBRL(payload[0].payload.valorFaturado) }, { color: '#10b981', label: 'Pago no período', value: formatBRL(payload[0].payload.valorPagoRastreado) }]} /> : null} />
              <Legend verticalAlign="bottom" height={28} iconType="circle" formatter={(valor) => <span className="text-xs text-slate-600 dark:text-slate-300">{valor}</span>} />
              <Bar name="Faturado no período" dataKey="valorFaturado" fill="#0284c7" radius={[5, 5, 0, 0]} maxBarSize={52} cursor="pointer" onClick={abrirComposicaoAcumulada}>
                {agrupamentoPreco !== 'dia' && <LabelList dataKey="valorFaturado" position="top" formatter={(valor: number) => formatBRLCompacto(valor)} style={{ fontSize: 10, fontWeight: 700, fill: '#0284c7' }} />}
              </Bar>
              <Bar name="Pago no período" dataKey="valorPagoRastreado" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={52} cursor="pointer" onClick={abrirComposicaoAcumulada}>
                {agrupamentoPreco !== 'dia' && <LabelList dataKey="valorPagoRastreado" position="top" formatter={(valor: number) => formatBRLCompacto(valor)} style={{ fontSize: 10, fontWeight: 700, fill: '#059669' }} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Resumo por fornecedor e item"
        description="Clique em uma linha para levar o item ao gráfico. Expanda para ver as notas fiscais que formam o total."
        icon={Package}
        loading={loading}
        empty={!resumo.length}
        height={280}
        actions={
          <button onClick={alternarTodosResumos} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:translate-y-px transition cursor-pointer whitespace-nowrap">
            <ChevronsUpDown className="h-3.5 w-3.5" />
            {todosExpandidos ? 'Recolher notas' : 'Expandir notas'}
          </button>
        }
        footer={<p className="text-[11px] text-slate-500">Método: pagamento conciliado por fornecedor + referência da NF no FBL1N; pagamento parcial é rateado pelo valor da linha. Pagamentos acima da NF ficam sinalizados, sem inflar o item.</p>}
      >
        {resumoSelecionado && (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-indigo-200/80 dark:border-indigo-900/70 bg-indigo-50/60 dark:bg-indigo-950/25 text-xs">
            <div className="min-w-0 flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
              <MousePointerClick className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate"><strong>Item selecionado:</strong> {resumoSelecionado.fornecedorNome} · {resumoSelecionado.descricaoItem}</span>
            </div>
            <button onClick={() => { setSerieSelecionada(''); setPeriodoAcumuladoSelecionado(null); }} className="shrink-0 p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer" title="Limpar seleção"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <TableShell maxHeight="68vh">
          <table className="w-full text-xs border-collapse">
            <TableHeadRow>
              <Th width="w-12" />
              <Th label="Fornecedor / Item" width="min-w-[320px]" />
              <Th label="NFs" align="center" width="w-16" />
              <Th label="Qtd." align="right" width="w-24" />
              <Th label="Faturado" align="right" width="w-32" />
              <Th label="Pago rastreado" align="right" width="w-36" />
              <Th label="Último preço" align="right" width="w-28" />
              <Th label="Variação" align="right" width="w-24" />
              <Th label="Situação" align="center" width="w-44" />
            </TableHeadRow>
            <TableBody>
              {loading ? <TableSkeleton columns={9} rows={12} /> : resumo.map((item: ResumoFornecedorItem) => {
                const chave = chaveFornecedorItem(item.fornecedorCodigo, item.itemChave);
                const expandido = Boolean(resumosExpandidos[chave]);
                const selecionado = serieSelecionada === chave;
                const detalhes = detalhesPorResumo.get(chave) || [];
                return (
                  <React.Fragment key={chave}>
                    <tr onClick={() => selecionarResumo(item)} className={`cursor-pointer border-b transition-colors ${selecionado ? 'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/70' : 'border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                      <td className="px-2 py-2 text-center">
                        <button onClick={event => { event.stopPropagation(); alternarResumo(item); }} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer" aria-label={`${expandido ? 'Recolher' : 'Expandir'} notas de ${item.descricaoItem}`} aria-expanded={expandido}>
                          {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <Td>
                        <div className="font-bold text-slate-900 dark:text-slate-100">{item.fornecedorNome}</div>
                        <div className="text-slate-500 mt-0.5 truncate max-w-[340px]" title={item.descricaoItem}>{item.descricaoItem}</div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">{item.itemChave} · última compra {formatDateBR(item.dataUltimaCompra)}</div>
                      </Td>
                      <td className="px-3 py-2 text-center tabular">{item.qtdNfs}</td>
                      <Td align="right" numeric>{formatQtd(item.quantidade)}</Td>
                      <Td align="right" numeric strong>{formatBRL(item.valorFaturado)}</Td>
                      <Td align="right" numeric strong className="text-emerald-600 dark:text-emerald-400">{formatBRL(item.valorPagoRastreado)}</Td>
                      <Td align="right" numeric mono>{formatBRL(item.precoUnitarioAtual)}</Td>
                      <Td align="right">{item.variacaoPrecoPct === null ? <span className="text-slate-400">—</span> : <span className={`inline-flex items-center gap-1 font-bold ${item.variacaoPrecoPct > 0 ? 'text-rose-600' : item.variacaoPrecoPct < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{item.variacaoPrecoPct > 0 ? <TrendingUp className="h-3 w-3" /> : item.variacaoPrecoPct < 0 ? <TrendingDown className="h-3 w-3" /> : null}{formatPct(item.variacaoPrecoPct)}</span>}</Td>
                      <td className="px-3 py-2 text-center">{badgeStatus(item.statusPagamento)}</td>
                    </tr>
                    {expandido && (
                      <tr>
                        <td colSpan={9} className="p-0 bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                          <div className="px-5 py-4 sm:px-8">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5"><FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />Notas fiscais de {item.descricaoItem}</div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                              <table className="w-full min-w-[830px] text-xs border-collapse">
                                <thead><tr className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 text-[10px] uppercase tracking-wide"><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">NF</th><th className="px-3 py-2 text-right">Quantidade</th><th className="px-3 py-2 text-right">Preço unit.</th><th className="px-3 py-2 text-right">Faturado</th><th className="px-3 py-2 text-right">Pago rastreado</th><th className="px-3 py-2 text-center">Pagamento</th><th className="px-3 py-2 text-center">Evidência</th></tr></thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{detalhes.map(linha => <tr key={linha.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-3 py-2 tabular">{formatDateBR(linha.data_documento)}</td><td className="px-3 py-2 font-mono font-bold">{linha.numero_nf_normalizado}</td><td className="px-3 py-2 text-right font-mono">{formatQtd(linha.quantidade)}</td><td className="px-3 py-2 text-right font-mono">{formatBRL(linha.preco_unitario)}</td><td className="px-3 py-2 text-right font-mono font-bold">{formatBRL(linha.valor_item_nf)}</td><td className="px-3 py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatBRL(linha.valor_pago_rateado)}</td><td className="px-3 py-2 text-center"><div>{badgeStatus(linha.status_pagamento, () => abrirLancamentosFbl1n(linha))}</div>{detalheExcedenteFbl1n(linha)}</td><td className="px-3 py-2 text-center">{Number(linha.qtd_linhas_zf0076) > 0 ? <span className="text-[10px] font-bold text-violet-700 dark:text-violet-300">ZF0076</span> : <span className="text-slate-400">—</span>}</td></tr>)}</tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </table>
        </TableShell>
      </ChartCard>

      {pontoAcumuladoSelecionado && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="composicao-acumulado-titulo">
          <button type="button" onClick={() => setPeriodoAcumuladoSelecionado(null)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px] cursor-default" aria-label="Fechar detalhamento do valor acumulado" />
          <section className="relative z-10 flex w-full max-w-6xl max-h-[92vh] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Composicao do valor no periodo</p>
                <h3 id="composicao-acumulado-titulo" className="mt-1 text-lg font-extrabold text-slate-900 dark:text-slate-50">
                  No periodo {pontoAcumuladoSelecionado.tituloTooltip}
                </h3>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                  {resumoSelecionado ? `${resumoSelecionado.fornecedorNome} · ${resumoSelecionado.descricaoItem}` : 'Todos os filtros ativos'} · {linhasComposicaoAcumulada.length} linhas e {new Set(linhasComposicaoAcumulada.map(linha => `${linha.fornecedor_codigo}:${linha.numero_nf_normalizado}`)).size} NFs
                </p>
              </div>
              <button type="button" onClick={() => setPeriodoAcumuladoSelecionado(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </header>

            <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/30 sm:grid-cols-3 sm:px-6">
              <div className="rounded-lg border border-sky-100 bg-white px-3 py-2 dark:border-sky-900/60 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Faturado no periodo</p><p className="mt-1 text-base font-extrabold tabular-nums text-sky-700 dark:text-sky-400">{formatBRL(pontoAcumuladoSelecionado.valorFaturado)}</p></div>
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 dark:border-emerald-900/60 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pago no periodo</p><p className="mt-1 text-base font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">{formatBRL(pontoAcumuladoSelecionado.valorPagoRastreado)}</p></div>
              <div className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Notas no periodo</p><p className="mt-1 text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{new Set(linhasComposicaoAcumulada.map(linha => `${linha.fornecedor_codigo}:${linha.numero_nf_normalizado}`)).size} NFs</p><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{linhasComposicaoAcumulada.length} linhas fiscais</p></div>
            </div>

            <div className="min-h-0 overflow-auto px-5 py-4 sm:px-6">
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[980px] border-collapse text-xs">
                  <thead><tr className="sticky top-0 bg-slate-100/95 text-left text-[10px] uppercase tracking-wide text-slate-600 backdrop-blur dark:bg-slate-800/95 dark:text-slate-300"><th className="px-3 py-2">Data</th><th className="px-3 py-2">Fornecedor</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">NF</th><th className="px-3 py-2 text-right">Quantidade</th><th className="px-3 py-2 text-right">Faturado</th><th className="px-3 py-2 text-right">Pago rastreado</th><th className="px-3 py-2 text-center">Pagamento</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{linhasComposicaoAcumulada.map(linha => <tr key={linha.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDateBR(linha.data_documento)}</td><td className="px-3 py-2 font-semibold">{linha.fornecedor_nome || linha.fornecedor_codigo}</td><td className="max-w-[260px] truncate px-3 py-2" title={linha.descricao_item || linha.item_chave}>{linha.descricao_item || linha.item_chave}</td><td className="px-3 py-2 font-mono font-bold">{linha.numero_nf_normalizado}</td><td className="px-3 py-2 text-right font-mono">{formatQtd(linha.quantidade)}</td><td className="px-3 py-2 text-right font-mono font-bold">{formatBRL(linha.valor_item_nf)}</td><td className="px-3 py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatBRL(linha.valor_pago_rateado)}</td><td className="px-3 py-2 text-center"><div>{badgeStatus(linha.status_pagamento, () => abrirLancamentosFbl1n(linha))}</div>{detalheExcedenteFbl1n(linha)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {linhaFbl1nSelecionada && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="detalhe-fbl1n-titulo">
          <button type="button" onClick={() => setLinhaFbl1nSelecionada(null)} className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px] cursor-default" aria-label="Fechar lancamentos FBL1N" />
          <section className="relative z-10 flex w-full max-w-6xl max-h-[92vh] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">Lancamentos FBL1N</p>
                <h3 id="detalhe-fbl1n-titulo" className="mt-1 text-lg font-extrabold text-slate-900 dark:text-slate-50">NF {linhaFbl1nSelecionada.numero_nf_normalizado} · {linhaFbl1nSelecionada.fornecedor_nome || linhaFbl1nSelecionada.fornecedor_codigo}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Referencia SAP normalizada para a NF e fornecedor selecionados.</p>
              </div>
              <button type="button" onClick={() => setLinhaFbl1nSelecionada(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </header>

            <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/30 sm:grid-cols-3 sm:px-6">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total da NF</p><p className="mt-1 text-base font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{formatBRL(linhaFbl1nSelecionada.valor_nf)}</p></div>
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 dark:border-emerald-900/60 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pago bruto FBL1N</p><p className="mt-1 text-base font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">{formatBRL(linhaFbl1nSelecionada.valor_pago_bruto)}</p></div>
              <div className="rounded-lg border border-violet-100 bg-white px-3 py-2 dark:border-violet-900/60 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Excedente FBL1N</p><p className="mt-1 text-base font-extrabold tabular-nums text-violet-700 dark:text-violet-400">{formatBRL(linhaFbl1nSelecionada.valor_pago_excedente_nf)}</p></div>
            </div>

            <div className="min-h-0 overflow-auto px-5 py-4 sm:px-6">
              {carregandoFbl1n ? <div className="py-12 text-center text-sm font-semibold text-slate-500">Carregando lancamentos FBL1N...</div> : erroFbl1n ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{erroFbl1n}</div> : !lancamentosFbl1n.length ? <div className="py-12 text-center text-sm font-semibold text-slate-500">Nenhum lancamento FBL1N foi encontrado para a referencia normalizada desta NF.</div> : <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[1040px] border-collapse text-xs"><thead><tr className="sticky top-0 bg-slate-100/95 text-left text-[10px] uppercase tracking-wide text-slate-600 backdrop-blur dark:bg-slate-800/95 dark:text-slate-300"><th className="px-3 py-2">Referencia</th><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Data documento</th><th className="px-3 py-2">Pagamento</th><th className="px-3 py-2">Compensacao</th><th className="px-3 py-2">Doc. compensacao</th><th className="px-3 py-2 text-right">Valor bruto</th><th className="px-3 py-2">Texto</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{lancamentosFbl1n.map(registro => <tr key={registro.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-3 py-2 font-mono font-bold">{registro.referencia || '—'}</td><td className="px-3 py-2 font-mono">{registro.numero_documento}</td><td className="px-3 py-2">{registro.tipo_documento || '—'}</td><td className="px-3 py-2 tabular-nums">{formatDateBR(registro.data_documento)}</td><td className="px-3 py-2 tabular-nums">{formatDateBR(registro.data_pagamento)}</td><td className="px-3 py-2 tabular-nums">{formatDateBR(registro.data_compensacao)}</td><td className="px-3 py-2 font-mono">{registro.doc_compensacao || '—'}</td><td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatBRL(Math.abs(Number(registro.montante_moeda_doc || 0)))}</td><td className="max-w-[290px] truncate px-3 py-2" title={registro.texto || ''}>{registro.texto || '—'}</td></tr>)}</tbody></table></div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
