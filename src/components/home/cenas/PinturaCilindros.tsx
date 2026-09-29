/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "pintura": quatro troncos de torre em aço cru. O mouse (ou o dedo) vira
 * uma pistola de pintura e vai deixando tinta branca por onde passa. A tinta é
 * uma máscara: cada respingo é um círculo suave somado à máscara da camada
 * branca. Quando quase tudo está pintado, brilham umas estrelinhas e, alguns
 * segundos depois, o aço cru volta para pintar de novo.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, pontoNoSvg, useIdSvg } from './util';

const NS = 'http://www.w3.org/2000/svg';
const CIL_L = 46;
const CIL_TOPO = 64;
const CIL_BASE = 176;
const CIL_X = [29, 101, 173, 245];
const RAIO_RESPINGO = 11;
const CELULA = 6;
const RAIO_CELULA = 8;
const META = 0.93;

/** Centros das células de 6×6 dentro dos troncos: é o que se conta como "pintado". */
const CELULAS: [number, number][] = CIL_X.flatMap(x => {
  const out: [number, number][] = [];
  for (let cy = CIL_TOPO - 3; cy < CIL_BASE; cy += CELULA) {
    for (let cx = x + CELULA / 2; cx < x + CIL_L; cx += CELULA) out.push([cx, cy]);
  }
  return out;
});

const sobreTronco = (x: number, y: number) =>
  y >= CIL_TOPO - 6 && y <= CIL_BASE + 6 && CIL_X.some(cx => x >= cx - 4 && x <= cx + CIL_L + 4);

const corpo = (x: number) =>
  `M${x} ${CIL_TOPO} L${x} ${CIL_BASE} A${CIL_L / 2} 6 0 0 0 ${x + CIL_L} ${CIL_BASE} L${x + CIL_L} ${CIL_TOPO} Z`;

const REPOUSO = { x: 300, y: 34 };
const estiloPistola = (x: number, y: number) => `translate(${x}px, ${y}px) rotate(-15deg)`;

const ESTRELAS = [
  [46, 44], [126, 34], [198, 42], [268, 36], [88, 58], [232, 56],
] as const;

