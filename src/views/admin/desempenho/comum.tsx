/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças do Monitor de Desempenho: seção com título, lista de alertas, texto
 * de consulta recolhível e a tabela que vira cartões no celular (as abas têm
 * muitas tabelas; escrever o par TableCards/TableDesktop em cada uma dobraria
 * o arquivo).
 */

import React from 'react';
import { AlertOctagon, AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableEmpty, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../../components/ui/DataTable';
import type { Alerta } from '../../../lib/desempenho/diagnostico';
import { PAGES } from '../../../lib/pages';
import { labelForPath } from '../../../lib/usageTracker';

export function Secao({
  titulo, descricao, icone: Icone, acoes, children,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  icone?: LucideIcon;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
            {Icone && <Icone className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />}
            {titulo}
          </h3>
          {descricao && <p className="mt-0.5 max-w-3xl text-xs" style={{ color: 'var(--ink-muted)' }}>{descricao}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
}

const ESTILO_ALERTA = {
  critico: { icone: AlertOctagon, classe: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200' },
  atencao: { icone: AlertTriangle, classe: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200' },
  info: { icone: Info, classe: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200' },
} as const;

export function ListaAlertas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return null;
  return (
    <ul className="space-y-2" aria-label="Alertas">
      {alertas.map((a, i) => {
        const { icone: Icone, classe } = ESTILO_ALERTA[a.nivel];
        return (
          <li key={i} className={`flex gap-2.5 rounded-xl border px-3 py-2.5 ${classe}`}>
            <Icone className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{a.titulo}</p>
              {a.detalhe && <p className="mt-0.5 break-words text-xs opacity-90">{a.detalhe}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Texto completo da consulta, recolhido. */
export function TextoConsulta({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>SQL</summary>
      <pre
        className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg p-2 font-mono text-[11px]"
        style={{ background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}
      >
        {texto}
      </pre>
    </details>
  );
}

export interface Coluna<T> {
  rotulo: string;
  valor: (linha: T) => React.ReactNode;
  direita?: boolean;
  /** Some do cartão do celular (detalhe que só cabe na grade). */
  soDesktop?: boolean;
  title?: (linha: T) => string;
}

/**
 * Grade no desktop, cartões no celular. A primeira coluna é o título do
 * cartão; as demais viram pares rótulo/valor.
 */
export function TabelaResponsiva<T>({
  linhas, colunas, chave, vazio, destaque, maxHeight = '60vh',
}: {
  linhas: T[];
  colunas: Coluna<T>[];
  chave: (linha: T, i: number) => string;
  vazio: { titulo: string; dica?: string };
  destaque?: (linha: T) => string | undefined;
  maxHeight?: string;
}) {
  if (!linhas.length) return <TableEmpty title={vazio.titulo} hint={vazio.dica} />;
  const [primeira, ...resto] = colunas;
  return (
    <>
      <TableCards>
        {linhas.map((l, i) => (
          <TableCardRow key={chave(l, i)} accent={destaque?.(l)}>
            <div className="break-words text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{primeira.valor(l)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {resto.filter(c => !c.soDesktop).map(c => (
                <div key={c.rotulo} className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>{c.rotulo}</dt>
                  <dd className="break-words text-xs tabular" style={{ color: 'var(--ink-secondary)' }}>{c.valor(l)}</dd>
                </div>
              ))}
            </dl>
          </TableCardRow>
        ))}
      </TableCards>
      <TableDesktop>
        <TableShell maxHeight={maxHeight}>
          <table className="w-full text-xs">
            <TableHeadRow>
              {colunas.map(c => <Th key={c.rotulo} label={c.rotulo} align={c.direita ? 'right' : 'left'} />)}
            </TableHeadRow>
            <TableBody>
              {linhas.map((l, i) => (
                <Tr key={chave(l, i)} accent={destaque?.(l)}>
                  {colunas.map((c, j) => (
                    <Td key={c.rotulo} align={c.direita ? 'right' : 'left'} numeric={c.direita} strong={j === 0} title={c.title?.(l)}>
                      {c.valor(l)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </TableBody>
          </table>
        </TableShell>
      </TableDesktop>
    </>
  );
}

/** Erro de carregamento padrão das abas. */
export function ErroCarga({ mensagem }: { mensagem: string }) {
  return <TableEmpty icon={AlertTriangle} title="Não foi possível carregar" hint={mensagem} />;
}

export function Carregando() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
      {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
    </div>
  );
}

/** Há quanto tempo, curto: "agora", "3 min", "2 h". */
export function haQuanto(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, (agora - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const ROTULO_POR_CAMINHO = new Map(PAGES.map(p => [p.path, p.label]));

/** "/compras/central" → "Central de Compras" (rótulo do menu), ou o caminho. */
export function nomePagina(caminho: string): string {
  const daPagina = ROTULO_POR_CAMINHO.get(caminho);
  if (daPagina) return daPagina;
  const rotulo = labelForPath(caminho);
  return rotulo && rotulo !== caminho ? rotulo : caminho;
}
