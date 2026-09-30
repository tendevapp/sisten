/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detalhe de consumo de EPI de um colaborador: todas as entregas, quanto
 * cada EPI durou e como isso se compara à mediana da função. O cálculo está
 * em `detalharColaborador` (fichaEpi.ts), testado.
 */

import { useMemo } from 'react';
import { AlertTriangle, Boxes, CalendarClock, FileText, PackageX, Timer } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../../ui/Modal';
import KpiCard from '../../charts/KpiCard';
import {
  detalharColaborador,
  diasEntre,
  formatarDataBR,
  formatarQuantidade,
  hojeISO,
  MOTIVOS_MED,
  type DetalheEpiColaborador,
  type LinhaConsumo,
} from '../../../lib/fichaEpi';

interface Props {
  pessoaId: string;
  /** Histórico completo (sem filtro): a duração precisa da entrega anterior. */
  historico: LinhaConsumo[];
  onClose: () => void;
  onLancarFicha?: () => void;
}

const fmtDias = (d: number | null) => (d === null ? '—' : `${d} ${d === 1 ? 'dia' : 'dias'}`);
const thCls = 'px-3 py-2.5 font-bold';

type Situacao = { texto: string; cls: string };

/** Compara a duração do colaborador com a referência da função. */
function situacaoDoEpi(e: DetalheEpiColaborador): Situacao {
  if (e.duracaoMedianaDias === null) return { texto: 'Sem reposição medida', cls: 'text-slate-400' };
  if (e.referenciaFuncaoDias === null) return { texto: 'Sem referência da função', cls: 'text-slate-500' };
  const razao = e.duracaoMedianaDias / e.referenciaFuncaoDias;
  if (razao < 0.5) return { texto: 'Troca precoce', cls: 'font-bold text-amber-600 dark:text-amber-400' };
  if (razao <= 1.25) return { texto: 'Dentro do padrão', cls: 'font-semibold text-emerald-700 dark:text-emerald-400' };
  return { texto: 'Dura mais que a função', cls: 'font-semibold text-sky-700 dark:text-sky-400' };
}

function previsao(data: string | null, hoje: string): { texto: string; atrasada: boolean } | null {
  if (!data) return null;
  const dias = diasEntre(hoje, data);
  if (dias < 0) return { texto: `${formatarDataBR(data)} · atrasada ${-dias}d`, atrasada: true };
  return { texto: `${formatarDataBR(data)} · em ${dias}d`, atrasada: false };
}

