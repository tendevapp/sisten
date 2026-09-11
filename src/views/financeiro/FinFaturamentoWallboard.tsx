/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Faturamento GW Jacobina — painel de parede (TV).
 *
 * Desenhado para leitura a 3-5 metros, sem ninguém para clicar: nada depende
 * de hover, todo número tem rótulo direto e o estado de cada tramo carrega
 * glifo além da cor (o par azul/verde passa no validador da paleta com ΔE 30
 * em visão normal, mas cai para ~5 em tritanopia — então cor sozinha não pode
 * ser a única codificação).
 *
 * O que este painel responde e o BI original não respondia: **onde o projeto
 * travou**. A matriz torre × tramo mostra numa olhada que as primeiras torres
 * andaram e as demais estão intocadas; três barras de "tramos por projeto" com
 * um projeto só não contam essa história.
 *
 * Escala: um ResizeObserver mede a altura do container e publica `--wb`
 * (1 unidade = 1% da altura). Todo tamanho é múltiplo dessa unidade, então o
 * mesmo componente serve emoldurado na página e em tela cheia numa TV 4K, sem
 * media query e sem depender de unidade de container query (TV velha não tem).
 *
 * Tema: segue o tema do app, porque as cores saem dos tokens validados em
 * `styles/tokens.css`. Para a TV, deixe o app no tema escuro.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer, Cell,
} from 'recharts';
import { Maximize2, Minimize2, RefreshCw, Radio } from 'lucide-react';
import type { FinFatGwjaco } from '../../types';
import {
  resumoFaturamento, matrizTorreTramo, faturadosPorSemana, faturadosPorTramo,
  ultimasNotas, semanaISO, type EstadoTramo, type CelulaMatriz,
} from '../../lib/finFaturamentoRelatorio';
import { useChartConfig } from '../../components/charts/chartDefaults';
import ChartTooltip from '../../components/charts/ChartTooltip';

interface Props {
  linhas: FinFatGwjaco[];
  onAtualizar: () => void | Promise<void>;
  atualizadoEm: Date | null;
  carregando?: boolean;
}

/** N unidades de escala do painel. 1 unidade = 1% da altura do container. */
const u = (n: number) => `calc(var(--wb) * ${n})`;

const ESTADO_GLIFO: Record<EstadoTramo, string> = {
  expedido: '✓',
  faturado: '●',
  pendente: '·',
};

const ESTADO_ROTULO: Record<EstadoTramo, string> = {
  expedido: 'Expedido',
  faturado: 'Faturado',
  pendente: 'Pendente',
};

function fmtDataBR(iso?: string | null): string {
  if (!iso) return '-';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

function fmtHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

function Painel({
  titulo, children, style,
}: { titulo: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--hairline)',
        borderRadius: u(1.2),
        padding: u(1.8),
        gap: u(1.2),
        ...style,
      }}
    >
      <h2
        className="shrink-0 font-bold uppercase"
        style={{ fontSize: u(1.75), letterSpacing: '0.08em', color: 'var(--ink-muted)' }}
      >
        {titulo}
      </h2>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function Kpi({
  valor, rotulo, apoio, cor, destaque,
}: { valor: string; rotulo: string; apoio?: string; cor?: string; destaque?: boolean }) {
  return (
    <div
      className="flex min-w-0 flex-col justify-center"
      style={{
        background: destaque ? 'color-mix(in srgb, var(--brand) 12%, var(--surface-card))' : 'var(--surface-card)',
        border: `1px solid ${destaque ? 'color-mix(in srgb, var(--brand) 40%, var(--hairline))' : 'var(--hairline)'}`,
        borderRadius: u(1.2),
        padding: `${u(1.4)} ${u(1.8)}`,
        gap: u(0.4),
      }}
    >
      <span
        className="tabular font-bold leading-none"
        style={{ fontSize: u(6), color: cor ?? 'var(--ink-primary)' }}
      >
        {valor}
      </span>
      <span
        className="truncate font-bold uppercase"
        style={{ fontSize: u(1.5), letterSpacing: '0.06em', color: 'var(--ink-secondary)' }}
      >
        {rotulo}
      </span>
      {apoio && (
        <span className="truncate" style={{ fontSize: u(1.4), color: 'var(--ink-muted)' }}>
          {apoio}
        </span>
      )}
    </div>
  );
}

