/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monitor de Desempenho › Linha do tempo: as amostras de 1 min do pg_cron em
 * baldes. "Carga" é o tempo de banco por segundo de relógio — em média,
 * quantas consultas rodavam juntas. Buraco no gráfico = banco sem amostrar
 * (travado ou fora). Clicar num balde, ou num dos "piores momentos", abre o
 * que pesou ali.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock, Flame, LineChart, Timer } from 'lucide-react';
import ChartCard from '../../../components/charts/ChartCard';
import { useChartConfig } from '../../../components/charts/chartDefaults';
import { apiDesempenho, type BaldeLinhaTempo, type Janela, type OpcaoPeriodo } from '../../../lib/desempenho/api';
import { formatarBytes, formatarDuracao, formatarNumero, nomeConsulta } from '../../../lib/desempenho/diagnostico';
import { Carregando, ErroCarga, Secao, TabelaResponsiva, TextoConsulta, horaCurta } from './comum';

interface Ponto {
  ts: number;
  rotulo: string;
  carga: number | null;
  lentas: number | null;
  conexoes: number | null;
  locks: number | null;
  temp: number | null;
  bruto: BaldeLinhaTempo | null;
}

/** Grade completa de baldes: balde sem amostra vira ponto vazio (buraco no gráfico). */
export function montarPontos(baldes: BaldeLinhaTempo[], desde: Date, ate: Date, baldeMin: number): Ponto[] {
  const passo = baldeMin * 60_000;
  const porTs = new Map(baldes.map(b => [new Date(b.balde).getTime(), b]));
  const inicio = Math.floor(desde.getTime() / passo) * passo;
  const pontos: Ponto[] = [];
  const formato: Intl.DateTimeFormatOptions =
    baldeMin >= 60 ? { day: '2-digit', month: '2-digit', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' };
  for (let ts = inicio; ts < ate.getTime(); ts += passo) {
    const b = porTs.get(ts) ?? null;
    const segundos = Number(b?.segundos) || 0;
    pontos.push({
      ts,
      rotulo: new Date(ts).toLocaleString('pt-BR', formato),
      carga: b && segundos > 0 && b.db_tempo_ms != null ? Math.round((Number(b.db_tempo_ms) / (segundos * 1000)) * 100) / 100 : null,
      lentas: b ? b.lentas_5s : null,
      conexoes: b ? b.conexoes : null,
      locks: b ? b.esperando_lock : null,
      temp: b ? Number(b.temp_bytes) || 0 : null,
      bruto: b,
    });
  }
  return pontos;
}

export default function AbaLinhaTempo({ periodo }: { periodo: OpcaoPeriodo }) {
  const c = useChartConfig();
  const [baldes, setBaldes] = useState<BaldeLinhaTempo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela | null>(null);
  const [selecao, setSelecao] = useState<{ desde: Date; ate: Date; rotulo: string } | null>(null);
  const [carregandoJanela, setCarregandoJanela] = useState(false);

  const limites = useMemo(() => {
    const ate = new Date();
    return { desde: new Date(ate.getTime() - periodo.horas * 3_600_000), ate };
  }, [periodo]);

  useEffect(() => {
    let vivo = true;
    setBaldes(null);
    setSelecao(null);
    apiDesempenho
      .linhaTempo(limites.desde, limites.ate, periodo.balde)
      .then(b => vivo && (setBaldes(b), setErro(null)))
      .catch(e => vivo && setErro((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [limites, periodo.balde]);

  const alvo = selecao ?? { ...limites, rotulo: `últimas ${periodo.rotulo}` };

  const carregarJanela = useCallback(async (desde: Date, ate: Date) => {
    setCarregandoJanela(true);
    try {
      setJanela(await apiDesempenho.janela(desde, ate));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregandoJanela(false);
    }
  }, []);

  useEffect(() => {
    void carregarJanela(alvo.desde, alvo.ate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo.desde.getTime(), alvo.ate.getTime(), carregarJanela]);

  const pontos = useMemo(() => (baldes ? montarPontos(baldes, limites.desde, limites.ate, periodo.balde) : []), [baldes, limites, periodo.balde]);
  const piores = useMemo(
    () => pontos.filter(p => p.bruto).sort((a, b) => (b.carga ?? 0) - (a.carga ?? 0) || (b.lentas ?? 0) - (a.lentas ?? 0)).slice(0, 8),
    [pontos],
  );
  const semAmostra = pontos.filter(p => !p.bruto).length;

  const escolher = (p: Ponto) => {
    const desde = new Date(p.ts);
    setSelecao({ desde, ate: new Date(p.ts + periodo.balde * 60_000), rotulo: horaCurta(desde.toISOString()) });
  };

  if (erro && !baldes) return <ErroCarga mensagem={erro} />;
  if (!baldes) return <Carregando />;

  const cargaTotal = janela?.segundos ? (Number(janela.db_tempo_ms) || 0) / (Number(janela.segundos) * 1000) : null;

  return (
    <div className="space-y-6">
      <ChartCard
        title="Carga do banco e consultas lentas"
        icon={LineChart}
        description={
          <>
            Carga = consultas rodando juntas, em média (o banco começa a sofrer acima de ~4). Barras = pico de consultas há mais de 5 s.
            {semAmostra > 0 && ` ${semAmostra} balde(s) sem amostra — o banco não respondeu ou o coletor ainda não existia.`}
            {' '}Clique num ponto para ver o que pesou ali.
          </>
        }
        height={300}
        empty={!baldes.length}
        emptyMessage="Sem amostras neste período. O coletor grava uma por minuto desde a instalação do monitor."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={pontos}
            margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
            onClick={(estado: any) => {
              const i = Number(estado?.activeTooltipIndex ?? estado?.activeIndex);
              if (Number.isFinite(i) && pontos[i]?.bruto) escolher(pontos[i]);
            }}
          >
            <CartesianGrid {...c.grid} />
            <XAxis dataKey="rotulo" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 10 }} minTickGap={24} />
            <YAxis yAxisId="carga" {...c.yAxis} width={40} />
            <YAxis yAxisId="n" orientation="right" {...c.yAxis} width={32} allowDecimals={false} />
            <Tooltip
              cursor={c.cursor}
              contentStyle={{ background: c.tokens.tooltipBg, border: `1px solid ${c.tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
              formatter={(v: any, nome: any) => [v == null ? 'sem amostra' : formatarNumero(v), nome]}
            />
            <Legend {...c.legend} />
            <Area yAxisId="carga" type="monotone" dataKey="carga" name="Carga" stroke={c.tokens.series[0]} fill={c.tokens.series[0]} fillOpacity={0.18} connectNulls={false} {...c.animation} />
            <Bar yAxisId="n" dataKey="lentas" name="Lentas > 5 s" fill={c.tokens.status.warning} radius={c.radius.top} {...c.animation} />
            <Line yAxisId="n" type="monotone" dataKey="locks" name="Esperando lock" stroke={c.tokens.status.critical} dot={false} strokeWidth={2} connectNulls={false} {...c.animation} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Conexões" icon={Clock} description="Pico de conexões abertas por balde. Perto do limite, as chamadas passam a esperar na fila." height={180} empty={!baldes.length}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...c.grid} />
            <XAxis dataKey="rotulo" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 10 }} minTickGap={24} />
            <YAxis {...c.yAxis} width={40} allowDecimals={false} />
            <Tooltip contentStyle={{ background: c.tokens.tooltipBg, border: `1px solid ${c.tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
            <Line type="stepAfter" dataKey="conexoes" name="Conexões" stroke={c.tokens.series[1]} dot={false} strokeWidth={2} connectNulls={false} {...c.animation} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {piores.length > 0 && (
        <Secao titulo="Piores momentos" icone={Flame} descricao="Baldes com mais carga no período. Escolha um para ver o que rodava.">
          <div className="flex flex-wrap gap-2">
            {piores.map(p => (
              <button
                key={p.ts}
                type="button"
                onClick={() => escolher(p)}
                className="rounded-lg border px-2.5 py-1.5 text-left text-xs"
                style={{
                  borderColor: selecao?.desde.getTime() === p.ts ? 'var(--brand)' : 'var(--hairline)',
                  background: 'var(--surface-card)',
                  color: 'var(--ink-secondary)',
                }}
              >
                <span className="block font-bold" style={{ color: 'var(--ink-primary)' }}>{p.rotulo}</span>
                carga {formatarNumero(p.carga)} · {p.lentas ?? 0} lenta(s)
              </button>
            ))}
            {selecao && (
              <button type="button" onClick={() => setSelecao(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold" style={{ color: 'var(--brand)' }}>
                Voltar ao período inteiro
              </button>
            )}
          </div>
        </Secao>
      )}

      <Secao
        titulo={`O que mais pesou — ${alvo.rotulo}`}
        icone={Flame}
        descricao={
          <>
            Soma, minuto a minuto, das 12 consultas que mais gastaram tempo de banco.
            {cargaTotal != null && ` Carga média na janela: ${formatarNumero(Math.round(cargaTotal * 100) / 100)}.`}
            {carregandoJanela && ' Carregando…'}
          </>
        }
      >
        <TabelaResponsiva
          linhas={janela?.consultas ?? []}
          chave={q => q.id}
          vazio={{ titulo: 'Nada registrado nesta janela' }}
          colunas={[
            {
              rotulo: 'Consulta',
              valor: q => {
                const n = nomeConsulta(q.texto);
                return (
                  <div className="min-w-[220px] max-w-[460px]">
                    <span className="break-all">{n.alvo}</span>
                    {n.tipo && <span className="ml-1 font-normal" style={{ color: 'var(--ink-muted)' }}>({n.tipo})</span>}
                    <TextoConsulta texto={q.texto} />
                  </div>
                );
              },
            },
            { rotulo: 'Tempo de banco', valor: q => formatarDuracao(q.ms), direita: true },
            {
              rotulo: '% do total',
              valor: q => (janela?.db_tempo_ms ? `${Math.round((q.ms / Number(janela.db_tempo_ms)) * 100)}%` : '—'),
              direita: true,
            },
            { rotulo: 'Chamadas', valor: q => formatarNumero(q.chamadas), direita: true },
            { rotulo: 'Média', valor: q => formatarDuracao(q.chamadas ? q.ms / q.chamadas : 0), direita: true },
            { rotulo: 'Disco temporário', valor: q => formatarBytes((q.temp_blks || 0) * 8192), direita: true },
            { rotulo: 'Minutos no top', valor: q => q.minutos, direita: true, soDesktop: true },
          ]}
        />
      </Secao>

      <Secao
        titulo="Rodando há mais de 2 s nas amostras"
        icone={Timer}
        descricao="O que o coletor flagrou em execução. Uma consulta que aparece em várias amostras atravessou vários minutos."
      >
        <TabelaResponsiva
          linhas={janela?.em_execucao ?? []}
          chave={(q, i) => `${q.pid}:${i}`}
          destaque={q => (q.bloqueios ? 'var(--status-critical)' : q.s > 30 ? 'var(--status-warning)' : undefined)}
          vazio={{ titulo: 'Nenhuma consulta longa flagrada nesta janela' }}
          colunas={[
            {
              rotulo: 'Consulta',
              valor: q => {
                const n = nomeConsulta(q.consulta);
                return (
                  <div className="min-w-[220px] max-w-[460px]">
                    <span className="break-all">{n.alvo}</span>
                    {n.tipo && <span className="ml-1 font-normal" style={{ color: 'var(--ink-muted)' }}>({n.tipo})</span>}
                    <TextoConsulta texto={q.consulta} />
                  </div>
                );
              },
            },
            { rotulo: 'Maior duração vista', valor: q => formatarDuracao(q.s * 1000), direita: true },
            { rotulo: 'Visto em', valor: q => horaCurta(q.visto_em) },
            { rotulo: 'Esperando', valor: q => q.espera || '—' },
            { rotulo: 'Travada', valor: q => (q.bloqueios ? 'sim' : 'não') },
            { rotulo: 'Amostras', valor: q => q.amostras, direita: true, soDesktop: true },
          ]}
        />
      </Secao>
    </div>
  );
}
