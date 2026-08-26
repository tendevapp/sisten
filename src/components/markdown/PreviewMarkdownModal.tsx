/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Preview e comparador de arquivos e markdown — permite visualizacao do arquivo original
 * (PDF / Imagem) antes da conversao e comparacao lado a lado (Split Screen) apos conversao.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy, Download, ExternalLink, Columns2, FileText, Code2, Upload,
  Image as ImageIcon, CheckCircle2, Sparkles, Play, Clock,
} from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { ACCEPT_CONVERSOR, type FormatoArquivo } from '../../lib/markdownConvert';

type ModoVisualizacao = 'dividido' | 'documento' | 'markdown';

interface PreviewMarkdownModalProps {
  nome: string;
  markdown?: string;
  resumo: string;
  formato?: FormatoArquivo;
  file?: File | null;
  onClose: () => void;
  onCopiar?: () => void;
  onBaixar?: () => void;
  onConverter?: () => void;
  onSelecionarArquivo?: (file: File) => void;
}

export default function PreviewMarkdownModal({
  nome,
  markdown = '',
  resumo,
  formato,
  file,
  onClose,
  onCopiar,
  onBaixar,
  onConverter,
  onSelecionarArquivo,
}: PreviewMarkdownModalProps) {
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const temMarkdown = !!markdown && markdown.trim().length > 0;

  // Define modo inicial: se tem markdown e midia, inicia em split view; senao, mostra apenas o documento
  const temMidiaVisual = formato === 'pdf' || formato === 'imagem' || file?.type.startsWith('image/') || file?.type === 'application/pdf';
  const [modo, setModo] = useState<ModoVisualizacao>(() => {
    if (!temMarkdown) return 'documento';
    return temMidiaVisual ? 'dividido' : 'markdown';
  });

  // Cria Blob URL para exibição do PDF ou Imagem
  const fileUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  // Limpa Blob URL ao desmontar
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const handleAbrirNovaGuia = () => {
    if (fileUrl) {
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleArquivoCarregado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f && onSelecionarArquivo) {
      onSelecionarArquivo(f);
    }
  };

  const ehPdf = formato === 'pdf' || file?.type === 'application/pdf' || nome.toLowerCase().endsWith('.pdf');
  const ehImagem = formato === 'imagem' || file?.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(nome);

  // Ajusta largura do modal conforme o modo selecionado
  const maxWidth = modo === 'dividido' && temMarkdown
    ? 'max-w-[94vw] xl:max-w-7xl'
    : modo === 'documento'
    ? 'max-w-5xl'
    : 'max-w-4xl';

  return (
    <Modal onClose={onClose} maxWidth={maxWidth} ariaLabel={`Pré-visualização e conferência de ${nome}`}>
      <ModalHeader onClose={onClose}>
        <div className="flex flex-wrap items-center justify-between gap-3 pr-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-bold text-slate-900 dark:text-slate-50" title={nome}>
                {nome}
              </h3>
              {!temMarkdown && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  <Clock className="h-3 w-3" />
                  Aguardando conversão
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{resumo}</p>
          </div>

          {/* Seletor de Modo de Exibição (só faz sentido alternar quando o Markdown já existe) */}
          {temMarkdown && (
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setModo('dividido')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  modo === 'dividido'
                    ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
                title="Exibir documento e Markdown lado a lado"
              >
                <Columns2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Lado a Lado</span>
              </button>

              <button
                type="button"
                onClick={() => setModo('documento')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  modo === 'documento'
                    ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
                title="Exibir apenas o documento original"
              >
                {ehImagem ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Original</span>
              </button>

              <button
                type="button"
                onClick={() => setModo('markdown')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  modo === 'markdown'
                    ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
                title="Exibir apenas o Markdown convertido"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Markdown</span>
              </button>
            </div>
          )}
        </div>
      </ModalHeader>

      <ModalBody className="p-3 sm:p-4">
        <input
          ref={inputArquivoRef}
          type="file"
          accept={ACCEPT_CONVERSOR}
          className="hidden"
          onChange={handleArquivoCarregado}
        />

        <div className="grid h-[62vh] sm:h-[66vh] gap-3 grid-cols-1 lg:grid-cols-12">
          {/* PAINEL ESQUERDO: DOCUMENTO ORIGINAL */}
          {(modo === 'dividido' || modo === 'documento' || !temMarkdown) && (
            <div
              className={`flex flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-950/60 min-h-0 ${
                modo === 'dividido' && temMarkdown ? 'lg:col-span-6' : 'lg:col-span-12'
              }`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ehImagem ? <ImageIcon className="h-4 w-4 text-indigo-500" /> : <FileText className="h-4 w-4 text-rose-500" />}
                  Documento Original {ehPdf ? '(PDF)' : ehImagem ? '(Imagem)' : ''}
                </span>

                {fileUrl && (
                  <button
                    type="button"
                    onClick={handleAbrirNovaGuia}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir em nova guia
                  </button>
                )}
              </div>

              <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                {fileUrl ? (
                  ehPdf ? (
                    <iframe
                      src={fileUrl}
                      title={`Leitor PDF de ${nome}`}
                      className="h-full w-full border-0 bg-white dark:bg-slate-900"
                    />
                  ) : ehImagem ? (
                    <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
                      <img
                        src={fileUrl}
                        alt={nome}
                        className="max-h-full max-w-full rounded-lg object-contain shadow-xs"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-slate-500">
                      <FileText className="h-8 w-8 text-slate-400" />
                      <p className="text-xs font-medium">Arquivo carregado ({formato?.toUpperCase() ?? 'Geral'})</p>
                      <button
                        type="button"
                        onClick={handleAbrirNovaGuia}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Visualizar arquivo
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div className="max-w-xs space-y-1">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Arquivo original não disponível na memória
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Ao recarregar a página, o navegador descarta o arquivo local por segurança. Selecione-o novamente para conferência lado a lado.
                      </p>
                    </div>
                    {onSelecionarArquivo && (
                      <button
                        type="button"
                        onClick={() => inputArquivoRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-xs"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Carregar arquivo para conferir
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PAINEL DIREITO: MARKDOWN CONVERTIDO (quando disponível) */}
          {temMarkdown && (modo === 'dividido' || modo === 'markdown') && (
            <div
              className={`flex flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-950/60 min-h-0 ${
                modo === 'dividido' ? 'lg:col-span-6' : 'lg:col-span-12'
              }`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Code2 className="h-4 w-4 text-emerald-500" />
                  Markdown Convertido (GFM)
                </span>
                <span className="text-[11px] text-slate-400">
                  {markdown.length.toLocaleString('pt-BR')} caracteres
                </span>
              </div>

              <div className="flex-1 min-h-0">
                <textarea
                  readOnly
                  value={markdown}
                  className="h-full w-full resize-none rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {temMarkdown ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Pronto para copiar e colar na Análise de Cotações</span>
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span>Arquivo carregado. Clique em converter para processar com IA.</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!temMarkdown && onConverter && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onConverter();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Converter este arquivo agora
              </button>
            )}

            {temMarkdown && onBaixar && (
              <button
                type="button"
                onClick={onBaixar}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar .md
              </button>
            )}

            {temMarkdown && onCopiar && (
              <button
                type="button"
                onClick={onCopiar}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar markdown
              </button>
            )}

            {!temMarkdown && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}
