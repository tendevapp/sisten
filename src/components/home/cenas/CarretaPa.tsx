/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "carreta com pá": uma carreta leva uma pá de rotor pela estrada, com a
 * paisagem rolando em camadas (parque eólico ao fundo, morros, postes e um
 * viaduto). Passar o mouse acelera — quanto mais à direita o ponteiro, mais
 * rápido. Sob o viaduto ela buzina; clicar (ou tocar) também. Com movimento
 * reduzido, só anda enquanto o ponteiro estiver em cima.
 */

import React, { useRef } from 'react';
import { CENA_A, CENA_L, CenaMoldura, PA_ROTOR, limitar, n1, pontoNoSvg, useMovimentoReduzido, useQuadros } from './util';

const CHAO = 176;
const CARRETA_X = 224; // para-choque dianteiro, na tela
const VEL_BASE = 52;
const P_LONGE = 320;
const P_MORROS = 320;
const P_PERTO = 640;
const VIADUTO_X = 330; // início do viaduto dentro do ciclo de 640
const VIADUTO_L = 150;
const RODAS = [-12, -62, -80, -102];

const mod = (v: number, m: number) => ((v % m) + m) % m;

function Turbina({ x, escala }: { x: number; escala: number }) {
  const hy = CHAO - 76 * escala;
  return (
    <g>
      <path d={`M${x - 3 * escala} ${CHAO - 26} L${x - 1.6 * escala} ${hy} H${x + 1.6 * escala} L${x + 3 * escala} ${CHAO - 26} Z`} />
      <g transform={`translate(${x} ${hy}) scale(${0.5 * escala})`}>
        <path d={PA_ROTOR} transform="rotate(-70)" />
        <path d={PA_ROTOR} transform="rotate(50)" />
        <path d={PA_ROTOR} transform="rotate(170)" />
      </g>
    </g>
  );
}

