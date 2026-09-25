/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Registro de Chegada de Transportes" (FRM.SGP-0009).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Plus, Search, FileDown, CheckCircle2,
  Trash2, X, Loader2, Bus, Car, Truck, Clock, Calendar, User, Filter,
  HelpCircle, Bug, Lightbulb, Pencil
} from 'lucide-react';
import TourSpotlight from '../../components/help/TourSpotlight';
import { usePageTour } from '../../components/help/TourRegistryContext';
import type { TourStep } from '../../components/help/types';
import type { Profile, PortRegistroTransporte, PortTransporteStatus, PortTurno } from '../../types';
import * as api from '../../lib/portariaApi';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { exportTransportesPdf } from '../../lib/pdfExport/exportPortariaPdf';
import StatusPortariaBadge from '../../components/portaria/StatusPortariaBadge';
import SugestoesChegadaTransporte from '../../components/portaria/SugestoesChegadaTransporte';
import VigilanteOperadorAtual from '../../components/portaria/VigilanteOperadorAtual';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { MostrarExcluidosToggle, BadgeExcluido, RestaurarButton, classeLinhaExcluida } from '../../components/ui/ExcluidosControls';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const TIPOS_VEICULO = ['Van', 'Carro', 'Táxi', 'Ônibus', 'Caminhão', 'Caminhonete', 'Micro-ônibus', 'Outro'];
const ROTAS = ['R1', 'R2', 'R3', 'R4', 'BATATA', 'CAATINGA', 'JACOBINA'] as const;

const formTransporteVazio = () => ({
  data: api.hojeISO(),
  turno: api.sugerirTurno(),
  vigilante: '',
  veiculo: 'Van',
  placa: '',
  empresa: '',
  hora_chegada: api.horaAgora(),
  hora_saida: '',
  motorista: '',
  rota: '',
  ocupacao: '',
  observacoes: '',
});

export function prepararFormEdicaoTransporte(item: PortRegistroTransporte) {
  return {
    data: item.data,
    turno: item.turno,
    vigilante: item.vigilante,
    veiculo: item.veiculo,
    placa: item.placa,
    empresa: item.empresa,
    hora_chegada: item.hora_chegada,
    hora_saida: item.hora_saida || '',
    motorista: item.motorista,
    rota: (item.rota || '').toUpperCase(),
    ocupacao: item.ocupacao || '',
    observacoes: item.observacoes || '',
  };
}

const PORTARIA_TRANSPORTES_TOUR_STEPS: TourStep[] = [
  {
    icon: Bus,
    title: 'Registro de Chegada de Transportes',
    description:
      'Formulário oficial FRM.SGP-0009 para monitoramento de ônibus, vans e veículos de passageiros que atendem as rotas de funcionários da TEN.',
  },
  {
    target: 'transportes-header',
    icon: Plus,
    title: 'Lançar Chegada e Exportação',
    description:
      'Ao chegar um transporte na guarita, clique em "Lançar Chegada" para preencher a placa, motorista, rota e ocupação. Exporte a folha diária em PDF.',
  },
  {
    target: 'transportes-filtros',
    icon: Filter,
    title: 'Filtros por Data, Turno e Status',
    description:
      'Selecione a data de consulta, filtre por turno (Manhã, Tarde, Noite) ou confira quais transportes ainda estão dentro do pátio aguardando saída.',
  },
  {
    target: 'transportes-tabela',
    icon: Bus,
    title: 'Quadro de Movimentação dos Transportes',
    description:
      'Acompanhe os horários de chegada e saída, empresa prestadora, rota e acione o botão "Registrar Saída" no momento em que o veículo deixar a fábrica.',
  },
  {
    target: 'help-button',
    icon: HelpCircle,
    title: 'Reabra o tour a qualquer momento',
    description:
      'Ficou com alguma dúvida ou quer rever as dicas desta tela? Clique neste botão a qualquer momento no canto inferior e escolha "Tour guiado desta página".',
  },
  {
    target: 'help-button',
    icon: Bug,
    title: 'Encontrou um erro nesta tela?',
    description:
      'No mesmo botão, escolha "Reportar um erro" para descrever o problema — o histórico técnico recente da sessão vai junto, direto para o time responsável.',
  },
  {
    target: 'help-button',
    icon: Lightbulb,
    title: 'Tem uma ideia de melhoria?',
    description:
      'Escolha "Enviar sugestão" no mesmo botão para propor uma melhoria a qualquer momento, sem sair da tela.',
  },
];

