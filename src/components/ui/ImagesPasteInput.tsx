/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Campo de múltiplos anexos — imagens e PDFs: aceita colar da área de
 * transferência (clique na área para focá-la e tecle Ctrl+V), escolher um ou
 * vários arquivos, ou arrastar-e-soltar.
 *
 * Tudo passa por `prepareAttachment`: imagem é comprimida (canvas, sem lib) e
 * PDF vai como está — nota fiscal e pedido chegam em PDF do fornecedor, e
 * exigir print da tela do PDF só piorava a evidência que o Suprimentos recebe.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FilePlus2, FileText, X, Loader2, ClipboardPaste } from 'lucide-react';
import {
  prepareAttachment, AnexoInvalidoError, ACCEPT_ANEXO, type PreparedAttachment,
} from '../../lib/imageCompression';

interface ImagesPasteInputProps {
  value: PreparedAttachment[];
  onChange: (value: PreparedAttachment[]) => void;
  /** Texto de ajuda opcional exibido abaixo da área. */
  hint?: string;
  /** Teto de anexos (padrão 8). */
  max?: number;
}

function formatarKB(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;
}

const ehPdf = (anexo: PreparedAttachment) => anexo.mimeType === 'application/pdf';

/** Tipos que o campo aceita — os mesmos que `prepareAttachment` sabe tratar. */
const aceito = (f: { type: string }) => f.type.startsWith('image/') || f.type === 'application/pdf';

export default function ImagesPasteInput({ value, onChange, hint, max = 8 }: ImagesPasteInputProps) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Guarda a lista atual para revogar os object URLs ao desmontar.
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => () => {
    valueRef.current.forEach(v => v.previewUrl && URL.revokeObjectURL(v.previewUrl));
  }, []);

  const cheio = value.length >= max;

  const adicionarArquivos = useCallback(async (arquivos: File[]) => {
    const validos = arquivos.filter(aceito);
    if (validos.length === 0) {
      if (arquivos.length > 0) setErro('Formato não aceito. Envie imagens ou PDF.');
      return;
    }

    setErro(null);
    setProcessando(true);
    try {
      const restante = Math.max(0, max - valueRef.current.length);
      const aProcessar = validos.slice(0, restante);
      if (aProcessar.length < validos.length) {
        setErro(`Máximo de ${max} anexos — os demais foram ignorados.`);
      }
      const preparados = await Promise.all(aProcessar.map(f => prepareAttachment(f)));
      onChange([...valueRef.current, ...preparados]);
    } catch (e) {
      setErro(e instanceof AnexoInvalidoError ? e.message : 'Não foi possível processar o arquivo.');
    } finally {
      setProcessando(false);
    }
  }, [max, onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const arquivos = Array.from(e.clipboardData.items)
      .filter(aceito)
      .map(i => i.getAsFile())
      .filter((f): f is File => f !== null)
      .map(f => (f.name && f.name !== 'image.png'
        ? f
        : new File([f], `imagem-colada-${Date.now()}.${f.type.split('/')[1] || 'png'}`, { type: f.type })));
    if (arquivos.length === 0) return;
    e.preventDefault();
    adicionarArquivos(arquivos);
  }, [adicionarArquivos]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    adicionarArquivos(Array.from(e.dataTransfer.files));
  }, [adicionarArquivos]);

  const remover = (idx: number) => {
    const alvo = value[idx];
    if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl);
    onChange(value.filter((_, i) => i !== idx));
    setErro(null);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {value.map((anexo, idx) => (
            <div
              key={idx}
              className="relative rounded-lg border overflow-hidden group"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
            >
              {ehPdf(anexo) ? (
                <a
                  href={anexo.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={`Abrir ${anexo.name}`}
                  className="flex h-28 w-full flex-col items-center justify-center gap-1 px-2 text-center"
                >
                  <FileText className="h-7 w-7" style={{ color: 'var(--status-critical)' }} />
                  <span className="text-[10px] font-semibold line-clamp-2 break-all" style={{ color: 'var(--ink-secondary)' }}>
                    {anexo.name}
                  </span>
                </a>
              ) : (
                <img src={anexo.previewUrl} alt={anexo.name || `Imagem ${idx + 1}`} className="h-28 w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => remover(idx)}
                title="Remover anexo"
                className="absolute top-1 right-1 rounded-full p-1 bg-black/55 text-white cursor-pointer hover:bg-black/75"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span
                className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 text-[10px] truncate"
                style={{ background: 'color-mix(in srgb, var(--surface-card) 88%, transparent)', color: 'var(--ink-muted)' }}
              >
                {ehPdf(anexo) ? 'PDF · ' : ''}{formatarKB(anexo.sizeCompressed)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!cheio && (
        <div
          ref={areaRef}
          tabIndex={0}
          role="button"
          onPaste={handlePaste}
          onClick={() => areaRef.current?.focus()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-7 px-4 text-center transition-colors focus:outline-2 focus:outline-offset-2"
          style={{
            borderColor: dragOver ? 'var(--brand)' : 'var(--hairline)',
            background: dragOver ? 'var(--brand-wash)' : 'var(--surface-card)',
            outlineColor: 'var(--brand)',
          }}
        >
          {processando ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--ink-muted)' }} />
              <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>Preparando anexo...</span>
            </>
          ) : (
            <>
              <FilePlus2 className="h-6 w-6" style={{ color: 'var(--ink-muted)' }} />
              <span className="text-[12px] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--ink-secondary)' }}>
                <ClipboardPaste className="h-3.5 w-3.5" />
                Clique aqui e cole com Ctrl+V
              </span>
              <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                arraste imagens ou PDFs, ou{' '}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  className="font-bold underline cursor-pointer"
                  style={{ color: 'var(--brand)' }}
                >
                  escolha arquivos
                </button>
              </span>
              {value.length > 0 && (
                <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  {value.length}/{max} adicionadas
                </span>
              )}
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ANEXO}
        multiple
        className="hidden"
        onChange={(e) => {
          adicionarArquivos(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />

      {erro && (
        <p className="text-[11px]" style={{ color: 'var(--status-critical)' }}>{erro}</p>
      )}
      {hint && !erro && (
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{hint}</p>
      )}
    </div>
  );
}
