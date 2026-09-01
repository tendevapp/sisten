/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Movimentações de Estoque (MB51) e as análises de supply chain derivadas.
 *
 * Quatro abas sobre a mesma base: o fluxo bruto (Visão Geral), a saúde do
 * giro (Giro & Cobertura), há quanto tempo o capital está parado (Idade do
 * Estoque) e se as compras foram feitas na hora certa (Urgência de Compra).
 *
 * Os números vêm de três views SQL (ver db/sql/views/movimentacoes_analise.sql).
 * A classificação funcional do TMV mora no banco porque as três precisam da
 * mesma regra: fazê-la no cliente faria as abas divergirem entre si.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeftRight, RefreshCw, AlertCircle, Filter, Warehouse,
  Activity, Gauge, Hourglass, Timer, PackageX, TrendingDown, Scale, ClipboardCheck, ShoppingCart,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, MB51Classificado, EstoqueCamadaFifo, EstoqueGiro, EstoqueReposicao } from '../types';
import {
  calcularSugestao, resumirReposicao, SugestaoReposicao, Recomendacao,
  FAIXAS_RECOMENDACAO, ROTULO_PADRAO, ROTULO_CONFIANCA, EXPLICACAO_PADRAO,
} from '../lib/reposicao';
import MetodoMinimoPanel from '../components/almoxarifado/MetodoMinimoPanel';
import {
  calcularKpisMovimentacoes, agregarMovimentacoesPor, topNMovimentacoes,
  serieMensal, calcularLagRecebimento, ROTULO_CATEGORIA,
} from '../lib/movimentacoes';
import {
  classificarCobertura, resumirCobertura, resumirIdade, resumirPermanencia,
  resumirEstoqueMorto, formatCobertura, faixaIdadeDe, conciliarComZl0024,
  FAIXAS_COBERTURA, FAIXAS_PERMANENCIA, SituacaoCobertura,
} from '../lib/giroEstoque';
import { formatBRL, formatQtd, isProjetoItem } from '../lib/almoxarifado';
import { formatDateBR, formatInt, formatPct } from '../lib/format';
import MaterialSearchInput from '../components/almoxarifado/MaterialSearchInput';
import MovimentacoesKpis from '../components/almoxarifado/MovimentacoesKpis';
import MovimentacoesPorTipoChart from '../components/almoxarifado/MovimentacoesPorTipoChart';
import MovimentacoesSerieChart from '../components/almoxarifado/MovimentacoesSerieChart';
import EstoqueLegadoBanner from '../components/almoxarifado/EstoqueLegadoBanner';
import IdadeEstoqueChart from '../components/almoxarifado/IdadeEstoqueChart';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';
import CoberturaPanel from '../components/almoxarifado/CoberturaPanel';
import PermanenciaPanel from '../components/almoxarifado/PermanenciaPanel';
import KpiCard from '../components/charts/KpiCard';
import {
  TableShell, TableHeadRow, Th, SortableTh, TableBody, Tr, Td, TableSkeleton, TableEmpty, SortDir,
} from '../components/ui/DataTable';
import Pagination from '../components/ui/Pagination';

export type AbaMovimentacoes = 'geral' | 'giro' | 'idade' | 'urgencia' | 'minimo';

interface MovimentacoesProps {
  user: Profile;
  /** Aba de entrada, para links diretos por rota. */
  abaInicial?: AbaMovimentacoes;
}

const ABAS: { id: AbaMovimentacoes; rotulo: string; icone: typeof Activity; pergunta: string }[] = [
  { id: 'geral', rotulo: 'Visão Geral', icone: Activity, pergunta: 'O que entrou e saiu do almoxarifado no período?' },
  { id: 'giro', rotulo: 'Giro & Cobertura', icone: Gauge, pergunta: 'O que gira, o que sobra e o que está prestes a faltar?' },
  { id: 'idade', rotulo: 'Idade do Estoque', icone: Hourglass, pergunta: 'Há quanto tempo o capital está parado?' },
  { id: 'urgencia', rotulo: 'Urgência de Compra', icone: Timer, pergunta: 'As compras urgentes eram mesmo urgentes?' },
  { id: 'minimo', rotulo: 'Estoque Mínimo', icone: ClipboardCheck, pergunta: 'Quanto manter de cada item para não parar a produção?' },
];

const PAGE_SIZE = 50;

type SortColMov = 'data_lancamento' | 'tipo' | 'material' | 'deposito' | 'quantidade' | 'valor';
type SortColGiro = 'material' | 'valor_estoque' | 'cobertura_dias' | 'giro_anualizado' | 'dias_sem_movimento';

