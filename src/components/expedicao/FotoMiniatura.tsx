/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Miniatura (ou versão ampliada) de uma foto de expedição. O bucket é
 * privado, então a imagem só existe atrás de uma URL assinada — resolvida
 * aqui, sob demanda, com o cache em memória de `expedicaoApi.urlFoto`.
 */

import { useEffect, useState } from 'react';
import { ImageOff, Loader2, X } from 'lucide-react';
import type { ExpedicaoFoto } from '../../types';
import { urlFoto } from '../../lib/expedicaoApi';

interface FotoMiniaturaProps {
  foto: ExpedicaoFoto;
  variante?: 'miniatura' | 'ampliada';
  somenteLeitura?: boolean;
  onAmpliar?: () => void;
  onExcluir?: () => void;
}

export default function FotoMiniatura({
  foto, variante = 'miniatura', somenteLeitura, onAmpliar, onExcluir,
}: FotoMiniaturaProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    urlFoto(foto.storage_path)
      .then(u => { if (ativo) { setUrl(u); setErro(!u); } })
      .catch(() => { if (ativo) setErro(true); });
    return () => { ativo = false; };
  }, [foto.storage_path]);

  if (variante === 'ampliada') {
    return (
      <div className="flex max-h-[70vh] min-h-[240px] items-center justify-center">
        {url ? (
          <img src={url} alt={foto.nome_arquivo || 'Foto da expedição'} className="max-h-[70vh] w-auto object-contain" />
        ) : (
          <span className="text-slate-500">
            {erro ? <ImageOff className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="group relative h-16 w-16 shrink-0">
      <button
        type="button"
        onClick={onAmpliar}
        className="h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition-colors hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800"
      >
        {url ? (
          <img src={url} alt={foto.nome_arquivo || 'Foto da expedição'} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-400">
            {erro ? <ImageOff className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          </span>
        )}
      </button>

      {/* Sempre visível no toque (não há hover no celular), discreto no desktop. */}
      {!somenteLeitura && onExcluir && (
        <button
          type="button"
          onClick={onExcluir}
          aria-label="Excluir foto"
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition-opacity hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        >
          <X className="h-3 w-3" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
