/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "estoque mínimo": um tanque que vai esvaziando com o consumo e um
 * semáforo que acompanha a faixa (verde, amarelo, vermelho abaixo do mínimo).
 * Passar o mouse (ou o dedo) abre a válvula de reposição e o nível sobe. Sozinho,
 * o tanque consome até o vermelho, é reposto e recomeça. A faixa vem de
 * `faixaEstoque` em `lib/cenaInicioLogica.ts`.
 */

import React, { useRef } from 'react';
import { faixaEstoque, type FaixaEstoque } from '../../../lib/cenaInicioLogica';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, useIdSvg, useMovimentoReduzido, useQuadros } from './util';

const TX = 112;
const TW = 84;
const TOPO = 38;
const BASE = 170;
const ALTURA = BASE - TOPO;

const CONSUMO = 0.045; // fração por segundo
const REPOSICAO = 0.17;
const PISO_AUTO = 0.1; // nível em que a reposição sozinha entra
const TETO_AUTO = 0.92;

const COR: Record<FaixaEstoque, string> = { critico: '#ef4444', atencao: '#f59e0b', ok: '#22c55e' };
const FAIXAS: FaixaEstoque[] = ['critico', 'atencao', 'ok'];

const yNivel = (n: number) => BASE - n * ALTURA;

function onda(nivel: number, fase: number) {
  const y = yNivel(nivel);
  const amp = nivel > 0.02 ? 1.8 : 0;
  const pts: string[] = [];
  for (let i = 0; i <= 14; i++) {
    const x = TX + (TW * i) / 14;
    pts.push(`${n1(x)} ${n1(y + amp * Math.sin(fase + i * 0.75))}`);
  }
  return `M${pts.join(' L')} L${TX + TW} ${BASE} L${TX} ${BASE} Z`;
}