export default function ConsumoColaboradorModal({ pessoaId, historico, onClose, onLancarFicha }: Props) {
  const detalhe = useMemo(() => detalharColaborador(pessoaId, historico), [pessoaId, historico]);
  const hoje = hojeISO();

  if (!detalhe) return null;
  const { resumo } = detalhe;
  const maxDias = Math.max(1, ...detalhe.porEpi.flatMap(e => [e.duracaoMedianaDias ?? 0, e.referenciaFuncaoDias ?? 0]));

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel={`Consumo de EPI de ${detalhe.nome}`} zIndexClassName="z-[110]">
      <ModalHeader onClose={onClose}>
        <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">{detalhe.nome}</h2>
        <p className="truncate text-xs text-slate-500">
          <span className="font-mono">{detalhe.registro}</span> · {detalhe.funcaoNome}{detalhe.setor ? ` · ${detalhe.setor}` : ''}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard label="Unidades recebidas" value={resumo.unidades} format={formatarQuantidade} icon={Boxes} emphasize detail={`${resumo.tiposEpi} tipos de EPI`} />
          <KpiCard label="Fichas" value={resumo.entregas} format={formatarQuantidade} icon={FileText} accent="#7c3aed" detail={`desde ${formatarDataBR(resumo.primeiraEntrega)}`} />
          <KpiCard label="Duração mediana" display={fmtDias(resumo.duracaoMedianaDias)} icon={Timer} accent="var(--status-good)" detail="entre reposições do mesmo EPI" />
          <KpiCard label="Trocas precoces" value={resumo.trocasPrecoces} format={formatarQuantidade} icon={AlertTriangle} accent="var(--status-warning)" detail="menos da metade da mediana da função" />
          <KpiCard label="Perda / dano" value={resumo.perdas} format={formatarQuantidade} icon={PackageX} accent="var(--status-serious)" detail="un. com motivo 3" />
        </div>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Duração por EPI</h3>
            <p className="text-xs text-slate-500">
              Mediana dos dias entre reposições deste colaborador, comparada à mediana da função (referência a partir de 3 reposições).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                <tr>
                  <th className={`${thCls} pl-4`}>EPI · código e descrição SAP</th>
                  <th className={`${thCls} text-right`}>Unid.</th>
                  <th className={`${thCls} text-right`}>Entregas</th>
                  <th className={thCls}>Duração × função</th>
                  <th className={thCls}>Situação</th>
                  <th className={`${thCls} text-right`}>Última</th>
                  <th className={`${thCls} pr-4 text-right`}>Reposição prevista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {detalhe.porEpi.map(e => {
                  const situacao = situacaoDoEpi(e);
                  const prev = previsao(e.reposicaoPrevista, hoje);
                  return (
                    <tr key={e.chave} className="text-slate-700 dark:text-slate-200">
                      <td className="px-3 py-2 pl-4">
                        <p className="font-semibold">{e.grupoEpi}</p>
                        {e.materiaisSap.map(m => (
                          <p key={m.codigo} className="max-w-[260px] text-[11px] leading-snug text-slate-500"><span className="font-mono font-semibold">{m.codigo}</span>{m.descricao ? ` · ${m.descricao}` : ''}</p>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarQuantidade(e.unidades)}{e.perdas > 0 && <span className="ml-1 text-red-600 dark:text-red-400" title="Perda / dano">({e.perdas})</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{e.entregas}</td>
                      <td className="px-3 py-2">
                        <div className="w-44 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${((e.duracaoMedianaDias ?? 0) / maxDias) * 100}%` }} />
                            </div>
                            <span className="w-14 shrink-0 text-right font-bold tabular-nums">{fmtDias(e.duracaoMedianaDias)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div className="h-full rounded-full bg-slate-400" style={{ width: `${((e.referenciaFuncaoDias ?? 0) / maxDias) * 100}%` }} />
                            </div>
                            <span className="w-14 shrink-0 text-right tabular-nums text-slate-500">{fmtDias(e.referenciaFuncaoDias)}</span>
                          </div>
                        </div>
                      </td>
                      <td className={`px-3 py-2 ${situacao.cls}`}>{situacao.texto}{e.amostras > 0 && <span className="ml-1 font-normal text-slate-400">({e.amostras} rep.)</span>}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatarDataBR(e.ultimaEntrega)}</td>
                      <td className={`px-3 py-2 pr-4 text-right whitespace-nowrap ${prev?.atrasada ? 'font-bold text-amber-600 dark:text-amber-400' : ''}`}>{prev?.texto ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800">
            Barra grossa: duração do colaborador · barra fina: mediana da função. A reposição prevista usa a mediana da função (ou a do colaborador, sem referência).
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-2.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Todas as entregas</h3>
              <p className="text-xs text-slate-500">Da mais recente para a mais antiga, com os dias desde a entrega anterior do mesmo EPI.</p>
            </div>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className={`${thCls} pl-4`}>Data</th>
                  <th className={thCls}>EPI · código e descrição SAP</th>
                  <th className={`${thCls} text-right`}>Qtd.</th>
                  <th className={thCls}>Motivo (M.E.D.)</th>
                  <th className={`${thCls} pr-4 text-right`}>Dias desde a anterior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {detalhe.entregas.map(e => (
                  <tr key={e.itemId} className="text-slate-700 dark:text-slate-200">
                    <td className="px-3 py-2 pl-4 whitespace-nowrap">{formatarDataBR(e.data)}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{e.grupoEpi}</span>
                      {e.codigoSap && <span className="block max-w-[300px] text-[11px] leading-snug text-slate-500"><span className="font-mono font-semibold">{e.codigoSap}</span>{e.descricaoSap ? ` · ${e.descricaoSap}` : ''}</span>}
                      {e.foraDaMatriz && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">fora da matriz</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarQuantidade(e.quantidade)}</td>
                    <td className={`px-3 py-2 ${e.motivo === 3 ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>{e.motivo}. {MOTIVOS_MED[e.motivo]}</td>
                    <td className="px-3 py-2 pr-4 text-right tabular-nums">
                      {e.precoce && <span className="mr-1.5 inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />precoce</span>}
                      {e.diasDesdeAnterior === null ? '—' : e.diasDesdeAnterior}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {onLancarFicha && (
          <div className="flex justify-end">
            <button type="button" onClick={onLancarFicha} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40">
              Lançar nova ficha para {detalhe.nome.split(' ')[0]}
            </button>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
