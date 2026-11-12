/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monitor de Desempenho › Resumo do dia: escolhe o dia, mostra a análise (o
 * que foi mal, onde, o que fazer — `analisarDia`), a carga hora a hora, os
 * piores momentos com o que rodava neles, consultas, páginas e usuários do
 * dia. "Copiar resumo" gera o texto para mandar no WhatsApp/e-mail.
 *
 * Dia fechado vem do resumo guardado à 00:15 (ops_desempenho_resumo_dia);
 * hoje é montado na hora e marcado como parcial.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, AlertTriangle, CheckCircle2, Clipboard, ClipboardCheck, Flame, Info, Lightbulb, RefreshCw, Users } from 'lucide-react';
import ChartCard from '../../../components/charts/ChartCard';
import KpiCard from '../../../components/charts/KpiCard';
import { useChartConfig } from '../../../components/charts/chartDefaults';
import { apiDesempenho } from '../../../lib/desempenho/api';
import { formatarBytes, formatarDuracao, formatarNumero, nomeConsulta, rotuloEndpoint } from '../../../lib/desempenho/diagnostico';
import { analisarDia, cargaMedia, horaDePico, textoResumo, type Achado, type NivelAchado, type ResumoDia } from '../../../lib/desempenho/resumoDia';
import { dataHojeLocal } from '../../../lib/dataLocal';
import { Carregando, ErroCarga, Secao, TabelaResponsiva, TextoConsulta, nomePagina } from './comum';

