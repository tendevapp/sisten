/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visão Geral — "como está o setor, e melhorou ou piorou?"
 *
 * Todo indicador aqui vem com a variação contra a janela anterior de mesma
 * duração. Um número solto ("conversão 72%") não sustenta decisão; o mesmo
 * número com direção ("72%, +4 p.p.") sustenta.
 *
 * O funil de conversão e os níveis de alerta vieram da versão anterior desta
 * página, com o drill-down para o painel preservado.
 */

import React, { useMemo, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Clock, CircleDashed, TrendingUp, Wallet } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import {
  calcResumoSetor, delta, cobertura, MetricaComCobertura, DIAS_CRITICO, faixaAgingDoRegistro, temPO,
} from '../../lib/suprimentos';
import { CompradorInfo, resolveComprador } from '../../lib/demandas';
import { formatInt, formatPct, formatPctInt, formatBRLCompacto } from '../../lib/format';
import { useChartTokens } from '../../lib/chartTokens';
import ChartCard from '../charts/ChartCard';
import KpiCard from '../charts/KpiCard';
import { ComposicaoModalConfig } from '../charts/ComposicaoModal';
import {
  colunasEnrichedSAPRecord, filtrosEnrichedSAPRecord, valorEnrichedSAPRecord, itemKeyEnrichedSAPRecord,
  searchEnrichedSAPRecord, SEARCH_PLACEHOLDER_SUPRIMENTOS,
} from '../../lib/composicaoSuprimentos';
import DeltaBadge from './DeltaBadge';
import AgingCarteiraChart from './AgingCarteiraChart';

interface TabVisaoGeralProps {
  records: EnrichedSAPRecord[];
  /** Mesma seleção na janela anterior — base das variações. */
  recordsAnterior: EnrichedSAPRecord[];
  /** False quando o período filtrado não define uma janela anterior comparável. */
  temComparacao: boolean;
  compradores: CompradorInfo[];
  onDrilldown: (tipo: 'status' | 'alert' | 'buyer', valor: string) => void;
  onAbrirComposicao: (config: ComposicaoModalConfig<EnrichedSAPRecord>) => void;
}

// Os três níveis de alerta são *status*, não identidade: escala reservada, e
// cada um sempre acompanhado de rótulo.
const NIVEIS = [
  { chave: '⚠️ AÇÃO URGENTE', rotulo: 'Crítico', detalhe: 'Escalação pendente', token: 'var(--status-critical)' },
  { chave: '⚡ ACOMPANHAR', rotulo: 'Atenção', detalhe: 'Em acompanhamento', token: 'var(--status-warning)' },
  { chave: '✅ OK', rotulo: 'OK / Monitoramento', detalhe: 'Dentro da meta', token: 'var(--status-good)' },
] as const;

/**
 * Nota de cobertura de um indicador parcial. Só aparece quando falta dado —
 * escrever "100% dos pedidos" em toda tela vira ruído e o leitor para de ler
 * justamente a linha que importa quando a cobertura cai.
 */
function NotaCobertura({ m, sufixo }: { m: MetricaComCobertura; sufixo: string }) {
  // Sem nada elegível não há cobertura a declarar — a alternativa seria exibir
  // "calculado sobre 0%", que soa como falha de dado onde não há dado nenhum.
  if (m.elegiveis === 0) return null;
  const fracao = cobertura(m);
  if (fracao >= 0.999) return null;
  return (
    <span style={{ color: 'var(--status-warning)' }}>
      {' '}· calculado sobre {formatPctInt(fracao * 100)} {sufixo}
    </span>
  );
}

/** Diferença em pontos percentuais — sem o "%", que aqui seria enganoso. */
const pontosPercentuais = (v: number) => `${formatPct(Math.abs(v)).replace('%', '')} p.p.`;

