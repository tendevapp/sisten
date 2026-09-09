/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Área de trabalho do módulo Demandas: seletor de quadro + Grade / Quadro /
 * Calendário sobre as mesmas tarefas. Sem hub — esta é a tela do menu.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, KanbanSquare, LayoutGrid, Plus, Search, Settings2, SlidersHorizontal,
} from 'lucide-react';
import type { DemBucket, DemQuadro, DemTarefa, Profile } from '../../types';
import { localDb } from '../../db/localDb';
import {
  filtrarQuadrosVisiveis, podeGerenciarQuadro, setoresParaNovoQuadro,
} from '../../lib/demandasAcesso';
import {
  listarQuadros, listarBuckets, listarTarefas, assinarAnexosDeTarefas,
  atualizarTarefa, moverTarefa, criarBucket, atualizarBucket, reordenarBuckets, excluirBucket,
} from '../../lib/demandasApi';
import { useUsuarios } from '../../components/demandas-modulo/shared';
import ViewQuadro from '../../components/demandas-modulo/ViewQuadro';
import ViewGrade from '../../components/demandas-modulo/ViewGrade';
import ViewCalendario from '../../components/demandas-modulo/ViewCalendario';
import PainelBuckets from '../../components/demandas-modulo/PainelBuckets';
import NovoQuadroModal from '../../components/demandas-modulo/NovoQuadroModal';
import QuadroConfigModal from '../../components/demandas-modulo/QuadroConfigModal';
import NovaTarefaModal from '../../components/demandas-modulo/NovaTarefaModal';
import TarefaModal from '../../components/demandas-modulo/TarefaModal';

type Aba = 'quadro' | 'grade' | 'calendario';
const ABAS: { id: Aba; label: string; icon: typeof KanbanSquare }[] = [
  { id: 'quadro', label: 'Quadro', icon: KanbanSquare },
  { id: 'grade', label: 'Grade', icon: LayoutGrid },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
];

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

function lerHash(): { aba: Aba; quadro?: string } {
  const q = new URLSearchParams((window.location.hash.split('?')[1] || ''));
  const aba = q.get('tab');
  return {
    aba: aba === 'grade' || aba === 'calendario' ? aba : 'quadro',
    quadro: q.get('quadro') || undefined,
  };
}

