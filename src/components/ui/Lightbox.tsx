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
import { Check, ChevronLeft, ChevronRight, Copy, X } from 'lucide-react';
import { copiarImagemParaAreaDeTransferencia } from '../../lib/copiarImagem';

export interface LightboxImagem {
  url: string;
  legenda?: string;
}

export interface LightboxOpcoes {
  /** Mostra o botão "Copiar imagem" (área de transferência, como PNG). */
  copiar?: boolean;
}

function Lightbox({
  imagens, indice, onIndice, onClose, copiar = false,
}: {
  imagens: LightboxImagem[];
  indice: number;
  onIndice: (i: number) => void;
  onClose: () => void;
  copiar?: boolean;
}) {
  const total = imagens.length;
  const [copia, setCopia] = useState<'idle' | 'copiando' | 'ok' | 'erro'>('idle');
  useEffect(() => { setCopia('idle'); }, [indice]);
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

  const copiarAtual = async () => {
    setCopia('copiando');
    try {
      await copiarImagemParaAreaDeTransferencia(atual.url);
      setCopia('ok');
    } catch (err) {
      console.error('Falha ao copiar imagem:', err);
      setCopia('erro');
    }
  };

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
        {copiar && (
          <button
            onClick={copiarAtual}
            disabled={copia === 'copiando'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              copia === 'ok' ? 'bg-emerald-500/20 text-emerald-300' : copia === 'erro' ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {copia === 'ok' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copia === 'ok' ? 'Copiada!' : copia === 'erro' ? 'Não foi possível copiar' : copia === 'copiando' ? 'Copiando...' : 'Copiar imagem'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Estado + elemento do visualizador. Coloque `{lightbox.elemento}` na árvore
 * e chame `lightbox.abrir(imagens, indice)` no clique de uma miniatura.
 */
export function useLightbox() {
  const [estado, setEstado] = useState<{ imagens: LightboxImagem[]; indice: number; opcoes?: LightboxOpcoes } | null>(null);

  const abrir = useCallback((imagens: (LightboxImagem | string)[], indice = 0, opcoes?: LightboxOpcoes) => {
    const norm = imagens
      .map((x) => (typeof x === 'string' ? { url: x } : x))
      .filter((x) => !!x.url);
    if (norm.length) setEstado({ imagens: norm, indice: Math.min(Math.max(0, indice), norm.length - 1), opcoes });
  }, []);

  const fechar = useCallback(() => setEstado(null), []);

  const elemento = estado ? (
    <Lightbox
      imagens={estado.imagens}
      indice={estado.indice}
      onIndice={(i) => setEstado((e) => (e ? { ...e, indice: i } : e))}
      onClose={fechar}
      copiar={estado.opcoes?.copiar}
    />
  ) : null;

  return { abrir, fechar, elemento };
}

export default Lightbox;
