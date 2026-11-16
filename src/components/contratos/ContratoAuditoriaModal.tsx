/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detalhe de um contrato na Auditoria: números do contrato, ocorrências,
 * pedidos de call-off, partidas da FBL1N e o log de alterações de valor.
 */

import React, { useMemo, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../ui/Modal';
import { formatBRL, formatDateBR, formatDateTimeBR } from '../../lib/format';
import {
  AuditoriaContrato, LancamentoAuditoria, Ocorrencia, Severidade, rotuloCampoAlteracao, rotuloVinculo,
  CATEGORIA_REGRA, ROTULO_CATEGORIA, ORIENTACAO_REGRA,
} from '../../lib/contratosAuditoria';
import { CorSeveridade, BarraConsumo, GraficoFaturamento, IconeCategoria } from './auditoriaUi';

type Aba = 'ocorrencias' | 'lancamentos' | 'pedidos' | 'alteracoes';

const GRUPOS_SEVERIDADE: { severidade: Severidade; titulo: string }[] = [
  { severidade: 'critico', titulo: 'Críticas' },
  { severidade: 'alerta', titulo: 'Alertas' },
  { severidade: 'info', titulo: 'Informativas' },
];

/** Ocorrências cujos documentos são pedidos, não partidas da FBL1N. */
const DOCUMENTOS_SAO_PEDIDOS = new Set(['pedidos_acima_contrato', 'pedido_sem_valor']);

function CartaoOcorrencia({ o, onVerDocumentos }: { o: Ocorrencia; onVerDocumentos: (docs: string[]) => void }) {
  const cor = CorSeveridade[o.severidade];
  const categoria = CATEGORIA_REGRA[o.regra];
  const Icone = IconeCategoria[categoria];
  const docsPedidos = DOCUMENTOS_SAO_PEDIDOS.has(o.regra);
  return (
    <li className="rounded-lg border p-3 flex gap-3"
      style={{ borderColor: 'var(--hairline)', boxShadow: `inset 3px 0 0 0 ${cor}`, background: o.severidade === 'critico' ? 'color-mix(in srgb, var(--status-critical) 4%, transparent)' : undefined }}>
      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
        <Icone className="h-4 w-4" style={{ color: o.severidade === 'info' ? 'var(--ink-secondary)' : cor }} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-0.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{ROTULO_CATEGORIA[categoria]}</p>
            <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{o.titulo}</p>
          </div>
          {o.valor !== undefined && (
            <p className="text-sm font-extrabold tabular whitespace-nowrap" style={{ color: o.severidade === 'info' ? 'var(--ink-secondary)' : cor }}>
              {formatBRL(o.valor)}
            </p>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-secondary)' }}>{o.detalhe}</p>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-muted)' }}>
          <span className="font-bold">O que conferir:</span> {ORIENTACAO_REGRA[o.regra]}
        </p>
        {o.documentos && o.documentos.length > 0 && !docsPedidos && (
          <button
            type="button"
            onClick={() => onVerDocumentos(o.documentos!)}
            className="text-[11px] font-bold mt-1.5 cursor-pointer hover:underline"
            style={{ color: 'var(--brand-strong)' }}
          >
            Ver {o.documentos.length} documento(s) na FBL1N
          </button>
        )}
        {o.documentos && docsPedidos && (
          <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--ink-muted)' }}>{o.documentos.join(', ')}</p>
        )}
      </div>
    </li>
  );
}

function Numero({ label, valor, destaque, detalhe }: { label: string; valor: string; destaque?: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{label}</p>
      <p className="text-sm font-extrabold tabular mt-0.5" style={{ color: destaque || 'var(--ink-primary)' }}>{valor}</p>
      {detalhe && <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>{detalhe}</p>}
    </div>
  );
}

function SeloVinculo({ l }: { l: LancamentoAuditoria }) {
  if (l.anulada) {
    return <span className="text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>Anulada (estorno)</span>;
  }
  const cor = l.vinculo === 'miro' ? 'var(--status-good)' : 'var(--status-warning)';
  return (
    <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: cor }}>
      {rotuloVinculo(l.vinculo)}
    </span>
  );
}

function situacao(l: LancamentoAuditoria, hoje: string): { label: string; cor: string } {
  if (l.anulada) return { label: 'Anulada', cor: 'var(--ink-muted)' };
  if (l.pago > 0) return { label: 'Paga', cor: 'var(--status-good)' };
  if (l.vencimento && l.vencimento < hoje) return { label: 'Vencida', cor: 'var(--status-critical)' };
  return { label: 'Em aberto', cor: 'var(--status-warning)' };
}

