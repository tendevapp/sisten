/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Teste de Alcoolemia" (FRM.SGP-0015).
 * Registro diário de pessoas sorteadas para teste com etilômetro/bafômetro:
 * - Cadastro inicial rápido do sorteado (colaborador TEN via RH Pessoas ou PJ digitado);
 * - Opção de registrar aferição imediata na portaria (motoristas de ônibus/carretas);
 * - Botão dedicado na tabela do livro diário para registrar a aferição posteriormente;
 * - Geração sequencial oficial ALC-DDMMYY-INDICE;
 * - Exportação de relatório diário assinado em PDF.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Search, Plus, Calendar, Clock, Filter,
  FileDown, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Clock3, Shield, User, Building2, Briefcase, Trash2, Edit2,
  Check, X, ChevronLeft, ChevronRight, AlertCircle, Loader2,
  HelpCircle, Bug, Lightbulb, UserCheck, UserPlus, Gauge, RotateCcw
} from 'lucide-react';
import type { Profile, PortAlcoolemiaTeste, PortAlcoolemiaResultado, PortAlcoolemiaVinculo, RhPessoa } from '../../types';
import * as api from '../../lib/portariaApi';
import { listarRhPessoas } from '../../lib/rhApi';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import PdfPreviewModal from '../../components/ui/PdfPreviewModal';
import type { PdfGerado } from '../../lib/pdfExport/core';
import { gerarAlcoolemiaPeriodoPdf } from '../../lib/pdfExport/exportPortariaPdf';
import {
  agruparPorData, intervaloDoPeriodo, navegarPeriodo, rotuloDia, rotuloPeriodo, somarDias, testeCombinaBusca,
  type Intervalo, type ModoPeriodo,
} from '../../lib/alcoolemiaPeriodo';
import {
  BotaoCartao, BuscaColaborador, CartaoTeste, ExportarLivroModal, FiltrosResultado, ListaVazia, SeletorPeriodo,
  SeloExcluido, SeloQuemAferiu, SeloResultado, type FiltroResultado,
} from '../../components/ssma/AlcoolemiaPainel';
import VigilanteOperadorAtual from '../../components/portaria/VigilanteOperadorAtual';
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
    icon: Shield,
    title: 'Teste de Alcoolemia (FRM.SGP-0015)',
    description:
      'Controle oficial de aferição de alcoolemia por sorteio diário na portaria da TEN, com colaboradores e prestadores de serviço.',
  },
  {
    target: 'alc-date-nav',
    icon: Calendar,
    title: 'Dia, semana, mês ou período',
    description:
      'Escolha o que o livro mostra: o dia (com as setas), a semana, o mês ou um período com data inicial e final.',
  },
  {
    target: 'alc-kpis',
    icon: CheckCircle2,
    title: 'Busca e resultado',
    description:
      'Digite o nome ou a matrícula de quem chegou para achar o sorteado na hora. Os botões mostram quantos estão aguardando, aptos, positivos e recusas — toque para filtrar. O resultado pode ser registrado aqui ou no SSMA.',
  },
  {
    target: 'alc-novo-btn',
    icon: Plus,
    title: 'Adicionar Sorteado ao Livro',
    description:
      'Adicione novos sorteados pesquisando no banco de pessoas do RH ou digitando PJs. Se for motorista, registre a aferição no ato!',
  },
  {
    target: 'alc-export-btn',
    icon: FileDown,
    title: 'Exportar livro em PDF',
    description:
      'Escolha o dia, a semana, o mês ou um período e gere a folha oficial com os sorteados e espaços para assinatura do vigilante e da segurança.',
  },
  {
    target: 'help-button',
    icon: HelpCircle,
    title: 'Ajuda e Suporte',
    description:
      'Acesse orientações, reporte inconsistências ou envie sugestões de melhoria a qualquer momento.',
  },
];

