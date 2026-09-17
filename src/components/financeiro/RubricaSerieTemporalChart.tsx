/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Série temporal de pedidos colocados (Realizado por Rubrica) — barras
 * agrupadas por período (mensal ou semanal) com o valor impresso no topo,
 * mesmo padrão dos gráficos de dashboard do app (ver
 * `src/components/suprimentos/AgingCarteiraChart.tsx`,
 * `src/views/ContasPagarAnalise.tsx`). Clicar numa barra abre a lista dos
 * pedidos daquele período (e daquela série, quando há mais de uma).
 *
 * Quatro filtros de recorte (Rubrica, Classificação Nível 1, Nível 2 e
 * Item/Grupo de Mercadoria — os dois últimos vêm de `cadastro_grupo_mercadoria`,
 * não de `sap_zl0132_po.grupo_mercadoria_curto`, que na verdade guarda o
 * código do grupo de COMPRADORES) que se combinam por E; um seletor separado
 * "Comparar por" decide se o gráfico desenha uma única barra de total ou uma
 * barra por rubrica/nível/item em cada período.
 *
 * Fonte: `vw_fin_pedidos_detalhe_rubrica` (mesmo recorte 2026 do resto da
 * tela), buscada uma vez e agregada no cliente — o volume (~1.9 mil linhas)
 * não justifica uma view agregada nova.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Layers, Package, FolderTree, Boxes, FileCheck } from 'lucide-react';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import { seriesColor } from '../../lib/chartTokens';
import MultiSelectFilter from '../ui/MultiSelectFilter';
import { formatBRL, formatBRLCompacto } from '../../lib/format';
import { obterTodosPedidosDetalhe, DetalhePedidoLinha, consolidarPorMaterial } from '../../lib/rubricasFinanceiroApi';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty } from '../ui/DataTable';

type Granularidade = 'mensal' | 'semanal';
type Dimensao = 'total' | 'rubrica' | 'nivel1' | 'nivel2' | 'item';

