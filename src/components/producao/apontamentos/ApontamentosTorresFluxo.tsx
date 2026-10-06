/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo de Produção — Apontamentos de Torres Eólicas
 *
 * Experiência Mobile Otimizada para Chão de Fábrica:
 * - Segmented controls touch-friendly para Nave 1 (3 Fábricas);
 * - Fila e seletor rápido de tramos com busca e chips horizontais nas Naves 2 e White;
 * - Checklist inteligente por tramo (identifica etapas já concluídas vs pendentes);
 * - Modal em formato Bottom Sheet no mobile, com botões de câmera de toque amplo (48px+);
 * - Feedback tátil (vibração) e tipografia de alto contraste para iluminação industrial.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Factory,
  FileImage,
  Filter,
  Flame,
  HelpCircle,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
  UploadCloud,
  Wind,
  X,
} from 'lucide-react';
import { useToast } from '../../ui/Toast';
import {
  FABRICAS_NAVE_1,
  PROCESSOS_NAVE_1,
  PROCESSOS_NAVE_2,
  PROCESSOS_NAVE_WHITE,
  TODOS_PROCESSOS,
  validarFormatoTramo,
  type FabricaNave1Id,
  type NaveProducaoId,
  type ProcessoApontamento,
} from '../../../lib/producaoTorres';
import {
  buscarTramoComApontamentos,
  listarApontamentosRecentes,
  listarTramosProducao,
  salvarApontamentoOperacao,
  type ApontamentoOperacaoDb,
  type FotoApontamento,
  type TramoProducaoDb,
} from '../../../lib/producaoTorresApi';
import { prepareAttachment, type PreparedAttachment } from '../../../lib/imageCompression';
import IndicadorProgressoTorre from '../IndicadorProgressoTorre';
import type { Profile } from '../../../types';

interface Props {
  user: Profile;
  onNavegarAlmoxarifado?: () => void;
}

type TabPrincipal = 'nave1' | 'nave2' | 'white' | 'progresso_torre' | 'historico';

