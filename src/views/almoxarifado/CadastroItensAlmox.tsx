/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: Almoxarifado > Formulários > Cadastro de Itens (Catálogo)
 * Código do Formulário: FRM.ALM-0016
 *
 * Exibe a posição de materiais consumíveis da ZL0024 com saldo positivo,
 * associando Grupo de Mercadorias, Níveis 1 e 2, Código SAP, Descrição e Texto Técnico.
 * Permite capturar e vincular fotos comprimidas aos itens para alimentar o catálogo
 * e exibi-las na Solicitação de Compras.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft, RefreshCw, Search, Camera, ImageIcon, CheckCircle2,
  AlertCircle, X, Download, Filter, Eye, Trash2, Layers,
  Boxes, Sparkles, Tag, ShieldCheck, FileText, Check,
  ChevronRight, ClipboardPaste, Upload, Plus
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import {
  carregarDadosCatalogoCompleto,
  buscarMateriaisParaAdicao,
  pesquisarCatalogoSapOnline,
  salvarItemCatalogo,
  obterUrlFotoCatalogo,
  excluirItemCatalogo,
  type ItemConsumivelZl0024,
  type CatalogoItem,
  type MaterialCandidatoCatalogo,
  type DadosCatalogoCompleto,
} from '../../lib/almoxCatalogoApi';
import type { Profile } from '../../types';

interface CadastroItensAlmoxProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

type FiltroFoto = 'todos' | 'com_foto' | 'sem_foto';
type ModoVisualizacao = 'cards' | 'tabela';

