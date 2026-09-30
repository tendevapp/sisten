/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "jateamento": três troncos de torre cobertos de ferrugem. O mouse (ou o
 * dedo) é o bico do jato e vai deixando o aço limpo por onde passa — o inverso
 * da cena de pintura: a ferrugem é a camada de cima, recortada por uma máscara
 * onde cada passada é um círculo suave preto. Sozinho, o bico varre os troncos.
 * Com quase tudo limpo, brilha e, segundos depois, a ferrugem volta.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, pontoNoSvg, useIdSvg, useMovimentoReduzido, useQuadros } from './util';

const NS = 'http://www.w3.org/2000/svg';
const CIL_L = 62;
const CIL_TOPO = 62;
const CIL_BASE = 176;
const CIL_X = [30, 129, 228];
const RAIO_JATO = 12;
const CELULA = 6;
const RAIO_CELULA = 9;
const META = 0.94;
const N_POEIRA = 22;

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

/** Manchas de ferrugem fixas (sempre as mesmas, para a cena não "tremer" ao recomeçar). */
const MANCHAS = CIL_X.flatMap((x, t) =>
  Array.from({ length: 9 }, (_, k) => ({
    cx: x + 6 + ((k * 37 + t * 19) % (CIL_L - 12)),
    cy: CIL_TOPO + 10 + ((k * 53 + t * 29) % (CIL_BASE - CIL_TOPO - 20)),
    r: 5 + ((k * 7 + t) % 6),
  })),
);

interface Poeira {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
}

