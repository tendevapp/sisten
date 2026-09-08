/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Botão de importação de planilha SAP embutido nas telas do Almoxarifado
 * (Estoque → ZL0024, Movimentações → MB51). É o mesmo motor de importação do
 * Painel Administrativo (`localDb.importZL0024Raw` / `importMB51Raw`), que já
 * grava o log em `ops_importacoes` e no histórico local — aqui só damos o
 * gatilho para quem tem acesso à página, sem precisar do painel de admin.
 *
 * A leitura de Excel/CSV replica o que o AdminPanel faz: primeira aba, cabeçalho
 * na primeira linha, CSV separado por ';'.
 */

import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import type { SAPImportLog } from '../../types';
import Modal, { ModalBody, ModalFooter } from '../ui/Modal';

interface Props {
  /** Rótulo curto da transação, ex.: "ZL0024". Aparece no botão e no título. */
  sigla: string;
  /** Texto de apoio no botão, ex.: "Posição de Estoque". */
  descricao: string;
  /** Recebe as linhas cruas da planilha e devolve o log da importação. */
  importar: (
    rawRows: any[][],
    filename: string,
    onProgress: (percent: number) => void,
  ) => Promise<SAPImportLog>;
  /** Chamado após uma importação bem-sucedida, para a tela recarregar os dados. */
  onImportado: () => void;
  className?: string;
}

type Status = 'idle' | 'lendo' | 'importando' | 'ok' | 'erro';

function lerPlanilha(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = (ev) => {
      try {
        if (ext === 'csv') {
          const text = ev.target?.result as string;
          resolve(
            text
              .split('\n')
              .filter((l) => l.trim())
              .map((l) => l.split(';').map((c) => c.replace(/"/g, '').trim())),
          );
        } else {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' }));
        }
      } catch (err: any) {
        reject(new Error(err?.message || 'Falha ao processar a planilha.'));
      }
    };
    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export default function PlanilhaSapUploadButton({
  sigla,
  descricao,
  importar,
  onImportado,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [erro, setErro] = useState('');
  const [log, setLog] = useState<SAPImportLog | null>(null);

  const ocupado = status === 'lendo' || status === 'importando';

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reimportar o mesmo arquivo
    if (!file) return;

    setStatus('lendo');
    setProgress(0);
    setErro('');
    setLog(null);

    try {
      const rawRows = await lerPlanilha(file);
      setStatus('importando');
      const resultado = await importar(rawRows, file.name, setProgress);
      setLog(resultado);
      setStatus('ok');
      onImportado();
    } catch (err: any) {
      setErro(err?.message || 'Falha ao importar a planilha.');
      setStatus('erro');
    }
  };

  const fechar = () => {
    if (ocupado) return;
    setStatus('idle');
    setErro('');
    setLog(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        className={
          className ||
          'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 disabled:opacity-50'
        }
        title={`Importar planilha ${sigla} (${descricao})`}
      >
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Importar {sigla}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFile}
        className="hidden"
      />

      {status !== 'idle' && (
        <Modal onClose={fechar} maxWidth="max-w-md" ariaLabel={`Importação ${sigla}`} disableOutsideClose>
          <div className="flex items-start gap-3 px-4 sm:px-6 pt-5 pb-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Upload className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                Importar {sigla}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{descricao}</p>
            </div>
            {!ocupado && (
              <button type="button" onClick={fechar} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <ModalBody className="space-y-4">
            {ocupado && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {status === 'lendo' ? 'Lendo a planilha…' : 'Enviando os dados…'}
                </p>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-200"
                    style={{ width: `${status === 'lendo' ? 5 : Math.max(5, progress)}%` }}
                  />
                </div>
              </div>
            )}

            {status === 'ok' && log && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Importação concluída.
                </p>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                    <dt className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Lidos</dt>
                    <dd className="text-slate-800 dark:text-slate-100 font-black text-base tabular-nums">{log.records_read.toLocaleString('pt-BR')}</dd>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                    <dt className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Inseridos</dt>
                    <dd className="text-slate-800 dark:text-slate-100 font-black text-base tabular-nums">{log.records_inserted.toLocaleString('pt-BR')}</dd>
                  </div>
                  {log.records_updated > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                      <dt className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Atualizados</dt>
                      <dd className="text-slate-800 dark:text-slate-100 font-black text-base tabular-nums">{log.records_updated.toLocaleString('pt-BR')}</dd>
                    </div>
                  )}
                  {log.records_eliminated > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                      <dt className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Substituídos</dt>
                      <dd className="text-slate-800 dark:text-slate-100 font-black text-base tabular-nums">{log.records_eliminated.toLocaleString('pt-BR')}</dd>
                    </div>
                  )}
                </dl>
                {(log.columns_missing.length > 0 || (log.ignored_rows?.length ?? 0) > 0) && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {log.columns_missing.length > 0 && `Colunas ausentes: ${log.columns_missing.join(', ')}. `}
                    {(log.ignored_rows?.length ?? 0) > 0 && `${log.ignored_rows!.length} linha(s) ignorada(s).`}
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  O log completo fica em Administração → Log Importação SAP.
                </p>
              </div>
            )}

            {status === 'erro' && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            <button
              type="button"
              onClick={fechar}
              disabled={ocupado}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {status === 'ok' ? 'Fechar' : 'Cancelar'}
            </button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
