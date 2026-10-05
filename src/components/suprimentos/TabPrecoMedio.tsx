/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Preço Médio — o que um item custa, em média, por unidade.
 *
 * Lê o preço unitário de duas fontes, à escolha de quem analisa:
 *  - Pedidos (PO): o que foi efetivamente pago, em BRL, de `vw_historico_pedidos`;
 *  - Cotações: o que os fornecedores ofereceram, de `sup_cotacao_proposta_itens`
 *    (preço de etiqueta da proposta, antes de impostos e frete).
 *
 * As duas fontes não se misturam numa média só — preço cotado e preço pago
 * respondem perguntas diferentes (o que esperar pagar × o que se pagou) — por
 * isso a tela troca de fonte em vez de somá-las.
 *
 * Mesmo padrão de filtros próprios de `TabRecorrenciaCompras`: a base não é a
 * `EnrichedSAPRecord` do shell, então a aba não usa o filtro global.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  RefreshCw,
  Boxes,
  Tags,
  TrendingUp,
  TrendingDown,
  Building2,
  LineChart as LineChartIcon,
  Users,
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { HistoricoPedidoView } from '../../types';
import {
  buscarItensCotacaoParaPreco,
  listarMateriaisGenericos,
} from '../../lib/cotacoesHistoricoApi';
import { extrairPalavrasChave, casarTokens } from '../../lib/buscaKeywords';
import { periodoChave } from '../../lib/historicoAnalytics';
import {
  amostrasDeCotacoes,
  amostrasDePedidos,
  calcPrecoMedio,
  mediaPonderada,
  mediana,
  serieTemporalPreco,
  type AmostraPreco,
  type ChavePreco,
  type FontePreco,
  type ItemCotacaoPreco,
  type PrecoItem,
} from '../../lib/precoMedio';
import { formatBRL, formatDateBR, formatInt, formatQtd } from '../../lib/format';
import KpiCard from '../charts/KpiCard';
import ComposicaoModal, { ComposicaoColuna, ComposicaoModalConfig } from '../charts/ComposicaoModal';
import SearchKeywordsChips from '../ui/SearchKeywordsChips';
import SeriePrecoChart from '../historico/SeriePrecoChart';
import { TableCards, TableCardRow, TableDesktop } from '../ui/DataTable';

/** Variação do último preço contra a média anterior a partir da qual o item ganha destaque. */
const LIMIAR_VARIACAO_PCT = 10;

/** Linhas da tabela por vez — sem corte, "todas as compras" monta milhares de linhas. */
const PAGINA_TABELA = 100;

interface Filtros {
  de: string;
  ate: string;
  fornecedor: string;
  grupo: string;
  minAmostras: number;
  ocultarGenericos: boolean;
}

/** Início da análise: o histórico anterior a 2026 não entra, nem nos preços nem nos KPIs. */
const INICIO_ANALISE = '2026-01-01';

const FILTROS_VAZIOS: Filtros = {
  de: INICIO_ANALISE,
  ate: '',
  fornecedor: 'todos',
  grupo: 'todos',
  minAmostras: 2,
  ocultarGenericos: true,
};

type Ordenacao = 'amostras' | 'preco' | 'variacao' | 'amplitude';

const selectClass =
  'rounded-lg border py-1.5 px-3 text-xs cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-card)] text-[var(--ink-secondary)] focus:outline-[var(--brand)]';

const botaoAcao =
  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2';

/** 'AAAA-MM' → 'MM/AAAA'; semana ('AAAA-Wnn') segue como está. */
function rotuloPeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  return m ? `${m[2]}/${m[1]}` : periodo;
}

function rotuloItem(item: PrecoItem): string {
  return item.descricao || item.material || item.chave;
}

function corVariacao(pct: number | null): string {
  if (pct === null) return 'var(--ink-muted)';
  if (pct >= LIMIAR_VARIACAO_PCT) return 'var(--status-critical)';
  if (pct <= -LIMIAR_VARIACAO_PCT) return 'var(--status-good)';
  return 'var(--ink-secondary)';
}

function formatVariacao(pct: number | null): string {
  if (pct === null) return '—';
  const sinal = pct > 0 ? '+' : '';
  return `${sinal}${pct.toFixed(1).replace('.', ',')}%`;
}

