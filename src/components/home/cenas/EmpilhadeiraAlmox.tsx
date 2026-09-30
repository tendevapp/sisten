/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena "empilhadeira": no almoxarifado, a empilhadeira tira as caixas da
 * estante, uma a uma, e leva à plataforma de conferência, que apita e soma na
 * contagem. Sozinha, esvazia a estante em ordem (de cima para baixo, coluna a
 * coluna) e recomeça; clicar numa caixa manda a empilhadeira buscá-la primeiro.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CENA_A, CENA_L, CenaMoldura, limitar, n1, useMovimentoReduzido, useQuadros } from './util';

const CHAO = 188;
const COL_X = [80, 122, 164];
const NIVEL = [0, 42]; // altura do fundo de cada prateleira
const BOX_W = 26;
const BOX_H = 24;
const CO = 46; // centro da carga em relação ao eixo da empilhadeira
const DOCA_X = 288;
const PLAT = 8;
const VEL_X = 72;
const VEL_LIFT = 46;

// De cima para baixo, coluna a coluna: a empilhadeira nunca pega uma caixa com outra na frente.
const VAGAS = COL_X.flatMap((_, col) => [1, 0].map(nivel => ({ col, nivel })));

type Fase = 'espera' | 'ir' | 'pegar' | 'subir' | 'levar' | 'largar' | 'volta';

/** Caixa sobre um pallet, com a base do pallet em (0,0). */
function Caixa() {
  return (
    <g>
      <rect x={-BOX_W / 2} y="-4" width="4" height="4" className="fill-amber-800 dark:fill-amber-900" />
      <rect x={BOX_W / 2 - 4} y="-4" width="4" height="4" className="fill-amber-800 dark:fill-amber-900" />
      <rect x={-BOX_W / 2} y="-5.5" width={BOX_W} height="1.8" className="fill-amber-700 dark:fill-amber-800" />
      <rect x={-BOX_W / 2} y={-5.5 - BOX_H} width={BOX_W} height={BOX_H} rx="1.5" className="fill-amber-300 stroke-amber-500 dark:fill-amber-600 dark:stroke-amber-400" strokeWidth="1" />
      <rect x="-2" y={-5.5 - BOX_H} width="4" height={BOX_H} className="fill-amber-200/80 dark:fill-amber-400/50" />
      <rect x={-BOX_W / 2 + 3} y={-5.5 - BOX_H + 12} width="9" height="6" rx="1" className="fill-white/80 dark:fill-slate-200/80" />
    </g>
  );
}

