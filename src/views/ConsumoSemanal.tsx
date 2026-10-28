/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado › Consumo Semanal.
 *
 * Duas abas sobre a mesma base (MB51 agrupada por semana, `consumoSemanal.ts`):
 *  - Alertas (padrão): itens cujo consumo mudou de ritmo — aumento, virada de
 *    tendência, pico — e o efeito no estoque (ruptura antes da reposição,
 *    mínimo defasado). É a pergunta do dia: o que revisar ou antecipar agora.
 *    Regras em `lib/alertaConsumo.ts`; painel em `consumo/ConsumoAlertasPainel`.
 *  - Histórico: o perfil semanal de qualquer material (a tela anterior).
 *
 * `?aba=historico` abre direto no histórico.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertCircle, AlertTriangle, CalendarDays, Clock, History, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { localDb } from '../db/localDb';
import { Profile, MB51Classificado, EstoqueGiro, SAPImportLog } from '../types';
import { construirBaseSemanal } from '../lib/consumoSemanal';
import { buscarSituacoesEstoque, type SituacaoEstoqueMaterial } from '../lib/estoqueSituacaoCompras';
import { formatDateBR, formatDateTimeBR } from '../lib/format';
import { TableEmpty } from '../components/ui/DataTable';
import ConsumoAlertasPainel from '../components/almoxarifado/consumo/ConsumoAlertasPainel';
import ConsumoHistoricoPainel from '../components/almoxarifado/consumo/ConsumoHistoricoPainel';

interface ConsumoSemanalProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

/** Semana em que a produção começou (ver janela de produção nas views). */
const INICIO_PRODUCAO = '2026-05-01';
/** MB51 mais velha que isso: os alertas estão olhando para o passado. */
const DIAS_BASE_DESATUALIZADA = 8;

type Aba = 'alertas' | 'historico';

function abaDaRota(): Aba {
  const q = (window.location.hash || '').split('?')[1];
  return new URLSearchParams(q || '').get('aba') === 'historico' ? 'historico' : 'alertas';
}

