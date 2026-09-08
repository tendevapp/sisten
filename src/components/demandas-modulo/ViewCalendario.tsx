/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visão Calendário: grade de mês montada com date-fns (sem lib de calendário).
 * A tarefa cai no dia do vencimento (ou do início, se não houver vencimento).
 * Tarefas sem data aparecem no painel lateral "Não agendadas".
 */

import { useMemo, useState } from 'react';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  startOfMonth, startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { DemTarefa, Profile } from '../../types';
import { mapaCalendario, tarefasNaoAgendadas } from '../../lib/demandasQuadro';
import { AvatarStack } from './shared';

interface Props {
  tarefas: DemTarefa[];
  porId: Map<string, Profile>;
  podeEditar: boolean;
  onAbrirTarefa: (t: DemTarefa) => void;
  onCriarNoDia: (dataISO: string) => void;
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export default function ViewCalendario({ tarefas, porId, podeEditar, onAbrirTarefa, onCriarNoDia }: Props) {
  const [ref, setRef] = useState(() => startOfMonth(new Date()));

  const dias = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(ref), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(ref), { weekStartsOn: 0 }),
  }), [ref]);

  const porDia = useMemo(() => mapaCalendario(tarefas), [tarefas]);
  const naoAgendadas = useMemo(() => tarefasNaoAgendadas(tarefas), [tarefas]);

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setRef(m => addMonths(m, -1))} className="rounded-lg p-1.5" style={{ background: 'var(--surface-sunken)' }}><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setRef(startOfMonth(new Date()))} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold" style={{ background: 'var(--surface-sunken)' }}>Hoje</button>
            <button onClick={() => setRef(m => addMonths(m, 1))} className="rounded-lg p-1.5" style={{ background: 'var(--surface-sunken)' }}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <h3 className="text-sm font-bold capitalize" style={{ color: 'var(--ink-primary)' }}>
            {format(ref, "MMMM 'de' yyyy", { locale: ptBR })}
          </h3>
        </div>

        <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden" style={{ background: 'var(--hairline)' }}>
          {SEMANA.map(d => (
            <div key={d} className="py-1.5 text-center text-[10px] font-bold uppercase" style={{ background: 'var(--surface-raised)', color: 'var(--ink-muted)' }}>{d}</div>
          ))}
          {dias.map(dia => {
            const chave = format(dia, 'yyyy-MM-dd');
            const doMes = isSameMonth(dia, ref);
            const lista = porDia.get(chave) || [];
            return (
              <div
                key={chave}
                className="min-h-[92px] p-1 group relative"
                style={{ background: 'var(--surface-card)', opacity: doMes ? 1 : 0.45 }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold ${isToday(dia) ? 'rounded-full px-1.5 text-white' : ''}`}
                    style={isToday(dia) ? { background: 'var(--brand)' } : { color: 'var(--ink-muted)' }}
                  >
                    {format(dia, 'd')}
                  </span>
                  {podeEditar && (
                    <button
                      onClick={() => onCriarNoDia(chave)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[var(--brand)]"
                      aria-label="Nova tarefa neste dia"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="mt-1 space-y-1">
                  {lista.slice(0, 3).map(t => (
                    <button
                      key={t.id} type="button" onClick={() => onAbrirTarefa(t)}
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold"
                      style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand-strong)' }}
                    >
                      {t.titulo}
                    </button>
                  ))}
                  {lista.length > 3 && (
                    <span className="text-[9px]" style={{ color: 'var(--ink-muted)' }}>+{lista.length - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="lg:w-64 shrink-0">
        <h4 className="text-xs font-bold uppercase mb-2" style={{ color: 'var(--ink-muted)' }}>Não agendadas ({naoAgendadas.length})</h4>
        <div className="space-y-1.5">
          {naoAgendadas.map(t => (
            <button
              key={t.id} type="button" onClick={() => onAbrirTarefa(t)}
              className="block w-full text-left rounded-lg border p-2"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
            >
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--ink-primary)' }}>{t.titulo}</p>
              <div className="mt-1"><AvatarStack ids={t.responsaveis} porId={porId} size={18} /></div>
            </button>
          ))}
          {naoAgendadas.length === 0 && <p className="text-xs italic" style={{ color: 'var(--ink-muted)' }}>Tudo agendado.</p>}
        </div>
      </div>
    </div>
  );
}
