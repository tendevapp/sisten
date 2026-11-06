/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Contas a Pagar no celular.
 *
 * No celular a pergunta é "quanto devo, o que venceu, o que vence esta
 * semana" — não a grade de oito colunas. Antes a tabela do desktop passava pela
 * conversão automática em cartões: cada fornecedor virava cinco linhas
 * rótulo/valor (nome cortado em ~19 letras), cada partida um cartão de oito
 * linhas dentro do cartão do fornecedor, tudo numa caixa de rolagem dentro da
 * página. Aqui cada fornecedor é uma linha e as partidas abrem num painel.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../ui/Modal';
import { TableCardRow, TableCards } from '../ui/DataTable';
import { formatBRL, formatBRLCompacto } from '../../lib/format';
import {
  ROTULO_ATALHO, ROTULO_FAIXA, agruparPorFaixa, estaCompensada, estaVencida, nomeFornecedor, rotuloRelativo, saldoAberto,
  type AtalhoSituacao, type GrupoFornecedor, type PartidaPagar, type ResumoAberto,
} from '../../lib/contasPagar';

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const VERMELHO = 'text-red-600 dark:text-red-400';
const VERDE = 'text-emerald-700 dark:text-emerald-400';
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

/* --------------------------------------------------------------------- */
/* Resumo                                                                 */
/* --------------------------------------------------------------------- */

