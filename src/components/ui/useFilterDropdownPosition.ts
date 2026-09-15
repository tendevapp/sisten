/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hook para posicionamento e sobreposição de dropdowns e filtros (MultiSelectFilter, DateRangeFilter).
 *
 * Evita que painéis sobrepostos (popups) sejam recortados por recipientes com
 * `overflow-x: auto`, `overflow-hidden` ou trilhas horizontais no mobile.
 *
 * Quando renderizado via React Portal em `document.body`, este hook calcula
 * as coordenadas precisas (`top` / `bottom`, `left`, `width`, `maxHeight`)
 * para manter o painel alinhado ao botão de disparo e dentro dos limites da tela.
 */

import { RefObject, useEffect, useLayoutEffect, useState } from 'react';

export interface DropdownCoords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function useFilterDropdownPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  preferredWidth = 240
): DropdownCoords | null {
  const [coords, setCoords] = useState<DropdownCoords | null>(null);

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (!open || typeof window === 'undefined') {
      setCoords(null);
      return;
    }

    const updateCoords = () => {
      const el = triggerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;

      // Se o elemento saiu totalmente do viewport verticalmente
      if (rect.bottom < 0 || rect.top > viewportHeight) {
        return;
      }

      const spaceBelow = viewportHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

      // Largura: respeita a largura ideal do painel, garantindo que caiba na tela
      const targetWidth = Math.min(viewportWidth - margin * 2, Math.max(rect.width, preferredWidth));
      let left = rect.left;

      if (left + targetWidth > viewportWidth - margin) {
        left = Math.max(margin, viewportWidth - targetWidth - margin);
      }
      if (left < margin) left = margin;

      const maxHeight = Math.max(160, Math.min(openAbove ? spaceAbove : spaceBelow, 360));

      setCoords({
        top: openAbove ? undefined : rect.bottom + 4,
        bottom: openAbove ? viewportHeight - rect.top + 4 : undefined,
        left,
        width: targetWidth,
        maxHeight,
      });
    };

    updateCoords();

    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);

    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [open, triggerRef, preferredWidth]);

  return coords;
}
