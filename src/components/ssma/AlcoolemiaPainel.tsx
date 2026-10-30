/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças das telas do Teste de Alcoolemia — SSMA (termo FRM.SOC-0042) e
 * Portaria (livro FRM.SGP-0015), que leem a mesma tabela: seletor de período,
 * busca de quem chegou, filtros por resultado com as contagens, cartão do
 * teste para o celular e a escolha do período na exportação do livro.
 *
 * No ambulatório e na guarita a pessoa está de pé, com o celular numa mão e o
 * etilômetro na outra, e o pessoal chega fora da ordem do sorteio: a busca fica
 * presa no topo e o botão principal de cada cartão ocupa a largura toda.
 *
 * `tom` dá a cor do setor: verde no SSMA, vermelho na Portaria.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  FileDown, FileSignature, Loader2, Search, Trash2, UserPlus, X, XCircle, type LucideIcon,
} from 'lucide-react';
import type { PortAlcoolemiaTeste } from '../../types';
import type { AlcoolemiaMetricas } from '../../lib/portariaApi';
import {
  ROTULO_MODO_PERIODO, diasNoIntervalo, intervaloDoPeriodo, rotuloPeriodo,
  type Intervalo, type ModoPeriodo,
} from '../../lib/alcoolemiaPeriodo';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';

const MODOS: ModoPeriodo[] = ['dia', 'semana', 'mes', 'periodo'];

export type TomSetor = 'ssma' | 'portaria';

const TOM: Record<TomSetor, { primario: string; foco: string; contorno: string; ativo: string; link: string; icone: string }> = {
  ssma: {
    primario: 'bg-emerald-600 text-white hover:bg-emerald-700',
    foco: 'focus:border-emerald-500',
    contorno: 'focus-visible:outline-emerald-600',
    ativo: 'text-emerald-800 dark:text-emerald-300',
    link: 'text-emerald-700 dark:text-emerald-400',
    icone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  },
  portaria: {
    primario: 'bg-rose-600 text-white hover:bg-rose-700',
    foco: 'focus:border-rose-500',
    contorno: 'focus-visible:outline-rose-600',
    ativo: 'text-rose-700 dark:text-rose-300',
    link: 'text-rose-700 dark:text-rose-400',
    icone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  },
};