const th = 'py-1.5 px-2.5 font-bold text-left';
const td = 'py-1.5 px-2.5 align-top';

export default function ContratoAuditoriaModal({ auditoria: a, hoje, onClose }: {
  auditoria: AuditoriaContrato;
  hoje: string;
  onClose: () => void;
}) {
  const [aba, setAba] = useState<Aba>(a.ocorrencias.length ? 'ocorrencias' : 'lancamentos');
  const [docFiltro, setDocFiltro] = useState<string[] | null>(null);
  const c = a.contrato;

  const lancamentosVisiveis = useMemo(() => {
    if (!docFiltro) return a.lancamentos;
    const s = new Set(docFiltro);
    return a.lancamentos.filter(l => s.has(l.documento || '') || s.has(l.docMiro || ''));
  }, [a.lancamentos, docFiltro]);

  const abas: { id: Aba; label: string; n: number }[] = [
    { id: 'ocorrencias', label: 'Ocorrências', n: a.ocorrencias.length },
    { id: 'lancamentos', label: 'Lançamentos FBL1N', n: a.lancamentos.length },
    { id: 'pedidos', label: 'Pedidos', n: a.pedidos.length },
    { id: 'alteracoes', label: 'Alterações', n: a.alteracoes.length },
  ];

  return (
    <Modal onClose={onClose} ariaLabel={`Auditoria do contrato ${c.documento_compras}`} maxWidth="max-w-5xl">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${CorSeveridade[a.severidade]} 14%, transparent)` }}>
            {a.severidade === 'ok'
              ? <ShieldCheck className="h-4 w-4" style={{ color: CorSeveridade.ok }} />
              : <ShieldAlert className="h-4 w-4" style={{ color: CorSeveridade[a.severidade] }} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate" style={{ color: 'var(--ink-primary)' }}>
              Auditoria · Contrato {c.documento_compras}
            </h2>
            <p className="text-xs truncate" style={{ color: 'var(--ink-muted)' }}>
              {c.fornecedor} · {formatDateBR(c.inicio_validade)} a {formatDateBR(c.fim_validade)}
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Numero label="Valor global (ME3N)" valor={formatBRL(a.valorGlobal)} />
          <Numero
            label="Pedidos de call-off"
            valor={formatBRL(a.valorPedidos)}
            detalhe={`${a.pedidos.length} pedido(s)${a.pedidosSemValor ? ` · ${a.pedidosSemValor} sem valor` : ''}`}
            destaque={a.valorGlobal > 0 && a.valorPedidos > a.valorGlobal ? 'var(--status-critical)' : undefined}
          />
          <Numero
            label="Lançado no Financeiro"
            valor={formatBRL(a.lancado)}
            detalhe={a.lancadoFornecedor > 0 ? `${formatBRL(a.lancadoFornecedor)} só pelo fornecedor` : 'Tudo via MIRO do contrato'}
          />
          <Numero label="Pago" valor={formatBRL(a.pago)} destaque="var(--status-good)" />
          <Numero
            label="Em aberto"
            valor={formatBRL(a.aberto)}
            detalhe={a.vencidoAberto > 0 ? `${formatBRL(a.vencidoAberto)} vencido` : undefined}
            destaque={a.vencidoAberto > 0 ? 'var(--status-critical)' : undefined}
          />
          <Numero
            label="Saldo do contrato"
            valor={formatBRL(a.saldo)}
            detalhe={a.saldo > 0 && a.projecao && a.projecao.falta > 0
              ? `No ritmo atual faltam ${formatBRL(a.projecao.falta)} até o fim`
              : 'Valor global − lançado'}
            destaque={a.saldo < 0 || (a.projecao && a.saldo > 0 && a.projecao.falta >= a.projecao.ritmoMensal) ? 'var(--status-critical)' : undefined}
          />
          <Numero
            label="Saldo a pedir"
            valor={formatBRL(a.saldoPedidos)}
            detalhe="Valor global − pedidos"
            destaque={a.saldoPedidos < 0 ? 'var(--status-critical)' : undefined}
          />
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Consumo</p>
            <div className="mt-1.5"><BarraConsumo consumo={a.consumo} /></div>
          </div>
        </div>

        <GraficoFaturamento a={a} />

        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b" style={{ borderColor: 'var(--hairline)' }}>
          {abas.map(t => {
            const ativo = aba === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setAba(t.id); if (t.id !== 'lancamentos') setDocFiltro(null); }}
                className="px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 -mb-px cursor-pointer transition-colors"
                style={{
                  borderColor: ativo ? 'var(--brand)' : 'transparent',
                  color: ativo ? 'var(--brand-strong)' : 'var(--ink-secondary)',
                }}
              >
                {t.label} <span className="tabular" style={{ color: 'var(--ink-muted)' }}>({t.n})</span>
              </button>
            );
          })}
        </div>

        {aba === 'ocorrencias' && (
          a.ocorrencias.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-muted)' }}>
              Nenhuma ocorrência: valores, vigência e partidas conferem.
            </p>
          ) : (
            <div className="space-y-4">
              {GRUPOS_SEVERIDADE.map(g => {
                const lista = a.ocorrencias.filter(o => o.severidade === g.severidade);
                if (!lista.length) return null;
                return (
                  <section key={g.severidade} className="space-y-2">
                    <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-secondary)' }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: CorSeveridade[g.severidade] }} />
                      {g.titulo} <span className="tabular" style={{ color: 'var(--ink-muted)' }}>({lista.length})</span>
                    </h3>
                    <ul className="space-y-2">
                      {lista.map((o, i) => <CartaoOcorrencia key={`${o.regra}-${i}`} o={o} onVerDocumentos={docsOcorrencia => { setDocFiltro(docsOcorrencia); setAba('lancamentos'); }} />)}
                    </ul>
                  </section>
                );
              })}
            </div>
          )
        )}

        {aba === 'lancamentos' && (
          <div className="space-y-2">
            {docFiltro && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                <span>Filtrando {docFiltro.length} documento(s) da ocorrência.</span>
                <button type="button" onClick={() => setDocFiltro(null)} className="font-bold cursor-pointer hover:underline" style={{ color: 'var(--brand-strong)' }}>
                  Mostrar todos
                </button>
              </div>
            )}
            {lancamentosVisiveis.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-muted)' }}>
                Nenhuma partida da FBL1N vinculada a este contrato.
              </p>
            ) : (
              <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--hairline)' }}>
                <table className="w-full text-[11px] min-w-[960px]">
                  <thead>
                    <tr className="uppercase tracking-wider" style={{ color: 'var(--ink-muted)', background: 'var(--surface-raised)' }}>
                      <th className={th}>Documento</th>
                      <th className={th}>Tipo</th>
                      <th className={th}>NF / Ref.</th>
                      <th className={th}>Lançamento</th>
                      <th className={th}>Vencimento</th>
                      <th className={th}>Compensação</th>
                      <th className={`${th} text-right`}>Valor</th>
                      <th className={th}>Situação</th>
                      <th className={th}>Vínculo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                    {lancamentosVisiveis.map(l => {
                      const s = situacao(l, hoje);
                      return (
                        <tr key={l.chave} style={{ opacity: l.anulada ? 0.55 : 1 }}>
                          <td className={`${td} font-mono`} style={{ color: 'var(--ink-primary)' }}>
                            {l.documento || '—'}
                            {l.docMiro && <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>MIRO {l.docMiro}</div>}
                            {l.pedidos && <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>PO {l.pedidos}</div>}
                          </td>
                          <td className={td} style={{ color: 'var(--ink-secondary)' }}>{l.tipo || '—'}</td>
                          <td className={`${td} max-w-[180px]`} style={{ color: 'var(--ink-secondary)' }}>
                            <div className="truncate" title={l.texto || ''}>{l.referencia || '—'}</div>
                            {l.texto && <div className="text-[10px] truncate" style={{ color: 'var(--ink-muted)' }} title={l.texto}>{l.texto}</div>}
                          </td>
                          <td className={`${td} tabular`} style={{ color: 'var(--ink-secondary)' }}>
                            {formatDateBR(l.dataLancamento)}
                            {l.dataDocumento && l.dataDocumento !== l.dataLancamento && (
                              <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>NF {formatDateBR(l.dataDocumento)}</div>
                            )}
                          </td>
                          <td className={`${td} tabular`} style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(l.vencimento)}</td>
                          <td className={`${td} tabular`} style={{ color: 'var(--ink-secondary)' }}>
                            {formatDateBR(l.dataCompensacao)}
                            {l.docCompensacao && <div className="text-[10px] font-mono" style={{ color: 'var(--ink-muted)' }}>{l.docCompensacao}</div>}
                          </td>
                          <td className={`${td} text-right tabular font-bold`} style={{ color: 'var(--ink-primary)', textDecoration: l.anulada ? 'line-through' : undefined }}>
                            {formatBRL(l.valor)}
                            {l.estimado && <div className="text-[10px] font-normal" style={{ color: 'var(--ink-muted)' }}>estimado (MIRO)</div>}
                          </td>
                          <td className={td}>
                            <span className="text-[10px] font-bold" style={{ color: s.cor }}>{s.label}</span>
                            {l.bloqueio && <div className="text-[10px] font-bold" style={{ color: 'var(--status-critical)' }}>Bloqueio {l.bloqueio}</div>}
                          </td>
                          <td className={td}><SeloVinculo l={l} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {aba === 'pedidos' && (
          a.pedidos.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-muted)' }}>
              Nenhum pedido de call-off encontrado na ZL0132 nem na ME2L para este contrato.
            </p>
          ) : (
            <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--hairline)' }}>
              <table className="w-full text-[11px] min-w-[640px]">
                <thead>
                  <tr className="uppercase tracking-wider" style={{ color: 'var(--ink-muted)', background: 'var(--surface-raised)' }}>
                    <th className={th}>Pedido</th>
                    <th className={th}>Data</th>
                    <th className={th}>Texto</th>
                    <th className={th}>Fonte</th>
                    <th className={`${th} text-right`}>Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                  {a.pedidos.map(p => (
                    <tr key={p.pedido}>
                      <td className={`${td} font-mono`} style={{ color: 'var(--ink-primary)' }}>{p.pedido}</td>
                      <td className={`${td} tabular`} style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(p.data_pedido)}</td>
                      <td className={`${td} max-w-[260px] truncate`} style={{ color: 'var(--ink-secondary)' }} title={p.texto || ''}>{p.texto || '—'}</td>
                      <td className={td} style={{ color: 'var(--ink-muted)' }}>
                        {p.origem}{p.valor_fonte && p.valor_fonte !== p.origem ? ` · valor ${p.valor_fonte}` : ''}
                      </td>
                      <td className={`${td} text-right tabular font-bold`} style={{ color: p.valor == null ? 'var(--ink-muted)' : 'var(--ink-primary)' }}>
                        {p.valor == null ? 'sem valor' : formatBRL(p.valor)}
                        {(p.valor_eliminado || 0) > 0 && (
                          <div className="text-[10px] font-normal" style={{ color: 'var(--ink-muted)' }}>{formatBRL(p.valor_eliminado)} eliminado</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {aba === 'alteracoes' && (
          a.alteracoes.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-muted)' }}>
              Nenhuma alteração registrada. O histórico começa em 16/11/2026: cada importação da ME3N e cada edição do cadastro grava aqui o que mudou.
            </p>
          ) : (
            <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--hairline)' }}>
              <table className="w-full text-[11px] min-w-[640px]">
                <thead>
                  <tr className="uppercase tracking-wider" style={{ color: 'var(--ink-muted)', background: 'var(--surface-raised)' }}>
                    <th className={th}>Quando</th>
                    <th className={th}>Origem</th>
                    <th className={th}>Campo</th>
                    <th className={th}>De</th>
                    <th className={th}>Para</th>
                    <th className={th}>Por</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                  {a.alteracoes.map(x => (
                    <tr key={x.id}>
                      <td className={`${td} tabular whitespace-nowrap`} style={{ color: 'var(--ink-secondary)' }}>{formatDateTimeBR(x.alterado_em)}</td>
                      <td className={td} style={{ color: 'var(--ink-secondary)' }}>{x.origem}{x.item ? ` · item ${x.item}` : ''}</td>
                      <td className={`${td} font-bold`} style={{ color: 'var(--ink-primary)' }}>{rotuloCampoAlteracao(x.campo)}</td>
                      <td className={`${td} tabular`} style={{ color: 'var(--ink-muted)' }}>{x.valor_anterior ?? '—'}</td>
                      <td className={`${td} tabular font-bold`} style={{ color: 'var(--ink-primary)' }}>{x.valor_novo ?? '—'}</td>
                      <td className={td} style={{ color: 'var(--ink-secondary)' }}>{x.alterado_por || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </ModalBody>
    </Modal>
  );
}
