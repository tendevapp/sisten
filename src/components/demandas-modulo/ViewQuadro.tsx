/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visão Quadro (kanban): uma coluna por bucket. O cartão inteiro é a alça de
 * arraste (dnd-kit, PointerSensor com tolerância de 6px — clique curto abre o
 * detalhe, movimento arrasta). Soltar muda `bucket_id` e joga o cartão para o
 * fim da coluna de destino. Cada coluna tem cor opcional e dá para criar
 * colunas direto daqui.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Palette, Plus, X } from 'lucide-react';
import type { DemBucket, DemTarefa, Profile } from '../../types';
import { ordenarTarefas, proximaOrdem } from '../../lib/demandasQuadro';
import TarefaCard from './TarefaCard';
import { SeletorCorColuna } from './shared';

const SEM_COLUNA = '__sem_coluna__';

interface Props {
  buckets: DemBucket[];
  tarefas: DemTarefa[];
  porId: Map<string, Profile>;
  /** Pode mover/abrir cartões e adicionar tarefas. */
  podeEditar: boolean;
  /** Pode criar colunas e trocar a cor delas (dono/gestor do quadro). */
  podeGerirColunas: boolean;
  onAbrirTarefa: (t: DemTarefa) => void;
  onCriarTarefa: (bucketId: string | null) => void;
  onMover: (tarefa: DemTarefa, bucketId: string | null, ordem: number) => void;
  onCriarBucket: (nome: string) => void;
  onAtualizarBucket: (id: string, patch: { nome?: string; cor?: string | null }) => void;
}

function Card({ tarefa, porId, podeEditar, onClick }: {
  tarefa: DemTarefa; porId: Map<string, Profile>; podeEditar: boolean; onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: tarefa.id, disabled: !podeEditar });
  // Depois de arrastar, o navegador ainda dispara um `click` no cartão de
  // origem — sem isto o modal abriria toda vez que se solta um cartão.
  const arrastou = useRef(false);
  useEffect(() => { if (isDragging) arrastou.current = true; }, [isDragging]);
  const handleClick = () => {
    if (arrastou.current) { arrastou.current = false; return; }
    onClick();
  };
  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      {...(podeEditar ? listeners : {})}
      {...(podeEditar ? attributes : {})}
      className="relative rounded-xl border p-3 transition-shadow hover:shadow-md select-none"
      style={{
        borderColor: 'var(--hairline)', background: 'var(--surface-card)',
        cursor: podeEditar ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        touchAction: 'none',
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      {podeEditar && (
        <GripVertical className="absolute top-2 right-2 h-3.5 w-3.5 pointer-events-none" style={{ color: 'var(--ink-muted)', opacity: 0.4 }} />
      )}
      <TarefaCard tarefa={tarefa} porId={porId} />
    </div>
  );
}

function Coluna({ bucketId, titulo, cor, tarefas, porId, podeEditar, onAbrirTarefa, onAdicionar, onCor }: {
  bucketId: string; titulo: string; cor: string | null; tarefas: DemTarefa[]; porId: Map<string, Profile>;
  podeEditar: boolean; onAbrirTarefa: (t: DemTarefa) => void; onAdicionar: () => void;
  onCor: ((hex: string | null) => void) | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucketId });
  const [paletaAberta, setPaletaAberta] = useState(false);
  const accent = cor || 'var(--ink-muted)';

  return (
    <div
      className="flex flex-col w-[300px] shrink-0 rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
    >
      <div
        className="flex items-center gap-2 px-3.5 py-3 shrink-0 relative"
        style={{
          borderBottom: '1px solid var(--hairline)',
          borderTop: `3px solid ${cor || 'transparent'}`,
          background: cor ? `color-mix(in srgb, ${cor} 8%, transparent)` : 'transparent',
        }}
      >
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: accent }} />
        <h3 className="text-xs font-bold uppercase tracking-wide truncate flex-1" style={{ color: 'var(--ink-primary)' }} title={titulo}>{titulo}</h3>
        {onCor && (
          <button
            type="button"
            onClick={() => setPaletaAberta(v => !v)}
            className="shrink-0 rounded p-0.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
            style={{ color: 'var(--ink-muted)' }}
            title="Cor da coluna"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="text-[10px] font-black rounded-full h-5 min-w-5 px-1 flex items-center justify-center" style={{ color: 'var(--ink-secondary)', background: 'var(--surface-sunken)' }}>
          {tarefas.length}
        </span>
        {paletaAberta && onCor && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setPaletaAberta(false)} />
            <div className="absolute right-2 top-full z-40 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-xl">
              <SeletorCorColuna valor={cor} onChange={hex => { onCor(hex); setPaletaAberta(false); }} />
            </div>
          </>
        )}
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 min-h-[120px] p-2.5 space-y-2.5 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 300px)', background: isOver ? `color-mix(in srgb, ${cor || 'var(--brand)'} 9%, transparent)` : 'transparent' }}
      >
        {tarefas.length === 0 && (
          <p className="text-[11px] italic text-center py-6" style={{ color: 'var(--ink-muted)' }}>Nada aqui.</p>
        )}
        {tarefas.map(t => (
          <Card key={t.id} tarefa={t} porId={porId} podeEditar={podeEditar} onClick={() => onAbrirTarefa(t)} />
        ))}
      </div>
      {podeEditar && (
        <button
          type="button" onClick={onAdicionar}
          className="flex items-center justify-center gap-1.5 shrink-0 py-2.5 text-xs font-bold hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
          style={{ color: 'var(--ink-secondary)', borderTop: '1px solid var(--hairline)' }}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar tarefa
        </button>
      )}
    </div>
  );
}