/**
 * Uma célula da matriz: cor + glifo, porque cor sozinha não sobrevive a
 * tritanopia. A altura é a da linha (as cinco dividem o painel), a largura vem
 * da contagem de torres — célula retangular enche a parede tanto com 18 torres
 * quanto com as 69 do projeto fechado, o que um quadrado fixo não faria.
 */
function CelulaTramo({ celula, largura }: { celula: CelulaMatriz | null; largura: string }) {
  if (!celula) {
    return <div style={{ width: largura, height: '100%', borderRadius: u(0.4), background: 'transparent' }} />;
  }

  const fundo =
    celula.estado === 'expedido' ? 'var(--status-good)'
    : celula.estado === 'faturado' ? 'var(--series-1)'
    : 'var(--surface-sunken)';

  const tinta = celula.estado === 'pendente' ? 'var(--ink-muted)' : '#ffffff';

  return (
    <div
      className="flex items-center justify-center font-bold"
      title={`Torre ${celula.torre} ${celula.tramo}: ${ESTADO_ROTULO[celula.estado]}${celula.notaFiscal ? ` · NF ${celula.notaFiscal}` : ''}`}
      style={{
        width: largura,
        height: '100%',
        borderRadius: u(0.4),
        background: fundo,
        color: tinta,
        border: celula.estado === 'pendente' ? '1px solid var(--hairline)' : 'none',
        fontSize: `min(calc(${largura} * 0.5), ${u(2.4)})`,
        lineHeight: 1,
      }}
    >
      {ESTADO_GLIFO[celula.estado]}
    </div>
  );
}

function ItemLegenda({ estado }: { estado: EstadoTramo }) {
  const fundo =
    estado === 'expedido' ? 'var(--status-good)'
    : estado === 'faturado' ? 'var(--series-1)'
    : 'var(--surface-sunken)';

  return (
    <span className="inline-flex items-center" style={{ gap: u(0.6) }}>
      <span
        className="inline-flex items-center justify-center font-bold"
        style={{
          width: u(2), height: u(2), borderRadius: u(0.4), background: fundo,
          color: estado === 'pendente' ? 'var(--ink-muted)' : '#ffffff',
          border: estado === 'pendente' ? '1px solid var(--hairline)' : 'none',
          fontSize: u(1.2), lineHeight: 1,
        }}
      >
        {ESTADO_GLIFO[estado]}
      </span>
      <span style={{ fontSize: u(1.5), color: 'var(--ink-secondary)' }}>{ESTADO_ROTULO[estado]}</span>
    </span>
  );
}