export default function ApontamentosTorresFluxo({ user, onNavegarAlmoxarifado }: Props) {
  const toast = useToast();

  const [tabAtiva, setTabAtiva] = useState<TabPrincipal>('nave1');
  const [fabricaN1, setFabricaN1] = useState<FabricaNave1Id>('fabrica1');

  // Estados dos dados
  const [tramos, setTramos] = useState<TramoProducaoDb[]>([]);
  const [apontamentosRecentes, setApontamentosRecentes] = useState<ApontamentoOperacaoDb[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Tramo selecionado para operação na Nave 2 ou White
  const [tramoOperacao, setTramoOperacao] = useState<string>('');
  const [buscaTramoFila, setBuscaTramoFila] = useState('');

  // Apontamentos detalhados do tramo atualmente selecionado
  const [aptsTramoAtivo, setAptsTramoAtivo] = useState<ApontamentoOperacaoDb[]>([]);
  const [carregandoTramoAtivo, setCarregandoTramoAtivo] = useState(false);

  // Filtro de histórico
  const [filtroHistoricoNave, setFiltroHistoricoNave] = useState<'todas' | NaveProducaoId>('todas');
  const [buscaHistorico, setBuscaHistorico] = useState('');

  // Formulário do processo selecionado para apontar
  const [processoModal, setProcessoModal] = useState<ProcessoApontamento | null>(null);
  const [virolaInput, setVirolaInput] = useState('');
  const [opInput, setOpInput] = useState('');
  const [tramoInput, setTramoInput] = useState('');
  const [obsInput, setObsInput] = useState('');
  const [fotos, setFotos] = useState<PreparedAttachment[]>([]);
  const [fotoAmpliada, setFotoAmpliada] = useState<FotoApontamento | null>(null);

  // Carregar dados iniciais
  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [listaTramos, listaApts] = await Promise.all([
        listarTramosProducao(),
        listarApontamentosRecentes(),
      ]);
      setTramos(listaTramos);
      setApontamentosRecentes(listaApts);
      setTramoOperacao(atual => atual || (listaTramos.length > 0 ? listaTramos[0].codigo_tramo : ''));
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível carregar os dados de apontamentos.');
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Carregar apontamentos específicos do tramo ativo quando selecionado
  const carregarApontamentosDoTramo = useCallback(async (cod: string) => {
    if (!cod) {
      setAptsTramoAtivo([]);
      return;
    }
    setCarregandoTramoAtivo(true);
    try {
      const res = await buscarTramoComApontamentos(cod);
      setAptsTramoAtivo(res.apontamentos);
    } catch (e) {
      console.warn('Erro ao carregar histórico do tramo selecionado:', e);
    } finally {
      setCarregandoTramoAtivo(false);
    }
  }, []);

  useEffect(() => {
    if (tramoOperacao) {
      carregarApontamentosDoTramo(tramoOperacao);
    }
  }, [tramoOperacao, carregarApontamentosDoTramo]);

  // Mapa de processos concluídos do tramo ativo
  const processosConcluidosSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of aptsTramoAtivo) {
      if (a.realizado) s.add(a.processo_id);
    }
    return s;
  }, [aptsTramoAtivo]);

  // Obter apontamento do tramo para um processo específico
  const getApontamentoDoTramo = useCallback(
    (processoId: string) => {
      return aptsTramoAtivo.find(a => a.processo_id === processoId && a.realizado);
    },
    [aptsTramoAtivo],
  );

  // Obter o último apontamento de um processo em toda a fábrica (para a Nave 1)
  const getUltimoApontamentoFabrica = useCallback(
    (processoId: string) => {
      return apontamentosRecentes.find(a => a.processo_id === processoId);
    },
    [apontamentosRecentes],
  );

  // Filtragem de tramos por nave (Fila)
  const filaNave2 = useMemo(
    () => tramos.filter(t => t.estagio_atual === 'nave2'),
    [tramos],
  );

  const filaNaveWhite = useMemo(
    () => tramos.filter(t => t.estagio_atual === 'white'),
    [tramos],
  );

  const filaAlmoxarifado = useMemo(
    () => tramos.filter(t => t.estagio_atual === 'expedicao_almoxarifado'),
    [tramos],
  );

  // Tramo ativo objeto completo
  const tramoAtivoObj = useMemo(
    () => tramos.find(t => t.codigo_tramo === tramoOperacao) || null,
    [tramos, tramoOperacao],
  );

  // Abrir modal de apontamento para um determinado processo
  const handleAbrirApontamento = (proc: ProcessoApontamento, codigoTramoFixo?: string) => {
    setProcessoModal(proc);
    setObsInput('');
    setFotos([]);
    setVirolaInput('');
    setOpInput('');
    const tramoSugerido = codigoTramoFixo || tramoOperacao || '';
    setTramoInput(tramoSugerido);
  };

  // Upload e compressão de fotos pelo usuário (Regra 1 AGENTS.md)
  const handleAdicionarFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const novasFotos: PreparedAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const prep = await prepareAttachment(file);
        novasFotos.push(prep);
      }
      setFotos(prev => [...prev, ...novasFotos]);
      toast.success(`${files.length} imagem(ns) comprimida(s) com sucesso.`);
    } catch (err) {
      console.error(err);
      toast.error('Falha ao processar imagens da câmera.');
    } finally {
      e.target.value = '';
    }
  };

  // Submeter apontamento
  const handleSalvarApontamento = async () => {
    if (!processoModal) return;

    // Se for no Marco-Porta, numeração TX-XXXX é obrigatória
    if (processoModal.id === 'marco_porta') {
      if (!tramoInput.trim()) {
        toast.error('O número do Tramo (formato TX-XXXX) é obrigatório no Marco-Porta.');
        return;
      }
      if (!validarFormatoTramo(tramoInput)) {
        toast.error('Formato inválido. Use o padrão TX-XXXX (ex: T1-3143).');
        return;
      }
    }

    // Se a etapa exige confirmação do tramo na Nave 2
    if (processoModal.exigeConfirmacaoTramo && !tramoInput.trim()) {
      toast.error('Confirme a numeração do tramo TX-XXXX para esta liberação.');
      return;
    }

    setSalvando(true);
    try {
      const resultado = await salvarApontamentoOperacao(
        {
          nave: processoModal.nave,
          fabrica: processoModal.fabrica,
          processoId: processoModal.id,
          processoNome: processoModal.nome,
          virolaNumero: virolaInput.trim() || undefined,
          opNumero: opInput.trim() || undefined,
          tramoCodigo: tramoInput.trim() || undefined,
          observacao: obsInput.trim() || undefined,
          realizado: true,
          usuarioId: user.id,
          usuarioNome: user.name ?? undefined,
        },
        fotos,
      );

      // Feedback tátil em dispositivos móveis compatíveis
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(40);
        } catch {
          // ignore
        }
      }

      toast.success(`Apontamento ${resultado.codigo} registrado com sucesso!`);
      const codigoSalvo = tramoInput.trim();
      setProcessoModal(null);
      await recarregar();
      if (codigoSalvo) {
        setTramoOperacao(codigoSalvo);
        await carregarApontamentosDoTramo(codigoSalvo);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar apontamento.');
    } finally {
      setSalvando(false);
    }
  };

  // Histórico filtrado
  const historicoFiltrado = useMemo(() => {
    return apontamentosRecentes.filter(apt => {
      if (filtroHistoricoNave !== 'todas' && apt.nave !== filtroHistoricoNave) return false;
      if (buscaHistorico.trim()) {
        const termo = buscaHistorico.toLowerCase();
        const matchTramo = apt.tramo_codigo?.toLowerCase().includes(termo);
        const matchProc = apt.processo_nome.toLowerCase().includes(termo);
        const matchVirola = apt.virola_numero?.toLowerCase().includes(termo);
        const matchOp = apt.op_numero?.toLowerCase().includes(termo);
        const matchOpNome = apt.criado_por_nome?.toLowerCase().includes(termo);
        return matchTramo || matchProc || matchVirola || matchOp || matchOpNome;
      }
      return true;
    });
  }, [apontamentosRecentes, filtroHistoricoNave, buscaHistorico]);

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------------------- */}
      {/* 1. NAVEGAÇÃO SUPERIOR RESPONSIVA & MOBILE-FIRST POR NAVES */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800/70 max-w-full">
          {/* Nave 1 */}
          <button
            type="button"
            onClick={() => setTabAtiva('nave1')}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
              tabAtiva === 'nave1'
                ? 'bg-white text-orange-700 shadow-sm dark:bg-slate-900 dark:text-orange-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Factory className="h-4 w-4 shrink-0 text-orange-600" />
            <span>Nave 1</span>
            <span className="hidden sm:inline text-[11px] font-normal text-slate-400">(3 Fábricas)</span>
          </button>

          {/* Nave 2 */}
          <button
            type="button"
            onClick={() => setTabAtiva('nave2')}
            className={`relative flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
              tabAtiva === 'nave2'
                ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-900 dark:text-sky-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Flame className="h-4 w-4 shrink-0 text-sky-600" />
            <span>Nave 2</span>
            {filaNave2.length > 0 && (
              <span className="rounded-full bg-sky-600 px-1.5 py-0.2 text-[10px] font-black text-white">
                {filaNave2.length}
              </span>
            )}
          </button>

          {/* Nave White */}
          <button
            type="button"
            onClick={() => setTabAtiva('white')}
            className={`relative flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
              tabAtiva === 'white'
                ? 'bg-white text-amber-700 shadow-sm dark:bg-slate-900 dark:text-amber-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
            <span>White</span>
            {filaNaveWhite.length > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                {filaNaveWhite.length}
              </span>
            )}
          </button>

          {/* Indicador Torre */}
          <button
            type="button"
            onClick={() => setTabAtiva('progresso_torre')}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
              tabAtiva === 'progresso_torre'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40'
            }`}
          >
            <Wind className="h-4 w-4 shrink-0" />
            <span>Torre</span>
            <span className="hidden sm:inline text-[11px] font-normal">SVG</span>
          </button>

          {/* Histórico */}
          <button
            type="button"
            onClick={() => setTabAtiva('historico')}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
              tabAtiva === 'historico'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span>Histórico</span>
          </button>
        </div>

        {/* Botão Atualizar */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={recarregar}
            disabled={carregando}
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* ABA 1: NAVE 1 (Preparo da Chapa, Virolas e Montagem Estrutural Inicial) */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'nave1' && (
        <div className="space-y-4">
          {/* Seletor Segmentado de Fábricas da Nave 1 (Otimizado Mobile) */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar rounded-2xl bg-orange-50/80 p-1.5 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-900/40">
            {FABRICAS_NAVE_1.map(fab => {
              const ativa = fabricaN1 === fab.id;
              return (
                <button
                  key={fab.id}
                  type="button"
                  onClick={() => setFabricaN1(fab.id)}
                  className={`flex flex-1 min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-[0.98] ${
                    ativa
                      ? 'bg-orange-600 text-white shadow-md'
                      : 'text-orange-900 hover:bg-orange-100/60 dark:text-orange-200 dark:hover:bg-orange-900/40'
                  }`}
                >
                  <span className="truncate">{fab.subtitulo}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                      ativa ? 'bg-orange-700/80 text-white' : 'bg-orange-200/70 text-orange-900 dark:bg-orange-900/60 dark:text-orange-200'
                    }`}
                  >
                    {fab.processos.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Banner Resumo da Fábrica Ativa */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-600">
                  {FABRICAS_NAVE_1.find(f => f.id === fabricaN1)?.nome}
                </span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  {FABRICAS_NAVE_1.find(f => f.id === fabricaN1)?.subtitulo}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {FABRICAS_NAVE_1.find(f => f.id === fabricaN1)?.descricao}
                </p>
              </div>
              {fabricaN1 === 'fabrica3' && (
                <span className="inline-flex items-center gap-1 self-start sm:self-auto rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 shrink-0">
                  ★ Marco-Porta oficializa o Tramo TX-XXXX
                </span>
              )}
            </div>
          </div>

          {/* Lista de Processos da Fábrica Selecionada */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FABRICAS_NAVE_1.find(f => f.id === fabricaN1)?.processos.map(proc => {
              const ultimoApt = getUltimoApontamentoFabrica(proc.id);

              return (
                <div
                  key={proc.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition ${
                    proc.oficializaTramo
                      ? 'border-orange-400 bg-gradient-to-br from-orange-50/70 to-amber-50/40 dark:border-orange-800 dark:from-orange-950/30 dark:to-amber-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-400">Etapa {proc.ordem}</span>
                      {proc.oficializaTramo && (
                        <span className="rounded bg-orange-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-xs">
                          Criação do Tramo TX-XXXX
                        </span>
                      )}
                    </div>

                    <h4 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50">
                      {proc.nome}
                    </h4>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {proc.descricao}
                    </p>

                    {/* Destaque do Último Lançamento desta Etapa */}
                    {ultimoApt && (
                      <div className="mt-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span>
                          Último:{' '}
                          <strong>
                            {ultimoApt.virola_numero ? `Virola ${ultimoApt.virola_numero}` : ''}
                            {ultimoApt.op_numero ? ` (OP ${ultimoApt.op_numero})` : ''}
                            {ultimoApt.tramo_codigo ? ` • Tramo ${ultimoApt.tramo_codigo}` : ''}
                          </strong>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(ultimoApt.data_apontamento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span className="text-[11px] font-medium text-slate-500">
                      {proc.oficializaTramo ? 'Obrigatório TX-XXXX' : 'Foto + OP / Virola'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAbrirApontamento(proc)}
                      className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4" />
                      Lançar Realizado
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* ABA 2: NAVE 2 (Soldagem e Preparação Interna com Fila de Tramos) */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'nave2' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3.5 sm:p-4 dark:border-sky-950 dark:bg-sky-950/20">
            <h3 className="text-sm sm:text-base font-bold text-sky-950 dark:text-sky-100">
              Nave 2: Soldagem e Preparação Interna
            </h3>
            <p className="text-xs text-sky-800 dark:text-sky-300 mt-0.5">
              Tramos liberados pela Montagem Estrutural (Marco-Porta). Selecione o tramo para apontar ou verificar etapas.
            </p>
          </div>

          {/* Fila de Tramos na Nave 2 com Busca e Chips Horizontais */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Fila de Tramos na Nave 2 ({filaNave2.length})
              </h4>
              {filaNave2.length > 5 && (
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={buscaTramoFila}
                    onChange={e => setBuscaTramoFila(e.target.value.toUpperCase())}
                    placeholder="Filtrar tramo..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-2 text-xs font-mono font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}
            </div>

            {filaNave2.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 sm:p-8 text-center text-xs text-slate-500 dark:border-slate-800">
                Nenhum tramo na fila da Nave 2 no momento. Conclua o Marco-Porta na Nave 1 para liberar novos tramos.
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {filaNave2
                  .filter(t => !buscaTramoFila.trim() || t.codigo_tramo.includes(buscaTramoFila.trim()))
                  .map(t => {
                    const ativo = tramoOperacao === t.codigo_tramo;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTramoOperacao(t.codigo_tramo)}
                        className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                          ativo
                            ? 'border-sky-600 bg-sky-50 ring-2 ring-sky-500/40 dark:border-sky-500 dark:bg-sky-950/50'
                            : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                        }`}
                      >
                        <span className="font-mono text-sm font-black text-slate-900 dark:text-slate-100">
                          {t.codigo_tramo}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            ativo ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {t.percentual_conclusao}%
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Cartão de Destaque do Tramo Selecionado */}
          {tramoOperacao && (
            <div className="rounded-2xl border border-sky-200 bg-white p-3.5 sm:p-4 shadow-sm dark:border-sky-900/60 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600">
                    Tramo Selecionado
                  </span>
                  <h3 className="font-mono text-lg sm:text-xl font-black text-slate-900 dark:text-slate-50">
                    {tramoOperacao}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500">Progresso Geral</span>
                    <p className="text-sm font-black text-sky-600">
                      {tramoAtivoObj?.percentual_conclusao ?? 0}%
                    </p>
                  </div>
                  <div className="h-8 w-8 rounded-full border border-sky-200 flex items-center justify-center bg-sky-50 dark:border-sky-800 dark:bg-sky-950">
                    {carregandoTramoAtivo ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                    ) : (
                      <Layers className="h-4 w-4 text-sky-600" />
                    )}
                  </div>
                </div>
              </div>

              {/* Checklist de Processos da Nave 2 para o Tramo Selecionado */}
              <div className="mt-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Processos da Nave 2 ({PROCESSOS_NAVE_2.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    {PROCESSOS_NAVE_2.filter(p => processosConcluidosSet.has(p.id)).length} de {PROCESSOS_NAVE_2.length} concluídos
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {PROCESSOS_NAVE_2.map(proc => {
                    const concluido = processosConcluidosSet.has(proc.id);
                    const aptInfo = getApontamentoDoTramo(proc.id);

                    return (
                      <div
                        key={proc.id}
                        className={`flex flex-col justify-between rounded-xl border p-3.5 transition ${
                          concluido
                            ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-bold text-slate-400">Etapa {proc.ordem}</span>
                            {concluido ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <Check className="h-3 w-3" /> Concluído
                              </span>
                            ) : proc.exigeConfirmacaoTramo ? (
                              <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                                Confirmação TX-XXXX
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                Pendente
                              </span>
                            )}
                          </div>

                          <h5 className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-50">
                            {proc.nome}
                          </h5>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {proc.descricao}
                          </p>

                          {/* Se concluído, mostrar detalhes de quem apontou */}
                          {concluido && aptInfo && (
                            <div className="mt-2 text-[11px] text-emerald-800 dark:text-emerald-300">
                              Apontado em{' '}
                              <strong>{new Date(aptInfo.data_apontamento).toLocaleString('pt-BR')}</strong>
                              {aptInfo.criado_por_nome ? ` por ${aptInfo.criado_por_nome}` : ''}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                          <span className="text-[11px] font-medium text-slate-500">
                            {concluido ? 'Registrado' : 'Foto obrigatória'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAbrirApontamento(proc, tramoOperacao)}
                            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm transition active:scale-[0.98] ${
                              concluido
                                ? 'bg-slate-600 hover:bg-slate-700'
                                : 'bg-sky-600 hover:bg-sky-700'
                            }`}
                          >
                            {concluido ? <RefreshCw className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
                            {concluido ? 'Re-apontar' : 'Lançar Realizado'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* ABA 3: NAVE WHITE (Tratamento de Superfície e Acabamento) */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'white' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-3.5 sm:p-4 dark:border-amber-950 dark:bg-amber-950/20">
            <h3 className="text-sm sm:text-base font-bold text-amber-950 dark:text-amber-100">
              Nave White: Tratamento de Superfície e Acabamento
            </h3>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              Tramos liberados pela Nave 2. A conclusão da Montagem Final libera o tramo para o Pátio / Almoxarifado.
            </p>
          </div>

          {/* Fila de Tramos na Nave White com Chips Horizontais */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Fila de Tramos na Nave White ({filaNaveWhite.length})
              </h4>
              {filaNaveWhite.length > 5 && (
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={buscaTramoFila}
                    onChange={e => setBuscaTramoFila(e.target.value.toUpperCase())}
                    placeholder="Filtrar tramo..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-2 text-xs font-mono font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}
            </div>

            {filaNaveWhite.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 sm:p-8 text-center text-xs text-slate-500 dark:border-slate-800">
                Nenhum tramo na fila da Nave White. Conclua a Liberação para White na Nave 2 para alimentar esta fila.
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {filaNaveWhite
                  .filter(t => !buscaTramoFila.trim() || t.codigo_tramo.includes(buscaTramoFila.trim()))
                  .map(t => {
                    const ativo = tramoOperacao === t.codigo_tramo;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTramoOperacao(t.codigo_tramo)}
                        className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                          ativo
                            ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400/40 dark:border-amber-500 dark:bg-amber-950/50'
                            : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                        }`}
                      >
                        <span className="font-mono text-sm font-black text-slate-900 dark:text-slate-100">
                          {t.codigo_tramo}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            ativo ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {t.percentual_conclusao}%
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Cartão de Destaque do Tramo Selecionado na White */}
          {tramoOperacao && (
            <div className="rounded-2xl border border-amber-200 bg-white p-3.5 sm:p-4 shadow-sm dark:border-amber-900/60 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                    Tramo Selecionado
                  </span>
                  <h3 className="font-mono text-lg sm:text-xl font-black text-slate-900 dark:text-slate-50">
                    {tramoOperacao}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500">Progresso Geral</span>
                    <p className="text-sm font-black text-amber-600">
                      {tramoAtivoObj?.percentual_conclusao ?? 0}%
                    </p>
                  </div>
                  <div className="h-8 w-8 rounded-full border border-amber-200 flex items-center justify-center bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                    {carregandoTramoAtivo ? (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-amber-600" />
                    )}
                  </div>
                </div>
              </div>

              {/* Checklist de Processos da Nave White */}
              <div className="mt-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Processos de Superfície e Acabamento ({PROCESSOS_NAVE_WHITE.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    {PROCESSOS_NAVE_WHITE.filter(p => processosConcluidosSet.has(p.id)).length} de {PROCESSOS_NAVE_WHITE.length} concluídos
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {PROCESSOS_NAVE_WHITE.map(proc => {
                    const concluido = processosConcluidosSet.has(proc.id);
                    const aptInfo = getApontamentoDoTramo(proc.id);

                    return (
                      <div
                        key={proc.id}
                        className={`flex flex-col justify-between rounded-xl border p-3.5 transition ${
                          concluido
                            ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-bold text-slate-400">Etapa {proc.ordem}</span>
                            {concluido ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <Check className="h-3 w-3" /> Concluído
                              </span>
                            ) : proc.id === 'montagem_final' ? (
                              <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-xs">
                                Libera p/ Expedição
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                Pendente
                              </span>
                            )}
                          </div>

                          <h5 className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-50">
                            {proc.nome}
                          </h5>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {proc.descricao}
                          </p>

                          {concluido && aptInfo && (
                            <div className="mt-2 text-[11px] text-emerald-800 dark:text-emerald-300">
                              Apontado em{' '}
                              <strong>{new Date(aptInfo.data_apontamento).toLocaleString('pt-BR')}</strong>
                              {aptInfo.criado_por_nome ? ` por ${aptInfo.criado_por_nome}` : ''}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                          <span className="text-[11px] font-medium text-slate-500">
                            {concluido ? 'Registrado' : 'Foto comprobatória'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAbrirApontamento(proc, tramoOperacao)}
                            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm transition active:scale-[0.98] ${
                              concluido
                                ? 'bg-slate-600 hover:bg-slate-700'
                                : proc.id === 'montagem_final'
                                ? 'bg-emerald-600 hover:bg-emerald-700'
                                : 'bg-amber-600 hover:bg-amber-700'
                            }`}
                          >
                            {concluido ? <RefreshCw className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
                            {concluido ? 'Re-apontar' : 'Lançar Realizado'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tramos Concluídos e Liberados para o Almoxarifado / Pátio */}
          {filaAlmoxarifado.length > 0 && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-950 dark:bg-emerald-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-emerald-600" />
                    Tramos Concluídos no Pátio / Expedição ({filaAlmoxarifado.length})
                  </h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Concluíram a Montagem Final e estão liberados para a Expedição do Almoxarifado.
                  </p>
                </div>
                {onNavegarAlmoxarifado && (
                  <button
                    type="button"
                    onClick={onNavegarAlmoxarifado}
                    className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98]"
                  >
                    Ver no Almoxarifado <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {filaAlmoxarifado.map(t => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 font-mono text-xs font-bold text-emerald-950 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {t.codigo_tramo} (100%)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* ABA 4: INDICADOR VISUAL DE PROGRESSO DA TORRE EÓLICA */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'progresso_torre' && (
        <IndicadorProgressoTorre
          tramos={tramos}
          apontamentos={apontamentosRecentes}
          tramoSelecionadoCodigo={tramoOperacao}
          onSelecionarTramo={cod => setTramoOperacao(cod)}
          onApontarProcesso={(proc, codTramo) => handleAbrirApontamento(proc, codTramo)}
        />
      )}

      {/* -------------------------------------------------------------------- */}
      {/* ABA 5: HISTÓRICO DE APONTAMENTOS (Feed Mobile Industrial) */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'historico' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Histórico Recente de Apontamentos
              </h3>
              <p className="text-xs text-slate-500">
                Últimos registros operacionais em todas as naves da fábrica.
              </p>
            </div>

            {/* Filtros por Nave */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  { id: 'todas', label: 'Todas' },
                  { id: 'nave1', label: 'Nave 1' },
                  { id: 'nave2', label: 'Nave 2' },
                  { id: 'white', label: 'White' },
                ] as const
              ).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroHistoricoNave(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    filtroHistoricoNave === f.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campo de Busca Rápida no Histórico */}
          <div className="mt-3 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={buscaHistorico}
              onChange={e => setBuscaHistorico(e.target.value)}
              placeholder="Buscar por Tramo, Virola, OP ou Operador..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {historicoFiltrado.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Nenhum apontamento encontrado com os filtros selecionados.
              </p>
            ) : (
              historicoFiltrado.map(apt => (
                <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                        {apt.codigo}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {apt.processo_nome}
                      </span>
                      {apt.tramo_codigo && (
                        <span className="rounded bg-blue-100 px-2 py-0.2 font-mono text-[11px] font-black text-blue-900 dark:bg-blue-950 dark:text-blue-200">
                          {apt.tramo_codigo}
                        </span>
                      )}
                      <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300 uppercase">
                        {apt.nave}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-slate-500">
                      Apontado por <strong>{apt.criado_por_nome || 'Operador'}</strong> em{' '}
                      {new Date(apt.data_apontamento).toLocaleString('pt-BR')}
                      {apt.virola_numero && ` • Virola: ${apt.virola_numero}`}
                      {apt.op_numero && ` • OP: ${apt.op_numero}`}
                    </p>

                    {apt.observacao && (
                      <p className="mt-1 text-xs italic text-slate-600 dark:text-slate-300">
                        "{apt.observacao}"
                      </p>
                    )}
                  </div>

                  {apt.fotos && apt.fotos.length > 0 && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {apt.fotos.map((f, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setFotoAmpliada(f)}
                          className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800"
                          title="Clique para ampliar"
                        >
                          {f.url ? (
                            <img src={f.url} alt={f.nome} className="h-full w-full object-cover" />
                          ) : (
                            <FileImage className="h-5 w-5 text-slate-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* MODAL / BOTTOM SHEET DE APONTAMENTO OPERACIONAL (MOBILE ERGONÔMICO) */}
      {/* -------------------------------------------------------------------- */}
      {processoModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div
            className="flex max-h-[94vh] sm:max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            {/* Alça visual de arraste no mobile */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto my-2.5 sm:hidden shrink-0" />

            {/* Cabeçalho do Modal */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-5 pb-3 pt-1 dark:border-slate-800">
              <div>
                <span className="text-[11px] font-bold uppercase text-orange-600 dark:text-orange-400">
                  {processoModal.nave === 'nave1'
                    ? 'Nave 1'
                    : processoModal.nave === 'nave2'
                    ? 'Nave 2'
                    : 'Nave White'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50">
                  {processoModal.nome}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProcessoModal(null)}
                className="flex h-11 w-11 items-center justify-center rounded-xl p-1 text-slate-400 hover:bg-slate-100 active:scale-[0.95] dark:hover:bg-slate-800"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Corpo Rolável do Formulário */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 sm:px-5 py-4 text-xs">
              {/* Seção de Rastreabilidade (OP / Virola) para Nave 1 */}
              {processoModal.nave === 'nave1' && processoModal.id !== 'marco_porta' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Nº da Virola
                    </label>
                    <input
                      type="text"
                      value={virolaInput}
                      onChange={e => setVirolaInput(e.target.value)}
                      placeholder="Ex: V1, V2A..."
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Ordem de Produção (OP)
                    </label>
                    <input
                      type="text"
                      value={opInput}
                      onChange={e => setOpInput(e.target.value)}
                      placeholder="Ex: OP-10492"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}

              {/* Campo Obrigatório de Tramo TX-XXXX no Marco-Porta e Nave 2 */}
              {(processoModal.id === 'marco_porta' || processoModal.exigeConfirmacaoTramo) && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3.5 dark:border-orange-950 dark:bg-orange-950/30">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-orange-900 dark:text-orange-200 text-xs sm:text-sm">
                      Numeração do Tramo (TX-XXXX) *
                    </label>
                    <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Obrigatório
                    </span>
                  </div>
                  <input
                    type="text"
                    value={tramoInput}
                    onChange={e => setTramoInput(e.target.value.toUpperCase())}
                    placeholder="Ex: T1-3143"
                    className="mt-2 h-13 w-full rounded-xl border border-orange-300 bg-white px-3 font-mono text-lg font-black tracking-wider text-orange-950 focus:border-orange-500 focus:outline-none dark:border-orange-800 dark:bg-slate-900 dark:text-orange-100"
                  />
                  {/* Botão de Atalho para Preencher com o Tramo Ativo se houver */}
                  {tramoOperacao && tramoInput !== tramoOperacao && (
                    <button
                      type="button"
                      onClick={() => setTramoInput(tramoOperacao)}
                      className="mt-2 flex items-center gap-1 text-[11px] font-bold text-orange-700 hover:underline dark:text-orange-300"
                    >
                      <ArrowRight className="h-3 w-3" /> Usar tramo selecionado ({tramoOperacao})
                    </button>
                  )}
                  <p className="mt-1 text-[11px] text-orange-800 dark:text-orange-300">
                    {processoModal.id === 'marco_porta'
                      ? 'Este registro oficializa a criação do tramo e o libera automaticamente para a Nave 2.'
                      : 'Confirme a identificação física do tramo antes de liberar.'}
                  </p>
                </div>
              )}

              {/* Se for etapa em tramo já existente sem confirmação explícita */}
              {tramoInput && processoModal.id !== 'marco_porta' && !processoModal.exigeConfirmacaoTramo && (
                <div>
                  <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                    Tramo Vinculado
                  </label>
                  <input
                    type="text"
                    disabled
                    value={tramoInput}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 font-mono text-base font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                </div>
              )}

              {/* Ação Primária de Foto: Câmera + Galeria */}
              <div>
                <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300 text-xs">
                  Foto Comprobatória da Peça / Etapa
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Botão Câmera Direta */}
                  <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-blue-700">
                    <Camera className="h-4 w-4" />
                    Tirar Foto (Câmera)
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handleAdicionarFotos}
                      className="hidden"
                    />
                  </label>

                  {/* Botão Galeria */}
                  <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 transition active:scale-[0.98] hover:bg-slate-100">
                    <FileImage className="h-4 w-4 text-slate-500" />
                    Galeria / Arquivo
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleAdicionarFotos}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Fotos são comprimidas automaticamente (1600px, JPEG 0.82)</span>
                  <span className="font-bold text-blue-600">
                    {fotos.length === 0 ? 'Nenhuma foto' : `${fotos.length} foto(s)`}
                  </span>
                </div>

                {/* Previews das Fotos Adicionadas */}
                {fotos.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {fotos.map((f, i) => (
                      <div
                        key={i}
                        className="relative h-18 w-18 overflow-hidden rounded-xl border border-slate-200 shadow-sm"
                      >
                        {f.previewUrl ? (
                          <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px]">
                            Foto
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setFotos(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-xs text-white hover:bg-black active:scale-[0.9]"
                          aria-label="Remover foto"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Observações Técnicas */}
              <div>
                <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                  Observações Técnicas (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={obsInput}
                  onChange={e => setObsInput(e.target.value)}
                  placeholder="Máquina, turno, observações operacionais..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Rodapé Fixo do Modal / Bottom Sheet */}
            <div className="flex shrink-0 flex-col-reverse sm:flex-row items-center justify-end gap-2 border-t border-slate-200 p-4 sm:p-5 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setProcessoModal(null)}
                disabled={salvando}
                className="h-12 w-full sm:w-auto rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarApontamento}
                disabled={salvando}
                className="flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
              >
                {salvando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Confirmar Realizado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* MODAL DE FOTO AMPLIADA */}
      {/* -------------------------------------------------------------------- */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
          onClick={() => setFotoAmpliada(null)}
        >
          <div
            className="relative max-w-2xl w-full rounded-2xl bg-white p-3 shadow-2xl dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[80%]">
                {fotoAmpliada.nome}
              </span>
              <button
                type="button"
                onClick={() => setFotoAmpliada(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>
            {fotoAmpliada.url ? (
              <img
                src={fotoAmpliada.url}
                alt=""
                className="max-h-[80vh] w-full rounded-xl object-contain bg-slate-950"
              />
            ) : (
              <div className="flex h-48 w-full items-center justify-center text-xs text-slate-400">
                Sem preview disponível
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
