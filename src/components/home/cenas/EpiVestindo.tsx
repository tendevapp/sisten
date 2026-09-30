/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "EPI": um colaborador sem nada e quatro equipamentos nas prateleiras
 * dos lados. Clicar (ou tocar) num equipamento o coloca no corpo; completo,
 * o colaborador fica verde com o selo "EPI COMPLETO" e a cena recomeça.
 * Sozinha, a cena vai vestindo um equipamento de cada vez. Desenho apenas: não
 * substitui nem espelha a ficha de EPI do SSMA.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, useMovimentoReduzido } from './util';

const CHAO = 182;
const CX = 160;

interface Item {
  id: 'capacete' | 'oculos' | 'luvas' | 'botas';
  rotulo: string;
  prateleira: { x: number; y: number; escala: number };
  corpo: { x: number; y: number };
}

const ITENS: Item[] = [
  { id: 'capacete', rotulo: 'CAPACETE', prateleira: { x: 46, y: 62, escala: 1 }, corpo: { x: CX, y: 56 } },
  { id: 'oculos', rotulo: 'ÓCULOS', prateleira: { x: 46, y: 118, escala: 1 }, corpo: { x: CX, y: 68 } },
  { id: 'luvas', rotulo: 'LUVAS', prateleira: { x: 274, y: 62, escala: 0.55 }, corpo: { x: CX, y: 128 } },
  { id: 'botas', rotulo: 'BOTAS', prateleira: { x: 274, y: 118, escala: 0.8 }, corpo: { x: CX, y: CHAO - 6 } },
];

function Desenho({ id }: { id: Item['id'] }) {
  switch (id) {
    case 'capacete':
      return (
        <g>
          <path d="M-16 4 C-16 -16 16 -16 16 4 Z" fill="#facc15" stroke="#ca8a04" strokeWidth="1.2" strokeLinejoin="round" />
          <rect x="-20" y="3" width="40" height="5" rx="2.5" fill="#eab308" stroke="#ca8a04" strokeWidth="1" />
          <path d="M-2 -12 V3" stroke="#ca8a04" strokeWidth="1.4" />
        </g>
      );
    case 'oculos':
      return (
        <g>
          <rect x="-15" y="-5" width="13" height="9" rx="4" fill="#bae6fd" fillOpacity="0.7" stroke="#0369a1" strokeWidth="1.6" />
          <rect x="2" y="-5" width="13" height="9" rx="4" fill="#bae6fd" fillOpacity="0.7" stroke="#0369a1" strokeWidth="1.6" />
          <path d="M-2 -1 H2" stroke="#0369a1" strokeWidth="1.6" />
        </g>
      );
    case 'luvas':
      // Um par: as mãos ficam a ±33 do centro do corpo.
      return (
        <g fill="#f5821f" stroke="#c2410c" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M-39 -6 h10 v9 q0 6 -5 6 q-5 0 -5 -6 Z" />
          <path d="M29 -6 h10 v9 q0 6 -5 6 q-5 0 -5 -6 Z" />
        </g>
      );
    default:
      return (
        <g fill="#78350f" stroke="#451a03" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M-6 -10 h9 v8 h6 v6 h-15 Z" transform="translate(-10 0)" />
          <path d="M-6 -10 h9 v8 h6 v6 h-15 Z" transform="translate(10 0)" />
        </g>
      );
  }
}

