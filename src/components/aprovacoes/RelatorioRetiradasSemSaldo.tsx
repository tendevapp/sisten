/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório das Retiradas sem Saldo, na aba de Solicitações › Aprovações.
 * Usa a mesma lista que o painel já leu (só os setores que o usuário aprova)
 * e tem filtros próprios: período, setor, EPI, aprovação e baixa. Todo número
 * abre as retiradas que ele contou.
 *
 * A classificação de EPI lê o Cadastro de Itens inteiro; por isso só sai
 * quando o relatório abre, e fica guardada enquanto o app estiver aberto.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { SolExtra } from '../../lib/solicitacaoExtraApi';
import { listarClassificacaoEpiRetiradas } from '../../lib/solicitacaoExtraApi';
import { hojeISO } from '../../lib/fichaEpi';
import { formatQtd } from '../../lib/format';
import { APROVACAO_SOL_EXTRA_ROTULO, type AprovacaoSolExtra, type StatusSolExtra } from '../../lib/solicitacaoExtra';
import { ROTULO_PRESET_PERIODO, intervaloPreset, type PresetPeriodo } from '../../lib/relatorioSolExtra';
import {
  FILTRO_RELATORIO_VAZIO, ROTULO_FILTRO_EPI, chaveSetorRetirada, detalharRetiradas, filtrarRelatorioRetiradas,
  resumirRetiradas, rotuloSetorRetirada,
  type AgrupamentoRetiradas, type FiltroEpiRetirada, type FiltroRelatorioRetiradas, type GrupoRetiradas,
  type RecorteRetiradas, type SituacaoRecorte,
} from '../../lib/relatorioRetiradasSemSaldo';
import { TableCardRow, TableCards, TableDesktop } from '../ui/DataTable';
import { Segmentado } from '../almoxarifado/RelatorioSolExtra';
import DetalheRelatorioRetiradasModal from './DetalheRelatorioRetiradasModal';

let cacheEpi: Promise<Map<string, boolean>> | null = null;
function classificacaoEpi() {
  cacheEpi ??= listarClassificacaoEpiRetiradas().catch(err => { cacheEpi = null; throw err; });
  return cacheEpi;
}

const campo = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const rotulo = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const cartao = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
const numeroLink = 'rounded tabular-nums underline decoration-dotted underline-offset-4 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-blue-200';

const ROTULO_AGRUPAMENTO: Record<AgrupamentoRetiradas, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' };

const COLUNAS: { chave: SituacaoRecorte; rotulo: string; cor: string }[] = [
  { chave: 'aguardandoAprovacao', rotulo: 'Aguard. aprovação', cor: 'text-amber-700 dark:text-amber-300' },
  { chave: 'reprovadas', rotulo: 'Reprovadas', cor: 'text-rose-700 dark:text-rose-300' },
  { chave: 'aguardandoBaixa', rotulo: 'Aguard. baixa', cor: 'text-sky-700 dark:text-sky-300' },
  { chave: 'baixadas', rotulo: 'Baixadas', cor: 'text-emerald-700 dark:text-emerald-300' },
];

const n = (v: number) => v.toLocaleString('pt-BR');

