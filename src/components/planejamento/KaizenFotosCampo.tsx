/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fotos de um bloco do Kaizen: câmera (traseira) ou galeria. Guarda o
 * arquivo cru só para a prévia — a compressão acontece no envio, em
 * `planKaizenApi` (comprimirImagemUpload), antes de subir ao Storage.
 */

import React, { useEffect, useRef } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

export interface FotoLocal {
  id: string;
  file: File;
  previewUrl: string;
}

interface Props {
  value: FotoLocal[];
  onChange: (fotos: FotoLocal[]) => void;
  max?: number;
  disabled?: boolean;
}

export function novaFotoLocal(file: File): FotoLocal {
  return { id: Math.random().toString(36).slice(2, 10), file, previewUrl: URL.createObjectURL(file) };
}

export default function KaizenFotosCampo({ value, onChange, max = 4, disabled = false }: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galeriaRef = useRef<HTMLInputElement | null>(null);

  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => () => valueRef.current.forEach(f => URL.revokeObjectURL(f.previewUrl)), []);

  const cheio = value.length >= max;

  const adicionar = (lista: FileList | null) => {
    if (!lista) return;
    const novas = Array.from(lista)
      .filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
      .slice(0, max - value.length)
      .map(novaFotoLocal);
    if (novas.length) onChange([...value, ...novas]);
  };

  const remover = (id: string) => {
    const alvo = value.find(f => f.id === id);
    if (alvo) URL.revokeObjectURL(alvo.previewUrl);
    onChange(value.filter(f => f.id !== id));
  };

  const botao =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={botao} disabled={disabled || cheio} onClick={() => cameraRef.current?.click()}>
          <Camera className="h-3.5 w-3.5" /> Tirar foto
        </button>
        <button type="button" className={botao} disabled={disabled || cheio} onClick={() => galeriaRef.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5" /> Galeria
        </button>
        <span className="text-[11px] text-slate-400">
          {value.length}/{max} fotos
        </span>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          adicionar(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          adicionar(e.target.files);
          e.target.value = '';
        }}
      />

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(foto => (
            <div key={foto.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <img src={foto.previewUrl} alt={foto.file.name} className="h-full w-full object-cover" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remover(foto.id)}
                  aria-label="Remover foto"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
