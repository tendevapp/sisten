/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Estrutura PEP — Modal de Importação de Planilha e Texto.
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Clipboard,
  Loader2, RefreshCw, Layers, ArrowRight,
} from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { parseLinhasImportacaoPep, parseTextoColadoPep, type ResultadoParsePep } from '../../lib/finPepImportacao';
import { importarPepEmLote } from '../../lib/finPepApi';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onClose: () => void;
  onImportado: () => void;
}

type TabMetodo = 'arquivo' | 'colar';

export default function ImportarPepModal({ user, onClose, onImportado }: Props) {
  const toast = useToast();
  const [metodo, setMetodo] = useState<TabMetodo>('arquivo');
  const [modoGravacao, setModoGravacao] = useState<'upsert' | 'replace'>('upsert');
  const [textoColado, setTextoColado] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);

  const [resultado, setResultado] = useState<ResultadoParsePep | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState<number>(0);

  const processarMatriz = (rawRows: unknown[][], nomeOrigem: string) => {
    setErroLeitura(null);
    try {
      const res = parseLinhasImportacaoPep(rawRows);
      if (res.validas.length === 0 && res.pendencias.length === 0) {
        setErroLeitura('Nenhum dado legível encontrado no arquivo ou texto informado.');
        setResultado(null);
        return;
      }
      setResultado(res);
      setNomeArquivo(nomeOrigem);
    } catch (err: any) {
      setErroLeitura(err?.message || 'Falha ao processar as linhas da planilha.');
      setResultado(null);
    }
  };

  const handleArquivoChange = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    setNomeArquivo(file.name);
    setErroLeitura(null);

    const reader = new FileReader();
    reader.onerror = () => setErroLeitura('Não foi possível ler o arquivo.');
    reader.onload = (ev) => {
      try {
        let rawRows: unknown[][] = [];
        if (ext === 'csv') {
          const text = ev.target?.result as string;
          rawRows = parseTextoColadoPep(text);
        } else {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook.SheetNames.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        }
        processarMatriz(rawRows, file.name);
      } catch (err: any) {
        setErroLeitura(err?.message || 'Falha ao processar arquivo.');
      }
    };

    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const handleColarProcessar = () => {
    if (!textoColado.trim()) {
      setErroLeitura('Cole os dados copiados do Excel antes de processar.');
      return;
    }
    const rawRows = parseTextoColadoPep(textoColado);
    processarMatriz(rawRows, 'Texto Copiado');
  };

  const handleSalvar = async () => {
    if (!resultado || !resultado.validas.length) return;

    setSalvando(true);
    setProgresso(0);

    try {
      const res = await importarPepEmLote(
        resultado.validas,
        modoGravacao,
        user.nome,
        (p) => setProgresso(p),
      );

      toast.show({
        title: 'Importação concluída com sucesso',
        message: `${res.inseridos} elementos PEP gravados na base (${modoGravacao === 'replace' ? 'base substituída' : 'upsert'}).`,
        variant: 'success',
      });

      onImportado();
      onClose();
    } catch (err: any) {
      toast.show({
        title: 'Erro na importação',
        message: err?.message || 'Falha ao gravar elementos PEP no banco.',
        variant: 'error',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="xl">
      <ModalHeader
        title="Importar Estrutura PEP (WBS Element)"
        subtitle="Carregue planilha SAP ou cole diretamente as linhas com Centro de Lucro, Projeto, WBS e níveis."
        icon={FileSpreadsheet}
        onClose={onClose}
      />

      <ModalBody className="space-y-5">
        {/* Abas de método */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => { setMetodo('arquivo'); setResultado(null); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              metodo === 'arquivo'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Upload className="h-4 w-4" /> Arquivo Excel / CSV
          </button>
          <button
            type="button"
            onClick={() => { setMetodo('colar'); setResultado(null); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              metodo === 'colar'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Clipboard className="h-4 w-4" /> Colar do Excel (Ctrl+V)
          </button>
        </div>

        {/* Método 1: Arquivo */}
        {metodo === 'arquivo' && !resultado && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-250 dark:border-slate-800 hover:border-emerald-500 rounded-xl p-8 text-center cursor-pointer relative bg-slate-50/50 dark:bg-slate-900/50 transition-all group">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  if (e.target.files?.length) handleArquivoChange(e.target.files[0]);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <Upload className="mx-auto h-8 w-8 text-slate-400 group-hover:text-emerald-600 group-hover:scale-110 transition-all" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-2">
                Clique ou arraste a planilha PEP aqui
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Suporta .xlsx, .xls ou .csv exportado do SAP
              </p>
            </div>

            <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Colunas reconhecidas automaticamente:</p>
              <p className="font-mono text-[10px] text-slate-500 leading-relaxed">
                Centro de lucro • Definição do projeto • WBS element • Name • Level • Usuário unidade de medida 1 • Moeda • Empresa • Código elemento classificação contábil • Código elemento de faturamento • Status • IFRS15 - OD
              </p>
            </div>
          </div>
        )}

        {/* Método 2: Colar Texto */}
        {metodo === 'colar' && !resultado && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Copie as células no Excel (com ou sem cabeçalho) e cole abaixo:
            </label>
            <textarea
              rows={6}
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              placeholder="Centro de lucro&#9;Definição do projeto&#9;WBS element&#9;Name&#9;Level...&#10;TEN00&#9;TEN00&#9;TEN00&#9;ACAPU - TOR EÓLICAS NORDE&#9;1..."
              className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleColarProcessar}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Analisar Texto <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Mensagem de Erro de Leitura */}
        {erroLeitura && (
          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{erroLeitura}</span>
          </div>
        )}

        {/* Pré-visualização do resultado */}
        {resultado && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>{resultado.validas.length} elementos PEP válidos detectados</span>
                {nomeArquivo && <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">({nomeArquivo})</span>}
              </div>
              <button
                type="button"
                onClick={() => { setResultado(null); setTextoColado(''); }}
                className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Trocar arquivo / texto
              </button>
            </div>

            {/* Modo de gravação */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 space-y-2 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 block">Modo de Gravação:</span>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  modoGravacao === 'upsert'
                    ? 'border-emerald-500 bg-white dark:bg-slate-900 shadow-2xs'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900'
                }`}>
                  <input
                    type="radio"
                    name="modo"
                    value="upsert"
                    checked={modoGravacao === 'upsert'}
                    onChange={() => setModoGravacao('upsert')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Atualizar e Inserir (Upsert)</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Mantém registros existentes e atualiza campos por WBS element.</span>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  modoGravacao === 'replace'
                    ? 'border-amber-500 bg-white dark:bg-slate-900 shadow-2xs'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900'
                }`}>
                  <input
                    type="radio"
                    name="modo"
                    value="replace"
                    checked={modoGravacao === 'replace'}
                    onChange={() => setModoGravacao('replace')}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Substituir Base Completa</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Limpa a tabela anterior e grava exatamente a nova planilha.</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Pendências se houver */}
            {resultado.pendencias.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1 max-h-28 overflow-y-auto">
                <span className="font-bold block">Linhas ignoradas ({resultado.pendencias.length}):</span>
                {resultado.pendencias.map((p, idx) => (
                  <div key={idx} className="text-[11px]">
                    Linha {p.linha}: {p.motivo}
                  </div>
                ))}
              </div>
            )}

            {/* Tabela de Preview (primeiras 5 linhas) */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Pré-visualização (primeiros 5 registros):
              </span>
              <div className="overflow-x-auto rounded-lg border border-slate-250 dark:border-slate-800 max-h-48 text-[11px]">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2">WBS Element</th>
                      <th className="p-2">Nome</th>
                      <th className="p-2">Nível</th>
                      <th className="p-2">Projeto</th>
                      <th className="p-2">C. Lucro</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {resultado.validas.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                        <td className="p-2 font-mono font-bold text-slate-800 dark:text-slate-200">{row.wbs_element}</td>
                        <td className="p-2 truncate max-w-[200px]" title={row.nome || ''}>{row.nome || '—'}</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-[10px]">
                            N{row.nivel ?? '—'}
                          </span>
                        </td>
                        <td className="p-2 font-mono text-slate-600 dark:text-slate-400">{row.definicao_projeto || '—'}</td>
                        <td className="p-2 font-mono text-slate-600 dark:text-slate-400">{row.centro_lucro || '—'}</td>
                        <td className="p-2">{row.status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Barra de progresso */}
            {salvando && (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" /> Gravando no Supabase...
                  </span>
                  <span>{progresso}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-200"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={salvando}
          className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        {resultado && resultado.validas.length > 0 && (
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Gravando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> Confirmar Importação ({resultado.validas.length})
              </>
            )}
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
