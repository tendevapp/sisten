/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "inspeção de qualidade": um tronco de torre com quatro defeitos que só
 * aparecem sob a lupa. Passar o mouse (ou o dedo) move a lupa; clicar num
 * defeito dentro dela carimba "NCR" no lugar. Com os quatro achados, o tronco
 * ganha o selo de inspecionado e a cena recomeça. Sozinha, a lupa passeia e
 * carimba o que encontra.
 *
 * Os defeitos ficam numa camada recortada por um círculo (o da lupa), movido
 * por atributo a cada quadro; os já achados saem do recorte e ficam à mostra.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, n1, pontoNoSvg, useIdSvg, useMovimentoReduzido, useQuadros } from './util';

const TRONCO = { x1: 56, y1: 56, x2: 264, y2: 160 };
const RAIO = 24;
const DEFEITOS = [
  { x: 96, y: 96, tipo: 'trinca' },
  { x: 150, y: 78, tipo: 'respingo' },
  { x: 176, y: 132, tipo: 'poros' },
  { x: 226, y: 104, tipo: 'mossa' },
] as const;
type Tipo = (typeof DEFEITOS)[number]['tipo'];

function Defeito({ tipo }: { tipo: Tipo }) {
  switch (tipo) {
    case 'trinca':
      return <path d="M-11 -6 L-4 -1 L-7 4 L1 8 L-1 12" fill="none" stroke="#7f1d1d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
    case 'respingo':
      return (
        <g fill="#f5821f">
          <circle cx="-6" cy="-3" r="2.2" />
          <circle cx="2" cy="4" r="1.6" />
          <circle cx="7" cy="-5" r="2.6" />
          <circle cx="-1" cy="-9" r="1.3" />
        </g>
      );
    case 'poros':
      return (
        <g fill="#1e293b">
          <circle cx="-6" cy="2" r="2.4" />
          <circle cx="1" cy="-4" r="1.8" />
          <circle cx="6" cy="4" r="2.8" />
        </g>
      );
    default:
      return <ellipse cx="0" cy="0" rx="9" ry="6" fill="#475569" fillOpacity="0.55" stroke="#1e293b" strokeWidth="1.2" />;
  }
}