const PORTARIA_TRANSPORTES_NOVO_TOUR_STEPS: TourStep[] = [
  {
    icon: Bus,
    title: 'Lançar Chegada de Transporte',
    description:
      'Registre a entrada de ônibus, vans e veículos de passageiros (FRM.SGP-0009) com autocompletar inteligente pelo histórico de placas.',
  },
  {
    target: 'transportes-form-veiculo',
    icon: Car,
    title: 'Identificação do Veículo',
    description:
      'Escolha a categoria (Van, Ônibus, Carro, etc.) e informe a placa. O sistema sugere dados de viagens anteriores assim que você começa a digitar.',
  },
  {
    target: 'transportes-form-motorista',
    icon: User,
    title: 'Empresa e Motorista',
    description:
      'Informe a razão social da transportadora e o nome completo do motorista condutor.',
  },
  {
    target: 'transportes-form-horarios',
    icon: Clock,
    title: 'Data, Horário e Turno',
    description:
      'O sistema preenche automaticamente a data e hora do momento da chegada, além de sugerir o turno correto de plantão.',
  },
  {
    target: 'transportes-form-passageiros',
    icon: Bus,
    title: 'Rota, Ocupação e Vigilante',
    description:
      'Selecione a rota atendida (R1, R2, R3 ou digitação livre), informe a quantidade estimada de passageiros ou motivo, e selecione o vigilante da portaria.',
  },
  {
    target: 'transportes-form-salvar',
    icon: CheckCircle2,
    title: 'Salvar Chegada',
    description:
      'Grava a entrada no pátio com status Aberto. Ao sair da fábrica, a baixa é realizada com um único clique.',
  },
  {
    target: 'help-button',
    icon: HelpCircle,
    title: 'Reabra o tour a qualquer momento',
    description:
      'Ficou com alguma dúvida ou quer rever as dicas desta tela? Clique neste botão a qualquer momento no canto inferior e escolha "Tour guiado desta página".',
  },
  {
    target: 'help-button',
    icon: Bug,
    title: 'Encontrou um erro nesta tela?',
    description:
      'No mesmo botão, escolha "Reportar um erro" para descrever o problema — o histórico técnico recente da sessão vai junto, direto para o time responsável.',
  },
  {
    target: 'help-button',
    icon: Lightbulb,
    title: 'Tem uma ideia de melhoria?',
    description:
      'Escolha "Enviar sugestão" no mesmo botão para propor uma melhoria a qualquer momento, sem sair da tela.',
  },
];

