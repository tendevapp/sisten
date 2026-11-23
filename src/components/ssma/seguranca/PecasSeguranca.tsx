/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças de tela comuns aos formulários da Segurança (ISP, Ronda e Observação
 * Comportamental), no mesmo desenho da Ficha de EPI e do RID:
 *
 * - `CabecalhoSeguranca` — voltar, ícone, título, código do formulário e abas;
 * - `BarraEnvio` — botão principal preso no rodapé do celular (zona do polegar);
 * - `ItemHistorico` — linha do histórico com código, título, resumo e selo de excluído;
 * - `PendentesFila` — registros feitos sem rede que ainda não subiram;
 * - `PainelRegistro` — situação de exclusão, excluir com motivo, restaurar e log.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  CalendarRange, ChevronDown, ChevronLeft, ChevronRight, CloudOff, Download, FileSpreadsheet, FileText, History, RotateCcw, Trash2,
  type LucideIcon,
} from 'lucide-react';
import Modal from '../../ui/Modal';
import { BadgeExcluido, MostrarExcluidosToggle } from '../../ui/ExcluidosControls';
import PeriodoFormulario from '../PeriodoFormulario';
import { useToast } from '../../ui/Toast';
import type { Profile } from '../../../types';
import {
  excluirRegistroSeguranca, listarLogSeguranca, mensagemErro, podeExcluirRegistro, restaurarRegistroSeguranca,
  type ExclusaoRegistro, type FormularioSeguranca, type LinhaLogSeguranca,
} from '../../../lib/ssmaSegurancaRegistro';

// ---------------------------------------------------------------------------
// Cabeçalho + abas
// ---------------------------------------------------------------------------

export type AbaSeguranca = 'novo' | 'historico';

/** A rolagem do app é no `<main>`, não na janela. */
export function rolarParaTopo() {
  document.querySelector('main')?.scrollTo({ top: 0 });
}

interface CabecalhoProps {
  icone: LucideIcon;
  titulo: string;
  codigo: string;
  revisao: string;
  descricao: string;
  aba: AbaSeguranca;
  rotuloNovo: string;
  onAba: (aba: AbaSeguranca) => void;
  onVoltar: () => void;
  voltarRotulo: string;
  /** Bloqueia trocar de aba (gravação em andamento). */
  ocupado?: boolean;
}

