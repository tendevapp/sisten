/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análise de consumo de EPI a partir das fichas assinadas: o que mais sai,
 * quanto dura por função, quem consome acima do padrão, perdas e cobertura.
 * Toda a conta está em `fichaEpi.ts` (analisarConsumo), testada.
 */

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarRange,
  Clock,
  FileText,
  Loader2,
  PackageX,
  ShieldQuestion,
  Timer,
  UserRoundX,
  Users,
} from 'lucide-react';
import KpiCard from '../../charts/KpiCard';
import ChartCard from '../../charts/ChartCard';
import ChartTooltip from '../../charts/ChartTooltip';
import { estimateCategoryChartWidth, useChartConfig } from '../../charts/chartDefaults';
import { useToast } from '../../ui/Toast';
import {
  AMOSTRAS_MINIMAS_DURACAO,
  analisarConsumo,
  colaboradoresSemFicha,
  formatarDataBR,
  formatarQuantidade,
  hojeISO,
  type LinhaConsumo,
} from '../../../lib/fichaEpi';
import {
  listarColaboradoresAtivos,
  listarConsumoEpi,
  mensagemErroFichaEpi,
  setorDoColaborador,
  type ColaboradorFichaEpi,
} from '../../../lib/ssmaFichaEpiApi';

interface Props {
  onLancarFicha: (pessoa: ColaboradorFichaEpi) => void;
}

const PERIODOS = [
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: '180', rotulo: 'Últimos 6 meses' },
  { valor: '365', rotulo: 'Últimos 12 meses' },
  { valor: 'tudo', rotulo: 'Todo o histórico' },
];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
const fmtDias = (d: number | null) => (d === null ? '—' : `${d} ${d === 1 ? 'dia' : 'dias'}`);
const fmtPct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function inicioDoPeriodo(periodo: string): string | null {
  if (periodo === 'tudo') return null;
  const d = new Date();
  d.setDate(d.getDate() - Number(periodo));
  return hojeISO(d);
}

const selectCls = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const thCls = 'px-3 py-2.5 font-bold';

