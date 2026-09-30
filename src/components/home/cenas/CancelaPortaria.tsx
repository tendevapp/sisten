/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "cancela da portaria": uma carreta chega, para diante da guarita, o
 * protocolo é emitido, a cancela sobe, a carreta passa e a cancela desce; aí
 * chega outra. Clicar (ou tocar) buzina e, se a carreta estiver esperando,
 * manda entrar sem demora. Com movimento reduzido a cena fica parada, com a
 * carreta na cancela, e um clique faz uma passagem (mais curta).
 */

import React, { useRef } from 'react';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, useMovimentoReduzido, useQuadros } from './util';

const CHAO = 188;
const COMPRIMENTO = 112;
const PARADA = 182; // onde o para-choque da carreta para
const X_BARRA = 84;
const PIVO_Y = 146;
const CORES = ['#f5821f', '#64748b', '#0ea5e9'];

type Fase = 'chega' | 'registra' | 'abre' | 'passa';

export default function CancelaPortaria() {
  const reduzido = useMovimentoReduzido();
  const caminhaoRef = useRef<SVGGElement>(null);
  const carretaRef = useRef<SVGGElement>(null);
  const bracoRef = useRef<SVGGElement>(null);
  const ledRef = useRef<SVGCircleElement>(null);
  const bilheteRef = useRef<SVGGElement>(null);
  const buzinaRef = useRef<SVGGElement>(null);

  const e = useRef({
    fase: (reduzido ? 'registra' : 'chega') as Fase,
    x: reduzido ? PARADA : 340,
    vel: 0,
    abre: 0,
    espera: 1.3,
    liberado: false,
    variante: 0,
    buzina: 0,
    reduzido,
  });
  e.current.reduzido = reduzido;

  const acordar = useQuadros(dt => {
    const s = e.current;
    const auto = !s.reduzido;
    const passo = s.reduzido ? 3 : 1;

    switch (s.fase) {
      case 'chega': {
        const v = limitar((s.x - PARADA) * 3.2 + 10, 10, 100) * passo;
        s.x = Math.max(PARADA, s.x - v * dt);
        if (s.x <= PARADA + 0.05) {
          s.fase = 'registra';
          s.espera = 1.3;
        }
        break;
      }
      case 'registra':
        if (auto || s.liberado) s.espera -= dt;
        if (s.espera <= 0) {
          s.fase = 'abre';
          s.liberado = false;
        }
        break;
      case 'abre':
        if (s.abre > 0.96) {
          s.fase = 'passa';
          s.vel = 10;
        }
        break;
      case 'passa':
        s.vel = Math.min(120, s.vel + 110 * dt);
        s.x -= s.vel * dt * passo;
        if (s.x < -COMPRIMENTO - 12) {
          s.variante += 1;
          s.fase = 'chega';
          s.x = auto ? 340 : PARADA;
        }
        break;
    }

    const abrir = s.fase === 'abre' || (s.fase === 'passa' && s.x + COMPRIMENTO >= X_BARRA - 14);
    s.abre += ((abrir ? 1 : 0) - s.abre) * Math.min(1, dt * 5);
    if (s.buzina > 0) s.buzina = Math.max(0, s.buzina - dt);

    const tremor = s.buzina > 0 ? Math.sin(s.buzina * 70) * 0.9 : 0;
    caminhaoRef.current?.setAttribute('transform', `translate(${n1(s.x)} ${n1(CHAO + tremor)})`);
    if (carretaRef.current) carretaRef.current.style.color = CORES[s.variante % CORES.length];
    bracoRef.current?.setAttribute('transform', `rotate(${n1(-78 * s.abre)} ${X_BARRA} ${PIVO_Y})`);
    ledRef.current?.setAttribute('fill', s.abre > 0.5 ? '#22c55e' : '#ef4444');

    // Protocolo: o papel desce da janela enquanto a carreta espera.
    if (bilheteRef.current) {
      const pronto = s.fase === 'registra' ? limitar(1 - s.espera / 1.3, 0, 1) : s.fase === 'abre' ? 1 : 0;
      bilheteRef.current.setAttribute('transform', `translate(0 ${n1(pronto * 13)})`);
      bilheteRef.current.style.opacity = s.fase === 'registra' || s.fase === 'abre' ? '1' : '0';
    }
    if (buzinaRef.current) {
      buzinaRef.current.setAttribute('transform', `translate(${n1(s.x + 4)} ${CHAO - 62})`);
      buzinaRef.current.style.opacity = s.buzina > 0 ? '1' : '0';
    }

    // Em movimento reduzido só roda enquanto houver o que mostrar.
    return auto || s.fase !== 'registra' || s.buzina > 0 || s.abre > 0.01;
  });

  const clicar = () => {
    const s = e.current;
    s.buzina = 0.7;
    if (s.fase === 'registra') {
      s.liberado = true;
      s.espera = Math.min(s.espera, 0.2);
    }
    acordar();
  };

  return (
    <CenaMoldura>
      <svg viewBox={`0 0 ${CENA_L} ${CENA_A}`} className="h-full w-full cursor-pointer touch-pan-y" onClick={clicar}>
        {/* Pista */}
        <rect x="0" y={CHAO} width={CENA_L} height="12" className="fill-slate-300 dark:fill-slate-700" />
        <path d={`M0 ${CHAO + 6} H${CENA_L}`} className="stroke-white/70 dark:stroke-white/25" strokeWidth="1.5" strokeDasharray="14 10" />

        {/* Guarita */}
        <rect x="10" y="118" width="60" height={CHAO - 118} rx="4" className="fill-slate-300 stroke-slate-400 dark:fill-slate-600 dark:stroke-slate-500" />
        <rect x="6" y="110" width="68" height="10" rx="3" className="fill-slate-500 dark:fill-slate-400" />
        <rect x="18" y="128" width="44" height="30" rx="3" className="fill-sky-100 stroke-slate-400 dark:fill-sky-900 dark:stroke-slate-400" />
        <text x="40" y="106" textAnchor="middle" fontSize="7" fontWeight="800" letterSpacing="1" className="fill-slate-500 dark:fill-slate-300" fontFamily="system-ui, sans-serif">
          PORTARIA
        </text>
        <circle ref={ledRef} cx="40" cy="114.6" r="2.4" fill="#ef4444" />
        <rect x="18" y="150" width="44" height="6" className="fill-slate-400 dark:fill-slate-500" />
        <g ref={bilheteRef} style={{ opacity: 0 }}>
          <rect x="30" y="141" width="20" height="10" rx="1" fill="#fff" stroke="#94a3b8" strokeWidth="0.8" />
          <path d="M33 145 H47 M33 148 H42" stroke="#94a3b8" strokeWidth="1" />
        </g>

        {/* Poste e braço da cancela */}
        <rect x={X_BARRA - 5} y={PIVO_Y - 2} width="10" height={CHAO - PIVO_Y + 2} rx="2" className="fill-slate-500 dark:fill-slate-300" />
        <g ref={bracoRef} transform={`rotate(0 ${X_BARRA} ${PIVO_Y})`}>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={X_BARRA + i * 12} y={PIVO_Y - 4} width="12" height="8" fill={i % 2 ? '#fff' : '#ef4444'} stroke="#94a3b8" strokeWidth="0.6" />
          ))}
          <circle cx={X_BARRA} cy={PIVO_Y} r="4" fill="#f5821f" />
        </g>

        {/* Carreta (de frente para a esquerda) */}
        <g ref={caminhaoRef} transform={`translate(${e.current.x} ${CHAO})`}>
          <rect x="0" y="-8" width={COMPRIMENTO} height="4" className="fill-slate-700 dark:fill-slate-400" />
          <g ref={carretaRef} style={{ color: CORES[0] }}>
            <rect x="38" y="-48" width="74" height="40" rx="3" fill="currentColor" />
            <path d="M38 -36 H112 M38 -24 H112" stroke="#000" strokeOpacity="0.18" strokeWidth="1.4" />
          </g>
          <path d="M0 -8 V-22 L9 -38 H34 V-8 Z" className="fill-slate-600 dark:fill-slate-300" />
          <path d="M6 -24 L11 -34 H22 V-24 Z" className="fill-sky-100 dark:fill-sky-900" />
          <rect x="-2" y="-14" width="5" height="4" rx="1" fill="#fde68a" />
          {[14, 62, 78, 100].map(x => (
            <g key={x}>
              <circle cx={x} cy="-7" r="7" className="fill-slate-800 dark:fill-slate-950" />
              <circle cx={x} cy="-7" r="2.6" className="fill-slate-400" />
            </g>
          ))}
        </g>

        {/* Buzina */}
        <g ref={buzinaRef} style={{ opacity: 0 }}>
          <text x="0" y="0" fontSize="11" fontWeight="800" fill="#f5821f" fontFamily="system-ui, sans-serif">
            BI-BIIIP!
          </text>
        </g>
      </svg>
    </CenaMoldura>
  );
}
