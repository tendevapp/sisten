/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "solda": duas chapas encostadas e um maçarico que corre pela junta.
 * Sozinho, vai e volta; com o mouse (ou o dedo) por cima, ele segue o ponteiro.
 * O cordão nasce em brasa e esfria até virar aço; as faíscas saem em arco,
 * caem com gravidade e quicam no chão (pool fixo, reaproveitado).
 */

import React, { useRef } from 'react';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, pontoNoSvg, useMovimentoReduzido, useQuadros } from './util';

const CHAO = 188;
const JUNTA_Y = 140;
const X_MIN = 60;
const X_MAX = 260;
const MAX_PONTOS = 200;
const PONTOS_QUENTES = 22;
const N_FAISCAS = 36;
const GRAVIDADE = 620;
const CADENCIA = 70; // faíscas por segundo

type Ponto = [number, number];
interface Faisca {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number; // segundos restantes; <= 0 = livre
  quiques: number;
}

const trilha = (pts: Ponto[]) => (pts.length < 2 ? '' : `M${pts.map(p => `${n1(p[0])} ${n1(p[1])}`).join(' L')}`);

export default function SoldaFaiscas() {
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const macaricoRef = useRef<SVGGElement>(null);
  const chamaRef = useRef<SVGGElement>(null);
  const cordaoRef = useRef<SVGPathElement>(null);
  const brasaRef = useRef<SVGPathElement>(null);
  const faiscaRefs = useRef<(SVGCircleElement | null)[]>([]);

  const e = useRef({
    x: 100,
    alvo: 100,
    sobre: false,
    tempo: 0,
    resto: 0, // fração de faísca acumulada entre quadros
    pts: [] as Ponto[],
    faiscas: Array.from({ length: N_FAISCAS }, (): Faisca => ({ x: 0, y: 0, vx: 0, vy: 0, vida: 0, quiques: 0 })),
  });

  const acordar = useQuadros(dt => {
    const s = e.current;
    const autonomo = !reduzido && !s.sobre;
    s.tempo += dt;
    if (autonomo) s.alvo = 160 + 88 * Math.sin(s.tempo * 0.55);

    const antes = s.x;
    s.x += (s.alvo - s.x) * Math.min(1, dt * 9);
    const soldando = autonomo || s.sobre;

    macaricoRef.current?.setAttribute('transform', `translate(${n1(s.x)} ${JUNTA_Y})`);
    if (chamaRef.current) chamaRef.current.style.opacity = soldando ? '1' : '0';

    if (soldando) {
      const ultimo = s.pts[s.pts.length - 1];
      if (!ultimo || Math.abs(s.x - ultimo[0]) > 1.4) {
        // O cordão é uma linha só: se o maçarico volta, o trecho novo cobre o velho.
        s.pts.push([s.x, JUNTA_Y]);
        if (s.pts.length > MAX_PONTOS) s.pts.shift();
      }

      // Faíscas: mais quando o maçarico anda rápido; sempre um mínimo.
      s.resto += (CADENCIA * 0.6 + Math.min(Math.abs(s.x - antes) / Math.max(dt, 0.001), 220) * 0.2) * dt;
      while (s.resto >= 1) {
        s.resto -= 1;
        const f = s.faiscas.find(q => q.vida <= 0);
        if (!f) break;
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const v = 90 + Math.random() * 170;
        f.x = s.x;
        f.y = JUNTA_Y - 2;
        f.vx = Math.cos(ang) * v;
        f.vy = Math.sin(ang) * v;
        f.vida = 1.3;
        f.quiques = 0;
      }
    } else {
      s.resto = 0;
    }

    let viva = false;
    s.faiscas.forEach((f, i) => {
      const el = faiscaRefs.current[i];
      if (f.vida > 0) {
        f.vida -= dt;
        f.vy += GRAVIDADE * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.y >= CHAO - 1) {
          f.y = CHAO - 1;
          f.vy = -f.vy * 0.42;
          f.vx *= 0.7;
          f.quiques += 1;
          if (f.quiques > 2) f.vida = 0;
        }
        viva = viva || f.vida > 0;
      }
      if (!el) return;
      if (f.vida > 0) {
        el.setAttribute('cx', n1(f.x));
        el.setAttribute('cy', n1(f.y));
        el.style.opacity = String(limitar(f.vida / 0.5, 0, 1));
      } else {
        el.style.opacity = '0';
      }
    });

    cordaoRef.current?.setAttribute('d', trilha(s.pts));
    brasaRef.current?.setAttribute('d', trilha(s.pts.slice(-PONTOS_QUENTES)));

    // O cordão esfria sozinho quando ninguém solda: some devagar da ponta mais velha.
    if (!soldando && s.pts.length > 0 && s.tempo % 0.05 < dt) s.pts.shift();

    return soldando || viva || s.pts.length > 0 || Math.abs(s.alvo - s.x) > 0.3;
  });

  const seguir = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const s = e.current;
    s.sobre = true;
    s.alvo = limitar(p.x, X_MIN, X_MAX);
    acordar();
  };
  const soltar = () => {
    e.current.sobre = false;
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
        {/* Chão */}
        <rect x="0" y={CHAO} width={CENA_L} height="12" className="fill-slate-200 dark:fill-slate-800" />

        {/* Mesa de solda: pés e duas chapas com a junta no meio */}
        <rect x="70" y="164" width="8" height={CHAO - 164} rx="2" className="fill-slate-400 dark:fill-slate-600" />
        <rect x="242" y="164" width="8" height={CHAO - 164} rx="2" className="fill-slate-400 dark:fill-slate-600" />
        <rect x="46" y="112" width="228" height={JUNTA_Y - 112} rx="3" className="fill-slate-300 stroke-slate-400 dark:fill-slate-600 dark:stroke-slate-500" />
        <rect x="46" y={JUNTA_Y} width="228" height="24" rx="3" className="fill-slate-200 stroke-slate-400 dark:fill-slate-700 dark:stroke-slate-500" />
        <path d="M54 118 H210" className="stroke-white/70 dark:stroke-white/15" strokeWidth="2" strokeLinecap="round" />
        <path d="M54 146 H150" className="stroke-white/70 dark:stroke-white/15" strokeWidth="2" strokeLinecap="round" />

        {/* Cordão de solda: aço já frio + trecho ainda em brasa */}
        <path ref={cordaoRef} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.4" className="stroke-slate-500 dark:stroke-slate-400" />
        <path ref={brasaRef} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" stroke="#f5821f" strokeOpacity="0.6" />

        {/* Maçarico: bico na junta, corpo inclinado para cima e para a direita */}
        <g ref={macaricoRef} transform={`translate(100 ${JUNTA_Y})`}>
          <line x1="0" y1="-3" x2="20" y2="-44" className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="6" strokeLinecap="round" />
          <line x1="0" y1="-3" x2="4" y2="-11" className="stroke-slate-800 dark:stroke-slate-100" strokeWidth="4" strokeLinecap="round" />
          <line x1="20" y1="-44" x2="34" y2="-72" stroke="#f5821f" strokeWidth="4" strokeLinecap="round" />
          <g ref={chamaRef} style={{ transition: 'opacity .15s' }}>
            <g className="cena-fagulha" style={{ transformOrigin: '0px 0px' }}>
              <circle r="7" fill="#f5821f" fillOpacity="0.45" />
              <circle r="3" fill="#fff4e0" />
            </g>
          </g>
        </g>

        {/* Faíscas: pool fixo */}
        {Array.from({ length: N_FAISCAS }, (_, i) => (
          <circle
            key={i}
            ref={el => {
              faiscaRefs.current[i] = el;
            }}
            r="1.5"
            fill="#ffb066"
            style={{ opacity: 0 }}
          />
        ))}
      </svg>
    </CenaMoldura>
  );
}