export default function InspecaoQualidade() {
  const idRecorte = useIdSvg('iq');
  const idCilindro = useIdSvg('ig');
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const lupaRef = useRef<SVGGElement>(null);
  const recorteRef = useRef<SVGCircleElement>(null);
  const timers = useRef<number[]>([]);
  const [achados, setAchados] = useState<boolean[]>(() => DEFEITOS.map(() => false));
  const [selo, setSelo] = useState(false);

  const e = useRef({
    x: 160,
    y: 108,
    alvoX: 160,
    alvoY: 108,
    sobre: false,
    tempo: 0,
    sobDefeito: DEFEITOS.map(() => 0), // segundos com a lupa em cima (modo sozinho)
    achados: DEFEITOS.map(() => false),
    selo: false,
  });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const depois = (ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms));

  const marcar = (i: number) => {
    const s = e.current;
    if (s.achados[i] || s.selo) return;
    s.achados[i] = true;
    setAchados([...s.achados]);
    if (s.achados.every(Boolean)) {
      s.selo = true;
      depois(700, () => setSelo(true));
      depois(4200, () => {
        s.achados = DEFEITOS.map(() => false);
        s.sobDefeito = DEFEITOS.map(() => 0);
        s.selo = false;
        setAchados([...s.achados]);
        setSelo(false);
      });
    }
  };

  const acordar = useQuadros(dt => {
    const s = e.current;
    const autonomo = !reduzido && !s.sobre;
    s.tempo += dt;
    if (autonomo) {
      s.alvoX = 160 + 92 * Math.sin(s.tempo * 0.47);
      s.alvoY = 108 + 38 * Math.sin(s.tempo * 0.83 + 1);
    }
    const k = Math.min(1, dt * 8);
    s.x += (s.alvoX - s.x) * k;
    s.y += (s.alvoY - s.y) * k;

    lupaRef.current?.setAttribute('transform', `translate(${n1(s.x)} ${n1(s.y)})`);
    recorteRef.current?.setAttribute('cx', n1(s.x));
    recorteRef.current?.setAttribute('cy', n1(s.y));

    if (autonomo && !s.selo) {
      DEFEITOS.forEach((d, i) => {
        if (s.achados[i]) return;
        const perto = Math.hypot(d.x - s.x, d.y - s.y) < RAIO * 0.5;
        s.sobDefeito[i] = perto ? s.sobDefeito[i] + dt : 0;
        if (s.sobDefeito[i] > 0.45) marcar(i);
      });
    }

    return !reduzido || s.sobre || Math.abs(s.alvoX - s.x) > 0.3 || Math.abs(s.alvoY - s.y) > 0.3;
  });

  const seguir = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const s = e.current;
    s.sobre = true;
    s.alvoX = p.x;
    s.alvoY = p.y;
    acordar();
  };
  const soltar = () => {
    e.current.sobre = false;
    acordar();
  };
  const clicar = () => {
    const s = e.current;
    DEFEITOS.forEach((d, i) => {
      if (Math.hypot(d.x - s.x, d.y - s.y) <= RAIO) marcar(i);
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
        <defs>
          <clipPath id={idRecorte}>
            <circle ref={recorteRef} cx="160" cy="108" r={RAIO} />
          </clipPath>
          <linearGradient id={idCilindro} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.28" />
          </linearGradient>
        </defs>

        {/* Bancada */}
        <rect x="0" y="176" width={CENA_L} height="24" className="fill-slate-200 dark:fill-slate-800" />
        <rect x="40" y="164" width="240" height="12" rx="3" className="fill-slate-400 dark:fill-slate-600" />

        {/* Tronco de torre, visto de lado */}
        <rect
          x={TRONCO.x1}
          y={TRONCO.y1}
          width={TRONCO.x2 - TRONCO.x1}
          height={TRONCO.y2 - TRONCO.y1}
          rx="6"
          className="fill-slate-300 stroke-slate-400 dark:fill-slate-500 dark:stroke-slate-400"
        />
        <rect x={TRONCO.x1} y={TRONCO.y1} width={TRONCO.x2 - TRONCO.x1} height={TRONCO.y2 - TRONCO.y1} rx="6" fill={`url(#${idCilindro})`} />
        <rect x={TRONCO.x1 - 3} y={TRONCO.y1} width="6" height={TRONCO.y2 - TRONCO.y1} rx="2" className="fill-slate-500 dark:fill-slate-300" />
        <rect x={TRONCO.x2 - 3} y={TRONCO.y1} width="6" height={TRONCO.y2 - TRONCO.y1} rx="2" className="fill-slate-500 dark:fill-slate-300" />

        {/* Defeitos ocultos: só aparecem dentro do círculo da lupa */}
        <g clipPath={`url(#${idRecorte})`}>
          {DEFEITOS.map((d, i) => (
            <g key={i} transform={`translate(${d.x} ${d.y})`}>
              <Defeito tipo={d.tipo} />
            </g>
          ))}
        </g>

        {/* Defeitos achados: ficam à mostra, com anel e carimbo */}
        {DEFEITOS.map(
          (d, i) =>
            achados[i] && (
              <g key={i} transform={`translate(${d.x} ${d.y})`}>
                <Defeito tipo={d.tipo} />
                <circle r="14" fill="none" stroke="#dc2626" strokeWidth="1.6" strokeDasharray="3 2" />
                <g transform="translate(6 -18) rotate(-12)" className="cena-assenta">
                  <rect x="-13" y="-6.5" width="26" height="13" rx="2.5" fill="#fff" stroke="#dc2626" strokeWidth="1.6" className="dark:fill-slate-900" />
                  <text x="0" y="3.4" textAnchor="middle" fontSize="9" fontWeight="800" fill="#dc2626" fontFamily="system-ui, sans-serif">
                    NCR
                  </text>
                </g>
              </g>
            ),
        )}

        {/* Selo final */}
        {selo && (
          <g transform="translate(160 108) rotate(-8)" className="cena-assenta">
            <rect x="-68" y="-16" width="136" height="32" rx="6" fill="#fff" fillOpacity="0.92" stroke="#16a34a" strokeWidth="3" className="dark:fill-slate-900" />
            <text x="0" y="6" textAnchor="middle" fontSize="14" fontWeight="800" fill="#16a34a" fontFamily="system-ui, sans-serif" letterSpacing="0.6">
              INSPECIONADO
            </text>
          </g>
        )}

        {/* Lupa */}
        <g ref={lupaRef} transform="translate(160 108)" style={{ pointerEvents: 'none' }}>
          <circle r={RAIO} fill="#bae6fd" fillOpacity="0.16" className="stroke-slate-600 dark:stroke-slate-200" strokeWidth="3" />
          <path d={`M${RAIO * 0.7} ${RAIO * 0.7} L${RAIO * 1.35} ${RAIO * 1.35}`} className="stroke-slate-700 dark:stroke-slate-100" strokeWidth="6" strokeLinecap="round" />
          <path d="M-14 -9 A17 17 0 0 1 -6 -16" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </svg>
    </CenaMoldura>
  );
}
