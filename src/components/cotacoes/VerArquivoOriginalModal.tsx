/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pré-visualização simples do arquivo original (PDF/imagem) por trás de uma
 * proposta, para conferir o card extraído contra o documento de origem sem
 * sair da tela. Só existe enquanto o `File` segue vivo na memória do
 * navegador (mesma sessão em que o arquivo foi enviado) — não há cópia
 * persistida no servidor.
 */

import React, { useEffect, useMemo } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import Modal, { ModalHeader, ModalBody } from '../ui/Modal';

interface VerArquivoOriginalModalProps {
  nome: string;
  file: File;
  onClose: () => void;
}

export default function VerArquivoOriginalModal({ nome, file, onClose }: VerArquivoOriginalModalProps) {
  const fileUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(fileUrl), [fileUrl]);

  const ehPdf = file.type === 'application/pdf' || nome.toLowerCase().endsWith('.pdf');
  const ehImagem = file.type.startsWith('image/');

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel={`Arquivo original de ${nome}`}>
      <ModalHeader onClose={onClose}>
        <div className="flex flex-wrap items-center justify-between gap-3 pr-2">
          <h3 className="truncate text-sm font-bold text-slate-900 dark:text-slate-50" title={nome}>{nome}</h3>
          <button
            type="button"
            onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir em nova guia
          </button>
        </div>
      </ModalHeader>

      <ModalBody className="p-3 sm:p-4">
        <div className="h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
          {ehPdf ? (
            <iframe src={fileUrl} title={`Leitor PDF de ${nome}`} className="h-full w-full border-0 bg-white dark:bg-slate-900" />
          ) : ehImagem ? (
            <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
              <img src={fileUrl} alt={nome} className="max-h-full max-w-full rounded-lg object-contain shadow-xs" />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-slate-500">
              <FileText className="h-8 w-8 text-slate-400" />
              <p className="text-xs font-medium">Não é possível pré-visualizar este tipo de arquivo aqui.</p>
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
