/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "torque em estrela": o flange de uma torre com 12 parafusos. O aperto
 * certo é em estrela — sempre o oposto do último, girando um quarto de volta —,
 * para a carga se distribuir por igual. Clicar (ou tocar) os parafusos na ordem
 * aperta; fora de ordem a chave trava e a cena mostra qual era o próximo. Com
 * os 12, aparece o selo de torque ok e o flange recomeça. Sozinha, a cena
 * aperta em estrela e erra de propósito uma vez por rodada, para mostrar o aviso.
 * A ordem vem de `ordemTorque` (`lib/cenaInicioLogica.ts`).
 */

import React, { useEffect, useRef, useState } from 'react';
import { ordemTorque } from '../../../lib/cenaInicioLogica';
import { CENA_A, CENA_L, CenaMoldura, useMovimentoReduzido } from './util';

const N = 12;
const CX = 160;
const CY = 100;
const R_FLANGE = 82;
const R_FURO = 28;
const R_PARAFUSO = 55;
const ORDEM = ordemTorque(N);
const INTERVALO = 620; // ms entre apertos no modo sozinho

const angulo = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
const posicao = (i: number) => ({ x: CX + R_PARAFUSO * Math.cos(angulo(i)), y: CY + R_PARAFUSO * Math.sin(angulo(i)) });

const HEXAGONO = Array.from({ length: 6 }, (_, k) => {
  const a = (k * Math.PI) / 3;
  return `${(9.5 * Math.cos(a)).toFixed(1)},${(9.5 * Math.sin(a)).toFixed(1)}`;
}).join(' ');

export default function TorqueFlange() {
  const reduzido = useMovimentoReduzido();
  const [etapa, setEtapa] = useState(0);
  const [erro, setErro] = useState<number | null>(null);
  const [dica, setDica] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const e = useRef({ etapa: 0, sobre: false, fechado: false, errou: false, reduzido });
  e.current.reduzido = reduzido;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const depois = (ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms));

  const apertar = (i: number) => {
    const s = e.current;
    if (s.fechado || ORDEM.slice(0, s.etapa).includes(i)) return;
    if (i === ORDEM[s.etapa]) {
      s.etapa += 1;
      setEtapa(s.etapa);
      setErro(null);
      setDica(null);
      if (s.etapa === N) {
        s.fechado = true;
        depois(3400, () => {
          s.etapa = 0;
          s.fechado = false;
          s.errou = false;
          setEtapa(0);
        });
      }
      return;
    }
    // Fora de ordem: a chave trava e mostra o parafuso certo.
    setErro(i);
    setDica(ORDEM[s.etapa]);
    depois(700, () => setErro(null));
    depois(1600, () => setDica(null));
  };

  // Modo sozinho: aperta em estrela e erra uma vez por rodada.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = e.current;
      if (s.sobre || s.reduzido || s.fechado) return;
      if (s.etapa === 4 && !s.errou) {
        s.errou = true;
        const errado = [...Array(N).keys()].find(i => !ORDEM.slice(0, s.etapa).includes(i) && i !== ORDEM[s.etapa])!;
        apertar(errado);
        return;
      }
      apertar(ORDEM[s.etapa]);
    }, INTERVALO);
    return () => clearInterval(id);
    // `apertar` só mexe em refs e setters estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apertados = new Set(ORDEM.slice(0, etapa));
  const ultimo = etapa > 0 ? ORDEM[etapa - 1] : null;
  const fechado = etapa === N;

  return (
    <CenaMoldura>
      <svg
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full touch-pan-y"
        onPointerEnter={() => {
          e.current.sobre = true;
        }}
        onPointerLeave={() => {
          e.current.sobre = false;
        }}
      >
        <ellipse cx={CX + 6} cy={CY + R_FLANGE + 6} rx={R_FLANGE * 0.9} ry="6" className="fill-slate-900/10 dark:fill-black/30" />

        {/* Flange */}
        <circle cx={CX} cy={CY} r={R_FLANGE} className="fill-slate-300 stroke-slate-400 dark:fill-slate-600 dark:stroke-slate-400" strokeWidth="2.5" />
        <circle cx={CX} cy={CY} r={R_FLANGE - 8} fill="none" className="stroke-white/60 dark:stroke-white/15" strokeWidth="1.5" />
        <circle cx={CX} cy={CY} r={R_FURO + 8} className="fill-slate-400 dark:fill-slate-500" />
        <circle cx={CX} cy={CY} r={R_FURO} className="fill-slate-100 stroke-slate-500 dark:fill-slate-800 dark:stroke-slate-300" strokeWidth="2" />

        {/* Parafusos */}
        {Array.from({ length: N }, (_, i) => {
          const { x, y } = posicao(i);
          const apertado = apertados.has(i);
          return (
            <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} onClick={() => apertar(i)} className="cursor-pointer">
              <circle r="14" fill="transparent" />
              {dica === i && <circle r="14" fill="none" stroke="#f5821f" strokeWidth="2.4" strokeDasharray="4 3" className="cena-pulsa" />}
              <polygon
                points={HEXAGONO}
                className={apertado ? 'cena-assenta' : 'fill-slate-500 dark:fill-slate-300'}
                fill={apertado ? '#22c55e' : undefined}
                stroke={erro === i ? '#ef4444' : apertado ? '#15803d' : '#475569'}
                strokeWidth={erro === i ? 2.6 : 1.4}
              />
              <circle r="3.6" fill={apertado ? '#15803d' : '#334155'} fillOpacity={apertado ? 0.55 : 0.5} />
              {erro === i && (
                <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" />
              )}
            </g>
          );
        })}

        {/* Chave no último parafuso apertado */}
        {ultimo !== null && !fechado && (
          <g key={etapa} transform={`translate(${posicao(ultimo).x.toFixed(1)} ${posicao(ultimo).y.toFixed(1)}) rotate(${(angulo(ultimo) * 180) / Math.PI})`} style={{ pointerEvents: 'none' }}>
            <g className="cena-assenta">
              <rect x="6" y="-3" width="34" height="6" rx="3" fill="#f5821f" />
              <circle r="12" fill="none" stroke="#f5821f" strokeWidth="3" strokeDasharray="14 9" />
            </g>
          </g>
        )}

        {/* Placar no furo */}
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize="15" fontWeight="800" className="fill-slate-600 dark:fill-slate-300" fontFamily="system-ui, sans-serif">
          {etapa}/{N}
        </text>

        {/* Selo final */}
        {fechado && (
          <g transform={`translate(${CX} ${CY}) rotate(-8)`}><g className="cena-assenta">
            <rect x="-62" y="-17" width="124" height="34" rx="7" fill="#fff" fillOpacity="0.95" stroke="#16a34a" strokeWidth="3" className="dark:fill-slate-900" />
            <text x="0" y="6" textAnchor="middle" fontSize="16" fontWeight="800" letterSpacing="0.8" fill="#16a34a" fontFamily="system-ui, sans-serif">
              TORQUE OK
            </text>
          </g></g>
        )}
      </svg>
    </CenaMoldura>
  );
}
