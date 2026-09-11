/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Faturamento GW Jacobina — importação em lote por planilha.
 *
 * Lê a planilha, roda o parsing puro de `finFaturamentoImportacao.ts` e
 * mostra a conferência (linhas válidas, novas x atualizações, pendências)
 * ANTES de gravar qualquer coisa — mesmo padrão de `ImportarNotasEntrada.tsx`.
 *
 * Cada linha válida vira uma gravação: se já existe uma torre+tramo igual
 * (comparado contra `linhasExistentes`, o que a tela já tem carregado — sem
 * consulta extra), edita via `fin_fat_editar` (loga o diff campo a campo);
 * senão, cadastra nova. Nada é fatal por causa de uma linha: falha vira item
 * na lista de erros do resumo final, sem interromper o restante.
 */

import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { parseLinhasImportacaoFaturamento, type LinhaImportadaFaturamento } from '../../lib/finFaturamentoImportacao';
import * as api from '../../lib/finFaturamentoGwjacoApi';
import type { Profile, FinFatGwjaco } from '../../types';

interface Props {
  linhasExistentes: FinFatGwjaco[];
  user: Profile;
  onImportado: () => void;
}

function lerPlanilha(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = (ev) => {
      try {
        if (ext === 'csv') {
          const text = ev.target?.result as string;
          resolve(text.split('\n').filter((l) => l.trim()).map((l) => l.split(';').map((c) => c.replace(/"/g, '').trim())));
        } else {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }));
        }
      } catch (err: any) {
        reject(new Error(err?.message || 'Falha ao processar a planilha.'));
      }
    };
    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

type Fase = 'idle' | 'lendo' | 'revisao' | 'gravando' | 'concluido';

function paraPatch(l: LinhaImportadaFaturamento): api.FinFatPatch {
  return {
    torre_numero: l.torre_numero,
    tramo: l.tramo,
    serie: l.serie,
    codigo_cliente: l.codigo_cliente,
    part_number: l.part_number,
    nota_fiscal: l.nota_fiscal,
    data_faturado: l.data_faturado,
    semana_faturamento: l.semana_faturamento,
    data_expedido: l.data_expedido,
  };
}

export default function ImportarFaturamentoGwjaco({ linhasExistentes, user, onImportado }: Props) {
  const toast = useToast();
  const [fase, setFase] = useState<Fase>('idle');
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaImportadaFaturamento[]>([]);
  const [pendencias, setPendencias] = useState<{ linha: number; motivo: string }[]>([]);
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const [resumoFinal, setResumoFinal] = useState<{ criados: number; atualizados: number; semMudanca: number; falhas: string[] } | null>(null);

  const existentesPorChave = useMemo(() => {
    const m = new Map<string, FinFatGwjaco>();
    for (const l of linhasExistentes) m.set(`${l.torre_numero}|${l.tramo}`, l);
    return m;
  }, [linhasExistentes]);

  const totais = useMemo(() => {
    let novas = 0;
    let atualizacoes = 0;
    for (const l of linhas) {
      if (existentesPorChave.has(`${l.torre_numero}|${l.tramo}`)) atualizacoes += 1;
      else novas += 1;
    }
    return { validas: linhas.length, novas, atualizacoes, pendencias: pendencias.length };
  }, [linhas, pendencias, existentesPorChave]);

  const fechar = () => {
    if (fase === 'gravando') return;
    setFase('idle');
    setErroFatal(null);
    setLinhas([]);
    setPendencias([]);
    setResumoFinal(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFase('lendo');
    setErroFatal(null);
    try {
      const rawRows = await lerPlanilha(file);
      const resultado = parseLinhasImportacaoFaturamento(rawRows);
      if (resultado.erroFatal) { setErroFatal(resultado.erroFatal); setFase('revisao'); return; }
      if (!resultado.linhas.length) { setErroFatal('Nenhuma linha de dado válida encontrada na planilha.'); setFase('revisao'); return; }
      setLinhas(resultado.linhas);
      setPendencias(resultado.pendencias);
      setFase('revisao');
    } catch (err: any) {
      setErroFatal(err?.message || 'Falha ao ler a planilha.');
      setFase('revisao');
    }
  };

  const confirmar = async () => {
    if (!linhas.length) return;

    setFase('gravando');
    setProgresso({ feito: 0, total: linhas.length });
    const falhas: string[] = [];
    let criados = 0;
    let atualizados = 0;
    let semMudanca = 0;

    for (const l of linhas) {
      const chave = `${l.torre_numero}|${l.tramo}`;
      const existente = existentesPorChave.get(chave);
      try {
        if (existente) {
          const res = await api.editarLancamentoFaturamento(existente.id, paraPatch(l), { id: user.id, nome: user.name });
          if (res.alteracoes > 0) atualizados += 1; else semMudanca += 1;
        } else {
          await api.criarLancamentoFaturamento(paraPatch(l));
          criados += 1;
        }
      } catch (err: any) {
        falhas.push(`Torre ${l.torre_numero} / ${l.tramo} (linha ${l.linha}): ${err?.message || 'falha desconhecida'}`);
      }
      setProgresso((p) => ({ ...p, feito: p.feito + 1 }));
    }

    setResumoFinal({ criados, atualizados, semMudanca, falhas });
    setFase('concluido');
    onImportado();
    if (!falhas.length) {
      toast.success(`${criados} torre/tramo cadastrado(s), ${atualizados} atualizado(s).`);
    } else {
      toast.warning(`${criados + atualizados} gravado(s), ${falhas.length} falha(s) — confira o resumo.`);
    }
  };

  return (
    <>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-opacity hover:opacity-90 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <Upload className="h-4 w-4" /> Importar Planilha
        <input type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => void handleFile(e)} />
      </label>

      {fase !== 'idle' && (
        <Modal onClose={fechar} maxWidth="max-w-3xl" ariaLabel="Importação da planilha de faturamento" disableOutsideClose={fase === 'gravando'}>
          <ModalHeader onClose={fechar}>
            <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
              <FileSpreadsheet className="h-5 w-5" /> Importação da planilha de faturamento
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Torre/tramo já cadastrados são atualizados (com log de alteração); os demais são cadastrados. Nada é
              gravado antes da confirmação.
            </p>
          </ModalHeader>

          <ModalBody>
            {fase === 'lendo' && (
              <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Lendo planilha…
              </div>
            )}

            {erroFatal && (
              <div className="flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50/50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
                <AlertTriangle className="h-5 w-5 shrink-0" /> {erroFatal}
              </div>
            )}

            {fase === 'revisao' && !erroFatal && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <Resumo rotulo="Linhas válidas" valor={totais.validas} />
                  <Resumo rotulo="Novas" valor={totais.novas} cor="var(--status-good, #0ca30c)" />
                  <Resumo rotulo="Atualizações" valor={totais.atualizacoes} cor="var(--series-1, #3987e5)" />
                  <Resumo rotulo="Pendências" valor={totais.pendencias} cor={totais.pendencias ? 'var(--status-warning, #fab219)' : undefined} />
                </div>

                {pendencias.length > 0 && (
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-900 dark:text-slate-100">
                      <AlertTriangle className="h-3.5 w-3.5" /> Linhas ignoradas ou repetidas ({pendencias.length})
                    </p>
                    <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-slate-500 dark:text-slate-400">
                      {pendencias.slice(0, 8).map((p, i) => (
                        <li key={i}>linha {p.linha}: {p.motivo}</li>
                      ))}
                      {pendencias.length > 8 && <li>… e mais {pendencias.length - 8}.</li>}
                    </ul>
                  </div>
                )}

                <div className="max-h-[35vh] space-y-1 overflow-y-auto pr-1 text-[11px]">
                  {linhas.slice(0, 30).map((l) => {
                    const existe = existentesPorChave.has(`${l.torre_numero}|${l.tramo}`);
                    return (
                      <div
                        key={`${l.torre_numero}|${l.tramo}`}
                        className="flex items-center justify-between rounded-md border border-slate-100 px-2 py-1 dark:border-slate-800"
                      >
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          Torre {l.torre_numero} · {l.tramo}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {l.nota_fiscal ? `NF ${l.nota_fiscal}` : 'sem NF'}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{
                            color: existe ? 'var(--series-1, #3987e5)' : 'var(--status-good, #0ca30c)',
                            background: existe ? 'rgba(57,135,229,0.12)' : 'rgba(12,163,12,0.12)',
                          }}
                        >
                          {existe ? 'atualiza' : 'novo'}
                        </span>
                      </div>
                    );
                  })}
                  {linhas.length > 30 && (
                    <p className="text-center text-slate-400">… e mais {linhas.length - 30} linha(s).</p>
                  )}
                </div>
              </div>
            )}

            {fase === 'gravando' && (
              <div className="space-y-3 py-10 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Gravando {progresso.feito} de {progresso.total}…
                </p>
              </div>
            )}

            {fase === 'concluido' && resumoFinal && (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-2 text-sm font-bold"
                  style={{ color: resumoFinal.falhas.length ? 'var(--status-warning, #fab219)' : 'var(--status-good, #0ca30c)' }}
                >
                  <Check className="h-5 w-5" />
                  {resumoFinal.criados} cadastrado(s), {resumoFinal.atualizados} atualizado(s)
                  {resumoFinal.semMudanca > 0 && `, ${resumoFinal.semMudanca} sem mudança`}.
                </div>
                {resumoFinal.falhas.length > 0 && (
                  <ul className="space-y-1 text-xs text-rose-600 dark:text-rose-400">
                    {resumoFinal.falhas.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            {fase === 'revisao' && !erroFatal && (
              <>
                <button
                  onClick={fechar}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void confirmar()}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  <Check className="h-4 w-4" /> Confirmar {totais.validas} linha(s)
                </button>
              </>
            )}
            {(erroFatal || fase === 'concluido') && (
              <button
                onClick={fechar}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-400"
              >
                Fechar
              </button>
            )}
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
      <p className="tabular text-lg font-extrabold" style={{ color: cor ?? 'var(--ink-primary, #0f172a)' }}>{valor}</p>
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{rotulo}</p>
    </div>
  );
}
