import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileDown,
  FileSpreadsheet,
  HelpCircle,
  ImageIcon,
  LayoutGrid,
  Link2,
  ListFilter,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { listarBookEpis, urlFotoBookEpi, type SsmaBookEpi } from '../../lib/ssmaBookEpisApi';
import {
  excluirEpiPorFuncao,
  importarEpiPorFuncaoWorkbook,
  listarEpisPorFuncao,
  listarFuncoesEpi,
  mensagemErroEpiPorFuncao,
  proximoCodigoEpiManual,
  proximoCodigoFuncao,
  salvarEpiPorFuncao,
  salvarFuncaoEpi,
  type SalvarEpiPorFuncao,
  type SsmaEpiFuncao,
  type SsmaEpiPorFuncao,
} from '../../lib/ssmaEpiPorFuncaoApi';
import type { ClassificacaoEpiFuncao } from '../../lib/epiPorFuncaoImportacao';
import { exportMatrizEpiFuncaoPdf } from '../../lib/pdfExport/exportMatrizEpiFuncaoPdf';

interface Props {
  onBack: () => void;
}

const CLASSIFICACOES: Array<{
  valor: ClassificacaoEpiFuncao;
  rotulo: string;
  badge: string;
  iconeCor: string;
  desc: string;
}> = [
  {
    valor: 'BASICO_OBRIGATORIO',
    rotulo: 'Básico obrigatório',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    iconeCor: 'text-emerald-600 dark:text-emerald-400',
    desc: 'Uso permanente por todos os trabalhadores da função na fábrica.',
  },
  {
    valor: 'ESPECIFICO_OBRIGATORIO',
    rotulo: 'Específico obrigatório',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
    iconeCor: 'text-blue-600 dark:text-blue-400',
    desc: 'Exigido para riscos particulares da rotina técnica deste cargo.',
  },
  {
    valor: 'CONDICIONAL_POR_EXPOSICAO',
    rotulo: 'Condicional por exposição',
    badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    iconeCor: 'text-amber-600 dark:text-amber-400',
    desc: 'Fornecido somente em atividades onde o nível de tolerância exceda o limite.',
  },
];

function rotuloClassificacao(valor: ClassificacaoEpiFuncao) {
  return CLASSIFICACOES.find(item => item.valor === valor)?.rotulo || valor;
}

function badgeClassificacao(valor: ClassificacaoEpiFuncao) {
  return CLASSIFICACOES.find(item => item.valor === valor)?.badge || 'bg-slate-100 text-slate-700 border-slate-200';
}

function FotoMiniatura({ path, alt }: { path?: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    if (!path) {
      setUrl(null);
      return;
    }
    urlFotoBookEpi(path)
      .then(resultado => { if (ativo) setUrl(resultado); })
      .catch(() => { if (ativo) setUrl(null); });
    return () => { ativo = false; };
  }, [path]);

  if (url) {
    return <img src={url} alt={alt} className="h-full w-full object-contain" />;
  }

  return <ImageIcon className="h-5 w-5 text-slate-300 dark:text-slate-600" aria-label="Sem foto" />;
}

