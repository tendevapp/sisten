/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Requisito Visual (Seção 4 do PRD): Indicador de Progresso da Torre Eólica
 *
 * Ilustração dinâmica vetorial (SVG) de torre eólica dividida em seções (T1..T5),
 * com filtro por numeração TX-XXXX, seletor de tramos, preenchimento gradual azul (#0066FF / #004080)
 * proporcional ao percentual acumulado das Naves 2 e White, e checklist interativo dos 9 processos
 * com capacidade de apontamento direto.
 */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Eye,
  FileImage,
  Layers,
  Plus,
  Search,
  Sparkles,
  Wind,
  X,
} from 'lucide-react';
import {
  PROCESSOS_PROGRESSO_TORRE,
  extrairSecaoTramo,
  type ProcessoApontamento,
} from '../../lib/producaoTorres';
import type { ApontamentoOperacaoDb, FotoApontamento, TramoProducaoDb } from '../../lib/producaoTorresApi';

interface Props {
  tramos: TramoProducaoDb[];
  apontamentos: ApontamentoOperacaoDb[];
  tramoSelecionadoCodigo?: string | null;
  onSelecionarTramo?: (codigo: string) => void;
  onApontarProcesso?: (processo: ProcessoApontamento, tramoCodigo?: string) => void;
}