export default function TabVisaoGeral({
  records, recordsAnterior, temComparacao, compradores, onDrilldown, onAbrirComposicao,
}: TabVisaoGeralProps) {
  const tokens = useChartTokens();

  const colunas = useMemo(() => colunasEnrichedSAPRecord(compradores), [compradores]);
  const filtros = useMemo(() => filtrosEnrichedSAPRecord(compradores), [compradores]);

  const abrirModalRecords = useCallback((title: string, badge: string, items: EnrichedSAPRecord[], irParaPainel?: () => void) => {
    onAbrirComposicao({
      title,
      badge,
      items,
      groupBy: r => resolveComprador(r, compradores),
      groupLabelHeader: 'Comprador',
      valueOf: valorEnrichedSAPRecord,
      formatValue: formatBRLCompacto,
      valueHeader: 'Valor Total',
      unidadeItem: 'RI(ns)',
      detailColumns: colunas,
      filters: filtros,
      searchPredicate: searchEnrichedSAPRecord,
      searchPlaceholder: SEARCH_PLACEHOLDER_SUPRIMENTOS,
      itemKey: itemKeyEnrichedSAPRecord,
      onIrParaPainel: irParaPainel,
      irParaPainelLabel: 'Ir p/ Painel',
    });
  }, [onAbrirComposicao, compradores, colunas, filtros]);

  const abrirModalFaixaAging = useCallback((rotulo: string) => {
    const items = records.filter(r => faixaAgingDoRegistro(r) === rotulo);
    abrirModalRecords(`Carteira Aberta — ${rotulo}`, 'Aging da Carteira', items);
  }, [records, abrirModalRecords]);

  const abrirModalStatus = useCallback((destino: 'Sem PO' | 'Com PO') => {
    const items = records.filter(r => (destino === 'Sem PO' ? !temPO(r) : temPO(r)));
    abrirModalRecords(`Fluxo de Conversão — ${destino}`, destino, items, () => onDrilldown('status', destino));
  }, [records, abrirModalRecords, onDrilldown]);

  const abrirModalNivel = useCallback((chave: string, rotulo: string) => {
    const items = records.filter(r => {
      if (chave === '⚠️ AÇÃO URGENTE') return r.alerta === '⚠️ ESCALAR IMEDIATAMENTE' || r.alerta === '⚠️ AÇÃO URGENTE';
      if (chave === '⚡ ACOMPANHAR') return r.alerta === '⚡ ACOMPANHAR';
      return r.alerta === '✅ OK' || r.alerta === '📋 MONITORAR';
    });
    abrirModalRecords(`Níveis de Alerta — ${rotulo}`, rotulo, items, () => onDrilldown('alert', chave));
  }, [records, abrirModalRecords, onDrilldown]);

  const atual = useMemo(() => calcResumoSetor(records), [records]);
  const anterior = useMemo(() => calcResumoSetor(recordsAnterior), [recordsAnterior]);

  const deltas = useMemo(() => ({
    // Carteira aberta crescendo é ruim: o sentido "bom" é para baixo.
    abertos: delta(atual.abertos, anterior.abertos, 'baixo'),
    conversao: delta(atual.conversao, anterior.conversao, 'cima'),
    leadTime: delta(atual.leadTime.valor, anterior.leadTime.valor, 'baixo'),
    spend: delta(atual.spend.valor, anterior.spend.valor, 'baixo'),
    otd: delta(atual.otdCliente.valor, anterior.otdCliente.valor, 'cima'),
  }), [atual, anterior]);

  const niveis = useMemo(() => {
    const critico = records.filter(r => r.alerta === '⚠️ ESCALAR IMEDIATAMENTE' || r.alerta === '⚠️ AÇÃO URGENTE').length;
    const atencao = records.filter(r => r.alerta === '⚡ ACOMPANHAR').length;
    const ok = records.filter(r => r.alerta === '✅ OK' || r.alerta === '📋 MONITORAR').length;
    return [
      { ...NIVEIS[0], valor: critico, cor: tokens.status.critical },
      { ...NIVEIS[1], valor: atencao, cor: tokens.status.warning },
      { ...NIVEIS[2], valor: ok, cor: tokens.status.good },
    ];
  }, [records, tokens]);

  const totalNiveis = niveis.reduce((a, n) => a + n.valor, 0);

  return (
    <div className="space-y-6">
      {/* Indicadores de saúde do setor */}
      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-5 stagger">
        <KpiCard
          label="Carteira Aberta"
          value={atual.abertos}
          format={formatInt}
          detail={`${formatInt(atual.criticos)} acima de ${DIAS_CRITICO} dias`}
          icon={CircleDashed}
          accent="var(--series-2)"
          share={atual.total > 0 ? atual.abertos / atual.total : undefined}
          onClick={() => onDrilldown('status', 'Sem PO')}
        />
        <KpiCard
          label="Conversão RM → PO"
          value={atual.conversao}
          format={formatPctInt}
          detail={`${formatInt(atual.processados)} de ${formatInt(atual.total)} viraram pedido`}
          icon={TrendingUp}
          accent="var(--series-3)"
          share={atual.conversao / 100}
          emphasize
        />
        <KpiCard
          label="Lead Time RM → PO"
          value={atual.leadTime.valor}
          format={v => `${formatInt(v)} dias`}
          detail="Da solicitação até o pedido colocado"
          icon={Clock}
          accent="var(--series-1)"
        />
        <KpiCard
          label="Spend no Período"
          value={atual.spend.valor}
          format={formatBRLCompacto}
          detail={`${formatInt(atual.spend.base)} itens pedidos`}
          icon={Wallet}
          accent="var(--series-7)"
        />
        <KpiCard
          label="OTD Cliente Interno"
          value={atual.otdCliente.valor}
          format={formatPctInt}
          detail={`${formatInt(atual.otdCliente.noPrazo)} de ${formatInt(atual.otdCliente.base)} recebidos no prazo`}
          icon={CheckCircle}
          accent={
            atual.otdCliente.valor >= 90
              ? 'var(--status-good)'
              : atual.otdCliente.valor >= 70
                ? 'var(--status-warning)'
                : 'var(--status-critical)'
          }
          share={atual.otdCliente.valor / 100}
        />
      </div>

      {/* Variações e notas de cobertura, fora dos cartões para não competir com
          o número principal. */}
      <div
        className="rounded-xl border px-4 py-3 grid gap-x-6 gap-y-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 text-[10px]"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <div>
          <span className="block font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-muted)' }}>Carteira</span>
          <DeltaBadge delta={deltas.abertos} comparavel={temComparacao} formatAbsoluto={v => `${formatInt(Math.abs(v))} itens`} />
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-muted)' }}>Conversão</span>
          <DeltaBadge delta={deltas.conversao} comparavel={temComparacao} modo="absoluto" formatAbsoluto={pontosPercentuais} />
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-muted)' }}>Lead Time</span>
          <DeltaBadge delta={deltas.leadTime} comparavel={temComparacao} modo="absoluto" formatAbsoluto={v => `${formatInt(Math.abs(v))} dias`} />
          <NotaCobertura m={atual.leadTime} sufixo="dos pedidos" />
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-muted)' }}>Spend</span>
          {/* Spend maior não é bom nem ruim em si — o selo mostra só o sentido,
              e por isso a direção "boa" segue a de custo (para baixo). */}
          <DeltaBadge delta={deltas.spend} comparavel={temComparacao} formatAbsoluto={v => formatBRLCompacto(Math.abs(v))} />
          <NotaCobertura m={atual.spend} sufixo="dos pedidos do período" />
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-muted)' }}>OTD</span>
          <DeltaBadge delta={deltas.otd} comparavel={temComparacao} modo="absoluto" formatAbsoluto={pontosPercentuais} />
          {atual.otdCliente.pendentes > 0 && (
            <span style={{ color: 'var(--ink-muted)' }}>
              {' '}· {formatInt(atual.otdCliente.pendentes)} pendentes de recebimento
            </span>
          )}
        </div>
      </div>

      <AgingCarteiraChart records={records} onSelecionarFaixa={abrirModalFaixaAging} />

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Funil de conversão. A sequência é real (sem PO → com PO), então a
            numeração dos passos carrega informação e a rampa ordinal de um
            matiz só mostra o avanço na própria cor. */}
        <ChartCard
          title="Fluxo de Conversão"
          description="Onde as requisições estão no caminho até virar pedido. Clique num passo para filtrar o painel."
          height={260}
          empty={atual.total === 0}
          emptyMessage="Nenhuma requisição no filtro selecionado."
        >
          <ol className="space-y-3 py-2 stagger">
            {[
              { passo: 1, rotulo: 'Aguardando cotação / pedido', valor: atual.abertos, destino: 'Sem PO' as const, cor: 'var(--atraso-2)' },
              { passo: 2, rotulo: 'Convertido em pedido SAP', valor: atual.processados, destino: 'Com PO' as const, cor: 'var(--atraso-4)' },
            ].map(e => {
              const pct = atual.total > 0 ? (e.valor / atual.total) * 100 : 0;
              return (
                <li key={e.passo}>
                  <button
                    onClick={() => abrirModalStatus(e.destino)}
                    className="w-full rounded-lg border p-3.5 text-left group transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ borderColor: 'var(--hairline)', outlineColor: e.cor }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                        Passo {e.passo}
                      </span>
                      <span className="text-[11px] font-semibold tabular" style={{ color: 'var(--ink-muted)' }}>
                        {formatPctInt(pct)}
                      </span>
                    </div>
                    <p className="text-xs font-bold mt-1" style={{ color: 'var(--ink-primary)' }}>{e.rotulo}</p>
                    <p className="text-xl font-black mt-0.5 tabular" style={{ color: 'var(--ink-primary)' }}>
                      {formatInt(e.valor)} RIs
                    </p>
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${pct}%`, background: e.cor }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] group-hover:underline" style={{ color: 'var(--ink-muted)' }}>
                      Filtrar no painel →
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        </ChartCard>

        {/* Barra 100% empilhada: parte-do-todo lida sem comparar ângulos. */}
        <ChartCard
          title="Níveis de Alerta"
          description="Distribuição das requisições por severidade. Clique num nível para filtrar o painel."
          height={260}
          empty={totalNiveis === 0}
          emptyMessage="Nenhuma requisição classificada."
        >
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tabular" style={{ color: 'var(--ink-primary)' }}>
                {formatInt(totalNiveis)}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                itens classificados
              </span>
            </div>

            <div className="flex h-7 w-full gap-[2px] rounded-md overflow-hidden">
              {niveis.map(n => (
                <div
                  key={n.chave}
                  className="h-full first:rounded-l-md last:rounded-r-md transition-[filter] duration-200 hover:brightness-110"
                  style={{
                    width: `${totalNiveis > 0 ? (n.valor / totalNiveis) * 100 : 0}%`,
                    background: n.token,
                  }}
                  title={`${n.rotulo}: ${formatInt(n.valor)}`}
                />
              ))}
            </div>

            <ul className="space-y-1.5">
              {niveis.map(n => (
                <li key={n.chave}>
                  <button
                    onClick={() => abrirModalNivel(n.chave, n.rotulo)}
                    className="w-full flex items-center gap-3 p-2 -mx-2 rounded-lg text-left transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
                    style={{ outlineColor: n.token }}
                  >
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ background: n.token }} aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                        {n.rotulo}: {formatInt(n.valor)} itens
                      </span>
                      <span className="block text-[10px]" style={{ color: 'var(--ink-muted)' }}>{n.detalhe}</span>
                    </span>
                    <span className="text-xs font-semibold tabular shrink-0" style={{ color: 'var(--ink-secondary)' }}>
                      {formatPctInt(totalNiveis > 0 ? (n.valor / totalNiveis) * 100 : 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
      </div>

      {/* A leitura de prazo nas duas pontas fica lado a lado de propósito: a
          distância entre elas é a discussão que trava reunião de suprimentos —
          quando o fornecedor cumpre e o cliente interno ainda recebe atrasado,
          o desvio está no processo antes do pedido, não no fornecedor. */}
      <ChartCard
        title="Aderência a Prazo — as duas leituras"
        icon={AlertTriangle}
        description="Prazo seco, sem tolerância. Só itens já recebidos entram no cálculo."
        height={140}
        empty={atual.otdCliente.base === 0 && atual.otdFornecedor.base === 0}
        emptyMessage="Nenhum item recebido com prazo aferível no filtro selecionado."
      >
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {[
            {
              titulo: 'OTD Fornecedor',
              explicacao: 'Recebido até a data prometida no pedido — o fornecedor cumpriu o que assinou.',
              r: atual.otdFornecedor,
            },
            {
              titulo: 'OTD Cliente Interno',
              explicacao: 'Recebido até a data requerida pela área — o solicitante teve o material quando precisava.',
              r: atual.otdCliente,
            },
          ].map(({ titulo, explicacao, r }) => (
            <div key={titulo} className="rounded-lg border p-4" style={{ borderColor: 'var(--hairline)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{titulo}</p>
              <p className="text-2xl font-black mt-1 tabular" style={{ color: 'var(--ink-primary)' }}>
                {r.base > 0 ? formatPct(r.valor) : '—'}
              </p>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${r.base > 0 ? r.valor : 0}%`,
                    background: r.valor >= 90 ? 'var(--status-good)' : r.valor >= 70 ? 'var(--status-warning)' : 'var(--status-critical)',
                  }}
                />
              </div>
              <p className="text-[10px] mt-2 leading-snug" style={{ color: 'var(--ink-muted)' }}>{explicacao}</p>
              <p className="text-[10px] mt-1 tabular" style={{ color: 'var(--ink-muted)' }}>
                {formatInt(r.noPrazo)} de {formatInt(r.base)} no prazo
                {r.atrasoMedioDias > 0 && ` · atraso médio ${formatInt(r.atrasoMedioDias)} dias`}
                {r.pendentes > 0 && ` · ${formatInt(r.pendentes)} ainda não recebidos`}
              </p>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}
