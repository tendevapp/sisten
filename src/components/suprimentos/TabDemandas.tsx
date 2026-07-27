/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Demandas — "o fluxo RM→PO está fluindo?"
 *
 * Conteúdo herdado da antiga página /suprimentos/demandas. Os gráficos são os
 * mesmos; o que mudou é que os filtros agora vivem no shell e valem para as
 * outras abas também, então aqui só resta a composição.
 */

import React, { useMemo } from 'react';
import { EnrichedSAPRecord } from '../../types';
import { classifyTipoDemanda, Granularidade } from '../../lib/demandas';
import RequisitadoVsPedidoChart from '../demandas/RequisitadoVsPedidoChart';
import CriticidadeChart from '../demandas/CriticidadeChart';
import AreaSolicitanteChart from '../demandas/AreaSolicitanteChart';

interface TabDemandasProps {
  records: EnrichedSAPRecord[];
  granularidade: Granularidade;
}

export default function TabDemandas({ records, granularidade }: TabDemandasProps) {
  const servicos = useMemo(
    () => records.filter(r => classifyTipoDemanda(r.requisicao_de_compra) === 'servico'),
    [records]
  );

  return (
    <div className="space-y-6">
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
