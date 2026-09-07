/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Componente de Gestão e Cadastro de Grupos Compradores x Grupos de Mercadorias (SAP).
 * Permite associar, reatribuir e consultar quais grupos de materiais pertencem a cada comprador.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes, Users, Plus, Search, Trash2, Edit2, CheckCircle2, XCircle,
  RefreshCw, Filter, Layers, Download, ChevronLeft, ChevronRight,
  TrendingUp, ShoppingCart, FileText, Check, AlertCircle, Sparkles,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import type { Profile, GrupoCompradorMercadoria, CompradorCadastro } from '../../types';
import * as api from '../../lib/grupoCompradorApi';
import * as apiNiveis from '../../lib/grupoMercadoriaApi';
import { useToast } from '../ui/Toast';
import Modal, { ModalBody, ModalFooter } from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';

interface Props {
  user: Profile;
}

const ITENS_POR_PAGINA = 25;

type ColunaOrdenacao = 'nivel1' | 'nivel2' | 'codigo' | 'nome' | 'comprador' | 'volume' | 'status';

const NIVEIS_1_ORDEM = ['CONSUMÍVEL', 'ESTRUTURAL', 'SERVIÇO', 'IMOBILIZADO', 'FRETE'];

const CORES_NIVEL_1: Record<string, { badge: string; text: string }> = {
  'CONSUMÍVEL': {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  'ESTRUTURAL': {
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-400',
  },
  'SERVIÇO': {
    badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    text: 'text-indigo-700 dark:text-indigo-400',
  },
  'IMOBILIZADO': {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
  },
  'FRETE': {
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-400',
  },
};

export default function GestaoGrupoComprador({ user }: Props) {
  const toast = useToast();

  // Estados principais
  const [vinculos, setVinculos] = useState<GrupoCompradorMercadoria[]>([]);
  const [compradores, setCompradores] = useState<CompradorCadastro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Taxonomia dinamica de subcategorias (alimentada pelo banco + padroes)
  const [taxonomia, setTaxonomia] = useState<Record<string, string[]>>(apiNiveis.TAXONOMIA_NIVEIS_PADRAO);

  // Filtros e busca
  const [busca, setBusca] = useState('');
  const [filtroComprador, setFiltroComprador] = useState<string>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');
  const [filtroNivel1, setFiltroNivel1] = useState<string>('TODOS');
  const [filtroNivel2, setFiltroNivel2] = useState<string>('TODOS');
  const [paginaAtual, setPaginaAtual] = useState(1);

  // Ordenacao em todas as colunas
  const [colunaOrdenacao, setColunaOrdenacao] = useState<ColunaOrdenacao>('nivel1');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<'asc' | 'desc'>('asc');

  // Selecao em massa
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalLoteAberto, setModalLoteAberto] = useState(false);
  const [loteModo, setLoteModo] = useState<'comprador_unico' | 'sugestao_niveis'>('comprador_unico');
  const [loteGrupoCompras, setLoteGrupoCompras] = useState('358');
  const [salvandoLote, setSalvandoLote] = useState(false);

  const alternarOrdenacao = (coluna: ColunaOrdenacao) => {
    if (colunaOrdenacao === coluna) {
      setDirecaoOrdenacao((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setColunaOrdenacao(coluna);
      setDirecaoOrdenacao('asc');
    }
    setPaginaAtual(1);
  };

  // Modal Novo / Edicao
  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState<GrupoCompradorMercadoria | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Formulario do Modal
  const [formCodigo, setFormCodigo] = useState('');
  const [formNome, setFormNome] = useState('');
  const [formClassificacao, setFormClassificacao] = useState('CONSUMÍVEL');
  const [formNivel2, setFormNivel2] = useState('');
  const [modoNivel2Outro, setModoNivel2Outro] = useState(false);
  const [formGrupoCompras, setFormGrupoCompras] = useState('358');
  const [formObservacao, setFormObservacao] = useState('');
  const [formAtivo, setFormAtivo] = useState(true);
  const [sugestaoModal, setSugestaoModal] = useState<{ grupo_compras: string; motivo: string } | null>(null);

  // Busca do catalogo SAP no modal
  const [buscaSap, setBuscaSap] = useState('');
  const [catalogoSap, setCatalogoSap] = useState<api.GrupoMercadoriaSapItem[]>([]);
  const [buscandoSap, setBuscandoSap] = useState(false);

  // Modal de Exclusao
  const [itemParaExcluir, setItemParaExcluir] = useState<GrupoCompradorMercadoria | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Carregamento inicial de dados
  const carregarDados = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [comps, vincs] = await Promise.all([
        api.listarCompradores(),
        api.listarGruposCompradoresMercadorias(),
      ]);
      setCompradores(comps);
      setVinculos(vincs);
    } catch (err: any) {
      console.error('Erro ao carregar dados de grupos compradores:', err);
      setErro(err.message || 'Falha ao carregar vínculos.');
      toast.error('Erro ao carregar grupos compradores: ' + (err.message || ''));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
    apiNiveis.obterSubcategoriasAgrupadas()
      .then((mapa) => setTaxonomia(mapa))
      .catch((e) => console.warn('Erro ao carregar taxonomia:', e));
  }, []);

  // Busca grupos no catalogo SAP com debounce
  useEffect(() => {
    if (!modalAberto || !buscaSap.trim()) {
      setCatalogoSap([]);
      return;
    }
    const timer = setTimeout(async () => {
      setBuscandoSap(true);
      try {
        const resultados = await api.buscarGruposMercadoriaSap(buscaSap);
        setCatalogoSap(resultados);
      } catch (e) {
        console.warn('Erro ao buscar SAP:', e);
      } finally {
        setBuscandoSap(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [buscaSap, modalAberto]);

  // Estatisticas agregadas por comprador
  const estatisticas = useMemo(() => {
    const totalVinculos = vinculos.length;
    const mapa = new Map<string, { total: number; pedidos: number; valor: number; reqs: number }>();

    compradores.forEach((c) => {
      mapa.set(c.grupo_compras, { total: 0, pedidos: 0, valor: 0, reqs: 0 });
    });

    vinculos.forEach((v) => {
      const entry = mapa.get(v.grupo_compras) || { total: 0, pedidos: 0, valor: 0, reqs: 0 };
      entry.total += 1;
      entry.pedidos += v.total_pedidos || 0;
      entry.valor += v.total_valor || 0;
      entry.reqs += v.total_requisicoes || 0;
      mapa.set(v.grupo_compras, entry);
    });

    return { totalVinculos, mapa };
  }, [vinculos, compradores]);

  // Opcoes de subcategoria dinamicas para o filtro de Nivel 2
  const opcoesNivel2Filtro = useMemo(() => {
    const set = new Set<string>();
    vinculos.forEach((v) => {
      if (v.classificacao_nivel2?.trim()) {
        if (filtroNivel1 === 'TODOS' || v.classificacao_nivel1 === filtroNivel1) {
          set.add(v.classificacao_nivel2.trim());
        }
      }
    });
    if (filtroNivel1 !== 'TODOS' && taxonomia[filtroNivel1]) {
      taxonomia[filtroNivel1].forEach((s) => set.add(s));
    } else if (filtroNivel1 === 'TODOS') {
      Object.values(taxonomia).forEach((lista) => lista.forEach((s) => set.add(s)));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [vinculos, filtroNivel1, taxonomia]);

  // Filtragem dos vinculos
  const vinculosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return vinculos.filter((v) => {
      if (filtroComprador !== 'TODOS' && v.grupo_compras !== filtroComprador) {
        return false;
      }
      if (filtroStatus === 'ATIVOS' && !v.ativo) return false;
      if (filtroStatus === 'INATIVOS' && v.ativo) return false;
      if (filtroNivel1 !== 'TODOS' && v.classificacao_nivel1 !== filtroNivel1) return false;
      if (filtroNivel2 !== 'TODOS' && v.classificacao_nivel2 !== filtroNivel2) return false;

      if (!termo) return true;
      const cod = v.grupo_mercadoria_codigo.toLowerCase();
      const nome = v.grupo_mercadoria_nome.toLowerCase();
      const comp = v.nome_comprador.toLowerCase();
      const clas1 = (v.classificacao_nivel1 || '').toLowerCase();
      const clas2 = (v.classificacao_nivel2 || '').toLowerCase();
      const obs = (v.observacao || '').toLowerCase();

      return (
        cod.includes(termo) ||
        nome.includes(termo) ||
        comp.includes(termo) ||
        clas1.includes(termo) ||
        clas2.includes(termo) ||
        obs.includes(termo)
      );
    });
  }, [vinculos, busca, filtroComprador, filtroStatus, filtroNivel1, filtroNivel2]);

  // Ordenacao dos vinculos filtrados
  const vinculosOrdenados = useMemo(() => {
    const lista = [...vinculosFiltrados];
    lista.sort((a, b) => {
      let comp = 0;
      switch (colunaOrdenacao) {
        case 'nivel1': {
          const valA = a.classificacao_nivel1 || '';
          const valB = b.classificacao_nivel1 || '';
          comp = valA.localeCompare(valB, 'pt-BR');
          break;
        }
        case 'nivel2': {
          const valA = a.classificacao_nivel2 || '';
          const valB = b.classificacao_nivel2 || '';
          comp = valA.localeCompare(valB, 'pt-BR');
          break;
        }
        case 'codigo': {
          comp = a.grupo_mercadoria_codigo.localeCompare(b.grupo_mercadoria_codigo, 'pt-BR', { numeric: true });
          break;
        }
        case 'nome': {
          comp = (a.grupo_mercadoria_nome || '').localeCompare(b.grupo_mercadoria_nome || '', 'pt-BR');
          break;
        }
        case 'comprador': {
          const nomeA = a.nome_comprador || a.grupo_compras;
          const nomeB = b.nome_comprador || b.grupo_compras;
          comp = nomeA.localeCompare(nomeB, 'pt-BR');
          break;
        }
        case 'volume': {
          const pedA = a.total_pedidos || 0;
          const pedB = b.total_pedidos || 0;
          comp = pedA - pedB;
          if (comp === 0) {
            comp = (a.total_valor || 0) - (b.total_valor || 0);
          }
          break;
        }
        case 'status': {
          const stA = a.ativo ? 1 : 0;
          const stB = b.ativo ? 1 : 0;
          comp = stA - stB;
          break;
        }
      }

      // Desempate estavel por codigo SAP
      if (comp === 0) {
        comp = a.grupo_mercadoria_codigo.localeCompare(b.grupo_mercadoria_codigo, 'pt-BR', { numeric: true });
      }

      return direcaoOrdenacao === 'asc' ? comp : -comp;
    });
    return lista;
  }, [vinculosFiltrados, colunaOrdenacao, direcaoOrdenacao]);

  // Paginacao
  const totalPaginas = Math.ceil(vinculosOrdenados.length / ITENS_POR_PAGINA) || 1;
  const vinculosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    return vinculosOrdenados.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [vinculosOrdenados, paginaAtual]);

  // Logica e operacoes de selecao em massa
  const idsPagina = useMemo(() => vinculosPaginados.map((v) => v.id), [vinculosPaginados]);
  const todosPaginaSelecionados = idsPagina.length > 0 && idsPagina.every((id) => selecionados.has(id));
  const algunsPaginaSelecionados = idsPagina.some((id) => selecionados.has(id)) && !todosPaginaSelecionados;

  const alternarSelecao = (id: string) => {
    setSelecionados((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) {
        prox.delete(id);
      } else {
        prox.add(id);
      }
      return prox;
    });
  };

  const alternarTodosDaPagina = () => {
    setSelecionados((prev) => {
      const prox = new Set(prev);
      if (todosPaginaSelecionados) {
        idsPagina.forEach((id) => prox.delete(id));
      } else {
        idsPagina.forEach((id) => prox.add(id));
      }
      return prox;
    });
  };

  const selecionarTodosFiltrados = () => {
    setSelecionados(new Set(vinculosFiltrados.map((v) => v.id)));
  };

  const limparSelecao = () => {
    setSelecionados(new Set());
  };

  const abrirModalLote = () => {
    if (selecionados.size === 0) {
      toast.error('Selecione ao menos um grupo para editar em massa.');
      return;
    }
    const primeiroAtivo = compradores.find((c) => c.ativo !== false)?.grupo_compras || '358';
    setLoteGrupoCompras(primeiroAtivo);
    setLoteModo('comprador_unico');
    setModalLoteAberto(true);
  };

  const salvarEdicaoLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selecionados.size === 0) return;

    setSalvandoLote(true);
    try {
      const idsArray = Array.from(selecionados);

      if (loteModo === 'comprador_unico') {
        const compInfo = compradores.find((c) => c.grupo_compras === loteGrupoCompras);
        const nomeComprador = compInfo?.nome_comprador || `Comprador ${loteGrupoCompras}`;

        await api.atualizarCompradorEmLote(idsArray, loteGrupoCompras, nomeComprador);

        setVinculos((atuais) =>
          atuais.map((v) =>
            selecionados.has(v.id)
              ? { ...v, grupo_compras: loteGrupoCompras, nome_comprador: nomeComprador }
              : v
          )
        );

        toast.success(
          `${idsArray.length} ${idsArray.length === 1 ? 'grupo atualizado' : 'grupos atualizados'} para ${nomeComprador} (${loteGrupoCompras})!`
        );
      } else {
        // Sugestao automatica por Niveis
        const itensSelecionados = vinculos.filter((v) => selecionados.has(v.id));
        const atualizacoes = itensSelecionados.map((v) => {
          const sug = api.sugerirCompradorPorNiveis(
            v.classificacao_nivel1,
            v.classificacao_nivel2,
            vinculos
          );
          const comp = compradores.find((c) => c.grupo_compras === sug.grupo_compras);
          return {
            id: v.id,
            grupo_compras: sug.grupo_compras,
            nome_comprador: comp?.nome_comprador || `Comprador ${sug.grupo_compras}`,
          };
        });

        await api.atualizarCompradoresIndividuaisEmLote(atualizacoes);

        const mapaNovos = new Map(atualizacoes.map((a) => [a.id, a]));
        setVinculos((atuais) =>
          atuais.map((v) => {
            const nova = mapaNovos.get(v.id);
            return nova
              ? { ...v, grupo_compras: nova.grupo_compras, nome_comprador: nova.nome_comprador }
              : v;
          })
        );

        toast.success(
          `Sugestões inteligentes por nível aplicadas com sucesso a ${atualizacoes.length} grupos!`
        );
      }

      setModalLoteAberto(false);
      setSelecionados(new Set());
    } catch (err: any) {
      console.error('Erro ao editar em lote:', err);
      toast.error('Erro ao atualizar em lote: ' + (err.message || ''));
    } finally {
      setSalvandoLote(false);
    }
  };

  // Handlers do Modal
  const abrirModalNovo = () => {
    setItemEditando(null);
    setFormCodigo('');
    setFormNome('');
    setFormClassificacao('CONSUMÍVEL');
    const subs = taxonomia['CONSUMÍVEL'] || [];
    const n2Inicial = subs[0] || '';
    setFormNivel2(n2Inicial);
    setModoNivel2Outro(false);
    const sug = api.sugerirCompradorPorNiveis('CONSUMÍVEL', n2Inicial, vinculos);
    setFormGrupoCompras(sug.grupo_compras);
    setSugestaoModal(sug);
    setFormObservacao('');
    setFormAtivo(true);
    setBuscaSap('');
    setCatalogoSap([]);
    setModalAberto(true);
  };

  const abrirModalEditar = (item: GrupoCompradorMercadoria) => {
    setItemEditando(item);
    setFormCodigo(item.grupo_mercadoria_codigo);
    setFormNome(item.grupo_mercadoria_nome);
    const n1 = item.classificacao_nivel1 || 'CONSUMÍVEL';
    const n2 = item.classificacao_nivel2 || '';
    setFormClassificacao(n1);
    setFormNivel2(n2);
    const pertenceTaxonomia = !n2 || (taxonomia[n1] || []).includes(n2);
    setModoNivel2Outro(!pertenceTaxonomia);
    setFormGrupoCompras(item.grupo_compras);
    const sug = api.sugerirCompradorPorNiveis(n1, n2, vinculos);
    setSugestaoModal(sug);
    setFormObservacao(item.observacao || '');
    setFormAtivo(item.ativo);
    setBuscaSap('');
    setCatalogoSap([]);
    setModalAberto(true);
  };

  const selecionarGrupoSap = (itemSap: api.GrupoMercadoriaSapItem) => {
    setFormCodigo(itemSap.codigo);
    setFormNome(itemSap.denominacao || itemSap.denominacao2 || itemSap.codigo);
    const n1 = itemSap.classificacao_nivel1 || 'CONSUMÍVEL';
    const n2 = itemSap.classificacao_nivel2 || '';
    setFormClassificacao(n1);
    setFormNivel2(n2);
    const pertenceTaxonomia = !n2 || (taxonomia[n1] || []).includes(n2);
    setModoNivel2Outro(!pertenceTaxonomia);
    const sug = api.sugerirCompradorPorNiveis(n1, n2, vinculos);
    setFormGrupoCompras(sug.grupo_compras);
    setSugestaoModal(sug);
    setBuscaSap('');
    setCatalogoSap([]);
  };

  const mudarNivel1Modal = (novoN1: string) => {
    setFormClassificacao(novoN1);
    const subs = taxonomia[novoN1] || [];
    const novoN2 = subs.includes(formNivel2) ? formNivel2 : (subs[0] || '');
    setFormNivel2(novoN2);
    const sug = api.sugerirCompradorPorNiveis(novoN1, novoN2, vinculos);
    setSugestaoModal(sug);
    setFormGrupoCompras(sug.grupo_compras);
  };

  const mudarNivel2Modal = (novoN2: string) => {
    setFormNivel2(novoN2);
    const sug = api.sugerirCompradorPorNiveis(formClassificacao, novoN2, vinculos);
    setSugestaoModal(sug);
    setFormGrupoCompras(sug.grupo_compras);
  };

  const salvarFormulario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCodigo.trim()) {
      toast.error('Informe o código do grupo de mercadorias.');
      return;
    }
    if (!formNome.trim()) {
      toast.error('Informe a denominação do grupo.');
      return;
    }

    setSalvando(true);
    try {
      const compInfo = compradores.find((c) => c.grupo_compras === formGrupoCompras);
      const salvo = await api.salvarVinculoGrupoComprador({
        id: itemEditando?.id,
        grupo_compras: formGrupoCompras,
        nome_comprador: compInfo?.nome_comprador || `Comprador ${formGrupoCompras}`,
        grupo_mercadoria_codigo: formCodigo.trim().toUpperCase(),
        grupo_mercadoria_nome: formNome.trim(),
        classificacao_nivel1: formClassificacao.trim() || null,
        classificacao_nivel2: formNivel2.trim() || null,
        observacao: formObservacao.trim() || null,
        ativo: formAtivo,
      });

      setVinculos((atuais) => {
        const index = atuais.findIndex((i) => i.grupo_mercadoria_codigo === salvo.grupo_mercadoria_codigo);
        if (index >= 0) {
          const copia = [...atuais];
          copia[index] = { ...copia[index], ...salvo };
          return copia;
        }
        return [salvo, ...atuais];
      });

      toast.success(`Vínculo do grupo ${salvo.grupo_mercadoria_codigo} salvo com sucesso!`);
      setModalAberto(false);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  // Reatribuicao rapida na linha
  const mudarCompradorLinha = async (item: GrupoCompradorMercadoria, novoGrupoCompras: string) => {
    if (item.grupo_compras === novoGrupoCompras) return;
    const compInfo = compradores.find((c) => c.grupo_compras === novoGrupoCompras);
    const novoNome = compInfo?.nome_comprador || `Comprador ${novoGrupoCompras}`;

    try {
      await api.reatribuirGrupoComprador(item.id, novoGrupoCompras, novoNome);
      setVinculos((atuais) =>
        atuais.map((i) =>
          i.id === item.id
            ? { ...i, grupo_compras: novoGrupoCompras, nome_comprador: novoNome }
            : i
        )
      );
      toast.success(`Grupo ${item.grupo_mercadoria_codigo} reatribuído para ${novoNome} (${novoGrupoCompras})`);
    } catch (err: any) {
      toast.error('Erro ao reatribuir: ' + (err.message || ''));
    }
  };

  // Alternar ativo/inativo
  const alternarAtivoLinha = async (item: GrupoCompradorMercadoria) => {
    try {
      const novoStatus = !item.ativo;
      await api.salvarVinculoGrupoComprador({
        id: item.id,
        grupo_compras: item.grupo_compras,
        nome_comprador: item.nome_comprador,
        grupo_mercadoria_codigo: item.grupo_mercadoria_codigo,
        grupo_mercadoria_nome: item.grupo_mercadoria_nome,
        ativo: novoStatus,
      });

      setVinculos((atuais) =>
        atuais.map((i) => (i.id === item.id ? { ...i, ativo: novoStatus } : i))
      );
      toast.success(`Grupo ${item.grupo_mercadoria_codigo} ${novoStatus ? 'ativado' : 'inativado'}.`);
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + (err.message || ''));
    }
  };

  // Exclusao de vinculo
  const confirmarExclusao = async () => {
    if (!itemParaExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirVinculoGrupoComprador(itemParaExcluir.id);
      setVinculos((atuais) => atuais.filter((i) => i.id !== itemParaExcluir.id));
      setSelecionados((prev) => {
        const prox = new Set(prev);
        prox.delete(itemParaExcluir.id);
        return prox;
      });
      toast.success(`Vínculo do grupo ${itemParaExcluir.grupo_mercadoria_codigo} removido.`);
      setItemParaExcluir(null);
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + (err.message || ''));
    } finally {
      setExcluindo(false);
    }
  };

  // Exportar para CSV
  const exportarCsv = () => {
    if (vinculosFiltrados.length === 0) {
      toast.error('Nenhum registro para exportar.');
      return;
    }
    const cabecalho = [
      'Nivel_1_Classificacao',
      'Nivel_2_Subcategoria',
      'Codigo_Grupo',
      'Denominacao_Grupo',
      'Codigo_Comprador',
      'Nome_Comprador',
      'Status',
      'Qtd_Pedidos_05_2026',
      'Valor_Pedidos_05_2026',
      'Qtd_Requisicoes_05_2026',
      'Observacao',
    ];

    const linhas = vinculosOrdenados.map((v) => [
      `"${(v.classificacao_nivel1 || '').replace(/"/g, '""')}"`,
      `"${(v.classificacao_nivel2 || '').replace(/"/g, '""')}"`,
      `"${v.grupo_mercadoria_codigo}"`,
      `"${(v.grupo_mercadoria_nome || '').replace(/"/g, '""')}"`,
      `"${v.grupo_compras}"`,
      `"${(v.nome_comprador || '').replace(/"/g, '""')}"`,
      v.ativo ? 'ATIVO' : 'INATIVO',
      v.total_pedidos || 0,
      (v.total_valor || 0).toFixed(2),
      v.total_requisicoes || 0,
      `"${(v.observacao || '').replace(/"/g, '""')}"`,
    ]);

    const conteudo = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n');
    const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `grupos_compradores_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Arquivo CSV exportado com sucesso!');
  };

  // Formatador de Moeda BRL
  const formatarMoeda = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Helper para renderizar cabecalho de coluna ordenavel
  const renderThOrdenavel = (
    coluna: ColunaOrdenacao,
    label: string,
    className = 'px-3 py-3',
    alinhamento: 'left' | 'center' | 'right' = 'left'
  ) => {
    const ativa = colunaOrdenacao === coluna;
    return (
      <th
        className={`${className} font-bold select-none cursor-pointer`}
        scope="col"
        aria-sort={ativa ? (direcaoOrdenacao === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => alternarOrdenacao(coluna)}
          className={`group inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer ${
            alinhamento === 'center'
              ? 'mx-auto justify-center'
              : alinhamento === 'right'
              ? 'ml-auto justify-end'
              : 'justify-start'
          } ${ativa ? 'text-blue-600 dark:text-blue-400 font-extrabold' : 'text-slate-500 dark:text-slate-400'}`}
          title={`Clique para ordenar por ${label} (${ativa && direcaoOrdenacao === 'asc' ? 'decrescente' : 'crescente'})`}
        >
          <span>{label}</span>
          {ativa ? (
            direcaoOrdenacao === 'asc' ? (
              <ArrowUp className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40 group-hover:opacity-80" />
          )}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      {/* Banner Explicativo */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
            <Boxes className="h-5 w-5" />
          </span>
          <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
                Gestão e Cadastro de Grupos Compradores
              </p>
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
                Análise 05/2026+ Ativa
              </span>
            </div>
            <p className="mt-1">
              Define os grupos de mercadorias (<strong>grp_mercads / grupo_de_mercadorias</strong>) vinculados ao
              código de cada comprador da equipe (ex.: <strong>358</strong> para Isadora / EPI, solda, tintas;{' '}
              <strong>575</strong> para André / medicamentos, TI; <strong>314</strong> para Itana / parafusos, higiene;{' '}
              <strong>610</strong> para Giulia / pisos, tubulações). Compradores inativos (ex.: <strong>602</strong> - Jamille) não recebem novos grupos.
            </p>
          </div>
        </div>
      </div>

      {erro && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Cards de Resumo / Filtro Rapido por Comprador */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Card Total Geral */}
        <button
          type="button"
          onClick={() => {
            setFiltroComprador('TODOS');
            setPaginaAtual(1);
          }}
          className={`flex flex-col rounded-2xl border p-3 text-left transition-all ${
            filtroComprador === 'TODOS'
              ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30'
              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Todos os Grupos
            </span>
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-50">
            {estatisticas.totalVinculos}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Mapeados no SAP
          </span>
        </button>

        {/* Cards por Comprador */}
        {compradores.map((comp) => {
          const stats = estatisticas.mapa.get(comp.grupo_compras) || { total: 0, pedidos: 0, valor: 0, reqs: 0 };
          const selecionado = filtroComprador === comp.grupo_compras;
          const isInativo = comp.ativo === false;
          return (
            <button
              key={comp.grupo_compras}
              type="button"
              onClick={() => {
                setFiltroComprador(comp.grupo_compras);
                setPaginaAtual(1);
              }}
              className={`flex flex-col rounded-2xl border p-3 text-left transition-all ${
                selecionado
                  ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
              } ${isInativo ? 'opacity-65 border-dashed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Cód. {comp.grupo_compras}
                </span>
                <div className="flex items-center gap-1">
                  {isInativo && (
                    <span className="rounded bg-rose-100 px-1 py-0.2 text-[9px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                      Inativo
                    </span>
                  )}
                  <span className={`h-2 w-2 rounded-full ${isInativo ? 'bg-slate-300 dark:bg-slate-600' : 'bg-emerald-500'}`} />
                </div>
              </div>
              <span className="mt-1.5 truncate text-xs font-bold text-slate-900 dark:text-slate-50">
                {comp.nome_comprador}
              </span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-lg font-black text-slate-900 dark:text-slate-50">
                  {stats.total}
                </span>
                <span className="text-[10px] text-slate-400">
                  grupos
                </span>
              </div>
              <div className="mt-1 border-t border-slate-100 pt-1 text-[10px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
                {stats.pedidos} pedidos (05/26+)
              </div>
            </button>
          );
        })}
      </div>

      {/* Barra de Ferramentas e Filtros */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {/* Campo de Busca */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPaginaAtual(1);
              }}
              placeholder="Buscar por código, denominação, nível ou comprador..."
              className="h-9 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            />
          </div>

          {/* Filtro Nível 1 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Nível 1:</span>
            <select
              value={filtroNivel1}
              onChange={(e) => {
                setFiltroNivel1(e.target.value);
                setFiltroNivel2('TODOS');
                setPaginaAtual(1);
              }}
              className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
            >
              <option value="TODOS">Todos Níveis 1</option>
              {NIVEIS_1_ORDEM.map((n1) => (
                <option key={n1} value={n1}>
                  {n1}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Nível 2 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Nível 2:</span>
            <select
              value={filtroNivel2}
              onChange={(e) => {
                setFiltroNivel2(e.target.value);
                setPaginaAtual(1);
              }}
              className="h-9 max-w-[190px] truncate rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
            >
              <option value="TODOS">Todas Subcategorias</option>
              {opcoesNivel2Filtro.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Status */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
            {(['TODOS', 'ATIVOS', 'INATIVOS'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setFiltroStatus(st);
                  setPaginaAtual(1);
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  filtroStatus === st
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-50'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {st === 'TODOS' ? 'Todos' : st === 'ATIVOS' ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>
        </div>

        {/* Botoes de Acao */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={carregarDados}
            disabled={carregando}
            title="Atualizar lista"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={exportarCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>

          <button
            type="button"
            onClick={abrirModalNovo}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo Vínculo
          </button>
        </div>
      </div>

      {/* Barra de Acoes em Massa */}
      {selecionados.size > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/90 p-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-blue-900/60 dark:bg-blue-950/40">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white shadow-sm">
              {selecionados.size}
            </span>
            <div>
              <p className="text-xs font-bold text-blue-950 dark:text-blue-100">
                {selecionados.size} {selecionados.size === 1 ? 'grupo selecionado' : 'grupos selecionados'}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-blue-700 dark:text-blue-300">
                {selecionados.size < vinculosFiltrados.length ? (
                  <button
                    type="button"
                    onClick={selecionarTodosFiltrados}
                    className="font-semibold underline hover:text-blue-900 dark:hover:text-blue-100 cursor-pointer"
                  >
                    Selecionar todos os {vinculosFiltrados.length} grupos filtrados
                  </button>
                ) : (
                  <span>Todos os {vinculosFiltrados.length} grupos filtrados selecionados</span>
                )}
                <span>•</span>
                <button
                  type="button"
                  onClick={limparSelecao}
                  className="font-semibold underline hover:text-blue-900 dark:hover:text-blue-100 cursor-pointer"
                >
                  Limpar seleção
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={abrirModalLote}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              Editar Comprador em Massa ({selecionados.size})
            </button>
          </div>
        </div>
      )}

      {/* Tabela de Dados */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin text-blue-500" />
            <span className="mt-2 text-xs">Carregando grupos e histórico...</span>
          </div>
        ) : vinculosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Boxes className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Nenhum grupo de mercadorias encontrado
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {busca ? 'Tente ajustar os termos da sua pesquisa.' : 'Cadastre um novo vínculo usando o botão acima.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="w-9 px-3 py-3 text-center" scope="col">
                    <input
                      type="checkbox"
                      checked={todosPaginaSelecionados}
                      ref={(el) => {
                        if (el) el.indeterminate = algunsPaginaSelecionados;
                      }}
                      onChange={alternarTodosDaPagina}
                      aria-label="Selecionar todos os itens da página atual"
                      title={todosPaginaSelecionados ? 'Desmarcar página atual' : 'Selecionar página atual'}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  {renderThOrdenavel('nivel1', 'Nível 1 (Classificação)', 'px-3 py-3')}
                  {renderThOrdenavel('nivel2', 'Nível 2 (Subcategoria)', 'px-3 py-3')}
                  {renderThOrdenavel('codigo', 'Código SAP', 'px-3.5 py-3')}
                  {renderThOrdenavel('nome', 'Grupo de Materiais', 'px-3.5 py-3')}
                  {renderThOrdenavel('comprador', 'Comprador Responsável', 'px-3.5 py-3')}
                  {renderThOrdenavel('volume', 'Volume 05/2026+', 'px-3 py-3 text-center', 'center')}
                  {renderThOrdenavel('status', 'Status', 'px-3 py-3 text-center', 'center')}
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {vinculosPaginados.map((item) => {
                  const sugLinha = api.sugerirCompradorPorNiveis(
                    item.classificacao_nivel1,
                    item.classificacao_nivel2,
                    vinculos
                  );
                  const difereDaSugestao = item.grupo_compras !== sugLinha.grupo_compras;
                  const compSugerido = compradores.find((c) => c.grupo_compras === sugLinha.grupo_compras);
                  const estiloN1 = item.classificacao_nivel1 ? CORES_NIVEL_1[item.classificacao_nivel1] : null;
                  const estaSelecionado = selecionados.has(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors text-slate-700 dark:text-slate-300 ${
                        estaSelecionado
                          ? 'bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100/60 dark:hover:bg-blue-950/60'
                          : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      {/* Checkbox de Selecao */}
                      <td className="w-9 px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={estaSelecionado}
                          onChange={() => alternarSelecao(item.id)}
                          aria-label={`Selecionar grupo ${item.grupo_mercadoria_codigo}`}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Nível 1 (Classificação) */}
                      <td className="px-3 py-3">
                        {item.classificacao_nivel1 ? (
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                              estiloN1?.badge ||
                              'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {item.classificacao_nivel1}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* Nível 2 (Subcategoria) */}
                      <td className="px-3 py-3">
                        {item.classificacao_nivel2 ? (
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {item.classificacao_nivel2}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* Codigo SAP */}
                      <td className="px-3.5 py-3 font-mono text-[11px] font-extrabold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                        {item.grupo_mercadoria_codigo}
                      </td>

                      {/* Grupo de Materiais */}
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.grupo_mercadoria_nome}
                        </div>
                        {item.observacao && (
                          <div className="mt-0.5 text-[10px] text-slate-400 truncate max-w-xs">
                            {item.observacao}
                          </div>
                        )}
                      </td>

                      {/* Comprador Responsavel com Seletor Rapido e Sugestao */}
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={item.grupo_compras}
                            onChange={(e) => mudarCompradorLinha(item, e.target.value)}
                            className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          >
                            {compradores.map((c) => (
                              <option
                                key={c.grupo_compras}
                                value={c.grupo_compras}
                                disabled={c.ativo === false && c.grupo_compras !== item.grupo_compras}
                              >
                                {c.grupo_compras} - {c.nome_comprador} {c.ativo === false ? '(Inativo)' : ''}
                              </option>
                            ))}
                          </select>

                          {difereDaSugestao && compSugerido && (
                            <button
                              type="button"
                              onClick={() => mudarCompradorLinha(item, sugLinha.grupo_compras)}
                              title={`Sugerido por Níveis: ${sugLinha.grupo_compras} (${compSugerido.nome_comprador}) — ${sugLinha.motivo}. Clique para aplicar.`}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                    {/* Volume 05/2026+ */}
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex flex-col items-center">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            title="Pedidos realizados desde 05/2026"
                          >
                            <ShoppingCart className="h-3 w-3" />
                            {item.total_pedidos || 0} ped.
                          </span>
                          <span
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            title="Requisições solicitadas desde 05/2026"
                          >
                            <FileText className="h-3 w-3" />
                            {item.total_requisicoes || 0} req.
                          </span>
                        </div>
                        {(item.total_valor || 0) > 0 && (
                          <span className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            {formatarMoeda(item.total_valor)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status Ativo / Inativo */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => alternarAtivoLinha(item)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all ${
                          item.ativo
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                        title={item.ativo ? 'Clique para inativar' : 'Clique para ativar'}
                      >
                        {item.ativo ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {item.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>

                    {/* Acoes */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => abrirModalEditar(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                          title="Editar vínculo"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemParaExcluir(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          title="Remover vínculo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}

        {/* Barra de Paginacao */}
        {!carregando && vinculosFiltrados.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Mostrando{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {(paginaAtual - 1) * ITENS_POR_PAGINA + 1}
              </strong>{' '}
              a{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {Math.min(paginaAtual * ITENS_POR_PAGINA, vinculosFiltrados.length)}
              </strong>{' '}
              de{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {vinculosFiltrados.length}
              </strong>{' '}
              grupos
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                disabled={paginaAtual <= 1}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <span className="px-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                {paginaAtual} / {totalPaginas}
              </span>
              <button
                type="button"
                onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual >= totalPaginas}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Novo / Editar Vinculo */}
      {modalAberto && (
        <Modal
          onClose={() => setModalAberto(false)}
          maxWidth="max-w-xl"
          ariaLabel={itemEditando ? 'Editar Vínculo de Grupo' : 'Novo Vínculo de Grupo Comprador'}
        >
          <form onSubmit={salvarFormulario}>
            <ModalBody className="space-y-4 p-5">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <Boxes className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                    {itemEditando ? 'Editar Vínculo de Comprador' : 'Novo Vínculo de Grupo Comprador'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Vincule o grupo de mercadorias ao código do comprador correspondente.
                  </p>
                </div>
              </div>

              {/* Assistente de Busca no Catalogo SAP */}
              {!itemEditando && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
                  <label className="block text-[11px] font-bold text-blue-900 dark:text-blue-200">
                    Pesquisar no Catálogo SAP (cadastro_grupo_mercadoria)
                  </label>
                  <div className="relative mt-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-400" />
                    <input
                      type="text"
                      value={buscaSap}
                      onChange={(e) => setBuscaSap(e.target.value)}
                      placeholder="Digite o código (ex.: M11003002) ou nome do material..."
                      className="h-8 w-full rounded-lg border border-blue-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-blue-800 dark:bg-slate-950 dark:text-slate-50"
                    />
                    {buscandoSap && (
                      <RefreshCw className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-blue-500" />
                    )}
                  </div>

                  {catalogoSap.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      {catalogoSap.map((sap) => (
                        <button
                          key={sap.codigo}
                          type="button"
                          onClick={() => selecionarGrupoSap(sap)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          <div>
                            <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                              {sap.codigo}
                            </span>{' '}
                            - <span className="font-semibold text-slate-800 dark:text-slate-200">{sap.denominacao}</span>
                          </div>
                          {(sap.classificacao_nivel1 || sap.classificacao_nivel2) && (
                            <span className="text-[10px] text-slate-400">
                              {[sap.classificacao_nivel1, sap.classificacao_nivel2].filter(Boolean).join(' • ')}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Banner de Sugestão Inteligente por Nível */}
              {sugestaoModal && (
                <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800/60 dark:bg-amber-950/30">
                  <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-bold">
                        Sugestão automática por Nível: Comprador {sugestaoModal.grupo_compras}
                      </p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        {sugestaoModal.motivo}
                      </p>
                    </div>
                  </div>
                  {formGrupoCompras !== sugestaoModal.grupo_compras && (
                    <button
                      type="button"
                      onClick={() => setFormGrupoCompras(sugestaoModal.grupo_compras)}
                      className="shrink-0 self-start rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-amber-700 sm:self-center"
                    >
                      Aplicar comprador {sugestaoModal.grupo_compras}
                    </button>
                  )}
                </div>
              )}

              {/* Campos do Formulario */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Código do Grupo SAP *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value.toUpperCase())}
                    placeholder="Ex.: M11003002"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Comprador Responsável *
                  </label>
                  <select
                    value={formGrupoCompras}
                    onChange={(e) => setFormGrupoCompras(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                  >
                    {compradores.map((c) => (
                      <option
                        key={c.grupo_compras}
                        value={c.grupo_compras}
                        disabled={c.ativo === false && c.grupo_compras !== formGrupoCompras}
                      >
                        {c.grupo_compras} - {c.nome_comprador} ({c.usuario_sistema}) {c.ativo === false ? '— Inativo' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Denominação do Grupo de Mercadorias *
                </label>
                <input
                  type="text"
                  required
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex.: EQUIPAMENTOS DE PROTECAO INDIVIDUAL (EPI)"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>

              {/* Nível 1 e Nível 2 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Nível 1 (Classificação) *
                  </label>
                  <select
                    value={formClassificacao}
                    onChange={(e) => mudarNivel1Modal(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
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
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Nível 2 (Subcategoria)
                    </label>
                    <button
                      type="button"
                      onClick={() => setModoNivel2Outro(!modoNivel2Outro)}
                      className="text-[10px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {modoNivel2Outro ? 'Selecionar da lista' : '+ Outra subcategoria'}
                    </button>
                  </div>
                  {modoNivel2Outro ? (
                    <input
                      type="text"
                      value={formNivel2}
                      onChange={(e) => mudarNivel2Modal(e.target.value)}
                      placeholder="Digite a subcategoria personalizada..."
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                    />
                  ) : (
                    <select
                      value={formNivel2}
                      onChange={(e) => {
                        if (e.target.value === '__OUTRO__') {
                          setModoNivel2Outro(true);
                          mudarNivel2Modal('');
                        } else {
                          mudarNivel2Modal(e.target.value);
                        }
                      }}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                    >
                      <option value="">Sem subcategoria</option>
                      {(taxonomia[formClassificacao] || []).map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                      <option value="__OUTRO__">+ Digitar outra...</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Status do Vínculo */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Status do Vínculo
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormAtivo(!formAtivo)}
                    className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-all ${
                      formAtivo
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {formAtivo ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {formAtivo ? 'Ativo no Sistema' : 'Inativo'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Observações Internas (opcional)
                </label>
                <textarea
                  rows={2}
                  value={formObservacao}
                  onChange={(e) => setFormObservacao(e.target.value)}
                  placeholder="Ex.: Itens hospitalares transferidos conforme determinação da gerência..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <div className="flex w-full items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  disabled={salvando}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {salvando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Salvar Vínculo
                </button>
              </div>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Modal Edição em Massa de Comprador */}
      {modalLoteAberto && (
        <Modal
          onClose={() => !salvandoLote && setModalLoteAberto(false)}
          maxWidth="max-w-xl"
          ariaLabel="Editar Comprador em Massa"
        >
          <form onSubmit={salvarEdicaoLote}>
            <ModalBody className="space-y-4 p-5">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                    Editar Comprador em Massa
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Reatribua o comprador responsável por {selecionados.size} grupo{selecionados.size === 1 ? '' : 's'} de mercadorias selecionado{selecionados.size === 1 ? '' : 's'}.
                  </p>
                </div>
              </div>

              {/* Painel Informativo */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs dark:border-blue-900/40 dark:bg-blue-950/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-900 dark:text-blue-200">
                    Grupos selecionados para atualização:
                  </span>
                  <span className="rounded-md bg-blue-600 px-2 py-0.5 font-mono text-xs font-bold text-white">
                    {selecionados.size} {selecionados.size === 1 ? 'item' : 'itens'}
                  </span>
                </div>
              </div>

              {/* Seleção do Modo */}
              <div className="space-y-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Modo de Atribuição
                </label>

                {/* Opção 1: Comprador Único */}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                    loteModo === 'comprador_unico'
                      ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="loteModo"
                    checked={loteModo === 'comprador_unico'}
                    onChange={() => setLoteModo('comprador_unico')}
                    className="mt-1 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Atribuir o mesmo comprador a todos os selecionados
                    </span>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Define diretamente o comprador responsável para todos os {selecionados.size} grupos selecionados.
                    </p>

                    {loteModo === 'comprador_unico' && (
                      <div className="mt-3">
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Novo Comprador Responsável:
                        </label>
                        <select
                          value={loteGrupoCompras}
                          onChange={(e) => setLoteGrupoCompras(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                        >
                          {compradores.map((c) => (
                            <option
                              key={c.grupo_compras}
                              value={c.grupo_compras}
                              disabled={c.ativo === false}
                            >
                              {c.grupo_compras} - {c.nome_comprador} ({c.usuario_sistema}) {c.ativo === false ? '— Inativo' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </label>

                {/* Opção 2: Sugestão Automática por Níveis */}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                    loteModo === 'sugestao_niveis'
                      ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="loteModo"
                    checked={loteModo === 'sugestao_niveis'}
                    onChange={() => setLoteModo('sugestao_niveis')}
                    className="mt-1 h-4 w-4 border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Aplicar sugestão inteligente por Nível 1 e Nível 2
                      </span>
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Calcula o comprador ideal individualmente para cada grupo selecionado com base na sua subcategoria (Nível 2) ou classificação (Nível 1) e regras de compras da equipe.
                    </p>
                  </div>
                </label>
              </div>
            </ModalBody>
            <ModalFooter>
              <div className="flex w-full items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalLoteAberto(false)}
                  disabled={salvandoLote}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoLote}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                >
                  {salvandoLote ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Confirmar Alteração ({selecionados.size})
                </button>
              </div>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Dialogo de Confirmacao de Exclusao */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Vínculo de Grupo Comprador"
          mensagem={
            <span>
              Tem certeza que deseja remover o vínculo do grupo{' '}
              <strong>{itemParaExcluir.grupo_mercadoria_codigo}</strong> -{' '}
              <em>{itemParaExcluir.grupo_mercadoria_nome}</em> com o comprador{' '}
              <strong>{itemParaExcluir.nome_comprador} ({itemParaExcluir.grupo_compras})</strong>?
            </span>
          }
          confirmarLabel="Sim, excluir vínculo"
          cancelarLabel="Cancelar"
          variante="perigo"
          confirmando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
    </div>
  );
}
