/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fornecedores & Spend — "para onde vai o dinheiro e quem cumpre prazo?"
 *
 * A dimensão que faltava por completo na página anterior. Só itens já
 * convertidos em pedido participam: antes do PO não existe fornecedor nem
 * valor, e incluí-los diluiria todo percentual desta aba.
 */

import React, { useMemo } from 'react';
import { Building2, Receipt, Users, Wallet } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { calcFornecedores, concentracaoTop, calcSpend, cobertura, temPO } from '../../lib/suprimentos';
import { formatInt, formatPctInt, formatBRLCompacto } from '../../lib/format';
import KpiCard from '../charts/KpiCard';
import SpendConcentracaoChart from './SpendConcentracaoChart';
import OtdFornecedorTable from './OtdFornecedorTable';

interface TabFornecedoresProps {
  records: EnrichedSAPRecord[];
}

export default function TabFornecedores({ records }: TabFornecedoresProps) {
  const linhas = useMemo(() => calcFornecedores(records), [records]);
  const spend = useMemo(() => calcSpend(records), [records]);

  const kpis = useMemo(() => {
    const totalSpend = linhas.reduce((s, l) => s + l.spend, 0);
    const itensComPO = records.filter(temPO).length;
    // Ticket médio por item pedido, não por pedido: um PO de 40 linhas e outro
    // de 1 linha diriam pouco sobre o valor típico de uma compra.
    const ticket = spend.base > 0 ? totalSpend / spend.base : 0;
    return {
      totalSpend,
      fornecedores: linhas.length,
      ticket,
      itensComPO,
      top10: concentracaoTop(linhas, 10),
    };
  }, [linhas, records, spend]);

  const cob = cobertura(spend);

  return (
    <div className="space-y-6">
      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4 stagger">
        <KpiCard
          label="Spend no Período"
          value={kpis.totalSpend}
          format={formatBRLCompacto}
          // A nota de cobertura só aparece quando há pedido e falta valor em
          // parte dele. Sem nenhum pedido elegível ela diria "0 de 0 (0%)",
          // que soa como falha de dado onde não há dado nenhum.
          detail={
            spend.elegiveis === 0 || cob >= 0.999
              ? `${formatInt(spend.base)} itens pedidos`
              : `${formatInt(spend.base)} de ${formatInt(spend.elegiveis)} itens pedidos têm valor (${formatPctInt(cob * 100)})`
          }
          icon={Wallet}
          accent="var(--series-7)"
          emphasize
        />
        <KpiCard
          label="Fornecedores Ativos"
          value={kpis.fornecedores}
          format={formatInt}
          detail="Com ao menos um pedido no período"
          icon={Building2}
          accent="var(--series-1)"
        />
        <KpiCard
          label="Ticket Médio"
          value={kpis.ticket}
          format={formatBRLCompacto}
          detail="Valor médio por item pedido"
          icon={Receipt}
          accent="var(--series-3)"
        />
        <KpiCard
          label="Concentração Top 10"
          value={kpis.top10}
          format={formatPctInt}
          detail="Do gasto nos 10 maiores fornecedores"
          icon={Users}
          // Concentração alta é risco de dependência, não conquista.
          accent={kpis.top10 >= 80 ? 'var(--status-warning)' : 'var(--series-3)'}
          share={kpis.top10 / 100}
        />
      </div>

      <SpendConcentracaoChart linhas={linhas} />
      <OtdFornecedorTable linhas={linhas} />
    </div>
  );
}