export default function DemandasWorkspace({ user }: Props) {
  const sectors = useMemo(() => localDb.getSectors(), []);
  const { porId } = useUsuarios();

  const [quadros, setQuadros] = useState<DemQuadro[]>([]);
  const [quadroId, setQuadroId] = useState<string | undefined>(lerHash().quadro);
  const [aba, setAba] = useState<Aba>(lerHash().aba);
  const [buckets, setBuckets] = useState<DemBucket[]>([]);
  const [tarefas, setTarefas] = useState<DemTarefa[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);

  const [novoQuadro, setNovoQuadro] = useState(false);
  const [configQuadro, setConfigQuadro] = useState(false);
  const [painelBuckets, setPainelBuckets] = useState(false);
  const [novaTarefa, setNovaTarefa] = useState<{ bucketId: string | null; venc?: string } | null>(null);
  const [tarefaSel, setTarefaSel] = useState<DemTarefa | null>(null);

  const quadro = quadros.find(q => q.id === quadroId);
  const podeGerir = quadro ? podeGerenciarQuadro(user, quadro, sectors) : false;

  const tarefasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return tarefas;
    return tarefas.filter(t =>
      t.titulo.toLowerCase().includes(q) ||
      (t.descricao || '').toLowerCase().includes(q) ||
      (t.codigo || '').toLowerCase().includes(q) ||
      t.responsaveis.some(id => (porId.get(id)?.name || '').toLowerCase().includes(q))
    );
  }, [tarefas, busca, porId]);

  const sincronizarHash = useCallback((novaAba: Aba, novoQuadroId?: string) => {
    const qs = new URLSearchParams();
    qs.set('tab', novaAba);
    if (novoQuadroId) qs.set('quadro', novoQuadroId);
    window.history.replaceState(null, '', `#/demandas?${qs.toString()}`);
  }, []);

  const carregarQuadros = useCallback(async () => {
    const todos = await listarQuadros();
    const visiveis = filtrarQuadrosVisiveis(user, todos, sectors);
    setQuadros(visiveis);
    setQuadroId(prev => (prev && visiveis.some(q => q.id === prev) ? prev : visiveis[0]?.id));
  }, [user, sectors]);

  useEffect(() => { carregarQuadros(); }, [carregarQuadros]);

  const carregarConteudo = useCallback(async (id: string) => {
    setCarregando(true);
    try {
      const [bs, ts] = await Promise.all([listarBuckets(id), listarTarefas(id)]);
      setBuckets(bs);
      setTarefas(await assinarAnexosDeTarefas(ts));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (quadroId) { carregarConteudo(quadroId); sincronizarHash(aba, quadroId); }
    else setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadroId]);

  const trocarAba = (nova: Aba) => { setAba(nova); sincronizarHash(nova, quadroId); };

  /* Mutações de tarefa ------------------------------------------------- */
  const upsertTarefa = (t: DemTarefa) => setTarefas(prev => prev.map(x => x.id === t.id ? t : x));

  const handleInline = async (t: DemTarefa, patch: Partial<Pick<DemTarefa, 'status' | 'prioridade' | 'bucket_id'>>) => {
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, ...patch } : x));
    try { upsertTarefa(await atualizarTarefa(t, patch, user)); }
    catch { if (quadroId) carregarConteudo(quadroId); }
  };

  const handleMover = async (t: DemTarefa, bucketId: string | null, ordem: number) => {
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, bucket_id: bucketId, ordem } : x));
    try { await moverTarefa(t, bucketId, ordem, user); }
    catch { if (quadroId) carregarConteudo(quadroId); }
  };

  /* Buckets ---------------------------------------------------------------- */
  const recarregarBuckets = async () => { if (quadroId) setBuckets(await listarBuckets(quadroId)); };
  const criarBucketLocal = async (nome: string) => {
    if (!quadroId) return;
    await criarBucket(quadroId, nome);
    recarregarBuckets();
  };
  const atualizarBucketLocal = async (id: string, patch: { nome?: string; cor?: string | null }) => {
    await atualizarBucket(id, patch);
    recarregarBuckets();
  };

  if (!carregando && quadros.length === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <Cabecalho />
        <div className="mt-8 rounded-2xl border border-dashed px-6 py-16 text-center" style={{ borderColor: 'var(--hairline)' }}>
          <KanbanSquare className="mx-auto h-9 w-9" style={{ color: 'var(--ink-muted)' }} />
          <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Nenhum quadro por aqui ainda</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-muted)' }}>Crie o primeiro quadro do seu setor.</p>
          <button onClick={() => setNovoQuadro(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold text-white" style={{ background: 'var(--brand)' }}>
            <Plus className="h-4 w-4" /> Novo quadro
          </button>
        </div>
        {novoQuadro && (
          <NovoQuadroModal
            user={user}
            setores={setoresParaNovoQuadro(user, sectors)}
            onClose={() => setNovoQuadro(false)}
            onCreated={q => { setQuadros(p => [...p, q]); setQuadroId(q.id); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Cabecalho />

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <select
            value={quadroId || ''}
            onChange={e => setQuadroId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            {quadros.map(q => (
              <option key={q.id} value={q.id}>
                {q.nome} · {sectors.find(s => s.id === q.setor_id)?.name || 'setor'}
              </option>
            ))}
          </select>
          <button onClick={() => setNovoQuadro(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
            <Plus className="h-3.5 w-3.5" /> Novo quadro
          </button>
        </div>

        <div className="flex items-center gap-2">
          {podeGerir && (
            <>
              <div className="relative">
                <button onClick={() => setPainelBuckets(v => !v)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Colunas
                </button>
                {painelBuckets && (
                  <PainelBuckets
                    buckets={buckets}
                    onCriar={criarBucketLocal}
                    onAtualizar={atualizarBucketLocal}
                    onReordenar={async itens => { await reordenarBuckets(itens); recarregarBuckets(); }}
                    onExcluir={async id => { await excluirBucket(id); recarregarBuckets(); if (quadroId) carregarConteudo(quadroId); }}
                    onClose={() => setPainelBuckets(false)}
                  />
                )}
              </div>
              <button onClick={() => setConfigQuadro(true)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                <Settings2 className="h-3.5 w-3.5" /> Configurar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Busca — filtra as tarefas nas três visões (Quadro / Grade / Calendário) */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
        <input
          type="search"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por título, descrição, código ou responsável…"
          className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
        />
      </div>

      {/* Abas */}
      <div role="tablist" className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--hairline)' }}>
        {ABAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id} role="tab" aria-selected={aba === id}
            onClick={() => trocarAba(id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold -mb-px border-b-2 transition-colors"
            style={{
              borderColor: aba === id ? 'var(--brand)' : 'transparent',
              color: aba === id ? 'var(--brand-strong)' : 'var(--ink-muted)',
            }}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="text-sm py-10 text-center" style={{ color: 'var(--ink-muted)' }}>Carregando…</p>
      ) : !quadro ? null : aba === 'quadro' ? (
        <ViewQuadro
          buckets={buckets} tarefas={tarefasFiltradas} porId={porId} podeEditar podeGerirColunas={podeGerir}
          onAbrirTarefa={setTarefaSel}
          onCriarTarefa={b => setNovaTarefa({ bucketId: b })}
          onMover={handleMover}
          onCriarBucket={criarBucketLocal}
          onAtualizarBucket={atualizarBucketLocal}
        />
      ) : aba === 'grade' ? (
        <ViewGrade
          buckets={buckets} tarefas={tarefasFiltradas} porId={porId} podeEditar
          onAbrirTarefa={setTarefaSel}
          onAtualizarInline={handleInline}
        />
      ) : (
        <ViewCalendario
          tarefas={tarefasFiltradas} porId={porId} podeEditar
          onAbrirTarefa={setTarefaSel}
          onCriarNoDia={venc => setNovaTarefa({ bucketId: buckets[0]?.id ?? null, venc })}
        />
      )}

      {/* Modais */}
      {novoQuadro && (
        <NovoQuadroModal
          user={user}
          setores={setoresParaNovoQuadro(user, sectors)}
          onClose={() => setNovoQuadro(false)}
          onCreated={q => { setQuadros(p => [...p, q]); setQuadroId(q.id); }}
        />
      )}
      {configQuadro && quadro && (
        <QuadroConfigModal
          quadro={quadro} user={user}
          onClose={() => setConfigQuadro(false)}
          onSaved={q => setQuadros(p => p.map(x => x.id === q.id ? q : x))}
          onDeleted={id => { setQuadros(p => p.filter(x => x.id !== id)); setQuadroId(undefined); setConfigQuadro(false); }}
        />
      )}
      {novaTarefa && quadroId && (
        <NovaTarefaModal
          quadroId={quadroId} bucketId={novaTarefa.bucketId} buckets={buckets}
          dataVencimento={novaTarefa.venc} user={user}
          onClose={() => setNovaTarefa(null)}
          onCreated={t => setTarefas(p => [...p, t])}
        />
      )}
      {tarefaSel && quadro && (
        <TarefaModal
          tarefa={tarefaSel} quadro={quadro} buckets={buckets}
          podeEditar
          user={user}
          onClose={() => setTarefaSel(null)}
          onSaved={t => { upsertTarefa(t); setTarefaSel(t); }}
          onDeleted={id => { setTarefas(p => p.filter(x => x.id !== id)); setTarefaSel(null); }}
        />
      )}
    </div>
  );
}

function Cabecalho() {
  return (
    <header className="flex items-start gap-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: 'var(--brand)' }}>
        <KanbanSquare className="h-5 w-5" />
      </span>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ink-primary)' }}>Demandas</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          Quadros de tarefas do seu setor — responsáveis, prazos e acompanhamento.
        </p>
      </div>
    </header>
  );
}
