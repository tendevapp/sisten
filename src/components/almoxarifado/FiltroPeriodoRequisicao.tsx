/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Filtro de período da Requisição no Balcão: escolhe se a data é a da criação
 * da requisição ou a da exportação (que é a data de lançamento na MB51), e o
 * intervalo. A comparação fica em `dentroDoPeriodo` (lib/requisicaoBalcaoAuditoria).
 */

import React, { useId } from 'react';
import { CalendarRange, X } from 'lucide-react';
import {
  PERIODO_VAZIO, ROTULO_BASE_PERIODO, periodoAtivo, type BasePeriodo, type FiltroPeriodo,
} from '../../lib/requisicaoBalcaoAuditoria';

interface Props {
  valor: FiltroPeriodo;
  onChange: (p: FiltroPeriodo) => void;
  /** Rótulos das bases quando a tela não é só de requisições (ex.: Contingências). */
  rotulos?: Partial<Record<BasePeriodo, string>>;
}

const campo = 'rounded-lg border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--brand)]';
const estiloCampo: React.CSSProperties = { borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' };

export default function FiltroPeriodoRequisicao({ valor, onChange, rotulos }: Props) {
  const idBase = useId();
  const idDe = useId();
  const idAte = useId();
  const ativo = periodoAtivo(valor);
  const rotulo = (b: BasePeriodo) => rotulos?.[b] ?? ROTULO_BASE_PERIODO[b];

  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded-lg border px-2.5 py-2"
      style={{
        borderColor: ativo ? 'var(--brand)' : 'var(--hairline)',
        background: ativo ? 'color-mix(in srgb, var(--brand) 6%, transparent)' : 'var(--surface-raised)',
      }}
    >
      <CalendarRange className="mb-2 h-3.5 w-3.5 shrink-0" style={{ color: ativo ? 'var(--brand)' : 'var(--ink-muted)' }} aria-hidden />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={idBase} className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Data da</label>
        <select
          id={idBase}
          value={valor.base}
          onChange={(e) => onChange({ ...valor, base: e.target.value as BasePeriodo })}
          className={campo}
          style={estiloCampo}
        >
          {(['criacao', 'exportacao'] as BasePeriodo[]).map((b) => <option key={b} value={b}>{rotulo(b)}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={idDe} className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>De</label>
        <input id={idDe} type="date" value={valor.de} max={valor.ate || undefined} onChange={(e) => onChange({ ...valor, de: e.target.value })} className={campo} style={estiloCampo} />
      </div>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={idAte} className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Até</label>
        <input id={idAte} type="date" value={valor.ate} min={valor.de || undefined} onChange={(e) => onChange({ ...valor, ate: e.target.value })} className={campo} style={estiloCampo} />
      </div>
      {ativo && (
        <button
          type="button"
          onClick={() => onChange({ ...PERIODO_VAZIO, base: valor.base })}
          aria-label="Limpar período"
          className="mb-1 inline-flex h-7 w-7 items-center justify-center rounded-lg cursor-pointer hover:opacity-80"
          style={{ color: 'var(--ink-muted)' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
