/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTour } from './useTour';

export interface ActiveTourControls {
  open: () => void;
  seen: boolean;
  isOpen: boolean;
}

interface TourRegistryValue {
  activeTour: ActiveTourControls | null;
  registerTour: (controls: ActiveTourControls | null, prev?: ActiveTourControls) => void;
}

const TourRegistryContext = createContext<TourRegistryValue | null>(null);

/**
 * Gerencia uma pilha LIFO de tours ativos: quando uma sub-tela ou modal abre,
 * seu tour entra no topo da pilha. Ao fechar/desmontar, o tour anterior volta a
 * ser o ativo no botão global de ajuda.
 */
export function TourRegistryProvider({ children }: { children: React.ReactNode }) {
  const [tours, setTours] = useState<ActiveTourControls[]>([]);

  const registerTour = useCallback((controls: ActiveTourControls | null, prev?: ActiveTourControls) => {
    setTours((prevList) => {
      if (!controls) {
        if (prev) {
          return prevList.filter((item) => item !== prev && item.open !== prev.open);
        }
        return prevList.slice(0, -1);
      }
      const filtered = prevList.filter((item) => item.open !== controls.open);
      return [...filtered, controls];
    });
  }, []);

  const activeTour = tours.length > 0 ? tours[tours.length - 1] : null;

  return (
    <TourRegistryContext.Provider value={{ activeTour, registerTour }}>
      {children}
    </TourRegistryContext.Provider>
  );
}

/** Lido pelo FeedbackButton global para saber se a tela atual tem tour a oferecer. */
export function useTourRegistry(): TourRegistryValue {
  const ctx = useContext(TourRegistryContext);
  if (!ctx) throw new Error('useTourRegistry precisa estar dentro de um TourRegistryProvider.');
  return ctx;
}

/**
 * Registra o tour no contexto global. O parâmetro opcional `enabled` (padrão true)
 * permite ativar o tour condicionalmente (ex.: quando um modal de preenchimento está aberto).
 */
export function usePageTour(tourId: string, stepCount: number, enabled: boolean = true) {
  const tour = useTour(tourId, stepCount);
  const { registerTour } = useTourRegistry();

  useEffect(() => {
    if (!enabled) return;
    const controls: ActiveTourControls = { open: tour.open, seen: tour.seen, isOpen: tour.isOpen };
    registerTour(controls);
    return () => registerTour(null, controls);
  }, [registerTour, tour.open, tour.seen, tour.isOpen, enabled]);

  return {
    ...tour,
    startTour: tour.open,
  };
}