export default function ConsumoSemanal({ user, onNavigate }: ConsumoSemanalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movs, setMovs] = useState<MB51Classificado[]>([]);
  // Grupo de mercadorias não existe na MB51; vem da posição de estoque.
  const [giro, setGiro] = useState<EstoqueGiro[]>([]);
  // Saldo, mínimo e lead time do Controle de Estoque. Complementar: sem ele os
  // alertas de comportamento seguem, só os de estoque somem.
  const [situacoes, setSituacoes] = useState<Map<string, SituacaoEstoqueMaterial>>(new Map());
  const [ultimoLog, setUltimoLog] = useState<SAPImportLog | null>(null);
  const [aba, setAba] = useState<Aba>(abaDaRota);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [m, g, s] = await Promise.all([
        localDb.fetchMb51(force),
        localDb.fetchGiroEstoque(force).catch(() => [] as EstoqueGiro[]),
        buscarSituacoesEstoque(force).catch(e => {
          console.warn('Situação de estoque indisponível no Consumo Semanal:', e);
          return new Map<string, SituacaoEstoqueMaterial>();
        }),
      ]);
      setMovs(m);
      setGiro(g);
      setSituacoes(s);
      const logs = localDb.getImportLogs();
      setUltimoLog(logs.find(l => l.type === 'MB51') || null);
    } catch (e: any) {
      console.error('Erro ao carregar as movimentações:', e);
      setError('Falha ao carregar as movimentações. Tente atualizar novamente.');
      setMovs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const hojeIso = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  // Sempre estende o período até a semana atual de hoje
  const base = useMemo(() => construirBaseSemanal(movs, hojeIso), [movs, hojeIso]);

  const grupoPorMaterial = useMemo(() => {
    const m = new Map<string, string>();
    giro.forEach(g => {
      if (g.material && g.grupo_mercadorias) m.set(g.material, g.grupo_mercadorias.trim());
    });
    return m;
  }, [giro]);

  const gruposDisponiveis = useMemo(() => {
    const s = new Set<string>();
    base.materiais.forEach(m => {
      const g = grupoPorMaterial.get(m.material);
      if (g) s.add(g);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [base.materiais, grupoPorMaterial]);

  const baseDesatualizada = useMemo(() => {
    if (!base.maxData) return false;
    const dias = (new Date(`${hojeIso}T12:00:00`).getTime() - new Date(`${base.maxData}T12:00:00`).getTime()) / 86_400_000;
    return dias > DIAS_BASE_DESATUALIZADA;
  }, [base.maxData, hojeIso]);

  const trocarAba = (nova: Aba) => {
    setAba(nova);
    try { window.history.replaceState(null, '', `#/almoxarifado/consumo-semanal${nova === 'historico' ? '?aba=historico' : ''}`); } catch { /* sem history: segue igual */ }
  };

  const botaoAba = (ativa: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
      ativa ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <div className="space-y-5 select-text max-w-[1600px] mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 reveal" style={{ borderColor: 'var(--hairline)' }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
              <CalendarDays className="h-7 w-7" style={{ color: 'var(--brand)' }} />
              Consumo Semanal
            </h2>
            {base.maxData && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-xs"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}
                title={base.minData ? `Intervalo de movimentações na base: ${formatDateBR(base.minData)} até ${formatDateBR(base.maxData)}` : undefined}
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${baseDesatualizada ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                Base com dados até <strong className="font-bold ml-0.5" style={{ color: 'var(--ink-primary)' }}>{formatDateBR(base.maxData)}</strong>
              </span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm mt-1.5" style={{ color: 'var(--ink-secondary)' }}>
            <span>Itens com consumo acima do normal, para revisar o estoque mínimo ou antecipar a compra.</span>
            {ultimoLog && (
              <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs" style={{ color: 'var(--ink-muted)' }}>
                <span className="hidden sm:inline">•</span>
                <Clock className="h-3 w-3 inline shrink-0 opacity-70" />
                <span>Última importação SAP MB51: <strong className="font-semibold" style={{ color: 'var(--ink-secondary)' }}>{formatDateTimeBR(ultimoLog.created_at)}</strong> ({ultimoLog.filename})</span>
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer border hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && baseDesatualizada && (
        <div className="flex items-center gap-2.5 p-3 border border-amber-300 dark:border-amber-900/50 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          A MB51 vai só até {formatDateBR(base.maxData!)}. Os alertas não enxergam o consumo depois disso — reimporte a MB51 em Admin › Importar SAP.
        </div>
      )}

      {!loading && !error && base.materiais.length === 0 && (
        <TableEmpty
          icon={CalendarDays}
          title="Nenhum consumo registrado"
          hint='Importe as movimentações (transação MB51) na aba "Importar SAP" do painel administrativo.'
        />
      )}

      {(loading || (!error && base.materiais.length > 0)) && (
        <>
          <div className="flex min-w-0 overflow-x-auto no-scrollbar rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:inline-flex">
            <button type="button" className={botaoAba(aba === 'alertas')} onClick={() => trocarAba('alertas')}>
              <AlertTriangle className="h-3.5 w-3.5" /> Alertas
            </button>
            <button type="button" className={botaoAba(aba === 'historico')} onClick={() => trocarAba('historico')}>
              <History className="h-3.5 w-3.5" /> Histórico
            </button>
          </div>

          {aba === 'alertas' ? (
            <ConsumoAlertasPainel
              user={user}
              onNavigate={onNavigate}
              base={base}
              situacoes={situacoes}
              grupoPorMaterial={grupoPorMaterial}
              gruposDisponiveis={gruposDisponiveis}
              hojeIso={hojeIso}
              loading={loading}
              inicioProducao={INICIO_PRODUCAO}
            />
          ) : (
            <ConsumoHistoricoPainel
              base={base}
              grupoPorMaterial={grupoPorMaterial}
              gruposDisponiveis={gruposDisponiveis}
              hojeIso={hojeIso}
              loading={loading}
              inicioProducao={INICIO_PRODUCAO}
            />
          )}
        </>
      )}
    </div>
  );
}
