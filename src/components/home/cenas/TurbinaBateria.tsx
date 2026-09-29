/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "turbina e bateria": o rotor gira devagar com o vento fraco. Com o mouse
 * por cima, a rajada aumenta, o rotor ganha velocidade (com inércia, depois
 * freia devagar) e a carga que sobe é proporcional a essa velocidade. A
 * bateria muda de vermelho para verde e, cheia, brilha. Tirando o mouse ela
 * descarrega aos poucos.
 */

import React, { useRef } from 'react';
import { CENA_A, CENA_L, CenaMoldura, PA_ROTOR, limitar, n1, useMovimentoReduzido, useQuadros } from './util';

const HUB = { x: 86, y: 60 };
const BAT = { x: 219, y: 117, w: 38, h: 54 }; // miolo onde a carga aparece

const W_CALMO = 50; // graus/s com vento fraco
const W_RAJADA = 900; // graus/s com rajada
const CARGA_MAX_POR_S = 0.22; // % da bateria por segundo, com o rotor a toda
const DESCARGA_POR_S = 0.02;

export default function TurbinaBateria() {
  const reduzido = useMovimentoReduzido();
  const rotorRef = useRef<SVGGElement>(null);
  const cargaRef = useRef<SVGRectElement>(null);
  const rotuloRef = useRef<SVGTextElement>(null);
  const cheiaRef = useRef<SVGGElement>(null);
  const cabosRef = useRef<SVGPathElement>(null);
  const ventoRef = useRef<SVGGElement>(null);

  const e = useRef({ sobre: false, w: 0, angulo: 0, carga: 0.12, pct: -1 });

  const acordar = useQuadros(dt => {
    const s = e.current;
    const alvo = s.sobre ? W_RAJADA : reduzido ? 0 : W_CALMO;
    s.w += (alvo - s.w) * Math.min(1, dt * (s.sobre ? 2.2 : 0.7));
    s.angulo = (s.angulo + s.w * dt) % 360;

    const forca = s.w / W_RAJADA;
    if (!reduzido || s.sobre || s.w > 1) {
      s.carga = limitar(s.carga + dt * (forca * CARGA_MAX_POR_S - DESCARGA_POR_S), 0, 1);
    }

    rotorRef.current?.setAttribute('transform', `rotate(${n1(s.angulo)} ${HUB.x} ${HUB.y})`);
    const h = BAT.h * s.carga;
    cargaRef.current?.setAttribute('y', n1(BAT.y + BAT.h - h));
    cargaRef.current?.setAttribute('height', n1(h));
    cargaRef.current?.setAttribute('fill', `hsl(${Math.round(8 + 112 * s.carga)} 82% 48%)`);
    const pct = Math.round(s.carga * 100);
    if (pct !== s.pct && rotuloRef.current) {
      s.pct = pct;
      rotuloRef.current.textContent = `${pct}%`;
    }
    cheiaRef.current?.setAttribute('opacity', s.carga > 0.985 ? '1' : '0');
    cabosRef.current?.setAttribute('opacity', n1(Math.min(1, forca * 1.6)));
    ventoRef.current?.setAttribute('opacity', n1(Math.min(1, forca * 1.4)));

    return !reduzido || s.sobre || s.w > 1;
  });

  const ligar = () => {
    e.current.sobre = true;
    acordar();
  };
  const desligar = () => {
    e.current.sobre = false;
    acordar();
  };

  return (
    <CenaMoldura>
      <svg
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full"
        onPointerEnter={ligar}
        onPointerMove={ligar}
        onPointerDown={ligar}
        onPointerLeave={desligar}
        onPointerCancel={desligar}
      >
        <rect x="0" y="188" width={CENA_L} height="12" className="fill-slate-200 dark:fill-slate-800" />

        {/* Vento: só aparece quando a rajada aperta */}
        <g ref={ventoRef} opacity="0" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" strokeLinecap="round" fill="none">
          <path className="home-rajada home-rajada-1" d="M4 34 h26" />
          <path className="home-rajada home-rajada-2" d="M4 62 h18" />
          <path className="home-rajada home-rajada-1" d="M4 90 h30" style={{ animationDelay: '-1.3s' }} />
        </g>

        {/* Torre, nacele e rotor */}
        <path d="M91.4 64 L100.6 64 L104 188 L88 188 Z" className="fill-slate-300 dark:fill-slate-600" />
        <rect x="84" y="53.5" width="24" height="13" rx="6.5" className="fill-slate-400 dark:fill-slate-500" />
        <g ref={rotorRef}>
          <g transform={`translate(${HUB.x} ${HUB.y}) scale(1.1)`} className="fill-slate-500 dark:fill-slate-300">
            <path d={PA_ROTOR} transform="rotate(-90)" />
            <path d={PA_ROTOR} transform="rotate(30)" />
            <path d={PA_ROTOR} transform="rotate(150)" />
          </g>
          <circle cx={HUB.x} cy={HUB.y} r="5" fill="#f5821f" />
        </g>

        {/* Cabo até a bateria, com a energia correndo */}
        <path d="M96 183 H238 V174" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-slate-300 dark:stroke-slate-600" />
        <path
          ref={cabosRef}
          d="M96 183 H238 V174"
          fill="none"
          opacity="0"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="3 5"
          stroke="#f5821f"
          className="cena-fluxo"
        />

        {/* Bateria */}
        <rect x="230" y="106" width="16" height="6" rx="2" className="fill-slate-400 dark:fill-slate-500" />
        <rect x="214" y="111" width="48" height="64" rx="7" className="fill-white stroke-slate-400 dark:fill-slate-900 dark:stroke-slate-500" strokeWidth="2.5" />
        <rect ref={cargaRef} x={BAT.x} y={BAT.y + BAT.h} width={BAT.w} height="0" rx="3" fill="hsl(8 82% 48%)" />
        <g className="stroke-white/70 dark:stroke-slate-900/70" strokeWidth="1.5">
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1={BAT.x} x2={BAT.x + BAT.w} y1={BAT.y + BAT.h * f} y2={BAT.y + BAT.h * f} />
          ))}
        </g>
        <path d="M241 128 L230 146 H238 L235 162 L248 141 H239 Z" className="fill-white/90 stroke-slate-500/60 dark:fill-slate-100" strokeWidth="1" strokeLinejoin="round" />
        <g ref={cheiaRef} opacity="0">
          <rect x="210" y="107" width="56" height="72" rx="10" fill="none" stroke="#f5821f" strokeWidth="2.5" className="cena-pulsa" />
        </g>
        <text ref={rotuloRef} x="238" y="98" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-slate-600 dark:fill-slate-300">
          12%
        </text>
      </svg>
    </CenaMoldura>
  );
}
