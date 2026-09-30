/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "içamento da pá": um guindaste iça uma pá até o cubo da torre, com a
 * raiz para baixo. No alto ela balança ao vento — quanto mais se passa o mouse,
 * mais vento. O marcador do encaixe fica verde quando a raiz está alinhada:
 * clicar (ou tocar) nessa hora desce e encaixa; fora do eixo a pá bate e sobe
 * de novo. Montada, sai o selo e a cena recomeça com outra pá. Sozinha, erra
 * uma vez e depois acerta. O balanço é cinemático (ângulo do cabo), não uma
 * simulação.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, useMovimentoReduzido, useQuadros } from './util';

const CHAO = 184;
const HUB_X = 228;
const SOCKET_Y = 82; // onde a raiz da pá assenta
const COMP_PA = 44;
const RAIZ_ABAIXO_GANCHO = 68;
const LC_ALTO = 4; // cabo no ponto de espera, pouco acima do encaixe
const LC_ENCAIXE = SOCKET_Y - RAIZ_ABAIXO_GANCHO;
const LC_SOLO = CHAO - 6 - RAIZ_ABAIXO_GANCHO;
const VEL_SOBE = 36;
const VEL_DESCE = 42;
const OMEGA = 2.4;
const TOLERANCIA = 5;

type Fase = 'sobe' | 'espera' | 'desce' | 'bate' | 'montada';

