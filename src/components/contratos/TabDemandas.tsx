/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Demandas jurídicas — quadro Kanban dos chamados (tipo "chamado", destino
 * Jurídico). As colunas são o status real da solicitação: arrastar um card
 * muda o status de verdade, e Minhas Solicitações reflete na hora — não há
 * um status paralelo só do quadro.
 *
 * "Aberto" é a porta de entrada (toda demanda nasce ali) e por isso fica fixa
 * na primeira posição; as demais colunas são reordenáveis, ocultáveis e têm
 * rótulo editável (ver `lib/kanban.ts`), guardado por navegador/usuário.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Inbox, User, Building2, SlidersHorizontal, GripVertical, Plus,
  ChevronUp, ChevronDown, Eye, EyeOff, RotateCcw, AlertTriangle, Pencil,
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile, Request, RequestStatus } from '../../types';
import { NOME_SETOR_JURIDICO } from '../../lib/juridico';
import {
  COLUNA_INICIAL, DEFAULT_KANBAN_COLUMNS, KanbanColumnConfig,
  carregarColunasKanban, salvarColunasKanban, corDoStatus, corPrioridade,
  PRIORIDADE_LABEL, codigoCurtoDemanda, formatarPrazoRestante, STATUS_LABEL_DEMANDA,
} from '../../lib/kanban';
import { useChartConfig } from '../charts/chartDefaults';
import DemandaDetailModal from './DemandaDetailModal';
import NovaDemandaModal from './NovaDemandaModal';

interface TabDemandasProps {
  user: Profile;
}

/* --------------------------------------------------------------------- */
/* Card                                                                   */
/* --------------------------------------------------------------------- */

interface CardContentProps {
  request: Request;
  setorNome: string;
  corPrio: string;
  colunas: KanbanColumnConfig[];
  onSalvarTitulo: (titulo: string) => void;
  onMudarStatus: (novoStatus: RequestStatus) => void;
}

