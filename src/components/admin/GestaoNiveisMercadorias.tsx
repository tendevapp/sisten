/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janela de Agrupamento em Níveis do Grupo de Mercadorias (SAP).
 * Permite visualizar, filtrar, classificar e editar o Nível 1 (Classificação)
 * e Nível 2 (Subcategoria) de todos os grupos de mercadoria da tabela `cadastro_grupo_mercadoria`.
 * Suporta digitação de novas subcategorias ("Outro..."), que entram automaticamente
 * para a lista suspensa de seleção nos demais registros.
 * As alterações persistem diretamente no cadastro mestre.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers, Search, RefreshCw, Plus, Edit2, Check,
  Download, ChevronLeft, ChevronRight, X, AlertCircle,
  CornerDownLeft
} from 'lucide-react';
import type { Profile, CadastroGrupoMercadoria } from '../../types';
import * as api from '../../lib/grupoMercadoriaApi';
import { useToast } from '../ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';

interface Props {
  user: Profile;
}

const NIVEIS_1_ORDEM = ['CONSUMÍVEL', 'ESTRUTURAL', 'SERVIÇO', 'IMOBILIZADO', 'FRETE'];

const CORES_NIVEL_1: Record<string, { badge: string; border: string; bgCard: string; text: string }> = {
  'CONSUMÍVEL': {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    border: 'border-emerald-500',
    bgCard: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  'ESTRUTURAL': {
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    border: 'border-blue-500',
    bgCard: 'bg-blue-50/50 dark:bg-blue-950/20',
    text: 'text-blue-700 dark:text-blue-400',
  },
  'SERVIÇO': {
    badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    border: 'border-indigo-500',
    bgCard: 'bg-indigo-50/50 dark:bg-indigo-950/20',
    text: 'text-indigo-700 dark:text-indigo-400',
  },
  'IMOBILIZADO': {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    border: 'border-amber-500',
    bgCard: 'bg-amber-50/50 dark:bg-amber-950/20',
    text: 'text-amber-700 dark:text-amber-400',
  },
  'FRETE': {
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    border: 'border-purple-500',
    bgCard: 'bg-purple-50/50 dark:bg-purple-950/20',
    text: 'text-purple-700 dark:text-purple-400',
  },
};

export default function GestaoNiveisMercadorias({ user }: Props) {
  const toast = useToast();

  // Estados de dados
  const [itens, setItens] = useState<CadastroGrupoMercadoria[]>([]);
  const [totalItens, setTotalItens] = useState(0);
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<api.KpiNiveisMercadorias | null>(null);

  // Taxonomia dinâmica de subcategorias (alimentada pelo banco + padrões + novas digitadas)
  const [taxonomiaDinamica, setTaxonomiaDinamica] = useState<Record<string, string[]>>(api.TAXONOMIA_NIVEIS_PADRAO);

  // Filtros e paginação
  const [busca, setBusca] = useState('');
  const [filtroNivel1, setFiltroNivel1] = useState<string>('TODOS');
  const [filtroNivel2, setFiltroNivel2] = useState<string>('TODOS');
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 50;

  // Seleção múltipla para edição em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalLoteOpen, setModalLoteOpen] = useState(false);
  const [loteNivel1, setLoteNivel1] = useState('CONSUMÍVEL');
  const [loteNivel2, setLoteNivel2] = useState('');
  const [modoLoteNivel2Outro, setModoLoteNivel2Outro] = useState(false);
  const [loteNivel2Custom, setLoteNivel2Custom] = useState('');
  const [salvandoLote, setSalvandoLote] = useState(false);

  // Modal de edição individual / novo
  const [modalEdicaoOpen, setModalEdicaoOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState<CadastroGrupoMercadoria | null>(null);
  const [isNovo, setIsNovo] = useState(false);
  const [formCodigo, setFormCodigo] = useState('');
  const [formDenom, setFormDenom] = useState('');
  const [formDenom2, setFormDenom2] = useState('');
  const [formNivel1, setFormNivel1] = useState('CONSUMÍVEL');
  const [formNivel2, setFormNivel2] = useState('');
  const [modoNivel2Outro, setModoNivel2Outro] = useState(false);
  const [formNivel2Custom, setFormNivel2Custom] = useState('');
  const [salvandoItem, setSalvandoItem] = useState(false);

  // Edição inline de subcategoria customizada ("Outro") na linha da tabela
  const [inlineOutroCodigo, setInlineOutroCodigo] = useState<string | null>(null);
  const [inlineOutroValor, setInlineOutroValor] = useState<string>('');
  const [salvandoInlineOutro, setSalvandoInlineOutro] = useState(false);

  // Carregar taxonomia completa do banco (mesclada com padrões)
  const carregarTaxonomia = useCallback(async () => {
    try {
      const mapa = await api.obterSubcategoriasAgrupadas();
      setTaxonomiaDinamica(mapa);
    } catch {
      // mantém padrão
    }
  }, []);

  useEffect(() => {
    carregarTaxonomia();
  }, [carregarTaxonomia]);

  // Registra uma nova subcategoria localmente para atualização imediata de todas as listas suspensas
  const registrarNovaSubcategoria = useCallback((n1: string, novaSub: string) => {
    const limpa = novaSub.trim();
    if (!limpa) return;
    setTaxonomiaDinamica((prev) => {
      const listaAtual = prev[n1] || [];
      if (listaAtual.includes(limpa)) return prev;
      return {
        ...prev,
        [n1]: [...listaAtual, limpa].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      };
    });
  }, []);

  // Carregamento de KPIs
  const carregarKpis = useCallback(async () => {
    try {
      const res = await api.obterKpisNiveis();
      setKpis(res);
    } catch {
      // Silencioso
    }
  }, []);

  // Carregamento da listagem
  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const { itens: lista, total } = await api.listarGruposMercadorias({
        termoBusca: busca,
        nivel1: filtroNivel1,
        nivel2: filtroNivel2,
        pagina,
        itensPorPagina,
      });
      setItens(lista);
      setTotalItens(total);
    } catch (err: any) {
      toast.error('Erro ao listar grupos de mercadoria: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }, [busca, filtroNivel1, filtroNivel2, pagina, toast]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    carregarKpis();
  }, [carregarKpis]);

  // Opções de Nível 2 baseadas no filtro de Nível 1
  const opcoesNivel2Filtro = useMemo(() => {
    if (filtroNivel1 && filtroNivel1 !== 'TODOS' && taxonomiaDinamica[filtroNivel1]) {
      return taxonomiaDinamica[filtroNivel1];
    }
    const todas = new Set<string>();
    Object.values(taxonomiaDinamica).forEach((lista) => {
      lista.forEach((sub) => todas.add(sub));
    });
    return Array.from(todas).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [filtroNivel1, taxonomiaDinamica]);

  // Opções de Nível 2 para o modal de edição
  const opcoesNivel2Modal = useMemo(() => {
    return taxonomiaDinamica[formNivel1] || [];
  }, [formNivel1, taxonomiaDinamica]);

  // Opções de Nível 2 para o modal de lote
  const opcoesNivel2Lote = useMemo(() => {
    return taxonomiaDinamica[loteNivel1] || [];
  }, [loteNivel1, taxonomiaDinamica]);

  // Abrir modal de edição individual
  const abrirEditar = (item: CadastroGrupoMercadoria) => {
    setIsNovo(false);
    setItemEditando(item);
    setFormCodigo(item.codigo);
    setFormDenom(item.denominacao);
    setFormDenom2(item.denominacao2 || '');
    const n1 = item.classificacao_nivel1 || 'CONSUMÍVEL';
    setFormNivel1(n1);
    setFormNivel2(item.classificacao_nivel2 || '');
    setModoNivel2Outro(false);
    setFormNivel2Custom('');
    setModalEdicaoOpen(true);
  };

  // Abrir modal de novo item
  const abrirNovo = () => {
    setIsNovo(true);
    setItemEditando(null);
    setFormCodigo('');
    setFormDenom('');
    setFormDenom2('');
    setFormNivel1('CONSUMÍVEL');
    const primeiraSub = taxonomiaDinamica['CONSUMÍVEL']?.[0] || '';
    setFormNivel2(primeiraSub);
    setModoNivel2Outro(false);
    setFormNivel2Custom('');
    setModalEdicaoOpen(true);
  };

  // Salvar item individual
  const salvarItem = async () => {
    if (!formCodigo.trim()) {
      toast.error('Informe o código do grupo de mercadoria (ex: B0101).');
      return;
    }
    if (!formDenom.trim()) {
      toast.error('Informe a denominação do grupo.');
      return;
    }

    const subcategoriaFinal = modoNivel2Outro ? formNivel2Custom.trim() : formNivel2.trim();
    if (!subcategoriaFinal) {
      toast.error('Informe ou selecione o Nível 2 (Subcategoria).');
      return;
    }

    setSalvandoItem(true);
    try {
      if (isNovo) {
        await api.criarGrupoMercadoria({
          codigo: formCodigo.trim(),
          denominacao: formDenom.trim(),
          denominacao2: formDenom2.trim() || null,
          classificacao_nivel1: formNivel1,
          classificacao_nivel2: subcategoriaFinal,
        });
        toast.success(`Grupo ${formCodigo.trim()} adicionado com sucesso!`);
      } else {
        await api.atualizarGrupoMercadoria(formCodigo, {
          denominacao: formDenom.trim(),
          denominacao2: formDenom2.trim() || null,
          classificacao_nivel1: formNivel1,
          classificacao_nivel2: subcategoriaFinal,
        });
        toast.success(`Grupo ${formCodigo} atualizado com sucesso!`);
      }

      // Se foi digitada uma nova subcategoria, adiciona à lista dinâmica
      registrarNovaSubcategoria(formNivel1, subcategoriaFinal);

      setModalEdicaoOpen(false);
      carregarDados();
      carregarKpis();
    } catch (err: any) {
      toast.error('Erro ao salvar grupo: ' + (err.message || ''));
    } finally {
      setSalvandoItem(false);
    }
  };

  // Salvar em lote
  const aplicarEdicaoLote = async () => {
    if (selecionados.size === 0) return;
    const subLoteFinal = modoLoteNivel2Outro ? loteNivel2Custom.trim() : loteNivel2.trim();
    if (!loteNivel1 || !subLoteFinal) {
      toast.error('Selecione o Nível 1 e o Nível 2 a serem aplicados.');
      return;
    }

    setSalvandoLote(true);
    try {
      const codigos = Array.from(selecionados);
      const totalAfetados = await api.atualizarGruposEmLote(codigos, {
        classificacao_nivel1: loteNivel1,
        classificacao_nivel2: subLoteFinal,
      });

      // Registra na taxonomia para outras seleções
      registrarNovaSubcategoria(loteNivel1, subLoteFinal);

      toast.success(`${totalAfetados} grupo(s) reclassificado(s) para ${loteNivel1} > ${subLoteFinal}!`);
      setModalLoteOpen(false);
      setSelecionados(new Set());
      carregarDados();
      carregarKpis();
    } catch (err: any) {
      toast.error('Erro ao reclassificar em lote: ' + (err.message || ''));
    } finally {
      setSalvandoLote(false);
    }
  };

  // Alteração inline rápida de Nível 1 e Nível 2
  const alterarNivelRapido = async (
    item: CadastroGrupoMercadoria,
    novoNivel1: string,
    novoNivel2?: string
  ) => {
    const n2 = novoNivel2 !== undefined ? novoNivel2 : (taxonomiaDinamica[novoNivel1]?.[0] || '');
    try {
      await api.atualizarGrupoMercadoria(item.codigo, {
        classificacao_nivel1: novoNivel1,
        classificacao_nivel2: n2,
      });
      setItens((atuais) =>
        atuais.map((i) =>
          i.codigo === item.codigo
            ? { ...i, classificacao_nivel1: novoNivel1, classificacao_nivel2: n2 }
            : i
        )
      );
      toast.success(`Grupo ${item.codigo} atualizado.`);
      carregarKpis();
    } catch (err: any) {
      toast.error('Não foi possível alterar o nível: ' + (err.message || ''));
    }
  };

  // Confirmar subcategoria digitada inline na linha da tabela ("Outro...")
  const confirmarSubcategoriaInline = async (item: CadastroGrupoMercadoria) => {
    const limpa = inlineOutroValor.trim();
    if (!limpa) {
      toast.error('Informe o nome da nova subcategoria.');
      return;
    }

    setSalvandoInlineOutro(true);
    try {
      const n1 = item.classificacao_nivel1 || 'CONSUMÍVEL';
      await api.atualizarGrupoMercadoria(item.codigo, {
        classificacao_nivel1: n1,
        classificacao_nivel2: limpa,
      });

      // Adiciona na taxonomia dinâmica para que apareça em outros registros
      registrarNovaSubcategoria(n1, limpa);

      setItens((atuais) =>
        atuais.map((i) =>
          i.codigo === item.codigo
            ? { ...i, classificacao_nivel2: limpa }
            : i
        )
      );

      toast.success(`Subcategoria "${limpa}" criada e adicionada à lista suspensa.`);
      setInlineOutroCodigo(null);
      setInlineOutroValor('');
      carregarKpis();
    } catch (err: any) {
      toast.error('Erro ao salvar subcategoria: ' + (err.message || ''));
    } finally {
      setSalvandoInlineOutro(false);
    }
  };

  // Toggle seleção de linha
  const alternarSelecao = (codigo: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(codigo)) novo.delete(codigo);
      else novo.add(codigo);
      return novo;
    });
  };

  // Selecionar todos da página
  const alternarTodosDaPagina = () => {
    if (itens.every((i) => selecionados.has(i.codigo))) {
      setSelecionados((prev) => {
        const novo = new Set(prev);
        itens.forEach((i) => novo.delete(i.codigo));
        return novo;
      });
    } else {
      setSelecionados((prev) => {
        const novo = new Set(prev);
        itens.forEach((i) => novo.add(i.codigo));
        return novo;
      });
    }
  };

  // Exportar CSV
  const exportarCsv = () => {
    if (itens.length === 0) {
      toast.info('Nenhum dado para exportar.');
      return;
    }
    const cabecalho = ['Grp.merc.', 'Denom.grupo merc.', 'Denominação 2', 'Nível 1 (Classificação)', 'Nível 2 (Subcategoria)'];
    const linhas = itens.map((i) => [
      `"${i.codigo}"`,
      `"${(i.denominacao || '').replace(/"/g, '""')}"`,
      `"${(i.denominacao2 || '').replace(/"/g, '""')}"`,
      `"${i.classificacao_nivel1 || ''}"`,
      `"${i.classificacao_nivel2 || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `niveis_grupo_mercadoria_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Arquivo CSV gerado com sucesso!');
  };

  const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;

  return (
    <div className="space-y-4">
      {/* Banner Informativo */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  Agrupamento em Níveis do Grupo de Mercadorias (SAP)
                </h3>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                  {totalItens} Grupos Cadastrados
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Estrutura hierárquica em <strong>Nível 1 (Classificação macro)</strong> e <strong>Nível 2 (Subcategoria)</strong>.
                Ao selecionar <em>"+ Outro..."</em> no Nível 2, é possível digitar uma nova subcategoria que <strong>entra automaticamente na lista suspensa</strong> para seleção em outros registros.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportarCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
              title="Exportar CSV"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>
            <button
              type="button"
              onClick={abrirNovo}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Grupo
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards por Nível 1 */}
      {kpis && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {NIVEIS_1_ORDEM.map((n1) => {
            const qtd = kpis.totalNivel1[n1] || 0;
            const pct = kpis.total > 0 ? ((qtd / kpis.total) * 100).toFixed(0) : '0';
            const ativo = filtroNivel1 === n1;
            const estilo = CORES_NIVEL_1[n1];
            const subsQtd = taxonomiaDinamica[n1]?.length || 0;

            return (
              <button
                key={n1}
                type="button"
                onClick={() => {
                  setFiltroNivel1(ativo ? 'TODOS' : n1);
                  setFiltroNivel2('TODOS');
                  setPagina(1);
                }}
                className={`flex flex-col items-start rounded-2xl border p-3 text-left transition-all ${
                  ativo
                    ? `${estilo.border} border-2 ${estilo.bgCard} shadow-sm ring-1 ring-blue-500/20`
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {n1}
                  </span>
                  <span className={`text-[10px] font-bold ${estilo.text}`}>{pct}%</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-extrabold text-slate-900 dark:text-slate-50">
                    {qtd}
                  </span>
                  <span className="text-[11px] text-slate-400">grupos</span>
                </div>
                <span className="mt-1 text-[10px] text-slate-400">
                  {subsQtd} subcategoria(s)
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Campo de Busca */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              placeholder="Buscar por código, denominação..."
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            {busca && (
              <button
                type="button"
                onClick={() => {
                  setBusca('');
                  setPagina(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filtro Nível 1 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Nível 1:</span>
            <select
              value={filtroNivel1}
              onChange={(e) => {
                setFiltroNivel1(e.target.value);
                setFiltroNivel2('TODOS');
                setPagina(1);
              }}
              className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="TODOS">Todos os Níveis 1</option>
              {NIVEIS_1_ORDEM.map((n1) => (
                <option key={n1} value={n1}>
                  {n1}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Nível 2 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Nível 2:</span>
            <select
              value={filtroNivel2}
              onChange={(e) => {
                setFiltroNivel2(e.target.value);
                setPagina(1);
              }}
              className="h-9 max-w-[220px] truncate rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="TODOS">Todas as Subcategorias</option>
              {opcoesNivel2Filtro.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              carregarDados();
              carregarKpis();
              carregarTaxonomia();
            }}
            disabled={loading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            title="Recarregar dados e listas suspensas"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Ações para Linhas Selecionadas */}
        {selecionados.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 dark:bg-blue-950/40">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
              {selecionados.size} selecionado(s)
            </span>
            <button
              type="button"
              onClick={() => {
                setLoteNivel1('CONSUMÍVEL');
                setLoteNivel2(taxonomiaDinamica['CONSUMÍVEL']?.[0] || '');
                setModoLoteNivel2Outro(false);
                setLoteNivel2Custom('');
                setModalLoteOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Edit2 className="h-3 w-3" />
              Reclassificar em Lote
            </button>
            <button
              type="button"
              onClick={() => setSelecionados(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {/* Tabela de Grupos de Mercadoria */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              <tr>
                <th className="w-8 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={itens.length > 0 && itens.every((i) => selecionados.has(i.codigo))}
                    onChange={alternarTodosDaPagina}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-3 py-3">Grp.merc. (Código)</th>
                <th className="px-3 py-3">Denom. grupo merc.</th>
                <th className="px-3 py-3">Denominação 2</th>
                <th className="px-3 py-3">Nível 1 (Classificação)</th>
                <th className="px-3 py-3">Nível 2 (Subcategoria)</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && itens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
                      <span>Carregando grupos de mercadorias...</span>
                    </div>
                  </td>
                </tr>
              ) : itens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Nenhum grupo encontrado
                      </p>
                      <p className="text-xs text-slate-400">
                        Tente ajustar os termos da busca ou os filtros de nível.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                itens.map((item) => {
                  const isSel = selecionados.has(item.codigo);
                  const n1 = item.classificacao_nivel1 || 'SEM NÍVEL';
                  const estiloN1 = CORES_NIVEL_1[n1] || {
                    badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
                  };
                  const subcategoriasLinha = taxonomiaDinamica[item.classificacao_nivel1 || ''] || opcoesNivel2Filtro;
                  const isInlineOutro = inlineOutroCodigo === item.codigo;

                  return (
                    <tr
                      key={item.codigo}
                      className={`transition-colors hover:bg-slate-50/75 dark:hover:bg-slate-800/40 ${
                        isSel ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => alternarSelecao(item.codigo)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {/* Código */}
                      <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100">
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                          {item.codigo}
                        </span>
                      </td>

                      {/* Denominação */}
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {item.denominacao}
                      </td>

                      {/* Denominação 2 */}
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                        {item.denominacao2 || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>

                      {/* Nível 1 - Com dropdown inline para alteração rápida */}
                      <td className="px-3 py-2.5">
                        <select
                          value={item.classificacao_nivel1 || ''}
                          onChange={(e) => alterarNivelRapido(item, e.target.value)}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 ${estiloN1.badge}`}
                        >
                          {NIVEIS_1_ORDEM.map((opt) => (
                            <option key={opt} value={opt} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Nível 2 - Com dropdown inline e suporte a "Outro..." com digitação */}
                      <td className="px-3 py-2.5">
                        {isInlineOutro ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              autoFocus
                              placeholder="Digite nova subcategoria..."
                              value={inlineOutroValor}
                              onChange={(e) => setInlineOutroValor(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  await confirmarSubcategoriaInline(item);
                                } else if (e.key === 'Escape') {
                                  setInlineOutroCodigo(null);
                                }
                              }}
                              className="h-7 w-44 rounded-lg border border-blue-400 bg-white px-2 text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-500 dark:bg-slate-950 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => confirmarSubcategoriaInline(item)}
                              disabled={salvandoInlineOutro || !inlineOutroValor.trim()}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              title="Salvar e adicionar à lista suspensa (Enter)"
                            >
                              {salvandoInlineOutro ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineOutroCodigo(null)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                              title="Cancelar (Esc)"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <select
                            value={item.classificacao_nivel2 || ''}
                            onChange={(e) => {
                              if (e.target.value === '__OUTRO__') {
                                setInlineOutroCodigo(item.codigo);
                                setInlineOutroValor('');
                              } else {
                                alterarNivelRapido(item, item.classificacao_nivel1 || 'CONSUMÍVEL', e.target.value);
                              }
                            }}
                            className="max-w-[210px] truncate rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            <option value="">Selecione a subcategoria...</option>
                            {subcategoriasLinha.map((sub) => (
                              <option key={sub} value={sub}>
                                {sub}
                              </option>
                            ))}
                            <option value="__OUTRO__" className="font-bold text-blue-600 dark:text-blue-400">
                              + Outro (digitar nova)...
                            </option>
                          </select>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => abrirEditar(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          title="Editar cadastro completo"
                        >
                          <Edit2 className="h-3 w-3 text-slate-500" />
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé de Paginação */}
        <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Mostrando <strong>{itens.length > 0 ? (pagina - 1) * itensPorPagina + 1 : 0}</strong> a{' '}
            <strong>{Math.min(pagina * itensPorPagina, totalItens)}</strong> de{' '}
            <strong>{totalItens}</strong> grupos
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1 || loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Página {pagina} de {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas || loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Edição Individual / Novo Grupo */}
      {modalEdicaoOpen && (
        <Modal
          onClose={() => setModalEdicaoOpen(false)}
          ariaLabel={isNovo ? 'Novo Grupo de Mercadoria' : `Editar Grupo ${itemEditando?.codigo}`}
        >
          <ModalHeader onClose={() => setModalEdicaoOpen(false)}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {isNovo ? 'Novo Grupo de Mercadoria' : `Editar Grupo ${itemEditando?.codigo}`}
            </h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4 text-xs">
              {/* Código */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Código do Grupo de Mercadoria (SAP) *
                </label>
                <input
                  type="text"
                  disabled={!isNovo}
                  value={formCodigo}
                  onChange={(e) => setFormCodigo(e.target.value.toUpperCase())}
                  placeholder="Ex: B0101, M07001..."
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:disabled:bg-slate-800"
                />
              </div>

              {/* Denominação */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Denominação do Grupo de Mercadoria *
                </label>
                <input
                  type="text"
                  value={formDenom}
                  onChange={(e) => setFormDenom(e.target.value)}
                  placeholder="Ex: ABRASIVOS DISCO, LIXA E REBOLO"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>

              {/* Denominação 2 */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Denominação 2 (Descrição ampliada / detalhes)
                </label>
                <input
                  type="text"
                  value={formDenom2}
                  onChange={(e) => setFormDenom2(e.target.value)}
                  placeholder="Ex: ABRASIVOS DISCO, LIXA E REBOLO x"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>

              {/* Nível 1 */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Nível 1 (Classificação Macro) *
                </label>
                <select
                  value={formNivel1}
                  onChange={(e) => {
                    const novoN1 = e.target.value;
                    setFormNivel1(novoN1);
                    setFormNivel2(taxonomiaDinamica[novoN1]?.[0] || '');
                    setModoNivel2Outro(false);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                >
                  {NIVEIS_1_ORDEM.map((n1) => (
                    <option key={n1} value={n1}>
                      {n1}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nível 2 */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Nível 2 (Subcategoria) *
                  </label>
                  {modoNivel2Outro && (
                    <button
                      type="button"
                      onClick={() => setModoNivel2Outro(false)}
                      className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      ← Voltar à lista existente
                    </button>
                  )}
                </div>

                {modoNivel2Outro ? (
                  <div className="mt-1">
                    <input
                      type="text"
                      autoFocus
                      value={formNivel2Custom}
                      onChange={(e) => setFormNivel2Custom(e.target.value)}
                      placeholder="Digite o nome da nova subcategoria..."
                      className="h-9 w-full rounded-lg border border-blue-400 bg-white px-2.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-blue-500 dark:bg-slate-950 dark:text-slate-50"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Esta subcategoria será salva e entrará automaticamente para a lista suspensa de outros grupos.
                    </p>
                  </div>
                ) : (
                  <select
                    value={formNivel2}
                    onChange={(e) => {
                      if (e.target.value === '__OUTRO__') {
                        setModoNivel2Outro(true);
                        setFormNivel2Custom('');
                      } else {
                        setFormNivel2(e.target.value);
                      }
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                  >
                    <option value="">Selecione a subcategoria...</option>
                    {opcoesNivel2Modal.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                    <option value="__OUTRO__" className="font-bold text-blue-600 dark:text-blue-400">
                      + Outro (digitar nova subcategoria)...
                    </option>
                  </select>
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setModalEdicaoOpen(false)}
              disabled={salvandoItem}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvarItem}
              disabled={salvandoItem}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {salvandoItem ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {isNovo ? 'Cadastrar Grupo' : 'Salvar Alterações'}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Modal: Reclassificação em Lote */}
      {modalLoteOpen && (
        <Modal
          onClose={() => setModalLoteOpen(false)}
          ariaLabel={`Reclassificar ${selecionados.size} grupo(s) em lote`}
        >
          <ModalHeader onClose={() => setModalLoteOpen(false)}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Reclassificar {selecionados.size} grupo(s) em lote
            </h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                Escolha a nova classificação que será atribuída simultaneamente a todos os <strong>{selecionados.size}</strong> grupos selecionados.
              </p>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Novo Nível 1 (Classificação Macro) *
                </label>
                <select
                  value={loteNivel1}
                  onChange={(e) => {
                    const n1 = e.target.value;
                    setLoteNivel1(n1);
                    setLoteNivel2(taxonomiaDinamica[n1]?.[0] || '');
                    setModoLoteNivel2Outro(false);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                >
                  {NIVEIS_1_ORDEM.map((n1) => (
                    <option key={n1} value={n1}>
                      {n1}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Novo Nível 2 (Subcategoria) *
                  </label>
                  {modoLoteNivel2Outro && (
                    <button
                      type="button"
                      onClick={() => setModoLoteNivel2Outro(false)}
                      className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      ← Voltar à lista existente
                    </button>
                  )}
                </div>

                {modoLoteNivel2Outro ? (
                  <div className="mt-1">
                    <input
                      type="text"
                      autoFocus
                      value={loteNivel2Custom}
                      onChange={(e) => setLoteNivel2Custom(e.target.value)}
                      placeholder="Digite o nome da nova subcategoria..."
                      className="h-9 w-full rounded-lg border border-blue-400 bg-white px-2.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-blue-500 dark:bg-slate-950 dark:text-slate-50"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Esta subcategoria será associada aos {selecionados.size} grupos e ficará disponível para os demais.
                    </p>
                  </div>
                ) : (
                  <select
                    value={loteNivel2}
                    onChange={(e) => {
                      if (e.target.value === '__OUTRO__') {
                        setModoLoteNivel2Outro(true);
                        setLoteNivel2Custom('');
                      } else {
                        setLoteNivel2(e.target.value);
                      }
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                  >
                    <option value="">Selecione a subcategoria...</option>
                    {opcoesNivel2Lote.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                    <option value="__OUTRO__" className="font-bold text-blue-600 dark:text-blue-400">
                      + Outro (digitar nova subcategoria)...
                    </option>
                  </select>
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setModalLoteOpen(false)}
              disabled={salvandoLote}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={aplicarEdicaoLote}
              disabled={salvandoLote || (!modoLoteNivel2Outro && !loteNivel2) || (modoLoteNivel2Outro && !loteNivel2Custom.trim())}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {salvandoLote ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Aplicar em {selecionados.size} grupo(s)
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
