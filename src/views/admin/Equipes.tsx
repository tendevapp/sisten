/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin > Equipes — volumetria, cronoanálise e indicadores por equipe, a
 * partir do que os formulários do SISTEN já registram (quem fez e quando).
 *
 * Filtros: equipe (setor), período (dia, semana, mês, período) e
 * colaborador. A comparação é com o HISTÓRICO — o período escolhido contra os
 * anteriores equivalentes da própria pessoa (ou da equipe), nunca com colegas.
 * Relatórios em PDF: da equipe (para o gestor) e individual (entregue ao
 * colaborador). Regras em `lib/equipes.ts`; dados pela função
 * `adm_equipes_eventos` (só administrador).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Clock, FileText, Loader2, RefreshCw, Users } from 'lucide-react';
import { localDb } from '../../db/localDb';
import PdfPreviewModal from '../../components/ui/PdfPreviewModal';
import { TableBody, TableHeadRow, TableShell, Td, Th, Tr } from '../../components/ui/DataTable';
import {
  INDICADORES, OPCOES_RECORTE, PROCESSOS, SETOR_ALMOXARIFADO, SETORES_COM_PROCESSOS, acoesPorJanela, dataBr, diaDoEvento,
  diasDoIntervalo, ehAcao, eventosDaEquipe, formatarIndicador, historicoIndicadores, intervaloRecorte, janelasHistorico,
  membrosDaEquipe, naJanela, porColaborador, porHora, processosDaEquipe, semHistorico, serieDiaria,
  type DadosEquipes, type DefIndicador, type HistoricoIndicador, type Recorte, type Tendencia,
} from '../../lib/equipes';
import { carregarDadosEquipes } from '../../lib/equipesApi';
import { gerarRelatorioColaboradorPdf, gerarRelatorioEquipePdf } from '../../lib/pdfExport/exportEquipesPdf';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const inputCls = 'rounded-lg border px-2.5 py-1.5 text-xs border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)]';

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
      <h2 className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>{titulo}</h2>
      {children}
    </section>
  );
}

const COR_TENDENCIA: Partial<Record<Tendencia, string>> = { melhorou: 'var(--status-good)', piorou: 'var(--status-critical)' };
const pctTxt = (v: number | null) => (v == null ? '' : ` · ${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`);

function Numero({ ind, hist }: { ind: DefIndicador; hist: HistoricoIndicador | undefined }) {
  return (
    <div title={ind.descricao} className="min-w-0">
      <p className="truncate text-[11px]" style={{ color: 'var(--ink-muted)' }}>{ind.rotulo}</p>
      <p className={`${ind.principal ? 'text-xl' : 'text-sm'} font-extrabold tabular-nums`} style={{ color: 'var(--ink-primary)' }}>
        {formatarIndicador(hist?.atual ?? null, ind.formato)}
      </p>
      {hist && (semHistorico(ind) ? (
        <p className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>foto de hoje</p>
      ) : (
        <p className="text-[10px] tabular-nums" style={{ color: COR_TENDENCIA[hist.tendencia] ?? 'var(--ink-muted)' }}>
          anterior {formatarIndicador(hist.anterior, ind.formato)}{pctTxt(hist.variacao)}
        </p>
      ))}
    </div>
  );
}

/** Barras horizontais simples: rótulo, barra proporcional ao maior valor, número. */
function Barras({ itens }: { itens: { rotulo: string; valor: number }[] }) {
  const max = Math.max(1, ...itens.map(i => i.valor));
  return (
    <div className="space-y-0.5">
      {itens.map(i => (
        <div key={i.rotulo} className="flex items-center gap-2 text-[11px] tabular-nums">
          <span className="w-20 shrink-0" style={{ color: 'var(--ink-muted)' }}>{i.rotulo}</span>
          <span className="h-2.5 rounded-sm" style={{ width: `${(i.valor / max) * 100}%`, minWidth: i.valor > 0 ? 2 : 0, background: 'var(--brand)' }} />
          <span className="font-semibold" style={{ color: 'var(--ink-secondary)' }}>{i.valor > 0 ? i.valor.toLocaleString('pt-BR') : ''}</span>
        </div>
      ))}
    </div>
  );
}

