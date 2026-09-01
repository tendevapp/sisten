/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Campo de múltiplas imagens: aceita colar da área de transferência (clique na
 * área para focá-la e tecle Ctrl+V), escolher um ou vários arquivos, ou
 * arrastar-e-soltar. Cada imagem passa pela compressão de `prepareAttachment`
 * (canvas, sem lib) antes de entrar na lista.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Loader2, ClipboardPaste } from 'lucide-react';
import { prepareAttachment, AnexoInvalidoError, type PreparedAttachment } from '../../lib/imageCompression';

interface ImagesPasteInputProps {
  value: PreparedAttachment[];
  onChange: (value: PreparedAttachment[]) => void;
  /** Texto de ajuda opcional exibido abaixo da área. */
  hint?: string;
  /** Teto de imagens (padrão 8). */
  max?: number;
}

function formatarKB(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;
}

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
    const imagens = arquivos.filter(f => f.type.startsWith('image/'));
    if (imagens.length === 0) return;

    setErro(null);
    setProcessando(true);
    try {
      const restante = Math.max(0, max - valueRef.current.length);
      const aProcessar = imagens.slice(0, restante);
      if (aProcessar.length < imagens.length) {
        setErro(`Máximo de ${max} imagens — as demais foram ignoradas.`);
      }
      const preparados = await Promise.all(aProcessar.map(f => prepareAttachment(f)));
      onChange([...valueRef.current, ...preparados]);
    } catch (e) {
      setErro(e instanceof AnexoInvalidoError ? e.message : 'Não foi possível processar a imagem.');
    } finally {
      setProcessando(false);
    }
  }, [max, onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const arquivos = Array.from(e.clipboardData.items)
      .filter(i => i.type.startsWith('image/'))
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
          {value.map((img, idx) => (
            <div
              key={idx}
              className="relative rounded-lg border overflow-hidden group"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
            >
              <img src={img.previewUrl} alt={`Imagem ${idx + 1}`} className="h-28 w-full object-cover" />
              <button
                type="button"
                onClick={() => remover(idx)}
                title="Remover imagem"
                className="absolute top-1 right-1 rounded-full p-1 bg-black/55 text-white cursor-pointer hover:bg-black/75"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span
                className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 text-[10px] truncate"
                style={{ background: 'color-mix(in srgb, var(--surface-card) 88%, transparent)', color: 'var(--ink-muted)' }}
              >
                {formatarKB(img.sizeCompressed)}
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
              <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>Comprimindo imagem...</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6" style={{ color: 'var(--ink-muted)' }} />
              <span className="text-[12px] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--ink-secondary)' }}>
                <ClipboardPaste className="h-3.5 w-3.5" />
                Clique aqui e cole com Ctrl+V
              </span>
              <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                arraste imagens, ou{' '}
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
        accept="image/*"
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
