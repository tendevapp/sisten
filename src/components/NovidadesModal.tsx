/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Ban, ArrowRightLeft, Loader2 } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, SAPImportLog } from '../types';
import Modal, { ModalBody, ModalHeader } from './ui/Modal';
import { formatDateTimeBR } from '../lib/format';

interface NovidadesModalProps {
  user: Profile;
  onClose: () => void;
}

interface EnrichedMissingRi {
  ri: string;
  requisicao_de_compra: string;
  item_reqc: string;
  texto_breve: string;
  material: string;
  grupo_comprador: string;
}

interface EnrichedQuantityChange {
  ri: string;
  item: string;
  oldQty: number;
  newQty: number;
  texto_breve: string;
  grupo_comprador: string;
}

export default function NovidadesModal({ user, onClose }: NovidadesModalProps) {
  const [loading, setLoading] = useState(true);
  const [latestLog, setLatestLog] = useState<SAPImportLog | null>(null);
  const [detail, setDetail] = useState<{ new_ris: SAPImportLog['new_ris']; missing_ris: string[] } | null>(null);

  const isAdmin = user.roles.includes('admin');
  const myGroups = useMemo(
    () => (isAdmin ? null : localDb.getBuyerGroupsForUser(user.id).map(g => g.group_code)),
    [isAdmin, user.id]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const logs = localDb.getImportLogs().filter(l => l.type === 'ME5A');
      const latest = logs.length > 0
        ? logs.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
        : null;
      if (!latest) {
        if (!cancelled) { setLatestLog(null); setLoading(false); }
        return;
      }
      const full = await localDb.fetchImportLogDetail(latest.id);
      if (!cancelled) {
        setLatestLog(latest);
        setDetail({ new_ris: full?.new_ris || [], missing_ris: full?.missing_ris || [] });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const inScope = (grupo: string | undefined | null) => !myGroups || myGroups.includes(String(grupo || ''));

  const enriched = useMemo(() => localDb.getEnrichedSAPRequisicoes(), []);
  const allReqs = useMemo(() => localDb.getRequisicoes(), []);
  const allReqsMap = useMemo(() => new Map(allReqs.map(r => [r.ri, r as any])), [allReqs]);

  const scopedActive = useMemo(
    () => enriched.filter(r => inScope((r as any).grupo_comprador)),
    [enriched, myGroups]
  );

  const semPoItens = useMemo(
    () => scopedActive.filter(r => r.status_requisicao === 'Sem PO').length,
    [scopedActive]
  );

  const semMigoItens = useMemo(
    () => scopedActive.filter(
      r => r.status_requisicao === 'Processado' && !r.data_migo && !r.requisicao_de_compra.startsWith('17')
    ).length,
    [scopedActive]
  );

  const newItems = useMemo(
    () => (detail?.new_ris || []).filter(n => inScope(n.grupo_comprador)),
    [detail, myGroups]
  );

  const missingItems: EnrichedMissingRi[] = useMemo(() => {
    return (detail?.missing_ris || [])
      .map(ri => {
        const rec = allReqsMap.get(ri);
        if (!rec) return null;
        return {
          ri,
          requisicao_de_compra: rec.requisicao_de_compra,
          item_reqc: rec.item_reqc,
          texto_breve: rec.texto_breve || '',
          material: rec.material_code || (rec as any).material || '',
          grupo_comprador: rec.grupo_comprador || ''
        };
      })
      .filter((r): r is EnrichedMissingRi => !!r && inScope(r.grupo_comprador));
  }, [detail, allReqsMap, myGroups]);

  const quantityChanges: EnrichedQuantityChange[] = useMemo(() => {
    const changes: any[] = latestLog?.quantity_changes || [];
    return changes
      .map(c => {
        const rec = allReqsMap.get(c.ri);
        if (!rec) return null;
        return {
          ri: c.ri,
          item: c.item,
          oldQty: c.oldQty,
          newQty: c.newQty,
          texto_breve: rec.texto_breve || '',
          grupo_comprador: rec.grupo_comprador || ''
        };
      })
      .filter((c): c is EnrichedQuantityChange => !!c && inScope(c.grupo_comprador));
  }, [latestLog, allReqsMap, myGroups]);

  return (
    <Modal onClose={onClose} ariaLabel="Novidades" maxWidth="max-w-4xl">
      <ModalHeader onClose={onClose}>
        <h3 className="text-lg font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#0056c6] dark:text-blue-500" />
          Novidades {!isAdmin && myGroups && myGroups.length > 0 && (
            <span className="text-xs font-semibold text-slate-400">
              (grupo {myGroups.join(', ')})
            </span>
          )}
        </h3>
        {latestLog && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Última importação ME5A: {formatDateTimeBR(latestLog.created_at)}
          </p>
        )}
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !latestLog ? (
          <p className="text-sm text-slate-500 text-center py-10">Nenhuma importação ME5A encontrada.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <p className="text-xs font-bold text-slate-400 uppercase">Itens sem PO</p>
                <p className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 mt-1">{semPoItens}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <p className="text-xs font-bold text-slate-400 uppercase">Itens sem MIGO</p>
                <p className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 mt-1">{semMigoItens}</p>
              </div>
            </div>

            <section>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-emerald-500" /> Novas RMs e itens ({newItems.length})
              </h4>
              {newItems.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum item novo nesta importação.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2">RM</th>
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-left px-3 py-2">Material</th>
                        <th className="text-left px-3 py-2">Descrição</th>
                        <th className="text-left px-3 py-2">Qtd</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newItems.map(n => (
                        <tr key={n.ri} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 font-semibold">{n.requisicao_de_compra}</td>
                          <td className="px-3 py-2">{n.item_reqc}</td>
                          <td className="px-3 py-2">{n.material}</td>
                          <td className="px-3 py-2 truncate max-w-[240px]" title={n.texto_breve}>{n.texto_breve}</td>
                          <td className="px-3 py-2">{n.qtd_solicitada}</td>
                          <td className="px-3 py-2">
                            {n.is_new_rm ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold">RM nova</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#0056c6] font-bold">Item novo em RM existente</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                <Ban className="h-4 w-4 text-red-500" /> Excluídas ({missingItems.length})
              </h4>
              {missingItems.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhuma exclusão nesta importação.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2">RM</th>
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-left px-3 py-2">Material</th>
                        <th className="text-left px-3 py-2">Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missingItems.map(m => (
                        <tr key={m.ri} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 font-semibold">{m.requisicao_de_compra}</td>
                          <td className="px-3 py-2">{m.item_reqc}</td>
                          <td className="px-3 py-2">{m.material}</td>
                          <td className="px-3 py-2 truncate max-w-[240px]" title={m.texto_breve}>{m.texto_breve}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                <ArrowRightLeft className="h-4 w-4 text-amber-500" /> Mudança de quantidade ({quantityChanges.length})
              </h4>
              {quantityChanges.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhuma mudança de quantidade nesta importação.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-left px-3 py-2">Descrição</th>
                        <th className="text-left px-3 py-2">Qtd. anterior</th>
                        <th className="text-left px-3 py-2">Qtd. nova</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quantityChanges.map((c, idx) => (
                        <tr key={c.ri + idx} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 font-semibold">{c.item}</td>
                          <td className="px-3 py-2 truncate max-w-[240px]" title={c.texto_breve}>{c.texto_breve}</td>
                          <td className="px-3 py-2">{c.oldQty}</td>
                          <td className="px-3 py-2">{c.newQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
