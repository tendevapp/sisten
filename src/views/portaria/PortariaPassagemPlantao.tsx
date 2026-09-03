/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Portaria — Formulário de Passagem de Plantão & Custódia de Segurança (FRM.SGP-0010)
 * Registra a troca de turno dos vigilantes, conferência tátil dos materiais de segurança patrimonial
 * (armamento, placas balísticas, HTs, munições, etilômetro) e termo de responsabilidade da escala.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, Plus, Search, Filter, RefreshCw, Calendar, Clock,
  UserCheck, Shield, CheckCircle2, AlertTriangle, FileDown, X,
  Trash2, Eye, ArrowRight, ArrowLeft, Check, AlertCircle, Sparkles, Building2,
  Lock, Loader2
} from 'lucide-react';
import type {
  Profile,
  PortPassagemPlantao,
  PortItemConferido,
  PortMaterialSeguranca,
  PortPassagemPlantaoStatus
} from '../../types';
import * as api from '../../lib/portariaApi';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import VigilanteSelect from '../../components/portaria/VigilanteSelect';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import {
  MostrarExcluidosToggle,
  BadgeExcluido,
  RestaurarButton,
  classeLinhaExcluida,
} from '../../components/ui/ExcluidosControls';
import {
  exportPassagemPlantaoPdf,
  exportPassagensPlantaoConsolidadoPdf,
} from '../../lib/pdfExport/exportPortariaPdf';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function PortariaPassagemPlantao({ user, onNavigate }: Props) {
  const toast = useToast();

  const [plantoes, setPlantoes] = useState<PortPassagemPlantao[]>([]);
  const [materiaisDisponiveis, setMateriaisDisponiveis] = useState<PortMaterialSeguranca[]>([]);
  const [loading, setLoading] = useState(false);

  // Seleção múltipla para exportação consolidada
  const [selecionadosIds, setSelecionadosIds] = useState<Set<string>>(new Set());
  const [exportandoConsolidado, setExportandoConsolidado] = useState(false);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<PortPassagemPlantaoStatus | 'TODOS'>('TODOS');
  const [filtroTurno, setFiltroTurno] = useState<string>('TODOS');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [termoBusca, setTermoBusca] = useState('');
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);

  // Modal Novo / Edição
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Modal Detalhes / Visualização
  const [plantaoVisualizando, setPlantaoVisualizando] = useState<PortPassagemPlantao | null>(null);

  // Modal Encerrar Plantão
  const [plantaoParaEncerrar, setPlantaoParaEncerrar] = useState<PortPassagemPlantao | null>(null);
  const [obsEncerramento, setObsEncerramento] = useState('');

  // Confirmação de Exclusão
  const [plantaoParaExcluir, setPlantaoParaExcluir] = useState<PortPassagemPlantao | null>(null);

  // Formulário de Passagem de Plantão
  const [formData, setFormData] = useState(api.hojeISO());
  const [formTurno, setFormTurno] = useState('DIURNO');
  const [formHoraInicio, setFormHoraInicio] = useState('06:00');
  const [formHoraFim, setFormHoraFim] = useState('18:00');
  const [formPreenchedor, setFormPreenchedor] = useState('');
  const [formPortaria, setFormPortaria] = useState('');
  const [formRonda01, setFormRonda01] = useState('');
  const [formRonda02, setFormRonda02] = useState('');
  const [formAnterior01, setFormAnterior01] = useState('');
  const [formAnterior02, setFormAnterior02] = useState('');
  const [formObs, setFormObs] = useState('');
  const [formItens, setFormItens] = useState<PortItemConferido[]>([]);

  // Carregar dados
  const carregarDados = async () => {
    setLoading(true);
    try {
      const [listaPlantoes, listaMateriais] = await Promise.all([
        api.listarPassagensPlantao({
          status: filtroStatus,
          turno: filtroTurno,
          dataInicio: dataInicio || undefined,
          dataFim: dataFim || undefined,
          termoBusca: termoBusca || undefined,
          incluirExcluidos: mostrarExcluidos,
        }),
        api.listarMateriaisSeguranca(true),
      ]);
      setPlantoes(listaPlantoes);
      setMateriaisDisponiveis(listaMateriais);
    } catch (err: any) {
      toast.error('Erro ao carregar dados de passagem de plantão: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [filtroStatus, filtroTurno, dataInicio, dataFim, mostrarExcluidos]);

  // Montar texto declaratório dinâmico
  const textoDeclaracaoGerado = useMemo(() => {
    const nomesEntregadores: string[] = [];
    if (formAnterior01.trim()) nomesEntregadores.push(formAnterior01.trim());
    if (formAnterior02.trim()) nomesEntregadores.push(formAnterior02.trim());

    const passadores = nomesEntregadores.length > 0 ? nomesEntregadores.join(' e ') : '[Vigilantes do Plantão Anterior]';

    return `Recebemos o plantão dos vigilantes ${passadores} com todas as informações do plantão e todos os materiais de segurança do uso da vigilância patrimonial. Sendo:`;
  }, [formAnterior01, formAnterior02]);

  // Abrir Modal de Novo Plantão
  const abrirNovoPlantao = () => {
    setFormData(api.hojeISO());
    setFormTurno(new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'DIURNO' : 'NOTURNO');
    setFormHoraInicio(new Date().getHours() >= 6 && new Date().getHours() < 18 ? '06:00' : '18:00');
    setFormHoraFim(new Date().getHours() >= 6 && new Date().getHours() < 18 ? '18:00' : '06:00');
    setFormPreenchedor('');
    setFormPortaria('');
    setFormRonda01('');
    setFormRonda02('');
    setFormAnterior01('');
    setFormAnterior02('');
    setFormObs('');

    // Preencher checklist com os materiais ativos (inicia DESMARCADO por padrão)
    const itensIniciais: PortItemConferido[] = materiaisDisponiveis.map((m) => ({
      material_id: m.id,
      nome: m.nome,
      quantidade_esperada: m.quantidade_padrao,
      unidade: m.unidade || 'UN',
      categoria: m.categoria,
      conferido: false,
      quantidade_conferida: m.quantidade_padrao,
      observacao: '',
    }));

    setFormItens(itensIniciais);
    setModalNovoAberto(true);
  };

  const alternarConferenciaItem = (index: number) => {
    setFormItens((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, conferido: !item.conferido } : item
      )
    );
  };

  const atualizarQtdConferida = (index: number, qtd: number) => {
    setFormItens((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, quantidade_conferida: qtd } : item
      )
    );
  };

  const atualizarObsItem = (index: number, obs: string) => {
    setFormItens((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, observacao: obs.toUpperCase() } : item
      )
    );
  };

  // Salvar Plantão
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPreenchedor.trim()) {
      toast.warning('Selecione quem está preenchendo o formulário.');
      return;
    }
    if (!formPortaria.trim()) {
      toast.warning('Selecione o vigilante responsável pela Portaria.');
      return;
    }
    if (!formAnterior01.trim()) {
      toast.warning('Selecione ao menos um vigilante que está entregando o plantão.');
      return;
    }

    // Validação estrita: se algum item estiver desmarcado, a observação é OBRIGATÓRIA
    const itemNaoConferidoSemObs = formItens.find((i) => !i.conferido && !i.observacao?.trim());
    if (itemNaoConferidoSemObs) {
      toast.warning(
        `O item "${itemNaoConferidoSemObs.nome}" está desmarcado. É obrigatório informar a justificativa/observação (ex: avaria, falta, em manutenção).`
      );
      return;
    }

    setSalvando(true);
    try {
      const novo = await api.criarPassagemPlantao({
        data: formData,
        turno: formTurno,
        horario_inicio: formHoraInicio,
        horario_fim: formHoraFim,
        vigilante_preenchedor: formPreenchedor,
        vigilante_portaria: formPortaria,
        vigilante_ronda01: formRonda01 || null,
        vigilante_ronda02: formRonda02 || null,
        vigilante_anterior01: formAnterior01,
        vigilante_anterior02: formAnterior02 || null,
        texto_declaracao: textoDeclaracaoGerado,
        itens_conferidos: formItens,
        status: 'EM_ANDAMENTO',
        observacoes: formObs || null,
      });

      toast.success(`Plantão ${novo.numero_protocolo} registrado com sucesso!`);
      setModalNovoAberto(false);
      carregarDados();
    } catch (err: any) {
      toast.error('Erro ao salvar plantão: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  // Encerrar Plantão
  const handleEncerrarPlantao = async () => {
    if (!plantaoParaEncerrar) return;
    try {
      await api.encerrarPassagemPlantao(plantaoParaEncerrar.id, obsEncerramento);
      toast.success(`Plantão ${plantaoParaEncerrar.numero_protocolo} finalizado!`);
      setPlantaoParaEncerrar(null);
      setObsEncerramento('');
      carregarDados();
    } catch (err: any) {
      toast.error('Erro ao encerrar plantão: ' + (err.message || ''));
    }
  };

  // Confirmar Exclusão
  const handleConfirmarExclusao = async () => {
    if (!plantaoParaExcluir) return;
    try {
      await api.excluirPassagemPlantao(plantaoParaExcluir.id, user.id);
      toast.success(`Plantão ${plantaoParaExcluir.numero_protocolo} excluído!`);
      setPlantaoParaExcluir(null);
      carregarDados();
    } catch (err: any) {
      toast.error('Erro ao excluir plantão: ' + (err.message || ''));
    }
  };

  const handleRestaurarPlantao = async (p: PortPassagemPlantao) => {
    try {
      await api.restaurarPassagemPlantao(p.id);
      toast.success(`Plantão ${p.numero_protocolo} restaurado!`);
      carregarDados();
    } catch (err: any) {
      toast.error('Erro ao restaurar plantão: ' + (err.message || ''));
    }
  };

  // Funções de Seleção Múltipla
  const toggleSelecionado = (id: string) => {
    setSelecionadosIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodos = () => {
    if (selecionadosIds.size === plantoes.length) {
      setSelecionadosIds(new Set());
    } else {
      setSelecionadosIds(new Set(plantoes.map((p) => p.id)));
    }
  };

  const handleExportarConsolidado = async () => {
    const selecionados = plantoes.filter((p) => selecionadosIds.has(p.id));
    if (selecionados.length === 0) {
      toast.warning('Selecione ao menos um plantão para exportar.');
      return;
    }
    setExportandoConsolidado(true);
    try {
      await exportPassagensPlantaoConsolidadoPdf(selecionados);
      toast.success(`PDF consolidado com ${selecionados.length} plantões exportado com sucesso!`);
    } catch (err: any) {
      toast.error('Erro ao exportar PDF consolidado: ' + (err.message || ''));
    } finally {
      setExportandoConsolidado(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios/portaria')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-600 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          <span>Voltar para o Painel da Portaria</span>
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-500/20">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
                  Passagem de Plantão da Portaria
                </h1>
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                  FRM.SGP-0010
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Recebimento de posto, conferência de armamento, munição, coletes balísticos e custódia patrimonial
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={carregarDados}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={abrirNovoPlantao}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Novo Plantão
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por vigilante, protocolo..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && carregarDados()}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-base sm:text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <select
              value={filtroTurno}
              onChange={(e) => setFiltroTurno(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base sm:text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
            >
              <option value="TODOS">Todos os Turnos</option>
              <option value="DIURNO">Diurno (06:00 às 18:00)</option>
              <option value="NOTURNO">Noturno (18:00 às 06:00)</option>
              <option value="MANHA">Manhã</option>
              <option value="TARDE">Tarde</option>
              <option value="NOITE">Noite</option>
            </select>
          </div>

          <div>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base sm:text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
            >
              <option value="TODOS">Todos os Status</option>
              <option value="EM_ANDAMENTO">Em Andamento</option>
              <option value="CONCLUIDO">Concluído</option>
            </select>
          </div>
        </div>

        {Boolean(user.roles?.includes('admin')) && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <MostrarExcluidosToggle
              visivel={true}
              checked={mostrarExcluidos}
              onChange={setMostrarExcluidos}
            />
          </div>
        )}

        {/* Barra de Seleção em Lote e Exportação Consolidada */}
        {plantoes.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="checkSelecionarTodos"
                checked={selecionadosIds.size === plantoes.length && plantoes.length > 0}
                onChange={selecionarTodos}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label
                htmlFor="checkSelecionarTodos"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {selecionadosIds.size === plantoes.length
                  ? `Todos os ${plantoes.length} selecionados`
                  : `Selecionar todos (${plantoes.length})`}
              </label>
            </div>

            {selecionadosIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {selecionadosIds.size} selecionado(s)
                </span>
                <button
                  type="button"
                  onClick={handleExportarConsolidado}
                  disabled={exportandoConsolidado}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                >
                  {exportandoConsolidado ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  Exportar PDF Consolidado ({selecionadosIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setSelecionadosIds(new Set())}
                  className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid de Plantões */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plantoes.map((p) => {
          const isSelected = selecionadosIds.has(p.id);
          const totalItens = (p.itens_conferidos || []).length;
          const itensOk = (p.itens_conferidos || []).filter((i) => i.conferido).length;
          const isCompleto = totalItens > 0 && itensOk === totalItens;
          // Encerrar/excluir só para o autor do plantão ou admin (espelha a RLS).
          const podeEditar = podeEditarFormulario(user, p);

          return (
            <div
              key={p.id}
              className={`flex flex-col justify-between rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md ${classeLinhaExcluida(p.excluido_em)} ${
                isSelected
                  ? 'border-indigo-400 bg-indigo-50/20 ring-2 ring-indigo-500/30 dark:border-indigo-600 dark:bg-indigo-950/20'
                  : 'border-slate-200 bg-white hover:border-indigo-500/40 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelecionado(p.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {p.numero_protocolo}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Plantão {p.turno}
                      </h3>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 justify-end">
                    {p.excluido_em && <BadgeExcluido em={p.excluido_em} />}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        p.status === 'EM_ANDAMENTO'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      {p.status === 'EM_ANDAMENTO' ? 'Em Aberto' : 'Concluído'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>{p.data.split('-').reverse().join('/')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>{p.horario_inicio} às {p.horario_fim}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs space-y-1.5 dark:border-slate-800 dark:bg-slate-950/60">
                  <p className="text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                    Equipe Escalada
                  </p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    <span className="font-bold text-slate-900 dark:text-slate-100">Portaria:</span> {p.vigilante_portaria}
                  </p>
                  {p.vigilante_ronda01 && (
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">Ronda 01:</span> {p.vigilante_ronda01}
                    </p>
                  )}
                  {p.vigilante_ronda02 && (
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">Ronda 02:</span> {p.vigilante_ronda02}
                    </p>
                  )}
                  {p.vigilante_anterior01 && (
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-800">
                      Recebido de: <span className="font-semibold text-slate-700 dark:text-slate-300">{p.vigilante_anterior01}{p.vigilante_anterior02 ? ` e ${p.vigilante_anterior02}` : ''}</span>
                    </p>
                  )}
                </div>

                {/* Status do Checklist de Materiais */}
                <div className="flex items-center justify-between rounded-xl bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <span className="flex items-center gap-1.5">
                    <Shield className="h-4 w-4" />
                    Custódia de Materiais
                  </span>
                  <span className={`font-mono font-bold ${isCompleto ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                    {itensOk}/{totalItens} conferidos
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPlantaoVisualizando(p)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver Detalhes
                  </button>
                  <button
                    type="button"
                    onClick={() => exportPassagemPlantaoPdf(p)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                    title="Exportar PDF Oficial (FRM.SGP-0010)"
                  >
                    <FileDown className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {p.excluido_em ? (
                    podeEditar && <RestaurarButton onClick={() => handleRestaurarPlantao(p)} />
                  ) : (
                    <>
                      {p.status === 'EM_ANDAMENTO' && podeEditar && (
                        <button
                          type="button"
                          onClick={() => setPlantaoParaEncerrar(p)}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500 shadow-xs"
                        >
                          Encerrar
                        </button>
                      )}
                      {podeEditar && (
                        <button
                          type="button"
                          onClick={() => setPlantaoParaExcluir(p)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer"
                          title="Excluir Plantão"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {plantoes.length === 0 && !loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum plantão registrado</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Clique em "Novo Plantão" para iniciar a conferência do posto.</p>
        </div>
      )}

      {/* Modal Novo Plantão / Passagem de Turno */}
      {modalNovoAberto && (
        <Modal onClose={() => setModalNovoAberto(false)} maxWidth="max-w-4xl">
          <ModalHeader onClose={() => setModalNovoAberto(false)}>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Nova Passagem de Plantão — Portaria TEN
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Formulário FRM.SGP-0010</p>
            </div>
          </ModalHeader>

          <form onSubmit={handleSalvar} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody className="space-y-5">
              {/* 1. Vigilante Preenchedor */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                <VigilanteSelect
                  label="Vigilante que está Preenchendo o Formulário"
                  required
                  value={formPreenchedor}
                  onChange={setFormPreenchedor}
                />
              </div>

              {/* 2. Dados do Turno e Horário */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data do Plantão *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Turno *
                  </label>
                  <select
                    value={formTurno}
                    onChange={(e) => setFormTurno(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="DIURNO">Diurno</option>
                    <option value="NOTURNO">Noturno</option>
                    <option value="MANHA">Manhã</option>
                    <option value="TARDE">Tarde</option>
                    <option value="NOITE">Noite</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Início
                    </label>
                    <input
                      type="time"
                      value={formHoraInicio}
                      onChange={(e) => setFormHoraInicio(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Fim
                    </label>
                    <input
                      type="time"
                      value={formHoraFim}
                      onChange={(e) => setFormHoraFim(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Escala Recebedora (Portaria, Ronda 1, Ronda 2) */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Escala de Vigilância do Turno
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <VigilanteSelect
                      label="Vigilante Portaria"
                      required
                      value={formPortaria}
                      onChange={setFormPortaria}
                      excludeNames={[formRonda01, formRonda02, formAnterior01, formAnterior02]}
                    />
                  </div>
                  <div>
                    <VigilanteSelect
                      label="Vigilante Ronda 01"
                      placeholder="Selecione ou digite..."
                      value={formRonda01}
                      onChange={setFormRonda01}
                      excludeNames={[formPortaria, formRonda02, formAnterior01, formAnterior02]}
                    />
                  </div>
                  <div>
                    <VigilanteSelect
                      label="Vigilante Ronda 02"
                      placeholder="Selecione ou digite..."
                      value={formRonda02}
                      onChange={setFormRonda02}
                      excludeNames={[formPortaria, formRonda01, formAnterior01, formAnterior02]}
                    />
                  </div>
                </div>
              </div>

              {/* 4. Plantão Anterior & Texto Declaratório */}
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Recebimento do Plantão Anterior
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <VigilanteSelect
                    label="Vigilante que Entregou 01"
                    required
                    placeholder="Selecione o vigilante anterior..."
                    value={formAnterior01}
                    onChange={setFormAnterior01}
                    excludeNames={[formAnterior02, formPortaria, formRonda01, formRonda02, formPreenchedor]}
                  />
                  <VigilanteSelect
                    label="Vigilante que Entregou 02 (Opcional)"
                    placeholder="Selecione o 2º vigilante se houver..."
                    value={formAnterior02}
                    onChange={setFormAnterior02}
                    excludeNames={[formAnterior01, formPortaria, formRonda01, formRonda02, formPreenchedor]}
                  />
                </div>

                {/* Caixa do Texto Padrão */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed italic">
                    "{textoDeclaracaoGerado}"
                  </p>
                </div>
              </div>

              {/* 5. Checklist Tátil de Materiais de Segurança */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Conferência de Materiais de Segurança *
                      </h4>
                      {formItens.some((i) => !i.conferido) && (
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-400">
                          {formItens.filter((i) => !i.conferido).length} Pendente(s)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Itens desmarcados exigem preenchimento obrigatório de justificativa / observação
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const todosMarcados = formItens.every((i) => i.conferido);
                      setFormItens(formItens.map((i) => ({ ...i, conferido: !todosMarcados })));
                    }}
                    className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400 self-start sm:self-auto"
                  >
                    {formItens.every((i) => i.conferido) ? 'Desmarcar Todos' : 'Marcar Todos'}
                  </button>
                </div>

                <div className="space-y-2.5">
                  {formItens.map((item, idx) => (
                    <div
                      key={item.material_id || idx}
                      onClick={() => alternarConferenciaItem(idx)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border p-3 cursor-pointer transition-all ${
                        item.conferido
                          ? 'border-emerald-300 bg-emerald-50/50 hover:border-emerald-400 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                          : 'border-rose-300 bg-rose-50/70 hover:border-rose-400 dark:border-rose-900/60 dark:bg-rose-950/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-all ${
                            item.conferido
                              ? 'border-emerald-500 bg-emerald-600 text-white'
                              : 'border-rose-400 bg-rose-100 text-rose-600 dark:border-rose-700 dark:bg-rose-950/60'
                          }`}
                        >
                          {item.conferido ? (
                            <Check className="h-4 w-4 stroke-[3]" />
                          ) : (
                            <X className="h-3.5 w-3.5 stroke-[2.5]" />
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                              {String(item.quantidade_esperada).padStart(2, '0')} {item.unidade || 'UN'}
                            </span>
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.nome}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                item.conferido
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                              }`}
                            >
                              {item.conferido ? 'Conferido OK' : 'Não Conferido (Pendente)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quantidade Conferida e Observação */}
                      <div
                        className="flex flex-col sm:flex-row sm:items-center gap-2 pl-9 sm:pl-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-500">Qtd:</span>
                          <input
                            type="number"
                            min={0}
                            value={item.quantidade_conferida ?? item.quantidade_esperada}
                            onChange={(e) => atualizarQtdConferida(idx, Number(e.target.value))}
                            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-center font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                        <div className="relative flex-1 sm:w-56">
                          <input
                            type="text"
                            required={!item.conferido}
                            placeholder={!item.conferido ? '* Justificativa obrigatória (falta/avaria)...' : 'Obs / avaria (opcional)...'}
                            value={item.observacao || ''}
                            onChange={(e) => atualizarObsItem(idx, e.target.value)}
                            className={`w-full rounded-lg px-2.5 py-1 text-xs uppercase dark:bg-slate-950 dark:text-slate-100 transition-colors ${
                              !item.conferido && !item.observacao?.trim()
                                ? 'border border-rose-400 bg-rose-50/50 text-rose-900 placeholder:text-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                                : 'border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 dark:border-slate-700'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 6. Observações Gerais */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações Gerais do Plantão (Opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Turno recebido sem novidades no pátio; todos os veículos da frota estacionados."
                  value={formObs}
                  onChange={(e) => setFormObs(e.target.value.toUpperCase())}
                  className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 p-3 text-base sm:text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalNovoAberto(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Passagem de Plantão
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Modal Detalhes do Plantão */}
      {plantaoVisualizando && (
        <Modal onClose={() => setPlantaoVisualizando(null)} maxWidth="max-w-3xl">
          <ModalHeader onClose={() => setPlantaoVisualizando(null)}>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Passagem de Plantão {plantaoVisualizando.numero_protocolo}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                {plantaoVisualizando.data.split('-').reverse().join('/')} · {plantaoVisualizando.turno} ({plantaoVisualizando.horario_inicio} às {plantaoVisualizando.horario_fim})
              </p>
            </div>
          </ModalHeader>

          <ModalBody className="space-y-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
              <p className="font-bold text-slate-900 dark:text-slate-100 mb-2">Equipe Escalada:</p>
              <p className="text-slate-700 dark:text-slate-300">
                • <span className="font-semibold">Portaria:</span> {plantaoVisualizando.vigilante_portaria}
              </p>
              {plantaoVisualizando.vigilante_ronda01 && (
                <p className="text-slate-700 dark:text-slate-300">
                  • <span className="font-semibold">Ronda 01:</span> {plantaoVisualizando.vigilante_ronda01}
                </p>
              )}
              {plantaoVisualizando.vigilante_ronda02 && (
                <p className="text-slate-700 dark:text-slate-300">
                  • <span className="font-semibold">Ronda 02:</span> {plantaoVisualizando.vigilante_ronda02}
                </p>
              )}
              {plantaoVisualizando.vigilante_preenchedor && (
                <p className="text-slate-700 dark:text-slate-300 mt-1">
                  • <span className="font-semibold">Preenchedor:</span> {plantaoVisualizando.vigilante_preenchedor}
                </p>
              )}
            </div>

            {/* Plantão Anterior */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
              <p className="font-bold text-slate-900 dark:text-slate-100 mb-1">Entregue por (Plantão Anterior):</p>
              <p className="text-slate-700 dark:text-slate-300">
                {plantaoVisualizando.vigilante_anterior_01}
                {plantaoVisualizando.vigilante_anterior_02 && ` e ${plantaoVisualizando.vigilante_anterior_02}`}
              </p>
              {plantaoVisualizando.texto_declaracao && (
                <p className="mt-2 text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  "{plantaoVisualizando.texto_declaracao}"
                </p>
              )}
            </div>

            {/* Itens Conferidos */}
            <div>
              <p className="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
                Conferência de Materiais de Segurança
              </p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {(plantaoVisualizando.itens_conferidos || []).map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${
                          it.conferido ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      >
                        {it.conferido ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{it.nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {it.quantidade_conferida ?? it.quantidade_esperada} / {it.quantidade_esperada} {it.unidade || 'UN'}
                      </span>
                      {it.observacao && (
                        <span className="text-[11px] text-slate-500 italic">({it.observacao})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Observações Gerais */}
            {plantaoVisualizando.observacoes && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
                <p className="font-bold text-slate-900 dark:text-slate-100 mb-1">Observações do Plantão:</p>
                <p className="text-slate-700 dark:text-slate-300">{plantaoVisualizando.observacoes}</p>
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            <button
              type="button"
              onClick={() => setPlantaoVisualizando(null)}
              className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => exportPassagemPlantaoPdf(plantaoVisualizando)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <FileDown className="h-4 w-4" />
              Gerar PDF Oficial (FRM.SGP-0010)
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Modal Encerrar Plantão */}
      {plantaoParaEncerrar && (
        <Modal onClose={() => setPlantaoParaEncerrar(null)} maxWidth="max-w-lg">
          <ModalHeader onClose={() => setPlantaoParaEncerrar(null)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Encerrar Plantão {plantaoParaEncerrar.numero_protocolo}
            </h3>
          </ModalHeader>

          <ModalBody className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Ao encerrar, o status passará para concluído e ficará registrado no histórico com os materiais entregues.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Observações de Encerramento (Opcional)
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Turno encerrado e entregue à equipe noturna sem pendências."
                value={obsEncerramento}
                onChange={(e) => setObsEncerramento(e.target.value.toUpperCase())}
                className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 p-3 text-base sm:text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </ModalBody>

          <ModalFooter>
            <button
              type="button"
              onClick={() => setPlantaoParaEncerrar(null)}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleEncerrarPlantao}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              Confirmar Encerramento
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Confirmação de Exclusão */}
      {plantaoParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Plantão da Portaria"
          mensagem={`Tem certeza que deseja excluir o plantão ${plantaoParaExcluir.numero_protocolo}? O registro será desativado e arquivado no banco de dados com a marcação de quem e quando foi excluído.`}
          confirmarLabel="Sim, Excluir"
          cancelarLabel="Cancelar"
          variante="perigo"
          onConfirmar={handleConfirmarExclusao}
          onCancelar={() => setPlantaoParaExcluir(null)}
        />
      )}
    </div>
  );
}
