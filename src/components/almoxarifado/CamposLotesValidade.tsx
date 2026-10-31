import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { LoteValidade } from '../../lib/lotesValidade';

export default function CamposLoteValidade({ valores, onChange, disabled = false }: {
  valores: LoteValidade[]; onChange: (valor: LoteValidade[]) => void; disabled?: boolean;
}) {
  const classe = 'mt-1 w-full rounded-lg border p-2.5 text-xs focus:outline-2 focus:outline-offset-1';
  const estilo = { borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' };
  const linhas = valores.length ? valores : [{ lote: null, validade: null }];
  const alterar = (indice: number, campo: 'lote' | 'validade', valor: string) => onChange(linhas.map((l, i) => i === indice ? { ...l, [campo]: valor } : l));
  return <section className="space-y-2" aria-label="Lotes e validades">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Lotes e validades (opcional)</span>
      <button type="button" disabled={disabled} onClick={() => onChange([...linhas, { lote: null, validade: null }])} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-50" style={estilo}><Plus className="h-3.5 w-3.5" />Adicionar lote</button>
    </div>
    {linhas.map((l, i) => <div key={i} className="flex items-end gap-2">
      <label className="min-w-0 flex-1 text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Lote {i + 1}
        <input type="text" disabled={disabled} value={l.lote ?? ''} onChange={e => alterar(i, 'lote', e.target.value)} className={classe} style={estilo} placeholder="Informe o lote" />
      </label>
      <label className="min-w-0 flex-1 text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Validade {i + 1}
        <input type="date" disabled={disabled} value={l.validade ?? ''} onChange={e => alterar(i, 'validade', e.target.value)} className={classe} style={estilo} />
      </label>
      <button type="button" disabled={disabled} onClick={() => onChange(linhas.filter((_, n) => n !== i))} aria-label={`Remover lote ${i + 1}`} className="mb-0.5 rounded-lg border p-2.5 text-rose-600 disabled:opacity-50" style={{ borderColor: 'var(--hairline)' }}><Trash2 className="h-4 w-4" /></button>
    </div>)}
  </section>;
}