export default function Movimentacoes({ user, abaInicial = 'geral' }: MovimentacoesProps) {
  const [aba, setAba] = useState<AbaMovimentacoes>(abaInicial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [movs, setMovs] = useState<MB51Classificado[]>([]);
  const [camadas, setCamadas] = useState<EstoqueCamadaFifo[]>([]);
  const [giro, setGiro] = useState<EstoqueGiro[]>([]);
  const [reposicao, setReposicao] = useState<EstoqueReposicao[]>([]);

  /* Filtros compartilhados entre as abas -------------------------------- */
  const [centroFiltro, setCentroFiltro] = useState('Todos');
  // Depósito aceita seleção múltipla: vazio = todos.
  const [depositoFiltro, setDepositoFiltro] = useState<Set<string>>(new Set());
  const [tipoFiltro, setTipoFiltro] = useState('Todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todos');
  // Recorte por data de lançamento (YYYY-MM-DD). Só a aba Visão Geral opera por
  // linha de movimento; as abas de análise têm janela própria fixada na view.
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Código escolhido numa sugestão. O campo de busca exibe a descrição, que é
  // ambígua entre materiais de nome parecido — o recorte usa o código.
  const [materialSel, setMaterialSel] = useState<string | null>(null);
  const [grupoFiltro, setGrupoFiltro] = useState('Todos');
  // Item de projeto (código iniciado em 100000) versus item de consumo. Vale
  // para todas as abas: as duas naturezas têm política de estoque diferente e
  // misturá-las distorce giro, cobertura e idade.
  const [tipoItemFiltro, setTipoItemFiltro] = useState<'Todos' | 'projeto' | 'consumo'>('Todos');

  /* Filtros locais das abas de análise ---------------------------------- */
  const [coberturaFiltro, setCoberturaFiltro] = useState<'Todos' | SituacaoCobertura>('Todos');
  const [faixaIdadeFiltro, setFaixaIdadeFiltro] = useState('Todos');
  const [classePermFiltro, setClassePermFiltro] = useState('Todos');
  const [recomendacaoFiltro, setRecomendacaoFiltro] = useState<'Todos' | Recomendacao>('Todos');

  const [sortColMov, setSortColMov] = useState<SortColMov>('data_lancamento');
  const [sortColGiro, setSortColGiro] = useState<SortColGiro>('valor_estoque');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  /* Carga --------------------------------------------------------------- */

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [m, c, g, rep] = await Promise.all([
        localDb.fetchMb51(force),
        localDb.fetchCamadasFifo(force).catch(() => [] as EstoqueCamadaFifo[]),
        localDb.fetchGiroEstoque(force).catch(() => [] as EstoqueGiro[]),
        localDb.fetchReposicao(force).catch(() => [] as EstoqueReposicao[]),
      ]);
      setMovs(m);
      setCamadas(c);
      setGiro(g);
      setReposicao(rep);
    } catch (e: any) {
      console.error('Erro ao carregar as movimentações de estoque:', e);
      setError('Falha ao carregar as movimentações de estoque. Tente atualizar novamente.');
      setMovs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  /* Aba na URL, para o link ser compartilhável --------------------------- */

  const trocarAba = useCallback((nova: AbaMovimentacoes) => {
    setAba(nova);
    setPage(0);
    const base = (window.location.hash || '#/almoxarifado/movimentacoes').slice(1).split('?')[0];
    window.history.replaceState(null, '', `#${base}?tab=${nova}`);
  }, []);

  useEffect(() => {
    const q = (window.location.hash || '').split('?')[1];
    const tab = new URLSearchParams(q || '').get('tab') as AbaMovimentacoes | null;
    if (tab && ABAS.some(a => a.id === tab)) setAba(tab);
    else setAba(abaInicial);
  }, [abaInicial]);

  /* Opções de filtro ----------------------------------------------------- */

  const opcoes = useMemo(() => {
    const centros = new Set<string>();
    const depositos = new Set<string>();
    const tipos = new Map<string, string>();
    const categorias = new Set<string>();
    movs.forEach(r => {
      if (r.centro) centros.add(r.centro);
      if (r.deposito) depositos.add(r.deposito);
      if (r.tipo_movimento) tipos.set(r.tipo_movimento.trim(), r.descricao_tipo_movimento);
      if (r.categoria) categorias.add(r.categoria);
    });
    const ordenar = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      centros: ordenar(centros),
      depositos: ordenar(depositos),
      tipos: Array.from(tipos.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      categorias: ordenar(categorias),
    };
  }, [movs]);

  /**
   * Universo de sugestões da busca. A view de giro é a fonte preferida — tem
   * um registro por material, já com descrição limpa. As movimentações
   * completam com material que se moveu mas não tem saldo (compra direta para
   * projeto, item zerado), que de outra forma seria impossível pesquisar.
   */
  const universoMateriais = useMemo(() => {
    const mapa = new Map<string, string>();
    giro.forEach(g => {
      if (g.material) mapa.set(g.material, g.descricao?.trim() || '');
    });
    movs.forEach(m => {
      if (!m.material) return;
      const atual = mapa.get(m.material);
      if (atual === undefined || (!atual && m.texto_breve_material)) {
        mapa.set(m.material, m.texto_breve_material?.trim() || '');
      }
    });
    return Array.from(mapa.entries()).map(([material, descricao]) => ({ material, descricao }));
  }, [giro, movs]);

  /* Recortes ------------------------------------------------------------- */

  /**
   * Aplica o filtro projeto/consumo a um código de material.
   * Item de projeto é o que começa em 100000 (ver isProjetoItem, que ignora
   * zeros à esquerda). Sem código, o item não pertence a nenhuma natureza e
   * fica de fora quando o filtro está ativo, em vez de cair no balaio errado.
   */
  const passaTipoItem = useCallback((material?: string | null): boolean => {
    if (tipoItemFiltro === 'Todos') return true;
    if (!material) return false;
    return tipoItemFiltro === 'projeto' ? isProjetoItem(material) : !isProjetoItem(material);
  }, [tipoItemFiltro]);

  /** Grupo de mercadorias por material — a MB51 não traz, a posição de estoque sim. */
  const grupoPorMaterial = useMemo(() => {
    const m = new Map<string, string>();
    giro.forEach(g => {
      if (g.material && g.grupo_mercadorias) m.set(g.material, g.grupo_mercadorias.trim());
    });
    return m;
  }, [giro]);

  const gruposDisponiveis = useMemo(
    () => Array.from(new Set(Array.from(grupoPorMaterial.values()))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [grupoPorMaterial]
  );

  const passaGrupo = useCallback((material?: string | null): boolean => {
    if (grupoFiltro === 'Todos') return true;
    if (!material) return false;
    return grupoPorMaterial.get(material) === grupoFiltro;
  }, [grupoFiltro, grupoPorMaterial]);

  /** Recorte por material escolhido na sugestão; tem precedência sobre o texto. */
  const passaMaterialSel = useCallback((material?: string | null): boolean => {
    if (!materialSel) return true;
    return material === materialSel;
  }, [materialSel]);

  const movsFiltrados = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return movs.filter(r => {
      if (centroFiltro !== 'Todos' && r.centro !== centroFiltro) return false;
      if (depositoFiltro.size > 0 && !depositoFiltro.has(r.deposito)) return false;
      if (tipoFiltro !== 'Todos' && r.tipo_movimento?.trim() !== tipoFiltro) return false;
      if (categoriaFiltro !== 'Todos' && r.categoria !== categoriaFiltro) return false;
      if (dataInicio && (!r.data_lancamento || r.data_lancamento < dataInicio)) return false;
      if (dataFim && (!r.data_lancamento || r.data_lancamento > dataFim)) return false;
      if (!passaTipoItem(r.material)) return false;
      if (!passaGrupo(r.material)) return false;
      if (!passaMaterialSel(r.material)) return false;
      if (!materialSel && q) {
        const alvo = `${r.material ?? ''} ${r.texto_breve_material ?? ''} ${r.doc_material ?? ''} ${r.razao_social_fornecedor ?? ''}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [movs, centroFiltro, depositoFiltro, tipoFiltro, categoriaFiltro, dataInicio, dataFim,
      searchQuery, passaTipoItem, passaGrupo, passaMaterialSel, materialSel]);

  // As abas de análise operam por material, não por linha de movimento: os
  // filtros de centro/depósito/TMV não se aplicam a elas (uma view por
  // material não tem depósito único). Só a busca textual atravessa.
  const giroFiltrado = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return giro.filter(g => {
      if (coberturaFiltro !== 'Todos' && classificarCobertura(g) !== coberturaFiltro) return false;
      if (!passaTipoItem(g.material)) return false;
      if (!passaGrupo(g.material)) return false;
      if (!passaMaterialSel(g.material)) return false;
      if (!materialSel && q) {
        const alvo = `${g.material ?? ''} ${g.descricao ?? ''} ${g.grupo_mercadorias ?? ''}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [giro, coberturaFiltro, searchQuery, passaTipoItem, passaGrupo, passaMaterialSel, materialSel]);

  // As camadas FIFO não carregam descrição; para a busca por texto casar com
  // a descrição do material aqui também, o índice vem da view de giro.
  const descricaoPorMaterial = useMemo(() => {
    const m = new Map<string, string>();
    giro.forEach(g => { if (g.material && g.descricao) m.set(g.material, g.descricao); });
    return m;
  }, [giro]);

  const camadasFiltradas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return camadas.filter(c => {
      if (!passaTipoItem(c.material)) return false;
      if (!passaGrupo(c.material)) return false;
      if (!passaMaterialSel(c.material)) return false;
      if (!materialSel && q) {
        const desc = descricaoPorMaterial.get(c.material) ?? '';
        if (!`${c.material} ${desc}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [camadas, searchQuery, passaTipoItem, passaGrupo, passaMaterialSel, materialSel, descricaoPorMaterial]);

  const camadasComSaldo = useMemo(
    () => camadasFiltradas.filter(c => (c.qtd_remanescente ?? 0) > 0.001),
    [camadasFiltradas]
  );

  const filtroAtivo = centroFiltro !== 'Todos' || depositoFiltro.size > 0
    || tipoFiltro !== 'Todos' || categoriaFiltro !== 'Todos' || dataInicio !== '' || dataFim !== ''
    || searchQuery.trim() !== ''
    || coberturaFiltro !== 'Todos' || faixaIdadeFiltro !== 'Todos' || classePermFiltro !== 'Todos'
    || tipoItemFiltro !== 'Todos' || recomendacaoFiltro !== 'Todos'
    || grupoFiltro !== 'Todos' || !!materialSel;

  const limparFiltros = useCallback(() => {
    setCentroFiltro('Todos'); setDepositoFiltro(new Set()); setTipoFiltro('Todos');
    setCategoriaFiltro('Todos'); setDataInicio(''); setDataFim('');
    setSearchQuery(''); setTipoItemFiltro('Todos');
    setCoberturaFiltro('Todos'); setFaixaIdadeFiltro('Todos'); setClassePermFiltro('Todos');
    setRecomendacaoFiltro('Todos'); setGrupoFiltro('Todos'); setMaterialSel(null);
    setPage(0);
  }, []);

  useEffect(() => { setPage(0); }, [
    centroFiltro, depositoFiltro, tipoFiltro, categoriaFiltro, dataInicio, dataFim, searchQuery,
    coberturaFiltro, faixaIdadeFiltro, classePermFiltro, tipoItemFiltro, recomendacaoFiltro,
    grupoFiltro, materialSel,
  ]);

  /* Derivados ------------------------------------------------------------ */

  const kpi = useMemo(() => calcularKpisMovimentacoes(movsFiltrados), [movsFiltrados]);
  const lag = useMemo(() => calcularLagRecebimento(movsFiltrados), [movsFiltrados]);
  const serie = useMemo(() => serieMensal(movsFiltrados), [movsFiltrados]);
  const morto = useMemo(() => resumirEstoqueMorto(giroFiltrado), [giroFiltrado]);
  const cobertura = useMemo(() => resumirCobertura(giroFiltrado), [giroFiltrado]);
  const idade = useMemo(() => resumirIdade(camadasFiltradas), [camadasFiltradas]);
  const permanencia = useMemo(() => resumirPermanencia(camadasFiltradas), [camadasFiltradas]);
  // Conciliação sempre sobre a base inteira, nunca sobre o recorte: um filtro
  // que esconde a divergência não a resolve, só a torna invisível.
  const conciliacao = useMemo(() => conciliarComZl0024(camadas, giro), [camadas, giro]);
  const janela = giro[0];

  /* Estoque mínimo ------------------------------------------------------- */

  const sugestoes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reposicao
      .filter(r => {
        if (!passaTipoItem(r.material)) return false;
        if (grupoFiltro !== 'Todos' && (r.grupo_mercadorias ?? '').trim() !== grupoFiltro) return false;
        if (!passaMaterialSel(r.material)) return false;
        if (!materialSel && q) {
          const alvo = `${r.material ?? ''} ${r.descricao ?? ''} ${r.grupo_mercadorias ?? ''}`.toLowerCase();
          if (!alvo.includes(q)) return false;
        }
        return true;
      })
      .map(calcularSugestao);
  }, [reposicao, searchQuery, passaTipoItem, grupoFiltro, passaMaterialSel, materialSel]);

  const resumoReposicao = useMemo(() => resumirReposicao(sugestoes), [sugestoes]);

  const sugestoesOrdenadas = useMemo(() => {
    const base = recomendacaoFiltro === 'Todos'
      ? sugestoes
      : sugestoes.filter(s => s.recomendacao === recomendacaoFiltro);
    // Ordem de trabalho do comprador: primeiro o que para a produção, e dentro
    // de cada grupo o de maior impacto financeiro.
    return [...base].sort((a, b) => {
      const pa = FAIXAS_RECOMENDACAO[a.recomendacao].prioridade;
      const pb = FAIXAS_RECOMENDACAO[b.recomendacao].prioridade;
      if (pa !== pb) return pa - pb;
      const va = a.valorCompraSugerida ?? a.valor_estoque;
      const vb = b.valorCompraSugerida ?? b.valor_estoque;
      return vb - va;
    });
  }, [sugestoes, recomendacaoFiltro]);

  const janelaReposicao = reposicao[0];
  const leadMediano = useMemo(() => {
    const proprios = reposicao.filter(r => r.lead_proprio && r.lead_dias).map(r => r.lead_dias!);
    if (proprios.length === 0) return reposicao[0]?.lead_dias ?? null;
    const ord = [...proprios].sort((a, b) => a - b);
    return ord[Math.floor(ord.length / 2)];
  }, [reposicao]);

  const investimentoNecessario = useMemo(
    () => sugestoes.reduce((a, s) => a + (s.valorCompraSugerida ?? 0), 0),
    [sugestoes]
  );

  const porTipo = useMemo(() => {
    const base = agregarMovimentacoesPor(movsFiltrados, m => m.tipo_movimento, 'Não classificado');
    const desc = new Map<string, string>();
    movsFiltrados.forEach(m => {
      const t = m.tipo_movimento?.trim();
      if (t) desc.set(t, m.descricao_tipo_movimento);
    });
    return topNMovimentacoes(
      base.map(a => ({ ...a, rotulo: desc.has(a.chave) ? `${a.chave} — ${desc.get(a.chave)}` : a.chave })),
      10
    );
  }, [movsFiltrados]);

  /* Tabelas -------------------------------------------------------------- */

  const movsOrdenados = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (m: MB51Classificado): number | string => {
      switch (sortColMov) {
        case 'data_lancamento': return m.data_lancamento || '';
        case 'tipo': return `${m.tipo_movimento || ''} ${m.descricao_tipo_movimento}`;
        case 'material': return m.material || '';
        case 'deposito': return m.deposito || '';
        case 'quantidade': return m.qtd_um_registro ?? 0;
        case 'valor': return m.montante_mi ?? 0;
        default: return '';
      }
    };
    return [...movsFiltrados].sort((a, b) => {
      const va = val(a); const vb = val(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'pt-BR') * dir;
    });
  }, [movsFiltrados, sortColMov, sortDir]);

  const giroOrdenado = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...giroFiltrado].sort((a, b) => {
      if (sortColGiro === 'material') return String(a.material).localeCompare(String(b.material)) * dir;
      const va = a[sortColGiro];
      const vb = b[sortColGiro];
      // Nulos (sem cobertura, sem giro) sempre no fim, independentemente da
      // direção — são ausência de medida, não o menor valor possível.
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [giroFiltrado, sortColGiro, sortDir]);

  const camadasIdade = useMemo(() => {
    const base = faixaIdadeFiltro === 'Todos'
      ? camadasComSaldo
      : camadasComSaldo.filter(c => faixaIdadeDe(c) === faixaIdadeFiltro);
    return [...base].sort((a, b) => (b.valor_remanescente ?? 0) - (a.valor_remanescente ?? 0));
  }, [camadasComSaldo, faixaIdadeFiltro]);

  const camadasUrgencia = useMemo(() => {
    const base = classePermFiltro === 'Todos'
      ? camadasFiltradas
      : camadasFiltradas.filter(c => c.classe_permanencia === classePermFiltro);
    return [...base].sort((a, b) => (b.dias_permanencia ?? -1) - (a.dias_permanencia ?? -1));
  }, [camadasFiltradas, classePermFiltro]);

  const handleSortMov = useCallback((col: string) => {
    setSortColMov(prev => {
      if (prev === col) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return prev; }
      setSortDir(col === 'data_lancamento' ? 'desc' : 'asc');
      return col as SortColMov;
    });
  }, []);

  const handleSortGiro = useCallback((col: string) => {
    setSortColGiro(prev => {
      if (prev === col) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return prev; }
      setSortDir(col === 'material' ? 'asc' : 'desc');
      return col as SortColGiro;
    });
  }, []);

  const paginar = <T,>(arr: T[]) => arr.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = (n: number) => Math.max(1, Math.ceil(n / PAGE_SIZE));

  const selectClass = 'rounded-lg border py-2 px-3 text-xs font-bold cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-secondary)] focus:outline-[var(--brand)]';
  const semDados = !loading && !error && movs.length === 0;

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 reveal" style={{ borderColor: 'var(--hairline)' }}>
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
            <ArrowLeftRight className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Movimentações de Estoque
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
            {ABAS.find(a => a.id === aba)?.pergunta}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer border hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--hairline)' }} role="tablist" aria-label="Análises de movimentação">
        {ABAS.map(a => {
          const Icone = a.icone;
          const ativa = a.id === aba;
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={ativa}
              onClick={() => trocarAba(a.id)}
              title={a.pergunta}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 rounded-t cursor-pointer"
              style={{
                borderColor: ativa ? 'var(--brand)' : 'transparent',
                color: ativa ? 'var(--brand)' : 'var(--ink-muted)',
                outlineColor: 'var(--brand)',
              }}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
              {a.rotulo}
            </button>
          );
        })}
      </div>

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {semDados && (
        <TableEmpty
          icon={ArrowLeftRight}
          title="Nenhuma movimentação disponível"
          hint='Importe as movimentações de estoque (transação MB51) na aba "Importar SAP" do painel administrativo.'
        />
      )}

      {(loading || (!error && movs.length > 0)) && (
        <>
          {/* Filtros: no mobile viram uma trilha com rolagem horizontal
              (evita empurrar os gráficos/tabela para muito longe do topo).
              O overflow fica num wrapper interno para não colidir com o
              position:sticky do container externo. */}
          <div
            className="rounded-xl border p-4 sticky top-2 z-10 backdrop-blur-sm"
            style={{
              borderColor: 'var(--hairline)',
              background: 'color-mix(in srgb, var(--surface-card) 92%, transparent)',
              boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
            }}
          >
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible">
              <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                <Filter className="h-3 w-3" /> Filtros
              </span>

              {aba === 'geral' && (
                <>
                  <select value={centroFiltro} onChange={e => setCentroFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[130px] lg:w-auto truncate`}>
                    <option value="Todos">Centro: Todos</option>
                    {opcoes.centros.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <MultiSelectFilter
                    label="Depósito"
                    icon={Warehouse}
                    options={opcoes.depositos}
                    selected={depositoFiltro}
                    onChange={setDepositoFiltro}
                    className="shrink-0 w-[140px] lg:w-auto lg:min-w-[140px]"
                  />
                  <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[150px] lg:w-auto truncate`}>
                    <option value="Todos">Categoria: Todas</option>
                    {opcoes.categorias.map(c => (
                      <option key={c} value={c}>{ROTULO_CATEGORIA[c as keyof typeof ROTULO_CATEGORIA] ?? c}</option>
                    ))}
                  </select>
                  <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[140px] lg:w-auto truncate`}>
                    <option value="Todos">TMV: Todos</option>
                    {opcoes.tipos.map(([tmv, desc]) => <option key={tmv} value={tmv}>{tmv} — {desc}</option>)}
                  </select>
                  <label className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>
                    <span className="uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>De</span>
                    <input
                      type="date"
                      value={dataInicio}
                      max={dataFim || undefined}
                      onChange={e => setDataInicio(e.target.value)}
                      className={selectClass}
                    />
                  </label>
                  <label className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>
                    <span className="uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Até</span>
                    <input
                      type="date"
                      value={dataFim}
                      min={dataInicio || undefined}
                      onChange={e => setDataFim(e.target.value)}
                      className={selectClass}
                    />
                  </label>
                </>
              )}

              {aba === 'giro' && (
                <select value={coberturaFiltro} onChange={e => setCoberturaFiltro(e.target.value as any)} className={`${selectClass} shrink-0 w-[160px] lg:w-auto truncate`}>
                  <option value="Todos">Situação: Todas</option>
                  {Object.values(FAIXAS_COBERTURA).map(f => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
                </select>
              )}

              {aba === 'idade' && (
                <select value={faixaIdadeFiltro} onChange={e => setFaixaIdadeFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[150px] lg:w-auto truncate`}>
                  <option value="Todos">Faixa: Todas</option>
                  {idade.map(f => <option key={f.faixa} value={f.faixa}>{f.rotulo}</option>)}
                </select>
              )}

              {aba === 'urgencia' && (
                <select value={classePermFiltro} onChange={e => setClassePermFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[150px] lg:w-auto truncate`}>
                  <option value="Todos">Classe: Todas</option>
                  {permanencia.map(p => <option key={p.classe} value={p.classe}>{p.rotulo}</option>)}
                </select>
              )}

              {aba === 'minimo' && (
                <select value={recomendacaoFiltro} onChange={e => setRecomendacaoFiltro(e.target.value as any)} className={`${selectClass} shrink-0 w-[170px] lg:w-auto truncate`}>
                  <option value="Todos">Recomendação: Todas</option>
                  {resumoReposicao.map(r => (
                    <option key={r.recomendacao} value={r.recomendacao}>{r.rotulo} ({r.materiais})</option>
                  ))}
                </select>
              )}

              {/* Vale para todas as abas: projeto e consumo têm política de
                  estoque diferente, e o giro de um contamina a leitura do outro. */}
              <select value={tipoItemFiltro} onChange={e => setTipoItemFiltro(e.target.value as any)} className={`${selectClass} shrink-0 w-[130px] lg:w-auto truncate`}>
                <option value="Todos">Item: Todos</option>
                <option value="projeto">Projeto (100000…)</option>
                <option value="consumo">Consumo</option>
              </select>

              <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[180px] lg:w-auto truncate`}>
                <option value="Todos">Grupo de mercadorias: Todos</option>
                {gruposDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
              </select>

              <MaterialSearchInput
                valor={searchQuery}
                onChange={setSearchQuery}
                materiais={universoMateriais}
                materialSelecionado={materialSel}
                onSelecionarMaterial={setMaterialSel}
                className="shrink-0 w-[220px] lg:flex-1 lg:min-w-[220px] lg:max-w-sm lg:shrink"
              />

              {filtroAtivo && (
                <button onClick={limparFiltros} className="shrink-0 text-xs font-bold text-rose-500 hover:text-rose-600 dark:text-rose-400 underline lg:ml-auto cursor-pointer whitespace-nowrap">
                  Limpar Filtros
                </button>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Aba: Visão Geral                                                  */}
          {/* ---------------------------------------------------------------- */}
          {aba === 'geral' && (
            <>
              <MovimentacoesKpis kpi={kpi} lag={lag} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MovimentacoesPorTipoChart dados={porTipo} onSelecionar={setTipoFiltro} loading={loading} />
                <MovimentacoesSerieChart dados={serie} loading={loading} />
              </div>

              {loading ? <TableSkeleton columns={9} /> : movsOrdenados.length === 0 ? (
                <TableEmpty icon={ArrowLeftRight} title="Nenhuma movimentação encontrada" hint="Ajuste os filtros ou a pesquisa." />
              ) : (
                <div className="space-y-2">
                  <TableShell maxHeight="60vh">
                    <table className="w-full text-xs border-collapse">
                      <TableHeadRow>
                        <SortableTh col="data_lancamento" label="Data" sortColumn={sortColMov} sortDir={sortDir} onSort={handleSortMov} width="w-24" />
                        <SortableTh col="tipo" label="Tipo de Movimento" sortColumn={sortColMov} sortDir={sortDir} onSort={handleSortMov} />
                        <SortableTh col="material" label="Material" sortColumn={sortColMov} sortDir={sortDir} onSort={handleSortMov} />
                        <Th label="Doc. Material" />
                        <SortableTh col="deposito" label="Depósito" sortColumn={sortColMov} sortDir={sortDir} onSort={handleSortMov} width="w-24" />
                        <Th label="Centro" width="w-20" />
                        <SortableTh col="quantidade" label="Quantidade" align="right" sortColumn={sortColMov} sortDir={sortDir} onSort={handleSortMov} width="w-28" />
                        <SortableTh col="valor" label="Valor (MI)" align="right" sortColumn={sortColMov} sortDir={sortDir} onSort={handleSortMov} width="w-32" />
                        <Th label="Fornecedor" />
                      </TableHeadRow>
                      <TableBody>
                        {paginar(movsOrdenados).map((m, idx) => (
                          <Tr key={m.chave_unica || `${m.doc_material}-${m.item}-${idx}`}>
                            <Td>{formatDateBR(m.data_lancamento)}</Td>
                            <Td truncate title={`${m.tipo_movimento || ''} — ${m.descricao_tipo_movimento}`}>
                              <span className="font-mono font-bold mr-1.5" style={{ color: 'var(--ink-primary)' }}>{m.tipo_movimento || '—'}</span>
                              {m.descricao_tipo_movimento}
                              {!m.movimenta_estoque && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}>
                                  interna
                                </span>
                              )}
                            </Td>
                            <Td truncate title={m.texto_breve_material || ''}>
                              <span className="font-mono" style={{ color: 'var(--ink-primary)' }}>{m.material || '—'}</span>
                              {m.texto_breve_material ? ` — ${m.texto_breve_material}` : ''}
                            </Td>
                            <Td mono>{m.doc_material}{m.item ? `/${m.item}` : ''}</Td>
                            <Td>{m.deposito || '—'}</Td>
                            <Td>{m.centro || '—'}</Td>
                            <Td align="right" numeric>
                              {formatQtd(m.qtd_um_registro)} {m.unid_medida_basica || ''}
                            </Td>
                            <Td align="right" numeric strong>{formatBRL(m.montante_mi)}</Td>
                            <Td truncate title={m.razao_social_fornecedor || ''}>{m.razao_social_fornecedor || m.fornecedor || '—'}</Td>
                          </Tr>
                        ))}
                      </TableBody>
                    </table>
                  </TableShell>
                  <Pagination page={page} totalPages={totalPages(movsOrdenados.length)} onPageChange={setPage}
                    info={`${movsOrdenados.length.toLocaleString('pt-BR')} movimentações`} />
                </div>
              )}
            </>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Aba: Giro & Cobertura                                             */}
          {/* ---------------------------------------------------------------- */}
          {aba === 'giro' && (
            <>
              <EstoqueLegadoBanner janelaInicio={janela?.janela_inicio} janelaFim={janela?.janela_fim} />

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger">
                <KpiCard
                  label="Capital sem consumo"
                  value={morto.valorSemConsumo}
                  format={formatBRL}
                  detail={`${formatInt(morto.materiaisSemConsumo)} materiais sem nenhuma saída`}
                  icon={PackageX}
                  accent="var(--status-serious)"
                  share={morto.valorTotal > 0 ? morto.valorSemConsumo / morto.valorTotal : undefined}
                  emphasize
                />
                <KpiCard
                  label="Nunca tocado na retomada"
                  value={morto.valorIntocado}
                  format={formatBRL}
                  detail={`${formatInt(morto.materiaisIntocados)} materiais sem movimento algum`}
                  icon={TrendingDown}
                  accent="var(--status-critical)"
                  share={morto.valorTotal > 0 ? morto.valorIntocado / morto.valorTotal : undefined}
                />
                <KpiCard
                  label="Em excesso"
                  value={cobertura.find(c => c.situacao === 'excesso')?.valor ?? 0}
                  format={formatBRL}
                  detail={`${formatInt(cobertura.find(c => c.situacao === 'excesso')?.materiais ?? 0)} materiais com +1 ano de cobertura`}
                  icon={Gauge}
                  accent="var(--status-warning)"
                  share={morto.valorTotal > 0 ? (cobertura.find(c => c.situacao === 'excesso')?.valor ?? 0) / morto.valorTotal : undefined}
                />
                <KpiCard
                  label="Ruptura iminente"
                  value={cobertura.find(c => c.situacao === 'ruptura')?.materiais ?? 0}
                  format={formatInt}
                  detail="materiais com menos de 15 dias de cobertura"
                  icon={AlertCircle}
                  accent="var(--status-critical)"
                />
              </div>

              <CoberturaPanel dados={cobertura} onSelecionar={s => setCoberturaFiltro(s as SituacaoCobertura)} loading={loading} />

              {loading ? <TableSkeleton columns={9} /> : giroOrdenado.length === 0 ? (
                <TableEmpty icon={Gauge} title="Nenhum material encontrado" hint="Ajuste os filtros ou a pesquisa." />
              ) : (
                <div className="space-y-2">
                  <TableShell maxHeight="60vh">
                    <table className="w-full text-xs border-collapse">
                      <TableHeadRow>
                        <SortableTh col="material" label="Material" sortColumn={sortColGiro} sortDir={sortDir} onSort={handleSortGiro} />
                        <Th label="Grupo" />
                        <Th label="Situação" width="w-40" />
                        <SortableTh col="valor_estoque" label="Valor em Estoque" align="right" sortColumn={sortColGiro} sortDir={sortDir} onSort={handleSortGiro} width="w-32" />
                        <Th label="Saldo" align="right" width="w-28" />
                        <Th label="Consumo na janela" align="right" width="w-32" />
                        <SortableTh col="cobertura_dias" label="Cobertura" align="right" sortColumn={sortColGiro} sortDir={sortDir} onSort={handleSortGiro} width="w-28" />
                        <SortableTh col="giro_anualizado" label="Giro/ano" align="right" sortColumn={sortColGiro} sortDir={sortDir} onSort={handleSortGiro} width="w-24" />
                        <SortableTh col="dias_sem_movimento" label="Sem movim." align="right" sortColumn={sortColGiro} sortDir={sortDir} onSort={handleSortGiro} width="w-28" />
                      </TableHeadRow>
                      <TableBody>
                        {paginar(giroOrdenado).map(g => {
                          const sit = classificarCobertura(g);
                          const faixa = FAIXAS_COBERTURA[sit];
                          return (
                            <Tr key={g.material} accent={sit === 'sem_consumo' || sit === 'ruptura' ? faixa.cor : undefined}>
                              <Td truncate title={g.descricao || ''}>
                                <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{g.material}</span>
                                {g.descricao ? ` — ${g.descricao}` : ''}
                              </Td>
                              <Td truncate title={g.grupo_mercadorias || ''}>{g.grupo_mercadorias || '—'}</Td>
                              <Td>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ background: faixa.cor }} aria-hidden="true" />
                                  <span className="text-[11px] font-semibold">{faixa.rotulo}</span>
                                </span>
                              </Td>
                              <Td align="right" numeric strong>{formatBRL(g.valor_estoque)}</Td>
                              <Td align="right" numeric>{formatQtd(g.saldo_atual)} {g.umb || ''}</Td>
                              <Td align="right" numeric>{formatQtd(g.qtd_consumida)}</Td>
                              <Td align="right" numeric>{formatCobertura(g.cobertura_dias)}</Td>
                              <Td align="right" numeric>
                                {g.giro_anualizado !== null && g.giro_anualizado !== undefined ? g.giro_anualizado.toFixed(2) : '—'}
                              </Td>
                              <Td align="right" numeric>
                                {g.dias_sem_movimento !== null && g.dias_sem_movimento !== undefined
                                  ? `${formatInt(g.dias_sem_movimento)} d`
                                  : 'nunca'}
                              </Td>
                            </Tr>
                          );
                        })}
                      </TableBody>
                    </table>
                  </TableShell>
                  <Pagination page={page} totalPages={totalPages(giroOrdenado.length)} onPageChange={setPage}
                    info={`${giroOrdenado.length.toLocaleString('pt-BR')} materiais`} />
                </div>
              )}
            </>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Aba: Idade do Estoque                                             */}
          {/* ---------------------------------------------------------------- */}
          {aba === 'idade' && (
            <>
              <EstoqueLegadoBanner janelaInicio={janela?.janela_inicio} janelaFim={janela?.janela_fim} />

              {/*
                Conciliação com o ZL0024 exposta na tela, não só no commit: se
                uma importação futura trouxer movimento sem saldo correspondente,
                o desvio aparece aqui antes de virar decisão.
              */}
              <div
                className="flex items-start gap-3 rounded-xl border p-3.5 text-xs"
                style={{
                  borderColor: conciliacao.fecha ? 'var(--hairline)' : 'var(--status-warning)',
                  background: 'var(--surface-raised)',
                }}
              >
                <Scale className="h-4 w-4 mt-0.5 shrink-0"
                  style={{ color: conciliacao.fecha ? 'var(--status-good)' : 'var(--status-warning)' }} aria-hidden="true" />
                <div className="leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                  <strong style={{ color: 'var(--ink-primary)' }}>Conciliação com o ZL0024:</strong>{' '}
                  {formatInt(conciliacao.materiaisConciliados)} materiais com{' '}
                  <span className="tabular">{formatQtd(conciliacao.qtdConciliada)}</span> unidades batem com a posição de estoque.
                  {conciliacao.fecha ? ' Nenhuma divergência.' : (
                    <>
                      {' '}Restam <strong className="tabular">{formatInt(conciliacao.materiaisSemSaldo)}</strong> materiais
                      com <span className="tabular">{formatQtd(conciliacao.qtdSemSaldo)}</span> unidades
                      (<span className="tabular">{formatBRL(conciliacao.valorSemSaldo)}</span>) que a MB51 registra
                      como recebidas e não consumidas, mas que não constam na posição do ZL0024 — divergência a apurar
                      no inventário.
                    </>
                  )}
                </div>
              </div>

              <IdadeEstoqueChart dados={idade} onSelecionar={setFaixaIdadeFiltro} loading={loading} />

              {loading ? <TableSkeleton columns={6} /> : camadasIdade.length === 0 ? (
                <TableEmpty icon={Hourglass} title="Nenhuma camada com saldo" hint="Ajuste os filtros ou a pesquisa." />
              ) : (
                <div className="space-y-2">
                  <TableShell maxHeight="60vh">
                    <table className="w-full text-xs border-collapse">
                      <TableHeadRow>
                        <Th label="Material" />
                        <Th label="Entrada (MIGO)" width="w-36" />
                        <Th label="Idade" align="right" width="w-32" />
                        <Th label="Qtd. Remanescente" align="right" width="w-36" />
                        <Th label="Preço Unit." align="right" width="w-28" />
                        <Th label="Valor Parado" align="right" width="w-32" />
                      </TableHeadRow>
                      <TableBody>
                        {paginar(camadasIdade).map((c, idx) => (
                          <Tr key={`${c.material}-${c.data_entrada ?? 'legado'}-${idx}`}
                              accent={c.legado ? 'var(--ink-muted)' : undefined}>
                            <Td mono strong>{c.material}</Td>
                            <Td>
                              {c.legado ? (
                                <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                                  Anterior à reabertura
                                </span>
                              ) : formatDateBR(c.data_entrada)}
                            </Td>
                            <Td align="right" numeric>
                              {c.legado ? (
                                <span title="A MB51 não alcança antes da reabertura; a idade real é de no mínimo ~3 anos."
                                      style={{ color: 'var(--ink-muted)' }}>
                                  ≥ 3 anos
                                </span>
                              ) : `${formatInt(c.dias_em_estoque)} dias`}
                            </Td>
                            <Td align="right" numeric>{formatQtd(c.qtd_remanescente)}</Td>
                            <Td align="right" numeric>{formatBRL(c.preco_unit)}</Td>
                            <Td align="right" numeric strong>{formatBRL(c.valor_remanescente)}</Td>
                          </Tr>
                        ))}
                      </TableBody>
                    </table>
                  </TableShell>
                  <Pagination page={page} totalPages={totalPages(camadasIdade.length)} onPageChange={setPage}
                    info={`${camadasIdade.length.toLocaleString('pt-BR')} camadas com saldo`} />
                </div>
              )}
            </>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Aba: Urgência de Compra                                           */}
          {/* ---------------------------------------------------------------- */}
          {aba === 'urgencia' && (
            <>
              {lag && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger">
                  <KpiCard
                    label="Lag NF → MIGO (mediana)"
                    value={lag.medianaDias}
                    format={v => `${Math.round(v)} dias`}
                    detail={`${formatInt(lag.amostras)} entradas de compra medidas`}
                    icon={Timer}
                    accent="var(--series-1)"
                    emphasize
                  />
                  <KpiCard
                    label="Lag NF → MIGO (média)"
                    value={lag.mediaDias}
                    format={v => `${v.toFixed(1)} dias`}
                    detail={`máximo de ${formatInt(lag.maxDias)} dias`}
                    icon={Timer}
                    accent="var(--series-2)"
                  />
                  <KpiCard
                    label="Recebimentos lentos"
                    value={lag.acimaDe30Dias}
                    format={formatInt}
                    detail="entradas lançadas +30 dias após a nota"
                    icon={AlertCircle}
                    accent="var(--status-warning)"
                    share={lag.amostras > 0 ? lag.acimaDe30Dias / lag.amostras : undefined}
                  />
                  <KpiCard
                    label="Lotes cross-dock"
                    value={permanencia.find(p => p.classe === 'cross_dock')?.camadas ?? 0}
                    format={formatInt}
                    detail="consumidos em até 7 dias da entrada"
                    icon={Activity}
                    accent="var(--status-good)"
                  />
                </div>
              )}

              <PermanenciaPanel dados={permanencia} onSelecionar={setClassePermFiltro} loading={loading} />

              {loading ? <TableSkeleton columns={7} /> : camadasUrgencia.length === 0 ? (
                <TableEmpty icon={Timer} title="Nenhum lote encontrado" hint="Ajuste os filtros ou a pesquisa." />
              ) : (
                <div className="space-y-2">
                  <TableShell maxHeight="60vh">
                    <table className="w-full text-xs border-collapse">
                      <TableHeadRow>
                        <Th label="Material" />
                        <Th label="Entrada (MIGO)" width="w-36" />
                        <Th label="Consumo Total" width="w-36" />
                        <Th label="Permanência" align="right" width="w-32" />
                        <Th label="Classe" width="w-44" />
                        <Th label="Qtd. Entrada" align="right" width="w-32" />
                        <Th label="Ainda em Estoque" align="right" width="w-36" />
                      </TableHeadRow>
                      <TableBody>
                        {paginar(camadasUrgencia).map((c, idx) => {
                          const faixa = FAIXAS_PERMANENCIA[c.classe_permanencia];
                          return (
                            <Tr key={`${c.material}-${c.data_entrada ?? 'legado'}-${idx}`}
                                accent={c.classe_permanencia === 'antecipada' ? faixa.cor : undefined}
                                title={faixa.descricao}>
                              <Td mono strong>{c.material}</Td>
                              <Td>{c.legado ? (
                                <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Anterior à reabertura</span>
                              ) : formatDateBR(c.data_entrada)}</Td>
                              <Td>{formatDateBR(c.data_consumo_total)}</Td>
                              <Td align="right" numeric>
                                {c.dias_permanencia !== null && c.dias_permanencia !== undefined
                                  ? `${formatInt(c.dias_permanencia)} dias`
                                  : '—'}
                              </Td>
                              <Td>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ background: faixa.cor }} aria-hidden="true" />
                                  <span className="text-[11px] font-semibold">{faixa.rotulo}</span>
                                </span>
                              </Td>
                              <Td align="right" numeric>{formatQtd(c.qtd_entrada)}</Td>
                              <Td align="right" numeric>{formatQtd(c.qtd_remanescente)}</Td>
                            </Tr>
                          );
                        })}
                      </TableBody>
                    </table>
                  </TableShell>
                  <Pagination page={page} totalPages={totalPages(camadasUrgencia.length)} onPageChange={setPage}
                    info={`${camadasUrgencia.length.toLocaleString('pt-BR')} lotes`} />
                </div>
              )}
            </>
          )}
          {/* ---------------------------------------------------------------- */}
          {/* Aba: Estoque Mínimo                                               */}
          {/* ---------------------------------------------------------------- */}
          {aba === 'minimo' && (
            <>
              <MetodoMinimoPanel
                janelaInicio={janelaReposicao?.janela_inicio}
                janelaFim={janelaReposicao?.janela_fim}
                janelaDias={janelaReposicao?.janela_dias}
                leadMediano={leadMediano}
              />

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger">
                <KpiCard
                  label="Repor agora"
                  value={resumoReposicao.find(r => r.recomendacao === 'repor_agora')?.materiais ?? 0}
                  format={formatInt}
                  detail="materiais abaixo do mínimo"
                  icon={AlertCircle}
                  accent="var(--status-critical)"
                  emphasize
                />
                <KpiCard
                  label="Investimento p/ recompor"
                  value={investimentoNecessario}
                  format={formatBRL}
                  detail="para trazer todos ao mínimo"
                  icon={ShoppingCart}
                  accent="var(--series-1)"
                />
                <KpiCard
                  label="Com mínimo definido"
                  value={sugestoes.filter(s => s.minimoSugerido !== null).length}
                  format={formatInt}
                  detail={`de ${formatInt(sugestoes.length)} materiais — os demais não têm demanda suficiente`}
                  icon={ClipboardCheck}
                  accent="var(--status-good)"
                  share={sugestoes.length > 0
                    ? sugestoes.filter(s => s.minimoSugerido !== null).length / sugestoes.length
                    : undefined}
                />
                <KpiCard
                  label="Comprar sob demanda"
                  value={resumoReposicao.find(r => r.recomendacao === 'sob_demanda')?.materiais ?? 0}
                  format={formatInt}
                  detail="demanda rara demais para estocar"
                  icon={Timer}
                  accent="var(--series-3)"
                />
              </div>

              {/* Distribuição das recomendações, clicável para filtrar. */}
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-primary)' }}>
                  O que fazer com cada grupo
                </h3>
                <ul className="space-y-1.5">
                  {resumoReposicao.map(r => (
                    <li key={r.recomendacao}>
                      <button
                        type="button"
                        onClick={() => setRecomendacaoFiltro(
                          recomendacaoFiltro === r.recomendacao ? 'Todos' : r.recomendacao
                        )}
                        className="w-full flex items-center gap-2.5 text-xs rounded px-2 py-1.5 -mx-2 text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
                        style={{
                          outlineColor: r.cor,
                          background: recomendacaoFiltro === r.recomendacao ? 'var(--surface-raised)' : undefined,
                        }}
                      >
                        <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: r.cor }} aria-hidden="true" />
                        <span className="font-semibold flex-1" style={{ color: 'var(--ink-primary)' }}>{r.rotulo}</span>
                        <span className="tabular shrink-0 w-24 text-right" style={{ color: 'var(--ink-muted)' }}>
                          {formatInt(r.materiais)} mat.
                        </span>
                        <span className="tabular shrink-0 w-32 text-right font-semibold" style={{ color: 'var(--ink-primary)' }}>
                          {r.valorCompra > 0 ? formatBRL(r.valorCompra) : formatBRL(r.valorEstoque)}
                        </span>
                        <span className="text-[10px] shrink-0 w-20 text-right" style={{ color: 'var(--ink-muted)' }}>
                          {r.valorCompra > 0 ? 'a comprar' : 'em estoque'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {loading ? <TableSkeleton columns={8} /> : sugestoesOrdenadas.length === 0 ? (
                <TableEmpty icon={ClipboardCheck} title="Nenhum material encontrado" hint="Ajuste os filtros ou a pesquisa." />
              ) : (
                <div className="space-y-2">
                  <TableShell maxHeight="60vh">
                    <table className="w-full text-xs border-collapse">
                      <TableHeadRow>
                        <Th label="Material" />
                        <Th label="Recomendação" width="w-44" />
                        <Th label="Padrão / Confiança" width="w-40" />
                        <Th label="Saldo" align="right" width="w-28" />
                        <Th label="Mínimo Sugerido" align="right" width="w-36" />
                        <Th label="Comprar" align="right" width="w-32" />
                        <Th label="Consumo/dia" align="right" width="w-28" />
                        <Th label="Lead" align="right" width="w-24" />
                      </TableHeadRow>
                      <TableBody>
                        {paginar(sugestoesOrdenadas).map(s => {
                          const faixa = FAIXAS_RECOMENDACAO[s.recomendacao];
                          return (
                            <Tr
                              key={s.material}
                              accent={s.recomendacao === 'repor_agora' ? faixa.cor : undefined}
                              title={s.explicacao}
                            >
                              <Td truncate title={s.descricao || ''}>
                                <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{s.material}</span>
                                {s.descricao ? ` — ${s.descricao}` : ''}
                              </Td>
                              <Td>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ background: faixa.cor }} aria-hidden="true" />
                                  <span className="text-[11px] font-semibold">{faixa.rotulo}</span>
                                </span>
                              </Td>
                              <Td>
                                <span className="text-[11px]" title={EXPLICACAO_PADRAO[s.padrao]}>
                                  {ROTULO_PADRAO[s.padrao]}
                                </span>
                                <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}>
                                  {ROTULO_CONFIANCA[s.confianca]} · {formatInt(s.eventos)} saídas
                                </span>
                              </Td>
                              <Td align="right" numeric>{formatQtd(s.saldo_atual)} {s.umb || ''}</Td>
                              <Td align="right" numeric strong>
                                {s.minimoSugerido !== null ? formatQtd(s.minimoSugerido) : (
                                  <span style={{ color: 'var(--ink-muted)' }} title="Demanda insuficiente para estimar um mínimo.">
                                    não aplicável
                                  </span>
                                )}
                                {s.minimoSugerido !== null && s.diasCobertosPeloMinimo !== null && (
                                  <span className="text-[10px] block font-normal" style={{ color: 'var(--ink-muted)' }}>
                                    cobre {Math.round(s.diasCobertosPeloMinimo)} dias
                                  </span>
                                )}
                              </Td>
                              <Td align="right" numeric>
                                {s.compraSugerida ? (
                                  <>
                                    <span className="font-bold" style={{ color: 'var(--status-critical)' }}>
                                      {formatQtd(s.compraSugerida)}
                                    </span>
                                    {s.valorCompraSugerida !== null && (
                                      <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}>
                                        {formatBRL(s.valorCompraSugerida)}
                                      </span>
                                    )}
                                  </>
                                ) : '—'}
                              </Td>
                              <Td align="right" numeric>{formatQtd(s.consumoDiario)}</Td>
                              <Td align="right" numeric>
                                {formatInt(Math.round(s.leadDias))} d
                                {!s.leadProprio && (
                                  <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}
                                        title="Este material não tem compra rastreável; usada a mediana da fábrica.">
                                    estimado
                                  </span>
                                )}
                              </Td>
                            </Tr>
                          );
                        })}
                      </TableBody>
                    </table>
                  </TableShell>

                  {/* A explicação por linha vive no title da linha, mas o caso
                      selecionado ganha texto à vista — ler tooltip de 40 linhas
                      não é leitura. */}
                  {sugestoesOrdenadas.length > 0 && (
                    <p className="text-[11px] leading-relaxed px-1" style={{ color: 'var(--ink-muted)' }}>
                      <strong style={{ color: 'var(--ink-secondary)' }}>Exemplo — {sugestoesOrdenadas[0].material}:</strong>{' '}
                      {sugestoesOrdenadas[0].explicacao}
                    </p>
                  )}

                  <Pagination page={page} totalPages={totalPages(sugestoesOrdenadas.length)} onPageChange={setPage}
                    info={`${sugestoesOrdenadas.length.toLocaleString('pt-BR')} materiais`} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
