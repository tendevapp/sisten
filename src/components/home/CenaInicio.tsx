/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cena animada do cabeçalho da tela Início. Cada login sorteia uma (ver
 * `lib/cenaInicio.ts`); as cenas são carregadas sob demanda para não pesar
 * no bundle de quem só vê uma por sessão.
 *
 * Para admin há mais cenas no sorteio e um seletor (‹ nome ›) para trocar de
 * cena na hora, sem refazer o login. A escolha fica gravada na sessão.
 */

import React, { lazy, Suspense, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CENAS,
  NOMES_CENAS,
  cenaDaSessao,
  cenaForcada,
  definirCenaSessao,
  proximaCena,
  type CenaId,
} from '../../lib/cenaInicio';
import { CenaMoldura } from './cenas/util';

const CENAS_COMPONENTES: Record<CenaId, React.LazyExoticComponent<React.ComponentType>> = {
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
  torque: lazy(() => import('./cenas/TorqueFlange')),
  drone: lazy(() => import('./cenas/DroneInspecao')),
  jato: lazy(() => import('./cenas/Jateamento')),
  ultrassom: lazy(() => import('./cenas/EnsaioUltrassom')),
  epi: lazy(() => import('./cenas/EpiVestindo')),
  tanque: lazy(() => import('./cenas/TanqueEstoque')),
  cancela: lazy(() => import('./cenas/CancelaPortaria')),
  carreta: lazy(() => import('./cenas/CarretaPa')),
  icamento: lazy(() => import('./cenas/IcamentoPa')),
  paquimetro: lazy(() => import('./cenas/Paquimetro')),
  pedido: lazy(() => import('./cenas/PedidoViajando')),
};

interface Props {
  /** Admin vê as cenas exclusivas e o seletor de cena. */
  admin?: boolean;
}

export default function CenaInicio({ admin = false }: Props) {
  const [id, setId] = useState<CenaId>(() => cenaForcada(window.location.search, admin) ?? cenaDaSessao(Math.random, admin));
  const Cena = CENAS_COMPONENTES[id];

  const trocar = (passo: 1 | -1) => {
    const prox = proximaCena(id, passo);
    definirCenaSessao(prox);
    setId(prox);
  };

  return (
    <div className="group relative shrink-0">
      <Suspense fallback={<CenaMoldura />}>
        <Cena key={id} />
      </Suspense>

      {admin && (
        <div
          data-testid="seletor-cena"
          className="absolute inset-x-0 bottom-0 z-10 flex justify-center opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"
        >
          <div className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/95 px-1 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300">
            <button
              type="button"
              onClick={() => trocar(-1)}
              aria-label="Cena anterior"
              className="rounded-full p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[5.5rem] select-none text-center" title="Seletor de cena (só admin)">
              {NOMES_CENAS[id]} · {CENAS.indexOf(id) + 1}/{CENAS.length}
            </span>
            <button
              type="button"
              onClick={() => trocar(1)}
              aria-label="Próxima cena"
              className="rounded-full p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
