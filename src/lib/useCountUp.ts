/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Anima um número de 0 até `value` na montagem, e do valor anterior até o novo
 * quando os filtros mudam.
 *
 * Sob movimento reduzido, ou quando o alvo não é finito, devolve o valor final
 * de imediato — a animação nunca é a única forma de o número aparecer.
 *
 * Sempre exiba o resultado com a classe `.tabular`: sem largura fixa de
 * algarismo o número muda de largura a cada quadro e o card treme.
 */
export function useCountUp(value: number, duration = 650): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || !Number.isFinite(value)) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    if (from === value) return;

    const start = performance.now();
    // easeOutCubic: chega rápido perto do valor real e assenta, em vez de
    // arrastar linearmente até o fim.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(from + (value - from) * ease(t));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      // Sem isto, uma troca de filtro no meio da animação recomeçaria a
      // contagem do valor parcial exibido e a próxima transição sairia torta.
      fromRef.current = value;
    };
  }, [value, duration, reduced]);

  return display;
}
