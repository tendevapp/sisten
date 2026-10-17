/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Muitas peças iguais num só draw call, cada uma com posição, escala, giro e cor.
 */

import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { Vec3 } from '../../../lib/gembaLayout';

export interface Instancia {
  centro: Vec3;
  /** Escala local; nas caixas do layout é o próprio `tamanho`. */
  escala?: Vec3;
  tamanho?: Vec3;
  giroY?: number;
  cor?: string;
}

interface Props {
  itens: Instancia[];
  geometria: THREE.BufferGeometry;
  material: THREE.Material;
  sombra?: boolean;
}

const matriz = new THREE.Matrix4();
const posicao = new THREE.Vector3();
const escala = new THREE.Vector3();
const giro = new THREE.Quaternion();
const eixoY = new THREE.Vector3(0, 1, 0);
const cor = new THREE.Color();

export default function Instancias({ itens, geometria, material, sombra = false }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree(s => s.invalidate);
  const comCor = itens.some(i => i.cor);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    itens.forEach((it, i) => {
      posicao.set(...it.centro);
      escala.set(...(it.escala ?? it.tamanho ?? [1, 1, 1]));
      giro.setFromAxisAngle(eixoY, it.giroY ?? 0);
      mesh.setMatrixAt(i, matriz.compose(posicao, giro, escala));
      if (comCor) mesh.setColorAt(i, cor.set(it.cor ?? '#ffffff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [itens, comCor, invalidate]);

  if (itens.length === 0) return null;
  return (
    // `key` recria o mesh quando a quantidade muda: o buffer de instâncias tem tamanho fixo.
    <instancedMesh
      key={`${itens.length}-${comCor}`}
      ref={ref}
      args={[geometria, material, itens.length]}
      castShadow={sombra}
      receiveShadow={sombra}
      raycast={() => null}
    />
  );
}