type SecaoTorre = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export default function IndicadorProgressoTorre({
  tramos,
  apontamentos,
  tramoSelecionadoCodigo,
  onSelecionarTramo,
  onApontarProcesso,
}: Props) {
  const [busca, setBusca] = useState('');
  const [fotoModal, setFotoModal] = useState<FotoApontamento | null>(null);

  // Determinar tramo ativo garantindo fallback para o primeiro tramo real da lista
  const codigoAtivo = useMemo(() => {
    if (busca.trim()) return busca.trim().toUpperCase();
    if (tramoSelecionadoCodigo) return tramoSelecionadoCodigo.toUpperCase();
    if (tramos.length > 0) return tramos[0].codigo_tramo.toUpperCase();
    return 'T1-0101';
  }, [busca, tramoSelecionadoCodigo, tramos]);

  const tramoAtivo = useMemo(
    () => tramos.find(t => t.codigo_tramo.toUpperCase() === codigoAtivo.toUpperCase()) || null,
    [tramos, codigoAtivo],
  );

  // Apontamentos específicos do tramo ativo
  const aptsDoTramo = useMemo(() => {
    if (!codigoAtivo) return [];
    return apontamentos.filter(
      a => a.tramo_codigo && a.tramo_codigo.toUpperCase() === codigoAtivo.toUpperCase(),
    );
  }, [apontamentos, codigoAtivo]);

  const processosConcluidosSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of aptsDoTramo) {
      if (a.realizado) s.add(a.processo_id);
    }
    return s;
  }, [aptsDoTramo]);

  const secaoAtiva = (extrairSecaoTramo(codigoAtivo) as SecaoTorre) || 'T1';

  // Percentual acumulado calculado pelas etapas das Naves 2 e White (9 etapas)
  const totalProcessosCalculo = PROCESSOS_PROGRESSO_TORRE.length; // 9
  const concluidosCalculo = PROCESSOS_PROGRESSO_TORRE.filter(p => processosConcluidosSet.has(p.id)).length;
  const percentualCalculado = Math.min(
    100,
    Math.round((concluidosCalculo / totalProcessosCalculo) * 100),
  );

  // Selecionar seção e encontrar tramo correspondente
  const handleSelecionarSecao = (secao: SecaoTorre) => {
    // 1. Encontrar o primeiro tramo que comece com essa seção
    const tramoEncontrado = tramos.find(t => t.codigo_tramo.toUpperCase().startsWith(`${secao}-`));
    const novoCodigo = tramoEncontrado ? tramoEncontrado.codigo_tramo : `${secao}-0000`;
    setBusca('');
    if (onSelecionarTramo) {
      onSelecionarTramo(novoCodigo);
    }
  };

  // Seleção direta de um tramo da lista
  const handleEscolherTramo = (codigo: string) => {
    setBusca('');
    if (onSelecionarTramo) {
      onSelecionarTramo(codigo);
    }
  };

  // Identificador único do gradiente do SVG
  const preenchimentoGradienteId = 'gradienteProgressoTorre';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <Wind className="h-3.5 w-3.5" /> Indicador Gráfico de Progresso
          </div>
          <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50 sm:text-lg">
            Acompanhamento da Torre Eólica
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Preenchimento proporcional em azul com base nos processos cumpridos das Naves 2 e White.
          </p>
        </div>

        {/* Campo de Busca Rápida por Tramo */}
        <div className="relative w-full md:w-72">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value.toUpperCase())}
              placeholder="Buscar Tramo (ex: TX-XXXX)..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-bold tracking-wider text-slate-900 uppercase focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            />
          </div>
        </div>
      </div>

      {/* Seletor Rápido de Tramos Disponíveis em Pills (Altamente Ergonômico em Mobile) */}
      {tramos.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="shrink-0 font-semibold text-slate-500 text-[11px] mr-1">Tramos:</span>
          {tramos.map(t => {
            const ativo = t.codigo_tramo.toUpperCase() === codigoAtivo.toUpperCase();
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleEscolherTramo(t.codigo_tramo)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all ${
                  ativo
                    ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/30'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className="font-mono">{t.codigo_tramo}</span>
                <span
                  className={`rounded px-1 text-[10px] ${
                    ativo ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  {t.percentual_conclusao}%
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Grid Principal: Modelo Vetorial SVG da Torre + Painel de Progresso das Etapas */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Lado Esquerdo: Modelo Gráfico SVG Interativo da Torre Eólica */}
        <div className="flex flex-col items-center justify-between rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/50 p-4 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 sm:p-6 lg:col-span-5">
          <div className="mb-2 flex w-full items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              Estrutura da Torre (Toque para Selecionar)
            </span>
            <span className="rounded-full bg-blue-600/10 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              Seção Ativa: {secaoAtiva}
            </span>
          </div>

          {/* SVG Vetorial da Torre Eólica com 5 Tramos (T5 topo até T1 base) */}
          <div className="relative flex justify-center py-1">
            <svg
              width="230"
              height="410"
              viewBox="0 0 240 440"
              className="drop-shadow-md select-none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Gradiente Azul do PRD: #0066FF / #004080 com base no percentual calculado */}
                <linearGradient id={preenchimentoGradienteId} x1="0%" y1="100%" x2="0%" y2="0%">
                  <stop offset={`${percentualCalculado}%`} stopColor="#0066FF" />
                  <stop offset={`${percentualCalculado}%`} stopColor="#e2e8f0" stopOpacity="0.5" />
                </linearGradient>

                <linearGradient id="gradienteMetalicoInativo" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#94a3b8" />
                  <stop offset="50%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
              </defs>

              {/* Rotor e Pás (Nacelle no Topo) */}
              <g transform="translate(120, 50)" className="text-slate-600 dark:text-slate-300">
                <rect x="-18" y="-10" width="36" height="18" rx="4" fill="#334155" />
                <circle cx="0" cy="0" r="7" fill="#0f172a" />
                <path d="M 0 -7 C -3 -25, -1 -45, 0 -50 C 1 -45, 3 -25, 0 -7 Z" fill="#475569" />
                <path d="M 6 3 C 22 15, 38 30, 43 35 C 38 32, 20 18, 6 3 Z" fill="#475569" />
                <path d="M -6 3 C -22 15, -38 30, -43 35 C -38 32, -20 18, -6 3 Z" fill="#475569" />
              </g>

              {/* T5 - Topo (y: 60 até 120) */}
              <g
                className="cursor-pointer transition-all hover:opacity-90"
                onClick={() => handleSelecionarSecao('T5')}
                role="button"
                tabIndex={0}
                aria-label="Selecionar Seção T5"
              >
                <polygon
                  points="106,60 134,60 138,120 102,120"
                  fill={secaoAtiva === 'T5' ? `url(#${preenchimentoGradienteId})` : 'url(#gradienteMetalicoInativo)'}
                  stroke={secaoAtiva === 'T5' ? '#0066FF' : '#475569'}
                  strokeWidth={secaoAtiva === 'T5' ? '3.5' : '1.2'}
                />
                <text x="120" y="95" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="bold">
                  T5
                </text>
              </g>

              {/* T4 - Seção 4 (y: 122 até 182) */}
              <g
                className="cursor-pointer transition-all hover:opacity-90"
                onClick={() => handleSelecionarSecao('T4')}
                role="button"
                tabIndex={0}
                aria-label="Selecionar Seção T4"
              >
                <polygon
                  points="102,122 138,122 143,182 97,182"
                  fill={secaoAtiva === 'T4' ? `url(#${preenchimentoGradienteId})` : 'url(#gradienteMetalicoInativo)'}
                  stroke={secaoAtiva === 'T4' ? '#0066FF' : '#475569'}
                  strokeWidth={secaoAtiva === 'T4' ? '3.5' : '1.2'}
                />
                <text x="120" y="157" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="bold">
                  T4
                </text>
              </g>

              {/* T3 - Seção 3 (y: 184 até 246) */}
              <g
                className="cursor-pointer transition-all hover:opacity-90"
                onClick={() => handleSelecionarSecao('T3')}
                role="button"
                tabIndex={0}
                aria-label="Selecionar Seção T3"
              >
                <polygon
                  points="97,184 143,184 149,246 91,246"
                  fill={secaoAtiva === 'T3' ? `url(#${preenchimentoGradienteId})` : 'url(#gradienteMetalicoInativo)'}
                  stroke={secaoAtiva === 'T3' ? '#0066FF' : '#475569'}
                  strokeWidth={secaoAtiva === 'T3' ? '3.5' : '1.2'}
                />
                <text x="120" y="219" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="bold">
                  T3
                </text>
              </g>

              {/* T2 - Seção 2 (y: 248 até 312) */}
              <g
                className="cursor-pointer transition-all hover:opacity-90"
                onClick={() => handleSelecionarSecao('T2')}
                role="button"
                tabIndex={0}
                aria-label="Selecionar Seção T2"
              >
                <polygon
                  points="91,248 149,248 156,312 84,312"
                  fill={secaoAtiva === 'T2' ? `url(#${preenchimentoGradienteId})` : 'url(#gradienteMetalicoInativo)'}
                  stroke={secaoAtiva === 'T2' ? '#0066FF' : '#475569'}
                  strokeWidth={secaoAtiva === 'T2' ? '3.5' : '1.2'}
                />
                <text x="120" y="284" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="bold">
                  T2
                </text>
              </g>

              {/* T1 - Base (y: 314 até 386 com Marco Porta) */}
              <g
                className="cursor-pointer transition-all hover:opacity-90"
                onClick={() => handleSelecionarSecao('T1')}
                role="button"
                tabIndex={0}
                aria-label="Selecionar Seção T1"
              >
                <polygon
                  points="84,314 156,314 165,386 75,386"
                  fill={secaoAtiva === 'T1' ? `url(#${preenchimentoGradienteId})` : 'url(#gradienteMetalicoInativo)'}
                  stroke={secaoAtiva === 'T1' ? '#0066FF' : '#475569'}
                  strokeWidth={secaoAtiva === 'T1' ? '3.5' : '1.2'}
                />
                <text x="120" y="352" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="bold">
                  T1 (Base)
                </text>
                <rect x="113" y="360" width="14" height="24" rx="2" fill="#0f172a" />
              </g>

              {/* Fundação / Base de Concreto */}
              <polygon points="65,388 175,388 185,410 55,410" fill="#64748b" rx="2" />
            </svg>
          </div>

          {/* Legenda do Preenchimento Gradual Azul */}
          <div className="mt-3 flex w-full flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Progresso N2 + White:</span>
              <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                {percentualCalculado}%
              </span>
            </div>
            {/* Barra Gradual Azul (#0066FF / #004080) */}
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${percentualCalculado}%`,
                  background: 'linear-gradient(90deg, #004080 0%, #0066FF 100%)',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0% (Entrada Nave 2)</span>
              <span>100% (Montagem Final / Pátio)</span>
            </div>
          </div>
        </div>

        {/* Lado Direito: Detalhamento do Tramo e Grade de Processos das Naves 2 e White */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          {/* Card Resumo do Tramo Selecionado */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-950 dark:bg-blue-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Tramo Oficial Selecionado
                </span>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono text-xl font-black text-slate-900 dark:text-slate-50 sm:text-2xl">
                    {codigoAtivo}
                  </h3>
                  {tramoAtivo && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        tramoAtivo.estagio_atual === 'expedicao_almoxarifado'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                          : tramoAtivo.estagio_atual === 'white'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200'
                      }`}
                    >
                      {tramoAtivo.estagio_atual === 'expedicao_almoxarifado'
                        ? 'Expedição (Pátio)'
                        : tramoAtivo.estagio_atual === 'white'
                        ? 'Nave White'
                        : 'Nave 2'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-right">
                <div>
                  <span className="text-[11px] text-slate-500">Etapas Concluídas</span>
                  <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                    {concluidosCalculo} / {totalProcessosCalculo}
                  </p>
                </div>
              </div>
            </div>

            {tramoAtivo && (
              <div className="mt-3 flex flex-wrap gap-4 border-t border-blue-200/60 pt-2.5 text-xs text-slate-600 dark:border-blue-900/60 dark:text-slate-400">
                {tramoAtivo.virola_origem && (
                  <span>
                    Virola Origem: <strong>{tramoAtivo.virola_origem}</strong>
                  </span>
                )}
                {tramoAtivo.op_origem && (
                  <span>
                    OP: <strong>{tramoAtivo.op_origem}</strong>
                  </span>
                )}
                {tramoAtivo.liberado_nave2_em && (
                  <span>
                    Entrada Nave 2: <strong>{new Date(tramoAtivo.liberado_nave2_em).toLocaleDateString('pt-BR')}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Grade dos 9 Processos Industriais (Nave 2 + Nave White) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Processos Rastreados no Indicador (Nave 2 & Nave White)
              </h4>
              <span className="text-[11px] text-slate-400">Toque para apontar ou ver detalhes</span>
            </div>

            <div className="space-y-2">
              {PROCESSOS_PROGRESSO_TORRE.map(processo => {
                const concluido = processosConcluidosSet.has(processo.id);
                const aptItem = aptsDoTramo.find(a => a.processo_id === processo.id);

                return (
                  <div
                    key={processo.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                      concluido
                        ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-950 dark:bg-emerald-950/20'
                        : 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 shrink-0">
                        {concluido ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {processo.nome}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              processo.nave === 'nave2'
                                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {processo.nave === 'nave2' ? 'Nave 2' : 'White'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {aptItem?.observacao || processo.descricao}
                        </p>
                      </div>
                    </div>

                    {/* Ações e Status (Botão Apontar ou Dados do Apontamento Concluído) */}
                    <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center">
                      {concluido ? (
                        <div className="flex items-center gap-2">
                          {aptItem?.fotos && aptItem.fotos.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setFotoModal(aptItem.fotos[0])}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              <FileImage className="h-3.5 w-3.5 text-blue-600" />
                              <span>{aptItem.fotos.length} foto(s)</span>
                            </button>
                          )}
                          <span className="rounded-lg bg-emerald-100/80 px-2 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {aptItem ? new Date(aptItem.data_apontamento).toLocaleDateString('pt-BR') : 'Concluído'}
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onApontarProcesso && onApontarProcesso(processo, codigoAtivo)}
                          className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Apontar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Simples de Visualização de Imagem */}
      {fotoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setFotoModal(null)}
        >
          <div
            className="relative max-w-2xl overflow-hidden rounded-2xl bg-white p-3 shadow-2xl dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100">{fotoModal.nome}</h5>
              <button
                type="button"
                onClick={() => setFotoModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {fotoModal.url ? (
              <img
                src={fotoModal.url}
                alt={fotoModal.nome}
                className="max-h-[70vh] w-auto rounded-xl object-contain"
              />
            ) : (
              <div className="flex h-48 w-72 items-center justify-center text-xs text-slate-400">
                Imagem não carregada.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
