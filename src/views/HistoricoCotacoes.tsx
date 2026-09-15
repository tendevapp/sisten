/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Página de Histórico e Inteligência de Cotações:
 * Permite aos compradores e engenheiros pesquisar preços históricos praticados,
 * calcular benchmarks de produtos, comparar fornecedores, analisar dispersão de valores
 * e inspecionar propostas comerciais completas já catalogadas no SISTEN.
 */

import React, { useEffect, useState, useMemo, useDeferredValue } from 'react';
import {
  Search, ArrowLeft, Download, Building2, Package, FileText,
  DollarSign, TrendingDown, TrendingUp, Filter, RefreshCw,
  Eye, Truck, Calendar, Sparkles, ChevronRight, X, Layers,
  ListFilter, FileSpreadsheet, Link2, Boxes,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../components/ui/Toast';
import {
  buscarHistoricoItensCotacao,
  buscarHistoricoPropostasCotacao,
  buscarMetricasHistoricoCotacoes,
  buscarListaFornecedoresHistorico,
  buscarBenchmarkProduto,
  palavrasChaveBusca,
  listarMateriaisGenericos,
  marcarMaterialGenerico,
  desmarcarMaterialGenerico,
  type ItemHistoricoCotacao,
  type PropostaHistoricaResumo,
  type MetricasHistoricoCotacoes,
  type BenchmarkProduto,
} from '../lib/cotacoesHistoricoApi';
import CotacaoHistoricoDetalhesModal from '../components/cotacoes/CotacaoHistoricoDetalhesModal';
import { TableCards, TableCardRow, TableDesktop } from '../components/ui/DataTable';
import { formatBRL, formatDateTimeBR } from '../lib/format';
import type { Profile } from '../types';

interface HistoricoCotacoesProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

type ColunaOrdenacaoItem =
  | 'produto'
  | 'material_sap'
  | 'fornecedor'
  | 'frete'
  | 'quantidade'
  | 'preco_unitario'
  | 'preco_total'
  | 'data';

type ColunaOrdenacaoProposta =
  | 'proposta'
  | 'fornecedor'
  | 'condicao'
  | 'itens'
  | 'valor_total'
  | 'data';

type DirecaoOrdenacao = 'asc' | 'desc';

// Componente para cabecalho de coluna com clique de ordenacao e icones
function HeaderOrdenavel({
  titulo,
  ativo,
  direcao,
  alinhamento = 'left',
  onClick,
}: {
  titulo: string;
  ativo: boolean;
  direcao: DirecaoOrdenacao;
  alinhamento?: 'left' | 'center' | 'right';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/th inline-flex items-center gap-1 font-bold transition-colors cursor-pointer select-none uppercase tracking-wider ${
        ativo
          ? 'text-indigo-600 dark:text-indigo-400'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
      } ${alinhamento === 'right' ? 'flex-row-reverse' : alinhamento === 'center' ? 'justify-center w-full' : ''}`}
      title={`Ordenar por ${titulo} (${ativo ? (direcao === 'asc' ? 'crescente' : 'decrescente') : 'clique para alternar ordem'})`}
    >
      <span>{titulo}</span>
      {ativo ? (
        direcao === 'asc' ? (
          <ArrowUp className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400" />
        ) : (
          <ArrowDown className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 shrink-0 opacity-35 group-hover/th:opacity-80 transition-opacity" />
      )}
    </button>
  );
}

export default function HistoricoCotacoes({ user, onNavigate }: HistoricoCotacoesProps) {
  const toast = useToast();

  // Tipo de visão: 'itens' (cada produto individualizado) ou 'propostas' (cotações comerciais completas)
  const [visao, setVisao] = useState<'itens' | 'propostas'>('itens');

  // Estados dos Itens
  const [itens, setItens] = useState<ItemHistoricoCotacao[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [carregandoItens, setCarregandoItens] = useState(true);

  // Estados das Propostas / Cotações
  const [propostas, setPropostas] = useState<PropostaHistoricaResumo[]>([]);
  const [totalPropostas, setTotalPropostas] = useState(0);
  const [carregandoPropostas, setCarregandoPropostas] = useState(false);

  // Metadados gerais
  const [metricas, setMetricas] = useState<MetricasHistoricoCotacoes | null>(null);
  const [fornecedoresLista, setFornecedoresLista] = useState<string[]>([]);

  // Filtros compartilhados
  const [busca, setBusca] = useState('');
  const buscaDiferida = useDeferredValue(busca);
  const [fornecedorFiltro, setFornecedorFiltro] = useState('');
  const [freteFiltro, setFreteFiltro] = useState<'TODOS' | 'CIF' | 'FOB'>('TODOS');
  
  // Ordenacao das colunas e sincronizacao
  const [colunaItem, setColunaItem] = useState<ColunaOrdenacaoItem>('data');
  const [dirItem, setDirItem] = useState<DirecaoOrdenacao>('desc');

  const [colunaProposta, setColunaProposta] = useState<ColunaOrdenacaoProposta>('data');
  const [dirProposta, setDirProposta] = useState<DirecaoOrdenacao>('desc');

  const alternarOrdenacaoItem = (coluna: ColunaOrdenacaoItem) => {
    if (colunaItem === coluna) {
      setDirItem(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setColunaItem(coluna);
      const inicialAsc = ['produto', 'material_sap', 'fornecedor', 'frete'].includes(coluna);
      setDirItem(inicialAsc ? 'asc' : 'desc');
    }
  };

  const alternarOrdenacaoProposta = (coluna: ColunaOrdenacaoProposta) => {
    if (colunaProposta === coluna) {
      setDirProposta(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setColunaProposta(coluna);
      const inicialAsc = ['proposta', 'fornecedor', 'condicao'].includes(coluna);
      setDirProposta(inicialAsc ? 'asc' : 'desc');
    }
  };

  // Recorte pelo vínculo com o catálogo SAP e, quando o usuário clica num
  // código na tabela, o material fixado — é assim que a base vira histórico de
  // preço de um item só.
  const [vinculoFiltro, setVinculoFiltro] = useState<'TODOS' | 'VINCULADOS' | 'NAO_VINCULADOS' | 'GENERICOS'>('TODOS');
  const [materialFixado, setMaterialFixado] = useState<string | null>(null);
  const [genericos, setGenericos] = useState<Set<string>>(new Set());

  // As palavras que estão de fato filtrando — mostradas como chips para ficar
  // claro que a busca é por palavra-chave, não pela frase inteira.
  const palavrasAtivas = useMemo(() => palavrasChaveBusca(busca), [busca]);

  // Benchmark do produto pesquisado (quando em visão de itens)
  const [benchmark, setBenchmark] = useState<BenchmarkProduto | null>(null);
  const [carregandoBenchmark, setCarregandoBenchmark] = useState(false);

  // Modais de Detalhes
  const [itemSelecionado, setItemSelecionado] = useState<ItemHistoricoCotacao | null>(null);
  const [propostaSelecionada, setPropostaSelecionada] = useState<PropostaHistoricaResumo | null>(null);

  // Carregar métricas e lista de fornecedores iniciais
  useEffect(() => {
    async function carregarMeta() {
      try {
        const [met, forns] = await Promise.all([
          buscarMetricasHistoricoCotacoes(),
          buscarListaFornecedoresHistorico(),
        ]);
        setMetricas(met);
        setFornecedoresLista(forns);
      } catch (err) {
        console.error('Falha ao carregar métricas:', err);
      }
    }
    carregarMeta();
    listarMateriaisGenericos()
      .then(lista => setGenericos(new Set(lista.map(g => g.material_code))))
      .catch(() => undefined);
  }, []);

  // Mapeia ordenacao selecionada para o parametro da API backend quando compativel
  const ordenacaoApiItens = useMemo(() => {
    if (colunaItem === 'preco_unitario') return dirItem === 'asc' ? 'preco_asc' : 'preco_desc';
    if (colunaItem === 'quantidade' && dirItem === 'desc') return 'qtd_desc';
    if (colunaItem === 'data') return dirItem === 'asc' ? 'antigo' : 'recente';
    return 'recente';
  }, [colunaItem, dirItem]);

  const ordenacaoApiPropostas = useMemo(() => {
    if (colunaProposta === 'valor_total') return dirProposta === 'asc' ? 'preco_asc' : 'preco_desc';
    if (colunaProposta === 'data') return dirProposta === 'asc' ? 'antigo' : 'recente';
    return 'recente';
  }, [colunaProposta, dirProposta]);

  // Carregar itens conforme filtros
  useEffect(() => {
    if (visao !== 'itens') return;
    let cancelado = false;
    async function carregarItens() {
      setCarregandoItens(true);
      try {
        const res = await buscarHistoricoItensCotacao({
          termoBusca: buscaDiferida,
          fornecedor: fornecedorFiltro,
          frete: freteFiltro,
          vinculo: vinculoFiltro,
          materialCode: materialFixado,
          ordenacao: ordenacaoApiItens,
          limite: 150,
        });
        if (!cancelado) {
          setItens(res.itens);
          setTotalRegistros(res.total);
        }
      } catch (err) {
        if (!cancelado) {
          toast.error((err as Error).message);
        }
      } finally {
        if (!cancelado) setCarregandoItens(false);
      }
    }
    carregarItens();
    return () => { cancelado = true; };
  }, [visao, buscaDiferida, fornecedorFiltro, freteFiltro, vinculoFiltro, materialFixado, ordenacaoApiItens, toast]);

  // Carregar propostas conforme filtros
  useEffect(() => {
    if (visao !== 'propostas') return;
    let cancelado = false;
    async function carregarPropostas() {
      setCarregandoPropostas(true);
      try {
        const res = await buscarHistoricoPropostasCotacao({
          termoBusca: buscaDiferida,
          fornecedor: fornecedorFiltro,
          frete: freteFiltro,
          ordenacao: ordenacaoApiPropostas,
          limite: 100,
        });
        if (!cancelado) {
          setPropostas(res.propostas);
          setTotalPropostas(res.total);
        }
      } catch (err) {
        if (!cancelado) {
          toast.error((err as Error).message);
        }
      } finally {
        if (!cancelado) setCarregandoPropostas(false);
      }
    }
    carregarPropostas();
    return () => { cancelado = true; };
  }, [visao, buscaDiferida, fornecedorFiltro, freteFiltro, ordenacaoApiPropostas, toast]);

  // Ordenacao dos itens em memoria para suporte completo a todas as colunas
  const itensOrdenados = useMemo(() => {
    const lista = [...itens];
    lista.sort((a, b) => {
      let valorA: any = null;
      let valorB: any = null;

      switch (colunaItem) {
        case 'produto':
          valorA = a.descricao_produto || '';
          valorB = b.descricao_produto || '';
          break;
        case 'material_sap':
          valorA = a.vinculo?.material_code || '';
          valorB = b.vinculo?.material_code || '';
          break;
        case 'fornecedor':
          valorA = a.proposta?.fornecedor_razao_social || '';
          valorB = b.proposta?.fornecedor_razao_social || '';
          break;
        case 'frete':
          valorA = a.proposta?.frete_modalidade || '';
          valorB = b.proposta?.frete_modalidade || '';
          break;
        case 'quantidade':
          valorA = a.quantidade ?? 0;
          valorB = b.quantidade ?? 0;
          break;
        case 'preco_unitario':
          valorA = a.preco_unitario ?? 0;
          valorB = b.preco_unitario ?? 0;
          break;
        case 'preco_total':
          valorA = a.preco_total_item ?? 0;
          valorB = b.preco_total_item ?? 0;
          break;
        case 'data':
        default:
          valorA = a.proposta?.data_emissao
            ? new Date(a.proposta.data_emissao).getTime()
            : (a.created_at ? new Date(a.created_at).getTime() : 0);
          valorB = b.proposta?.data_emissao
            ? new Date(b.proposta.data_emissao).getTime()
            : (b.created_at ? new Date(b.created_at).getTime() : 0);
          break;
      }

      if (typeof valorA === 'string' && typeof valorB === 'string') {
        const comp = valorA.localeCompare(valorB, 'pt-BR', { sensitivity: 'base' });
        return dirItem === 'asc' ? comp : -comp;
      }

      const numA = Number(valorA) || 0;
      const numB = Number(valorB) || 0;
      return dirItem === 'asc' ? numA - numB : numB - numA;
    });
    return lista;
  }, [itens, colunaItem, dirItem]);

  // Ordenacao das propostas em memoria para suporte completo a todas as colunas
  const propostasOrdenadas = useMemo(() => {
    const lista = [...propostas];
    lista.sort((a, b) => {
      let valorA: any = null;
      let valorB: any = null;

      switch (colunaProposta) {
        case 'proposta':
          valorA = a.numero_proposta || a.arquivo_origem || '';
          valorB = b.numero_proposta || b.arquivo_origem || '';
          break;
        case 'fornecedor':
          valorA = a.fornecedor_razao_social || '';
          valorB = b.fornecedor_razao_social || '';
          break;
        case 'condicao':
          valorA = a.condicao_pagamento || a.forma_pagamento || a.frete_modalidade || '';
          valorB = b.condicao_pagamento || b.forma_pagamento || b.frete_modalidade || '';
          break;
        case 'itens':
          valorA = a.total_itens_catalogados ?? 0;
          valorB = b.total_itens_catalogados ?? 0;
          break;
        case 'valor_total':
          valorA = a.valor_total_orcamento ?? a.soma_itens_valor ?? 0;
          valorB = b.valor_total_orcamento ?? b.soma_itens_valor ?? 0;
          break;
        case 'data':
        default:
          valorA = a.data_emissao ? new Date(a.data_emissao).getTime() : 0;
          valorB = b.data_emissao ? new Date(b.data_emissao).getTime() : 0;
          break;
      }

      if (typeof valorA === 'string' && typeof valorB === 'string') {
        const comp = valorA.localeCompare(valorB, 'pt-BR', { sensitivity: 'base' });
        return dirProposta === 'asc' ? comp : -comp;
      }

      const numA = Number(valorA) || 0;
      const numB = Number(valorB) || 0;
      return dirProposta === 'asc' ? numA - numB : numB - numA;
    });
    return lista;
  }, [propostas, colunaProposta, dirProposta]);

  // Carregar benchmark quando há busca textual de produto
  useEffect(() => {
    let cancelado = false;
    // Com um material fixado o benchmark passa a ser por código SAP: junta as
    // descrições diferentes que cada fornecedor deu ao mesmo produto.
    if (materialFixado || buscaDiferida.trim().length >= 3) {
      setCarregandoBenchmark(true);
      buscarBenchmarkProduto(buscaDiferida, { materialCode: materialFixado })
        .then(res => {
          if (!cancelado) setBenchmark(res);
        })
        .catch(() => {
          if (!cancelado) setBenchmark(null);
        })
        .finally(() => {
          if (!cancelado) setCarregandoBenchmark(false);
        });
    } else {
      setBenchmark(null);
    }
    return () => { cancelado = true; };
  }, [buscaDiferida, materialFixado]);

  /**
   * Marca/desmarca o código como genérico. Não mexe no vínculo: muda a leitura
   * do preço — dentro de um código genérico cada cotação pode ser de um produto
   * diferente, e comparar linha a linha ali não quer dizer nada.
   */
  const alternarGenerico = async (materialCode: string) => {
    const eraGenerico = genericos.has(materialCode);
    try {
      if (eraGenerico) {
        await desmarcarMaterialGenerico(materialCode);
      } else {
        await marcarMaterialGenerico({ materialCode, usuarioId: user.id, usuarioNome: user.name });
      }
      setGenericos(prev => {
        const proximo = new Set(prev);
        if (eraGenerico) proximo.delete(materialCode);
        else proximo.add(materialCode);
        return proximo;
      });
      toast.success(
        eraGenerico
          ? `${materialCode} deixou de ser tratado como código genérico.`
          : `${materialCode} marcado como código genérico: o preço dele não é comparável item a item.`
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Exportar para planilha Excel
  const exportarExcel = () => {
    try {
      if (visao === 'itens') {
        if (itens.length === 0) {
          toast.warning('Nenhum dado disponível para exportar.');
          return;
        }
        const dados = itensOrdenados.map(i => ({
          'Número Proposta': i.proposta?.numero_proposta || '—',
          'Data Emissão': i.proposta?.data_emissao || '—',
          'Fornecedor': i.proposta?.fornecedor_razao_social || '—',
          'CNPJ': i.proposta?.fornecedor_cnpj || '—',
          'Cidade/UF': [i.proposta?.fornecedor_cidade, i.proposta?.fornecedor_uf].filter(Boolean).join('/') || '—',
          'Código Produto': i.codigo_produto || '—',
          'Descrição Produto': i.descricao_produto,
          'Material SAP': i.vinculo?.material_code || '—',
          'Descrição SAP': i.vinculo?.material_descricao || '—',
          'Código Genérico': i.vinculo?.material_code && genericos.has(i.vinculo.material_code) ? 'SIM' : 'NÃO',
          'Marca': i.marca_fabricante || '—',
          'NCM': i.ncm || '—',
          'Quantidade': i.quantidade ?? 1,
          'Unidade': i.unidade_medida || 'UN',
          'Preço Unitário (R$)': i.preco_unitario ?? 0,
          'Preço Total (R$)': i.preco_total_item ?? 0,
          'Frete': i.proposta?.frete_modalidade || '—',
          'Prazo Entrega': i.proposta?.prazo_entrega_texto || '—',
          'Condição Pagamento': i.proposta?.condicao_pagamento || '—',
          'Vendedor': i.proposta?.vendedor_nome || '—',
          'Email Vendedor': i.proposta?.vendedor_email || '—',
          'Telefone Vendedor': i.proposta?.vendedor_telefone || '—',
          'Arquivo Origem': i.proposta?.arquivo_origem || '—',
        }));

        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Itens Cotados');
        XLSX.writeFile(wb, `itens_cotacoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else {
        if (propostas.length === 0) {
          toast.warning('Nenhum dado disponível para exportar.');
          return;
        }
        const dados = propostasOrdenadas.map(p => ({
          'Número Proposta': p.numero_proposta || '—',
          'Data Emissão': p.data_emissao || '—',
          'Fornecedor': p.fornecedor_razao_social || '—',
          'CNPJ Fornecedor': p.fornecedor_cnpj || '—',
          'Cidade/UF': [p.fornecedor_cidade, p.fornecedor_uf].filter(Boolean).join('/') || '—',
          'Contato Vendedor': p.vendedor_nome || '—',
          'Email Vendedor': p.vendedor_email || '—',
          'Telefone Vendedor': p.vendedor_telefone || '—',
          'Cliente Faturamento': p.cliente_razao_social || 'TORRES EOLICAS DO NORDESTE S/A',
          'Condição Pagamento': p.condicao_pagamento || p.forma_pagamento || '—',
          'Frete': p.frete_modalidade || '—',
          'Transportadora': p.transportadora_indicada || '—',
          'Prazo Entrega': p.prazo_entrega_texto || '—',
          'Faturamento Mínimo (R$)': p.faturamento_minimo ?? 0,
          'Valor Total Orçamento (R$)': p.valor_total_orcamento ?? 0,
          'Itens Catalogados': p.total_itens_catalogados,
          'Arquivo Origem': p.arquivo_origem || '—',
        }));

        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Propostas Comerciais');
        XLSX.writeFile(wb, `propostas_cotacoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }
      toast.success('Arquivo Excel gerado com sucesso!');
    } catch (err) {
      toast.error('Falha ao exportar planilha.');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('/suprimentos/cotacoes')}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
              title="Voltar para a lista de processos de cotação"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              Histórico de Cotações
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Consulte preços praticados, benchmark de mercado e inspecione cotações e propostas comerciais passadas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportarExcel}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 transition-colors shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total de Itens */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Itens Cotados</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {metricas ? metricas.totalItens.toLocaleString('pt-BR') : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Total de Propostas */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Propostas Catalogadas</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {metricas ? metricas.totalPropostas.toLocaleString('pt-BR') : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Fornecedores Únicos */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Fornecedores Únicos</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {metricas ? metricas.totalFornecedores.toLocaleString('pt-BR') : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Volume Total Cotado */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Volume Total Cotado</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {metricas ? formatBRL(metricas.valorTotalCotado) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Painel de Benchmark de Preços (Quando há termo pesquisado) */}
      {benchmark && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-indigo-50/40 to-white p-5 dark:border-indigo-900/60 dark:from-indigo-950/40 dark:via-indigo-950/20 dark:to-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Benchmark de Mercado {benchmark.materialCode ? 'do material' : 'para'}:{' '}
                <span className="text-indigo-600 dark:text-indigo-400">
                  {benchmark.materialCode ? benchmark.materialCode : `"${benchmark.termo}"`}
                </span>
              </h3>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                {benchmark.totalCotacoes} cotações analisadas
              </span>
            </div>

            {benchmark.dispersaoPct != null && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Dispersão de Preços:</span>
                <span className={`font-bold ${benchmark.dispersaoPct > 50 ? 'text-rose-600' : benchmark.dispersaoPct > 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {benchmark.dispersaoPct}%
                </span>
                <span className="text-[10px] text-slate-400">
                  {benchmark.dispersaoPct < 15 ? '(Preço estável)' : benchmark.dispersaoPct < 40 ? '(Variação moderada)' : '(Alta dispersão)'}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Menor Preço */}
            <div className="rounded-xl bg-white p-3 shadow-2xs border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Menor Preço</span>
              <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 block mt-0.5">
                {benchmark.menorPreco != null ? formatBRL(benchmark.menorPreco) : '—'}
              </span>
              <span className="text-[11px] text-slate-500 truncate block mt-0.5" title={benchmark.fornecedorMenorPreco || ''}>
                {benchmark.fornecedorMenorPreco}
              </span>
            </div>

            {/* Preço Médio */}
            <div className="rounded-xl bg-white p-3 shadow-2xs border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-indigo-600 block">Preço Médio</span>
              <span className="text-base font-extrabold text-indigo-700 dark:text-indigo-400 block mt-0.5">
                {benchmark.precoMedio != null ? formatBRL(benchmark.precoMedio) : '—'}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Média do histórico
              </span>
            </div>

            {/* Maior Preço */}
            <div className="rounded-xl bg-white p-3 shadow-2xs border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Maior Preço</span>
              <span className="text-base font-extrabold text-slate-700 dark:text-slate-300 block mt-0.5">
                {benchmark.maiorPreco != null ? formatBRL(benchmark.maiorPreco) : '—'}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Teto registrado
              </span>
            </div>
          </div>

          {/* Aviso de código genérico: sem isso, a dispersão acima engana. */}
          {benchmark.materialCode && (benchmark.materialGenerico || (benchmark.itensDistintos ?? 1) > 1) && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {benchmark.materialGenerico
                  ? 'Código marcado como genérico'
                  : `${benchmark.itensDistintos} descrições diferentes sob este código`}
                : os preços acima podem ser de produtos distintos. Compare pela descrição de cada
                cotação antes de usar o menor preço como referência.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Alternador de Visão e Barra de Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
        {/* Alternador de Abas de Visão: Itens vs Cotações Completas */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisao('itens')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                visao === 'itens'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              Itens Cotados ({metricas?.totalItens ?? totalRegistros})
            </button>

            <button
              type="button"
              onClick={() => setVisao('propostas')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                visao === 'propostas'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Todas as Cotações ({metricas?.totalPropostas ?? totalPropostas})
            </button>
          </div>

          <span className="text-xs text-slate-400">
            {visao === 'itens'
              ? 'Comparativo unitário e dispersão de preços por item'
              : 'Visão executiva das propostas e orçamentos na íntegra'}
          </span>
        </div>

        {/* Linha de Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Busca Textual */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={visao === 'itens'
                ? 'Palavras-chave: produto, marca, código SAP, NCM…'
                : 'Palavras-chave: fornecedor, nº proposta, vendedor, arquivo…'}
              title={'Cada palavra é procurada separadamente, em qualquer ordem e sem depender de acento. Use "aspas" para exigir a expressão exata.'}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtro de Fornecedor */}
          <div>
            <select
              value={fornecedorFiltro}
              onChange={e => setFornecedorFiltro(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Fornecedor: Todos</option>
              {fornecedoresLista.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Filtro de vínculo com o catálogo SAP */}
          <div>
            <select
              value={vinculoFiltro}
              onChange={e => setVinculoFiltro(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Vínculo SAP: Todos</option>
              <option value="VINCULADOS">Somente vinculados</option>
              <option value="NAO_VINCULADOS">Sem vínculo</option>
              <option value="GENERICOS">Somente códigos genéricos</option>
            </select>
          </div>

          {/* Filtro de Frete e Ordenação */}
          <div className="flex gap-2">
            <select
              value={freteFiltro}
              onChange={e => setFreteFiltro(e.target.value as any)}
              className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Frete: Todos</option>
              <option value="CIF">CIF</option>
              <option value="FOB">FOB</option>
            </select>

            <select
              value={
                visao === 'itens'
                  ? `${colunaItem}_${dirItem}`
                  : `${colunaProposta}_${dirProposta}`
              }
              onChange={e => {
                const val = e.target.value;
                if (visao === 'itens') {
                  const [col, dir] = val.split('_') as [ColunaOrdenacaoItem, DirecaoOrdenacao];
                  setColunaItem(col);
                  setDirItem(dir);
                } else {
                  const [col, dir] = val.split('_') as [ColunaOrdenacaoProposta, DirecaoOrdenacao];
                  setColunaProposta(col);
                  setDirProposta(dir);
                }
              }}
              className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {visao === 'itens' ? (
                <>
                  <option value="data_desc">Mais recentes</option>
                  <option value="data_asc">Mais antigos</option>
                  <option value="preco_unitario_asc">Menor preço unitário</option>
                  <option value="preco_unitario_desc">Maior preço unitário</option>
                  <option value="preco_total_asc">Menor total</option>
                  <option value="preco_total_desc">Maior total</option>
                  <option value="quantidade_desc">Maior quantidade</option>
                  <option value="quantidade_asc">Menor quantidade</option>
                  <option value="produto_asc">Produto (A-Z)</option>
                  <option value="produto_desc">Produto (Z-A)</option>
                  <option value="fornecedor_asc">Fornecedor (A-Z)</option>
                  <option value="fornecedor_desc">Fornecedor (Z-A)</option>
                  <option value="material_sap_asc">Material SAP (A-Z)</option>
                  <option value="frete_asc">Frete (CIF primeiro)</option>
                </>
              ) : (
                <>
                  <option value="data_desc">Mais recentes</option>
                  <option value="data_asc">Mais antigos</option>
                  <option value="valor_total_asc">Menor valor total</option>
                  <option value="valor_total_desc">Maior valor total</option>
                  <option value="fornecedor_asc">Fornecedor (A-Z)</option>
                  <option value="fornecedor_desc">Fornecedor (Z-A)</option>
                  <option value="itens_desc">Mais itens</option>
                  <option value="itens_asc">Menos itens</option>
                  <option value="proposta_asc">Proposta (A-Z)</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Palavras-chave ativas: a busca exige todas, em qualquer ordem */}
        {palavrasAtivas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-400">Exigindo todas as palavras:</span>
            {palavrasAtivas.map(palavra => (
              <span
                key={palavra}
                className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
              >
                {palavra}
              </span>
            ))}
            <span className="text-slate-400">— em qualquer ordem, sem acento. Use "aspas" para expressão exata.</span>
          </div>
        )}

        {/* Material fixado: a base recortada no histórico de um código só */}
        {materialFixado && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs dark:border-indigo-900/60 dark:bg-indigo-950/30">
            <Link2 className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-slate-600 dark:text-slate-300">
              Histórico do material <strong className="font-mono">{materialFixado}</strong>
              {itens[0]?.vinculo?.material_descricao ? ` — ${itens[0].vinculo.material_descricao}` : ''}
            </span>
            {genericos.has(materialFixado) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Boxes className="h-3 w-3" />
                CÓDIGO GENÉRICO — preços de produtos diferentes
              </span>
            )}
            <button
              type="button"
              onClick={() => setMaterialFixado(null)}
              className="ml-auto font-semibold text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
            >
              Limpar material
            </button>
          </div>
        )}

        {/* Resumo da consulta */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span>
            {visao === 'itens' ? (
              <>Exibindo <strong>{itens.length}</strong> {itens.length === 1 ? 'item' : 'itens'} {totalRegistros > itens.length && `de ${totalRegistros} encontrados`}</>
            ) : (
              <>Exibindo <strong>{propostas.length}</strong> {propostas.length === 1 ? 'cotação' : 'cotações'} {totalPropostas > propostas.length && `de ${totalPropostas} encontradas`}</>
            )}
          </span>
          {(busca || fornecedorFiltro || freteFiltro !== 'TODOS' || vinculoFiltro !== 'TODOS' || materialFixado) && (
            <button
              type="button"
              onClick={() => {
                setBusca(''); setFornecedorFiltro(''); setFreteFiltro('TODOS');
                setVinculoFiltro('TODOS'); setMaterialFixado(null);
              }}
              className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* TABELA 1: VISÃO POR ITENS */}
      {visao === 'itens' && (
        <>
        {/* Celular: cada item vira um cartão (a tabela tem 9 colunas). */}
        {!carregandoItens && itensOrdenados.length > 0 && (
          <TableCards>
            {itensOrdenados.map(it => {
              const p = it.proposta;
              const dataFormatada = p?.data_emissao ? formatDateTimeBR(p.data_emissao).split(' ')[0] : '—';
              return (
                <TableCardRow key={`m-${it.id}`} onClick={() => setItemSelecionado(it)}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
                      {it.descricao_produto}
                    </p>
                    <span className="shrink-0 text-sm font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {it.preco_unitario != null ? formatBRL(it.preco_unitario) : '—'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                    {it.codigo_produto && <span>Cód {it.codigo_produto}</span>}
                    {it.marca_fabricante && <span>· {it.marca_fabricante}</span>}
                    {it.vinculo?.material_code && (
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        SAP {it.vinculo.material_code}
                        {genericos.has(it.vinculo.material_code) && ' · genérico'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                    {p?.fornecedor_razao_social || '—'}
                    <span className="ml-1 font-normal text-slate-400">
                      {[p?.fornecedor_cidade, p?.fornecedor_uf].filter(Boolean).join('/')}
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-600 dark:text-slate-300">{p?.frete_modalidade || '—'}</span>
                    <span>Qtd {it.quantidade ?? 1} {it.unidade_medida || 'UN'}</span>
                    {it.preco_total_item != null && <span>Total {formatBRL(it.preco_total_item)}</span>}
                    <span>{dataFormatada}</span>
                  </div>
                </TableCardRow>
              );
            })}
          </TableCards>
        )}
        <TableDesktop>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-800/60 dark:border-slate-800 dark:text-slate-300 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">
                    <HeaderOrdenavel
                      titulo="Produto & Código"
                      ativo={colunaItem === 'produto'}
                      direcao={dirItem}
                      onClick={() => alternarOrdenacaoItem('produto')}
                    />
                  </th>
                  <th className="py-3 px-4">
                    <HeaderOrdenavel
                      titulo="Material SAP"
                      ativo={colunaItem === 'material_sap'}
                      direcao={dirItem}
                      onClick={() => alternarOrdenacaoItem('material_sap')}
                    />
                  </th>
                  <th className="py-3 px-4">
                    <HeaderOrdenavel
                      titulo="Fornecedor"
                      ativo={colunaItem === 'fornecedor'}
                      direcao={dirItem}
                      onClick={() => alternarOrdenacaoItem('fornecedor')}
                    />
                  </th>
                  <th className="py-3 px-4 text-center">
                    <HeaderOrdenavel
                      titulo="Frete"
                      ativo={colunaItem === 'frete'}
                      direcao={dirItem}
                      alinhamento="center"
                      onClick={() => alternarOrdenacaoItem('frete')}
                    />
                  </th>
                  <th className="py-3 px-4 text-right">
                    <HeaderOrdenavel
                      titulo="Qtd"
                      ativo={colunaItem === 'quantidade'}
                      direcao={dirItem}
                      alinhamento="right"
                      onClick={() => alternarOrdenacaoItem('quantidade')}
                    />
                  </th>
                  <th className="py-3 px-4 text-right">
                    <HeaderOrdenavel
                      titulo="Preço Unitário"
                      ativo={colunaItem === 'preco_unitario'}
                      direcao={dirItem}
                      alinhamento="right"
                      onClick={() => alternarOrdenacaoItem('preco_unitario')}
                    />
                  </th>
                  <th className="py-3 px-4 text-right">
                    <HeaderOrdenavel
                      titulo="Total Item"
                      ativo={colunaItem === 'preco_total'}
                      direcao={dirItem}
                      alinhamento="right"
                      onClick={() => alternarOrdenacaoItem('preco_total')}
                    />
                  </th>
                  <th className="py-3 px-4">
                    <HeaderOrdenavel
                      titulo="Data Emissão"
                      ativo={colunaItem === 'data'}
                      direcao={dirItem}
                      onClick={() => alternarOrdenacaoItem('data')}
                    />
                  </th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {carregandoItens ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-indigo-500 mb-2" />
                      Carregando itens históricos...
                    </td>
                  </tr>
                ) : itensOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <Package className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      Nenhum item encontrado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  itensOrdenados.map(it => {
                    const p = it.proposta;
                    const dataFormatada = p?.data_emissao ? formatDateTimeBR(p.data_emissao).split(' ')[0] : '—';
                    return (
                      <tr
                        key={it.id}
                        onClick={() => setItemSelecionado(it)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={it.descricao_produto}>
                            {it.descricao_produto}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            {it.codigo_produto && <span>Cód: {it.codigo_produto}</span>}
                            {it.marca_fabricante && <span>· {it.marca_fabricante}</span>}
                            {it.ncm && <span>· NCM {it.ncm}</span>}
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-[200px]" onClick={e => e.stopPropagation()}>
                          {it.vinculo?.material_code ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setMaterialFixado(it.vinculo!.material_code)}
                                  title="Ver o histórico de preço deste código"
                                  className="font-mono text-[11px] font-bold text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
                                >
                                  {it.vinculo.material_code}
                                </button>
                                {genericos.has(it.vinculo.material_code) && (
                                  <span
                                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                    title="Código usado para vários produtos: o preço não é comparável item a item."
                                  >
                                    <Boxes className="h-2.5 w-2.5" />
                                    GENÉRICO
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={it.vinculo.material_descricao || ''}>
                                {it.vinculo.material_descricao || '—'}
                              </div>
                              <button
                                type="button"
                                onClick={() => alternarGenerico(it.vinculo!.material_code)}
                                className="mt-0.5 text-[10px] font-semibold text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
                              >
                                {genericos.has(it.vinculo.material_code) ? 'desmarcar genérico' : 'marcar como genérico'}
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Link2 className="h-3 w-3" />
                              sem vínculo
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 max-w-[200px]">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={p?.fornecedor_razao_social || ''}>
                            {p?.fornecedor_razao_social || '—'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {[p?.fornecedor_cidade, p?.fornecedor_uf].filter(Boolean).join('/') || p?.fornecedor_cnpj || ''}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              p?.frete_modalidade === 'FOB'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            }`}
                          >
                            {p?.frete_modalidade || '—'}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {it.quantidade ?? 1} {it.unidade_medida || 'UN'}
                        </td>

                        <td className="py-3 px-4 text-right font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap text-sm">
                          {it.preco_unitario != null ? formatBRL(it.preco_unitario) : '—'}
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {it.preco_total_item != null ? formatBRL(it.preco_total_item) : '—'}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                          {dataFormatada}
                        </td>

                        <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setItemSelecionado(it)}
                            title="Ver toda a cotação e proposta comercial completa"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Ver toda a cotação
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
        </TableDesktop>
        </>
      )}

      {/* TABELA 2: VISÃO POR COTAÇÃO COMPLETA */}
      {visao === 'propostas' && (
        <>
        {/* Celular: cada proposta vira um cartão. */}
        {!carregandoPropostas && propostasOrdenadas.length > 0 && (
          <TableCards>
            {propostasOrdenadas.map(prop => {
              const dataEmissao = prop.data_emissao ? formatDateTimeBR(prop.data_emissao).split(' ')[0] : '—';
              return (
                <TableCardRow key={`m-${prop.id}`} onClick={() => setPropostaSelecionada(prop)}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {prop.fornecedor_razao_social || '—'}
                    </p>
                    <span className="shrink-0 text-sm font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {formatBRL(prop.valor_total_orcamento ?? prop.soma_itens_valor)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {prop.numero_proposta ? `Nº ${prop.numero_proposta}` : 'Sem número'}
                    {prop.arquivo_origem ? ` · ${prop.arquivo_origem}` : ''}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-600 dark:text-slate-300">{prop.frete_modalidade || 'FOB'}</span>
                    <span>{prop.condicao_pagamento || prop.forma_pagamento || 'Pgto. a combinar'}</span>
                    <span>{prop.total_itens_catalogados} itens</span>
                    <span>{dataEmissao}</span>
                  </div>
                </TableCardRow>
              );
            })}
          </TableCards>
        )}
        <TableDesktop>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-800/60 dark:border-slate-800 dark:text-slate-300 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">
                    <HeaderOrdenavel
                      titulo="Proposta / Arquivo"
                      ativo={colunaProposta === 'proposta'}
                      direcao={dirProposta}
                      onClick={() => alternarOrdenacaoProposta('proposta')}
                    />
                  </th>
                  <th className="py-3 px-4">
                    <HeaderOrdenavel
                      titulo="Fornecedor"
                      ativo={colunaProposta === 'fornecedor'}
                      direcao={dirProposta}
                      onClick={() => alternarOrdenacaoProposta('fornecedor')}
                    />
                  </th>
                  <th className="py-3 px-4">
                    <HeaderOrdenavel
                      titulo="Condição & Frete"
                      ativo={colunaProposta === 'condicao'}
                      direcao={dirProposta}
                      onClick={() => alternarOrdenacaoProposta('condicao')}
                    />
                  </th>
                  <th className="py-3 px-4 text-center">
                    <HeaderOrdenavel
                      titulo="Itens"
                      ativo={colunaProposta === 'itens'}
                      direcao={dirProposta}
                      alinhamento="center"
                      onClick={() => alternarOrdenacaoProposta('itens')}
                    />
                  </th>
                  <th className="py-3 px-4 text-right">
                    <HeaderOrdenavel
                      titulo="Valor Total"
                      ativo={colunaProposta === 'valor_total'}
                      direcao={dirProposta}
                      alinhamento="right"
                      onClick={() => alternarOrdenacaoProposta('valor_total')}
                    />
                  </th>
                  <th className="py-3 px-4">
                    <HeaderOrdenavel
                      titulo="Emissão / Validade"
                      ativo={colunaProposta === 'data'}
                      direcao={dirProposta}
                      onClick={() => alternarOrdenacaoProposta('data')}
                    />
                  </th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {carregandoPropostas ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-indigo-500 mb-2" />
                      Carregando cotações completas...
                    </td>
                  </tr>
                ) : propostasOrdenadas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      Nenhuma proposta encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  propostasOrdenadas.map(prop => {
                    const dataEmissao = prop.data_emissao ? formatDateTimeBR(prop.data_emissao).split(' ')[0] : '—';
                    return (
                      <tr
                        key={prop.id}
                        onClick={() => setPropostaSelecionada(prop)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {prop.numero_proposta ? `Nº ${prop.numero_proposta}` : 'Proposta sem número'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate" title={prop.arquivo_origem || ''}>
                            {prop.arquivo_origem || 'Documento catalogado'}
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-sm">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={prop.fornecedor_razao_social || ''}>
                            {prop.fornecedor_razao_social || '—'}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span>{[prop.fornecedor_cidade, prop.fornecedor_uf].filter(Boolean).join('/') || prop.fornecedor_cnpj}</span>
                            {prop.vendedor_nome && <span>· Vendedor: {prop.vendedor_nome}</span>}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-slate-700 dark:text-slate-300 font-medium">
                            {prop.condicao_pagamento || prop.forma_pagamento || 'A combinar'}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`inline-flex rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                                prop.frete_modalidade === 'FOB' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {prop.frete_modalidade || 'FOB'}
                            </span>
                            {prop.prazo_entrega_texto && <span>{prop.prazo_entrega_texto}</span>}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {prop.total_itens_catalogados}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap text-sm">
                          {formatBRL(prop.valor_total_orcamento ?? prop.soma_itens_valor)}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                          <div>{dataEmissao}</div>
                          {prop.validade_texto && (
                            <div className="text-[10px] text-slate-400">Validade: {prop.validade_texto}</div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setPropostaSelecionada(prop)}
                            title="Ver proposta e espelho completo"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-2xs"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Ver toda a cotação
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
        </TableDesktop>
        </>
      )}

      {/* Modal de Detalhes da Cotação Completa */}
      {(itemSelecionado || propostaSelecionada) && (
        <CotacaoHistoricoDetalhesModal
          item={itemSelecionado}
          propostaResumo={propostaSelecionada}
          onClose={() => {
            setItemSelecionado(null);
            setPropostaSelecionada(null);
          }}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
