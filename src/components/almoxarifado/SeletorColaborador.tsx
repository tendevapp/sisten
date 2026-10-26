/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import { User, X } from 'lucide-react';
import type { RhPessoa } from '../../types';

export interface ColaboradorEscolhido {
  id: string | null;
  nome: string;
  registro: string | null;
}

const inputCls =
  'w-full rounded-lg border py-2 px-3 text-sm font-medium focus:outline-2 focus:outline-offset-1 ' +
  'border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]';

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Busca de colaborador em `rh_pessoas` por nome ou matrícula. Aceita nome
 * digitado de quem ainda não está no cadastro (terceiro, recém-admitido) —
 * mesmo desenho da ASE: sem `id`, com o nome gravado.
 */
export default function SeletorColaborador({
  pessoas, valor, onChange,
}: {
  pessoas: RhPessoa[];
  valor: ColaboradorEscolhido;
  onChange: (v: ColaboradorEscolhido) => void;
}) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const sugestoes = useMemo(() => {
    const t = semAcento(texto.trim());
    if (!t) return [];
    const termos = t.split(/\s+/);
    return pessoas
      .filter((p) => {
        const alvo = semAcento(`${p.nome} ${p.registro ?? ''} ${p.chave_nome ?? ''}`);
        return termos.every((x) => alvo.includes(x));
      })
      .slice(0, 8);
  }, [pessoas, texto]);

  if (valor.nome) {
    return (
      <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <User className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{valor.nome}</div>
          <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            {valor.id ? `Matrícula ${valor.registro ?? '—'}` : 'Não cadastrado no RH'}
          </div>
        </div>
        <button type="button" onClick={() => { onChange({ id: null, nome: '', registro: null }); setTexto(''); }} aria-label="Trocar colaborador" className="p-1" style={{ color: 'var(--ink-muted)' }}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const escolher = (i: number) => {
    const p = sugestoes[i];
    if (p) onChange({ id: p.id, nome: p.nome, registro: p.registro });
    else if (texto.trim()) onChange({ id: null, nome: texto.trim().toUpperCase(), registro: null });
    setAberto(false);
  };

  return (
    <div className="relative">
      <input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(0); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, sugestoes.length)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); escolher(ativo); }
        }}
        placeholder="Nome ou matrícula"
        className={inputCls}
      />
      {aberto && texto.trim() && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          {sugestoes.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); escolher(i); }}
                className="block w-full px-3 py-2 text-left text-xs"
                style={{ background: i === ativo ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : undefined, color: 'var(--ink-primary)' }}
              >
                <span className="font-bold">{p.nome}</span>
                <span style={{ color: 'var(--ink-muted)' }}> · {p.registro}{p.cargo ? ` · ${p.cargo}` : ''}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); escolher(sugestoes.length); }}
              className="block w-full px-3 py-2 text-left text-xs italic"
              style={{ background: ativo === sugestoes.length ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : undefined, color: 'var(--ink-secondary)' }}
            >
              Usar “{texto.trim().toUpperCase()}” (não cadastrado)
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