const CAMPO_DATA = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold text-slate-800 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function AbasPeriodo({ modo, onModo, tom, rotulo }: { modo: ModoPeriodo; onModo: (m: ModoPeriodo) => void; tom: TomSetor; rotulo: string }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {MODOS.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={modo === m}
          onClick={() => onModo(m)}
          className={`rounded-lg py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${TOM[tom].contorno} ${
            modo === m
              ? `bg-white shadow-sm dark:bg-slate-950 ${TOM[tom].ativo}`
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          {ROTULO_MODO_PERIODO[m]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export function SeletorPeriodo({
  modo, onModo, intervalo, hoje, onPasso, onHoje, inicio, fim, onInicio, onFim, tom = 'ssma',
}: {
  modo: ModoPeriodo;
  onModo: (m: ModoPeriodo) => void;
  intervalo: Intervalo;
  hoje: string;
  onPasso: (passo: number) => void;
  onHoje: () => void;
  inicio: string;
  fim: string;
  onInicio: (v: string) => void;
  onFim: (v: string) => void;
  tom?: TomSetor;
}) {
  const contemHoje = intervalo.inicio <= hoje && hoje <= intervalo.fim;
  return (
    <div className="space-y-2.5">
      <AbasPeriodo modo={modo} onModo={onModo} tom={tom} rotulo="Mostrar por" />

      {modo === 'periodo' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">De</span>
            <input type="date" value={inicio} max={fim || undefined} onChange={(e) => onInicio(e.target.value)} className={`${CAMPO_DATA} ${TOM[tom].foco}`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Até</span>
            <input type="date" value={fim} min={inicio || undefined} onChange={(e) => onFim(e.target.value)} className={`${CAMPO_DATA} ${TOM[tom].foco}`} />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPasso(-1)}
            aria-label={`${ROTULO_MODO_PERIODO[modo]} anterior`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-base font-bold text-slate-900 first-letter:uppercase dark:text-slate-50" aria-live="polite">
              {rotuloPeriodo(modo, intervalo, hoje)}
            </p>
            {!contemHoje && (
              <button type="button" onClick={onHoje} className={`text-xs font-semibold underline-offset-2 hover:underline ${TOM[tom].link}`}>
                Voltar para hoje
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onPasso(1)}
            aria-label={`Próximo ${ROTULO_MODO_PERIODO[modo].toLowerCase()}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Busca de quem chegou
// ---------------------------------------------------------------------------

export function BuscaColaborador({
  valor, onChange, encontrados, total, tom = 'ssma',
}: {
  valor: string;
  onChange: (v: string) => void;
  encontrados: number;
  total: number;
  tom?: TomSetor;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          ref={ref}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Buscar colaborador pelo nome ou matrícula"
          placeholder="Quem chegou? Nome ou matrícula"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onChange(''); }}
          className={`h-12 w-full rounded-2xl border-2 border-slate-200 bg-white pl-11 pr-11 text-base font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 [&::-webkit-search-cancel-button]:hidden ${TOM[tom].foco}`}
        />
        {valor && (
          <button
            type="button"
            onClick={() => { onChange(''); ref.current?.focus(); }}
            aria-label="Limpar busca"
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      {valor.trim() && (
        <p className="mt-1.5 px-1 text-xs font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
          {encontrados === 0 ? 'Ninguém com esse nome na lista' : `${encontrados} de ${total} na lista`}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resultado: contagem e filtro no mesmo lugar
// ---------------------------------------------------------------------------

/** `EXCLUIDOS` mostra só os testes excluídos (lançados errado), que somem da lista, das contagens e do livro. */
export type FiltroResultado = 'TODOS' | 'PENDENTE' | 'NEGATIVO' | 'POSITIVO' | 'RECUSA' | 'EXCLUIDOS';

const FILTROS: { valor: FiltroResultado; rotulo: string; chave: keyof AlcoolemiaMetricas; ativo: string; numero: string }[] = [
  { valor: 'TODOS', rotulo: 'Todos', chave: 'total', ativo: 'border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900', numero: '' },
  { valor: 'PENDENTE', rotulo: 'Aguardando', chave: 'pendentes', ativo: 'border-amber-500 bg-amber-500 text-white', numero: 'text-amber-600 dark:text-amber-400' },
  { valor: 'NEGATIVO', rotulo: 'Aptos', chave: 'negativos', ativo: 'border-emerald-600 bg-emerald-600 text-white', numero: 'text-emerald-700 dark:text-emerald-400' },
  { valor: 'POSITIVO', rotulo: 'Positivos', chave: 'positivos', ativo: 'border-rose-600 bg-rose-600 text-white', numero: 'text-rose-600 dark:text-rose-400' },
  { valor: 'RECUSA', rotulo: 'Recusas', chave: 'recusas', ativo: 'border-orange-600 bg-orange-600 text-white', numero: 'text-orange-600 dark:text-orange-400' },
];

export function FiltrosResultado({
  valor, onChange, metricas, excluidos = 0,
}: {
  valor: FiltroResultado;
  onChange: (v: FiltroResultado) => void;
  metricas: AlcoolemiaMetricas;
  /** Excluídos no período: o filtro só aparece quando há algum (ou está ativo). */
  excluidos?: number;
}) {
  const verExcluidos = valor === 'EXCLUIDOS';
  return (
    <div role="radiogroup" aria-label="Filtrar por resultado" className="no-scrollbar -mx-3 flex min-w-0 gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      {(excluidos > 0 || verExcluidos) && (
        <button
          type="button"
          role="radio"
          aria-checked={verExcluidos}
          onClick={() => onChange(verExcluidos ? 'TODOS' : 'EXCLUIDOS')}
          className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-dashed px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 ${
            verExcluidos
              ? 'order-first border-slate-600 bg-slate-600 text-white dark:border-slate-300 dark:bg-slate-300 dark:text-slate-900'
              : 'order-last border-slate-300 bg-white text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400'
          }`}
        >
          <Trash2 className="h-4 w-4" />
          <span>Excluídos</span>
          <span className="text-base font-extrabold tabular-nums">{excluidos}</span>
        </button>
      )}
      {FILTROS.map((f) => {
        const ativo = valor === f.valor;
        const n = metricas[f.chave] as number;
        return (
          <button
            key={f.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(ativo && f.valor !== 'TODOS' ? 'TODOS' : f.valor)}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 ${
              ativo
                ? f.ativo
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            <span>{f.rotulo}</span>
            <span className={`text-base font-extrabold tabular-nums ${ativo ? '' : f.numero}`}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selos
// ---------------------------------------------------------------------------

/** "0,12" — vírgula decimal, como o termo impresso. */
export function formatarMgL(valor: number | null | undefined): string {
  return Number(valor || 0).toFixed(2).replace('.', ',');
}

export function SeloRazao({ razao }: { razao: string }) {
  if (razao === 'MOTIVADO') {
    return <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Motivado / suspeita</span>;
  }
  if (razao === 'POS_ACIDENTE') {
    return <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Pós-acidente</span>;
  }
  return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Aleatório (sorteio)</span>;
}

export function SeloResultado({ teste }: { teste: PortAlcoolemiaTeste }) {
  switch (teste.resultado) {
    case 'NEGATIVO':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Apto (0,00 mg/L)
        </span>
      );
    case 'POSITIVO':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Positivo ({formatarMgL(teste.valor_medido)} mg/L)
        </span>
      );
    case 'RECUSA':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-bold text-orange-800 dark:bg-orange-950/50 dark:text-orange-300">
          <XCircle className="h-3.5 w-3.5" /> Recusa
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
          <Clock3 className="h-3.5 w-3.5" /> Aguardando teste
        </span>
      );
  }
}

export function SeloTermo({ teste }: { teste: PortAlcoolemiaTeste }) {
  if (teste.termo_assinado_fisicamente) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
        <Check className="h-3.5 w-3.5" /> Termo assinado
      </span>
    );
  }
  if (teste.resultado === 'POSITIVO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-extrabold text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
        <AlertCircle className="h-3.5 w-3.5" /> Falta assinar o termo
      </span>
    );
  }
  return <span className="text-[11px] text-slate-400">{teste.termo_impresso_em ? 'Termo impresso' : 'Termo não impresso'}</span>;
}

/** Teste excluído: fica guardado e aparece só no filtro Excluídos. */
export function SeloExcluido({ teste }: { teste: PortAlcoolemiaTeste }) {
  if (!teste.excluido_em) return null;
  const quando = teste.excluido_em.slice(0, 10);
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <Trash2 className="h-3.5 w-3.5" /> Excluído em {quando.slice(8, 10)}/{quando.slice(5, 7)}
    </span>
  );
}

/**
 * Quem registrou o resultado: o vigilante na Portaria ou o examinador no SSMA
 * (o teste pode ser aberto na Portaria e ter o resultado lançado no SSMA).
 */
export function SeloQuemAferiu({ teste }: { teste: PortAlcoolemiaTeste }) {
  if (teste.resultado === 'PENDENTE') return null;
  const pelaPortaria = !!teste.vigilante;
  const nome = (pelaPortaria ? teste.vigilante : teste.examinador_nome) || '';
  if (!nome) return null;
  return (
    <span className="text-[11px] text-slate-500 dark:text-slate-400">
      {pelaPortaria ? 'Aferido na portaria' : 'Registrado no SSMA'} por {nome.split(' ')[0].toLowerCase().replace(/^./, (c) => c.toUpperCase())}
      {teste.etilometro_codigo ? `, ${teste.etilometro_codigo}` : ''}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cartão do celular
// ---------------------------------------------------------------------------

export interface AcaoPrincipal {
  rotulo: string;
  icone: LucideIcon;
  onClick: () => void;
  /** Cheio na cor do setor (o próximo passo do teste); senão, contorno. */
  destaque: boolean;
}

/** Botão quadrado de 48px ao lado da ação principal (imprimir, editar, excluir…). */
export function BotaoCartao({
  rotulo, icone: Icone, onClick, tom = 'neutro',
}: {
  rotulo: string;
  icone: LucideIcon;
  onClick: () => void;
  tom?: 'neutro' | 'perigo' | 'alerta' | 'sucesso';
}) {
  const cor = {
    neutro: 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
    perigo: 'border-slate-200 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40',
    alerta: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
    sucesso: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  }[tom];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${cor}`}
    >
      <Icone className="h-5 w-5" />
    </button>
  );
}

export function CartaoTeste({
  teste, principal, acoes, rodape, tom = 'ssma',
}: {
  teste: PortAlcoolemiaTeste;
  principal?: AcaoPrincipal | null;
  /** Botões quadrados à direita (BotaoCartao). */
  acoes?: React.ReactNode;
  /** Selos extras na linha da razão (termo, quem aferiu). */
  rodape?: React.ReactNode;
  tom?: TomSetor;
}) {
  const excluido = !!teste.excluido_em;
  const pendente = teste.resultado === 'PENDENTE';
  const positivo = teste.resultado === 'POSITIVO';
  const funcao = [teste.empresa && teste.empresa !== 'TEN' ? teste.empresa : null, teste.cargo_funcao].filter(Boolean).join(', ');
  const Icone = principal?.icone;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 dark:bg-slate-900 ${
        excluido
          ? 'border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60'
          : positivo
          ? 'border-rose-300 dark:border-rose-900'
          : pendente
            ? 'border-slate-200 shadow-[inset_4px_0_0_0_#f59e0b] dark:border-slate-800'
            : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">
          {teste.horario}
          <span className="ml-1.5 font-medium">{(teste.turno || '').toLowerCase()}</span>
        </p>
        <SeloResultado teste={teste} />
      </div>

      <h3 className="mt-1.5 text-lg font-extrabold leading-tight text-slate-900 dark:text-slate-50">{teste.nome}</h3>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        {teste.matricula ? <span className="font-semibold tabular-nums">Matr. {teste.matricula}</span> : teste.documento ? <span>Doc. {teste.documento}</span> : <span>Sem matrícula</span>}
        {funcao && <span className="block truncate text-slate-500 dark:text-slate-400">{funcao.toLowerCase()}</span>}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {excluido ? <SeloExcluido teste={teste} /> : <SeloRazao razao={teste.razao_teste || 'ALEATORIO'} />}
        {rodape}
        <span className="ml-auto font-mono text-[11px] text-slate-400">{teste.codigo_formulario}</span>
      </div>

      {(principal || acoes) && (
        <div className="mt-3.5 flex justify-end gap-2">
          {principal && Icone && (
            <button
              type="button"
              onClick={principal.onClick}
              className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 ${TOM[tom].contorno} ${
                principal.destaque
                  ? TOM[tom].primario
                  : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icone className="h-5 w-5" />
              {principal.rotulo}
            </button>
          )}
          {acoes}
        </div>
      )}
    </article>
  );
}

/** Lista vazia: sem ninguém no período, ou a busca não achou — aí oferece adicionar quem chegou. */
export function ListaVazia({
  busca, rotulo, onAdicionar, tom = 'ssma', rotuloAdicionar = 'Adicionar teste',
  dicaVazia = 'A portaria ainda não registrou sorteados nesse período. Testes motivados ou pós-acidente entram por aqui.',
  dicaBusca = 'Se a pessoa veio para o teste e não foi sorteada pela portaria, adicione o teste por aqui.',
}: {
  busca: string;
  rotulo: string;
  onAdicionar: () => void;
  tom?: TomSetor;
  rotuloAdicionar?: string;
  dicaVazia?: string;
  dicaBusca?: string;
}) {
  const buscando = busca.trim().length > 0;
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${TOM[tom].icone}`}>
        {buscando ? <UserPlus className="h-6 w-6" /> : <FileSignature className="h-6 w-6" />}
      </span>
      <h3 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-100">
        {buscando ? `“${busca.trim()}” não está na lista` : `Nenhum teste em ${rotulo}`}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{buscando ? dicaBusca : dicaVazia}</p>
      <button
        type="button"
        onClick={onAdicionar}
        className={`mt-4 inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold ${TOM[tom].primario}`}
      >
        <UserPlus className="h-4 w-4" />
        {buscando ? `${rotuloAdicionar} para essa pessoa` : rotuloAdicionar}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exportação do livro
// ---------------------------------------------------------------------------

/** Escolhe o período do livro em PDF. Abre com o período que a tela está mostrando. */
export function ExportarLivroModal({
  modoAtual, intervaloAtual, hoje, gerando, onCancelar, onGerar, tom = 'ssma',
}: {
  modoAtual: ModoPeriodo;
  intervaloAtual: Intervalo;
  hoje: string;
  gerando: boolean;
  onCancelar: () => void;
  onGerar: (intervalo: Intervalo) => void;
  tom?: TomSetor;
}) {
  const [modo, setModo] = useState<ModoPeriodo>(modoAtual);
  const [inicio, setInicio] = useState(intervaloAtual.inicio);
  const [fim, setFim] = useState(intervaloAtual.fim);

  // Trocar Dia/Semana/Mês recalcula a partir do início escolhido.
  useEffect(() => {
    if (modo === 'periodo') return;
    const iv = intervaloDoPeriodo(modo, inicio || hoje);
    setInicio(iv.inicio);
    setFim(iv.fim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const intervalo = intervaloDoPeriodo('periodo', hoje, inicio, fim);
  const valido = !!inicio && !!fim;
  const dias = valido ? diasNoIntervalo(intervalo) : 0;

  return (
    <Modal onClose={() => !gerando && onCancelar()} maxWidth="max-w-md" ariaLabel="Exportar livro de alcoolemia">
      <ModalHeader onClose={() => !gerando && onCancelar()}>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Exportar livro de alcoolemia</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">PDF do FRM.SGP-0015 com todos os testes do período.</p>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-4 p-5">
        <AbasPeriodo modo={modo} onModo={setModo} tom={tom} rotulo="Período do livro" />

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">De</span>
            <input
              type="date"
              value={inicio}
              onChange={(e) => {
                const v = e.target.value;
                if (modo === 'periodo') { setInicio(v); return; }
                const iv = intervaloDoPeriodo(modo, v || hoje);
                setInicio(iv.inicio);
                setFim(iv.fim);
              }}
              className={`${CAMPO_DATA} ${TOM[tom].foco}`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Até</span>
            <input
              type="date"
              value={fim}
              disabled={modo !== 'periodo'}
              onChange={(e) => setFim(e.target.value)}
              className={`${CAMPO_DATA} ${TOM[tom].foco} disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-800`}
            />
          </label>
        </div>

        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
          {valido
            ? <>Livro de <strong>{rotuloPeriodo(modo, intervalo, hoje)}</strong>{dias > 1 ? `, ${dias} dias` : ''}.</>
            : 'Escolha as duas datas.'}
        </p>
      </ModalBody>
      <ModalFooter className="flex items-center justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
        <button
          type="button"
          disabled={gerando}
          onClick={onCancelar}
          className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={gerando || !valido}
          onClick={() => onGerar(intervalo)}
          className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-50 ${TOM[tom].primario}`}
        >
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Gerar PDF
        </button>
      </ModalFooter>
    </Modal>
  );
}