const OPCOES_DIMENSAO: { valor: Dimensao; rotulo: string }[] = [
  { valor: 'total', rotulo: 'Total' },
  { valor: 'rubrica', rotulo: 'Rubrica' },
  { valor: 'nivel1', rotulo: 'Nível 1' },
  { valor: 'nivel2', rotulo: 'Nível 2' },
  { valor: 'item', rotulo: 'Item' },
];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Chave de mês por fatiamento de string (nunca `new Date(iso)` — ver CLAUDE.md, foge do fuso). */
function chaveMes(dataISO: string): string {
  return dataISO.slice(0, 7); // YYYY-MM
}

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  return `${MESES[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
}

/**
 * Chave + rótulo da semana ISO (segunda a domingo). Usa getters UTC porque a
 * string `YYYY-MM-DD` é interpretada como meia-noite UTC — getters locais em
 * UTC-3 devolveriam o dia anterior (mesma armadilha do `new Date(iso)` que o
 * CLAUDE.md pede para evitar, só que dentro de aritmética de data em vez de
 * exibição direta).
 */
function chaveSemana(dataISO: string): { chave: string; segundaISO: string } {
  const d = new Date(`${dataISO}T00:00:00Z`);
  const diaSemanaIso = (d.getUTCDay() + 6) % 7; // segunda=0 .. domingo=6
  const segunda = new Date(d);
  segunda.setUTCDate(d.getUTCDate() - diaSemanaIso);
  const segundaISO = segunda.toISOString().slice(0, 10);
  return { chave: segundaISO, segundaISO };
}

function rotuloSemana(segundaISO: string): string {
  const [, mes, dia] = segundaISO.split('-');
  return `${dia}/${mes}`;
}

function nomeDimensao(l: DetalhePedidoLinha, dimensao: Dimensao): string {
  switch (dimensao) {
    case 'rubrica': return l.rubrica_nome || 'Sem rubrica';
    case 'nivel1': return l.classificacao_nivel1 || 'Sem classificação';
    case 'nivel2': return l.classificacao_nivel2 || 'Sem classificação';
    case 'item': return l.grupo_mercadoria_nome || l.grupo_mercadoria_codigo || 'Sem grupo';
    default: return 'Total';
  }
}

interface SerieAgregada {
  periodos: string[];
  rotulos: Record<string, string>;
  /** nome da série (rubrica, nível, item ou "Total") -> chave de período -> valor somado. */
  series: Map<string, Map<string, number>>;
}

function agregar(linhas: DetalhePedidoLinha[], granularidade: Granularidade, dimensao: Dimensao): SerieAgregada {
  const rotulos: Record<string, string> = {};
  const series = new Map<string, Map<string, number>>();
  const periodosSet = new Set<string>();

  for (const l of linhas) {
    if (!l.data_doc) continue;
    let chave: string;
    if (granularidade === 'mensal') {
      chave = chaveMes(l.data_doc);
      rotulos[chave] = rotuloMes(chave);
    } else {
      const { chave: c, segundaISO } = chaveSemana(l.data_doc);
      chave = c;
      rotulos[chave] = rotuloSemana(segundaISO);
    }
    periodosSet.add(chave);

    const nomeSerie = nomeDimensao(l, dimensao);
    if (!series.has(nomeSerie)) series.set(nomeSerie, new Map());
    const mapaSerie = series.get(nomeSerie)!;
    mapaSerie.set(chave, (mapaSerie.get(chave) || 0) + (l.valor || 0));
  }

  const periodos = Array.from(periodosSet).sort();
  return { periodos, rotulos, series };
}

function opcoesUnicas(pedidos: DetalhePedidoLinha[], extrator: (p: DetalhePedidoLinha) => string): string[] {
  const nomes = new Set(pedidos.map(extrator));
  return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export default function RubricaSerieTemporalChart() {
  const config = useChartConfig();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<DetalhePedidoLinha[]>([]);
  const [granularidade, setGranularidade] = useState<Granularidade>('mensal');
  const [dimensao, setDimensao] = useState<Dimensao>('total');

  const [rubricasSelecionadas, setRubricasSelecionadas] = useState<Set<string>>(new Set());
  const [nivel1Selecionados, setNivel1Selecionados] = useState<Set<string>>(new Set());
  const [nivel2Selecionados, setNivel2Selecionados] = useState<Set<string>>(new Set());
  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set());
  const [detalheAberto, setDetalheAberto] = useState<{ titulo: string; linhas: DetalhePedidoLinha[] } | null>(null);
  const [consolidarPorItem, setConsolidarPorItem] = useState(false);

  useEffect(() => {
    let ativo = true;
    obterTodosPedidosDetalhe()
      .then(res => { if (ativo) setPedidos(res); })
      .catch(err => {
        if (!ativo) return;
        console.error('[RubricaSerieTemporalChart] Erro ao carregar pedidos:', err);
        setErro(err?.message || 'Erro ao carregar a série temporal.');
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const opcoesRubrica = useMemo(() => opcoesUnicas(pedidos, p => p.rubrica_nome || 'Sem rubrica'), [pedidos]);
  const opcoesNivel1 = useMemo(() => opcoesUnicas(pedidos, p => p.classificacao_nivel1 || 'Sem classificação'), [pedidos]);

  // Nível 2 só lista as subcategorias dos níveis 1 selecionados — evita marcar uma combinação
  // que não existe (ex.: "Frete e Logística" fora de "FRETE").
  const opcoesNivel2 = useMemo(() => {
    const base = nivel1Selecionados.size > 0
      ? pedidos.filter(p => nivel1Selecionados.has(p.classificacao_nivel1 || 'Sem classificação'))
      : pedidos;
    return opcoesUnicas(base, p => p.classificacao_nivel2 || 'Sem classificação');
  }, [pedidos, nivel1Selecionados]);

  const opcoesItem = useMemo(() => opcoesUnicas(pedidos, p => p.grupo_mercadoria_nome || p.grupo_mercadoria_codigo || 'Sem grupo'), [pedidos]);

  const linhasFiltradas = useMemo(() => {
    return pedidos.filter(p => {
      if (rubricasSelecionadas.size > 0 && !rubricasSelecionadas.has(p.rubrica_nome || 'Sem rubrica')) return false;
      if (nivel1Selecionados.size > 0 && !nivel1Selecionados.has(p.classificacao_nivel1 || 'Sem classificação')) return false;
      if (nivel2Selecionados.size > 0 && !nivel2Selecionados.has(p.classificacao_nivel2 || 'Sem classificação')) return false;
      if (itensSelecionados.size > 0) {
        const nome = p.grupo_mercadoria_nome || p.grupo_mercadoria_codigo || 'Sem grupo';
        if (!itensSelecionados.has(nome)) return false;
      }
      return true;
    });
  }, [pedidos, rubricasSelecionadas, nivel1Selecionados, nivel2Selecionados, itensSelecionados]);

  const agregado = useMemo(
    () => agregar(linhasFiltradas, granularidade, dimensao),
    [linhasFiltradas, granularidade, dimensao],
  );

  const nomesSeries = useMemo(() => Array.from(agregado.series.keys()).sort(), [agregado]);

  const dadosGrafico = useMemo(() => {
    return agregado.periodos.map(periodo => {
      const ponto: Record<string, number | string> = { periodo, rotulo: agregado.rotulos[periodo] };
      for (const nome of nomesSeries) {
        ponto[nome] = agregado.series.get(nome)?.get(periodo) || 0;
      }
      return ponto;
    });
  }, [agregado, nomesSeries]);

  const vazio = !carregando && !erro && dadosGrafico.length === 0;
  const minPlotWidth = estimateCategoryChartWidth(dadosGrafico.length, granularidade === 'semanal' ? 44 : 84, 480);

  /** Clique numa barra abre a composição daquele período (e daquela série, quando há mais de uma). */
  const abrirDetalhe = (periodoChave: string, serieNome: string, rotuloPeriodo: string) => {
    const linhas = linhasFiltradas.filter(l => {
      if (!l.data_doc) return false;
      const chave = granularidade === 'mensal' ? chaveMes(l.data_doc) : chaveSemana(l.data_doc).chave;
      if (chave !== periodoChave) return false;
      if (dimensao !== 'total' && nomeDimensao(l, dimensao) !== serieNome) return false;
      return true;
    });
    const titulo = dimensao === 'total' ? rotuloPeriodo : `${rotuloPeriodo} — ${serieNome}`;
    setConsolidarPorItem(false);
    setDetalheAberto({ titulo, linhas });
  };

  const itensConsolidados = useMemo(
    () => (detalheAberto ? consolidarPorMaterial(detalheAberto.linhas) : []),
    [detalheAberto],
  );

  return (
    <ChartCard
      title="Pedidos ao Longo do Tempo"
      description="Valor de pedidos colocados por período (recorte 2026). Combine os filtros para recortar e escolha o que comparar."
      icon={TrendingUp}
      loading={carregando}
      empty={vazio || Boolean(erro)}
      emptyMessage={erro || 'Nenhum pedido no filtro selecionado.'}
      minPlotWidth={dadosGrafico.length > 0 ? minPlotWidth : undefined}
      actions={
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
          {(['mensal', 'semanal'] as const).map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularidade(g)}
              className="px-3 py-1.5 text-xs font-bold capitalize transition-colors"
              style={{
                background: granularidade === g ? 'var(--brand)' : 'var(--surface-card)',
                color: granularidade === g ? '#fff' : 'var(--ink-secondary)',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      }
      footer={
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter
              label="Rubrica"
              icon={Layers}
              options={opcoesRubrica}
              selected={rubricasSelecionadas}
              onChange={setRubricasSelecionadas}
              searchable
              className="shrink-0 w-52"
            />
            <MultiSelectFilter
              label="Classificação Nível 1"
              icon={FolderTree}
              options={opcoesNivel1}
              selected={nivel1Selecionados}
              onChange={next => {
                setNivel1Selecionados(next);
                // Limpa nível 2 selecionado que não pertence mais aos níveis 1 escolhidos.
                if (next.size > 0) {
                  const validos = new Set(opcoesUnicas(
                    pedidos.filter(p => next.has(p.classificacao_nivel1 || 'Sem classificação')),
                    p => p.classificacao_nivel2 || 'Sem classificação',
                  ));
                  setNivel2Selecionados(prev => new Set([...prev].filter(v => validos.has(v))));
                }
              }}
              searchable
              className="shrink-0 w-56"
            />
            <MultiSelectFilter
              label="Classificação Nível 2"
              icon={Boxes}
              options={opcoesNivel2}
              selected={nivel2Selecionados}
              onChange={setNivel2Selecionados}
              searchable
              className="shrink-0 w-56"
            />
            <MultiSelectFilter
              label="Item (Grupo de Mercadoria)"
              icon={Package}
              options={opcoesItem}
              selected={itensSelecionados}
              onChange={setItensSelecionados}
              searchable
              className="shrink-0 w-64"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider mr-1" style={{ color: 'var(--ink-muted)' }}>
              Comparar por:
            </span>
            {OPCOES_DIMENSAO.map(o => (
              <button
                key={o.valor}
                type="button"
                onClick={() => setDimensao(o.valor)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: dimensao === o.valor ? 'var(--brand)' : 'var(--surface-raised)',
                  color: dimensao === o.valor ? '#fff' : 'var(--ink-secondary)',
                }}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={dadosGrafico} margin={{ top: 40, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...config.grid} />
          <XAxis dataKey="rotulo" {...config.xAxis} interval={0} minTickGap={8} />
          <YAxis {...config.yAxis} tickFormatter={(v: number) => formatBRLCompacto(v)} width={64} />
          <Tooltip
            cursor={config.cursor}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const linhasOrdenadas = [...payload].sort((a, b) => (b.value as number) - (a.value as number));
              return (
                <ChartTooltip
                  title={label}
                  subtitle="Clique numa barra para abrir os pedidos"
                  rows={linhasOrdenadas.map(p => ({
                    label: p.name as string,
                    value: formatBRL(p.value as number),
                    color: p.color as string,
                  }))}
                />
              );
            }}
          />
          {nomesSeries.length > 1 && <Legend {...config.legend} />}
          {nomesSeries.map((nome, idx) => (
            <Bar
              key={nome}
              dataKey={nome}
              name={nome}
              fill={seriesColor(config.tokens, idx)}
              radius={config.radius.top}
              maxBarSize={nomesSeries.length > 1 ? (granularidade === 'semanal' ? 12 : 20) : (granularidade === 'semanal' ? 20 : 36)}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(entry: any) => abrirDetalhe(entry.periodo, nome, entry.rotulo)}
              {...config.animation}
            >
              <LabelList
                dataKey={nome}
                position="top"
                formatter={(v: number) => (v > 0 ? formatBRLCompacto(v) : '')}
                style={config.labelOnSurface}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {detalheAberto && (
        <Modal onClose={() => setDetalheAberto(null)} maxWidth="max-w-3xl" ariaLabel={`Pedidos — ${detalheAberto.titulo}`}>
          <ModalHeader onClose={() => setDetalheAberto(null)}>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{detalheAberto.titulo}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {consolidarPorItem
                ? `${itensConsolidados.length} item(ns)`
                : `${detalheAberto.linhas.length} pedido(s)`} · Total {formatBRL(detalheAberto.linhas.reduce((s, l) => s + (l.valor || 0), 0))}
            </p>
          </ModalHeader>
          <ModalBody>
            <div className="flex justify-end mb-3">
              <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
                <button
                  type="button"
                  onClick={() => setConsolidarPorItem(false)}
                  className="px-3 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    background: !consolidarPorItem ? 'var(--brand)' : 'var(--surface-card)',
                    color: !consolidarPorItem ? '#fff' : 'var(--ink-secondary)',
                  }}
                >
                  Por pedido
                </button>
                <button
                  type="button"
                  onClick={() => setConsolidarPorItem(true)}
                  className="px-3 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    background: consolidarPorItem ? 'var(--brand)' : 'var(--surface-card)',
                    color: consolidarPorItem ? '#fff' : 'var(--ink-secondary)',
                  }}
                >
                  Consolidar por item
                </button>
              </div>
            </div>

            {detalheAberto.linhas.length === 0 ? (
              <TableEmpty icon={FileCheck} title="Nenhum pedido neste período" />
            ) : consolidarPorItem ? (
              <TableShell maxHeight="55vh">
                <table className="w-full text-xs">
                  <TableHeadRow>
                    <Th label="Item (Material)" />
                    <Th label="Grupo Mercadoria" />
                    <Th label="Qtd. Pedidos" align="right" />
                    <Th label="Valor" align="right" />
                  </TableHeadRow>
                  <TableBody>
                    {itensConsolidados.map(item => (
                      <Tr key={item.chave}>
                        <Td truncate title={item.material}>{item.material}</Td>
                        <Td truncate title={item.grupoMercadoria}>{item.grupoMercadoria}</Td>
                        <Td align="right" numeric>{item.qtdPedidos.toLocaleString('pt-BR')}</Td>
                        <Td align="right" numeric strong>{formatBRL(item.valor)}</Td>
                      </Tr>
                    ))}
                  </TableBody>
                </table>
              </TableShell>
            ) : (
              <TableShell maxHeight="55vh">
                <table className="w-full text-xs">
                  <TableHeadRow>
                    <Th label="Doc. Compra" />
                    <Th label="Data" />
                    <Th label="Item (Material)" />
                    <Th label="Fornecedor" />
                    <Th label="Grupo Mercadoria" />
                    <Th label="Rubrica" />
                    <Th label="Valor" align="right" />
                  </TableHeadRow>
                  <TableBody>
                    {detalheAberto.linhas
                      .slice()
                      .sort((a, b) => (b.valor || 0) - (a.valor || 0))
                      .map(l => (
                        <Tr key={l.id}>
                          <Td mono>{l.doc_compra}{l.item ? `-${l.item}` : ''}</Td>
                          <Td>{l.data_doc}</Td>
                          <Td truncate title={l.material_descricao || ''}>{l.material_descricao || '—'}</Td>
                          <Td truncate title={l.fornecedor_nome || ''}>{l.fornecedor_nome || l.fornecedor_codigo || '—'}</Td>
                          <Td truncate title={l.grupo_mercadoria_nome || ''}>{l.grupo_mercadoria_nome || l.grupo_mercadoria_codigo || '—'}</Td>
                          <Td>{l.rubrica_nome || 'Sem rubrica'}</Td>
                          <Td align="right" numeric strong>{formatBRL(l.valor)}</Td>
                        </Tr>
                      ))}
                  </TableBody>
                </table>
              </TableShell>
            )}
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setDetalheAberto(null)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Fechar
            </button>
          </ModalFooter>
        </Modal>
      )}
    </ChartCard>
  );
}