export default function EpiVestindo() {
  const reduzido = useMovimentoReduzido();
  const [postos, setPostos] = useState<boolean[]>(() => ITENS.map(() => false));
  const timers = useRef<number[]>([]);
  const e = useRef({ postos: ITENS.map(() => false), sobre: false, reduzido, fechando: false });
  e.current.reduzido = reduzido;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const vestir = (i: number) => {
    const s = e.current;
    if (s.postos[i] || s.fechando) return;
    s.postos[i] = true;
    setPostos([...s.postos]);
    if (s.postos.every(Boolean)) {
      s.fechando = true;
      timers.current.push(
        window.setTimeout(() => {
          s.postos = ITENS.map(() => false);
          s.fechando = false;
          setPostos([...s.postos]);
        }, 3400),
      );
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = e.current;
      if (s.sobre || s.reduzido || s.fechando) return;
      const prox = s.postos.findIndex(p => !p);
      if (prox >= 0) vestir(prox);
    }, 1050);
    return () => clearInterval(id);
    // `vestir` só usa refs e setters estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completo = postos.every(Boolean);
  const cor = completo ? '#16a34a' : undefined;

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
        <rect x="0" y={CHAO} width={CENA_L} height={CENA_A - CHAO} className="fill-slate-200 dark:fill-slate-800" />
        {completo && <circle cx={CX} cy="104" r="78" fill="none" stroke="#22c55e" strokeWidth="3" strokeDasharray="6 5" className="cena-pulsa" />}

        {/* Colaborador */}
        <g>
          <rect x="145" y="132" width="12" height="42" rx="3" className="fill-slate-700 dark:fill-slate-500" />
          <rect x="163" y="132" width="12" height="42" rx="3" className="fill-slate-700 dark:fill-slate-500" />
          <rect x="138" y="82" width="44" height="54" rx="10" fill={cor ?? '#475569'} style={{ transition: 'fill .3s' }} />
          <rect x="138" y="112" width="44" height="6" fill="#f5821f" fillOpacity="0.9" />
          <path d="M141 90 L127 124 M179 90 L193 124" stroke={cor ?? '#475569'} strokeWidth="10" strokeLinecap="round" style={{ transition: 'stroke .3s' }} />
          <circle cx="126" cy="127" r="6" fill="#f2c9a0" />
          <circle cx="194" cy="127" r="6" fill="#f2c9a0" />
          <circle cx={CX} cy="66" r="15" fill="#f2c9a0" />
          <circle cx="155" cy="68" r="1.6" fill="#44403c" />
          <circle cx="165" cy="68" r="1.6" fill="#44403c" />
          <path d="M155 75 Q160 79 165 75" fill="none" stroke="#44403c" strokeWidth="1.4" strokeLinecap="round" />
          <ellipse cx="151" cy={CHAO - 3} rx="12" ry="3" className="fill-slate-400/40" />
          <ellipse cx="169" cy={CHAO - 3} rx="12" ry="3" className="fill-slate-400/40" />
        </g>

        {/* Equipamentos: prateleira ou corpo, com deslize suave */}
        {ITENS.map((it, i) => {
          const no = postos[i];
          const alvo = no ? { x: it.corpo.x, y: it.corpo.y, escala: 1 } : it.prateleira;
          return (
            <g key={it.id} onClick={() => vestir(i)} className={no ? undefined : 'cursor-pointer'}>
              <g
                style={{
                  transform: `translate(${alvo.x}px, ${alvo.y}px) scale(${alvo.escala})`,
                  transition: 'transform .6s cubic-bezier(.3,.7,.3,1)',
                }}
              >
                <rect x="-44" y="-26" width="88" height="52" fill="transparent" style={{ display: no ? 'none' : undefined }} />
                <Desenho id={it.id} />
              </g>
              {/* Rótulo da prateleira */}
              <g transform={`translate(${it.prateleira.x} ${it.prateleira.y + 28})`}>
                <text textAnchor="middle" fontSize="7.5" fontWeight="800" letterSpacing="0.6" fill={no ? '#16a34a' : undefined} className={no ? undefined : 'fill-slate-500 dark:fill-slate-300'} fontFamily="system-ui, sans-serif">
                  {no ? `✓ ${it.rotulo}` : it.rotulo}
                </text>
              </g>
            </g>
          );
        })}

        {completo && (
          <g transform="translate(160 28)"><g className="cena-assenta">
            <rect x="-62" y="-12" width="124" height="24" rx="12" fill="#16a34a" />
            <text y="4.5" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="0.8" fill="#fff" fontFamily="system-ui, sans-serif">
              EPI COMPLETO
            </text>
          </g></g>
        )}
      </svg>
    </CenaMoldura>
  );
}