export default function PortariaTransportes({ user, onNavigate }: Props) {
  const toast = useToast();
  const [itens, setItens] = useState<PortRegistroTransporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTurno, setFiltroTurno] = useState<PortTurno | 'TODOS'>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<PortTransporteStatus | 'TODOS'>('TODOS');
  const [termoBusca, setTermoBusca] = useState('');

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState<PortRegistroTransporte | null>(null);
  const [itemParaRegistrarSaida, setItemParaRegistrarSaida] = useState<PortRegistroTransporte | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<PortRegistroTransporte | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvandoSaida, setSalvandoSaida] = useState(false);
  const [horaSaidaConfirmacao, setHoraSaidaConfirmacao] = useState('');
  const podeVerExcluidos = user.roles.includes('admin');
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);

  // Histórico de valores já digitados em "Ocupação" — vira opção de
  // preenchimento (datalist) em vez do vigilante redigitar o mesmo motivo.
  const [historicoOcupacao, setHistoricoOcupacao] = useState<string[]>([]);
  useEffect(() => {
    api.buscarHistoricoCampoPortaria('port_registro_transportes', 'ocupacao').then(setHistoricoOcupacao).catch(() => {});
  }, []);

  const tour = usePageTour('portaria-transportes', PORTARIA_TRANSPORTES_TOUR_STEPS.length, !modalNovoAberto);
  const tourNovo = usePageTour('portaria-transportes-novo', PORTARIA_TRANSPORTES_NOVO_TOUR_STEPS.length, modalNovoAberto);

  const [formNovo, setFormNovo] = useState(() => ({ ...formTransporteVazio(), vigilante: user.name }));
  // Enquanto false, os dropdowns de sugestão ficam fechados — evita reabri-los
  // logo após um preenchimento. Volta a true assim que o usuário digita.
  const [sugestoesAtivas, setSugestoesAtivas] = useState(true);
  // "Outro" na rota: mostra o campo de digitação livre.
  const [rotaModoOutro, setRotaModoOutro] = useState(false);

  const editarCampo = (patch: Partial<ReturnType<typeof formTransporteVazio>>) => {
    setSugestoesAtivas(true);
    setFormNovo((f) => ({ ...f, ...patch }));
  };

  // Preenche o formulário a partir de uma chegada já lançada (autocomplete).
  const preencherDeRegistro = (r: PortRegistroTransporte) => {
    setSugestoesAtivas(false);
    const rota = (r.rota || '').toUpperCase();
    setRotaModoOutro(rota !== '' && !ROTAS.includes(rota as (typeof ROTAS)[number]));
    setFormNovo((f) => ({
      ...f,
      veiculo: r.veiculo || f.veiculo,
      placa: (r.placa || '').toUpperCase(),
      empresa: (r.empresa || '').toUpperCase(),
      motorista: (r.motorista || '').toUpperCase(),
      rota: rota || f.rota,
      ocupacao: (r.ocupacao || '').toUpperCase(),
    }));
  };

  // Abre o modal já preenchido com o registro, para edição.
  const abrirEdicao = (item: PortRegistroTransporte) => {
    setSugestoesAtivas(false);
    const rota = (item.rota || '').toUpperCase();
    setRotaModoOutro(rota !== '' && !ROTAS.includes(rota as (typeof ROTAS)[number]));
    setFormNovo(prepararFormEdicaoTransporte(item));
    setItemEditando(item);
    setModalNovoAberto(true);
  };

  const fecharModal = () => {
    setModalNovoAberto(false);
    setItemEditando(null);
    setFormNovo({ ...formTransporteVazio(), vigilante: user.name });
    setSugestoesAtivas(true);
    setRotaModoOutro(false);
  };

  const [diaAtivo, setDiaAtivo] = useState<string>(() => api.hojeISO());
  const [termoBuscaDias, setTermoBuscaDias] = useState('');

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listarTransportes({
        incluirExcluidos: podeVerExcluidos && mostrarExcluidos,
      });
      setItens(data);
      if (data.length > 0) {
        setDiaAtivo((prev) => {
          if (data.some((d) => d.data === prev)) return prev;
          return data[0].data;
        });
      }
    } catch (e) {
      toast.error(`Erro ao carregar transportes: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [toast, podeVerExcluidos, mostrarExcluidos]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNovo.placa.trim() || !formNovo.empresa.trim() || !formNovo.motorista.trim()) {
      toast.error('Preencha os campos obrigatórios: Placa, Empresa e Motorista.');
      return;
    }

    setSalvando(true);
    try {
      const dadosFormulario = { ...formNovo, hora_saida: formNovo.hora_saida || null };
      if (itemEditando) {
        await api.atualizarTransporte(itemEditando.id, dadosFormulario);
        toast.success('Chegada de transporte atualizada!');
      } else {
        await api.criarTransporte({
          ...dadosFormulario,
          criado_por: user.id,
        });
        toast.success('Chegada de transporte registrada!');
      }
      fecharModal();
      carregarDados();
    } catch (e) {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const abrirConfirmacaoSaida = (item: PortRegistroTransporte) => {
    setHoraSaidaConfirmacao(api.horaAgora());
    setItemParaRegistrarSaida(item);
  };

  const handleRegistrarSaida = async () => {
    if (!itemParaRegistrarSaida || !horaSaidaConfirmacao) return;
    const item = itemParaRegistrarSaida;
    setSalvandoSaida(true);
    try {
      await api.registrarSaidaTransporte(item.id, horaSaidaConfirmacao);
      toast.success(`Saída registrada para ${item.placa} (${item.empresa}) às ${horaSaidaConfirmacao}!`);
      setItemParaRegistrarSaida(null);
      carregarDados();
    } catch (e) {
      toast.error(`Falha ao registrar saída: ${(e as Error).message}`);
    } finally {
      setSalvandoSaida(false);
    }
  };

  const handleExcluir = async () => {
    if (!itemParaExcluir) return;
    const item = itemParaExcluir;
    try {
      await api.excluirTransporte(item.id, user.id);
      setItemParaExcluir(null);
      carregarDados();
      toast.undo(
        `Transporte placa ${item.placa} excluído.`,
        async () => {
          try {
            await api.restaurarTransporte(item.id);
            toast.success(`Transporte placa ${item.placa} restaurado com sucesso.`);
            carregarDados();
          } catch (err) {
            toast.error(`Erro ao desfazer exclusão: ${(err as Error).message}`);
          }
        },
        6000
      );
    } catch (e) {
      toast.error(`Erro ao excluir: ${(e as Error).message}`);
    }
  };

  const handleRestaurar = async (item: PortRegistroTransporte) => {
    try {
      await api.restaurarTransporte(item.id);
      toast.success('Registro restaurado.');
      carregarDados();
    } catch (e) {
      toast.error(`Erro ao restaurar: ${(e as Error).message}`);
    }
  };

  const gruposPorDia = useMemo(() => {
    const mapa = new Map<string, PortRegistroTransporte[]>();
    for (const item of itens) {
      const lista = mapa.get(item.data) || [];
      lista.push(item);
      mapa.set(item.data, lista);
    }
    return Array.from(mapa.entries()).map(([data, lista]) => {
      const noPatio = lista.filter((t) => t.status === 'NO_PATIO').length;
      const turnosDistintos = Array.from(new Set(lista.map((t) => t.turno)));
      return {
        data,
        total: lista.length,
        noPatio,
        turnos: turnosDistintos,
        itens: lista,
      };
    });
  }, [itens]);

  const diasFiltrados = useMemo(() => {
    if (!termoBuscaDias.trim()) return gruposPorDia;
    const t = termoBuscaDias.toLowerCase();
    return gruposPorDia.filter((g) => {
      const dataFormatada = g.data.split('-').reverse().join('/');
      return (
        g.data.includes(t) ||
        dataFormatada.includes(t) ||
        g.turnos.some((turno) => turno.toLowerCase().includes(t)) ||
        g.itens.some(
          (item) =>
            item.placa.toLowerCase().includes(t) ||
            item.empresa.toLowerCase().includes(t) ||
            item.motorista.toLowerCase().includes(t) ||
            (item.rota && item.rota.toLowerCase().includes(t))
        )
      );
    });
  }, [gruposPorDia, termoBuscaDias]);

  // Itens do dia selecionado
  const itensDoDia = useMemo(() => {
    if (!diaAtivo) return [];
    return itens.filter((i) => i.data === diaAtivo);
  }, [itens, diaAtivo]);

  // Filtragem dos transportes do dia ativo
  const transportesDoDiaFiltrados = useMemo(() => {
    return itensDoDia.filter((item) => {
      if (filtroTurno !== 'TODOS' && item.turno !== filtroTurno) return false;
      if (filtroStatus !== 'TODOS' && item.status !== filtroStatus) return false;
      if (termoBusca.trim()) {
        const tb = termoBusca.trim().toLowerCase();
        const casa =
          item.placa.toLowerCase().includes(tb) ||
          item.empresa.toLowerCase().includes(tb) ||
          item.motorista.toLowerCase().includes(tb) ||
          item.veiculo.toLowerCase().includes(tb) ||
          (item.rota && item.rota.toLowerCase().includes(tb)) ||
          item.vigilante.toLowerCase().includes(tb);
        if (!casa) return false;
      }
      return true;
    });
  }, [itensDoDia, filtroTurno, filtroStatus, termoBusca]);

  const grupoAtivo = useMemo(() => {
    return gruposPorDia.find((g) => g.data === diaAtivo) || null;
  }, [gruposPorDia, diaAtivo]);

  const handleExportarRelatorio = () => {
    const listaExportar = transportesDoDiaFiltrados.length > 0 ? transportesDoDiaFiltrados : itensDoDia;
    if (listaExportar.length === 0) {
      toast.error('Nenhum transporte listado para exportar neste dia.');
      return;
    }
    exportTransportesPdf(diaAtivo || api.hojeISO(), filtroTurno, listaExportar);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Header */}
      <div data-tour="transportes-header" className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/portaria')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para o Painel da Portaria</span>
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <Bus className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                  Registro de Chegada de Transportes
                </h1>
                <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  FRM.SGP-0009
                </span>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Chegadas e Saídas de Ônibus, Vans e Veículos de Passageiros · Portaria TEN
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {grupoAtivo && (
            <button
              type="button"
              onClick={handleExportarRelatorio}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <FileDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Exportar Folha (PDF)
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setItemEditando(null);
              setFormNovo({ ...formTransporteVazio(), data: diaAtivo || api.hojeISO(), vigilante: user.name });
              setSugestoesAtivas(true);
              setRotaModoOutro(false);
              setModalNovoAberto(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Plus className="h-4 w-4" />
            Lançar Chegada
          </button>
        </div>
      </div>

      {/* Main Grid: Left = Days List / Right = Transports Feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Days List */}
        <div data-tour="transportes-filtros" className="space-y-3 lg:col-span-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Registros por Dia
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {gruposPorDia.length}
              </span>
            </div>
            {podeVerExcluidos && (
              <MostrarExcluidosToggle visivel={podeVerExcluidos} checked={mostrarExcluidos} onChange={setMostrarExcluidos} />
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por data, placa, empresa..."
              value={termoBuscaDias}
              onChange={(e) => setTermoBuscaDias(e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs uppercase text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          ) : diasFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum dia com registro encontrado.</p>
              <button
                type="button"
                onClick={() => {
                  setItemEditando(null);
                  setFormNovo({ ...formTransporteVazio(), data: api.hojeISO(), vigilante: user.name });
                  setModalNovoAberto(true);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Lançamento Hoje
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
              {diasFiltrados.map((g) => {
                const isSelected = diaAtivo === g.data;
                const ehHoje = g.data === api.hojeISO();

                return (
                  <div
                    key={g.data}
                    onClick={() => setDiaAtivo(g.data)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                            {g.data.split('-').reverse().join('/')}
                          </span>
                          {ehHoje && (
                            <span className="rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Hoje
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {g.total} transporte{g.total > 1 ? 's' : ''} registrado{g.total > 1 ? 's' : ''}
                        </h4>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 justify-end">
                        {g.noPatio > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {g.noPatio} no pátio
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            Finalizados
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800/80">
                      <span className="truncate max-w-[150px]">
                        Turnos: <strong>{g.turnos.join(', ') || 'Nenhum'}</strong>
                      </span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {g.total} reg
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Day Header & Transport Forms / Cards */}
        <div data-tour="transportes-tabela" className="lg:col-span-8">
          {grupoAtivo ? (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col">
              {/* Day Header Bar */}
              <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                        FRM.SGP-0009
                      </span>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Transportes de {diaAtivo.split('-').reverse().join('/')}
                      </h2>
                      {diaAtivo === api.hojeISO() && (
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Dia Atual
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Total: <strong>{grupoAtivo.total} movimentações</strong></span>
                      <span>•</span>
                      <span>No pátio: <strong>{grupoAtivo.noPatio} transportes</strong></span>
                      <span>•</span>
                      <span>Finalizados: <strong>{grupoAtivo.total - grupoAtivo.noPatio} transportes</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setItemEditando(null);
                        setFormNovo({ ...formTransporteVazio(), data: diaAtivo, vigilante: user.name });
                        setSugestoesAtivas(true);
                        setRotaModoOutro(false);
                        setModalNovoAberto(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-500"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Lançar Chegada
                    </button>
                  </div>
                </div>

                {/* Sub-filtros por Turno, Status e Busca */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                  <div>
                    <select
                      value={filtroTurno}
                      onChange={(e) => setFiltroTurno(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
                    >
                      <option value="TODOS">Todos os Turnos</option>
                      <option value="MANHA">Manhã</option>
                      <option value="TARDE">Tarde</option>
                      <option value="NOITE">Noite</option>
                    </select>
                  </div>

                  <div>
                    <select
                      value={filtroStatus}
                      onChange={(e) => setFiltroStatus(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
                    >
                      <option value="TODOS">Todos os Status</option>
                      <option value="NO_PATIO">🟢 No Pátio (Sem saída)</option>
                      <option value="FINALIZADO">✓ Finalizados (Com saída)</option>
                    </select>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar placa, empresa, motorista..."
                      value={termoBusca}
                      onChange={(e) => setTermoBusca(e.target.value.toUpperCase())}
                      className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Transports Cards Feed */}
              <div className="p-5 space-y-3.5">
                {transportesDoDiaFiltrados.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center dark:border-slate-800 dark:bg-slate-950/30">
                    <Bus className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                    <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Nenhum transporte encontrado com estes filtros neste dia.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setItemEditando(null);
                        setFormNovo({ ...formTransporteVazio(), data: diaAtivo, vigilante: user.name });
                        setModalNovoAberto(true);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500 shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Lançar Chegada
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transportesDoDiaFiltrados.map((item) => {
                      const estaNoPatio = item.status === 'NO_PATIO';
                      const podeEditar = podeEditarFormulario(user, item);

                      return (
                        <div
                          key={item.id}
                          className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                            estaNoPatio
                              ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/10'
                              : 'border-slate-200/90 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900'
                          } ${classeLinhaExcluida(item.excluido_em)}`}
                        >
                          <div className="flex items-start gap-3.5 min-w-0">
                            {/* Tag de Horário e Turno */}
                            <div className="flex flex-col items-center justify-center rounded-xl bg-blue-100/70 px-2.5 py-1.5 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 shrink-0">
                              <span className="font-mono text-xs font-bold">{item.hora_chegada}</span>
                              <span className="text-[10px] font-semibold uppercase">{item.turno}</span>
                            </div>

                            {/* Conteúdo formatado do Transporte */}
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                                  {item.placa}
                                </span>
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                  {item.veiculo}
                                </span>
                                {item.rota && (
                                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                    Rota {item.rota}
                                  </span>
                                )}
                                {estaNoPatio ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    No Pátio
                                  </span>
                                ) : item.hora_saida ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    <Clock className="h-3 w-3 text-slate-500" />
                                    Saída às {item.hora_saida}
                                  </span>
                                ) : null}
                                {item.excluido_em && <BadgeExcluido em={item.excluido_em} />}
                              </div>

                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                  {item.empresa}
                                </span>
                                <span className="text-xs text-slate-600 dark:text-slate-300">
                                  · Condutor: <strong>{item.motorista}</strong>
                                </span>
                              </div>

                              {item.ocupacao && (
                                <p className="text-xs text-slate-600 dark:text-slate-300 break-words">
                                  <span className="text-slate-400">Ocupação / Motivo:</span> {item.ocupacao}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                                <span>
                                  Vigilante: <strong className="text-slate-600 dark:text-slate-300">{item.vigilante}</strong>
                                </span>
                                {item.numero_protocolo && (
                                  <span>
                                    · Protocolo: <span className="font-mono">{item.numero_protocolo}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Ações */}
                          <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/80">
                            {item.excluido_em ? (
                              podeEditar && <RestaurarButton onClick={() => handleRestaurar(item)} />
                            ) : (
                              <>
                                {estaNoPatio && podeEditar && (
                                  <button
                                    type="button"
                                    onClick={() => abrirConfirmacaoSaida(item)}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition-all active:scale-95"
                                    title="Marcar saída agora"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Registrar Saída
                                  </button>
                                )}

                                {podeEditar && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => abrirEdicao(item)}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-all"
                                      title="Editar registro"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setItemParaExcluir(item)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all"
                                      title="Excluir registro"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <Bus className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Selecione um dia à esquerda
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Escolha uma data na coluna da esquerda para visualizar as chegadas e saídas de transportes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Novo Lançamento / Edição */}
      {modalNovoAberto && (
        <Modal onClose={fecharModal} maxWidth="max-w-3xl">
          <ModalHeader onClose={fecharModal}>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6 w-full">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {itemEditando ? 'Editar Chegada de Transporte' : 'Lançar Chegada de Transporte'}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Formulário FRM.SGP-0009</p>
              </div>
              <button
                type="button"
                onClick={tourNovo.startTour}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-2xs transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
                title="Dicas de preenchimento da chegada de transporte"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Dicas de Preenchimento
              </button>
            </div>
          </ModalHeader>

          <form onSubmit={handleSalvar} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody className="space-y-4">
              <div data-tour="transportes-form-veiculo" className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Veículo *
                  </label>
                  <select
                    value={formNovo.veiculo}
                    onChange={(e) => setFormNovo({ ...formNovo, veiculo: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {TIPOS_VEICULO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Placa do Veículo *
                  </label>
                  <input
                    type="text"
                    required
                    autoCapitalize="characters"
                    placeholder="Ex: ABC1D23"
                    value={formNovo.placa}
                    onChange={(e) => editarCampo({ placa: e.target.value.toUpperCase() })}
                    className="w-full font-mono rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm uppercase text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <SugestoesChegadaTransporte termo={formNovo.placa} ativo={sugestoesAtivas} aoSelecionar={preencherDeRegistro} />
                </div>
              </div>

              <div data-tour="transportes-form-motorista" className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    autoCapitalize="characters"
                    placeholder="Ex: Transportes São Geraldo"
                    value={formNovo.empresa}
                    onChange={(e) => editarCampo({ empresa: e.target.value.toUpperCase() })}
                    className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <SugestoesChegadaTransporte termo={formNovo.empresa} ativo={sugestoesAtivas} aoSelecionar={preencherDeRegistro} />
                </div>
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome do Motorista *
                  </label>
                  <input
                    type="text"
                    required
                    autoCapitalize="characters"
                    placeholder="Nome completo do motorista"
                    value={formNovo.motorista}
                    onChange={(e) => editarCampo({ motorista: e.target.value.toUpperCase() })}
                    className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <SugestoesChegadaTransporte termo={formNovo.motorista} ativo={sugestoesAtivas} aoSelecionar={preencherDeRegistro} />
                </div>
              </div>

              <div data-tour="transportes-form-horarios" className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    value={formNovo.data}
                    onChange={(e) => setFormNovo({ ...formNovo, data: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário Chegada
                  </label>
                  <input
                    type="time"
                    value={formNovo.hora_chegada}
                    onChange={(e) => setFormNovo({ ...formNovo, hora_chegada: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                {itemEditando?.status === 'FINALIZADO' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Hora de Saída
                    </label>
                    <input
                      type="time"
                      value={formNovo.hora_saida}
                      onChange={(e) => setFormNovo({ ...formNovo, hora_saida: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Turno
                  </label>
                  <select
                    value={formNovo.turno}
                    onChange={(e) => setFormNovo({ ...formNovo, turno: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="MANHA">Manhã</option>
                    <option value="TARDE">Tarde</option>
                    <option value="NOITE">Noite</option>
                  </select>
                </div>
              </div>

              <div data-tour="transportes-form-passageiros" className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Rota
                    </label>
                    <select
                      value={rotaModoOutro ? '__OUTRO__' : (ROTAS.includes(formNovo.rota as (typeof ROTAS)[number]) ? formNovo.rota : '')}
                      onChange={(e) => {
                        if (e.target.value === '__OUTRO__') {
                          setRotaModoOutro(true);
                          setFormNovo({ ...formNovo, rota: '' });
                        } else {
                          setRotaModoOutro(false);
                          setFormNovo({ ...formNovo, rota: e.target.value });
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="">— Sem rota</option>
                      {ROTAS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                      <option value="__OUTRO__">Outro (digitar)...</option>
                    </select>
                    {rotaModoOutro && (
                      <input
                        type="text"
                        autoFocus
                        autoCapitalize="characters"
                        placeholder="Ex: ESPECIAL, EXTRA..."
                        value={formNovo.rota}
                        onChange={(e) => setFormNovo({ ...formNovo, rota: e.target.value.toUpperCase() })}
                        className="mt-2 w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Ocupação / Motivo (Opcional)
                    </label>
                    <input
                      type="text"
                      list="lista-ocupacoes-transporte"
                      autoCapitalize="characters"
                      placeholder="Ex: Entrega de suprimentos / 4 passageiros"
                      value={formNovo.ocupacao}
                      onChange={(e) => setFormNovo({ ...formNovo, ocupacao: e.target.value.toUpperCase() })}
                      className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <datalist id="lista-ocupacoes-transporte">
                      {historicoOcupacao.map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <VigilanteOperadorAtual nome={formNovo.vigilante} label="Vigilante Portaria" />
                  </div>
                </div>
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={fecharModal}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                data-tour="transportes-form-salvar"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 dark:bg-blue-500"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {itemEditando ? 'Salvar Alterações' : 'Salvar Chegada'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {itemParaRegistrarSaida && (
        <Modal onClose={() => !salvandoSaida && setItemParaRegistrarSaida(null)} maxWidth="max-w-md">
          <ModalHeader onClose={() => !salvandoSaida && setItemParaRegistrarSaida(null)}>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Confirmar Saída</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {itemParaRegistrarSaida.placa} · {itemParaRegistrarSaida.empresa}
                </p>
              </div>
            </div>
          </ModalHeader>

          <form onSubmit={(e) => { e.preventDefault(); void handleRegistrarSaida(); }}>
            <ModalBody className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Confirme a hora da saída ou ajuste-a antes de finalizar o registro.
              </p>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Hora de saída
                </label>
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="time"
                    required
                    autoFocus
                    value={horaSaidaConfirmacao}
                    onChange={(e) => setHoraSaidaConfirmacao(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <button
                type="button"
                disabled={salvandoSaida}
                onClick={() => setItemParaRegistrarSaida(null)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvandoSaida || !horaSaidaConfirmacao}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {salvandoSaida && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar Saída
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Confirm Dialog Excluir */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Registro de Transporte"
          mensagem={`Deseja excluir o registro do veículo placa ${itemParaExcluir.placa} (${itemParaExcluir.empresa})?`}
          confirmarLabel="Sim, Excluir"
          variante="perigo"
          onConfirmar={handleExcluir}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
      {tour.isOpen && (
        <TourSpotlight
          steps={PORTARIA_TRANSPORTES_TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
      {tourNovo.isOpen && (
        <TourSpotlight
          steps={PORTARIA_TRANSPORTES_NOVO_TOUR_STEPS}
          stepIndex={tourNovo.stepIndex}
          onNext={tourNovo.next}
          onBack={tourNovo.back}
          onClose={tourNovo.close}
        />
      )}
    </div>
  );
}
