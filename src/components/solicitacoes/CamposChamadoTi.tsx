/**
 * Campos obrigatórios do chamado de TI nas categorias Pasta de Rede e
 * Conta e E-mail (ver `src/lib/chamadoTi.ts`). Os valores vão para o bloco
 * "Dados do chamado" no começo da justificativa.
 */
import React, { useId } from 'react';
import { camposDaCategoriaTi, formatarCpf, type CampoTi, type DadosChamadoTi } from '../../lib/chamadoTi';

const fieldClass = 'w-full rounded-lg border py-2 px-3 text-sm transition-colors duration-150 focus:outline-2 focus:outline-offset-1';
const fieldStyle: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  outlineColor: 'var(--brand)',
};
const labelClass = 'text-sm font-bold block mb-1';
const labelStyle: React.CSSProperties = { color: 'var(--ink-secondary)' };

function Campo({ campo, valor, onChange }: { campo: CampoTi; valor: string; onChange: (v: string) => void }) {
  const id = useId();
  if (campo.tipo === 'acesso') {
    return (
      <fieldset>
        <legend className={labelClass} style={labelStyle}>{campo.rotulo} *</legend>
        <div className="flex gap-2">
          {(['Full', 'Read'] as const).map((op) => (
            <button
              key={op}
              type="button"
              aria-pressed={valor === op}
              onClick={() => onChange(op)}
              className="flex-1 rounded-lg border px-3 py-2 text-sm font-bold transition-colors"
              style={valor === op
                ? { borderColor: 'var(--brand)', background: 'var(--brand)', color: '#fff' }
                : fieldStyle}
            >
              {op === 'Full' ? 'Full (leitura e escrita)' : 'Read (só leitura)'}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div>
      <label htmlFor={id} className={labelClass} style={labelStyle}>{campo.rotulo} *</label>
      <input
        id={id}
        type={campo.tipo === 'data' ? 'date' : 'text'}
        inputMode={campo.tipo === 'cpf' ? 'numeric' : undefined}
        required
        placeholder={campo.placeholder}
        value={valor}
        onChange={(e) => onChange(campo.tipo === 'cpf' ? formatarCpf(e.target.value) : e.target.value)}
        className={fieldClass}
        style={fieldStyle}
      />
    </div>
  );
}

export default function CamposChamadoTi({
  categoria,
  dados,
  onChange,
}: {
  categoria: string;
  dados: DadosChamadoTi;
  onChange: (dados: DadosChamadoTi) => void;
}) {
  const campos = camposDaCategoriaTi(categoria);
  if (campos.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border p-3 sm:grid-cols-2" style={{ borderColor: 'var(--hairline)' }}>
      {campos.map((c) => (
        <div key={c.chave} className={c.chave === 'caminho' || c.chave === 'nome_completo' ? 'sm:col-span-2' : undefined}>
          <Campo campo={c} valor={dados[c.chave] || ''} onChange={(v) => onChange({ ...dados, [c.chave]: v })} />
        </div>
      ))}
    </div>
  );
}