function CardContent({ request, setorNome, corPrio, colunas, onSalvarTitulo, onMudarStatus }: CardContentProps) {
  const chartTokens = useChartConfig().tokens;
  const corStatusAtual = corDoStatus(request.status, chartTokens.status, chartTokens.brand, chartTokens.inkMuted);
  const prazo = formatarPrazoRestante(request.prazo_conclusao);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(request.titulo || request.category_id || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  const salvar = () => {
    setEditando(false);
    const valor = rascunho.trim();
    if (valor && valor !== (request.titulo || request.category_id)) onSalvarTitulo(valor);
    else setRascunho(request.titulo || request.category_id || '');
  };

  return (
    <>
      <span className="font-mono text-[11px] font-black" style={{ color: 'var(--brand-strong)' }}>
        {codigoCurtoDemanda(request.number)}
      </span>

      <div className="group/titulo flex items-start gap-1 mt-1">
        {editando ? (
          <input
            ref={inputRef}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={salvar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); salvar(); }
              if (e.key === 'Escape') { setRascunho(request.titulo || request.category_id || ''); setEditando(false); }
            }}
            className="flex-1 min-w-0 text-[13px] font-bold leading-snug rounded-md border px-1.5 py-0.5 -mx-1.5 -my-0.5"
            style={{ borderColor: 'var(--brand)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          />
        ) : (
          <>
            <p className="text-[13px] font-bold leading-snug flex-1" style={{ color: 'var(--ink-primary)' }}>
              {request.titulo || request.category_id || 'Sem título'}
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditando(true); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="shrink-0 opacity-0 group-hover/titulo:opacity-100 transition-opacity cursor-pointer p-0.5 -m-0.5"
              style={{ color: 'var(--ink-muted)' }}
              aria-label="Editar título"
              title="Editar título"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--ink-muted)' }}>
        {request.category_id || 'Sem categoria'}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <span
          className="text-[9px] font-black uppercase tracking-wide rounded-full px-2 py-0.5"
          style={{ color: corPrio, background: `color-mix(in srgb, ${corPrio} 16%, transparent)` }}
        >
          {PRIORIDADE_LABEL[request.criticality] || '—'}
        </span>
        {prazo && (
          <span
            className="inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-2 py-0.5"
            style={{
              color: prazo.atrasado ? 'var(--status-critical)' : 'var(--status-good)',
              background: prazo.atrasado
                ? 'color-mix(in srgb, var(--status-critical) 14%, transparent)'
                : 'color-mix(in srgb, var(--status-good) 14%, transparent)',
            }}
          >
            {prazo.atrasado ? <AlertTriangle className="h-2.5 w-2.5" /> : '⏱'}
            {prazo.texto}
          </span>
        )}
      </div>

      <div className="mt-1.5">
        <select
          value={request.status}
          onChange={(e) => onMudarStatus(e.target.value as RequestStatus)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full text-[10px] font-bold rounded-lg px-2 py-1 cursor-pointer border-0 appearance-none"
          style={{ color: corStatusAtual, background: `color-mix(in srgb, ${corStatusAtual} 12%, transparent)` }}
          title="Mudar status"
        >
          {colunas.map(c => (
            <option key={c.status} value={c.status}>{c.label}</option>
          ))}
          {/* Garante uma opção para o status atual mesmo que a coluna correspondente esteja oculta/renomeada fora da lista. */}
          {!colunas.some(c => c.status === request.status) && (
            <option value={request.status}>{STATUS_LABEL_DEMANDA[request.status]}</option>
          )}
        </select>
      </div>

      <div
        className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 text-[10px]"
        style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-muted)' }}
      >
        <span className="flex items-center gap-1 min-w-0">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[100px]">{request.atendente_name || request.solicitante_name}</span>
        </span>
        <span className="flex items-center gap-1 min-w-0 shrink-0">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[90px]">{setorNome}</span>
        </span>
      </div>
    </>
  );
}

interface KanbanCardProps {
  request: Request;
  setorNome: string;
  corPrio: string;
  colunas: KanbanColumnConfig[];
  onClick: () => void;
  onSalvarTitulo: (titulo: string) => void;
  onMudarStatus: (novoStatus: RequestStatus) => void;
}

function KanbanCard({ request, setorNome, corPrio, colunas, onClick, onSalvarTitulo, onMudarStatus }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: request.id });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className="relative rounded-xl border p-3 transition-shadow duration-150 hover:shadow-md reveal"
      style={{
        borderColor: 'var(--hairline)',
        background: 'var(--surface-card)',
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
        boxShadow: isDragging ? 'none' : '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        cursor: 'pointer',
      }}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2.5 right-2.5 cursor-grab active:cursor-grabbing touch-none p-0.5"
        style={{ color: 'var(--ink-muted)', opacity: 0.5 }}
        aria-label="Arrastar card"
        title="Arrastar para outra coluna"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <CardContent request={request} setorNome={setorNome} corPrio={corPrio} colunas={colunas} onSalvarTitulo={onSalvarTitulo} onMudarStatus={onMudarStatus} />
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Coluna                                                                 */
/* --------------------------------------------------------------------- */

interface KanbanColumnProps {
  status: RequestStatus;
  label: string;
  cor: string;
  requests: Request[];
  colunas: KanbanColumnConfig[];
  setorPorId: Map<string, string>;
  onCardClick: (r: Request) => void;
  onSalvarTitulo: (id: string, titulo: string) => void;
  onMudarStatus: (id: string, novoStatus: RequestStatus) => void;
  onAdicionar: () => void;
}

