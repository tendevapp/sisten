/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Apontar por tramo — quadro com uma coluna por etapa. Cada cartão mostra há
 * quantos dias o tramo está na etapa (âmbar acima da mediana histórica da
 * etapa, vermelho acima do P80). Tocar abre o apontamento; "Selecionar
 * vários" aplica o mesmo marco e data a vários tramos da mesma etapa.
 */

import React, { useMemo, useState } from 'react';
import { CheckSquare, Download, LayoutGrid, Search, Square, Table2, Wrench, WifiOff, X } from 'lucide-react';
import {
  CONFIG_ETAPA,
  ETAPAS_TRAMO,
  ROTULO_MARCO,
  TIPOS_TRAMO,
  diasNaEtapa,
  faixaEspera,
  referenciasEspera,
  type EtapaTramo,
  type SituacaoTramo,
  type TramoAtual,
} from '../../../../lib/producaoTramos';
import { exportarPlanilhaTramos } from '../../../../lib/producaoTramosExportar';
import { btnPrimario, btnSecundario, inputCls } from '../estilos';
import SheetApontamento from './SheetApontamento';
import TabelaTramosPlanilha from './TabelaTramosPlanilha';
import { CLASSE_FAIXA, COR_ETAPA } from './visual';
import type { Profile } from '../../../../types';

interface Props {
  tramos: TramoAtual[];
  situacoes: SituacaoTramo[];
  hoje: string;
  user: Profile;
  onRegistrado: () => void;
}

