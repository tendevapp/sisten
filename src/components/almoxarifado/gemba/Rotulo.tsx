/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rótulo desenhado num canvas e mostrado como sprite: fica dentro do WebGL, sem
 * um nó de DOM por etiqueta (o <Html> do drei pesa no celular e enche o console
 * de avisos com o React 19).
 *
 * `px` mantém o tamanho na tela (placas de orientação); `metros` faz o rótulo
 * crescer ao chegar perto (números de bloco).
 */

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export interface EstiloRotulo {
  fundo: string;
  tinta: string;
  borda: string;
}

interface Props {
  texto: string;
  posicao: [number, number, number];
  estilo: EstiloRotulo;
  px?: number;
  metros?: number;
  opacidade?: number;
  /** Aparece por cima das estantes (placas que não podem sumir atrás da carga). */
  sempreVisivel?: boolean;
  /** Esconde o rótulo com a câmera mais longe que isso (m): de longe, nomes demais viram ruído. */
  distanciaMaxima?: number;
}

const ondeEsta = new THREE.Vector3();

const FONTE = 44;
const MARGEM = 16;
const ALTURA_CANVAS = FONTE + MARGEM * 1.6;

function criarTextura(texto: string, estilo: EstiloRotulo): { textura: THREE.CanvasTexture; aspecto: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fonte = `700 ${FONTE}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.font = fonte;
  const w = Math.ceil(ctx.measureText(texto).width) + MARGEM * 2;
  const h = ALTURA_CANVAS;
  canvas.width = w;
  canvas.height = h;
  ctx.font = fonte;
  const r = 10;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, r);
  ctx.fillStyle = estilo.fundo;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = estilo.borda;
  ctx.stroke();
  ctx.fillStyle = estilo.tinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, w / 2, h / 2 + 2);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return { textura, aspecto: w / h };
}

export default function Rotulo({
  texto, posicao, estilo, px, metros = 0.5, opacidade = 1, sempreVisivel = false, distanciaMaxima,
}: Props) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ camera }) => {
    if (!ref.current || distanciaMaxima == null) return;
    ref.current.visible = camera.position.distanceTo(ref.current.getWorldPosition(ondeEsta)) <= distanciaMaxima;
  });
  const { textura, aspecto } = useMemo(
    () => criarTextura(texto, estilo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texto, estilo.fundo, estilo.tinta, estilo.borda],
  );
  useEffect(() => () => textura.dispose(), [textura]);
  const alturaTela = useThree(s => s.size.height);
  const fov = useThree(s => (s.camera instanceof THREE.PerspectiveCamera ? s.camera.fov : 45));

  // `px` é a altura da letra na tela; a placa inteira tem a margem a mais. Sem atenuação, a escala do
  // sprite é a fração da altura da vista a 1 m: converte px nessa fração.
  const fixo = px != null;
  const pxPlaca = fixo ? px * (ALTURA_CANVAS / FONTE) : 0;
  const altura = fixo ? (pxPlaca / Math.max(alturaTela, 1)) * 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) : metros;

  return (
    <sprite ref={ref} position={posicao} scale={[altura * aspecto, altura, 1]} renderOrder={sempreVisivel ? 20 : 5}>
      <spriteMaterial
        map={textura}
        sizeAttenuation={!fixo}
        transparent
        opacity={opacidade}
        depthWrite={false}
        depthTest={!sempreVisivel}
      />
    </sprite>
  );
}
