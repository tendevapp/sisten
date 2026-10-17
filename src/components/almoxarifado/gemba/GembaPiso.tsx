/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chão do galpão: laje de concreto (textura desenhada em canvas, sem imagem para
 * baixar), faixas amarelas e setas dos corredores, e as zonas da planta pintadas
 * no piso com contorno e nome. Sem parede e sem telhado: a vista de cima fica livre.
 */

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CORREDORES, GALPAO, ZONAS, METROS_POR_PX, caixaDoRetangulo, pxParaM, type Caixa } from '../../../lib/gembaLayout';
import Instancias, { type Instancia } from './Instancias';
import Rotulo from './Rotulo';
import { geometrias } from './recursos';
import type { CoresGemba } from './coresGemba';

const LARGURA_FAIXA = 0.12;
const PASSO_SETA_M = 13;

function texturaConcreto(c: CoresGemba['concreto']): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = c.base;
  ctx.fillRect(0, 0, 512, 512);
  // Manchas determinísticas: o piso é igual em toda visita.
  let a = 7;
  const rnd = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  for (let i = 0; i < 90; i++) {
    const r = 8 + rnd() * 46;
    ctx.fillStyle = c.mancha;
    ctx.beginPath();
    ctx.ellipse(rnd() * 512, rnd() * 512, r, r * (0.4 + rnd() * 0.8), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = c.junta;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 1); ctx.lineTo(512, 1);
  ctx.moveTo(1, 0); ctx.lineTo(1, 512);
  ctx.stroke();
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Faixas e setas de cada corredor, já em metros. */
function marcacoes(): { faixas: Caixa[]; setas: Instancia[] } {
  const faixas: Caixa[] = [];
  const setas: Instancia[] = [];
  for (const c of CORREDORES) {
    const [x1, z1] = pxParaM(c.de);
    const [x2, z2] = pxParaM(c.ate);
    const horizontal = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const meia = (c.largura * METROS_POR_PX) / 2;
    const comprimento = horizontal ? x2 - x1 : z2 - z1;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    for (const lado of [-1, 1]) {
      faixas.push(horizontal
        ? { centro: [cx, 0.012, cz + lado * meia], tamanho: [comprimento, 0.012, LARGURA_FAIXA] }
        : { centro: [cx + lado * meia, 0.012, cz], tamanho: [LARGURA_FAIXA, 0.012, comprimento] });
    }
    const n = Math.max(1, Math.floor(comprimento / PASSO_SETA_M));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      setas.push({
        centro: [x1 + (x2 - x1) * t, 0.015, z1 + (z2 - z1) * t],
        escala: [1, 1, 1],
        giroY: horizontal ? 0 : Math.PI / 2,
      });
    }
  }
  return { faixas, setas };
}

export default function GembaPiso({ cores, sombras, compacto }: { cores: CoresGemba; sombras: boolean; compacto: boolean }) {
  const laje = useMemo(() => caixaDoRetangulo(GALPAO, 0.12), []);
  const textura = useMemo(() => {
    const t = texturaConcreto(cores.concreto);
    t.repeat.set(laje.tamanho[0] / 16, laje.tamanho[2] / 16);
    return t;
  }, [cores.concreto, laje]);
  useEffect(() => () => textura.dispose(), [textura]);

  const { faixas, setas } = useMemo(marcacoes, []);
  const perimetro = useMemo<Caixa[]>(() => {
    const [cx, , cz] = laje.centro;
    const [sx, , sz] = laje.tamanho;
    const r = 0.7;
    return [
      { centro: [cx, 0.012, cz - sz / 2 + r], tamanho: [sx - 2 * r, 0.012, LARGURA_FAIXA] },
      { centro: [cx, 0.012, cz + sz / 2 - r], tamanho: [sx - 2 * r, 0.012, LARGURA_FAIXA] },
      { centro: [cx - sx / 2 + r, 0.012, cz], tamanho: [LARGURA_FAIXA, 0.012, sz - 2 * r] },
      { centro: [cx + sx / 2 - r, 0.012, cz], tamanho: [LARGURA_FAIXA, 0.012, sz - 2 * r] },
    ];
  }, [laje]);

  const todasFaixas = useMemo(() => [...perimetro, ...faixas], [perimetro, faixas]);
  const materialFaixa = useMemo(() => new THREE.MeshBasicMaterial({ color: cores.faixa }), [cores.faixa]);
  const materialSeta = useMemo(() => new THREE.MeshBasicMaterial({ color: cores.faixa, side: THREE.DoubleSide }), [cores.faixa]);
  useEffect(() => () => { materialFaixa.dispose(); materialSeta.dispose(); }, [materialFaixa, materialSeta]);
  const g = geometrias();

  return (
    <group>
      <mesh position={[laje.centro[0], -0.08, laje.centro[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={cores.chaoExterno} roughness={1} />
      </mesh>
      <mesh position={[laje.centro[0], -0.06, laje.centro[2]]} receiveShadow={sombras} raycast={() => null}>
        <boxGeometry args={laje.tamanho} />
        <meshStandardMaterial map={textura} roughness={0.92} />
      </mesh>

      <Instancias itens={todasFaixas} geometria={g.caixa} material={materialFaixa} />
      <Instancias itens={setas} geometria={g.seta} material={materialSeta} />

      {ZONAS.map((z, zi) => {
        const cor = cores.zona[z.id] ?? '#64748b';
        return z.retangulos.map((r, i) => {
          const c = caixaDoRetangulo(r, 0);
          const [x1, z1] = pxParaM([r[0], r[1]]);
          const [x2, z2] = pxParaM([r[2], r[3]]);
          const contorno = new Float32Array([x1, 0.02, z1, x2, 0.02, z1, x2, 0.02, z2, x1, 0.02, z2]);
          return (
            <group key={`${z.id}-${i}`}>
              <mesh position={[c.centro[0], 0.008, c.centro[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={1}>
                <planeGeometry args={[c.tamanho[0], c.tamanho[2]]} />
                <meshBasicMaterial color={cor} transparent opacity={0.16} depthWrite={false} />
              </mesh>
              <lineLoop raycast={() => null}>
                <bufferGeometry>
                  <bufferAttribute attach="attributes-position" args={[contorno, 3]} />
                </bufferGeometry>
                <lineBasicMaterial color={cor} transparent opacity={0.8} />
              </lineLoop>
              {i === 0 && (
                <Rotulo
                  texto={z.rotulo.toUpperCase()}
                  // Alturas alternadas: zonas vizinhas estreitas não colam os nomes.
                  posicao={[c.centro[0], 1.4 + (zi % 2) * 1.6, c.centro[2]]}
                  estilo={{ fundo: cores.rotulo.fundo, tinta: cores.rotulo.tinta, borda: cor }}
                  px={compacto ? 11 : 11.5}
                  distanciaMaxima={compacto ? 75 : 190}
                />
              )}
            </group>
          );
        });
      })}
    </group>
  );
}
