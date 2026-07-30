import React, { useMemo } from 'react';
import { FileText, CheckCircle2, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { classifyTipoDemanda, classifyCriticidadeNatureza, resolveDataCorte, Granularidade } from '../../lib/demandas';
import { calcSpend } from '../../lib/suprimentos';
import { formatInt, formatPctInt, formatPct, formatBRLCompacto } from '../../lib/format';
import KpiCard from '../charts/KpiCard';
import RequisitadoVsPedidoChart from '../demandas/RequisitadoVsPedidoChart';
import CriticidadeChart from '../demandas/CriticidadeChart';
import AreaSolicitanteChart from '../demandas/AreaSolicitanteChart';

interface TabDemandasProps {
  records: EnrichedSAPRecord[];
  allRecords?: EnrichedSAPRecord[];
  granularidade: Granularidade;
}

export default function TabDemandas({ records, allRecords, granularidade }: TabDemandasProps) {
  const servicos = useMemo(
    () => records.filter(r => classifyTipoDemanda(r.requisicao_de_compra) === 'servico'),
    [records]
  );

  // Considera todo o período do ano de 2026 para os cartões de KPI
  const records2026 = useMemo(() => {
    const base = allRecords && allRecords.length > 0 ? allRecords : records;
    return base.filter(r => {
      const corte = resolveDataCorte(r);
      return corte.startsWith('2026');
    });
  }, [allRecords, records]);

  const kpis = useMemo(() => {
    const total = records2026.length;
    let materiaisCount = 0;
    let servicosCount = 0;
    let processadosCount = 0;
    let urgentesCount = 0;
    let maquinaParadaCount = 0;

    for (const r of records2026) {
      const tipo = classifyTipoDemanda(r.requisicao_de_compra);
      if (tipo === 'material') materiaisCount++;
      else if (tipo === 'servico') servicosCount++;

      if (r.status_requisicao === 'Processado') {
        processadosCount++;
      }

      const crit = classifyCriticidadeNatureza(r.natureza);
      if (crit === 'urgente') urgentesCount++;
      else if (crit === 'maquina_parada') maquinaParadaCount++;
    }

    const conversao = total > 0 ? (processadosCount / total) * 100 : 0;
    const criticasCount = urgentesCount + maquinaParadaCount;
    const spendTotal = calcSpend(records2026).valor;

    return {
      total,
      materiaisCount,
      servicosCount,
      processadosCount,
      conversao,
      criticasCount,
      urgentesCount,
      maquinaParadaCount,
      spendTotal,
    };
  }, [records2026]);

  return (
    <div className="space-y-6">
      {/* Indicadores de KPI das Demandas (Consolidado 2026) */}
      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-5 stagger">
        <KpiCard
          label="Total de Demandas (2026)"
          value={kpis.total}
          format={formatInt}
          detail={`${formatInt(kpis.materiaisCount)} materiais · ${formatInt(kpis.servicosCount)} serviços em 2026`}
          icon={FileText}
          accent="var(--series-1)"
        />
        <KpiCard
          label="Pedidos Colocados (2026)"
          value={kpis.processadosCount}
          format={formatInt}
          detail={`${formatInt(kpis.total - kpis.processadosCount)} em aberto (Sem PO) em 2026`}
          icon={CheckCircle2}
          accent="var(--series-3)"
          share={kpis.total > 0 ? kpis.processadosCount / kpis.total : undefined}
        />
        <KpiCard
          label="Taxa de Conversão (2026)"
          value={kpis.conversao}
          format={formatPctInt}
          detail={`${formatPct(kpis.conversao)} das RIs de 2026 convertidas em PO`}
          icon={TrendingUp}
          accent="var(--series-3)"
          share={kpis.conversao / 100}
          emphasize
        />
        <KpiCard
          label="Demandas Críticas (2026)"
          value={kpis.criticasCount}
          format={formatInt}
          detail={`${formatInt(kpis.maquinaParadaCount)} maq. parada · ${formatInt(kpis.urgentesCount)} urgentes`}
          icon={AlertTriangle}
          accent="var(--status-critical)"
          share={kpis.total > 0 ? kpis.criticasCount / kpis.total : undefined}
        />
        <KpiCard
          label="Volume em Pedidos (2026)"
          value={kpis.spendTotal}
          format={formatBRLCompacto}
          detail="Spend total em pedidos colocados em 2026"
          icon={DollarSign}
          accent="var(--series-4)"
        />
      </div>

      <RequisitadoVsPedidoChart
        records={records}
        granularidade={granularidade}
        title="Demandas Gerais"
        subtitle="Itens requisitados x pedidos efetivados, com volume acumulado no período"
      />

      <RequisitadoVsPedidoChart
        records={servicos}
        granularidade={granularidade}
        title="Demandas de Serviço (RI 17)"
        subtitle="Serviços requisitados x pedidos colocados, com volume acumulado no período"
      />

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <CriticidadeChart records={records} />
        <AreaSolicitanteChart records={records} />
      </div>
    </div>
  );
}