function KanbanColumn({ status, label, cor, requests, colunas, setorPorId, onCardClick, onSalvarTitulo, onMudarStatus, onAdicionar }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const chartTokens = useChartConfig().tokens;

  return (
    <div className="flex flex-col w-[300px] shrink-0 rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      <div className="flex items-center gap-2 px-3.5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cor }} />
        <h3 className="text-xs font-bold uppercase tracking-wide truncate flex-1" style={{ color: 'var(--ink-primary)' }} title={label}>
          {label}
        </h3>
        <span
          className="text-[10px] font-black rounded-full h-5 min-w-5 px-1 flex items-center justify-center"
          style={{ color: cor, background: `color-mix(in srgb, ${cor} 16%, transparent)` }}
        >
          {requests.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 min-h-[120px] p-2.5 space-y-2.5 overflow-y-auto transition-colors duration-150 stagger"
        style={{
          maxHeight: 'calc(100vh - 340px)',
          background: isOver ? `color-mix(in srgb, ${cor} 7%, transparent)` : 'transparent',
        }}
      >
        {requests.length === 0 && (
          <p className="text-[11px] italic text-center py-6" style={{ color: 'var(--ink-muted)' }}>Nenhuma demanda aqui.</p>
        )}
        {requests.map(r => (
          <KanbanCard
            key={r.id}
            request={r}
            setorNome={setorPorId.get(r.solicitante_sector_id) || '—'}
            corPrio={corPrioridade(r.criticality, chartTokens.status, chartTokens.inkMuted)}
            colunas={colunas}
            onClick={() => onCardClick(r)}
            onSalvarTitulo={(titulo) => onSalvarTitulo(r.id, titulo)}
            onMudarStatus={(novoStatus) => onMudarStatus(r.id, novoStatus)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onAdicionar}
        className="flex items-center justify-center gap-1.5 shrink-0 py-2.5 text-xs font-bold cursor-pointer transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        style={{ color: 'var(--ink-secondary)', borderTop: '1px solid var(--hairline)' }}
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar tarefa
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Painel de personalização de colunas                                    */
/* --------------------------------------------------------------------- */

function PainelPersonalizarColunas({
  colunas, onChange, onClose,
}: {
  colunas: KanbanColumnConfig[];
  onChange: (colunas: KanbanColumnConfig[]) => void;
  onClose: () => void;
}) {
  const mover = (idx: number, dir: -1 | 1) => {
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= colunas.length) return;
    const next = [...colunas];
    [next[idx], next[alvo]] = [next[alvo], next[idx]];
    onChange(next);
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 mt-1.5 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-40 p-3">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Personalizar colunas</span>
          <button
            onClick={() => onChange(DEFAULT_KANBAN_COLUMNS.map(c => ({ ...c })))}
            className="inline-flex items-center gap-1 text-[10px] text-blue-650 hover:underline font-semibold cursor-pointer"
          >
            <RotateCcw className="h-2.5 w-2.5" /> Restaurar
          </button>
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {colunas.map((col, idx) => (
            <div key={col.status} className="flex items-center gap-1.5 rounded-lg border border-slate-100 dark:border-slate-800 p-1.5">
              <div className="flex flex-col shrink-0">
                <button type="button" disabled={idx === 0} onClick={() => mover(idx, -1)} className="disabled:opacity-25 cursor-pointer text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={idx === colunas.length - 1} onClick={() => mover(idx, 1)} className="disabled:opacity-25 cursor-pointer text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={col.label}
                onChange={(e) => {
                  const next = [...colunas];
                  next[idx] = { ...col, label: e.target.value };
                  onChange(next);
                }}
                className="flex-1 min-w-0 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200"
              />
              <button
                type="button"
                onClick={() => {
                  const next = [...colunas];
                  next[idx] = { ...col, visible: !col.visible };
                  onChange(next);
                }}
                className="shrink-0 cursor-pointer text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title={col.visible ? 'Ocultar coluna' : 'Mostrar coluna'}
              >
                {col.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- */
/* Tab principal                                                         */
/* --------------------------------------------------------------------- */

export default function TabDemandas({ user }: TabDemandasProps) {
  const chartTokens = useChartConfig().tokens;
  const [requests, setRequests] = useState<Request[]>([]);
  const [colunas, setColunas] = useState<KanbanColumnConfig[]>(() => carregarColunasKanban());
  const [showCustomize, setShowCustomize] = useState(false);
  const [selecionado, setSelecionado] = useState<Request | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [novaDemandaStatus, setNovaDemandaStatus] = useState<RequestStatus | null>(null);

  const juridicoSectorId = useMemo(
    () => localDb.getSectors().find(s => s.name === NOME_SETOR_JURIDICO)?.id,
    []
  );

  const setorPorId = useMemo(
    () => new Map(localDb.getSectors().map(s => [s.id, s.name])),
    []
  );

  const carregar = useCallback(() => {
    if (!juridicoSectorId) { setRequests([]); return; }
    setRequests(
      localDb.getRequests().filter(r => r.type === 'chamado' && r.target_sector_id === juridicoSectorId)
    );
  }, [juridicoSectorId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => localDb.subscribe(carregar), [carregar]);

  const atualizarColunas = (next: KanbanColumnConfig[]) => {
    setColunas(next);
    salvarColunasKanban(next);
  };

  const colunasVisiveis = useMemo(
    () => [COLUNA_INICIAL, ...colunas.filter(c => c.visible)],
    [colunas]
  );

  const requestsPorStatus = useMemo(() => {
    const mapa = new Map<RequestStatus, Request[]>();
    colunasVisiveis.forEach(c => mapa.set(c.status, []));
    // Mais urgente primeiro (criticidade desc), depois mais recente.
    const ordenados = [...requests].sort((a, b) => {
      if (b.criticality !== a.criticality) return b.criticality - a.criticality;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    ordenados.forEach(r => {
      const grupo = mapa.get(r.status);
      if (grupo) grupo.push(r);
      // Solicitação num status oculto/desconhecido (ex.: "cancelada" com a
      // coluna escondida) simplesmente não aparece — não é perdida, só não
      // some do sistema: ainda está em Minhas Solicitações.
    });
    return mapa;
  }, [requests, colunasVisiveis]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  // Compartilhado por arrastar o card e pelo seletor de status dentro dele —
  // um caminho só, para as duas formas nunca divergirem.
  const handleMudarStatus = useCallback(async (reqId: string, novoStatus: RequestStatus) => {
    const atual = requests.find(r => r.id === reqId);
    if (!atual || atual.status === novoStatus) return;

    // Otimista: a UI já reflete a coluna nova; se a chamada falhar, recarrega do cache local.
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: novoStatus } : r));

    try {
      await localDb.updateRequestStatus(reqId, novoStatus, user.id, `Movido para "${colunasVisiveis.find(c => c.status === novoStatus)?.label}" no quadro Kanban.`);
    } catch (err) {
      console.error('Falha ao mover a demanda no quadro.', err);
      carregar();
    }
  }, [requests, colunasVisiveis, user.id, carregar]);

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    handleMudarStatus(String(active.id), over.id as RequestStatus);
  };

  const handleSalvarTitulo = async (id: string, titulo: string) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, titulo } : r));
    try {
      await localDb.updateRequestTitulo(id, titulo);
    } catch (err) {
      console.error('Falha ao salvar o título.', err);
      carregar();
    }
  };

  const activeRequest = activeId ? requests.find(r => r.id === activeId) : null;

  if (!juridicoSectorId) {
    return (
      <div className="flex flex-col items-center justify-center text-center rounded-xl border px-6 py-14" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <Inbox className="h-10 w-10 mb-3 opacity-60" style={{ color: 'var(--ink-muted)' }} />
        <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Setor Jurídico não encontrado</p>
        <p className="text-xs mt-1 max-w-md" style={{ color: 'var(--ink-muted)' }}>Configure o setor "Jurídico" em Administração &gt; Setores para habilitar este quadro.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
          Chamados abertos para o Jurídico. Arraste pela alça no card ou use o seletor de status — a mudança aparece na hora em Minhas Solicitações.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setNovaDemandaStatus('aberto')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> Nova demanda
          </button>
          <div className="relative">
            <button
              onClick={() => setShowCustomize(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-705 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              Personalizar colunas
            </button>
            {showCustomize && (
              <PainelPersonalizarColunas colunas={colunas} onChange={atualizarColunas} onClose={() => setShowCustomize(false)} />
            )}
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2 stagger">
          {colunasVisiveis.map(col => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              cor={corDoStatus(col.status, chartTokens.status, chartTokens.brand, chartTokens.inkMuted)}
              requests={requestsPorStatus.get(col.status) || []}
              colunas={colunasVisiveis}
              setorPorId={setorPorId}
              onCardClick={setSelecionado}
              onSalvarTitulo={handleSalvarTitulo}
              onMudarStatus={handleMudarStatus}
              onAdicionar={() => setNovaDemandaStatus(col.status)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {activeRequest && (
            <div
              className="rounded-xl border p-3 w-[280px] rotate-2 shadow-2xl"
              style={{ borderColor: 'var(--brand)', background: 'var(--surface-card)' }}
            >
              <CardContent
                request={activeRequest}
                setorNome={setorPorId.get(activeRequest.solicitante_sector_id) || '—'}
                corPrio={corPrioridade(activeRequest.criticality, chartTokens.status, chartTokens.inkMuted)}
                colunas={colunasVisiveis}
                onSalvarTitulo={() => {}}
                onMudarStatus={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {selecionado && (
        <DemandaDetailModal
          request={selecionado}
          user={user}
          onClose={() => setSelecionado(null)}
          onUpdated={(atualizado) => {
            setRequests(prev => prev.map(r => r.id === atualizado.id ? atualizado : r));
            setSelecionado(atualizado);
          }}
        />
      )}

      {novaDemandaStatus && (
        <NovaDemandaModal
          user={user}
          juridicoSectorId={juridicoSectorId}
          statusInicial={novaDemandaStatus}
          statusLabel={colunasVisiveis.find(c => c.status === novaDemandaStatus)?.label || 'Aberto'}
          onClose={() => setNovaDemandaStatus(null)}
          onCreated={carregar}
        />
      )}
    </div>
  );
}
