/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "paquímetro": a mandíbula móvel vai e volta em volta de uma peça de
 * 24 mm. Clicar (ou tocar) trava a leitura: dentro de ±0,5 mm carimba
 * "APROVADO"; fora, "RETRABALHO". Sozinho, o paquímetro mede em ciclos,
 * alternando acertos e erros. A regra está em `medidaDentro`
 * (`lib/cenaInicioLogica.ts`).
 */

import React, { useEffect, useRef, useState } from 'react';
import { medidaDentro } from '../../../lib/cenaInicioLogica';
import { CENA_A, CENA_L, CenaMoldura, n1, useIdSvg, useMovimentoReduzido, useQuadros } from './util';

const NOMINAL = 24;
const TOLERANCIA = 0.5;
const AMPLITUDE = 2.6;
const PX_MM = 8;
const X0 = 40; // onde a leitura é 0 (mandíbula fixa)
const PECA_Y = 106;
const PECA_H = 44;
const PAUSA = 1.7; // segundos com o carimbo na tela

const xLeitura = (mm: number) => X0 + mm * PX_MM;

type Veredito = 'aprovado' | 'retrabalho';

export default function Paquimetro() {
  const idPeca = useIdSvg('pq');
  const reduzido = useMovimentoReduzido();
  const moveisRef = useRef<SVGGElement>(null);
  const displayRef = useRef<SVGTextElement>(null);
  const timers = useRef<number[]>([]);
  const [veredito, setVeredito] = useState<Veredito | null>(null);

  const e = useRef({
    t: 0,
    leitura: NOMINAL + AMPLITUDE,
    sobre: false,
    pausa: 0,
    autoT: 0,
    tentativa: 0,
  });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const medir = () => {
    const s = e.current;
    if (s.pausa > 0) return;
    const ok = medidaDentro(s.leitura, NOMINAL, TOLERANCIA);
    setVeredito(ok ? 'aprovado' : 'retrabalho');
    s.pausa = PAUSA;
    s.autoT = 0;
    s.tentativa += 1;
    timers.current.push(window.setTimeout(() => setVeredito(null), PAUSA * 1000));
  };

  const acordar = useQuadros(dt => {
    const s = e.current;
    const andando = !reduzido || s.sobre;

    if (s.pausa > 0) s.pausa = Math.max(0, s.pausa - dt);
    else if (andando) {
      s.t += dt;
      s.leitura = NOMINAL + AMPLITUDE * Math.sin(s.t * 1.6 + 1.2);
      s.autoT += dt;
      if (!reduzido && !s.sobre && s.autoT > 1.6) {
        // Sozinho: uma medida boa, uma ruim.
        const d = Math.abs(s.leitura - NOMINAL);
        const hora = s.tentativa % 2 === 0 ? d < 0.25 : d > 1.0 && d < 1.4;
        if (hora) medir();
      }
    }

    moveisRef.current?.setAttribute('transform', `translate(${n1(s.leitura * PX_MM)} 0)`);
    if (displayRef.current) displayRef.current.textContent = s.leitura.toFixed(2);

    return !reduzido || s.sobre || s.pausa > 0;
  });

  return (
    <CenaMoldura>
      <svg
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full cursor-pointer touch-pan-y"
        onPointerEnter={() => {
          e.current.sobre = true;
          acordar();
        }}
        onPointerLeave={() => {
          e.current.sobre = false;
          acordar();
        }}
        onClick={() => {
          medir();
          acordar();
        }}
      >
        <defs>
          <linearGradient id={idPeca} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* Bancada e peça de 24 mm */}
        <rect x="0" y="168" width={CENA_L} height="32" className="fill-slate-200 dark:fill-slate-800" />
        <rect x={X0} y={PECA_Y} width={NOMINAL * PX_MM} height={PECA_H} rx="2" className="fill-slate-400 stroke-slate-500 dark:fill-slate-500 dark:stroke-slate-300" />
        <rect x={X0} y={PECA_Y} width={NOMINAL * PX_MM} height={PECA_H} rx="2" fill={`url(#${idPeca})`} />
        <text x={X0 + (NOMINAL * PX_MM) / 2} y={PECA_Y + PECA_H / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" className="fill-white/80" fontFamily="system-ui, sans-serif">
          24 mm
        </text>

        {/* Régua: corpo, faixa de tolerância e traços */}
        <rect x="16" y="56" width="272" height="24" rx="3" className="fill-slate-300 stroke-slate-400 dark:fill-slate-600 dark:stroke-slate-500" />
        <rect x={xLeitura(NOMINAL - TOLERANCIA)} y="80" width={2 * TOLERANCIA * PX_MM} height="7" fill="#22c55e" />
        <text x={xLeitura(NOMINAL)} y="98" textAnchor="middle" fontSize="7" fontWeight="700" fill="#22c55e" fontFamily="system-ui, sans-serif">
          ±0,5
        </text>
        {Array.from({ length: 31 }, (_, mm) => (
          <g key={mm}>
            <line x1={xLeitura(mm)} x2={xLeitura(mm)} y1="80" y2={mm % 5 === 0 ? 71 : 75} className="stroke-slate-600 dark:stroke-slate-300" strokeWidth={mm % 5 === 0 ? 1.2 : 0.8} />
            {mm % 10 === 0 && (
              <text x={xLeitura(mm)} y="68" textAnchor="middle" fontSize="7" className="fill-slate-600 dark:fill-slate-300" fontFamily="system-ui, sans-serif">
                {mm}
              </text>
            )}
          </g>
        ))}

        {/* Mandíbula fixa */}
        <rect x={X0 - 9} y="56" width="9" height="96" rx="2" className="fill-slate-500 dark:fill-slate-300" />

        {/* Parte móvel: cursor, mandíbula e display */}
        <g ref={moveisRef} transform={`translate(${(NOMINAL + AMPLITUDE) * PX_MM} 0)`}>
          <rect x={X0} y="56" width="9" height="96" rx="2" className="fill-slate-500 dark:fill-slate-300" />
          <rect x={X0 - 4} y="40" width="64" height="44" rx="6" className="fill-slate-600 dark:fill-slate-200" />
          <rect x={X0 + 2} y="45" width="52" height="18" rx="3" fill="#0f172a" />
          <text ref={displayRef} x={X0 + 28} y="58" textAnchor="middle" fontSize="12" fontWeight="700" fill="#4ade80" fontFamily="ui-monospace, monospace">
            26.60
          </text>
          <circle cx={X0 + 14} cy="73" r="4" fill="#f5821f" />
        </g>

        {/* Carimbo */}
        {veredito && (
          <g transform="translate(160 132) rotate(-7)"><g className="cena-assenta">
            <rect
              x="-64"
              y="-17"
              width="128"
              height="34"
              rx="7"
              fill="#fff"
              fillOpacity="0.94"
              stroke={veredito === 'aprovado' ? '#16a34a' : '#dc2626'}
              strokeWidth="3"
              className="dark:fill-slate-900"
            />
            <text x="0" y="6" textAnchor="middle" fontSize="15" fontWeight="800" letterSpacing="0.6" fill={veredito === 'aprovado' ? '#16a34a' : '#dc2626'} fontFamily="system-ui, sans-serif">
              {veredito === 'aprovado' ? 'APROVADO' : 'RETRABALHO'}
            </text>
          </g></g>
        )}
      </svg>
    </CenaMoldura>
  );
}
