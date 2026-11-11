/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório × MB51 › clique na linha: a requisição inteira — dados, cada item
 * com a conferência na MB51, o histórico de exportações e o log de alterações.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../../ui/Modal';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../../lib/format';
import { ROTULO_STATUS_RQB, ehDivergente, type LinhaAuditoriaRqb } from '../../../lib/requisicaoBalcaoAuditoria';
import LogAlteracoes from '../LogRequisicaoBalcao';
import { DetalheMb51, SeloStatus } from './selos';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>{rotulo}</dt>
      <dd className="text-xs" style={{ color: 'var(--ink-primary)' }}>{children}</dd>
    </div>
  );
}

export default function DetalheAuditoriaModal({ itens, onClose }: { itens: LinhaAuditoriaRqb[]; onClose: () => void }) {
  const r = itens[0];
  if (!r) return null;
  const divergentes = itens.filter(ehDivergente).length;

  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl" ariaLabel={`Requisição ${r.codigo}`}>
      <ModalHeader onClose={onClose}>
        <h2 className="font-mono text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>{r.codigo}</h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          {ROTULO_STATUS_RQB[r.status]} · {itens.length} item(ns)
          {divergentes > 0 && <strong style={{ color: 'var(--status-critical)' }}> · {divergentes} sem MB51</strong>}
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo rotulo="Criação">{formatDateBR(r.data_criacao)} <span style={{ color: 'var(--ink-muted)' }}>({formatDateTimeBR(r.criado_em)})</span></Campo>
            <Campo rotulo="Exportação vigente">
              {r.exportada_em ? formatDateTimeBR(r.exportada_em) : '—'}
              {r.arquivo && <div className="truncate text-[10px]" style={{ color: 'var(--ink-muted)' }} title={r.arquivo}>{r.arquivo}</div>}
            </Campo>
            <Campo rotulo="Colaborador">{r.colaborador || '—'}</Campo>
            <Campo rotulo="Movimento">
              {r.tipo_movimento === 'transferencia' ? `Transferência → ${r.deposito_destino ?? '—'}` : 'Saída'}
            </Campo>
            <Campo rotulo="Doc. SAP">{r.doc_sap || '—'}</Campo>
            <Campo rotulo="MB51 importada até">{r.mb51_ate ? formatDateBR(r.mb51_ate) : '—'}</Campo>
            <Campo rotulo="Exportações">
              {r.exportacoes_qtd || 0}
              {r.reexportada_sem_reabrir && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: 'var(--status-serious)' }}>
                  <AlertTriangle className="h-3 w-3" /> sem reabrir
                </span>
              )}
            </Campo>
          </dl>

          {r.exportacoes && (
            <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: r.reexportada_sem_reabrir ? 'var(--status-serious)' : 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>Exportações: </span>{r.exportacoes}
              {r.reexportada_sem_reabrir && (
                <p className="mt-1" style={{ color: 'var(--status-serious)' }}>
                  Saiu de novo numa planilha sem ter sido reaberta: confira na MB51 se o lançamento não entrou duas vezes.
                </p>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ background: 'var(--surface)' }}>
                  {['Item', 'Material', 'Qtd.', 'Dep.', 'PEP', 'Doc. SAP item', 'Conferência MB51'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.map((l) => (
                  <tr
                    key={l.item_id}
                    className="border-t align-top"
                    style={{ borderColor: 'var(--hairline)', boxShadow: ehDivergente(l) ? 'inset 3px 0 0 0 var(--status-critical)' : undefined }}
                  >
                    <td className="px-2 py-1.5 font-mono">{l.ordem ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.material}</span>
                      <div style={{ color: 'var(--ink-secondary)' }}>{l.descricao}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-semibold tabular">{formatQtd(l.quantidade)} {l.unidade}</td>
                    <td className="px-2 py-1.5 font-mono">{l.deposito}</td>
                    <td className="px-2 py-1.5 font-mono">{l.pep || '—'}</td>
                    <td className="px-2 py-1.5 font-mono">{l.item_doc_sap || '—'}</td>
                    <td className="px-2 py-1.5">
                      <div className="mb-1"><SeloStatus l={l} /></div>
                      <DetalheMb51 l={l} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <LogAlteracoes requisicaoId={r.requisicao_id} />
        </div>
      </ModalBody>
    </Modal>
  );
}
