/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Onde o item está: caixa âmbar pulsando, pino visível de longe e etiqueta
 * com a trilha (Rua › Bloco › Andar › Apto). Parado com movimento reduzido.
 */

import React, { useRef } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Caixa, Localizacao } from '../../../lib/gembaLayout';
import type { CoresGemba } from './coresGemba';
import Rotulo from './Rotulo';

interface Props {
  localizacoes: Localizacao[];
  /** Índice da localização que leva a etiqueta (a escolhida no painel). */
  principal: number;
  cores: CoresGemba;
  reduzido: boolean;
}

const ALTURA_PINO = 2.4;

function CaixaAcesa({ caixa, cor, reduzido }: { caixa: Caixa; cor: string; reduzido: boolean }) {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock, invalidate }) => {
    if (reduzido || !material.current) return;
    material.current.opacity = 0.5 + 0.3 * Math.sin(clock.elapsedTime * 4);
    invalidate();
  });
  const folga = 0.06;
  return (
    // Sem teste de profundidade: o lugar aparece mesmo atrás de caixas e longarinas.
    <mesh position={caixa.centro} raycast={() => null} renderOrder={10}>
      <boxGeometry args={[caixa.tamanho[0] + folga, caixa.tamanho[1] + folga, caixa.tamanho[2] + folga]} />
      <meshStandardMaterial ref={material} color={cor} emissive={cor} emissiveIntensity={0.9} transparent opacity={0.7} depthWrite={false} depthTest={false} />
      <Edges color={cor} renderOrder={10} depthTest={false} />
    </mesh>
  );
}

export default function GembaDestaque({ localizacoes, principal, cores, reduzido }: Props) {
  return (
    <group>
      {localizacoes.map((loc, li) => loc.caixas.map((c, ci) => {
        const topo = c.centro[1] + c.tamanho[1] / 2;
        const comPino = ci === 0;
        return (
          <group key={`${li}-${ci}`}>
            <CaixaAcesa caixa={c} cor={cores.destaque} reduzido={reduzido} />
            {comPino && (
              <>
                <mesh position={[c.centro[0], topo + ALTURA_PINO / 2, c.centro[2]]} raycast={() => null}>
                  <cylinderGeometry args={[0.035, 0.035, ALTURA_PINO, 8]} />
                  <meshBasicMaterial color={cores.destaque} />
                </mesh>
                <mesh position={[c.centro[0], topo + ALTURA_PINO, c.centro[2]]} raycast={() => null}>
                  <sphereGeometry args={[0.22, 16, 12]} />
                  <meshStandardMaterial color={cores.destaque} emissive={cores.destaque} emissiveIntensity={0.6} />
                </mesh>
              </>
            )}
            {comPino && li === principal && (
              <Rotulo
                texto={loc.trilha.join(' › ')}
                posicao={[c.centro[0], topo + 0.45, c.centro[2]]}
                estilo={{ fundo: cores.destaque, tinta: '#111827', borda: '#b45309' }}
                px={14}
                sempreVisivel
              />
            )}
          </group>
        );
      }))}
    </group>
  );
}
