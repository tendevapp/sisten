/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "pedido viajando": uma caixa percorre o caminho da compra — RM,
 * cotação, pedido, entrega —, parando em cada estação, que fica laranja
 * enquanto a caixa está nela e verde depois que ela passa. Clicar (ou tocar)
 * manda a caixa para a próxima estação sem esperar. É só desenho: nenhum número
 * de pedido real aparece. Com movimento reduzido a caixa só anda no clique.
 */

import React, { useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, n1, useMovimentoReduzido, useQuadros } from './util';

const ESTACOES = [
  { nome: 'RM', x: 52 },
  { nome: 'COTAÇÃO', x: 124 },
  { nome: 'PEDIDO', x: 196 },
  { nome: 'ENTREGA', x: 268 },
];
const Y = 100;
const R = 21;
const ESPERA = 1.15; // s parada em cada estação
const VIAGEM = 0.75; // s entre estações
const FIM = 1.9; // s com tudo verde antes de recomeçar

const xEm = (p: number) => {
  const i = Math.min(Math.floor(p), ESTACOES.length - 2);
  const f = p - i;
  return ESTACOES[i].x + (ESTACOES[i + 1].x - ESTACOES[i].x) * Math.max(0, Math.min(1, f));
};

function Glifo({ i }: { i: number }) {
  const branco = { stroke: '#fff', strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (i) {
    case 0:
      return (
        <g {...branco}>
          <path d="M-6 -9 H3 L7 -5 V9 H-6 Z" />
          <path d="M-3 0 H4 M-3 4 H4" />
        </g>
      );
    case 1:
      return (
        <text x="0" y="4.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
          R$
        </text>
      );
    case 2:
      return (
        <g {...branco}>
          <rect x="-7" y="-8" width="14" height="17" rx="2" />
          <path d="M-3 0 L-0.5 3 L4 -3" />
        </g>
      );
    default:
      return (
        <g {...branco}>
          <path d="M-10 4 V-5 H2 V4 M2 -2 H7 L10 1 V4 H-10" />
          <circle cx="-5" cy="5.5" r="1.8" fill="#fff" />
          <circle cx="6" cy="5.5" r="1.8" fill="#fff" />
        </g>
      );
  }
}

export default function PedidoViajando() {
  const reduzido = useMovimentoReduzido();
  const caixaRef = useRef<SVGGElement>(null);
  const [alcancadas, setAlcancadas] = useState(1);
  const [fim, setFim] = useState(false);

  const e = useRef({
    p: 0,
    alvo: 0,
    viajando: false,
    espera: ESPERA,
    fim: 0,
    alcancadas: 1,
    empurrao: false,
    reduzido,
  });
  e.current.reduzido = reduzido;

  const chegou = (i: number) => {
    const s = e.current;
    s.alcancadas = i + 1;
    setAlcancadas(s.alcancadas);
    if (i === ESTACOES.length - 1) {
      s.fim = FIM;
      setFim(true);
    }
  };

  const acordar = useQuadros(dt => {
    const s = e.current;
    const passo = s.reduzido ? 4 : 1;

    if (s.fim > 0) {
      s.fim -= dt;
      if (s.fim <= 0) {
        s.p = 0;
        s.alvo = 0;
        s.espera = ESPERA;
        s.alcancadas = 1;
        setAlcancadas(1);
        setFim(false);
      }
    } else if (s.viajando) {
      s.p = Math.min(s.alvo, s.p + (dt / VIAGEM) * passo);
      if (s.p >= s.alvo) {
        s.viajando = false;
        s.espera = ESPERA;
        chegou(s.alvo);
      }
    } else {
      if (!s.reduzido) s.espera -= dt;
      if (s.empurrao || s.espera <= 0) {
        s.empurrao = false;
        if (s.alvo < ESTACOES.length - 1) {
          s.alvo += 1;
          s.viajando = true;
        }
      }
    }

    const f = s.p - Math.floor(s.p);
    const salto = s.viajando ? Math.sin(Math.PI * f) * 14 : 0;
    caixaRef.current?.setAttribute('transform', `translate(${n1(xEm(s.p))} ${n1(Y - R - 4 - salto)})`);

    return !s.reduzido || s.viajando || s.fim > 0 || s.empurrao;
  });

  const clicar = () => {
    const s = e.current;
    if (s.fim > 0 || s.viajando) return;
    s.empurrao = true;
    acordar();
  };

  const atual = alcancadas - 1;

  return (
    <CenaMoldura>
      <svg viewBox={`0 0 ${CENA_L} ${CENA_A}`} className="h-full w-full cursor-pointer touch-pan-y" onClick={clicar}>
        {/* Trilho */}
        <line x1={ESTACOES[0].x} x2={ESTACOES[ESTACOES.length - 1].x} y1={Y} y2={Y} className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="5" strokeLinecap="round" />
        <line
          x1={ESTACOES[0].x}
          x2={ESTACOES[fim ? ESTACOES.length - 1 : atual].x}
          y1={Y}
          y2={Y}
          stroke="#22c55e"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Estações */}
        {ESTACOES.map((est, i) => {
          const feita = i < atual || fim;
          const naVez = i === atual && !fim;
          return (
            <g key={est.nome} transform={`translate(${est.x} ${Y})`}>
              {naVez && <circle r={R + 5} fill="none" stroke="#f5821f" strokeWidth="2" strokeDasharray="4 3" className="cena-pulsa" />}
              <circle r={R} fill={feita ? '#22c55e' : naVez ? '#f5821f' : '#94a3b8'} style={{ transition: 'fill .3s' }} />
              <Glifo i={i} />
              {feita && (
                <g transform="translate(15 -15)"><g className="cena-assenta">
                  <circle r="7" fill="#16a34a" stroke="#fff" strokeWidth="1.6" />
                  <path d="M-3 0 L-0.7 2.4 L3.2 -2.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </g></g>
              )}
              <text y={R + 18} textAnchor="middle" fontSize="8.5" fontWeight="800" letterSpacing="0.6" className="fill-slate-500 dark:fill-slate-300" fontFamily="system-ui, sans-serif">
                {est.nome}
              </text>
            </g>
          );
        })}

        {/* Caixa */}
        <g ref={caixaRef} transform={`translate(${ESTACOES[0].x} ${Y - R - 4})`} style={{ pointerEvents: 'none' }}>
          <rect x="-9" y="-14" width="18" height="14" rx="1.5" className="fill-amber-300 stroke-amber-500 dark:fill-amber-600 dark:stroke-amber-400" strokeWidth="1" />
          <rect x="-1.6" y="-14" width="3.2" height="14" className="fill-amber-200/80 dark:fill-amber-400/50" />
          <path d="M-9 -14 L0 -19 L9 -14" className="fill-amber-200 stroke-amber-500 dark:fill-amber-500 dark:stroke-amber-400" strokeWidth="1" strokeLinejoin="round" />
        </g>

        {fim && (
          <g transform="translate(160 48)"><g className="cena-assenta">
            <rect x="-56" y="-14" width="112" height="28" rx="14" fill="#16a34a" />
            <text y="5" textAnchor="middle" fontSize="12" fontWeight="800" letterSpacing="0.6" fill="#fff" fontFamily="system-ui, sans-serif">
              ENTREGUE
            </text>
          </g></g>
        )}
      </svg>
    </CenaMoldura>
  );
}
