/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Progresso de importação de planilha: a torre eólica da tela Início carrega a
 * bateria, e a carga da bateria É a porcentagem do avanço. O rotor gira mais
 * rápido conforme o trabalho avança e desacelera quando termina; a bateria sobe
 * com suavidade (não pula entre lotes) e, cheia, brilha.
 */

import React, { useEffect, useRef } from 'react';
import { PA_ROTOR, limitar, n1, useMovimentoReduzido, useQuadros } from '../home/cenas/util';

const L = 320;
const A = 200;
const HUB = { x: 86, y: 60 };
const BAT = { x: 219, y: 117, w: 38, h: 54 }; // miolo onde a carga aparece

const W_INICIO = 160; // graus/s com a carga em 0%
const W_PICO = 640; // graus/s perto de 100%
const W_CHEIA = 50; // graus/s quando terminou

interface Props {
  /** Avanço de 0 a 100. */
  pct: number;
  /** O que está sendo feito agora (vira o texto ao lado e o rótulo de acessibilidade). */
  mensagem?: string;
  /** `compacto` para dentro de modal estreito. */
  tamanho?: 'normal' | 'compacto';
  className?: string;
}

export default function ProgressoImportacao({ pct, mensagem, tamanho = 'normal', className = '' }: Props) {
  const valor = limitar(Number.isFinite(pct) ? Math.round(pct) : 0, 0, 100);
  const reduzido = useMovimentoReduzido();
  const rotorRef = useRef<SVGGElement>(null);
  const cargaRef = useRef<SVGRectElement>(null);
  const cheiaRef = useRef<SVGGElement>(null);
  const caboRef = useRef<SVGPathElement>(null);
  const ventoRef = useRef<SVGGElement>(null);

  const e = useRef({ w: 0, angulo: 0, carga: 0, alvo: valor / 100 });
  e.current.alvo = valor / 100;

  const acordar = useQuadros(dt => {
    const s = e.current;
    const cheio = s.alvo >= 1;
    const alvoW = reduzido ? 0 : cheio ? W_CHEIA : W_INICIO + (W_PICO - W_INICIO) * s.alvo;
    s.w += (alvoW - s.w) * Math.min(1, dt * 1.8);
    s.angulo = (s.angulo + s.w * dt) % 360;

    s.carga += (s.alvo - s.carga) * Math.min(1, dt * 5);
    if (Math.abs(s.alvo - s.carga) < 0.002) s.carga = s.alvo;

    rotorRef.current?.setAttribute('transform', `rotate(${n1(s.angulo)} ${HUB.x} ${HUB.y})`);
    const h = BAT.h * s.carga;
    cargaRef.current?.setAttribute('y', n1(BAT.y + BAT.h - h));
    cargaRef.current?.setAttribute('height', n1(h));
    cargaRef.current?.setAttribute('fill', `hsl(${Math.round(8 + 112 * s.carga)} 82% 48%)`);
    cheiaRef.current?.setAttribute('opacity', s.carga > 0.985 ? '1' : '0');
    caboRef.current?.setAttribute('opacity', cheio ? '0' : '1');
    ventoRef.current?.setAttribute('opacity', n1(cheio ? 0 : 0.3 + 0.7 * s.alvo));

    return !reduzido || s.w > 1 || s.carga !== s.alvo;
  });

  // O laço dorme em movimento reduzido; um novo valor precisa acordá-lo.
  useEffect(() => {
    acordar();
  }, [valor, acordar]);

  const largura = tamanho === 'compacto' ? 'w-24' : 'w-32 sm:w-40';

  return (
    <div
      className={`flex items-center gap-3 ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valor}
      aria-label={mensagem || 'Progresso da importação'}
    >
      <svg viewBox={`0 0 ${L} ${A}`} className={`${largura} aspect-[8/5] shrink-0 select-none`} aria-hidden="true">
        <rect x="0" y="188" width={L} height="12" className="fill-slate-200 dark:fill-slate-800" />

        <g ref={ventoRef} opacity="0" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" strokeLinecap="round" fill="none">
          <path className="home-rajada home-rajada-1" d="M4 34 h26" />
          <path className="home-rajada home-rajada-2" d="M4 62 h18" />
          <path className="home-rajada home-rajada-1" d="M4 90 h30" style={{ animationDelay: '-1.3s' }} />
        </g>

        <path d="M91.4 64 L100.6 64 L104 188 L88 188 Z" className="fill-slate-300 dark:fill-slate-600" />
        <rect x="84" y="53.5" width="24" height="13" rx="6.5" className="fill-slate-400 dark:fill-slate-500" />
        <g ref={rotorRef}>
          <g transform={`translate(${HUB.x} ${HUB.y}) scale(1.1)`} className="fill-slate-500 dark:fill-slate-300">
            <path d={PA_ROTOR} transform="rotate(-90)" />
            <path d={PA_ROTOR} transform="rotate(30)" />
            <path d={PA_ROTOR} transform="rotate(150)" />
          </g>
          <circle cx={HUB.x} cy={HUB.y} r="5" fill="#f5821f" />
        </g>

        <path d="M96 183 H238 V174" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-slate-300 dark:stroke-slate-600" />
        <path
          ref={caboRef}
          d="M96 183 H238 V174"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="3 5"
          stroke="#f5821f"
          className="cena-fluxo"
        />

        <rect x="230" y="106" width="16" height="6" rx="2" className="fill-slate-400 dark:fill-slate-500" />
        <rect x="214" y="111" width="48" height="64" rx="7" className="fill-white stroke-slate-400 dark:fill-slate-900 dark:stroke-slate-500" strokeWidth="2.5" />
        <rect ref={cargaRef} x={BAT.x} y={BAT.y + BAT.h} width={BAT.w} height="0" rx="3" fill="hsl(8 82% 48%)" />
        <g className="stroke-white/70 dark:stroke-slate-900/70" strokeWidth="1.5">
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1={BAT.x} x2={BAT.x + BAT.w} y1={BAT.y + BAT.h * f} y2={BAT.y + BAT.h * f} />
          ))}
        </g>
        <path d="M241 128 L230 146 H238 L235 162 L248 141 H239 Z" className="fill-white/90 stroke-slate-500/60 dark:fill-slate-100" strokeWidth="1" strokeLinejoin="round" />
        <g ref={cheiaRef} opacity="0">
          <rect x="210" y="107" width="56" height="72" rx="10" fill="none" stroke="#f5821f" strokeWidth="2.5" className="cena-pulsa" />
        </g>
      </svg>

      <div className="min-w-0 flex-1">
        {mensagem && <p className="text-xs font-bold leading-snug text-slate-600 dark:text-slate-300">{mensagem}</p>}
        <p className="text-2xl font-black leading-none tabular-nums text-emerald-600 dark:text-emerald-400">{valor}%</p>
      </div>
    </div>
  );
}
