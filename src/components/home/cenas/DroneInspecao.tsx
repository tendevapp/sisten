/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "drone": o rotor de uma torre parada, com três defeitos que ninguém vê
 * a olho nu. O drone segue o mouse (ou o dedo); parado perto de um defeito,
 * a câmera o escaneia (o anel vai enchendo) e ele fica marcado com um alerta.
 * Clicar perto de um defeito marca na hora. Achados os três, sai o selo de
 * inspeção concluída e a ronda recomeça. Sozinho, o drone faz a ronda.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, PA_ROTOR, limitar, n1, pontoNoSvg, useMovimentoReduzido, useQuadros } from './util';

const CHAO = 176;
const HUB = { x: 160, y: 86 };
const ESCALA = 1.35;
const DISTANCIA_BLADE = 44;
const DEFEITOS = [-90, 30, 150].map(g => ({
  x: HUB.x + DISTANCIA_BLADE * Math.cos((g * Math.PI) / 180),
  y: HUB.y + DISTANCIA_BLADE * Math.sin((g * Math.PI) / 180),
}));
const ALCANCE = 26; // distância máxima câmera–defeito para escanear
const TEMPO_ESCANEAR = 0.55; // s
const PONTO_ROTA = [
  { dx: 17, dy: -12 },
  { dx: -17, dy: -12 },
  { dx: -17, dy: -12 },
];

