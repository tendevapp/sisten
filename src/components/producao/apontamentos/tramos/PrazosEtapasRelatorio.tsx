/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Datas finais do relatório "Prazo por etapa" (Geral › Relatórios). Quem edita
 * é o Planejamento (flag prod_apt_programar); os demais veem em leitura.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '../../../ui/Toast';
import { ROTULO_MARCO, type MarcoTramo } from '../../../../lib/producaoTramos';
import { listarEtapasRelatorio, salvarDatasFinais, type EtapaRelatorioCadastro } from '../../../../lib/producaoRelatorioEtapas';
import { btnPrimario, cardCls } from '../estilos';

const regraLegivel = (e: EtapaRelatorioCadastro) =>
  e.regraTipo === 'marco' ? `tramo com "${ROTULO_MARCO[e.regraValor as MarcoTramo] ?? e.regraValor}"` : `tramo chega em ${e.regraValor} (ou depois)`;

export default function PrazosEtapasRelatorio({ podeEditar }: { podeEditar: boolean }) {
  const toast = useToast();
  const [etapas, setEtapas] = useState<EtapaRelatorioCadastro[] | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    listarEtapasRelatorio()
      .then(lista => {
        setEtapas(lista);
        setRascunho({});
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Não foi possível ler as etapas.'));

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alteradas = (etapas ?? []).filter(e => e.codigo in rascunho && (rascunho[e.codigo] || null) !== e.dataFinal);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarDatasFinais(alteradas.map(e => ({ codigo: e.codigo, dataFinal: rascunho[e.codigo] || null })));
      toast.success('Datas finais salvas.');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className={`${cardCls} overflow-x-auto p-4`}>
      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Prazos por etapa — relatório da W49</h3>
      <p className="text-xs text-slate-500">
        Data em que cada etapa precisa terminar para os 115 tramos ficarem prontos. Aparece em Geral › Relatórios, abaixo do Faturamento.
        {!podeEditar && ' Somente leitura: quem edita é o Planejamento.'}
      </p>
      {!etapas ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : (
        <table className="mt-3 min-w-[36rem] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 text-left">Etapa</th>
              <th className="px-3 py-1.5 text-left">Conta como pronta quando…</th>
              <th className="px-3 py-1.5 text-left">Data final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {etapas.map(e => (
              <tr key={e.codigo}>
                <td className="py-1.5 font-semibold">
                  {e.nome}
                  {e.escopo === 'T1' && <span className="ml-1 text-[10px] font-normal text-slate-400">(só T1)</span>}
                </td>
                <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">{regraLegivel(e)}</td>
                <td className="px-3 py-1.5">
                  <input
                    type="date"
                    value={e.codigo in rascunho ? rascunho[e.codigo] : e.dataFinal ?? ''}
                    onChange={ev => setRascunho(r => ({ ...r, [e.codigo]: ev.target.value }))}
                    disabled={!podeEditar}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none disabled:bg-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {podeEditar && (
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={salvar} disabled={!alteradas.length || salvando} className={`${btnPrimario} min-h-[40px]`}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar datas
          </button>
        </div>
      )}
    </section>
  );
}
