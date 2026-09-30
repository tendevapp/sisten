/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "torre ao amanhecer": a torre eólica pronta, num parque com duas
 * vizinhas, sob o céu da hora local — sol nascendo, dia claro, pôr do sol,
 * lua e estrelas, com a luz de obstáculo piscando à noite. Passar o mouse (ou o
 * dedo) vira um time-lapse: a posição horizontal do ponteiro é a hora do dia.
 * Ao sair, o céu volta suavemente para a hora de verdade.
 */

import React, { useEffect, useRef } from 'react';
import { faseDoDia, misturarCor } from '../../../lib/cenaInicioLogica';
import { CENA_A, CENA_L, CenaMoldura, PA_ROTOR, limitar, n1, pontoNoSvg, useIdSvg, useQuadros } from './util';

const HORIZONTE = 176;

const NOITE = '#0b1730';
const DIA = '#bfe0ff';
const AURORA = '#f4a261';

const ESTRELAS: [number, number, number][] = [
  [24, 22, 1.2], [58, 46, 0.9], [92, 18, 1.1], [118, 60, 0.8], [204, 26, 1], [238, 54, 1.2],
  [270, 20, 0.9], [296, 62, 1.1], [40, 84, 0.8], [286, 96, 0.9], [224, 88, 0.8], [76, 104, 1],
];

const horaAgora = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

const arco = (frac: number) => ({ x: 30 + 260 * frac, y: HORIZONTE - 4 - 132 * Math.sin(Math.PI * limitar(frac, 0, 1)) });

function Turbina({ x, escala, girar, duracao }: { x: number; escala: number; girar: boolean; duracao: string }) {
  const hubX = x + 14 * escala;
  const hubY = HORIZONTE - 114 * escala;
  return (
    <g fill="currentColor">
      <path d={`M${x - 6 * escala} ${HORIZONTE} L${x - 3 * escala} ${hubY + 4 * escala} L${x + 3 * escala} ${hubY + 4 * escala} L${x + 6 * escala} ${HORIZONTE} Z`} />
      <rect x={x - 5 * escala} y={hubY - 4 * escala} width={22 * escala} height={11 * escala} rx={5 * escala} />
      <g className={girar ? 'cena-gira' : undefined} style={{ transformOrigin: `${hubX}px ${hubY}px`, animationDuration: duracao }}>
        <g transform={`translate(${hubX} ${hubY}) scale(${0.72 * escala})`}>
          <path d={PA_ROTOR} transform="rotate(-90)" />
          <path d={PA_ROTOR} transform="rotate(30)" />
          <path d={PA_ROTOR} transform="rotate(150)" />
        </g>
        <circle cx={hubX} cy={hubY} r={3 * escala} fill="#f5821f" />
      </g>
    </g>
  );
}

