/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Captura de fotos do lançamento — mesmo padrão de `GaleriaFotos` do
 * Recebimento do Almoxarifado, com carimbo de data/hora
 * (`prepararFotoCarimbada`, regra 1 do CLAUDE.md: nada sobe cru).
 */

import React from 'react';
import { Camera, X } from 'lucide-react';
import { prepararFotoCarimbada } from '../../lib/carimboFoto';
import { AnexoInvalidoError, ACCEPT_ANEXO, type PreparedAttachment } from '../../lib/imageCompression';
import { useToast } from '../ui/Toast';

interface Props {
  arquivos: PreparedAttachment[];
  setArquivos: React.Dispatch<React.SetStateAction<PreparedAttachment[]>>;
  max?: number;
}

export default function GaleriaFotosProducao({ arquivos, setArquivos, max = 6 }: Props) {
  const toast = useToast();

  const anexar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const restante = max - arquivos.length;
    if (restante <= 0) {
      toast.error(`Máximo de ${max} fotos.`);
      return;
    }
    for (const file of Array.from(lista).slice(0, restante)) {
      try {
        const preparado = await prepararFotoCarimbada(file);
        setArquivos(a => [...a, preparado]);
      } catch (err) {
        toast.error(err instanceof AnexoInvalidoError ? err.message : 'Não foi possível anexar a foto.');
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {arquivos.map((a, i) => (
        <div key={i} className="relative">
          <img
            src={a.previewUrl}
            alt={a.name}
            className="h-16 w-16 rounded-lg border object-cover"
            style={{ borderColor: 'var(--hairline)' }}
          />
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(a.previewUrl);
              setArquivos(x => x.filter((_, j) => j !== i));
            }}
            className="absolute -right-1.5 -top-1.5 cursor-pointer rounded-full bg-rose-500 p-0.5 text-white"
            aria-label="Remover foto"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {arquivos.length < max && (
        <label
          className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed hover:opacity-70"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <Camera className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
          <input
            type="file"
            accept={ACCEPT_ANEXO}
            capture="environment"
            multiple
            hidden
            onChange={e => {
              void anexar(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}