export default function IcamentoPa() {
  const reduzido = useMovimentoReduzido();
  const giroRef = useRef<SVGGElement>(null);
  const caboRef = useRef<SVGLineElement>(null);
  const ganchoRef = useRef<SVGGElement>(null);
  const paRef = useRef<SVGPathElement>(null);
  const alvoRef = useRef<SVGLineElement>(null);
  const timers = useRef<number[]>([]);
  const [montada, setMontada] = useState(false);
  const [bateu, setBateu] = useState(false);

  const e = useRef({
    fase: 'sobe' as Fase,
    lc: LC_SOLO,
    t: 0,
    vento: 0,
    sobre: false,
    amort: 1,
    ok: false,
    espera: 0,
    errouAuto: false,
    reduzido,
  });
  e.current.reduzido = reduzido;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const depois = (ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms));

  const calcular = () => {
    const s = e.current;
    const amp = (s.fase === 'sobe' ? 3 : 9) + 12 * s.vento;
    const balanco = amp * s.amort * Math.sin(s.t * OMEGA);
    const theta = Math.asin(limitar(balanco / (s.lc + COMP_PA), -0.75, 0.75));
    return { theta, dx: (s.lc + RAIZ_ABAIXO_GANCHO) * Math.sin(theta) };
  };

  const recomecar = () => {
    const s = e.current;
    s.fase = 'sobe';
    s.lc = LC_SOLO;
    s.amort = 1;
    s.ok = false;
    s.errouAuto = false;
    setMontada(false);
  };

  const soltar = () => {
    const s = e.current;
    if (s.fase !== 'espera') return;
    s.ok = Math.abs(calcular().dx) <= TOLERANCIA;
    s.fase = 'desce';
  };

  const acordar = useQuadros(dt => {
    const s = e.current;
    const passo = s.reduzido ? 3 : 1;
    s.t += dt;
    s.vento += ((s.sobre ? 1 : 0) - s.vento) * Math.min(1, dt * 3);

    switch (s.fase) {
      case 'sobe':
        s.lc = Math.max(LC_ALTO, s.lc - VEL_SOBE * dt * passo);
        if (s.lc <= LC_ALTO) {
          s.fase = 'espera';
          s.espera = 0.9;
        }
        break;
      case 'espera': {
        s.espera -= dt;
        if (!s.sobre && !s.reduzido && s.espera <= 0) {
          // Sozinha: erra uma vez (pá fora do eixo) e depois espera o momento certo.
          const { dx } = calcular();
          if (!s.errouAuto && Math.abs(dx) > 10) {
            s.errouAuto = true;
            soltar();
          } else if (s.errouAuto && Math.abs(dx) <= 2.5) soltar();
        }
        break;
      }
      case 'desce':
        s.amort = s.ok ? Math.max(0, s.amort - dt * 4) : s.amort;
        s.lc = Math.min(LC_ENCAIXE, s.lc + VEL_DESCE * dt * passo);
        if (s.lc >= LC_ENCAIXE) {
          if (s.ok) {
            s.fase = 'montada';
            setMontada(true);
            depois(2800, recomecar);
          } else {
            s.fase = 'bate';
            setBateu(true);
            depois(900, () => setBateu(false));
          }
        }
        break;
      case 'bate':
        s.lc = Math.max(LC_ALTO, s.lc - VEL_SOBE * 1.6 * dt * passo);
        if (s.lc <= LC_ALTO) {
          s.fase = 'espera';
          s.espera = 0.9;
        }
        break;
      case 'montada':
        s.lc = Math.max(-26, s.lc - 50 * dt * passo);
        break;
    }

    const { theta, dx } = calcular();
    giroRef.current?.setAttribute('transform', `translate(${HUB_X} 0) rotate(${n1((theta * 180) / Math.PI)})`);
    caboRef.current?.setAttribute('y2', n1(s.lc));
    ganchoRef.current?.setAttribute('transform', `translate(0 ${n1(s.lc)})`);
    if (paRef.current) paRef.current.style.opacity = s.fase === 'montada' ? '0' : '1';
    if (alvoRef.current) {
      alvoRef.current.setAttribute('stroke', Math.abs(dx) <= TOLERANCIA ? '#22c55e' : '#f5821f');
      alvoRef.current.style.opacity = s.fase === 'espera' ? '1' : '0';
    }

    // Em movimento reduzido, dorme quando a pá parou no ponto de espera.
    return !s.reduzido || s.sobre || s.fase === 'sobe' || s.fase === 'desce' || s.fase === 'bate' || s.fase === 'montada';
  });

  const entrar = () => {
    e.current.sobre = true;
    acordar();
  };
  const sair = () => {
    e.current.sobre = false;
    acordar();
  };
  const clicar = () => {
    soltar();
    acordar();
  };

  const pa = `M${-4.5} ${RAIZ_ABAIXO_GANCHO} L-2.6 ${RAIZ_ABAIXO_GANCHO - 30} L0 ${RAIZ_ABAIXO_GANCHO - COMP_PA} L2.6 ${RAIZ_ABAIXO_GANCHO - 30} L4.5 ${RAIZ_ABAIXO_GANCHO} Z`;

  return (
    <CenaMoldura>
      <svg
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full cursor-pointer touch-pan-y"
        onPointerMove={entrar}
        onPointerDown={entrar}
        onPointerLeave={sair}
        onPointerCancel={sair}
        onClick={clicar}
      >
        <rect x="0" y={CHAO} width={CENA_L} height={CENA_A - CHAO} className="fill-slate-200 dark:fill-slate-800" />

        {/* Guindaste de esteiras: corpo, cabine, contrapeso e lança */}
        <rect x="12" y={CHAO - 12} width="64" height="12" rx="6" className="fill-slate-700 dark:fill-slate-500" />
        <rect x="22" y={CHAO - 36} width="46" height="24" rx="3" className="fill-slate-500 dark:fill-slate-400" />
        <rect x="14" y={CHAO - 32} width="12" height="18" rx="2" className="fill-slate-700 dark:fill-slate-600" />
        <rect x="42" y={CHAO - 52} width="22" height="16" rx="3" fill="#f5821f" />
        <rect x="47" y={CHAO - 49} width="9" height="8" rx="1" className="fill-sky-100 dark:fill-sky-900" />
        <line x1="50" y1={CHAO - 40} x2="220" y2="0" className="stroke-slate-500 dark:stroke-slate-300" strokeWidth="6" strokeLinecap="round" />
        <line x1="50" y1={CHAO - 40} x2="220" y2="0" stroke="#f5821f" strokeWidth="1.4" strokeDasharray="6 6" />

        {/* Torre, nacele, cubo e encaixe */}
        <path d={`M242 ${CHAO} L250 108 H258 L266 ${CHAO} Z`} className="fill-slate-300 stroke-slate-400 dark:fill-slate-500 dark:stroke-slate-400" strokeWidth="1" />
        <rect x="218" y="94" width="54" height="14" rx="7" className="fill-slate-400 dark:fill-slate-300" />
        <rect x={HUB_X - 6} y={SOCKET_Y} width="12" height="14" rx="2" className="fill-slate-500 dark:fill-slate-200" />
        <circle cx={HUB_X} cy="101" r="5" fill="#f5821f" />
        <line ref={alvoRef} x1={HUB_X - TOLERANCIA} x2={HUB_X + TOLERANCIA} y1={SOCKET_Y - 2} y2={SOCKET_Y - 2} stroke="#f5821f" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="3 3" style={{ opacity: 0, transition: 'opacity .2s' }} />

        {/* Pá já montada */}
        {montada && (
          <path
            className="fill-white stroke-slate-400 cena-assenta"
            strokeWidth="1"
            d={`M${HUB_X - 4.5} ${SOCKET_Y} L${HUB_X - 2.6} ${SOCKET_Y - 30} L${HUB_X} ${SOCKET_Y - COMP_PA} L${HUB_X + 2.6} ${SOCKET_Y - 30} L${HUB_X + 4.5} ${SOCKET_Y} Z`}
          />
        )}

        {/* Cabo, gancho, lingas e a pá pendurada, balançando do topo */}
        <g ref={giroRef} transform={`translate(${HUB_X} 0)`}>
          <line ref={caboRef} x1="0" y1="0" x2="0" y2={LC_SOLO} className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="1.4" />
          <g ref={ganchoRef} transform={`translate(0 ${LC_SOLO})`}>
            <rect x="-4" y="-2" width="8" height="7" rx="1.5" fill="#f5821f" />
            <path d="M0 5 L-3.4 28 M0 5 L3.4 28" className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="1" fill="none" />
            <path
              ref={paRef}
              d={pa}
              className="fill-white stroke-slate-400"
              strokeWidth="1"
              style={{ transform: bateu ? 'translateX(1.2px)' : undefined }}
            />
          </g>
        </g>

        {bateu && (
          <text x={HUB_X} y={SOCKET_Y - 52} textAnchor="middle" fontSize="9" fontWeight="800" fill="#dc2626" fontFamily="system-ui, sans-serif" className="cena-assenta">
            FORA DO EIXO
          </text>
        )}
        {montada && (
          <g transform="translate(112 34)"><g className="cena-assenta">
            <rect x="-48" y="-12" width="96" height="24" rx="12" fill="#16a34a" />
            <text y="4.5" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="0.8" fill="#fff" fontFamily="system-ui, sans-serif">
              PÁ MONTADA
            </text>
          </g></g>
        )}
      </svg>
    </CenaMoldura>
  );
}
