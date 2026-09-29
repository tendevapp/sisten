/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "corte a laser": um braço articulado, pendurado no pórtico, corta a
 * chapa de aço. Sozinho, desenha um oito; com o mouse (ou o dedo) por cima da
 * chapa, o corte acompanha o ponteiro. O sulco fica só os últimos pontos e vai
 * "cicatrizando" atrás do laser, para a chapa nunca encher.
 */

import React, { useRef } from 'react';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, pontoNoSvg, useMovimentoReduzido, useQuadros } from './util';

const CHAPA = { x1: 84, y1: 132, x2: 236, y2: 184 };
const ELO = 95;
const ALTURA_CABECA = 18;
const MAX_PONTOS = 240;
const PONTOS_BRASA = 14;

type Ponto = [number, number];

/** Cinemática inversa de dois elos, com o cotovelo sempre dobrado para a direita. */
function resolverBraco(bx: number, by: number, wx: number, wy: number) {
  const dx = wx - bx;
  const dy = wy - by;
  const dist = Math.min(Math.hypot(dx, dy), ELO * 2 - 0.01);
  const ang = Math.atan2(dy, dx);
  const a = Math.acos(limitar((ELO * ELO + dist * dist - ELO * ELO) / (2 * ELO * dist), -1, 1));
  return {
    ex: bx + ELO * Math.cos(ang - a),
    ey: by + ELO * Math.sin(ang - a),
    wx: bx + Math.cos(ang) * dist,
    wy: by + Math.sin(ang) * dist,
  };
}

const trilha = (pts: Ponto[]) => (pts.length < 2 ? '' : `M${pts.map(p => `${n1(p[0])} ${n1(p[1])}`).join(' L')}`);

