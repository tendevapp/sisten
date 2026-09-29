/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "calandra": a chapa reta entra pela mesa, passa entre o rolo superior e
 * os dois inferiores e vai se curvando até fechar o cilindro. Aí solda a
 * costura, gira o cilindro pronto, ele sai pela direita e a máquina recomeça.
 * Passar o mouse acelera o ciclo inteiro.
 *
 * A chapa é desenhada por comprimento de arco: reta até o vão dos rolos e, dali
 * em diante, um círculo de raio R tangente à reta — o que dá a curva "de
 * verdade" em qualquer ponto da alimentação.
 */

import React, { useRef } from 'react';
import { CENA_A, CENA_L, CenaMoldura, n1, useMovimentoReduzido, useQuadros } from './util';

const CX = 190; // vão dos rolos
const R = 40; // raio do cilindro
const Y0 = 144; // altura da chapa reta
const CY = Y0 - R;
const X0 = -10; // onde a ponta da chapa começa (fora da tela)
const D = CX - X0; // percurso reto até o vão
const LP = 2 * Math.PI * R; // comprimento da chapa = perímetro do cilindro
const R_BAIXO = 10;
const R_CIMA = 9;
const ROLO_DX = 14;
const ROLO_Y = Y0 + 2.25 + R_BAIXO;
const ROLO_CIMA_Y = Y0 - 2.25 - R_CIMA;

// Linha do tempo de um ciclo, em segundos.
const T_ENTRA = 1.3;
const T_CURVA = 6;
const T_SOLDA = 1.2;
const T_GIRA = 2;
const T_SAI = 1.5;
const T_PAUSA = 1;
const CICLO = T_ENTRA + T_CURVA + T_SOLDA + T_GIRA + T_SAI + T_PAUSA;

const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rad = (g: number) => (g * Math.PI) / 180;

/** Ponto da chapa a `w` de percurso: reto até o vão, depois sobre o círculo. */
function pontoNoCaminho(w: number): [number, number] {
  if (w <= D) return [X0 + w, Y0];
  const th = (w - D) / R;
  return [CX + R * Math.sin(th), CY + R * Math.cos(th)];
}

/** Trecho da chapa entre a ponta de trás (u − LP) e a da frente (u). */
function caminhoChapa(u: number): string {
  const ini = u - LP;
  const [ax, ay] = pontoNoCaminho(ini);
  if (u <= D) return `M${n1(ax)} ${n1(ay)} L${n1(X0 + u)} ${Y0}`;
  const [bx, by] = pontoNoCaminho(Math.min(u, D + LP - 0.05));
  const volta = (u - Math.max(ini, D)) / R;
  const inicio = ini <= D ? `M${n1(ax)} ${Y0} L${CX} ${Y0}` : `M${n1(ax)} ${n1(ay)}`;
  return `${inicio} A${R} ${R} 0 ${volta > Math.PI ? 1 : 0} 0 ${n1(bx)} ${n1(by)}`;
}

interface Quadro {
  u: number; // percurso da ponta da chapa
  mov: number; // distância percorrida pela superfície dos rolos
  anel: boolean;
  giro: number; // graus
  dx: number;
  opacidade: number;
  solda: number; // 0..1
}

function quadroEm(t: number): Quadro {
  const fim = D + LP;
  let r = t;
  if (r < T_ENTRA) return { u: D * suave(r / T_ENTRA), mov: D * suave(r / T_ENTRA), anel: false, giro: 0, dx: 0, opacidade: 1, solda: 0 };
  r -= T_ENTRA;
  if (r < T_CURVA) return { u: D + LP * (r / T_CURVA), mov: D + LP * (r / T_CURVA), anel: false, giro: 0, dx: 0, opacidade: 1, solda: 0 };
  r -= T_CURVA;
  if (r < T_SOLDA) return { u: fim, mov: fim, anel: true, giro: 0, dx: 0, opacidade: 1, solda: Math.sin((r / T_SOLDA) * Math.PI) };
  r -= T_SOLDA;
  // Gira: acelera até 150°/s. Depois sai rolando, ainda girando.
  const giroAte = (s: number) => 75 * s * s / T_GIRA;
  if (r < T_GIRA) {
    const g = giroAte(r);
    return { u: fim, mov: fim + rad(g) * R, anel: true, giro: g, dx: 0, opacidade: 1, solda: 0 };
  }
  r -= T_GIRA;
  const g0 = giroAte(T_GIRA);
  if (r < T_SAI) {
    const g = g0 + 150 * r;
    const p = suave(r / T_SAI);
    return { u: fim, mov: fim + rad(g) * R, anel: true, giro: g, dx: 110 * p, opacidade: 1 - p, solda: 0 };
  }
  return { u: -1, mov: fim + rad(g0 + 150 * T_SAI) * R, anel: false, giro: 0, dx: 0, opacidade: 0, solda: 0 };
}