function formatarDataBR(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function PortariaAlcoolemia({ user, onNavigate }: Props) {
  const tour = usePageTour('portaria-alcoolemia', TOUR_STEPS.length);
  const toast = useToast();

  // Período e filtros. `dataSelecionada` é a referência do Dia/Semana/Mês;
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
  // Sorteado novo entra no dia exibido; vendo semana/mês/período, entra hoje.
  const dataNovoRegistro = modoPeriodo === 'dia' ? dataSelecionada : hoje;
  const [filtroTurno, setFiltroTurno] = useState<string>('TODOS');
  const [filtroResultado, setFiltroResultado] = useState<FiltroResultado>('TODOS');
  const [exportarAberto, setExportarAberto] = useState<boolean>(false);
  const [exportando, setExportando] = useState<boolean>(false);
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // Dados
  const [testes, setTestes] = useState<PortAlcoolemiaTeste[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [colaboradoresRh, setColaboradoresRh] = useState<RhPessoa[]>([]);

  // Modais
  const [modalAberto, setModalAberto] = useState<boolean>(false);
  const [pdfPreview, setPdfPreview] = useState<{ gerar: () => Promise<PdfGerado>; titulo?: string } | null>(null);
  const [editandoTeste, setEditandoTeste] = useState<PortAlcoolemiaTeste | null>(null);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [testeParaExcluir, setTesteParaExcluir] = useState<PortAlcoolemiaTeste | null>(null);
  const [excluindo, setExcluindo] = useState<boolean>(false);

  // Formulário do Modal de Sorteado
  const [tipoVinculo, setTipoVinculo] = useState<PortAlcoolemiaVinculo>('TEN');
  const [buscaRh, setBuscaRh] = useState<string>('');
  const [rhSelecionado, setRhSelecionado] = useState<RhPessoa | null>(null);

  // Campos do Sorteado
  const [formHorario, setFormHorario] = useState<string>(api.horaAgora());
  const [formTurno, setFormTurno] = useState<string>(api.sugerirTurno());
  const [formNome, setFormNome] = useState<string>('');
  const [formMatricula, setFormMatricula] = useState<string>('');
  const [formEmpresa, setFormEmpresa] = useState<string>('TEN');
  const [formCargo, setFormCargo] = useState<string>('');
  const [formSetor, setFormSetor] = useState<string>('');
  const [formDocumento, setFormDocumento] = useState<string>('');

  // Opção de Aferição Imediata no Cadastro
  const [registrarAfericaoImediata, setRegistrarAfericaoImediata] = useState<boolean>(false);
  const [formResultado, setFormResultado] = useState<PortAlcoolemiaResultado>('PENDENTE');
  const [formValorMedido, setFormValorMedido] = useState<string>('0.00');
  const [formEtilometro, setFormEtilometro] = useState<string>('ETIL-01');
  const [formVigilante, setFormVigilante] = useState<string>(user.name || '');
  const [formTestemunha, setFormTestemunha] = useState<string>('');
  const [formObservacoes, setFormObservacoes] = useState<string>('');

  // Modal Dedicado de Aferição (ao clicar no botão da tabela)
  const [modalAfericaoAberto, setModalAfericaoAberto] = useState<boolean>(false);
  const [testeParaAferir, setTesteParaAferir] = useState<PortAlcoolemiaTeste | null>(null);
  const [afericaoHorario, setAfericaoHorario] = useState<string>(api.horaAgora());
  const [afericaoEtilometro, setAfericaoEtilometro] = useState<string>('ETIL-01');
  const [afericaoResultado, setAfericaoResultado] = useState<PortAlcoolemiaResultado>('NEGATIVO');
  const [afericaoValorMedido, setAfericaoValorMedido] = useState<string>('0.00');
  const [afericaoVigilante, setAfericaoVigilante] = useState<string>(user.name || '');
  const [afericaoTestemunha, setAfericaoTestemunha] = useState<string>('');
  const [afericaoObservacoes, setAfericaoObservacoes] = useState<string>('');
  const [salvandoAfericao, setSalvandoAfericao] = useState<boolean>(false);

  // Valores já digitados antes, por campo — vira opção de preenchimento
  // rápido (datalist) em vez de redigitar o mesmo texto toda hora.
  const [historico, setHistorico] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const tabela = 'port_alcoolemia_testes';
    const campos = ['nome', 'empresa', 'documento', 'cargo_funcao', 'setor_area', 'etilometro_codigo', 'testemunha', 'observacoes'];
    Promise.all(campos.map((c) => api.buscarHistoricoCampoPortaria(tabela, c).then((v) => [c, v] as const)))
      .then((pares) => setHistorico(Object.fromEntries(pares)))
      .catch(() => {});
  }, []);

  // Carregar RH Pessoas uma vez
  useEffect(() => {
    listarRhPessoas()
      .then((res) => setColaboradoresRh(res || []))
      .catch((err) => console.error('Erro ao carregar RH Pessoas:', err));
  }, []);

  // Carregar testes do período exibido
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
      console.error('Erro ao listar testes:', err);
      toast.error('Não foi possível carregar o livro. Confira a conexão e toque em atualizar.');
    } finally {
      setCarregando(false);
    }
  }, [intervalo.inicio, intervalo.fim, toast]);

  useEffect(() => {
    carregarTestes();
  }, [carregarTestes]);

  // Autocomplete do RH
  const rhFiltrados = useMemo(() => {
    if (!buscaRh.trim() || tipoVinculo !== 'TEN') return [];
    const t = buscaRh.trim().toUpperCase();
    return colaboradoresRh
      .filter((p) => {
        const nome = (p.nome || '').toUpperCase();
        const reg = (p.registro || '').toUpperCase();
        const cargo = (p.cargo || '').toUpperCase();
        return nome.includes(t) || reg.includes(t) || cargo.includes(t);
      })
      .slice(0, 8);
  }, [buscaRh, colaboradoresRh, tipoVinculo]);

  const selecionarColaboradorRh = (p: RhPessoa) => {
    setRhSelecionado(p);
    setFormNome(p.nome);
    setFormMatricula(p.registro || '');
    setFormEmpresa('TEN');
    setFormCargo(p.cargo || '');
    setFormSetor(p.area || p.subsetor || '');
    setBuscaRh('');
  };

  const limparSelecaoRh = () => {
    setRhSelecionado(null);
    setFormNome('');
    setFormMatricula('');
    setFormEmpresa('TEN');
    setFormCargo('');
    setFormSetor('');
    setBuscaRh('');
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

  // Contagens do período no turno escolhido (antes da busca e do filtro de
  // resultado, para os números não mudarem ao digitar)
  const vigentes = useMemo(() => testes.filter((t) => !t.excluido_em), [testes]);
  const doTurnoTodos = useMemo(
    () => (filtroTurno === 'TODOS' ? testes : testes.filter((t) => t.turno === filtroTurno)),
    [testes, filtroTurno],
  );
  const doTurno = useMemo(() => doTurnoTodos.filter((t) => !t.excluido_em), [doTurnoTodos]);
  const excluidosDoTurno = useMemo(() => doTurnoTodos.filter((t) => !!t.excluido_em), [doTurnoTodos]);
  const metricas = useMemo(() => api.calcularMetricasAlcoolemia(doTurno), [doTurno]);

  // Filtros aplicados na lista
  const testesFiltrados = useMemo(() => {
    if (filtroResultado === 'EXCLUIDOS') return excluidosDoTurno.filter((t) => testeCombinaBusca(t, buscaTexto));
    return doTurno.filter((t) => {
      if (filtroResultado !== 'TODOS' && t.resultado !== filtroResultado) return false;
      return testeCombinaBusca(t, buscaTexto);
    });
  }, [doTurno, excluidosDoTurno, filtroResultado, buscaTexto]);
  const gruposPorDia = useMemo(() => agruparPorData(testesFiltrados), [testesFiltrados]);

  // Abertura do Modal de Cadastro Inicial (Apenas Sorteado por padrão).
  // Vindo da busca sem resultado, já procura o nome digitado no RH.
  const abrirModalNovo = (buscaInicial = '') => {
    setEditandoTeste(null);
    setTipoVinculo('TEN');
    setRhSelecionado(null);
    setBuscaRh(buscaInicial);
    setFormHorario(api.horaAgora());
    setFormTurno(api.sugerirTurno());
    setFormNome('');
    setFormMatricula('');
    setFormEmpresa('TEN');
    setFormCargo('');
    setFormSetor('');
    setFormDocumento('');
    setRegistrarAfericaoImediata(false);
    setFormResultado('PENDENTE');
    setFormValorMedido('0.00');
    setFormEtilometro('ETIL-01');
    setFormVigilante(user.name || '');
    setFormTestemunha('');
    setFormObservacoes('');
    setModalAberto(true);
  };

  const abrirModalEdicao = (teste: PortAlcoolemiaTeste) => {
    setEditandoTeste(teste);
    setTipoVinculo(teste.tipo_vinculo);
    setRhSelecionado(null);
    setBuscaRh('');
    setFormHorario(teste.horario);
    setFormTurno(teste.turno);
    setFormNome(teste.nome);
    setFormMatricula(teste.matricula || '');
    setFormEmpresa(teste.empresa);
    setFormCargo(teste.cargo_funcao || '');
    setFormSetor(teste.setor_area || '');
    setFormDocumento(teste.documento || '');

    const temAfericao = teste.resultado !== 'PENDENTE';
    setRegistrarAfericaoImediata(temAfericao);
    setFormResultado(teste.resultado);
    setFormValorMedido(String(teste.valor_medido ?? '0.00'));
    setFormEtilometro(teste.etilometro_codigo || 'ETIL-01');
    setFormVigilante(teste.vigilante || user.name || '');
    setFormTestemunha(teste.testemunha || '');
    setFormObservacoes(teste.observacoes || '');
    setModalAberto(true);
  };

  // Modal Dedicado de Aferição
  const abrirModalAfericao = (teste: PortAlcoolemiaTeste) => {
    setTesteParaAferir(teste);
    setAfericaoHorario(api.horaAgora());
    setAfericaoEtilometro(teste.etilometro_codigo || 'ETIL-01');
    setAfericaoResultado(teste.resultado === 'PENDENTE' ? 'NEGATIVO' : teste.resultado);
    setAfericaoValorMedido(String(teste.valor_medido ?? '0.00'));
    setAfericaoVigilante(teste.vigilante || user.name || '');
    setAfericaoTestemunha(teste.testemunha || '');
    setAfericaoObservacoes(teste.observacoes || '');
    setModalAfericaoAberto(true);
  };

  // Gravação da Aferição
  const salvarAfericao = async () => {
    if (!testeParaAferir) return;
    setSalvandoAfericao(true);
    try {
      const valorNum = parseFloat(afericaoValorMedido.replace(',', '.')) || 0;
      await api.atualizarTesteAlcoolemia(testeParaAferir.id, {
        resultado: afericaoResultado,
        valor_medido: afericaoResultado === 'POSITIVO' ? valorNum : 0.0,
        etilometro_codigo: afericaoEtilometro.trim() || null,
        vigilante: afericaoVigilante.trim() || null,
        testemunha: afericaoTestemunha.trim() || null,
        observacoes: afericaoObservacoes.trim() || null,
        horario: afericaoHorario,
      });

      toast.success(`Aferição registrada com sucesso para ${testeParaAferir.nome}!`);
      setModalAfericaoAberto(false);
      setTesteParaAferir(null);
      await carregarTestes();
    } catch (err: any) {
      console.error('Erro ao salvar aferição:', err);
      toast.error('Erro ao registrar aferição: ' + err.message);
    } finally {
      setSalvandoAfericao(false);
    }
  };

  // Salvar registro de sorteado
  const salvarRegistro = async (adicionarOutro: boolean = false) => {
    if (!formNome.trim()) {
      toast.warning('Informe o nome do sorteado.');
      return;
    }
    if (tipoVinculo === 'PJ' && !formEmpresa.trim()) {
      toast.warning('Informe a empresa do terceiro / PJ.');
      return;
    }

    setSalvando(true);
    try {
      const valorNum = parseFloat(formValorMedido.replace(',', '.')) || 0;
      const resultadoFinal = registrarAfericaoImediata
        ? formResultado
        : (editandoTeste ? editandoTeste.resultado : 'PENDENTE');

      const payload: Partial<PortAlcoolemiaTeste> = {
        data: editandoTeste ? editandoTeste.data : dataNovoRegistro,
        horario: formHorario,
        turno: formTurno,
        tipo_vinculo: tipoVinculo,
        pessoa_id: rhSelecionado?.id || editandoTeste?.pessoa_id || null,
        matricula: tipoVinculo === 'TEN' ? formMatricula.trim() || null : null,
        nome: formNome.trim(),
        empresa: tipoVinculo === 'TEN' ? 'TEN' : formEmpresa.trim(),
        cargo_funcao: formCargo.trim() || null,
        setor_area: formSetor.trim() || null,
        documento: tipoVinculo === 'PJ' ? formDocumento.trim() || null : null,
        resultado: resultadoFinal,
        valor_medido: registrarAfericaoImediata && formResultado === 'POSITIVO' ? valorNum : 0.0,
        etilometro_codigo: registrarAfericaoImediata ? formEtilometro.trim() || null : null,
        vigilante: registrarAfericaoImediata ? formVigilante.trim() || null : null,
        testemunha: registrarAfericaoImediata ? formTestemunha.trim() || null : null,
        observacoes: formObservacoes.trim() || null,
        criado_por: user.id,
        criado_por_nome: user.name,
      };

      if (editandoTeste) {
        await api.atualizarTesteAlcoolemia(editandoTeste.id, payload);
        toast.success(`Registro ${editandoTeste.codigo_formulario} atualizado com sucesso!`);
      } else {
        const criado = await api.criarTesteAlcoolemia(payload);
        toast.success(`Sorteado inserido no livro: ${criado.codigo_formulario}`);
      }

      await carregarTestes();

      if (adicionarOutro) {
        setEditandoTeste(null);
        setRhSelecionado(null);
        setBuscaRh('');
        setFormNome('');
        setFormMatricula('');
        setFormCargo('');
        setFormSetor('');
        setFormDocumento('');
        setFormHorario(api.horaAgora());
        setFormResultado('PENDENTE');
        setFormValorMedido('0.00');
        setRegistrarAfericaoImediata(false);
        if (tipoVinculo === 'PJ') {
          setFormEmpresa('');
        }
      } else {
        setModalAberto(false);
      }
    } catch (err: any) {
      console.error('Erro ao salvar teste de alcoolemia:', err);
      toast.error('Erro ao salvar registro de alcoolemia: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  // Troca rápida de resultado na tabela
  const atualizarResultadoRapido = async (teste: PortAlcoolemiaTeste, novoResultado: PortAlcoolemiaResultado) => {
    try {
      await api.atualizarTesteAlcoolemia(teste.id, {
        resultado: novoResultado,
        valor_medido: novoResultado === 'NEGATIVO' ? 0.0 : teste.valor_medido,
      });
      setTestes((prev) =>
        prev.map((item) =>
          item.id === teste.id ? { ...item, resultado: novoResultado } : item
        )
      );
      toast.success(`Resultado alterado para ${novoResultado}`);
    } catch (err: any) {
      console.error('Erro ao alterar resultado:', err);
      toast.error('Não foi possível alterar o resultado.');
    }
  };

  // Volta um teste excluído para o livro
  const restaurarTeste = async (teste: PortAlcoolemiaTeste) => {
    try {
      await api.restaurarTesteAlcoolemia(teste.id);
      toast.success(`${teste.codigo_formulario} voltou para o livro.`);
      await carregarTestes();
    } catch (err: any) {
      toast.error('Não foi possível restaurar: ' + (err?.message || err));
    }
  };

  // Exclusão com confirmação
  const confirmarExclusao = async () => {
    if (!testeParaExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirTesteAlcoolemia(testeParaExcluir.id, user.id);
      toast.success(`${testeParaExcluir.codigo_formulario} excluído. Fica no filtro Excluídos.`);
      setTesteParaExcluir(null);
      await carregarTestes();
    } catch (err: any) {
      console.error('Erro ao excluir teste:', err);
      toast.error('Erro ao excluir registro.');
    } finally {
      setExcluindo(false);
    }
  };

  // Livro em PDF do período escolhido na exportação. Se for o que já está na
  // tela, usa a lista carregada.
  const gerarLivro = async (iv: Intervalo) => {
    setExportando(true);
    try {
      const lista = iv.inicio === intervalo.inicio && iv.fim === intervalo.fim
        ? vigentes
        : await api.listarTestesAlcoolemia({ dataInicio: iv.inicio, dataFim: iv.fim });
      if (lista.length === 0) {
        toast.warning('Nenhum sorteado nesse período para exportar.');
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

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-16 sm:space-y-5">
      {tour.isOpen && (
        <TourSpotlight
          steps={TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}

      {/* Cabeçalho */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios/portaria')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:border-rose-300 hover:text-rose-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-rose-700 dark:hover:text-rose-300"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          <span>Portaria</span>
        </button>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white sm:flex">
              <Shield className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">
                Teste de alcoolemia
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="font-mono font-bold text-rose-700 dark:text-rose-400">FRM.SGP-0015</span>
                <span className="ml-2 hidden sm:inline">Livro de sorteados e aferição com etilômetro</span>
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-[1fr_auto] gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              data-tour="alc-novo-btn"
              onClick={() => abrirModalNovo()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white transition-colors hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            >
              <UserPlus className="h-4 w-4" />
              <span>Registrar sorteado</span>
            </button>
            <button
              type="button"
              data-tour="alc-export-btn"
              onClick={() => setExportarAberto(true)}
              aria-label="Exportar livro em PDF"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <FileDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <span className="hidden sm:inline">Exportar livro</span>
            </button>
          </div>
        </div>
      </div>

      {/* Período */}
      <section
        data-tour="alc-date-nav"
        aria-label="Período exibido"
        className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:max-w-xl"
      >
        <SeletorPeriodo
          tom="portaria"
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
              tom="portaria"
              valor={buscaTexto}
              onChange={setBuscaTexto}
              encontrados={testesFiltrados.length}
              total={doTurno.length}
            />
          </div>
          <button
            type="button"
            onClick={carregarTestes}
            aria-label="Atualizar livro"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <RefreshCw className={`h-5 w-5 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div data-tour="alc-kpis" className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <FiltrosResultado valor={filtroResultado} onChange={setFiltroResultado} metricas={metricas} excluidos={excluidosDoTurno.length} />
          </div>
          <select
            value={filtroTurno}
            onChange={(e) => setFiltroTurno(e.target.value)}
            aria-label="Turno"
            className="h-10 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-rose-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="TODOS">Turnos</option>
            <option value="MANHA">Manhã</option>
            <option value="TARDE">Tarde</option>
            <option value="NOITE">Noite</option>
          </select>
        </div>
      </div>

      {/* Livro */}
      <div>
        {carregando && testes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-rose-600" />
            <span className="mt-3 text-sm font-medium">Carregando livro…</span>
          </div>
        ) : testesFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <ListaVazia
              tom="portaria"
              busca={buscaTexto}
              rotulo={umDia ? rotuloIntervalo.replace(/^Hoje, /, 'hoje, ') : rotuloIntervalo}
              onAdicionar={() => abrirModalNovo(buscaTexto.trim())}
              rotuloAdicionar="Registrar sorteado"
              dicaVazia="Comece o livro registrando os colaboradores e terceiros sorteados. Motorista no posto pode ter a aferição registrada na hora."
              dicaBusca="Se a pessoa foi sorteada e ainda não está no livro, registre por aqui."
            />
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
                      <span className="text-xs font-medium text-slate-500">{g.itens.length} {g.itens.length === 1 ? 'sorteado' : 'sorteados'}</span>
                    </h2>
                  )}
                  <div className="space-y-3">
                    {g.itens.map((item) => {
                      const podeEditar = podeEditarFormulario(user, item);
                      const isPendente = item.resultado === 'PENDENTE';
                      return (
                        <CartaoTeste
                          key={item.id}
                          tom="portaria"
                          teste={item}
                          principal={
                            !podeEditar
                              ? null
                              : item.excluido_em
                                ? { rotulo: 'Restaurar', icone: RotateCcw, onClick: () => void restaurarTeste(item), destaque: false }
                              : isPendente
                                ? { rotulo: 'Registrar aferição', icone: Gauge, onClick: () => abrirModalAfericao(item), destaque: true }
                                : { rotulo: 'Editar', icone: Edit2, onClick: () => abrirModalEdicao(item), destaque: false }
                          }
                          acoes={podeEditar && !item.excluido_em && (
                            <>
                              {isPendente && (
                                <>
                                  <BotaoCartao rotulo="Marcar apto (0,00 mg/L)" icone={Check} tom="sucesso" onClick={() => atualizarResultadoRapido(item, 'NEGATIVO')} />
                                  <BotaoCartao rotulo="Editar dados" icone={Edit2} onClick={() => abrirModalEdicao(item)} />
                                </>
                              )}
                              <BotaoCartao rotulo="Excluir registro" icone={Trash2} tom="perigo" onClick={() => setTesteParaExcluir(item)} />
                            </>
                          )}
                          rodape={<SeloQuemAferiu teste={item} />}
                        />
                      );
                    })}
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
                    <th className="px-4 py-3">Sorteado</th>
                    <th className="px-4 py-3">Empresa e setor</th>
                    <th className="px-4 py-3">Resultado</th>
                    <th className="px-4 py-3">Aferição</th>
                    <th className="px-4 py-3 text-right"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {testesFiltrados.map((item) => {
                    const podeEditar = podeEditarFormulario(user, item);
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
                            {item.cargo_funcao && <span className="ml-2">{item.cargo_funcao.toLowerCase()}</span>}
                            <span className="ml-2 font-mono text-slate-400">{item.codigo_formulario}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                            {item.tipo_vinculo === 'TEN'
                              ? <Building2 className="h-3.5 w-3.5 text-blue-500" />
                              : <Briefcase className="h-3.5 w-3.5 text-amber-500" />}
                            {item.empresa || 'TEN'}
                          </div>
                          <div className="text-xs text-slate-500">{item.setor_area || '-'}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex flex-col items-start gap-1"><SeloResultado teste={item} /><SeloExcluido teste={item} /></div>
                        </td>
                        <td className="px-4 py-3"><SeloQuemAferiu teste={item} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {podeEditar && item.excluido_em ? (
                            <button
                              type="button"
                              onClick={() => void restaurarTeste(item)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <RotateCcw className="h-4 w-4" /> Restaurar
                            </button>
                          ) : podeEditar && (
                            <div className="flex items-center justify-end gap-1.5">
                              {isPendente && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => abrirModalAfericao(item)}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-sm font-bold text-white hover:bg-rose-700"
                                  >
                                    <Gauge className="h-4 w-4" /> Registrar aferição
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => atualizarResultadoRapido(item, 'NEGATIVO')}
                                    title="Marcar apto (0,00 mg/L)"
                                    aria-label={`Marcar ${item.nome} como apto`}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => abrirModalEdicao(item)}
                                title="Editar dados"
                                aria-label={`Editar ${item.nome}`}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTesteParaExcluir(item)}
                                title="Excluir registro"
                                aria-label={`Excluir ${item.nome}`}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
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
          tom="portaria"
          modoAtual={modoPeriodo}
          intervaloAtual={intervalo}
          hoje={hoje}
          gerando={exportando}
          onCancelar={() => setExportarAberto(false)}
          onGerar={(iv) => void gerarLivro(iv)}
        />
      )}

      {/* MODAL 1: REGISTRAR SORTEADO NO LIVRO DO DIA */}
      {modalAberto && (
        <Modal
          onClose={() => !salvando && setModalAberto(false)}
          maxWidth="max-w-2xl"
          ariaLabel={editandoTeste ? 'Editar Sorteado' : 'Registrar Sorteado'}
        >
          <ModalHeader onClose={() => !salvando && setModalAberto(false)}>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                {editandoTeste ? `Editar Registro — ${editandoTeste.codigo_formulario}` : 'Registrar Sorteado no Livro do Dia'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Formulário FRM.SGP-0015 • Data do livro: {formatarDataBR(editandoTeste ? editandoTeste.data : dataNovoRegistro)}
              </p>
            </div>
          </ModalHeader>

          <ModalBody className="max-h-[80vh] overflow-y-auto p-5 space-y-4">
            {/* Escolha do Tipo de Vínculo */}
            {!editandoTeste && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tipo de Vínculo do Sorteado
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTipoVinculo('TEN');
                      limparSelecaoRh();
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                      tipoVinculo === 'TEN'
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
                      setTipoVinculo('PJ');
                      limparSelecaoRh();
                      setFormEmpresa('');
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                      tipoVinculo === 'PJ'
                        ? 'border-amber-500 bg-amber-50/70 text-amber-700 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    <Briefcase className="h-4 w-4" />
                    <span>Terceiro / PJ (Digitação Manual)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Seção TEN: Pesquisa no RH Pessoas */}
            {tipoVinculo === 'TEN' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5 dark:border-blue-900/30 dark:bg-blue-950/20">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-900 dark:text-blue-200">
                    Buscar Colaborador no RH Pessoas
                  </label>
                  {rhSelecionado && (
                    <button
                      type="button"
                      onClick={limparSelecaoRh}
                      className="text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400"
                    >
                      Trocar Colaborador
                    </button>
                  )}
                </div>

                {!rhSelecionado ? (
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                    <input
                      type="text"
                      placeholder="Digite nome ou matrícula do colaborador TEN..."
                      value={buscaRh}
                      onChange={(e) => setBuscaRh(e.target.value)}
                      className="w-full rounded-xl border border-blue-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100"
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
                        {formNome}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formMatricula && <span className="font-mono mr-2">Matrícula: {formMatricula}</span>}
                        {formCargo && <span className="mr-2">• {formCargo}</span>}
                        {formSetor && <span>• {formSetor}</span>}
                      </div>
                    </div>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Seção Terceiro / PJ (digitação manual) */}
            {tipoVinculo === 'PJ' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nome Completo do Terceiro / Prestador *
                  </label>
                  <input
                    type="text"
                    required
                    list="lista-alc-nome"
                    placeholder="Ex: Carlos Eduardo de Oliveira"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <datalist id="lista-alc-nome">
                    {(historico.nome || []).map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Empresa Terceirizada / Contratada *
                  </label>
                  <input
                    type="text"
                    required
                    list="lista-alc-empresa"
                    placeholder="Ex: Manserv, Apoio, LogTen, Expresso..."
                    value={formEmpresa}
                    onChange={(e) => setFormEmpresa(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <datalist id="lista-alc-empresa">
                    {(historico.empresa || []).map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Documento (CPF ou RG)
                  </label>
                  <input
                    type="text"
                    list="lista-alc-documento"
                    placeholder="Ex: 000.000.000-00"
                    value={formDocumento}
                    onChange={(e) => setFormDocumento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <datalist id="lista-alc-documento">
                    {(historico.documento || []).map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Função / Cargo (ex: Motorista Ônibus / Carreta)
                  </label>
                  <input
                    type="text"
                    list="lista-alc-cargo_funcao"
                    placeholder="Ex: Motorista Carreta, Motorista Ônibus, Eletricista..."
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <datalist id="lista-alc-cargo_funcao">
                    {(historico.cargo_funcao || []).map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Setor / Área de Acesso
                  </label>
                  <input
                    type="text"
                    list="lista-alc-setor_area"
                    placeholder="Ex: Pátio, Portaria, Logística..."
                    value={formSetor}
                    onChange={(e) => setFormSetor(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <datalist id="lista-alc-setor_area">
                    {(historico.setor_area || []).map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>
              </div>
            )}

            {/* Horário do Sorteio e Turno */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Horário do Registro / Sorteio *
                </label>
                <input
                  type="time"
                  value={formHorario}
                  onChange={(e) => setFormHorario(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Turno *
                </label>
                <select
                  value={formTurno}
                  onChange={(e) => setFormTurno(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="MANHA">MANHÃ</option>
                  <option value="TARDE">TARDE</option>
                  <option value="NOITE">NOITE</option>
                </select>
              </div>
            </div>

            {/* CARD DE OPÇÃO: REGISTRAR AFERIÇÃO NA PORTARIA (MOTORISTAS DE ÔNIBUS/CARRETAS) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 transition-all dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      registrarAfericaoImediata
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Gauge className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Registrar aferição agora na portaria?
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ative se o teste for feito no momento na portaria (ex: motoristas de ônibus ou carretas).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const prox = !registrarAfericaoImediata;
                    setRegistrarAfericaoImediata(prox);
                    if (prox) {
                      setFormResultado('NEGATIVO');
                    } else {
                      setFormResultado('PENDENTE');
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    registrarAfericaoImediata ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      registrarAfericaoImediata ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* CAMPOS EXPANDIDOS QUANDO AFERIÇÃO IMEDIATA ESTÁ ATIVA */}
              {registrarAfericaoImediata && (
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Código do Etilômetro
                      </label>
                      <input
                        type="text"
                        list="lista-alc-etilometro_codigo"
                        placeholder="Ex: ETIL-01"
                        value={formEtilometro}
                        onChange={(e) => setFormEtilometro(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <datalist id="lista-alc-etilometro_codigo">
                        {(historico.etilometro_codigo || []).map((v) => <option key={v} value={v} />)}
                      </datalist>
                    </div>

                    <div>
                      <VigilanteOperadorAtual nome={formVigilante} label="Vigilante Operador do Teste" />
                    </div>
                  </div>

                  {/* Resultado do Teste */}
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Resultado do Teste de Alcoolemia *
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {/* NEGATIVO */}
                      <button
                        type="button"
                        onClick={() => {
                          setFormResultado('NEGATIVO');
                          setFormValorMedido('0.00');
                        }}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                          formResultado === 'NEGATIVO'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="mt-1 text-xs font-bold">NEGATIVO</span>
                        <span className="text-[10px] text-emerald-600/80">Apto (0,00)</span>
                      </button>

                      {/* POSITIVO */}
                      <button
                        type="button"
                        onClick={() => setFormResultado('POSITIVO')}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                          formResultado === 'POSITIVO'
                            ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20 dark:border-rose-500 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                        }`}
                      >
                        <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        <span className="mt-1 text-xs font-bold">POSITIVO</span>
                        <span className="text-[10px] text-rose-600/80">&gt; 0,00 mg/L</span>
                      </button>

                      {/* RECUSA */}
                      <button
                        type="button"
                        onClick={() => {
                          setFormResultado('RECUSA');
                          setFormValorMedido('0.00');
                        }}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                          formResultado === 'RECUSA'
                            ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                        }`}
                      >
                        <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="mt-1 text-xs font-bold">RECUSA</span>
                        <span className="text-[10px] text-amber-600/80">Recusou teste</span>
                      </button>
                    </div>
                  </div>

                  {/* Valor medido se positivo */}
                  {formResultado === 'POSITIVO' && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
                      <label className="block text-xs font-bold text-rose-900 dark:text-rose-200">
                        Valor Medido no Etilômetro (mg/L) *
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="5.00"
                          value={formValorMedido}
                          onChange={(e) => setFormValorMedido(e.target.value)}
                          className="w-36 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-mono text-sm font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-100"
                        />
                        <span className="text-xs font-bold text-rose-800 dark:text-rose-300">mg/L</span>
                      </div>
                    </div>
                  )}

                  {/* Testemunha */}
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Testemunha (opcional ou se recusa/positivo)
                    </label>
                    <input
                      type="text"
                      list="lista-alc-testemunha"
                      placeholder="Ex: Nome da testemunha ou fiscal"
                      value={formTestemunha}
                      onChange={(e) => setFormTestemunha(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <datalist id="lista-alc-testemunha">
                      {(historico.testemunha || []).map((v) => <option key={v} value={v} />)}
                    </datalist>
                  </div>

                  {/* Observações */}
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Observações da Aferição
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Procedimento adotado, motivo do teste imediato, etc..."
                      value={formObservacoes}
                      onChange={(e) => setFormObservacoes(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}
            </div>
          </ModalBody>

          <ModalFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
            <button
              type="button"
              disabled={salvando}
              onClick={() => setModalAberto(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>

            <div className="flex items-center gap-2">
              {!editandoTeste && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => salvarRegistro(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Salvar e Adicionar Outro</span>
                </button>
              )}

              <button
                type="button"
                disabled={salvando}
                onClick={() => salvarRegistro(false)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-rose-600/30 transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>{editandoTeste ? 'Salvar Alterações' : 'Salvar no Livro'}</span>
              </button>
            </div>
          </ModalFooter>
        </Modal>
      )}

      {/* MODAL 2: REGISTRAR AFERIÇÃO DEDICADA (QUANDO O SORTEADO VEM REALIZAR O TESTE) */}
      {modalAfericaoAberto && testeParaAferir && (
        <Modal
          onClose={() => !salvandoAfericao && setModalAfericaoAberto(false)}
          maxWidth="max-w-xl"
          ariaLabel="Registrar Aferição de Alcoolemia"
        >
          <ModalHeader onClose={() => !salvandoAfericao && setModalAfericaoAberto(false)}>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Registrar Aferição de Alcoolemia
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Código: <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{testeParaAferir.codigo_formulario}</span> • Data: {formatarDataBR(testeParaAferir.data)}
              </p>
            </div>
          </ModalHeader>

          <ModalBody className="max-h-[80vh] overflow-y-auto p-5 space-y-4">
            {/* Banner com os dados do sorteado */}
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-3.5 dark:border-rose-900/40 dark:bg-rose-950/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Colaborador Sorteado
                </span>
                <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs dark:bg-slate-800 dark:text-slate-300">
                  {testeParaAferir.tipo_vinculo === 'TEN' ? 'Colaborador TEN' : 'Terceiro / PJ'}
                </span>
              </div>
              <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-slate-100">
                {testeParaAferir.nome}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                {testeParaAferir.matricula && (
                  <span className="font-mono font-semibold">Matrícula: {testeParaAferir.matricula}</span>
                )}
                {testeParaAferir.documento && (
                  <span>Doc: {testeParaAferir.documento}</span>
                )}
                {testeParaAferir.cargo_funcao && (
                  <span>• {testeParaAferir.cargo_funcao}</span>
                )}
                <span>• {testeParaAferir.empresa}</span>
                {testeParaAferir.setor_area && (
                  <span>({testeParaAferir.setor_area})</span>
                )}
              </div>
            </div>

            {/* Horário & Etilômetro */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Horário da Aferição *
                </label>
                <input
                  type="time"
                  value={afericaoHorario}
                  onChange={(e) => setAfericaoHorario(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Código do Etilômetro *
                </label>
                <input
                  type="text"
                  list="lista-alc-etilometro_codigo-afericao"
                  placeholder="Ex: ETIL-01"
                  value={afericaoEtilometro}
                  onChange={(e) => setAfericaoEtilometro(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <datalist id="lista-alc-etilometro_codigo-afericao">
                  {(historico.etilometro_codigo || []).map((v) => <option key={v} value={v} />)}
                </datalist>
              </div>
            </div>

            {/* Resultado do Teste */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Resultado da Aferição *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* NEGATIVO */}
                <button
                  type="button"
                  onClick={() => {
                    setAfericaoResultado('NEGATIVO');
                    setAfericaoValorMedido('0.00');
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                    afericaoResultado === 'NEGATIVO'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="mt-1.5 text-xs font-bold">NEGATIVO</span>
                  <span className="text-[10px] text-emerald-600/80">Apto (0,00 mg/L)</span>
                </button>

                {/* POSITIVO */}
                <button
                  type="button"
                  onClick={() => setAfericaoResultado('POSITIVO')}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                    afericaoResultado === 'POSITIVO'
                      ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20 dark:border-rose-500 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  <span className="mt-1.5 text-xs font-bold">POSITIVO</span>
                  <span className="text-[10px] text-rose-600/80">&gt; 0,00 mg/L</span>
                </button>

                {/* RECUSA */}
                <button
                  type="button"
                  onClick={() => {
                    setAfericaoResultado('RECUSA');
                    setAfericaoValorMedido('0.00');
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                    afericaoResultado === 'RECUSA'
                      ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="mt-1.5 text-xs font-bold">RECUSA</span>
                  <span className="text-[10px] text-amber-600/80">Recusou teste</span>
                </button>
              </div>
            </div>

            {/* Valor Medido se POSITIVO */}
            {afericaoResultado === 'POSITIVO' && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 dark:border-rose-900/50 dark:bg-rose-950/30">
                <label className="block text-xs font-bold text-rose-900 dark:text-rose-200">
                  Valor Medido no Etilômetro (mg/L de ar alveolar) *
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="5.00"
                    value={afericaoValorMedido}
                    onChange={(e) => setAfericaoValorMedido(e.target.value)}
                    className="w-36 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-mono text-sm font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-100"
                  />
                  <span className="text-xs font-bold text-rose-800 dark:text-rose-300">mg/L</span>
                </div>
                <p className="mt-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                  Atenção: Comunique imediatamente o SESMT / SSMA e a chefia imediata do colaborador.
                </p>
              </div>
            )}

            {/* Vigilante & Testemunha */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <VigilanteOperadorAtual nome={afericaoVigilante} label="Vigilante Operador do Teste *" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Testemunha (Obrigatório em recusa/positivo)
                </label>
                <input
                  type="text"
                  list="lista-alc-testemunha-afericao"
                  placeholder="Ex: Nome da testemunha ou fiscal"
                  value={afericaoTestemunha}
                  onChange={(e) => setAfericaoTestemunha(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <datalist id="lista-alc-testemunha-afericao">
                  {(historico.testemunha || []).map((v) => <option key={v} value={v} />)}
                </datalist>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Observações da Aferição
              </label>
              <textarea
                rows={2}
                placeholder="Detalhes da aferição, justificativas ou procedimentos..."
                value={afericaoObservacoes}
                onChange={(e) => setAfericaoObservacoes(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </ModalBody>

          <ModalFooter className="flex items-center justify-between border-t border-slate-200 p-4 dark:border-slate-800">
            <button
              type="button"
              disabled={salvandoAfericao}
              onClick={() => setModalAfericaoAberto(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={salvandoAfericao}
              onClick={salvarAfericao}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-rose-600/30 transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-50"
            >
              {salvandoAfericao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>Gravar Aferição</span>
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Confirmação de Exclusão */}
      {testeParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Registro de Alcoolemia"
          mensagem={`Tem certeza que deseja excluir o teste ${testeParaExcluir.codigo_formulario} (${testeParaExcluir.nome})? O registro será mantido em auditoria.`}
          confirmarLabel="Excluir do Livro"
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
