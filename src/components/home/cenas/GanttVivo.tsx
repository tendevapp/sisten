/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "Gantt vivo": cinco etapas de fabricação de um tronco encadeadas num
 * cronograma que se monta em cascata. Arrastar uma barra desloca junto todas as
 * que dependem dela (a folga entre elas se mantém); se a última passar do prazo,
 * ela fica vermelha. Sozinho, o cronograma atrasa a primeira etapa e depois
 * recupera, e a cascata desliza. As regras de arrasto estão em
 * `lib/cenaInicioLogica.ts` (`propagarGantt`).
 */

import React, { useRef } from 'react';
import { propagarGantt, type BarraGantt } from '../../../lib/cenaInicioLogica';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, pontoNoSvg, useMovimentoReduzido, useQuadros } from './util';

const TOTAL = 24; // unidades de tempo no eixo
const PRAZO = 22;
const X0 = 64;
const X1 = 308;
const UNIT = (X1 - X0) / TOTAL;
const Y0 = 50;
const PASSO = 26;
const ALTURA = 14;

const ROTULOS = ['CORTE', 'CALANDRA', 'SOLDA', 'PINTURA', 'EXPEDIÇÃO'];
const INICIAL: BarraGantt[] = [
  { id: 'corte', inicio: 0, dur: 5 },
  { id: 'calandra', inicio: 5, dur: 4, dep: 'corte' },
  { id: 'solda', inicio: 9, dur: 5, dep: 'calandra' },
  { id: 'pintura', inicio: 14, dur: 3, dep: 'solda' },
  { id: 'expedicao', inicio: 17, dur: 3, dep: 'pintura' },
];

const xDe = (u: number) => X0 + u * UNIT;
const yDe = (i: number) => Y0 + i * PASSO;

