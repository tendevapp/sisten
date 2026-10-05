/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo de Produção — Apontamentos de Torres Eólicas
 *
 * Fluxo operacional completo do PRD:
 * - Nave 1 dividida em 3 Fábricas (Chapa -> Virola -> Montagem Estrutural Inicial com criação do TX-XXXX);
 * - Nave 2 com fila de tramos recebidos da Nave 1;
 * - Nave White com fila de tramos recebidos da Nave 2 e liberação para Almoxarifado;
 * - Indicador de Progresso Visual SVG da Torre Eólica.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Factory,
  FileImage,
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

  // Abrir modal de apontamento para um determinado processo
  const handleAbrirApontamento = (proc: ProcessoApontamento, codigoTramoFixo?: string) => {
    setProcessoModal(proc);
    setObsInput('');
    setFotos([]);
    setVirolaInput('');
    setOpInput('');
    setTramoInput(codigoTramoFixo || tramoOperacao || '');
  };

  // Upload e compressão de fotos pelo usuário
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

      toast.success(`Apontamento ${resultado.codigo} registrado com sucesso!`);
      setProcessoModal(null);
      await recarregar();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar apontamento.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Navegação Superior por Naves + Progresso da Torre */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800/60 max-w-full">
          <button
            type="button"
            onClick={() => setTabAtiva('nave1')}
            className={`flex min-h-[44px] shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tabAtiva === 'nave1'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Factory className="h-4 w-4 text-orange-600" />
            Nave 1 (3 Fábricas)
          </button>

          <button
            type="button"
            onClick={() => setTabAtiva('nave2')}
            className={`relative flex min-h-[44px] shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tabAtiva === 'nave2'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Flame className="h-4 w-4 text-sky-600" />
            Nave 2 (Soldagem)
            {filaNave2.length > 0 && (
              <span className="ml-1 rounded-full bg-sky-600 px-1.5 py-0.2 text-[10px] font-black text-white">
                {filaNave2.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTabAtiva('white')}
            className={`relative flex min-h-[44px] shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tabAtiva === 'white'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            Nave White
            {filaNaveWhite.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                {filaNaveWhite.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTabAtiva('progresso_torre')}
            className={`flex min-h-[44px] shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tabAtiva === 'progresso_torre'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40'
            }`}
          >
            <Wind className="h-4 w-4" />
            Indicador da Torre
          </button>

          <button
            type="button"
            onClick={() => setTabAtiva('historico')}
            className={`flex min-h-[44px] shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tabAtiva === 'historico'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="h-4 w-4" />
            Histórico
          </button>
        </div>

        <button
          type="button"
          onClick={recarregar}
          disabled={carregando}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* ABA 1: NAVE 1 (Dividida nas 3 Fábricas) */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'nave1' && (
        <div className="space-y-5">
          {/* Seletor de Fábricas da Nave 1 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {FABRICAS_NAVE_1.map(fab => (
              <button
                key={fab.id}
                type="button"
                onClick={() => setFabricaN1(fab.id)}
                className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                  fabricaN1 === fab.id
                    ? 'border-orange-500 bg-orange-50/70 shadow-sm dark:border-orange-500 dark:bg-orange-950/30'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
                    {fab.nome}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {fab.processos.length} processos
                  </span>
                </div>
                <h3 className="mt-1 text-base font-black text-slate-900 dark:text-slate-50">
                  {fab.subtitulo}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {fab.descricao}
                </p>
              </button>
            ))}
          </div>

          {/* Lista de Processos da Fábrica Selecionada */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Processos da {FABRICAS_NAVE_1.find(f => f.id === fabricaN1)?.nome} —{' '}
                {FABRICAS_NAVE_1.find(f => f.id === fabricaN1)?.subtitulo}
              </h3>
              {fabricaN1 === 'fabrica3' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                  ★ Marco-Porta oficializa o Tramo TX-XXXX
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {FABRICAS_NAVE_1.find(f => f.id === fabricaN1)?.processos.map(proc => (
                <div
                  key={proc.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition ${
                    proc.oficializaTramo
                      ? 'border-orange-300 bg-orange-50/40 dark:border-orange-900/60 dark:bg-orange-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">Etapa {proc.ordem}</span>
                      {proc.oficializaTramo && (
                        <span className="rounded bg-orange-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                          Criação do Tramo
                        </span>
                      )}
                    </div>
                    <h4 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50">
                      {proc.nome}
                    </h4>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {proc.descricao}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span className="text-[11px] font-medium text-slate-500">
                      Foto + OP/Virola
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAbrirApontamento(proc)}
                      className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700"
                    >
                      <Plus className="h-4 w-4" />
                      Lançar Realizado
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* ABA 2: NAVE 2 (Soldagem e Preparação Interna com Fila de Tramos) */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'nave2' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 dark:border-sky-950 dark:bg-sky-950/20">
            <h3 className="text-base font-bold text-sky-950 dark:text-sky-100">
              Nave 2: Soldagem e Preparação Interna
            </h3>
            <p className="text-xs text-sky-800 dark:text-sky-300">
              Fila de tramos liberados pela 3ª Fábrica da Nave 1. Selecione um tramo para registrar os processos de SAW 2/3, Internos e UT.
            </p>
          </div>

          {/* Fila de Tramos Recebidos */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Fila de Tramos na Nave 2 ({filaNave2.length})
            </h4>

            {filaNave2.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500 dark:border-slate-800">
                Nenhum tramo na fila da Nave 2 no momento. Conclua o Marco-Porta na 3ª Fábrica da Nave 1 para liberar novos tramos.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                {filaNave2.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTramoOperacao(t.codigo_tramo)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                      tramoOperacao === t.codigo_tramo
                        ? 'border-sky-600 bg-sky-50 ring-2 ring-sky-500/40 dark:border-sky-500 dark:bg-sky-950/40'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <span className="font-mono text-sm font-black text-slate-900 dark:text-slate-100">
                      {t.codigo_tramo}
                    </span>
                    <span className="mt-1 text-[11px] font-semibold text-slate-500">
                      Progresso: {t.percentual_conclusao}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Processos da Nave 2 para o Tramo Selecionado */}
          {tramoOperacao && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Apontar Processos para o Tramo <span className="font-mono text-sky-600">{tramoOperacao}</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {PROCESSOS_NAVE_2.map(proc => (
                  <div
                    key={proc.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400">Etapa {proc.ordem}</span>
                        {proc.exigeConfirmacaoTramo && (
                          <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                            Confirmação TX-XXXX
                          </span>
                        )}
                      </div>
                      <h4 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50">
                        {proc.nome}
                      </h4>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {proc.descricao}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <span className="text-[11px] font-medium text-slate-500">Foto obrigatória</span>
                      <button
                        type="button"
                        onClick={() => handleAbrirApontamento(proc, tramoOperacao)}
                        className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700"
                      >
                        <Check className="h-4 w-4" />
                        Lançar Realizado
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* ABA 3: NAVE WHITE (Tratamento de Superfície e Acabamento) */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'white' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 dark:border-amber-950 dark:bg-amber-950/20">
            <h3 className="text-base font-bold text-amber-950 dark:text-amber-100">
              Nave White: Tratamento de Superfície e Acabamento
            </h3>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Fila de tramos liberados pela Nave 2. Conclua a Montagem Final para liberar o tramo ao Pátio / Expedição do Almoxarifado.
            </p>
          </div>

          {/* Fila de Tramos na Nave White */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Fila de Tramos na Nave White ({filaNaveWhite.length})
            </h4>

            {filaNaveWhite.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500 dark:border-slate-800">
                Nenhum tramo na fila da Nave White. Conclua a Liberação para White na Nave 2 para alimentar esta fila.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                {filaNaveWhite.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTramoOperacao(t.codigo_tramo)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                      tramoOperacao === t.codigo_tramo
                        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400/40 dark:border-amber-500 dark:bg-amber-950/40'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <span className="font-mono text-sm font-black text-slate-900 dark:text-slate-100">
                      {t.codigo_tramo}
                    </span>
                    <span className="mt-1 text-[11px] font-semibold text-slate-500">
                      Progresso: {t.percentual_conclusao}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Processos da Nave White para o Tramo Selecionado */}
          {tramoOperacao && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Processos de Superfície e Acabamento para <span className="font-mono text-amber-600">{tramoOperacao}</span>
              </h3>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {PROCESSOS_NAVE_WHITE.map(proc => (
                  <div
                    key={proc.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400">Etapa {proc.ordem}</span>
                        {proc.id === 'montagem_final' && (
                          <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                            Libera p/ Expedição
                          </span>
                        )}
                      </div>
                      <h4 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50">
                        {proc.nome}
                      </h4>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {proc.descricao}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <span className="text-[11px] font-medium text-slate-500">Foto comprobatória</span>
                      <button
                        type="button"
                        onClick={() => handleAbrirApontamento(proc, tramoOperacao)}
                        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm transition ${
                          proc.id === 'montagem_final'
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-amber-600 hover:bg-amber-700'
                        }`}
                      >
                        <Check className="h-4 w-4" />
                        Lançar Realizado
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tramos Concluídos e Liberados para o Almoxarifado / Pátio */}
          {filaAlmoxarifado.length > 0 && (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-950 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-emerald-600" />
                    Tramos Concluídos no Pátio / Expedição ({filaAlmoxarifado.length})
                  </h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Estes tramos concluíram a Montagem Final e estão sob responsabilidade da Expedição do Almoxarifado.
                  </p>
                </div>
                {onNavegarAlmoxarifado && (
                  <button
                    type="button"
                    onClick={onNavegarAlmoxarifado}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
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
      {/* ABA 5: HISTÓRICO DE APONTAMENTOS */}
      {/* -------------------------------------------------------------------- */}
      {tabAtiva === 'historico' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Histórico Recente de Apontamentos Operacionais
            </h3>
            <span className="text-xs text-slate-500">
              {apontamentosRecentes.length} registro(s)
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {apontamentosRecentes.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">Nenhum apontamento registrado ainda.</p>
            ) : (
              apontamentosRecentes.map(apt => (
                <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                  <div>
                    <div className="flex items-center gap-2">
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
                      Apontado por {apt.criado_por_nome || 'Operador'} em{' '}
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
                          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                        >
                          {f.url ? (
                            <img src={f.url} alt={f.nome} className="h-full w-full object-cover" />
                          ) : (
                            <FileImage className="h-4 w-4 text-slate-400" />
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
      {/* MODAL DE APONTAMENTO OPERACIONAL (Lançar Realizado + Foto + Observação) */}
      {/* -------------------------------------------------------------------- */}
      {processoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-sm">
          <div
            className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white p-4 sm:p-5 shadow-2xl dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <span className="text-[11px] font-bold uppercase text-orange-600">
                  {processoModal.nave === 'nave1'
                    ? 'Nave 1'
                    : processoModal.nave === 'nave2'
                    ? 'Nave 2'
                    : 'Nave White'}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  {processoModal.nome}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProcessoModal(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1 text-xs">
              {/* Seção de Rastreabilidade (OP / Virola) */}
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
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}

              {/* Campo Obrigatório de Tramo TX-XXXX no Marco-Porta e Nave 2 */}
              {(processoModal.id === 'marco_porta' || processoModal.exigeConfirmacaoTramo) && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3.5 dark:border-orange-950 dark:bg-orange-950/30">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-orange-900 dark:text-orange-200">
                      Numeração do Tramo Liberado (TX-XXXX) *
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
                    className="mt-2 h-12 w-full rounded-xl border border-orange-300 bg-white px-3 font-mono text-base font-black tracking-wider text-orange-950 focus:border-orange-500 focus:outline-none dark:border-orange-800 dark:bg-slate-900 dark:text-orange-100"
                  />
                  <p className="mt-1 text-[11px] text-orange-800 dark:text-orange-300">
                    Este registro oficializa a criação do tramo e o libera automaticamente para a Nave 2.
                  </p>
                </div>
              )}

              {/* Se estiver apontando para um tramo já existente na Nave 2 ou White */}
              {tramoInput && processoModal.id !== 'marco_porta' && !processoModal.exigeConfirmacaoTramo && (
                <div>
                  <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                    Tramo Vinculado
                  </label>
                  <input
                    type="text"
                    disabled
                    value={tramoInput}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 font-mono text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                </div>
              )}

              {/* Anexo de Imagem (Câmera / Upload) */}
              <div>
                <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                  Anexo de Foto Comprobatória (Câmera / Galeria)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-4 text-xs font-bold text-blue-800 transition hover:bg-blue-100 active:scale-[0.99] dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200 sm:w-auto">
                    <Camera className="h-4 w-4 text-blue-600" />
                    Tirar Foto / Anexar
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handleAdicionarFotos}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-slate-500 text-center sm:text-left">
                    {fotos.length === 0 ? 'Nenhuma foto anexada (opcional)' : `${fotos.length} foto(s) pronta(s)`}
                  </span>
                </div>

                {/* Previews das fotos preparadas */}
                {fotos.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {fotos.map((f, i) => (
                      <div key={i} className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
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
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-white hover:bg-black"
                          aria-label="Remover foto"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Campo de Observação (Texto Livre) */}
              <div>
                <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                  Campo de Observação Técnica (Texto livre)
                </label>
                <textarea
                  rows={2}
                  value={obsInput}
                  onChange={e => setObsInput(e.target.value)}
                  placeholder="Observações do processo, operadores, máquinas..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-4 flex shrink-0 flex-col-reverse sm:flex-row items-center justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setProcessoModal(null)}
                disabled={salvando}
                className="h-11 w-full sm:w-auto rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarApontamento}
                disabled={salvando}
                className="flex h-11 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar Realizado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Foto Ampliada */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setFotoAmpliada(null)}
        >
          <div
            className="relative max-w-xl rounded-2xl bg-white p-3 shadow-2xl dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{fotoAmpliada.nome}</span>
              <button
                type="button"
                onClick={() => setFotoAmpliada(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>
            {fotoAmpliada.url ? (
              <img src={fotoAmpliada.url} alt="" className="max-h-[75vh] w-auto rounded-xl object-contain" />
            ) : (
              <div className="flex h-48 w-64 items-center justify-center text-xs text-slate-400">
                Sem preview
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
