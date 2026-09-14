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
  Check, X, FileDown, Activity, AlertCircle, Loader2, FileSignature
} from 'lucide-react';
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
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { exportTermoAlcoolemiaPdf } from '../../lib/pdfExport/exportSsmaAlcoolemiaPdf';
import { exportAlcoolemiaDiaPdf } from '../../lib/pdfExport/exportPortariaPdf';
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
    title: 'Navegação por Data do Livro',
    description:
      'Alterne entre os dias para carregar os sorteados pela portaria e os testes adicionados diretamente pelo SSMA.',
  },
  {
    target: 'ssma-alc-kpis',
    icon: Activity,
    title: 'Indicadores Diários em Tempo Real',
    description:
      'Visualize o total de testes, pendências de aferição, aptos e ocorrências positivas/recusas.',
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

  // Filtros e Navegação
  const [dataSelecionada, setDataSelecionada] = useState<string>(api.hojeISO());
  const [filtroResultado, setFiltroResultado] = useState<string>('TODOS');
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

  // Carregar registros do dia selecionado
  const carregarTestes = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await api.listarTestesAlcoolemia({ data: dataSelecionada });
      setTestes(lista);
    } catch (err: any) {
      console.error('Erro ao listar testes de alcoolemia:', err);
      toast.error('Erro ao carregar lista de testes do dia.');
    } finally {
      setCarregando(false);
    }
  }, [dataSelecionada, toast]);

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

  // Navegação de Datas
  const mudarData = (dias: number) => {
    const d = new Date(dataSelecionada + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDataSelecionada(`${yyyy}-${mm}-${dd}`);
  };

  // Métricas do Dia
  const metricas = useMemo(() => {
    return api.calcularMetricasAlcoolemia(testes);
  }, [testes]);

  // Filtros aplicados na lista
  const testesFiltrados = useMemo(() => {
    return testes.filter((t) => {
      if (filtroResultado !== 'TODOS' && t.resultado !== filtroResultado) return false;
      if (filtroRazao !== 'TODOS') {
        const r = t.razao_teste || 'ALEATORIO';
        if (r !== filtroRazao) return false;
      }
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
  }, [testes, filtroResultado, filtroRazao, buscaTexto]);

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

  // Impressão oficial do termo FRM.SOC-0042
  const imprimirTermoOficial = async (teste: PortAlcoolemiaTeste) => {
    setImprimindo(true);
    try {
      await exportTermoAlcoolemiaPdf(teste);
      toast.success(`Termo de Alcoolemia (FRM.SOC-0042) gerado para ${teste.nome}!`);

      // Marcar termo impresso
      await api.atualizarTesteAlcoolemia(teste.id, {
        termo_impresso_em: new Date().toISOString(),
      });
      await carregarTestes();
    } catch (err: any) {
      console.error('Erro ao exportar termo PDF:', err);
      toast.error('Erro ao gerar termo em PDF.');
    } finally {
      setImprimindo(false);
    }
  };

  // Abrir Modal de Novo Teste Extra
  const abrirModalNovoExtra = () => {
    setNovoTipoVinculo('TEN');
    setNovoRhSelecionado(null);
    setNovoBuscaRh('');
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
        data: dataSelecionada,
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
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Header com Navegação e Ações */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios/ssma')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          <span>Voltar para Módulo SSMA</span>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/20">
              <FileSignature className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">
                  Termo de Teste de Alcoolemia
                </h1>
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  FRM.SOC-0042
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Execução de teste e orientação preventiva sobre uso de substâncias psicoativas • Integrado à Portaria
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="ssma-alc-novo-btn"
              onClick={abrirModalNovoExtra}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/30 transition-all hover:bg-emerald-700 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar Colaborador / Teste Extra</span>
            </button>

            <button
              type="button"
              onClick={() => exportAlcoolemiaDiaPdf(testes, dataSelecionada, user.name)}
              disabled={testes.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <FileDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Relatório Diário</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Navegação de Data e Filtros */}
      <div
        id="ssma-alc-date-nav"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => mudarData(-1)}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Dia anterior"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setDataSelecionada(api.hojeISO())}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
              dataSelecionada === api.hojeISO()
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => mudarData(1)}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Próximo dia"
          >
            Próximo
          </button>

          <div className="ml-1 flex items-center gap-1.5 border-l border-slate-200 pl-3 dark:border-slate-700">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar colaborador, matrícula..."
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <select
            value={filtroRazao}
            onChange={(e) => setFiltroRazao(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="TODOS">Todas Razões</option>
            <option value="ALEATORIO">Aleatório (Sorteio)</option>
            <option value="MOTIVADO">Motivado / Suspeita</option>
            <option value="POS_ACIDENTE">Pós-Acidente</option>
          </select>

          <button
            type="button"
            onClick={carregarTestes}
            title="Atualizar lista"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Cards de Métricas Operacionais */}
      <div id="ssma-alc-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {/* Total */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Total na Lista</span>
            <Activity className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            {metricas.total}
          </div>
          <div className="mt-1 text-[10px] font-medium text-slate-500">
            {metricas.colaboradoresTen} TEN • {metricas.terceirosPj} terceiros
          </div>
        </div>

        {/* Pendentes */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Aguardando Aferição</span>
            <Clock3 className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {metricas.pendentes}
          </div>
          <div className="mt-1 text-[10px] font-medium text-amber-600/80">
            Abrir termo para testar
          </div>
        </div>

        {/* Aptos (Negativos) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Aptos (Negativo)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {metricas.negativos}
          </div>
          <div className="mt-1 text-[10px] font-medium text-emerald-600/80">
            0,00 mg/L de ar alveolar
          </div>
        </div>

        {/* Positivos */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-xs dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex items-center justify-between text-xs font-bold text-rose-700 dark:text-rose-400">
            <span>Positivos</span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {metricas.positivos}
          </div>
          <div className="mt-1 text-[10px] font-bold text-rose-700 dark:text-rose-400">
            Exige Termo Físico Assinado
          </div>
        </div>

        {/* Recusas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Recusas</span>
            <XCircle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {metricas.recusas}
          </div>
          <div className="mt-1 text-[10px] font-medium text-slate-500">
            Comunicação ao SESMT
          </div>
        </div>
      </div>

      {/* Tabela de Testes do Dia */}
      <div id="ssma-alc-table" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Relação de Testes de Alcoolemia — {formatarDataBR(dataSelecionada)}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sorteados recebidos da Portaria e testes adicionais do SSMA para emissão e assinatura do termo
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Filtrar resultado:</span>
            <select
              value={filtroResultado}
              onChange={(e) => setFiltroResultado(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="TODOS">Todos os Resultados</option>
              <option value="PENDENTE">Aguardando Aferição</option>
              <option value="NEGATIVO">Aptos (Negativos)</option>
              <option value="POSITIVO">Positivos</option>
              <option value="RECUSA">Recusas</option>
            </select>
          </div>
        </div>

        {carregando ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <span className="mt-3 text-xs font-medium">Carregando lista de testes...</span>
          </div>
        ) : testesFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <FileSignature className="h-6 w-6" />
            </span>
            <h3 className="mt-3 font-display text-sm font-bold text-slate-800 dark:text-slate-200">
              Nenhum teste encontrado para {formatarDataBR(dataSelecionada)}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              A portaria ainda não cadastrou sorteados para este dia, ou você pode adicionar um teste avulso diretamente.
            </p>
            <button
              type="button"
              onClick={abrirModalNovoExtra}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar Colaborador / Teste Extra</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Horário</th>
                  <th className="px-4 py-3">Colaborador / Matrícula</th>
                  <th className="px-4 py-3">Empresa / Função</th>
                  <th className="px-4 py-3">Razão do Teste</th>
                  <th className="px-4 py-3 text-center">Resultado / Aferição</th>
                  <th className="px-4 py-3 text-center">Termo Físico</th>
                  <th className="px-4 py-3 text-right">Ações do SSMA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {testesFiltrados.map((item) => {
                  const isPendente = item.resultado === 'PENDENTE';
                  const isPositivo = item.resultado === 'POSITIVO';
                  const isNegativo = item.resultado === 'NEGATIVO';
                  const isRecusa = item.resultado === 'RECUSA';
                  const razao = item.razao_teste || 'ALEATORIO';

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${
                        isPositivo ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''
                      }`}
                    >
                      {/* Código */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {item.codigo_formulario}
                      </td>

                      {/* Horário */}
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">
                        <div className="font-semibold">{item.horario}</div>
                        <div className="text-[10px] text-slate-400">Turno {item.turno}</div>
                      </td>

                      {/* Colaborador */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {item.nome}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.matricula && <span className="font-mono mr-1.5">Matr.: {item.matricula}</span>}
                          {item.documento && <span className="mr-1.5">Doc: {item.documento}</span>}
                        </div>
                      </td>

                      {/* Empresa / Função */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.empresa || 'TEN'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.cargo_funcao || '-'}
                        </div>
                      </td>

                      {/* Razão do Teste */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {razao === 'ALEATORIO' && (
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            Aleatório (Sorteio)
                          </span>
                        )}
                        {razao === 'MOTIVADO' && (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            Motivado / Suspeita
                          </span>
                        )}
                        {razao === 'POS_ACIDENTE' && (
                          <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                            Pós-Acidente
                          </span>
                        )}
                      </td>

                      {/* Resultado */}
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        {isPendente && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Clock3 className="h-3 w-3 text-amber-500" />
                            Aguardando Teste
                          </span>
                        )}
                        {isNegativo && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Apto (0,00 mg/L)
                          </span>
                        )}
                        {isPositivo && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                            <AlertTriangle className="h-3 w-3" />
                            Positivo ({Number(item.valor_medido || 0).toFixed(2)} mg/L)
                          </span>
                        )}
                        {isRecusa && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                            <XCircle className="h-3 w-3" />
                            Recusa
                          </span>
                        )}
                      </td>

                      {/* Termo Físico */}
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        {item.termo_assinado_fisicamente ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <Check className="h-3 w-3" />
                            Assinado e Arquivado
                          </span>
                        ) : isPositivo ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-800 animate-pulse dark:bg-rose-950/60 dark:text-rose-200">
                            <AlertCircle className="h-3 w-3" />
                            Requer Assinatura Física
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {item.termo_impresso_em ? 'Impresso' : 'Não impresso'}
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão de abrir Termo / Registrar Resultado */}
                          <button
                            type="button"
                            onClick={() => abrirModalTermo(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 shadow-2xs transition-all hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                            title="Abrir Termo FRM.SOC-0042 e registrar resultado"
                          >
                            <FileSignature className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
                            <span>{isPendente ? 'Registrar Resultado' : 'Ver / Editar Termo'}</span>
                          </button>

                          {/* Botão de Imprimir Termo PDF */}
                          <button
                            type="button"
                            onClick={() => imprimirTermoOficial(item)}
                            title="Imprimir Termo Oficial FRM.SOC-0042 para assinatura física"
                            className={`rounded-lg border p-1.5 transition-colors ${
                              isPositivo
                                ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Printer className="h-3.5 w-3.5" />
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
      </div>

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
    </div>
  );
}
