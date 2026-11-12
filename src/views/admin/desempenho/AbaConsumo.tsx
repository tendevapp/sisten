/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monitor de Desempenho › Consumo: o que pesa na conta do Supabase e dá para
 * medir de dentro — tamanho do banco e do Storage, usuários ativos, volume
 * baixado pelos aparelhos (estimativa de egress) e trabalho do banco por dia.
 *
 * O egress faturado só a API de gestão do Supabase informa (painel → Usage).
 * O número daqui é o volume descompactado que os aparelhos receberam: teto do
 * egress de dados, útil para achar quem consome, não para conferir a fatura.
 */

import React, { useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Clock3, Database, HardDrive, Users } from 'lucide-react';
import ChartCard from '../../../components/charts/ChartCard';
import KpiCard from '../../../components/charts/KpiCard';
import { useChartConfig } from '../../../components/charts/chartDefaults';
import { apiDesempenho, type Consumo, type OpcaoPeriodo } from '../../../lib/desempenho/api';
import { formatarBytes, formatarDuracao, formatarNumero } from '../../../lib/desempenho/diagnostico';
import { Carregando, ErroCarga, Secao, TabelaResponsiva } from './comum';

const MB = 1_048_576;

function diaCurto(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

export default function AbaConsumo({ periodo }: { periodo: OpcaoPeriodo }) {
  const c = useChartConfig();
  const [dados, setDados] = useState<Consumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    const ate = new Date();
    // Consumo por dia só faz sentido com pelo menos 1 dia.
    const horas = Math.max(periodo.horas, 24);
    apiDesempenho
      .consumo(new Date(ate.getTime() - horas * 3_600_000), ate)
      .then(d => vivo && (setDados(d), setErro(null)))
      .catch(e => vivo && setErro((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [periodo]);

  if (erro && !dados) return <ErroCarga mensagem={erro} />;
  if (!dados) return <Carregando />;

  const storageTotal = (dados.storage ?? []).reduce((s, b) => s + Number(b.bytes), 0);
  const storageNovo = (dados.storage ?? []).reduce((s, b) => s + Number(b.novos_bytes), 0);
  const baixado = dados.por_dia.reduce((s, d) => s + Number(d.bytes) + Number(d.storage_bytes), 0);
  const dias = Math.max(1, dados.por_dia.length);
  const cresc = dados.crescimento_banco;
  const crescimento = cresc.length >= 2 ? Number(cresc[cresc.length - 1].bytes) - Number(cresc[0].bytes) : null;

  const porDia = dados.por_dia.map(d => ({
    dia: diaCurto(d.dia),
    dados: Math.round((Number(d.bytes) / MB) * 10) / 10,
    arquivos: Math.round((Number(d.storage_bytes) / MB) * 10) / 10,
    requisicoes: Number(d.requisicoes),
  }));
  const porHora = Array.from({ length: 24 }, (_, h) => {
    const l = dados.por_hora.find(x => x.hora === h);
    return { hora: `${String(h).padStart(2, '0')}h`, usuarios: l ? Number(l.usuarios) : 0, requisicoes: l ? Number(l.requisicoes) : 0 };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Banco"
          display={formatarBytes(dados.banco_bytes)}
          icon={Database}
          detail={crescimento != null ? `${crescimento >= 0 ? '+' : ''}${formatarBytes(Math.abs(crescimento))} no período` : 'crescimento aparece após 1 dia'}
        />
        <KpiCard label="Storage" display={formatarBytes(storageTotal)} icon={HardDrive} detail={`+${formatarBytes(storageNovo)} no período`} />
        <KpiCard label="Baixado pelos aparelhos" display={formatarBytes(baixado)} detail={`≈ ${formatarBytes(baixado / dias)} por dia`} />
        <KpiCard label="Usuários ativos" value={dados.usuarios_periodo} icon={Users} detail="reportaram no período" />
        <KpiCard
          label="Logins (24 h / 7 d)"
          display={dados.auth ? `${dados.auth.login_24h} / ${dados.auth.login_7d}` : '—'}
          detail={dados.auth ? `${dados.auth.total} contas · ${dados.auth.sessoes_ativas} sessões ativas` : 'sem acesso ao auth'}
        />
        <KpiCard
          label="Requisições/dia"
          value={Math.round(dados.por_dia.reduce((s, d) => s + Number(d.requisicoes), 0) / dias)}
          format={formatarNumero}
          detail="média dos aparelhos"
        />
      </div>

      <ChartCard
        title="Volume baixado por dia"
        icon={CalendarDays}
        description="MB recebidos pelos aparelhos (dados das tabelas e arquivos do Storage) e número de requisições. Sobe junto com importação SAP e telas que recarregam bases inteiras."
        height={260}
        empty={!porDia.length}
        emptyMessage="Sem dados dos aparelhos ainda. Eles reportam a cada 5 min depois de receber esta versão do SISTEN."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={porDia} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...c.grid} />
            <XAxis dataKey="dia" {...c.xAxis} />
            <YAxis yAxisId="mb" {...c.yAxis} width={44} unit=" MB" />
            <YAxis yAxisId="n" orientation="right" {...c.yAxis} width={44} />
            <Tooltip contentStyle={{ background: c.tokens.tooltipBg, border: `1px solid ${c.tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
            <Legend {...c.legend} />
            <Bar yAxisId="mb" dataKey="dados" name="Dados (MB)" stackId="mb" fill={c.tokens.series[0]} {...c.animation} />
            <Bar yAxisId="mb" dataKey="arquivos" name="Arquivos (MB)" stackId="mb" fill={c.tokens.series[2]} radius={c.radius.top} {...c.animation} />
            <Line yAxisId="n" type="monotone" dataKey="requisicoes" name="Requisições" stroke={c.tokens.series[1]} strokeWidth={2} dot={false} {...c.animation} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Uso por hora do dia" icon={Clock3} description="Usuários distintos e requisições por hora (horário de Brasília), somando o período." height={200} empty={!dados.por_hora.length}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={porHora} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...c.grid} />
            <XAxis dataKey="hora" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 10 }} interval={1} />
            <YAxis yAxisId="n" {...c.yAxis} width={44} />
            <YAxis yAxisId="u" orientation="right" {...c.yAxis} width={32} allowDecimals={false} />
            <Tooltip contentStyle={{ background: c.tokens.tooltipBg, border: `1px solid ${c.tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
            <Legend {...c.legend} />
            <Bar yAxisId="n" dataKey="requisicoes" name="Requisições" fill={c.tokens.series[0]} radius={c.radius.top} {...c.animation} />
            <Line yAxisId="u" type="monotone" dataKey="usuarios" name="Usuários" stroke={c.tokens.series[1]} strokeWidth={2} dot={false} {...c.animation} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <Secao titulo="Storage por bucket" icone={HardDrive} descricao="Arquivos guardados. 'No período' = enviados dentro da janela escolhida (mínimo 1 dia).">
        <TabelaResponsiva
          linhas={dados.storage ?? []}
          chave={b => b.bucket}
          vazio={{ titulo: 'Sem acesso ao Storage', dica: 'A função não conseguiu ler storage.objects.' }}
          colunas={[
            { rotulo: 'Bucket', valor: b => b.bucket },
            { rotulo: 'Tamanho', valor: b => formatarBytes(b.bytes), direita: true },
            { rotulo: 'Arquivos', valor: b => formatarNumero(b.arquivos), direita: true },
            { rotulo: 'Média', valor: b => formatarBytes(b.arquivos ? Number(b.bytes) / Number(b.arquivos) : 0), direita: true },
            { rotulo: 'Novos no período', valor: b => `${formatarNumero(b.novos)} · ${formatarBytes(b.novos_bytes)}`, direita: true },
          ]}
        />
      </Secao>

      <Secao
        titulo="Trabalho do banco por dia"
        icone={Database}
        descricao="Das amostras por minuto. Disco temporário alto = consultas que não couberam na memória (ordenações e junções grandes); lido do disco = cache não deu conta."
      >
        <TabelaResponsiva
          linhas={dados.banco_por_dia}
          chave={d => d.dia}
          vazio={{ titulo: 'Sem amostras ainda' }}
          colunas={[
            { rotulo: 'Dia', valor: d => diaCurto(d.dia) },
            { rotulo: 'Chamadas', valor: d => formatarNumero(d.chamadas), direita: true },
            { rotulo: 'Tempo de banco', valor: d => formatarDuracao(Number(d.tempo_s) * 1000), direita: true },
            { rotulo: 'Disco temporário', valor: d => formatarBytes(d.temp_bytes), direita: true },
            { rotulo: 'Lido do disco', valor: d => formatarBytes(d.lido_disco_bytes), direita: true },
          ]}
        />
      </Secao>

      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        Egress faturado, MAU e cota do plano só o painel do Supabase mostra (Organization › Usage). Os volumes daqui vêm dos próprios
        aparelhos e servem para achar quem consome. Arquivos do Storage abertos por imagem/PDF entram na contagem, mas sem tamanho quando o
        navegador não informa.
      </p>
    </div>
  );
}