export default function TorreAmanhecer() {
  const idMoldura = useIdSvg('ta');
  const svgRef = useRef<SVGSVGElement>(null);
  const ceuRef = useRef<SVGRectElement>(null);
  const solRef = useRef<SVGGElement>(null);
  const luaRef = useRef<SVGGElement>(null);
  const estrelasRef = useRef<SVGGElement>(null);
  const longeRef = useRef<SVGGElement>(null);
  const torreRef = useRef<SVGGElement>(null);
  const morrosRef = useRef<SVGGElement>(null);
  const soloRef = useRef<SVGRectElement>(null);
  const luzRef = useRef<SVGGElement>(null);
  const relogioRef = useRef<SVGTextElement>(null);

  const e = useRef({ hora: horaAgora(), alvo: horaAgora(), sobre: false });

  const acordar = useQuadros(dt => {
    const s = e.current;
    s.hora += (s.alvo - s.hora) * Math.min(1, dt * 4);
    if (Math.abs(s.alvo - s.hora) < 0.004) s.hora = s.alvo;

    const f = faseDoDia(s.hora);
    const noite = 1 - f.luz;
    const ceu = misturarCor(misturarCor(NOITE, DIA, f.luz), AURORA, f.crepusculo * 0.55);
    ceuRef.current?.setAttribute('fill', ceu);

    const sol = arco(f.solFrac);
    solRef.current?.setAttribute('transform', `translate(${n1(sol.x)} ${n1(sol.y)})`);
    if (solRef.current) {
      solRef.current.style.opacity = f.solFrac > -0.05 && f.solFrac < 1.05 ? String(limitar(0.4 + f.luz, 0, 1)) : '0';
      solRef.current.style.color = misturarCor('#fff3b0', '#ff8a3d', f.crepusculo);
    }
    const lua = arco(f.luaFrac);
    luaRef.current?.setAttribute('transform', `translate(${n1(lua.x)} ${n1(lua.y)})`);
    if (luaRef.current) {
      luaRef.current.style.opacity = f.luaFrac > -0.05 && f.luaFrac < 1.05 ? String(limitar(1 - f.luz * 1.3, 0, 1)) : '0';
    }
    if (estrelasRef.current) estrelasRef.current.style.opacity = String(noite ** 1.6);

    // Tudo que está em terra tinge com a luz: cinza-azulado à noite, claro de dia.
    if (torreRef.current) torreRef.current.style.color = misturarCor('#2a3a55', '#f1f5f9', f.luz);
    if (longeRef.current) longeRef.current.style.color = misturarCor(misturarCor('#16233a', '#c9d6e6', f.luz), AURORA, f.crepusculo * 0.25);
    if (morrosRef.current) morrosRef.current.style.color = misturarCor(misturarCor('#0f1b30', '#8aa2bb', f.luz), AURORA, f.crepusculo * 0.2);
    soloRef.current?.setAttribute('fill', misturarCor(misturarCor('#0a1424', '#6f8aa5', f.luz), AURORA, f.crepusculo * 0.15));
    if (luzRef.current) luzRef.current.style.opacity = String(0.08 + 0.92 * noite);

    if (relogioRef.current) {
      const h = ((Math.round(s.hora * 60) % 1440) + 1440) % 1440;
      relogioRef.current.textContent = `${String(Math.floor(h / 60)).padStart(2, '0')}:${String(h % 60).padStart(2, '0')}`;
      relogioRef.current.style.opacity = s.sobre ? '1' : '0';
    }

    return s.sobre || s.hora !== s.alvo;
  });

  // Sem ninguém por perto, o céu acompanha o relógio a cada minuto.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (e.current.sobre) return;
      e.current.alvo = horaAgora();
      acordar();
    }, 60_000);
    return () => clearInterval(id);
  }, [acordar]);

  const seguir = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    e.current.sobre = true;
    e.current.alvo = limitar(p.x / CENA_L, 0, 1) * 24;
    acordar();
  };
  const soltar = () => {
    e.current.sobre = false;
    e.current.alvo = horaAgora();
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
        <defs>
          <clipPath id={idMoldura}>
            <rect x="0" y="0" width={CENA_L} height={CENA_A} rx="12" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${idMoldura})`}>
        <rect ref={ceuRef} x="0" y="0" width={CENA_L} height={CENA_A} fill={DIA} />

        <g ref={estrelasRef} fill="#fff" style={{ opacity: 0 }}>
          {ESTRELAS.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
        </g>

        <g ref={solRef} style={{ color: '#fff3b0' }}>
          <circle r="24" fill="currentColor" fillOpacity="0.28" />
          <circle r="13" fill="currentColor" />
        </g>
        <g ref={luaRef} style={{ opacity: 0 }}>
          <circle r="11" fill="#e2e8f0" />
          <circle cx="-3" cy="-2" r="2.4" fill="#cbd5e1" />
          <circle cx="3.5" cy="3.5" r="1.8" fill="#cbd5e1" />
        </g>

        {/* Parque ao fundo, morros e solo */}
        <g ref={longeRef} style={{ color: '#c9d6e6' }}>
          <Turbina x={58} escala={0.5} girar duracao="7s" />
          <Turbina x={252} escala={0.42} girar duracao="8s" />
        </g>
        <g ref={morrosRef} style={{ color: '#8aa2bb' }} fill="currentColor">
          <path d={`M0 ${HORIZONTE} Q60 ${HORIZONTE - 26} 120 ${HORIZONTE} Z`} />
          <path d={`M90 ${HORIZONTE} Q190 ${HORIZONTE - 34} 300 ${HORIZONTE} Z`} />
          <path d={`M230 ${HORIZONTE} Q280 ${HORIZONTE - 20} ${CENA_L} ${HORIZONTE} Z`} />
        </g>
        <rect ref={soloRef} x="0" y={HORIZONTE} width={CENA_L} height={CENA_A - HORIZONTE} fill="#6f8aa5" />

        {/* Torre principal + luz de obstáculo */}
        <g ref={torreRef} style={{ color: '#f1f5f9' }}>
          <Turbina x={160} escala={1} girar duracao="5.5s" />
        </g>
        <g ref={luzRef} style={{ opacity: 0.08 }}>
          <circle className="cena-pisca" cx="157" cy={HORIZONTE - 118} r="2.6" fill="#ef4444" />
        </g>

        <text ref={relogioRef} x="14" y="192" fontSize="11" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif" style={{ opacity: 0, transition: 'opacity .2s' }} />
        </g>
      </svg>
    </CenaMoldura>
  );
}