function CartaoTramo({ t, dias, faixa, selecionado, modoSelecao, pendente, onClick }: {
  t: TramoAtual;
  dias: number | null;
  faixa: keyof typeof CLASSE_FAIXA;
  selecionado: boolean;
  modoSelecao: boolean;
  pendente: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border bg-white p-2.5 text-left shadow-sm transition active:scale-[0.99] dark:bg-slate-900 ${
        selecionado ? 'border-blue-600 ring-2 ring-blue-600/30' : 'border-slate-200 hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600'
      }`}
      style={{ boxShadow: `inset 3px 0 0 0 ${COR_ETAPA[t.etapa].borda}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {modoSelecao && (selecionado ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-slate-400" />)}
          <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-50">{t.serie}</span>
        </div>
        {dias !== null && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${CLASSE_FAIXA[faixa]}`}>{dias}d</span>}
      </div>
      <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {t.tramo} · Torre {t.torreNumero}
        {t.reparosSolda > 0 && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400" title="Reparos de solda">
            <Wrench className="h-3 w-3" /> {t.reparosSolda}
          </span>
        )}
      </p>
      {t.atividadeAtual && <p className="mt-1 truncate text-xs text-slate-700 dark:text-slate-300" title={`${t.setorAtual} · ${t.atividadeAtual}`}>{t.atividadeAtual}</p>}
      {pendente && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          <WifiOff className="h-3 w-3" /> aguardando sincronizar
        </p>
      )}
    </button>
  );
}

export default function QuadroTramos({ tramos, situacoes, hoje, user, onRegistrado }: Props) {
  const [vista, setVista] = useState<'quadro' | 'tabela'>('quadro');
  const [busca, setBusca] = useState('');
  const [tipos, setTipos] = useState<string[]>([]);
  const [torre, setTorre] = useState<number | ''>('');
  const [etapaMovel, setEtapaMovel] = useState<EtapaTramo>('nav02');
  const [verExpedidos, setVerExpedidos] = useState(false);
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [abertos, setAbertos] = useState<TramoAtual[] | null>(null);
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());

  const referencias = useMemo(() => referenciasEspera(tramos), [tramos]);
  const torres = useMemo(() => [...new Set(tramos.map(t => t.torreNumero))].sort((a, b) => a - b), [tramos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tramos.filter(t =>
      (!termo || String(t.serie).includes(termo) || (t.atividadeAtual ?? '').toLowerCase().includes(termo) || (t.setorAtual ?? '').toLowerCase().includes(termo)) &&
      (!tipos.length || tipos.includes(t.tramo)) &&
      (torre === '' || t.torreNumero === torre),
    );
  }, [tramos, busca, tipos, torre]);

  const colunas = useMemo(() => {
    const porEtapa = new Map<EtapaTramo, Array<{ t: TramoAtual; dias: number | null }>>(ETAPAS_TRAMO.map(e => [e, []]));
    for (const t of filtrados) porEtapa.get(t.etapa)!.push({ t, dias: diasNaEtapa(t, hoje) });
    for (const [etapa, lista] of porEtapa) {
      lista.sort((a, b) =>
        etapa === 'expedido'
          ? (b.t.marcos.expedido ?? '').localeCompare(a.t.marcos.expedido ?? '')
          : (b.dias ?? -1) - (a.dias ?? -1) || a.t.serie - b.t.serie,
      );
    }
    return porEtapa;
  }, [filtrados, hoje]);

  const etapaSelecao = selecionados.length ? tramos.find(t => t.tramoId === selecionados[0])?.etapa : undefined;

  const tocar = (t: TramoAtual) => {
    if (!modoSelecao) {
      setAbertos([t]);
      return;
    }
    if (t.etapa === 'expedido') return;
    setSelecionados(atual => {
      if (atual.includes(t.tramoId)) return atual.filter(id => id !== t.tramoId);
      // Lote é sempre da mesma etapa: o próximo marco é o mesmo para todos.
      return etapaSelecao && etapaSelecao !== t.etapa ? [t.tramoId] : [...atual, t.tramoId];
    });
  };

  const fecharSheet = () => setAbertos(null);
  const aoSalvar = (offline: string[]) => {
    if (offline.length) setPendentes(p => new Set([...p, ...offline]));
    setAbertos(null);
    setSelecionados([]);
    setModoSelecao(false);
    onRegistrado();
  };

  const coluna = (etapa: EtapaTramo, movel = false) => {
    const lista = colunas.get(etapa)!;
    const cfg = CONFIG_ETAPA[etapa];
    const recolhida = etapa === 'expedido' && !verExpedidos;
    return (
      <section key={etapa} className={`flex min-w-0 flex-col rounded-2xl bg-slate-100/80 dark:bg-slate-800/40 ${movel ? '' : 'max-h-[72vh]'}`}>
        <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_ETAPA[etapa].fundo, outline: `1px solid ${COR_ETAPA[etapa].borda}` }} />
              {cfg.rotulo}
              <span className="rounded-full bg-white px-1.5 text-xs tabular-nums text-slate-600 dark:bg-slate-900 dark:text-slate-300">{lista.length}</span>
            </h3>
            <p className="truncate text-[11px] text-slate-500">{cfg.detalhe}</p>
          </div>
          {etapa === 'expedido' && (
            <button type="button" onClick={() => setVerExpedidos(v => !v)} className="text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-300">
              {verExpedidos ? 'Recolher' : 'Mostrar'}
            </button>
          )}
        </header>
        {!recolhida && (
          <div className={`space-y-2 px-2 pb-2 ${movel ? '' : 'overflow-y-auto'}`}>
            {lista.map(({ t, dias }) => (
              <CartaoTramo
                key={t.tramoId}
                t={t}
                dias={dias}
                faixa={faixaEspera(dias, referencias[etapa])}
                selecionado={selecionados.includes(t.tramoId)}
                modoSelecao={modoSelecao}
                pendente={pendentes.has(t.tramoId)}
                onClick={() => tocar(t)}
              />
            ))}
            {!lista.length && <p className="px-2 py-4 text-center text-xs text-slate-400">Nenhum tramo.</p>}
          </div>
        )}
      </section>
    );
  };

  const selecionadosTramos = tramos.filter(t => selecionados.includes(t.tramoId));
  const proximoLote = etapaSelecao ? CONFIG_ETAPA[etapaSelecao].proximo : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              inputMode="search"
              placeholder="Série ou situação…"
              className={`${inputCls} min-h-[44px] pl-9`}
              aria-label="Buscar tramo"
            />
          </div>
          <div className="flex gap-1">
            {TIPOS_TRAMO.map(tipo => (
              <button
                key={tipo}
                type="button"
                onClick={() => setTipos(atual => (atual.includes(tipo) ? atual.filter(x => x !== tipo) : [...atual, tipo]))}
                className={`min-h-[44px] rounded-xl px-2.5 text-xs font-bold ${
                  tipos.includes(tipo) ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {tipo}
              </button>
            ))}
          </div>
          <select
            value={torre}
            onChange={e => setTorre(e.target.value ? Number(e.target.value) : '')}
            className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            aria-label="Torre"
          >
            <option value="">Todas as torres</option>
            {torres.map(n => (
              <option key={n} value={n}>Torre {n}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vista === 'quadro' && (
            <button
              type="button"
              onClick={() => {
                setModoSelecao(m => !m);
                setSelecionados([]);
              }}
              className={`${modoSelecao ? btnPrimario : btnSecundario} min-h-[44px]`}
            >
              {modoSelecao ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />} {modoSelecao ? 'Cancelar seleção' : 'Selecionar vários'}
            </button>
          )}
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {([['quadro', 'Quadro', LayoutGrid], ['tabela', 'Planilha', Table2]] as const).map(([id, rotulo, Icone]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVista(id)}
                className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${
                  vista === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50' : 'text-slate-500'
                }`}
              >
                <Icone className="h-4 w-4" /> {rotulo}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => exportarPlanilhaTramos(tramos, `TRAMOS-${hoje}.xlsx`)} className={`${btnSecundario} min-h-[44px]`} title="Exportar no layout da aba TRAMOS">
            <Download className="h-4 w-4" /> XLSX
          </button>
        </div>
      </div>

      {vista === 'tabela' ? (
        <TabelaTramosPlanilha tramos={filtrados} onAbrir={t => setAbertos([t])} />
      ) : (
        <>
          {/* Celular: uma etapa por vez. */}
          <div className="lg:hidden">
            <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1">
              {ETAPAS_TRAMO.map(etapa => (
                <button
                  key={etapa}
                  type="button"
                  onClick={() => setEtapaMovel(etapa)}
                  className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${
                    etapaMovel === etapa ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_ETAPA[etapa].fundo }} />
                  {CONFIG_ETAPA[etapa].rotulo} <span className="tabular-nums opacity-70">{colunas.get(etapa)!.length}</span>
                </button>
              ))}
            </div>
            {coluna(etapaMovel, true)}
          </div>
          <div className="hidden gap-2 lg:grid lg:grid-cols-6">{ETAPAS_TRAMO.map(etapa => coluna(etapa))}</div>
          <p className="text-[11px] text-slate-500">
            Dias na etapa: <span className={`rounded px-1 ${CLASSE_FAIXA.alerta}`}>âmbar</span> acima da mediana histórica da etapa,{' '}
            <span className={`rounded px-1 ${CLASSE_FAIXA.critico}`}>vermelho</span> acima do P80.
          </p>
        </>
      )}

      {modoSelecao && selecionados.length > 0 && (
        <div className="sticky bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl dark:bg-slate-100 dark:text-slate-900">
          <span className="text-sm font-semibold">
            {selecionados.length} tramo(s) em {etapaSelecao ? CONFIG_ETAPA[etapaSelecao].rotulo : ''}
          </span>
          <button type="button" onClick={() => setAbertos(selecionadosTramos)} className={`${btnPrimario} min-h-[44px]`}>
            {proximoLote ? ROTULO_MARCO[proximoLote] : 'Apontar'}
          </button>
        </div>
      )}

      {abertos && (
        <SheetApontamento tramos={abertos} situacoes={situacoes} hoje={hoje} user={user} onClose={fecharSheet} onSalvo={aoSalvar} />
      )}
    </div>
  );
}