function Segmentado<T extends string | boolean>({
  valor,
  opcoes,
  onChange,
  rotulo,
}: {
  valor: T;
  opcoes: { v: T; r: string }[];
  onChange: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="group" aria-label={rotulo}>
      {opcoes.map(o => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          aria-pressed={valor === o.v}
          className="px-3 py-1.5 text-xs font-bold rounded-md transition-colors duration-150"
          style={valor === o.v ? { background: 'var(--brand)', color: '#ffffff' } : { color: 'var(--ink-muted)' }}
        >
          {o.r}
        </button>
      ))}
    </div>
  );
}

export default function TabPrecoMedio() {
  const [fonte, setFonte] = useState<FontePreco>('pedidos');
  const [pedidos, setPedidos] = useState<HistoricoPedidoView[]>([]);
  const [cotacoes, setCotacoes] = useState<ItemCotacaoPreco[] | null>(null);
  const [genericos, setGenericos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [chave, setChave] = useState<ChavePreco>('material');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('amostras');
  const [granularidade, setGranularidade] = useState<'semana' | 'mes'>('mes');
  const [selecionadoChave, setSelecionadoChave] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAGINA_TABELA);

  const [termos, setTermos] = useState<string[]>([]);
  const [composicao, setComposicao] = useState<ComposicaoModalConfig<AmostraPreco> | null>(null);

  const patch = (p: Partial<Filtros>) => {
    setFiltros(f => ({ ...f, ...p }));
    setLimite(PAGINA_TABELA);
  };

  const alterarTermos = (novos: string[]) => {
    setTermos(novos);
    setSelecionadoChave(null);
    setLimite(PAGINA_TABELA);
  };

  /* Dados --------------------------------------------------------------- */

  const carregarPedidos = useCallback(async (force = false) => {
    try {
      setPedidos(await localDb.fetchHistoricoPedidos(force));
    } catch (err) {
      console.error('Falha ao carregar histórico de compras:', err);
      setPedidos(localDb.getHistoricoPedidos());
    }
  }, []);

  const carregarCotacoes = useCallback(async () => {
    try {
      setCotacoes(await buscarItensCotacaoParaPreco());
      setErro(null);
    } catch (err) {
      console.error('Falha ao carregar cotações:', err);
      setErro(err instanceof Error ? err.message : 'Falha ao carregar as cotações.');
      setCotacoes([]);
    }
  }, []);

  const carregarGenericos = useCallback(async () => {
    try {
      setGenericos(new Set((await listarMateriaisGenericos()).map(g => g.material_code)));
    } catch {
      // A marcação é informativa: sem ela a análise continua valendo.
      setGenericos(new Set());
    }
  }, []);

  useEffect(() => {
    setPedidos(localDb.getHistoricoPedidos());
    Promise.all([carregarPedidos(), carregarGenericos()]).finally(() => setCarregando(false));
  }, [carregarPedidos, carregarGenericos]);

  // Cotações só vêm do servidor quando alguém abre a fonte — são milhares de
  // linhas que a leitura de pedidos nunca precisa.
  useEffect(() => {
    if (fonte === 'cotacoes' && cotacoes === null) {
      setCarregando(true);
      carregarCotacoes().finally(() => setCarregando(false));
    }
  }, [fonte, cotacoes, carregarCotacoes]);

  const atualizar = async () => {
    setSincronizando(true);
    try {
      await Promise.all([
        fonte === 'pedidos' ? carregarPedidos(true) : carregarCotacoes(),
        carregarGenericos(),
      ]);
    } finally {
      setSincronizando(false);
    }
  };

  const trocarFonte = (nova: FontePreco) => {
    setFonte(nova);
    setSelecionadoChave(null);
    setLimite(PAGINA_TABELA);
    // Grupo de mercadoria só existe no pedido; o filtro não pode ficar preso.
    if (nova === 'cotacoes') setFiltros(f => ({ ...f, grupo: 'todos', fornecedor: 'todos' }));
    else setFiltros(f => ({ ...f, fornecedor: 'todos' }));
  };

  /* Amostras ------------------------------------------------------------ */

  const amostras = useMemo<AmostraPreco[]>(
    () => (fonte === 'pedidos' ? amostrasDePedidos(pedidos) : amostrasDeCotacoes(cotacoes ?? [])),
    [fonte, pedidos, cotacoes]
  );

  const opcoes = useMemo(() => {
    const fornecedores = new Set<string>();
    const grupos = new Set<string>();
    for (const a of amostras) {
      fornecedores.add(a.fornecedor);
      if (fonte === 'pedidos') grupos.add(a.grupo);
    }
    const ordenar = (s: Set<string>) => Array.from(s).sort((x, y) => x.localeCompare(y, 'pt-BR'));
    return { fornecedores: ordenar(fornecedores), grupos: ordenar(grupos) };
  }, [amostras, fonte]);

  // Cada etiqueta (Enter) vira palavras-chave; todas precisam casar (AND).
  const palavras = useMemo(() => termos.flatMap(extrairPalavrasChave), [termos]);

  const filtradas = useMemo(() => {
    return amostras.filter(a => {
      if (filtros.de && a.data < filtros.de) return false;
      if (filtros.ate && a.data > filtros.ate) return false;
      if (filtros.fornecedor !== 'todos' && a.fornecedor !== filtros.fornecedor) return false;
      if (filtros.grupo !== 'todos' && a.grupo !== filtros.grupo) return false;
      if (filtros.ocultarGenericos && a.material && genericos.has(a.material)) return false;
      return casarTokens([a.material, a.descricao], palavras);
    });
  }, [amostras, filtros, genericos, palavras]);

  /* Cálculo ------------------------------------------------------------- */

  const itens = useMemo(
    () => calcPrecoMedio(filtradas, chave, filtros.minAmostras),
    [filtradas, chave, filtros.minAmostras]
  );

  const itensOrdenados = useMemo(() => {
    const copia = [...itens];
    switch (ordenacao) {
      case 'preco':
        return copia.sort((a, b) => b.precoMedio - a.precoMedio);
      case 'variacao':
        return copia.sort((a, b) => (b.variacaoUltimoPct ?? -Infinity) - (a.variacaoUltimoPct ?? -Infinity));
      case 'amplitude':
        return copia.sort((a, b) => b.amplitudePct - a.amplitudePct);
      case 'amostras':
      default:
        return copia; // calcPrecoMedio já entrega por nº de observações
    }
  }, [itens, ordenacao]);

  // Itens distintos que a busca encontrou, sem o corte de "mínimo de preços" —
  // é ele que diz se a média do gráfico mistura produtos diferentes.
  const qtdItensBusca = useMemo(() => {
    if (palavras.length === 0) return 0;
    const chaves = new Set<string>();
    for (const a of filtradas) chaves.add(chave === 'material' ? a.chaveMaterial : a.chaveSimilar);
    return chaves.size;
  }, [filtradas, chave, palavras]);

  // Item escolhido na tabela; uma busca que acha um item só já o seleciona.
  const selecionado = useMemo(() => {
    if (selecionadoChave) return itens.find(i => i.chave === selecionadoChave) ?? null;
    if (palavras.length > 0 && itens.length === 1 && qtdItensBusca === 1) return itens[0];
    return null;
  }, [itens, selecionadoChave, palavras, qtdItensBusca]);

  // O gráfico lê o item escolhido, ou tudo o que a busca encontrou. Sem busca
  // nem item, não há o que desenhar: a média de itens sem relação não diz nada.
  const amostrasGrafico = useMemo<AmostraPreco[]>(
    () => (selecionado ? selecionado.amostras : palavras.length > 0 ? filtradas : []),
    [selecionado, palavras, filtradas]
  );
  const mostrarGrafico = amostrasGrafico.length > 0;

  const serie = useMemo(() => serieTemporalPreco(amostrasGrafico, granularidade), [amostrasGrafico, granularidade]);

  const resumoGrafico = useMemo(() => {
    if (amostrasGrafico.length === 0) return null;
    const comDado = serie.filter(p => p.precoMedio !== null);
    const menor = comDado.reduce<typeof comDado[number] | null>((m, p) => (m === null || p.precoMedio! < m.precoMedio! ? p : m), null);
    const maior = comDado.reduce<typeof comDado[number] | null>((m, p) => (m === null || p.precoMedio! > m.precoMedio! ? p : m), null);
    const primeiro = comDado[0]?.precoMedio ?? null;
    const ultimo = comDado[comDado.length - 1]?.precoMedio ?? null;
    const precos = amostrasGrafico.map(a => a.preco);
    const menorPreco = Math.min(...precos);
    const maiorPreco = Math.max(...precos);
    return {
      media: mediaPonderada(amostrasGrafico),
      menor,
      maior,
      variacaoPct: comDado.length > 1 && primeiro && ultimo ? (ultimo / primeiro - 1) * 100 : null,
      menorPreco,
      maiorPreco,
      flutuacaoPct: menorPreco > 0 ? ((maiorPreco - menorPreco) / menorPreco) * 100 : null,
    };
  }, [amostrasGrafico, serie]);

  const kpis = useMemo(() => {
    const fornecedores = new Set<string>();
    let observacoes = 0;
    let subiram = 0;
    let cairam = 0;
    for (const i of itens) {
      observacoes += i.n;
      for (const f of i.fornecedores) fornecedores.add(f.fornecedor);
      if (i.variacaoUltimoPct !== null) {
        if (i.variacaoUltimoPct >= LIMIAR_VARIACAO_PCT) subiram++;
        else if (i.variacaoUltimoPct <= -LIMIAR_VARIACAO_PCT) cairam++;
      }
    }
    return { itens: itens.length, observacoes, subiram, cairam, fornecedores: fornecedores.size };
  }, [itens]);

  /* Detalhe do período clicado no gráfico ------------------------------ */

  const abrirPeriodo = useCallback(
    (periodo: string) => {
      const doPeriodo = amostrasGrafico
        .filter(a => periodoChave(a.data, granularidade) === periodo)
        .sort((a, b) => b.data.localeCompare(a.data));
      if (doPeriodo.length === 0) return; // mês-lacuna: não há o que listar

      const documento = fonte === 'pedidos' ? 'Pedido' : 'Proposta';
      const colunas: ComposicaoColuna<AmostraPreco>[] = [
        { header: 'Data', render: a => formatDateBR(a.data) },
        { header: documento, render: a => a.documento || '—' },
        {
          header: 'Item',
          render: a => (
            <div className="min-w-[180px]">
              {a.material && <div className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>{a.material}</div>}
              <div>{a.descricao || '—'}</div>
            </div>
          ),
        },
        { header: 'Qtd.', align: 'right', render: a => formatQtd(a.qtd) },
        { header: 'Preço unit.', align: 'right', render: a => formatBRL(a.preco) },
      ];

      const precos = doPeriodo.map(a => a.preco);
      setComposicao({
        title: `Preços em ${rotuloPeriodo(periodo)}`,
        badge: selecionado ? rotuloItem(selecionado) : termos.join(' + '),
        subtitle: [
          `${formatInt(doPeriodo.length)} observação(ões)`,
          `média ${formatBRL(mediaPonderada(doPeriodo))}`,
          `mediana ${formatBRL(mediana(precos))}`,
          `de ${formatBRL(Math.min(...precos))} a ${formatBRL(Math.max(...precos))}`,
        ].join(' · '),
        items: doPeriodo,
        groupBy: a => a.fornecedor,
        groupLabelHeader: 'Fornecedor',
        valueOf: a => a.preco * a.qtd,
        formatValue: formatBRL,
        valueHeader: 'Valor total',
        unidadeItem: fonte === 'pedidos' ? 'pedido(s)' : 'proposta(s)',
        detailColumns: colunas,
        searchPredicate: (a, q) =>
          a.material.toLowerCase().includes(q) ||
          a.descricao.toLowerCase().includes(q) ||
          a.fornecedor.toLowerCase().includes(q) ||
          a.documento.toLowerCase().includes(q),
        searchPlaceholder: 'Pesquisar por item, fornecedor ou documento...',
        itemKey: (a, idx) => `${a.documento}-${a.data}-${idx}`,
      });
    },
    [amostrasGrafico, granularidade, fonte, selecionado, termos]
  );

  /* Exportação ---------------------------------------------------------- */

  const exportar = useCallback(() => {
    const dados = itensOrdenados.map(i => ({
      Material: i.material,
      Descrição: i.descricao,
      ...(fonte === 'pedidos' ? { Grupo: i.grupo } : { Unidade: i.unidade }),
      Observações: i.n,
      'Quantidade Total': i.qtdTotal,
      'Preço Médio Ponderado (BRL)': Number(i.precoMedio.toFixed(4)),
      'Preço Médio Simples (BRL)': Number(i.precoMedioSimples.toFixed(4)),
      'Mediana (BRL)': Number(i.precoMediana.toFixed(4)),
      'Menor Preço (BRL)': Number(i.menor.toFixed(4)),
      'Fornecedor do Menor': i.fornecedorMenor,
      'Maior Preço (BRL)': Number(i.maior.toFixed(4)),
      'Último Preço (BRL)': Number(i.ultimo.toFixed(4)),
      'Data do Último': i.dataUltimo,
      'Variação do Último (%)': i.variacaoUltimoPct !== null ? Number(i.variacaoUltimoPct.toFixed(1)) : '',
      Fornecedores: i.fornecedores.map(f => f.fornecedor).join('; '),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, fonte === 'pedidos' ? 'Preço Médio - Pedidos' : 'Preço Médio - Cotações');
    XLSX.writeFile(wb, `preco_medio_${fonte}_${Date.now()}.xlsx`);
  }, [itensOrdenados, fonte]);

  /* Render -------------------------------------------------------------- */

  const textoFonte =
    fonte === 'pedidos'
      ? 'Preço pago por unidade nos pedidos de compra (valor líquido em BRL ÷ quantidade).'
      : 'Preço unitário de etiqueta nas propostas de fornecedores (antes de impostos e frete).';

  const visiveis = itensOrdenados.slice(0, limite);
  const vazio = !carregando && itensOrdenados.length === 0;

  return (
    <div className="space-y-6">
      {/* Fonte + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Segmentado
            valor={fonte}
            onChange={trocarFonte}
            rotulo="Fonte do preço"
            opcoes={[
              { v: 'pedidos' as FontePreco, r: 'Histórico de pedidos (PO)' },
              { v: 'cotacoes' as FontePreco, r: 'Histórico de cotações' },
            ]}
          />
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{textoFonte}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportar}
            disabled={itensOrdenados.length === 0}
            className={botaoAcao}
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
          >
            Exportar XLSX
          </button>
          <button
            onClick={atualizar}
            disabled={sincronizando}
            className={botaoAcao}
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
          role="alert"
        >
          {erro}
        </div>
      )}

      {/* Busca por palavras-chave */}
      <div
        className="rounded-xl border p-4 space-y-2"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <label htmlFor="preco-busca" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
          Item — palavras-chave
        </label>
        <SearchKeywordsChips
          chips={termos}
          onChangeChips={alterarTermos}
          accent="brand"
          placeholder="Digite uma palavra do item e pressione Enter — ex.: luva"
        />
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Cada palavra (Enter) é acumulada: todas precisam aparecer no código ou na descrição, em qualquer ordem. Use aspas
          para uma expressão exata.
          {palavras.length === 0 && ' Digite o item para ver a evolução mensal do preço.'}
        </p>
      </div>

      {/* Evolução do preço do item buscado ou selecionado */}
      {mostrarGrafico && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                {selecionado ? rotuloItem(selecionado) : `Busca: ${termos.join(' + ')}`}
              </h4>
              <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                {selecionado?.material && <span className="font-mono">{selecionado.material} · </span>}
                {formatInt(amostrasGrafico.length)} preço(s)
                {!selecionado && ` · ${formatInt(qtdItensBusca)} item(ns) na busca`}
                {selecionado && ` · ${formatQtd(selecionado.qtdTotal)} ${selecionado.unidade || 'un.'} no total`}
              </p>
            </div>
            {selecionadoChave && (
              <button
                onClick={() => setSelecionadoChave(null)}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                Voltar à busca inteira
              </button>
            )}
          </div>

          {!selecionado && qtdItensBusca > 1 && (
            <p
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--status-warning)', color: 'var(--ink-secondary)' }}
              role="note"
            >
              A busca reuniu {formatInt(qtdItensBusca)} itens diferentes, então a média mistura os preços deles. Acrescente
              palavras ou clique num item na tabela abaixo para ver só ele.
            </p>
          )}

          {resumoGrafico && (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
              {[
                { r: 'Preço médio no período', v: formatBRL(resumoGrafico.media), d: 'ponderado pela quantidade' },
                {
                  r: `Menor média por ${granularidade === 'mes' ? 'mês' : 'semana'}`,
                  v: formatBRL(resumoGrafico.menor?.precoMedio),
                  d: resumoGrafico.menor ? rotuloPeriodo(resumoGrafico.menor.periodo) : '—',
                },
                {
                  r: `Maior média por ${granularidade === 'mes' ? 'mês' : 'semana'}`,
                  v: formatBRL(resumoGrafico.maior?.precoMedio),
                  d: resumoGrafico.maior ? rotuloPeriodo(resumoGrafico.maior.periodo) : '—',
                },
                {
                  r: 'Variação do 1º ao último',
                  v: formatVariacao(resumoGrafico.variacaoPct),
                  d: `${granularidade === 'mes' ? 'mês' : 'semana'} com preço`,
                  cor: corVariacao(resumoGrafico.variacaoPct),
                },
                {
                  r: 'Flutuação no período',
                  v: formatVariacao(resumoGrafico.flutuacaoPct),
                  d: `${formatBRL(resumoGrafico.menorPreco)} a ${formatBRL(resumoGrafico.maiorPreco)}`,
                },
              ].map(k => (
                <div
                  key={k.r}
                  className="rounded-xl border p-3"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{k.r}</div>
                  <div className="mt-1 text-lg font-bold tabular" style={{ color: k.cor ?? 'var(--ink-primary)' }}>{k.v}</div>
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{k.d}</div>
                </div>
              ))}
            </div>
          )}

          <SeriePrecoChart
            pontos={serie}
            onSelecionarPeriodo={abrirPeriodo}
            precoMedioGeral={resumoGrafico?.media}
            title={`Preço médio por ${granularidade === 'mes' ? 'mês' : 'semana'}`}
            icon={LineChartIcon}
            description="Linha: preço médio ponderado do período. Ponto vazado e rótulo: mediana. Área sombreada: do menor ao maior preço — quanto mais larga, maior a flutuação. Período sem compra ou cotação fica como lacuna. Clique num período para ver os preços."
            actions={
              <Segmentado<'semana' | 'mes'>
                valor={granularidade}
                onChange={setGranularidade}
                rotulo="Granularidade"
                opcoes={[
                  { v: 'mes' as const, r: 'Mês' },
                  { v: 'semana' as const, r: 'Semana' },
                ]}
              />
            }
          />

          {selecionado && (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Por fornecedor */}
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                  <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--hairline)' }}>
                    <Users className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                    <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>
                      Por fornecedor
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--surface-raised)' }}>
                          <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Fornecedor</th>
                          <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Preços</th>
                          <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Médio</th>
                          <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Menor</th>
                          <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Último</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                        {selecionado.fornecedores.map(f => (
                          <tr key={f.fornecedor}>
                            <td className="px-3 py-2.5 font-semibold truncate max-w-[220px]" style={{ color: 'var(--ink-primary)' }} title={f.fornecedor}>
                              {f.fornecedor}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatInt(f.n)}</td>
                            <td className="px-3 py-2.5 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRL(f.precoMedio)}</td>
                            <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatBRL(f.menor)}</td>
                            <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }} title={formatDateBR(f.dataUltimo)}>
                              {formatBRL(f.ultimo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Histórico de preços */}
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                  <div className="p-4 border-b" style={{ borderColor: 'var(--hairline)' }}>
                    <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>
                      {fonte === 'pedidos' ? 'Pedidos' : 'Propostas'} do item
                    </h3>
                  </div>
                  <div className="overflow-auto max-h-[320px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0" style={{ background: 'var(--surface-raised)' }}>
                        <tr>
                          <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Data</th>
                          <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>{fonte === 'pedidos' ? 'Pedido' : 'Proposta'}</th>
                          <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Fornecedor</th>
                          <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Qtd.</th>
                          <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Preço unit.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                        {[...selecionado.amostras].reverse().map((a, idx) => (
                          <tr key={`${a.documento}-${a.data}-${idx}`}>
                            <td className="px-3 py-2.5 tabular" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(a.data)}</td>
                            <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--ink-secondary)' }}>{a.documento || '—'}</td>
                            <td className="px-3 py-2.5 truncate max-w-[160px]" style={{ color: 'var(--ink-secondary)' }} title={a.fornecedor}>{a.fornecedor}</td>
                            <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatQtd(a.qtd)}</td>
                            <td className="px-3 py-2.5 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRL(a.preco)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-5 stagger">
        <KpiCard
          label="Itens Analisados"
          value={kpis.itens}
          format={formatInt}
          detail={`com ${filtros.minAmostras}+ preço(s) observado(s)`}
          icon={Boxes}
          accent="var(--series-1)"
          emphasize
        />
        <KpiCard
          label="Preços Observados"
          value={kpis.observacoes}
          format={formatInt}
          detail={fonte === 'pedidos' ? 'Linhas de pedido' : 'Itens de proposta'}
          icon={Tags}
          accent="var(--series-7)"
        />
        <KpiCard
          label="Preço em Alta"
          value={kpis.subiram}
          format={formatInt}
          detail={`Último preço ${LIMIAR_VARIACAO_PCT}%+ acima da média anterior`}
          icon={TrendingUp}
          accent={kpis.subiram > 0 ? 'var(--status-critical)' : 'var(--status-good)'}
        />
        <KpiCard
          label="Preço em Queda"
          value={kpis.cairam}
          format={formatInt}
          detail={`Último preço ${LIMIAR_VARIACAO_PCT}%+ abaixo da média anterior`}
          icon={TrendingDown}
          accent="var(--series-3)"
        />
        <KpiCard
          label="Fornecedores"
          value={kpis.fornecedores}
          format={formatInt}
          detail="Com preço nos itens analisados"
          icon={Building2}
          accent="var(--series-2)"
        />
      </div>

      {/* Filtros */}
      <div
        className="rounded-xl border p-4 flex flex-wrap items-center gap-3"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <input type="date" value={filtros.de} onChange={e => patch({ de: e.target.value })} className={selectClass} aria-label="Data inicial" />
        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>até</span>
        <input type="date" value={filtros.ate} onChange={e => patch({ ate: e.target.value })} className={selectClass} aria-label="Data final" />

        <select value={filtros.fornecedor} onChange={e => patch({ fornecedor: e.target.value })} className={selectClass} aria-label="Fornecedor">
          <option value="todos">Todos os fornecedores</option>
          {opcoes.fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        {fonte === 'pedidos' && (
          <select value={filtros.grupo} onChange={e => patch({ grupo: e.target.value })} className={selectClass} aria-label="Grupo de mercadoria">
            <option value="todos">Todos os grupos</option>
            {opcoes.grupos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}

        <select
          value={filtros.minAmostras}
          onChange={e => patch({ minAmostras: Number(e.target.value) })}
          className={selectClass}
          aria-label="Mínimo de preços observados"
        >
          <option value={1}>A partir de 1 preço</option>
          <option value={2}>A partir de 2 preços</option>
          <option value={3}>A partir de 3 preços</option>
          <option value={5}>A partir de 5 preços</option>
          <option value={10}>A partir de 10 preços</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
          <input
            type="checkbox"
            checked={filtros.ocultarGenericos}
            onChange={e => patch({ ocultarGenericos: e.target.checked })}
            className="accent-[var(--brand)]"
          />
          Ocultar códigos genéricos
        </label>

        <button
          onClick={() => { setFiltros(FILTROS_VAZIOS); alterarTermos([]); }}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
        >
          Limpar
        </button>

        <span className="ml-auto text-xs tabular" style={{ color: 'var(--ink-muted)' }}>
          {formatInt(filtradas.length)} preços no filtro
        </span>
      </div>

      {carregando && amostras.length === 0 ? (
        <div className="py-24 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
          {fonte === 'pedidos' ? 'Carregando histórico de compras…' : 'Carregando cotações…'}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmentado
              valor={chave}
              onChange={c => { setChave(c); setSelecionadoChave(null); setLimite(PAGINA_TABELA); }}
              rotulo="Como agrupar itens"
              opcoes={[
                { v: 'material' as ChavePreco, r: fonte === 'pedidos' ? 'Material exato (código SAP)' : 'Material vinculado (código SAP)' },
                { v: 'similar' as ChavePreco, r: fonte === 'pedidos' ? 'Itens similares (grupo + descrição)' : 'Itens similares (descrição)' },
              ]}
            />
            <select value={ordenacao} onChange={e => setOrdenacao(e.target.value as Ordenacao)} className={selectClass} aria-label="Ordenar por">
              <option value="amostras">Ordenar: mais preços observados</option>
              <option value="preco">Ordenar: maior preço médio</option>
              <option value="variacao">Ordenar: maior alta do último preço</option>
              <option value="amplitude">Ordenar: maior diferença entre menor e maior</option>
            </select>
          </div>

          {fonte === 'cotacoes' && chave === 'material' && (
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Itens cotados ainda sem código SAP aparecem agrupados pela descrição, marcados como “sem vínculo”. O vínculo
              é feito em Suprimentos → Vínculos &amp; Auditoria de Cotações.
            </p>
          )}

          {/* Tabela de itens */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-primary)' }}>
              Preço médio por item
              <span className="ml-2 font-normal normal-case tracking-normal text-xs" style={{ color: 'var(--ink-muted)' }}>
                Clique numa linha para ver a evolução e os fornecedores.
              </span>
            </h3>

            {vazio ? (
              <div
                className="rounded-xl border py-12 text-center text-sm"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-muted)' }}
              >
                Nenhum item com {filtros.minAmostras}+ preço(s) no filtro selecionado.
              </div>
            ) : (
              <>
                {/* Celular: cartões */}
                <TableCards>
                  {visiveis.map(i => (
                    <TableCardRow
                      key={i.chave}
                      onClick={() => setSelecionadoChave(i.chave)}
                      accent={i.variacaoUltimoPct !== null && Math.abs(i.variacaoUltimoPct) >= LIMIAR_VARIACAO_PCT ? corVariacao(i.variacaoUltimoPct) : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                            {i.semVinculo ? 'sem vínculo SAP' : i.material}
                          </div>
                          <div className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>{rotuloItem(i)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold tabular" style={{ color: 'var(--ink-primary)' }}>{formatBRL(i.precoMedio)}</div>
                          <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>preço médio</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                        <div><span style={{ color: 'var(--ink-muted)' }}>Menor </span>{formatBRL(i.menor)}</div>
                        <div><span style={{ color: 'var(--ink-muted)' }}>Maior </span>{formatBRL(i.maior)}</div>
                        <div><span style={{ color: 'var(--ink-muted)' }}>Preços </span>{formatInt(i.n)}</div>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span style={{ color: 'var(--ink-secondary)' }}>
                          Último {formatBRL(i.ultimo)} · {formatDateBR(i.dataUltimo)}
                        </span>
                        <span className="font-bold tabular" style={{ color: corVariacao(i.variacaoUltimoPct) }}>
                          {formatVariacao(i.variacaoUltimoPct)}
                        </span>
                      </div>
                    </TableCardRow>
                  ))}
                </TableCards>

                {/* Desktop: grade */}
                <TableDesktop>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--surface-raised)' }}>
                            <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Material / Descrição</th>
                            <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>{fonte === 'pedidos' ? 'Grupo' : 'Unid.'}</th>
                            <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Preços</th>
                            <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Preço médio</th>
                            <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Mediana</th>
                            <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Menor</th>
                            <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Maior</th>
                            <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Último</th>
                            <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Var. do último</th>
                            <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Menor preço com</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                          {visiveis.map(i => (
                            <tr
                              key={i.chave}
                              onClick={() => setSelecionadoChave(i.chave)}
                              aria-selected={i.chave === selecionadoChave}
                              className="cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                              style={i.chave === selecionadoChave ? { background: 'var(--surface-raised)' } : undefined}
                            >
                              <td className="px-3 py-2.5">
                                <div className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                                  {i.semVinculo ? 'sem vínculo SAP' : i.material || '—'}
                                </div>
                                <div className="font-semibold truncate max-w-[280px]" style={{ color: 'var(--ink-primary)' }} title={i.descricao}>
                                  {i.descricao || '—'}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 truncate max-w-[140px]" style={{ color: 'var(--ink-secondary)' }}>
                                {fonte === 'pedidos' ? i.grupo : i.unidade || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatInt(i.n)}</td>
                              <td className="px-3 py-2.5 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRL(i.precoMedio)}</td>
                              <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatBRL(i.precoMediana)}</td>
                              <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatBRL(i.menor)}</td>
                              <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatBRL(i.maior)}</td>
                              <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }} title={`${formatDateBR(i.dataUltimo)} · ${i.fornecedorUltimo}`}>
                                {formatBRL(i.ultimo)}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular font-bold" style={{ color: corVariacao(i.variacaoUltimoPct) }}>
                                {formatVariacao(i.variacaoUltimoPct)}
                              </td>
                              <td className="px-3 py-2.5 truncate max-w-[180px]" style={{ color: 'var(--ink-secondary)' }} title={i.fornecedorMenor}>
                                {i.fornecedorMenor}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TableDesktop>

                {itensOrdenados.length > visiveis.length && (
                  <div className="mt-3 flex justify-center">
                    <button
                      onClick={() => setLimite(l => l + PAGINA_TABELA)}
                      className={botaoAcao}
                      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
                    >
                      Mostrar mais ({formatInt(itensOrdenados.length - visiveis.length)} restantes)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <ComposicaoModal config={composicao} onClose={() => setComposicao(null)} />
    </div>
  );
}
