/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import type { TourStep } from './types';

interface TourSpotlightProps {
  steps: TourStep[];
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}

const PAD = 8;
const MARGIN = 16;
const CARD_WIDTH = 340;
const FALLBACK_HEIGHT = 200;

type Rect = { top: number; left: number; width: number; height: number };

function rectsEqual(a: Rect | null, b: Rect | null) {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

/**
 * Motor genérico de tour guiado: escurece a tela, recorta um "spotlight"
 * sobre o elemento marcado com data-tour="<step.target>" e mostra um card
 * explicativo ao lado, reposicionando conforme o espaço da viewport.
 *
 * O spotlight roda um loop de rAF (não listeners de scroll/resize) para
 * acompanhar a posição do alvo mesmo durante o scroll suave do
 * scrollIntoView — mais simples e sempre correto do que tentar sincronizar
 * eventos de scroll com a animação do navegador.
 */
export default function TourSpotlight({ steps, stepIndex, onNext, onBack, onClose }: TourSpotlightProps) {
  const step = steps[stepIndex];
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: FALLBACK_HEIGHT });

  // Rola até o alvo assim que o passo muda.
  useEffect(() => {
    if (!step.target) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [step.target]);

  // Acompanha a posição do alvo continuamente (cobre scroll, resize, animações da própria página).
  useEffect(() => {
    if (!step.target) { setTargetRect(null); return; }
    let raf = 0;
    const tick = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      setTargetRect(prev => (rectsEqual(prev, next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step.target]);

  // Mede o card real após cada render para posicionar com precisão.
  // Sem guarda de igualdade, todo render dispararia um novo objeto de estado,
  // reexecutando este efeito indefinidamente (loop infinito de setState).
  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const { width, height } = cardRef.current.getBoundingClientRect();
    if (!width || !height) return;
    setCardSize(prev => (
      Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
        ? prev
        : { width, height }
    ));
  });

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hasTarget = !!step.target && !!targetRect;

  const cardPos = (() => {
    if (!hasTarget || !targetRect) {
      return { top: vh / 2 - cardSize.height / 2, left: vw / 2 - cardSize.width / 2 };
    }
    const r = targetRect;
    const spaceBelow = vh - (r.top + r.height + PAD);
    const spaceAbove = r.top - PAD;
    const spaceRight = vw - (r.left + r.width + PAD);
    const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - cardSize.width - MARGIN);
    const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - cardSize.height - MARGIN);

    if (spaceBelow >= cardSize.height + MARGIN) {
      return { top: clampY(r.top + r.height + PAD + MARGIN), left: clampX(r.left + r.width / 2 - cardSize.width / 2) };
    }
    if (spaceAbove >= cardSize.height + MARGIN) {
      return { top: clampY(r.top - PAD - MARGIN - cardSize.height), left: clampX(r.left + r.width / 2 - cardSize.width / 2) };
    }
    if (spaceRight >= cardSize.width + MARGIN) {
      return { top: clampY(r.top + r.height / 2 - cardSize.height / 2), left: clampX(r.left + r.width + PAD + MARGIN) };
    }
    return { top: clampY(r.top + r.height / 2 - cardSize.height / 2), left: clampX(r.left - PAD - MARGIN - cardSize.width) };
  })();

  const Icon = step.icon;
  const isLast = stepIndex === steps.length - 1;

  return (
    <>
      {/* Camada que escurece tudo e captura clique-fora (equivale a "Pular"). */}
      <div className="fixed inset-0 z-[100]" onClick={onClose} aria-hidden="true" />

      {/* Recorte do spotlight sobre o elemento alvo. */}
      <motion.div
        className="fixed z-[101] pointer-events-none rounded-xl"
        animate={{
          top: hasTarget && targetRect ? targetRect.top - PAD : vh / 2,
          left: hasTarget && targetRect ? targetRect.left - PAD : vw / 2,
          width: hasTarget && targetRect ? targetRect.width + PAD * 2 : 0,
          height: hasTarget && targetRect ? targetRect.height + PAD * 2 : 0,
          opacity: hasTarget ? 1 : 0,
          boxShadow: '0 0 0 9999px rgba(2,6,23,0.72), 0 0 0 2px rgba(16,185,129,0.9), 0 0 32px 4px rgba(16,185,129,0.35)',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />
      {/* Sem alvo: só escurece a tela por igual. */}
      {!hasTarget && (
        <div className="fixed inset-0 z-[101] pointer-events-none bg-slate-950/72" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          ref={cardRef}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1, top: cardPos.top, left: cardPos.left }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-label={step.title}
          style={{ width: CARD_WIDTH }}
          className="fixed z-[102] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Passo {stepIndex + 1} de {steps.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar tour"
              className="shrink-0 rounded-lg p-1 -m-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{step.title}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{step.description}</p>

          <div className="flex items-center justify-center gap-1.5 mt-4">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === stepIndex ? 'w-5 bg-emerald-500' : 'w-1.5 bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-4">
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Pular tour
            </button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                </button>
              )}
              <button
                type="button"
                onClick={onNext}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
              >
                {isLast ? 'Concluir' : 'Próximo'} {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
