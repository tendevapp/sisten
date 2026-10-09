/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Produção › Apontamentos — o que era a planilha "PROD — Avanço de Produção".
 *
 * Abas:
 *   - Apontar: quadro por etapa, um tramo ou vários (razão prod_apt_tramo_eventos);
 *   - Avanço: Plan × Real por marco, ritmo, curva S e grade de torres;
 *   - Gargalos: lead time entre marcos e tramos parados agora;
 *   - Qualidade: reparos de solda e retrabalhos;
 *   - Por nave: Programado × Realizado por etapa e semana (modelo agregado);
 *   - Programação: metas por marco e grade semanal por etapa (prod_apt_programar);
 *   - Cadastros: situações, etapas e carga da planilha (prod_apt_cadastros).
 *
 * Design: docs/superpowers/specs/2026-10-07-apontamento-tramos-indicadores-design.md
 * Offline: o apontamento por tramo vai para a fila global (configFormularios);
 * o lançamento por nave usa o outbox próprio, reenviado ao voltar online.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, ClipboardPen, Factory, Gauge, ListOrdered, Loader2, RefreshCw, Timer, Trash2, WifiOff, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { canAccessPage } from '../../lib/pages';
import {
  hojeLocal,
  montarMatriz,
  semanaISO,
  semanasDoIntervalo,
  semanasNoAno,
  type EtapaApontamento,
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
import RelatoriosApontamento from '../../components/producao/apontamentos/RelatoriosApontamento';
import ProgramacaoSemanal from '../../components/producao/apontamentos/ProgramacaoSemanal';
import CadastroEtapas from '../../components/producao/apontamentos/CadastroEtapas';
import ImportarPlanilhaTramos from '../../components/producao/apontamentos/ImportarPlanilhaTramos';
import ApontamentosTorresFluxo from '../../components/producao/apontamentos/ApontamentosTorresFluxo';
import QuadroTramos from '../../components/producao/apontamentos/tramos/QuadroTramos';
import AvancoTramos from '../../components/producao/apontamentos/tramos/AvancoTramos';
import GargalosTramos from '../../components/producao/apontamentos/tramos/GargalosTramos';
import QualidadeTramos from '../../components/producao/apontamentos/tramos/QualidadeTramos';
import MetasMarco from '../../components/producao/apontamentos/tramos/MetasMarco';
import CadastroSituacoes from '../../components/producao/apontamentos/tramos/CadastroSituacoes';
import PrazosEtapasRelatorio from '../../components/producao/apontamentos/tramos/PrazosEtapasRelatorio';
import SheetApontamento from '../../components/producao/apontamentos/tramos/SheetApontamento';
import { useDadosTramos } from '../../components/producao/apontamentos/tramos/useDadosTramos';
import type { TramoAtual } from '../../lib/producaoTramos';
import { btnSecundario } from '../../components/producao/apontamentos/estilos';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Aba = 'apontar' | 'avanco' | 'gargalos' | 'qualidade' | 'naves' | 'programacao' | 'cadastros';

// inputCls traz w-full, que vence o w-auto: os seletores de período ocupavam a linha inteira.
const selectPeriodoCls =
  'rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

/** A planilha da fábrica vai até a W52 — é o horizonte padrão da tabela. */
const ULTIMA_SEMANA_PADRAO = 52;

export default function ProducaoApontamentos({ user, onNavigate }: Props) {
  const toast = useToast();
  const semanaAtual = useMemo(() => semanaISO(hojeLocal()), []);
  const podeProgramar = canAccessPage(user, 'prod_apt_programar');
  const podeCadastros = canAccessPage(user, 'prod_apt_cadastros');

  const hoje = useMemo(() => hojeLocal(), []);
  const [aba, setAba] = useState<Aba>('apontar');
  const [vistaNave, setVistaNave] = useState<'tabela' | 'graficos'>('tabela');
  const [vistaProgramacao, setVistaProgramacao] = useState<'marcos' | 'prazos_etapas' | 'etapas'>('marcos');
  const [vistaCadastro, setVistaCadastro] = useState<'situacoes' | 'etapas' | 'importar'>('situacoes');
  // O fluxo por nave (POC) fica acessível até a tela nova fechar um ciclo.
  const [fluxoAntigo, setFluxoAntigo] = useState(false);
  const [tramoAberto, setTramoAberto] = useState<TramoAtual | null>(null);
  const { dados: dadosTramos, recarregar: recarregarTramos } = useDadosTramos();
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
    { id: 'apontar', rotulo: 'Apontar', Icone: ClipboardPen },
    { id: 'avanco', rotulo: 'Avanço', Icone: Gauge },
    { id: 'gargalos', rotulo: 'Gargalos', Icone: Timer },
    { id: 'qualidade', rotulo: 'Qualidade', Icone: Wrench },
    { id: 'naves', rotulo: 'Por nave', Icone: Factory },
    { id: 'programacao', rotulo: 'Programação', Icone: CalendarRange },
    ...(podeCadastros ? [{ id: 'cadastros' as Aba, rotulo: 'Cadastros', Icone: ListOrdered }] : []),
  ];

  const segmento = <T extends string>(valor: T, opcoes: Array<[T, string]>, mudar: (v: T) => void) => (
    <div className="flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {opcoes.map(([id, rotulo]) => (
        <button
          key={id}
          type="button"
          onClick={() => mudar(id)}
          className={`min-h-[36px] rounded-lg px-3 text-xs font-bold ${
            valor === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );

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
      <select value={ano} onChange={e => setAno(Number(e.target.value))} className={selectPeriodoCls} aria-label="Ano">
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
        className={selectPeriodoCls}
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
        className={selectPeriodoCls}
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
          <p className="text-xs text-slate-500 dark:text-slate-400">Avanço dos tramos por etapa, metas do Planejamento e indicadores — o que era a planilha de avanço.</p>
        </div>
        {aba === 'naves' && seletorPeriodo}
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

      <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800/70">
        {abas.map(({ id, rotulo, Icone }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition active:scale-[0.98] ${
              aba === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Icone className="h-4 w-4 shrink-0" />
            <span>{rotulo}</span>
          </button>
        ))}
      </div>

      {['apontar', 'avanco', 'gargalos', 'qualidade'].includes(aba) && !fluxoAntigo && !dadosTramos && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {aba === 'apontar' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={() => setFluxoAntigo(v => !v)} className="text-[11px] font-semibold text-slate-500 hover:underline">
              {fluxoAntigo ? '← Voltar ao quadro por tramo' : 'Abrir fluxo antigo por nave (demonstração)'}
            </button>
          </div>
          {fluxoAntigo ? (
            <ApontamentosTorresFluxo user={user} onNavegarAlmoxarifado={() => onNavigate('/almoxarifado')} />
          ) : (
            dadosTramos && (
              <QuadroTramos tramos={dadosTramos.tramos} situacoes={dadosTramos.situacoes} hoje={hoje} user={user} onRegistrado={recarregarTramos} />
            )
          )}
        </div>
      )}

      {dadosTramos && aba === 'avanco' && <AvancoTramos tramos={dadosTramos.tramos} metas={dadosTramos.metas} prazos={dadosTramos.prazos} hoje={hoje} />}
      {dadosTramos && aba === 'gargalos' && <GargalosTramos tramos={dadosTramos.tramos} hoje={hoje} onAbrir={setTramoAberto} />}
      {dadosTramos && aba === 'qualidade' && <QualidadeTramos tramos={dadosTramos.tramos} onAbrir={setTramoAberto} />}

      {aba === 'naves' && (
        <div className="space-y-3">
          {segmento<typeof vistaNave>(vistaNave, [['tabela', 'Programado × Realizado'], ['graficos', 'Relatórios']], setVistaNave)}
          {!etapas || !matriz ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : vistaNave === 'tabela' ? (
            <TabelaProgramadoRealizado matriz={matriz} semanaAtual={semanaAtual} />
          ) : (
            <RelatoriosApontamento matriz={matriz} />
          )}
        </div>
      )}

      {aba === 'programacao' && (
        <div className="space-y-3">
          {segmento<typeof vistaProgramacao>(vistaProgramacao, [['marcos', 'Metas por marco (tramos)'], ['prazos_etapas', 'Prazos por etapa (W49)'], ['etapas', 'Grade semanal por etapa']], setVistaProgramacao)}
          {vistaProgramacao === 'prazos_etapas' ? (
            <PrazosEtapasRelatorio podeEditar={podeProgramar} />
          ) : vistaProgramacao === 'marcos' ? (
            dadosTramos && (
              <MetasMarco metas={dadosTramos.metas} prazos={dadosTramos.prazos} podeEditar={podeProgramar} anoInicial={semanaAtual.ano} onSalvo={recarregarTramos} />
            )
          ) : etapas ? (
            <ProgramacaoSemanal etapas={etapas} semanaAtual={semanaAtual} podeEditar={podeProgramar} usuarioNome={user.name ?? ''} onSalvo={carregar} />
          ) : (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}
        </div>
      )}

      {aba === 'cadastros' && podeCadastros && (
        <div className="space-y-3">
          {segmento<typeof vistaCadastro>(vistaCadastro, [['situacoes', 'Situações do tramo'], ['etapas', 'Etapas por nave'], ['importar', 'Importar planilha']], setVistaCadastro)}
          {vistaCadastro === 'situacoes' && dadosTramos && <CadastroSituacoes situacoes={dadosTramos.situacoes} onAlterado={recarregarTramos} />}
          {vistaCadastro === 'etapas' && etapas && <CadastroEtapas etapas={etapas} onAlterado={carregar} />}
          {vistaCadastro === 'importar' && <ImportarPlanilhaTramos onImportado={recarregarTramos} />}
        </div>
      )}

      {tramoAberto && dadosTramos && (
        <SheetApontamento
          tramos={[tramoAberto]}
          situacoes={dadosTramos.situacoes}
          hoje={hoje}
          user={user}
          onClose={() => setTramoAberto(null)}
          onSalvo={() => {
            setTramoAberto(null);
            recarregarTramos();
          }}
        />
      )}
    </div>
  );
}
