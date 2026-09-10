/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visualizador de imagens do SISTEN — SEMPRE dentro do app, nunca em outra aba.
 *
 * Padrão: onde antes havia `<a target="_blank">` numa miniatura, use o hook
 * `useLightbox()` — ele devolve `abrir(imagens, indice)` e o `elemento` a
 * renderizar. O overlay cobre a tela inteira (acima de qualquer Modal), com
 * navegação por teclado (Esc / ← / →), contador e legenda.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface LightboxImagem {
  url: string;
  legenda?: string;
}

function Lightbox({
  imagens, indice, onIndice, onClose,
}: {
  imagens: LightboxImagem[];
  indice: number;
  onIndice: (i: number) => void;
  onClose: () => void;
}) {
  const total = imagens.length;
  const ir = useCallback((delta: number) => onIndice((indice + delta + total) % total), [indice, total, onIndice]);

  useEffect(() => {
    // Captura, para o Esc fechar só o visualizador — não o Modal por baixo.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowRight' && total > 1) ir(1);
      else if (e.key === 'ArrowLeft' && total > 1) ir(-1);
    };
    window.addEventListener('keydown', onKey, true);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflowAnterior;
    };
  }, [ir, onClose, total]);

  const atual = imagens[indice];
  if (!atual) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center p-4 sm:p-10"
      style={{ background: 'rgb(0 0 0 / 0.86)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de imagem"
    >
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
      >
        <X className="h-5 w-5" />
      </button>

      {total > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); ir(-1); }}
            aria-label="Anterior"
            className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); ir(1); }}
            aria-label="Próxima"
            className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <img
        src={atual.url}
        alt={atual.legenda || 'imagem'}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />

      <div className="mt-3 flex items-center gap-3 text-xs text-white/80" onClick={(e) => e.stopPropagation()}>
        {total > 1 && <span className="tabular-nums">{indice + 1} / {total}</span>}
        {atual.legenda && <span className="max-w-[70vw] truncate">{atual.legenda}</span>}
      </div>
    </div>
  );
}

/**
 * Estado + elemento do visualizador. Coloque `{lightbox.elemento}` na árvore
 * e chame `lightbox.abrir(imagens, indice)` no clique de uma miniatura.
 */
export function useLightbox() {
  const [estado, setEstado] = useState<{ imagens: LightboxImagem[]; indice: number } | null>(null);

  const abrir = useCallback((imagens: (LightboxImagem | string)[], indice = 0) => {
    const norm = imagens
      .map((x) => (typeof x === 'string' ? { url: x } : x))
      .filter((x) => !!x.url);
    if (norm.length) setEstado({ imagens: norm, indice: Math.min(Math.max(0, indice), norm.length - 1) });
  }, []);

  const fechar = useCallback(() => setEstado(null), []);

  const elemento = estado ? (
    <Lightbox
      imagens={estado.imagens}
      indice={estado.indice}
      onIndice={(i) => setEstado((e) => (e ? { ...e, indice: i } : e))}
      onClose={fechar}
    />
  ) : null;

  return { abrir, fechar, elemento };
}

export default Lightbox;
