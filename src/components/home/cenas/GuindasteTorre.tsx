/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "guindaste": a carga pende do carrinho e balança. Passar o mouse faz o
 * guindaste balançar (quanto mais se mexe, mais ele sacode), e a torre já
 * feita também deixa a carga mais nervosa a cada tronco. Um clique (ou toque)
 * solta o cilindro: se ele estiver sobre o encaixe, assenta e o guindaste iça
 * o próximo; se estiver fora, cai — e, havendo torre, ela desaba. Com seis
 * troncos a torre fecha (nacele e rotor giram) e tudo recomeça.
 *
 * O balanço é cinemático (amplitude × seno), não uma simulação: dá para o
 * marcador do encaixe ficar verde exatamente quando soltar é seguro.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, PA_ROTOR, limitar, n1, useIdSvg, useMovimentoReduzido, useQuadros } from './util';

const CHAO = 188;
const SEG_A = 20; // altura de cada tronco
const SEG_TOTAL = 6;
const TX = 210; // eixo da torre e do carrinho
const JIB_Y = 18; // altura do carrinho
const FOLGA = 24; // vão entre o cilindro no gancho e o topo da torre
const SUBIDA = 70; // de onde o cilindro novo é içado
const TOLERANCIA = 7; // desvio máximo (px) para o tronco encaixar
const PATIO_FIM = 182; // borda direita da pilha de troncos deitados

const OMEGA = 2.3; // rad/s do balanço
const AMP_MAX = 26;
const AMP_MOUSE = 24; // amplitude alvo com o mouse por cima

const largura = (i: number) => 32 - i * 2.4;
const topo = (n: number) => CHAO - n * SEG_A;
/** Amplitude em repouso: pequena no começo, cresce com a altura da torre. */
const ampRepouso = (n: number) => 3 + 1.5 * Math.min(n, 5);

const MASTRO_X = 50;
/** Treliça do mastro: zigue-zague entre as duas colunas. */
const TRELICA = (() => {
  const pts: string[] = [];
  for (let y = 22, lado = 0; y < CHAO; y += 12, lado ^= 1) pts.push(`${MASTRO_X + (lado ? 5 : -5)} ${y}`);
  return `M${pts.join(' L')}`;
})();

type Fase = 'pendura' | 'descendo' | 'desaba' | 'completa' | 'some';

interface Solto {
  x: number; // centro do cilindro solto, em coordenadas da cena
  y: number;
  dir: -1 | 1;
}

