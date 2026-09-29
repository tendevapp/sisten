/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças comuns das cenas animadas da tela Início: moldura, laço de animação,
 * detecção de movimento reduzido e conversão de ponteiro para o espaço do SVG.
 */

import React, { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';

/** Espaço de desenho das cenas novas (proporção 8:5). */
export const CENA_L = 320;
export const CENA_A = 200;

/** Caixa da cena: decoração, fora da árvore de acessibilidade, sem seleção de texto. */
export function CenaMoldura({ children }: { children?: React.ReactNode }) {
  return (
    <div className="home-cena relative aspect-[8/5] w-40 shrink-0 select-none sm:-my-3 sm:w-72" aria-hidden="true">
      {children}
    </div>
  );
}

const CONSULTA_MOVIMENTO = '(prefers-reduced-motion: reduce)';

/** `true` quando a pessoa pediu menos movimento ao sistema operacional. */
export function useMovimentoReduzido(): boolean {
  return useSyncExternalStore(
    aviso => {
      const m = window.matchMedia?.(CONSULTA_MOVIMENTO);
      m?.addEventListener('change', aviso);
      return () => m?.removeEventListener('change', aviso);
    },
    () => window.matchMedia?.(CONSULTA_MOVIMENTO).matches ?? false,
    () => false,
  );
}

/** Id seguro para `url(#id)` (o `useId` do React traz dois-pontos). */
export function useIdSvg(prefixo: string): string {
  return `${prefixo}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/**
 * Laço de animação sob demanda. `passo(dt)` recebe os segundos desde o quadro
 * anterior e devolve `true` para continuar ou `false` para dormir. Devolve
 * `acordar()`, que religa o laço (chamar quando algo pedir movimento de novo).
 * O primeiro quadro sai já na montagem, então uma cena parada ainda se desenha.
 */
export function useQuadros(passo: (dt: number) => boolean): () => void {
  const passoRef = useRef(passo);
  passoRef.current = passo;
  const rafRef = useRef(0);
  const ultimoRef = useRef(0);
  const vivoRef = useRef(true);

  const acordar = useCallback(() => {
    if (rafRef.current || !vivoRef.current) return;
    ultimoRef.current = performance.now();
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, Math.max(0, (agora - ultimoRef.current) / 1000));
      ultimoRef.current = agora;
      rafRef.current = 0;
      if (passoRef.current(dt)) rafRef.current = requestAnimationFrame(quadro);
    };
    rafRef.current = requestAnimationFrame(quadro);
  }, []);

  useEffect(() => {
    vivoRef.current = true;
    acordar();
    return () => {
      vivoRef.current = false;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [acordar]);

  return acordar;
}

/** Converte a posição do ponteiro (tela) para unidades do viewBox do SVG. */
export function pontoNoSvg(svg: SVGSVGElement, e: { clientX: number; clientY: number }): { x: number; y: number } | null {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

export const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Números curtos nos atributos do SVG (uma casa decimal basta). */
export const n1 = (v: number) => v.toFixed(1);

/** Pá de rotor: perfil afilado saindo do cubo em (0,0). Mesmo desenho da torre eólica. */
export const PA_ROTOR = 'M0,-5.2 C 13,-9 33,-8.5 46,-2.2 C 46,-0.6 46,0.6 46,2.2 C 33,3.4 13,3.6 0,5.2 Z';
