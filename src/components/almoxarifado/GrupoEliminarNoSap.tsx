/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Abrir RM › "Eliminar no SAP": solicitações canceladas ou excluídas depois
 * de saírem numa planilha de RM. A RM pode estar viva no SAP e seguir para
 * compra; quem elimina lá confirma aqui, e o aviso sai da fila.
 *
 * O carimbo vem do gatilho `trg_core_solicitacoes_rm_encerrada`; a lista sai
 * de `pendentesEliminarNoSap` (`lib/rmSolicitacaoAlterada.ts`).
 */

import React, { useMemo, useState } from 'react';
import { Ban, Check, CheckSquare, Copy, Loader2, Square, Trash2 } from 'lucide-react';
import { localDb } from '../../db/localDb';
import type { AlmoxRmExportacao, AlmoxRmExportacaoSolicitacao } from '../../types';
import { formatDateTimeBR, formatQtd } from '../../lib/format';
import { confirmarEliminacaoSapRm } from '../../lib/almoxarifadoRmApi';
import { itensDaPlanilhaRm, type ItemPlanilhaRm } from '../../lib/rmSolicitacaoAlterada';
import { confirmar } from '../../lib/confirmar';
import { useToast } from '../ui/Toast';

interface Props {
  pendentes: AlmoxRmExportacaoSolicitacao[];
  loteById: Map<string, AlmoxRmExportacao>;
  usuario: { id?: string | null; name: string };
  onAtualizado: () => Promise<void> | void;
}

const COR = 'var(--status-critical)';

/** Itens a procurar no SAP: os da planilha que saiu; sem cópia da planilha (lote antigo), os do cache. */
function itensParaSap(m: AlmoxRmExportacaoSolicitacao, lote: AlmoxRmExportacao | undefined): ItemPlanilhaRm[] {
  const daPlanilha = itensDaPlanilhaRm(lote, m.request_number);
  if (daPlanilha.length > 0) return daPlanilha;
  return localDb.getRequestItems(m.request_id).map((it, i) => ({
    item: String((i + 1) * 10),
    material: it.sap_code || 'sem código',
    quantidade: formatQtd(it.quantity),
  }));
}

function rmDa(m: AlmoxRmExportacaoSolicitacao): string {
  const rm = (m.rm_numero || '').trim();
  if (rm) return rm;
  return (localDb.getRequests().find(r => r.id === m.request_id)?.linked_rm_number || '').trim();
}