export default function GuindasteTorre() {
  const idCilindro = useIdSvg('gc');
  const reduzido = useMovimentoReduzido();
  const [n, setN] = useState(0);
  const [rodada, setRodada] = useState(0);
  const [fase, setFase] = useState<Fase>('pendura');
  const [solto, setSolto] = useState<Solto | null>(null);
  const [impacto, setImpacto] = useState(false);
  const timers = useRef<number[]>([]);
  const gruaRef = useRef<SVGGElement>(null);
  const balancoRef = useRef<SVGGElement>(null);
  const alvoRef = useRef<SVGGElement>(null);
  const alvoLinhaRef = useRef<SVGLineElement>(null);

  const emCima = topo(n);
  const larg = largura(Math.min(n, SEG_TOTAL - 1));
  const cilTopo = emCima - FOLGA - SEG_A;
  const cabo = cilTopo - 6 - JIB_Y;
  const carregando = n < SEG_TOTAL;
  const comprimento = cilTopo + SEG_A / 2 - JIB_Y; // do carrinho ao centro da carga

  const e = useRef({ amp: 3, fase: 0, x: 0, sobre: false, comprimento, n, estado: fase as Fase, reduzido });
  e.current.comprimento = comprimento;
  e.current.n = n;
  e.current.estado = fase;
  e.current.reduzido = reduzido;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const depois = (ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms));

  const acordar = useQuadros(dt => {
    const s = e.current;
    const pendurado = s.estado === 'pendura' || s.estado === 'descendo' || s.estado === 'desaba';
    const alvoAmp =
      s.estado === 'descendo' ? 0 : s.sobre ? AMP_MOUSE : s.reduzido ? 0 : ampRepouso(s.n);
    s.amp += (alvoAmp - s.amp) * Math.min(1, dt * (s.estado === 'descendo' ? 14 : 1.3));
    s.fase += OMEGA * dt;
    s.x = s.amp * Math.sin(s.fase);

    const ang = (Math.asin(limitar(s.x / s.comprimento, -1, 1)) * 180) / Math.PI;
    balancoRef.current?.setAttribute('transform', `rotate(${n1(ang)} ${TX} ${JIB_Y})`);
    // A estrutura acompanha de leve o sacolejo da carga.
    gruaRef.current?.setAttribute('transform', `rotate(${n1(-s.x * 0.018)} ${MASTRO_X} ${CHAO})`);

    // Marcador do encaixe: verde quando soltar agora é seguro.
    if (alvoRef.current) alvoRef.current.style.opacity = s.estado === 'pendura' ? '1' : '0';
    alvoLinhaRef.current?.setAttribute('stroke', Math.abs(s.x) <= TOLERANCIA ? '#22c55e' : '#f5821f');

    if (!pendurado) return !s.reduzido || s.sobre;
    return !s.reduzido || s.sobre || s.amp > 0.05;
  });

  const balancar = (ev: React.PointerEvent<SVGSVGElement>) => {
    const s = e.current;
    s.sobre = true;
    s.amp = Math.min(AMP_MAX, s.amp + Math.abs(ev.movementX || 0) * 0.12);
    acordar();
  };
  const parar = () => {
    e.current.sobre = false;
    acordar();
  };

  const recomecar = () => {
    setN(0);
    setSolto(null);
    setImpacto(false);
    setRodada(r => r + 1);
    setFase('pendura');
  };

  const clicar = () => {
    if (fase !== 'pendura') return;
    const x = e.current.x;

    if (Math.abs(x) <= TOLERANCIA) {
      setFase('descendo');
      depois(330, () => {
        const prox = n + 1;
        setN(prox);
        if (prox < SEG_TOTAL) {
          setFase('pendura');
          return;
        }
        setFase('completa');
        depois(4200, () => setFase('some'));
        depois(4900, recomecar);
      });
      return;
    }

    // Fora do encaixe: a carga cai e, havendo torre, ela desaba para o lado do erro.
    const dir: -1 | 1 = x < 0 ? -1 : 1;
    setSolto({ x: TX + x, y: cilTopo + SEG_A / 2, dir });
    setFase('desaba');
    if (n === 0) {
      depois(2600, recomecar);
      return;
    }
    depois(550, () => setImpacto(true));
    depois(2400, () => setFase('some'));
    depois(3000, recomecar);
  };

  // Nacele + rotor no topo da torre pronta.
  const hubX = TX + 9;
  const hubY = topo(SEG_TOTAL) - 6;

  const dirQueda = solto?.dir ?? 1;
  const passoQueda = 14;
  // O cilindro rola para o lado do erro, mas nunca para dentro da pilha de troncos.
  const pousoCilindro = (w: number) => {
    const de = solto?.x ?? TX;
    const para = limitar(de + dirQueda * (44 + n * passoQueda), PATIO_FIM + SEG_A / 2 + 4, CENA_L - SEG_A);
    return {
      ['--dx' as string]: `${para - de}px`,
      ['--dy' as string]: `${CHAO - w / 2 - (solto?.y ?? 0)}px`,
      ['--rot' as string]: `${dirQueda * 92}deg`,
    };
  };

  return (
    <CenaMoldura>
      <svg
        viewBox={`0 0 ${CENA_L} ${CENA_A}`}
        className="h-full w-full cursor-pointer"
        onClick={clicar}
        onPointerMove={balancar}
        onPointerLeave={parar}
        onPointerCancel={parar}
      >
        <defs>
          <linearGradient id={idCilindro} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* Chão */}
        <rect x="0" y={CHAO} width={CENA_L} height="12" className="fill-slate-200 dark:fill-slate-800" />

        {/* Pátio: troncos deitados esperando a vez */}
        <g>
          {[
            [88, CHAO - 14, 46],
            [136, CHAO - 14, 46],
            [112, CHAO - 28, 46],
          ].map(([x, y, w], i) => (
            <g key={i}>
              <rect x={x} y={y} width={w} height="14" rx="2" className="fill-slate-400 dark:fill-slate-500" />
              <line x1={x + 4} y1={y} x2={x + 4} y2={y + 14} className="stroke-slate-500 dark:stroke-slate-300" strokeWidth="1.2" />
              <line x1={x + w - 4} y1={y} x2={x + w - 4} y2={y + 14} className="stroke-slate-500 dark:stroke-slate-300" strokeWidth="1.2" />
            </g>
          ))}
        </g>

        {/* Torre em construção */}
        <g className={fase === 'some' ? 'cena-some' : undefined}>
          {Array.from({ length: n }, (_, i) => {
            const w = largura(i);
            const y = topo(i + 1);
            const caindo = fase === 'desaba' || fase === 'some';
            const nova = i === n - 1 && !caindo;
            const estilo = caindo
              ? {
                  ['--dx' as string]: `${dirQueda * (24 + i * passoQueda)}px`,
                  ['--dy' as string]: `${CHAO - w / 2 - (topo(i) - SEG_A / 2)}px`,
                  ['--rot' as string]: `${dirQueda * (88 + (i % 2) * 5)}deg`,
                  ['--atraso' as string]: `${(n - 1 - i) * 0.07}s`,
                }
              : undefined;
            return (
              <g key={i} className={caindo ? 'cena-desaba' : nova ? 'cena-assenta' : undefined} style={estilo}>
                <rect x={TX - w / 2} y={y} width={w} height={SEG_A} className="fill-slate-400 dark:fill-slate-500" />
                <rect x={TX - w / 2} y={y} width={w} height={SEG_A} fill={`url(#${idCilindro})`} />
                <rect x={TX - w / 2 - 1.2} y={y} width={w + 2.4} height="2.4" rx="1" className="fill-slate-500 dark:fill-slate-300" />
              </g>
            );
          })}
          {n > 0 && fase === 'pendura' && (
            <g key={`poeira-${n}`} className="fill-slate-300 dark:fill-slate-500">
              <ellipse className="cena-poeira" cx={TX - largura(n - 1) / 2 - 3} cy={topo(n - 1) - 1} rx="6" ry="2.5" />
              <ellipse className="cena-poeira" cx={TX + largura(n - 1) / 2 + 3} cy={topo(n - 1) - 1} rx="6" ry="2.5" />
            </g>
          )}

          {/* Torre completa: nacele e rotor */}
          {n === SEG_TOTAL && (
            <g>
              <rect x={TX - 5} y={hubY - 6} width="22" height="12" rx="6" className="fill-slate-500 dark:fill-slate-300" />
              <g className="cena-gira" style={{ transformOrigin: `${hubX}px ${hubY}px` }}>
                <g transform={`translate(${hubX} ${hubY}) scale(0.5)`} className="fill-slate-500 dark:fill-slate-200">
                  <path d={PA_ROTOR} transform="rotate(-90)" />
                  <path d={PA_ROTOR} transform="rotate(30)" />
                  <path d={PA_ROTOR} transform="rotate(150)" />
                </g>
                <circle cx={hubX} cy={hubY} r="3" fill="#f5821f" />
              </g>
            </g>
          )}
        </g>

        {/* Cilindro solto fora do encaixe: cai e rola para o lado do erro */}
        {solto && (
          <g transform={`translate(${n1(solto.x)} ${n1(solto.y)})`}>
            <g className="cena-solta" style={pousoCilindro(larg)}>
              <rect x={-larg / 2} y={-SEG_A / 2} width={larg} height={SEG_A} className="fill-slate-400 dark:fill-slate-500" />
              <rect x={-larg / 2} y={-SEG_A / 2} width={larg} height={SEG_A} fill={`url(#${idCilindro})`} />
            </g>
          </g>
        )}

        {/* Poeira do desabamento */}
        {impacto && (
          <g className="fill-slate-300 dark:fill-slate-500">
            {[0, 1, 2, 3].map(k => (
              <ellipse
                key={k}
                className="cena-poeira"
                cx={TX + dirQueda * (20 + k * 22)}
                cy={CHAO - 2}
                rx="9"
                ry="3.5"
                style={{ animationDelay: `${k * 0.08}s`, animationFillMode: 'both' }}
              />
            ))}
          </g>
        )}

        {/* Guindaste inteiro: sacode de leve com a carga */}
        <g ref={gruaRef}>
          <g className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="2.2" fill="none" strokeLinecap="round">
            <line x1={MASTRO_X - 5} y1="20" x2={MASTRO_X - 5} y2={CHAO} strokeWidth="3" />
            <line x1={MASTRO_X + 5} y1="20" x2={MASTRO_X + 5} y2={CHAO} strokeWidth="3" />
            <path d={TRELICA} strokeWidth="1.4" />
            <line x1={MASTRO_X} y1="4" x2="292" y2={JIB_Y - 1} strokeWidth="1.2" />
            <line x1={MASTRO_X} y1="4" x2="14" y2={JIB_Y - 1} strokeWidth="1.2" />
          </g>
          <rect x="10" y={JIB_Y - 1} width="290" height="5" rx="2.5" className="fill-slate-400 dark:fill-slate-500" />
          <rect x="10" y={JIB_Y + 3} width="16" height="12" rx="2" className="fill-slate-500 dark:fill-slate-400" />
          <rect x={MASTRO_X - 9} y="8" width="18" height="12" rx="3" fill="#f5821f" />
          <rect x={MASTRO_X - 6} y="10.5" width="7" height="6" rx="1" className="fill-sky-100 dark:fill-sky-900" />
          <rect x={TX - 8} y={JIB_Y - 3} width="16" height="8" rx="2" className="fill-slate-600 dark:fill-slate-300" />

          {/* Gancho (com ou sem carga): balança pendurado no carrinho */}
          {carregando && (
            <g
              key={`${n}-${rodada}`}
              ref={balancoRef}
              style={{ ['--desl' as string]: `${SUBIDA}px`, ['--sy' as string]: (cabo + SUBIDA) / cabo }}
            >
              <line
                x1={TX}
                y1={JIB_Y}
                x2={TX}
                y2={JIB_Y + cabo}
                className={`cena-icar-cabo stroke-slate-600 dark:stroke-slate-300 ${fase === 'descendo' ? 'cena-desce-cabo' : ''}`}
                strokeWidth="1.4"
                style={{ transformOrigin: `${TX}px ${JIB_Y}px`, ['--sy-desce' as string]: (cabo + FOLGA) / cabo }}
              />
              <g className={`cena-icar ${fase === 'descendo' ? 'cena-desce' : ''}`}>
                <line x1={TX} y1={cilTopo - 6} x2={TX - larg / 2} y2={cilTopo} className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="1.1" />
                <line x1={TX} y1={cilTopo - 6} x2={TX + larg / 2} y2={cilTopo} className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="1.1" />
                <rect x={TX - 4} y={cilTopo - 10} width="8" height="6" rx="1.5" fill="#f5821f" />
                {fase !== 'desaba' && (
                  <>
                    <rect x={TX - larg / 2} y={cilTopo} width={larg} height={SEG_A} className="fill-slate-400 dark:fill-slate-500" />
                    <rect x={TX - larg / 2} y={cilTopo} width={larg} height={SEG_A} fill={`url(#${idCilindro})`} />
                    <rect x={TX - larg / 2 - 1.2} y={cilTopo + SEG_A - 2.4} width={larg + 2.4} height="2.4" rx="1" className="fill-slate-500 dark:fill-slate-300" />
                  </>
                )}
              </g>
            </g>
          )}
        </g>

        {/* Encaixe: fica verde quando soltar agora é seguro */}
        {carregando && (
          <g ref={alvoRef} style={{ transition: 'opacity .2s' }}>
            <line
              ref={alvoLinhaRef}
              x1={TX - TOLERANCIA}
              x2={TX + TOLERANCIA}
              y1={emCima - 1.5}
              y2={emCima - 1.5}
              stroke="#f5821f"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray="3 3"
            />
          </g>
        )}
      </svg>
    </CenaMoldura>
  );
}
