/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Painéis — risco de ruptura e concentração de refugo.
 *
 * As duas perguntas gerenciais: "vou ter peça até a última torre do pedido?"
 * e "de quem/de que é o refugo?". A primeira é o saldo projetado; a segunda
 * cruza as saídas de sobressalente por fornecedor e por motivo.
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, PackageX, TrendingDown } from 'lucide-react';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';
import { useChartConfig } from '../charts/chartDefaults';
import { useChartTokens, seriesColor } from '../../lib/chartTokens';
import { TableEmpty } from '../ui/DataTable';
import { formatInt, formatQtd } from '../../lib/format';
import { ROTULO_MOTIVO, type MotivoSobressalente } from '../../lib/projetos';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props { dados: DadosProjetos }

export default function PainelAnalises({ dados }: Props) {
  const { projecao, saldos, sobressalentes, subprojetoAtivo, loading } = dados;
  const config = useChartConfig();
  const tokens = useChartTokens();

  /** Refugo por fornecedor: quem entrega peça que quebra na montagem. */
  const refugoPorFornecedor = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of saldos) {
      const refugo = Number(s.refugo) || 0;
      if (refugo <= 0) continue;
      const f = s.fornecedor || 'Sem fornecedor';
      m.set(f, (m.get(f) ?? 0) + refugo);
    }
    return Array.from(m.entries())
      .map(([fornecedor, pecas]) => ({ fornecedor, pecas }))
      .sort((a, b) => b.pecas - a.pecas)
      .slice(0, 10);
  }, [saldos]);

  const refugoPorMotivo = useMemo(() => {
    const m = new Map<MotivoSobressalente, number>();
    for (const s of sobressalentes) {
      const total = (s.itens ?? []).reduce((t, i) => t + Number(i.quantidade), 0);
      m.set(s.motivo, (m.get(s.motivo) ?? 0) + total);
    }
    return Array.from(m.entries())
      .map(([motivo, pecas]) => ({ motivo: ROTULO_MOTIVO[motivo], pecas }))
      .sort((a, b) => b.pecas - a.pecas);
  }, [sobressalentes]);

  /** Peças mais refugadas — a lista que vira reclamação de qualidade. */
  const topRefugados = useMemo(
    () =>
      saldos
        .map((s) => ({ ...s, refugo: Number(s.refugo) || 0, entradas: Number(s.entradas) || 0 }))
        .filter((s) => s.refugo > 0)
        .map((s) => ({ ...s, taxa: s.entradas > 0 ? s.refugo / s.entradas : null }))
        .sort((a, b) => b.refugo - a.refugo)
        .slice(0, 15),
    [saldos],
  );

  const totalRefugo = saldos.reduce((t, s) => t + (Number(s.refugo) || 0), 0);
  const semRefugo = totalRefugo === 0;

  return (
    <div className="space-y-5">
      {/* Risco de ruptura */}
      <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
              <TrendingDown className="h-4 w-4" style={{ color: projecao.alertaCompraComplementar ? 'var(--abc-c)' : 'var(--abc-a)' }} />
              Saldo projetado até o fim do pedido
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              estoque + peças em kits montados − consumo das {formatInt(projecao.torresRestantes)} torres que faltam
              {subprojetoAtivo ? ` em ${subprojetoAtivo.nome}` : ''} ({formatInt(projecao.torresConcluidas)} de{' '}
              {formatInt(projecao.torresTotais)} concluída(s)).
            </p>
          </div>
          <span
            className="px-3 py-1.5 rounded-lg text-xs font-extrabold shrink-0"
            style={{
              background: projecao.alertaCompraComplementar ? 'var(--abc-c)' : 'var(--abc-a)',
              color: '#fff',
            }}
          >
            {projecao.alertaCompraComplementar
              ? `ALERTA DE COMPRA COMPLEMENTAR — ${formatInt(projecao.deficits.length)} item(ns)`
              : 'Pedido coberto pelo estoque'}
          </span>
        </div>

        {loading && <div className="h-32 rounded-lg animate-pulse" style={{ background: 'var(--hairline)' }} />}

        {!loading && !projecao.alertaCompraComplementar && (
          <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-muted)' }}>
            Nenhum item fecha o pedido no negativo. {formatInt(projecao.itensAvaliados)} itens avaliados.
          </p>
        )}

        {!loading && projecao.alertaCompraComplementar && (
          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: 'var(--surface-raised)' }}>
                <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                  <Th>Item</Th>
                  <Th r>Consumo/torre</Th>
                  <Th r>Demanda residual</Th>
                  <Th r>Estoque</Th>
                  <Th r>Em kits</Th>
                  <Th r>Projetado</Th>
                  <Th r>Comprar</Th>
                </tr>
              </thead>
              <tbody>
                {projecao.deficits.map((d) => (
                  <tr key={d.partNumberNorm} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                    <td className="px-3 py-1.5 min-w-[200px]">
                      <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>{d.partNumber}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--ink-muted)' }}>
                        {d.descricao}{d.codSap ? ` · SAP ${d.codSap}` : ''}
                      </p>
                    </td>
                    <Td r>{formatQtd(d.consumoPorTorre)}</Td>
                    <Td r>{formatQtd(d.demandaResidual)}</Td>
                    <Td r>{formatQtd(d.saldoFisico)}</Td>
                    <Td r>{d.emKits > 0 ? formatQtd(d.emKits) : '—'}</Td>
                    <Td r cor="var(--abc-c)">{formatQtd(d.saldoProjetado)}</Td>
                    <Td r forte cor="var(--abc-c)">{formatQtd(d.deficit)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refugo */}
      {semRefugo && !loading ? (
        <TableEmpty
          icon={PackageX}
          title="Nenhum refugo registrado"
          hint="Os painéis de refugo se preenchem conforme as solicitações de sobressalente forem lançadas."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Refugo por fornecedor"
            description="Peças repostas por quebra, deformação ou não-conformidade, somadas por quem forneceu."
            icon={AlertTriangle}
            height={260}
            loading={loading}
            empty={!refugoPorFornecedor.length}
            emptyMessage="Sem refugo lançado."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={refugoPorFornecedor} layout="vertical">
                <CartesianGrid {...config.grid} horizontal={false} />
                <XAxis type="number" {...config.yAxis} />
                <YAxis type="category" dataKey="fornecedor" width={110} {...config.xAxis} />
                <Tooltip
                  cursor={config.cursor}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltip
                        title={String(payload[0].payload.fornecedor)}
                        rows={[{ label: 'Peças refugadas', value: formatQtd(Number(payload[0].value)) }]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="pecas" radius={config.radius.right} {...config.animation}>
                  {refugoPorFornecedor.map((_, i) => (
                    <Cell key={i} fill={seriesColor(tokens, i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Refugo por motivo"
            description="Onde a peça se perde: na montagem, na solda, no fornecedor ou no caminho."
            icon={PackageX}
            height={260}
            loading={loading}
            empty={!refugoPorMotivo.length}
            emptyMessage="Sem refugo lançado."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={refugoPorMotivo}>
                <CartesianGrid {...config.grid} vertical={false} />
                <XAxis dataKey="motivo" {...config.xAxis} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis {...config.yAxis} />
                <Tooltip
                  cursor={config.cursor}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltip
                        title={String(payload[0].payload.motivo)}
                        rows={[{ label: 'Peças', value: formatQtd(Number(payload[0].value)) }]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="pecas" radius={config.radius.top} {...config.animation}>
                  {refugoPorMotivo.map((_, i) => (
                    <Cell key={i} fill={seriesColor(tokens, i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {topRefugados.length > 0 && (
        <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          <h3 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>Peças mais refugadas</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>
            A taxa é sobre o que já entrou. Só é comparável entre peças com volume de entrada parecido.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                  <Th>Item</Th>
                  <Th>Fornecedor</Th>
                  <Th r>Entradas</Th>
                  <Th r>Refugo</Th>
                  <Th r>Taxa</Th>
                </tr>
              </thead>
              <tbody>
                {topRefugados.map((s) => (
                  <tr key={s.item_id} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                    <td className="px-3 py-1.5">
                      <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>{s.part_number}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--ink-muted)' }}>{s.descricao || s.description}</p>
                    </td>
                    <Td>{s.fornecedor || '—'}</Td>
                    <Td r>{formatQtd(s.entradas)}</Td>
                    <Td r forte cor="var(--abc-c)">{formatQtd(s.refugo)}</Td>
                    <Td r>{s.taxa === null ? '—' : `${(s.taxa * 100).toFixed(1)}%`}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, r = false }: { children: React.ReactNode; r?: boolean }) {
  return <th className={`px-3 py-2 font-bold whitespace-nowrap ${r ? 'text-right' : 'text-left'}`} style={{ color: 'var(--ink-muted)' }}>{children}</th>;
}

function Td({ children, r = false, forte = false, cor }: { children: React.ReactNode; r?: boolean; forte?: boolean; cor?: string }) {
  return (
    <td
      className={`px-3 py-1.5 whitespace-nowrap ${r ? 'text-right tabular-nums' : ''} ${forte ? 'font-bold' : ''}`}
      style={{ color: cor ?? (forte ? 'var(--ink-primary)' : 'var(--ink-secondary)') }}
    >
      {children}
    </td>
  );
}