const ESTILO: Record<NivelAchado, { icone: typeof Info; classe: string; rotulo: string }> = {
  critico: { icone: AlertOctagon, rotulo: 'Crítico', classe: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200' },
  atencao: { icone: AlertTriangle, rotulo: 'Atenção', classe: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200' },
  info: { icone: Info, rotulo: 'Info', classe: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200' },
  ok: { icone: CheckCircle2, rotulo: 'OK', classe: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200' },
};

function CartaoAchado({ a }: { a: Achado }) {
  const { icone: Icone, classe, rotulo } = ESTILO[a.nivel];
  return (
    <li className={`flex gap-2.5 rounded-xl border px-3 py-2.5 ${classe}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-label={rotulo} />
      <div className="min-w-0">
        <p className="text-sm font-bold">
          <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wide opacity-75">{a.area}</span>
          {a.titulo}
        </p>
        {a.detalhe && <p className="mt-0.5 break-words text-xs opacity-90">{a.detalhe}</p>}
        {a.acao && (
          <p className="mt-1 flex gap-1.5 break-words text-xs font-semibold">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {a.acao}
          </p>
        )}
      </div>
    </li>
  );
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function AbaResumoDia() {
  const c = useChartConfig();
  const hoje = dataHojeLocal();
  const [dia, setDia] = useState(hoje);
  const [dados, setDados] = useState<ResumoDia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async (d: string, recalcular = false) => {
    setCarregando(true);
    try {
      setDados(await apiDesempenho.resumoDia(d, recalcular));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    setDados(null);
    void carregar(dia);
  }, [dia, carregar]);

  const achados = useMemo(() => (dados ? analisarDia(dados) : []), [dados]);

  const copiar = async () => {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(textoResumo(dados, achados));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro('O navegador não deixou copiar. Tente de novo com a aba em foco.');
    }
  };

  const horas = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => {
        const l = dados?.horas.find(x => x.hora === h);
        return { hora: `${String(h).padStart(2, '0')}h`, carga: l?.carga ?? null, lentas: l ? l.lentas : null, conexoes: l ? l.conexoes : null };
      }),
    [dados],
  );

  const t = dados?.aparelhos.totais;
  const carga = cargaMedia(dados?.banco);
  const pico = dados ? horaDePico(dados) : null;
  const criticos = achados.filter(a => a.nivel === 'critico').length;
  const atencao = achados.filter(a => a.nivel === 'atencao').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
          Dia
          <input
            type="date"
            value={dia}
            max={hoje}
            onChange={e => e.target.value && setDia(e.target.value)}
            className="h-9 rounded-lg border px-2 text-sm"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void carregar(dia, dia !== hoje)}
            disabled={carregando}
            className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold disabled:opacity-60"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)', background: 'var(--surface-card)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            {dia === hoje ? 'Atualizar' : 'Recalcular'}
          </button>
          <button
            type="button"
            onClick={() => void copiar()}
            disabled={!dados}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {copiado ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar resumo'}
          </button>
        </div>
      </div>

      {erro && <ErroCarga mensagem={erro} />}
      {!dados ? (
        !erro && <Carregando />
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            {dados.parcial ? 'Dia em andamento: resumo parcial, montado agora.' : `Resumo fechado em ${new Date(dados.gerado_em).toLocaleString('pt-BR')}.`}{' '}
            {criticos || atencao
              ? `${criticos} ponto(s) crítico(s) e ${atencao} de atenção.`
              : 'Nenhum ponto crítico.'}
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Usuários" value={t?.usuarios ?? 0} icon={Users} detail={`${formatarNumero(t?.aparelhos)} aparelho(s)${dados.consumo.logins != null ? ` · ${dados.consumo.logins} login(s)` : ''}`} />
            <KpiCard label="Requisições" value={t?.requisicoes ?? 0} format={formatarNumero} detail={`${formatarNumero(t?.lentas)} lentas · ${formatarNumero(t?.erros)} erros`} />
            <KpiCard
              label="Carga média"
              display={carga != null ? carga.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}
              detail={pico ? `pico às ${String(pico.hora).padStart(2, '0')}h (${pico.carga.toLocaleString('pt-BR', { maximumFractionDigits: 2 })})` : 'sem amostras'}
              accent={pico && pico.carga >= 4 ? 'var(--status-critical)' : undefined}
            />
            <KpiCard label="Tempo de banco" display={formatarDuracao(dados.banco.tempo_ms)} detail={`${formatarNumero(dados.banco.chamadas)} chamadas`} />
            <KpiCard
              label="Disco temporário"
              display={formatarBytes(dados.banco.temp_bytes)}
              detail="consultas fora da memória"
              accent={Number(dados.banco.temp_bytes) > 1024 ** 3 ? 'var(--status-warning)' : undefined}
            />
            <KpiCard label="Baixado" display={formatarBytes(Number(t?.bytes) + Number(t?.storage_bytes))} detail={`banco: ${formatarBytes(dados.banco.banco_fim)}`} />
          </div>

          <Secao titulo="Análise do dia" icone={Lightbulb} descricao="Gerada por regras fixas a partir dos números do dia: o que foi mal, onde e o que fazer. Críticos primeiro.">
            <ul className="space-y-2">
              {achados.map((a, i) => <CartaoAchado key={i} a={a} />)}
            </ul>
          </Secao>

          <ChartCard
            title="Hora a hora"
            icon={Flame}
            description="Carga média do banco (área) e pico de consultas lentas (barras). Horário de Brasília."
            height={240}
            empty={!dados.horas.length}
            emptyMessage="Sem amostras do banco neste dia."
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={horas} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid {...c.grid} />
                <XAxis dataKey="hora" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 10 }} interval={1} />
                <YAxis yAxisId="carga" {...c.yAxis} width={40} />
                <YAxis yAxisId="n" orientation="right" {...c.yAxis} width={32} allowDecimals={false} />
                <Tooltip contentStyle={{ background: c.tokens.tooltipBg, border: `1px solid ${c.tokens.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Legend {...c.legend} />
                <Bar yAxisId="n" dataKey="lentas" name="Lentas > 5 s" fill={c.tokens.status.warning} radius={c.radius.top} {...c.animation} />
                <Line yAxisId="carga" type="monotone" dataKey="carga" name="Carga" stroke={c.tokens.series[0]} strokeWidth={2} dot={false} connectNulls={false} {...c.animation} />
                <Line yAxisId="n" type="stepAfter" dataKey="conexoes" name="Conexões" stroke={c.tokens.series[1]} strokeWidth={1.5} dot={false} connectNulls={false} {...c.animation} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          {dados.piores.length > 0 && (
            <Secao titulo="Piores momentos" icone={Flame} descricao="Os 5 blocos de 5 min com mais carga e as consultas que mais pesaram em cada um.">
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dados.piores.map(p => (
                  <li key={p.balde} className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {hhmm(p.balde)} · carga {formatarNumero(p.carga)}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {formatarNumero(p.lentas)} lenta(s) · {formatarNumero(p.conexoes)} conexões
                    </p>
                    <ol className="mt-2 space-y-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                      {p.consultas.map(q => (
                        <li key={q.id} className="break-all">
                          <strong>{nomeConsulta(q.texto).alvo}</strong> — {formatarDuracao(q.ms)}, {formatarNumero(q.chamadas)}×
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            </Secao>
          )}

          <Secao titulo="Consultas do dia" icone={Flame} descricao="As que mais gastaram tempo de banco no dia.">
            <TabelaResponsiva
              linhas={dados.consultas}
              chave={q => q.id}
              vazio={{ titulo: 'Sem consultas registradas neste dia' }}
              colunas={[
                {
                  rotulo: 'Consulta',
                  valor: q => {
                    const nome = nomeConsulta(q.texto);
                    return (
                      <div className="min-w-[220px] max-w-[460px]">
                        <span className="break-all">{nome.alvo}</span>
                        {nome.tipo && <span className="ml-1 font-normal" style={{ color: 'var(--ink-muted)' }}>({nome.tipo})</span>}
                        <TextoConsulta texto={q.texto} />
                      </div>
                    );
                  },
                },
                { rotulo: 'Tempo', valor: q => formatarDuracao(q.ms), direita: true },
                { rotulo: '% do dia', valor: q => (dados.banco.tempo_ms ? `${Math.round((Number(q.ms) / Number(dados.banco.tempo_ms)) * 100)}%` : '—'), direita: true },
                { rotulo: 'Chamadas', valor: q => formatarNumero(q.chamadas), direita: true },
                { rotulo: 'Média', valor: q => formatarDuracao(q.chamadas ? Number(q.ms) / Number(q.chamadas) : 0), direita: true },
                { rotulo: 'Disco temp.', valor: q => formatarBytes(Number(q.temp_blks) * 8192), direita: true },
              ]}
            />
          </Secao>

          <Secao titulo="Páginas do dia" icone={Users} descricao="Onde os usuários mais esperaram.">
            <TabelaResponsiva
              linhas={dados.aparelhos.paginas}
              chave={p => p.pagina}
              vazio={{ titulo: 'Nenhum aparelho reportou neste dia' }}
              colunas={[
                { rotulo: 'Página', valor: p => <span title={p.pagina}>{nomePagina(p.pagina)}</span> },
                { rotulo: 'Espera', valor: p => formatarDuracao(p.ms), direita: true },
                { rotulo: 'Visitas', valor: p => formatarNumero(p.visitas), direita: true },
                { rotulo: 'Requisições', valor: p => formatarNumero(p.n), direita: true },
                { rotulo: 'Volume', valor: p => formatarBytes(p.bytes), direita: true },
                { rotulo: 'Lentas', valor: p => formatarNumero(p.lentas), direita: true },
                { rotulo: 'Travada', valor: p => formatarDuracao(p.travamento_ms), direita: true },
              ]}
            />
          </Secao>

          <div className="grid gap-6 xl:grid-cols-2">
            <Secao titulo="Chamadas que mais demoraram" icone={Flame}>
              <TabelaResponsiva
                linhas={dados.aparelhos.endpoints}
                chave={e => e.endpoint}
                vazio={{ titulo: 'Sem chamadas registradas' }}
                colunas={[
                  { rotulo: 'Chamada', valor: e => <span className="break-all">{rotuloEndpoint(e.endpoint)}</span> },
                  { rotulo: 'Espera', valor: e => formatarDuracao(e.ms), direita: true },
                  { rotulo: 'Chamadas', valor: e => formatarNumero(e.n), direita: true },
                  { rotulo: 'Lentas', valor: e => formatarNumero(e.lentas), direita: true },
                  { rotulo: 'Erros', valor: e => formatarNumero(e.erros), direita: true },
                ]}
              />
            </Secao>
            <Secao titulo="Usuários que mais esperaram" icone={Users}>
              <TabelaResponsiva
                linhas={dados.aparelhos.usuarios}
                chave={(u, i) => `${u.user_name}:${i}`}
                vazio={{ titulo: 'Sem usuários registrados' }}
                colunas={[
                  { rotulo: 'Usuário', valor: u => u.user_name || 'Usuário' },
                  { rotulo: 'Espera', valor: u => formatarDuracao(u.tempo_ms), direita: true },
                  { rotulo: 'Lentas', valor: u => formatarNumero(u.lentas), direita: true },
                  { rotulo: 'Travada', valor: u => formatarDuracao(u.travamento_ms), direita: true },
                  { rotulo: 'Volume', valor: u => formatarBytes(u.bytes), direita: true },
                ]}
              />
            </Secao>
          </div>
        </>
      )}
    </div>
  );
}
