/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carteira & Compradores — "quem está sobrecarregado, quem está entregando?"
 *
 * A tabela vem primeiro porque é a visão acionável (uma linha por pessoa, com
 * drill-down); os gráficos herdados detalham performance e atraso depois.
 */

import React, { useMemo } from 'react';
import { EnrichedSAPRecord } from '../../types';
import { classifyTipoDemanda, Granularidade, CompradorInfo } from '../../lib/demandas';
import CompradorPerformanceChart from '../demandas/CompradorPerformanceChart';
import QuantidadesPeriodoTable from '../demandas/QuantidadesPeriodoTable';
import AtrasoChart from '../demandas/AtrasoChart';
import CarteiraCompradorTable from './CarteiraCompradorTable';

interface TabCarteiraProps {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
  granularidade: Granularidade;
  onSelecionarComprador: (comprador: string) => void;
}

export default function TabCarteira({
  records,
  compradores,
  granularidade,
  onSelecionarComprador,
}: TabCarteiraProps) {
  // O gráfico de performance compara compradores de material: incluir serviço
  // misturaria dois ciclos de compra com naturezas diferentes na mesma barra.
  const materiais = useMemo(
    () => records.filter(r => classifyTipoDemanda(r.requisicao_de_compra) === 'material'),
    [records]
  );

  return (
    <div className="space-y-6">
      <CarteiraCompradorTable
        records={records}
        compradores={compradores}
        onSelecionarComprador={onSelecionarComprador}
      />
      <CompradorPerformanceChart records={materiais} compradores={compradores} />
      <QuantidadesPeriodoTable records={records} compradores={compradores} granularidade={granularidade} />
      <AtrasoChart records={records} compradores={compradores} />
    </div>
  );
}