export function ResumoAbertoMobile({
  resumo, qtdFornecedores, ativo, onAtalho,
}: {
  resumo: ResumoAberto;
  qtdFornecedores: number;
  ativo: AtalhoSituacao | null;
  onAtalho: (a: AtalhoSituacao) => void;
}) {
  const partes = [
    { chave: 'vencidos' as const, rotulo: 'Vencido', valor: resumo.vencido, cor: 'bg-red-600 dark:bg-red-500', texto: VERMELHO },
    { chave: '7d' as const, rotulo: 'Próx. 7 dias', valor: resumo.prox7, cor: 'bg-amber-500', texto: '' },
    { chave: null, rotulo: 'Depois', valor: resumo.depois, cor: 'bg-slate-300 dark:bg-slate-600', texto: '' },
  ];
  const base = partes.reduce((s, p) => s + Math.max(0, p.valor), 0);
  return (
    <section className="lg:hidden rounded-2xl border p-4" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>Em aberto</p>
      <p className="mt-0.5 text-[26px] font-black leading-tight tabular" style={{ color: 'var(--ink-primary)' }}>{formatBRL(resumo.total)}</p>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
        {plural(resumo.qtdAbertas, 'partida')} · {plural(qtdFornecedores, 'fornecedor', 'fornecedores')}
      </p>
      {base > 0 && (
        <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {partes.map(p => p.valor > 0 && <div key={p.rotulo} className={p.cor} style={{ width: `${(p.valor / base) * 100}%` }} />)}
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {partes.map(p => {
          const conteudo = (
            <>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${p.cor}`} aria-hidden="true" />{p.rotulo}
              </span>
              <span className={`mt-0.5 block text-sm font-bold tabular ${p.texto}`} style={p.texto ? undefined : { color: 'var(--ink-primary)' }}>
                {formatBRLCompacto(p.valor)}
              </span>
            </>
          );
          return p.chave ? (
            <button
              key={p.rotulo}
              type="button"
              onClick={() => onAtalho(p.chave!)}
              aria-pressed={ativo === p.chave}
              className={`-m-1.5 rounded-lg p-1.5 text-left transition-colors active:bg-[var(--surface-raised)] ${ativo === p.chave ? 'bg-[var(--surface-raised)]' : ''}`}
            >
              {conteudo}
            </button>
          ) : <div key={p.rotulo}>{conteudo}</div>;
        })}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Atalhos de situação                                                    */
/* --------------------------------------------------------------------- */

const ORDEM_ATALHOS: AtalhoSituacao[] = ['vencidos', '7d', 'aberto', 'tudo'];

export function AtalhosSituacao({
  ativo, contagens, onEscolher,
}: {
  ativo: AtalhoSituacao | null;
  contagens: Record<AtalhoSituacao, number>;
  onEscolher: (a: AtalhoSituacao) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-[var(--surface-sunken)]" role="group" aria-label="Situação">
      {ORDEM_ATALHOS.map(a => {
        const on = ativo === a;
        const cor = on ? (a === 'vencidos' ? 'bg-red-600 text-white dark:bg-red-600' : 'bg-[var(--surface-card)] shadow-sm') : '';
        return (
          <button
            key={a}
            type="button"
            onClick={() => onEscolher(a)}
            aria-pressed={on}
            className={`flex h-12 flex-col items-center justify-center rounded-lg leading-tight transition-colors ${cor}`}
            style={on && a !== 'vencidos' ? { color: 'var(--ink-primary)' } : on ? undefined : { color: 'var(--ink-muted)' }}
          >
            <span className="text-[12.5px] font-bold">{ROTULO_ATALHO[a]}</span>
            <span className={`text-[11px] tabular ${on ? 'opacity-90' : ''}`}>{contagens[a]}</span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Lista por fornecedor                                                   */
/* --------------------------------------------------------------------- */

function SituacaoFornecedor({ g }: { g: GrupoFornecedor }) {
  if (g.qtdVencidos > 0) return <span className={`font-bold ${VERMELHO}`}>{plural(g.qtdVencidos, 'vencido')}</span>;
  if (g.proximoVencimento) return <span>vence {ddmm(g.proximoVencimento)}</span>;
  if (g.qtdAbertos > 0) return <span>{plural(g.qtdAbertos, 'em aberto', 'em aberto')}</span>;
  return <span>tudo compensado</span>;
}

function ValorFornecedor({ g }: { g: GrupoFornecedor }) {
  if (Math.abs(g.saldoAberto) >= 0.005) {
    const credito = g.saldoAberto < 0;
    return (
      <>
        <span className={`block text-[14px] font-bold tabular ${credito ? VERDE : ''}`} style={credito ? undefined : { color: 'var(--ink-primary)' }}>
          {formatBRL(g.saldoAberto)}
        </span>
        {credito && <span className={`block text-[11px] ${VERDE}`}>crédito</span>}
      </>
    );
  }
  return (
    <span className="block text-[12px] tabular" style={{ color: 'var(--ink-muted)' }}>
      {g.valorPago > 0 ? `pago ${formatBRLCompacto(g.valorPago)}` : '—'}
    </span>
  );
}

export function ListaFornecedoresMobile({ grupos, onAbrir }: { grupos: GrupoFornecedor[]; onAbrir: (g: GrupoFornecedor) => void }) {
  return (
    <TableCards>
      {grupos.map(g => (
        <TableCardRow key={g.nome} onClick={() => onAbrir(g)} className="!px-4 !py-3">
          <span className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="text-[14px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--ink-primary)' }}>{g.nome}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                <SituacaoFornecedor g={g} />
                <span aria-hidden="true">·</span>
                <span>{g.itens.length} doc.</span>
              </span>
            </span>
            <span className="shrink-0 text-right"><ValorFornecedor g={g} /></span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
          </span>
        </TableCardRow>
      ))}
    </TableCards>
  );
}

/* --------------------------------------------------------------------- */
/* Partida                                                                */
/* --------------------------------------------------------------------- */

export function LinhaPartida({ l, hoje, mostrarFornecedor = false }: { l: PartidaPagar; hoje: string; mostrarFornecedor?: boolean }) {
  const compensada = estaCompensada(l);
  const vencida = estaVencida(l, hoje);
  const venc = l.vencimento_liquido;
  const saldo = saldoAberto(l);
  const credito = !compensada && saldo < 0;
  const detalhe = [l.tipo_documento?.trim(), l.numero_documento, l.empresa].filter(Boolean).join(' · ');
  return (
    <span className="flex items-start gap-3">
      <span className="w-[52px] shrink-0 pt-px">
        <span className={`block text-[13px] font-bold tabular ${vencida ? VERMELHO : ''}`} style={vencida ? undefined : { color: 'var(--ink-primary)' }}>
          {venc ? ddmm(venc) : '—'}
        </span>
        <span className={`block text-[11px] leading-tight ${vencida ? VERMELHO : compensada ? VERDE : ''}`} style={vencida || compensada ? undefined : { color: 'var(--ink-muted)' }}>
          {compensada ? (l.data_compensacao ? `pago ${ddmm(l.data_compensacao)}` : 'pago') : venc ? rotuloRelativo(venc, hoje) : 'sem venc.'}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
          {mostrarFornecedor ? nomeFornecedor(l) : (l.tipo_documento_descricao?.trim() || l.tipo_documento || 'Partida')}
        </span>
        <span className="block truncate text-[12px] tabular" style={{ color: 'var(--ink-muted)' }}>{detalhe}</span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`block text-[13px] font-bold tabular ${compensada || credito ? VERDE : ''}`}
          style={compensada || credito ? undefined : { color: 'var(--ink-primary)' }}
        >
          {compensada ? formatBRL(Math.abs(l.montante_moeda_doc || 0)) : formatBRL(saldo)}
        </span>
        {credito && <span className={`block text-[11px] ${VERDE}`}>crédito</span>}
      </span>
    </span>
  );
}

/* --------------------------------------------------------------------- */
/* Agenda por vencimento                                                  */
/* --------------------------------------------------------------------- */

const PASSO_AGENDA = 15;

function CabecalhoFaixa({ rotulo, qtd, total, alerta }: { rotulo: string; qtd: number; total: number; alerta?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 px-4 py-2 text-[12px] font-bold ${alerta ? VERMELHO : ''}`}
      style={{ background: 'var(--surface-raised)', ...(alerta ? null : { color: 'var(--ink-secondary)' }) }}
    >
      <span>{rotulo} <span className="font-semibold tabular opacity-80">· {qtd}</span></span>
      <span className="tabular">{formatBRL(total)}</span>
    </div>
  );
}

export function AgendaVencimentosMobile({
  linhas, hoje, onAbrirFornecedor,
}: {
  linhas: PartidaPagar[];
  hoje: string;
  onAbrirFornecedor: (nome: string) => void;
}) {
  const [limites, setLimites] = useState<Record<string, number>>({});
  const faixas = agruparPorFaixa(linhas, hoje);
  return (
    <div className="space-y-3 lg:hidden">
      {faixas.map(({ faixa, itens, total }) => {
        const limite = limites[faixa] ?? PASSO_AGENDA;
        return (
          <section key={faixa} className="overflow-hidden rounded-xl border" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
            <CabecalhoFaixa rotulo={ROTULO_FAIXA[faixa]} qtd={itens.length} total={total} alerta={faixa === 'vencido'} />
            <div className="divide-y divide-[var(--hairline)]">
              {itens.slice(0, limite).map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onAbrirFornecedor(nomeFornecedor(l))}
                  className="block w-full px-4 py-2.5 text-left transition-colors active:bg-[var(--surface-raised)]"
                >
                  <LinhaPartida l={l} hoje={hoje} mostrarFornecedor />
                </button>
              ))}
            </div>
            {itens.length > limite && (
              <button
                type="button"
                onClick={() => setLimites(m => ({ ...m, [faixa]: limite + PASSO_AGENDA * 2 }))}
                className="w-full border-t px-4 py-3 text-left text-[13px] font-bold text-emerald-700 dark:text-emerald-400"
                style={{ borderColor: 'var(--hairline)' }}
              >
                Mostrar mais {Math.min(itens.length - limite, PASSO_AGENDA * 2)} de {itens.length - limite}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Detalhe do fornecedor                                                  */
/* --------------------------------------------------------------------- */

export function DetalheFornecedorSheet({ grupo, hoje, onClose }: { grupo: GrupoFornecedor; hoje: string; onClose: () => void }) {
  const [verCompensados, setVerCompensados] = useState(false);
  const faixas = agruparPorFaixa(grupo.itens, hoje);
  const numeros = [
    { rotulo: 'Em aberto', valor: grupo.saldoAberto, classe: grupo.saldoAberto < 0 ? VERDE : '' },
    { rotulo: 'Vencido', valor: grupo.saldoVencido, classe: grupo.saldoVencido > 0 ? VERMELHO : '' },
    { rotulo: 'Pago', valor: grupo.valorPago, classe: '' },
  ];
  return (
    <Modal onClose={onClose} ariaLabel={`Partidas de ${grupo.nome}`} maxWidth="max-w-2xl">
      <ModalHeader onClose={onClose}>
        <h3 className="text-[16px] font-extrabold leading-snug" style={{ color: 'var(--ink-primary)' }}>{grupo.nome}</h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
          {grupo.codigo ? `Cód. SAP ${grupo.codigo} · ` : ''}{plural(grupo.itens.length, 'partida')}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4 !px-3 sm:!px-6">
        <dl className="grid grid-cols-3 divide-x divide-[var(--hairline)] rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          {numeros.map(n => (
            <div key={n.rotulo} className="px-3 py-2.5">
              <dt className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>{n.rotulo}</dt>
              <dd className={`mt-0.5 text-[14px] font-bold tabular ${n.classe}`} style={n.classe ? undefined : { color: 'var(--ink-primary)' }}>
                {formatBRLCompacto(n.valor)}
              </dd>
            </div>
          ))}
        </dl>
        {faixas.map(({ faixa, itens, total }) => {
          const recolhido = faixa === 'compensado' && !verCompensados;
          return (
            <section key={faixa} className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              {faixa === 'compensado' ? (
                <button
                  type="button"
                  onClick={() => setVerCompensados(v => !v)}
                  aria-expanded={!recolhido}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[12px] font-bold"
                  style={{ background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}
                >
                  <span className="flex items-center gap-1.5">
                    {recolhido ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                    {ROTULO_FAIXA[faixa]} <span className="font-semibold tabular opacity-80">· {itens.length}</span>
                  </span>
                  <span className="tabular">{formatBRL(total)}</span>
                </button>
              ) : (
                <CabecalhoFaixa rotulo={ROTULO_FAIXA[faixa]} qtd={itens.length} total={total} alerta={faixa === 'vencido'} />
              )}
              {!recolhido && (
                <ul className="divide-y divide-[var(--hairline)]">
                  {itens.map(l => (
                    <li key={l.id} className="px-4 py-2.5"><LinhaPartida l={l} hoje={hoje} /></li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </ModalBody>
    </Modal>
  );
}