export default function RelatorioRetiradasSemSaldo({ registros, carregando }: { registros: SolExtra[]; carregando: boolean }) {
  const ids = { setor: useId(), epi: useId(), aprovacao: useId(), baixa: useId(), de: useId(), ate: useId() };
  const [preset, setPreset] = useState<PresetPeriodo | null>('mes');
  const [filtro, setFiltro] = useState<FiltroRelatorioRetiradas>(() => ({ ...intervaloPreset('mes', hojeISO()), ...FILTRO_RELATORIO_VAZIO }));
  const [agrupamento, setAgrupamento] = useState<AgrupamentoRetiradas>('semana');
  const [epi, setEpi] = useState<{ estado: 'carregando' | 'ok' | 'erro'; mapa: Map<string, boolean> }>({ estado: 'carregando', mapa: new Map() });
  const [tentativa, setTentativa] = useState(0);
  const [todosMateriais, setTodosMateriais] = useState(false);
  const [detalhe, setDetalhe] = useState<{ titulo: string; recorte: RecorteRetiradas } | null>(null);

  useEffect(() => {
    let vivo = true;
    setEpi(e => ({ ...e, estado: 'carregando' }));
    classificacaoEpi()
      .then(mapa => { if (vivo) setEpi({ estado: 'ok', mapa }); })
      .catch(() => { if (vivo) setEpi(e => ({ ...e, estado: 'erro' })); });
    return () => { vivo = false; };
  }, [tentativa]);

  const epiPronto = epi.estado === 'ok';
  const filtroEfetivo = epiPronto ? filtro : { ...filtro, epi: 'todos' as const };
  const datasInvertidas = !!filtro.de && !!filtro.ate && filtro.de > filtro.ate;

  const filtradas = useMemo(() => {
    if (datasInvertidas) return [];
    return filtrarRelatorioRetiradas(registros, epiPronto ? filtro : { ...filtro, epi: 'todos' }, epi.mapa);
  }, [registros, filtro, epiPronto, epi.mapa, datasInvertidas]);
  const resumo = useMemo(() => resumirRetiradas(filtradas, agrupamento), [filtradas, agrupamento]);

  const setores = useMemo(() => {
    const mapa = new Map(registros.map(r => [chaveSetorRetirada(r), rotuloSetorRetirada(r)]));
    return [...mapa].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [registros]);

  const escolherPreset = (p: PresetPeriodo) => {
    setPreset(p);
    setFiltro(f => ({ ...f, ...intervaloPreset(p, hojeISO()) }));
  };
  const mudar = <K extends keyof FiltroRelatorioRetiradas>(k: K, v: FiltroRelatorioRetiradas[K]) => setFiltro(f => ({ ...f, [k]: v }));
  const filtrosExtras = filtro.setor || filtro.epi !== 'todos' || filtro.aprovacao !== 'todas' || filtro.baixa !== 'todas';

  const abrir = (titulo: string, recorte: RecorteRetiradas) => setDetalhe({ titulo, recorte });
  const registrosDetalhe = useMemo(() => (detalhe ? detalharRetiradas(filtradas, detalhe.recorte) : []), [detalhe, filtradas]);

  const descricaoPeriodo = filtro.de || filtro.ate
    ? `${filtro.de ? filtro.de.split('-').reverse().join('/') : 'início'} a ${filtro.ate ? filtro.ate.split('-').reverse().join('/') : 'hoje'}`
    : 'todo o histórico';
  const materiaisVisiveis = todosMateriais ? resumo.materiais : resumo.materiais.slice(0, 15);
  const maiorSetor = resumo.setores[0];

  return (
    <section aria-label="Relatório de retiradas sem saldo" className="space-y-3">
      <div className={`${cartao} space-y-3`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <span className={rotulo}>Período</span>
            <Segmentado
              ariaLabel="Período"
              opcoes={(Object.keys(ROTULO_PRESET_PERIODO) as PresetPeriodo[]).map(p => [p, ROTULO_PRESET_PERIODO[p]] as [PresetPeriodo, string])}
              valor={preset ?? ('' as PresetPeriodo)}
              onChange={escolherPreset}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-80">
            <div>
              <label htmlFor={ids.de} className={rotulo}>De</label>
              <input id={ids.de} type="date" value={filtro.de ?? ''} onChange={e => { setPreset(null); mudar('de', e.target.value || null); }} className={campo} />
            </div>
            <div>
              <label htmlFor={ids.ate} className={rotulo}>Até</label>
              <input id={ids.ate} type="date" value={filtro.ate ?? ''} onChange={e => { setPreset(null); mudar('ate', e.target.value || null); }} className={campo} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div>
            <label htmlFor={ids.setor} className={rotulo}>Setor</label>
            <select id={ids.setor} value={filtro.setor} onChange={e => mudar('setor', e.target.value)} className={campo}>
              <option value="">Todos que você aprova</option>
              {setores.map(([chave, nome]) => <option key={chave} value={chave}>{nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.epi} className={rotulo}>EPI</label>
            <select id={ids.epi} value={filtroEfetivo.epi} disabled={!epiPronto} onChange={e => mudar('epi', e.target.value as FiltroEpiRetirada)} className={campo}>
              {(Object.keys(ROTULO_FILTRO_EPI) as FiltroEpiRetirada[]).map(k => <option key={k} value={k}>{ROTULO_FILTRO_EPI[k]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.aprovacao} className={rotulo}>Aprovação</label>
            <select id={ids.aprovacao} value={filtro.aprovacao} onChange={e => mudar('aprovacao', e.target.value as AprovacaoSolExtra | 'todas')} className={campo}>
              <option value="todas">Todas</option>
              {(Object.keys(APROVACAO_SOL_EXTRA_ROTULO) as AprovacaoSolExtra[]).map(k => <option key={k} value={k}>{APROVACAO_SOL_EXTRA_ROTULO[k]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.baixa} className={rotulo}>Baixa</label>
            <select id={ids.baixa} value={filtro.baixa} onChange={e => mudar('baixa', e.target.value as StatusSolExtra | 'todas')} className={campo}>
              <option value="todas">Todas</option>
              <option value="PENDENTE">Aguardando baixa</option>
              <option value="REGULARIZADA">Baixada no balcão</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>Por data da retirada · {descricaoPeriodo}</span>
          {epi.estado === 'carregando' && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Lendo a classificação de EPI…</span>}
          {epi.estado === 'erro' && (
            <span role="alert" className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> Classificação de EPI indisponível.
              <button type="button" onClick={() => setTentativa(t => t + 1)} className="font-semibold underline">Tentar de novo</button>
            </span>
          )}
          {filtrosExtras && (
            <button type="button" onClick={() => setFiltro(f => ({ ...f, ...FILTRO_RELATORIO_VAZIO }))} className="ml-auto font-semibold text-blue-700 hover:underline dark:text-blue-300">
              Limpar setor, EPI e situação
            </button>
          )}
        </div>
        {datasInvertidas && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">A data inicial é depois da final.</p>}
      </div>

      {carregando && registros.length === 0 ? (
        <p role="status" className={`${cartao} flex items-center gap-2 text-sm text-slate-500`}><Loader2 className="h-4 w-4 animate-spin" /> Carregando retiradas…</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Indicador rotulo="Retiradas" valor={resumo.totais.retiradas} extra={`${n(resumo.totais.itens)} linha(s) de material`}
              onAbrir={() => abrir('Todas do recorte', { tipo: 'total' })} />
            {COLUNAS.map(c => (
              <Indicador key={c.chave} rotulo={c.rotulo.replace('Aguard.', 'Aguardando')} valor={resumo.totais[c.chave]} cor={c.cor}
                extra={c.chave === 'baixadas' && resumo.diasMedioAteBaixa !== null
                  ? `média de ${resumo.diasMedioAteBaixa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia(s) até a baixa` : undefined}
                onAbrir={() => abrir(c.rotulo.replace('Aguard.', 'Aguardando'), { tipo: 'total', situacao: c.chave })} />
            ))}
            <Indicador rotulo="Setor com mais" valor={maiorSetor?.retiradas ?? 0} extra={maiorSetor ? maiorSetor.rotulo : '—'}
              onAbrir={maiorSetor ? () => abrir(maiorSetor.rotulo, { tipo: 'setor', chave: maiorSetor.chave }) : undefined} />
          </dl>

          {resumo.totais.retiradas === 0 ? (
            <p className={`${cartao} text-center text-sm text-slate-500`}>Nenhuma retirada sem saldo nesse recorte.</p>
          ) : (
            <>
              <div className={cartao}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Por período</h3>
                  <Segmentado<AgrupamentoRetiradas> ariaLabel="Agrupar por" opcoes={(Object.keys(ROTULO_AGRUPAMENTO) as AgrupamentoRetiradas[]).map(k => [k, ROTULO_AGRUPAMENTO[k]] as [AgrupamentoRetiradas, string])}
                    valor={agrupamento} onChange={setAgrupamento} />
                </div>
                <TabelaGrupos titulo="Período" grupos={resumo.periodos} total={resumo.totais.retiradas}
                  onAbrir={(g, situacao) => abrir(g.rotulo, { tipo: 'periodo', chave: g.chave, agrupamento, situacao })} />
              </div>

              <div className={cartao}>
                <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">Por setor solicitante</h3>
                <TabelaGrupos titulo="Setor" grupos={resumo.setores} total={resumo.totais.retiradas}
                  onAbrir={(g, situacao) => abrir(g.rotulo, { tipo: 'setor', chave: g.chave, situacao })} />
              </div>

              <div className={cartao}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Materiais mais retirados sem saldo</h3>
                  <span className="text-xs text-slate-500">{n(resumo.materiais.length)} material(is) distintos</span>
                </div>
                <TableCards>
                  {materiaisVisiveis.map(m => (
                    <TableCardRow key={m.chave} onClick={() => abrir(`${m.material} · ${m.descricao}`, { tipo: 'material', chave: m.chave })}>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{m.descricao || '—'}</p>
                      <p className="flex justify-between gap-2 text-xs text-slate-500">
                        <span className="font-mono">{m.material}</span>
                        <span className="tabular-nums">{n(m.retiradas)} retirada(s) · {formatQtd(m.quantidade)} {m.unidade}</span>
                      </p>
                    </TableCardRow>
                  ))}
                </TableCards>
                <TableDesktop>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-left text-xs">
                      <caption className="sr-only">Materiais mais retirados sem saldo</caption>
                      <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th scope="col" className="px-3 py-2">Material</th>
                          <th scope="col" className="px-3 py-2">Descrição</th>
                          <th scope="col" className="px-3 py-2 text-right">Retiradas</th>
                          <th scope="col" className="px-3 py-2 text-right">Quantidade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {materiaisVisiveis.map(m => (
                          <tr key={m.chave} className="text-slate-700 dark:text-slate-200">
                            <td className="whitespace-nowrap px-3 py-2 font-mono">{m.material}</td>
                            <td className="px-3 py-2">{m.descricao || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <button type="button" onClick={() => abrir(`${m.material} · ${m.descricao}`, { tipo: 'material', chave: m.chave })}
                                aria-label={`Ver ${m.retiradas} retirada(s) de ${m.material}`} className={`${numeroLink} font-semibold text-blue-700 dark:text-blue-300`}>
                                {n(m.retiradas)}
                              </button>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatQtd(m.quantidade)} {m.unidade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TableDesktop>
                {resumo.materiais.length > 15 && (
                  <button type="button" onClick={() => setTodosMateriais(v => !v)} className="mt-2 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">
                    {todosMateriais ? 'Mostrar só os 15 primeiros' : `Mostrar todos (${n(resumo.materiais.length)})`}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {detalhe && <DetalheRelatorioRetiradasModal titulo={detalhe.titulo} registros={registrosDetalhe} onClose={() => setDetalhe(null)} />}
    </section>
  );
}

function Indicador({ rotulo: r, valor, extra, cor = 'text-slate-900 dark:text-slate-50', onAbrir }: {
  rotulo: string; valor: number; extra?: string; cor?: string; onAbrir?: () => void;
}) {
  const clicavel = !!onAbrir && valor > 0;
  return (
    <div className={`${cartao} p-3`}>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{r}</dt>
      <dd className={`mt-1 text-2xl font-bold ${cor}`}>
        {clicavel
          ? <button type="button" onClick={onAbrir} aria-label={`Ver ${valor} retirada(s): ${r}`} className={numeroLink}>{n(valor)}</button>
          : <span className="tabular-nums">{n(valor)}</span>}
      </dd>
      {extra && <dd className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" title={extra}>{extra}</dd>}
    </div>
  );
}

function TabelaGrupos({ titulo, grupos, total, onAbrir }: {
  titulo: string;
  grupos: GrupoRetiradas[];
  total: number;
  onAbrir: (g: GrupoRetiradas, situacao?: SituacaoRecorte) => void;
}) {
  const pct = (v: number) => `${(v / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  return (
    <>
      <TableCards>
        {grupos.map(g => (
          <TableCardRow key={g.chave} onClick={() => onAbrir(g)}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{g.rotulo}</p>
              <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{n(g.retiradas)} <span className="text-xs font-normal text-slate-500">· {pct(g.retiradas)}</span></p>
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {COLUNAS.filter(c => g[c.chave] > 0).map(c => <span key={c.chave} className={c.cor}>{c.rotulo} {n(g[c.chave])}</span>)}
            </p>
          </TableCardRow>
        ))}
      </TableCards>
      <TableDesktop>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Retiradas por {titulo.toLowerCase()}</caption>
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th scope="col" className="px-3 py-2">{titulo}</th>
                <th scope="col" className="px-3 py-2 text-right">Retiradas</th>
                {COLUNAS.map(c => <th key={c.chave} scope="col" className="px-3 py-2 text-right">{c.rotulo}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {grupos.map(g => (
                <tr key={g.chave} className="text-slate-700 dark:text-slate-200">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {g.rotulo}
                    <div aria-hidden="true" className="mt-1 h-1 max-w-48 rounded bg-slate-100 dark:bg-slate-800">
                      <div className="h-1 rounded bg-blue-500" style={{ width: pct(g.retiradas).replace(',', '.') }} />
                    </div>
                  </th>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => onAbrir(g)} aria-label={`Ver ${g.retiradas} retirada(s) de ${g.rotulo}`}
                      className={`${numeroLink} font-bold text-blue-700 dark:text-blue-300`}>{n(g.retiradas)}</button>
                    <span className="ml-1 text-slate-500">{pct(g.retiradas)}</span>
                  </td>
                  {COLUNAS.map(c => (
                    <td key={c.chave} className="px-3 py-2 text-right">
                      {g[c.chave] > 0
                        ? <button type="button" onClick={() => onAbrir(g, c.chave)} aria-label={`Ver ${g[c.chave]} ${c.rotulo.toLowerCase()} de ${g.rotulo}`}
                            className={`${numeroLink} font-semibold ${c.cor}`}>{n(g[c.chave])}</button>
                        : <span className="text-slate-500">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableDesktop>
    </>
  );
}