export default function EmpilhadeiraAlmox() {
  const reduzido = useMovimentoReduzido();
  const corpoRef = useRef<SVGGElement>(null);
  const garfoRef = useRef<SVGGElement>(null);
  const bipeRef = useRef<SVGGElement>(null);

  const [caixas, setCaixas] = useState<boolean[]>(() => VAGAS.map(() => true));
  const [carga, setCarga] = useState(false);
  const [naDoca, setNaDoca] = useState(false);
  const [contagem, setContagem] = useState(0);

  const e = useRef({
    x: 20,
    lift: 0,
    alvoX: 20,
    alvoLift: 0,
    fase: 'espera' as Fase,
    espera: 0.7,
    pausa: 0,
    fimTimer: 0,
    slot: -1,
    manual: -1,
    caixas: VAGAS.map(() => true),
    contagem: 0,
    bipe: 0,
    reduzido,
  });
  e.current.reduzido = reduzido;

  useEffect(() => {
    e.current.reduzido = reduzido;
  }, [reduzido]);

  const acordar = useQuadros(dt => {
    const s = e.current;
    const passo = s.reduzido ? 3 : 1;
    s.x += limitar(s.alvoX - s.x, -VEL_X * dt * passo, VEL_X * dt * passo);
    s.lift += limitar(s.alvoLift - s.lift, -VEL_LIFT * dt * passo, VEL_LIFT * dt * passo);
    const noX = Math.abs(s.alvoX - s.x) < 0.5;
    const noLift = Math.abs(s.alvoLift - s.lift) < 0.5;

    switch (s.fase) {
      case 'espera': {
        if (s.fimTimer > 0) {
          s.fimTimer -= dt;
          if (s.fimTimer <= 0) {
            s.caixas = VAGAS.map(() => true);
            s.contagem = 0;
            setCaixas([...s.caixas]);
            setContagem(0);
            setNaDoca(false);
          }
          break;
        }
        s.espera -= dt;
        if (s.espera > 0) break;
        const manualValido = s.manual >= 0 && s.caixas[s.manual];
        const proxima = manualValido ? s.manual : s.reduzido ? -1 : s.caixas.findIndex(Boolean);
        s.manual = -1;
        if (proxima >= 0) {
          s.slot = proxima;
          s.fase = 'ir';
          s.alvoX = COL_X[VAGAS[proxima].col] - CO;
          s.alvoLift = NIVEL[VAGAS[proxima].nivel];
        } else if (!s.caixas.some(Boolean)) {
          s.fimTimer = 1.8;
        }
        break;
      }
      case 'ir':
        if (noX && noLift) {
          s.fase = 'pegar';
          s.pausa = 0.25;
        }
        break;
      case 'pegar':
        s.pausa -= dt;
        if (s.pausa <= 0) {
          s.caixas[s.slot] = false;
          setCaixas([...s.caixas]);
          setCarga(true);
          setNaDoca(false);
          s.alvoLift = NIVEL[VAGAS[s.slot].nivel] + 6;
          s.fase = 'subir';
        }
        break;
      case 'subir':
        if (noLift) {
          s.fase = 'levar';
          s.alvoX = DOCA_X - CO;
          s.alvoLift = PLAT + 3;
        }
        break;
      case 'levar':
        if (noX && noLift) {
          s.fase = 'largar';
          s.alvoLift = PLAT;
        }
        break;
      case 'largar':
        if (noLift) {
          s.contagem += 1;
          setCarga(false);
          setNaDoca(true);
          setContagem(s.contagem);
          s.bipe = 0.5;
          s.fase = 'volta';
          s.alvoLift = 0;
          s.alvoX = DOCA_X - CO - 34;
        }
        break;
      case 'volta':
        if (noX && noLift) {
          s.fase = 'espera';
          s.espera = 0.3;
        }
        break;
    }

    if (s.bipe > 0) s.bipe = Math.max(0, s.bipe - dt);
    if (bipeRef.current) bipeRef.current.style.opacity = s.bipe > 0 && Math.floor(s.bipe * 10) % 2 === 0 ? '1' : '0';

    corpoRef.current?.setAttribute('transform', `translate(${n1(s.x)} ${CHAO})`);
    garfoRef.current?.setAttribute('transform', `translate(0 ${n1(-s.lift)})`);

    // Só dorme em movimento reduzido, esperando um clique.
    const ocupada = s.fase !== 'espera' || s.fimTimer > 0 || s.bipe > 0 || !noX || !noLift;
    return !s.reduzido || ocupada || s.manual >= 0;
  });

  const escolher = (i: number) => {
    const s = e.current;
    if (!s.caixas[i]) return;
    s.manual = i;
    s.espera = Math.min(s.espera, 0.1);
    acordar();
  };

  return (
    <CenaMoldura>
      <svg viewBox={`0 0 ${CENA_L} ${CENA_A}`} className="h-full w-full touch-pan-y">
        {/* Chão */}
        <rect x="0" y={CHAO} width={CENA_L} height="12" className="fill-slate-200 dark:fill-slate-800" />

        {/* Painel da contagem */}
        <g>
          <rect x="204" y="16" width="100" height="36" rx="5" className="fill-slate-700 dark:fill-slate-900" />
          <text x="212" y="29" fontSize="8" fontWeight="700" letterSpacing="1" fill="#94a3b8" fontFamily="system-ui, sans-serif">
            CONFERIDO
          </text>
          <text x="212" y="46" fontSize="15" fontWeight="800" fill={contagem >= VAGAS.length ? '#22c55e' : '#f5821f'} fontFamily="system-ui, sans-serif">
            {contagem} / {VAGAS.length}
          </text>
          <circle cx="292" cy="28" r="3.5" fill={naDoca ? '#22c55e' : '#475569'} />
        </g>

        {/* Estante */}
        <g className="fill-slate-400 dark:fill-slate-600">
          <rect x="62" y="104" width="4" height={CHAO - 104} />
          <rect x="182" y="104" width="4" height={CHAO - 104} />
          <rect x="100" y="104" width="2" height={CHAO - 104} className="fill-slate-300 dark:fill-slate-700" />
          <rect x="142" y="104" width="2" height={CHAO - 104} className="fill-slate-300 dark:fill-slate-700" />
          <rect x="62" y={CHAO - NIVEL[1] - 1} width="124" height="3" />
          <rect x="62" y="104" width="124" height="3" />
        </g>

        {/* Caixas na estante (clicáveis) */}
        {VAGAS.map((v, i) =>
          caixas[i] ? (
            <g
              key={i}
              transform={`translate(${COL_X[v.col]} ${CHAO - NIVEL[v.nivel]})`}
              onClick={() => escolher(i)}
              className="cursor-pointer"
            >
              <rect x={-BOX_W / 2 - 4} y={-BOX_H - 8} width={BOX_W + 8} height={BOX_H + 8} fill="transparent" />
              <Caixa />
            </g>
          ) : null,
        )}

        {/* Plataforma de conferência + leitor */}
        <rect x="266" y={CHAO - PLAT} width="44" height={PLAT} rx="2" className="fill-slate-500 dark:fill-slate-400" />
        {naDoca && (
          <g transform={`translate(${DOCA_X} ${CHAO - PLAT})`} className="cena-assenta">
            <Caixa />
          </g>
        )}
        <g ref={bipeRef} style={{ opacity: 0 }}>
          <line x1={DOCA_X - 16} x2={DOCA_X + 16} y1={CHAO - PLAT - 18} y2={CHAO - PLAT - 18} stroke="#ef4444" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx={DOCA_X} cy={CHAO - PLAT - 18} r="6" fill="#ef4444" fillOpacity="0.25" />
        </g>

        {/* Empilhadeira: rodas, corpo, cabine e o garfo que sobe e desce */}
        <g ref={corpoRef} transform={`translate(20 ${CHAO})`} style={{ pointerEvents: 'none' }}>
          <rect x="30" y="-62" width="3" height="56" rx="1" className="fill-slate-500 dark:fill-slate-300" />
          <rect x="-8" y="-24" width="12" height="18" rx="3" className="fill-slate-700 dark:fill-slate-400" />
          <rect x="-4" y="-22" width="36" height="14" rx="3" fill="#f5821f" />
          <path d="M2 -22 V-44 M24 -22 V-44" className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="2" fill="none" />
          <rect x="-1" y="-46" width="28" height="3" rx="1.5" className="fill-slate-600 dark:fill-slate-300" />
          <circle cx="12" cy="-33" r="3.4" className="fill-slate-700 dark:fill-slate-200" />
          <rect x="9" y="-29" width="7" height="7" rx="2" className="fill-slate-700 dark:fill-slate-200" />
          <circle cx="6" cy="-7" r="7" className="fill-slate-800 dark:fill-slate-950" />
          <circle cx="26" cy="-6" r="6" className="fill-slate-800 dark:fill-slate-950" />
          <circle cx="6" cy="-7" r="2.4" className="fill-slate-400" />
          <circle cx="26" cy="-6" r="2.2" className="fill-slate-400" />
          <g ref={garfoRef}>
            <rect x="33" y="-22" width="3" height="21.5" rx="1" className="fill-slate-600 dark:fill-slate-300" />
            <rect x="33" y="-3.5" width="24" height="3" rx="1" className="fill-slate-600 dark:fill-slate-300" />
            {carga && (
              <g transform={`translate(${CO} 0)`}>
                <Caixa />
              </g>
            )}
          </g>
        </g>
      </svg>
    </CenaMoldura>
  );
}
