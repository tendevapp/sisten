/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * "Minhas tarefas" — tudo de que o usuário é responsável, de todos os quadros,
 * agrupado por quadro e ordenado por vencimento. Alvo do link das notificações
 * de atribuição (`?id=<tarefaId>`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import type { DemBucket, DemQuadro, DemTarefa, Profile } from '../../types';
import { listarQuadros, listarBuckets, listarTarefasDoUsuario, assinarAnexosDeTarefas } from '../../lib/demandasApi';
import { useUsuarios } from '../../components/demandas-modulo/shared';
import TarefaCard from '../../components/demandas-modulo/TarefaCard';
import TarefaModal from '../../components/demandas-modulo/TarefaModal';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

function idDoHash(): string | undefined {
  return new URLSearchParams(window.location.hash.split('?')[1] || '').get('id') || undefined;
}

export default function DemandasMinhas({ user, onNavigate }: Props) {
  const { porId } = useUsuarios();
  const [tarefas, setTarefas] = useState<DemTarefa[]>([]);
  const [quadros, setQuadros] = useState<DemQuadro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState<DemTarefa | null>(null);
  const [bucketsSel, setBucketsSel] = useState<DemBucket[]>([]);

  const abrir = useCallback(async (t: DemTarefa) => {
    setSel(t);
    try { setBucketsSel(await listarBuckets(t.quadro_id)); } catch { setBucketsSel([]); }
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [ts, qs] = await Promise.all([listarTarefasDoUsuario(user.id), listarQuadros()]);
      setTarefas(await assinarAnexosDeTarefas(ts));
      setQuadros(qs);
      const alvo = idDoHash();
      if (alvo) {
        const t = ts.find(x => x.id === alvo);
        if (t) abrir(t);
      }
    } finally {
      setCarregando(false);
    }
  }, [user.id, abrir]);

  useEffect(() => { carregar(); }, [carregar]);

  const porQuadro = useMemo(() => {
    const grupos = new Map<string, DemTarefa[]>();
    const ord = [...tarefas].sort((a, b) => (a.data_vencimento || '9999').localeCompare(b.data_vencimento || '9999'));
    for (const t of ord) {
      const g = grupos.get(t.quadro_id);
      if (g) g.push(t); else grupos.set(t.quadro_id, [t]);
    }
    return grupos;
  }, [tarefas]);

  const nomeQuadro = (id: string) => quadros.find(q => q.id === id)?.nome || 'Quadro';
  const quadroSel = quadros.find(q => q.id === sel?.quadro_id);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: 'var(--brand)' }}>
          <ListChecks className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink-primary)' }}>Minhas tarefas</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            Tudo de que você é responsável nos quadros de Demandas.
          </p>
        </div>
      </header>

      {carregando ? (
        <p className="text-sm py-10 text-center" style={{ color: 'var(--ink-muted)' }}>Carregando…</p>
      ) : tarefas.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center" style={{ borderColor: 'var(--hairline)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Nada atribuído a você</p>
          <button onClick={() => onNavigate('/demandas')} className="mt-3 text-xs font-bold" style={{ color: 'var(--brand-strong)' }}>
            Ir para os quadros
          </button>
        </div>
      ) : (
        [...porQuadro.entries()].map(([qid, lista]) => (
          <section key={qid} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>{nomeQuadro(qid)}</h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {lista.map(t => (
                <button
                  key={t.id} type="button" onClick={() => abrir(t)}
                  className="block text-left rounded-xl border p-3"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
                >
                  <TarefaCard tarefa={t} porId={porId} />
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {sel && quadroSel && (
        <TarefaModal
          tarefa={sel} quadro={quadroSel} buckets={bucketsSel} podeEditar user={user}
          onClose={() => { setSel(null); if (idDoHash()) window.history.replaceState(null, '', '#/demandas/minhas'); }}
          onSaved={t => { setTarefas(p => p.map(x => x.id === t.id ? t : x)); setSel(t); }}
          onDeleted={id => { setTarefas(p => p.filter(x => x.id !== id)); setSel(null); }}
        />
      )}
    </div>
  );
}