export default function DroneInspecao() {
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const droneRef = useRef<SVGGElement>(null);
  const feixeRef = useRef<SVGPathElement>(null);
  const aneisRef = useRef<(SVGCircleElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  const [marcados, setMarcados] = useState<boolean[]>(() => DEFEITOS.map(() => false));
  const [ok, setOk] = useState(false);

  const e = useRef({
    x: 60,
    y: 50,
    alvoX: 60,
    alvoY: 50,
    sobre: false,
    tempo: 0,
    progresso: DEFEITOS.map(() => 0),
    marcados: DEFEITOS.map(() => false),
    ok: false,
  });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const marcar = (i: number) => {
    const s = e.current;
    if (s.marcados[i] || s.ok) return;
    s.marcados[i] = true;
    s.progresso[i] = 0;
    setMarcados([...s.marcados]);
    if (s.marcados.every(Boolean)) {
      s.ok = true;
      setOk(true);
      timers.current.push(
        window.setTimeout(() => {
          s.marcados = DEFEITOS.map(() => false);
          s.ok = false;
          setMarcados([...s.marcados]);
          setOk(false);
        }, 3400),
      );
    }
  };

  const acordar = useQuadros(dt => {
    const s = e.current;
    s.tempo += dt;
    const auto = !reduzido && !s.sobre;

    if (auto) {
      const i = s.marcados.findIndex(m => !m);
      if (i >= 0) {
        s.alvoX = DEFEITOS[i].x + PONTO_ROTA[i].dx;
        s.alvoY = DEFEITOS[i].y + PONTO_ROTA[i].dy + 3 * Math.sin(s.tempo * 3);
      } else {
        s.alvoX = 60 + 30 * Math.sin(s.tempo);
        s.alvoY = 46 + 8 * Math.sin(s.tempo * 1.7);
      }
    }
    const antesX = s.x;
    const k = Math.min(1, dt * 3.4);
    s.x += (s.alvoX - s.x) * k;
    s.y += (s.alvoY - s.y) * k;
    const tilt = limitar((s.x - antesX) * 14, -16, 16);
    droneRef.current?.setAttribute('transform', `translate(${n1(s.x)} ${n1(s.y)}) rotate(${n1(tilt)})`);

    // Escaneia o defeito mais próximo dentro do alcance.
    let melhor = -1;
    let menor = ALCANCE;
    DEFEITOS.forEach((d, i) => {
      if (s.marcados[i]) return;
      const dist = Math.hypot(d.x - s.x, d.y - (s.y + 6));
      if (dist < menor) {
        menor = dist;
        melhor = i;
      }
    });
    DEFEITOS.forEach((_, i) => {
      if (s.marcados[i]) return;
      s.progresso[i] = i === melhor ? s.progresso[i] + dt / TEMPO_ESCANEAR : Math.max(0, s.progresso[i] - dt * 2);
      const anel = aneisRef.current[i];
      if (anel) {
        anel.style.opacity = s.progresso[i] > 0.02 ? '1' : '0';
        anel.setAttribute('stroke-dashoffset', n1(62.8 * (1 - limitar(s.progresso[i], 0, 1))));
      }
    });
    if (melhor >= 0 && s.progresso[melhor] >= 1) marcar(melhor);

    if (feixeRef.current) {
      if (melhor >= 0 && s.progresso[melhor] > 0) {
        const d = DEFEITOS[melhor];
        feixeRef.current.setAttribute('d', `M${n1(s.x)} ${n1(s.y + 6)} L${n1(d.x - 6)} ${n1(d.y)} L${n1(d.x + 6)} ${n1(d.y)} Z`);
        feixeRef.current.style.opacity = '1';
      } else feixeRef.current.style.opacity = '0';
    }

    return !reduzido || s.sobre || Math.abs(s.alvoX - s.x) > 0.3 || Math.abs(s.alvoY - s.y) > 0.3 || s.progresso.some(p => p > 0);
  });

  const seguir = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const s = e.current;
    s.sobre = true;
    s.alvoX = limitar(p.x, 16, CENA_L - 16);
    s.alvoY = limitar(p.y, 14, CHAO - 10);
    acordar();
  };
  const soltar = () => {
    e.current.sobre = false;
    acordar();
  };
  const clicar = () => {
    const s = e.current;
    DEFEITOS.forEach((d, i) => {
      if (Math.hypot(d.x - s.x, d.y - (s.y + 6)) <= ALCANCE + 6) marcar(i);
    });
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
        onClick={clicar}
      >
        {/* Chão e torre */}
        <rect x="0" y={CHAO} width={CENA_L} height={CENA_A - CHAO} className="fill-slate-200 dark:fill-slate-800" />
        <path d={`M151 ${CHAO} L157 ${HUB.y + 8} H163 L169 ${CHAO} Z`} className="fill-slate-300 stroke-slate-400 dark:fill-slate-500 dark:stroke-slate-400" strokeWidth="1" />
        <rect x="146" y={HUB.y - 6} width="32" height="14" rx="6" className="fill-slate-400 dark:fill-slate-300" />

        {/* Rotor parado */}
        <g transform={`translate(${HUB.x} ${HUB.y}) scale(${ESCALA})`} className="fill-slate-300 stroke-slate-400 dark:fill-slate-200 dark:stroke-slate-400" strokeWidth="0.6">
          <path d={PA_ROTOR} transform="rotate(-90)" />
          <path d={PA_ROTOR} transform="rotate(30)" />
          <path d={PA_ROTOR} transform="rotate(150)" />
        </g>
        <circle cx={HUB.x} cy={HUB.y} r="4.5" fill="#f5821f" />

        {/* Defeitos: anel de escaneamento e, depois, o alerta */}
        {DEFEITOS.map((d, i) => (
          <g key={i} transform={`translate(${n1(d.x)} ${n1(d.y)})`}>
            <circle
              ref={el => {
                aneisRef.current[i] = el;
              }}
              r="10"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.4"
              strokeDasharray="62.8"
              strokeDashoffset="62.8"
              transform="rotate(-90)"
              style={{ opacity: 0 }}
            />
            {marcados[i] && (
              <g className="cena-assenta">
                <path d="M-3 -2 L0 3 L3 -2 M0 -6 V-3" stroke="#7f1d1d" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle r="11" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeDasharray="3 2" />
                <g transform="translate(9 -14)">
                  <path d="M0 -7 L7.5 6 H-7.5 Z" fill="#dc2626" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M0 -2 V1.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cy="3.8" r="0.9" fill="#fff" />
                </g>
              </g>
            )}
          </g>
        ))}

        {/* Feixe da câmera */}
        <path ref={feixeRef} d="M0 0" fill="#22d3ee" fillOpacity="0.28" style={{ opacity: 0, transition: 'opacity .1s' }} />

        {/* Drone */}
        <g ref={droneRef} transform="translate(60 50)" style={{ pointerEvents: 'none' }}>
          <path d="M-9 -3 L-17 -8 M9 -3 L17 -8" className="stroke-slate-600 dark:stroke-slate-200" strokeWidth="2" strokeLinecap="round" />
          <ellipse className="cena-fagulha fill-slate-500/70 dark:fill-slate-300/70" cx="-17" cy="-9" rx="9" ry="1.6" />
          <ellipse className="cena-fagulha fill-slate-500/70 dark:fill-slate-300/70" cx="17" cy="-9" rx="9" ry="1.6" />
          <rect x="-10" y="-5" width="20" height="8" rx="4" className="fill-slate-600 dark:fill-slate-200" />
          <rect x="-4" y="-7" width="8" height="3" rx="1.5" fill="#f5821f" />
          <circle cy="6" r="3.2" className="fill-slate-700 dark:fill-slate-100" />
          <circle cy="6" r="1.3" fill="#22d3ee" />
        </g>

        {ok && (
          <g transform="translate(160 24)"><g className="cena-assenta">
            <rect x="-66" y="-12" width="132" height="24" rx="12" fill="#16a34a" />
            <text y="5" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="0.8" fill="#fff" fontFamily="system-ui, sans-serif">
              INSPEÇÃO CONCLUÍDA
            </text>
          </g></g>
        )}
      </svg>
    </CenaMoldura>
  );
}
