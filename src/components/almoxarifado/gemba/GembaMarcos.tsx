/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pontos de referência para se orientar no mapa: empilhadeiras no estacionamento,
 * o pórtico de carga, o balcão de atendimento e a estante do Material de Apoio
 * Manutenção (uma caixa por item que a ZL0024 diz estar lá).
 */

import React, { memo, useMemo } from 'react';
import * as THREE from 'three';
import { ZONAS, caixaDoRetangulo } from '../../../lib/gembaLayout';
import { pecasDoApoio } from '../../../lib/gembaCarga';
import Instancias from './Instancias';
import { geometrias, type Materiais } from './recursos';

const AMARELO = '#e6a817';
const ESCURO = '#33373c';

function Caixinha({ t, p, cor, sombra }: { t: [number, number, number]; p: [number, number, number]; cor: string; sombra: boolean }) {
  return (
    <mesh position={p} castShadow={sombra} raycast={() => null}>
      <boxGeometry args={t} />
      <meshStandardMaterial color={cor} roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

function Empilhadeira({ posicao, giro, sombra }: { posicao: [number, number, number]; giro: number; sombra: boolean }) {
  return (
    <group position={posicao} rotation={[0, giro, 0]}>
      <Caixinha t={[1.15, 0.55, 1.8]} p={[0, 0.62, -0.15]} cor={AMARELO} sombra={sombra} />
      <Caixinha t={[1.15, 0.65, 0.55]} p={[0, 0.55, -1.15]} cor={ESCURO} sombra={sombra} />
      <Caixinha t={[1.2, 0.07, 1.6]} p={[0, 2.3, -0.15]} cor="#b98a10" sombra={sombra} />
      {[[-0.52, -0.85], [0.52, -0.85], [-0.52, 0.55], [0.52, 0.55]].map(([x, z], i) => (
        <Caixinha key={i} t={[0.07, 1.4, 0.07]} p={[x, 1.6, z]} cor={ESCURO} sombra={sombra} />
      ))}
      {[-0.34, 0.34].map((x, i) => <Caixinha key={`m${i}`} t={[0.1, 2.6, 0.12]} p={[x, 1.3, 0.72]} cor={ESCURO} sombra={sombra} />)}
      {[-0.3, 0.3].map((x, i) => <Caixinha key={`g${i}`} t={[0.14, 0.06, 1.05]} p={[x, 0.14, 1.3]} cor={ESCURO} sombra={sombra} />)}
      {[[-0.58, 0.55], [0.58, 0.55], [-0.58, -0.85], [0.58, -0.85]].map(([x, z], i) => (
        <mesh key={`r${i}`} position={[x, 0.3, z]} rotation={[0, 0, Math.PI / 2]} castShadow={sombra} raycast={() => null}>
          <cylinderGeometry args={[0.28, 0.28, 0.22, 14]} />
          <meshStandardMaterial color="#1f2226" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Portico({ centro, sombra }: { centro: [number, number, number]; sombra: boolean }) {
  return (
    <group position={centro}>
      {[[-2.4, -3], [2.4, -3], [-2.4, 3], [2.4, 3]].map(([x, z], i) => (
        <Caixinha key={i} t={[0.18, 5, 0.18]} p={[x, 2.5, z]} cor="#eab308" sombra={sombra} />
      ))}
      <Caixinha t={[0.35, 0.4, 6.4]} p={[-2.4, 5.1, 0]} cor="#eab308" sombra={sombra} />
      <Caixinha t={[0.35, 0.4, 6.4]} p={[2.4, 5.1, 0]} cor="#eab308" sombra={sombra} />
      <Caixinha t={[5.2, 0.45, 0.4]} p={[0, 5.2, 0.6]} cor="#eab308" sombra={sombra} />
      <Caixinha t={[0.5, 0.45, 0.6]} p={[0, 4.75, 0.6]} cor={ESCURO} sombra={sombra} />
    </group>
  );
}

function centroZona(id: string): [number, number, number] {
  const z = ZONAS.find(x => x.id === id)!;
  return caixaDoRetangulo(z.retangulos[0], 0).centro;
}

interface Props {
  materiais: Materiais;
  itensApoio: number;
  sombras: boolean;
}

function GembaMarcos({ materiais, itensApoio, sombras }: Props) {
  const geo = geometrias();
  const apoio = useMemo(() => pecasDoApoio('apoio_manutencao', itensApoio), [itensApoio]);
  const materialEstante = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b7bcc2', roughness: 0.55, metalness: 0.35 }), []);

  const [ex, , ez] = centroZona('empilhadeiras');
  const [px, , pz] = centroZona('portico');
  const [bx, , bz] = centroZona('balcao');

  return (
    <group>
      <Empilhadeira posicao={[ex - 2.6, 0, ez + 1]} giro={0.35} sombra={sombras} />
      <Empilhadeira posicao={[ex + 2.2, 0, ez + 0.6]} giro={-0.2} sombra={sombras} />
      <Portico centro={[px, 0, pz]} sombra={sombras} />
      <group position={[bx, 0, bz + 1.5]}>
        <Caixinha t={[8, 1.02, 0.75]} p={[0, 0.51, 0]} cor="#e8e2d4" sombra={sombras} />
        <Caixinha t={[8.3, 0.07, 0.95]} p={[0, 1.06, 0]} cor="#cfc6b4" sombra={sombras} />
      </group>

      <Instancias itens={apoio.estrutura} geometria={geo.caixa} material={materialEstante} sombra={sombras} />
      <Instancias itens={apoio.pecas} geometria={geo.caixa} material={materiais.carga} sombra={sombras} />
    </group>
  );
}

export default memo(GembaMarcos);
