/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visão Grade: tabela das tarefas do quadro. Status, prioridade e coluna
 * editáveis inline; clique na linha abre o detalhe. Em tela estreita vira
 * lista de cartões.
 */

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DemBucket, DemPrioridade, DemStatus, DemTarefa, Profile } from '../../types';
import { useTelaEstreita } from '../../lib/useTelaEstreita';
import {
  PRIORIDADE_LABEL, PRIORIDADE_ORDER, PRIORIDADE_PESO, STATUS_LABEL, STATUS_ORDER,
} from '../../lib/demandasQuadro';
import { AvatarStack } from './shared';
import TarefaCard from './TarefaCard';

type Campo = 'titulo' | 'data_inicio' | 'data_vencimento' | 'bucket' | 'status' | 'prioridade';

interface Props {
  buckets: DemBucket[];
  tarefas: DemTarefa[];
  porId: Map<string, Profile>;
  podeEditar: boolean;
  onAbrirTarefa: (t: DemTarefa) => void;
  onAtualizarInline: (t: DemTarefa, patch: Partial<Pick<DemTarefa, 'status' | 'prioridade' | 'bucket_id'>>) => void;
}

const cellSelect = 'rounded-md border px-1.5 py-1 text-xs font-semibold bg-transparent cursor-pointer';

export default function ViewGrade({ buckets, tarefas, porId, podeEditar, onAbrirTarefa, onAtualizarInline }: Props) {
  const estreita = useTelaEstreita();
  const [sort, setSort] = useState<{ campo: Campo; dir: 1 | -1 }>({ campo: 'prioridade', dir: -1 });
  const nomeBucket = useMemo(() => new Map(buckets.map(b => [b.id, b.nome])), [buckets]);

  const ordenadas = useMemo(() => {
    const val = (t: DemTarefa): string | number => {
      switch (sort.campo) {
        case 'titulo': return t.titulo.toLowerCase();
        case 'data_inicio': return t.data_inicio || '9999';
        case 'data_vencimento': return t.data_vencimento || '9999';
        case 'bucket': return (t.bucket_id && nomeBucket.get(t.bucket_id)) || 'zzz';
        case 'status': return STATUS_ORDER.indexOf(t.status);
        case 'prioridade': return PRIORIDADE_PESO[t.prioridade];
      }
    };
    return [...tarefas].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [tarefas, sort, nomeBucket]);

  const th = (campo: Campo, label: string) => (
    <th
      className="px-3 py-2 text-left font-bold cursor-pointer select-none"
      onClick={() => setSort(s => ({ campo, dir: s.campo === campo && s.dir === 1 ? -1 : 1 }))}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.campo === campo && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );

  if (estreita) {
    return (
      <div className="space-y-2.5">
        {ordenadas.map(t => (
          <button
            key={t.id} type="button" onClick={() => onAbrirTarefa(t)}
            className="block w-full text-left rounded-xl border p-3"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <TarefaCard tarefa={t} porId={porId} />
          </button>
        ))}
        {ordenadas.length === 0 && <p className="text-sm italic py-6 text-center" style={{ color: 'var(--ink-muted)' }}>Nenhuma tarefa.</p>}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
      <table className="w-full text-xs" style={{ color: 'var(--ink-secondary)' }}>
        <thead style={{ background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}>
          <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
            {th('titulo', 'Tarefa')}
            <th className="px-3 py-2 text-left font-bold">Responsáveis</th>
            {th('data_inicio', 'Início')}
            {th('data_vencimento', 'Vencimento')}
            {th('bucket', 'Coluna')}
            {th('status', 'Status')}
            {th('prioridade', 'Prioridade')}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(t => (
            <tr
              key={t.id}
              className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] cursor-pointer"
              style={{ borderBottom: '1px solid var(--hairline)' }}
              onClick={() => onAbrirTarefa(t)}
            >
              <td className="px-3 py-2">
                <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{t.titulo}</span>
                {t.codigo && <span className="ml-2 font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>{t.codigo}</span>}
              </td>
              <td className="px-3 py-2"><AvatarStack ids={t.responsaveis} porId={porId} size={20} /></td>
              <td className="px-3 py-2 tabular-nums">{t.data_inicio ? t.data_inicio.split('-').reverse().join('/') : '—'}</td>
              <td className="px-3 py-2 tabular-nums">{t.data_vencimento ? t.data_vencimento.split('-').reverse().join('/') : '—'}</td>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <select
                  className={cellSelect} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                  value={t.bucket_id || ''} disabled={!podeEditar}
                  onChange={e => onAtualizarInline(t, { bucket_id: e.target.value || null })}
                >
                  <option value="">Sem coluna</option>
                  {buckets.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </td>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <select
                  className={cellSelect} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                  value={t.status} disabled={!podeEditar}
                  onChange={e => onAtualizarInline(t, { status: e.target.value as DemStatus })}
                >
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </td>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <select
                  className={cellSelect} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                  value={t.prioridade} disabled={!podeEditar}
                  onChange={e => onAtualizarInline(t, { prioridade: e.target.value as DemPrioridade })}
                >
                  {PRIORIDADE_ORDER.map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {ordenadas.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-8 text-center italic" style={{ color: 'var(--ink-muted)' }}>Nenhuma tarefa.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
