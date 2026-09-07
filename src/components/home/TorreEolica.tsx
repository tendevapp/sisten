/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Torre eólica animada da tela Início.
 *
 * Enfeite puro: o rotor gira sempre, as nuvens atravessam o céu e o mastro
 * balança de leve, como se o vento estivesse batendo. Passar o mouse (ou tocar)
 * aumenta a rajada — o rotor acelera e as nuvens correm. É decoração, então
 * fica fora da árvore de acessibilidade e para por completo com
 * `prefers-reduced-motion`.
 */

import React from 'react';

/** Uma pá do rotor: perfil afilado, saindo do cubo em (0,0). */
const PA = 'M0,-5.2 C 13,-9 33,-8.5 46,-2.2 C 46,-0.6 46,0.6 46,2.2 C 33,3.4 13,3.6 0,5.2 Z';

export default function TorreEolica() {
  return (
    <div className="home-eolica group relative h-32 w-36 shrink-0 select-none sm:h-36 sm:w-44" aria-hidden="true">
      <svg viewBox="0 0 160 170" className="h-full w-full overflow-visible">
        {/* Céu: nuvens atravessando devagar */}
        <g className="home-eolica-ceu text-slate-200 dark:text-slate-700">
          <g className="home-nuvem home-nuvem-1" fill="currentColor">
            <ellipse cx="14" cy="26" rx="13" ry="6" />
            <ellipse cx="23" cy="22" rx="9" ry="6.5" />
          </g>
          <g className="home-nuvem home-nuvem-2" fill="currentColor">
            <ellipse cx="10" cy="58" rx="10" ry="4.5" />
            <ellipse cx="17" cy="55" rx="7" ry="5" />
          </g>
        </g>

        {/* Rajadas de vento */}
        <g className="text-slate-300 dark:text-slate-600" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
          <path className="home-rajada home-rajada-1" d="M4 88 h20" />
          <path className="home-rajada home-rajada-2" d="M4 100 h13" />
        </g>

        {/* Torre, nacele e rotor — balançam juntos na base */}
        <g className="home-mastro">
          <path
            d="M75.4 52 L84.6 52 L88 168 L72 168 Z"
            className="fill-slate-300 dark:fill-slate-600"
          />
          <rect x="66" y="166" width="28" height="4" rx="2" className="fill-slate-400 dark:fill-slate-700" />
          <rect x="72" y="42" width="22" height="13" rx="6.5" className="fill-slate-400 dark:fill-slate-500" />

          <g className="home-rotor" style={{ transformOrigin: '74px 48px' }}>
            <g transform="translate(74 48)">
              <path d={PA} className="fill-slate-500 dark:fill-slate-300" transform="rotate(-90)" />
              <path d={PA} className="fill-slate-500 dark:fill-slate-300" transform="rotate(30)" />
              <path d={PA} className="fill-slate-500 dark:fill-slate-300" transform="rotate(150)" />
            </g>
            <circle cx="74" cy="48" r="5" fill="#f5821f" />
          </g>
          <circle cx="74" cy="48" r="9" fill="none" stroke="#f5821f" strokeWidth="1" strokeOpacity="0.45" />
        </g>
      </svg>
    </div>
  );
}
