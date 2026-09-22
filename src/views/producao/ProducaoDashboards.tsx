/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Produção > Dashboards — Relatório Diário de Produção.
 *
 * Reproduz em tela o relatório que hoje circula como imagem: um painel por
 * setor (Jato, Metalização, Pintura, Reparo), o resumo do dia com o donut de
 * status e as observações. As contagens do resumo saem de `calcularResumoDia`
 * sobre os mesmos dados das tabelas, então painel e donut nunca divergem.
 *
 * A tela é feita para ficar exposta na TV do pátio: **tudo cabe de uma vez, sem
 * rolagem**. Em vez de encolher fonte e espaçamento na mão até caber num
 * monitor específico, o painel é desenhado numa largura fixa (`LARGURA_BASE`) e
 * uma transformação de escala ajusta o conjunto ao espaço real — o mesmo
 * arquivo serve a uma TV 4K e a um notebook, e acrescentar linhas de reparo
 * amanhã só diminui a escala, nunca corta conteúdo. Abaixo de 1024px (celular
 * em campo) a escala é desligada e o painel volta a empilhar e rolar, porque
 * caber a matriz inteira num celular deixaria o texto ilegível.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ClipboardList, Factory, Maximize2, Minimize2, PaintBucket, SprayCan, Wrench, XCircle } from 'lucide-react';
import type { Profile } from '../../types';
import {
  RELATORIO_DIARIO_MOCK,
  calcularResumoDia,
  formatarDataDDMMAA,
  postoVazio,
  type BlocoLista,
  type LinhaSetor,
  type ResumoDia,
  type SetorLista,
  type SetorMatriz,
  type StatusAtividade,
} from '../../lib/producaoDashboard';

/** Largura do desenho do painel. A escala cuida do resto. */
const LARGURA_BASE = 1600;

/* --------------------------------------------------------------------- */
/* Escala para caber                                                      */
/* --------------------------------------------------------------------- */

/**
 * Ajusta o painel ao espaço disponível: escala = menor razão entre largura e
 * altura da área e do conteúdo. Passa de 1 em telas grandes (a TV aproveita
 * todo o espaço) e cai abaixo de 1 quando o conteúdo cresce.
 *
 * A medida do conteúdo não é afetada pelo `transform`, então não há laço de
 * realimentação entre medir e escalar.
 */
function useEscalaParaCaber(ativo: boolean) {
  const areaRef = useRef<HTMLDivElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ escala: 1, altura: 0 });

  useLayoutEffect(() => {
    if (!ativo) {
      setMedida({ escala: 1, altura: 0 });
      return;
    }
    const area = areaRef.current;
    const conteudo = conteudoRef.current;
    if (!area || !conteudo) return;

    const recalcular = () => {
      const { width, height } = area.getBoundingClientRect();
      const alturaConteudo = conteudo.offsetHeight;
      if (!width || !height || !alturaConteudo) return;
      setMedida({ escala: Math.min(width / LARGURA_BASE, height / alturaConteudo), altura: alturaConteudo });
    };

    recalcular();
    const observador = new ResizeObserver(recalcular);
    observador.observe(area);
    observador.observe(conteudo);
    return () => observador.disconnect();
  }, [ativo]);

  return { areaRef, conteudoRef, ...medida };
}

/** Telas estreitas não entram no modo TV: escala pequena demais para ler. */
function useModoTv() {
  const [tv, setTv] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches));
  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 1024px)');
    const aoMudar = (e: MediaQueryListEvent) => setTv(e.matches);
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);
  return tv;
}

/** Tela cheia no elemento do painel — a TV mostra só o relatório. */
function useTelaCheia(alvo: React.RefObject<HTMLElement>) {
  const [ativa, setAtiva] = useState(false);
  useEffect(() => {
    const aoMudar = () => setAtiva(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);
  const alternar = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void alvo.current?.requestFullscreen?.();
  }, [alvo]);
  return { ativa, alternar };
}

/* --------------------------------------------------------------------- */
/* Status                                                                 */
/* --------------------------------------------------------------------- */

const STATUS: Record<StatusAtividade, { rotulo: string; Icone: typeof CheckCircle2; cor: string; chip: string; hex: string }> = {
  concluido: {
    rotulo: 'Concluído',
    Icone: CheckCircle2,
    cor: 'text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    hex: '#16a34a',
  },
  andamento: {
    rotulo: 'Em andamento',
    Icone: AlertTriangle,
    cor: 'text-amber-500 dark:text-amber-400',
    chip: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    hex: '#f5b301',
  },
  nao_iniciado: {
    rotulo: 'Não iniciado',
    Icone: XCircle,
    cor: 'text-rose-600 dark:text-rose-400',
    chip: 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    hex: '#e11d48',
  },
};