function TooltipSemana({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <ChartTooltip
      title={`Semana ${p.semana}${p.ehAtual ? ' (atual)' : ''}`}
      rows={[{ label: 'Tramos faturados', value: String(p.faturados) }]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

export default function FinFaturamentoWallboard({ linhas, onAtualizar, atualizadoEm, carregando }: Props) {
  const c = useChartConfig();
  const raiz = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [agora, setAgora] = useState(() => new Date());

  const semanaAtual = useMemo(() => semanaISO(new Date().toISOString().slice(0, 10)), []);
  const resumo = useMemo(() => resumoFaturamento(linhas, semanaAtual), [linhas, semanaAtual]);
  const matriz = useMemo(() => matrizTorreTramo(linhas), [linhas]);
  const semanas = useMemo(() => faturadosPorSemana(linhas, semanaAtual), [linhas, semanaAtual]);
  const tramos = useMemo(() => faturadosPorTramo(linhas), [linhas]);
  // Cinco, não seis: com seis a linha fica com 25px de altura para 22px de
  // texto numa TV 1080p, e o painel perde o respiro.
  const notas = useMemo(() => ultimasNotas(linhas, 5), [linhas]);

  // Escala: 1 unidade = 1% da altura util do painel.
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const aplicar = () => el.style.setProperty('--wb', `${el.clientHeight / 100}px`);
    aplicar();
    const ro = new ResizeObserver(aplicar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Relogio da parede: minuto a minuto basta, e evita re-render por segundo.
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // A parede se atualiza sozinha; ninguem vai apertar F5 na TV.
  useEffect(() => {
    const id = setInterval(() => { void onAtualizar(); }, 120_000);
    return () => clearInterval(id);
  }, [onAtualizar]);

  useEffect(() => {
    const aoTrocar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoTrocar);
    return () => document.removeEventListener('fullscreenchange', aoTrocar);
  }, []);

  const alternarTelaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void raiz.current?.requestFullscreen?.();
  };

  // Largura da celula da matriz: cabe sempre, de 18 a 69 torres.
  const colunas = Math.max(matriz.torres.length, 1);
  const larguraCelula = `min(${u(4.4)}, calc((100% - ${u(0.5)} * ${colunas - 1}) / ${colunas}))`;

  const maxSemana = Math.max(1, ...semanas.map((s) => s.faturados));
  const maxTramo = Math.max(1, ...tramos.map((t) => t.total));

  return (
    <div
      ref={raiz}
      className="wb-root relative flex w-full flex-col overflow-hidden"
      style={{
        // Emoldurado na pagina mantem 16:9 (a proporcao da TV); em tela cheia
        // o browser manda e a altura vira 100vh.
        aspectRatio: telaCheia ? undefined : '16 / 9',
        height: telaCheia ? '100vh' : undefined,
        background: 'var(--surface-page)',
        borderRadius: telaCheia ? 0 : '1rem',
        border: telaCheia ? 'none' : '1px solid var(--hairline)',
        padding: u(2),
        gap: u(1.6),
      }}
    >
      {/* Cabecalho */}
      <header className="flex shrink-0 items-center justify-between" style={{ gap: u(2) }}>
        <div className="flex min-w-0 items-center" style={{ gap: u(1.6) }}>
          <img
            src="/logo-ten.png"
            alt="Torres Eólicas do Nordeste"
            style={{ height: u(6), width: 'auto' }}
          />
          <div className="min-w-0" style={{ borderLeft: '1px solid var(--hairline)', paddingLeft: u(1.6) }}>
            <h1
              className="truncate font-bold leading-none"
              style={{ fontSize: u(3.6), color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}
            >
              Faturamento de Tramos
            </h1>
            <p className="truncate" style={{ fontSize: u(1.7), color: 'var(--ink-muted)', marginTop: u(0.6) }}>
              GW Jacobina · {linhas[0]?.projeto_codigo ?? 'Projeto único'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center" style={{ gap: u(1.2) }}>
          <div className="text-right">
            <p className="tabular font-bold leading-none" style={{ fontSize: u(3.2), color: 'var(--ink-primary)' }}>
              {fmtHora(agora)}
            </p>
            <p style={{ fontSize: u(1.4), color: 'var(--ink-muted)', marginTop: u(0.5) }}>
              Semana {semanaAtual ?? '-'} · atualizado {atualizadoEm ? fmtHora(atualizadoEm) : '-'}
            </p>
          </div>
          {/* Sinal de vivo: numa parede, a duvida e sempre "isso congelou?". */}
          <span
            className="flex items-center justify-center"
            style={{
              width: u(3.4), height: u(3.4), borderRadius: '9999px',
              background: 'color-mix(in srgb, var(--status-good) 14%, transparent)',
              color: 'var(--status-good)',
            }}
            title={carregando ? 'Atualizando...' : 'Atualização automática a cada 2 minutos'}
          >
            {carregando
              ? <RefreshCw className="animate-spin" style={{ width: u(1.8), height: u(1.8) }} />
              : <Radio className="wb-pulse" style={{ width: u(1.8), height: u(1.8) }} />}
          </span>
          <button
            type="button"
            onClick={alternarTelaCheia}
            title={telaCheia ? 'Sair da tela cheia' : 'Modo TV (tela cheia)'}
            className="flex items-center justify-center transition-opacity hover:opacity-70"
            style={{
              width: u(3.4), height: u(3.4), borderRadius: u(0.8),
              border: '1px solid var(--hairline)', color: 'var(--ink-secondary)',
              background: 'var(--surface-card)',
            }}
          >
            {telaCheia
              ? <Minimize2 style={{ width: u(1.8), height: u(1.8) }} />
              : <Maximize2 style={{ width: u(1.8), height: u(1.8) }} />}
          </button>
        </div>
      </header>

      {/* Linha de indicadores */}
      <div className="grid shrink-0 grid-cols-5" style={{ gap: u(1.6), height: u(16) }}>
        <Kpi
          valor={`${resumo.percentual}%`}
          rotulo="Faturado"
          apoio={`${resumo.faturados} de ${resumo.total} tramos`}
          cor="var(--series-1)"
          destaque
        />
        <Kpi
          valor={String(resumo.expedidos)}
          rotulo="Expedidos"
          apoio={`${resumo.faturados - resumo.expedidos} faturados sem expedir`}
          cor="var(--status-good)"
        />
        <Kpi
          valor={String(resumo.pendentes)}
          rotulo="A faturar"
          apoio={`${resumo.totalTorres - resumo.torresIniciadas} torres não iniciadas`}
        />
        <Kpi
          valor={`${resumo.torresConcluidas}/${resumo.totalTorres}`}
          rotulo="Torres completas"
          apoio={`${resumo.torresIniciadas} em andamento`}
        />
        <Kpi
          valor={String(resumo.naSemana)}
          rotulo={`Semana ${semanaAtual ?? ''}`}
          apoio={resumo.ultimaNota ? `Última NF ${resumo.ultimaNota.nota_fiscal}` : 'Sem nota emitida'}
        />
      </div>

      {/* Corpo */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '1.9fr 1fr', gap: u(1.6) }}>
        {/* Matriz torre x tramo */}
        <Painel titulo={`Avanço por torre e tramo · ${matriz.torres.length} torres`}>
          <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.5) }}>
            {matriz.linhas.map((linhaTramo) => (
              <div key={linhaTramo.tramo} className="flex min-h-0 flex-1 items-stretch" style={{ gap: u(1) }}>
                <span
                  className="tabular flex shrink-0 items-center justify-end font-bold"
                  style={{ width: u(3.4), fontSize: u(1.7), color: 'var(--ink-secondary)' }}
                >
                  {linhaTramo.tramo}
                </span>
                <div className="flex min-w-0 flex-1" style={{ gap: u(0.5) }}>
                  {linhaTramo.celulas.map((celula, i) => (
                    <CelulaTramo key={i} celula={celula} largura={larguraCelula} />
                  ))}
                </div>
              </div>
            ))}

            {/* Regua de torres: rotulo a cada 5, senao vira faixa preta de texto. */}
            <div className="flex shrink-0 items-center" style={{ gap: u(1) }}>
              <span className="shrink-0" style={{ width: u(3.4) }} />
              <div className="flex min-w-0 flex-1" style={{ gap: u(0.5) }}>
                {matriz.torres.map((torre, i) => (
                  <span
                    key={torre}
                    className="tabular text-center"
                    style={{
                      width: larguraCelula,
                      fontSize: u(1.25),
                      color: 'var(--ink-muted)',
                      visibility: i === 0 || (torre % 5 === 0) ? 'visible' : 'hidden',
                    }}
                  >
                    {torre}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center"
            style={{ gap: u(2), paddingTop: u(1.2), borderTop: '1px solid var(--hairline)' }}
          >
            <ItemLegenda estado="expedido" />
            <ItemLegenda estado="faturado" />
            <ItemLegenda estado="pendente" />
            <span style={{ fontSize: u(1.35), color: 'var(--ink-muted)', marginLeft: 'auto' }}>
              Cada quadrado é um tramo. Coluna = torre.
            </span>
          </div>
        </Painel>

        {/* Coluna direita */}
        <div className="grid min-h-0" style={{ gridTemplateRows: '1.15fr 1fr 1.25fr', gap: u(1.6) }}>
          {/* Ritmo semanal */}
          <Painel titulo="Tramos faturados por semana">
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={semanas} margin={{ top: 14, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid {...c.grid} />
                  <XAxis
                    dataKey="rotulo"
                    {...c.xAxis}
                    tick={{ fontSize: 13, fill: c.tokens.labelStrong, fontWeight: 700 }}
                  />
                  <YAxis {...c.yAxis} domain={[0, maxSemana]} allowDecimals={false} tick={{ fontSize: 11, fill: c.tokens.label }} />
                  <Tooltip content={<TooltipSemana />} cursor={c.cursor} />
                  <Bar dataKey="faturados" radius={c.radius.top} {...c.animation} maxBarSize={44}>
                    {/* Sem hover na TV: todo valor vem impresso. */}
                    <LabelList dataKey="faturados" position="top" {...c.labelOnSurface} fontSize={13} />
                    {semanas.map((s) => (
                      <Cell
                        key={s.semana}
                        fill={s.ehAtual ? c.tokens.status.good : c.tokens.series[0]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Painel>

          {/* Por tramo: cinco linhas com numero pequeno nao pedem eixo. */}
          <Painel titulo="Faturado por tramo">
            <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.6) }}>
              {tramos.map((t) => (
                <div key={t.tramo} className="flex min-h-0 flex-1 items-center" style={{ gap: u(1) }}>
                  <span
                    className="tabular shrink-0 font-bold"
                    style={{ width: u(3.4), fontSize: u(1.6), color: 'var(--ink-secondary)' }}
                  >
                    {t.tramo}
                  </span>
                  <div
                    className="min-w-0 flex-1 overflow-hidden"
                    style={{ height: `min(${u(2.2)}, 62%)`, borderRadius: u(0.4), background: 'var(--surface-sunken)' }}
                  >
                    <div
                      style={{
                        width: `${(t.faturados / maxTramo) * 100}%`,
                        height: '100%',
                        borderRadius: u(0.4),
                        background: 'var(--series-1)',
                        transition: 'width var(--dur-slow) var(--ease-out)',
                      }}
                    />
                  </div>
                  <span
                    className="shrink-0 text-right font-bold tabular"
                    style={{ width: u(5), fontSize: u(1.7), color: 'var(--ink-primary)' }}
                  >
                    {t.faturados}
                    <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>/{t.total}</span>
                  </span>
                </div>
              ))}
            </div>
          </Painel>

          {/* Ultimas notas */}
          <Painel titulo="Últimas notas emitidas">
            <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.5) }}>
              {notas.length === 0 && (
                <p style={{ fontSize: u(1.6), color: 'var(--ink-muted)' }}>Nenhuma nota emitida ainda.</p>
              )}
              {notas.map((n) => (
                <div
                  key={n.id}
                  className="flex min-h-0 flex-1 items-center justify-between overflow-hidden"
                  style={{
                    gap: u(1),
                    padding: `0 ${u(1)}`,
                    borderRadius: u(0.6),
                    background: 'var(--surface-raised)',
                  }}
                >
                  <span className="tabular font-bold" style={{ fontSize: u(1.7), color: 'var(--ink-primary)' }}>
                    {n.nota_fiscal}
                  </span>
                  <span className="truncate" style={{ fontSize: u(1.5), color: 'var(--ink-muted)' }}>
                    T{n.torre_numero} · {n.tramo}
                  </span>
                  <span className="tabular shrink-0" style={{ fontSize: u(1.5), color: 'var(--ink-secondary)' }}>
                    {fmtDataBR(n.data_faturado)}
                  </span>
                </div>
              ))}
            </div>
          </Painel>
        </div>
      </div>

      {/*
        `--wb` mora numa classe, não no objeto de estilo do React: o
        ResizeObserver escreve o valor medido no atributo `style` do elemento, e
        se a propriedade também estivesse no JSX o React a reescreveria com o
        fallback a cada re-render (o relógio re-renderiza de minuto em minuto).
        Regra de classe perde para inline, então a medida sempre vence.

        O pulso do sinal de vivo para sob movimento reduzido: a parede fica
        ligada o dia inteiro e piscar sem parar cansa.
      */}
      <style>{`
        .wb-root { --wb: 10.8px; }
        @keyframes wb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .wb-pulse { animation: wb-pulse 2.4s var(--ease-out) infinite; }
        @media (prefers-reduced-motion: reduce) { .wb-pulse { animation: none; } }
      `}</style>
    </div>
  );
}
