/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DollarSign, Package, Warehouse, Clock } from 'lucide-react';
import { EstoqueKpi, formatBRL, formatDateTimeBR } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import KpiCard from '../charts/KpiCard';

interface EstoqueKpisProps {
  kpi: EstoqueKpi;
  /** KPIs da posição inteira, sem filtro. Sem eles o trilho não tem
   *  denominador e fica cheio — nunca inventando uma proporção. */
  totalGeral?: EstoqueKpi;
}

export default function EstoqueKpis({ kpi, totalGeral }: EstoqueKpisProps) {
  // Participação do recorte filtrado no total da posição: é o que transforma
  // o trilho de cada cartão em medida, não em enfeite.
  const share = (parte: number, todo?: number) =>
    todo && todo > 0 ? parte / todo : undefined;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger">
      <KpiCard
        label="Valor Imobilizado"
        value={kpi.valor}
        format={formatBRL}
        detail={`${formatInt(kpi.itens)} linhas de estoque`}
        icon={DollarSign}
        accent="var(--series-1)"
        share={share(kpi.valor, totalGeral?.valor)}
        emphasize
      />
      <KpiCard
        label="Materiais"
        value={kpi.materiais}
        format={formatInt}
        detail="códigos distintos com saldo"
        icon={Package}
        accent="var(--series-2)"
        share={share(kpi.materiais, totalGeral?.materiais)}
      />
      <KpiCard
        label="Depósitos"
        value={kpi.depositos}
        format={formatInt}
        detail="locais de armazenagem"
        icon={Warehouse}
        accent="var(--series-3)"
        share={share(kpi.depositos, totalGeral?.depositos)}
      />
      <KpiCard
        label="Data da Posição"
        display={formatDateTimeBR(kpi.dataPosicao)}
        detail="última importação ZL0024"
        icon={Clock}
        accent="var(--ink-muted)"
      />
    </div>
  );
}
