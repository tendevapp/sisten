/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { localDb } from '../../db/localDb';

export const seenKey = (tourId: string) => `sisten:tour-seen:${tourId}`;

/**
 * Estado de um tour guiado (spotlight) por página. `tourId` isola o
 * "já visto" no localStorage e na conta do usuário no Supabase por página.
 */
export function readSeen(tourId: string): boolean {
  try {
    const local = localStorage.getItem(seenKey(tourId)) === '1';
    if (local) return true;

    // Se o cache local do navegador foi limpo, verifica se a conta do usuário já registrou o tour no Supabase
    const user = localDb.getCurrentUser();
    if (user?.tours_seen?.[tourId]) {
      try { localStorage.setItem(seenKey(tourId), '1'); } catch {}
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export function useTour(tourId: string, stepCount: number) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [seen, setSeen] = useState(() => readSeen(tourId));
  const autoOpened = useRef(false);

  const hasSeenBefore = useCallback(() => readSeen(tourId), [tourId]);

  useEffect(() => {
    if (!seen && readSeen(tourId)) {
      setSeen(true);
    }
  }, [tourId, seen]);

  const markSeen = useCallback(() => {
    try { localStorage.setItem(seenKey(tourId), '1'); } catch {}
    localDb.markTourSeen(tourId).catch(console.error);
    setSeen(true);
  }, [tourId]);

  const open = useCallback(() => {
    setStepIndex(0);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    markSeen();
  }, [markSeen]);

  const next = useCallback(() => {
    setStepIndex(i => {
      if (i + 1 >= stepCount) { close(); return i; }
      return i + 1;
    });
  }, [stepCount, close]);

  const back = useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  /** Abre o tour sozinho na primeira vez, uma única vez por página, quando `ready` vira true. */
  const autoOpenWhenReady = useCallback((ready: boolean) => {
    if (ready && !autoOpened.current && !hasSeenBefore()) {
      autoOpened.current = true;
      markSeen();
      open();
    }
  }, [hasSeenBefore, open, markSeen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close, next, back]);

  return { isOpen, stepIndex, seen, open, close, next, back, autoOpenWhenReady };
}
