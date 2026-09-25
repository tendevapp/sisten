/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Produção › Apontamentos — Programado × Realizado por etapa, nas três naves.
 *
 * Abas:
 *   - Programado × Realizado: a tabela da planilha (TOTAL do ano + semanas);
 *   - Lançar realizado: os três formulários (Nave 1, Nave 2, White) — qualquer
 *     usuário com acesso à página;
 *   - Relatórios: Indicador Previsto × Realizado e aderência semanal;
 *   - Programação: grade semanal do Planejamento (flag prod_apt_programar);
 *   - Etapas: cadastro (flag prod_apt_cadastros).
 *
 * Começo simples, por decisão do usuário: só o realizado, sem travar etapas
 * nem vincular peças. Offline: o lançamento novo vai para o outbox quando a
 * rede cai e é reenviado ao voltar online / ganhar foco.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, ClipboardPen, ListOrdered, Loader2, RefreshCw, Table2, Trash2, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { canAccessPage } from '../../lib/pages';
import {
  NAVES,
  hojeLocal,
  montarMatriz,
  semanaISO,
  semanasDoIntervalo,
  semanasNoAno,
  type EtapaApontamento,
  type Nave,
  type QuantidadeSemanal,
  type SemanaRef,
} from '../../lib/producaoApontamentos';
import {
  assinarOutboxApontamentos,
  descartarPendenteApontamento,
  listarEtapas,
  listarPendentesApontamentos,
  listarProgramacao,
  listarRealizadoSemanal,
  processarFilaApontamentos,
} from '../../lib/producaoApontamentosApi';
import TabelaProgramadoRealizado from '../../components/producao/apontamentos/TabelaProgramadoRealizado';
import LancamentoNave from '../../components/producao/apontamentos/LancamentoNave';
import RelatoriosApontamento from '../../components/producao/apontamentos/RelatoriosApontamento';
import ProgramacaoSemanal from '../../components/producao/apontamentos/ProgramacaoSemanal';
import CadastroEtapas from '../../components/producao/apontamentos/CadastroEtapas';
import { btnSecundario, inputCls } from '../../components/producao/apontamentos/estilos';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Aba = 'painel' | 'lancar' | 'relatorios' | 'programacao' | 'etapas';

/** A planilha da fábrica vai até a W52 — é o horizonte padrão da tabela. */
const ULTIMA_SEMANA_PADRAO = 52;