/** Colunas de um indicador nos períodos do histórico; a última (atual) em destaque. */
function MiniEvolucao({ hist, rotulos }: { hist: HistoricoIndicador; rotulos: string[] }) {
  const max = Math.max(1e-9, ...hist.valores.map(v => v ?? 0));
  const ultima = hist.valores.length - 1;
  return (
    <section className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }} title={hist.indicador.descricao}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{hist.indicador.rotulo}</h3>
        <span className="shrink-0 text-[10px] font-bold tabular-nums" style={{ color: COR_TENDENCIA[hist.tendencia] ?? 'var(--ink-muted)' }}>
          {hist.variacao != null ? `${hist.variacao > 0 ? '+' : ''}${(hist.variacao * 100).toFixed(0)}% vs. anterior` : ''}
        </span>
      </div>
      <div className="mt-2 flex h-24 items-end gap-1.5">
        {hist.valores.map((v, i) => (
          <div key={rotulos[i]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
            <span className="text-[9px] tabular-nums" style={{ color: 'var(--ink-secondary)', fontWeight: i === ultima ? 700 : 400 }}>
              {v != null && v > 0 ? formatarIndicador(v, hist.indicador.formato) : ''}
            </span>
            <span
              className="w-full rounded-t-sm"
              style={{ height: `${((v ?? 0) / max) * 70}%`, minHeight: (v ?? 0) > 0 ? 2 : 0, background: i === ultima ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 40%, transparent)' }}
            />
            <span className="text-[9px]" style={{ color: 'var(--ink-muted)', fontWeight: i === ultima ? 700 : 400 }}>{rotulos[i]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Teto de dias que a função aceita por consulta (o histórico inteiro precisa caber). */
const MAX_DIAS_CONSULTA = 400;

export default function Equipes({ user, onNavigate }: Props) {
  // Almoxarifado e Suprimentos (com indicadores de processo) no topo; as demais em ordem alfabética.
  const setores = useMemo(() => localDb.getSectors().slice().sort((a, b) =>
    (SETORES_COM_PROCESSOS.includes(a.id) ? 0 : 1) - (SETORES_COM_PROCESSOS.includes(b.id) ? 0 : 1)
    || a.name.localeCompare(b.name, 'pt-BR')), []);
  const [setor, setSetor] = useState(SETOR_ALMOXARIFADO);
  const [recorte, setRecorte] = useState<Recorte>('mes');
  const [periodo, setPeriodo] = useState({ de: '', ate: '' });
  const [pessoaId, setPessoaId] = useState<string>('');
  const [incluirDeFora, setIncluirDeFora] = useState(false);
  const [dados, setDados] = useState<DadosEquipes | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pdf, setPdf] = useState<'equipe' | 'colaborador' | null>(null);

  const intervalo = useMemo(() => intervaloRecorte(recorte, periodo), [recorte, periodo]);
  // Período escolhido + até 5 anteriores equivalentes (menos, se o período for longo).
  const janelas = useMemo(() => {
    const dur = diasDoIntervalo(intervalo.de, intervalo.ate).length;
    const n = Math.max(1, Math.min(6, Math.floor(MAX_DIAS_CONSULTA / Math.max(1, dur * (recorte.startsWith('mes') ? 1.1 : 1)))));
    return janelasHistorico(recorte, intervalo, n);
  }, [recorte, intervalo]);
  const atual = janelas[janelas.length - 1];
  const anterior = janelas.length > 1 ? janelas[janelas.length - 2] : null;
  const nomeEquipe = setores.find(s => s.id === setor)?.name ?? `Setor ${setor}`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await carregarDadosEquipes(janelas[0].de, intervalo.ate));
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível carregar os dados das equipes.');
    } finally {
      setCarregando(false);
    }
  }, [janelas, intervalo.ate]);
  useEffect(() => { void carregar(); }, [carregar]);

  const filtro = { setor, incluirDeFora };
  const membros = useMemo(() => (dados ? membrosDaEquipe(dados, filtro) : []), [dados, setor, incluirDeFora]); // eslint-disable-line react-hooks/exhaustive-deps
  const eventosEquipe = useMemo(() => (dados ? eventosDaEquipe(dados, filtro) : []), [dados, setor, incluirDeFora]); // eslint-disable-line react-hooks/exhaustive-deps
  const pessoaValida = membros.some(m => m.id === pessoaId) ? pessoaId : '';
  // Base da análise: a pessoa escolhida ou a equipe inteira, em todo o histórico.
  const eventosBase = useMemo(() => (pessoaValida ? eventosEquipe.filter(e => e.u === pessoaValida) : eventosEquipe), [eventosEquipe, pessoaValida]);
  const eventosVistos = useMemo(() => eventosBase.filter(e => naJanela(e, atual)), [eventosBase, atual]);
  const historicos = useMemo(() => new Map(historicoIndicadores(eventosBase, janelas, INDICADORES).map(h => [h.indicador.id, h])), [eventosBase, janelas]);
  const acoesHistorico = useMemo(() => acoesPorJanela(eventosBase, janelas), [eventosBase, janelas]);
  const eventosEquipeAtual = useMemo(() => eventosEquipe.filter(e => naJanela(e, atual)), [eventosEquipe, atual]);
  const linhas = useMemo(() => porColaborador(eventosEquipeAtual, membros, INDICADORES), [eventosEquipeAtual, membros]);
  const linhaPessoa = linhas.find(l => l.pessoa.id === pessoaValida) ?? null;
  const tendencias = [...historicos.values()].filter(h => processosDaEquipe(setor).some(p => p.id === h.indicador.processo && p.id !== 'uso'));
  // Mini gráficos: indicadores principais com histórico e algum valor nos períodos.
  const evolucao = tendencias.filter(h => h.indicador.principal && !semHistorico(h.indicador) && h.valores.some(v => (v ?? 0) > 0));
  const melhorou = tendencias.filter(h => h.tendencia === 'melhorou');
  const piorou = tendencias.filter(h => h.tendencia === 'piorou');

  const processos = processosDaEquipe(setor).filter(p => eventosVistos.some(e => p.tipos.includes(e.t)));
  const acoes = eventosVistos.filter(ehAcao);
  const dias = diasDoIntervalo(atual.de, atual.ate);
  const diasComAcao = new Set(acoes.map(diaDoEvento)).size;
  const serie = serieDiaria(eventosVistos, atual.de, atual.ate);
  const horas = porHora(eventosVistos);
  const principais = INDICADORES.filter(i => i.principal && processosDaEquipe(setor).some(p => p.id === i.processo) && linhas.some(l => (l.valores[i.id] ?? 0) > 0));

  // Estável: a pré-visualização refaz o PDF quando o gerador muda.
  const gerarPdf = useCallback(() => {
    const contexto = { equipe: nomeEquipe, setor, janelas, membros, eventos: eventosEquipe, geradoPor: user.name };
    return pdf === 'colaborador' ? gerarRelatorioColaboradorPdf(contexto, pessoaValida) : gerarRelatorioEquipePdf(contexto);
  }, [pdf, nomeEquipe, setor, janelas, membros, eventosEquipe, user.name, pessoaValida]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => onNavigate('/admin')} className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold hover:underline" style={{ color: 'var(--ink-secondary)' }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Administração
          </button>
          <h1 className="flex items-center gap-2 text-lg font-extrabold" style={{ color: 'var(--ink-primary)' }}>
            <Users className="h-5 w-5" /> Equipes
          </h1>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            Volume, tempos e indicadores de cada equipe, comparados com os períodos anteriores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button type="button" onClick={() => setPdf('equipe')} disabled={!dados || membros.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
            <FileText className="h-3.5 w-3.5" /> PDF da equipe
          </button>
          <button type="button" onClick={() => setPdf('colaborador')} disabled={!linhaPessoa} title={linhaPessoa ? '' : 'Escolha um colaborador'} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            <FileText className="h-3.5 w-3.5" /> PDF de feedback
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <label className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Equipe
          <select value={setor} onChange={e => { setSetor(e.target.value); setPessoaId(''); }} className={`${inputCls} mt-0.5 block`}>
            {setores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Período
          <select value={recorte} onChange={e => setRecorte(e.target.value as Recorte)} className={`${inputCls} mt-0.5 block`}>
            {OPCOES_RECORTE.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </label>
        {recorte === 'periodo' && (
          <>
            <label className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>De
              <input type="date" value={periodo.de} onChange={e => setPeriodo(p => ({ ...p, de: e.target.value }))} className={`${inputCls} mt-0.5 block`} />
            </label>
            <label className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Até
              <input type="date" value={periodo.ate} onChange={e => setPeriodo(p => ({ ...p, ate: e.target.value }))} className={`${inputCls} mt-0.5 block`} />
            </label>
          </>
        )}
        <label className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Colaborador
          <select value={pessoaValida} onChange={e => setPessoaId(e.target.value)} className={`${inputCls} mt-0.5 block`}>
            <option value="">Toda a equipe ({membros.length})</option>
            {membros.map(m => <option key={m.id} value={m.id}>{m.nome}{m.setor !== setor ? ' (de fora)' : ''}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={incluirDeFora} onChange={e => setIncluirDeFora(e.target.checked)} className="accent-[var(--brand)]" />
          Incluir quem atuou nos processos sem ser da equipe
        </label>
        <span className="ml-auto pb-1.5 text-[11px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
          {intervalo.de === intervalo.ate ? dataBr(intervalo.de) : `${dataBr(intervalo.de)} a ${dataBr(intervalo.ate)}`}
          {anterior && ` · anterior ${anterior.de === anterior.ate ? dataBr(anterior.de) : `${dataBr(anterior.de)} a ${dataBr(anterior.ate)}`}`}
        </span>
      </div>

      {erro && (
        <p className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}>
          <AlertTriangle className="h-4 w-4" /> {erro}
        </p>
      )}

      {carregando && !dados ? (
        <p className="flex items-center justify-center gap-2 py-12 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      ) : dados && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { rotulo: 'Ações no período', valor: `${acoes.length.toLocaleString('pt-BR')}${anterior ? ` (ant. ${acoesHistorico[acoesHistorico.length - 2].toLocaleString('pt-BR')})` : ''}` },
              { rotulo: pessoaValida ? 'Colaborador' : 'Colaboradores', valor: pessoaValida ? (linhaPessoa?.pessoa.nome ?? '—') : String(membros.length) },
              { rotulo: 'Dias com atividade', valor: `${diasComAcao} de ${dias.length}` },
              { rotulo: 'Média por dia com atividade', valor: diasComAcao ? (acoes.length / diasComAcao).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—' },
            ].map(k => (
              <div key={k.rotulo} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                <p className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{k.rotulo}</p>
                <p className="truncate text-lg font-extrabold tabular-nums" style={{ color: 'var(--ink-primary)' }}>{k.valor}</p>
              </div>
            ))}
          </div>

          {processos.length === 0 && (
            <p className="rounded-xl border border-dashed py-10 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
              Nenhum registro desta equipe no período.
              {!SETORES_COM_PROCESSOS.includes(setor) && ' Por enquanto só Almoxarifado e Suprimentos têm indicadores de processo; as demais equipes mostram o uso do SISTEN.'}
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {processos.map(p => (
              <Cartao key={p.id} titulo={p.rotulo}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {INDICADORES.filter(i => i.processo === p.id).map(i => (
                    <Numero key={i.id} ind={i} hist={historicos.get(i.id)} />
                  ))}
                </div>
              </Cartao>
            ))}
          </div>

          <Cartao titulo={`Evolução${linhaPessoa ? ` — ${linhaPessoa.pessoa.nome}` : ''} (${janelas.length} períodos)`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Barras itens={janelas.map((j, i) => ({ rotulo: j.rotulo, valor: acoesHistorico[i] }))} />
              <div className="space-y-2 text-xs">
                <div>
                  <p className="mb-0.5 font-bold" style={{ color: 'var(--status-good)' }}>Melhorou vs. período anterior (≥ 10%)</p>
                  {melhorou.length === 0 ? <p style={{ color: 'var(--ink-muted)' }}>Nenhum indicador.</p>
                    : melhorou.map(h => <p key={h.indicador.id}>{h.indicador.rotulo}: <b>{formatarIndicador(h.atual, h.indicador.formato)}</b> (antes {formatarIndicador(h.anterior, h.indicador.formato)})</p>)}
                </div>
                <div>
                  <p className="mb-0.5 font-bold" style={{ color: 'var(--status-critical)' }}>Piorou vs. período anterior (≥ 10%)</p>
                  {piorou.length === 0 ? <p style={{ color: 'var(--ink-muted)' }}>Nenhum indicador.</p>
                    : piorou.map(h => <p key={h.indicador.id}>{h.indicador.rotulo}: <b>{formatarIndicador(h.atual, h.indicador.formato)}</b> (antes {formatarIndicador(h.anterior, h.indicador.formato)})</p>)}
                </div>
              </div>
            </div>
          </Cartao>

          {evolucao.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {evolucao.map(h => <MiniEvolucao key={h.indicador.id} hist={h} rotulos={janelas.map(j => j.rotulo)} />)}
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <Cartao titulo={dias.length <= 31 ? 'Volume por dia' : 'Volume por semana'}>
              <Barras itens={dias.length <= 31
                ? serie.map(s => ({ rotulo: dataBr(s.dia).slice(0, 5), valor: s.acoes }))
                : Array.from({ length: Math.ceil(serie.length / 7) }, (_, i) => {
                  const bloco = serie.slice(i * 7, i * 7 + 7);
                  return { rotulo: dataBr(bloco[0].dia).slice(0, 5), valor: bloco.reduce((s, b) => s + b.acoes, 0) };
                })} />
            </Cartao>
            <Cartao titulo="Cronoanálise — ações por hora do dia">
              <Barras itens={horas.map((v, h) => ({ rotulo: `${String(h).padStart(2, '0')}h`, valor: v })).filter((x, h) => x.valor > 0 || (h >= 6 && h <= 18))} />
              <p className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                <Clock className="h-3 w-3" /> Ritmo e tempos de ciclo estão nos cartões de cada processo.
              </p>
            </Cartao>
          </div>

          {!pessoaValida && linhas.length > 0 && (
            <Cartao titulo={`Por colaborador (${linhas.length})`}>
              <TableShell maxHeight="60vh">
                <table className="w-full text-xs">
                  <TableHeadRow>
                    <Th label="Colaborador" />
                    <Th label="Ações" align="right" />
                    <Th label="Ações ant." align="right" />
                    {principais.map(i => <Th key={i.id} label={i.rotulo} align="right" />)}
                    <Th label="" />
                  </TableHeadRow>
                  <TableBody>
                    {linhas.map(l => (
                      <Tr key={l.pessoa.id} onClick={() => setPessoaId(l.pessoa.id)}>
                        <Td strong>{l.pessoa.nome}{l.pessoa.setor !== setor ? ' (de fora)' : ''}</Td>
                        <Td align="right" numeric>{l.acoes.toLocaleString('pt-BR')}</Td>
                        <Td align="right" numeric>{anterior ? eventosEquipe.filter(e => e.u === l.pessoa.id && ehAcao(e) && naJanela(e, anterior)).length.toLocaleString('pt-BR') : '—'}</Td>
                        {principais.map(i => <Td key={i.id} align="right" numeric>{formatarIndicador(l.valores[i.id], i.formato)}</Td>)}
                        <Td>
                          <button type="button" onClick={e => { e.stopPropagation(); setPessoaId(l.pessoa.id); }} className="text-[11px] font-bold underline" style={{ color: 'var(--brand)' }}>
                            ver
                          </button>
                        </Td>
                      </Tr>
                    ))}
                  </TableBody>
                </table>
              </TableShell>
            </Cartao>
          )}

          <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            Volume e tempo são fatos para conversar, não nota. Cada número é comparado com o período anterior equivalente (no período em
            curso, as mesmas datas): melhorou ou piorou = 10% ou mais; em tempos, menor é melhor. Ritmo = tempo mediano entre duas ações
            seguidas da mesma pessoa no dia (abaixo de 5 s é lote; acima de 30 min, pausa). Processos: {PROCESSOS.filter(p => p.setores !== '*').map(p => p.rotulo).join(', ')}; uso do SISTEN em todas as equipes (só na tela).
          </p>
        </>
      )}

      {pdf && (
        <PdfPreviewModal
          gerar={gerarPdf}
          tituloPadrao={pdf === 'equipe' ? `Relatório da equipe ${nomeEquipe}` : 'Feedback individual'}
          onClose={() => setPdf(null)}
        />
      )}
    </div>
  );
}
