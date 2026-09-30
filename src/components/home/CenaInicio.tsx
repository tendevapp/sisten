/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena animada do cabeçalho da tela Início. Cada login sorteia uma (ver
 * `lib/cenaInicio.ts`); as cenas são carregadas sob demanda para não pesar
 * no bundle de quem só vê uma por sessão.
 */

import React, { lazy, Suspense, useState } from 'react';
import { cenaDaSessao, cenaForcada, type CenaId } from '../../lib/cenaInicio';
import { CenaMoldura } from './cenas/util';

const CENAS: Record<CenaId, React.LazyExoticComponent<React.ComponentType>> = {
  eolica: lazy(() => import('./TorreEolica')),
  laser: lazy(() => import('./cenas/CorteLaser')),
  guindaste: lazy(() => import('./cenas/GuindasteTorre')),
  bateria: lazy(() => import('./cenas/TurbinaBateria')),
  calandra: lazy(() => import('./cenas/Calandra')),
  pintura: lazy(() => import('./cenas/PinturaCilindros')),
  ponte: lazy(() => import('./cenas/PonteRolante')),
  solda: lazy(() => import('./cenas/SoldaFaiscas')),
  inspecao: lazy(() => import('./cenas/InspecaoQualidade')),
  empilhadeira: lazy(() => import('./cenas/EmpilhadeiraAlmox')),
  amanhecer: lazy(() => import('./cenas/TorreAmanhecer')),
  gantt: lazy(() => import('./cenas/GanttVivo')),
};

export default function CenaInicio() {
  const [id] = useState<CenaId>(() => cenaForcada(window.location.search) ?? cenaDaSessao());
  const Cena = CENAS[id];
  return (
    <Suspense fallback={<CenaMoldura />}>
      <Cena />
    </Suspense>
  );
}