function Secao({ titulo, descricao, icone: Icone, children }: { titulo: string; descricao: string; icone: typeof Users; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-2.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <Icone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">{titulo}</h3>
          <p className="text-xs text-slate-500">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function AnaliseConsumoEpi({ onLancarFicha }: Props) {
  const toast = useToast();
  const c = useChartConfig();
  const [todas, setTodas] = useState<LinhaConsumo[]>([]);
  const [pessoas, setPessoas] = useState<ColaboradorFichaEpi[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState('365');
  const [funcaoId, setFuncaoId] = useState('');
  const [setor, setSetor] = useState('');
  const [verTodosColab, setVerTodosColab] = useState(false);

  useEffect(() => {
    Promise.all([listarConsumoEpi(), listarColaboradoresAtivos()])
      .then(([linhas, ativos]) => { setTodas(linhas); setPessoas(ativos); })
      .catch(erro => toast.error(mensagemErroFichaEpi(erro)))
      .finally(() => setCarregando(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const funcoes = useMemo(
    () => [...new Map(todas.map(l => [l.funcao_id, l.funcao_nome])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')),
    [todas],
  );
  const setores = useMemo(() => [...new Set(todas.map(l => l.setor || 'Sem setor'))].sort(), [todas]);

  const filtradas = useMemo(() => {
    const inicio = inicioDoPeriodo(periodo);
    return todas.filter(l =>
      (!inicio || l.data_entrega >= inicio)
      && (!funcaoId || l.funcao_id === funcaoId)
      && (!setor || (l.setor || 'Sem setor') === setor));
  }, [todas, periodo, funcaoId, setor]);

  const analise = useMemo(() => analisarConsumo(filtradas, todas), [filtradas, todas]);
  const semFicha = useMemo(() => colaboradoresSemFicha(pessoas, todas.map(l => l.pessoa_id)), [pessoas, todas]);

  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>;

  if (!todas.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-slate-700">
        <BarChart3 className="mx-auto h-9 w-9 text-slate-400" />
        <h2 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">A análise começa com as primeiras fichas</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          Cada ficha assinada alimenta esta base. Com duas entregas do mesmo EPI ao mesmo colaborador, a duração por função já aparece.
          {pessoas.length > 0 && ` Hoje há ${pessoas.length} colaboradores ativos sem ficha.`}
        </p>
      </div>
    );
  }

  const { resumo } = analise;
  const topEpis = analise.porEpi.slice(0, 12).map(e => ({ nome: e.grupoEpi, valor: e.unidades, perdas: e.perdas, colaboradores: e.colaboradores, duracao: e.duracaoMedianaDias }));
  const serieMensal = analise.porMes.map(m => ({ mes: rotuloMes(m.mes), reposicao: m.unidades - m.perdas, perdas: m.perdas }));
  const colaboradores = verTodosColab ? analise.porColaborador : analise.porColaborador.slice(0, 15);

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CalendarRange className="h-4 w-4 text-slate-400" />
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} className={selectCls} aria-label="Período">
          {PERIODOS.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
        </select>
        <select value={funcaoId} onChange={e => setFuncaoId(e.target.value)} className={selectCls} aria-label="Função">
          <option value="">Todas as funções</option>
          {funcoes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select value={setor} onChange={e => setSetor(e.target.value)} className={selectCls} aria-label="Setor">
          <option value="">Todos os setores</option>
          {setores.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Unidades entregues" value={resumo.unidades} format={formatarQuantidade} icon={Boxes} emphasize detail={`${resumo.tiposEpi} tipos de EPI`} />
        <KpiCard label="Colaboradores atendidos" value={resumo.colaboradores} format={formatarQuantidade} icon={Users} accent="#0891b2" share={pessoas.length ? Math.min(1, resumo.colaboradores / pessoas.length) : undefined} detail={pessoas.length ? `de ${pessoas.length} ativos` : undefined} />
        <KpiCard label="Fichas assinadas" value={resumo.fichas} format={formatarQuantidade} icon={FileText} accent="#7c3aed" />
        <KpiCard label="Perda / dano injustificado" value={resumo.percentualPerda} format={fmtPct} icon={PackageX} accent="var(--status-serious)" share={resumo.percentualPerda} detail={`${formatarQuantidade(resumo.unidadesPerda)} un. com motivo 3`} />
        <KpiCard label="Duração mediana" display={fmtDias(resumo.duracaoMedianaGeral)} icon={Timer} accent="var(--status-good)" detail="entre reposições do mesmo EPI" />
        <KpiCard label="Fora da matriz" value={resumo.unidadesForaDaMatriz} format={formatarQuantidade} icon={ShieldQuestion} accent="var(--status-warning)" share={resumo.unidades ? resumo.unidadesForaDaMatriz / resumo.unidades : 0} detail="un. não previstas para a função" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="EPIs mais consumidos" description="Unidades entregues no período, por EPI (tamanhos somados)." icon={Boxes} height={Math.max(220, topEpis.length * 30)} empty={!topEpis.length}>
          <ResponsiveContainer width="100%" height={Math.max(220, topEpis.length * 30)}>
            <BarChart data={topEpis} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 4 }}>
              <CartesianGrid {...c.grid} vertical horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...c.yAxis} />
              <YAxis type="category" dataKey="nome" {...c.xAxis} tick={{ fontSize: 11, fill: c.tokens.labelStrong, fontWeight: 600 }} width={170} interval={0} tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} />
              <Tooltip
                cursor={c.cursor}
                content={({ active, payload }) => active && payload?.length ? (
                  <ChartTooltip
                    title={payload[0].payload.nome}
                    rows={[
                      { label: 'Unidades', value: formatarQuantidade(payload[0].payload.valor), color: c.tokens.brand },
                      { label: 'Perdas (motivo 3)', value: formatarQuantidade(payload[0].payload.perdas) },
                      { label: 'Colaboradores', value: payload[0].payload.colaboradores },
                      { label: 'Duração mediana', value: fmtDias(payload[0].payload.duracao) },
                    ]}
                  />
                ) : null}
              />
              <Bar dataKey="valor" radius={c.radius.right} maxBarSize={22} {...c.animation}>
                {topEpis.map((_, i) => <Cell key={i} fill={c.tokens.brand} fillOpacity={1 - i * 0.045} />)}
                <LabelList dataKey="valor" position="right" formatter={(v: number) => formatarQuantidade(v)} style={c.labelOnSurface} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Consumo por mês" description="Unidades entregues; em destaque a parcela por perda ou dano injustificado." icon={CalendarRange} height={280} minPlotWidth={estimateCategoryChartWidth(serieMensal.length)} empty={!serieMensal.length}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={serieMensal} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid {...c.grid} />
              <XAxis dataKey="mes" {...c.xAxis} />
              <YAxis allowDecimals={false} {...c.yAxis} />
              <Tooltip cursor={c.cursor} content={({ active, payload, label }) => active && payload?.length ? (
                <ChartTooltip title={label} rows={payload.map(p => ({ label: String(p.name), value: formatarQuantidade(Number(p.value)), color: String(p.color) }))} />
              ) : null} />
              <Legend {...c.legend} />
              <Bar dataKey="reposicao" name="Entregas regulares" stackId="u" fill={c.tokens.brand} maxBarSize={32} {...c.animation} />
              <Bar dataKey="perdas" name="Perda / dano injustificado" stackId="u" fill={c.tokens.status.serious} radius={c.radius.top} maxBarSize={32} {...c.animation} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Duração por função */}
      <Secao titulo="Quanto dura cada EPI, por função" descricao={`Dias entre duas entregas do mesmo EPI ao mesmo colaborador, quando a segunda é reposição (motivos 2 e 3). Referência confiável a partir de ${AMOSTRAS_MINIMAS_DURACAO} reposições.`} icone={Clock}>
        {analise.duracaoPorFuncao.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-500">Ainda não há reposições no período para medir a duração.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr><th className={`${thCls} pl-4`}>Função</th><th className={thCls}>EPI</th><th className={`${thCls} text-right`}>Mediana</th><th className={`${thCls} text-right`}>Mín.</th><th className={`${thCls} text-right`}>Máx.</th><th className={`${thCls} pr-4 text-right`}>Reposições</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {analise.duracaoPorFuncao.map(d => (
                  <tr key={`${d.funcaoId}-${d.chave}`} className={d.amostras < AMOSTRAS_MINIMAS_DURACAO ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}>
                    <td className="px-3 py-2 pl-4">{d.funcaoNome}</td>
                    <td className="px-3 py-2 font-semibold">{d.grupoEpi}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtDias(d.medianaDias)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.minimoDias}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.maximoDias}</td>
                    <td className="px-3 py-2 pr-4 text-right tabular-nums">{d.amostras}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {/* Colaboradores */}
      <Secao titulo="Consumo por colaborador" descricao="Ordenado por unidades recebidas. Trocas precoces: reposições em menos da metade da duração mediana da função para aquele EPI." icone={Users}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
              <tr><th className={`${thCls} pl-4`}>Colaborador</th><th className={thCls}>Função</th><th className={`${thCls} text-right`}>Unidades</th><th className={`${thCls} text-right`}>Tipos de EPI</th><th className={`${thCls} text-right`}>Fichas</th><th className={`${thCls} text-right`}>Perdas</th><th className={`${thCls} text-right`}>Trocas precoces</th><th className={`${thCls} pr-4 text-right`}>Última entrega</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {colaboradores.map(p => (
                <tr key={p.pessoaId} className="text-slate-700 dark:text-slate-200">
                  <td className="px-3 py-2 pl-4"><p className="font-semibold">{p.nome}</p><p className="font-mono text-[11px] text-slate-500">{p.registro}</p></td>
                  <td className="px-3 py-2 text-slate-500">{p.funcaoNome}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatarQuantidade(p.unidades)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.tiposEpi}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.entregas}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${p.perdas ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>{formatarQuantidade(p.perdas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.trocasPrecoces ? <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />{p.trocasPrecoces}</span> : 0}
                  </td>
                  <td className="px-3 py-2 pr-4 text-right whitespace-nowrap">{formatarDataBR(p.ultimaEntrega)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {analise.porColaborador.length > 15 && (
          <button type="button" onClick={() => setVerTodosColab(v => !v)} className="w-full border-t border-slate-100 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50/60 dark:border-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-950/20">
            {verTodosColab ? 'Mostrar só os 15 maiores' : `Ver todos os ${analise.porColaborador.length} colaboradores`}
          </button>
        )}
      </Secao>

      <div className="grid gap-5 xl:grid-cols-2">
        <Secao titulo="Consumo por função" descricao="Unidades por colaborador atendido — compara funções de tamanhos diferentes." icone={BarChart3}>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr><th className={`${thCls} pl-4`}>Função</th><th className={`${thCls} text-right`}>Colab.</th><th className={`${thCls} text-right`}>Unidades</th><th className={`${thCls} pr-4 text-right`}>Un./colab.</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {analise.porFuncao.map(f => (
                  <tr key={f.funcaoId} className="text-slate-700 dark:text-slate-200">
                    <td className="px-3 py-2 pl-4">{f.funcaoNome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.colaboradores}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarQuantidade(f.unidades)}</td>
                    <td className="px-3 py-2 pr-4 text-right font-bold tabular-nums">{formatarQuantidade(Math.round(f.unidadesPorColaborador * 10) / 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        <Secao titulo="Motivos de entrega (M.E.D.)" descricao="Por que os EPIs saíram — alta participação do motivo 3 indica perda ou mau uso." icone={PackageX}>
          <ul className="space-y-3 p-4">
            {analise.porMotivo.map(m => {
              const share = resumo.unidades ? m.unidades / resumo.unidades : 0;
              return (
                <li key={m.motivo}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-slate-700 dark:text-slate-200"><span className="font-bold">{m.motivo}.</span> {m.rotulo}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{formatarQuantidade(m.unidades)} un. · {fmtPct(share)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: m.motivo === 3 ? c.tokens.status.serious : c.tokens.brand }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {analise.porSetor.length > 1 && (
            <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Por setor</p>
              <ul className="space-y-1 text-xs">
                {analise.porSetor.slice(0, 8).map(s => (
                  <li key={s.setor} className="flex justify-between gap-3 text-slate-700 dark:text-slate-200">
                    <span className="truncate">{s.setor}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{formatarQuantidade(s.unidades)} un. · {s.colaboradores} colab.</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Secao>
      </div>

      {/* Cobertura */}
      <Secao titulo={`Colaboradores ativos sem ficha de EPI (${semFicha.length})`} descricao="Ativos no RH Pessoas que nunca assinaram uma ficha — considera todo o histórico, não só o filtro." icone={UserRoundX}>
        {semFicha.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-emerald-700 dark:text-emerald-400">Todos os colaboradores ativos têm ficha de EPI.</p>
        ) : (
          <ul className="grid max-h-[320px] gap-px overflow-y-auto bg-slate-100 sm:grid-cols-2 xl:grid-cols-3 dark:bg-slate-800">
            {semFicha.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-2 bg-white px-4 py-2 dark:bg-slate-900">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{p.nome}</span>
                  <span className="block truncate text-[11px] text-slate-500">{p.cargo || 'Sem cargo'}{setorDoColaborador(p) ? ` · ${setorDoColaborador(p)}` : ''}</span>
                </span>
                <button type="button" onClick={() => onLancarFicha(p)} className="shrink-0 rounded-lg border border-emerald-200 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40">
                  Lançar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