export default function CorteLaser() {
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const carroRef = useRef<SVGRectElement>(null);
  const baseRef = useRef<SVGCircleElement>(null);
  const bracoRef = useRef<SVGPathElement>(null);
  const cotoveloRef = useRef<SVGCircleElement>(null);
  const cabecaRef = useRef<SVGGElement>(null);
  const feixeRef = useRef<SVGGElement>(null);
  const sulcoRef = useRef<SVGPathElement>(null);
  const brasaRef = useRef<SVGPathElement>(null);

  const e = useRef({
    alvo: { x: 160, y: 158 },
    atual: { x: 160, y: 158 },
    sobre: false, // ponteiro dentro da caixa da cena
    naChapa: false, // ponteiro sobre a chapa
    tempo: 0,
    pts: [] as Ponto[],
  });

  const acordar = useQuadros(dt => {
    const s = e.current;
    const autonomo = !reduzido && !s.sobre;
    s.tempo += dt;

    if (autonomo) {
      s.alvo.x = 160 + 55 * Math.sin(s.tempo * 0.9);
      s.alvo.y = 158 + 20 * Math.sin(s.tempo * 1.8);
    }
    const cortando = autonomo || s.naChapa;

    const k = Math.min(1, dt * 12);
    s.atual.x += (s.alvo.x - s.atual.x) * k;
    s.atual.y += (s.alvo.y - s.atual.y) * k;

    const { x: tx, y: ty } = s.atual;
    const bx = 160 + (tx - 160) * 0.6;
    const by = 16;
    const { ex, ey, wx, wy } = resolverBraco(bx, by, tx, ty - ALTURA_CABECA);

    carroRef.current?.setAttribute('x', n1(bx - 11));
    baseRef.current?.setAttribute('cx', n1(bx));
    bracoRef.current?.setAttribute('d', `M${n1(bx)} ${by} L${n1(ex)} ${n1(ey)} L${n1(wx)} ${n1(wy)}`);
    cotoveloRef.current?.setAttribute('cx', n1(ex));
    cotoveloRef.current?.setAttribute('cy', n1(ey));
    cabecaRef.current?.setAttribute('transform', `translate(${n1(wx)} ${n1(wy + ALTURA_CABECA)})`);
    if (feixeRef.current) feixeRef.current.style.opacity = cortando ? '1' : '0';

    if (cortando) {
      const ultimo = s.pts[s.pts.length - 1];
      if (!ultimo || Math.hypot(tx - ultimo[0], ty - ultimo[1]) > 1.5) {
        s.pts.push([tx, ty]);
        if (s.pts.length > MAX_PONTOS) s.pts.shift();
      }
    }
    sulcoRef.current?.setAttribute('d', trilha(s.pts));
    brasaRef.current?.setAttribute('d', trilha(s.pts.slice(-PONTOS_BRASA)));

    const pertoDoAlvo = Math.hypot(s.alvo.x - s.atual.x, s.alvo.y - s.atual.y) < 0.2;
    return autonomo || s.sobre || !pertoDoAlvo;
  });

  const seguir = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const s = e.current;
    s.sobre = true;
    s.naChapa = p.x >= CHAPA.x1 && p.x <= CHAPA.x2 && p.y >= CHAPA.y1 && p.y <= CHAPA.y2;
    s.alvo.x = limitar(p.x, CHAPA.x1, CHAPA.x2);
    s.alvo.y = limitar(p.y, CHAPA.y1 + 4, CHAPA.y2 - 4);
    acordar();
  };

  const soltar = () => {
    e.current.sobre = false;
    e.current.naChapa = false;
    acordar();
  };

  return (
    <CenaMoldura>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full touch-pan-y"
        onPointerMove={seguir}
        onPointerDown={seguir}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
      >
        {/* Pórtico */}
        <rect x="16" y="8" width="288" height="6" rx="3" className="fill-slate-300 dark:fill-slate-600" />
        <rect x="16" y="8" width="6" height="120" rx="3" className="fill-slate-300 dark:fill-slate-600" />
        <rect x="298" y="8" width="6" height="120" rx="3" className="fill-slate-300 dark:fill-slate-600" />
        <rect ref={carroRef} x="149" y="5" width="22" height="11" rx="3" className="fill-slate-500 dark:fill-slate-400" />

        {/* Chapa de aço: face de cima, espessura e brilho */}
        <rect x={CHAPA.x1} y={CHAPA.y2} width={CHAPA.x2 - CHAPA.x1} height="7" rx="1.5" className="fill-slate-400 dark:fill-slate-700" />
        <rect
          x={CHAPA.x1}
          y={CHAPA.y1}
          width={CHAPA.x2 - CHAPA.x1}
          height={CHAPA.y2 - CHAPA.y1}
          rx="3"
          className="fill-slate-200 stroke-slate-300 dark:fill-slate-600 dark:stroke-slate-500"
        />
        <path d={`M${CHAPA.x1 + 6} ${CHAPA.y1 + 5} H${CHAPA.x2 - 30}`} className="stroke-white/70 dark:stroke-white/15" strokeWidth="2" strokeLinecap="round" />

        {/* Sulco cortado + trecho ainda em brasa */}
        <path ref={sulcoRef} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" className="stroke-slate-700 dark:stroke-slate-950" />
        <path ref={brasaRef} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.5" stroke="#f5821f" strokeOpacity="0.45" />

        {/* Braço articulado */}
        <path ref={bracoRef} d="M160 16 L160 16 L160 16" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" className="stroke-slate-500 dark:stroke-slate-400" />
        <circle ref={baseRef} cx="160" cy="16" r="5" fill="#f5821f" />
        <circle ref={cotoveloRef} cx="200" cy="70" r="4.5" fill="#f5821f" />

        {/* Cabeça de corte: bico, feixe e fagulha */}
        <g ref={cabecaRef} transform="translate(160 158)">
          <rect x="-4.5" y={-ALTURA_CABECA} width="9" height="11" rx="2" className="fill-slate-600 dark:fill-slate-300" />
          <path d="M-4.5 -7 L0 -2 L4.5 -7 Z" className="fill-slate-700 dark:fill-slate-200" />
          <g ref={feixeRef} style={{ transition: 'opacity .15s' }}>
            <line x1="0" y1="-2" x2="0" y2="0" stroke="#ffb066" strokeWidth="2" strokeLinecap="round" />
            <g className="cena-fagulha" style={{ transformOrigin: '0px 0px' }}>
              <circle r="5.5" fill="#f5821f" fillOpacity="0.5" />
              <circle r="2.2" fill="#fff4e0" />
              <path d="M-7 -3 L-3 -1 M7 -3 L3 -1 M-6 4 L-2.5 1.5 M6 4 L2.5 1.5" stroke="#ffb066" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          </g>
        </g>
      </svg>
    </CenaMoldura>
  );
}