export default function SsmaEpiPorFuncaoView({ onBack }: Props) {
  const toast = useToast();
  const inputImportacao = useRef<HTMLInputElement>(null);

  // Dados centrais
  const [funcoes, setFuncoes] = useState<SsmaEpiFuncao[]>([]);
  const [requisitos, setRequisitos] = useState<SsmaEpiPorFuncao[]>([]);
  const [book, setBook] = useState<SsmaBookEpi[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [cargosRecolhidosMobile, setCargosRecolhidosMobile] = useState(true);

  // Seleção e visualização
  const [funcaoSelecionadaId, setFuncaoSelecionadaId] = useState<string>('');
  const [modoExibicao, setModoExibicao] = useState<'master_detail' | 'tabela_geral'>('master_detail');

  // Filtros
  const [buscaFuncao, setBuscaFuncao] = useState('');
  const [buscaGeral, setBuscaGeral] = useState('');
  const [filtroPendencia, setFiltroPendencia] = useState<'todos' | 'com_pendencia' | 'sem_pendencia'>('todos');
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('TODAS');

  // Modais
  const [editandoRequisito, setEditandoRequisito] = useState<SalvarEpiPorFuncao | null>(null);
  const [modalFuncao, setModalFuncao] = useState<{ id?: string; codigo_origem: string; nome: string; ativo: boolean } | null>(null);
  const [buscaBook, setBuscaBook] = useState('');
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // Paginação da tabela geral
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 25;

  // Carregamento consolidado dos dados em paralelo
  const carregarTudo = async () => {
    setCarregando(true);
    try {
      const [novasFuncoes, todosRequisitos, todoBook] = await Promise.all([
        listarFuncoesEpi(true),
        listarEpisPorFuncao(undefined, true),
        listarBookEpis(true),
      ]);
      setFuncoes(novasFuncoes);
      setRequisitos(todosRequisitos);
      setBook(todoBook);

      // Define a primeira função ativa como selecionada se nenhuma estiver
      setFuncaoSelecionadaId(atual => {
        if (atual && novasFuncoes.some(f => f.id === atual)) return atual;
        return novasFuncoes.find(f => f.ativo)?.id || novasFuncoes[0]?.id || '';
      });
    } catch (erro) {
      toast.error(mensagemErroEpiPorFuncao(erro));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarTudo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mapa de requisitos por função
  const mapaRequisitosPorFuncao = useMemo(() => {
    const mapa = new Map<string, SsmaEpiPorFuncao[]>();
    for (const req of requisitos) {
      const lista = mapa.get(req.funcao_id) || [];
      lista.push(req);
      mapa.set(req.funcao_id, lista);
    }
    return mapa;
  }, [requisitos]);

  // Contadores globais
  const metricas = useMemo(() => {
    const totalFuncoes = funcoes.length;
    const funcoesAtivas = funcoes.filter(f => f.ativo).length;
    const totalRequisitos = requisitos.length;
    const requisitosVinculados = requisitos.filter(r => r.epi_book_id).length;
    const requisitosPendentes = totalRequisitos - requisitosVinculados;
    return { totalFuncoes, funcoesAtivas, totalRequisitos, requisitosVinculados, requisitosPendentes };
  }, [funcoes, requisitos]);

  // Lista de funções filtrada para a coluna esquerda
  const funcoesFiltradas = useMemo(() => {
    const termo = buscaFuncao.trim().toLocaleLowerCase('pt-BR');
    return funcoes.filter(funcao => {
      const atendeTexto = !termo ||
        funcao.nome.toLocaleLowerCase('pt-BR').includes(termo) ||
        funcao.codigo_origem.toLocaleLowerCase('pt-BR').includes(termo);

      if (!atendeTexto) return false;

      const reqs = mapaRequisitosPorFuncao.get(funcao.id) || [];
      const temSemBook = reqs.some(r => !r.epi_book_id);

      if (filtroPendencia === 'com_pendencia') return temSemBook;
      if (filtroPendencia === 'sem_pendencia') return !temSemBook && reqs.length > 0;
      return true;
    });
  }, [funcoes, buscaFuncao, filtroPendencia, mapaRequisitosPorFuncao]);

  // Função atualmente ativa no painel Master-Detail
  const funcaoAtual = useMemo(() => {
    return funcoes.find(f => f.id === funcaoSelecionadaId) || null;
  }, [funcoes, funcaoSelecionadaId]);

  // Requisitos da função ativa agrupados por classificação
  const requisitosDaFuncaoAtual = useMemo(() => {
    if (!funcaoSelecionadaId) return [];
    return mapaRequisitosPorFuncao.get(funcaoSelecionadaId) || [];
  }, [funcaoSelecionadaId, mapaRequisitosPorFuncao]);

  // Requisitos para a Tabela Geral (busca global em tempo real)
  const requisitosTabelaGeral = useMemo(() => {
    const termo = buscaGeral.trim().toLocaleLowerCase('pt-BR');
    return requisitos.filter(req => {
      if (filtroClassificacao !== 'TODAS' && req.classificacao !== filtroClassificacao) return false;
      if (filtroPendencia === 'com_pendencia' && req.epi_book_id) return false;
      if (filtroPendencia === 'sem_pendencia' && !req.epi_book_id) return false;

      if (!termo) return true;

      const textoPesquisavel = [
        req.funcao?.nome || '',
        req.funcao?.codigo_origem || '',
        req.codigo_epi_origem,
        req.descricao_epi_origem,
        req.epi_book?.descricao_sap || '',
        req.epi_book?.codigo_sap || '',
        req.epi_book?.grupo_epi || '',
        req.ca_origem || '',
        req.epi_book?.ca || '',
        req.condicao_uso || '',
      ].join(' ').toLocaleLowerCase('pt-BR');

      return textoPesquisavel.includes(termo);
    });
  }, [requisitos, buscaGeral, filtroClassificacao, filtroPendencia]);

  // Itens paginados para a Tabela Geral
  const totalPaginas = Math.max(1, Math.ceil(requisitosTabelaGeral.length / ITENS_POR_PAGINA));
  const requisitosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    return requisitosTabelaGeral.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [requisitosTabelaGeral, paginaAtual]);

  // Opções de Book para seleção no modal
  const opcoesBookFiltradas = useMemo(() => {
    const termo = buscaBook.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return book.slice(0, 100);
    return book.filter(item => {
      const textoItem = [
        item.grupo_epi,
        item.descricao_sap || '',
        item.descricao_epi,
        item.codigo_sap || '',
        item.ca,
        item.fabricante || '',
      ].join(' ').toLocaleLowerCase('pt-BR');
      return textoItem.includes(termo);
    }).slice(0, 100);
  }, [book, buscaBook]);

  // Ações de Requisito
  const abrirNovoRequisito = (funcaoId = funcaoSelecionadaId) => {
    const proximoCodigo = proximoCodigoEpiManual(requisitos);
    setBuscaBook('');
    setEditandoRequisito({
      funcao_id: funcaoId || (funcoes[0]?.id || ''),
      epi_book_id: null,
      codigo_epi_origem: proximoCodigo,
      descricao_epi_origem: '',
      ca_origem: null,
      classificacao: 'BASICO_OBRIGATORIO',
      condicao_uso: null,
      ativo: true,
    });
  };

  const abrirEditarRequisito = (item: SsmaEpiPorFuncao) => {
    setBuscaBook(item.epi_book?.descricao_sap || item.epi_book?.codigo_sap || '');
    setEditandoRequisito({
      id: item.id,
      funcao_id: item.funcao_id,
      epi_book_id: item.epi_book_id,
      codigo_vinculo_origem: item.codigo_vinculo_origem,
      codigo_epi_origem: item.codigo_epi_origem,
      descricao_epi_origem: item.descricao_epi_origem,
      ca_origem: item.ca_origem,
      classificacao: item.classificacao,
      condicao_uso: item.condicao_uso,
      ativo: item.ativo,
    });
  };

  const salvarRequisito = async () => {
    if (!editandoRequisito) return;
    if (!editandoRequisito.funcao_id || !editandoRequisito.codigo_epi_origem || !editandoRequisito.descricao_epi_origem) {
      toast.error('Informe a função, o código e a descrição do EPI.');
      return;
    }
    setSalvando(true);
    try {
      const salvo = await salvarEpiPorFuncao(editandoRequisito);
      toast.success(editandoRequisito.id ? 'Requisito atualizado com sucesso.' : 'Novo requisito cadastrado.');
      setEditandoRequisito(null);
      // Atualiza estado local sem recarregar tudo
      setRequisitos(atual => {
        const existe = atual.some(item => item.id === salvo.id);
        if (existe) return atual.map(item => item.id === salvo.id ? salvo : item);
        return [...atual, salvo];
      });
    } catch (erro) {
      toast.error(mensagemErroEpiPorFuncao(erro));
    } finally {
      setSalvando(false);
    }
  };

  const excluirRequisito = async (id: string) => {
    setSalvando(true);
    try {
      await excluirEpiPorFuncao(id);
      toast.success('Requisito desvinculado com sucesso.');
      setRequisitos(atual => atual.filter(r => r.id !== id));
      setExcluindoId(null);
    } catch (erro) {
      toast.error(mensagemErroEpiPorFuncao(erro));
    } finally {
      setSalvando(false);
    }
  };

  // Ações de Função
  const abrirNovaFuncao = () => {
    const proximoCodigo = proximoCodigoFuncao(funcoes);
    setModalFuncao({
      codigo_origem: proximoCodigo,
      nome: '',
      ativo: true,
    });
  };

  const abrirEditarFuncao = (funcao: SsmaEpiFuncao) => {
    setModalFuncao({
      id: funcao.id,
      codigo_origem: funcao.codigo_origem,
      nome: funcao.nome,
      ativo: funcao.ativo,
    });
  };

  const salvarFuncao = async () => {
    if (!modalFuncao) return;
    if (!modalFuncao.nome.trim()) {
      toast.error('Informe o nome da função/cargo.');
      return;
    }
    setSalvando(true);
    try {
      const salva = await salvarFuncaoEpi(modalFuncao);
      toast.success(modalFuncao.id ? 'Função atualizada.' : 'Nova função cadastrada.');
      setModalFuncao(null);
      setFuncoes(atual => {
        const existe = atual.some(f => f.id === salva.id);
        if (existe) return atual.map(f => f.id === salva.id ? salva : f).sort((a, b) => a.nome.localeCompare(b.nome));
        return [...atual, salva].sort((a, b) => a.nome.localeCompare(b.nome));
      });
      setFuncaoSelecionadaId(salva.id);
    } catch (erro) {
      toast.error(mensagemErroEpiPorFuncao(erro));
    } finally {
      setSalvando(false);
    }
  };

  // Importar XLSX
  const importar = async (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!arquivo) return;
    if (!/\.xlsx$/i.test(arquivo.name)) {
      toast.error('Selecione a planilha XLSX de EPI por função.');
      return;
    }
    setImportando(true);
    try {
      const resultado = await importarEpiPorFuncaoWorkbook(await arquivo.arrayBuffer());
      toast.success(
        `${resultado.funcoes} funções e ${resultado.requisitos} requisitos importados (${resultado.vinculadosBook} vinculados ao Book).`
      );
      await carregarTudo();
    } catch (erro) {
      toast.error(mensagemErroEpiPorFuncao(erro));
    } finally {
      setImportando(false);
    }
  };

  // Exportar Matriz em PDF Paisagem
  const exportarPdf = async () => {
    setExportandoPdf(true);
    try {
      await exportMatrizEpiFuncaoPdf({
        funcoes,
        requisitos,
        book,
      });
      toast.success('Matriz de EPI x Função exportada em PDF com sucesso!');
    } catch (erro) {
      toast.error('Erro ao gerar exportação em PDF da matriz.');
      console.error(erro);
    } finally {
      setExportandoPdf(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      {/* Botão de retorno ao Hub de SSMA */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 transition-colors hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar ao SSMA
      </button>

      {/* Header com identidade e ações principais */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/25">
            <BriefcaseBusiness className="h-6 w-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                Cadastro de EPI por Função
              </h1>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                SSMA
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Matriz editável de exigências de EPI por cargo e função, vinculada às variantes do Book de EPIs para geração da Ficha de EPI da TEN.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <input ref={inputImportacao} type="file" accept=".xlsx" className="hidden" onChange={importar} />
          <button
            type="button"
            onClick={() => inputImportacao.current?.click()}
            disabled={importando}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 cursor-pointer"
            title="Importar matriz em planilha Excel"
          >
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span>Importar XLSX</span>
          </button>

          <button
            type="button"
            onClick={exportarPdf}
            disabled={exportandoPdf || carregando}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer shadow-sm transition-all"
            title="Exportar a Matriz de EPI por Função oficial em PDF (A4 Paisagem)"
          >
            {exportandoPdf ? <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> : <FileDown className="h-4 w-4 text-emerald-600" />}
            <span>Exportar PDF</span>
          </button>

          <button
            type="button"
            onClick={abrirNovaFuncao}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <Plus className="h-4 w-4 text-emerald-600" />
            <span>Nova Função</span>
          </button>

          <button
            type="button"
            onClick={() => abrirNovoRequisito()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Requisito</span>
          </button>
        </div>
      </header>

      {/* KPI Cards: Indicadores Globais da Matriz */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total de Funções</span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{metricas.totalFuncoes}</span>
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              {metricas.funcoesAtivas} ativas
            </span>
          </div>
          <span className="mt-0.5 text-[11px] text-slate-400">Cargos mapeados</span>
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Requisitos Mapeados</span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{metricas.totalRequisitos}</span>
            <span className="text-[11px] font-medium text-slate-500">vínculos</span>
          </div>
          <span className="mt-0.5 text-[11px] text-slate-400">Exigências na fábrica</span>
        </div>

        <div className="flex flex-col rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Vinculados ao Book</span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">{metricas.requisitosVinculados}</span>
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              {metricas.totalRequisitos ? Math.round((metricas.requisitosVinculados / metricas.totalRequisitos) * 100) : 0}%
            </span>
          </div>
          <span className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-400">Com SAP e CA oficiais</span>
        </div>

        <button
          type="button"
          onClick={() => {
            setFiltroPendencia(atual => atual === 'com_pendencia' ? 'todos' : 'com_pendencia');
          }}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            metricas.requisitosPendentes > 0
              ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-100/70 dark:border-amber-800/80 dark:bg-amber-950/30'
              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Aguardando Vínculo</span>
            {metricas.requisitosPendentes > 0 && <AlertTriangle className="h-4 w-4 text-amber-600" />}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-900 dark:text-amber-100">
              {metricas.requisitosPendentes}
            </span>
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
              {filtroPendencia === 'com_pendencia' ? 'filtrando' : 'clique p/ filtrar'}
            </span>
          </div>
          <span className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400">Sem variante do Book</span>
        </button>
      </section>

      {/* Barra de Alternância de Visualização e Filtros Rápidos */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-2">Modo de Exibição:</span>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setModoExibicao('master_detail')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                modoExibicao === 'master_detail'
                  ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Por Cargo / Função</span>
            </button>
            <button
              type="button"
              onClick={() => setModoExibicao('tabela_geral')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                modoExibicao === 'tabela_geral'
                  ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              <span>Matriz Geral (Todos os Vínculos)</span>
            </button>
          </div>
        </div>

        {/* Pílulas de filtro rápido de pendência */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 mr-1 text-[11px]">Vínculo Book:</span>
          <button
            type="button"
            onClick={() => setFiltroPendencia('todos')}
            className={`rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
              filtroPendencia === 'todos'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFiltroPendencia('com_pendencia')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
              filtroPendencia === 'com_pendencia'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            <span>Com Pendência</span>
          </button>
          <button
            type="button"
            onClick={() => setFiltroPendencia('sem_pendencia')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
              filtroPendencia === 'sem_pendencia'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>100% Vinculados</span>
          </button>
        </div>
      </section>

      {/* Conteúdo Principal */}
      {carregando ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm font-medium text-slate-500">Carregando catálogo e requisitos de EPI...</p>
        </div>
      ) : modoExibicao === 'master_detail' ? (
        /* ================= MODO MASTER-DETAIL ================= */
        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Mobile: Campo de Cargos Recolhível / Accordion */}
          <div className="lg:hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all">
            <button
              type="button"
              onClick={() => setCargosRecolhidosMobile(recolhido => !recolhido)}
              className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
              aria-expanded={!cargosRecolhidosMobile}
              aria-label="Alternar lista de cargos"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <BriefcaseBusiness className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Cargo Selecionado
                    </span>
                    {funcaoAtual && (
                      <span className="font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        {funcaoAtual.codigo_origem}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {funcaoAtual?.nome || 'Selecione um cargo'}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{requisitosDaFuncaoAtual.length} {requisitosDaFuncaoAtual.length === 1 ? 'EPI' : 'EPIs'}</span>
                    {requisitosDaFuncaoAtual.some(r => !r.epi_book_id) && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {requisitosDaFuncaoAtual.filter(r => !r.epi_book_id).length} pendente(s)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <span>{cargosRecolhidosMobile ? 'Trocar Cargo' : 'Recolher'}</span>
                {cargosRecolhidosMobile ? (
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-slate-500" />
                )}
              </div>
            </button>

            {/* Conteúdo expandido no mobile */}
            {!cargosRecolhidosMobile && (
              <div className="mt-3.5 border-t border-slate-100 pt-3 dark:border-slate-800 space-y-2.5">
                {/* Campo de busca do cargo */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={buscaFuncao}
                    onChange={e => setBuscaFuncao(e.target.value)}
                    placeholder="Buscar cargo por nome ou código..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-slate-500">
                  <span>{funcoesFiltradas.length} cargos disponíveis</span>
                  {buscaFuncao && (
                    <button
                      type="button"
                      onClick={() => setBuscaFuncao('')}
                      className="text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                    >
                      Limpar busca
                    </button>
                  )}
                </div>

                {/* Lista rolável de cargos */}
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/30 p-1">
                  {funcoesFiltradas.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Nenhum cargo encontrado para a busca.
                    </div>
                  ) : (
                    funcoesFiltradas.map(funcao => {
                      const reqs = mapaRequisitosPorFuncao.get(funcao.id) || [];
                      const semBook = reqs.filter(r => !r.epi_book_id).length;
                      const isSelecionada = funcao.id === funcaoSelecionadaId;

                      return (
                        <button
                          key={funcao.id}
                          type="button"
                          onClick={() => {
                            setFuncaoSelecionadaId(funcao.id);
                            setCargosRecolhidosMobile(true);
                          }}
                          className={`group flex w-full flex-col gap-1 rounded-xl p-2.5 text-left transition-all cursor-pointer ${
                            isSelecionada
                              ? 'bg-emerald-50/90 text-emerald-950 ring-1 ring-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-100'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex w-full items-start justify-between gap-2">
                            <span className="font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500">
                              {funcao.codigo_origem}
                            </span>
                            <div className="flex items-center gap-1">
                              {semBook > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {semBook}
                                </span>
                              )}
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isSelecionada
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}>
                                {reqs.length} {reqs.length === 1 ? 'EPI' : 'EPIs'}
                              </span>
                            </div>
                          </div>
                          <p className={`text-xs font-bold leading-snug ${isSelecionada ? 'text-emerald-950 dark:text-emerald-50' : 'text-slate-900 dark:text-slate-100'}`}>
                            {funcao.nome}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Botão de adicionar cargo */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      abrirNovaFuncao();
                      setCargosRecolhidosMobile(true);
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 p-2 text-xs font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Novo Cargo</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Painel Esquerdo: Lista de Funções (Visível apenas em Desktop) */}
          <aside className="hidden lg:flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {/* Busca de funções */}
            <div className="border-b border-slate-100 p-3 dark:border-slate-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={buscaFuncao}
                  onChange={e => setBuscaFuncao(e.target.value)}
                  placeholder="Buscar função por cargo ou código..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:border-emerald-500"
                />
              </div>
              <div className="mt-2 flex items-center justify-between px-1 text-[11px] font-semibold text-slate-500">
                <span>{funcoesFiltradas.length} cargos listados</span>
                {buscaFuncao && (
                  <button
                    type="button"
                    onClick={() => setBuscaFuncao('')}
                    className="text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Lista rolável de funções */}
            <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
              {funcoesFiltradas.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Nenhuma função encontrada com os filtros atuais.
                </div>
              ) : (
                funcoesFiltradas.map(funcao => {
                  const reqs = mapaRequisitosPorFuncao.get(funcao.id) || [];
                  const semBook = reqs.filter(r => !r.epi_book_id).length;
                  const isSelecionada = funcao.id === funcaoSelecionadaId;

                  return (
                    <button
                      key={funcao.id}
                      type="button"
                      onClick={() => setFuncaoSelecionadaId(funcao.id)}
                      className={`group flex w-full flex-col gap-1.5 rounded-xl p-3 text-left transition-all cursor-pointer ${
                        isSelecionada
                          ? 'bg-emerald-50/90 text-emerald-950 ring-1 ring-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold text-slate-400 group-hover:text-slate-600 dark:text-slate-500">
                          {funcao.codigo_origem}
                        </span>
                        <div className="flex items-center gap-1">
                          {semBook > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                              title={`${semBook} EPI(s) sem vínculo no Book`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {semBook}
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isSelecionada
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {reqs.length} {reqs.length === 1 ? 'EPI' : 'EPIs'}
                          </span>
                        </div>
                      </div>

                      <p className={`text-xs font-bold leading-snug ${isSelecionada ? 'text-emerald-950 dark:text-emerald-50' : 'text-slate-900 dark:text-slate-100'}`}>
                        {funcao.nome}
                      </p>

                      {!funcao.ativo && (
                        <span className="w-fit rounded text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          Inativa
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Rodapé do painel esquerdo */}
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              <button
                type="button"
                onClick={abrirNovaFuncao}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 p-2 text-xs font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar Novo Cargo</span>
              </button>
            </div>
          </aside>

          {/* Painel Direito: Detalhes da Função Selecionada */}
          <main className="space-y-6">
            {funcaoAtual ? (
              <>
                {/* Header do Cargo Selecionado */}
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        {funcaoAtual.codigo_origem}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        funcaoAtual.ativo
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}>
                        {funcaoAtual.ativo ? 'Cargo Ativo' : 'Cargo Inativo'}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {funcaoAtual.nome}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {requisitosDaFuncaoAtual.length} exigências configuradas para esta função
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCargosRecolhidosMobile(false)}
                      className="lg:hidden inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                      title="Abrir seletor de cargos"
                    >
                      <BriefcaseBusiness className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Trocar Cargo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => abrirEditarFuncao(funcaoAtual)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      <span>Editar Cargo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => abrirNovoRequisito(funcaoAtual.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Adicionar EPI</span>
                    </button>
                  </div>
                </div>

                {/* Aviso se houver pendência de Book nesta função */}
                {requisitosDaFuncaoAtual.some(r => !r.epi_book_id) && (
                  <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span>
                        Existem EPIs com vínculo pendente no Book nesta função. Vincule-os ao catálogo oficial para habilitar a emissão correta da Ficha de EPI.
                      </span>
                    </div>
                  </div>
                )}

                {/* Grupos de Requisitos por Classificação */}
                {requisitosDaFuncaoAtual.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                    <ShieldCheck className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                      Nenhum EPI associado a esta função
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Clique no botão acima para adicionar as exigências de proteção individual deste cargo.
                    </p>
                    <button
                      type="button"
                      onClick={() => abrirNovoRequisito(funcaoAtual.id)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Adicionar Primeiro EPI</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {CLASSIFICACOES.map(grupo => {
                      const itensDoGrupo = requisitosDaFuncaoAtual.filter(r => r.classificacao === grupo.valor);
                      if (itensDoGrupo.length === 0) return null;

                      return (
                        <section key={grupo.valor} className="space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200/70 pb-2 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-bold ${grupo.badge}`}>
                                {grupo.rotulo}
                              </span>
                              <span className="text-xs text-slate-400">
                                ({itensDoGrupo.length} {itensDoGrupo.length === 1 ? 'item' : 'itens'})
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 hidden sm:inline">{grupo.desc}</span>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2">
                            {itensDoGrupo.map(req => (
                              <div
                                key={req.id}
                                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                              >
                                <div className="flex items-start gap-3.5">
                                  {/* Miniatura do EPI */}
                                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/80">
                                    <FotoMiniatura path={req.epi_book?.imagem_path} alt={req.descricao_epi_origem} />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="font-mono text-[10px] font-bold text-slate-400">
                                        {req.codigo_epi_origem}
                                      </span>
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        req.ativo
                                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                          : 'bg-slate-100 text-slate-500'
                                      }`}>
                                        {req.ativo ? 'Ativo' : 'Inativo'}
                                      </span>
                                    </div>

                                    <h4 className="mt-0.5 text-xs font-bold text-slate-900 leading-snug dark:text-slate-100 line-clamp-2">
                                      {req.descricao_epi_origem}
                                    </h4>

                                    {/* Informações do Vínculo com o Book */}
                                    <div className="mt-2.5 rounded-xl border p-2.5 text-xs transition-colors ${
                                      req.epi_book
                                        ? 'border-emerald-100 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                                        : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/30'
                                    }">
                                      {req.epi_book ? (
                                        <div className="space-y-1">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                                              Vínculo Book Oficial
                                            </span>
                                            <span className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                              SAP: {req.epi_book.codigo_sap || '—'}
                                            </span>
                                          </div>
                                          <p className="font-medium text-slate-700 dark:text-slate-300 line-clamp-1">
                                            {req.epi_book.descricao_sap || req.epi_book.grupo_epi}
                                          </p>
                                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                                            <span>CA: <strong className="text-slate-700 dark:text-slate-200">{req.epi_book.ca}</strong></span>
                                            {req.epi_book.fabricante && <span>Fab: {req.epi_book.fabricante}</span>}
                                            {req.epi_book.validade && <span>Val: {req.epi_book.validade}</span>}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                            <span className="font-semibold text-[11px]">Vínculo com Book pendente</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => abrirEditarRequisito(req)}
                                            className="font-bold text-emerald-700 hover:underline dark:text-emerald-400 text-[11px] cursor-pointer"
                                          >
                                            Vincular agora
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Condição de uso */}
                                    {req.condicao_uso && (
                                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                        <span className="font-semibold text-slate-600 dark:text-slate-300">Uso: </span>
                                        {req.condicao_uso}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Ações do Card */}
                                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                                  <button
                                    type="button"
                                    onClick={() => abrirEditarRequisito(req)}
                                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    <span>Editar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExcluindoId(req.id)}
                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
                                    title="Excluir exigência desta função"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                Selecione um cargo no menu à esquerda para visualizar e gerenciar os EPIs.
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ================= MODO MATRIZ GERAL (TABELA COMPLETA) ================= */
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {/* Barra de Busca e Filtros Globais */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={buscaGeral}
                onChange={e => {
                  setBuscaGeral(e.target.value);
                  setPaginaAtual(1);
                }}
                placeholder="Pesquisar por cargo, EPI, código SAP, CA..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <ListFilter className="h-3.5 w-3.5 text-slate-400" />
                <span>Classificação:</span>
                <select
                  value={filtroClassificacao}
                  onChange={e => {
                    setFiltroClassificacao(e.target.value);
                    setPaginaAtual(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="TODAS">Todas</option>
                  {CLASSIFICACOES.map(c => (
                    <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                  ))}
                </select>
              </label>

              <span className="text-xs font-bold text-slate-500">
                {requisitosTabelaGeral.length} registros encontrados
              </span>
            </div>
          </div>

          {/* Tabela de Vínculos */}
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
            <table className="w-full min-w-[950px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-3">Cargo / Função</th>
                  <th className="px-3 py-3">EPI da Origem</th>
                  <th className="px-3 py-3">Classificação</th>
                  <th className="px-3 py-3">Vínculo com o Book</th>
                  <th className="px-3 py-3">Condição de Uso</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {requisitosPaginados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
                      Nenhum requisito localizado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  requisitosPaginados.map(req => (
                    <tr
                      key={req.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-3 py-3">
                        <p className="font-bold text-slate-900 dark:text-slate-100">
                          {req.funcao?.nome || 'Função não identificada'}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {req.funcao?.codigo_origem}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {req.descricao_epi_origem}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {req.codigo_epi_origem} {req.ca_origem ? `· CA orig: ${req.ca_origem}` : ''}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClassificacao(req.classificacao)}`}>
                          {rotuloClassificacao(req.classificacao)}
                        </span>
                      </td>

                      <td className="px-3 py-3 max-w-[280px]">
                        {req.epi_book ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                              <FotoMiniatura path={req.epi_book.imagem_path} alt={req.epi_book.descricao_sap || ''} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-emerald-800 dark:text-emerald-400">
                                {req.epi_book.codigo_sap} · {req.epi_book.descricao_sap || req.epi_book.grupo_epi}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                CA {req.epi_book.ca} {req.epi_book.fabricante ? `· ${req.epi_book.fabricante}` : ''}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Pendente de vínculo</span>
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 max-w-[220px] text-[11px] text-slate-500">
                        {req.condicao_uso || '—'}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          req.ativo
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {req.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => abrirEditarRequisito(req)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                          title="Editar requisito"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
              <span>
                Página {paginaAtual} de {totalPaginas}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={paginaAtual <= 1}
                  onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                  className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-slate-700 cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ================= MODAL: EDITAR / NOVO REQUISITO ================= */}
      {editandoRequisito && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Matriz SSMA de EPI por Função
                </p>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  {editandoRequisito.id ? 'Editar Requisito de EPI' : 'Novo Requisito de EPI'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditandoRequisito(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Função / Cargo */}
              <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Cargo / Função Destino:</span>
                <select
                  value={editandoRequisito.funcao_id}
                  onChange={e => setEditandoRequisito({ ...editandoRequisito, funcao_id: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800"
                >
                  {funcoes.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.codigo_origem} — {f.nome}
                    </option>
                  ))}
                </select>
              </label>

              {/* Dados de Origem */}
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>Código Origem:</span>
                  <input
                    value={editandoRequisito.codigo_epi_origem}
                    onChange={e => setEditandoRequisito({ ...editandoRequisito, codigo_epi_origem: e.target.value })}
                    className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800 font-mono"
                    placeholder="EPI-001"
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                  <span>Descrição do EPI (Matriz):</span>
                  <input
                    value={editandoRequisito.descricao_epi_origem}
                    onChange={e => setEditandoRequisito({ ...editandoRequisito, descricao_epi_origem: e.target.value })}
                    className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                    placeholder="Ex: PROTETOR AUDITIVO TIPO PLUG"
                  />
                </label>
              </div>

              {/* Classificação e Situação */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>Classificação:</span>
                  <select
                    value={editandoRequisito.classificacao}
                    onChange={e => setEditandoRequisito({ ...editandoRequisito, classificacao: e.target.value as ClassificacaoEpiFuncao })}
                    className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  >
                    {CLASSIFICACOES.map(c => (
                      <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>Situação:</span>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-xs font-medium dark:border-slate-700">
                    <input
                      type="checkbox"
                      checked={editandoRequisito.ativo}
                      onChange={e => setEditandoRequisito({ ...editandoRequisito, ativo: e.target.checked })}
                      className="rounded"
                    />
                    <span>Requisito Ativo</span>
                  </label>
                </label>
              </div>

              {/* Condição de uso */}
              <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Condição de Uso / Observação Técnica:</span>
                <textarea
                  value={editandoRequisito.condicao_uso || ''}
                  onChange={e => setEditandoRequisito({ ...editandoRequisito, condicao_uso: e.target.value || null })}
                  rows={2}
                  className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  placeholder="Ex: Fornecido para atividade com exposição acima dos limites de tolerância..."
                />
              </label>

              {/* Seletor de Vínculo com o Book de EPIs */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                    <BookOpen className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold">Vínculo com o Catálogo Oficial (Book de EPIs)</span>
                  </div>
                  {editandoRequisito.epi_book_id && (
                    <button
                      type="button"
                      onClick={() => setEditandoRequisito({ ...editandoRequisito, epi_book_id: null })}
                      className="text-[11px] font-bold text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                    >
                      Remover vínculo
                    </button>
                  )}
                </div>

                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Vincule à variante correspondente do Book. A Ficha de EPI utilizará o CA, SAP e foto do item selecionado.
                </p>

                {/* Campo de pesquisa no Book */}
                <div className="mt-3 relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={buscaBook}
                    onChange={e => setBuscaBook(e.target.value)}
                    placeholder="Filtrar variantes do Book por descrição, SAP ou CA..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                {/* Lista de seleção do Book */}
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 divide-y divide-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:divide-slate-700">
                  {opcoesBookFiltradas.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Nenhum EPI encontrado no Book com esse filtro.
                    </div>
                  ) : (
                    opcoesBookFiltradas.map(epi => {
                      const selecionado = editandoRequisito.epi_book_id === epi.id;
                      return (
                        <button
                          key={epi.id}
                          type="button"
                          onClick={() => setEditandoRequisito({ ...editandoRequisito, epi_book_id: epi.id })}
                          className={`flex w-full items-center justify-between gap-3 p-2 rounded-lg text-left transition-colors cursor-pointer ${
                            selecionado
                              ? 'bg-emerald-100 text-emerald-950 font-bold dark:bg-emerald-900/60 dark:text-emerald-100'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 dark:bg-slate-700">
                              <FotoMiniatura path={epi.imagem_path} alt={epi.descricao_sap || ''} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs truncate">
                                {epi.descricao_sap || epi.grupo_epi}
                              </p>
                              <p className="text-[10px] text-slate-500 font-normal">
                                SAP: {epi.codigo_sap || 'Sem SAP'} · CA: {epi.ca} {epi.fabricante ? `· ${epi.fabricante}` : ''}
                              </p>
                            </div>
                          </div>
                          {selecionado && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditandoRequisito(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarRequisito}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                <span>Salvar Requisito</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CRIAR / EDITAR FUNÇÃO ================= */}
      {modalFuncao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Estrutura de Cargos SSMA
                </p>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  {modalFuncao.id ? 'Editar Função / Cargo' : 'Nova Função / Cargo'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalFuncao(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Código da Função:</span>
                <input
                  value={modalFuncao.codigo_origem}
                  onChange={e => setModalFuncao({ ...modalFuncao, codigo_origem: e.target.value })}
                  className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800 font-mono uppercase"
                  placeholder="FUN-055"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Nome do Cargo / Função:</span>
                <input
                  value={modalFuncao.nome}
                  onChange={e => setModalFuncao({ ...modalFuncao, nome: e.target.value })}
                  className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800 uppercase"
                  placeholder="Ex: TÉCNICO DE SEGURANÇA DO TRABALHO"
                  autoFocus
                />
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-xs font-medium dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={modalFuncao.ativo}
                  onChange={e => setModalFuncao({ ...modalFuncao, ativo: e.target.checked })}
                  className="rounded"
                />
                <span>Cargo Ativo na Fábrica</span>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalFuncao(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarFuncao}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>Salvar Cargo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE CONFIRMAÇÃO DE EXCLUSÃO ================= */}
      {excluindoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
          >
            <div className="flex items-center gap-3 text-rose-600">
              <ShieldAlert className="h-6 w-6" />
              <h4 className="font-bold text-slate-900 dark:text-slate-100">Desvincular EPI</h4>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Tem certeza que deseja remover esta exigência de EPI desta função? A alteração ficará registrada no histórico.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExcluindoId(null)}
                className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => excluirRequisito(excluindoId)}
                disabled={salvando}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>Confirmar Exclusão</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
