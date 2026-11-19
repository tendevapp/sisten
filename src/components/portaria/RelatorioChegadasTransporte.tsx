/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Portaria › Chegada de Transportes › aba Relatório: pontualidade das levas
 * (janelas de horário), atrasos e recorrências por rota, empresa, motorista e
 * placa, rotas regulares que faltaram e a grade dia × leva.
 * Regras em `lib/relatorioChegadasTransporte.ts`.
 */

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  AlarmClock, CalendarDays, CheckCircle2, Clock, Loader2, Pencil, Plus, Repeat, Route, Save, Trash2, TriangleAlert,
} from 'lucide-react';
import type { PortRegistroTransporte, Profile } from '../../types';
import { useToast } from '../ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import KpiCard from '../charts/KpiCard';
import { hojeISO } from '../../lib/fichaEpi';
import {
  SEM_ROTA, atrasosPorDiaDaSemana, ausenciasDeRotasRegulares, avaliarChegadas, problemasDasJanelas, rankingDeAtrasos,
  resumirChegadas, resumoPorJanela, somarDias, type ChegadaAvaliada, type JanelaChegada, type LinhaRanking,
} from '../../lib/relatorioChegadasTransporte';
import { listarJanelasChegada, listarTransportesPeriodo, salvarJanelasChegada } from '../../lib/relatorioChegadasTransporteApi';

type Preset = '7' | '30' | '90' | 'custom';
type Dimensao = 'rota' | 'empresa' | 'motorista' | 'placa';
type FiltroOcupacao = 'todas' | 'com' | 'vazio';

