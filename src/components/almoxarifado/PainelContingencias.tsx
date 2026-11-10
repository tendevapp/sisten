/**
 * Geral › Pendências › Contingências — elos quebrados entre o que saiu do
 * almoxarifado e o que chega ao SAP (ver lib/contingenciasAlmox.ts).
 *
 * Cada achado pode ser corrigido (quando o banco sabe fazer sozinho), aberto na
 * Requisição no Balcão ou justificado. A justificativa tira o achado da lista
 * mas fica registrada, com nome e hora, e pode ser reaberta.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertOctagon, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, History, Loader2, RefreshCw, RotateCcw, Search,
  ShieldCheck, Wrench,
} from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { formatDateTimeBR } from '../../lib/format';
import { formatarDataBR } from '../../lib/fichaEpi';
import { CHAVE_ABRIR_REQUISICAO_BALCAO } from '../../lib/fichaEpiRequisicao';
import {
  JUSTIFICATIVA_MINIMA, ROTULO_CORRECAO, ROTULO_SEVERIDADE, agruparContingencias, contarSeveridades, filtrarContingencias,
  infoVerificacao, requisicaoParaAbrir, textoValorLog,
  type Contingencia, type GrupoContingencia, type SeveridadeContingencia,
} from '../../lib/contingenciasAlmox';
import {
  corrigirContingencia, historicoContingencia, justificarContingencias, listarTratativas, reabrirContingencia, verificarContingencias,
  type EventoHistorico, type TratativaRegistrada,
} from '../../lib/contingenciasAlmoxApi';

interface Props {
  onNavigate: (path: string) => void;
  /** Avisa a página quantas críticas+altas há em aberto (selo da aba). */
  onTotal?: (n: number) => void;
}

const ESTILO_SEVERIDADE: Record<SeveridadeContingencia, string> = {
  critica: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  alta: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  media: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const ITENS_VISIVEIS = 6;
const chave = (c: Pick<Contingencia, 'verificacao' | 'referencia'>) => `${c.verificacao}|${c.referencia}`;

function ChipSeveridade({ severidade }: { severidade: SeveridadeContingencia }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ESTILO_SEVERIDADE[severidade]}`}>
      {ROTULO_SEVERIDADE[severidade]}
    </span>
  );
}

export default function PainelContingencias({ onNavigate, onTotal }: Props) {
  const toast = useToast();
  const [lista, setLista] = useState<Contingencia[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [verJustificadas, setVerJustificadas] = useState(false);
  const [busca, setBusca] = useState('');
  const [severidade, setSeveridade] = useState<SeveridadeContingencia | 'todas'>('todas');
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [justificando, setJustificando] = useState<{ verificacao: string; itens: Contingencia[] } | null>(null);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [aba, setAba] = useState<'abertas' | 'tratativas'>('abertas');
  const idBusca = useId();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await verificarContingencias(verJustificadas);
      setLista(r);
      setSelecao(new Set());
      onTotal?.(r.filter(c => !c.tratativa && c.severidade !== 'media').length);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [verJustificadas, onTotal]);

  useEffect(() => { void carregar(); }, [carregar]);

  const abertas = useMemo(() => lista.filter(c => !c.tratativa), [lista]);
  const contagem = useMemo(() => contarSeveridades(abertas), [abertas]);
  const visiveis = useMemo(() => filtrarContingencias(lista, busca, severidade), [lista, busca, severidade]);
  const grupos = useMemo(() => agruparContingencias(visiveis), [visiveis]);

  const alternar = (c: Contingencia) => setSelecao(s => {
    const n = new Set(s);
    if (n.has(chave(c))) n.delete(chave(c)); else n.add(chave(c));
    return n;
  });

  const corrigir = async (c: Contingencia) => {
    if (!c.acao) return;
    setCorrigindo(chave(c));
    try {
      const resumo = await corrigirContingencia(c.verificacao, c.referencia);
      toast.success(resumo || 'Corrigido.');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCorrigindo(null);
    }
  };

  const abrirRequisicao = (codigo: string) => {
    try { sessionStorage.setItem(CHAVE_ABRIR_REQUISICAO_BALCAO, codigo); } catch { /* sem storage: abre a lista */ }
    onNavigate('/formularios/almoxarifado-requisicao-balcao');
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Contingências do estoque</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saídas que saíram do almoxarifado e podem não chegar ao SAP — viram diferença no inventário se ninguém tratar.
                A verificação roda a cada abertura e um aviso diário sai junto com a importação da ZL0024.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Verificar agora
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por severidade">
          {(['todas', 'critica', 'alta', 'media'] as const).map(s => {
            const n = s === 'todas' ? contagem.total : contagem[s];
            const ativo = severidade === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={ativo}
                onClick={() => setSeveridade(s)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
                  ativo ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {s === 'todas' ? 'Todas' : ROTULO_SEVERIDADE[s]}
                <span className={`rounded-full px-1.5 text-[10px] ${s === 'todas' ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' : ESTILO_SEVERIDADE[s]}`}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <label htmlFor={idBusca} className="sr-only">Buscar código ou arquivo</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id={idBusca}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Código (RQB, RSS, EPI, SEM) ou arquivo exportado"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
            {(['abertas', 'tratativas'] as const).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => setAba(a)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${aba === a ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {a === 'abertas' ? 'Achados' : 'Justificativas'}
              </button>
            ))}
          </div>
          {aba === 'abertas' && (
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={verJustificadas} onChange={e => setVerJustificadas(e.target.checked)} className="h-3.5 w-3.5 rounded" />
              Mostrar justificadas
            </label>
          )}
        </div>
      </section>

      {erro && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {erro}
        </p>
      )}

      {aba === 'tratativas' ? (
        <ListaTratativas busca={busca} onReaberta={carregar} />
      ) : (
        <>
          {!carregando && !erro && grupos.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {lista.length ? 'Nada com esse filtro' : 'Nenhuma contingência em aberto'}
              </p>
              <p className="text-xs text-slate-500">Toda saída registrada tem requisição e documento SAP dentro do prazo.</p>
            </div>
          )}
          {carregando && lista.length === 0 && (
            <p className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Verificando…</p>
          )}
          {grupos.map(g => (
            <GrupoCard
              key={g.verificacao}
              grupo={g}
              selecao={selecao}
              corrigindo={corrigindo}
              onAlternar={alternar}
              onSelecionarTodos={(marcar) => setSelecao(s => {
                const n = new Set(s);
                for (const c of g.itens) if (!c.tratativa) { if (marcar) n.add(chave(c)); else n.delete(chave(c)); }
                return n;
              })}
              onCorrigir={c => void corrigir(c)}
              onAbrirRequisicao={abrirRequisicao}
              onJustificar={itens => setJustificando({ verificacao: g.verificacao, itens })}
            />
          ))}
        </>
      )}

      {justificando && (
        <JustificarModal
          verificacao={justificando.verificacao}
          itens={justificando.itens}
          onClose={() => setJustificando(null)}
          onFeito={() => { setJustificando(null); void carregar(); }}
        />
      )}
    </div>
  );
}