export default function GrupoEliminarNoSap({ pendentes, loteById, usuario, onAtualizado }: Props) {
  const toast = useToast();
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [copiada, setCopiada] = useState<string | null>(null);

  const visiveis = useMemo(() => new Set(pendentes.map(m => m.id)), [pendentes]);
  const marcadas = [...selecionadas].filter(id => visiveis.has(id));
  const todas = pendentes.length > 0 && pendentes.every(m => selecionadas.has(m.id));

  if (pendentes.length === 0) return null;

  const alternar = (id: string) => setSelecionadas(prev => {
    const p = new Set(prev);
    if (p.has(id)) p.delete(id); else p.add(id);
    return p;
  });

  const alternarTodas = () => setSelecionadas(todas ? new Set() : new Set(pendentes.map(m => m.id)));

  const copiar = async (rm: string) => {
    try {
      await navigator.clipboard.writeText(rm);
      setCopiada(rm);
      window.setTimeout(() => setCopiada(atual => (atual === rm ? null : atual)), 1500);
    } catch {
      // Sem permissão de área de transferência: o número continua à vista.
    }
  };

  const concluir = async () => {
    if (marcadas.length === 0) return;
    const ok = await confirmar({
      titulo: 'RM eliminada no SAP?',
      mensagem: `Confirme que ${marcadas.length === 1 ? 'a RM foi eliminada' : `as ${marcadas.length} RMs foram eliminadas`} no SAP. O aviso sai desta lista e fica registrado com o seu nome.`,
      confirmarLabel: 'Eliminada no SAP',
    });
    if (!ok) return;
    setSalvando(true);
    try {
      const total = await confirmarEliminacaoSapRm(marcadas, { id: usuario.id, nome: usuario.name });
      if (total === 0) toast.info('Nada mudou: outra pessoa já tinha confirmado essas RMs.');
      else toast.success(`${total} ${total === 1 ? 'RM confirmada' : 'RMs confirmadas'} como eliminada no SAP.`);
      setSelecionadas(new Set());
      await onAtualizado();
    } catch (err: any) {
      toast.error('Erro ao confirmar: ' + (err?.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: COR }}>
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
        style={{ background: `color-mix(in srgb, ${COR} 12%, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4" style={{ color: COR }} />
          <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: COR }}>
            Eliminar no SAP — {pendentes.length} {pendentes.length === 1 ? 'solicitação cancelada/excluída' : 'solicitações canceladas/excluídas'} após a exportação
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={alternarTodas}
            className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer"
            style={{ color: COR }}
          >
            {todas ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {todas ? 'Desmarcar todas' : 'Marcar todas'}
          </button>
          <button
            type="button"
            onClick={() => void concluir()}
            disabled={salvando || marcadas.length === 0}
            title="Confirma que a RM foi eliminada no SAP."
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer text-white hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: COR }}
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Eliminada no SAP
            {marcadas.length > 0 && (
              <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-extrabold">{marcadas.length}</span>
            )}
          </button>
        </div>
      </div>

      <ul>
        {pendentes.map(m => {
          const marcada = selecionadas.has(m.id);
          const lote = loteById.get(m.exportacao_id);
          const itens = itensParaSap(m, lote);
          const rm = rmDa(m);
          const excluida = m.solicitacao_situacao === 'excluida';
          return (
            <li
              key={m.id}
              className="border-t px-3 py-3 space-y-2"
              style={{ borderColor: COR, background: `color-mix(in srgb, ${COR} 5%, transparent)` }}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => alternar(m.id)}
                  aria-label={marcada ? `Desmarcar solicitação ${m.request_number}` : `Marcar solicitação ${m.request_number}`}
                  className="mt-0.5 cursor-pointer shrink-0"
                >
                  {marcada
                    ? <CheckSquare className="h-4 w-4" style={{ color: COR }} />
                    : <Square className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>#{m.request_number}</span>
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide"
                      style={{ color: COR, background: `color-mix(in srgb, ${COR} 16%, transparent)` }}
                    >
                      {excluida ? <Trash2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                      {excluida ? 'Excluída' : 'Cancelada'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 sm:ml-auto">
                      <span className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>RM no SAP</span>
                      {rm ? (
                        <button
                          type="button"
                          onClick={() => void copiar(rm)}
                          aria-label={`Copiar RM ${rm}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-mono font-bold cursor-pointer hover:opacity-80"
                          style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
                        >
                          {rm}
                          {copiada === rm
                            ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--status-good)' }} />
                            : <Copy className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: COR }}>não vinculada — procure pelos itens</span>
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: COR }}>
                    Exportada {lote ? `em ${lote.arquivo} ` : ''}em {formatDateTimeBR(m.created_at)}.{' '}
                    {excluida ? 'Excluída' : 'Cancelada'}
                    {m.solicitacao_situacao_por_nome ? ` por ${m.solicitacao_situacao_por_nome}` : ''}
                    {m.solicitacao_situacao_em ? ` em ${formatDateTimeBR(m.solicitacao_situacao_em)}` : ''} —{' '}
                    <strong>elimine a RM no SAP</strong> e confirme aqui.
                  </p>
                </div>
              </div>

              {itens.length > 0 && (
                <div className="overflow-x-auto rounded-lg border ml-7" style={{ borderColor: 'var(--hairline)' }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: 'var(--surface)' }}>
                        {['Item', 'MATNR', 'Qtd.'].map(h => (
                          <th key={h} className="text-left font-bold uppercase tracking-wider px-2 py-1.5 text-[10px] whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((it, i) => (
                        <tr key={`${it.item}-${i}`} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                          <td className="px-2 py-1.5 font-mono" style={{ color: 'var(--ink-secondary)' }}>{it.item}</td>
                          <td className="px-2 py-1.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>{it.material}</td>
                          <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>{it.quantidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