export function CabecalhoSeguranca({ icone: Icone, titulo, codigo, revisao, descricao, aba, rotuloNovo, onAba, onVoltar, voltarRotulo, ocupado }: CabecalhoProps) {
  return (
    <>
      <button type="button" onClick={onVoltar} disabled={ocupado}
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-bold text-slate-600 hover:text-emerald-700 disabled:opacity-50 dark:text-slate-300 dark:hover:text-emerald-400">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {voltarRotulo}
      </button>
      <header className="flex items-start gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/25">
          <Icone className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">{titulo}</h1>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {codigo} · Rev. {revisao}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">{descricao}</p>
        </div>
      </header>
      <nav className="grid grid-cols-2 border-b border-slate-200 sm:flex sm:gap-1 dark:border-slate-800" aria-label={'Seções de ' + titulo}>
        {([['novo', rotuloNovo], ['historico', 'Histórico']] as const).map(([id, rotulo]) => (
          <button key={id} type="button" disabled={ocupado} onClick={() => onAba(id)} aria-current={aba === id ? 'page' : undefined}
            className={`-mb-px min-h-12 border-b-2 px-3 text-sm font-bold transition-colors disabled:opacity-50 ${
              aba === id
                ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
            {rotulo}
          </button>
        ))}
      </nav>
    </>
  );
}

// ---------------------------------------------------------------------------
// Seção do formulário
// ---------------------------------------------------------------------------

const COR_SECAO = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
} as const;

interface SecaoProps {
  /** Número da etapa ou ícone, no quadradinho colorido. */
  marca: ReactNode;
  titulo: string;
  descricao?: ReactNode;
  cor?: keyof typeof COR_SECAO;
  /** À direita do título (contador, botão). */
  extra?: ReactNode;
  children: ReactNode;
  /** Com `disabled` definido vira `<fieldset>` e desliga todos os campos. */
  disabled?: boolean;
  id?: string;
}

/** Cartão com cabeçalho separado por linha, no desenho das seções do RID. */
export function Secao({ marca, titulo, descricao, cor = 'emerald', extra, children, disabled, id }: SecaoProps) {
  const idTitulo = useId();
  const cabecalho = (
    <div className="-mx-4 -mt-4 flex items-start gap-3 border-b border-slate-100 px-4 py-3.5 sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-4 dark:border-slate-800">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${COR_SECAO[cor]}`} aria-hidden="true">{marca}</span>
      <div className="min-w-0 flex-1">
        <h2 id={idTitulo} tabIndex={-1} className="scroll-mt-24 text-sm font-bold text-slate-900 sm:text-base dark:text-slate-100">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{descricao}</p>}
      </div>
      {extra && <div className="shrink-0">{extra}</div>}
    </div>
  );
  const classe = 'min-w-0 space-y-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900';
  return disabled === undefined
    ? <section id={id} aria-labelledby={idTitulo} className={classe}>{cabecalho}{children}</section>
    : <fieldset id={id} disabled={disabled} aria-labelledby={idTitulo} className={classe}>{cabecalho}{children}</fieldset>;
}

/** Selo de contagem para o `extra` da seção. */
export function Contador({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'alerta' | 'ok' }) {
  const cores = {
    neutro: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    alerta: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${cores[tom]}`}>{children}</span>;
}

/** Par rótulo/valor dos detalhes. */
export function Dado({ rotulo, children, largo }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <div className={`min-w-0 ${largo ? 'col-span-2 lg:col-span-3' : ''}`}>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{rotulo}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium text-slate-900 dark:text-slate-100">{children || '—'}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra de envio
// ---------------------------------------------------------------------------

/** No celular fica presa no rodapé da tela (polegar); do `sm` para cima, no fim do formulário. */
export function BarraEnvio({ children, resumo }: { children: ReactNode; resumo?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-3 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none dark:border-slate-800 dark:bg-slate-950/95 sm:dark:bg-transparent">
      {resumo && <div className="min-w-0 flex-1 text-xs text-slate-600 sm:flex-none dark:text-slate-300" aria-live="polite">{resumo}</div>}
      <div className={`flex gap-2 ${resumo ? 'shrink-0' : 'flex-1 sm:flex-none'}`}>{children}</div>
    </div>
  );
}

export const botaoPrincipal = 'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60 sm:flex-none';

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

interface ItemHistoricoProps {
  codigo: string;
  titulo: string;
  linhas: ReactNode[];
  destaque?: ReactNode;
  excluidoEm?: string | null;
  onAbrir: () => void;
  disabled?: boolean;
}

export function ItemHistorico({ codigo, titulo, linhas, destaque, excluidoEm, onAbrir, disabled }: ItemHistoricoProps) {
  return (
    <li>
      <button type="button" disabled={disabled} onClick={onAbrir}
        className={`flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800/60 ${excluidoEm ? 'opacity-70' : ''}`}>
        <span className="min-w-0 flex-1 break-words">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">{codigo}</span>
            {excluidoEm && <BadgeExcluido em={excluidoEm} />}
          </span>
          <span className={`mt-0.5 block font-semibold text-slate-900 dark:text-slate-100 ${excluidoEm ? 'line-through decoration-slate-400/60' : ''}`}>{titulo}</span>
          {linhas.map((l, i) => <span key={i} className="block text-xs text-slate-600 dark:text-slate-400">{l}</span>)}
        </span>
        {destaque && <span className="shrink-0 text-right text-xs font-bold text-slate-700 dark:text-slate-200">{destaque}</span>}
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </button>
    </li>
  );
}

export function BotoesExportar({ onExcel, onPdf, disabled }: { onExcel: () => void; onPdf: () => void; disabled?: boolean }) {
  const classe = 'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:flex-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
  return (
    <div className="flex gap-2">
      <button type="button" disabled={disabled} className={classe} onClick={onExcel}><FileSpreadsheet className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />Excel</button>
      <button type="button" disabled={disabled} className={classe} onClick={onPdf}><FileText className="h-4 w-4 text-rose-700 dark:text-rose-400" aria-hidden="true" />Ver PDF</button>
    </div>
  );
}

type Periodo = { de: string; ate: string };

interface HistoricoProps {
  /** "inspeções", "rondas", "observações". */
  nome: string;
  carregando: boolean;
  erro: string;
  onAtualizar: () => void;
  filtro: Periodo;
  onFiltro: (p: Periodo) => void;
  recorte: Periodo;
  onRecorte: (p: Periodo) => void;
  onExportar: (tipo: 'xlsx' | 'pdf') => void;
  exportando: boolean;
  /** Só administrador vê o "Mostrar excluídos". */
  podeVerExcluidos: boolean;
  incluirExcluidos: boolean;
  onIncluirExcluidos: (v: boolean) => void;
  pagina: number;
  onPagina: (p: number) => void;
  temMais: boolean;
  vazio: boolean;
  pendentes: { id: string; titulo: string; detalhe: string }[];
  children: ReactNode;
}

export function HistoricoSeguranca(p: HistoricoProps) {
  const [painel, setPainel] = useState<'filtro' | 'exportar' | null>(null);
  const filtrando = Boolean(p.filtro.de || p.filtro.ate);
  const botao = (ativo: boolean) => `inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${ativo
    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`;
  return (
    <div className="space-y-4">
      <PendentesFila itens={p.pendentes} />
      <section className="min-w-0 rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 sm:px-5 dark:border-slate-800">
          <button type="button" className={botao(painel === 'filtro' || filtrando)} aria-expanded={painel === 'filtro'} onClick={() => setPainel(painel === 'filtro' ? null : 'filtro')}>
            <CalendarRange className="h-4 w-4" aria-hidden="true" />{filtrando ? periodoTexto(p.filtro) : 'Período'}
          </button>
          <button type="button" className={botao(painel === 'exportar')} aria-expanded={painel === 'exportar'} onClick={() => setPainel(painel === 'exportar' ? null : 'exportar')}>
            <Download className="h-4 w-4" aria-hidden="true" />Exportar
          </button>
          <MostrarExcluidosToggle visivel={p.podeVerExcluidos} checked={p.incluirExcluidos} onChange={p.onIncluirExcluidos} className="min-h-11 rounded-xl" />
        </div>
        {painel === 'filtro' && (
          <div className="space-y-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:px-5 dark:border-slate-800 dark:bg-slate-950/30">
            <PeriodoFormulario valor={p.filtro} alterar={p.onFiltro} sufixo=" da consulta" />
            {filtrando && <button type="button" className="min-h-11 text-sm font-semibold text-emerald-700 underline dark:text-emerald-400" onClick={() => p.onFiltro({ de: '', ate: '' })}>Limpar período</button>}
          </div>
        )}
        {painel === 'exportar' && (
          <div className="space-y-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:px-5 dark:border-slate-800 dark:bg-slate-950/30">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Exportar {p.nome} do período (sem os excluídos)</p>
            <PeriodoFormulario valor={p.recorte} alterar={p.onRecorte} sufixo=" da exportação" />
            <BotoesExportar disabled={p.exportando} onExcel={() => p.onExportar('xlsx')} onPdf={() => p.onExportar('pdf')} />
          </div>
        )}
        <div className="p-2 sm:p-3">
          {p.erro ? (
            <div role="alert" className="m-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
              {p.erro} <button type="button" className="ml-1 min-h-11 font-bold underline" onClick={p.onAtualizar}>Tentar de novo</button>
            </div>
          ) : p.carregando ? (
            <ul className="space-y-2 p-2" aria-busy="true" aria-label={'Carregando ' + p.nome}>
              {[0, 1, 2].map(i => <li key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
            </ul>
          ) : p.vazio ? (
            <p className="p-6 text-center text-sm text-slate-600 dark:text-slate-400">Nenhum registro de {p.nome} {filtrando ? 'neste período' : 'ainda'}.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">{p.children}</ul>
          )}
        </div>
        {(p.pagina > 0 || p.temMais) && (
          <nav aria-label={'Páginas de ' + p.nome} className="flex items-center justify-between gap-2 border-t border-slate-100 p-3 sm:px-5 dark:border-slate-800">
            <button type="button" className={botao(false)} disabled={!p.pagina || p.carregando} onClick={() => p.onPagina(p.pagina - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />Anterior</button>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Página {p.pagina + 1}</span>
            <button type="button" className={botao(false)} disabled={!p.temMais || p.carregando} onClick={() => p.onPagina(p.pagina + 1)}>
              Próxima<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </nav>
        )}
      </section>
    </div>
  );
}

function periodoTexto({ de, ate }: Periodo) {
  const br = (d: string) => d.split('-').reverse().join('/');
  if (de && ate) return `${br(de)} a ${br(ate)}`;
  return de ? 'A partir de ' + br(de) : 'Até ' + br(ate);
}

/** Registros feitos sem rede: ainda não têm código, que o banco atribui no envio. */
export function PendentesFila({ itens }: { itens: { id: string; titulo: string; detalhe: string }[] }) {
  if (!itens.length) return null;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30" aria-label="Aguardando envio">
      <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
        <CloudOff className="h-4 w-4" aria-hidden="true" /> Aguardando envio · {itens.length}
      </h2>
      <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
        Feitos sem rede neste aparelho. Sobem sozinhos quando a conexão voltar e recebem o código no envio.
      </p>
      <ul className="mt-2 space-y-1.5">
        {itens.map(i => (
          <li key={i.id} className="rounded-lg bg-white/70 px-3 py-2 text-xs dark:bg-slate-900/60">
            <span className="block font-semibold text-slate-900 dark:text-slate-100">{i.titulo}</span>
            <span className="text-slate-600 dark:text-slate-400">{i.detalhe}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Exclusão, restauração e log
// ---------------------------------------------------------------------------

const ROTULO_OPERACAO: Record<string, string> = {
  inclusao: 'Registro criado',
  alteracao: 'Alteração',
  exclusao: 'Excluído',
  restauracao: 'Restaurado',
  exclusao_definitiva: 'Apagado do banco',
};

/** Campos de controle que não interessam a quem lê o log. */
const CAMPOS_OCULTOS = new Set(['excluido_em', 'excluido_por', 'motivo_exclusao']);

function legivel(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function LogRegistro({ formulario, registroId, versao, rotulosCampo }: {
  formulario: FormularioSeguranca; registroId: string; versao: number; rotulosCampo: Record<string, string>;
}) {
  const [linhas, setLinhas] = useState<LinhaLogSeguranca[] | null>(null);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(false);
  const idLista = useId();

  useEffect(() => {
    let vivo = true;
    setErro(false);
    listarLogSeguranca(formulario, registroId)
      .then(l => { if (vivo) setLinhas(l); })
      .catch(() => { if (vivo) { setErro(true); setLinhas([]); } });
    return () => { vivo = false; };
  }, [formulario, registroId, versao]);

  const resumo = linhas === null ? 'carregando…'
    : erro ? 'indisponível sem conexão'
    : linhas.length === 0 ? 'sem registros'
    : `${linhas.length} ${linhas.length === 1 ? 'registro' : 'registros'}`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} aria-controls={idLista}
        className="flex min-h-12 w-full items-center gap-2 px-3 text-left text-sm font-bold text-slate-700 dark:text-slate-200">
        <History className="h-4 w-4" aria-hidden="true" />
        Log do registro
        <span className="font-normal text-slate-500 dark:text-slate-400">· {resumo}</span>
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform ${aberto ? '' : '-rotate-90'}`} aria-hidden="true" />
      </button>
      {aberto && linhas && linhas.length > 0 && (
        <ol id={idLista} className="space-y-2 px-3 pb-3">
          {linhas.map(l => {
            const campos = l.alteracoes.filter(a => !CAMPOS_OCULTOS.has(a.campo));
            return (
              <li key={l.id} className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-700">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {ROTULO_OPERACAO[l.operacao] ?? l.operacao}
                    <span className="font-normal text-slate-500 dark:text-slate-400"> · {l.alterado_por_nome || (l.origem === 'sistema' ? 'sistema' : 'usuário sem nome')}</span>
                  </span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    {new Date(l.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                {l.operacao === 'exclusao' && l.motivo && <p className="mt-1 text-slate-700 dark:text-slate-300"><b>Motivo:</b> {l.motivo}</p>}
                {campos.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {campos.map((m, i) => (
                      <li key={i} className="break-words text-slate-600 dark:text-slate-300">
                        <span className="font-semibold">{rotulosCampo[m.campo] ?? m.campo}:</span>{' '}
                        <span className="text-slate-500 line-through decoration-slate-400/60">{legivel(m.de)}</span>{' → '}{legivel(m.para)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

interface PainelRegistroProps {
  formulario: FormularioSeguranca;
  user: Profile;
  registro: ExclusaoRegistro & { id: string; codigo: string };
  /** Depois de excluir/restaurar: a tela recarrega o histórico. */
  onMudou: (acao: 'excluido' | 'restaurado') => void;
  rotulosCampo?: Record<string, string>;
}

/** Fim do detalhe: selo de excluído com motivo, excluir/restaurar (autor ou admin) e log. */
export function PainelRegistro({ formulario, user, registro, onMudou, rotulosCampo = {} }: PainelRegistroProps) {
  const toast = useToast();
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [versaoLog, setVersaoLog] = useState(0);
  const idMotivo = useId();
  const pode = podeExcluirRegistro(user, registro);
  const excluido = Boolean(registro.excluido_em);

  async function excluir() {
    if (motivo.trim().length < 3) { setErro('Escreva o motivo (pelo menos 3 letras).'); return; }
    setOcupado(true); setErro('');
    try {
      await excluirRegistroSeguranca(formulario, registro.id, motivo);
      toast.success(registro.codigo + ' excluído. Ele continua guardado e pode ser restaurado.');
      setPedindoMotivo(false); setMotivo(''); setVersaoLog(v => v + 1);
      onMudou('excluido');
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível excluir. Verifique a conexão.'));
    } finally { setOcupado(false); }
  }

  async function restaurar() {
    setOcupado(true);
    try {
      await restaurarRegistroSeguranca(formulario, registro.id);
      toast.success(registro.codigo + ' restaurado.');
      setVersaoLog(v => v + 1);
      onMudou('restaurado');
    } catch (e) {
      toast.error(mensagemErro(e, 'Não foi possível restaurar. Verifique a conexão.'));
    } finally { setOcupado(false); }
  }

  return (
    <section className="space-y-3">
      {excluido && (
        <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <p className="font-bold">Registro excluído em {new Date(registro.excluido_em!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
          {registro.motivo_exclusao && <p className="mt-0.5">Motivo: {registro.motivo_exclusao}</p>}
          <p className="mt-0.5 text-xs">Fora do histórico e da exportação. Os dados continuam guardados.</p>
        </div>
      )}
      {pode && (
        <div className="flex flex-wrap gap-2">
          {excluido ? (
            <button type="button" disabled={ocupado} onClick={restaurar}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-emerald-300 px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restaurar registro
            </button>
          ) : (
            <button type="button" disabled={ocupado} onClick={() => { setErro(''); setPedindoMotivo(true); }}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir registro
            </button>
          )}
        </div>
      )}
      <LogRegistro formulario={formulario} registroId={registro.id} versao={versaoLog} rotulosCampo={rotulosCampo} />

      {pedindoMotivo && (
        <Modal onClose={() => !ocupado && setPedindoMotivo(false)} ariaLabel={'Excluir ' + registro.codigo} layout="dialog" maxWidth="max-w-md" disableOutsideClose={ocupado}>
          <form className="space-y-3 p-5" onSubmit={e => { e.preventDefault(); void excluir(); }}>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Excluir {registro.codigo}?</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              O registro sai do histórico e da exportação, mas fica guardado com o motivo no log. Você ou um administrador pode restaurar depois.
            </p>
            <div>
              <label htmlFor={idMotivo} className="text-sm font-semibold text-slate-800 dark:text-slate-100">Motivo da exclusão</label>
              <textarea id={idMotivo} autoFocus rows={3} maxLength={1000} value={motivo} disabled={ocupado}
                onChange={e => setMotivo(e.target.value)} placeholder="Ex.: lançado em duplicidade"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-rose-500 focus:outline-rose-500 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </div>
            {erro && <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">{erro}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={ocupado} onClick={() => setPedindoMotivo(false)}
                className="min-h-12 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={ocupado}
                className="min-h-12 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">{ocupado ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
