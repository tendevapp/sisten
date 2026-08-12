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
  registerTour: (controls: ActiveTourControls | null) => void;
}

const TourRegistryContext = createContext<TourRegistryValue | null>(null);

/**
 * Só uma página tem tour montado por vez (a rota atual), então "o tour ativo"
 * é sempre o último registrado — sem precisar indexar por página.
 */
export function TourRegistryProvider({ children }: { children: React.ReactNode }) {
  const [activeTour, setActiveTour] = useState<ActiveTourControls | null>(null);
  const registerTour = useCallback((controls: ActiveTourControls | null) => {
    setActiveTour(controls);
  }, []);

  return (
    <TourRegistryContext.Provider value={{ activeTour, registerTour }}>
      {children}
    </TourRegistryContext.Provider>
  );
}

/** Lido pelo FeedbackButton global para saber se a página atual tem tour a oferecer. */
export function useTourRegistry(): TourRegistryValue {
  const ctx = useContext(TourRegistryContext);
  if (!ctx) throw new Error('useTourRegistry precisa estar dentro de um TourRegistryProvider.');
  return ctx;
}

/**
 * Substitui `useTour` + `<HelpButton>` renderizado localmente: a página
 * continua dona do `useTour`/`<TourSpotlight>`, só o botão flutuante virou
 * global (FeedbackButton). Registra `{ open, seen }` no mount, limpa no unmount.
 */
export function usePageTour(tourId: string, stepCount: number) {
  const tour = useTour(tourId, stepCount);
  const { registerTour } = useTourRegistry();

  useEffect(() => {
    registerTour({ open: tour.open, seen: tour.seen, isOpen: tour.isOpen });
    return () => registerTour(null);
  }, [registerTour, tour.open, tour.seen, tour.isOpen]);

  return tour;
}
