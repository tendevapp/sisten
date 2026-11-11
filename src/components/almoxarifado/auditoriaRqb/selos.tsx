/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Selos e detalhe da conferência Requisição no Balcão × MB51 — usados na
 * lista do relatório e na janela de detalhe.
 */

import React from 'react';
import { formatQtd } from '../../../lib/format';
import {
  DICA_STATUS_MB51, ROTULO_CONFERIDO_POR, ROTULO_STATUS_MB51, ROTULO_STATUS_RQB, ehDivergente,
  type LinhaAuditoriaRqb, type StatusMb51,
} from '../../../lib/requisicaoBalcaoAuditoria';

export const COR_MB51: Record<StatusMb51, string> = {
  ok: 'var(--status-good)',
  parcial: 'var(--status-critical)',
  faltando: 'var(--status-critical)',
  outra_data: 'var(--status-serious)',
  mb51_pendente: 'var(--ink-muted)',
};

export function Selo({ texto, cor, dica }: { texto: string; cor: string; dica?: string }) {
  return (
    <span
      title={dica}
      className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}
    >
      {texto}
    </span>
  );
}

export function SeloStatus({ l }: { l: LinhaAuditoriaRqb }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {l.status !== 'exportada' ? (
        <Selo texto={ROTULO_STATUS_RQB[l.status]} cor="var(--ink-muted)" />
      ) : !l.mb51_status ? (
        <Selo texto="Exportada" cor="var(--ink-muted)" />
      ) : (
        <Selo texto={ROTULO_STATUS_MB51[l.mb51_status]} cor={COR_MB51[l.mb51_status]} dica={DICA_STATUS_MB51[l.mb51_status]} />
      )}
      {l.reexportada_sem_reabrir && (
        <Selo
          texto="Reexportada"
          cor="var(--status-serious)"
          dica="Exportada de novo sem ter sido reaberta — conferir se não foi lançada em dobro no SAP."
        />
      )}
    </span>
  );
}

/** Cobertura, documentos e lançamentos em outros dias. */
export function DetalheMb51({ l }: { l: LinhaAuditoriaRqb }) {
  if (l.status !== 'exportada') {
    return <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Ainda não vai para a MB51.</span>;
  }
  return (
    <div className="space-y-0.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
      <div>
        Coberto {formatQtd(l.mb51_coberto ?? 0)} de {formatQtd(l.quantidade)}
        {l.conferido_por && <span style={{ color: 'var(--ink-muted)' }}> · {ROTULO_CONFERIDO_POR[l.conferido_por]}</span>}
        {l.conferido_por !== 'documento' && l.esperado_dia != null && (
          <span style={{ color: 'var(--ink-muted)' }}>
            {' '}· no dia: MB51 {formatQtd(l.mb51_qtd_dia ?? 0)} / exportado {formatQtd(l.esperado_dia)}
          </span>
        )}
      </div>
      {l.mb51_docs && <div className="font-mono" style={{ color: 'var(--ink-muted)' }}>doc {l.mb51_docs}</div>}
      {l.outra_data && <div style={{ color: 'var(--status-serious)' }}>Depois: {l.outra_data}</div>}
      {l.mb51_antes && ehDivergente(l) && (
        <div style={{ color: 'var(--ink-muted)' }} title="Lançamento sem requisição correspondente antes da exportação — costuma ser baixa direta do mesmo material.">
          Antes da exportação: {l.mb51_antes}
        </div>
      )}
    </div>
  );
}
