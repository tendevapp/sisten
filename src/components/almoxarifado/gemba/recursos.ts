/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geometrias e materiais do Gemba, criados uma vez e compartilhados por todas as
 * instâncias (uma geometria por forma, não uma por caixa).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FormaPeca } from '../../../lib/gembaCarga';

let cache: Record<FormaPeca | 'seta', THREE.BufferGeometry> | null = null;

function caixasUnidas(partes: Array<[number, number, number, number, number, number]>): THREE.BufferGeometry {
  const geos = partes.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const unida = mergeGeometries(geos) ?? new THREE.BoxGeometry(1, 0.15, 1);
  geos.forEach(g => g.dispose());
  return unida;
}

/** Palete PBR (1 × 0,144 × 1, base em y = 0): escala x/z = comprimento/profundidade. */
function geometriaPalete(): THREE.BufferGeometry {
  return caixasUnidas([
    [1, 0.022, 0.24, 0, 0.133, -0.36], [1, 0.022, 0.24, 0, 0.133, 0], [1, 0.022, 0.24, 0, 0.133, 0.36],
    [1, 0.1, 0.09, 0, 0.072, -0.44], [1, 0.1, 0.09, 0, 0.072, 0], [1, 0.1, 0.09, 0, 0.072, 0.44],
    [1, 0.022, 0.18, 0, 0.011, -0.36], [1, 0.022, 0.18, 0, 0.011, 0.36],
  ]);
}

/** Seta de mão dupla pintada no piso, apontando em x (3,2 m). */
function geometriaSeta(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.95, -0.12); s.lineTo(0.95, -0.12); s.lineTo(0.95, -0.34); s.lineTo(1.6, 0);
  s.lineTo(0.95, 0.34); s.lineTo(0.95, 0.12); s.lineTo(-0.95, 0.12); s.lineTo(-0.95, 0.34);
  s.lineTo(-1.6, 0); s.lineTo(-0.95, -0.34);
  s.closePath();
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
}

export function geometrias(): Record<FormaPeca | 'seta', THREE.BufferGeometry> {
  if (!cache) {
    const caixa = new THREE.BoxGeometry(1, 1, 1);
    cache = {
      caixa,
      perfil: caixa,
      bin: new THREE.BoxGeometry(1, 1, 1),
      saco: new THREE.SphereGeometry(0.5, 12, 8),
      bobina: new THREE.CylinderGeometry(0.5, 0.5, 1, 18).rotateZ(Math.PI / 2),
      flange: new THREE.CylinderGeometry(0.5, 0.5, 1, 18).rotateZ(Math.PI / 2),
      balde: new THREE.CylinderGeometry(0.5, 0.44, 1, 14),
      palete: geometriaPalete(),
      seta: geometriaSeta(),
    };
  }
  return cache;
}

export interface Materiais {
  montante: THREE.MeshStandardMaterial;
  longarina: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  /** Base branca: a cor de cada peça vem da instância. */
  carga: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  plastico: THREE.MeshStandardMaterial;
}

export interface CoresEstrutura {
  montante: string;
  longarina: string;
  prateleira: string;
}

export function criarMateriais(cores: CoresEstrutura, esmaecido: boolean): Materiais {
  const t = esmaecido ? { transparent: true, opacity: 0.16, depthWrite: false } : {};
  return {
    montante: new THREE.MeshStandardMaterial({ color: cores.montante, roughness: 0.5, metalness: 0.35, ...t }),
    longarina: new THREE.MeshStandardMaterial({ color: cores.longarina, roughness: 0.45, metalness: 0.25, ...t }),
    deck: new THREE.MeshStandardMaterial({ color: cores.prateleira, roughness: 0.6, metalness: 0.3, ...(esmaecido ? t : { transparent: true, opacity: 0.85 }) }),
    carga: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, ...t }),
    metal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.7, ...t }),
    plastico: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, ...t }),
  };
}

export function descartarMateriais(m: Materiais): void {
  Object.values(m).forEach(mat => mat.dispose());
}