export default function TanqueEstoque() {
  const idRecorte = useIdSvg('te');
  const reduzido = useMovimentoReduzido();
  const liquidoRef = useRef<SVGPathElement>(null);
  const entradaRef = useRef<SVGLineElement>(null);
  const saidaRef = useRef<SVGLineElement>(null);
  const valvulaRef = useRef<SVGGElement>(null);
  const luzRefs = useRef<(SVGCircleElement | null)[]>([]);
  const nivelRef = useRef<SVGTextElement>(null);

  const e = useRef({ nivel: 0.8, fase: 0, sobre: false, repondo: false });

  const acordar = useQuadros(dt => {
    const s = e.current;
    s.fase += dt * 3;

    let repondo = s.sobre;
    let consumindo = !reduzido;
    if (!s.sobre && !reduzido) {
      // Sozinho: entra reposição abaixo do piso e fica até quase encher.
      if (s.nivel <= PISO_AUTO) s.repondo = true;
      if (s.nivel >= TETO_AUTO) s.repondo = false;
      repondo = s.repondo;
    }
    if (repondo) consumindo = false;

    if (repondo) s.nivel += REPOSICAO * dt;
    else if (consumindo) s.nivel -= CONSUMO * dt;
    s.nivel = limitar(s.nivel, 0.02, 1);
    if (s.nivel >= 1) repondo = false;

    liquidoRef.current?.setAttribute('d', onda(s.nivel, s.fase));
    if (entradaRef.current) entradaRef.current.style.opacity = repondo ? '1' : '0';
    if (saidaRef.current) saidaRef.current.style.opacity = consumindo ? '1' : '0';
    valvulaRef.current?.setAttribute('transform', `rotate(${repondo ? 90 : 0} 62 26)`);

    const faixa = faixaEstoque(s.nivel);
    FAIXAS.forEach((f, i) => {
      const el = luzRefs.current[i];
      if (!el) return;
      const acesa = f === faixa;
      el.setAttribute('fill', acesa ? COR[f] : '#64748b');
      el.style.opacity = acesa ? '1' : '0.3';
    });
    if (nivelRef.current) nivelRef.current.textContent = `${Math.round(s.nivel * 100)}%`;

    return !reduzido || s.sobre || repondo;
  });

  const entrar = () => {
    e.current.sobre = true;
    acordar();
  };
  const sair = () => {
    e.current.sobre = false;
    acordar();
  };

  return (
    <CenaMoldura>
      <svg
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full touch-pan-y"
        onPointerMove={entrar}
        onPointerDown={entrar}
        onPointerLeave={sair}
        onPointerCancel={sair}
      >
        <defs>
          <clipPath id={idRecorte}>
            <rect x={TX + 2} y={TOPO + 2} width={TW - 4} height={ALTURA - 2} rx="10" />
          </clipPath>
        </defs>

        <rect x="0" y={BASE + 10} width={CENA_L} height="20" className="fill-slate-200 dark:fill-slate-800" />

        {/* Tubulação de reposição (entra por cima) com a válvula */}
        <path d={`M14 26 H${TX + TW / 2} V${TOPO + 4}`} fill="none" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <g ref={valvulaRef} transform="rotate(0 62 26)">
          <rect x="59" y="14" width="6" height="24" rx="2" fill="#f5821f" />
          <rect x="54" y="11" width="16" height="4" rx="2" className="fill-slate-600 dark:fill-slate-300" />
        </g>
        <line
          ref={entradaRef}
          x1={TX + TW / 2}
          x2={TX + TW / 2}
          y1={TOPO + 6}
          y2={yNivel(0.5)}
          stroke="#38bdf8"
          strokeWidth="4"
          strokeDasharray="6 4"
          className="cena-fluxo"
          style={{ opacity: 0, transition: 'opacity .2s' }}
        />

        {/* Saída de consumo */}
        <path d={`M${TX + TW} ${BASE - 14} H254 V${BASE - 4}`} fill="none" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <line ref={saidaRef} x1="254" x2="254" y1={BASE} y2={BASE + 10} stroke="#38bdf8" strokeWidth="3.4" strokeDasharray="4 3" className="cena-fluxo" style={{ opacity: 1, transition: 'opacity .2s' }} />

        {/* Tanque */}
        <rect x={TX} y={TOPO} width={TW} height={ALTURA} rx="12" className="fill-white/60 stroke-slate-400 dark:fill-slate-900/40 dark:stroke-slate-500" strokeWidth="3" />
        <g clipPath={`url(#${idRecorte})`}>
          <path ref={liquidoRef} d={onda(0.8, 0)} fill="#38bdf8" fillOpacity="0.85" />
        </g>
        <rect x={TX + 8} y={TOPO + 10} width="5" height={ALTURA - 26} rx="2.5" fill="#fff" fillOpacity="0.45" />

        {/* Faixas de nível na lateral + linha do mínimo */}
        <rect x={TX - 9} y={yNivel(1)} width="5" height={ALTURA * 0.5} rx="1" fill={COR.ok} />
        <rect x={TX - 9} y={yNivel(0.5)} width="5" height={ALTURA * 0.25} fill={COR.atencao} />
        <rect x={TX - 9} y={yNivel(0.25)} width="5" height={ALTURA * 0.25} rx="1" fill={COR.critico} />
        <line x1={TX} x2={TX + TW} y1={yNivel(0.25)} y2={yNivel(0.25)} stroke="#ef4444" strokeWidth="1.4" strokeDasharray="4 3" />
        <text x={TX + TW + 6} y={yNivel(0.25) + 3} fontSize="8" fontWeight="800" fill="#ef4444" fontFamily="system-ui, sans-serif">
          MÍN
        </text>
        <text x={TX + TW + 6} y={yNivel(1) + 8} fontSize="8" fontWeight="800" className="fill-slate-400 dark:fill-slate-500" fontFamily="system-ui, sans-serif">
          MÁX
        </text>

        {/* Semáforo */}
        <rect x="26" y="62" width="34" height="86" rx="9" className="fill-slate-700 dark:fill-slate-900" />
        {FAIXAS.map((f, i) => (
          <circle
            key={f}
            ref={el => {
              luzRefs.current[i] = el;
            }}
            cx="43"
            cy={82 + i * 26}
            r="9"
            fill="#64748b"
            style={{ opacity: 0.3, transition: 'opacity .2s' }}
          />
        ))}
        <text ref={nivelRef} x="43" y="162" fontSize="11" fontWeight="800" textAnchor="middle" className="fill-slate-600 dark:fill-slate-300" fontFamily="system-ui, sans-serif">
          80%
        </text>
      </svg>
    </CenaMoldura>
  );
}