export default function GanttVivo() {
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const barraRefs = useRef<(SVGRectElement | null)[]>([]);
  const setaRefs = useRef<(SVGPathElement | null)[]>([]);

  const e = useRef({
    barras: INICIAL,
    pos: INICIAL.map(b => b.inicio),
    tempo: 0,
    autoT: 0,
    dir: 1 as 1 | -1,
    sobre: false,
    arrasto: null as null | { i: number; desvio: number },
  });

  const acordar = useQuadros(dt => {
    const s = e.current;
    s.tempo += dt;

    if (!reduzido && !s.sobre && !s.arrasto && s.tempo > 1.8) {
      s.autoT += dt;
      if (s.autoT > 2.2) {
        s.autoT = 0;
        const novas = propagarGantt(s.barras, 'corte', s.dir * 3, TOTAL);
        if (novas === s.barras) s.dir = (s.dir * -1) as 1 | -1;
        else {
          s.barras = novas;
          s.dir = (s.dir * -1) as 1 | -1;
        }
      }
    }

    let movendo = false;
    const k = Math.min(1, dt * (s.arrasto ? 22 : 7));
    s.barras.forEach((b, i) => {
      const falta = b.inicio - s.pos[i];
      if (Math.abs(falta) > 0.005) {
        s.pos[i] += falta * k;
        movendo = true;
      } else s.pos[i] = b.inicio;
    });

    const construindo = !reduzido && s.tempo < 0.25 * s.barras.length + 0.6;
    const fimDaCadeia = s.barras[s.barras.length - 1].inicio + s.barras[s.barras.length - 1].dur;
    s.barras.forEach((b, i) => {
      const p = reduzido ? 1 : limitar((s.tempo - 0.25 * i) / 0.45, 0, 1);
      const el = barraRefs.current[i];
      if (el) {
        el.setAttribute('x', n1(xDe(s.pos[i])));
        el.setAttribute('width', n1(Math.max(0.1, b.dur * UNIT * p)));
        el.style.opacity = String(p);
        const atrasada = i === s.barras.length - 1 && fimDaCadeia > PRAZO;
        el.style.color = s.arrasto?.i === i ? '#f5821f' : atrasada ? '#ef4444' : '';
      }
      const seta = setaRefs.current[i];
      if (seta && i < s.barras.length - 1) {
        const xe = xDe(s.pos[i] + b.dur * p);
        const xs = xDe(s.pos[i + 1]);
        const y1 = yDe(i) + ALTURA;
        const y2 = yDe(i + 1) + ALTURA / 2;
        seta.setAttribute('d', `M${n1(xe - 3)} ${n1(y1)} V${n1(y2)} H${n1(xs - 1)} m-3 -2.4 l3 2.4 l-3 2.4`);
        seta.style.opacity = String(limitar((p + limitar((s.tempo - 0.25 * (i + 1)) / 0.45, 0, 1)) / 2, 0, 1) ** 2);
      }
    });

    return !reduzido || s.sobre || !!s.arrasto || movendo || construindo;
  });

  const acharBarra = (px: number, py: number) => {
    const s = e.current;
    return s.barras.findIndex((b, i) => {
      const y = yDe(i);
      return py >= y - 4 && py <= y + ALTURA + 4 && px >= xDe(s.pos[i]) - 4 && px <= xDe(s.pos[i] + b.dur) + 4;
    });
  };

  const apertar = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const s = e.current;
    s.sobre = true;
    const i = acharBarra(p.x, p.y);
    if (i >= 0) {
      s.arrasto = { i, desvio: (p.x - X0) / UNIT - s.barras[i].inicio };
      try {
        svgRef.current?.setPointerCapture(ev.pointerId);
      } catch {
        /* ponteiro sintético: segue sem captura */
      }
    }
    acordar();
  };

  const mover = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const s = e.current;
    s.sobre = true;
    if (s.arrasto) {
      const { i, desvio } = s.arrasto;
      const desejado = (p.x - X0) / UNIT - desvio;
      s.barras = propagarGantt(s.barras, s.barras[i].id, desejado - s.barras[i].inicio, TOTAL);
    }
    acordar();
  };

  const soltar = () => {
    const s = e.current;
    if (s.arrasto) {
      // Encaixa na grade de unidades inteiras, levando a cascata junto.
      const { i } = s.arrasto;
      s.barras = propagarGantt(s.barras, s.barras[i].id, Math.round(s.barras[i].inicio) - s.barras[i].inicio, TOTAL);
      s.arrasto = null;
    }
    s.sobre = false;
    s.autoT = -1.5; // dá um respiro antes de o cronograma voltar a se mexer sozinho
    acordar();
  };

  return (
    <CenaMoldura>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full cursor-grab touch-pan-y"
        onPointerDown={apertar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onPointerLeave={() => {
          if (!e.current.arrasto) soltar();
        }}
      >
        {/* Cabeçalho e grade */}
        <text x="10" y="20" fontSize="9" fontWeight="800" letterSpacing="1.2" className="fill-slate-500 dark:fill-slate-400" fontFamily="system-ui, sans-serif">
          CRONOGRAMA
        </text>
        {Array.from({ length: TOTAL / 4 + 1 }, (_, k) => (
          <g key={k}>
            <line x1={xDe(k * 4)} x2={xDe(k * 4)} y1="30" y2="182" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
            <text x={xDe(k * 4)} y="27" fontSize="7" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontFamily="system-ui, sans-serif">
              S{k * 4}
            </text>
          </g>
        ))}
        <line x1={xDe(PRAZO)} x2={xDe(PRAZO)} y1="30" y2="182" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="3 3" />
        <text x={xDe(PRAZO)} y="192" fontSize="7" fontWeight="700" textAnchor="middle" fill="#ef4444" fontFamily="system-ui, sans-serif">
          PRAZO
        </text>

        {/* Rótulos */}
        {ROTULOS.map((t, i) => (
          <text key={t} x="10" y={yDe(i) + ALTURA / 2 + 2.6} fontSize="7.5" fontWeight="700" className="fill-slate-500 dark:fill-slate-300" fontFamily="system-ui, sans-serif">
            {t}
          </text>
        ))}

        {/* Setas de dependência */}
        {INICIAL.slice(0, -1).map((b, i) => (
          <path
            key={b.id}
            ref={el => {
              setaRefs.current[i] = el;
            }}
            fill="none"
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0 }}
          />
        ))}

        {/* Barras */}
        {INICIAL.map((b, i) => (
          <rect
            key={b.id}
            ref={el => {
              barraRefs.current[i] = el;
            }}
            x={xDe(b.inicio)}
            y={yDe(i)}
            width="0.1"
            height={ALTURA}
            rx="4"
            fill="currentColor"
            className="text-slate-500 dark:text-slate-400"
            style={{ opacity: 0, transition: 'color .2s' }}
          />
        ))}
      </svg>
    </CenaMoldura>
  );
}
