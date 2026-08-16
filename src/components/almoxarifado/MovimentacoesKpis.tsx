/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, Scale, Shuffle } from 'lucide-react';
import { MovimentacoesKpi, LagRecebimento } from '../../lib/movimentacoes';
import { formatBRL } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import KpiCard from '../charts/KpiCard';

interface MovimentacoesKpisProps {
  kpi: MovimentacoesKpi;
  lag?: LagRecebimento | null;
}

export default function MovimentacoesKpis({ kpi, lag }: MovimentacoesKpisProps) {
  const totalFluxo = kpi.valorEntradas + kpi.valorSaidas;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger">
        <KpiCard
          label="Entradas"
          value={kpi.valorEntradas}
          format={formatBRL}
          detail={`${formatInt(kpi.qtdEntradas)} recebimentos${lag ? ` · lag NF→MIGO ${Math.round(lag.medianaDias)}d` : ''}`}
          icon={ArrowDownCircle}
          accent="var(--status-good)"
          share={totalFluxo > 0 ? kpi.valorEntradas / totalFluxo : undefined}
        />
        <KpiCard
          label="Saídas"
          value={kpi.valorSaidas}
          format={formatBRL}
          detail={`${formatInt(kpi.qtdSaidas)} consumos e baixas`}
          icon={ArrowUpCircle}
          accent="var(--status-serious)"
          share={totalFluxo > 0 ? kpi.valorSaidas / totalFluxo : undefined}
        />
        <KpiCard
          label="Saldo do fluxo"
          value={kpi.saldoValor}
          format={formatBRL}
          detail={`${formatInt(kpi.materiais)} materiais movimentados`}
          icon={Scale}
          accent="var(--brand)"
          emphasize
        />
        <KpiCard
          label="Transferência interna"
          value={kpi.valorTransferencias}
          format={formatBRL}
          detail={`${formatInt(kpi.qtdTransferencias)} remanejamentos — não alteram o saldo`}
          icon={Shuffle}
          accent="var(--ink-muted)"
        />
      </div>

      {/*
        A nota existe porque o total de linhas não bate com entradas + saídas, e
        sem explicação isso parece erro. A transferência interna gera um par
        negativo/positivo do mesmo material: contá-la no fluxo inflaria os dois
        lados sem que nada tivesse entrado ou saído do almoxarifado.
      */}
      {kpi.qtdTransferencias > 0 && (
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          Entradas e saídas excluem remanejamento entre depósitos e centros — apenas movimento que
          altera o saldo do almoxarifado. O volume interno aparece no último cartão, à parte.
        </p>
      )}
    </div>
  );
}
