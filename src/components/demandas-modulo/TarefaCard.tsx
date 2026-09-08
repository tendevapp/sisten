/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Conteúdo visual de um cartão de tarefa. O arraste (dnd-kit) fica no
 * componente que o usa (`ViewQuadro`).
 */

import { AlertTriangle, CheckSquare, Paperclip } from 'lucide-react';
import type { DemTarefa, Profile } from '../../types';
import { useChartConfig } from '../charts/chartDefaults';
import {
  PRIORIDADE_LABEL, STATUS_LABEL, corPrioridade, corStatus,
  formatarPrazoRestante, progressoChecklist,
} from '../../lib/demandasQuadro';
import { AvatarStack } from './shared';

export default function TarefaCard({ tarefa, porId }: { tarefa: DemTarefa; porId: Map<string, Profile> }) {
  const { tokens } = useChartConfig();
  const cPrio = corPrioridade(tarefa.prioridade, tokens.status, tokens.inkMuted);
  const cStatus = corStatus(tarefa.status, tokens.status, tokens.brand, tokens.inkMuted);
  const prazo = formatarPrazoRestante(tarefa.data_vencimento);
  const prog = progressoChecklist(tarefa.checklist);

  return (
    <>
      {tarefa.codigo && (
        <span className="font-mono text-[10px] font-black" style={{ color: 'var(--brand-strong)' }}>{tarefa.codigo}</span>
      )}
      <p className="text-[13px] font-bold leading-snug mt-0.5" style={{ color: 'var(--ink-primary)' }}>
        {tarefa.titulo}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span
          className="text-[9px] font-black uppercase tracking-wide rounded-full px-2 py-0.5"
          style={{ color: cPrio, background: `color-mix(in srgb, ${cPrio} 16%, transparent)` }}
        >
          {PRIORIDADE_LABEL[tarefa.prioridade]}
        </span>
        <span
          className="text-[9px] font-bold rounded-full px-2 py-0.5"
          style={{ color: cStatus, background: `color-mix(in srgb, ${cStatus} 14%, transparent)` }}
        >
          {STATUS_LABEL[tarefa.status]}
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
            {prazo.atrasado ? <AlertTriangle className="h-2.5 w-2.5" /> : '⏱'}{prazo.texto}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--hairline)' }}>
        <AvatarStack ids={tarefa.responsaveis} porId={porId} size={22} />
        <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
          {prog.total > 0 && (
            <span className="inline-flex items-center gap-0.5"><CheckSquare className="h-3 w-3" />{prog.feitos}/{prog.total}</span>
          )}
          {tarefa.anexos.length > 0 && (
            <span className="inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{tarefa.anexos.length}</span>
          )}
        </div>
      </div>
    </>
  );
}