export default function CarretaPa() {
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const longeRef = useRef<SVGGElement>(null);
  const morrosRef = useRef<SVGGElement>(null);
  const pertoRef = useRef<SVGGElement>(null);
  const pistaRef = useRef<SVGLineElement>(null);
  const carretaRef = useRef<SVGGElement>(null);
  const rodaRefs = useRef<(SVGGElement | null)[]>([]);
  const buzinaRef = useRef<SVGGElement>(null);

  const e = useRef({ ox: 0, vel: VEL_BASE, alvoVel: VEL_BASE, sobre: false, buzina: 0, passou: false });

  const acordar = useQuadros(dt => {
    const s = e.current;
    const parada = reduzido && !s.sobre;
    const alvo = parada ? 0 : s.alvoVel;
    s.vel += (alvo - s.vel) * Math.min(1, dt * 3);
    if (Math.abs(s.vel) < 0.05 && alvo === 0) s.vel = 0;
    s.ox += s.vel * dt;

    longeRef.current?.setAttribute('transform', `translate(${n1(-mod(s.ox * 0.22, P_LONGE))} 0)`);
    morrosRef.current?.setAttribute('transform', `translate(${n1(-mod(s.ox * 0.4, P_MORROS))} 0)`);
    pertoRef.current?.setAttribute('transform', `translate(${n1(-mod(s.ox, P_PERTO))} 0)`);
    pistaRef.current?.setAttribute('stroke-dashoffset', n1(mod(s.ox, 24)));

    const bobe = s.vel > 0 ? Math.sin(s.ox * 0.18) * 0.7 : 0;
    carretaRef.current?.setAttribute('transform', `translate(${CARRETA_X} ${n1(CHAO + bobe)})`);
    rodaRefs.current.forEach((g, i) => g?.setAttribute('transform', `translate(${RODAS[i]} -7) rotate(${n1(s.ox * 4.2)})`));

    // Buzina ao entrar embaixo do viaduto (uma vez por passagem).
    const centro = VIADUTO_X + VIADUTO_L / 2 - mod(s.ox, P_PERTO);
    const embaixo = Math.abs(centro - (CARRETA_X - 50)) < 18;
    if (embaixo && !s.passou) {
      s.passou = true;
      s.buzina = 0.9;
    } else if (!embaixo && Math.abs(centro - (CARRETA_X - 50)) > 60) s.passou = false;
    if (s.buzina > 0) s.buzina = Math.max(0, s.buzina - dt);
    if (buzinaRef.current) buzinaRef.current.style.opacity = s.buzina > 0 ? '1' : '0';

    return !parada || s.vel > 0 || s.buzina > 0;
  });

  const seguir = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const s = e.current;
    s.sobre = true;
    s.alvoVel = 26 + 150 * limitar(p.x / CENA_L, 0, 1);
    acordar();
  };
  const soltar = () => {
    e.current.sobre = false;
    e.current.alvoVel = VEL_BASE;
    acordar();
  };
  const buzinar = () => {
    e.current.buzina = 0.9;
    acordar();
  };

  return (
    <CenaMoldura>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full cursor-pointer touch-pan-y"
        onPointerMove={seguir}
        onPointerDown={seguir}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
        onClick={buzinar}
      >
        {/* Parque eólico ao fundo */}
        <g ref={longeRef} className="fill-slate-300 dark:fill-slate-600">
          {[0, P_LONGE].map(d => (
            <g key={d} transform={`translate(${d} 0)`}>
              <Turbina x={44} escala={0.9} />
              <Turbina x={168} escala={0.7} />
              <Turbina x={262} escala={0.8} />
            </g>
          ))}
        </g>

        {/* Morros */}
        <g ref={morrosRef} className="fill-slate-200 dark:fill-slate-700">
          {[0, P_MORROS].map(d => (
            <path key={d} transform={`translate(${d} 0)`} d={`M0 ${CHAO} Q70 ${CHAO - 34} 150 ${CHAO} Q230 ${CHAO - 26} ${P_MORROS} ${CHAO} Z`} />
          ))}
        </g>

        {/* Estrada */}
        <rect x="0" y={CHAO - 2} width={CENA_L} height={CENA_A - CHAO + 2} className="fill-slate-400 dark:fill-slate-700" />
        <line ref={pistaRef} x1="0" x2={CENA_L} y1={CHAO + 13} y2={CHAO + 13} stroke="#fff" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="14 10" />

        {/* Cenário de perto: postes e viaduto */}
        <g ref={pertoRef}>
          {[0, P_PERTO].map(d => (
            <g key={d} transform={`translate(${d} 0)`}>
              {[60, 200, 620].map(x => (
                <g key={x} className="fill-slate-500 dark:fill-slate-400">
                  <rect x={x - 1.5} y={CHAO - 70} width="3" height="72" />
                  <rect x={x - 1.5} y={CHAO - 71} width="14" height="3" rx="1.5" />
                </g>
              ))}
              <g className="fill-slate-400 dark:fill-slate-500">
                <rect x={VIADUTO_X - 4} y="84" width={VIADUTO_L + 8} height="14" rx="2" />
                <rect x={VIADUTO_X + 8} y="98" width="12" height={CHAO - 98} />
                <rect x={VIADUTO_X + VIADUTO_L - 20} y="98" width="12" height={CHAO - 98} />
              </g>
              <rect x={VIADUTO_X - 4} y="84" width={VIADUTO_L + 8} height="3" fill="#f5821f" fillOpacity="0.8" />
            </g>
          ))}
        </g>

        {/* Carreta (de frente para a direita) com a pá */}
        <g ref={carretaRef} transform={`translate(${CARRETA_X} ${CHAO})`} style={{ pointerEvents: 'none' }}>
          <path d="M-30 -48 C -62 -48 -112 -43 -158 -39 L-158 -37 C -112 -35 -62 -31 -30 -32 Z" fill="#fff" className="stroke-slate-400" strokeWidth="1" />
          <path d="M-158 -38 V-50" stroke="#ef4444" strokeWidth="1.6" />
          <rect x="-158" y="-50" width="8" height="5" fill="#ef4444" />
          <rect x="-42" y="-33" width="6" height="22" className="fill-slate-600 dark:fill-slate-300" />
          <rect x="-98" y="-33" width="6" height="22" className="fill-slate-600 dark:fill-slate-300" />
          <rect x="-114" y="-14" width="116" height="6" rx="2" className="fill-slate-700 dark:fill-slate-400" />
          <path d="M-34 -10 V-30 L-26 -44 H-4 L0 -26 V-10 Z" fill="#f5821f" />
          <path d="M-30 -30 L-25 -40 H-10 V-30 Z" className="fill-sky-100 dark:fill-sky-900" />
          <rect x="-2" y="-16" width="4" height="4" rx="1" fill="#fde68a" />
          {RODAS.map((x, i) => (
            <g
              key={x}
              ref={el => {
                rodaRefs.current[i] = el;
              }}
              transform={`translate(${x} -7)`}
            >
              <circle r="7" className="fill-slate-800 dark:fill-slate-950" />
              <circle r="2.6" className="fill-slate-400" />
              <path d="M0 -6 V6" stroke="#94a3b8" strokeWidth="1" />
            </g>
          ))}
        </g>

        <g ref={buzinaRef} style={{ opacity: 0 }}>
          <text x={CARRETA_X - 24} y={CHAO - 62} fontSize="12" fontWeight="800" fill="#f5821f" fontFamily="system-ui, sans-serif">
            BIIIP!
          </text>
        </g>
      </svg>
    </CenaMoldura>
  );
}