function GrupoCard({
  grupo: g, selecao, corrigindo, onAlternar, onSelecionarTodos, onCorrigir, onAbrirRequisicao, onJustificar,
}: {
  grupo: GrupoContingencia;
  selecao: Set<string>;
  corrigindo: string | null;
  onAlternar: (c: Contingencia) => void;
  onSelecionarTodos: (marcar: boolean) => void;
  onCorrigir: (c: Contingencia) => void;
  onAbrirRequisicao: (codigo: string) => void;
  onJustificar: (itens: Contingencia[]) => void;
}) {
  const [aberto, setAberto] = useState(g.severidade !== 'media');
  const [todos, setTodos] = useState(false);
  const selecionados = g.itens.filter(c => selecao.has(chave(c)));
  const justificaveis = g.itens.filter(c => !c.tratativa);
  const mostrar = todos ? g.itens : g.itens.slice(0, ITENS_VISIVEIS);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="flex w-full items-start gap-2.5 p-4 text-left sm:px-5"
      >
        {aberto ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">{g.info.rotulo}</h3>
            <ChipSeveridade severidade={g.severidade} />
            <span className="rounded-full bg-slate-800 px-1.5 text-[11px] font-bold text-white dark:bg-slate-200 dark:text-slate-900">{g.itens.length}</span>
          </div>
          {aberto && g.info.comoTratar && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{g.info.comoTratar}</p>}
        </div>
      </button>

      {aberto && (
        <div className="space-y-2 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800 sm:px-5">
          {justificaveis.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={selecionados.length === justificaveis.length}
                  onChange={e => onSelecionarTodos(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                Selecionar todos ({justificaveis.length})
              </label>
              {selecionados.length > 0 && (
                <button
                  type="button"
                  onClick={() => onJustificar(selecionados)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Justificar {selecionados.length} selecionado(s)
                </button>
              )}
            </div>
          )}
          <ul className="grid gap-2 lg:grid-cols-2">
            {mostrar.map(c => (
              <ItemContingencia
                key={chave(c)}
                item={c}
                selecionavel={justificaveis.length > 1}
                selecionado={selecao.has(chave(c))}
                corrigindo={corrigindo === chave(c)}
                onAlternar={() => onAlternar(c)}
                onCorrigir={() => onCorrigir(c)}
                onAbrirRequisicao={onAbrirRequisicao}
                onJustificar={() => onJustificar([c])}
              />
            ))}
          </ul>
          {g.itens.length > ITENS_VISIVEIS && (
            <button type="button" onClick={() => setTodos(t => !t)} className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-400">
              {todos ? 'Mostrar menos' : `Ver todos (${g.itens.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ItemContingencia({
  item: c, selecionavel, selecionado, corrigindo, onAlternar, onCorrigir, onAbrirRequisicao, onJustificar,
}: {
  item: Contingencia;
  selecionavel: boolean;
  selecionado: boolean;
  corrigindo: boolean;
  onAlternar: () => void;
  onCorrigir: () => void;
  onAbrirRequisicao: (codigo: string) => void;
  onJustificar: () => void;
}) {
  const [verHistorico, setVerHistorico] = useState(false);
  const requisicao = requisicaoParaAbrir(c);
  const botao = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

  return (
    <li className={`flex flex-col gap-2 rounded-xl border p-3 ${c.tratativa ? 'border-dashed border-slate-300 opacity-80 dark:border-slate-700' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex items-start gap-2">
        {selecionavel && !c.tratativa && (
          <input
            type="checkbox"
            checked={selecionado}
            onChange={onAlternar}
            aria-label={`Selecionar ${c.referencia}`}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{c.referencia}</span>
            <span className="flex items-center gap-1.5">
              {c.data && <span className="text-[11px] text-slate-500">{formatarDataBR(c.data)}{c.dias != null && c.dias > 0 ? ` · há ${c.dias} d` : ''}</span>}
              <ChipSeveridade severidade={c.severidade} />
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-200">{c.detalhe}</p>
          {c.tratativa && (
            <p className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Justificada por {c.tratativa.por ?? '—'} em {formatDateTimeBR(c.tratativa.em)}: {c.tratativa.justificativa}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        <button type="button" onClick={() => setVerHistorico(v => !v)} aria-expanded={verHistorico} className={botao}>
          <History className="h-3.5 w-3.5" /> Histórico
        </button>
        {requisicao && (
          <button type="button" onClick={() => onAbrirRequisicao(requisicao)} className={botao}>
            <ExternalLink className="h-3.5 w-3.5" /> Abrir {requisicao}
          </button>
        )}
        {!c.tratativa && (
          <button type="button" onClick={onJustificar} className={botao}>
            <ShieldCheck className="h-3.5 w-3.5" /> Justificar
          </button>
        )}
        {!c.tratativa && c.acao && (
          <button
            type="button"
            onClick={onCorrigir}
            disabled={corrigindo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {corrigindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
            {ROTULO_CORRECAO[c.acao]}{c.acao === 'restaurar_rqb' && c.acao_ref ? ` ${c.acao_ref}` : ''}
          </button>
        )}
      </div>
      {verHistorico && <HistoricoCodigo codigo={c.referencia} />}
    </li>
  );
}

function HistoricoCodigo({ codigo }: { codigo: string }) {
  const [eventos, setEventos] = useState<EventoHistorico[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    historicoContingencia(codigo)
      .then(e => { if (vivo) setEventos(e); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [codigo]);

  if (erro) return <p className="text-[11px] text-rose-700 dark:text-rose-300">{erro}</p>;
  if (!eventos) return <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Carregando histórico…</p>;
  if (!eventos.length) return <p className="text-[11px] text-slate-500">Sem registros no log.</p>;
  return (
    <ol className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg bg-slate-50 p-2 dark:bg-slate-950">
      {eventos.map((e, i) => (
        <li key={i} className="text-[11px] leading-snug text-slate-700 dark:text-slate-300">
          <span className="font-semibold">{formatDateTimeBR(e.em)}</span>
          {' · '}<span className="font-mono">{e.codigo}</span>
          {' · '}{e.fonte} — <span className="font-semibold">{e.acao}</span>
          {e.por && <> · {e.por}</>}
          {e.resumo && <span className="block text-slate-600 dark:text-slate-400">{e.resumo}</span>}
          {Array.isArray(e.alteracoes) && e.alteracoes.length > 0 && (
            <span className="block text-slate-500">
              {(e.alteracoes as { campo?: string; de?: unknown; para?: unknown }[])
                .filter(a => a && a.campo)
                .map(a => `${a.campo}: ${textoValorLog(a.de)} → ${textoValorLog(a.para)}`).join(' · ')}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function JustificarModal({
  verificacao, itens, onClose, onFeito,
}: {
  verificacao: string;
  itens: Contingencia[];
  onClose: () => void;
  onFeito: () => void;
}) {
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const idTexto = useId();
  const valido = texto.trim().length >= JUSTIFICATIVA_MINIMA;

  const salvar = async () => {
    if (!valido) return;
    setSalvando(true);
    try {
      const n = await justificarContingencias(verificacao, itens.map(i => i.referencia), texto.trim());
      if (n < itens.length) toast.warning(`${n} de ${itens.length} justificada(s) — as demais já tinham saído da lista.`);
      else toast.success(`${n} contingência(s) justificada(s).`);
      onFeito();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Justificar contingência" disableOutsideClose={salvando}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Justificar — {infoVerificacao(verificacao).rotulo}</h3>
        <p className="truncate text-xs text-slate-500">{itens.map(i => i.referencia).join(', ')}</p>
      </ModalHeader>
      <ModalBody className="space-y-2">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          A justificativa tira {itens.length > 1 ? 'os achados' : 'o achado'} da lista e fica registrada com o seu nome e a hora.
          Diga o que foi conferido e onde — ex.: "Lançado no SAP, doc. 4904…", "Ficha duplicada, baixa na RQB-…".
        </p>
        <label htmlFor={idTexto} className="block text-xs font-bold text-slate-700 dark:text-slate-300">
          Justificativa <span className="text-rose-600">*</span>
        </label>
        <textarea
          id={idTexto}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={4}
          autoFocus
          aria-invalid={texto.length > 0 && !valido}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <p className="text-[11px] text-slate-500">{texto.trim().length}/{JUSTIFICATIVA_MINIMA} caracteres no mínimo.</p>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={salvando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || !valido}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Justificar
        </button>
      </ModalFooter>
    </Modal>
  );
}

function ListaTratativas({ busca, onReaberta }: { busca: string; onReaberta: () => void }) {
  const toast = useToast();
  const [lista, setLista] = useState<TratativaRegistrada[] | null>(null);
  const [erro, setErro] = useState('');
  const [reabrindo, setReabrindo] = useState<TratativaRegistrada | null>(null);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const idMotivo = useId();

  const carregar = useCallback(() => {
    setErro('');
    listarTratativas().then(setLista).catch(e => setErro(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const termo = busca.trim().toUpperCase();
  const visiveis = (lista ?? []).filter(t => !termo || t.referencia.toUpperCase().includes(termo) || t.justificativa.toUpperCase().includes(termo));

  const reabrir = async () => {
    if (!reabrindo) return;
    setSalvando(true);
    try {
      await reabrirContingencia(reabrindo.id, motivo.trim());
      toast.success(`${reabrindo.referencia} voltou para a lista.`);
      setReabrindo(null);
      setMotivo('');
      carregar();
      onReaberta();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  if (erro) return <p className="text-xs text-rose-700 dark:text-rose-300">{erro}</p>;
  if (!lista) return <p className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>;
  if (!visiveis.length) return <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-xs text-slate-500 dark:border-slate-700">Nenhuma justificativa registrada.</p>;

  return (
    <>
      <ul className="grid gap-2 lg:grid-cols-2">
        {visiveis.map(t => (
          <li key={t.id} className={`space-y-1 rounded-xl border bg-white p-3 dark:bg-slate-900 ${t.revogada_em ? 'border-dashed border-slate-300 dark:border-slate-700' : 'border-slate-200 dark:border-slate-800'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{t.referencia}</span>
              <span className="text-[11px] text-slate-500">{infoVerificacao(t.verificacao).rotulo}</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200">{t.justificativa}</p>
            <p className="text-[11px] text-slate-500">{t.tratado_por_nome ?? '—'} · {formatDateTimeBR(t.created_at)}</p>
            {t.revogada_em ? (
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Reaberta por {t.revogada_por_nome ?? '—'} em {formatDateTimeBR(t.revogada_em)}{t.revogacao_motivo ? `: ${t.revogacao_motivo}` : ''}
              </p>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setReabrindo(t); setMotivo(''); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-amber-400 hover:text-amber-800 dark:border-slate-700 dark:text-slate-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {reabrindo && (
        <Modal onClose={() => setReabrindo(null)} maxWidth="max-w-md" ariaLabel="Reabrir contingência" disableOutsideClose={salvando}>
          <ModalHeader onClose={() => setReabrindo(null)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Reabrir {reabrindo.referencia}</h3>
          </ModalHeader>
          <ModalBody className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">A justificativa fica no histórico como revogada e o achado volta para a lista, se ainda existir.</p>
            <label htmlFor={idMotivo} className="block text-xs font-bold text-slate-700 dark:text-slate-300">Motivo (opcional)</label>
            <textarea
              id={idMotivo}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={() => setReabrindo(null)} disabled={salvando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancelar
            </button>
            <button type="button" onClick={() => void reabrir()} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reabrir
            </button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
