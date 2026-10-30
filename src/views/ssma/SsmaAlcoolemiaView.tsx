/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário SSMA: Termo de Execução de Teste de Alcoolemia (FRM.SOC-0042)
 *
 * Integração direta com a Portaria:
 * - Apresenta a lista de sorteados do dia registrados na portaria;
 * - Permite abrir o termo individual para registrar o resultado e aferição;
 * - Permite adicionar novos colaboradores ou terceiros fora da lista da portaria (Pós-acidente, Motivado ou Aleatório);
 * - Em caso de resultado POSITIVO, alerta em destaque e geração imediata do Termo oficial para assinatura física;
 * - Exportação do Termo oficial em PDF (FRM.SOC-0042) idêntico ao modelo padrão TEN.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert, FileText, Printer, Search, Plus, Calendar, Clock,
  CheckCircle2, AlertTriangle, XCircle, Clock3, Building2, Briefcase,
  User, Gauge, FileCheck, ArrowLeft, HelpCircle, RefreshCw,
  Check, X, FileDown, Activity, AlertCircle, Loader2, FileSignature, UserPlus, RotateCcw, Trash2
} from 'lucide-react';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import type {
  Profile,
  PortAlcoolemiaTeste,
  PortAlcoolemiaResultado,
  PortAlcoolemiaVinculo,
  PortAlcoolemiaRazao,
  RhPessoa
} from '../../types';
import * as api from '../../lib/portariaApi';
import { listarRhPessoas } from '../../lib/rhApi';
import PdfPreviewModal from '../../components/ui/PdfPreviewModal';
import type { PdfGerado } from '../../lib/pdfExport/core';
import { exportTermoAlcoolemiaPdf, gerarTermoAlcoolemiaPdf } from '../../lib/pdfExport/exportSsmaAlcoolemiaPdf';
import { gerarAlcoolemiaPeriodoPdf } from '../../lib/pdfExport/exportPortariaPdf';
import {
  agruparPorData, intervaloDoPeriodo, navegarPeriodo, rotuloDia, rotuloPeriodo, somarDias, testeCombinaBusca,
  type Intervalo, type ModoPeriodo,
} from '../../lib/alcoolemiaPeriodo';
import {
  BotaoCartao, BuscaColaborador, CartaoTeste, ExportarLivroModal, FiltrosResultado, ListaVazia, SeletorPeriodo,
  SeloExcluido, SeloQuemAferiu, SeloRazao, SeloResultado, SeloTermo, type FiltroResultado,
} from '../../components/ssma/AlcoolemiaPainel';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import TourSpotlight from '../../components/help/TourSpotlight';
import { usePageTour } from '../../components/help/TourRegistryContext';
import type { TourStep } from '../../components/help/types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: ShieldAlert,
    title: 'Termo de Alcoolemia SSMA (FRM.SOC-0042)',
    description:
      'Registro oficial de execução de testes de alcoolemia e orientações sobre substâncias psicoativas integrado com os sorteados da portaria.',
  },
  {
    target: 'ssma-alc-date-nav',
    icon: Calendar,
    title: 'Dia, semana, mês ou período',
    description:
      'Escolha o que a lista mostra: o dia (com as setas), a semana, o mês ou um período com data inicial e final.',
  },
  {
    target: 'ssma-alc-kpis',
    icon: Activity,
    title: 'Busca e resultado',
    description:
      'Digite o nome ou a matrícula de quem chegou para achar o teste na hora. Os botões mostram quantos estão aguardando, aptos, positivos e recusas — toque para filtrar.',
  },
  {
    target: 'ssma-alc-novo-btn',
    icon: Plus,
    title: 'Adicionar Colaborador Não Sorteado',
    description:
      'Adicione novos testes motivados, pós-acidente ou aleatórios que não estavam na lista inicial da portaria.',
  },
  {
    target: 'ssma-alc-table',
    icon: FileText,
    title: 'Lista de Testes e Termo Individual',
    description:
      'Abra o termo de cada colaborador para registrar o resultado ou clique para imprimir o termo oficial para assinatura física.',
  },
];

