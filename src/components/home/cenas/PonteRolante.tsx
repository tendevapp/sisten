/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "ponte rolante": no galpão, o carrinho corre pelo trilho do alto e leva
 * troncos do pátio até o gabarito, empilhando três para fechar uma seção de
 * torre. Sozinha, faz o ciclo inteiro. Com o mouse por cima, o carrinho segue
 * o ponteiro e o clique desce o gancho: pega o tronco se estiver sobre ele e
 * assenta se estiver sobre o gabarito; fora do lugar, o gancho só sobe de novo.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, pontoNoSvg, useIdSvg, useMovimentoReduzido, useQuadros } from './util';

const CHAO = 188;
const TRILHO_Y = 20; // altura do carrinho
const TORA_W = 30;
const TORA_H = 22;
const PATIO_X = 62;
const GABARITO_X = 246;
const PILHA = 3;
const TOLERANCIA = 8;
const CABO_ALTO = 46;
const VEL_CARRO = 90; // px/s
const VEL_CABO = 80;
const X_MIN = 34;
const X_MAX = 286;

const topoPilha = (n: number) => CHAO - n * TORA_H;
/** Comprimento do cabo para o gancho pousar 6px acima do topo do que está embaixo. */
const caboAte = (topo: number) => topo - 6 - TRILHO_Y - TORA_H;

/** Onde o gancho para: sobre a pilha do gabarito (com carga) ou sobre o tronco do pátio. */
const alturaDoGancho = (carga: boolean, colocadas: number) => caboAte(carga ? topoPilha(colocadas) : CHAO - 3);

type Fase = 'parada' | 'descendo' | 'subindo';

