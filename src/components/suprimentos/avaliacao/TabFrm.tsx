/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aba "Avaliação FRM.SUP-0005": quem comprou nos últimos 12 meses e está sem
 * avaliação (ou com a última vencida) e a lista de avaliações registradas.
 */

import React, { useMemo, useState } from 'react';
import { CalendarClock, ClipboardCheck, FileDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Profile } from '../../../types';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../ui/DataTable';
import {
  DECISOES_FRM, faixaDaNota, frmVencida, normalizarBusca, rotuloClassificacao, type LinhaPainel,
} from '../../../lib/avaliacaoFornecedores';
import type { AvaliacaoFrm, FornecedorOpcao } from '../../../lib/avaliacaoFornecedoresApi';
import { formatBRLCompacto, formatInt } from '../../../lib/format';
import { formatarDataBR, hojeISO } from '../../../lib/fichaEpi';
import { podeEditarFormulario } from '../../../lib/permissoesFormularios';
import { BarraPct, Etiqueta, inputCls } from './ui';

const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export default function TabFrm({
  user, avaliacoes, painel12, carregando, onNova, onEditar, onExcluir, onPdf, onFornecedor,
}: {
  user: Profile;
  avaliacoes: AvaliacaoFrm[];
  painel12: LinhaPainel[];
  carregando: boolean;
  onNova: (f?: FornecedorOpcao) => void;
  onEditar: (a: AvaliacaoFrm) => void;
  onExcluir: (a: AvaliacaoFrm) => void;
  onPdf: (a: AvaliacaoFrm) => void;
  onFornecedor: (f: FornecedorOpcao) => void;
}) {
  const hoje = hojeISO();
  const pendentes = useMemo(
    () => painel12.filter(l => l.pedidos > 0 && frmVencida(l.frm_data, hoje)).sort((a, b) => b.valor - a.valor),
    [painel12, hoje],
  );
  const [verTodos, setVerTodos] = useState(false);
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const t = normalizarBusca(busca);
    if (!t) return avaliacoes;
    return avaliacoes.filter(a => normalizarBusca(`${a.codigo} ${a.fornecedor_nome} ${a.fornecedor_codigo} ${a.resp_avaliacao}`).includes(t));
  }, [avaliacoes, busca]);

  const forn = (l: LinhaPainel): FornecedorOpcao => ({ fornecedor_codigo: l.fornecedor_codigo, fornecedor_nome: l.fornecedor_nome, cnpj: l.cnpj });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
              <CalendarClock className="h-4 w-4" style={{ color: '#d97706' }} />
              Avaliação anual pendente
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: pendentes.length ? '#d97706' : 'var(--ink-muted)' }}>{pendentes.length}</span>
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Fornecedores com pedido nos últimos 12 meses sem FRM.SUP-0005 no último ano — o procedimento pede ao menos uma por ano. Ordem: maior valor comprado.
            </p>
          </div>
        </header>
        {pendentes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>{carregando ? 'Carregando…' : 'Todos os fornecedores ativos estão avaliados.'}</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {(verTodos ? pendentes : pendentes.slice(0, 8)).map(l => (
              <div key={l.chave} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <button type="button" onClick={() => onFornecedor(forn(l))} className="min-w-0 text-left">
                  <div className="truncate text-sm font-bold hover:underline" style={{ color: 'var(--ink-primary)' }}>{l.fornecedor_nome}</div>
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    {formatInt(l.pedidos)} PO · {formatBRLCompacto(l.valor)} · {l.ocorrencias} ocorrência(s)
                    {l.frm_data ? ` · última FRM ${formatarDataBR(l.frm_data)}` : ' · nunca avaliado'}
                  </div>
                </button>
                <button type="button" onClick={() => onNova(forn(l))} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>
                  <ClipboardCheck className="h-3.5 w-3.5" /> Avaliar
                </button>
              </div>
            ))}
          </div>
        )}
        {pendentes.length > 8 && (
          <button type="button" onClick={() => setVerTodos(v => !v)} className="w-full border-t py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}>
            {verTodos ? 'Mostrar menos' : `Ver todos (${pendentes.length})`}
          </button>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>Avaliações registradas <span style={{ color: 'var(--ink-muted)' }}>({lista.length})</span></h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Fornecedor, código…" className={`${inputCls} pl-9`} />
            </label>
            <button type="button" onClick={() => onNova()} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
              <Plus className="h-4 w-4" /> Nova avaliação
            </button>
          </div>
        </div>

        {lista.length === 0 ? (
          <div className="rounded-xl border py-12 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
            {carregando ? 'Carregando…' : 'Nenhuma avaliação FRM.SUP-0005 registrada.'}
          </div>
        ) : (
          <>
            <TableCards>
              {lista.map(a => {
                const f = faixaDaNota(a.nota_final);
                return (
                  <TableCardRow key={a.id} accent={f.cor}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold" style={{ color: 'var(--brand)' }}>{a.codigo || '—'}</span>
                      <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{formatarDataBR(a.data_avaliacao)}</span>
                    </div>
                    <div className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{a.fornecedor_nome}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black" style={{ color: f.cor }}>{pct(a.nota_final)}</span>
                      <Etiqueta cor={f.cor}>{rotuloClassificacao(a.classificacao)}</Etiqueta>
                    </div>
                    <Acoes a={a} user={user} onEditar={onEditar} onExcluir={onExcluir} onPdf={onPdf} />
                  </TableCardRow>
                );
              })}
            </TableCards>
            <TableDesktop>
              <TableShell maxHeight="60vh">
                <table className="w-full text-xs">
                  <TableHeadRow>
                    <Th label="Código" />
                    <Th label="Data" />
                    <Th label="Fornecedor" />
                    <Th label="Nota" width="w-40" />
                    <Th label="Avaliação final" />
                    <Th label="Decisão" />
                    <Th label="Resp." />
                    <Th label="" align="right" />
                  </TableHeadRow>
                  <TableBody>
                    {lista.map(a => {
                      const f = faixaDaNota(a.nota_final);
                      const d = DECISOES_FRM.find(x => x.valor === a.decisao);
                      return (
                        <Tr key={a.id} accent={f.cor}>
                          <Td mono strong>{a.codigo || '—'}</Td>
                          <Td>{formatarDataBR(a.data_avaliacao)}</Td>
                          <Td truncate title={a.fornecedor_nome}>
                            <button type="button" className="font-semibold hover:underline" style={{ color: 'var(--ink-primary)' }}
                              onClick={() => onFornecedor({ fornecedor_codigo: a.fornecedor_codigo, fornecedor_nome: a.fornecedor_nome, cnpj: a.fornecedor_cnpj })}>
                              {a.fornecedor_nome}
                            </button>
                          </Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-right font-black tabular" style={{ color: f.cor }}>{pct(a.nota_final)}</span>
                              <span className="flex-1"><BarraPct valor={a.nota_final} cor={f.cor} /></span>
                            </div>
                          </Td>
                          <Td><Etiqueta cor={f.cor}>{rotuloClassificacao(a.classificacao)}</Etiqueta></Td>
                          <Td>{d && <Etiqueta cor={d.cor}>{d.rotulo}</Etiqueta>}</Td>
                          <Td truncate>{a.resp_avaliacao || a.criado_por_nome || '—'}</Td>
                          <Td align="right"><Acoes a={a} user={user} onEditar={onEditar} onExcluir={onExcluir} onPdf={onPdf} /></Td>
                        </Tr>
                      );
                    })}
                  </TableBody>
                </table>
              </TableShell>
            </TableDesktop>
          </>
        )}
      </section>
    </div>
  );
}

function Acoes({ a, user, onEditar, onExcluir, onPdf }: {
  a: AvaliacaoFrm; user: Profile;
  onEditar: (a: AvaliacaoFrm) => void; onExcluir: (a: AvaliacaoFrm) => void; onPdf: (a: AvaliacaoFrm) => void;
}) {
  const pode = podeEditarFormulario(user, a);
  const btn = 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold';
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <button type="button" onClick={() => onPdf(a)} className={btn} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
        <FileDown className="h-3.5 w-3.5" /> PDF
      </button>
      {pode && (
        <>
          <button type="button" onClick={() => onEditar(a)} className={btn} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }} aria-label="Editar avaliação">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onExcluir(a)} className={btn} style={{ borderColor: 'var(--hairline)', color: 'var(--status-critical)' }} aria-label="Excluir avaliação">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </span>
  );
}