function AdicionarColuna({ onCriar }: { onCriar: (nome: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState('');

  const confirmar = () => {
    const v = nome.trim();
    if (v) onCriar(v);
    setNome('');
    setEditando(false);
  };

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="flex items-center justify-center gap-1.5 w-[220px] shrink-0 rounded-2xl border border-dashed py-3 text-xs font-bold self-start transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
        style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}
      >
        <Plus className="h-4 w-4" /> Adicionar coluna
      </button>
    );
  }

  return (
    <div className="w-[220px] shrink-0 rounded-2xl border p-2 self-start" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      <input
        autoFocus
        value={nome}
        onChange={e => setNome(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') { setNome(''); setEditando(false); } }}
        placeholder="Nome da coluna"
        className="w-full rounded-md border px-2 py-1.5 text-xs font-semibold"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
      />
      <div className="flex items-center gap-1.5 mt-1.5">
        <button type="button" onClick={confirmar} className="flex-1 rounded-md py-1 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>Criar</button>
        <button type="button" onClick={() => { setNome(''); setEditando(false); }} className="rounded-md p-1" style={{ color: 'var(--ink-muted)' }}><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

const SENSOR_POINTER_OPTIONS = { activationConstraint: { distance: 6 } };

export default function ViewQuadro({
  buckets, tarefas, porId, podeEditar, podeGerirColunas,
  onAbrirTarefa, onCriarTarefa, onMover, onCriarBucket, onAtualizarBucket,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, SENSOR_POINTER_OPTIONS));

  const colunas = useMemo(() => {
    const semColuna = tarefas.filter(t => !t.bucket_id);
    const base = buckets.map(b => ({
      id: b.id, titulo: b.nome, cor: b.cor ?? null,
      tarefas: ordenarTarefas(tarefas.filter(t => t.bucket_id === b.id)),
    }));
    if (semColuna.length > 0) base.push({ id: SEM_COLUNA, titulo: 'Sem coluna', cor: null, tarefas: ordenarTarefas(semColuna) });
    return base;
  }, [buckets, tarefas]);

  const ativa = activeId ? tarefas.find(t => t.id === activeId) : null;

  const handleStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const tarefa = tarefas.find(t => t.id === String(active.id));
    if (!tarefa) return;
    const destino = String(over.id) === SEM_COLUNA ? null : String(over.id);
    if (tarefa.bucket_id === destino || (!tarefa.bucket_id && destino === null)) return;
    const irmas = tarefas.filter(t => (destino ? t.bucket_id === destino : !t.bucket_id));
    onMover(tarefa, destino, proximaOrdem(irmas));
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2 items-start">
        {colunas.map(c => (
          <Coluna
            key={c.id} bucketId={c.id} titulo={c.titulo} cor={c.cor} tarefas={c.tarefas} porId={porId}
            podeEditar={podeEditar} onAbrirTarefa={onAbrirTarefa}
            onAdicionar={() => onCriarTarefa(c.id === SEM_COLUNA ? null : c.id)}
            onCor={podeGerirColunas && c.id !== SEM_COLUNA ? (hex => onAtualizarBucket(c.id, { cor: hex })) : null}
          />
        ))}
        {podeGerirColunas && <AdicionarColuna onCriar={onCriarBucket} />}
      </div>
      <DragOverlay>
        {ativa && (
          <div className="rounded-xl border p-3 w-[280px] rotate-2 shadow-2xl" style={{ borderColor: 'var(--brand)', background: 'var(--surface-card)' }}>
            <TarefaCard tarefa={ativa} porId={porId} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