/** Dias de histórico para o horário habitual (independe do filtro). */
const HISTORICO_DIAS = 90;

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const minutos = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`);

const DIM_ROTULO: Record<Dimensao, string> = { rota: 'Rotas', empresa: 'Empresas', motorista: 'Motoristas', placa: 'Placas' };
const DIM_CHAVE: Record<Dimensao, (c: ChegadaAvaliada) => string | null> = {
  rota: c => c.rota,
  empresa: c => c.registro.empresa,
  motorista: c => c.registro.motorista,
  placa: c => c.registro.placa,
};

const CHIP: Record<ChegadaAvaliada['situacao'], string> = {
  no_horario: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900',
  atraso: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900',
  sem_referencia: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  fora_janela: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
};

export default function RelatorioChegadasTransporte({
  user, onAbrirDia,
}: {
  user: Profile;
  /** Abre o dia nos lançamentos (aba Registros). */
  onAbrirDia: (dataISO: string) => void;
}) {
  const toast = useToast();
  const ehAdmin = user.roles.includes('admin');
  const hoje = hojeISO();
  const idDe = useId();
  const idAte = useId();
  const idRota = useId();
  const idEmpresa = useId();

  const [preset, setPreset] = useState<Preset>('30');
  const [de, setDe] = useState(somarDias(hoje, -29));
  const [ate, setAte] = useState(hoje);
  const [rota, setRota] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [ocupacao, setOcupacao] = useState<FiltroOcupacao>('todas');
  const [dimensao, setDimensao] = useState<Dimensao>('rota');
  const [verTodosAtrasos, setVerTodosAtrasos] = useState(false);

  const [janelas, setJanelas] = useState<JanelaChegada[]>([]);
  const [registros, setRegistros] = useState<PortRegistroTransporte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [versao, setVersao] = useState(0);

  const escolherPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') { setDe(somarDias(hoje, -(Number(p) - 1))); setAte(hoje); }
  };

  // Carrega o período + o histórico do habitual (90 dias antes do fim).
  const inicioCarga = useMemo(() => {
    const hist = somarDias(ate, -HISTORICO_DIAS);
    return de < hist ? de : hist;
  }, [de, ate]);

  useEffect(() => {
    if (!de || !ate || de > ate) return;
    let vivo = true;
    setCarregando(true);
    // Um dia a mais no fim: a madrugada do último dia é lançada com a data seguinte.
    Promise.all([listarJanelasChegada(), listarTransportesPeriodo(inicioCarga, somarDias(ate, 1))])
      .then(([j, r]) => { if (vivo) { setJanelas(j); setRegistros(r); } })
      .catch(err => toast.error(`Não foi possível carregar o relatório: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [inicioCarga, ate, de, versao, toast]);

  const todas = useMemo(() => avaliarChegadas(registros, janelas, registros), [registros, janelas]);
  const opcoesRota = useMemo(() => [...new Set(todas.map(c => c.rota))].sort(), [todas]);
  const opcoesEmpresa = useMemo(() => [...new Set(todas.map(c => c.registro.empresa).filter(Boolean))].sort(), [todas]);

  const av = useMemo(() => todas.filter(c =>
    c.dia >= de && c.dia <= ate
    && (!rota || c.rota === rota)
    && (!empresa || c.registro.empresa === empresa)
    && (ocupacao === 'todas' || c.ocupacao === ocupacao),
  ), [todas, de, ate, rota, empresa, ocupacao]);

  const resumo = useMemo(() => resumirChegadas(av), [av]);
  const porJanela = useMemo(() => resumoPorJanela(av, janelas), [av, janelas]);
  const ranking = useMemo(() => rankingDeAtrasos(av, DIM_CHAVE[dimensao]).filter(l => l.atrasos > 0), [av, dimensao]);
  const ausencias = useMemo(() => ausenciasDeRotasRegulares(av, janelas), [av, janelas]);
  const semana = useMemo(() => atrasosPorDiaDaSemana(av), [av]);
  const atrasos = useMemo(() => av.filter(c => c.situacao === 'atraso'), [av]);
  const janelasAtivas = useMemo(() => janelas.filter(j => j.ativo).sort((a, b) => a.ordem - b.ordem), [janelas]);

  // Grade dia × leva (dias mais recentes primeiro).
  const grade = useMemo(() => {
    const faltas = new Map<string, string[]>();
    for (const a of ausencias) for (const d of a.dias) {
      const k = `${d}|${a.janela.id}`;
      faltas.set(k, [...(faltas.get(k) ?? []), a.rota]);
    }
    const dias = [...new Set(av.map(c => c.dia))].sort().reverse();
    return dias.map(dia => ({
      dia,
      celulas: janelasAtivas.map(j => ({
        janela: j,
        chegadas: av.filter(c => c.dia === dia && c.janela?.id === j.id),
        faltas: faltas.get(`${dia}|${j.id}`) ?? [],
      })),
      avulsas: av.filter(c => c.dia === dia && !c.janela),
    }));
  }, [av, ausencias, janelasAtivas]);
  const temAvulsas = grade.some(g => g.avulsas.length > 0);

  const maxSemana = Math.max(1, ...semana.map(s => s.atrasos));

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Período">
            {(['7', '30', '90', 'custom'] as Preset[]).map(p => (
              <button
                key={p}
                type="button"
                aria-pressed={preset === p}
                onClick={() => escolherPreset(p)}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${preset === p ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
              >
                {p === 'custom' ? 'Período' : `${p} dias`}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label htmlFor={idDe} className="block text-[11px] font-semibold text-slate-500">De</label>
                <input id={idDe} type="date" value={de} max={ate} onChange={e => setDe(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label htmlFor={idAte} className="block text-[11px] font-semibold text-slate-500">Até</label>
                <input id={idAte} type="date" value={ate} min={de} max={hoje} onChange={e => setAte(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
            </>
          )}
          <div>
            <label htmlFor={idRota} className="block text-[11px] font-semibold text-slate-500">Rota</label>
            <select id={idRota} value={rota} onChange={e => setRota(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <option value="">Todas</option>
              {opcoesRota.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={idEmpresa} className="block text-[11px] font-semibold text-slate-500">Empresa</label>
            <select id={idEmpresa} value={empresa} onChange={e => setEmpresa(e.target.value)} className="max-w-[12rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <option value="">Todas</option>
              {opcoesEmpresa.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Ocupação">
            {([['todas', 'Todas'], ['com', 'Com passageiros'], ['vazio', 'Vazio']] as [FiltroOcupacao, string][]).map(([v, r]) => (
              <button
                key={v}
                type="button"
                aria-pressed={ocupacao === v}
                onClick={() => setOcupacao(v)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${ocupacao === v ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          A chegada é medida contra o horário limite da leva ou, sem limite, contra o horário habitual da rota nos últimos {HISTORICO_DIAS} dias (mediana), mais a tolerância.
          A madrugada conta no dia em que a leva começou.
        </p>
      </section>

      {carregando ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <KpiCard label="Chegadas" value={resumo.total} detail={`${resumo.dias} dia(s) · ${resumo.avaliadas} medidas`} icon={CalendarDays} />
            <KpiCard
              label="Pontualidade"
              display={pct(resumo.pontualidade)}
              detail={`${resumo.noHorario} no horário`}
              icon={CheckCircle2}
              accent="var(--status-good)"
              share={resumo.pontualidade ?? 0}
              emphasize
            />
            <KpiCard
              label="Atrasos"
              value={resumo.atrasos}
              detail={resumo.atrasoMedio != null ? `média de ${minutos(resumo.atrasoMedio)}` : 'nenhum'}
              icon={AlarmClock}
              accent="var(--status-critical)"
            />
            <KpiCard
              label="Maior atraso"
              display={resumo.maiorAtraso ? `+${minutos(resumo.maiorAtraso.atrasoMin)}` : '—'}
              detail={resumo.maiorAtraso ? `${resumo.maiorAtraso.rota} · ${ddmm(resumo.maiorAtraso.dia)} · ${resumo.maiorAtraso.hora}` : undefined}
              icon={TriangleAlert}
              accent="var(--status-warning)"
            />
            <KpiCard
              label="Sem referência"
              value={resumo.total - resumo.avaliadas}
              detail={`${resumo.semRota} sem rota · ${resumo.foraJanela} fora das levas`}
              icon={Clock}
              accent="var(--series-7)"
            />
          </div>

          {/* Levas */}
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50">
                <Clock className="h-4 w-4 text-blue-600" /> Chegadas por leva
              </h3>
              {ehAdmin && (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200"
                >
                  <Pencil className="h-3.5 w-3.5" /> Horários das levas
                </button>
              )}
            </header>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {porJanela.map(p => (
                <li key={p.janela.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{p.janela.nome}</p>
                      <p className="text-[11px] text-slate-500">
                        {p.janela.inicio}–{p.janela.fim} · {p.janela.limite ? `limite ${p.janela.limite}` : 'habitual da rota'} + {p.janela.tolerancia_min} min
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                      p.pontualidade == null ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        : p.pontualidade >= 0.9 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : p.pontualidade >= 0.75 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}>{pct(p.pontualidade)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((p.pontualidade ?? 0) * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    <strong className="text-slate-900 dark:text-slate-50">{p.chegadas}</strong> chegada(s)
                    {p.mediana && <> · metade até <strong>{p.mediana}</strong></>}
                    {p.p90 && <> · 90% até <strong>{p.p90}</strong></>}
                    {p.atrasos > 0 && <span className="text-rose-700 dark:text-rose-400"> · {p.atrasos} atraso(s)</span>}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Recorrências */}
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4 lg:col-span-2">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50">
                  <Repeat className="h-4 w-4 text-rose-600" /> Atrasos recorrentes
                </h3>
                <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Agrupar atrasos por">
                  {(Object.keys(DIM_ROTULO) as Dimensao[]).map(d => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={dimensao === d}
                      onClick={() => setDimensao(d)}
                      className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${dimensao === d ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
                    >
                      {DIM_ROTULO[d]}
                    </button>
                  ))}
                </div>
              </header>
              {ranking.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700">
                  Nenhum atraso no período.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ranking.map(l => <LinhaRecorrencia key={l.chave} linha={l} />)}
                </ul>
              )}
            </section>

            {/* Dia da semana + faltas */}
            <div className="space-y-4">
              <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Atrasos por dia da semana</h3>
                <ul className="space-y-1">
                  {semana.map(s => (
                    <li key={s.dia} className="grid grid-cols-[2.25rem_1fr_3.5rem] items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{s.rotulo}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <span className="block h-full rounded-full bg-rose-500" style={{ width: `${(s.atrasos / maxSemana) * 100}%` }} />
                      </span>
                      <span className="text-right tabular-nums text-slate-600 dark:text-slate-300">{s.atrasos}/{s.avaliadas}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50">
                  <Route className="h-4 w-4 text-amber-600" /> Rotas regulares sem registro
                </h3>
                <p className="text-[11px] text-slate-500">Rota que aparece em 60%+ dos dias da leva e faltou — não veio ou a chegada não foi lançada.</p>
                {ausencias.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhuma falta de rota regular.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {ausencias.map(a => (
                      <li key={`${a.janela.id}|${a.rota}`} className="text-xs">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                          {a.rota} <span className="font-normal text-slate-500">· {a.janela.nome} · vem em {Math.round(a.regularidade * 100)}% dos dias</span>
                        </p>
                        <p className="flex flex-wrap gap-1 pt-0.5">
                          {a.dias.map(d => (
                            <button key={d} type="button" onClick={() => onAbrirDia(d)} className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300">
                              {ddmm(d)}
                            </button>
                          ))}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          {/* Grade dia × leva */}
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50">
                <CalendarDays className="h-4 w-4 text-blue-600" /> Dia a dia
              </h3>
              <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className={`rounded px-1.5 ring-1 ${CHIP.no_horario}`}>no horário</span>
                <span className={`rounded px-1.5 ring-1 ${CHIP.atraso}`}>atraso</span>
                <span className={`rounded px-1.5 ring-1 ${CHIP.sem_referencia}`}>sem referência</span>
                <span className="rounded border border-dashed border-amber-400 px-1.5 text-amber-700 dark:text-amber-300">faltou</span>
              </p>
            </header>
            {grade.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700">Nenhuma chegada no período.</p>
            ) : (
              <>
                {/* Celular: um cartão por dia */}
                <ul className="space-y-2 sm:hidden">
                  {grade.map(g => (
                    <li key={g.dia} className="rounded-xl border border-slate-100 p-2.5 dark:border-slate-800">
                      <button type="button" onClick={() => onAbrirDia(g.dia)} className="text-xs font-bold text-blue-700 dark:text-blue-400">{ddmmaa(g.dia)}</button>
                      {g.celulas.filter(c => c.chegadas.length || c.faltas.length).map(c => (
                        <div key={c.janela.id} className="mt-1.5">
                          <p className="text-[11px] font-semibold text-slate-500">{c.janela.nome}</p>
                          <CelulaGrade chegadas={c.chegadas} faltas={c.faltas} onAbrir={onAbrirDia} />
                        </div>
                      ))}
                      {g.avulsas.length > 0 && (
                        <div className="mt-1.5">
                          <p className="text-[11px] font-semibold text-slate-500">Fora das levas</p>
                          <CelulaGrade chegadas={g.avulsas} faltas={[]} onAbrir={onAbrirDia} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {/* Desktop: tabela dia × leva */}
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[48rem] border-collapse text-xs">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="sticky left-0 bg-white px-2 py-1.5 dark:bg-slate-900">Dia</th>
                        {janelasAtivas.map(j => <th key={j.id} className="px-2 py-1.5">{j.nome}<span className="block font-normal normal-case">{j.inicio}–{j.fim}</span></th>)}
                        {temAvulsas && <th className="px-2 py-1.5">Fora das levas</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {grade.map(g => (
                        <tr key={g.dia} className="border-t border-slate-100 align-top dark:border-slate-800">
                          <td className="sticky left-0 bg-white px-2 py-1.5 dark:bg-slate-900">
                            <button type="button" onClick={() => onAbrirDia(g.dia)} className="font-mono font-bold text-blue-700 hover:underline dark:text-blue-400">{ddmm(g.dia)}</button>
                          </td>
                          {g.celulas.map(c => (
                            <td key={c.janela.id} className="px-2 py-1.5"><CelulaGrade chegadas={c.chegadas} faltas={c.faltas} onAbrir={onAbrirDia} /></td>
                          ))}
                          {temAvulsas && <td className="px-2 py-1.5"><CelulaGrade chegadas={g.avulsas} faltas={[]} onAbrir={onAbrirDia} /></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Lista de atrasos */}
          {atrasos.length > 0 && (
            <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50">
                <AlarmClock className="h-4 w-4 text-rose-600" /> Atrasos ({atrasos.length})
              </h3>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {(verTodosAtrasos ? atrasos : atrasos.slice(0, 20)).map(c => (
                  <li key={c.registro.id} className="flex flex-col gap-0.5 py-1.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <button type="button" onClick={() => onAbrirDia(c.registro.data)} className="font-mono font-bold text-blue-700 hover:underline dark:text-blue-400">{ddmm(c.dia)}</button>
                      <span className="text-slate-800 dark:text-slate-100"> · <strong>{c.rota}</strong> · {c.janela?.nome}</span>
                      <span className="block truncate text-slate-500">{[c.registro.empresa, c.registro.placa, c.registro.motorista].filter(Boolean).join(' · ')}</span>
                    </div>
                    <p className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
                      chegou <strong className="text-slate-900 dark:text-slate-50">{c.hora}</strong>
                      {' · '}{c.origemReferencia === 'limite' ? 'limite' : 'habitual'} {c.referencia}
                      <strong className="ml-1 text-rose-700 dark:text-rose-400">+{minutos(c.atrasoMin)}</strong>
                    </p>
                  </li>
                ))}
              </ul>
              {atrasos.length > 20 && (
                <button type="button" onClick={() => setVerTodosAtrasos(v => !v)} className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-400">
                  {verTodosAtrasos ? 'Ver menos' : `Ver todos os ${atrasos.length}`}
                </button>
              )}
            </section>
          )}
        </>
      )}

      {editando && (
        <EditorJanelas
          janelas={janelas}
          porNome={user.name}
          onClose={() => setEditando(false)}
          onSalvo={() => { setEditando(false); setVersao(v => v + 1); toast.success('Horários das levas salvos.'); }}
        />
      )}
    </div>
  );
}

function LinhaRecorrencia({ linha: l }: { linha: LinhaRanking }) {
  return (
    <li className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 dark:text-slate-50">
          {l.chave === SEM_ROTA ? <span className="text-slate-500">Sem rota</span> : l.rotulo}
          {l.recorrente && (
            <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">recorrente</span>
          )}
        </p>
        <p className="flex flex-wrap gap-1 pt-0.5">
          {l.diasComAtraso.slice(0, 12).map(d => (
            <span key={d} className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{ddmm(d)}</span>
          ))}
          {l.diasComAtraso.length > 12 && <span className="text-[11px] text-slate-500">+{l.diasComAtraso.length - 12}</span>}
        </p>
      </div>
      <p className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
        <strong className="text-rose-700 dark:text-rose-400">{l.atrasos}</strong> de {l.avaliadas} · {pct(l.pontualidade)} no horário
        {l.atrasoMedio != null && <> · média +{minutos(l.atrasoMedio)}</>}
      </p>
    </li>
  );
}

function CelulaGrade({ chegadas, faltas, onAbrir }: { chegadas: ChegadaAvaliada[]; faltas: string[]; onAbrir: (d: string) => void }) {
  if (!chegadas.length && !faltas.length) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chegadas.map(c => (
        <button
          key={c.registro.id}
          type="button"
          onClick={() => onAbrir(c.registro.data)}
          title={[
            c.registro.empresa, c.registro.placa, c.registro.motorista,
            c.referencia ? `${c.origemReferencia === 'limite' ? 'limite' : 'habitual'} ${c.referencia}` : 'sem referência',
          ].filter(Boolean).join(' · ')}
          className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ${CHIP[c.situacao]}`}
        >
          {c.rota === SEM_ROTA ? '—' : c.rota} {c.hora}{c.situacao === 'atraso' && ` +${c.atrasoMin}`}
        </button>
      ))}
      {faltas.map(r => (
        <span key={r} className="whitespace-nowrap rounded border border-dashed border-amber-400 px-1.5 py-0.5 font-mono text-[11px] text-amber-700 dark:text-amber-300">
          {r} faltou
        </span>
      ))}
    </span>
  );
}

function EditorJanelas({
  janelas, porNome, onClose, onSalvo,
}: {
  janelas: JanelaChegada[];
  porNome: string;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [lista, setLista] = useState<JanelaChegada[]>(() => [...janelas].sort((a, b) => a.ordem - b.ordem));
  const [removidas, setRemovidas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const problemas = problemasDasJanelas(lista);

  const alterar = (id: string, patch: Partial<JanelaChegada>) => setLista(l => l.map(j => (j.id === id ? { ...j, ...patch } : j)));
  const remover = (id: string) => {
    setLista(l => l.filter(j => j.id !== id));
    if (!id.startsWith('nova-')) setRemovidas(r => [...r, id]);
  };
  const adicionar = () => setLista(l => [...l, {
    id: `nova-${crypto.randomUUID()}`, nome: '', inicio: '', fim: '', limite: null, tolerancia_min: 10, ordem: l.length + 1, ativo: true,
  }]);

  const salvar = async () => {
    if (problemas.length) { toast.warning(problemas.join(' ')); return; }
    setSalvando(true);
    try {
      await salvarJanelasChegada(lista, removidas, porNome);
      onSalvo();
    } catch (err) {
      toast.error(`Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvando(false);
    }
  };

  const campo = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Horários das levas de transporte">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Horários das levas</h3>
        <p className="text-xs text-slate-500">Cada chegada cai na leva do seu horário. Com horário limite, o atraso é medido contra ele; sem limite, contra o habitual da rota.</p>
      </ModalHeader>
      <ModalBody>
        <ul className="space-y-2">
          {lista.map((j, i) => (
            <li key={j.id} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-100 p-2.5 dark:border-slate-800 sm:grid-cols-[1fr_5.5rem_5.5rem_5.5rem_4.5rem_auto] sm:items-end">
              <CampoRotulado rotulo="Nome" className="col-span-2 sm:col-span-1">
                {id => <input id={id} value={j.nome} onChange={e => alterar(j.id, { nome: e.target.value })} className={campo} placeholder={`Leva ${i + 1}`} />}
              </CampoRotulado>
              <CampoRotulado rotulo="Início">
                {id => <input id={id} type="time" value={j.inicio} onChange={e => alterar(j.id, { inicio: e.target.value })} className={campo} />}
              </CampoRotulado>
              <CampoRotulado rotulo="Fim">
                {id => <input id={id} type="time" value={j.fim} onChange={e => alterar(j.id, { fim: e.target.value })} className={campo} />}
              </CampoRotulado>
              <CampoRotulado rotulo="Limite">
                {id => <input id={id} type="time" value={j.limite ?? ''} onChange={e => alterar(j.id, { limite: e.target.value || null })} className={campo} />}
              </CampoRotulado>
              <CampoRotulado rotulo="Tolerância">
                {id => <input id={id} type="number" min={0} max={180} value={j.tolerancia_min} onChange={e => alterar(j.id, { tolerancia_min: Number(e.target.value) })} className={campo} />}
              </CampoRotulado>
              <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={j.ativo} onChange={e => alterar(j.id, { ativo: e.target.checked })} /> Ativa
                </label>
                <button type="button" onClick={() => remover(j.id)} aria-label={`Excluir a leva ${j.nome || i + 1}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={adicionar} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300">
          <Plus className="h-3.5 w-3.5" /> Adicionar leva
        </button>
        {problemas.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
            {problemas.map(p => <li key={p}>{p}</li>)}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-slate-500">Fim antes do início = leva que atravessa a meia-noite (ex.: 21:00–05:00).</p>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </button>
      </ModalFooter>
    </Modal>
  );
}

function CampoRotulado({ rotulo, className = '', children }: { rotulo: string; className?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[11px] font-semibold text-slate-500">{rotulo}</label>
      {children(id)}
    </div>
  );
}
