/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gemba em 2D: à esquerda a planta baixa do galpão, à direita a prateleira vista de
 * frente (do corredor). Um X vermelho marca o lugar em ambas. SVG puro, sem WebGL,
 * então funciona em qualquer aparelho. A geometria vem de `lib/gembaLayout.ts`.
 */

import React, { useMemo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { doisDigitos } from '../../../lib/gembaEndereco';
import {
  CORREDORES, ESTANTES, GALPAO, METROS_POR_PX, ZONAS, alturaDaEstante, faixaDoAndar, numeracaoInvertidaDeFrente,
  quantidadeVaos, retanguloDoVaoPx, vaosDaVistaDeFrente,
  type AlvoPrateleira, type EstanteGemba, type Localizacao, type Vec2,
} from '../../../lib/gembaLayout';
import { coresGemba, useEscuro, type CoresGemba } from './coresGemba';
import type { SelecaoVao } from './GembaCena';

const VERMELHO = '#dc2626';

interface Props {
  destaques: Localizacao[];
  principal: number;
  selecao: SelecaoVao | null;
  onClicarVao: (estanteId: string, indice: number) => void;
  rotuloVao: (estanteId: string, indice: number) => string | null;
  reduzido: boolean;
}

/** X vermelho com halo branco (legível sobre qualquer cor) e anel que pulsa. */
function MarcaX({ cx, cy, r, reduzido }: { cx: number; cy: number; r: number; reduzido: boolean }) {
  const traco = r * 0.38;
  const d = `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r * 1.6} fill="none" stroke={VERMELHO} strokeWidth={traco * 0.5} opacity={0.6}>
        {!reduzido && <animate attributeName="r" values={`${r * 1.2};${r * 2.3};${r * 1.2}`} dur="1.8s" repeatCount="indefinite" />}
        {!reduzido && <animate attributeName="opacity" values="0.75;0.1;0.75" dur="1.8s" repeatCount="indefinite" />}
      </circle>
      <path d={d} stroke="#fff" strokeWidth={traco + r * 0.35} strokeLinecap="round" fill="none" />
      <path d={d} stroke={VERMELHO} strokeWidth={traco} strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Quebra o nome da zona em duas linhas quando é comprido. */
function quebrar(texto: string): string[] {
  if (texto.length <= 16) return [texto];
  const meio = texto.length / 2;
  let corte = -1;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === ' ' && (corte < 0 || Math.abs(i - meio) < Math.abs(corte - meio))) corte = i;
  }
  return corte < 0 ? [texto] : [texto.slice(0, corte), texto.slice(corte + 1)];
}

function chaveVao(estanteId: string, indice: number): string {
  return `${estanteId}:${indice}`;
}

function CartaoBotao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ativo}
      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-all enabled:hover:opacity-90 enabled:active:scale-95 disabled:opacity-40"
      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
    >
      {children}
    </button>
  );
}

function PlantaBaixa({
  cores, destaques, marcas, selecao, onClicarVao, rotuloVao, reduzido,
}: {
  cores: CoresGemba;
  destaques: Localizacao[];
  marcas: Vec2[];
  selecao: SelecaoVao | null;
  onClicarVao: Props['onClicarVao'];
  rotuloVao: Props['rotuloVao'];
  reduzido: boolean;
}) {
  const [ampliar, setAmpliar] = useState(false);
  const margem = 12;
  const inteira = [GALPAO[0] - margem, GALPAO[1] - margem, GALPAO[2] - GALPAO[0] + 2 * margem, GALPAO[3] - GALPAO[1] + 2 * margem];
  const foco = marcas[0];
  const zoom = ampliar && foco;
  const viewBox = useMemo(() => {
    if (!zoom) return inteira;
    const w = 260;
    const h = w * (inteira[3] / inteira[2]);
    const x = Math.min(Math.max(foco[0] - w / 2, inteira[0]), inteira[0] + inteira[2] - w);
    const y = Math.min(Math.max(foco[1] - h / 2, inteira[1]), inteira[1] + inteira[3] - h);
    return [x, y, w, h];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, foco?.[0], foco?.[1]]);

  const vaosAcesos = useMemo(() => {
    const conjunto = new Set<string>();
    for (const d of destaques) {
      if (d.alvo) conjunto.add(chaveVao(d.alvo.estanteId, d.alvo.indice));
    }
    return conjunto;
  }, [destaques]);
  const estruturasAcesas = useMemo(() => {
    const conjunto = new Set<string>();
    for (const d of destaques) if (!d.alvo) d.estruturas.forEach(id => conjunto.add(id));
    return conjunto;
  }, [destaques]);

  const raioX = zoom ? 6 : 13;

  return (
    <div className="flex min-h-[260px] min-w-0 flex-1 md:flex-[1.5] flex-col rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
        <div className="text-[12px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-secondary)' }}>Planta baixa</div>
        <CartaoBotao ativo={Boolean(foco)} onClick={() => setAmpliar(v => !v)}>
          {zoom ? <><Minimize2 className="h-3.5 w-3.5" /> Planta inteira</> : <><Maximize2 className="h-3.5 w-3.5" /> Ampliar no local</>}
        </CartaoBotao>
      </div>
      <div className="min-h-0 flex-1 p-1.5">
        <svg
          viewBox={viewBox.join(' ')}
          className="h-full w-full"
          role="img"
          aria-label="Planta baixa do almoxarifado com o local marcado por um X vermelho"
          style={{ background: cores.concreto.base, borderRadius: 12 }}
        >
          <rect x={GALPAO[0]} y={GALPAO[1]} width={GALPAO[2] - GALPAO[0]} height={GALPAO[3] - GALPAO[1]} fill="none" stroke={cores.rotulo.tinta} strokeWidth={1.6} opacity={0.55} />

          {CORREDORES.map((c, i) => {
            const horizontal = Math.abs(c.ate[0] - c.de[0]) > Math.abs(c.ate[1] - c.de[1]);
            const meia = c.largura / 2;
            return [-1, 1].map(lado => (
              <line
                key={`${i}-${lado}`}
                x1={c.de[0] + (horizontal ? 0 : lado * meia)} y1={c.de[1] + (horizontal ? lado * meia : 0)}
                x2={c.ate[0] + (horizontal ? 0 : lado * meia)} y2={c.ate[1] + (horizontal ? lado * meia : 0)}
                stroke={cores.faixa} strokeWidth={1.1} strokeDasharray="7 5" opacity={0.85}
              />
            ));
          })}

          {ZONAS.map(z => {
            const cor = cores.zona[z.id] ?? '#64748b';
            const acesa = estruturasAcesas.has(z.id);
            return z.retangulos.map((r, i) => {
              const w = r[2] - r[0];
              const h = r[3] - r[1];
              const cx = r[0] + w / 2;
              const cy = r[1] + h / 2;
              const vertical = w < h * 0.5;
              const linhas = vertical ? [z.rotulo.toUpperCase()] : quebrar(z.rotulo.toUpperCase());
              return (
                <g key={`${z.id}-${i}`} pointerEvents="none">
                  <rect x={r[0]} y={r[1]} width={w} height={h} fill={acesa ? cores.destaque : cor} fillOpacity={acesa ? 0.4 : 0.16} stroke={acesa ? cores.destaque : cor} strokeWidth={acesa ? 2 : 0.9} strokeOpacity={0.85} />
                  {i === 0 && (
                    <text
                      x={cx} y={cy - ((linhas.length - 1) * 4.2) + 2.5}
                      textAnchor="middle" fontSize={7.2} fontWeight={700} fill={cores.rotulo.tinta}
                      transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
                      style={{ letterSpacing: 0.2 }}
                    >
                      {linhas.map((l, k) => <tspan key={k} x={cx} dy={k === 0 ? 0 : 8.4}>{l}</tspan>)}
                    </text>
                  )}
                </g>
              );
            });
          })}

          {ESTANTES.map(e => {
            const total = quantidadeVaos(e);
            const inteiraAcesa = estruturasAcesas.has(e.id);
            const vaos = [];
            for (let i = 0; i < total; i++) {
              const [x1, y1, x2, y2] = retanguloDoVaoPx(e, i);
              const k = chaveVao(e.id, i);
              const doAlvo = vaosAcesos.has(k) || inteiraAcesa;
              const selecionado = selecao?.estanteId === e.id && selecao.indice === i;
              const fill = selecionado ? cores.selecao : doAlvo ? cores.destaque : e.apartamentos ? cores.longarina : cores.montante;
              vaos.push(
                <rect
                  key={k} x={x1} y={y1} width={x2 - x1} height={y2 - y1}
                  fill={fill} stroke={cores.concreto.base} strokeWidth={0.5}
                  className="cursor-pointer transition-opacity hover:opacity-70"
                  onClick={() => onClicarVao(e.id, i)}
                >
                  <title>{rotuloVao(e.id, i) ?? `${e.trilha.join(' · ')} · vão ${i + 1}`}</title>
                </rect>,
              );
            }
            const [, y1, , y2] = retanguloDoVaoPx(e, 0);
            const rua = !e.apartamentos;
            const lx = e.fim[0] + (e.inicio[0] > e.fim[0] ? -5 : 5);
            return (
              <g key={e.id}>
                {vaos}
                {rua && (
                  <text
                    x={lx} y={(y1 + y2) / 2 + 2.5}
                    textAnchor={e.inicio[0] > e.fim[0] ? 'end' : 'start'}
                    fontSize={7.5} fontWeight={800} fill={cores.rotulo.tinta} pointerEvents="none"
                  >
                    {e.trilha[0].toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}

          {marcas.map((m, i) => <MarcaX key={i} cx={m[0]} cy={m[1]} r={raioX} reduzido={reduzido} />)}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[11px] font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="-7 -7 14 14"><path d="M-5 -5L5 5M5 -5L-5 5" stroke={VERMELHO} strokeWidth="3" strokeLinecap="round" /></svg>
          Local
        </span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cores.destaque }} /> Prateleira do item</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cores.montante }} /> Estante</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cores.longarina }} /> Anexo</span>
        <span>Toque numa estante para ver o bloco</span>
      </div>
    </div>
  );
}

function VistaDeFrente({
  cores, estante, alvo, reduzido,
}: { cores: CoresGemba; estante: EstanteGemba; alvo: AlvoPrateleira; reduzido: boolean }) {
  const vaos = vaosDaVistaDeFrente(estante, alvo.indice, 3);
  const invertida = numeracaoInvertidaDeFrente(estante);
  const U = 100; // unidades do SVG por metro
  const larguraVao = estante.larguraBlocoM * U;
  const largura = larguraVao * vaos.length;
  const altura = alturaDaEstante(estante) * U;
  const fs = largura / 45;
  const esquerda = fs * 3.6;
  const baixo = fs * 3.2;
  const topo = fs * 1.2;
  const y = (m: number) => altura - m * U;

  const nAndares = estante.alturasAndarM.length;
  const faixas = Array.from({ length: nAndares + 1 }, (_, a) => ({ andar: a, f: faixaDoAndar(estante, a)! }));
  const grade = estante.apartamentos;
  const posicao = vaos.indexOf(alvo.indice);

  // Caixa do alvo (em unidades do SVG), sempre na tela, já espelhada quando a numeração corre ao contrário.
  let alvoCaixa: { x: number; y: number; w: number; h: number } | null = null;
  if (posicao >= 0) {
    const x0 = posicao * larguraVao;
    const f = alvo.andar != null ? faixaDoAndar(estante, alvo.andar) : null;
    if (!f) {
      alvoCaixa = { x: x0, y: 0, w: larguraVao, h: altura };
    } else if (alvo.apartamento != null && grade && grade.andares.includes(alvo.andar!)) {
      const c = (alvo.apartamento - 1) % grade.colunas;
      const l = Math.floor((alvo.apartamento - 1) / grade.colunas);
      const colunaTela = invertida ? grade.colunas - 1 - c : c;
      const wc = larguraVao / grade.colunas;
      const hl = ((f[1] - f[0]) * U) / grade.linhas;
      alvoCaixa = { x: x0 + colunaTela * wc, y: y(f[1]) + l * hl, w: wc, h: hl };
    } else {
      alvoCaixa = { x: x0, y: y(f[1]), w: larguraVao, h: (f[1] - f[0]) * U };
    }
  }
  const raio = alvoCaixa ? Math.min(Math.max(Math.min(alvoCaixa.w, alvoCaixa.h) * 0.55, fs * 1.1), fs * 3.4) : 0;
  const montante = Math.max(3, fs * 0.28);

  return (
    <svg
      viewBox={`${-esquerda} ${-topo} ${largura + esquerda + fs} ${altura + topo + baixo}`}
      className="h-full w-full"
      role="img"
      aria-label="Vista de frente da prateleira com o local marcado por um X vermelho"
    >
      {/* fundo de cada vão e de cada andar */}
      {vaos.map((_, k) => faixas.map(({ andar, f }) => (
        <rect
          key={`${k}-${andar}`} x={k * larguraVao} y={y(f[1])} width={larguraVao} height={(f[1] - f[0]) * U}
          fill={cores.prateleira} fillOpacity={andar === 0 ? 0.45 : 0.22}
        />
      )))}

      {/* grade de apartamentos */}
      {grade && vaos.map((_, k) => faixas.filter(({ andar }) => grade.andares.includes(andar)).map(({ andar, f }) => {
        const h = (f[1] - f[0]) * U;
        const linhas = [];
        for (let c = 1; c < grade.colunas; c++) {
          const x = k * larguraVao + (larguraVao * c) / grade.colunas;
          linhas.push(<line key={`c${c}`} x1={x} x2={x} y1={y(f[1])} y2={y(f[1]) + h} />);
        }
        for (let l = 1; l < grade.linhas; l++) {
          const yy = y(f[1]) + (h * l) / grade.linhas;
          linhas.push(<line key={`l${l}`} x1={k * larguraVao} x2={(k + 1) * larguraVao} y1={yy} y2={yy} />);
        }
        return <g key={`${k}-${andar}`} stroke={cores.rotulo.tinta} strokeWidth={0.6} opacity={0.4}>{linhas}</g>;
      }))}

      {/* longarinas no topo de cada andar */}
      {faixas.map(({ andar, f }) => (
        <rect key={andar} x={0} y={y(f[1])} width={largura} height={Math.max(2.5, fs * 0.3)} fill={cores.longarina} />
      ))}
      {/* montantes */}
      {Array.from({ length: vaos.length + 1 }, (_, k) => (
        <rect key={k} x={k * larguraVao - montante / 2} y={0} width={montante} height={altura} fill={cores.montante} />
      ))}
      <rect x={-fs} y={altura} width={largura + 2 * fs} height={Math.max(3, fs * 0.35)} fill={cores.rotulo.tinta} opacity={0.6} />

      {/* andares */}
      {faixas.map(({ andar, f }) => (
        <text
          key={andar} x={-fs * 0.6} y={y((f[0] + f[1]) / 2) + fs * 0.35}
          textAnchor="end" fontSize={fs} fontWeight={800} fill={cores.rotulo.tinta}
          opacity={alvo.andar === andar ? 1 : 0.65}
        >
          {andar === 0 ? 'Chão' : `A${doisDigitos(andar)}`}
        </text>
      ))}

      {/* blocos */}
      {vaos.map((i, k) => {
        const bloco = estante.blocos[i];
        const eAlvo = i === alvo.indice;
        return (
          <text
            key={i} x={k * larguraVao + larguraVao / 2} y={altura + fs * 1.9}
            textAnchor="middle" fontSize={fs * 1.05} fontWeight={eAlvo ? 900 : 700}
            fill={eAlvo ? VERMELHO : cores.rotulo.tinta} opacity={eAlvo ? 1 : 0.7}
          >
            {bloco != null ? `Bloco ${doisDigitos(bloco)}` : '—'}
          </text>
        );
      })}

      {/* alvo */}
      {alvoCaixa && (
        <g>
          <rect
            x={alvoCaixa.x} y={alvoCaixa.y} width={alvoCaixa.w} height={alvoCaixa.h}
            fill={VERMELHO} fillOpacity={0.22} stroke={VERMELHO} strokeWidth={Math.max(1.6, fs * 0.16)}
          />
          <MarcaX cx={alvoCaixa.x + alvoCaixa.w / 2} cy={alvoCaixa.y + alvoCaixa.h / 2} r={raio} reduzido={reduzido} />
        </g>
      )}
    </svg>
  );
}

function PainelPrateleira({
  cores, estante, alvo, titulo, aproximado, reduzido,
}: {
  cores: CoresGemba;
  estante: EstanteGemba | null;
  alvo: AlvoPrateleira | null;
  titulo: string | null;
  aproximado: boolean;
  reduzido: boolean;
}) {
  let corpo: React.ReactNode;
  if (estante && alvo) {
    corpo = <VistaDeFrente cores={cores} estante={estante} alvo={alvo} reduzido={reduzido} />;
  } else {
    corpo = (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
        {titulo
          ? 'Este lugar é uma área ou um depósito inteiro, não uma prateleira. Veja onde fica na planta ao lado.'
          : 'Busque um item, ou toque numa estante da planta, para ver a prateleira de frente.'}
      </div>
    );
  }
  return (
    <div className="flex min-h-[260px] min-w-0 flex-1 flex-col rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
      <div className="border-b px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
        <div className="text-[12px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-secondary)' }}>Prateleira · vista de frente</div>
        {titulo && <div className="mt-0.5 text-[12px] font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>{titulo}</div>}
        {aproximado && (
          <div className="mt-0.5 text-[11px] font-semibold" style={{ color: '#b45309' }}>
            Aproximado: o mapa só acha o que se sabe desta posição.
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 p-2">{corpo}</div>
      {estante && alvo && (
        <div className="border-t px-3 py-1.5 text-[11px] font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          Como se vê de pé no corredor, de frente para a estante. A1, A2… são os andares; Chão é o nível do piso.
        </div>
      )}
    </div>
  );
}

export default function Gemba2D({ destaques, principal, selecao, onClicarVao, rotuloVao, reduzido }: Props) {
  const escuro = useEscuro();
  const cores = coresGemba(escuro);

  const loc = destaques[principal] ?? null;
  const alvo: AlvoPrateleira | null = loc?.alvo ?? (!loc && selecao ? { estanteId: selecao.estanteId, indice: selecao.indice } : null);
  const estante = alvo ? ESTANTES.find(e => e.id === alvo.estanteId) ?? null : null;

  // Um X em cada lugar do endereço: no vão exato, ou no centro de cada área/estante quando só se sabe o depósito.
  const marcas = useMemo<Vec2[]>(() => {
    if (alvo && estante) {
      const [x1, y1, x2, y2] = retanguloDoVaoPx(estante, alvo.indice);
      return [[(x1 + x2) / 2, (y1 + y2) / 2]];
    }
    if (!loc) return [];
    return loc.caixas.map((c): Vec2 => [c.centro[0] / METROS_POR_PX, c.centro[2] / METROS_POR_PX]);
  }, [alvo, estante, loc]);

  let titulo: string | null = loc ? loc.trilha.join(' › ') : null;
  if (!loc && alvo && estante) {
    const bloco = estante.blocos[alvo.indice];
    titulo = `${estante.trilha.join(' · ')}${bloco != null ? ` · Bloco ${doisDigitos(bloco)}` : ''}`;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="flex min-h-full flex-col gap-2 md:h-full md:min-h-0 md:flex-row">
        <PlantaBaixa
          cores={cores}
          destaques={destaques}
          marcas={marcas}
          selecao={selecao}
          onClicarVao={onClicarVao}
          rotuloVao={rotuloVao}
          reduzido={reduzido}
        />
        <PainelPrateleira cores={cores} estante={estante} alvo={alvo} titulo={titulo} aproximado={Boolean(loc?.aproximado)} reduzido={reduzido} />
      </div>
    </div>
  );
}
