/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carteira & Compradores — "quem está sobrecarregado, quem está entregando?"
 *
 * A tabela vem primeiro porque é a visão acionável (uma linha por pessoa, com
 * drill-down); os gráficos herdados detalham performance e atraso depois.
 */

import React, { useMemo, useCallback } from 'react';
import { EnrichedSAPRecord } from '../../types';
import { classifyTipoDemanda, resolveComprador, Granularidade, CompradorInfo } from '../../lib/demandas';
import { formatBRLCompacto } from '../../lib/format';
import { ComposicaoModalConfig } from '../charts/ComposicaoModal';
import {
  colunasEnrichedSAPRecord, valorEnrichedSAPRecord, itemKeyEnrichedSAPRecord,
  searchEnrichedSAPRecord, SEARCH_PLACEHOLDER_SUPRIMENTOS,
} from '../../lib/composicaoSuprimentos';
import CompradorPerformanceChart from '../demandas/CompradorPerformanceChart';
import QuantidadesPeriodoTable from '../demandas/QuantidadesPeriodoTable';
import AtrasoChart from '../demandas/AtrasoChart';
import CarteiraCompradorTable from './CarteiraCompradorTable';

interface TabCarteiraProps {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
  granularidade: Granularidade;
  onSelecionarComprador: (comprador: string) => void;
  onAbrirComposicao: (config: ComposicaoModalConfig<EnrichedSAPRecord>) => void;
}

export default function TabCarteira({
  records,
  compradores,
  granularidade,
  onSelecionarComprador,
  onAbrirComposicao,
}: TabCarteiraProps) {
  // O gráfico de performance compara compradores de material: incluir serviço
  // misturaria dois ciclos de compra com naturezas diferentes na mesma barra.
  const materiais = useMemo(
    () => records.filter(r => classifyTipoDemanda(r.requisicao_de_compra) === 'material'),
    [records]
  );

  const colunas = useMemo(() => colunasEnrichedSAPRecord(compradores), [compradores]);

  const abrirModalComprador = useCallback((titulo: string, badge: string, items: EnrichedSAPRecord[]) => {
    onAbrirComposicao({
      title: titulo,
      badge,
      items,
      groupBy: r => r.status_requisicao,
      groupLabelHeader: 'Status',
      valueOf: valorEnrichedSAPRecord,
      formatValue: formatBRLCompacto,
      valueHeader: 'Valor Total',
      unidadeItem: 'RI(ns)',
      detailColumns: colunas,
      searchPredicate: searchEnrichedSAPRecord,
      searchPlaceholder: SEARCH_PLACEHOLDER_SUPRIMENTOS,
      itemKey: itemKeyEnrichedSAPRecord,
    });
  }, [onAbrirComposicao, colunas]);

  const abrirModalPerformance = useCallback((comprador: string) => {
    const items = materiais.filter(r => resolveComprador(r, compradores) === comprador);
    abrirModalComprador(`Desempenho — ${comprador}`, comprador, items);
  }, [materiais, compradores, abrirModalComprador]);

  const abrirModalAtrasoFaixa = useCallback((faixa: string) => {
    const backlog = records.filter(r => r.status_requisicao !== 'Processado');
    const items = backlog.filter(r => (r.faixa_atraso || 'Sem Atraso') === faixa);
    abrirModalComprador(`Atraso do Backlog — ${faixa}`, faixa, items);
  }, [records, abrirModalComprador]);

  const abrirModalAtrasoComprador = useCallback((comprador: string) => {
    const backlog = records.filter(r => r.status_requisicao !== 'Processado');
    const items = backlog.filter(r => resolveComprador(r, compradores) === comprador);
    abrirModalComprador(`Atraso do Backlog — ${comprador}`, comprador, items);
  }, [records, compradores, abrirModalComprador]);

  return (
    <div className="space-y-6">
      <CarteiraCompradorTable
        records={records}
        compradores={compradores}
        onSelecionarComprador={onSelecionarComprador}
      />
      <CompradorPerformanceChart records={materiais} compradores={compradores} onSelecionar={abrirModalPerformance} />
      <QuantidadesPeriodoTable records={records} compradores={compradores} granularidade={granularidade} />
      <AtrasoChart
        records={records}
        compradores={compradores}
        onSelecionarFaixa={abrirModalAtrasoFaixa}
        onSelecionarComprador={abrirModalAtrasoComprador}
      />
    </div>
  );
}