function formatarDataBR(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function SsmaAlcoolemiaView({ user, onNavigate }: Props) {
  const tour = usePageTour('ssma-alcoolemia', TOUR_STEPS.length);
  const toast = useToast();

  // Filtros e Navegação. `dataSelecionada` é a referência do Dia/Semana/Mês;
  // Período usa as duas datas próprias.
  const hoje = api.hojeISO();
  const [modoPeriodo, setModoPeriodo] = useState<ModoPeriodo>('dia');
  const [dataSelecionada, setDataSelecionada] = useState<string>(hoje);
  const [periodoInicio, setPeriodoInicio] = useState<string>(() => somarDias(hoje, -6));
  const [periodoFim, setPeriodoFim] = useState<string>(hoje);
  const intervalo = useMemo(
    () => intervaloDoPeriodo(modoPeriodo, dataSelecionada, periodoInicio, periodoFim),
    [modoPeriodo, dataSelecionada, periodoInicio, periodoFim],
  );
  const umDia = intervalo.inicio === intervalo.fim;
  const rotuloIntervalo = rotuloPeriodo(modoPeriodo, intervalo, hoje);
  const [filtroResultado, setFiltroResultado] = useState<FiltroResultado>('TODOS');
  const [filtroRazao, setFiltroRazao] = useState<string>('TODOS');
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // Dados
  const [testes, setTestes] = useState<PortAlcoolemiaTeste[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [colaboradoresRh, setColaboradoresRh] = useState<RhPessoa[]>([]);

  // Modais
  const [modalTermoAberto, setModalTermoAberto] = useState<boolean>(false);
  const [testeAtivo, setTesteAtivo] = useState<PortAlcoolemiaTeste | null>(null);
  const [modalNovoAberto, setModalNovoAberto] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [imprimindo, setImprimindo] = useState<boolean>(false);
  const [pdfPreview, setPdfPreview] = useState<{ gerar: () => Promise<PdfGerado>; titulo?: string } | null>(null);
  const [exportarAberto, setExportarAberto] = useState<boolean>(false);
  const [exportando, setExportando] = useState<boolean>(false);
  const [testeParaExcluir, setTesteParaExcluir] = useState<PortAlcoolemiaTeste | null>(null);
  const [excluindo, setExcluindo] = useState<boolean>(false);

  // Campos do Termo FRM.SOC-0042
  const [termoRazao, setTermoRazao] = useState<PortAlcoolemiaRazao>('ALEATORIO');
  const [termoResultado, setTermoResultado] = useState<PortAlcoolemiaResultado>('NEGATIVO');
  const [termoValorMedido, setTermoValorMedido] = useState<string>('0.00');
  const [termoEtilometro, setTermoEtilometro] = useState<string>('ETIL-01');
  const [termoLocal, setTermoLocal] = useState<string>('Ambulatório TEN');
  const [termoExaminador, setTermoExaminador] = useState<string>(user.name || '');
  const [termoExaminadorCargo, setTermoExaminadorCargo] = useState<string>('Técnico de SSMA');
  const [termoTestemunha, setTermoTestemunha] = useState<string>('');
  const [termoObservacoes, setTermoObservacoes] = useState<string>('');
  const [termoAssinadoFisicamente, setTermoAssinadoFisicamente] = useState<boolean>(false);

  // Campos do Modal de Novo Teste Extra (fora da lista da portaria)
  const [novoTipoVinculo, setNovoTipoVinculo] = useState<PortAlcoolemiaVinculo>('TEN');
  const [novoBuscaRh, setNovoBuscaRh] = useState<string>('');
  const [novoRhSelecionado, setNovoRhSelecionado] = useState<RhPessoa | null>(null);
  const [novoNome, setNovoNome] = useState<string>('');
  const [novoMatricula, setNovoMatricula] = useState<string>('');
  const [novoEmpresa, setNovoEmpresa] = useState<string>('TEN');
  const [novoCargo, setNovoCargo] = useState<string>('');
  const [novoSetor, setNovoSetor] = useState<string>('');
  const [novoDocumento, setNovoDocumento] = useState<string>('');
  const [novoHorario, setNovoHorario] = useState<string>(api.horaAgora());
  const [novoTurno, setNovoTurno] = useState<string>(api.sugerirTurno());
  const [novoRazao, setNovoRazao] = useState<PortAlcoolemiaRazao>('MOTIVADO');

  // Carregar RH Pessoas
  useEffect(() => {
    listarRhPessoas()
      .then((res) => setColaboradoresRh(res || []))
      .catch((err) => console.error('Erro ao listar RH Pessoas:', err));
  }, []);

  // Carregar registros do período exibido
  const carregarTestes = useCallback(async () => {
    setCarregando(true);
    try {
      // Traz os excluídos também: ficam fora da lista e do livro, visíveis só no filtro Excluídos.
      const lista = await api.listarTestesAlcoolemia({
        ...(intervalo.inicio === intervalo.fim ? { data: intervalo.inicio } : { dataInicio: intervalo.inicio, dataFim: intervalo.fim }),
        incluirExcluidos: true,
      });
      setTestes(lista);
    } catch (err: any) {
      console.error('Erro ao listar testes de alcoolemia:', err);
      toast.error('Não foi possível carregar os testes. Confira a conexão e toque em atualizar.');
    } finally {
      setCarregando(false);
    }
  }, [intervalo.inicio, intervalo.fim, toast]);

  // Livro em PDF do período escolhido na exportação. Se for o que já está na
  // tela, usa a lista carregada.
  const gerarLivro = async (iv: Intervalo) => {
    setExportando(true);
    try {
      const lista = iv.inicio === intervalo.inicio && iv.fim === intervalo.fim
        ? vigentes
        : await api.listarTestesAlcoolemia({ dataInicio: iv.inicio, dataFim: iv.fim });
      if (lista.length === 0) {
        toast.warning('Nenhum teste nesse período para exportar.');
        return;
      }
      setExportarAberto(false);
      setPdfPreview({
        gerar: () => gerarAlcoolemiaPeriodoPdf(lista, iv.inicio, iv.fim, user.name),
        titulo: `Livro de Alcoolemia - ${rotuloPeriodo('periodo', iv, hoje)}`,
      });
    } catch (err: any) {
      toast.error('Não foi possível ler os testes do período: ' + (err?.message || err));
    } finally {
      setExportando(false);
    }
  };

  useEffect(() => {
    carregarTestes();
  }, [carregarTestes]);

  // Autocomplete RH para novo cadastro extra
  const rhFiltrados = useMemo(() => {
    if (!novoBuscaRh.trim() || novoTipoVinculo !== 'TEN') return [];
    const t = novoBuscaRh.trim().toUpperCase();
    return colaboradoresRh
      .filter((p) => {
        const nome = (p.nome || '').toUpperCase();
        const reg = (p.registro || '').toUpperCase();
        const cargo = (p.cargo || '').toUpperCase();
        return nome.includes(t) || reg.includes(t) || cargo.includes(t);
      })
      .slice(0, 8);
  }, [novoBuscaRh, colaboradoresRh, novoTipoVinculo]);

  const selecionarColaboradorRh = (p: RhPessoa) => {
    setNovoRhSelecionado(p);
    setNovoNome(p.nome);
    setNovoMatricula(p.registro || '');
    setNovoEmpresa('TEN');
    setNovoCargo(p.cargo || '');
    setNovoSetor(p.area || p.subsetor || '');
    setNovoBuscaRh('');
  };

  const limparSelecaoRh = () => {
    setNovoRhSelecionado(null);
    setNovoNome('');
    setNovoMatricula('');
    setNovoEmpresa('TEN');
    setNovoCargo('');
    setNovoSetor('');
    setNovoBuscaRh('');
  };

  // Navegação de período
  const trocarModo = (m: ModoPeriodo) => {
    if (m === 'periodo' && modoPeriodo !== 'periodo') {
      // Período começa com o que estava na tela, para só ajustar as pontas.
      setPeriodoInicio(intervalo.inicio === intervalo.fim ? somarDias(intervalo.fim, -6) : intervalo.inicio);
      setPeriodoFim(intervalo.fim);
    }
    setModoPeriodo(m);
  };

  // Excluídos (lançados errado) ficam guardados, fora da lista, das contagens e do livro.
  const vigentes = useMemo(() => testes.filter((t) => !t.excluido_em), [testes]);
  const daRazao = useMemo(
    () => (filtroRazao === 'TODOS' ? testes : testes.filter((t) => (t.razao_teste || 'ALEATORIO') === filtroRazao)),
    [testes, filtroRazao],
  );
  const excluidosDaRazao = useMemo(() => daRazao.filter((t) => !!t.excluido_em), [daRazao]);

  // Métricas do período (antes da busca e do filtro, para os números não mudarem ao digitar)
  const metricas = useMemo(() => api.calcularMetricasAlcoolemia(daRazao.filter((t) => !t.excluido_em)), [daRazao]);

  // Filtros aplicados na lista
  const testesFiltrados = useMemo(() => {
    if (filtroResultado === 'EXCLUIDOS') return excluidosDaRazao.filter((t) => testeCombinaBusca(t, buscaTexto));
    return daRazao.filter((t) => {
      if (t.excluido_em) return false;
      if (filtroResultado !== 'TODOS' && t.resultado !== filtroResultado) return false;
      return testeCombinaBusca(t, buscaTexto);
    });
  }, [daRazao, excluidosDaRazao, filtroResultado, buscaTexto]);
  const gruposPorDia = useMemo(() => agruparPorData(testesFiltrados), [testesFiltrados]);

  // Abertura do Modal de Execução do Termo
  const abrirModalTermo = (teste: PortAlcoolemiaTeste) => {
    setTesteAtivo(teste);
    setTermoRazao(teste.razao_teste || 'ALEATORIO');
    setTermoResultado(teste.resultado === 'PENDENTE' ? 'NEGATIVO' : teste.resultado);
    setTermoValorMedido(String(teste.valor_medido ?? '0.00'));
    setTermoEtilometro(teste.etilometro_codigo || 'ETIL-01');
    setTermoLocal(teste.local_teste || 'Ambulatório TEN');
    setTermoExaminador(teste.examinador_nome || user.name || '');
    setTermoExaminadorCargo(teste.examinador_cargo || 'Técnico de SSMA');
    setTermoTestemunha(teste.testemunha || '');
    setTermoObservacoes(teste.observacoes || '');
    setTermoAssinadoFisicamente(!!teste.termo_assinado_fisicamente);
    setModalTermoAberto(true);
  };

  // Gravação do Termo
  const salvarTermo = async (fecharAposSalvar: boolean = true) => {
    if (!testeAtivo) return;
    setSalvando(true);
    try {
      const valorNum = parseFloat(termoValorMedido.replace(',', '.')) || 0;
      await api.atualizarTesteAlcoolemia(testeAtivo.id, {
        razao_teste: termoRazao,
        resultado: termoResultado,
        valor_medido: termoResultado === 'POSITIVO' ? valorNum : 0.0,
        etilometro_codigo: termoEtilometro.trim() || null,
        local_teste: termoLocal.trim() || 'Ambulatório TEN',
        examinador_nome: termoExaminador.trim() || null,
        examinador_cargo: termoExaminadorCargo.trim() || null,
        testemunha: termoTestemunha.trim() || null,
        observacoes: termoObservacoes.trim() || null,
        termo_assinado_fisicamente: termoAssinadoFisicamente,
      });

      toast.success(`Termo registrado para ${testeAtivo.nome}!`);
      await carregarTestes();
      if (fecharAposSalvar) {
        setModalTermoAberto(false);
      }
    } catch (err: any) {
      console.error('Erro ao salvar termo de alcoolemia:', err);
      toast.error('Erro ao gravar termo: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  // Exclusão de teste lançado errado: só marca como excluído (vai para o filtro Excluídos)
  const confirmarExclusao = async () => {
    if (!testeParaExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirTesteAlcoolemia(testeParaExcluir.id, user.id);
      toast.success(`${testeParaExcluir.codigo_formulario} excluído. Fica no filtro Excluídos.`);
      setTesteParaExcluir(null);
      await carregarTestes();
    } catch (err: any) {
      toast.error('Não foi possível excluir: ' + (err?.message || err));
    } finally {
      setExcluindo(false);
    }
  };

  const restaurarTeste = async (teste: PortAlcoolemiaTeste) => {
    try {
      await api.restaurarTesteAlcoolemia(teste.id);
      toast.success(`${teste.codigo_formulario} voltou para a lista.`);
      await carregarTestes();
    } catch (err: any) {
      toast.error('Não foi possível restaurar: ' + (err?.message || err));
    }
  };

  // Impressão oficial do termo FRM.SOC-0042
  const imprimirTermoOficial = (teste: PortAlcoolemiaTeste) => {
    setPdfPreview({
      gerar: async () => {
        const pdf = await gerarTermoAlcoolemiaPdf(teste);
        // Marcar termo impresso
        void api.atualizarTesteAlcoolemia(teste.id, {
          termo_impresso_em: new Date().toISOString(),
        }).then(() => carregarTestes());
        return pdf;
      },
      titulo: `Termo de Alcoolemia - ${teste.nome}`,
    });
  };

  // Abrir Modal de Novo Teste Extra. Vindo da busca sem resultado, já procura o nome digitado no RH.
  const abrirModalNovoExtra = (buscaInicial = '') => {
    setNovoTipoVinculo('TEN');
    setNovoRhSelecionado(null);
    setNovoBuscaRh(buscaInicial);
    setNovoNome('');
    setNovoMatricula('');
    setNovoEmpresa('TEN');
    setNovoCargo('');
    setNovoSetor('');
    setNovoDocumento('');
    setNovoHorario(api.horaAgora());
    setNovoTurno(api.sugerirTurno());
    setNovoRazao('MOTIVADO');
    setModalNovoAberto(true);
  };

  // Salvar Novo Teste Extra
  const salvarNovoExtra = async () => {
    if (!novoNome.trim()) {
      toast.warning('Informe o nome do colaborador a ser testado.');
      return;
    }
    if (novoTipoVinculo === 'PJ' && !novoEmpresa.trim()) {
      toast.warning('Informe a empresa contratada/PJ.');
      return;
    }

    setSalvando(true);
    try {
      const payload: Partial<PortAlcoolemiaTeste> = {
        // Dia exibido (permite lançar em data passada); vendo semana/mês/período, o teste é de hoje.
        data: modoPeriodo === 'dia' ? dataSelecionada : hoje,
        horario: novoHorario,
        turno: novoTurno,
        tipo_vinculo: novoTipoVinculo,
        pessoa_id: novoRhSelecionado?.id || null,
        matricula: novoTipoVinculo === 'TEN' ? novoMatricula.trim() || null : null,
        nome: novoNome.trim(),
        empresa: novoTipoVinculo === 'TEN' ? 'TEN' : novoEmpresa.trim(),
        cargo_funcao: novoCargo.trim() || null,
        setor_area: novoSetor.trim() || null,
        documento: novoTipoVinculo === 'PJ' ? novoDocumento.trim() || null : null,
        razao_teste: novoRazao,
        resultado: 'PENDENTE',
        valor_medido: 0.0,
        local_teste: 'Ambulatório TEN',
        examinador_nome: user.name,
        examinador_cargo: 'Técnico de SSMA',
        criado_por: user.id,
        criado_por_nome: user.name,
      };

      const criado = await api.criarTesteAlcoolemia(payload);
      toast.success(`Teste criado: ${criado.codigo_formulario} (${criado.nome})`);
      setModalNovoAberto(false);
      await carregarTestes();

      // Já abre o modal do termo para registro
      abrirModalTermo(criado);
    } catch (err: any) {
      console.error('Erro ao adicionar teste extra:', err);
      toast.error('Erro ao criar teste: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-16 sm:space-y-5">
      {/* Cabeçalho */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios/ssma')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          <span>SSMA</span>
        </button>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white sm:flex">
              <FileSignature className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">
                Teste de alcoolemia
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">FRM.SOC-0042</span>
                <span className="ml-2 hidden sm:inline">Sorteados da portaria e testes avulsos do SSMA</span>
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-[1fr_auto] gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              id="ssma-alc-novo-btn"
              onClick={() => abrirModalNovoExtra()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <UserPlus className="h-4 w-4" />
              <span>Adicionar teste</span>
            </button>
            <button
              type="button"
              onClick={() => setExportarAberto(true)}
              aria-label="Exportar livro em PDF"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <FileDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Exportar livro</span>
            </button>
          </div>
        </div>
      </div>

      {/* Período */}
      <section
        id="ssma-alc-date-nav"
        aria-label="Período exibido"
        className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:max-w-xl"
      >
        <SeletorPeriodo
          modo={modoPeriodo}
          onModo={trocarModo}
          intervalo={intervalo}
          hoje={hoje}
          onPasso={(p) => setDataSelecionada((d) => navegarPeriodo(modoPeriodo, d, p))}
          onHoje={() => setDataSelecionada(hoje)}
          inicio={periodoInicio}
          fim={periodoFim}
          onInicio={setPeriodoInicio}
          onFim={setPeriodoFim}
        />
      </section>

      {/* Busca e resultado: presos no topo enquanto a lista rola */}
      <div className="sticky top-0 z-20 -mx-3 space-y-2.5 bg-[var(--surface-page)] px-3 pb-3 pt-2 sm:-mx-6 sm:px-6">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <BuscaColaborador
              valor={buscaTexto}
              onChange={setBuscaTexto}
              encontrados={testesFiltrados.length}
              total={testes.length}
            />
          </div>
          <button
            type="button"
            onClick={carregarTestes}
            aria-label="Atualizar lista"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <RefreshCw className={`h-5 w-5 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div id="ssma-alc-kpis" className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <FiltrosResultado valor={filtroResultado} onChange={setFiltroResultado} metricas={metricas} excluidos={excluidosDaRazao.length} />
          </div>
          <select
            value={filtroRazao}
            onChange={(e) => setFiltroRazao(e.target.value)}
            aria-label="Razão do teste"
            className="hidden h-10 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-emerald-500 focus:outline-none sm:block dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="TODOS">Todas as razões</option>
            <option value="ALEATORIO">Aleatório (sorteio)</option>
            <option value="MOTIVADO">Motivado / suspeita</option>
            <option value="POS_ACIDENTE">Pós-acidente</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div id="ssma-alc-table">
        {carregando && testes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <span className="mt-3 text-sm font-medium">Carregando testes…</span>
          </div>
        ) : testesFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <ListaVazia busca={buscaTexto} rotulo={umDia ? rotuloIntervalo.replace(/^Hoje, /, 'hoje, ') : rotuloIntervalo} onAdicionar={() => abrirModalNovoExtra(buscaTexto.trim())} />
          </div>
        ) : (
          <>
            {/* Celular e tablet: cartões, agrupados por dia quando o período tem mais de um */}
            <div className="space-y-5 lg:hidden">
              {gruposPorDia.map((g) => (
                <section key={g.data} aria-label={rotuloDia(g.data, hoje)}>
                  {!umDia && (
                    <h2 className="mb-2 flex items-baseline justify-between px-1 text-sm font-bold text-slate-700 first-letter:uppercase dark:text-slate-200">
                      <span>{rotuloDia(g.data, hoje)}</span>
                      <span className="text-xs font-medium text-slate-500">{g.itens.length} {g.itens.length === 1 ? 'teste' : 'testes'}</span>
                    </h2>
                  )}
                  <div className="space-y-3">
                    {g.itens.map((item) => (
                      <CartaoTeste
                        key={item.id}
                        teste={item}
                        principal={
                          item.excluido_em
                            ? (podeEditarFormulario(user, item)
                                ? { rotulo: 'Restaurar', icone: RotateCcw, onClick: () => void restaurarTeste(item), destaque: false }
                                : null)
                            : {
                                rotulo: item.resultado === 'PENDENTE' ? 'Registrar resultado' : 'Ver termo',
                                icone: FileSignature,
                                onClick: () => abrirModalTermo(item),
                                destaque: item.resultado === 'PENDENTE',
                              }
                        }
                        acoes={!item.excluido_em && (
                          <>
                            <BotaoCartao
                              rotulo={`Imprimir termo de ${item.nome}`}
                              icone={Printer}
                              onClick={() => imprimirTermoOficial(item)}
                              tom={item.resultado === 'POSITIVO' ? 'alerta' : 'neutro'}
                            />
                            {podeEditarFormulario(user, item) && (
                              <BotaoCartao rotulo={`Excluir teste de ${item.nome}`} icone={Trash2} tom="perigo" onClick={() => setTesteParaExcluir(item)} />
                            )}
                          </>
                        )}
                        rodape={<><SeloTermo teste={item} />{item.vigilante && <SeloQuemAferiu teste={item} />}</>}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Computador: tabela */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
              <table data-no-cards className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                    <th className="px-4 py-3">{umDia ? 'Horário' : 'Data e horário'}</th>
                    <th className="px-4 py-3">Colaborador</th>
                    <th className="px-4 py-3">Empresa e função</th>
                    <th className="px-4 py-3">Razão</th>
                    <th className="px-4 py-3">Resultado</th>
                    <th className="px-4 py-3">Termo</th>
                    <th className="px-4 py-3 text-right"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {testesFiltrados.map((item) => {
                    const isPendente = item.resultado === 'PENDENTE';
                    const isPositivo = item.resultado === 'POSITIVO';
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${isPositivo ? 'bg-rose-50/40 dark:bg-rose-950/10' : ''}`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                          {!umDia && <div className="text-xs font-semibold text-slate-500">{item.data.slice(8, 10)}/{item.data.slice(5, 7)}</div>}
                          <div className="font-bold">{item.horario}</div>
                          <div className="text-xs text-slate-400">{(item.turno || '').toLowerCase()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{item.nome}</div>
                          <div className="text-xs text-slate-500">
                            {item.matricula ? `Matr. ${item.matricula}` : item.documento ? `Doc. ${item.documento}` : ''}
                            <span className="ml-2 font-mono text-slate-400">{item.codigo_formulario}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 dark:text-slate-200">{item.empresa || 'TEN'}</div>
                          <div className="text-xs text-slate-500">{item.cargo_funcao || '-'}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3"><SeloRazao razao={item.razao_teste || 'ALEATORIO'} /></td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex flex-col items-start gap-1"><SeloResultado teste={item} /><SeloExcluido teste={item} /></div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3"><SeloTermo teste={item} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {item.excluido_em ? (
                            podeEditarFormulario(user, item) && (
                              <button
                                type="button"
                                onClick={() => void restaurarTeste(item)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                <RotateCcw className="h-4 w-4" /> Restaurar
                              </button>
                            )
                          ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => abrirModalTermo(item)}
                              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors ${
                                isPendente
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                              }`}
                            >
                              <FileSignature className="h-4 w-4" />
                              {isPendente ? 'Registrar resultado' : 'Ver termo'}
                            </button>
                            <button
                              type="button"
                              onClick={() => imprimirTermoOficial(item)}
                              aria-label={`Imprimir termo de ${item.nome}`}
                              title="Imprimir termo para assinatura"
                              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                                isPositivo
                                  ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            {podeEditarFormulario(user, item) && (
                              <button
                                type="button"
                                onClick={() => setTesteParaExcluir(item)}
                                aria-label={`Excluir teste de ${item.nome}`}
                                title="Excluir teste lançado errado"
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {exportarAberto && (
        <ExportarLivroModal
          modoAtual={modoPeriodo}
          intervaloAtual={intervalo}
          hoje={hoje}
          gerando={exportando}
          onCancelar={() => setExportarAberto(false)}
          onGerar={(iv) => void gerarLivro(iv)}
        />
      )}

      {/* MODAL DO TERMO OFICIAL DE ALCOOLEMIA (FRM.SOC-0042) */}
      {modalTermoAberto && testeAtivo && (
        <Modal
          onClose={() => !salvando && setModalTermoAberto(false)}
          maxWidth="max-w-2xl"
          ariaLabel="Termo de Execução de Teste de Alcoolemia"
        >
          <ModalHeader onClose={() => !salvando && setModalTermoAberto(false)}>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Termo de Execução de Teste de Alcoolemia
                </h3>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  FRM.SOC-0042 • Rev. 00
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Protocolo: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{testeAtivo.codigo_formulario}</span> • Data: {formatarDataBR(testeAtivo.data)}
              </p>
            </div>
          </ModalHeader>

          <ModalBody className="max-h-[80vh] overflow-y-auto p-5 space-y-4">
            {/* Banner de Identificação do Colaborador */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Identificação do Colaborador
                </span>
                <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs dark:bg-slate-900 dark:text-slate-300">
                  {testeAtivo.tipo_vinculo === 'TEN' ? 'Colaborador TEN' : 'Terceiro / PJ'}
                </span>
              </div>
              <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {testeAtivo.nome}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                {testeAtivo.matricula && (
                  <span className="font-mono font-semibold">Matrícula: {testeAtivo.matricula}</span>
                )}
                {testeAtivo.documento && (
                  <span>Doc: {testeAtivo.documento}</span>
                )}
                <span>• Empresa: <strong>{testeAtivo.empresa}</strong></span>
                {testeAtivo.cargo_funcao && (
                  <span>• Função: {testeAtivo.cargo_funcao}</span>
                )}
                {testeAtivo.setor_area && (
                  <span>({testeAtivo.setor_area})</span>
                )}
              </div>
            </div>

            {/* Texto de Autorização do Procedimento */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-[11px] leading-relaxed text-blue-900 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-200">
              <strong>Declaração de Ciência & Autorização:</strong> O colaborador declara estar ciente do Procedimento para controle de nível de Alcoolemia e Drogas ilícitas da TEN, concordando com as medidas com o objetivo principal de controlar a exposição aos riscos e prevenir acidentes.
            </div>

            {/* Razão para o Teste */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Razão para o Teste (Marque uma opção) *
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTermoRazao('ALEATORIO')}
                  className={`rounded-xl border p-2.5 text-center text-xs font-bold transition-all ${
                    termoRazao === 'ALEATORIO'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  ALEATÓRIO
                  <span className="block text-[10px] font-normal text-slate-500">Sorteio Diário</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTermoRazao('MOTIVADO')}
                  className={`rounded-xl border p-2.5 text-center text-xs font-bold transition-all ${
                    termoRazao === 'MOTIVADO'
                      ? 'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  MOTIVADO
                  <span className="block text-[10px] font-normal text-slate-500">Suspeita / Comportamento</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTermoRazao('POS_ACIDENTE')}
                  className={`rounded-xl border p-2.5 text-center text-xs font-bold transition-all ${
                    termoRazao === 'POS_ACIDENTE'
                      ? 'border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-500/20 dark:border-rose-500 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  PÓS ACIDENTE
                  <span className="block text-[10px] font-normal text-slate-500">Investigação de Ocorrência</span>
                </button>
              </div>
            </div>

            {/* Resultado do Teste */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Resultado do Teste de Alcoolemia *
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTermoResultado('NEGATIVO');
                    setTermoValorMedido('0.00');
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                    termoResultado === 'NEGATIVO'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="mt-1 text-xs font-bold">NEGATIVO</span>
                  <span className="text-[10px] text-emerald-600/80">Apto (0,00 mg/L)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTermoResultado('POSITIVO')}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                    termoResultado === 'POSITIVO'
                      ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20 dark:border-rose-500 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  <span className="mt-1 text-xs font-bold">POSITIVO</span>
                  <span className="text-[10px] text-rose-600/80">&gt; 0,00 mg/L</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTermoResultado('RECUSA');
                    setTermoValorMedido('0.00');
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                    termoResultado === 'RECUSA'
                      ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="mt-1 text-xs font-bold">RECUSA</span>
                  <span className="text-[10px] text-amber-600/80">Recusou realização</span>
                </button>
              </div>
            </div>

            {/* ALERTA DE RESULTADO POSITIVO: ASSINATURA FÍSICA OBRIGATÓRIA */}
            {termoResultado === 'POSITIVO' && (
              <div className="rounded-2xl border-2 border-rose-400 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/40 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-extrabold text-rose-900 dark:text-rose-200">
                      RESULTADO POSITIVO — ASSINATURA FÍSICA OBRIGATÓRIA
                    </h4>
                    <p className="text-[11px] text-rose-800 dark:text-rose-300">
                      Conforme procedimento da TEN, em caso de resultado positivo, <strong>o termo deve ser impresso e assinado fisicamente pelo colaborador</strong>, com notificação imediata à chefia e ao SESMT.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-rose-900 dark:text-rose-200">
                      Valor Medido no Etilômetro (mg/L) *
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="5.00"
                        value={termoValorMedido}
                        onChange={(e) => setTermoValorMedido(e.target.value)}
                        className="w-32 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-mono text-sm font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-100"
                      />
                      <span className="text-xs font-bold text-rose-800 dark:text-rose-300">mg/L</span>
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => imprimirTermoOficial({ ...testeAtivo, resultado: 'POSITIVO', valor_medido: parseFloat(termoValorMedido) || 0, razao_teste: termoRazao })}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700"
                    >
                      <Printer className="h-4 w-4" />
                      <span>Imprimir Termo Físico Agora</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Local, Aparelho e Examinador */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Local de Realização e Orientações *
                </label>
                <input
                  type="text"
                  value={termoLocal}
                  onChange={(e) => setTermoLocal(e.target.value)}
                  placeholder="Ex: Ambulatório TEN, Portaria TEN..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Código do Etilômetro / Aparelho
                </label>
                <input
                  type="text"
                  value={termoEtilometro}
                  onChange={(e) => setTermoEtilometro(e.target.value)}
                  placeholder="Ex: ETIL-01"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Examinador Responsável (SSMA / Saúde) *
                </label>
                <input
                  type="text"
                  value={termoExaminador}
                  onChange={(e) => setTermoExaminador(e.target.value)}
                  placeholder="Nome do examinador..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Cargo / Função do Examinador
                </label>
                <input
                  type="text"
                  value={termoExaminadorCargo}
                  onChange={(e) => setTermoExaminadorCargo(e.target.value)}
                  placeholder="Ex: Técnico de SSMA, Enfermeiro do Trabalho..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Testemunha (Obrigatório em caso de recusa ou positivo)
                </label>
                <input
                  type="text"
                  value={termoTestemunha}
                  onChange={(e) => setTermoTestemunha(e.target.value)}
                  placeholder="Ex: Nome da testemunha ou fiscal presente..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Observações Gerais do Termo
                </label>
                <textarea
                  rows={2}
                  value={termoObservacoes}
                  onChange={(e) => setTermoObservacoes(e.target.value)}
                  placeholder="Informações adicionais, histórico ou medidas adotadas..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Check de Assinatura Física */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termoAssinadoFisicamente}
                  onChange={(e) => setTermoAssinadoFisicamente(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Termo impresso e assinado fisicamente pelo colaborador (FRM.SOC-0042)
                </span>
              </label>
            </div>
          </ModalBody>

          <ModalFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
            <button
              type="button"
              disabled={salvando}
              onClick={() => setModalTermoAberto(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={imprimindo || salvando}
                onClick={() =>
                  imprimirTermoOficial({
                    ...testeAtivo,
                    resultado: termoResultado,
                    valor_medido: parseFloat(termoValorMedido) || 0,
                    razao_teste: termoRazao,
                    local_teste: termoLocal,
                    examinador_nome: termoExaminador,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {imprimindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5 text-emerald-600" />}
                <span>Imprimir Termo (PDF)</span>
              </button>

              <button
                type="button"
                disabled={salvando}
                onClick={() => salvarTermo(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/30 transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>Salvar Termo & Gravar Resultado</span>
              </button>
            </div>
          </ModalFooter>
        </Modal>
      )}

      {/* MODAL PARA ADICIONAR COLABORADOR EXTRA (FORA DA LISTA DA PORTARIA) */}
      {modalNovoAberto && (
        <Modal
          onClose={() => !salvando && setModalNovoAberto(false)}
          maxWidth="max-w-xl"
          ariaLabel="Adicionar Colaborador / Teste Extra"
        >
          <ModalHeader onClose={() => !salvando && setModalNovoAberto(false)}>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Adicionar Colaborador para Teste de Alcoolemia
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cadastro avulso para teste fora da lista inicial da portaria • Data: {formatarDataBR(dataSelecionada)}
              </p>
            </div>
          </ModalHeader>

          <ModalBody className="max-h-[80vh] overflow-y-auto p-5 space-y-4">
            {/* Escolha do Vínculo */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Tipo de Vínculo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNovoTipoVinculo('TEN');
                    limparSelecaoRh();
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                    novoTipoVinculo === 'TEN'
                      ? 'border-blue-500 bg-blue-50/70 text-blue-700 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  <span>Colaborador TEN (RH Pessoas)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNovoTipoVinculo('PJ');
                    limparSelecaoRh();
                    setNovoEmpresa('');
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                    novoTipoVinculo === 'PJ'
                      ? 'border-amber-500 bg-amber-50/70 text-amber-700 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <Briefcase className="h-4 w-4" />
                  <span>Terceiro / PJ (Digitação Manual)</span>
                </button>
              </div>
            </div>

            {/* TEN: Busca RH */}
            {novoTipoVinculo === 'TEN' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5 dark:border-blue-900/30 dark:bg-blue-950/20">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-900 dark:text-blue-200">
                    Buscar Colaborador no RH Pessoas
                  </label>
                  {novoRhSelecionado && (
                    <button
                      type="button"
                      onClick={limparSelecaoRh}
                      className="text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400"
                    >
                      Trocar Colaborador
                    </button>
                  )}
                </div>

                {!novoRhSelecionado ? (
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                    <input
                      type="text"
                      placeholder="Digite nome ou matrícula do colaborador TEN..."
                      value={novoBuscaRh}
                      onChange={(e) => setNovoBuscaRh(e.target.value)}
                      className="w-full rounded-xl border border-blue-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100"
                    />

                    {rhFiltrados.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                        {rhFiltrados.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selecionarColaboradorRh(p)}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
                          >
                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-100">
                                {p.nome}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {p.registro && <span className="font-mono mr-2">Matr.: {p.registro}</span>}
                                {p.cargo && <span>{p.cargo}</span>}
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                              {p.area || p.subsetor || 'TEN'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-white p-3 border border-blue-200 dark:border-blue-800 dark:bg-slate-900">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {novoNome}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {novoMatricula && <span className="font-mono mr-2">Matr.: {novoMatricula}</span>}
                        {novoCargo && <span className="mr-2">• {novoCargo}</span>}
                        {novoSetor && <span>• {novoSetor}</span>}
                      </div>
                    </div>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* PJ: Digitação manual */}
            {novoTipoVinculo === 'PJ' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nome Completo do Terceiro *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Eduardo de Oliveira"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Empresa Terceirizada *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Manserv, Apoio, LogTen..."
                    value={novoEmpresa}
                    onChange={(e) => setNovoEmpresa(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Documento (CPF ou RG)
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={novoDocumento}
                    onChange={(e) => setNovoDocumento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Função / Cargo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Motorista, Mecânico..."
                    value={novoCargo}
                    onChange={(e) => setNovoCargo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Setor de Atuação
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pátio, Oficina..."
                    value={novoSetor}
                    onChange={(e) => setNovoSetor(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            )}

            {/* Razão do Teste & Horário */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Razão do Teste *
                </label>
                <select
                  value={novoRazao}
                  onChange={(e) => setNovoRazao(e.target.value as PortAlcoolemiaRazao)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="MOTIVADO">Motivado / Suspeita</option>
                  <option value="POS_ACIDENTE">Pós-Acidente</option>
                  <option value="ALEATORIO">Aleatório</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Horário do Teste *
                </label>
                <input
                  type="time"
                  value={novoHorario}
                  onChange={(e) => setNovoHorario(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Turno *
                </label>
                <select
                  value={novoTurno}
                  onChange={(e) => setNovoTurno(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="MANHA">MANHÃ</option>
                  <option value="TARDE">TARDE</option>
                  <option value="NOITE">NOITE</option>
                </select>
              </div>
            </div>
          </ModalBody>

          <ModalFooter className="flex items-center justify-between border-t border-slate-200 p-4 dark:border-slate-800">
            <button
              type="button"
              disabled={salvando}
              onClick={() => setModalNovoAberto(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={salvando}
              onClick={salvarNovoExtra}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/30 transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>Adicionar e Abrir Termo</span>
            </button>
          </ModalFooter>
        </Modal>
      )}

      {tour.isOpen && (
        <TourSpotlight
          steps={TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
      {testeParaExcluir && (
        <ConfirmDialog
          titulo="Excluir teste de alcoolemia"
          mensagem={`Excluir ${testeParaExcluir.codigo_formulario} (${testeParaExcluir.nome})? Ele sai da lista, das contagens e do livro, mas fica guardado no filtro Excluídos e pode ser restaurado.`}
          confirmarLabel="Excluir teste"
          variante="perigo"
          confirmando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setTesteParaExcluir(null)}
        />
      )}
      {pdfPreview && (
        <PdfPreviewModal
          gerar={pdfPreview.gerar}
          tituloPadrao={pdfPreview.titulo}
          onClose={() => setPdfPreview(null)}
        />
      )}
    </div>
  );
}