export default function PinturaCilindros() {
  const idMascara = useIdSvg('pm');
  const idRespingo = useIdSvg('pr');
  const idSombra = useIdSvg('ps');
  const svgRef = useRef<SVGSVGElement>(null);
  const massaRef = useRef<SVGGElement>(null);
  const camadaRef = useRef<SVGGElement>(null);
  const pistolaRef = useRef<SVGGElement>(null);
  const flutuaRef = useRef<SVGGElement>(null);
  const volta = useRef(0);
  const jatoRef = useRef<SVGGElement>(null);
  const timers = useRef<number[]>([]);
  const e = useRef({
    pintadas: new Uint8Array(CELULAS.length),
    total: 0,
    ultimo: null as { x: number; y: number } | null,
    completo: false,
  });
  const [brilho, setBrilho] = useState(0);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      clearTimeout(volta.current);
    },
    [],
  );

  const respingar = (x: number, y: number) => {
    const s = e.current;
    let novas = 0;
    for (let i = 0; i < CELULAS.length; i++) {
      if (s.pintadas[i]) continue;
      if (Math.hypot(CELULAS[i][0] - x, CELULAS[i][1] - y) <= RAIO_CELULA) {
        s.pintadas[i] = 1;
        novas++;
      }
    }
    if (!novas) return;
    s.total += novas;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x.toFixed(1));
    c.setAttribute('cy', y.toFixed(1));
    c.setAttribute('r', String(RAIO_RESPINGO));
    c.setAttribute('fill', `url(#${idRespingo})`);
    massaRef.current?.appendChild(c);
  };

  const recomecar = () => {
    const s = e.current;
    s.pintadas.fill(0);
    s.total = 0;
    s.completo = false;
    massaRef.current?.replaceChildren();
    if (camadaRef.current) {
      camadaRef.current.style.transition = 'none';
      camadaRef.current.style.opacity = '1';
    }
    setBrilho(0);
  };

  const concluir = () => {
    const s = e.current;
    s.completo = true;
    setBrilho(b => b + 1);
    timers.current.push(
      window.setTimeout(() => {
        if (camadaRef.current) {
          camadaRef.current.style.transition = 'opacity .8s';
          camadaRef.current.style.opacity = '0';
        }
      }, 3200),
      window.setTimeout(recomecar, 4100),
    );
  };

  const pintarAte = (x: number, y: number) => {
    const s = e.current;
    if (s.completo) return;
    const de = s.ultimo;
    if (de && sobreTronco(x, y)) {
      const dist = Math.hypot(x - de.x, y - de.y);
      const passos = Math.max(1, Math.ceil(dist / 5));
      for (let i = 1; i <= passos; i++) respingar(de.x + ((x - de.x) * i) / passos, de.y + ((y - de.y) * i) / passos);
    } else if (sobreTronco(x, y)) {
      respingar(x, y);
    }
    s.ultimo = { x, y };
    if (s.total / CELULAS.length >= META) concluir();
  };

  const mover = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const pistola = pistolaRef.current;
    if (pistola) {
      clearTimeout(volta.current);
      pistola.style.transition = 'none';
      pistola.style.transform = estiloPistola(p.x + 15, p.y - 4);
      flutuaRef.current?.classList.remove('cena-flutua');
    }
    if (jatoRef.current) jatoRef.current.style.opacity = sobreTronco(p.x, p.y) && !e.current.completo ? '1' : '0';
    pintarAte(p.x, p.y);
  };

  const sair = () => {
    e.current.ultimo = null;
    if (jatoRef.current) jatoRef.current.style.opacity = '0';
    const pistola = pistolaRef.current;
    if (pistola) {
      pistola.style.transition = 'transform .5s ease';
      pistola.style.transform = estiloPistola(REPOUSO.x, REPOUSO.y);
      volta.current = window.setTimeout(() => flutuaRef.current?.classList.add('cena-flutua'), 500);
    }
  };

  return (
    <CenaMoldura>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full touch-pan-y"
        onPointerMove={mover}
        onPointerDown={mover}
        onPointerLeave={sair}
        onPointerCancel={sair}
      >
        <defs>
          <radialGradient id={idRespingo}>
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={idSombra} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.2" />
          </linearGradient>
          <mask id={idMascara} maskUnits="userSpaceOnUse" x="0" y="0" width={CENA_L} height={CENA_A}>
            <g ref={massaRef} />
          </mask>
        </defs>

        <rect x="0" y="180" width={CENA_L} height="20" className="fill-slate-200 dark:fill-slate-800" />

        {CIL_X.map(x => (
          <g key={x}>
            {/* Sombra no chão */}
            <ellipse cx={x + CIL_L / 2 + 6} cy="182" rx={CIL_L / 2 + 6} ry="4" className="fill-slate-900/10 dark:fill-black/30" />
            {/* Aço cru */}
            <path d={corpo(x)} className="fill-slate-400 dark:fill-slate-500" />
            <ellipse cx={x + CIL_L / 2} cy={CIL_TOPO} rx={CIL_L / 2} ry="6" className="fill-slate-300 dark:fill-slate-400" />
            <line x1={x} x2={x + CIL_L} y1="100" y2="100" className="stroke-slate-500/60 dark:stroke-slate-300/40" strokeWidth="1.2" />
            <line x1={x} x2={x + CIL_L} y1="140" y2="140" className="stroke-slate-500/60 dark:stroke-slate-300/40" strokeWidth="1.2" />
          </g>
        ))}

        {/* Camada de tinta branca, revelada pela máscara */}
        <g ref={camadaRef} mask={`url(#${idMascara})`}>
          {CIL_X.map(x => (
            <g key={x} fill="#fff">
              <path d={corpo(x)} />
              <ellipse cx={x + CIL_L / 2} cy={CIL_TOPO} rx={CIL_L / 2} ry="6" />
              <line x1={x} x2={x + CIL_L} y1="100" y2="100" stroke="#cbd5e1" strokeWidth="1" />
              <line x1={x} x2={x + CIL_L} y1="140" y2="140" stroke="#cbd5e1" strokeWidth="1" />
            </g>
          ))}
        </g>

        {/* Volume por cima de tudo + contorno */}
        {CIL_X.map(x => (
          <g key={x}>
            <path d={corpo(x)} fill={`url(#${idSombra})`} />
            <path d={corpo(x)} fill="none" className="stroke-slate-400 dark:stroke-slate-600" strokeWidth="1" />
            <ellipse cx={x + CIL_L / 2} cy={CIL_TOPO} rx={CIL_L / 2} ry="6" fill="none" className="stroke-slate-400 dark:stroke-slate-600" strokeWidth="1" />
          </g>
        ))}

        {/* Estrelinhas de tinta seca */}
        {brilho > 0 && (
          <g key={brilho} fill="#f5821f">
            {ESTRELAS.map(([x, y], i) => (
              <path
                key={i}
                className="cena-brilho"
                style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.18}s` }}
                d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`}
              />
            ))}
          </g>
        )}

        {/* Pistola: segue o ponteiro; em repouso flutua no canto */}
        <g ref={pistolaRef} style={{ transform: estiloPistola(REPOUSO.x, REPOUSO.y) }}>
          <g ref={flutuaRef} className="cena-flutua">
            <g ref={jatoRef} style={{ opacity: 0, transition: 'opacity .1s' }}>
              <path d="M0 0 L-15 -7 L-15 7 Z" className="fill-slate-400/40 dark:fill-slate-200/40" />
            </g>
            <rect x="0" y="-2" width="8" height="4" rx="1" className="fill-slate-500 dark:fill-slate-300" />
            <rect x="8" y="-6" width="24" height="12" rx="4" className="fill-slate-600 dark:fill-slate-200" />
            <rect x="13" y="-17" width="13" height="11" rx="2.5" fill="#f5821f" />
            <path d="M24 5 L20 22 H28 L31 5 Z" className="fill-slate-700 dark:fill-slate-300" />
          </g>
        </g>
      </svg>
    </CenaMoldura>
  );
}
