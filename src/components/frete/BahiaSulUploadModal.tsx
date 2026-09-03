/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Upload, X, FileSpreadsheet, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../../db/localDb';
import { SAPImportLog } from '../../types';

interface BahiaSulUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BahiaSulUploadModal({
  isOpen,
  onClose,
  onSuccess,
}: BahiaSulUploadModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastLog, setLastLog] = useState<SAPImportLog | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExtension || '')) {
      setError('Por favor, selecione um arquivo válido (.xlsx, .xls ou .csv).');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError('');
    setLastLog(null);
    setMessage('Lendo arquivo...');

    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        let rawRows: any[][] = [];
        if (fileExtension === 'csv') {
          const text = ev.target?.result as string;
          rawRows = text.split('\n').filter(l => l.trim()).map(l => {
            return l.split(';').map(c => c.replace(/"/g, '').trim());
          });
        } else {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
        }

        setMessage('Processando e salvando entregas no Supabase...');
        localDb.importBahiaSulRaw(rawRows, file.name, (p) => {
          setProgress(p);
        }).then(log => {
          setLastLog(log);
          setIsProcessing(false);
          onSuccess();
        }).catch(err => {
          setError(err.message || 'Falha ao processar a planilha.');
          setIsProcessing(false);
        });
      } catch (err: any) {
        setError(err.message || 'Erro ao ler arquivo.');
        setIsProcessing(false);
      }
    };

    if (fileExtension === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xl max-w-lg w-full p-6 text-left space-y-5 animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-800">Importar Planilha Bahia Sul</h3>
              <p className="text-xs text-slate-500">Base de dados de entregas das compras (CTe)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Upload Dropzone */}
        {!lastLog && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-200 hover:border-amber-400 hover:bg-amber-50/20 rounded-xl p-8 text-center transition-all relative cursor-pointer group">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={isProcessing}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex flex-col items-center space-y-2 pointer-events-none">
                <span className="p-3 rounded-full bg-slate-100 text-slate-400 group-hover:bg-amber-100 group-hover:text-amber-600 transition-all">
                  <Upload className="h-6 w-6" />
                </span>
                <p className="text-sm font-semibold text-slate-700">
                  Clique para selecionar ou arraste o arquivo aqui
                </p>
                <p className="text-xs text-slate-400">
                  Formatos aceitos: Excel (.xlsx, .xls) ou CSV
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 text-[11px] text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">Colunas suportadas automaticamente:</p>
              <p className="text-slate-500 leading-relaxed font-mono text-[10px]">
                CTO_NUMERO, CTO_FILIAL, CTO_SERIE, RMT_NOME, DST_NOME, EMISSAO, PRV_ENTREGA, ENTREGA, SITUACAO, ORG_CIDADE, DST_CIDADE, NFS_EMBARCADAS, KGS_REAL, VLR_MERCADORIA, FRT_COBRADO, NRO_PEDIDO...
              </p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {isProcessing && (
          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                {message}
              </span>
              <span className="tabular-nums text-amber-600">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-xl bg-red-50 p-3.5 border border-red-200 text-xs font-semibold text-red-600 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Falha na importação</p>
              <p className="font-normal text-red-500">{error}</p>
            </div>
          </div>
        )}

        {/* Success Report */}
        {lastLog && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>Planilha importada e sincronizada com sucesso!</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-[10px]">
              <div className="bg-white p-2 rounded-lg border border-emerald-100">
                <p className="text-slate-400">Total Lidos</p>
                <p className="text-slate-700 font-black text-sm">{lastLog.records_read}</p>
              </div>
              <div className="bg-white p-2 rounded-lg border border-emerald-100">
                <p className="text-slate-400">Novos CTe</p>
                <p className="text-emerald-700 font-black text-sm">+{lastLog.records_inserted}</p>
              </div>
              <div className="bg-white p-2 rounded-lg border border-emerald-100">
                <p className="text-slate-400">Atualizados</p>
                <p className="text-slate-600 font-black text-sm">{lastLog.records_updated}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
          >
            {lastLog ? 'Concluir' : 'Cancelar'}
          </button>
        </div>

      </div>
    </div>
  );
}