export default function Calandra() {
  const reduzido = useMovimentoReduzido();
  const chapaRef = useRef<SVGPathElement>(null);
  const anelRef = useRef<SVGGElement>(null);
  const aneisGiroRef = useRef<SVGGElement>(null);
  const soldaRef = useRef<SVGGElement>(null);
  const roloEsqRef = useRef<SVGGElement>(null);
  const roloDirRef = useRef<SVGGElement>(null);
  const roloCimaRef = useRef<SVGGElement>(null);

  // Parada (movimento reduzido): mostra o cilindro pronto, sem girar.
  const e = useRef({ t: 0, fator: 1, sobre: false, iniciado: false });

  const acordar = useQuadros(dt => {
    const s = e.current;
    if (!s.iniciado) {
      s.iniciado = true;
      if (reduzido) s.t = T_ENTRA + T_CURVA + 0.2;
    }
    if (!reduzido) {
      s.fator += ((s.sobre ? 2.4 : 1) - s.fator) * Math.min(1, dt * 4);
      s.t = (s.t + dt * s.fator) % CICLO;
    }
    const q = quadroEm(s.t);

    if (chapaRef.current) {
      chapaRef.current.style.display = !q.anel && q.u >= 0 ? '' : 'none';
      if (!q.anel && q.u >= 0) chapaRef.current.setAttribute('d', caminhoChapa(q.u));
    }
    if (anelRef.current) {
      anelRef.current.style.display = q.anel ? '' : 'none';
      anelRef.current.setAttribute('transform', `translate(${n1(q.dx)} 0)`);
      anelRef.current.style.opacity = String(q.opacidade);
    }
    aneisGiroRef.current?.setAttribute('transform', `rotate(${n1(-q.giro)} ${CX} ${CY})`);
    if (soldaRef.current) soldaRef.current.style.opacity = String(q.solda);

    const baixo = (q.mov / R_BAIXO) * (180 / Math.PI);
    const cima = -(q.mov / R_CIMA) * (180 / Math.PI);
    roloEsqRef.current?.setAttribute('transform', `rotate(${n1(baixo % 360)} ${CX - ROLO_DX} ${ROLO_Y})`);
    roloDirRef.current?.setAttribute('transform', `rotate(${n1(baixo % 360)} ${CX + ROLO_DX} ${ROLO_Y})`);
    roloCimaRef.current?.setAttribute('transform', `rotate(${n1(cima % 360)} ${CX} ${ROLO_CIMA_Y})`);

    return !reduzido;
  });

  const ligar = () => {
    e.current.sobre = true;
    acordar();
  };
  const desligar = () => {
    e.current.sobre = false;
    acordar();
  };

  const rolo = (ref: React.RefObject<SVGGElement | null>, x: number, y: number, r: number, corMarca: string) => (
    <g ref={ref}>
      <circle cx={x} cy={y} r={r} className="fill-slate-500 dark:fill-slate-400" />
      <line x1={x} y1={y} x2={x} y2={y - r + 2} className={corMarca} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );

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
        {/* Chão, base e mesa de alimentação */}
        <rect x="0" y="182" width={CENA_L} height="18" className="fill-slate-200 dark:fill-slate-800" />
        <rect x={CX - 62} y="174" width="124" height="8" rx="2" className="fill-slate-300 dark:fill-slate-600" />
        <rect x="0" y={Y0 + 3} width={CX - 46} height="4" className="fill-slate-400 dark:fill-slate-600" />
        {[24, 96].map(x => (
          <rect key={x} x={x} y={Y0 + 7} width="4" height={182 - Y0 - 7} className="fill-slate-400 dark:fill-slate-600" />
        ))}

        {/* Motor e eixo de acionamento */}
        <rect x={CX + 30} y="157" width={246 - CX - 30} height="6" className="fill-slate-400 dark:fill-slate-600" />
        <rect x="246" y="148" width="46" height="34" rx="4" className="fill-slate-400 dark:fill-slate-500" />
        {[154, 160, 166, 172].map(y => (
          <line key={y} x1="252" x2="286" y1={y} y2={y} className="stroke-slate-500 dark:stroke-slate-300" strokeWidth="1.5" strokeLinecap="round" />
        ))}
        <circle cx="284" cy="153" r="2" fill="#4ade80" className="cena-pisca" />

        {/* Pedestal dos rolos */}
        <rect x={CX - 40} y={Y0 + 12} width="80" height="24" rx="4" className="fill-slate-300 dark:fill-slate-700" />

        {/* Chapa em alimentação */}
        <path ref={chapaRef} fill="none" strokeWidth="4.5" className="stroke-slate-400 dark:stroke-slate-300" />

        {/* Cilindro fechado: gira, solda e sai */}
        <g ref={anelRef} style={{ display: 'none' }}>
          <g ref={aneisGiroRef}>
            <circle cx={CX} cy={CY} r={R} fill="none" strokeWidth="4.5" className="stroke-slate-400 dark:stroke-slate-300" />
            <circle cx={CX} cy={CY} r={R - 4.5} fill="none" strokeWidth="1" className="stroke-slate-300/70 dark:stroke-slate-500/70" />
            <rect x={CX - 2} y={Y0 - 4} width="4" height="8" rx="1.5" fill="#f5821f" />
          </g>
          <g ref={soldaRef} style={{ opacity: 0 }}>
            <circle cx={CX} cy={Y0} r="9" fill="#f5821f" fillOpacity="0.4" className="cena-fagulha" />
            <g className="cena-fagulha" stroke="#ffb066" strokeWidth="1.5" strokeLinecap="round">
              <path d={`M${CX - 12} ${Y0 - 6} l-5 -4 M${CX + 12} ${Y0 - 6} l5 -4 M${CX - 6} ${Y0 - 12} l-2 -6 M${CX + 6} ${Y0 - 12} l2 -6`} />
            </g>
          </g>
        </g>

        {/* Rolos: dois embaixo, um em cima */}
        {rolo(roloEsqRef, CX - ROLO_DX, ROLO_Y, R_BAIXO, 'stroke-slate-200 dark:stroke-slate-700')}
        {rolo(roloDirRef, CX + ROLO_DX, ROLO_Y, R_BAIXO, 'stroke-slate-200 dark:stroke-slate-700')}
        {rolo(roloCimaRef, CX, ROLO_CIMA_Y, R_CIMA, 'stroke-slate-200 dark:stroke-slate-700')}
        <circle cx={CX} cy={ROLO_CIMA_Y} r="2.4" fill="#f5821f" />
      </svg>
    </CenaMoldura>
  );
}
