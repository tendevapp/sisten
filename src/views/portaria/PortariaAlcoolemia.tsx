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
  HelpCircle, Bug, Lightbulb, UserCheck, UserPlus, Gauge
} from 'lucide-react';
import type { Profile, PortAlcoolemiaTeste, PortAlcoolemiaResultado, PortAlcoolemiaVinculo, RhPessoa } from '../../types';
import * as api from '../../lib/portariaApi';
import { listarRhPessoas } from '../../lib/rhApi';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { exportAlcoolemiaDiaPdf } from '../../lib/pdfExport/exportPortariaPdf';
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
    title: 'Navegação por Data e Livro do Dia',
    description:
      'Navegue entre os dias ou selecione uma data específica para visualizar ou preencher o livro diário de sorteados.',
  },
  {
    target: 'alc-kpis',
    icon: CheckCircle2,
    title: 'Indicadores Diários em Tempo Real',
    description:
      'Acompanhe o total de sorteados, aptos (negativos), ocorrências (positivos/recusas) e pendências do dia.',
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
    title: 'Exportar Livro Diário em PDF',
    description:
      'Gere a folha oficial com a relação completa dos sorteados e espaços para assinatura do vigilante e segurança patrimonial.',
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

  // Estados de data e filtros
  const [dataSelecionada, setDataSelecionada] = useState<string>(api.hojeISO());
  const [filtroTurno, setFiltroTurno] = useState<string>('TODOS');
  const [filtroResultado, setFiltroResultado] = useState<string>('TODOS');
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // Dados
  const [testes, setTestes] = useState<PortAlcoolemiaTeste[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [colaboradoresRh, setColaboradoresRh] = useState<RhPessoa[]>([]);

  // Modais
  const [modalAberto, setModalAberto] = useState<boolean>(false);
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

  // Carregar RH Pessoas uma vez
  useEffect(() => {
    listarRhPessoas()
      .then((res) => setColaboradoresRh(res || []))
      .catch((err) => console.error('Erro ao carregar RH Pessoas:', err));
  }, []);

  // Carregar testes da data selecionada
  const carregarTestes = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await api.listarTestesAlcoolemia({ data: dataSelecionada });
      setTestes(lista);
    } catch (err: any) {
      console.error('Erro ao listar testes:', err);
      toast.error('Erro ao carregar livro de alcoolemia do dia.');
    } finally {
      setCarregando(false);
    }
  }, [dataSelecionada, toast]);

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

  // Navegação de datas
  const mudarData = (dias: number) => {
    const d = new Date(dataSelecionada + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDataSelecionada(`${yyyy}-${mm}-${dd}`);
  };

  const irParaHoje = () => {
    setDataSelecionada(api.hojeISO());
  };

  // Métricas do dia calculadas
  const metricas = useMemo(() => {
    return api.calcularMetricasAlcoolemia(testes);
  }, [testes]);

  // Filtros aplicados na tabela
  const testesFiltrados = useMemo(() => {
    return testes.filter((t) => {
      if (filtroTurno !== 'TODOS' && t.turno !== filtroTurno) return false;
      if (filtroResultado !== 'TODOS' && t.resultado !== filtroResultado) return false;
      if (buscaTexto.trim()) {
        const b = buscaTexto.trim().toUpperCase();
        const match =
          t.nome.toUpperCase().includes(b) ||
          (t.matricula && t.matricula.toUpperCase().includes(b)) ||
          t.empresa.toUpperCase().includes(b) ||
          t.codigo_formulario.toUpperCase().includes(b) ||
          (t.cargo_funcao && t.cargo_funcao.toUpperCase().includes(b));
        if (!match) return false;
      }
      return true;
    });
  }, [testes, filtroTurno, filtroResultado, buscaTexto]);

  // Abertura do Modal de Cadastro Inicial (Apenas Sorteado por padrão)
  const abrirModalNovo = () => {
    setEditandoTeste(null);
    setTipoVinculo('TEN');
    setRhSelecionado(null);
    setBuscaRh('');
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
        data: dataSelecionada,
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

  // Exclusão com confirmação
  const confirmarExclusao = async () => {
    if (!testeParaExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirTesteAlcoolemia(testeParaExcluir.id, user.id);
      toast.success(`Registro ${testeParaExcluir.codigo_formulario} excluído.`);
      setTesteParaExcluir(null);
      await carregarTestes();
    } catch (err: any) {
      console.error('Erro ao excluir teste:', err);
      toast.error('Erro ao excluir registro.');
    } finally {
      setExcluindo(false);
    }
  };

  // Exportar PDF oficial
  const exportarPdfDoDia = async () => {
    if (testes.length === 0) {
      toast.warning('Nenhum sorteado registrado para exportar nesta data.');
      return;
    }
    try {
      await exportAlcoolemiaDiaPdf(testes, dataSelecionada, user.name);
      toast.success('PDF do Livro de Alcoolemia gerado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      toast.error('Erro ao gerar PDF do livro diário.');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {tour.isOpen && (
        <TourSpotlight
          steps={TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}

      {/* Header Superior */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/portaria')}
            className="group mb-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para Portaria</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm shadow-rose-500/20">
              <Shield className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Teste de Alcoolemia
                </h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  FRM.SGP-0015
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Livro Diário de Sorteados e Aferição com Etilômetro / Bafômetro
              </p>
            </div>
          </div>
        </div>

        {/* Ações do Header */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-tour="alc-export-btn"
            onClick={exportarPdfDoDia}
            disabled={testes.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-all hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <span>Exportar Livro (PDF)</span>
          </button>

          <button
            type="button"
            data-tour="alc-novo-btn"
            onClick={abrirModalNovo}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-rose-600/30 transition-all hover:bg-rose-700 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Registrar Sorteado</span>
          </button>
        </div>
      </div>

      {/* Navegador de Datas & Filtros */}
      <div
        data-tour="alc-date-nav"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
      >
        {/* Controles de Data */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-800/60">
            <button
              type="button"
              onClick={() => mudarData(-1)}
              title="Dia Anterior"
              className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={irParaHoje}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                dataSelecionada === api.hojeISO()
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => mudarData(1)}
              title="Próximo Dia"
              className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <Calendar className="h-3.5 w-3.5 text-rose-500" />
            <input
              type="date"
              value={dataSelecionada}
              onChange={(e) => e.target.value && setDataSelecionada(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={carregarTestes}
            title="Atualizar dados"
            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin text-rose-600' : ''}`} />
          </button>
        </div>

        {/* Filtro Turno & Busca */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Turno */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold dark:border-slate-800 dark:bg-slate-800/60">
            {(['TODOS', 'MANHA', 'TARDE', 'NOITE'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFiltroTurno(t)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  filtroTurno === t
                    ? 'bg-white text-rose-700 shadow-2xs dark:bg-slate-700 dark:text-rose-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t === 'TODOS' ? 'Todos Turnos' : t}
              </button>
            ))}
          </div>

          {/* Busca rápida */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar nome, matrícula, empresa..."
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              className="w-48 rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 transition-all focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 sm:w-60"
            />
          </div>
        </div>
      </div>

      {/* Cards de Métricas Diárias */}
      <div data-tour="alc-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Sorteados */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Sorteados</span>
            <UserCheck className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            {metricas.total}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
            <span>{metricas.colaboradoresTen} TEN</span>
            <span>•</span>
            <span>{metricas.terceirosPj} PJ</span>
          </div>
        </div>

        {/* Aptos / Negativos */}
        <div className="flex flex-col rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-3.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Aptos (Negativo)</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {metricas.negativos}
          </div>
          <div className="mt-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            0,00 mg/L aferido
          </div>
        </div>

        {/* Positivos (Alerta) */}
        <div className="flex flex-col rounded-2xl border border-rose-200/70 bg-rose-50/50 p-3.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Positivos</span>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-rose-700 dark:text-rose-300">
            {metricas.positivos}
          </div>
          <div className="mt-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">
            Acima do limite legal
          </div>
        </div>

        {/* Recusas */}
        <div className="flex flex-col rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3.5 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Recusas</span>
            <XCircle className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-700 dark:text-amber-300">
            {metricas.recusas}
          </div>
          <div className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            Recusa com testemunha
          </div>
        </div>

        {/* Pendentes */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Aguardando Aferição</span>
            <Clock3 className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-800 dark:text-slate-200">
            {metricas.pendentes}
          </div>
          <div className="mt-1 text-[10px] font-medium text-slate-500">
            Sorteados pendentes
          </div>
        </div>

        {/* Vínculo TEN vs PJ */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Proporção</span>
            <Building2 className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            <span>{metricas.total > 0 ? Math.round((metricas.colaboradoresTen / metricas.total) * 100) : 0}%</span>
            <span className="text-xs font-semibold text-slate-500">TEN</span>
          </div>
          <div className="mt-1 text-[10px] font-medium text-slate-500">
            {metricas.terceirosPj} terceiros no dia
          </div>
        </div>
      </div>

      {/* Tabela do Livro Diário de Sorteados */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Livro de Sorteados do Dia — {formatarDataBR(dataSelecionada)}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registro sequencial dos sorteados e aferições de etilômetro na portaria
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Filtrar resultado:</span>
            <select
              value={filtroResultado}
              onChange={(e) => setFiltroResultado(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="TODOS">Todos os Registros</option>
              <option value="PENDENTE">Aguardando Aferição</option>
              <option value="NEGATIVO">Aptos (Negativos)</option>
              <option value="POSITIVO">Positivos</option>
              <option value="RECUSA">Recusas</option>
            </select>
          </div>
        </div>

        {carregando ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-rose-600" />
            <span className="mt-3 text-xs font-medium">Carregando livro de alcoolemia...</span>
          </div>
        ) : testesFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <Shield className="h-6 w-6" />
            </span>
            <h3 className="mt-3 font-display text-sm font-bold text-slate-800 dark:text-slate-200">
              Nenhum sorteado registrado para {formatarDataBR(dataSelecionada)}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              Inicie os testes do dia inserindo os colaboradores e terceiros sorteados. Se houver motoristas no posto, registre a aferição imediata.
            </p>
            <button
              type="button"
              onClick={abrirModalNovo}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700"
            >
              <Plus className="h-4 w-4" />
              <span>Registrar Sorteado</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Horário / Turno</th>
                  <th className="px-4 py-3">Vínculo</th>
                  <th className="px-4 py-3">Sorteado / Função</th>
                  <th className="px-4 py-3">Empresa / Setor</th>
                  <th className="px-4 py-3 text-center">Status / Aferição</th>
                  <th className="px-4 py-3 text-center">Valor Medido</th>
                  <th className="px-4 py-3">Vigilante / Etilômetro</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {testesFiltrados.map((item) => {
                  const podeEditar = podeEditarFormulario(user, item);
                  const isPendente = item.resultado === 'PENDENTE';

                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      {/* Código */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-rose-600 dark:text-rose-400">
                        {item.codigo_formulario}
                      </td>

                      {/* Horário & Turno */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.horario}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Turno {item.turno}
                        </div>
                      </td>

                      {/* Vínculo TEN vs PJ */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {item.tipo_vinculo === 'TEN' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            <Building2 className="h-3 w-3" />
                            TEN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            <Briefcase className="h-3 w-3" />
                            PJ / Terceiro
                          </span>
                        )}
                      </td>

                      {/* Sorteado / Função */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {item.nome}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.matricula && <span className="font-mono mr-1.5">Matr.: {item.matricula}</span>}
                          {item.documento && <span className="mr-1.5">Doc.: {item.documento}</span>}
                          {item.cargo_funcao && <span>• {item.cargo_funcao}</span>}
                        </div>
                      </td>

                      {/* Empresa / Setor */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.empresa || 'TEN'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.setor_area || '-'}
                        </div>
                      </td>

                      {/* Resultado / Botão de Aferição */}
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        {isPendente ? (
                          <div className="inline-flex flex-col items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <Clock3 className="h-3 w-3" />
                              Aguardando Teste
                            </span>
                            {podeEditar && (
                              <button
                                type="button"
                                onClick={() => abrirModalAfericao(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50/90 px-2.5 py-1 text-xs font-bold text-rose-700 shadow-2xs transition-all hover:bg-rose-100 hover:border-rose-400 active:scale-95 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60"
                              >
                                <Gauge className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                                <span>Registrar Aferição</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {item.resultado === 'NEGATIVO' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Apto (Negativo)
                              </span>
                            )}
                            {item.resultado === 'POSITIVO' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Positivo
                              </span>
                            )}
                            {item.resultado === 'RECUSA' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                <XCircle className="h-3.5 w-3.5" />
                                Recusa
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      {/* Valor Medido */}
                      <td className="whitespace-nowrap px-4 py-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        {item.resultado === 'NEGATIVO' ? (
                          <span className="text-emerald-600 dark:text-emerald-400">0,00 mg/L</span>
                        ) : item.resultado === 'POSITIVO' ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {Number(item.valor_medido || 0).toFixed(2)} mg/L
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Vigilante & Etilômetro */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="text-slate-700 dark:text-slate-300">
                          {item.vigilante || '-'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {item.etilometro_codigo ? `Aparelho: ${item.etilometro_codigo}` : ''}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão de aferir rápido se pendente */}
                          {isPendente && podeEditar && (
                            <button
                              type="button"
                              onClick={() => atualizarResultadoRapido(item, 'NEGATIVO')}
                              title="Marcar rapidamente como Apto / 0,00 mg/L"
                              className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {podeEditar && (
                            <>
                              <button
                                type="button"
                                onClick={() => abrirModalEdicao(item)}
                                title="Editar dados"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTesteParaExcluir(item)}
                                title="Excluir registro"
                                className="rounded-lg border border-slate-200 p-1.5 text-rose-600 transition-colors hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                Formulário FRM.SGP-0015 • Data do livro: {formatarDataBR(dataSelecionada)}
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
                    placeholder="Ex: Carlos Eduardo de Oliveira"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Empresa Terceirizada / Contratada *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Manserv, Apoio, LogTen, Expresso..."
                    value={formEmpresa}
                    onChange={(e) => setFormEmpresa(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Documento (CPF ou RG)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 000.000.000-00"
                    value={formDocumento}
                    onChange={(e) => setFormDocumento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Função / Cargo (ex: Motorista Ônibus / Carreta)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Motorista Carreta, Motorista Ônibus, Eletricista..."
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Setor / Área de Acesso
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pátio, Portaria, Logística..."
                    value={formSetor}
                    onChange={(e) => setFormSetor(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
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
                        placeholder="Ex: ETIL-01"
                        value={formEtilometro}
                        onChange={(e) => setFormEtilometro(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                      />
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
                      placeholder="Ex: Nome da testemunha ou fiscal"
                      value={formTestemunha}
                      onChange={(e) => setFormTestemunha(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    />
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
                  placeholder="Ex: ETIL-01"
                  value={afericaoEtilometro}
                  onChange={(e) => setAfericaoEtilometro(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
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
                  placeholder="Ex: Nome da testemunha ou fiscal"
                  value={afericaoTestemunha}
                  onChange={(e) => setAfericaoTestemunha(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
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
    </div>
  );
}