export default function PonteRolante() {
  const idTora = useIdSvg('pr');
  const reduzido = useMovimentoReduzido();
  const svgRef = useRef<SVGSVGElement>(null);
  const carroRef = useRef<SVGGElement>(null);
  const caboRef = useRef<SVGLineElement>(null);
  const ganchoRef = useRef<SVGGElement>(null);
  const marcaRef = useRef<SVGLineElement>(null);
  const timers = useRef<number[]>([]);

  const [carga, setCarga] = useState(false);
  const [colocadas, setColocadas] = useState(0);
  const [fechada, setFechada] = useState(false);

  const e = useRef({
    x: PATIO_X,
    alvoX: PATIO_X,
    cabo: CABO_ALTO,
    alvoCabo: CABO_ALTO,
    fase: 'parada' as Fase,
    espera: 0.6,
    sobre: false,
    carga: false,
    colocadas: 0,
    travada: false, // seção fechada: ninguém mexe até recomeçar
    reduzido,
  });
  e.current.reduzido = reduzido;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const depois = (ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms));

  const definirCarga = (v: boolean) => {
    e.current.carga = v;
    setCarga(v);
  };

  /** Chegou ao fundo: pega ou larga, conforme o que há embaixo do gancho. */
  const agir = () => {
    const s = e.current;
    if (s.carga) {
      if (Math.abs(s.x - GABARITO_X) <= TOLERANCIA) {
        definirCarga(false);
        s.colocadas += 1;
        setColocadas(s.colocadas);
        if (s.colocadas >= PILHA) {
          s.travada = true;
          setFechada(true);
          depois(2600, () => {
            s.colocadas = 0;
            s.travada = false;
            setColocadas(0);
            setFechada(false);
          });
        }
      }
    } else if (Math.abs(s.x - PATIO_X) <= TOLERANCIA) {
      definirCarga(true);
    }
  };

  const acordar = useQuadros(dt => {
    const s = e.current;
    const passo = s.reduzido ? 4 : 1;

    // Ciclo sozinho: vai ao pátio, pega, leva ao gabarito, assenta.
    if (!s.sobre && !s.travada && s.fase === 'parada') {
      s.espera -= dt;
      if (s.espera <= 0) {
        const destino = s.carga ? GABARITO_X : PATIO_X;
        s.alvoX = destino;
        if (Math.abs(s.x - destino) < 0.6) {
          s.fase = 'descendo';
          s.alvoCabo = alturaDoGancho(s.carga, s.colocadas);
        }
      }
    }

    // O gancho só anda de lado com o cabo em cima.
    const emCima = s.cabo <= CABO_ALTO + 0.6;
    if (emCima || s.fase === 'parada') {
      const dx = s.alvoX - s.x;
      s.x += limitar(dx, -VEL_CARRO * dt * passo, VEL_CARRO * dt * passo);
    }
    const dc = s.alvoCabo - s.cabo;
    s.cabo += limitar(dc, -VEL_CABO * dt * passo, VEL_CABO * dt * passo);

    if (s.fase === 'descendo' && Math.abs(s.alvoCabo - s.cabo) < 0.6) {
      agir();
      s.fase = 'subindo';
      s.alvoCabo = CABO_ALTO;
    } else if (s.fase === 'subindo' && Math.abs(s.cabo - CABO_ALTO) < 0.6) {
      s.fase = 'parada';
      s.espera = 0.5;
    }

    carroRef.current?.setAttribute('transform', `translate(${n1(s.x)} ${TRILHO_Y})`);
    caboRef.current?.setAttribute('y2', n1(s.cabo));
    ganchoRef.current?.setAttribute('transform', `translate(0 ${n1(s.cabo)})`);

    // Marcador do gabarito: verde quando soltar agora encaixa.
    const encaixa = s.carga && Math.abs(s.x - GABARITO_X) <= TOLERANCIA;
    marcaRef.current?.setAttribute('stroke', encaixa ? '#22c55e' : '#f5821f');

    // Dorme só quando nada mais pode acontecer (movimento reduzido e ninguém por perto).
    return !s.reduzido || s.sobre || s.fase !== 'parada' || Math.abs(s.alvoX - s.x) > 0.5;
  });

  const seguir = (ev: React.PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && pontoNoSvg(svgRef.current, ev);
    if (!p) return;
    const s = e.current;
    s.sobre = true;
    if (s.fase === 'parada' && !s.travada) s.alvoX = limitar(p.x, X_MIN, X_MAX);
    acordar();
  };
  const soltar = () => {
    e.current.sobre = false;
    e.current.espera = 0.8;
    acordar();
  };
  const clicar = () => {
    const s = e.current;
    if (s.fase !== 'parada' || s.travada) return;
    s.fase = 'descendo';
    s.alvoCabo = alturaDoGancho(s.carga, s.colocadas);
    acordar();
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
          <linearGradient id={idTora} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* Chão */}
        <rect x="0" y={CHAO} width={CENA_L} height="12" className="fill-slate-200 dark:fill-slate-800" />

        {/* Galpão: pilares e viga do trilho */}
        <rect x="12" y="10" width="7" height={CHAO - 10} rx="2" className="fill-slate-300 dark:fill-slate-600" />
        <rect x="301" y="10" width="7" height={CHAO - 10} rx="2" className="fill-slate-300 dark:fill-slate-600" />
        <rect x="12" y="8" width="296" height="9" rx="2" className="fill-slate-400 dark:fill-slate-500" />
        <rect x="12" y="15" width="296" height="2" className="fill-slate-500 dark:fill-slate-400" />

        {/* Pátio: tronco esperando (some enquanto está no gancho) */}
        <rect x={PATIO_X - 24} y={CHAO - 3} width="48" height="3" rx="1" className="fill-slate-500 dark:fill-slate-400" />
        {!carga && (
          <g>
            <rect x={PATIO_X - TORA_W / 2} y={CHAO - 3 - TORA_H} width={TORA_W} height={TORA_H} className="fill-slate-400 dark:fill-slate-500" />
            <rect x={PATIO_X - TORA_W / 2} y={CHAO - 3 - TORA_H} width={TORA_W} height={TORA_H} fill={`url(#${idTora})`} />
          </g>
        )}

        {/* Gabarito: base tracejada + troncos assentados */}
        <g className={fechada ? 'cena-some' : undefined} style={fechada ? { transitionDelay: '1.6s' } : undefined}>
          {Array.from({ length: colocadas }, (_, i) => (
            <g key={i} className={i === colocadas - 1 ? 'cena-assenta' : undefined}>
              <rect x={GABARITO_X - TORA_W / 2} y={topoPilha(i + 1)} width={TORA_W} height={TORA_H} className="fill-slate-400 dark:fill-slate-500" />
              <rect x={GABARITO_X - TORA_W / 2} y={topoPilha(i + 1)} width={TORA_W} height={TORA_H} fill={`url(#${idTora})`} />
              <rect x={GABARITO_X - TORA_W / 2 - 1.2} y={topoPilha(i + 1)} width={TORA_W + 2.4} height="2.4" rx="1" className="fill-slate-500 dark:fill-slate-300" />
            </g>
          ))}
        </g>
        {!fechada && (
          <line
            ref={marcaRef}
            x1={GABARITO_X - TOLERANCIA}
            x2={GABARITO_X + TOLERANCIA}
            y1={topoPilha(colocadas) - 1.5}
            y2={topoPilha(colocadas) - 1.5}
            stroke="#f5821f"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="3 3"
          />
        )}

        {/* Carrinho, cabo e gancho */}
        <g ref={carroRef} transform={`translate(${PATIO_X} ${TRILHO_Y})`}>
          <rect x="-11" y="-10" width="22" height="10" rx="3" className="fill-slate-600 dark:fill-slate-300" />
          <rect x="-7" y="-6.5" width="6" height="4" rx="1" fill="#f5821f" />
          <line ref={caboRef} x1="0" y1="0" x2="0" y2={CABO_ALTO} className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="1.4" />
          <g ref={ganchoRef} transform={`translate(0 ${CABO_ALTO})`}>
            <rect x="-4" y="-1" width="8" height="6" rx="1.5" fill="#f5821f" />
            {carga && (
              <g>
                <line x1="0" y1="5" x2={-TORA_W / 2} y2="6" className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="1.1" />
                <line x1="0" y1="5" x2={TORA_W / 2} y2="6" className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="1.1" />
                <rect x={-TORA_W / 2} y="6" width={TORA_W} height={TORA_H} className="fill-slate-400 dark:fill-slate-500" />
                <rect x={-TORA_W / 2} y="6" width={TORA_W} height={TORA_H} fill={`url(#${idTora})`} />
              </g>
            )}
          </g>
        </g>
      </svg>
    </CenaMoldura>
  );
}
