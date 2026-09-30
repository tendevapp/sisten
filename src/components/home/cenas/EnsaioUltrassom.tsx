/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "ensaio de ultrassom": uma sonda corre sobre uma chapa soldada enquanto
 * o osciloscópio desenha o eco. O pulso de entrada e o eco do fundo estão
 * sempre lá; quando a sonda passa sobre um defeito escondido, surge um eco no
 * meio da tela. Clicar (ou tocar) sobre o defeito o marca na chapa; achados os
 * dois, o osciloscópio fica verde e o ensaio recomeça. Sozinha, a sonda varre
 * e marca o que encontra.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, pontoNoSvg, useMovimentoReduzido, useQuadros } from './util';

const PLACA = { x1: 18, x2: 186, topo: 112, base: 152 };
const X_MIN = PLACA.x1 + 12;
const X_MAX = PLACA.x2 - 12;
const DEFEITOS = [
  { x: 76, y: 128, tipo: 'poros' },
  { x: 146, y: 136, tipo: 'trinca' },
] as const;
const LARGURA_FEIXE = 13;
const TELA = { x: 198, y: 42, w: 114, h: 84 };
const AMOSTRAS = 72;

/** Pico gaussiano: `k` e `k0` em 0..1 ao longo do tempo de voo. */
const pico = (k: number, k0: number, altura: number, larg = 0.022) => altura * Math.exp(-(((k - k0) / larg) ** 2));