export default function ProducaoApontamentos({ user }: Props) {
  const toast = useToast();
  const semanaAtual = useMemo(() => semanaISO(hojeLocal()), []);
  const podeProgramar = canAccessPage(user, 'prod_apt_programar');
  const podeCadastros = canAccessPage(user, 'prod_apt_cadastros');

  const [aba, setAba] = useState<Aba>('painel');
  const [nave, setNave] = useState<Nave>('nave1');
  const [ano, setAno] = useState(semanaAtual.ano);
  const [de, setDe] = useState(Math.max(1, semanaAtual.semana - 4));
  const [ate, setAte] = useState(ULTIMA_SEMANA_PADRAO);
  // Enquanto o usuário não mexe no "de", ele acompanha a 1ª semana com dados.
  const [deManual, setDeManual] = useState(false);

  const [etapas, setEtapas] = useState<EtapaApontamento[] | null>(null);
  const [programacao, setProgramacao] = useState<QuantidadeSemanal[]>([]);
  const [realizado, setRealizado] = useState<QuantidadeSemanal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pendentes, setPendentes] = useState<Array<{ id: string; ultimoErro: string | null | undefined; tentativas: number }>>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const semanas = useMemo(() => semanasDoIntervalo(ano, de, ate), [ano, de, ate]);
  const totalSemanas = semanasNoAno(ano);
  // TOTAL acumula até a semana atual (ano corrente) ou até o fim do ano (anos passados).
  const totalAte: SemanaRef = ano === semanaAtual.ano ? semanaAtual : { ano, semana: totalSemanas };
  const anos = useMemo(() => [ano], [ano]);
  const chaveAnos = anos.join(',');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [e, p, r] = await Promise.all([listarEtapas(), listarProgramacao(anos), listarRealizadoSemanal(anos)]);
      setEtapas(e);
      setProgramacao(p);
      setRealizado(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível carregar os apontamentos.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveAnos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (deManual) return;
    const comDados = [...programacao, ...realizado].filter(l => l.ano === ano).map(l => l.semana);
    if (comDados.length) setDe(Math.min(...comDados));
  }, [programacao, realizado, ano, deManual]);

  const matriz = useMemo(
    () => (etapas ? montarMatriz({ etapas, programacao, realizado, semanas, totalAte }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [etapas, programacao, realizado, semanas, totalAte.ano, totalAte.semana],
  );

  // Outbox: reenvia ao montar, ao voltar online e ao ganhar foco.
  const tentarEnviar = useCallback(async () => {
    setSincronizando(true);
    try {
      const { enviados } = await processarFilaApontamentos();
      if (enviados > 0) {
        toast.success(`${enviados} lançamento(s) pendente(s) sincronizado(s).`);
        carregar();
      }
    } finally {
      setSincronizando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar]);

  useEffect(() => {
    let ativo = true;
    const atualizar = () => listarPendentesApontamentos().then(p => ativo && setPendentes(p));
    atualizar();
    tentarEnviar();
    const unsub = assinarOutboxApontamentos(atualizar);
    const aoVisivel = () => document.visibilityState === 'visible' && tentarEnviar();
    window.addEventListener('online', tentarEnviar);
    document.addEventListener('visibilitychange', aoVisivel);
    return () => {
      ativo = false;
      unsub();
      window.removeEventListener('online', tentarEnviar);
      document.removeEventListener('visibilitychange', aoVisivel);
    };
  }, [tentarEnviar]);

  const abas: Array<{ id: Aba; rotulo: string; Icone: LucideIcon }> = [
    { id: 'painel', rotulo: 'Programado × Realizado', Icone: Table2 },
    { id: 'lancar', rotulo: 'Lançar realizado', Icone: ClipboardPen },
    { id: 'relatorios', rotulo: 'Relatórios', Icone: BarChart3 },
    { id: 'programacao', rotulo: 'Programação', Icone: CalendarRange },
    ...(podeCadastros ? [{ id: 'etapas' as Aba, rotulo: 'Etapas', Icone: ListOrdered }] : []),
  ];

  const opcoesSemana = Array.from({ length: totalSemanas }, (_, i) => i + 1);
  const atalho = (cls: boolean) =>
    `rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
      cls ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
    }`;
  const primeiraComDados = () => {
    const comDados = [...programacao, ...realizado].filter(l => l.ano === ano).map(l => l.semana);
    return comDados.length ? Math.min(...comDados) : 1;
  };
  const ehAnoTodo = de === primeiraComDados() && ate === Math.min(ULTIMA_SEMANA_PADRAO, totalSemanas);
  const ehUltimas = ano === semanaAtual.ano && ate === semanaAtual.semana && de === Math.max(1, semanaAtual.semana - 4);

  const seletorPeriodo = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setDeManual(false);
          setDe(primeiraComDados());
          setAte(ULTIMA_SEMANA_PADRAO);
        }}
        className={atalho(ehAnoTodo)}
      >
        Ano até W{ULTIMA_SEMANA_PADRAO}
      </button>
      <button
        type="button"
        onClick={() => {
          setDeManual(true);
          setAno(semanaAtual.ano);
          setDe(Math.max(1, semanaAtual.semana - 4));
          setAte(semanaAtual.semana);
        }}
        className={atalho(ehUltimas)}
      >
        Últimas 5
      </button>
      <select value={ano} onChange={e => setAno(Number(e.target.value))} className={`${inputCls} w-auto py-1.5`} aria-label="Ano">
        {[semanaAtual.ano - 1, semanaAtual.ano].map(a => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        value={de}
        onChange={e => {
          setDeManual(true);
          const v = Number(e.target.value);
          setDe(v);
          if (v > ate) setAte(v);
        }}
        className={`${inputCls} w-auto py-1.5`}
        aria-label="Da semana"
      >
        {opcoesSemana.map(n => (
          <option key={n} value={n}>
            de W{String(n).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select
        value={Math.min(ate, totalSemanas)}
        onChange={e => {
          const v = Number(e.target.value);
          setAte(v);
          if (v < de) {
            setDeManual(true);
            setDe(v);
          }
        }}
        className={`${inputCls} w-auto py-1.5`}
        aria-label="Até a semana"
      >
        {opcoesSemana.map(n => (
          <option key={n} value={n}>
            até W{String(n).padStart(2, '0')}
          </option>
        ))}
      </select>
      <button type="button" onClick={carregar} className={`${btnSecundario} px-2.5`} title="Atualizar">
        <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );

  const comErro = pendentes.filter(p => p.tentativas > 0 && p.ultimoErro);

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-12">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">Apontamentos de Produção</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Programado pelo Planejamento × realizado lançado pela produção, por etapa e semana.</p>
        </div>
        {(aba === 'painel' || aba === 'relatorios') && seletorPeriodo}
      </div>

      {pendentes.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <WifiOff className="h-4 w-4 shrink-0" />
              {pendentes.length} lançamento(s) salvos no aparelho aguardando envio.
            </span>
            <button
              onClick={tentarEnviar}
              disabled={sincronizando}
              className="flex items-center gap-1 rounded-lg bg-amber-200/70 px-2 py-1 font-bold text-amber-900 hover:bg-amber-200 disabled:opacity-60 dark:bg-amber-900/50 dark:text-amber-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} /> Reenviar agora
            </button>
          </div>
          {/* Recusado pelo servidor (ex.: sem acesso): reenviar não resolve, só descartar. */}
          {comErro.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2 py-1 dark:bg-slate-900/40">
              <span className="min-w-0 truncate">Recusado: {p.ultimoErro}</span>
              <button onClick={() => descartarPendenteApontamento(p.id)} className="flex shrink-0 items-center gap-1 font-bold text-rose-700 hover:underline dark:text-rose-400">
                <Trash2 className="h-3.5 w-3.5" /> Descartar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
        {abas.map(({ id, rotulo, Icone }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              aba === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Icone className="h-4 w-4" /> {rotulo}
          </button>
        ))}
      </div>

      {!etapas || !matriz ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {aba === 'painel' && <TabelaProgramadoRealizado matriz={matriz} semanaAtual={semanaAtual} />}

          {aba === 'lancar' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {NAVES.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setNave(n.id)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      nave === n.id
                        ? 'border-orange-500 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/30'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-50">{n.titulo}</span>
                    <span className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">{n.descricao}</span>
                  </button>
                ))}
              </div>
              <LancamentoNave key={nave} user={user} nave={NAVES.find(n => n.id === nave)!} etapas={etapas} onAlterado={carregar} />
            </div>
          )}

          {aba === 'relatorios' && <RelatoriosApontamento matriz={matriz} />}

          {aba === 'programacao' && (
            <ProgramacaoSemanal etapas={etapas} semanaAtual={semanaAtual} podeEditar={podeProgramar} usuarioNome={user.name ?? ''} onSalvo={carregar} />
          )}

          {aba === 'etapas' && podeCadastros && <CadastroEtapas etapas={etapas} onAlterado={carregar} />}
        </>
      )}
    </div>
  );
}