export default function Jateamento() {
  const idMascara = useIdSvg('jm');
  const idPreto = useIdSvg('jp');
  const idSombra = useIdSvg('js');
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const massaRef = useRef<SVGGElement>(null);
  const camadaRef = useRef<SVGGElement>(null);
  const bicoRef = useRef<SVGGElement>(null);
  const jatoRef = useRef<SVGGElement>(null);
  const poeiraRefs = useRef<(SVGCircleElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  const [brilho, setBrilho] = useState(0);

  const e = useRef({
    limpas: new Uint8Array(CELULAS.length),
    total: 0,
    completo: false,
    ultimo: null as { x: number; y: number } | null,
    x: 160,
    y: 120,
    alvoX: 160,
    alvoY: 120,
    sobre: false,
    tempo: 0,
    resto: 0,
    poeira: Array.from({ length: N_POEIRA }, (): Poeira => ({ x: 0, y: 0, vx: 0, vy: 0, vida: 0 })),
  });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const limpar = (x: number, y: number) => {
    const s = e.current;
    let novas = 0;
    for (let i = 0; i < CELULAS.length; i++) {
      if (s.limpas[i]) continue;
      if (Math.hypot(CELULAS[i][0] - x, CELULAS[i][1] - y) <= RAIO_CELULA) {
        s.limpas[i] = 1;
        novas++;
      }
    }
    if (!novas) return;
    s.total += novas;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', n1(x));
    c.setAttribute('cy', n1(y));
    c.setAttribute('r', String(RAIO_JATO));
    c.setAttribute('fill', `url(#${idPreto})`);
    massaRef.current?.appendChild(c);
  };

  const recomecar = () => {
    const s = e.current;
    s.limpas.fill(0);
    s.total = 0;
    s.completo = false;
    massaRef.current?.replaceChildren();
    if (camadaRef.current) {
      camadaRef.current.style.transition = 'none';
      camadaRef.current.style.opacity = '0';
      // A ferrugem reaparece devagar, não de uma vez.
      requestAnimationFrame(() => {
        if (!camadaRef.current) return;
        camadaRef.current.style.transition = 'opacity .9s';
        camadaRef.current.style.opacity = '1';
      });
    }
    setBrilho(0);
    acordar();
  };

  const concluir = () => {
    e.current.completo = true;
    setBrilho(b => b + 1);
    timers.current.push(window.setTimeout(recomecar, 3600));
  };

  const jatear = (x: number, y: number) => {
    const s = e.current;
    if (s.completo || !sobreTronco(x, y)) {
      s.ultimo = null;
      return;
    }
    const de = s.ultimo;
    if (de) {
      const dist = Math.hypot(x - de.x, y - de.y);
      const passos = Math.max(1, Math.ceil(dist / 5));
      for (let i = 1; i <= passos; i++) limpar(de.x + ((x - de.x) * i) / passos, de.y + ((y - de.y) * i) / passos);
    } else {
      limpar(x, y);
    }
    s.ultimo = { x, y };
    if (s.total / CELULAS.length >= META) concluir();
  };

  const acordar = useQuadros(dt => {
    const s = e.current;
    s.tempo += dt;
    const autonomo = !reduzido && !s.sobre && !s.completo;
    if (autonomo) {
      s.alvoX = 160 + 128 * Math.sin(s.tempo * 0.42);
      s.alvoY = 118 + 48 * Math.sin(s.tempo * 1.25);
    }
    const k = Math.min(1, dt * 9);
    s.x += (s.alvoX - s.x) * k;
    s.y += (s.alvoY - s.y) * k;

    const ativo = (autonomo || s.sobre) && !s.completo && sobreTronco(s.x, s.y);
    if (ativo) jatear(s.x, s.y);
    else s.ultimo = null;

    bicoRef.current?.setAttribute('transform', `translate(${n1(s.x + 16)} ${n1(s.y - 8)}) rotate(-22)`);
    if (jatoRef.current) jatoRef.current.style.opacity = ativo ? '1' : '0';

    // Poeira e ferrugem soltas: saem do ponto de impacto e caem.
    if (ativo) {
      s.resto += 46 * dt;
      while (s.resto >= 1) {
        s.resto -= 1;
        const p = s.poeira.find(q => q.vida <= 0);
        if (!p) break;
        p.x = s.x + (Math.random() - 0.5) * 6;
        p.y = s.y + (Math.random() - 0.5) * 6;
        p.vx = 10 + Math.random() * 60;
        p.vy = -30 - Math.random() * 50;
        p.vida = 0.55;
      }
    }
    let viva = false;
    s.poeira.forEach((p, i) => {
      const el = poeiraRefs.current[i];
      if (p.vida > 0) {
        p.vida -= dt;
        p.vy += 260 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        viva = viva || p.vida > 0;
      }
      if (!el) return;
      if (p.vida > 0) {
        el.setAttribute('cx', n1(p.x));
        el.setAttribute('cy', n1(p.y));
        el.style.opacity = String(limitar(p.vida / 0.4, 0, 1));
      } else el.style.opacity = '0';
    });

    return !reduzido || s.sobre || viva || Math.abs(s.alvoX - s.x) > 0.3 || Math.abs(s.alvoY - s.y) > 0.3;
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
  const sair = () => {
    e.current.sobre = false;
    e.current.ultimo = null;
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
        onPointerLeave={sair}
        onPointerCancel={sair}
      >
        <defs>
          <radialGradient id={idPreto}>
            <stop offset="0" stopColor="#000" stopOpacity="1" />
            <stop offset="0.6" stopColor="#000" stopOpacity="1" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={idSombra} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.2" />
          </linearGradient>
          <mask id={idMascara} maskUnits="userSpaceOnUse" x="0" y="0" width={CENA_L} height={CENA_A}>
            <rect x="0" y="0" width={CENA_L} height={CENA_A} fill="#fff" />
            <g ref={massaRef} />
          </mask>
        </defs>

        <rect x="0" y="180" width={CENA_L} height="20" className="fill-slate-200 dark:fill-slate-800" />

        {CIL_X.map(x => (
          <g key={x}>
            <ellipse cx={x + CIL_L / 2 + 6} cy="182" rx={CIL_L / 2 + 6} ry="4" className="fill-slate-900/10 dark:fill-black/30" />
            {/* Aço limpo, por baixo */}
            <path d={corpo(x)} className="fill-slate-300 dark:fill-slate-400" />
            <ellipse cx={x + CIL_L / 2} cy={CIL_TOPO} rx={CIL_L / 2} ry="6" className="fill-slate-200 dark:fill-slate-300" />
          </g>
        ))}

        {/* Ferrugem por cima, furada pela máscara onde o jato passou */}
        <g ref={camadaRef} mask={`url(#${idMascara})`}>
          {CIL_X.map(x => (
            <g key={x}>
              <path d={corpo(x)} fill="#b45309" />
              <ellipse cx={x + CIL_L / 2} cy={CIL_TOPO} rx={CIL_L / 2} ry="6" fill="#c2692a" />
            </g>
          ))}
          {MANCHAS.map((m, i) => (
            <circle key={i} cx={m.cx} cy={m.cy} r={m.r} fill={i % 2 ? '#7c2d12' : '#d97706'} fillOpacity="0.55" />
          ))}
        </g>

        {/* Volume e contorno */}
        {CIL_X.map(x => (
          <g key={x}>
            <path d={corpo(x)} fill={`url(#${idSombra})`} />
            <path d={corpo(x)} fill="none" className="stroke-slate-400 dark:stroke-slate-600" strokeWidth="1" />
            <ellipse cx={x + CIL_L / 2} cy={CIL_TOPO} rx={CIL_L / 2} ry="6" fill="none" className="stroke-slate-400 dark:stroke-slate-600" strokeWidth="1" />
          </g>
        ))}

        {/* Brilho do aço limpo */}
        {brilho > 0 && (
          <g key={brilho} fill="#f5821f">
            {[[46, 44], [126, 34], [198, 42], [268, 36], [88, 58], [232, 56]].map(([x, y], i) => (
              <path
                key={i}
                className="cena-brilho"
                style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.18}s` }}
                d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`}
              />
            ))}
          </g>
        )}

        {/* Poeira */}
        {Array.from({ length: N_POEIRA }, (_, i) => (
          <circle
            key={i}
            ref={el => {
              poeiraRefs.current[i] = el;
            }}
            r="1.7"
            fill={i % 3 ? '#b45309' : '#94a3b8'}
            style={{ opacity: 0 }}
          />
        ))}

        {/* Bico: a ponta fica sobre o ponteiro, o jato sai em leque */}
        <g ref={bicoRef} transform="translate(176 112) rotate(-22)">
          <g ref={jatoRef} style={{ opacity: 0, transition: 'opacity .1s' }}>
            <path d="M0 0 L-19 -6 L-19 6 Z" fill="#94a3b8" fillOpacity="0.55" />
          </g>
          <rect x="0" y="-3" width="9" height="6" rx="1.5" className="fill-slate-500 dark:fill-slate-300" />
          <rect x="9" y="-6" width="26" height="12" rx="4" className="fill-slate-600 dark:fill-slate-200" />
          <rect x="14" y="-16" width="12" height="10" rx="2.5" fill="#f5821f" />
          <path d="M35 0 C 60 0 70 -20 78 -40" fill="none" className="stroke-slate-500 dark:stroke-slate-300" strokeWidth="4" strokeLinecap="round" />
        </g>
      </svg>
    </CenaMoldura>
  );
}