function StatusCelula({ status }: { status: StatusAtividade }) {
  const { rotulo, Icone, cor } = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-slate-700 dark:text-slate-200">
      <Icone className={`h-4 w-4 shrink-0 ${cor}`} aria-hidden />
      {rotulo}
    </span>
  );
}

/* --------------------------------------------------------------------- */
/* Casca dos painéis                                                      */
/* --------------------------------------------------------------------- */

type Acento = 'azul' | 'laranja' | 'roxo' | 'verde';

const ACENTO: Record<Acento, { faixa: string; cabecalho: string; borda: string }> = {
  azul: { faixa: 'bg-blue-600', cabecalho: 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200', borda: 'border-blue-200 dark:border-blue-900/60' },
  laranja: { faixa: 'bg-orange-500', cabecalho: 'bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200', borda: 'border-orange-200 dark:border-orange-900/60' },
  roxo: { faixa: 'bg-violet-600', cabecalho: 'bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200', borda: 'border-violet-200 dark:border-violet-900/60' },
  verde: { faixa: 'bg-emerald-600', cabecalho: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200', borda: 'border-emerald-200 dark:border-emerald-900/60' },
};

function Painel({
  titulo,
  Icone,
  acento,
  className = '',
  children,
}: {
  titulo: string;
  Icone: typeof Factory;
  acento: Acento;
  className?: string;
  children: React.ReactNode;
}) {
  const cores = ACENTO[acento];
  return (
    <section className={`flex flex-col overflow-hidden rounded-xl border ${cores.borda} bg-white shadow-sm dark:bg-slate-900 ${className}`}>
      <header className={`flex items-center gap-2 px-3 py-1.5 ${cores.faixa}`}>
        <Icone className="h-4 w-4 text-white/90" aria-hidden />
        <h2 className="font-display text-xs font-bold uppercase tracking-wide text-white">{titulo}</h2>
      </header>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Setor em lista (Jato, Metalização, Pintura)                            */
/* --------------------------------------------------------------------- */

function LinhasBloco({ bloco, acento, primeiro }: { bloco: BlocoLista; acento: Acento; primeiro: boolean }) {
  const cores = ACENTO[acento];
  /* Traço grosso abre cada bloco a partir do segundo: sem ele, na Pintura as
     três cabines viram uma lista contínua de 18 processos e não se enxerga
     onde uma termina e a outra começa. */
  const separador = primeiro ? '' : 'border-t-[3px] border-slate-300 dark:border-slate-600';
  const linhaFina = 'border-t border-slate-100 dark:border-slate-800';
  /** A primeira linha do bloco leva o traço grosso — salvo quando o aviso já o levou. */
  const classeLinha = (i: number) => (i === 0 && !bloco.aviso && separador ? separador : linhaFina);

  return (
    <>
      {bloco.aviso && (
        <tr>
          <td colSpan={3} className={`px-2 py-1 text-center text-[11px] font-bold ${cores.cabecalho} ${separador}`}>
            {bloco.aviso}
          </td>
        </tr>
      )}
      {bloco.processos.map((processo, i) => (
        <tr key={processo.nome} className={classeLinha(i)}>
          {/* O rótulo da peça ocupa uma célula só, mesclada na altura do bloco. */}
          {i === 0 && (
            <td rowSpan={bloco.processos.length} className="w-[32%] border-r border-slate-100 px-2 py-1 align-middle dark:border-slate-800">
              <p className="text-[11px] font-bold leading-tight text-slate-800 dark:text-slate-100">{bloco.titulo}</p>
              {bloco.subtitulo && <p className="text-[11px] font-bold leading-tight text-slate-800 dark:text-slate-100">{bloco.subtitulo}</p>}
            </td>
          )}
          <td className="px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200">{processo.nome}</td>
          <td className="w-[34%] px-2 py-1">
            <StatusCelula status={processo.status} />
          </td>
        </tr>
      ))}
    </>
  );
}

function PainelLista({ setor, Icone, acento, className }: { setor: SetorLista; Icone: typeof Factory; acento: Acento; className?: string }) {
  const cores = ACENTO[acento];
  return (
    <Painel titulo={setor.titulo} Icone={Icone} acento={acento} className={className}>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className={cores.cabecalho}>
            <th className="w-[32%] px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide">{setor.colunas[0]}</th>
            <th className="px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide">{setor.colunas[1]}</th>
            <th className="w-[34%] px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody>
          {setor.blocos.map((bloco, i) => (
            <LinhasBloco key={bloco.titulo} bloco={bloco} acento={acento} primeiro={i === 0} />
          ))}
        </tbody>
      </table>
    </Painel>
  );
}

/* --------------------------------------------------------------------- */
/* Setor em matriz (Reparo)                                               */
/* --------------------------------------------------------------------- */

/** Chave estável da linha: o mesmo local aparece duas vezes (Corredor). */
const chaveLinha = (linha: LinhaSetor) => (postoVazio(linha) ? `${linha.local}-vazia` : `${linha.local}-${linha.peca ?? ''}`);

function RotuloLinha({ linha }: { linha: LinhaSetor }) {
  return (
    <>
      {linha.local}
      {!postoVazio(linha) && linha.peca && <span className="font-medium text-slate-500 dark:text-slate-400"> ({linha.peca})</span>}
    </>
  );
}

function PainelMatriz({ setor, tv, className }: { setor: SetorMatriz; tv: boolean; className?: string }) {
  const cores = ACENTO.verde;
  return (
    <Painel titulo={setor.titulo} Icone={Wrench} acento="verde" className={className}>
      {tv ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className={cores.cabecalho}>
              <th className="px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide">Local / Peça</th>
              {setor.colunas.map(coluna => (
                <th key={coluna} className="px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide">
                  {coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {setor.linhas.map(linha => (
              <tr key={chaveLinha(linha)} className="border-t border-slate-100 dark:border-slate-800">
                <th scope="row" className="whitespace-nowrap px-2 py-1 text-left text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  <RotuloLinha linha={linha} />
                </th>
                {postoVazio(linha) ? (
                  <td colSpan={setor.colunas.length} className="bg-slate-100 px-2 py-1 text-center text-[11px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    Vazia
                  </td>
                ) : (
                  linha.status.map((status, i) => (
                    <td key={setor.colunas[i]} className="px-2 py-1">
                      <StatusCelula status={status} />
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        /* Fora do modo TV a matriz de 8 colunas não cabe — cada posto vira cartão. */
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {setor.linhas.map(linha => (
            <div key={chaveLinha(linha)} className="p-3">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                <RotuloLinha linha={linha} />
              </p>
              {postoVazio(linha) ? (
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Vazia</p>
              ) : (
                <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {linha.status.map((status, i) => (
                    <div key={setor.colunas[i]} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/50">
                      <dt className="text-[11px] text-slate-600 dark:text-slate-300">{setor.colunas[i]}</dt>
                      <dd>
                        <StatusCelula status={status} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      )}
    </Painel>
  );
}

/* --------------------------------------------------------------------- */
/* Resumo do dia                                                          */
/* --------------------------------------------------------------------- */

function CartaoResumo({ status, valor, pct }: { status: StatusAtividade; valor: number; pct: number }) {
  const { rotulo, Icone, cor, chip } = STATUS[status];
  return (
    <div className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${chip}`}>
      <Icone className={`h-6 w-6 shrink-0 ${cor}`} aria-hidden />
      <div className="leading-tight">
        <p className="font-display text-xl font-bold">{valor}</p>
        <p className="text-[10px] font-medium">{rotulo}s</p>
        <p className="text-[11px] font-bold">{pct}%</p>
      </div>
    </div>
  );
}

/** Donut das três fatias. Geometria pela fração real; rótulo pelo % arredondado. */
function Donut({ resumo }: { resumo: ResumoDia }) {
  const raio = 62;
  const circunferencia = 2 * Math.PI * raio;

  let acumulado = 0;
  const segmentos = ([
    { status: 'concluido' as const, valor: resumo.concluidas, pct: resumo.pctConcluidas },
    { status: 'andamento' as const, valor: resumo.andamento, pct: resumo.pctAndamento },
    { status: 'nao_iniciado' as const, valor: resumo.naoIniciadas, pct: resumo.pctNaoIniciadas },
  ]).map(fatia => {
    const fracao = resumo.total > 0 ? fatia.valor / resumo.total : 0;
    const segmento = { ...fatia, fracao, inicio: acumulado };
    acumulado += fracao;
    return segmento;
  });

  return (
    <div className="flex items-center justify-center gap-4">
      <div className="relative h-36 w-36 shrink-0">
        <svg
          viewBox="0 0 160 160"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`${resumo.total} atividades: ${resumo.concluidas} concluídas, ${resumo.andamento} em andamento, ${resumo.naoIniciadas} não iniciadas`}
        >
          <circle cx="80" cy="80" r={raio} fill="none" strokeWidth="26" className="stroke-slate-100 dark:stroke-slate-800" />
          {segmentos.map(segmento => (
            <circle
              key={segmento.status}
              cx="80"
              cy="80"
              r={raio}
              fill="none"
              strokeWidth="26"
              stroke={STATUS[segmento.status].hex}
              strokeDasharray={`${segmento.fracao * circunferencia} ${circunferencia}`}
              strokeDashoffset={-segmento.inicio * circunferencia}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">{resumo.total}</span>
          <span className="text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400">
            Atividades
            <br />
            totais
          </span>
        </div>
      </div>
      <ul className="space-y-1.5">
        {segmentos.map(segmento => (
          <li key={segmento.status} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS[segmento.status].hex }} aria-hidden />
            <span className="font-medium">{STATUS[segmento.status].rotulo}s</span>
            <span className="font-bold text-slate-500 dark:text-slate-400">{segmento.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Painel completo                                                        */
/* --------------------------------------------------------------------- */

function RelatorioCompleto({ tv }: { tv: boolean }) {
  const relatorio = RELATORIO_DIARIO_MOCK;
  const resumo = useMemo(() => calcularResumoDia(relatorio), [relatorio]);

  return (
    <div className={tv ? 'space-y-3' : 'space-y-4'}>
      <header className="flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white/10 p-2">
            <Factory className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">Relatório Diário de Produção</h1>
            <p className="text-[11px] uppercase tracking-[0.18em] text-blue-200">Acompanhamento das atividades por setor</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-slate-900">
            <CalendarDays className="h-5 w-5 text-blue-600" aria-hidden />
            <div className="leading-tight">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Data</p>
              <p className="font-display text-base font-bold">{formatarDataDDMMAA(relatorio.data)}</p>
            </div>
          </div>
          <p className="text-right text-sm font-semibold italic leading-tight text-blue-100">
            Disciplina Hoje
            <br />
            Resultados Sempre
          </p>
        </div>
      </header>

      <div className={tv ? 'grid grid-cols-12 gap-3' : 'grid grid-cols-1 gap-4'}>
        <PainelLista setor={relatorio.jato} Icone={SprayCan} acento="azul" className={tv ? 'col-span-4 self-start' : ''} />
        <PainelLista setor={relatorio.metalizacao} Icone={SprayCan} acento="laranja" className={tv ? 'col-span-4 self-start' : ''} />
        <PainelLista setor={relatorio.pintura} Icone={PaintBucket} acento="roxo" className={tv ? 'col-span-4 row-span-2 self-start' : ''} />
        <PainelMatriz setor={relatorio.reparo} tv={tv} className={tv ? 'col-span-8 self-start' : ''} />
      </div>

      <div className={tv ? 'grid grid-cols-12 gap-3' : 'grid grid-cols-1 gap-4'}>
        <section className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${tv ? 'col-span-8' : ''}`}>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
            <h2 className="font-display text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-50">Resumo do dia</h2>
          </div>
          {/* Cards lado a lado: empilhados, os três comiam a altura que o donut
              e os painéis de setor precisam para a tela fechar em um quadro. */}
          <div className={`mt-2 grid items-center gap-3 ${tv ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <CartaoResumo status="concluido" valor={resumo.concluidas} pct={resumo.pctConcluidas} />
              <CartaoResumo status="andamento" valor={resumo.andamento} pct={resumo.pctAndamento} />
              <CartaoResumo status="nao_iniciado" valor={resumo.naoIniciadas} pct={resumo.pctNaoIniciadas} />
            </div>
            <Donut resumo={resumo} />
          </div>
        </section>

        <section className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${tv ? 'col-span-4' : ''}`}>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
            <h2 className="font-display text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-50">Observações</h2>
          </div>
          <ul className="mt-2 space-y-1.5">
            {relatorio.observacoes.map(observacao => (
              <li key={observacao} className="flex gap-2 text-xs text-slate-700 dark:text-slate-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden />
                {observacao}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Página                                                                 */
/* --------------------------------------------------------------------- */

export default function ProducaoDashboards(_props: { user: Profile; onNavigate: (path: string) => void }) {
  const tv = useModoTv();
  const { areaRef, conteudoRef, escala, altura } = useEscalaParaCaber(tv);
  const telaCheia = useTelaCheia(areaRef);

  return (
    <div
      ref={areaRef}
      className={`relative flex h-full w-full bg-slate-50 dark:bg-slate-950 ${tv ? 'items-center justify-center overflow-hidden p-3' : 'overflow-y-auto p-3'}`}
    >
      {tv && (
        <button
          type="button"
          onClick={telaCheia.alternar}
          title={telaCheia.ativa ? 'Sair da tela cheia' : 'Exibir em tela cheia (TV)'}
          className="absolute right-3 top-3 z-10 rounded-lg border border-slate-200 bg-white/90 p-2 text-slate-600 shadow-sm transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300"
        >
          {telaCheia.ativa ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="sr-only">{telaCheia.ativa ? 'Sair da tela cheia' : 'Tela cheia'}</span>
        </button>
      )}

      {tv ? (
        /* O invólucro toma o tamanho já escalado, e o flex da área centraliza. */
        <div style={{ width: LARGURA_BASE * escala, height: altura * escala }}>
          <div ref={conteudoRef} style={{ width: LARGURA_BASE, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
            <RelatorioCompleto tv />
          </div>
        </div>
      ) : (
        <div ref={conteudoRef} className="w-full">
          <RelatorioCompleto tv={false} />
        </div>
      )}
    </div>
  );
}
