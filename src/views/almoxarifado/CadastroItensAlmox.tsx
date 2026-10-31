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

import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue, lazy, Suspense } from 'react';
import {
  ArrowLeft, RefreshCw, Search, Camera, ImageIcon, CheckCircle2,
  AlertCircle, X, Download, Filter, Eye, Trash2, Layers,
  Boxes, Sparkles, Tag, ShieldCheck, FileText, Check,
  ChevronRight, ClipboardPaste, Upload, Plus, Printer, MapPin, SlidersHorizontal
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import {
  OPCOES_FILTRO_DATA,
  alteradoNoIntervalo,
  intervaloDoFiltro,
  type FiltroDataAlteracao,
} from '../../lib/filtroDataAlteracao';
import {
  carregarDadosCatalogoCompleto,
  buscarMateriaisParaAdicao,
  pesquisarCatalogoSapOnline,
  salvarItemCatalogo,
  obterUrlFotoCatalogo,
  excluirItemCatalogo,
  obterListaFixaCatalogoLocal,
  mapaPosicoesEstoque,
  posicaoDoMaterial,
  marcarEtiquetasImpressas,
  listarFotosAdicionais,
  adicionarFotosAdicionais,
  removerFotoAdicional,
  substituirFotoAdicional,
  formatarSaldo,
  arredondarSaldo,
  MAX_FOTOS_ADICIONAIS,
  type FotoAdicionalCatalogo,
  type ItemConsumivelZl0024,
  type CatalogoItem,
  type MaterialCandidatoCatalogo,
  type DadosCatalogoCompleto,
} from '../../lib/almoxCatalogoApi';
import {
  CORES_ETIQUETA, ORDEM_CORES_ETIQUETA, dadosEtiquetaDoItem, ehCorEtiqueta, numeroOuNull,
  type CorEtiqueta, type DadosEtiqueta,
} from '../../lib/etiquetaMaterial';
import { gerarPdfEtiquetasMaterial } from '../../lib/pdfExport/exportEtiquetasMaterialPdf';
import PdfPreviewModal, { type PdfGerado } from '../../components/ui/PdfPreviewModal';
import CompletarEtiquetasModal, { type LinhaFaltante, type ValoresPreenchidos } from '../../components/almoxarifado/CompletarEtiquetasModal';
import type { Profile } from '../../types';
import { extrairPalavrasChave, casarTokens, normalizarParaBusca } from '../../lib/buscaKeywords';
import FotosRecebimentoSugeridas from '../../components/almoxarifado/FotosRecebimentoSugeridas';
import SearchKeywordsChips from '../../components/ui/SearchKeywordsChips';
import CamposLoteValidade from '../../components/almoxarifado/CamposLotesValidade';
import { lotesDoCatalogo, normalizarLotesCatalogo, type LoteValidadeCatalogo } from '../../lib/almoxCatalogoLotes';
import CatalogoItemTile from '../../components/almoxarifado/CatalogoItemTile';
import CatalogoItemDetalhe from '../../components/almoxarifado/CatalogoItemDetalhe';
import { localDb } from '../../db/localDb';
import { normalizeCode } from '../../lib/almoxarifado';
import { canAccessForm } from '../../lib/pages';
import { FORMULARIO_ACAO_ITEM } from '../../lib/acoesQr';
import { hojeISO } from '../../lib/recebimentoAlmox';
import { prepararContagemDoMaterial } from '../../lib/inventarioAtalho';
import { buscarInventario } from '../../lib/inventarioCiclicoApi';
import type { ItemInventario } from '../../lib/inventarioCiclico';
import {
  listarUltimasContagens, ultimaContagemDoMaterial, type UltimaContagem,
} from '../../lib/inventarioUltimaContagem';

// A contagem é a mesma do Inventário Cíclico (rodada preparada, controle de
// movimentação, causa na recontagem); só baixa quando alguém toca em "Contar".
const ModalContagem = lazy(() => import('./InventarioCiclico').then(m => ({ default: m.ModalContagem })));

interface CadastroItensAlmoxProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

type FiltroRapido = 'todos' | 'com_foto' | 'sem_foto' | 'com_localizacao';
type ModoVisualizacao = 'cards' | 'tabela';
type FiltroEtiqueta = 'todas' | 'impressa' | 'nao_impressa';

/** Itens desenhados por vez; "Mostrar mais" acrescenta outro lote. */
const LOTE_ITENS = 60;


export default function CadastroItensAlmox({ user, onNavigate }: CadastroItensAlmoxProps) {
  const toast = useToast();

  const [dadosCompletos, setDadosCompletos] = useState<DadosCatalogoCompleto | null>(null);
  
  // Inicialização síncrona imediata a partir do armazenamento local para abertura com zero delay
  const [itens, setItens] = useState<ItemConsumivelZl0024[]>(() => {
    try {
      return obterListaFixaCatalogoLocal();
    } catch {
      return [];
    }
  });
  const [carregando, setCarregando] = useState(() => {
    try {
      return obterListaFixaCatalogoLocal().length === 0;
    } catch {
      return true;
    }
  });
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
  const [posicaoSap, setPosicaoSap] = useState('');
  const [lotesSap, setLotesSap] = useState<LoteValidadeCatalogo[]>([]);
  const [posicaoFoto, setPosicaoFoto] = useState('');
  const [lotesFoto, setLotesFoto] = useState<LoteValidadeCatalogo[]>([]);
  const [etiquetaDescricao, setEtiquetaDescricao] = useState('');
  const [etiquetaAplicacao, setEtiquetaAplicacao] = useState('');
  const [estoqueMinimo, setEstoqueMinimo] = useState('');
  // Itens marcados para imprimir etiqueta (por código SAP)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  // Pré-visualização do PDF das etiquetas
  const [previewEtiquetas, setPreviewEtiquetas] = useState<{ dados: DadosEtiqueta[]; codigos: string[] } | null>(null);
  // Cor escolhida na impressão — lembrada no aparelho (conveniência, não dado)
  const [corEtiqueta, setCorEtiqueta] = useState<CorEtiqueta>(() => {
    try {
      const salva = localStorage.getItem('sisten_etiqueta_cor');
      return ehCorEtiqueta(salva) ? salva : 'cinza';
    } catch {
      return 'cinza';
    }
  });
  const escolherCorEtiqueta = (cor: CorEtiqueta) => {
    setCorEtiqueta(cor);
    try { localStorage.setItem('sisten_etiqueta_cor', cor); } catch { /* sem storage: só não lembra */ }
  };
  // Gerador estável: o modal refaz o PDF só quando os itens ou a cor mudam.
  const gerarPdfEtiquetas = useCallback(async (): Promise<PdfGerado> => {
    const dados = previewEtiquetas?.dados ?? [];
    const doc = await gerarPdfEtiquetasMaterial(dados, corEtiqueta);
    return {
      bytes: await doc.save(),
      nomeArquivo: `etiquetas_material_${new Date().toISOString().slice(0, 10)}.pdf`,
      titulo: `Etiquetas de material — ${dados.length} etiqueta(s), ${Math.ceil(dados.length / 10)} folha(s) A4`,
    };
  }, [previewEtiquetas, corEtiqueta]);
  // Pergunta de informação faltante antes de abrir o PDF
  const [completarEtiquetas, setCompletarEtiquetas] = useState<{ itens: ItemConsumivelZl0024[]; linhas: LinhaFaltante[] } | null>(null);
  const [salvandoSap, setSalvandoSap] = useState(false);

  // Filtros
  const [buscaChips, setBuscaChips] = useState<string[]>([]);
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('todos');
  const [filtroNivel2, setFiltroNivel2] = useState<string>('todos');
  const [filtroGrupo, setFiltroGrupo] = useState<string>('todos');
  const [filtroLocalizacao, setFiltroLocalizacao] = useState<string>('todas');
  const [filtroData, setFiltroData] = useState<FiltroDataAlteracao>('todas');
  const [periodoData, setPeriodoData] = useState({ de: '', ate: '' });
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<FiltroEtiqueta>('todas');
  const [modoVis, setModoVis] = useState<ModoVisualizacao>('cards');
  // Texto ainda não confirmado no campo de busca: filtra enquanto digita.
  const [buscaDigitada, setBuscaDigitada] = useState('');
  const buscaDigitadaAdiada = useDeferredValue(buscaDigitada);
  // No celular os filtros secundários ficam recolhidos atrás de um botão.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // O campo "Adicionar item" só aparece pelo botão do topo.
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  // Detalhe do item (pelo código: acompanha as edições salvas na lista).
  const [detalheCodigo, setDetalheCodigo] = useState<string | null>(null);

  // Inventário Cíclico: última contagem de cada material e a contagem aberta pelo atalho.
  const podeContar = canAccessForm(user, FORMULARIO_ACAO_ITEM.inventario);
  const [ultimasContagens, setUltimasContagens] = useState<Map<string, UltimaContagem> | null>(null);
  const [versaoContagem, setVersaoContagem] = useState(0);
  const [preparandoCodigo, setPreparandoCodigo] = useState<string | null>(null);
  const [contando, setContando] = useState<{ inventarioId: string; item: ItemInventario; codigoSap: string } | null>(null);
  const hoje = hojeISO();

  // Modal de Cadastro de Foto
  const [itemSelecionado, setItemSelecionado] = useState<ItemConsumivelZl0024 | null>(null);
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Fotos adicionais do item: as já gravadas e as escolhidas que sobem ao salvar.
  // Só este cadastro as enxerga — a foto principal (e o Recebimento) não mudam.
  const [fotosAdicionais, setFotosAdicionais] = useState<FotoAdicionalCatalogo[]>([]);
  const [adicionaisNovas, setAdicionaisNovas] = useState<{ file: File; preview: string }[]>([]);
  const adicionaisCameraRef = useRef<HTMLInputElement>(null);
  const adicionaisGaleriaRef = useRef<HTMLInputElement>(null);
  const substituirInputRef = useRef<HTMLInputElement>(null);
  const substituirAlvoRef = useRef<FotoAdicionalCatalogo | null>(null);
  const [substituindoId, setSubstituindoId] = useState<string | null>(null);

  // Modal de Visualização da Imagem em Alta Resolução
  const [imagemZoom, setImagemZoom] = useState<{ url: string; titulo: string; codigo: string } | null>(null);

  // Referências para input de arquivo e câmera
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const carregarDados = useCallback(async (mostrarCarregando = false) => {
    try {
      if (mostrarCarregando) setCarregando(true);
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

  // Sem acesso ou sem rede, o cartão só não mostra a linha do inventário.
  useEffect(() => {
    let ativo = true;
    listarUltimasContagens()
      .then((mapa) => { if (ativo) setUltimasContagens(mapa); })
      .catch((err) => console.warn('[CadastroItensAlmox] Últimas contagens indisponíveis:', err));
    return () => { ativo = false; };
  }, []);
  const ultimaDoItem = useCallback(
    (codigo: string) => (ultimasContagens ? ultimasContagens.get(normalizeCode(codigo)) ?? null : undefined),
    [ultimasContagens],
  );

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

  // Localização física (Pos.dpst. da ZL0024) por código SAP — a última conhecida,
  // então o item que zerou e saiu da ZL0024 continua com a posição.
  const posicoesPorMaterial = useMemo(
    () => dadosCompletos?.posicoes ?? mapaPosicoesEstoque(dadosCompletos?.estoqueCompleto ?? []),
    [dadosCompletos],
  );
  const posicaoDoItem = useCallback(
    (item: ItemConsumivelZl0024) => posicaoDoMaterial(item.codigo_sap, item.item_catalogo, posicoesPorMaterial),
    [posicoesPorMaterial],
  );

  // Um material pode ocupar mais de uma posição. O mesmo recorte serve para a
  // lista de opções e para o filtro, sem perder materiais multi-localizados.
  const localizacoesDoItem = useCallback(
    (item: ItemConsumivelZl0024) => posicaoDoItem(item).split(',').map(posicao => posicao.trim()).filter(Boolean),
    [posicaoDoItem],
  );

  const opcoesLocalizacoes = useMemo(() => {
    const localizacoes = new Set<string>();
    itens.forEach(item => localizacoesDoItem(item).forEach(posicao => localizacoes.add(posicao)));
    return Array.from(localizacoes).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [itens, localizacoesDoItem]);

  // Itens filtrados
  const itensFiltrados = useMemo(() => {
    const tokens = [...buscaChips, ...extrairPalavrasChave(buscaDigitadaAdiada)].map(normalizarParaBusca).filter(Boolean);
    const intervaloData = intervaloDoFiltro(filtroData, periodoData);

    const filtrados = itens.filter(it => {
      if (!alteradoNoIntervalo(it.item_catalogo?.updated_at, intervaloData)) return false;

      // Item sem cadastro no catálogo nunca teve etiqueta impressa.
      const etiquetaImpressa = Boolean(it.item_catalogo?.etiqueta_impressa_em);
      if (filtroEtiqueta === 'impressa' && !etiquetaImpressa) return false;
      if (filtroEtiqueta === 'nao_impressa' && etiquetaImpressa) return false;

      const localizacoes = localizacoesDoItem(it);

      // Filtro de texto por palavras-chave
      if (tokens.length > 0) {
        const hit = casarTokens([
          it.codigo_sap,
          it.descricao,
          it.texto_tecnico,
          it.grp_mercad,
          it.grupo_mercadorias,
          it.classificacao_nivel2,
          posicaoDoItem(it),
        ], tokens);
        if (!hit) return false;
      }

      // Filtro de status da foto
      if (filtroRapido === 'com_foto' && !it.tem_foto) return false;
      if (filtroRapido === 'sem_foto' && it.tem_foto) return false;
      if (filtroRapido === 'com_localizacao' && localizacoes.length === 0) return false;

      // Filtro de Nível 2
      if (filtroNivel2 !== 'todos' && it.classificacao_nivel2 !== filtroNivel2) return false;

      // Filtro de Grupo de Mercadorias
      if (filtroGrupo !== 'todos' && it.grupo_mercadorias !== filtroGrupo) return false;

      // Filtro de localização: inclui o material quando uma de suas posições
      // coincide com a escolhida; "sem localização" destaca o cadastro pendente.
      if (filtroLocalizacao === 'sem_localizacao' && localizacoes.length > 0) return false;
      if (filtroLocalizacao !== 'todas' && filtroLocalizacao !== 'sem_localizacao' && !localizacoes.includes(filtroLocalizacao)) return false;

      return true;
    });

    // Último alterado primeiro; quem nunca foi cadastrado vai para o fim, na
    // ordem em que já vinha (sort estável).
    const alteradoEm = (it: ItemConsumivelZl0024) => it.item_catalogo?.updated_at ?? '';
    return filtrados.sort((a, b) => alteradoEm(b).localeCompare(alteradoEm(a)));
  }, [itens, buscaChips, buscaDigitadaAdiada, filtroRapido, filtroNivel2, filtroGrupo, filtroLocalizacao, filtroData, periodoData, filtroEtiqueta, posicaoDoItem, localizacoesDoItem]);

  // Desenha em lotes (como a aba BOM): o catálogo passa de mil itens com foto,
  // e montar todos de uma vez trava o celular e baixa dezenas de MB de imagem.
  const [visiveisQtd, setVisiveisQtd] = useState(LOTE_ITENS);
  useEffect(() => { setVisiveisQtd(LOTE_ITENS); }, [buscaChips, buscaDigitadaAdiada, filtroRapido, filtroNivel2, filtroGrupo, filtroLocalizacao, filtroData, periodoData, filtroEtiqueta, modoVis]);
  const itensVisiveis = useMemo(() => itensFiltrados.slice(0, visiveisQtd), [itensFiltrados, visiveisQtd]);

  // Estatísticas e KPIs
  const kpis = useMemo(() => {
    const total = itens.length;
    const comFoto = itens.filter(i => i.tem_foto).length;
    const semFoto = total - comFoto;
    const comLocalizacao = itens.filter(item => localizacoesDoItem(item).length > 0).length;
    const pctCobertura = total > 0 ? (comFoto / total) * 100 : 0;
    const saldoTotal = arredondarSaldo(itens.reduce((acc, i) => acc + (Number(i.saldo_total) || 0), 0));
    const etiquetaImpressa = itens.filter(i => i.item_catalogo?.etiqueta_impressa_em).length;

    return { total, comFoto, semFoto, comLocalizacao, pctCobertura, saldoTotal, etiquetaImpressa };
  }, [itens, localizacoesDoItem]);

  // Filtros secundários em uso — contados no botão "Filtros" do celular.
  const filtrosSecundariosAtivos = [
    filtroNivel2 !== 'todos', filtroGrupo !== 'todos', filtroLocalizacao !== 'todas',
    filtroData !== 'todas', filtroEtiqueta !== 'todas',
  ].filter(Boolean).length;
  const algumFiltroAtivo = filtrosSecundariosAtivos > 0 || filtroRapido !== 'todos'
    || buscaChips.length > 0 || buscaDigitadaAdiada.trim() !== '';
  const limparFiltros = () => {
    setFiltroNivel2('todos'); setFiltroGrupo('todos'); setFiltroLocalizacao('todas');
    setFiltroData('todas'); setPeriodoData({ de: '', ate: '' }); setFiltroEtiqueta('todas');
    setFiltroRapido('todos'); setBuscaChips([]);
  };

  const abrirAdicionar = () => {
    setAdicionarAberto(true);
    // Depois de montar: o campo só existe com o painel aberto.
    window.setTimeout(() => inputAdicionarRef.current?.focus(), 0);
  };
  const fecharAdicionar = () => {
    setAdicionarAberto(false);
    setTermoAdicionar('');
    setSugestoesAbertas(false);
  };

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
    fecharAdicionar();
  };

  // Funções de Abertura e Controle do Modal de Pesquisa SAP
  const handleAbrirModalSap = (termoInicial = '') => {
    setTermoBuscaSap(termoInicial);
    setItemSapSelecionado(null);
    setFotoArquivoSap(null);
    setFotoPreviewUrlSap(null);
    setObservacaoSap('');
    setPosicaoSap('');
    setModalSapAberto(true);
    setAdicionarAberto(false);
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
    setPosicaoSap('');
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
    const cadastro = dadosCompletos?.itensCatalogo.find(c => c.codigo_sap === candidato.codigo_sap);
    setLotesSap(lotesDoCatalogo(cadastro));
    setItemSapSelecionado(candidato);
    setFotoArquivoSap(null);
    setFotoPreviewUrlSap(candidato.url_foto || null);
    setObservacaoSap('');
    setPosicaoSap('');
  };

  const handleTrocarItemSap = () => {
    if (fotoPreviewUrlSap && fotoPreviewUrlSap.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrlSap);
    }
    setItemSapSelecionado(null);
    setFotoArquivoSap(null);
    setFotoPreviewUrlSap(null);
    setObservacaoSap('');
    setPosicaoSap('');
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

  const colarImagemSap = (file: File) => {
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
    setPosicaoFoto(item.item_catalogo?.posicao_estoque || '');
    setLotesFoto(lotesDoCatalogo(item.item_catalogo));
    setEtiquetaDescricao(item.item_catalogo?.etiqueta_descricao || '');
    setEtiquetaAplicacao(item.item_catalogo?.etiqueta_aplicacao || '');
    const minimoGravado = item.item_catalogo?.estoque_minimo;
    setEstoqueMinimo(minimoGravado === null || minimoGravado === undefined ? '' : String(minimoGravado).replace('.', ','));
    limparAdicionaisNovas();
    setFotosAdicionais([]);
    const catalogoId = item.item_catalogo?.id;
    if (catalogoId) {
      listarFotosAdicionais(catalogoId)
        .then(setFotosAdicionais)
        .catch((err) => {
          console.warn('[CadastroItensAlmox] Falha ao carregar fotos adicionais:', err);
          toast.error('Não foi possível carregar as fotos adicionais deste item.');
        });
    }
  };

  const limparAdicionaisNovas = () => {
    setAdicionaisNovas((atuais) => {
      atuais.forEach((a) => URL.revokeObjectURL(a.preview));
      return [];
    });
  };

  /** Fotos escolhidas (câmera ou galeria): entram numa fila e sobem junto com o "Salvar". */
  const handleEscolherAdicionais = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    const vagas = MAX_FOTOS_ADICIONAIS - fotosAdicionais.length - adicionaisNovas.length;
    if (vagas <= 0) {
      toast.warning(`Cada item aceita até ${MAX_FOTOS_ADICIONAIS} fotos adicionais.`);
      return;
    }
    if (arquivos.length > vagas) {
      toast.warning(`Só cabem mais ${vagas} foto(s) adicional(is); as demais foram ignoradas.`);
    }
    setAdicionaisNovas((atuais) => [
      ...atuais,
      ...arquivos.slice(0, vagas).map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
  };

  const removerAdicionalNova = (indice: number) => {
    setAdicionaisNovas((atuais) => {
      URL.revokeObjectURL(atuais[indice]?.preview);
      return atuais.filter((_, i) => i !== indice);
    });
  };

  /** Troca na hora uma foto adicional já gravada por outra, na mesma posição. */
  const handleSubstituirAdicional = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    const alvo = substituirAlvoRef.current;
    substituirAlvoRef.current = null;
    if (!arquivo || !alvo || !itemSelecionado) return;
    setSubstituindoId(alvo.id);
    try {
      const nova = await substituirFotoAdicional(alvo, arquivo, itemSelecionado.codigo_sap, user);
      setFotosAdicionais((atuais) => atuais.map((f) => (f.id === alvo.id ? nova : f)));
      toast.success('Foto adicional substituída.');
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao substituir a foto adicional.');
    } finally {
      setSubstituindoId(null);
    }
  };

  /** Apaga na hora uma foto adicional já gravada (como o "Excluir foto atual"). */
  const handleRemoverAdicionalSalva = async (foto: FotoAdicionalCatalogo) => {
    if (!window.confirm('Remover esta foto adicional do item?')) return;
    try {
      await removerFotoAdicional(foto);
      setFotosAdicionais((atuais) => atuais.filter((f) => f.id !== foto.id));
      toast.success('Foto adicional removida.');
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao remover a foto adicional.');
    }
  };

  const fecharModalFoto = () => {
    if (fotoPreviewUrl && fotoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrl);
    }
    limparAdicionaisNovas();
    setFotosAdicionais([]);
    setItemSelecionado(null);
    setFotoArquivo(null);
    setFotoPreviewUrl(null);
    setObservacao('');
    setPosicaoFoto('');
    setLotesFoto([]);
    setEtiquetaDescricao('');
    setEtiquetaAplicacao('');
    setEstoqueMinimo('');
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
  const colarImagem = (file: File) => {
    if (fotoPreviewUrl && fotoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreviewUrl);
    }

    setFotoArquivo(file);
    setFotoPreviewUrl(URL.createObjectURL(file));
    toast.success('Imagem colada da área de transferência.');
  };

  // Ctrl+V com imagem cola a foto em qualquer ponto da janela aberta, sem
  // depender do foco estar dentro dela (quem abre pelo cartão fica com o foco na
  // página de trás e o onPaste da janela nunca disparava). Colar texto num campo
  // segue normal: só intercepta quando há imagem na área de transferência.
  const colarRef = useRef<(file: File) => boolean>(() => false);
  colarRef.current = (file: File) => {
    if (itemSelecionado) { colarImagem(file); return true; }
    if (modalSapAberto && itemSapSelecionado) { colarImagemSap(file); return true; }
    return false;
  };
  const algumaJanelaDeFoto = Boolean(itemSelecionado) || (modalSapAberto && Boolean(itemSapSelecionado));
  useEffect(() => {
    if (!algumaJanelaDeFoto) return;
    const aoColar = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.kind === 'file' && i.type.startsWith('image/'));
      const arquivo = item?.getAsFile();
      if (!arquivo) return;
      if (colarRef.current(arquivo)) e.preventDefault();
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  }, [algumaJanelaDeFoto]);

  /** Posição ou dados da etiqueta diferentes do que está gravado — dá para salvar sem foto. */
  const cadastroDoItemMudou = (item: ItemConsumivelZl0024) => {
    const cat = item.item_catalogo;
    return posicaoFoto.trim() !== (cat?.posicao_estoque || '').trim()
      || etiquetaDescricao.trim() !== (cat?.etiqueta_descricao || '').trim()
      || etiquetaAplicacao.trim() !== (cat?.etiqueta_aplicacao || '').trim()
      || numeroOuNull(estoqueMinimo) !== numeroOuNull(cat?.estoque_minimo)
      || JSON.stringify(normalizarLotesCatalogo(lotesFoto)) !== JSON.stringify(lotesDoCatalogo(cat));
  };

  /** Abre a pré-visualização; a data de impressão só é carimbada ao baixar. */
  const abrirPreviewEtiquetas = (dados: DadosEtiqueta[]) => {
    if (dados.length === 0) {
      toast.warning('Marque ao menos um item para imprimir a etiqueta.');
      return;
    }
    setPreviewEtiquetas({ dados, codigos: dados.map(d => d.codigo_sap) });
  };

  const aoBaixarEtiquetas = async (codigos: string[]) => {
    const impressaEm = await marcarEtiquetasImpressas(codigos);
    if (!impressaEm) return;
    const marcados = new Set(codigos);
    setItens(prev => prev.map(it => (marcados.has(it.codigo_sap) && it.item_catalogo
      ? { ...it, item_catalogo: { ...it.item_catalogo, etiqueta_impressa_em: impressaEm } }
      : it)));
  };

  /** Etiquetas dos itens: se faltar localização, aplicação ou foto, pergunta antes de abrir o PDF. */
  const prepararEtiquetas = (lista: ItemConsumivelZl0024[]) => {
    const linhas: LinhaFaltante[] = lista
      .map(it => {
        const d = dadosEtiquetaDoItem(it, posicaoDoItem(it));
        return { codigo_sap: d.codigo_sap, descricao: d.descricao, localizacao: d.localizacao, aplicacao: d.aplicacao, temFoto: Boolean(d.url_foto) };
      })
      .filter(l => !l.localizacao || !l.aplicacao || !l.temFoto);
    if (linhas.length > 0) {
      setCompletarEtiquetas({ itens: lista, linhas });
      return;
    }
    abrirPreviewEtiquetas(lista.map(it => dadosEtiquetaDoItem(it, posicaoDoItem(it))));
  };

  const imprimirSelecionadas = () => {
    prepararEtiquetas(itens.filter(it => selecionados.has(it.codigo_sap)));
  };

  /** Grava no cadastro o que foi preenchido na pergunta e abre o PDF já com os valores novos. */
  const salvarFaltantesEAbrir = async (valores: Map<string, ValoresPreenchidos>) => {
    if (!completarEtiquetas) return;
    const originais = new Map(completarEtiquetas.linhas.map(l => [l.codigo_sap, l]));
    const atualizados = new Map<string, CatalogoItem>();
    const falhas: string[] = [];
    for (const [codigo, v] of valores) {
      const item = completarEtiquetas.itens.find(it => it.codigo_sap === codigo);
      const orig = originais.get(codigo);
      if (!item || !orig) continue;
      try {
        const salvo = await salvarItemCatalogo({
          codigo_sap: item.codigo_sap,
          descricao: item.descricao,
          texto_tecnico: item.texto_tecnico,
          grp_mercad: item.grp_mercad,
          grupo_mercadorias: item.grupo_mercadorias,
          classificacao_nivel1: item.classificacao_nivel1,
          classificacao_nivel2: item.classificacao_nivel2,
          umb: item.umb,
          saldo_zl0024: item.saldo_total,
          // Só o campo mexido: localização que veio da ZL0024 não vira digitada à toa.
          posicao_estoque: v.localizacao !== orig.localizacao ? v.localizacao : undefined,
          etiqueta_aplicacao: v.aplicacao !== orig.aplicacao ? v.aplicacao : undefined,
        }, user);
        atualizados.set(codigo, salvo);
      } catch (err: any) {
        falhas.push(`${codigo}: ${err?.message || 'falha ao salvar'}`);
      }
    }
    if (falhas.length > 0) {
      toast.error(`Não salvou ${falhas.length} item(ns): ${falhas[0]}`);
      return;
    }

    const comCadastroNovo = (it: ItemConsumivelZl0024): ItemConsumivelZl0024 => {
      const salvo = atualizados.get(it.codigo_sap);
      return salvo ? { ...it, item_catalogo: { ...salvo, url_imagem: it.item_catalogo?.url_imagem ?? salvo.url_imagem } } : it;
    };
    setItens(prev => prev.map(comCadastroNovo));
    if (atualizados.size > 0) {
      setDadosCompletos(dc => (dc
        ? { ...dc, itensCatalogo: [...dc.itensCatalogo.filter(c => !atualizados.has(c.codigo_sap)), ...atualizados.values()] }
        : dc));
      toast.success(`${atualizados.size} item(ns) atualizado(s) no cadastro.`);
    }
    const lista = completarEtiquetas.itens.map(comCadastroNovo);
    setCompletarEtiquetas(null);
    abrirPreviewEtiquetas(lista.map(it => dadosEtiquetaDoItem(it, posicaoDoItem(it))));
  };

  /** Etiqueta do item aberto no modal, com o que está digitado (salvo ou não). */
  const imprimirEtiquetaDoModal = () => {
    if (!itemSelecionado) return;
    const posicaoDigitada = posicaoFoto.trim();
    const dados = dadosEtiquetaDoItem(
      {
        ...itemSelecionado,
        item_catalogo: { etiqueta_descricao: etiquetaDescricao.trim(), etiqueta_aplicacao: etiquetaAplicacao.trim(), estoque_minimo: numeroOuNull(estoqueMinimo) },
      },
      posicaoDigitada || posicaoDoMaterial(itemSelecionado.codigo_sap, null, posicoesPorMaterial),
    );
    const comFoto = { ...dados, url_foto: fotoArquivo ? fotoPreviewUrl : itemSelecionado.url_foto ?? null };
    const faltando = [
      !comFoto.localizacao && 'localização',
      !comFoto.aplicacao && 'aplicação',
      !comFoto.url_foto && 'foto',
    ].filter(Boolean);
    if (faltando.length > 0
        && window.confirm(`Esta etiqueta está sem ${faltando.join(', ')}.\n\nQuer preencher antes de abrir o PDF?\n(OK = voltar e preencher · Cancelar = abrir assim mesmo)`)) {
      return;
    }
    abrirPreviewEtiquetas([comFoto]);
  };

  const alternarSelecao = (codigoSap: string) => {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(codigoSap)) novo.delete(codigoSap);
      else novo.add(codigoSap);
      return novo;
    });
  };

  // Salvar foto no catálogo
  const handleSalvarFoto = async () => {
    if (!itemSelecionado) return;
    const cadastroMudou = cadastroDoItemMudou(itemSelecionado);
    if (!fotoArquivo && !itemSelecionado.tem_foto && !cadastroMudou && adicionaisNovas.length === 0) {
      toast.warning('Tire uma foto, selecione uma imagem ou preencha os dados do cadastro.');
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
        posicao_estoque: posicaoFoto,
        etiqueta_descricao: etiquetaDescricao,
        etiqueta_aplicacao: etiquetaAplicacao,
        estoque_minimo: numeroOuNull(estoqueMinimo),
        lotes_validade: normalizarLotesCatalogo(lotesFoto),
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

      // Fotos adicionais: sobem depois do cadastro, que cria o registro quando o item ainda não tem.
      if (adicionaisNovas.length > 0) {
        const { salvas, falhas } = await adicionarFotosAdicionais(
          salvo.id, salvo.codigo_sap, adicionaisNovas.map((a) => a.file), user,
        );
        if (falhas.length > 0) {
          // O cadastro já foi gravado; fica aberto só o que não subiu, para tentar de novo.
          const falhou = new Set(falhas.map((f) => f.arquivo));
          setAdicionaisNovas((atuais) => {
            atuais.filter((a) => !falhou.has(a.file)).forEach((a) => URL.revokeObjectURL(a.preview));
            return atuais.filter((a) => falhou.has(a.file));
          });
          setFotosAdicionais((atuais) => [...atuais, ...salvas]);
          toast.error(`Cadastro salvo, mas ${falhas.length} foto(s) adicional(is) não subiram: ${falhas.map((f) => f.motivo).join('; ')}`);
          return;
        }
      }

      const nAdicionais = adicionaisNovas.length;
      const sufixoAdicionais = nAdicionais > 0 ? ` (+${nAdicionais} foto${nAdicionais > 1 ? 's' : ''} adicional${nAdicionais > 1 ? 'is' : ''})` : '';
      toast.success(fotoArquivo || !cadastroMudou
        ? `Foto do material ${salvo.codigo_sap} vinculada ao catálogo com sucesso!${sufixoAdicionais}`
        : `Cadastro do material ${salvo.codigo_sap} salvo no catálogo.${sufixoAdicionais}`);
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
    if (!fotoArquivoSap && !itemSapSelecionado.tem_foto && !posicaoSap.trim() && normalizarLotesCatalogo(lotesSap).length === 0) {
      toast.warning('Tire uma foto, anexe uma imagem ou informe posição, lote ou validade.');
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
        posicao_estoque: posicaoSap.trim() || undefined,
        lotes_validade: normalizarLotesCatalogo(lotesSap),
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

  /** Atalho "Contar": põe o item no inventário avulso do dia e abre a contagem auditada. */
  const contarItem = async (item: ItemConsumivelZl0024) => {
    if (preparandoCodigo) return;
    setPreparandoCodigo(item.codigo_sap);
    try {
      const [estoque, giro] = await Promise.all([
        localDb.fetchEstoque(),
        localDb.fetchGiroEstoque().catch(() => []),
      ]);
      const r = await prepararContagemDoMaterial(item.codigo_sap, user, estoque, giro);
      if (r.tipo === 'fora_zl0024') {
        toast.error(`${item.codigo_sap} não está na ZL0024. A contagem é comparada com ela, então não há saldo para inventariar.`);
      } else if (r.tipo === 'offline') {
        toast.info('Sem rede: o item entrou na fila do inventário. A contagem abre quando sincronizar.');
      } else if (r.tipo === 'de_outro') {
        toast.warning(`Item já está em contagem no ${r.inventario.codigo}, de ${r.inventario.criado_por_nome || 'outro responsável'}.`);
      } else {
        setDetalheCodigo(null);
        setContando({ inventarioId: r.inventario.id, item: r.item, codigoSap: item.codigo_sap });
        toast.info(`Contagem no inventário ${r.inventario.codigo}.`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível abrir a contagem deste item.');
    } finally {
      setPreparandoCodigo(null);
    }
  };

  /** Depois de cada contagem: item atualizado no modal e a última contagem do cartão. */
  const recarregarContagem = useCallback(async () => {
    if (!contando) return;
    const [inv, ultima] = await Promise.all([
      buscarInventario(contando.inventarioId).catch(() => null),
      ultimaContagemDoMaterial(contando.codigoSap).catch(() => undefined),
    ]);
    const item = inv?.itens.find(i => i.id === contando.item.id);
    if (item) setContando(c => (c ? { ...c, item } : c));
    if (ultima !== undefined) {
      setUltimasContagens(mapa => {
        const novo = new Map(mapa ?? []);
        const chave = normalizeCode(contando.codigoSap);
        if (ultima) novo.set(chave, ultima); else novo.delete(chave);
        return novo;
      });
    }
    setVersaoContagem(v => v + 1);
  }, [contando]);

  /** Foto tirada durante a contagem também vale para o catálogo. */
  const aplicarFotoDaContagem = (codigoSap: string, salvo: CatalogoItem) => {
    setItens(prev => prev.map(it => (it.codigo_sap === codigoSap
      ? { ...it, item_catalogo: salvo, tem_foto: Boolean(salvo.imagem_path), url_foto: salvo.url_imagem || it.url_foto, origem_foto: 'catalogo' as const }
      : it)));
  };

  const itemDetalhe = detalheCodigo ? itens.find(it => it.codigo_sap === detalheCodigo) ?? null : null;
  const itemContando = contando ? itens.find(it => it.codigo_sap === contando.codigoSap) ?? null : null;

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
      'Posição no Depósito',
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
      `"${posicaoDoItem(it)}"`,
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
    <div className="space-y-3 sm:space-y-6 animate-fade-in pb-12">
      {/* Topo: no celular, título curto e ações em ícone — a lista é o que importa */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/formularios/almoxarifado')}
            className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold hover:underline cursor-pointer mb-1 sm:mb-2"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="sm:hidden">Formulários</span>
            <span className="hidden sm:inline">Voltar aos formulários do almoxarifado</span>
          </button>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-lg sm:text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
              <Layers className="hidden sm:block h-6 w-6 text-amber-600 dark:text-amber-500" />
              Cadastro de Itens<span className="hidden sm:inline"> — Catálogo de Consumíveis</span>
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              FRM.ALM-0016
            </span>
          </div>
          <p className="hidden sm:block mt-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
            Catálogo de itens consumíveis do almoxarifado. Vincule fotos aos cadastros para visualização automática na Solicitação de Compras e no Inventário Cíclico.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 pt-5 sm:pt-0">
          <button
            type="button"
            disabled={atualizando || carregando}
            onClick={() => {
              setAtualizando(true);
              void carregarDados().finally(() => setAtualizando(false));
            }}
            title="Recarregar catálogo e fotos"
            aria-label="Recarregar catálogo e fotos"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${atualizando ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{atualizando ? 'Atualizando…' : 'Recarregar'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportarCsv}
            title="Exportar dados filtrados para planilha CSV"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition cursor-pointer"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>

          <button
            type="button"
            onClick={() => (adicionarAberto ? fecharAdicionar() : abrirAdicionar())}
            aria-expanded={adicionarAberto}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Adicionar</span>
            <span className="hidden sm:inline">Adicionar Item</span>
          </button>
        </div>
      </div>

      {/* Indicadores: só no desktop — no celular, os números já estão nos filtros rápidos */}
      <div className="hidden sm:grid grid-cols-4 gap-3">
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

      {/* Adicionar item: só pelo botão do topo. No celular ocupa a tela, com os
          resultados logo abaixo do campo (o teclado não esconde nada). */}
      {adicionarAberto && (
        <div
          ref={containerAdicionarRef}
          className="fixed inset-0 z-[90] flex flex-col p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:static sm:z-auto sm:block sm:rounded-xl sm:border sm:p-4 sm:shadow-xs"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          role="dialog"
          aria-label="Adicionar item ao catálogo"
          onKeyDown={(e) => { if (e.key === 'Escape') fecharAdicionar(); }}
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="min-w-0">
              <h3 className="text-sm sm:text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                Adicionar item ao catálogo
              </h3>
              <p className="hidden sm:block text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                Busque por código SAP ou descrição para cadastrar a foto, ou insira um novo item manualmente. Fotos do Book de EPIs são puxadas automaticamente.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleAbrirModalSap(termoAdicionar)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition hover:bg-slate-100 dark:hover:bg-slate-800"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
              >
                <Search className="h-3.5 w-3.5" />
                <span className="sm:hidden">Catálogo SAP</span>
                <span className="hidden sm:inline">Buscar no catálogo SAP</span>
              </button>
              <button
                type="button"
                onClick={fecharAdicionar}
                aria-label="Fechar adicionar item"
                className="p-1.5 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                style={{ color: 'var(--ink-muted)' }}
              >
                <X className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col sm:block">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 pointer-events-none text-slate-400" />
              <input
                ref={inputAdicionarRef}
                type="text"
                enterKeyHint="search"
                value={termoAdicionar}
                onFocus={() => { if (termoAdicionar.trim()) setSugestoesAbertas(true); }}
                onChange={(e) => {
                  setTermoAdicionar(e.target.value);
                  setSugestoesAbertas(true);
                }}
                placeholder="Código SAP ou descrição do material"
                className="w-full pl-10 pr-10 py-3 sm:py-2.5 text-sm sm:text-xs rounded-lg border transition focus:outline-2 focus:outline-offset-1 font-medium"
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
                    inputAdicionarRef.current?.focus();
                  }}
                  aria-label="Limpar busca"
                  className="absolute right-3 text-xs text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {!termoAdicionar.trim() && (
              <p className="sm:hidden mt-3 text-xs" style={{ color: 'var(--ink-muted)' }}>
                Digite o código SAP ou parte da descrição. Fotos do Book de EPIs entram sozinhas.
              </p>
            )}

          {/* Dropdown de Sugestões em Tempo Real */}
          {sugestoesAbertas && termoAdicionar.trim().length > 0 && (
            <div
              className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border sm:absolute sm:left-0 sm:right-0 sm:top-full sm:z-40 sm:mt-1.5 sm:max-h-80 sm:flex-none sm:shadow-xl animate-fade-in"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
            >
              <div className="p-2 border-b text-[11px] font-bold flex items-center justify-between" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                <span>Resultados na base SAP / Estoque ({sugestoesAdicionar.length})</span>
                <span className="hidden text-[10px] sm:inline">Clique para selecionar e tirar a foto</span>
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
                            <span>• Saldo ZL0024: <strong>{formatarSaldo(candidato.saldo_total)} {candidato.umb}</strong></span>
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

                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-1.5">
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
      )}

      {/* Busca e filtros: no celular, uma linha (busca + Filtros) e pílulas que deslizam */}
      <div className="rounded-xl border p-2.5 sm:p-4 space-y-2.5 sm:space-y-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex flex-col md:flex-row md:items-center gap-2.5 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <SearchKeywordsChips
              chips={buscaChips}
              onChangeChips={setBuscaChips}
              onQueryChange={setBuscaDigitada}
              ocultarBotaoNoCelular
              accent="amber"
              className="min-w-0 flex-1"
              placeholder="Buscar código, descrição, grupo, posição…"
            />
            <button
              type="button"
              onClick={() => setFiltrosAbertos(v => !v)}
              aria-expanded={filtrosAbertos}
              className="md:hidden relative inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold cursor-pointer"
              style={{
                borderColor: filtrosAbertos || filtrosSecundariosAtivos > 0 ? 'var(--brand)' : 'var(--hairline)',
                color: 'var(--ink-primary)',
                background: 'var(--surface-raised)',
              }}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {filtrosSecundariosAtivos > 0 && (
                <span className="rounded-full bg-amber-600 px-1.5 text-[10px] font-black text-white tabular-nums">{filtrosSecundariosAtivos}</span>
              )}
            </button>
          </div>

          {/* Filtros rápidos do catálogo */}
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar rounded-lg border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
            {([
              { valor: 'todos', rotulo: 'Todos', n: itens.length, ativo: 'bg-amber-600', icone: null },
              { valor: 'com_foto', rotulo: 'Com foto', n: kpis.comFoto, ativo: 'bg-emerald-600', icone: Check },
              { valor: 'com_localizacao', rotulo: 'Com localização', n: kpis.comLocalizacao, ativo: 'bg-sky-600', icone: MapPin },
              { valor: 'sem_foto', rotulo: 'Sem foto', n: kpis.semFoto, ativo: 'bg-amber-600', icone: Camera },
            ] as const).map(({ valor, rotulo, n, ativo, icone: Icone }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltroRapido(valor)}
                aria-pressed={filtroRapido === valor}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 sm:py-1 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                  filtroRapido === valor ? `${ativo} text-white shadow-xs` : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {Icone && <Icone className="h-3 w-3" />}
                {rotulo} <span className="tabular-nums opacity-80">{n}</span>
              </button>
            ))}
          </div>

          {/* Alternância Cards vs Tabela — no celular, só cartões */}
          <div className="hidden sm:flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
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

        {/* Linha secundária de filtros: recolhida no celular até tocar em "Filtros" */}
        <div className={`${filtrosAbertos ? 'grid' : 'hidden'} md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3 pt-2 border-t`} style={{ borderColor: 'var(--hairline)' }}>
          <div>
            <label className="text-[10px] font-bold block mb-1 " style={{ color: 'var(--ink-muted)' }}>
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
            <label className="text-[10px] font-bold block mb-1 " style={{ color: 'var(--ink-muted)' }}>
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

          <div>
            <label className="text-[10px] font-bold block mb-1 " style={{ color: 'var(--ink-muted)' }}>
              Localização no estoque
            </label>
            <select
              value={filtroLocalizacao}
              onChange={(e) => setFiltroLocalizacao(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs rounded-lg border"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
            >
              <option value="todas">Todas as localizações ({opcoesLocalizacoes.length})</option>
              <option value="sem_localizacao">Sem localização</option>
              {opcoesLocalizacoes.map(posicao => (
                <option key={posicao} value={posicao}>{posicao}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold block mb-1 " style={{ color: 'var(--ink-muted)' }}>
              Data de alteração
            </label>
            <select
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value as FiltroDataAlteracao)}
              className="w-full py-1.5 px-2.5 text-xs rounded-lg border"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
            >
              {OPCOES_FILTRO_DATA.map(op => (
                <option key={op.valor} value={op.valor}>{op.rotulo}</option>
              ))}
            </select>
            {filtroData === 'periodo' && (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {([['de', 'De'], ['ate', 'Até']] as const).map(([campo, rotulo]) => (
                  <label key={campo} className="text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                    {rotulo}
                    <input
                      type="date"
                      value={periodoData[campo]}
                      onChange={(e) => setPeriodoData(p => ({ ...p, [campo]: e.target.value }))}
                      className="mt-0.5 w-full py-1 px-2 text-xs rounded-lg border font-normal"
                      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold block mb-1 " style={{ color: 'var(--ink-muted)' }}>
              Etiqueta
            </label>
            <select
              value={filtroEtiqueta}
              onChange={(e) => setFiltroEtiqueta(e.target.value as FiltroEtiqueta)}
              className="w-full py-1.5 px-2.5 text-xs rounded-lg border"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
            >
              <option value="todas">Com e sem etiqueta</option>
              <option value="impressa">Etiqueta impressa ({kpis.etiquetaImpressa})</option>
              <option value="nao_impressa">Sem etiqueta impressa ({kpis.total - kpis.etiquetaImpressa})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Resultado da busca logo abaixo dela: confirma o que achou sem rolar a tela */}
      {!carregando && algumFiltroAtivo && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          <span>
            <strong className="tabular-nums" style={{ color: 'var(--ink-primary)' }}>{itensFiltrados.length}</strong> de {itens.length} itens
          </span>
          <button
            type="button"
            onClick={limparFiltros}
            className="font-bold cursor-pointer hover:underline"
            style={{ color: 'var(--brand)' }}
          >
            Limpar filtros
          </button>
        </div>
      )}

      {/* Etiquetas de prateleira: seleção e impressão */}
      {!carregando && itensFiltrados.length > 0 && (
        <div
          className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
        >
          <label className="inline-flex min-w-0 items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
            <input
              type="checkbox"
              checked={itensFiltrados.every(it => selecionados.has(it.codigo_sap))}
              onChange={(e) => setSelecionados(e.target.checked ? new Set(itensFiltrados.map(it => it.codigo_sap)) : new Set())}
              className="h-4 w-4 shrink-0 cursor-pointer accent-amber-600"
            />
            <span className="truncate">
              Marcar os {itensFiltrados.length}<span className="hidden sm:inline"> filtrados</span>
            </span>
            <span className="hidden sm:inline font-normal" style={{ color: 'var(--ink-muted)' }}>
              · {selecionados.size} marcado(s) para etiqueta
            </span>
          </label>
          <div className="flex shrink-0 items-center gap-2">
            {selecionados.size > 0 && (
              <button
                type="button"
                onClick={() => setSelecionados(new Set())}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={imprimirSelecionadas}
              disabled={selecionados.size === 0}
              title="PDF A4 com 10 etiquetas por folha. O QR de cada uma é lido pelo botão de QR do cabeçalho (baixa ou inventário) e pelo Ler QR da Requisição no Balcão"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Imprimir etiquetas</span>
              <span className="sm:hidden">Etiquetas</span>
              <span className="tabular-nums">({selecionados.size})</span>
            </button>
          </div>
        </div>
      )}

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
        /* Cartões compactos: 2 colunas no celular; tocar abre o detalhe */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-3">
          {itensVisiveis.map((item) => (
            <CatalogoItemTile
              key={item.codigo_sap}
              item={item}
              posicao={posicaoDoItem(item)}
              ultima={ultimaDoItem(item.codigo_sap)}
              hoje={hoje}
              marcado={selecionados.has(item.codigo_sap)}
              podeContar={podeContar}
              preparandoContagem={preparandoCodigo === item.codigo_sap}
              onAbrir={(it) => setDetalheCodigo(it.codigo_sap)}
              onEditar={handleAbrirCadastroFoto}
              onContar={(it) => void contarItem(it)}
              onMarcar={alternarSelecao}
            />
          ))}
        </div>
      ) : (
        /* Visualização em Tabela Detalhada */
        <div className="rounded-xl border overflow-hidden shadow-xs" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                <tr>
                  <th className="py-2.5 pl-3 w-8">
                    <input
                      type="checkbox"
                      checked={itensFiltrados.length > 0 && itensFiltrados.every(it => selecionados.has(it.codigo_sap))}
                      onChange={(e) => setSelecionados(e.target.checked ? new Set(itensFiltrados.map(it => it.codigo_sap)) : new Set())}
                      title="Marcar todos os itens filtrados"
                      aria-label="Marcar todos os itens filtrados"
                      className="h-4 w-4 cursor-pointer accent-amber-600"
                    />
                  </th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Foto</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Código SAP</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Descrição do Material</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Texto Técnico</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Grupo & Subcategoria (Nível 2)</th>
                  <th className="py-2.5 px-3 font-bold" style={{ color: 'var(--ink-muted)' }}>Posição</th>
                  <th className="py-2.5 px-3 font-bold text-right" style={{ color: 'var(--ink-muted)' }}>Saldo ZL0024</th>
                  <th className="py-2.5 px-3 font-bold text-center" style={{ color: 'var(--ink-muted)' }}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {itensVisiveis.map((item) => (
                  <tr key={item.codigo_sap} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                    <td className="py-2 pl-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(item.codigo_sap)}
                        onChange={() => alternarSelecao(item.codigo_sap)}
                        aria-label={`Marcar ${item.codigo_sap} para imprimir etiqueta`}
                        className="h-4 w-4 cursor-pointer accent-amber-600"
                      />
                    </td>
                    <td className="py-2 px-3">
                      {item.url_foto ? (
                        <button
                          type="button"
                          onClick={() => setImagemZoom({ url: item.url_foto!, titulo: item.descricao, codigo: item.codigo_sap })}
                          className="h-10 w-10 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 relative group cursor-pointer"
                        >
                          <img src={item.url_foto} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
                    <td className="py-2 px-3 font-mono text-[11px] font-bold whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>
                      {posicaoDoItem(item) || '—'}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {formatarSaldo(item.saldo_total)}
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

      {!carregando && itensFiltrados.length > itensVisiveis.length && (
        <button
          type="button"
          onClick={() => setVisiveisQtd((q) => q + LOTE_ITENS)}
          className="w-full rounded-xl border py-2.5 text-xs font-bold cursor-pointer"
          style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}
        >
          Mostrar mais ({itensFiltrados.length - itensVisiveis.length} restantes)
        </button>
      )}

      {/* Modal: Tirar Foto / Cadastrar Imagem */}
      {itemSelecionado && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          role="dialog"
          aria-modal="true"
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
                    Saldo: {formatarSaldo(itemSelecionado.saldo_total)} {itemSelecionado.umb}
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

                <FotosRecebimentoSugeridas
                  codigoSap={itemSelecionado.codigo_sap}
                  desabilitado={salvando}
                  onEscolher={(file) => {
                    if (fotoPreviewUrl && fotoPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(fotoPreviewUrl);
                    setFotoArquivo(file);
                    setFotoPreviewUrl(URL.createObjectURL(file));
                  }}
                />

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
                <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Ou cole uma imagem com <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[10px]">Ctrl+V</kbd> — print ou foto copiada
                </p>
              </div>

              {/* Fotos adicionais — só neste cadastro */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                    Fotos adicionais <span className="font-normal" style={{ color: 'var(--ink-muted)' }}>(opcional)</span>
                  </label>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                    {fotosAdicionais.length + adicionaisNovas.length}/{MAX_FOTOS_ADICIONAIS}
                  </span>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                  Outros ângulos, embalagem ou detalhes. Ficam só neste cadastro — não vêm do recebimento e não mudam a foto principal. Trocar ou remover aqui nunca altera as fotos do formulário de recebimento.
                </p>

                {(fotosAdicionais.length > 0 || adicionaisNovas.length > 0) && (
                  <div className="grid grid-cols-3 gap-2">
                    {fotosAdicionais.map((foto) => (
                      <div
                        key={foto.id}
                        className="relative aspect-square overflow-hidden rounded-lg border"
                        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
                      >
                        {foto.url ? (
                          <button
                            type="button"
                            onClick={() => setImagemZoom({ url: foto.url!, titulo: itemSelecionado.descricao, codigo: itemSelecionado.codigo_sap })}
                            className="h-full w-full cursor-zoom-in"
                            title="Ampliar"
                          >
                            <img src={foto.url} alt="Foto adicional" className="h-full w-full object-cover" />
                          </button>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                            Indisponível
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => { substituirAlvoRef.current = foto; substituirInputRef.current?.click(); }}
                          disabled={salvando || substituindoId !== null}
                          className="absolute left-1 top-1 cursor-pointer rounded-md bg-slate-800/80 p-1 text-white hover:bg-slate-900 disabled:opacity-50"
                          title="Substituir por outra foto"
                          aria-label="Substituir foto adicional"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoverAdicionalSalva(foto)}
                          disabled={salvando || substituindoId !== null}
                          className="absolute right-1 top-1 cursor-pointer rounded-md bg-rose-600 p-1 text-white shadow-md hover:bg-rose-700 disabled:opacity-50"
                          title="Remover esta foto"
                          aria-label="Remover foto adicional"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        {substituindoId === foto.id && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                            <RefreshCw className="h-5 w-5 animate-spin" />
                          </span>
                        )}
                      </div>
                    ))}
                    {adicionaisNovas.map((nova, i) => (
                      <div
                        key={nova.preview}
                        className="relative aspect-square overflow-hidden rounded-lg border-2 border-dashed"
                        style={{ borderColor: 'var(--brand)', background: 'var(--surface-raised)' }}
                      >
                        <img src={nova.preview} alt="Nova foto adicional" className="h-full w-full object-cover" />
                        <span className="absolute bottom-1 left-1 rounded bg-amber-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                          Nova
                        </span>
                        <button
                          type="button"
                          onClick={() => removerAdicionalNova(i)}
                          disabled={salvando}
                          className="absolute right-1 top-1 cursor-pointer rounded-md bg-slate-800/80 p-1 text-white hover:bg-slate-900 disabled:opacity-50"
                          title="Tirar da lista"
                          aria-label="Tirar foto da lista"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={substituirInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  className="hidden"
                  onChange={handleSubstituirAdicional}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    ref={adicionaisCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleEscolherAdicionais}
                  />
                  <button
                    type="button"
                    onClick={() => adicionaisCameraRef.current?.click()}
                    disabled={salvando || fotosAdicionais.length + adicionaisNovas.length >= MAX_FOTOS_ADICIONAIS}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition cursor-pointer hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
                  >
                    <Camera className="h-4 w-4 text-amber-600" />
                    Adicionar (câmera)
                  </button>
                  <input
                    ref={adicionaisGaleriaRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    multiple
                    className="hidden"
                    onChange={handleEscolherAdicionais}
                  />
                  <button
                    type="button"
                    onClick={() => adicionaisGaleriaRef.current?.click()}
                    disabled={salvando || fotosAdicionais.length + adicionaisNovas.length >= MAX_FOTOS_ADICIONAIS}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition cursor-pointer hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
                  >
                    <Upload className="h-4 w-4 text-blue-600" />
                    Adicionar (galeria)
                  </button>
                </div>
                {adicionaisNovas.length > 0 && (
                  <p className="text-[10px] font-semibold" style={{ color: 'var(--status-warning)' }}>
                    {adicionaisNovas.length} foto(s) nova(s) sobem ao clicar em Salvar.
                  </p>
                )}
              </div>

              {/* Posição no depósito */}
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: 'var(--ink-primary)' }}>
                  Posição no Depósito (Localização)
                </label>
                <input
                  type="text"
                  value={posicaoFoto}
                  onChange={(e) => setPosicaoFoto(e.target.value.toUpperCase())}
                  placeholder={posicaoDoItem(itemSelecionado) || 'Ex: 101.A10'}
                  className="w-full p-2.5 text-xs font-mono rounded-lg border focus:outline-2 focus:outline-offset-1"
                  style={{
                    borderColor: 'var(--hairline)',
                    background: 'var(--surface-raised)',
                    color: 'var(--ink-primary)',
                  }}
                />
                <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                  Em branco, vale a última posição vinda da ZL0024 (continua valendo se o item zerar).
                </p>
              </div>

              {/* Etiqueta de prateleira */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-bold block mb-1" style={{ color: 'var(--ink-primary)' }}>
                    Descrição na etiqueta
                  </label>
                  <input
                    type="text"
                    value={etiquetaDescricao}
                    onChange={(e) => setEtiquetaDescricao(e.target.value.toUpperCase())}
                    placeholder={itemSelecionado.descricao || 'Descrição do SAP'}
                    className="w-full p-2.5 text-xs rounded-lg border focus:outline-2 focus:outline-offset-1"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: 'var(--ink-primary)' }}>
                    Aplicação
                  </label>
                  <input
                    type="text"
                    value={etiquetaAplicacao}
                    onChange={(e) => setEtiquetaAplicacao(e.target.value.toUpperCase())}
                    placeholder="Ex: PRODUÇÃO"
                    className="w-full p-2.5 text-xs rounded-lg border focus:outline-2 focus:outline-offset-1"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: 'var(--ink-primary)' }}>
                    Estoque mínimo
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={estoqueMinimo}
                    onChange={(e) => setEstoqueMinimo(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder={`Ex: 5 ${itemSelecionado.umb || ''}`.trim()}
                    className="w-full p-2.5 text-xs rounded-lg border tabular-nums focus:outline-2 focus:outline-offset-1"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
                  />
                </div>
                <p className="col-span-2 sm:col-span-4 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                  Descrição em branco usa a do SAP. Estoque mínimo em branco sai vazio na etiqueta, para preencher à mão.
                </p>
              </div>

              <CamposLoteValidade valores={lotesFoto} onChange={setLotesFoto} disabled={salvando} />

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
                  onClick={imprimirEtiquetaDoModal}
                  disabled={salvando}
                  title="Gera a etiqueta deste item com o que está digitado agora"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Etiqueta
                </button>
                <button
                  type="button"
                  onClick={handleSalvarFoto}
                  disabled={salvando || (!fotoArquivo && !itemSelecionado.tem_foto && !cadastroDoItemMudou(itemSelecionado) && adicionaisNovas.length === 0)}
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

      {completarEtiquetas && (
        <CompletarEtiquetasModal
          linhas={completarEtiquetas.linhas}
          total={completarEtiquetas.itens.length}
          onCancelar={() => setCompletarEtiquetas(null)}
          onAbrirSemPreencher={() => {
            const lista = completarEtiquetas.itens;
            setCompletarEtiquetas(null);
            abrirPreviewEtiquetas(lista.map(it => dadosEtiquetaDoItem(it, posicaoDoItem(it))));
          }}
          onSalvarEAbrir={salvarFaltantesEAbrir}
        />
      )}

      {previewEtiquetas && (
        <PdfPreviewModal
          gerar={gerarPdfEtiquetas}
          tituloPadrao="Etiquetas de material"
          acoesExtras={(
            <div className="flex items-center gap-1.5 rounded-xl border px-2 py-1" style={{ borderColor: 'var(--hairline)' }} role="radiogroup" aria-label="Cor da etiqueta">
              <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Cor:</span>
              {ORDEM_CORES_ETIQUETA.map(cor => {
                const tema = CORES_ETIQUETA[cor];
                const ativa = corEtiqueta === cor;
                return (
                  <button
                    key={cor}
                    type="button"
                    role="radio"
                    aria-checked={ativa}
                    aria-label={tema.rotulo}
                    title={tema.rotulo}
                    onClick={() => escolherCorEtiqueta(cor)}
                    className="h-6 w-6 rounded-full border-2 transition"
                    style={{
                      background: tema.titulo,
                      borderColor: ativa ? 'var(--brand)' : 'rgba(0,0,0,0.15)',
                      boxShadow: ativa ? '0 0 0 2px var(--surface-card), 0 0 0 4px var(--brand)' : undefined,
                    }}
                  />
                );
              })}
              <span className="hidden text-[11px] font-semibold sm:inline" style={{ color: 'var(--ink-secondary)' }}>
                {CORES_ETIQUETA[corEtiqueta].rotulo}
              </span>
            </div>
          )}
          onClose={() => setPreviewEtiquetas(null)}
          onBaixar={() => void aoBaixarEtiquetas(previewEtiquetas.codigos)}
        />
      )}

      {/* Modal: Visualizador em Alta Resolução (Zoom) */}
      {imagemZoom && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[120] animate-fade-in"
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
                                  <span>• Saldo ZL0024: <strong>{formatarSaldo(cand.saldo_total)} {cand.umb}</strong></span>
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
                            Saldo Atual ZL0024: {formatarSaldo(itemSapSelecionado.saldo_total)} {itemSapSelecionado.umb}
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

                    <FotosRecebimentoSugeridas
                      codigoSap={itemSapSelecionado.codigo_sap}
                      desabilitado={salvandoSap}
                      onEscolher={(file) => {
                        if (fotoPreviewUrlSap && fotoPreviewUrlSap.startsWith('blob:')) URL.revokeObjectURL(fotoPreviewUrlSap);
                        setFotoArquivoSap(file);
                        setFotoPreviewUrlSap(URL.createObjectURL(file));
                      }}
                    />

                    {/* Posição no depósito */}
                    <div className="space-y-1 pt-1">
                      <label className="text-[11px] font-bold block" style={{ color: 'var(--ink-secondary)' }}>
                        Posição no Depósito (Localização)
                      </label>
                      <input
                        type="text"
                        value={posicaoSap}
                        onChange={(e) => setPosicaoSap(e.target.value.toUpperCase())}
                        placeholder={(itemSapSelecionado && posicoesPorMaterial.get(itemSapSelecionado.codigo_sap)?.join(', ')) || 'Ex: 101.A10'}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border focus:outline-2"
                        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
                      />
                    </div>

                    <CamposLoteValidade valores={lotesSap} onChange={setLotesSap} disabled={salvandoSap} />

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
                    disabled={salvandoSap || (!fotoArquivoSap && !itemSapSelecionado.tem_foto && !posicaoSap.trim() && normalizarLotesCatalogo(lotesSap).length === 0)}
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

      {/* Detalhe do item: tudo o que saiu do cartão, com Editar / Contar / Etiqueta */}
      {itemDetalhe && (
        <CatalogoItemDetalhe
          item={itemDetalhe}
          posicao={posicaoDoItem(itemDetalhe)}
          ultima={ultimaDoItem(itemDetalhe.codigo_sap)}
          versaoContagem={versaoContagem}
          podeContar={podeContar}
          preparandoContagem={preparandoCodigo === itemDetalhe.codigo_sap}
          onEditar={() => { setDetalheCodigo(null); handleAbrirCadastroFoto(itemDetalhe); }}
          onContar={() => void contarItem(itemDetalhe)}
          onEtiqueta={() => prepararEtiquetas([itemDetalhe])}
          onZoom={(url) => setImagemZoom({ url, titulo: itemDetalhe.descricao, codigo: itemDetalhe.codigo_sap })}
          onClose={() => setDetalheCodigo(null)}
        />
      )}

      {/* Contagem do Inventário Cíclico aberta pelo atalho "Contar" */}
      {contando && (
        <Suspense fallback={null}>
          <ModalContagem
            user={user}
            item={contando.item}
            inventarioId={contando.inventarioId}
            numero={contando.item.ordem}
            fotoItem={itemContando?.item_catalogo ?? undefined}
            onFotoSalva={(salvo) => aplicarFotoDaContagem(contando.codigoSap, salvo)}
            onVerZoom={(url, titulo, codigo) => setImagemZoom({ url, titulo, codigo })}
            onRecarregar={recarregarContagem}
            onProximo={() => setContando(null)}
            temProximo={false}
            onClose={() => setContando(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