export default function EnsaioUltrassom() {
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const sondaRef = useRef<SVGGElement>(null);
  const tracoRef = useRef<SVGPathElement>(null);
  const caboRef = useRef<SVGPathElement>(null);
  const timers = useRef<number[]>([]);
  const [achados, setAchados] = useState<boolean[]>(() => DEFEITOS.map(() => false));
  const [ok, setOk] = useState(false);

  const e = useRef({
    x: 60,
    alvo: 60,
    sobre: false,
    tempo: 0,
    sobDefeito: DEFEITOS.map(() => 0),
    achados: DEFEITOS.map(() => false),
    ok: false,
  });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const depois = (ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms));

  const marcar = (i: number) => {
    const s = e.current;
    if (s.achados[i] || s.ok) return;
    s.achados[i] = true;
    setAchados([...s.achados]);
    if (s.achados.every(Boolean)) {
      s.ok = true;
      setOk(true);
      depois(3200, () => {
        s.achados = DEFEITOS.map(() => false);
        s.sobDefeito = DEFEITOS.map(() => 0);
        s.ok = false;
        setAchados([...s.achados]);
        setOk(false);
      });
    }
  };

  const acordar = useQuadros(dt => {
    const s = e.current;
    const autonomo = !reduzido && !s.sobre;
    s.tempo += dt;
    if (autonomo) s.alvo = 102 + 78 * Math.sin(s.tempo * 0.5);
    s.x += (s.alvo - s.x) * Math.min(1, dt * 9);

    sondaRef.current?.setAttribute('transform', `translate(${n1(s.x)} 0)`);
    caboRef.current?.setAttribute(
      'd',
      `M${n1(s.x)} ${PLACA.topo - 28} C ${n1(s.x)} ${PLACA.topo - 62} ${n1(s.x + 50)} ${PLACA.topo - 78} ${TELA.x - 6} ${TELA.y + TELA.h - 6}`,
    );

    // A-scan: pulso de entrada, eco de fundo e, se a sonda estiver sobre um defeito, o eco dele.
    const prox = DEFEITOS.map(d => Math.exp(-(((s.x - d.x) / LARGURA_FEIXE) ** 2)));
    const pts: string[] = [];
    for (let i = 0; i < AMOSTRAS; i++) {
      const k = i / (AMOSTRAS - 1);
      let v = pico(k, 0.05, 40, 0.03) + pico(k, 0.93, 34 - 10 * Math.max(...prox), 0.028);
      DEFEITOS.forEach((d, j) => {
        v += pico(k, (d.y - PLACA.topo) / (PLACA.base - PLACA.topo) * 0.88 + 0.05, 46 * prox[j]);
      });
      v += (Math.random() - 0.5) * 2.2;
      pts.push(`${n1(TELA.x + 6 + (k * (TELA.w - 12)))} ${n1(TELA.y + TELA.h - 10 - limitar(v, -4, 62))}`);
    }
    tracoRef.current?.setAttribute('d', `M${pts.join(' L')}`);

    if (autonomo && !s.ok) {
      DEFEITOS.forEach((d, i) => {
        if (s.achados[i]) return;
        s.sobDefeito[i] = Math.abs(s.x - d.x) < 4 ? s.sobDefeito[i] + dt : 0;
        if (s.sobDefeito[i] > 0.4) marcar(i);
      });
    }

    // O traço tem ruído: redesenha sempre que a cena estiver viva.
    return !reduzido || s.sobre || Math.abs(s.alvo - s.x) > 0.3;
  });

  const seguir = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    e.current.sobre = true;
    e.current.alvo = limitar(p.x, X_MIN, X_MAX);
    acordar();
  };
  const soltar = () => {
    e.current.sobre = false;
    acordar();
  };
  const clicar = () => {
    const s = e.current;
    DEFEITOS.forEach((d, i) => {
      if (Math.abs(s.x - d.x) <= LARGURA_FEIXE * 0.7) marcar(i);
    });
  };

  const grade = Array.from({ length: 5 }, (_, i) => TELA.x + 6 + ((TELA.w - 12) * i) / 4);

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
        {/* Bancada */}
        <rect x="0" y="168" width={CENA_L} height="32" className="fill-slate-200 dark:fill-slate-800" />

        {/* Chapa em corte, com o cordão de solda no meio */}
        <rect x={PLACA.x1} y={PLACA.topo} width={PLACA.x2 - PLACA.x1} height={PLACA.base - PLACA.topo} rx="3" className="fill-slate-300 stroke-slate-400 dark:fill-slate-600 dark:stroke-slate-500" />
        <path d={`M100 ${PLACA.topo} L108 ${PLACA.base} L116 ${PLACA.base} L124 ${PLACA.topo} Z`} className="fill-slate-400 dark:fill-slate-500" />
        <path d={`M98 ${PLACA.topo} Q112 ${PLACA.topo - 7} 126 ${PLACA.topo}`} fill="#f5821f" fillOpacity="0.6" />

        {/* Defeitos achados: ficam marcados */}
        {DEFEITOS.map(
          (d, i) =>
            achados[i] && (
              <g key={i} transform={`translate(${d.x} ${d.y})`}><g className="cena-assenta">
                {d.tipo === 'poros' ? (
                  <g fill="#1e293b">
                    <circle cx="-5" cy="1" r="2.4" />
                    <circle cx="1" cy="-4" r="1.8" />
                    <circle cx="5" cy="3" r="2.6" />
                  </g>
                ) : (
                  <path d="M0 -9 L-2 -2 L2 3 L0 9" fill="none" stroke="#7f1d1d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                )}
                <circle r="11" fill="none" stroke="#dc2626" strokeWidth="1.6" strokeDasharray="3 2" />
                <line x1="0" x2="0" y1={PLACA.topo - d.y} y2={PLACA.topo - d.y - 16} stroke="#dc2626" strokeWidth="1.4" />
                <path d={`M0 ${PLACA.topo - d.y - 16} h9 l-2.5 3 l2.5 3 h-9 Z`} fill="#dc2626" />
              </g></g>
            ),
        )}

        {/* Cabo da sonda ao osciloscópio (em coordenadas absolutas, acompanha a sonda) */}
        <path ref={caboRef} d={`M60 ${PLACA.topo - 28} C 60 ${PLACA.topo - 62} 110 ${PLACA.topo - 78} ${TELA.x - 6} ${TELA.y + TELA.h - 6}`} fill="none" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="2.2" />

        {/* Sonda e cone de som */}
        <g ref={sondaRef} transform="translate(60 0)" style={{ pointerEvents: 'none' }}>
          <path d={`M-3 ${PLACA.topo} L-13 ${PLACA.base} L13 ${PLACA.base} L3 ${PLACA.topo} Z`} fill="#38bdf8" fillOpacity="0.22" />
          <rect x="-9" y={PLACA.topo - 28} width="18" height="28" rx="4" className="fill-slate-600 dark:fill-slate-200" />
          <rect x="-9" y={PLACA.topo - 4} width="18" height="4" rx="1" fill="#f5821f" />
        </g>

        {/* Osciloscópio */}
        <rect x={TELA.x - 6} y={TELA.y - 8} width={TELA.w + 12} height={TELA.h + 16} rx="8" className="fill-slate-700 dark:fill-slate-900" />
        <rect x={TELA.x} y={TELA.y} width={TELA.w} height={TELA.h} rx="4" fill="#06202b" stroke={ok ? '#22c55e' : '#0e4a5e'} strokeWidth={ok ? 3 : 1.5} style={{ transition: 'stroke .2s' }} />
        {grade.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={TELA.y + 4} y2={TELA.y + TELA.h - 4} stroke="#0e4a5e" strokeWidth="0.8" />
        ))}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={TELA.x + 4} x2={TELA.x + TELA.w - 4} y1={TELA.y + TELA.h * f} y2={TELA.y + TELA.h * f} stroke="#0e4a5e" strokeWidth="0.8" />
        ))}
        <path ref={tracoRef} fill="none" stroke={ok ? '#4ade80' : '#22d3ee'} strokeWidth="1.6" strokeLinejoin="round" />
        <text x={TELA.x + TELA.w / 2} y={TELA.y + TELA.h + 22} textAnchor="middle" fontSize="8" fontWeight="800" letterSpacing="1.2" className="fill-slate-500 dark:fill-slate-400" fontFamily="system-ui, sans-serif">
          {ok ? 'CHAPA CONFERIDA' : `A-SCAN · ${achados.filter(Boolean).length}/${DEFEITOS.length}`}
        </text>
      </svg>
    </CenaMoldura>
  );
}