export default function CadastroItensAlmox({ user, onNavigate }: CadastroItensAlmoxProps) {
  const toast = useToast();

  const [dadosCompletos, setDadosCompletos] = useState<DadosCatalogoCompleto | null>(null);
  const [itens, setItens] = useState<ItemConsumivelZl0024[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  // Campo Adicionar Item (Busca Rápida por Código SAP ou Descrição)
  const [termoAdicionar, setTermoAdicionar] = useState('');
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const inputAdicionarRef = useRef<HTMLInputElement>(null);
  const containerAdicionarRef = useRef<HTMLDivElement>(null);

  // Modal de Cadastro de Item Avulso pelo Catálogo SAP (todas as infos automáticas, apenas foto habilitada)
  const [modalSapAberto, setModalSapAberto] = useState(false);
  const [termoBuscaSap, setTermoBuscaSap] = useState('');
  const [buscandoSap, setBuscandoSap] = useState(false);
  const [resultadosBuscaSap, setResultadosBuscaSap] = useState<MaterialCandidatoCatalogo[]>([]);
  const [itemSapSelecionado, setItemSapSelecionado] = useState<MaterialCandidatoCatalogo | null>(null);
  const [fotoArquivoSap, setFotoArquivoSap] = useState<File | null>(null);
  const [fotoPreviewUrlSap, setFotoPreviewUrlSap] = useState<string | null>(null);
  const [observacaoSap, setObservacaoSap] = useState('');
  const [salvandoSap, setSalvandoSap] = useState(false);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroFoto, setFiltroFoto] = useState<FiltroFoto>('todos');
  const [filtroNivel2, setFiltroNivel2] = useState<string>('todos');
  const [filtroGrupo, setFiltroGrupo] = useState<string>('todos');
  const [modoVis, setModoVis] = useState<ModoVisualizacao>('cards');

  // Modal de Cadastro de Foto
  const [itemSelecionado, setItemSelecionado] = useState<ItemConsumivelZl0024 | null>(null);
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Modal de Visualização da Imagem em Alta Resolução
  const [imagemZoom, setImagemZoom] = useState<{ url: string; titulo: string; codigo: string } | null>(null);

  // Referências para input de arquivo e câmera
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      const dados = await carregarDadosCatalogoCompleto();
      setDadosCompletos(dados);
      setItens(dados.itens);
    } catch (err: any) {
      console.error('[CadastroItensAlmox] Erro ao carregar itens:', err);
      toast.error('Falha ao carregar catálogo de itens.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  // Lista única de Níveis 2 presentes nos itens
  const opcoesNivel2 = useMemo(() => {
    const set = new Set<string>();
    itens.forEach(it => {
      if (it.classificacao_nivel2) set.add(it.classificacao_nivel2);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [itens]);

  // Lista única de Grupos presentes
  const opcoesGrupos = useMemo(() => {
    const set = new Set<string>();
    itens.forEach(it => {
      if (it.grupo_mercadorias) set.add(it.grupo_mercadorias);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [itens]);

  // Itens filtrados
  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return itens.filter(it => {
      // Filtro de texto
      if (termo) {
        const textoBusca = `${it.codigo_sap} ${it.descricao} ${it.texto_tecnico} ${it.grp_mercad} ${it.grupo_mercadorias} ${it.classificacao_nivel2}`.toLowerCase();
        if (!textoBusca.includes(termo)) return false;
      }

      // Filtro de status da foto
      if (filtroFoto === 'com_foto' && !it.tem_foto) return false;
      if (filtroFoto === 'sem_foto' && it.tem_foto) return false;

      // Filtro de Nível 2
      if (filtroNivel2 !== 'todos' && it.classificacao_nivel2 !== filtroNivel2) return false;

      // Filtro de Grupo de Mercadorias
      if (filtroGrupo !== 'todos' && it.grupo_mercadorias !== filtroGrupo) return false;

      return true;
    });
  }, [itens, busca, filtroFoto, filtroNivel2, filtroGrupo]);

  // Estatísticas e KPIs
  const kpis = useMemo(() => {
    const total = itens.length;
    const comFoto = itens.filter(i => i.tem_foto).length;
    const semFoto = total - comFoto;
    const pctCobertura = total > 0 ? (comFoto / total) * 100 : 0;
    const saldoTotal = itens.reduce((acc, i) => acc + i.saldo_total, 0);

    return { total, comFoto, semFoto, pctCobertura, saldoTotal };
  }, [itens]);

  // Sugestões para o campo Adicionar Item
  const sugestoesAdicionar = useMemo(() => {
    if (!termoAdicionar.trim() || !dadosCompletos) return [];
    return buscarMateriaisParaAdicao(
      termoAdicionar,
      dadosCompletos.estoqueCompleto,
      dadosCompletos.grupos,
      dadosCompletos.itensCatalogo,
      30,
      dadosCompletos.mapaEpis
    );
  }, [termoAdicionar, dadosCompletos]);

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (containerAdicionarRef.current && !containerAdicionarRef.current.contains(e.target as Node)) {
        setSugestoesAbertas(false);
      }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  const handleSelecionarCandidato = (candidato: MaterialCandidatoCatalogo) => {
    const existente = itens.find(i => i.codigo_sap === candidato.codigo_sap);

    const itemParaFoto: ItemConsumivelZl0024 = existente || {
      codigo_sap: candidato.codigo_sap,
      descricao: candidato.descricao,
      texto_tecnico: candidato.texto_tecnico || '',
      grp_mercad: candidato.grp_mercad || '',
      grupo_mercadorias: candidato.grupo_mercadorias || '',
      classificacao_nivel1: candidato.classificacao_nivel1 || 'CONSUMÍVEL',
      classificacao_nivel2: candidato.classificacao_nivel2 || '',
      saldo_total: candidato.saldo_total,
      umb: candidato.umb || 'UN',
      depositos: candidato.depositos,
      item_catalogo: null,
      tem_foto: candidato.tem_foto,
      url_foto: candidato.url_foto || null,
      origem_foto: candidato.origem_foto,
      ca_epi: candidato.ca_epi,
    };

    handleAbrirCadastroFoto(itemParaFoto);
    setTermoAdicionar('');
    setSugestoesAbertas(false);
  };

  // Funções de Abertura e Controle do Modal de Pesquisa SAP
  const handleAbrirModalSap = (termoInicial = '') => {
    setTermoBuscaSap(termoInicial);
    setItemSapSelecionado(null);
    setFotoArquivoSap(null);
    setFotoPreviewUrlSap(null);
    setObservacaoSap('');
    setModalSapAberto(true);
    setSugestoesAbertas(false);
  };

  const fecharModalSap = () => {
    if (fotoPreviewUrlSap && fotoPreviewUrlSap.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrlSap);
    }
    setModalSapAberto(false);
    setItemSapSelecionado(null);
    setFotoArquivoSap(null);
    setFotoPreviewUrlSap(null);
    setObservacaoSap('');
    setTermoBuscaSap('');
    setResultadosBuscaSap([]);
  };

  const executarBuscaSap = useCallback(async (termo: string) => {
    const limpo = termo.trim();
    if (!limpo || limpo.length < 2) {
      setResultadosBuscaSap([]);
      setBuscandoSap(false);
      return;
    }
    setBuscandoSap(true);
    try {
      const res = await pesquisarCatalogoSapOnline(limpo, dadosCompletos, 40);
      setResultadosBuscaSap(res);
    } catch (err) {
      console.warn('[CadastroItensAlmox] Falha ao pesquisar catálogo SAP:', err);
    } finally {
      setBuscandoSap(false);
    }
  }, [dadosCompletos]);

  // Debounce na busca SAP do modal
  useEffect(() => {
    if (!modalSapAberto || itemSapSelecionado) return;
    const termo = termoBuscaSap.trim();
    if (!termo || termo.length < 2) {
      setResultadosBuscaSap([]);
      setBuscandoSap(false);
      return;
    }
    const timer = setTimeout(() => {
      void executarBuscaSap(termo);
    }, 280);
    return () => clearTimeout(timer);
  }, [termoBuscaSap, modalSapAberto, itemSapSelecionado, executarBuscaSap]);

  const handleSelecionarItemSap = (candidato: MaterialCandidatoCatalogo) => {
    setItemSapSelecionado(candidato);
    setFotoArquivoSap(null);
    setFotoPreviewUrlSap(candidato.url_foto || null);
    setObservacaoSap('');
  };

  const handleTrocarItemSap = () => {
    if (fotoPreviewUrlSap && fotoPreviewUrlSap.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrlSap);
    }
    setItemSapSelecionado(null);
    setFotoArquivoSap(null);
    setFotoPreviewUrlSap(null);
    setObservacaoSap('');
  };

  const handleSelecionarArquivoSap = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fotoPreviewUrlSap && fotoPreviewUrlSap.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrlSap);
    }
    setFotoArquivoSap(file);
    setFotoPreviewUrlSap(URL.createObjectURL(file));
  };

  const handlePasteImagemSap = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    if (fotoPreviewUrlSap && fotoPreviewUrlSap.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrlSap);
    }
    setFotoArquivoSap(file);
    setFotoPreviewUrlSap(URL.createObjectURL(file));
    toast.success('Imagem colada com sucesso!');
  };

  // Abrir modal de cadastro/edição de foto
  const handleAbrirCadastroFoto = (item: ItemConsumivelZl0024) => {
    setItemSelecionado(item);
    setFotoArquivo(null);
    setFotoPreviewUrl(item.url_foto || null);
    setObservacao(item.item_catalogo?.observacao || '');
  };

  const fecharModalFoto = () => {
    if (fotoPreviewUrl && fotoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrl);
    }
    setItemSelecionado(null);
    setFotoArquivo(null);
    setFotoPreviewUrl(null);
    setObservacao('');
  };

  // Selecionar foto do arquivo ou captura
  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fotoPreviewUrl && fotoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrl);
    }

    setFotoArquivo(file);
    setFotoPreviewUrl(URL.createObjectURL(file));
  };

  // Suporte a colar imagem (Ctrl+V)
  const handlePasteImagem = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;

    if (fotoPreviewUrl && fotoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrl);
    }

    setFotoArquivo(file);
    setFotoPreviewUrl(URL.createObjectURL(file));
    toast.success('Imagem colada da área de transferência.');
  };

  // Salvar foto no catálogo
  const handleSalvarFoto = async () => {
    if (!itemSelecionado) return;
    if (!fotoArquivo && !itemSelecionado.tem_foto) {
      toast.warning('Tire uma foto ou selecione um arquivo de imagem.');
      return;
    }

    setSalvando(true);
    try {
      const salvo = await salvarItemCatalogo({
        codigo_sap: itemSelecionado.codigo_sap,
        descricao: itemSelecionado.descricao,
        texto_tecnico: itemSelecionado.texto_tecnico,
        grp_mercad: itemSelecionado.grp_mercad,
        grupo_mercadorias: itemSelecionado.grupo_mercadorias,
        classificacao_nivel1: itemSelecionado.classificacao_nivel1,
        classificacao_nivel2: itemSelecionado.classificacao_nivel2,
        umb: itemSelecionado.umb,
        saldo_zl0024: itemSelecionado.saldo_total,
        observacao,
        fotoArquivo,
      }, user);

      // Atualiza o estado local imediatamente
      setItens(prev => {
        const existe = prev.some(it => it.codigo_sap === salvo.codigo_sap);
        if (existe) {
          return prev.map(it => {
            if (it.codigo_sap === salvo.codigo_sap) {
              return {
                ...it,
                item_catalogo: salvo,
                tem_foto: Boolean(salvo.imagem_path),
                url_foto: salvo.url_imagem || it.url_foto,
                origem_foto: 'catalogo',
              };
            }
            return it;
          });
        }
        const novoItem: ItemConsumivelZl0024 = {
          ...itemSelecionado,
          item_catalogo: salvo,
          tem_foto: Boolean(salvo.imagem_path),
          url_foto: salvo.url_imagem || itemSelecionado.url_foto,
          origem_foto: 'catalogo',
        };
        return [novoItem, ...prev];
      });

      if (dadosCompletos) {
        setDadosCompletos(dc => {
          if (!dc) return dc;
          return {
            ...dc,
            itensCatalogo: [...dc.itensCatalogo.filter(c => c.codigo_sap !== salvo.codigo_sap), salvo],
          };
        });
      }

      toast.success(`Foto do material ${salvo.codigo_sap} vinculada ao catálogo com sucesso!`);
      fecharModalFoto();
    } catch (err: any) {
      console.error('[CadastroItensAlmox] Erro ao salvar foto:', err);
      toast.error(err?.message || 'Falha ao salvar foto do item.');
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarItemSap = async () => {
    if (!itemSapSelecionado) return;
    if (!fotoArquivoSap && !itemSapSelecionado.tem_foto) {
      toast.warning('Tire uma foto ou anexe uma imagem para vincular ao material.');
      return;
    }

    setSalvandoSap(true);
    try {
      const salvo = await salvarItemCatalogo({
        codigo_sap: itemSapSelecionado.codigo_sap,
        descricao: itemSapSelecionado.descricao,
        texto_tecnico: itemSapSelecionado.texto_tecnico || null,
        grp_mercad: itemSapSelecionado.grp_mercad || null,
        grupo_mercadorias: itemSapSelecionado.grupo_mercadorias || null,
        classificacao_nivel1: itemSapSelecionado.classificacao_nivel1 || 'CONSUMÍVEL',
        classificacao_nivel2: itemSapSelecionado.classificacao_nivel2 || null,
        umb: itemSapSelecionado.umb || 'UN',
        saldo_zl0024: itemSapSelecionado.saldo_total || 0,
        observacao: observacaoSap.trim() || null,
        fotoArquivo: fotoArquivoSap,
      }, user);

      const novoItem: ItemConsumivelZl0024 = {
        codigo_sap: salvo.codigo_sap,
        descricao: salvo.descricao,
        texto_tecnico: salvo.texto_tecnico || '',
        grp_mercad: salvo.grp_mercad || '',
        grupo_mercadorias: salvo.grupo_mercadorias || '',
        classificacao_nivel1: salvo.classificacao_nivel1 || 'CONSUMÍVEL',
        classificacao_nivel2: salvo.classificacao_nivel2 || '',
        saldo_total: itemSapSelecionado.saldo_total || 0,
        umb: salvo.umb || 'UN',
        depositos: itemSapSelecionado.depositos || [],
        item_catalogo: salvo,
        tem_foto: Boolean(salvo.imagem_path),
        url_foto: salvo.url_imagem || itemSapSelecionado.url_foto || null,
        origem_foto: 'catalogo',
      };

      setItens(prev => [novoItem, ...prev.filter(it => it.codigo_sap !== novoItem.codigo_sap)]);

      if (dadosCompletos) {
        setDadosCompletos(dc => {
          if (!dc) return dc;
          return {
            ...dc,
            itensCatalogo: [...dc.itensCatalogo.filter(c => c.codigo_sap !== salvo.codigo_sap), salvo],
          };
        });
      }

      toast.success(`Material ${salvo.codigo_sap} cadastrado no catálogo com sucesso!`);
      fecharModalSap();
    } catch (err: any) {
      console.error('[CadastroItensAlmox] Erro ao cadastrar item SAP:', err);
      toast.error(err?.message || 'Falha ao cadastrar item no catálogo.');
    } finally {
      setSalvandoSap(false);
    }
  };

  // Remover foto do cadastro
  const handleRemoverFoto = async () => {
    if (!itemSelecionado || !itemSelecionado.item_catalogo) return;
    if (!window.confirm(`Deseja remover a foto do material ${itemSelecionado.codigo_sap}?`)) return;

    setSalvando(true);
    try {
      await salvarItemCatalogo({
        codigo_sap: itemSelecionado.codigo_sap,
        descricao: itemSelecionado.descricao,
        removerFoto: true,
      }, user);

      setItens(prev => prev.map(it => {
        if (it.codigo_sap === itemSelecionado.codigo_sap) {
          return {
            ...it,
            item_catalogo: it.item_catalogo ? { ...it.item_catalogo, imagem_path: null, url_imagem: null } : null,
            tem_foto: false,
            url_foto: null,
          };
        }
        return it;
      }));

      toast.success(`Foto do material ${itemSelecionado.codigo_sap} removida.`);
      fecharModalFoto();
    } catch (err: any) {
      console.error('[CadastroItensAlmox] Erro ao remover foto:', err);
      toast.error('Falha ao remover foto do item.');
    } finally {
      setSalvando(false);
    }
  };

  // Exportar dados para CSV
  const handleExportarCsv = () => {
    if (itensFiltrados.length === 0) {
      toast.warning('Nenhum item para exportar com os filtros atuais.');
      return;
    }

    const cabecalho = [
      'Código SAP',
      'Descrição',
      'Texto Técnico',
      'Grupo de Mercadorias',
      'Código Grupo',
      'Nível 1',
      'Nível 2',
      'Saldo ZL0024',
      'UMB',
      'Depósitos',
      'Tem Foto',
      'Código Registro',
    ];

    const linhas = itensFiltrados.map(it => [
      `"${it.codigo_sap}"`,
      `"${(it.descricao || '').replace(/"/g, '""')}"`,
      `"${(it.texto_tecnico || '').replace(/"/g, '""')}"`,
      `"${(it.grupo_mercadorias || '').replace(/"/g, '""')}"`,
      `"${it.grp_mercad}"`,
      `"${it.classificacao_nivel1}"`,
      `"${it.classificacao_nivel2}"`,
      it.saldo_total,
      `"${it.umb}"`,
      `"${it.depositos.join(', ')}"`,
      it.tem_foto ? 'SIM' : 'NÃO',
      `"${it.item_catalogo?.codigo_registro || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `catalogo_itens_consumiveis_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Planilha do catálogo exportada com sucesso.');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Topo / Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/almoxarifado')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline cursor-pointer mb-2"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar aos formulários do almoxarifado
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
              <Layers className="h-6 w-6 text-amber-600 dark:text-amber-500" />
              Cadastro de Itens — Catálogo de Consumíveis
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              FRM.ALM-0016
            </span>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
            Catálogo de itens consumíveis do almoxarifado. Vincule fotos aos cadastros para visualização automática na Solicitação de Compras e no Inventário Cíclico.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              inputAdicionarRef.current?.focus();
              inputAdicionarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Adicionar Item
          </button>

          <button
            type="button"
            disabled={atualizando || carregando}
            onClick={() => {
              setAtualizando(true);
              void carregarDados().finally(() => setAtualizando(false));
            }}
            title="Recarregar catálogo e fotos"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${atualizando ? 'animate-spin' : ''}`} />
            {atualizando ? 'Atualizando…' : 'Recarregar'}
          </button>

          <button
            type="button"
            onClick={handleExportarCsv}
            title="Exportar dados filtrados para planilha CSV"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition cursor-pointer"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Cards de Métricas e KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4 shadow-xs" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <span className="text-[11px] font-bold block" style={{ color: 'var(--ink-muted)' }}>
            Total no Catálogo
          </span>
          <span className="text-2xl font-black tabular-nums mt-0.5 block" style={{ color: 'var(--ink-primary)' }}>
            {kpis.total}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            Materiais cadastrados
          </span>
        </div>

        <div className="rounded-xl border p-4 shadow-xs border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
              Com Foto Cadastrada
            </span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
              {kpis.pctCobertura.toFixed(1)}%
            </span>
          </div>
          <span className="text-2xl font-black tabular-nums mt-0.5 block text-emerald-900 dark:text-emerald-200">
            {kpis.comFoto}
          </span>
          <div className="mt-1 h-1.5 w-full bg-emerald-200 dark:bg-emerald-900/50 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(kpis.pctCobertura, 100)}%` }} />
          </div>
        </div>

        <div className="rounded-xl border p-4 shadow-xs border-amber-300 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20">
          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block">
            Pendentes de Foto
          </span>
          <span className="text-2xl font-black tabular-nums mt-0.5 block text-amber-900 dark:text-amber-200">
            {kpis.semFoto}
          </span>
          <span className="text-[10px] text-amber-700 dark:text-amber-400">
            Aguardando imagem
          </span>
        </div>

        <div className="rounded-xl border p-4 shadow-xs" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <span className="text-[11px] font-bold block" style={{ color: 'var(--ink-muted)' }}>
            Saldo Total Físico
          </span>
          <span className="text-2xl font-black tabular-nums mt-0.5 block" style={{ color: 'var(--ink-primary)' }}>
            {kpis.saldoTotal.toLocaleString('pt-BR')}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            Peças / Unidades somadas
          </span>
        </div>
      </div>

      {/* Bloco: Adicionar Item ao Catálogo (Campo de busca por Código SAP ou Descrição) */}
      <div
        ref={containerAdicionarRef}
        className="rounded-xl border p-4 shadow-xs relative"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                Adicionar Item ao Catálogo
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                Busque por código SAP ou descrição para cadastrar a foto, ou insira um novo item manualmente. Fotos do Book de EPIs são puxadas automaticamente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleAbrirModalSap()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs cursor-pointer self-start sm:self-auto transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Cadastrar Item (Catálogo SAP)
          </button>
        </div>

        {/* Campo de Busca Rápida de Adição */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 h-4 w-4 pointer-events-none text-slate-400" />
            <input
              ref={inputAdicionarRef}
              type="text"
              value={termoAdicionar}
              onFocus={() => { if (termoAdicionar.trim()) setSugestoesAbertas(true); }}
              onChange={(e) => {
                setTermoAdicionar(e.target.value);
                setSugestoesAbertas(true);
              }}
              placeholder="Adicionar item: digite o código SAP (ex: 1291134) ou descrição do material para vincular a foto..."
              className="w-full pl-10 pr-10 py-2.5 text-xs rounded-lg border transition focus:outline-2 focus:outline-offset-1 font-medium"
              style={{
                borderColor: termoAdicionar ? 'var(--brand)' : 'var(--hairline)',
                background: 'var(--surface-raised)',
                color: 'var(--ink-primary)',
              }}
            />
            {termoAdicionar && (
              <button
                type="button"
                onClick={() => {
                  setTermoAdicionar('');
                  setSugestoesAbertas(false);
                }}
                className="absolute right-3 text-xs text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown de Sugestões em Tempo Real */}
          {sugestoesAbertas && termoAdicionar.trim().length > 0 && (
            <div
              className="absolute left-0 right-0 top-full mt-1.5 z-40 max-h-80 overflow-y-auto rounded-xl border shadow-xl animate-fade-in"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
            >
              <div className="p-2 border-b text-[11px] font-bold flex items-center justify-between" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                <span>Resultados na base SAP / Estoque ({sugestoesAdicionar.length})</span>
                <span className="text-[10px]">Clique para selecionar e tirar a foto</span>
              </div>

              {sugestoesAdicionar.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-slate-500">Nenhum material encontrado com "{termoAdicionar}".</p>
                  <button
                    type="button"
                    onClick={() => handleAbrirModalSap(termoAdicionar)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 cursor-pointer transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Pesquisar "{termoAdicionar}" no Catálogo SAP Oficial
                  </button>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                  {sugestoesAdicionar.map((candidato) => (
                    <div
                      key={candidato.codigo_sap}
                      onClick={() => handleSelecionarCandidato(candidato)}
                      className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {candidato.url_foto ? (
                          <img
                            src={candidato.url_foto}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg object-cover border"
                            style={{ borderColor: 'var(--hairline)' }}
                          />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <Camera className="h-4 w-4" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400">
                              {candidato.codigo_sap}
                            </span>
                            <span className="text-xs font-bold truncate block" style={{ color: 'var(--ink-primary)' }}>
                              {candidato.descricao}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                            <span>{candidato.grp_mercad} - {candidato.grupo_mercadorias || 'Geral'}</span>
                            {candidato.classificacao_nivel2 && (
                              <span>• {candidato.classificacao_nivel2}</span>
                            )}
                            <span>• Saldo ZL0024: <strong>{candidato.saldo_total} {candidato.umb}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {candidato.tem_foto ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                              candidato.origem_foto === 'book_epi'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            }`}
                          >
                            {candidato.origem_foto === 'book_epi' ? (
                              <>
                                <ShieldCheck className="h-3 w-3" />
                                Book de EPIs
                              </>
                            ) : (
                              <>
                                <Check className="h-3 w-3" />
                                Com Foto
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Camera className="h-3 w-3" />
                            Cadastrar Foto
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition" />
                      </div>
                    </div>
                  ))}

                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Não encontrou o que procurava na base local?
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAbrirModalSap(termoAdicionar)}
                      className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Pesquisar no catálogo SAP com "{termoAdicionar}"
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Busca textual */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 pointer-events-none" style={{ color: 'var(--ink-muted)' }} />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código SAP, descrição, texto técnico, grupo de mercadorias..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border transition focus:outline-2 focus:outline-offset-1"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--surface-raised)',
                color: 'var(--ink-primary)',
              }}
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Seletor de Foto (Todos, Com Foto, Sem Foto) */}
          <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
            <button
              type="button"
              onClick={() => setFiltroFoto('todos')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                filtroFoto === 'todos' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Todos ({itens.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroFoto('com_foto')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                filtroFoto === 'com_foto' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Check className="h-3 w-3" />
              Com Foto ({kpis.comFoto})
            </button>
            <button
              type="button"
              onClick={() => setFiltroFoto('sem_foto')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                filtroFoto === 'sem_foto' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Camera className="h-3 w-3" />
              Pendentes ({kpis.semFoto})
            </button>
          </div>

          {/* Alternância Cards vs Tabela */}
          <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
            <button
              type="button"
              onClick={() => setModoVis('cards')}
              className={`px-2 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                modoVis === 'cards' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-500'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => setModoVis('tabela')}
              className={`px-2 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                modoVis === 'tabela' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-500'
              }`}
            >
              Tabela
            </button>
          </div>
        </div>

        {/* Linha secundária de filtros: Subcategoria Nível 2 e Grupo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: 'var(--hairline)' }}>
          <div>
            <label className="text-[10px] font-bold block mb-1 uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
              Subcategoria (Nível 2)
            </label>
            <select
              value={filtroNivel2}
              onChange={(e) => setFiltroNivel2(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs rounded-lg border"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
            >
              <option value="todos">Todas as subcategorias ({opcoesNivel2.length})</option>
              {opcoesNivel2.map(n2 => (
                <option key={n2} value={n2}>{n2}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold block mb-1 uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
              Grupo de Mercadorias (SAP)
            </label>
            <select
              value={filtroGrupo}
              onChange={(e) => setFiltroGrupo(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs rounded-lg border"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
            >
              <option value="todos">Todos os grupos ({opcoesGrupos.length})</option>
              {opcoesGrupos.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Conteúdo: Listagem de Itens */}
      {carregando ? (
        <div className="rounded-xl border p-12 text-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-amber-600 mb-3" />
          <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
            Carregando catálogo de itens…
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
            Consolidando catálogo de materiais, fotos e Book de EPIs.
          </p>
        </div>
      ) : itensFiltrados.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <Boxes className="h-10 w-10 mx-auto text-slate-400 mb-3" />
          <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
            Nenhum item consumível encontrado
          </h3>
          <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: 'var(--ink-muted)' }}>
            {itens.length === 0
              ? 'Nenhum material cadastrado no catálogo até o momento. Adicione materiais pelo botão "Adicionar Item" ou pesquisando no catálogo SAP.'
              : 'Nenhum material atende aos critérios de busca e filtros selecionados. Tente ajustar os filtros.'}
          </p>
        </div>
      ) : modoVis === 'cards' ? (
        /* Visualização em Cards (Estilo Catálogo / Book) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {itensFiltrados.map((item) => (
            <div
              key={item.codigo_sap}
              className="rounded-xl border shadow-xs flex flex-col justify-between overflow-hidden transition-all hover:shadow-md"
              style={{
                borderColor: item.tem_foto ? 'color-mix(in srgb, var(--brand) 30%, var(--hairline))' : 'var(--hairline)',
                background: 'var(--surface-card)',
              }}
            >
              <div>
                {/* 1. Header Separado de Metadados: Código SAP, Origem/Status e Saldo ZL0024 */}
                <div
                  className="px-3.5 py-2.5 border-b flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-900/50"
                  style={{ borderColor: 'var(--hairline)' }}
                >
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white dark:bg-slate-800 shadow-xs">
                      {item.codigo_sap}
                    </span>
                    {item.tem_foto && item.origem_foto === 'book_epi' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <ShieldCheck className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        Book EPI {item.ca_epi ? `· CA ${item.ca_epi}` : ''}
                      </span>
                    ) : item.tem_foto ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        Foto Ativa
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Sem foto
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 shrink-0">
                    Saldo: {item.saldo_total} {item.umb}
                  </span>
                </div>

                {/* 2. Vitrine da Imagem do Produto: Sem Cortes, Centralizada e com Fundo Limpo */}
                <div
                  className="relative h-56 w-full bg-gradient-to-b from-slate-50/60 via-white to-slate-50/60 dark:from-slate-900/40 dark:via-slate-900/20 dark:to-slate-950 flex items-center justify-center p-3.5 border-b overflow-hidden group"
                  style={{ borderColor: 'var(--hairline)' }}
                >
                  {item.url_foto ? (
                    <>
                      <img
                        src={item.url_foto}
                        alt={item.descricao}
                        className="h-full w-full object-contain drop-shadow-xs transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      {/* Overlay com botões no hover */}
                      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setImagemZoom({ url: item.url_foto!, titulo: item.descricao, codigo: item.codigo_sap })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900/85 hover:bg-slate-900 border border-white/20 shadow-md cursor-pointer transition hover:scale-105 active:scale-95"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ampliar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAbrirCadastroFoto(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md cursor-pointer transition hover:scale-105 active:scale-95"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          Alterar foto
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAbrirCadastroFoto(item)}
                      className="h-full w-full flex flex-col items-center justify-center gap-2 p-4 text-center text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg hover:border-amber-400 dark:hover:border-amber-500 transition cursor-pointer group/empty"
                    >
                      <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 group-hover/empty:bg-amber-50 dark:group-hover/empty:bg-amber-950/50 transition">
                        <Camera className="h-6 w-6 stroke-1.5 text-slate-400 group-hover/empty:text-amber-600 dark:group-hover/empty:text-amber-400" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block">Adicionar foto</span>
                        <span className="text-[10px] text-slate-400 block">Tire com a câmera ou envie arquivo</span>
                      </div>
                    </button>
                  )}
                </div>

                {/* Corpo do Card */}
                <div className="p-4 space-y-2.5">
                  <div>
                    <h4 className="text-sm font-bold line-clamp-2 leading-snug" style={{ color: 'var(--ink-primary)' }} title={item.descricao}>
                      {item.descricao || '—'}
                    </h4>

                    {item.texto_tecnico && (
                      <p className="mt-1 text-[11px] line-clamp-2 italic" style={{ color: 'var(--ink-secondary)' }} title={item.texto_tecnico}>
                        {item.texto_tecnico}
                      </p>
                    )}
                  </div>

                  {/* Taxonomia: Nível 1, Nível 2 e Grupo */}
                  <div className="space-y-1 text-[11px] pt-1 border-t" style={{ borderColor: 'var(--hairline)' }}>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--ink-muted)' }}>Classificação:</span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        {item.classificacao_nivel1} {item.classificacao_nivel2 ? `• ${item.classificacao_nivel2}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--ink-muted)' }}>Grupo SAP:</span>
                      <span className="font-medium truncate max-w-[190px]" style={{ color: 'var(--ink-secondary)' }} title={item.grupo_mercadorias}>
                        {item.grp_mercad ? `${item.grp_mercad} - ${item.grupo_mercadorias}` : item.grupo_mercadorias || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--ink-muted)' }}>Depósitos ZL0024:</span>
                      <span className="font-mono font-bold" style={{ color: 'var(--ink-secondary)' }}>
                        {item.depositos.join(', ') || 'Principal'}
                      </span>
                    </div>
                    {item.item_catalogo?.codigo_registro && (
                      <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--ink-muted)' }}>Registro:</span>
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          {item.item_catalogo.codigo_registro}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Rodapé / Ações */}
              <div className="p-3 border-t bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
                <span className="text-[10px] font-mono" style={{ color: 'var(--ink-muted)' }}>
                  {item.tem_foto ? 'Visível em Compras' : 'Pendente de foto'}
                </span>

                <button
                  type="button"
                  onClick={() => handleAbrirCadastroFoto(item)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    item.tem_foto
                      ? 'border hover:bg-slate-100 dark:hover:bg-slate-800'
                      : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                  }`}
                  style={item.tem_foto ? { borderColor: 'var(--hairline)', color: 'var(--ink-primary)' } : undefined}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {item.tem_foto ? 'Alterar foto' : 'Tirar / Vincular foto'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Visualização em Tabela Detalhada */
        <div className="rounded-xl border overflow-hidden shadow-xs" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                <tr>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Foto</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Código SAP</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Descrição do Material</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Texto Técnico</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Grupo & Subcategoria (Nível 2)</th>
                  <th className="py-2.5 px-3 font-bold text-right" style={{ color: 'var(--ink-muted)' }}>Saldo ZL0024</th>
                  <th className="py-2.5 px-3 font-bold text-center" style={{ color: 'var(--ink-muted)' }}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {itensFiltrados.map((item) => (
                  <tr key={item.codigo_sap} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                    <td className="py-2 px-3">
                      {item.url_foto ? (
                        <button
                          type="button"
                          onClick={() => setImagemZoom({ url: item.url_foto!, titulo: item.descricao, codigo: item.codigo_sap })}
                          className="h-10 w-10 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 relative group cursor-pointer"
                        >
                          <img src={item.url_foto} alt="" className="h-full w-full object-cover" />
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                            <Eye className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      ) : (
                        <div className="h-10 w-10 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
                          <ImageIcon className="h-4 w-4 opacity-50" />
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {item.codigo_sap}
                    </td>
                    <td className="py-2 px-3 font-semibold max-w-xs" style={{ color: 'var(--ink-primary)' }}>
                      <div className="truncate font-semibold" title={item.descricao}>{item.descricao}</div>
                      {item.origem_foto === 'book_epi' && (
                        <div className="mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <ShieldCheck className="h-2.5 w-2.5" /> Book EPI {item.ca_epi ? `CA ${item.ca_epi}` : ''}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[11px] max-w-xs truncate" style={{ color: 'var(--ink-secondary)' }} title={item.texto_tecnico}>
                      {item.texto_tecnico || '—'}
                    </td>
                    <td className="py-2 px-3 text-[11px]">
                      <div className="font-bold text-amber-700 dark:text-amber-400">
                        {item.classificacao_nivel2 || item.classificacao_nivel1}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                        {item.grp_mercad} - {item.grupo_mercadorias}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {item.saldo_total}
                      </span>{' '}
                      <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{item.umb}</span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleAbrirCadastroFoto(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                        style={{ borderColor: 'var(--hairline)', color: item.tem_foto ? 'var(--ink-primary)' : 'var(--brand)' }}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {item.tem_foto ? 'Alterar' : 'Cadastrar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Tirar Foto / Cadastrar Imagem */}
      {itemSelecionado && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          role="dialog"
          aria-modal="true"
          onPaste={handlePasteImagem}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-scale-up"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            {/* Header Modal */}
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
              <div>
                <h3 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
                  <Camera className="h-5 w-5 text-amber-600" />
                  Cadastrar Imagem no Catálogo
                </h3>
                <p className="text-xs font-mono" style={{ color: 'var(--ink-muted)' }}>
                  Material SAP: {itemSelecionado.codigo_sap}
                </p>
              </div>
              <button
                type="button"
                onClick={fecharModalFoto}
                disabled={salvando}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo Modal */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Ficha Resumida do Material */}
              <div className="rounded-xl border p-3 space-y-1.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                <p className="text-xs font-bold leading-tight" style={{ color: 'var(--ink-primary)' }}>
                  {itemSelecionado.descricao}
                </p>
                {itemSelecionado.texto_tecnico && (
                  <p className="text-[11px] leading-snug" style={{ color: 'var(--ink-secondary)' }}>
                    <span className="font-semibold text-slate-500">Texto Técnico: </span>
                    {itemSelecionado.texto_tecnico}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 text-[10px] pt-1">
                  <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-semibold">
                    Grupo: {itemSelecionado.grp_mercad} - {itemSelecionado.grupo_mercadorias}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-bold">
                    {itemSelecionado.classificacao_nivel1} • {itemSelecionado.classificacao_nivel2 || 'Geral'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 font-bold">
                    Saldo: {itemSelecionado.saldo_total} {itemSelecionado.umb}
                  </span>
                </div>
              </div>

              {/* Área de Preview da Imagem */}
              <div className="space-y-2">
                <label className="text-xs font-bold block" style={{ color: 'var(--ink-primary)' }}>
                  Foto do Item
                </label>

                <div
                  className="relative w-full h-56 rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition"
                  style={{
                    borderColor: fotoPreviewUrl ? 'var(--brand)' : 'var(--hairline)',
                    background: 'var(--surface-raised)',
                  }}
                >
                  {fotoPreviewUrl ? (
                    <div className="relative h-full w-full group">
                      <img
                        src={fotoPreviewUrl}
                        alt="Preview"
                        className="h-full w-full object-contain p-2"
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (fotoPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(fotoPreviewUrl);
                            setFotoArquivo(null);
                            setFotoPreviewUrl(null);
                          }}
                          className="p-1.5 rounded-lg bg-rose-600 text-white shadow-md hover:bg-rose-700 cursor-pointer"
                          title="Remover foto selecionada"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                      <Camera className="h-10 w-10 text-slate-400 mb-2 stroke-1" />
                      <p className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
                        Nenhuma foto selecionada
                      </p>
                      <p className="text-[11px] mt-1 text-slate-500">
                        Tire uma foto com a câmera, anexe um arquivo ou pressione <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[10px]">Ctrl+V</kbd> para colar.
                      </p>
                    </div>
                  )}
                </div>

                {/* Botões de Ação para Captura */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {/* Botão Câmera (Mobile / Web) */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleSelecionarArquivo}
                  />
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={salvando}
                    className="inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-bold transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
                  >
                    <Camera className="h-4 w-4 text-amber-600" />
                    Tirar Foto (Câmera)
                  </button>

                  {/* Botão Selecionar Arquivo da Galeria */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    className="hidden"
                    onChange={handleSelecionarArquivo}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={salvando}
                    className="inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-bold transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
                  >
                    <Upload className="h-4 w-4 text-blue-600" />
                    Escolher da Galeria
                  </button>
                </div>
              </div>

              {/* Campo de Observação Adicional */}
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: 'var(--ink-primary)' }}>
                  Observações Técnicas do Catálogo (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: Embalagem com 10 unidades, marca de referência, dimensões..."
                  className="w-full p-2.5 text-xs rounded-lg border focus:outline-2 focus:outline-offset-1"
                  style={{
                    borderColor: 'var(--hairline)',
                    background: 'var(--surface-raised)',
                    color: 'var(--ink-primary)',
                  }}
                />
              </div>
            </div>

            {/* Rodapé Modal */}
            <div className="px-5 py-3 border-t bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
              {itemSelecionado.tem_foto ? (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={handleRemoverFoto}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir foto atual
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fecharModalFoto}
                  disabled={salvando}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSalvarFoto}
                  disabled={salvando || (!fotoArquivo && !itemSelecionado.tem_foto)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {salvando ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Comprimindo & Salvando…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Salvar no Catálogo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Visualizador em Alta Resolução (Zoom) */}
      {imagemZoom && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setImagemZoom(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-slate-950 flex items-center justify-between border-b border-slate-800">
              <div>
                <span className="font-mono text-xs text-amber-400 font-bold mr-2">
                  SAP {imagemZoom.codigo}
                </span>
                <span className="text-sm font-semibold text-white">
                  {imagemZoom.titulo}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setImagemZoom(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center bg-black/50 overflow-auto max-h-[75vh]">
              <img
                src={imagemZoom.url}
                alt={imagemZoom.titulo}
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cadastro de Item do Catálogo SAP (Busca por Código/Descrição, Infos Automáticas e Habilitação Somente da Foto) */}
      {modalSapAberto && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          role="dialog"
          aria-modal="true"
          onPaste={handlePasteImagemSap}
        >
          <div
            className="w-full max-w-2xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-scale-up"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            {/* Header Modal */}
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
              <div>
                <h3 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
                  <Boxes className="h-5 w-5 text-amber-600" />
                  Cadastrar Item no Catálogo (Catálogo SAP)
                </h3>
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  Pesquise o material no catálogo oficial SAP por código ou descrição. Os dados cadastrais são importados automaticamente, ficando habilitada apenas a captura da foto.
                </p>
              </div>
              <button
                type="button"
                onClick={fecharModalSap}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-5 overflow-y-auto space-y-4 max-h-[calc(92vh-130px)]">
              {/* PASSO 1: SE AINDA NÃO SELECIONOU O ITEM -> PESQUISA SAP E SELEÇÃO */}
              {!itemSapSelecionado ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold block" style={{ color: 'var(--ink-primary)' }}>
                      Pesquisar Material no Catálogo SAP
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 pointer-events-none text-slate-400" />
                      <input
                        type="text"
                        autoFocus
                        value={termoBuscaSap}
                        onChange={(e) => setTermoBuscaSap(e.target.value)}
                        placeholder="Digite o código SAP (ex: 1406776) ou descrição do material (ex: abafador)..."
                        className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border font-medium transition focus:outline-2 focus:outline-offset-1"
                        style={{
                          borderColor: termoBuscaSap ? 'var(--brand)' : 'var(--hairline)',
                          background: 'var(--surface-raised)',
                          color: 'var(--ink-primary)',
                        }}
                      />
                      {termoBuscaSap && (
                        <button
                          type="button"
                          onClick={() => {
                            setTermoBuscaSap('');
                            setResultadosBuscaSap([]);
                          }}
                          className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] block mt-0.5 text-slate-500">
                      Pesquisa simultânea no catálogo SAP geral (172k itens), estoque do canteiro e Book de EPIs.
                    </span>
                  </div>

                  {/* Resultados da Busca */}
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/60 border-b flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
                      <span className="text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>
                        Materiais Encontrados ({resultadosBuscaSap.length})
                      </span>
                      {buscandoSap && (
                        <span className="text-[10px] flex items-center gap-1 text-amber-600 font-medium">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Consultando base SAP…
                        </span>
                      )}
                    </div>

                    <div className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: 'var(--hairline)' }}>
                      {buscandoSap && resultadosBuscaSap.length === 0 ? (
                        <div className="p-8 text-center">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-amber-600 mb-2" />
                          <p className="text-xs text-slate-500 font-medium">Buscando no acervo do SAP…</p>
                        </div>
                      ) : resultadosBuscaSap.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 space-y-1">
                          <Search className="h-7 w-7 mx-auto stroke-1" />
                          <p className="text-xs font-semibold">
                            {termoBuscaSap.trim().length < 2
                              ? 'Digite pelo menos 2 caracteres para pesquisar no SAP.'
                              : `Nenhum material encontrado com "${termoBuscaSap}".`}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Pesquise pelo código numérico SAP ou termos chave da descrição.
                          </p>
                        </div>
                      ) : (
                        resultadosBuscaSap.map((cand) => (
                          <div
                            key={cand.codigo_sap}
                            onClick={() => handleSelecionarItemSap(cand)}
                            className="p-3 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 cursor-pointer transition flex items-center justify-between gap-3 group"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {cand.url_foto ? (
                                <img
                                  src={cand.url_foto}
                                  alt=""
                                  className="h-11 w-11 shrink-0 rounded-lg object-contain bg-white dark:bg-slate-900 border p-0.5"
                                  style={{ borderColor: 'var(--hairline)' }}
                                />
                              ) : (
                                <div className="h-11 w-11 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                  <ImageIcon className="h-5 w-5" />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                    {cand.codigo_sap}
                                  </span>
                                  <span className="text-xs font-bold truncate block" style={{ color: 'var(--ink-primary)' }} title={cand.descricao}>
                                    {cand.descricao}
                                  </span>
                                </div>

                                {cand.texto_tecnico && (
                                  <p className="text-[11px] italic text-slate-500 truncate mt-0.5" title={cand.texto_tecnico}>
                                    {cand.texto_tecnico}
                                  </p>
                                )}

                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1 flex-wrap">
                                  <span>{cand.grp_mercad ? `${cand.grp_mercad} - ${cand.grupo_mercadorias}` : cand.grupo_mercadorias || 'Geral'}</span>
                                  <span>• Unidade: <strong>{cand.umb}</strong></span>
                                  <span>• Saldo ZL0024: <strong>{cand.saldo_total} {cand.umb}</strong></span>
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                              {cand.tem_foto ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                                    cand.origem_foto === 'book_epi'
                                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  }`}
                                >
                                  {cand.origem_foto === 'book_epi' ? (
                                    <>
                                      <ShieldCheck className="h-3 w-3" />
                                      Book EPI {cand.ca_epi ? `· CA ${cand.ca_epi}` : ''}
                                    </>
                                  ) : (
                                    <>
                                      <Check className="h-3 w-3" />
                                      Com Foto
                                    </>
                                  )}
                                </span>
                              ) : null}

                              <button
                                type="button"
                                className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-600 group-hover:bg-amber-700 text-white shadow-xs transition"
                              >
                                Selecionar
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* PASSO 2: ITEM SELECIONADO -> EXIBE TODAS AS INFORMAÇÕES AUTOMÁTICAS E HABILITA APENAS A FOTO */
                <div className="space-y-4">
                  {/* Resumo do Material SAP Selecionado (Somente Leitura) */}
                  <div className="rounded-xl border p-4 space-y-3 bg-slate-50/70 dark:bg-slate-900/40" style={{ borderColor: 'var(--hairline)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-sm font-bold text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                            SAP {itemSapSelecionado.codigo_sap}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            UMB: {itemSapSelecionado.umb}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Saldo Atual ZL0024: {itemSapSelecionado.saldo_total} {itemSapSelecionado.umb}
                          </span>
                          {itemSapSelecionado.origem_foto === 'book_epi' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              <ShieldCheck className="h-3 w-3" /> Book EPI {itemSapSelecionado.ca_epi ? `· CA ${itemSapSelecionado.ca_epi}` : ''}
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>
                          {itemSapSelecionado.descricao}
                        </h4>
                      </div>

                      <button
                        type="button"
                        onClick={handleTrocarItemSap}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                        style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}
                        title="Escolher outro material da pesquisa SAP"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Trocar item
                      </button>
                    </div>

                    {itemSapSelecionado.texto_tecnico && (
                      <div className="p-2.5 rounded-lg border bg-white/80 dark:bg-slate-900/60 text-xs italic" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                        <span className="font-semibold block not-italic text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
                          Texto Técnico / Especificação:
                        </span>
                        {itemSapSelecionado.texto_tecnico}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t" style={{ borderColor: 'var(--hairline)' }}>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Classificação:</span>
                        <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>
                          {itemSapSelecionado.classificacao_nivel1 || 'CONSUMÍVEL'} {itemSapSelecionado.classificacao_nivel2 ? `• ${itemSapSelecionado.classificacao_nivel2}` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Grupo de Mercadorias SAP:</span>
                        <span className="font-semibold truncate block" style={{ color: 'var(--ink-primary)' }}>
                          {itemSapSelecionado.grp_mercad ? `${itemSapSelecionado.grp_mercad} - ${itemSapSelecionado.grupo_mercadorias}` : itemSapSelecionado.grupo_mercadorias || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SEÇÃO HABILITADA: TIRAR / VINCULAR FOTO DO MATERIAL */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
                        <Camera className="h-4 w-4 text-amber-600" />
                        Foto do Material <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] text-slate-500">
                        {fotoPreviewUrlSap ? 'Foto selecionada pronta para compressão' : 'Tire a foto ou escolha um arquivo'}
                      </span>
                    </div>

                    {fotoPreviewUrlSap ? (
                      <div className="space-y-2">
                        <div className="relative rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-gradient-to-b from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center h-60 p-4">
                          <img
                            src={fotoPreviewUrlSap}
                            alt="Preview do material"
                            className="h-full w-full object-contain drop-shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (fotoPreviewUrlSap && fotoPreviewUrlSap.startsWith('blob:')) {
                                URL.revokeObjectURL(fotoPreviewUrlSap);
                              }
                              setFotoArquivoSap(null);
                              setFotoPreviewUrlSap(null);
                            }}
                            className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 text-white hover:bg-rose-600 cursor-pointer transition shadow-md"
                            title="Remover foto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Foto pronta para upload e vinculação ao material.
                          </span>

                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                              <Camera className="h-3.5 w-3.5" />
                              Tirar outra foto
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleSelecionarArquivoSap}
                                className="hidden"
                              />
                            </label>
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                              <Upload className="h-3.5 w-3.5" />
                              Trocar arquivo
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleSelecionarArquivoSap}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-amber-500/40 dark:border-amber-500/30 rounded-2xl p-6 text-center space-y-3 bg-amber-50/20 dark:bg-amber-950/10">
                        <div className="p-3.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 inline-block">
                          <Camera className="h-8 w-8 stroke-1.5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                            Tire a foto do item ou selecione um arquivo
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            A foto será comprimida automaticamente antes do envio. Você também pode colar uma imagem (Ctrl+V).
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 cursor-pointer shadow-md transition hover:scale-105 active:scale-95">
                            <Camera className="h-4 w-4" />
                            Tirar Foto com a Câmera
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleSelecionarArquivoSap}
                              className="hidden"
                            />
                          </label>

                          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                            <Upload className="h-4 w-4" />
                            Escolher da Galeria / PC
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleSelecionarArquivoSap}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Observações Internas (Opcional) */}
                    <div className="space-y-1 pt-1">
                      <label className="text-[11px] font-bold block" style={{ color: 'var(--ink-secondary)' }}>
                        Observações do Item no Catálogo (Opcional)
                      </label>
                      <input
                        type="text"
                        value={observacaoSap}
                        onChange={(e) => setObservacaoSap(e.target.value)}
                        placeholder="Ex: Padrão homologado da obra, uso geral"
                        className="w-full px-3 py-2 text-xs rounded-lg border focus:outline-2"
                        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé Modal */}
            <div className="px-5 py-3 border-t bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
              <div>
                {itemSapSelecionado && (
                  <button
                    type="button"
                    onClick={handleTrocarItemSap}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer font-medium"
                  >
                    ← Voltar para a pesquisa
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fecharModalSap}
                  disabled={salvandoSap}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                >
                  Cancelar
                </button>

                {itemSapSelecionado && (
                  <button
                    type="button"
                    onClick={handleSalvarItemSap}
                    disabled={salvandoSap || (!fotoArquivoSap && !itemSapSelecionado.tem_foto)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md transition cursor-pointer disabled:opacity-50"
                  >
                    {salvandoSap ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Comprimindo & Salvando…
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Salvar no Catálogo
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
